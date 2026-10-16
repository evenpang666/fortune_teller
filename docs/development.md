# 开发与验证

[返回首页](../README.md)

```bash
npm ci
npm run check
npm test
npm run dev
```

`dev` 与正式启动共用环境检查、插件安装和服务复用流程，正式启动默认打开观象；`dev` 携带 `--no-open`，不打开浏览器。无前端构建步骤。

| 目录 / 文件 | 职责 |
| --- | --- |
| `index.mjs` / `client.js` | DSH Host 路由与原生 Slot 入口 |
| `lib/dsh.mjs` | 宿主默认模型选择、流式生成、用量与错误映射 |
| `lib/deepseek.mjs` | Skill 提示构造与费用计算，不直接请求提供方 |
| `lib/server.mjs` | 可挂载 HTTP handler、排盘与历史接口 |
| `scripts/environment.mjs` | 依赖同步、已有 DSH / pnpm 复用和 profile 检查 |
| `scripts/launch.mjs` | 启动锁、服务探测与复用、DSH 进程生命周期 |
| `start.sh` / `scripts/bootstrap.ps1` | 缺失或过旧 Node 的隔离安装 |
| `test/` | 排盘、数据、DSH 适配、启动检测和 UI 回归 |

HTTP 测试需要本地监听权限。生成测试使用模拟 DSH 流，不消耗真实模型 token。测试包括模型动态切换、凭据不进入插件参数、缓存、用量归一化、认证、错误 / 中断恢复、路由和 Skill 卸载。真实 DSH 隔离启动验证与平台限制以本次交付说明为准；Windows bootstrap 需在 Windows 实机验证。
