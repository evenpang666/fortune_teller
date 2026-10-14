# 环境与配置

[返回项目首页](../README.md) · [文档目录](README.md)

## 基础环境

需要 Node.js ≥22.13 和 npm。独立模式首次启动会自动执行 `npm ci --omit=dev --no-audit --no-fund` 安装运行依赖。后续本地排盘可离线使用，DeepSeek 解读需要联网。

项目使用 Node.js 内置 SQLite，无需安装独立数据库；前端为静态 HTML、CSS、JavaScript，无需构建。

## 网页设置

在「设置与连接」中可以：

- 保存或清除本地 DeepSeek API Key。
- 选择 `deepseek-flash` 或 `deepseek-v4-pro`。
- 修改每百万 tokens 的输入缓存命中、输入未命中和输出人民币单价。

本地密钥保存在服务端 `config.json` 中，读取配置接口不会回传密钥。发起解读时，本次输入、问题与盘面会发送给 DeepSeek 官方 API。具体费用口径见[费用估算](billing.md)。

## 独立模式：`.env`

将项目根目录的 [`.env.example`](../.env.example) 复制为 `.env`，根据需要填写：

```dotenv
DEEPSEEK_API_KEY=你的密钥
# 可选：固定模型；不设置时可在网页切换
# DEEPSEEK_MODEL=deepseek-flash
HOST=0.0.0.0
PORT=3210
# 可选：使用绝对路径指定数据目录
# FORTUNE_DATA_DIR=/path/to/private-data
```

| 变量 | 默认行为 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 使用网页保存的密钥 | 非空环境变量优先于网页配置 |
| `DEEPSEEK_MODEL` | 使用网页选择的模型，初始为 Flash | 设置后固定模型，网页禁用模型切换 |
| `HOST` | `0.0.0.0` | 允许局域网访问；仅本机使用可改为 `127.0.0.1` |
| `PORT` | `3210` | 1–65535 的整数，需与浏览器访问地址一致 |
| `FORTUNE_DATA_DIR` | 项目根目录 `.data/` | 建议使用绝对路径 |

独立启动器会自动读取项目根目录的 `.env`；已有进程环境变量优先。修改后重启服务生效。不要将真实 `.env`、密钥或 `.data/` 提交到代码仓库。

如果通过环境变量固定模型，请同时检查网页中的估算单价。单价可以自行调整，环境模型变化不会重写已有配置文件里的自定义单价。

## DSH 插件模式

DSH 插件由 Harness 进程运行，**不会自动读取本项目的 `.env`**。请在启动 DSH 前设置进程环境变量，或通过插件配置调整服务参数。

插件 `config` 支持：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `host` | `0.0.0.0` | 工作室服务的监听地址 |
| `port` | `3210` | 工作室服务端口 |
| `dataDir` | DSH 启动目录下 `.data/fortuneteller/` | 指定绝对路径可复用独立模式的数据 |

插件的数据目录优先采用 `config.dataDir`，其次是 `FORTUNE_DATA_DIR`。端口优先采用 `config.port`；只有未指定时才读取 `FORTUNE_PORT`，最后使用 3210。本项目的默认 Bundle 已明确设置 `config.port: 3210`，因此换端口时应修改插件配置，而不是独立模式的 `PORT`。

`DEEPSEEK_API_KEY` 和 `DEEPSEEK_MODEL` 在两种模式中的优先级相同。插件端口改变后，还需调整 DSH 入口旁的端口输入框。安装与生命周期说明见 [DSH 接入指南](harness.md)。

## 局域网与无桌面运行

独立模式无桌面运行：

```bash
bash start.sh --no-open
```

已安装依赖时，也可以执行 `npm run dev`。默认服务监听所有 IPv4 接口，页面顶部和终端只展示本机 `192.168.*` 网卡的局域网地址，端口使用实际监听端口，不显示其他网段网卡地址。页面提供「复制地址」按钮。未检测到该网段或仅监听本机时，会显示原因。其他设备连接同一局域网，打开页面提示的地址即可直接使用，无需口令或登录；防火墙应允许可信局域网的对应 TCP 端口。

按 Ctrl+C 停止服务。所有访问设备共享记录、设置和 API 调用额度；目前没有多人账户隔离。数据存储、共享访问和备份方式见[数据管理](data.md)。
