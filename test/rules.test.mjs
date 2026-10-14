import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChart, hexagram, draw } from '../lib/rules.mjs';
import { TAROT_DECK, HEX_MATRIX, TRIGRAMS } from '../lib/methods.mjs';
import { normalizeUsage, estimateCost, analyze, buildMessages } from '../lib/deepseek.mjs';

const birth={date:'1986-05-29',time:'00:00',gender:'女',question:'如何适应新的工作？'};
test('八字与历法库公开示例一致，并且采用节气年界',()=>{
  const chart=makeChart('bazi',birth).chart;
  assert.deepEqual(chart.pillars.map(p=>p.ganzhi),['丙寅','癸巳','癸酉','壬子']);
  assert.equal(makeChart('bazi',{...birth,date:'2024-02-03',time:'12:00'}).chart.pillars[0].ganzhi,'癸卯');
  assert.equal(makeChart('bazi',{...birth,date:'2024-02-05',time:'12:00'}).chart.pillars[0].ganzhi,'甲辰');
});
test('晚子时日柱规则有区别，午夜后相同',()=>{
  const a=makeChart('bazi',{...birth,time:'23:30',sect:1}).chart;
  const b=makeChart('bazi',{...birth,time:'23:30',sect:2}).chart;
  assert.notEqual(a.pillars[2].ganzhi,b.pillars[2].ganzhi);
  const next=makeChart('bazi',{...birth,date:'1986-05-30',time:'00:30',sect:2}).chart;
  assert.equal(a.pillars[2].ganzhi,next.pillars[2].ganzhi);
});
test('日期与时差校验拒绝不存在的日期及越界时间',()=>{
  for(const patch of [{date:'2023-02-29'},{date:'2024-04-31'},{time:'24:00'},{time:'03:60'},{date:'1800-01-01'}])assert.throws(()=>makeChart('bazi',{...birth,...patch}));
  assert.doesNotThrow(()=>makeChart('bazi',{...birth,date:'2024-02-29'}));
  assert.throws(()=>makeChart('zodiac',{...birth,offset:100}));
});
test('紫微早晚子时与十二宫完整性',()=>{
  const early=makeChart('ziwei',{...birth,time:'00:30'}).chart;
  const late=makeChart('ziwei',{...birth,time:'23:30'}).chart;
  assert.equal(early.timeIndex,0);assert.equal(late.timeIndex,12);
  assert.equal(early.palaces.length,12);assert.equal(new Set(early.palaces.map(p=>p.name)).size,12);
  assert.doesNotThrow(()=>JSON.stringify(early));
});
test('天文位置采用同一 UTC 瞬间，时间差换算一致',()=>{
  const a=makeChart('zodiac',{...birth,date:'2000-08-16',time:'08:00',offset:8}).chart;
  const b=makeChart('zodiac',{...birth,date:'2000-08-16',time:'00:00',offset:0}).chart;
  assert.equal(a.instant,b.instant);assert.deepEqual(a.planets,b.planets);
  assert.equal(a.planets[0].sign,'狮子座');assert.equal(a.planets.length,10);
});
test('完整 78 张塔罗与52张扑克无重复，牌阵和逆位参数有效',()=>{
  assert.equal(TAROT_DECK.length,78);assert.equal(new Set(draw(TAROT_DECK,78).map(c=>c.id)).size,78);
  const t=makeChart('tarot',{question:'新的方向',spread:'decision',reversals:false}).chart;
  assert.equal(t.cards.length,3);assert.ok(t.cards.every(c=>!c.reversed));
  assert.deepEqual(t.cards.map(c=>c.position),['选择 A','选择 B','需要留意']);
  assert.equal(makeChart('tarot',{question:'方向',spread:'single'}).chart.cards.length,1);
  assert.throws(()=>makeChart('tarot',{question:''}));
  assert.throws(()=>makeChart('tarot',{question:'方向',spread:'unknown'}));
  const p=makeChart('poker',{question:'方向'}).chart;assert.equal(new Set(p.cards.map(c=>c.id)).size,3);assert.ok(p.cards.every(c=>c.id>=0&&c.id<52));
});
test('文王卦序包含全部64卦，上下卦位序正确',()=>{
  assert.equal(new Set(HEX_MATRIX.flat()).size,64);
  assert.equal(hexagram([1,1,1,0,0,0]).name,'泰');
  assert.equal(hexagram([0,0,0,1,1,1]).name,'否');
  assert.equal(hexagram([1,0,1,0,1,0]).name,'既济');
  assert.equal(hexagram([0,1,0,1,0,1]).name,'未济');
  for(const lower of TRIGRAMS)for(const upper of TRIGRAMS)assert.ok(hexagram((lower.bits+upper.bits).split('').map(Number)).number>=1);
});
test('三钱阴阳数及老阴老阳转换，初爻自下而上',()=>{
  const values=[0,0,0,1,1,1,0,0,1,0,1,1,0,0,0,1,1,1];let index=0;
  const c=makeChart('iching',{question:'变化'},()=>values[index++]).chart;
  assert.deepEqual(c.lines.map(l=>l.value),[6,9,7,8,6,9]);
  assert.deepEqual(c.moving,[1,2,5,6]);
  assert.deepEqual(c.original.bits,[0,1,1,0,0,1]);
  assert.deepEqual(c.changed.bits,[1,0,1,0,1,0]);
});
test('单姓、复姓、单名、双名的五格虚数规则',()=>{
  const a=makeChart('name',{surname:'王',given:'知远',surnameStrokes:[4],givenStrokes:[8,17]}).chart;
  assert.deepEqual(a.grids,{天格:5,人格:12,地格:25,外格:18,总格:29});
  const b=makeChart('name',{surname:'欧阳',given:'修',surnameStrokes:[15,17],givenStrokes:[10]}).chart;
  assert.deepEqual(b.grids,{天格:32,人格:27,地格:11,外格:16,总格:42});
  assert.throws(()=>makeChart('name',{surname:'王',given:'知远',surnameStrokes:[4],givenStrokes:[8]}));
});
test('求签不生成未存在的古签诗，签号边界有效',()=>{
  assert.equal(makeChart('lot',{question:'前行'},()=>0).chart.hexagram.name,'乾');
  assert.equal(makeChart('lot',{question:'前行'},()=>63).chart.hexagram.name,'未济');
});
test('费用按实际缓存命中和输出分项，缺失用量显示未知',()=>{
  const u=normalizeUsage({prompt_tokens:1000,completion_tokens:500,prompt_cache_hit_tokens:800});
  assert.deepEqual(u,{input:1000,output:500,total:1500,hit:800,miss:200,reasoning:null});
  assert.equal(estimateCost(u,{hit:.04,miss:2,output:8,currency:'CNY'}).amount,.004432);
  assert.equal(normalizeUsage({}),null);assert.equal(estimateCost(null,{}),null);
});
test('八种分析会加载对应Skill，HTTP与空输出失败不会伪造解读',async()=>{
  for(const method of ['bazi','ziwei','zodiac','tarot','poker','iching','lot','name']){
    const r=makeChart(method,{...birth,surname:'王',given:'知远',surnameStrokes:[4],givenStrokes:[8,17]});
    const messages=buildMessages(r);assert.equal(messages.length,2);assert.ok(messages[0].content.length>400);
  }
  const r=makeChart('lot',{question:'方向'});const config={apiKey:'test-key',model:'deepseek-flash',pricing:{hit:.04,miss:2,output:8,currency:'CNY'}};
  await assert.rejects(analyze(r,{...config,apiKey:''}),/API Key/);
  await assert.rejects(analyze(r,config,{fetchImpl:async()=>new Response('',{status:401})}),/API Key 无效/);
  await assert.rejects(analyze(r,config,{fetchImpl:async()=>Response.json({choices:[{message:{content:''}}]})}),/未返回/);
  const report=await analyze(r,config,{fetchImpl:async(url,options)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(JSON.parse(options.body).model,'deepseek-flash');return Response.json({choices:[{message:{content:'测试解读'},finish_reason:'stop'}],usage:{prompt_tokens:1000,completion_tokens:500,prompt_cache_hit_tokens:800}});}});
  assert.equal(report.report,'测试解读');assert.equal(report.cost.amount,.004432);
});
