import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyFortune } from '../lib/daily.mjs';

test('北京时间午夜切换黄历，同一天重复查看保持一致',()=>{
  const before=dailyFortune(new Date('2026-10-14T15:59:59Z'));
  const after=dailyFortune(new Date('2026-10-14T16:00:00Z'));
  assert.equal(before.date,'2026-10-14');assert.equal(after.date,'2026-10-15');
  assert.equal(after.lunar,'丙午年 九月初六');assert.equal(after.weekday,'星期四');
  assert.equal(after.ganzhi,'戊戌月 · 壬戌日');assert.equal(after.spirit,'白虎');assert.equal(after.luck,'凶');
  assert.deepEqual(after,dailyFortune(new Date('2026-10-15T15:59:59Z')));
  assert.ok(after.yi.length<=6);assert.ok(after.ji.length<=6);
});

test('春节与节气正常展示，运势文案随黄历吉凶选择',()=>{
  const festival=dailyFortune(new Date('2026-02-17T00:00:00Z'));
  assert.ok(festival.festival.includes('春节'));assert.match(festival.lunar,/正月初一/);
  assert.equal(dailyFortune(new Date('2026-04-05T00:00:00Z')).solarTerm,'清明');
  const days=Array.from({length:15},(_,i)=>dailyFortune(new Date(Date.UTC(2026,9,i+1))));
  assert.ok(days.some(d=>d.luck==='吉'&&d.assessment.label==='从容推进'));
  assert.ok(days.some(d=>d.luck==='凶'&&d.assessment.label==='稳中求进'));
});
