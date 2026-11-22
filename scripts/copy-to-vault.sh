#!/usr/bin/env bash
# 部署构建产物到 Obsidian vault 插件目录
# 用法: bash scripts/copy-to-vault.sh [vault路径]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

VAULT="${1:-/Users/yjh/pkm/十万个为什么}"
PLUGIN_DIR="$VAULT/.obsidian/plugins/lan-share"

# 校验构建产物存在
if [ ! -f "$PROJECT_DIR/main.js" ]; then
  echo "错误: 未找到 main.js，请先运行 npm run build" >&2
  exit 1
fi
if [ ! -f "$PROJECT_DIR/vendor/mermaid.min.js" ]; then
  echo "错误: 未找到 vendor/mermaid.min.js" >&2
  exit 1
fi

mkdir -p "$PLUGIN_DIR/vendor"

cp "$PROJECT_DIR/main.js" "$PLUGIN_DIR/main.js"
cp "$PROJECT_DIR/manifest.json" "$PLUGIN_DIR/manifest.json"
cp "$PROJECT_DIR/versions.json" "$PLUGIN_DIR/versions.json"
cp "$PROJECT_DIR/styles.css" "$PLUGIN_DIR/styles.css"
cp "$PROJECT_DIR/vendor/mermaid.min.js" "$PLUGIN_DIR/vendor/mermaid.min.js"
cp "$PROJECT_DIR/vendor/mermaid-init.js" "$PLUGIN_DIR/vendor/mermaid-init.js"
cp "$PROJECT_DIR/vendor/site.js" "$PLUGIN_DIR/vendor/site.js"

# 开发辅助：obsidian-hot-reload（vault 内热重载，无需手动重载 Obsidian）
HR_DIR="$VAULT/.obsidian/plugins/obsidian-hot-reload"
mkdir -p "$HR_DIR"
cp "$PROJECT_DIR/vendor/hot-reload/main.js" "$HR_DIR/main.js"
cp "$PROJECT_DIR/vendor/hot-reload/manifest.json" "$HR_DIR/manifest.json"

echo "✅ 已部署到 $PLUGIN_DIR"
echo "✅ hot-reload 已安装到 $HR_DIR"
