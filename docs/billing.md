# DeepSeek Token 与费用估算

[返回项目首页](../README.md) · [文档目录](README.md)

当前默认 `deepseek-flash`，可切换 `deepseek-v4-pro`。按 [DeepSeek 官方价格表](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)（2026-10-14 核对）默认采用人民币高峰单价：

| 模型 | 输入缓存命中 / 百万 | 输入未命中 / 百万 | 输出 / 百万 |
| --- | ---: | ---: | ---: |
| Flash | ¥0.04 | ¥2 | ¥8 |
| V4 Pro | ¥0.30 | ¥9 | ¥27 |

空闲时段通常减半；默认估算不会自动判断法定节假日/供应商时段，设置页可修改单价，以平台实际账单为准。使用响应的 `prompt_tokens`、`completion_tokens`、`prompt_cache_hit_tokens`，按缓存命中、未命中与输出分别计价。未返回 usage 时显示未知，不虚构用量；请求失败或中断时可能已发生费用，但未取得的 usage 无法统计。每条已完成记录以小字显示明细和估算口径。

费用公式：`(命中 tokens × 命中单价 + 未命中 tokens × 未命中单价 + 输出 tokens × 输出单价) / 1,000,000`。
