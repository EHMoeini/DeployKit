#!/bin/bash
set -e

echo "[TRAEFIK-SETUP] Checking Docker Swarm state..."
if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q '^active$'; then
  echo "[TRAEFIK-SETUP] Docker Swarm is not active. Initialize it through Ansible (roles/docker)."
  exit 1
fi

echo "[TRAEFIK-SETUP] Creating attachable overlay networks if missing..."
docker network inspect traefik-public >/dev/null 2>&1 || \
  docker network create --driver overlay --attachable traefik-public
docker network inspect app-internal >/dev/null 2>&1 || \
  docker network create --driver overlay --internal --attachable app-internal

ACME_DIR="/srv/traefik/acme"
ACME_FILE="${ACME_DIR}/acme.json"

echo "[TRAEFIK-SETUP] Ensuring directory ${ACME_DIR} exists..."
mkdir -p "${ACME_DIR}"

if [ ! -f "${ACME_FILE}" ]; then
  echo "[TRAEFIK-SETUP] Initializing ${ACME_FILE}..."
  touch "${ACME_FILE}"
fi

echo "[TRAEFIK-SETUP] Setting permissions 600 on ${ACME_FILE}..."
chmod 600 "${ACME_FILE}"

echo "[TRAEFIK-SETUP] Traefik ACME preparation completed successfully."
