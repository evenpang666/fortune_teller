# 故障排查

[返回首页](../README.md)

| 现象 | 处理 |
| --- | --- |
| 启动后打开了 DSH 管理页 | 启动器会禁止宿主自动打开，仅打开观象；请确认使用本项目最新启动脚本 |
| 不希望自动打开观象 | 使用 `sh start.sh --no-open` |
| `UNDICI-EHPA` 实验提示 | 这是代理组件的实验性 warning，不代表加载失败；启动器仅过滤该提示，保留代理和其他错误日志 |
| Node 缺失或版本低 | 使用 `sh start.sh`、`bash start.sh` 或 `start.bat`，自动安装到项目 `.data/node/` |
| Node 下载失败 | 检查 `nodejs.org` 连接、curl/tar 或 PowerShell；也可手动安装 Node ≥22.13 |
| `Bad substitution` | 启动脚本已兼容 POSIX sh，直接重试 `sh ./start.sh` |
| `ERR_PNPM_UNEXPECTED_STORE` | 新启动器读取共享 profile 的 pnpm 与 store 元数据，复用匹配版本；无需修改全局 store 或重装其他项目 |
| npm / pnpm 安装失败 | 检查 registry、代理和项目 / DSH profile 写入权限；修复后重试，已有设置不会被清空 |
| 已有服务但又准备启动 | 自定义端口时设置正确的 `DSH_WEB_URL`，使用原服务的 `DSH_HOME` |
| 地址被其他服务占用 | 不会自动结束占用进程，请修改 `DSH_WEB_URL` 或处理原服务 |
| 已安装插件，入口未出现 | 原 DSH 进程尚未加载新 Bundle；在插件管理器启用，必要时重启原 DSH Web 一次 |
| `/fortuneteller/` 返回 401 | 先用原 DSH 终端打印的登录链接登录，同一主机名和端口下再进入观象 |
| localhost 已登录，127.0.0.1 仍要求登录 | DSH cookie 按访问地址绑定，请使用登录时相同的主机名 |
| 工作室返回 404 | 确认当前 DSH 已加载插件；健康检查 `/fortuneteller/health` 应返回插件名 |
| 解读提示缺失 Key 或认证失败 | 在 DSH Web 模型设置中配置凭据；观象无需单独填写 Key |
| 模型与预期不一致 | 观象读取 DSH 的默认模型，请修改 DSH 默认选择；旧解读保留原模型 |
| 解读超时或中断 | 检查 DSH 模型连接，在历史中重试；失败请求仍可能已被提供方计费 |
| 未找到已安装的 DSH | 将已有 DSH 加入 PATH，或用 `DSH_CLI` 指定入口；启动器不查询更新或自动安装 DSH |
| 重复点击提示启动流程已在运行 | 原启动窗口仍在安装或运行；不会新开第二个 DSH |

历史数据默认位于项目 `.data/`，升级前可备份。旧独立服务应先停止，避免与插件共同修改同一个数据库。
