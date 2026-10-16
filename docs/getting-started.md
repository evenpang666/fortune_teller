# 安装与启动

[返回首页](../README.md) · [文档目录](README.md) · [环境与配置](configuration.md)

## 准备 DSH

观象是 DSH Web 插件，使用宿主的模型服务、默认模型与凭据。请先安装一次 DSH，确保 `dsh` 在 PATH 中可用；特殊安装位置可设置 `DSH_CLI` 或 `DSH_BIN`。在 DSH Web 的模型设置中配置 API Key 与默认模型，观象无需重复填写。

启动器只检查是否已有可运行的 DSH，不查询最新版，也不自动安装或升级 DSH。

## 启动项目

在项目目录中选择对应入口：

| 环境 | 命令 |
| --- | --- |
| Linux / macOS | `sh start.sh` 或 `bash start.sh` |
| Windows | 双击 `start.bat` |
| Node.js ≥22.13 已可用 | `npm start` |
| 无桌面服务器 / 不打开浏览器 | `sh start.sh --no-open` |

启动脚本优先使用现有 Node；缺失或版本过低时，从 Node 官方源下载并校验 SHA-256，安装到项目 `.data/node/`。Linux / macOS 需要 `curl`、`tar` 及 `sha256sum` 或 `shasum`；Windows 使用 PowerShell。系统原有 Node 保留。直接运行 `npm start` 时，需要事先具备可用的 Node.js。

依赖已齐全时直接复用，缺失或需要同步时才安装；首次准备或修复依赖需要联网。启动器会将当前项目以本地链接登记到 DSH `web` profile，保留原配置与凭据，使用匹配的已有 pnpm 与 store。完整检查逻辑见[环境与配置](configuration.md#环境检查与已有-dsh-复用)。

## 打开观象

启动器等待观象就绪后自动打开工作室，不打开 DSH 管理页。页面使用独立端口，默认地址为：

```text
http://127.0.0.1:3100/
```

也可从 DSH 输入框下方的「打开观象工作室」进入。首次自动打开会使用宿主认证入口；手动访问若要求登录，请先使用原 DSH 终端打印的登录链接。Cookie 按访问地址绑定，登录后请沿用相同的主机名与端口。

检测到已有 DSH Web 时直接复用，不结束原进程，也不启动第二个服务。若原进程尚未加载插件，请在插件管理器启用观象；不支持热加载时，重启原服务一次。

## 自定义宿主地址

非默认端口通常可以从运行进程的 `--port` 参数识别；若端口通过配置文件设置，请将 `.env.example` 复制为 `.env`，显式指定：

```dotenv
DSH_WEB_URL=http://127.0.0.1:8080
# DSH_HOME=/path/to/existing-dsh-home
# DSH_CLI=/path/to/existing/node_modules/@deepseek-ai/dsh/lib/bin.js
# FORTUNE_DATA_DIR=/path/to/private-data
```

页面默认独立监听 `0.0.0.0:3100`，本机访问 `http://127.0.0.1:3100/`，局域网设备访问 `http://主机局域网IP:实际端口/`，无需登录。首选端口由 `FORTUNE_PORT` 或插件 `config.port` 设置；端口占用时直接使用系统分配的空闲端口，启动器与页面显示实际地址。DSH 的模型和凭据继续复用，管理页认证保留，旧 DSH 子路径仅作兼容入口。

## 手动安装插件

已有完整 DSH 环境时，可在项目目录使用绝对路径安装：

```bash
dsh plugin --profile web add "link:/绝对路径/fortuneteller"
dsh web --no-open
```

本地链接安装后请保留项目目录。已有 DSH 正在运行时，启用新插件或重启原服务即可，无需再启动一份 DSH。

从旧独立版迁移时，请先停止旧服务。原历史数据库默认仍位于项目 `.data/readings.sqlite`，详细迁移与备份步骤见[数据管理](data.md)。
