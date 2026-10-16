import test from 'node:test';
import assert from 'node:assert/strict';
import { createDshGeneration } from '../lib/dsh.mjs';
import { makeChart } from '../lib/rules.mjs';
import { DEFAULT_CONFIG } from '../lib/store.mjs';

const record=makeChart('lot',{question:'探索'});
function fixture(chunks) {
  let selection={provider:'deepseek-official',model:'deepseek-flash'};const requests=[];
  const generation=createDshGeneration({agentDefaultModel:{currentSelection:()=>selection},llm:{listProviders:()=>[{id:selection.provider}],async *stream(request){requests.push(request);yield* chunks;}}});
  return {generation,requests,setSelection:next=>{selection=next;}};
}
test('DSH 默认模型按请求读取，使用 disjoint 用量，凭据不进入插件调用参数',async()=>{
  const f=fixture([{type:'reasoning-delta',text:'不展示的思考'},{type:'text-delta',text:'可见解读'},{type:'usage',usage:{inputTokens:80,cacheReadTokens:20,cacheWriteTokens:5,outputTokens:10}},{type:'finish',reason:{kind:'stop'}}]);
  const config={...DEFAULT_CONFIG,pricingModel:'deepseek-flash'};
  const first=await f.generation.analyze(record,config);assert.equal(first.report,'可见解读');assert.deepEqual(first.usage,{input:105,output:10,total:115,hit:20,miss:85,reasoning:null});assert.ok(first.cost);assert.equal(f.requests[0].apiKey,undefined);
  f.setSelection({provider:'custom',model:'other',reasoningEffort:'high'});
  const second=await f.generation.analyze(record,config);assert.equal(f.requests[1].model,'other');assert.equal(f.requests[1].provider,'custom');assert.equal(f.requests[1].reasoningEffort,'high');assert.equal(second.cost,null);
});
test('DSH 缺失凭据、限流、中断和不完整流不会缓存成成功解读',async()=>{
  for(const [reason,pattern] of [[{kind:'error',failure:{code:'MISSING_CREDENTIAL'}},/DSH Web.*API Key/],[{kind:'error',failure:{code:'RATE_LIMIT'}},/频繁/],[{kind:'aborted',failure:{}},/中断/]]) {
    const f=fixture([{type:'text-delta',text:'未完成'},{type:'finish',reason}]);await assert.rejects(f.generation.analyze(record,DEFAULT_CONFIG),pattern);
  }
  await assert.rejects(fixture([{type:'text-delta',text:'中途断线'}]).generation.analyze(record,DEFAULT_CONFIG),/未返回/);
  const truncated=await fixture([{type:'text-delta',text:'部分内容'},{type:'finish',reason:{kind:'max-tokens'}}]).generation.analyze(record,DEFAULT_CONFIG);assert.equal(truncated.truncated,true);assert.equal(truncated.usage,null);
});
