#!/usr/bin/env bash
# ==============================================================================
# Single-Command Teardown Script / اسکریپت حذف استک‌ها با یک دستور
# ==============================================================================
set -e

# Auto-detect SSH Agent socket for passphrase-protected keys
if [ -z "$SSH_AUTH_SOCK" ] || ! ssh-add -l >/dev/null 2>&1; then
    shopt -s nullglob
    for sock in ~/.ssh/agent/* /tmp/ssh-*/agent.* /run/user/$(id -u)/openssh_agent /run/user/$(id -u)/keyring/ssh; do
        if [ -S "$sock" ]; then
            export SSH_AUTH_SOCK="$sock"
            if ssh-add -l >/dev/null 2>&1; then
                break
            fi
        fi
    done
    shopt -u nullglob
fi

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/ansible" && pwd)"
export ANSIBLE_CONFIG="${BASE_DIR}/ansible.cfg"

echo "========================================================"
echo "🛑 Starting Automated Teardown"
echo "========================================================"

ansible-playbook -i "${BASE_DIR}/inventory/production/hosts.yml" "${BASE_DIR}/playbooks/teardown.yml" -e "remove_traefik=true" "$@"
