#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null 2>&1; then
  echo "请先安装 Node.js 22.13 或更新的 LTS 版本：https://nodejs.org"
  exit 1
fi
node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 13)) { console.error('需要 Node.js >= 22.13'); process.exit(1); }"
if [ ! -d node_modules/lunar-javascript ] || [ ! -d node_modules/iztro ] || [ ! -d node_modules/astronomy-engine ]; then
  npm ci --omit=dev --no-audit --no-fund
fi
exec node scripts/launch.mjs "$@"
