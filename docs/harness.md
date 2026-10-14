# DeepSeek Harness 插件接入

[返回项目首页](../README.md) · [文档目录](README.md)

本仓库包含官方 Bundle 结构：`package.json` 中的 `dsh.bundle` / `dsh.client`、`cordis.patch.yml`、Host `index.mjs`、Client `client.js`、中英元数据与原创 SVG 图标。**不修改 Harness 源码。**

在 Harness CLI 可用的环境执行：

```bash
dsh plugin --profile web add /绝对路径/fortuneteller
dsh web
```

Windows 使用对应目录的绝对路径。在已连接的 Harness 中，也可以通过其插件管理器安装本地 Bundle。安装后，输入区下方出现「打开观象工作室」入口，点击后在独立浏览器标签页打开本地工作室。八个 Skill 通过 `ctx.skills.register` 注册到 Harness。

Host 插件默认自行启动工作室服务（3210 端口）。**插件运行时不需要再运行 start.sh/start.bat**，避免端口冲突。入口根据当前浏览器主机名构造局域网地址，本机和局域网设备打开地址即可直接使用，无需登录。插件数据默认位于 DSH 启动目录的 `.data/fortuneteller/`；可用 `FORTUNE_DATA_DIR` 或插件 `config.dataDir` 指定绝对路径，以与独立模式共享数据库。不要让两个服务同时使用同一数据库进行分析。

插件 `config` 支持 `host`、`port`、`dataDir`。如更改端口，同时调整 Harness 入口旁的端口输入框。插件卸载会停止服务器、注销 Skill 和移除 Client 入口。

接口按 2026-10-14 核对的 [Harness 官方源码](https://github.com/deepseek-ai/deepseek-harness/tree/d743267388641bc76f17c45ce8b4c231aed1d32c) 实现。已使用真实 `@deepseek-ai/cordis@4.0.4` 和 `@deepseek-ai/dsh-skill@0.0.1-rc.1` 验证 Host 挂载、八个 Skill 注册/加载与卸载清理。Harness 仍处于预览阶段；本环境没有运行中的完整 DSH 宿主，因此尚未验证宿主 CLI 安装与 Web Client 入口渲染。入口是原生 React Slot；八种完整子界面位于独立的本地 Web 工作室，不嵌入 iframe。
