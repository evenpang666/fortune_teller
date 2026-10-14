import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../lib/server.mjs';
import { createStore } from '../lib/store.mjs';
import { request as httpRequest } from 'node:http';

test('姓名笔画查询无需AI且不新增历史，自动排盘记录保存实际笔画和来源',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gx-name-strokes-'));let calls=0;const app=createApp({dataDir:dir,analyzeImpl:async()=>{calls++;throw new Error('不应调用AI');}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}`;
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  try{
    const lookup=await(await post('/api/name-strokes',{surname:'王',given:'知远'})).json();
    assert.deepEqual(lookup.given.map(e=>e.strokes),[8,17]);assert.equal(lookup.complete,true);assert.equal(app.store.list().length,0);
    const missing=await(await post('/api/name-strokes',{surname:'王',given:'𠮷'})).json();assert.equal(missing.complete,false);
    assert.equal((await post('/api/name-strokes',{surname:'abc',given:'知远'})).status,400);
    const response=await post('/api/readings',{method:'name',input:{surname:'王',given:'知远'}});assert.equal(response.status,201);
    const record=await response.json();assert.deepEqual(record.chart.strokes,[4,8,17]);assert.equal(record.input.strokeMode,'auto');assert.equal(calls,0);
    assert.equal(app.store.get(record.id).chart.strokeLookup.source.version,'0.1.1');
  }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('删除接口只移除指定记录及解读，历史和导出同步更新且重启后保持删除',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gx-delete-'));const app=createApp({dataDir:dir});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}`;
  const create=async question=>(await fetch(base+'/api/readings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method:'lot',input:{question}})})).json();
  try{
    const target=await create('待删除'),kept=await create('保留');
    app.store.save({...target,status:'complete',report:'待删除解读',usage:{total:10}});
    assert.equal((await fetch(base+'/api/readings/'+target.id,{method:'DELETE'})).status,200);
    assert.equal((await fetch(base+'/api/readings/'+target.id)).status,404);
    assert.equal((await fetch(base+'/api/readings/'+target.id+'/analyze',{method:'POST',body:'{}'})).status,404);
    const history=await(await fetch(base+'/api/readings')).json();assert.deepEqual(history.map(r=>r.id),[kept.id]);
    const exported=await(await fetch(base+'/api/readings/export')).json();assert.deepEqual(exported.map(r=>r.id),[kept.id]);
    await app.close();const reopened=createStore(dir);assert.equal(reopened.get(target.id),null);assert.ok(reopened.get(kept.id));reopened.close();
  }finally{if(app.server.listening)await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('无需口令即可使用服务，历史持久化、分析缓存、密钥隐藏与来源校验有效',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gx-integration-'));let calls=0;
  const app=createApp({dataDir:dir,analyzeImpl:async()=>{calls++;return {report:'本地测试服务的模拟解读',usage:{input:20,output:10,total:30,hit:0,miss:20},cost:{amount:.00012,currency:'CNY'},model:'mock-test'};}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const request=(path,options={})=>fetch(base+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  try {
    assert.equal((await request('/')).status,200);
    const historyResponse=await request('/api/readings');
    assert.equal(historyResponse.status,200);assert.equal(historyResponse.headers.get('set-cookie'),null);
    assert.equal(existsSync(join(dir,'access-token')),false);
    const publicConfig=await (await request('/api/config')).json();
    assert.deepEqual(publicConfig.network.urls,[]);
    assert.equal(publicConfig.network.available,false);
    assert.match(publicConfig.network.reason,/仅监听本机/);
    assert.equal((await (await request('/api/methods')).json()).length,8);
    const settings=await request('/api/config',{method:'PUT',body:JSON.stringify({apiKey:'test-key-private'})});assert.equal(settings.status,200);assert.ok(!(await settings.text()).includes('test-key-private'));
    assert.ok(!(await (await request('/api/config')).text()).includes('test-key-private'));
    assert.equal((await request('/api/config',{method:'PUT',body:JSON.stringify({pricing:{hit:-1,miss:2,output:8}})})).status,400);
    assert.equal((await request('/api/readings',{method:'POST',headers:{Origin:'http://evil.invalid'},body:'{}'})).status,403);
    const badHost=await new Promise((resolve,reject)=>{const req=httpRequest(base+'/api/readings',{headers:{Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
    assert.equal(badHost,403);
    const prepared=await (await request('/api/readings',{method:'POST',body:JSON.stringify({method:'lot',input:{question:'记录测试'}})})).json();assert.equal(prepared.status,'prepared');assert.ok(prepared.createdAt);
    const completed=await (await request(`/api/readings/${prepared.id}/analyze`,{method:'POST',body:'{}'})).json();assert.equal(completed.status,'complete');
    const cached=await (await request(`/api/readings/${prepared.id}/analyze`,{method:'POST',body:'{}'})).json();assert.equal(cached.cached,true);assert.equal(calls,1);assert.equal(cached.report,completed.report);
    const history=await (await request('/api/readings?search=记录测试')).json();assert.equal(history.length,1);
    await app.close();
    const reopened=createStore(dir);assert.equal(reopened.get(prepared.id).report,completed.report);assert.equal(reopened.publicConfig().hasKey,true);assert.equal(reopened.delete(prepared.id),true);assert.equal(reopened.list().length,0);reopened.close();
  } finally {if(app.server.listening)await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('并发重复分析被拒绝，错误与中断状态可恢复',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gx-concurrent-'));let finish;
  const app=createApp({dataDir:dir,analyzeImpl:()=>new Promise(resolve=>{finish=()=>resolve({report:'已完成',usage:null,cost:null});})});
  app.store.updateConfig({apiKey:'test'});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const options={method:'POST',headers:{'Content-Type':'application/json'},body:'{}'};
  try{
    const record=await (await fetch(base+'/api/readings',{...options,body:JSON.stringify({method:'lot',input:{question:'并发'}})})).json();
    const first=fetch(base+`/api/readings/${record.id}/analyze`,options);
    while(!finish)await new Promise(resolve=>setTimeout(resolve,5));
    const second=await fetch(base+`/api/readings/${record.id}/analyze`,options);assert.equal(second.status,409);
    assert.equal((await fetch(base+`/api/readings/${record.id}`,{method:'DELETE'})).status,409);
    finish();assert.equal((await first).status,200);
    await app.close();
    const store=createStore(dir);const r=store.get(record.id);r.status='analyzing';store.save(r);store.close();
    const reopened=createStore(dir);assert.equal(reopened.get(record.id).status,'error');assert.match(reopened.get(record.id).error,/中断/);reopened.close();
  }finally{if(finish)finish();if(app.server.listening)await app.close();rmSync(dir,{recursive:true,force:true});}
});
