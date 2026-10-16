#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# Reuse the current Node first; a project runtime is only a fallback.
node_ready() {
  command -v node >/dev/null 2>&1 && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' 2>/dev/null
}
if ! node_ready && [ -x .data/node/bin/node ]; then export PATH="$PWD/.data/node/bin:$PATH"; fi
if ! node_ready; then
  echo '[环境] 自动安装 Node.js 22 LTS 到 .data/node…'
  case "$(uname -s)" in Linux) node_os=linux;; Darwin) node_os=darwin;; *) echo '此系统请使用 start.bat 或自行安装 Node.js >=22.13'; exit 1;; esac
  case "$(uname -m)" in x86_64|amd64) node_arch=x64;; aarch64|arm64) node_arch=arm64;; *) echo '不支持的 CPU 架构'; exit 1;; esac
  mkdir -p .data
  node_stage=$(mktemp -d "$PWD/.data/node-download.XXXXXX")
  trap 'rm -rf -- "$node_stage"' EXIT
  curl --fail --location --retry 2 --connect-timeout 15 --max-time 60 https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$node_stage/SHASUMS256.txt"
  node_archive=$(awk -v suffix="-$node_os-$node_arch.tar.gz" '$2 ~ suffix"$" {print $2; exit}' "$node_stage/SHASUMS256.txt")
  [ -n "$node_archive" ] || { echo '无法确定 Node 下载文件'; exit 1; }
  curl --fail --location --retry 2 --connect-timeout 15 --max-time 300 "https://nodejs.org/dist/latest-v22.x/$node_archive" -o "$node_stage/$node_archive"
  node_expected=$(awk -v name="$node_archive" '$2 == name {print $1}' "$node_stage/SHASUMS256.txt")
  if command -v sha256sum >/dev/null 2>&1; then node_actual=$(sha256sum "$node_stage/$node_archive" | awk '{print $1}'); else node_actual=$(shasum -a 256 "$node_stage/$node_archive" | awk '{print $1}'); fi
  [ "$node_expected" = "$node_actual" ] || { echo 'Node 下载校验失败'; exit 1; }
  tar -xzf "$node_stage/$node_archive" -C "$node_stage"
  node_extracted=${node_archive%.tar.gz}
  if [ -e .data/node ]; then mv .data/node "$node_stage/previous"; fi
  mv "$node_stage/$node_extracted" .data/node
  export PATH="$PWD/.data/node/bin:$PATH"
  rm -rf -- "$node_stage"
  trap - EXIT
fi
exec node --disable-warning=UNDICI-EHPA scripts/launch.mjs "$@"
