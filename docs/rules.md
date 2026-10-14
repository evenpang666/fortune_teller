# 命理体系与计算规则

[返回项目首页](../README.md) · [文档目录](README.md)

命理与占卜不存在覆盖所有流派的统一“官方标准”。本项目在各子界面与 Skill 中标明计算规则及局限，程序负责计算，模型负责解读。

| 形式 | 程序实现与边界 |
| --- | --- |
| 八字 | `lunar-javascript` 节气四柱，立春换年、节令换月，子时换日可选，藏干/十神/纳音/大运；北京时间钟表时，未校正真太阳时 |
| 星座 | `astronomy-engine` 实际地心视黄经、热带黄道十大天体、主要相位；UTC 时差由用户提供，含出生时夏令时；不计算上升、宫位、逆行和行运 |
| 塔罗 | RWS 完整 78 张、力量 VIII/正义 XI，单张/三张/选择牌阵，不放回抽取，可选正逆位；原创文字卡面，无原版牌画 |
| 扑克 | 52 张无王、无正逆位、三张时间牌阵；花色与数字象征为明确写入 Skill 的产品约定，无统一官方扑克占卜标准 |
| 姓名 | 五格剖象法与三才，单姓/复姓、单名/双名；本地字典自动查询姓名学康熙笔画，未收录或字形有差异时要求手动核实，可手动调整；详见[笔画查询](name-strokes.md) |
| 易卦 | 三钱法：每币 2/3，六次自下而上，6/9 变爻，64 卦文王序；不声称完整纳甲六爻或蓍草法 |
| 紫微斗数 | `iztro` 默认安星体系，十二宫主辅星、亮度/四化、命主/身主、早晚子时、闰月调整；北京时间，不计算流年飞化盘 |
| 求签 | 本产品的易经六十四卦签，文王序、等概率一签；无寺庙签诗、典故或上上/下下等级，不冒充传统寺庙签谱 |

出生日期支持 1900–2100 年、公历。海外出生的八字/紫微输入需先换算北京时间，真太阳时及地方流派差异可能影响盘面。姓名学、占星与占卜的解读作为文化探索和反思，不是确定的预测。

计算和传统文本参考：[lunar-javascript](https://github.com/6tail/lunar-javascript)、[iztro 官方文档](https://docs.iztro.com/posts/astrolabe)、[Astronomy Engine](https://github.com/cosinekitty/astronomy)、[Waite 塔罗原著](https://www.gutenberg.org/ebooks/43548)、[《周易》](https://ctext.org/book-of-changes/zh)。依赖均固定版本并提供 package-lock。

姓名字表采用 [shunshi-kangxi-core](https://github.com/shunshi-ai/kangxi-mcp) 0.1.1（MIT），不是由 DeepSeek 生成笔画。查询方式、数据差异和手动回退见[姓名笔画文档](name-strokes.md)。

## 专属 Skill

每一种形式对应一份独立 Skill。Web 服务端在分析时加载，DSH 插件挂载时注册到 Skill 服务。

| 形式 | Skill 文件 |
| --- | --- |
| 八字 | [fortune-bazi](../skills/fortune-bazi/SKILL.md) |
| 星座 | [fortune-zodiac](../skills/fortune-zodiac/SKILL.md) |
| 塔罗 | [fortune-tarot](../skills/fortune-tarot/SKILL.md) |
| 扑克 | [fortune-poker](../skills/fortune-poker/SKILL.md) |
| 姓名 | [fortune-name](../skills/fortune-name/SKILL.md) |
| 易卦 | [fortune-iching](../skills/fortune-iching/SKILL.md) |
| 紫微斗数 | [fortune-ziwei](../skills/fortune-ziwei/SKILL.md) |
| 求签 | [fortune-lot](../skills/fortune-lot/SKILL.md) |
