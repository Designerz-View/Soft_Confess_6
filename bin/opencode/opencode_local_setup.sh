#!/bin/bash
set -e

# opencode_local_setup.sh
# Automated installation script for OpenCode/Oh-My-OpenCode development environment.
#
# Usage:
#   ./bin/opencode/opencode_local_setup.sh           # Install missing dependencies
#   ./bin/opencode/opencode_local_setup.sh --update  # Update all dependencies to latest versions
#
# Installs:
# - Core tools: bun, node, go, tmux, php, composer, python3, uv
# - AI agents: opencode-cli, oh-my-opencode, agent-browser
# - LSP servers: intelephense, typescript-language-server, vue-language-server, bash-language-server, gopls, pyright
# - MCP servers: sequential-thinking, bitbucket, slack, github, smartbear
# - Global formatters: php-cs-fixer, eslint, prettier, shfmt, dockerfmt, sqlfluff, black

# Resolve the project root directory (parent of the bin directory where this script lives)
if [ -n "$ZSH_VERSION" ]; then
    __SCRIPT_PATH="${(%):-%x}"
elif [ -n "$BASH_SOURCE" ]; then
    __SCRIPT_PATH="${BASH_SOURCE[0]}"
else
    __SCRIPT_PATH="$0"
fi
OC_PROJECT_ROOT="$(cd "$(dirname "$__SCRIPT_PATH")/../.." && pwd)"
OC_OPENCODE_DIR="$OC_PROJECT_ROOT/.opencode"
OC_BIN_AI_DIR="$OC_PROJECT_ROOT/bin/ai"

OC_UPDATE_MODE=false
if [[ "$1" == "--update" ]]; then
    OC_UPDATE_MODE=true
fi

# =============================================================================
# DECLARATIVE DEPENDENCY DEFINITIONS
# =============================================================================

OC_BREW_PACKAGES=(
    bun
    node
    php
    go
    python3
    uv
    tmux
    marksman
)

OC_APT_PACKAGES=(
    "nodejs npm"
    "php php-cli php-common php-mbstring php-xml php-curl"
    "golang"
    "python3 python3-pip python3-venv"
    "tmux"
)

OC_NODE_PACKAGES=(
    opencode-ai
    agent-browser
)

OC_NODE_LSP_PACKAGES=(
    intelephense
    typescript
    typescript-language-server
    pyright
    @vue/language-server
    bash-language-server
    yaml-language-server
    sql-language-server
    @biomejs/biome
    # deps of yaml-language-server (ajv-draft-04 requires ajv/dist/core)
    ajv@8
    ajv-draft-04
)

OC_NODE_MCP_PACKAGES=(
    @modelcontextprotocol/server-sequential-thinking
    mcp-remote
    @aashari/mcp-server-atlassian-bitbucket
    slack-mcp-server
    @smartbear/mcp
)

OC_NODE_FORMATTER_PACKAGES=(
    eslint
    prettier
    markdownlint-cli
)

OC_GO_PACKAGES=(
    "golang.org/x/tools/gopls@latest"
    "github.com/sqls-server/sqls@latest"
    "github.com/code-yeongyu/go-claude-code-comment-checker/cmd/comment-checker@latest"
    "mvdan.cc/sh/v3/cmd/shfmt@latest"
    "github.com/reteps/dockerfmt@latest"
)

OC_UV_TOOLS=(
    sqlfluff
    black
)

OC_COMPOSER_GLOBAL_PACKAGES=(
    "bamarni/composer-bin-plugin"
)

OC_COMPOSER_BIN_TOOLS=(
    "friendsofphp/php-cs-fixer"
)

OC_DOCKER_IMAGES=(
    "ghcr.io/github/github-mcp-server"
)

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

has_cmd() {
    command -v "$1" >/dev/null 2>&1
}

get_package_manager() {
    if has_cmd brew; then
        echo "brew"
    elif has_cmd apt-get; then
        echo "apt"
    elif has_cmd yum; then
        echo "yum"
    elif has_cmd pacman; then
        echo "pacman"
    else
        echo "none"
    fi
}

# =============================================================================
# INSTALL/UPDATE FUNCTIONS BY PACKAGE MANAGER
# =============================================================================

install_or_update_brew() {
    local pkg="$1"
    local cmd="${2:-$1}"

    if $OC_UPDATE_MODE; then
        if has_cmd "$cmd"; then
            echo "  ↑ Updating $pkg..."
            brew upgrade "$pkg" 2>/dev/null || brew install "$pkg"
            echo "  ✓ $pkg updated"
        else
            echo "  → Installing $pkg..."
            brew install "$pkg"
            echo "  ✓ $pkg installed"
        fi
    else
        if has_cmd "$cmd"; then
            echo "  ✓ $pkg already installed"
        else
            echo "  → Installing $pkg..."
            brew install "$pkg"
            echo "  ✓ $pkg installed"
        fi
    fi
}

install_or_update_apt() {
    local packages="$1"
    local cmd="$2"

    if $OC_UPDATE_MODE; then
        echo "  ↑ Updating $packages..."
        sudo apt-get install -y --only-upgrade $packages 2>/dev/null || sudo apt-get install -y $packages
        echo "  ✓ $cmd updated"
    else
        if has_cmd "$cmd"; then
            echo "  ✓ $cmd already installed"
        else
            echo "  → Installing $packages..."
            sudo apt-get update
            sudo apt-get install -y $packages
            echo "  ✓ $cmd installed"
        fi
    fi
}

install_or_update_node_packages() {
    local packages=("$@")

    if [[ ${#packages[@]} -eq 0 ]]; then
        return 0
    fi

    local install_cmd update_cmd
    if has_cmd bun; then
        install_cmd="bun add -g"
        update_cmd="bun add -g"
    elif has_cmd npm; then
        install_cmd="npm install -g"
        update_cmd="npm update -g"
    else
        echo "  ⚠️  Neither bun nor npm found. Skipping: ${packages[*]}"
        return 1
    fi

    if $OC_UPDATE_MODE; then
        echo "  ↑ Updating node packages: ${packages[*]}"
        $update_cmd "${packages[@]}"
        echo "  ✓ Node packages updated"
    else
        echo "  → Installing node packages: ${packages[*]}"
        $install_cmd "${packages[@]}"
        echo "  ✓ Node packages installed"
    fi
}

install_or_update_go_package() {
    local pkg="$1"
    local binary_name
    binary_name=$(basename "${pkg%%@*}" | sed 's|.*/||')

    if $OC_UPDATE_MODE; then
        echo "  ↑ Updating $binary_name..."
        go install "$pkg"
        echo "  ✓ $binary_name updated"
    else
        if has_cmd "$binary_name"; then
            echo "  ✓ $binary_name already installed"
        else
            echo "  → Installing $binary_name..."
            go install "$pkg"
            echo "  ✓ $binary_name installed"
        fi
    fi
}

install_or_update_uv_tool() {
    local tool="$1"

    if $OC_UPDATE_MODE; then
        echo "  ↑ Updating $tool..."
        uv tool upgrade "$tool" 2>/dev/null || uv tool install "$tool"
        echo "  ✓ $tool updated"
    else
        if has_cmd "$tool"; then
            echo "  ✓ $tool already installed"
        else
            echo "  → Installing $tool..."
            uv tool install "$tool"
            echo "  ✓ $tool installed"
        fi
    fi
}

install_or_update_composer_global() {
    local pkg="$1"

    if $OC_UPDATE_MODE; then
        echo "  ↑ Updating $pkg..."
        composer global update "$pkg"
        echo "  ✓ $pkg updated"
    else
        if composer global show "$pkg" >/dev/null 2>&1; then
            echo "  ✓ $pkg already installed"
        else
            echo "  → Installing $pkg..."
            composer global require "$pkg"
            echo "  ✓ $pkg installed"
        fi
    fi
}

install_or_update_composer_bin_tool() {
    local pkg="$1"
    local binary_name
    binary_name=$(basename "$pkg")
    local composer_home
    composer_home=$(composer global config home 2>/dev/null)
    local isolated_bin="$composer_home/vendor-bin/tools/vendor/bin/$binary_name"

    if $OC_UPDATE_MODE; then
        echo "  ↑ Updating $pkg (isolated)..."
        composer global bin tools update "$pkg"
        echo "  ✓ $pkg updated"
    else
        if [[ -f "$isolated_bin" ]]; then
            echo "  ✓ $pkg already installed (isolated)"
        else
            echo "  → Installing $pkg in isolated 'tools' namespace..."
            composer global bin tools require --dev "$pkg"
            echo "  ✓ $pkg installed"
        fi
    fi
}

pull_or_update_docker_image() {
    local image="$1"

    if ! has_cmd docker; then
        echo "  ⚠️  Docker not found. Skipping: $image"
        return 1
    fi

    if $OC_UPDATE_MODE; then
        echo "  ↑ Pulling latest $image..."
    else
        echo "  → Pulling $image..."
    fi
    docker pull "$image"
    echo "  ✓ $image ready"
}

# =============================================================================
# HIGH-LEVEL INSTALLATION ORCHESTRATORS
# =============================================================================

install_system_packages() {
    echo "📦 Installing system packages..."

    local pm
    pm=$(get_package_manager)

    case "$pm" in
        brew)
            for pkg in "${OC_BREW_PACKAGES[@]}"; do
                install_or_update_brew "$pkg" || true
            done
            install_composer_standalone || true
            ;;
        apt)
            install_or_update_apt "nodejs npm" "node" || true
            install_or_update_apt "php php-cli php-common php-mbstring php-xml php-curl" "php" || true
            install_or_update_apt "golang" "go" || true
            install_or_update_apt "python3 python3-pip python3-venv" "python3" || true
            install_or_update_apt "tmux" "tmux" || true
            install_uv_standalone || true
            install_bun_standalone || true
            install_composer_standalone || true
            ;;
        *)
            echo "  ⚠️  Unsupported package manager. Install dependencies manually."
            ;;
    esac
}

install_bun_standalone() {
    if has_cmd bun && ! $OC_UPDATE_MODE; then
        echo "  ✓ bun already installed"
        return 0
    fi

    if $OC_UPDATE_MODE && has_cmd bun; then
        echo "  ↑ Updating bun..."
        bun upgrade
        echo "  ✓ bun updated"
        return 0
    fi

    if has_cmd curl; then
        echo "  → Installing bun via official installer..."
        curl -fsSL https://bun.sh/install | bash
        echo "  ✓ bun installed"
    fi
}

install_uv_standalone() {
    if has_cmd uv && ! $OC_UPDATE_MODE; then
        echo "  ✓ uv already installed"
        return 0
    fi

    if $OC_UPDATE_MODE && has_cmd uv; then
        echo "  ↑ Updating uv..."
        uv self update 2>/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
        echo "  ✓ uv updated"
        return 0
    fi

    if has_cmd curl; then
        echo "  → Installing uv via official installer..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        echo "  ✓ uv installed"
    fi
}

install_composer_standalone() {
    # Check if composer exists AND works (handles corrupted phar signatures)
    local composer_works=false
    if has_cmd composer; then
        if composer --version >/dev/null 2>&1; then
            composer_works=true
        else
            echo "  ⚠️  Composer found but broken (phar signature error). Reinstalling..."
        fi
    fi

    if $composer_works && ! $OC_UPDATE_MODE; then
        echo "  ✓ composer already installed"
        return 0
    fi

    if $OC_UPDATE_MODE && $composer_works; then
        echo "  ↑ Updating composer..."
        composer self-update
        echo "  ✓ composer updated"
        return 0
    fi

    if ! has_cmd curl || ! has_cmd php; then
        echo "  ⚠️  curl and php required for composer installation"
        return 1
    fi

    echo "  → Installing composer via official installer..."

    local tmp_dir
    tmp_dir=$(mktemp -d)
    cd "$tmp_dir" || return 1

    local expected_checksum actual_checksum
    expected_checksum="$(curl -fsSL https://composer.github.io/installer.sig)"
    curl -fsSL https://getcomposer.org/installer -o composer-setup.php
    actual_checksum="$(php -r "echo hash_file('sha384', 'composer-setup.php');")"

    if [[ "$expected_checksum" != "$actual_checksum" ]]; then
        echo "  ❌ ERROR: Invalid installer checksum"
        rm -rf "$tmp_dir"
        return 1
    fi

    php composer-setup.php --quiet
    if [[ -f "composer.phar" ]]; then
        sudo mv composer.phar /usr/local/bin/composer
        sudo chmod +x /usr/local/bin/composer
        echo "  ✓ composer installed to /usr/local/bin/composer"
    else
        echo "  ❌ ERROR: composer.phar not created"
        rm -rf "$tmp_dir"
        return 1
    fi

    rm -rf "$tmp_dir"
}

install_node_packages() {
    echo
    echo "📦 Installing Node packages..."
    install_or_update_node_packages "${OC_NODE_PACKAGES[@]}" || true

    if has_cmd agent-browser; then
        agent-browser install --with-deps 2>/dev/null || true
    fi
}

install_lsp_servers() {
    echo
    echo "🔧 Installing LSP servers..."
    install_or_update_node_packages "${OC_NODE_LSP_PACKAGES[@]}" || true

    if has_cmd go; then
        for pkg in "${OC_GO_PACKAGES[@]}"; do
            case "$pkg" in
                *gopls* | *sqls*)
                    install_or_update_go_package "$pkg" || true
                    ;;
            esac
        done
    fi
}

install_mcp_servers() {
    echo
    echo "🔌 Installing MCP servers..."
    install_or_update_node_packages "${OC_NODE_MCP_PACKAGES[@]}" || true

    for image in "${OC_DOCKER_IMAGES[@]}"; do
        pull_or_update_docker_image "$image" || true
    done
}

install_go_tools() {
    echo
    echo "🔨 Installing Go tools..."

    if ! has_cmd go; then
        echo "  ⚠️  Go not found. Skipping Go tools."
        return 1
    fi

    for pkg in "${OC_GO_PACKAGES[@]}"; do
        install_or_update_go_package "$pkg" || true
    done
}

install_uv_tools() {
    echo
    echo "🐍 Installing UV tools..."

    if ! has_cmd uv; then
        echo "  ⚠️  uv not found. Skipping UV tools."
        return 1
    fi

    for tool in "${OC_UV_TOOLS[@]}"; do
        install_or_update_uv_tool "$tool" || true
    done
}

install_composer_tools() {
    echo
    echo "🎼 Installing Composer tools..."

    if ! has_cmd composer; then
        echo "  ⚠️  Composer not found. Skipping Composer tools."
        return 1
    fi

    for pkg in "${OC_COMPOSER_GLOBAL_PACKAGES[@]}"; do
        install_or_update_composer_global "$pkg" || true
    done

    for pkg in "${OC_COMPOSER_BIN_TOOLS[@]}"; do
        install_or_update_composer_bin_tool "$pkg" || true
    done

    local composer_home composer_bin_dir isolated_bin_dir
    composer_home=$(composer global config home 2>/dev/null)
    composer_bin_dir=$(composer global config bin-dir --absolute 2>/dev/null)
    isolated_bin_dir="$composer_home/vendor-bin/tools/vendor/bin"

    for dir in "$composer_bin_dir" "$isolated_bin_dir"; do
        if [[ -d "$dir" ]] && [[ ":$PATH:" != *":$dir:"* ]]; then
            export PATH="$PATH:$dir"
            echo "  → Added $dir to PATH"
        fi
    done
}

install_formatters() {
    echo
    echo "🎨 Installing formatters..."
    install_or_update_node_packages "${OC_NODE_FORMATTER_PACKAGES[@]}" || true

    chmod +x "$OC_BIN_AI_DIR/smart-format-php.sh" 2>/dev/null || true
    chmod +x "$OC_BIN_AI_DIR/smart-format-js.sh" 2>/dev/null || true
}

install_oh_my_opencode() {
    echo
    echo "🧩 Installing oh-my-opencode..."

    local local_binary="$OC_OPENCODE_DIR/node_modules/.bin/oh-my-opencode"

    if [[ -x "$local_binary" ]] || has_cmd oh-my-opencode; then
        echo "  ✓ oh-my-opencode already installed"
        return 0
    fi

    echo "  → Installing oh-my-opencode..."

    if has_cmd bunx; then
        bunx oh-my-opencode install
        echo "  ✓ oh-my-opencode installed via bunx"
    elif has_cmd npx; then
        npx oh-my-opencode install
        echo "  ✓ oh-my-opencode installed via npx"
    else
        echo "  ⚠️  Could not install oh-my-opencode. Install npm or bun first."
    fi
}

setup_local_configs() {
    echo
    echo "📚 Installing local opencode dependencies..."

    local opencode_dir="$OC_PROJECT_ROOT/.opencode"

    if has_cmd bun; then
        (cd "$opencode_dir" && bun install)
        echo "  ✓ Dependencies installed via bun"
    elif has_cmd npm; then
        (cd "$opencode_dir" && npm install)
        echo "  ✓ Dependencies installed via npm"
    else
        echo "  ⚠️  Neither bun nor npm found. Skipping .opencode/ dependencies."
    fi

    echo
    echo "⚙️  Setting up local configs for your local settings and secrets under .opencode/ dir"

    local opencode_config="$opencode_dir/opencode.jsonc"

    if [[ -f "$opencode_config" ]]; then
        echo "  ✓ local gitignored .opencode/opencode.jsonc already exists"
    else
        echo "  → Creating local gitignored .opencode/opencode.jsonc..."
        cat >"$opencode_config" <<'EOF'
{
    "$schema": "https://opencode.ai/config.json"
}
EOF
        echo "  ✓ local gitignored .opencode/opencode.jsonc created"
    fi
}

print_completion_message() {
    echo
    if $OC_UPDATE_MODE; then
        echo "✅ Update complete!"
    else
        echo "✅ Setup complete!"
    fi

    echo
    echo "💡 Next steps:"
    echo "  1. Add these lines to your shell profile (~/.bashrc or ~/.zshrc):"
    echo
    echo "     # OpenCode CLI shortcut"
    echo "     # 12GoAsia"
    echo "     export PROJECT_DIR_12GO=\"$OC_PROJECT_ROOT\""
    echo "     alias 12go=\"\$PROJECT_DIR_12GO/12go.sh\""
    echo "     alias oc12go=\"\$PROJECT_DIR_12GO/bin/opencode/opencode.sh\""
    echo
    echo "     # Composer global tools (php-cs-fixer, etc.)"
    echo "     export PATH=\"\$PATH:\$HOME/.composer/vendor/bin\""
    echo "     export PATH=\"\$PATH:\$HOME/.composer/vendor-bin/tools/vendor/bin\""
    echo
    echo "     # Go binaries (shfmt, gopls, etc.)"
    echo "     export PATH=\"\$PATH:\$HOME/go/bin\""
    echo
    echo "     # UV tools (sqlfluff, etc.)"
    echo "     export PATH=\"\$PATH:\$HOME/.local/bin\""
    echo
    echo "  2. Reload your shell: source ~/.bashrc  (or ~/.zshrc)"
    echo "  3. Verify installation:"
    echo "     12go --help     # Main 12Go script"
    echo "     oc12go --help   # OpenCode CLI"
    echo
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    echo
    if $OC_UPDATE_MODE; then
        echo "🔄 Updating OpenCode environment in $OC_PROJECT_ROOT..."
    else
        echo "🚀 Setting up OpenCode environment in $OC_PROJECT_ROOT..."
    fi
    echo

    install_system_packages
    install_node_packages
    install_lsp_servers
    install_mcp_servers
    install_go_tools
    install_uv_tools
    install_composer_tools
    install_formatters
    install_oh_my_opencode
    setup_local_configs
    print_completion_message
}

main "$@"
