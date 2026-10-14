export const METHODS = [
  { id: 'bazi', name: '八字', en: 'Four Pillars', icon: '☯', category: '东方命理', color: 'jade', description: '于四柱之间，读懂自己的节奏。', rule: '子平四柱 · 立春换年 · 节令换月 · 北京时间 · 子时换日可选', action: '生成四柱', skill: 'fortune-bazi' },
  { id: 'zodiac', name: '星座', en: 'Astrology', icon: '✧', category: '西方占星', color: 'violet', description: '循着星辰轨迹，探索内在宇宙。', rule: '热带黄道 · 地心黄经 · 十大天体 · 主要相位（容许度 6°）', action: '绘制星图', skill: 'fortune-zodiac' },
  { id: 'tarot', name: '塔罗', en: 'Tarot Reading', icon: '☽', category: '卡牌占卜', color: 'violet', description: '让每一张牌，回应此刻的疑问。', rule: 'Rider–Waite–Smith · 78 张完整牌组 · 不放回抽取 · 可选正逆位', action: '洗牌与抽牌', skill: 'fortune-tarot' },
  { id: 'poker', name: '扑克', en: 'Cartomancy', icon: '♧', category: '卡牌占卜', color: 'rose', description: '熟悉的花色，藏着新的视角。', rule: '52 张标准扑克 · 无大小王 · 三张时间牌阵 · 无正逆位 · 产品约定象征', action: '抽取三张牌', skill: 'fortune-poker' },
  { id: 'name', name: '姓名', en: 'Name Reading', icon: '名', category: '东方命理', color: 'jade', description: '从名字出发，品读文字与寓意。', rule: '五格剖象法 · 用户核实康熙笔画 · 支持单姓与复姓 · 不自动猜笔画', action: '解析姓名', skill: 'fortune-name' },
  { id: 'iching', name: '易卦', en: 'I Ching', icon: '䷊', category: '东方命理', color: 'gold', description: '在变化之中，寻找前行的方向。', rule: '三枚铜钱法 · 阴面 2 阳面 3 · 六爻自下而上 · 老阴老阳变爻', action: '投币起卦', skill: 'fortune-iching' },
  { id: 'ziwei', name: '紫微斗数', en: 'Zi Wei Dou Shu', icon: '✺', category: '东方命理', color: 'violet', description: '十二宫星曜，映照人生的不同侧面。', rule: 'iztro 默认安星体系 · 北京时间 · 早晚子时区分 · 闰月调整可选', action: '生成命盘', skill: 'fortune-ziwei' },
  { id: 'lot', name: '求签', en: 'Oracle Lots', icon: '签', category: '东方命理', color: 'gold', description: '静心片刻，收下一份当下的启示。', rule: '易经六十四卦签 · 文王卦序 · 等概率一签 · 无寺庙签诗及吉凶等级', action: '静心求签', skill: 'fortune-lot' },
];
export const HEX_NAMES = '乾 坤 屯 蒙 需 讼 师 比 小畜 履 泰 否 同人 大有 谦 豫 随 蛊 临 观 噬嗑 贲 剥 复 无妄 大畜 颐 大过 坎 离 咸 恒 遁 大壮 晋 明夷 家人 睽 蹇 解 损 益 夬 姤 萃 升 困 井 革 鼎 震 艮 渐 归妹 丰 旅 巽 兑 涣 节 中孚 小过 既济 未济'.split(' ');
export const TRIGRAMS = [
  { name: '乾', symbol: '☰', bits: '111', image: '天' }, { name: '兑', symbol: '☱', bits: '110', image: '泽' },
  { name: '离', symbol: '☲', bits: '101', image: '火' }, { name: '震', symbol: '☳', bits: '100', image: '雷' },
  { name: '巽', symbol: '☴', bits: '011', image: '风' }, { name: '坎', symbol: '☵', bits: '010', image: '水' },
  { name: '艮', symbol: '☶', bits: '001', image: '山' }, { name: '坤', symbol: '☷', bits: '000', image: '地' },
];
export const HEX_MATRIX = [[1,10,13,25,44,6,33,12],[43,58,49,17,28,47,31,45],[14,38,30,21,50,64,56,35],[34,54,55,51,32,40,62,16],[9,61,37,42,57,59,53,20],[5,60,63,3,48,29,39,8],[26,41,22,27,18,4,52,23],[11,19,36,24,46,7,15,2]];
export const MAJORS = '愚者 魔术师 女祭司 皇后 皇帝 教皇 恋人 战车 力量 隐者 命运之轮 正义 倒吊人 死神 节制 恶魔 高塔 星星 月亮 太阳 审判 世界'.split(' ');
export const TAROT_DECK = [...MAJORS.map((name, i) => ({ id: i, name, arcana: '大阿尔卡那', number: i })), ...['权杖','圣杯','宝剑','星币'].flatMap((suit, s) => ['一','二','三','四','五','六','七','八','九','十','侍从','骑士','王后','国王'].map((rank, r) => ({ id: 22 + s*14+r, name: suit+rank, suit, number: r+1, arcana: '小阿尔卡那' })))];
export const SPREADS = { single: ['当下的启示'], three: ['过去', '现在', '未来趋势'], decision: ['选择 A', '选择 B', '需要留意'] };
