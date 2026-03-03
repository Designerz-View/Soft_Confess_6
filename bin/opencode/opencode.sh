#!/bin/sh

# opencode.sh
# Shell function wrapper for opencode CLI with optional tmux integration and environment management.
#
# Features:
# - Auto-resolves project root (runs from anywhere)
# - Auto-loads .env and .env.local files hierarchically
# - Auto-assigns available port (4096-5096 range)
# - Supports running without tmux via OPENCODE_TMUX=1
#
# Usage: bin/opencode/opencode.sh [opencode-args]

oc() {
    # If first argument is not an option (doesn't start with -), pass through directly
    if [ $# -gt 0 ]; then
        opencode "$@"
        return
    fi


    # Detect md5 command (macOS uses md5, Linux uses md5sum)
    local hash_cmd="md5sum"
    if ! command -v md5sum >/dev/null 2>&1 && command -v md5 >/dev/null 2>&1; then
        hash_cmd="md5"
    fi

    # Resolve the project root directory (parent of the bin directory where this script lives)
    if [ -n "$ZSH_VERSION" ]; then
        local script_path="${(%):-%x}"
    elif [ -n "$BASH_SOURCE" ]; then
        local script_path="${BASH_SOURCE[0]}"
    else
        local script_path="$0"
    fi


    local project_root=$(cd "$(dirname "$script_path")/../.." && pwd)
    local base_name=$(basename "$project_root")
    local path_hash=$(echo "$project_root" | $hash_cmd | cut -c1-4)
    local session_name="${base_name}-${path_hash}"

    # Logic to load envs hierarchically (.env -> .env.local)
    # Uses 'set -a' to auto-export variables from the sourced files
    # We explicitly cd to project_root in the subshell/eval to ensure we load the correct files
    local load_envs="cd \"$project_root\"; set -a; [ -f .env ] && source .env; [ -f .env.local ] && source .env.local; set +a"

    # Find available port
    local port=${OPENCODE_PORT:-4096}
    while [ $port -lt 5096 ]; do
        if ! lsof -i :$port >/dev/null 2>&1; then
            break
        fi

        port=$((port + 1))
    done

    if (( $OPENCODE_TMUX )); then
        # Outside tmux: inject env loading into the command string passed to tmux
        local oc_cmd="$load_envs; export OPENCODE_PORT=$port; opencode --port $port $*; exec $SHELL"

        if tmux has-session -t "$session_name" 2>/dev/null; then
            tmux new-window -t "$session_name" -c "$project_root" "$oc_cmd"
            tmux attach-session -t "$session_name"
        else
            tmux new-session -s "$session_name" -c "$project_root" "$oc_cmd"
        fi
    else
        (
            eval "$load_envs"
            export OPENCODE_PORT=$port
            opencode --port $port "$@"
        )
    fi
}

oc "$@"
