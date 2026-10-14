import { randomInt } from 'node:crypto';
import lunar from 'lunar-javascript';
import iztro from 'iztro';
import * as astronomy from 'astronomy-engine';
import { METHODS, HEX_NAMES, HEX_MATRIX, TRIGRAMS, TAROT_DECK, SPREADS } from './methods.mjs';
import { nameStrokes, STROKE_SOURCE } from './name-strokes.mjs';

export class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export function textField(value, name, { required = true, max = 500 } = {}) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new InputError(`${name}格式不正确（最多 ${max} 字）`);
  return value.trim();
}
function choice(value, values, label) { if (!values.includes(value)) throw new InputError(`${label}不在支持范围内`); return value; }
function nameParts(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new InputError('姓名输入无效');
  const surname=textField(input.surname,'姓氏',{max:4}),given=textField(input.given,'名字',{max:4});
  if(!/^[\p{Script=Han}]{1,2}$/u.test(surname)||!/^[\p{Script=Han}]{1,2}$/u.test(given))throw new InputError('五格分析支持一至二字汉字姓氏和名字');
  return {surname,given};
}
export function lookupNameStrokes(input){const {surname,given}=nameParts(input);return nameStrokes(surname,given);}
function birth(input) {
  const date = textField(input.date, '出生日期'); const time = textField(input.time, '出生时间');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new InputError('请填写完整的公历日期与时间');
  const [y,m,d] = date.split('-').map(Number); const [h,min] = time.split(':').map(Number);
  const check = new Date(Date.UTC(y,m-1,d,h,min));
  if (y < 1900 || y > 2100 || check.getUTCFullYear() !== y || check.getUTCMonth()+1 !== m || check.getUTCDate() !== d || h > 23 || min > 59) throw new InputError('出生日期或时间无效；支持 1900–2100 年');
  return { date, time, y,m,d,h,min };
}
export function hexagram(bits) {
  const lower = TRIGRAMS.findIndex(t => t.bits === bits.slice(0,3).join(''));
  const upper = TRIGRAMS.findIndex(t => t.bits === bits.slice(3).join(''));
  if (lower < 0 || upper < 0 || bits.length !== 6) throw new InputError('六爻数据无效');
  const number = HEX_MATRIX[upper][lower];
  return { number, name: HEX_NAMES[number-1], symbol: String.fromCodePoint(0x4DC0+number-1), lower: TRIGRAMS[lower], upper: TRIGRAMS[upper], bits };
}
export function draw(deck, count, rng = randomInt) {
  const pool = [...deck]; const result = [];
  for (let i=0;i<count;i++) result.push(pool.splice(rng(pool.length),1)[0]);
  return result;
}
export function makeChart(method, input, rng = randomInt) {
  const def = METHODS.find(m => m.id === method); if (!def) throw new InputError('未知的分析形式');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('输入数据无效');
  const question = textField(input.question ?? '', '问题', { required: false, max: 1000 });
  const clean = { question }; let chart;
  if (method === 'bazi') {
    const b = birth(input); const sect = choice(Number(input.sect ?? 2), [1,2], '子时规则');
    const gender = choice(input.gender, ['男','女'], '排盘性别'); Object.assign(clean, { date:b.date,time:b.time,sect,gender });
    const l = lunar.Solar.fromYmdHms(b.y,b.m,b.d,b.h,b.min,0).getLunar(); const ec = l.getEightChar(); ec.setSect(sect);
    const pillars = ['Year','Month','Day','Time'].map((p,i) => ({ label:['年柱','月柱','日柱','时柱'][i], ganzhi:ec[`get${p}`](), wuxing:ec[`get${p}WuXing`](), nayin:ec[`get${p}NaYin`](), hidden:ec[`get${p}HideGan`](), stemGod:ec[`get${p}ShiShenGan`](), branchGod:ec[`get${p}ShiShenZhi`]() }));
    const yun = ec.getYun(gender === '男' ? 1 : 0, 2);
    chart = { title:pillars.map(p=>p.ganzhi).join(' · '), lunar:l.toString(), dayMaster:ec.getDayGan(), pillars, clock:'北京时间 UTC+8，未校正真太阳时', sect, startLuck:yun.getStartSolar().toYmd(), luck:yun.getDaYun(9).slice(1).map(d=>({ ganzhi:d.getGanZhi(), startAge:d.getStartAge(), endAge:d.getEndAge(), startYear:d.getStartYear(), endYear:d.getEndYear() })) };
  } else if (method === 'ziwei') {
    const b = birth(input); const gender = choice(input.gender, ['男','女'], '排盘性别');
    if (input.fixLeap != null && typeof input.fixLeap !== 'boolean') throw new InputError('闰月调整参数无效');
    const fixLeap = input.fixLeap ?? true; const timeIndex = b.h === 23 ? 12 : Math.floor((b.h+1)/2);
    Object.assign(clean, { date:b.date,time:b.time,gender,fixLeap });
    const z = iztro.astro.bySolar(b.date,timeIndex,gender,fixLeap,'zh-CN').toJSON();
    chart = { title:`${z.fiveElementsClass} · 命主${z.soul} · 身主${z.body}`, ...z, clock:'北京时间 UTC+8，未校正真太阳时', timeIndex, fixLeap };
  } else if (method === 'zodiac') {
    const b = birth(input); const offset = Number(input.offset ?? 8);
    if (!Number.isFinite(offset) || offset < -12 || offset > 14 || offset*4 % 1) throw new InputError('UTC 时差无效');
    Object.assign(clean,{date:b.date,time:b.time,offset});
    const instant = new Date(Date.UTC(b.y,b.m-1,b.d,b.h,b.min)-offset*3600000);
    const signs = '白羊座 金牛座 双子座 巨蟹座 狮子座 处女座 天秤座 天蝎座 射手座 摩羯座 水瓶座 双鱼座'.split(' ');
    const bodies = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
    const planets = bodies.map((body,i) => { const longitude=astronomy.Ecliptic(astronomy.GeoVector(body,instant,true)).elon; return { name:['太阳','月亮','水星','金星','火星','木星','土星','天王星','海王星','冥王星'][i],longitude, sign:signs[Math.floor(longitude/30)], degree:longitude%30 }; });
    const aspects = [];
    planets.forEach((a,i)=>planets.slice(i+1).forEach(b=> { const delta=Math.abs(a.longitude-b.longitude); const angle=Math.min(delta,360-delta); for(const [target,name] of [[0,'合相'],[60,'六合'],[90,'刑相'],[120,'拱相'],[180,'对冲']]) if(Math.abs(angle-target)<=6) aspects.push({a:a.name,b:b.name,name,orb:Math.abs(angle-target)}); }));
    chart={title:`太阳${planets[0].sign} · 月亮${planets[1].sign}`,instant:instant.toISOString(),planets,aspects,system:'热带黄道、地心视位置；未计算上升、宫位与行运；时差应含出生时当地夏令时'};
  } else if (method === 'tarot') {
    if (!question) throw new InputError('请先写下想探索的问题');
    const spread = choice(input.spread ?? 'three',Object.keys(SPREADS),'牌阵'); const reversals = input.reversals ?? true;
    if (typeof reversals !== 'boolean') throw new InputError('正逆位参数无效');
    Object.assign(clean,{spread,reversals});
    const cards=draw(TAROT_DECK,SPREADS[spread].length,rng).map((c,i)=>({...c,position:SPREADS[spread][i],reversed:reversals && rng(2)===1}));
    chart={title:cards.map(c=>c.name).join(' · '),cards,spread,reversals};
  } else if (method === 'poker') {
    if (!question) throw new InputError('请先写下想探索的问题');
    const suits=['♥','♦','♣','♠']; const meaning=['情感与关系','资源与事务','行动与成长','挑战与边界'];
    const deck=suits.flatMap((suit,s)=>['A','2','3','4','5','6','7','8','9','10','J','Q','K'].map((rank,r)=>({id:s*13+r,name:suit+rank,suit,rank,meaning:meaning[s]})));
    const cards=draw(deck,3,rng).map((c,i)=>({...c,position:SPREADS.three[i]})); chart={title:cards.map(c=>c.name).join(' · '),cards,system:'52 张无王、无正逆位。花色象征为本产品约定，并无统一官方占卜规则。'};
  } else if (method === 'name') {
    const {surname,given}=nameParts(input);
    const strokeMode=choice(input.strokeMode??(input.surnameStrokes!==undefined||input.givenStrokes!==undefined?'manual':'auto'),['auto','manual'],'笔画模式');
    const lookup=nameStrokes(surname,given);
    if(strokeMode==='auto'&&!lookup.complete){const unresolved=[...lookup.surname,...lookup.given].filter(e=>e.status!=='found').map(e=>e.character);throw new InputError(`「${unresolved.join('、')}」的康熙笔画需要核实，请启用手动调整后填写`);}
    function strokes(value,name,length) { if(!Array.isArray(value)||value.length!==length||value.some(n=>!Number.isInteger(n)||n<1||n>64)) throw new InputError(`${name}需要为每个汉字提供 1–64 的康熙笔画整数`); return value; }
    const ss=strokeMode==='auto'?lookup.surname.map(e=>e.strokes):strokes(input.surnameStrokes,'姓氏', [...surname].length);
    const gs=strokeMode==='auto'?lookup.given.map(e=>e.strokes):strokes(input.givenStrokes,'名字',[...given].length);
    Object.assign(clean,{surname,given,strokeMode,surnameStrokes:ss,givenStrokes:gs});
    const s=ss.reduce((a,b)=>a+b,0),g=gs.reduce((a,b)=>a+b,0),person=ss.at(-1)+gs[0];
    const grids={天格:s+(ss.length===1?1:0),人格:person,地格:g+(gs.length===1?1:0),外格:s+g-person+(ss.length===1?1:0)+(gs.length===1?1:0),总格:s+g};
    const elements=Object.fromEntries(Object.entries(grids).map(([k,n])=>[k,['水','木','木','火','火','土','土','金','金','水'][n%10]]));
    chart={title:surname+given,grids,elements,threeTalents:[elements.天格,elements.人格,elements.地格].join(' · '),strokeSource:strokeMode==='auto'?`${STROKE_SOURCE.label}（${STROKE_SOURCE.name} ${STROKE_SOURCE.version}）`:'用户手动核实 / 调整的康熙笔画',strokeLookup:lookup,characters:[...surname,...given],strokes:[...ss,...gs]};
  } else if (method === 'iching') {
    if (!question) throw new InputError('请先写下起卦的问题');
    const lines=Array.from({length:6},(_,i)=>{const coins=Array.from({length:3},()=>rng(2)+2);return {position:i+1,coins,value:coins.reduce((a,b)=>a+b,0)};});
    const original=hexagram(lines.map(l=>l.value%2)); const changed=hexagram(lines.map(l=>l.value===6?1:l.value===9?0:l.value%2));
    chart={title:`${original.name}之${changed.name}`,lines,original,changed,moving:lines.filter(l=>[6,9].includes(l.value)).map(l=>l.position)};
  } else {
    if (!question) throw new InputError('请先写下求签的问题');
    const number=rng(64)+1; let bits;
    HEX_MATRIX.forEach((row,u)=>row.forEach((n,l)=>{if(n===number)bits=(TRIGRAMS[l].bits+TRIGRAMS[u].bits).split('').map(Number);}));
    chart={title:`第 ${number} 签 · ${HEX_NAMES[number-1]}`,number,hexagram:hexagram(bits),system:'易经六十四卦签：本产品将六十四卦作为签目等概率抽取；不冒充寺庙传承，不附虚构古签诗。'};
  }
  return {method,input:clean,chart,rules:def.rule,ruleVersion:method==='name'?'1.1.0':'1.0.0'};
}
