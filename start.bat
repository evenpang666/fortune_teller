@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.13 或更新的 LTS 版本：https://nodejs.org
  pause
  exit /b 1
)
node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 13)) { console.error('需要 Node.js 22.13 或更新版本'); process.exit(1); }"
if errorlevel 1 (pause & exit /b 1)
if not exist node_modules\lunar-javascript\package.json goto install
if not exist node_modules\iztro\package.json goto install
if not exist node_modules\astronomy-engine\package.json goto install
if not exist node_modules\shunshi-kangxi-core\package.json goto install
goto launch
:install
call npm ci --omit=dev --no-audit --no-fund
if errorlevel 1 (pause & exit /b 1)
:launch
node scripts\launch.mjs %*
if errorlevel 1 pause
