#!/usr/bin/env bash
# Swarm-aware auto-updater.
#
# Detects a new digest for the currently deployed image tag in GHCR, runs the
# backend migrations with the new image, then triggers `docker service update`.
# Docker Swarm performs the rolling update defined in the stack's update_config.
#
# All service mutations and Ansible deployments share the same flock file:
# Ansible waits for it, this script skips its cycle when the lock is busy.
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:?PROJECT_NAME is required}"
AUTO_UPDATE_TAG="${AUTO_UPDATE_TAG:-latest}"

BACKEND_SERVICE="${BACKEND_SERVICE:-${PROJECT_NAME}_backend}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-${PROJECT_NAME}_frontend}"
ENV_FILE="${ENV_FILE:-/srv/${PROJECT_NAME}/.env}"
LOCK_FILE="${LOCK_FILE:-/srv/${PROJECT_NAME}/.deploy.lock}"
LOG_FILE="${LOG_FILE:-/srv/${PROJECT_NAME}/auto-update.log}"
PAUSE_FILE="${PAUSE_FILE:-/srv/${PROJECT_NAME}/.deploy-in-progress}"

log() {
  local message="[$(date -Is)] [watchtower] $*"
  echo "${message}" >>"${LOG_FILE}"
  echo "${message}"
}

service_exists() {
  docker service inspect "$1" >/dev/null 2>&1
}

current_image_spec() {
  docker service inspect "$1" --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
}

update_service() {
  local service="$1"
  local current_spec image_ref image_repo current_digest image_name pulled_digest

  if ! service_exists "${service}"; then
    log "service ${service} does not exist; skipping"
    return 0
  fi

  current_spec="$(current_image_spec "${service}")"

  # Stack deploys resolve the tag to a digest (repo:tag@sha256:...). If a
  # service is pinned without a digest we cannot compare safely and skip it.
  case "${current_spec}" in
    *@sha256:*) current_digest="${current_spec##*@}" ;;
    *)
      log "service ${service} has no resolved digest; skipping (${current_spec})"
      return 0
      ;;
  esac

  image_ref="${current_spec%%@*}"
  image_name="${image_ref##*/}"

  # A manual deploy with an immutable tag (rollback) must not be rolled
  # forward by the updater. Only the configured moving channel is tracked.
  if [ "${image_name##*:}" != "${AUTO_UPDATE_TAG}" ]; then
    log "service ${service} is pinned to ${image_name}; auto-update paused for it"
    return 0
  fi

  if ! docker pull "${image_ref}" >/dev/null 2>&1; then
    log "failed to pull ${image_ref}; will retry next cycle"
    return 1
  fi

  # Match the digest for this exact repository instead of assuming it is the
  # first RepoDigests entry (the local image may have several registry refs).
  image_repo="${image_ref%:*}"
  pulled_digest="$(
    docker image inspect "${image_ref}" \
      --format '{{range .RepoDigests}}{{println .}}{{end}}' \
      | grep -F "${image_repo}@" | head -n 1 || true
  )"
  pulled_digest="${pulled_digest##*@}"

  if [ -z "${pulled_digest}" ]; then
    log "cannot resolve a repo digest for ${image_ref}; will retry next cycle"
    return 1
  fi

  if [ "${current_digest}" = "${pulled_digest}" ]; then
    log "service ${service} is up to date (${pulled_digest})"
    return 0
  fi

  if [ "${service}" = "${BACKEND_SERVICE}" ]; then
    log "running migrations with ${image_ref}"
    if ! docker run --rm --network app-internal \
      --env-file "${ENV_FILE}" \
      "${image_ref}" node src/config/run-migrations.js >>"${LOG_FILE}" 2>&1; then
      log "migrations failed; backend was not updated"
      return 1
    fi
  fi

  # Pin the exact digest that was pulled and migrated so a tag move between the
  # pull and the update cannot deploy a different image.
  log "updating ${service}: ${current_digest} -> ${pulled_digest}"
  if ! docker service update \
    --with-registry-auth \
    --image "${image_ref}@${pulled_digest}" \
    "${service}" >>"${LOG_FILE}" 2>&1; then
    log "update of ${service} failed; rolling back"
    docker service update --rollback "${service}" >>"${LOG_FILE}" 2>&1 || true
    return 1
  fi

  log "service ${service} updated successfully"
}

main() {
  # Ansible creates this flag for the whole duration of a deploy. It closes
  # the gap between the migration and stack-deploy lock acquisitions. A stale
  # flag (failed Ansible run) is ignored after 30 minutes.
  if [ -f "${PAUSE_FILE}" ]; then
    if find "${PAUSE_FILE}" -mmin -30 -print -quit 2>/dev/null | grep -q .; then
      log "Ansible deployment is in progress; skipping this cycle"
      return 0
    fi
    log "ignoring stale deploy pause flag"
  fi

  # Non-blocking shared lock with Ansible. If a deploy is running, skip this
  # cycle and try again at the next timer tick.
  exec 9>"${LOCK_FILE}"
  if ! flock -n 9; then
    log "deploy lock is held by Ansible; skipping this cycle"
    return 0
  fi

  # Backend owns the schema migrations, so a failed backend update must stop
  # the cycle instead of moving the frontend to a release the backend lacks.
  local rc=0
  update_service "${BACKEND_SERVICE}" || rc=$?
  if [ "${rc}" -eq 0 ]; then
    update_service "${FRONTEND_SERVICE}" || rc=$?
  fi
  return "${rc}"
}

main "$@"
