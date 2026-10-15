import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { makeChart, lookupNameStrokes } from '../lib/rules.mjs';
import { METHODS } from '../lib/methods.mjs';
import { DEFAULT_CONFIG } from '../lib/store.mjs';
import { dailyFortune } from '../lib/daily.mjs';

async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}throw new Error('页面状态未出现');}
function fixture({url='http://localhost:3210/#/',key=false,initialRecords=[],deleteError=false,lookupImpl=lookupNameStrokes,dailyImpl=dailyFortune,network={available:true,urls:['http://192.168.124.62:4321'],reason:''}}={}){
  const dom=new JSDOM(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),{url,runScripts:'outside-only'});
  const w=dom.window;const saved=structuredClone(initialRecords);const requests=[];const operations=[];let settings={...DEFAULT_CONFIG,pricing:{...DEFAULT_CONFIG.pricing},apiKey:undefined,hasKey:key,network};
  w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(value){if(value!==undefined)this.returnValue=value;this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
  w.fetch=async(path,options={})=>{
    requests.push(path);
    operations.push({path,method:options.method||'GET'});
    if(path==='/api/daily')return Response.json(await dailyImpl());
    if(path==='/styles.css')return new Response(readFileSync(new URL('../public/styles.css',import.meta.url),'utf8'));
    if(path==='/api/name-strokes')return Response.json(await lookupImpl(JSON.parse(options.body)));
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

test('今日运势点击后加载，收起和再次展开复用当天结果',async()=>{
  const {w,requests,close}=fixture();const d=w.document;
  try{
    await until(()=>d.querySelector('.daily-card'));
    assert.equal(requests.includes('/api/daily'),false);assert.equal(d.querySelector('#daily-content').hidden,true);
    d.querySelector('[data-action="daily"]').click();await until(()=>d.querySelector('.daily-assessment'));
    assert.match(d.querySelector('.daily-calendar').textContent,/宜/);assert.match(d.querySelector('.daily-calendar').textContent,/忌/);
    assert.equal(d.querySelector('[data-action="daily"]').getAttribute('aria-expanded'),'true');
    d.querySelector('[data-action="daily"]').click();assert.equal(d.querySelector('#daily-content').hidden,true);
    d.querySelector('[data-action="daily"]').click();await until(()=>d.querySelector('.daily-assessment'));
    assert.equal(requests.filter(p=>p==='/api/daily').length,1);
    assert.equal(requests.some(p=>p.includes('/analyze')),false);
  }finally{close();}
});

test('今日运势读取失败可重试，离开主页后返回结果不会打断导航',async()=>{
  let fail=true,resolve;
  const {w,close}=fixture({dailyImpl:()=>fail?Promise.reject(new Error('黄历暂时不可用')):new Promise(r=>{resolve=r;})});const d=w.document;
  try{
    await until(()=>d.querySelector('.daily-card'));d.querySelector('[data-action="daily"]').click();
    await until(()=>d.querySelector('#daily-content .error-box'));assert.equal(d.querySelector('[data-action="daily"]').disabled,false);
    fail=false;d.querySelector('[data-action="daily"]').click();await until(()=>resolve);
    await navigate(w,'/history','#history-list');resolve(dailyFortune());
    await new Promise(r=>setTimeout(r,10));assert.ok(d.querySelector('#history-list'));
    await navigate(w,'/','.daily-assessment');assert.equal(d.querySelector('#daily-content .error-box'),null);
  }finally{close();}
});

test('旧解读隐藏摘要与局限，保留相关解读与实践建议',async()=>{
  const r={...savedReading('精简解读'),status:'complete',report:'## 一、盘面摘要\n\n摘要内容\n\n### 次级摘要\n\n摘要细节\n\n## 二、与问题相关的解读\n\n关键解读内容\n\n## 三、具体可实践的建议\n\n- 保留这条建议\n\n## 四、规则与局限\n\n局限内容'};
  const {w,close}=fixture({initialRecords:[r],url:'http://localhost:3210/#/record/'+r.id});
  try{
    await until(()=>w.document.querySelector('.report'));
    const text=w.document.querySelector('.report').textContent;
    assert.match(text,/关键解读内容/);assert.match(text,/保留这条建议/);assert.doesNotMatch(text,/摘要|局限/);
    assert.equal(w.document.querySelector('[data-export]'),null);assert.ok(w.document.querySelector('[data-share]'));
    // Older model responses also used bold, numbered section titles.
    assert.equal(w.focusedReport('**1. 盘面摘要**\n\n删除\n\n**2. 关键信息解读**\n\n保留\n\n**3. 规则与局限**\n\n删除'),'**2. 关键信息解读**\n\n保留');
  }finally{close();}
});

test('分享生成含盘面与解读的独立HTML，并复制局域网记录链接',async()=>{
  const r={...savedReading('<img src=x onerror=alert(1)>'),status:'complete',report:'## 盘面摘要\n\n删除摘要\n\n## 关键信息解读\n\n保留解读<script>alert(1)</script>\n\n## 实践建议\n\n- 完成一件小事\n\n## 规则与局限\n\n删除局限'};
  const {w,close}=fixture({initialRecords:[r],url:'http://localhost:3210/#/record/'+r.id});const d=w.document;
  let blob,download,copied;w.Blob=Blob;w.URL.createObjectURL=value=>{blob=value;return 'blob:share';};w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){download=this.download;};
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});
  try{
    await until(()=>d.querySelector('[data-share]'));const opener=d.querySelector('[data-share]');opener.focus();opener.click();
    assert.equal(d.querySelector('#share-dialog').open,true);assert.equal(d.querySelector('#share-record-title img'),null);
    d.querySelector('[data-action="copy-share"]').click();await until(()=>copied);assert.equal(copied,'http://192.168.124.62:4321/#/record/'+r.id);
    d.querySelector('[data-action="save-share"]').click();await until(()=>blob);
    assert.match(download,/\.html$/);assert.equal(blob.type,'text/html;charset=utf-8');
    const html=await blob.text(),snapshot=new JSDOM(html),page=snapshot.window.document;
    assert.ok(page.querySelector('style').textContent.includes('.shared-wrap'));assert.ok(page.querySelector('.lot-result'));
    assert.match(page.querySelector('.report').textContent,/保留解读/);assert.match(page.querySelector('.report').textContent,/完成一件小事/);
    assert.doesNotMatch(page.body.textContent,/删除摘要|删除局限/);assert.equal(page.querySelector('script,img,link,button,input,[data-share]'),null);
    assert.equal(page.querySelector('meta[http-equiv]').content.includes("default-src 'none'"),true);snapshot.window.close();
    d.querySelector('[data-action="close-share"]').click();assert.equal(d.querySelector('#share-dialog').open,false);assert.equal(d.activeElement,opener);
    await navigate(w,'/history','#history-list');assert.equal(d.querySelector('[data-action="export-all"]'),null);
  }finally{close();}
});

test('姓名输入后自动显示康熙笔画，无需手填即可提交并缓存来源',async()=>{
  const {w,saved,close}=fixture();const d=w.document;
  try{
    await until(()=>d.querySelector('.method-grid'));await navigate(w,'/method/name','#reading-form');const form=d.querySelector('#reading-form');
    form.elements.surname.value='王';form.elements.given.value='知远';form.elements.given.dispatchEvent(new w.Event('input'));
    await until(()=>form.elements.givenStrokes.value==='8, 17');
    assert.equal(form.elements.surnameStrokes.value,'4');assert.equal(form.elements.givenStrokes.readOnly,true);
    assert.match(d.querySelector('#name-stroke-status').textContent,/远 → 遠：17 画/);
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>d.querySelector('.record-head'));
    assert.deepEqual(saved[0].chart.strokes,[4,8,17]);assert.equal(saved[0].input.strokeMode,'auto');assert.match(saved[0].chart.strokeSource,/离线字典/);
  }finally{close();}
});

test('姓名查询未收录时提示手动核实，手动调整可正常提交',async()=>{
  const {w,saved,close}=fixture();const d=w.document;
  try{
    await until(()=>d.querySelector('.method-grid'));await navigate(w,'/method/name','#reading-form');const form=d.querySelector('#reading-form');
    form.elements.surname.value='王';form.elements.given.value='𠮷';d.querySelector('#name-stroke-refresh').click();
    await until(()=>form.elements.givenStrokes.value==='?');assert.match(d.querySelector('#name-stroke-status').textContent,/待核实/);
    form.elements.manualStrokes.checked=true;form.elements.manualStrokes.dispatchEvent(new w.Event('change'));
    assert.equal(form.elements.givenStrokes.readOnly,false);form.elements.givenStrokes.value='6';
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>d.querySelector('.record-head'));
    assert.deepEqual(saved[0].chart.strokes,[4,6]);assert.equal(saved[0].input.strokeMode,'manual');
  }finally{close();}
});

test('姓名修改后旧查询不能覆盖新结果，查询返回时不会覆盖手动调整',async()=>{
  const pending=[];const {w,close}=fixture({lookupImpl:input=>new Promise(resolve=>pending.push({input,resolve}))});const d=w.document;
  try{
    await until(()=>d.querySelector('.method-grid'));await navigate(w,'/method/name','#reading-form');const form=d.querySelector('#reading-form');
    form.elements.surname.value='王';form.elements.given.value='知远';d.querySelector('#name-stroke-refresh').click();
    form.elements.given.value='清';form.elements.given.dispatchEvent(new w.Event('input'));d.querySelector('#name-stroke-refresh').click();
    pending[1].resolve(lookupNameStrokes(pending[1].input));await until(()=>form.elements.givenStrokes.value==='12');
    pending[0].resolve(lookupNameStrokes(pending[0].input));await new Promise(resolve=>setTimeout(resolve,10));assert.equal(form.elements.givenStrokes.value,'12');
    d.querySelector('#name-stroke-refresh').click();form.elements.manualStrokes.checked=true;form.elements.manualStrokes.dispatchEvent(new w.Event('change'));form.elements.givenStrokes.value='18';
    pending[2].resolve(lookupNameStrokes(pending[2].input));await until(()=>d.querySelector('#name-stroke-status').textContent.includes('已查询到全部'));
    assert.equal(form.elements.givenStrokes.value,'18');
  }finally{close();}
});

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
