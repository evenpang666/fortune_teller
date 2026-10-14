import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { makeChart } from '../lib/rules.mjs';
import { METHODS } from '../lib/methods.mjs';
import { DEFAULT_CONFIG } from '../lib/store.mjs';

async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('页面状态未出现');}
function fixture({url='http://localhost:3210/#/',key=false,initialRecords=[],deleteError=false,network={available:true,urls:['http://192.168.124.62:4321'],reason:''}}={}){
  const dom=new JSDOM(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),{url,runScripts:'outside-only'});
  const w=dom.window;const saved=structuredClone(initialRecords);const requests=[];const operations=[];let settings={...DEFAULT_CONFIG,pricing:{...DEFAULT_CONFIG.pricing},apiKey:undefined,hasKey:key,network};
  w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(value){if(value!==undefined)this.returnValue=value;this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
  w.fetch=async(path,options={})=>{
    requests.push(path);
    operations.push({path,method:options.method||'GET'});
    if(path==='/api/methods')return Response.json(METHODS);
    if(path==='/api/config'){if(options.method==='PUT'){const data=JSON.parse(options.body);settings={...settings,...data,hasKey:!!data.apiKey||settings.hasKey,apiKey:undefined};}return Response.json(settings);}
    if(path==='/api/readings'&&options.method==='POST'){const body=JSON.parse(options.body);const r={...makeChart(body.method,body.input),id:randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'prepared',report:null,usage:null,cost:null};saved.unshift(r);return Response.json(r);}
    if(path==='/api/readings'||path.startsWith('/api/readings?')){const params=new URL(path,'http://localhost').searchParams;return Response.json(saved.filter(r=>(!params.get('search')||r.input.question.includes(params.get('search')))&&(!params.get('method')||r.method===params.get('method'))));}
    const match=path.match(/^\/api\/readings\/([^/]+)(\/analyze)?$/);
    if(match){const r=saved.find(r=>r.id===match[1]);if(!r)return Response.json({error:'记录不存在'},{status:404});if(options.method==='DELETE'){if(deleteError)return Response.json({error:'删除失败，请重试'},{status:500});saved.splice(saved.indexOf(r),1);return Response.json({ok:true});}if(match[2]){Object.assign(r,{status:'complete',report:'## 测试解读\n\n**观察变化**\n\n<img src="x" onerror="alert(1)">',usage:{input:100,output:50,total:150,hit:20,miss:80},cost:{amount:.00056,pricing:settings.pricing,currency:'CNY'},completedAt:new Date().toISOString(),model:'mock'});}return Response.json(r);}
    return Response.json({error:'未知测试接口'},{status:404});
  };
  w.eval(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'));
  return {w,saved,requests,operations,close:()=>dom.window.close()};
}
async function navigate(w,path,selector){w.location.hash=path;await until(()=>w.document.querySelector(selector));}
function savedReading(question){return {...makeChart('lot',{question}),id:randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'prepared',report:null,usage:null,cost:null};}

test('历史记录删除确认、取消及Esc安全，删除后列表与计数立即更新并保留筛选',async()=>{
  const target=savedReading('目标记录'),kept=savedReading('保留记录');
  const {w,saved,operations,close}=fixture({initialRecords:[target,kept]});const d=w.document;
  try{
    await until(()=>d.querySelector('.history-delete'));
    await navigate(w,'/history','#history-list');const dialog=d.querySelector('#confirm-dialog');
    d.querySelector(`[data-delete="${target.id}"]`).click();
    assert.equal(dialog.open,true);assert.equal(w.location.hash,'#/history');
    assert.equal(d.querySelector('#delete-record-context').textContent,'目标记录');
    dialog.close('cancel');assert.equal(saved.length,2);assert.equal(operations.filter(o=>o.method==='DELETE').length,0);
    d.querySelector(`[data-delete="${target.id}"]`).click();dialog.close('delete');
    await until(()=>d.querySelectorAll('#history-list .history-item').length===1);
    assert.equal(saved[0].id,kept.id);assert.equal(w.location.hash,'#/history');
    assert.equal(d.querySelector('.sidebar a[href="#/history"] .tiny').textContent,'1');
    d.querySelector(`[data-delete="${kept.id}"]`).click();dialog.close();
    assert.equal(saved.length,1);assert.equal(operations.filter(o=>o.method==='DELETE').length,1);
    const search=d.querySelector('#history-search');search.value='保留';search.dispatchEvent(new w.Event('input'));
    await until(()=>operations.some(o=>o.path.includes('search=')));
    d.querySelector(`[data-delete="${kept.id}"]`).click();dialog.close('delete');
    await until(()=>d.querySelectorAll('#history-list .history-item').length===0);
    assert.equal(saved.length,0);assert.equal(d.querySelector('#history-search').value,'保留');
    assert.match(d.querySelector('#history-list').textContent,/当前没有记录/);
  }finally{close();}
});

test('删除失败保留记录，按钮恢复可操作，分析中的记录禁止删除',async()=>{
  const target=savedReading('删除失败'),running={...savedReading('正在分析'),status:'analyzing'};
  const {w,saved,close}=fixture({initialRecords:[target,running],deleteError:true});const d=w.document;
  try{
    await until(()=>d.querySelector('.history-delete'));await navigate(w,'/history','#history-list');
    const blocked=d.querySelector(`[data-delete="${running.id}"]`);assert.equal(blocked.disabled,true);blocked.click();assert.equal(d.querySelector('#confirm-dialog').open,false);
    d.querySelector(`[data-delete="${target.id}"]`).click();d.querySelector('#confirm-dialog').close('delete');
    await until(()=>d.querySelector('#toast').textContent.includes('删除失败'));
    assert.equal(saved.length,2);assert.equal(d.querySelectorAll('#history-list .history-item').length,2);
    assert.equal(d.querySelector(`[data-delete="${target.id}"]`).disabled,false);
  }finally{close();}
});

test('旧版含访问口令的启动链接直接进入首页，不再调用登录接口',async()=>{
  const {w,requests,close}=fixture({url:'http://localhost:3210/#access=old-token'});
  try{
    await until(()=>w.document.querySelector('.method-grid'));
    assert.equal(w.location.hash,'#/');
    assert.ok(!requests.includes('/api/auth'));
  }finally{close();}
});

test('页面显示实际局域网URL，各页面保留提示且支持复制',async()=>{
  const {w,close}=fixture();const d=w.document;let copied;
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}}});
  try{
    await until(()=>d.querySelector('.lan-notice'));
    assert.equal(d.querySelector('.lan-link a').href,'http://192.168.124.62:4321/');
    assert.ok(!d.querySelector('.lan-notice').textContent.includes('10.85.'));
    d.querySelector('[data-action=copy-lan]').click();await until(()=>copied);
    assert.equal(copied,'http://192.168.124.62:4321');
    await navigate(w,'/settings','#settings-form');assert.ok(d.querySelector('.lan-link a'));
    await navigate(w,'/history','#history-list');assert.ok(d.querySelector('.lan-link a'));
  }finally{close();}
});

test('无可用局域网地址时说明原因，保持其他功能可用',async()=>{
  const {w,close}=fixture({network:{available:false,urls:[],reason:'未检测到可用的 192.168.* 局域网地址'}});
  try{
    await until(()=>w.document.querySelector('.method-grid'));
    assert.match(w.document.querySelector('.lan-notice').textContent,/未检测到/);
    assert.equal(w.document.querySelector('.lan-link a'),null);
    assert.equal(w.document.querySelectorAll('.method-card').length,8);
  }finally{close();}
});

test('局域网设备直接进入工作室，类型筛选、主题切换和设置正常',async()=>{
  const {w,requests,close}=fixture({url:'http://192.168.124.62:3210/#/'});const d=w.document;
  try{
    await until(()=>d.querySelector('.method-grid'));assert.equal(d.querySelectorAll('.method-card').length,8);
    assert.ok(!requests.includes('/api/auth'));
    assert.equal(d.querySelector('input[name=token]'),null);
    d.querySelector('[data-filter="卡牌占卜"]').click();assert.equal(d.querySelectorAll('.method-card').length,2);
    await navigate(w,'/method/tarot','#reading-form');const question=d.querySelector('[name=question]');question.value='如何探索？';d.querySelector('[data-action=theme]').click();assert.equal(d.documentElement.dataset.theme,'dark');assert.equal(d.querySelector('[name=question]').value,'如何探索？');
    await navigate(w,'/settings','#settings-form');d.querySelector('[name=model]').value='deepseek-v4-pro';d.querySelector('[name=model]').dispatchEvent(new w.Event('change'));assert.equal(d.querySelector('[name=output]').value,'27');
    d.querySelector('[name=apiKey]').value='mock-key';d.querySelector('#settings-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>d.querySelector('.pill')?.textContent.includes('已连接'));assert.equal(d.querySelector('[name=apiKey]').value,'');
  }finally{close();}
});

test('八个子界面可以提交、呈现专属盘面并进入历史记录',async()=>{
  const {w,saved,close}=fixture();const d=w.document;
  try{
    await until(()=>d.querySelector('.method-grid'));
    for(const m of METHODS){
      await navigate(w,'/method/'+m.id,`#reading-form[data-method="${m.id}"]`);
      const form=d.querySelector('#reading-form');
      for(const [name,value] of Object.entries({date:'2000-08-16',time:'03:30',question:'面对变化',surname:'王',given:'知远',surnameStrokes:'4',givenStrokes:'8,17'}))if(form.elements[name])form.elements[name].value=value;
      form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
      await until(()=>d.querySelector('#result-area .record-head'));
      assert.ok(d.querySelector('#result-area').textContent.includes('计算依据'));
      assert.ok(d.querySelector('#result-area').textContent.includes('先连接 DeepSeek'));
      assert.ok(saved.some(r=>r.method===m.id));
    }
    await navigate(w,'/history','#history-list');assert.equal(d.querySelectorAll('.history-item').length,8);
  }finally{close();}
});

test('解读与费用小字显示，模型内容不会作为HTML脚本执行',async()=>{
  const {w,close}=fixture({key:true});const d=w.document;
  try{
    await until(()=>d.querySelector('.method-grid'));await navigate(w,'/method/tarot','#reading-form');
    d.querySelector('[name=question]').value='<script>malicious()</script>';
    d.querySelector('#reading-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>d.querySelector('[data-analyze]'));d.querySelector('[data-analyze]').click();await until(()=>d.querySelector('.usage-line'));
    assert.match(d.querySelector('.usage-line').textContent,/合计 150 tokens/);assert.match(d.querySelector('.usage-line').textContent,/¥0.000560/);
    assert.equal(d.querySelector('.report img'),null);assert.equal(d.querySelector('.question-quote script'),null);assert.match(d.querySelector('.report').textContent,/<img/);
  }finally{close();}
});
