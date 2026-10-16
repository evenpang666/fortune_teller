# DSH Web 插件接入

[返回首页](../README.md)

插件 Bundle 包含 `package.json` 的 `dsh.bundle` / `dsh.client`、`cordis.patch.yml`、Host `index.mjs` 和浏览器入口 `client.js`。不修改 DSH 源码。

```bash
dsh plugin --profile web add "link:/绝对路径/fortuneteller"
dsh web --no-open
```

也可直接运行 `start.sh` / `start.bat`，自动检查环境并安装插件。

Host 依赖 `llm`、`agentDefaultModel`、`webServer`、`connection`。在 DSH Web 同一 HTTP 监听上注册 `/fortuneteller` 前缀路由，页面通过 `connection.authorizeIndex()` 验证登录，接口和静态资源通过 `connection.requestRejection()` 继承 DSH 的来源与认证检查。公开的 `/fortuneteller/health` 仅返回插件名和接口版本，用于启动检测。

生成时读取 `agentDefaultModel.currentSelection()`，通过 `llm.stream()` 发送结构化盘面和对应 Skill，聚合可见文本、用量和结束状态。凭据、endpoint 和协议由 DSH 适配器处理；插件不读取或保存 DSH Key。DSH 中模型与凭据更新在下次请求生效。缺失凭据、限流、中断和不完整流均不会当作成功结果缓存。

Client 在原生 `conversation.composer.dock` Slot 中提供相对路径 `/fortuneteller/` 的入口，无端口设置、iframe 或额外工作室监听。八个 Skill 通过 `skills` 服务注册。卸载时移除路由、终止进行中的生成、关闭数据库并注销 Skill，不会关闭 DSH Web。

数据目录默认是插件项目 `.data/`，可用 `FORTUNE_DATA_DIR` 或插件 `config.dataDir` 指定绝对路径。

页面默认独立监听 `0.0.0.0:3100`，本机访问 `http://127.0.0.1:3100/`，局域网设备访问 `http://主机局域网IP:实际端口/`，无需登录。首选端口由 `FORTUNE_PORT` 或插件 `config.port` 设置；端口占用时直接使用系统分配的空闲端口，启动器与页面显示实际地址。DSH 的模型和凭据继续复用，管理页认证保留，旧 DSH 子路径仅作兼容入口。

接口按本机 `@deepseek-ai/dsh@0.1.5-rc.1` 的公开服务定义实现。DSH 仍处于预览阶段，后续接口变化需重新验证。正在运行的 DSH 不一定自动识别新增 Bundle；启动器只安装并提示启用或重启原服务，不强制终止已有进程。
