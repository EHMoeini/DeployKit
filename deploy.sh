#!/usr/bin/env bash
# ==============================================================================
# Single-Command Deployment Script / اسکریپت دپلوی با یک دستور
# ==============================================================================
set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/ansible" && pwd)"
export ANSIBLE_CONFIG="${BASE_DIR}/ansible.cfg"

echo "========================================================"
echo "🚀 Starting Automated Turn-Key Deployment"
echo "========================================================"

ansible-playbook -i "${BASE_DIR}/inventory/production/hosts.yml" "${BASE_DIR}/playbooks/site.yml" "$@"
