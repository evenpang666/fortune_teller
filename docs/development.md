# 开发、验证与项目结构

[返回项目首页](../README.md) · [文档目录](README.md)

## 本地开发

```bash
npm ci
npm run dev
npm run check
npm test
```

没有前端构建步骤或远程字体/CDN依赖。运行测试需要允许本地 HTTP 监听。34 项测试覆盖四柱节气与子时边界、非法日期、紫微时辰、天文 UTC 换算、抽牌唯一性、卦序/变爻、五格、自动康熙笔画/简繁差异/未收录回退、费用分项、免登录访问、Host/Origin 校验、历史重启、单条删除持久化、重复调用缓存、并发保护、真实 Cordis 插件生命周期、局域网地址筛选与监听范围，以及 JSDOM 中的局域网直接进入/旧启动链接兼容/八个页面提交/自动笔画填写与手动调整/查询防覆盖/主题切换/设置/局域网地址展示与复制/删除确认与取消/删除失败恢复/安全解读渲染。DeepSeek 网络测试使用模拟响应，不消耗真实 token。真实 API、Windows 启动和完整 DSH Web 挂载需在相应环境验证；浏览器控制工具超时，尚未完成真实浏览器视觉检查。

## 项目结构

```text
public/       中文响应式界面
lib/          本地规则计算、SQLite、DeepSeek 和 HTTP 服务
skills/       八种独立分析 Skill
scripts/      一键启动与语法/资源检查
test/         规则、服务、插件与页面交互测试
docs/         配置、规则、费用、数据与开发文档
index.mjs     DSH Host 插件
client.js     DSH Web 原生入口
cordis.patch.yml  插件 Bundle 配置
```

MIT License。第三方包许可请见各依赖目录中的 LICENSE；SVG 图标及界面装饰为原创。
