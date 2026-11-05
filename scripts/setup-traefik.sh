#!/bin/bash
set -e

echo "[TRAEFIK-SETUP] Creating traefik-public docker network if not exists..."
docker network create traefik-public 2>/dev/null || echo "[TRAEFIK-SETUP] Network traefik-public already exists."

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
