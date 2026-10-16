import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { SkillService } from '@deepseek-ai/dsh-skill';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import * as plugin from '../index.mjs';

test('Cordis 插件复用宿主监听与生成服务，继承认证，卸载清理路由和 Skill',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gx-plugin-'));const ctx=new Context();let handler,calls=0;
  const server=createServer((req,res)=>handler?handler(req,res):(res.writeHead(404),res.end()));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/fortuneteller`;
  const auth={headers:{Cookie:'dsh-test=valid'}};
  try{
    ctx.provide('webServer',{port:server.address().port,register(route){assert.equal(route.path,'/fortuneteller');handler=route.handler;return ()=>{handler=null;};}});
    ctx.provide('connection',{
      authenticatedUrl:base=>base+'?token=test-browser-token',
      requestRejection(req){return req.headers.cookie==='dsh-test=valid'?undefined:401;},
      authorizeIndex(req,res){assert.match(req.url,/^\//);if(req.url==='/?token=test-browser-token'){res.writeHead(303,{'set-cookie':'dsh-test=valid; HttpOnly',location:'./'});res.end();return false;}if(req.headers.cookie==='dsh-test=valid')return true;res.writeHead(401);res.end('DSH 登录');return false;},
    });
    ctx.provide('agentDefaultModel',{currentSelection:()=>({provider:'deepseek-official',model:'deepseek-flash'})});
    ctx.provide('llm',{listProviders:()=>[{id:'deepseek-official'}],async *stream(options){calls++;assert.equal(options.model,'deepseek-flash');assert.match(options.system,/体系专属 Skill/);assert.equal(options.messages[0].content[0].type,'text');yield {type:'text-delta',text:'## 关键信息解读\n宿主生成的解读'};yield {type:'usage',usage:{inputTokens:20,cacheReadTokens:10,outputTokens:8}};yield {type:'finish',reason:{kind:'stop'}};}});
    await ctx.plugin(SkillService);
    const fiber=ctx.plugin(plugin,{dataDir:dir,port:0});await fiber;
    assert.equal((await ctx.skills.list()).length,8);
    assert.match((await ctx.skills.get('fortune-bazi')).content,/立春/);
    assert.equal((await fetch(base+'/api/readings')).status,401);
    assert.equal((await fetch(base+'/')).status,401);
    assert.equal((await fetch(base+'/health')).status,200);
    const login=await fetch(base+'/?token=test-browser-token',{redirect:'manual'});assert.equal(login.status,303);assert.equal(login.headers.get('location'),'/fortuneteller/');assert.match(login.headers.get('set-cookie'),/dsh-test=valid/);
    assert.equal((await fetch(base+'/?token=invalid',{redirect:'manual'})).status,401);
    const html=await (await fetch(base+'/',auth)).text();assert.match(html,/src="\/fortuneteller\/app.js"/);
    const settings=await(await fetch(base+'/api/config',auth)).json();assert.equal(settings.generation,'dsh');assert.equal(settings.keyManagedBy,'dsh');assert.equal(settings.hasKey,true);assert.equal(settings.apiKey,undefined);
    assert.ok(Array.isArray(settings.network.urls));
    for(const url of settings.network.urls){const target=new URL(url);assert.notEqual(target.port,String(server.address().port));assert.equal(target.pathname,'/');assert.equal(target.search,'');assert.equal(target.hash,'');}
    assert.notEqual(settings.network.reason,'访问范围与认证由 DSH Web 管理');
    const health=await (await fetch(base+'/health')).json();
    const independent=health.url.replace(/\/$/,'');
    assert.notEqual(new URL(independent).port,String(server.address().port));
    assert.equal((await fetch(independent+'/')).status,200);
    assert.equal((await fetch(independent+'/api/config')).status,200);
    assert.equal((await fetch(independent+'/',auth)).status,200);
    assert.equal((await fetch(independent+'/app.js',auth)).status,200);
    assert.equal((await fetch(independent+'/api/config',auth)).status,200);
    assert.equal((await fetch(independent+'/api/config',{headers:{...auth.headers,Origin:'https://evil.example'}})).status,403);
    assert.equal((await fetch(base+'/api/config',{method:'PUT',headers:{...auth.headers,'Content-Type':'application/json'},body:JSON.stringify({apiKey:'cannot-save'})})).status,400);
    const record=await(await fetch(base+'/api/readings',{method:'POST',headers:{...auth.headers,'Content-Type':'application/json'},body:JSON.stringify({method:'lot',input:{question:'宿主生成'}})})).json();
    const generated=await(await fetch(base+`/api/readings/${record.id}/analyze`,{method:'POST',...auth})).json();
    assert.equal(generated.status,'complete');assert.equal(generated.usage.input,30);assert.equal(generated.usage.total,38);assert.match(generated.report,/宿主生成/);
    const cached=await(await fetch(base+`/api/readings/${record.id}/analyze`,{method:'POST',...auth})).json();assert.equal(cached.cached,true);assert.equal(calls,1);
    await fiber.dispose();assert.equal((await ctx.skills.list()).length,0);assert.equal(handler,null);assert.equal(server.listening,true);
  }finally{await ctx.fiber.dispose();await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
