const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const dateLabel = value => new Date(value).toLocaleString('zh-CN',{hour12:false});
let methods=[], records=[], config={}, filter='全部', busy=new Set(), deleting=new Set(), toastTimer, lastFocus;
const theme=localStorage.getItem('gx-theme') || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
document.documentElement.dataset.theme=theme;

async function api(path,options={}) {
  const response=await fetch('/api'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  const data=await response.json();if(!response.ok){const error=new Error(data.error||'请求失败');error.status=response.status;throw error;}return data;
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function route(){return location.hash.replace(/^#/,'')||'/';}
function methodIcon(m){return `<span class="method-icon ${m.color}">${escapeHTML(m.icon)}</span>`;}
function lanNotice() {
  const network=config.network;if(!network)return '';
  const content=network.available?`<div class="lan-links">${network.urls.map(url=>`<div class="lan-link"><a href="${escapeHTML(url)}" target="_blank" rel="noreferrer">${escapeHTML(url)}</a><button type="button" class="button secondary" data-action="copy-lan" data-url="${escapeHTML(url)}" aria-label="复制局域网访问地址">复制地址</button></div>`).join('')}</div><p>其他设备连接同一局域网后，打开此地址即可使用，无需登录。</p>`:`<p>${escapeHTML(network.reason)}。</p>`;
  return `<aside class="lan-notice" aria-label="局域网访问"><div class="lan-notice-label"><span aria-hidden="true">↗</span><strong>局域网访问</strong></div><div class="lan-notice-content">${content}</div></aside>`;
}
async function copyLanUrl(url) {
  let copied=false;
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);copied=true;}}catch{}
  if(!copied){
    const focused=document.activeElement;const text=document.createElement('textarea');text.value=url;text.readOnly=true;text.className='clipboard-target';document.body.append(text);text.select();
    try{copied=Boolean(document.execCommand?.('copy'));}catch{}
    finally{text.remove();focused?.focus();}
  }
  toast(copied?'局域网地址已复制':'请长按或选中页面上的地址复制');
}
function shell(content,title='探索',active='home') {
  $('#app').innerHTML=`<div class="menu-scrim" data-action="menu"></div><aside class="sidebar"><a class="brand" href="#/"><img src="/icon.svg" alt=""><div><strong>观象</strong><small>GUANXIANG · AI STUDIO</small></div></a><nav aria-label="主导航"><div class="nav-group"><p class="nav-label">你的探索空间</p><a href="#/" class="nav-item ${active==='home'?'active':''}"><span class="nav-icon">◈</span>探索</a><a href="#/history" class="nav-item ${active==='history'?'active':''}"><span class="nav-icon">◷</span>历史记录<span class="tiny">${records.length||''}</span></a></div><div class="nav-group"><p class="nav-label">命理与占卜</p>${methods.map(m=>`<a href="#/method/${m.id}" class="nav-item ${active===m.id?'active':''}"><span class="nav-icon">${escapeHTML(m.icon)}</span>${m.name}</a>`).join('')}</div></nav><div class="sidebar-bottom"><a href="#/settings" class="nav-item ${active==='settings'?'active':''}"><span class="nav-icon">⚙</span>设置与连接</a><div class="side-note"><span class="status-dot"></span>本地工作室<br><span>让好奇有方向，让生活有回响。</span></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-action="menu" aria-label="展开导航">☰</button><span>我的工作室</span><span>/</span><b>${escapeHTML(title)}</b></div><div class="top-actions"><a class="pill" href="#/settings"><span class="status-dot"></span>${config.hasKey?'DeepSeek 已连接':'待配置 DeepSeek'}</a><button class="icon-button" data-action="theme" aria-label="切换浅色或深色主题">${document.documentElement.dataset.theme==='dark'?'☀':'☾'}</button></div></header><div class="content">${lanNotice()}${content}<footer class="footer"><span>观象 · 以传统文化与 AI，探索更多可能</span><span>文化探索与自我反思参考 · 解读不代表确定的未来</span></footer></div></main>`;
}
function item(r) {
  const m=methods.find(m=>m.id===r.method);const state={prepared:'已排盘',complete:'已解读',analyzing:'解读中',error:'待重试'}[r.status];
  const disabled=busy.has(r.id)||deleting.has(r.id)||r.status==='analyzing';
  return `<div class="history-item" data-record-id="${r.id}"><a class="history-open" href="#/record/${r.id}">${methodIcon(m)}<div class="history-text"><h3>${escapeHTML(r.input.question||r.chart.title)}</h3><p>${m.name} · ${dateLabel(r.createdAt)}</p></div><div class="history-status">${state}<br>${r.cost?`约 ¥${r.cost.amount.toFixed(5)}`:'本地记录'}</div><span class="muted">↗</span></a><button type="button" class="history-delete" data-delete="${r.id}" aria-label="删除${escapeHTML(m.name)}记录：${escapeHTML(r.input.question||r.chart.title)}" ${disabled?'disabled':''} ${r.status==='analyzing'?'title="分析完成后可删除"':''}>${deleting.has(r.id)?'删除中…':'删除'}</button></div>`;
}
function renderHome() {
  const shown=methods.filter(m=>filter==='全部'||m.category===filter);
  const now=new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});
  shell(`<div class="welcome"><p>给自己一点时间，听听内心的声音。</p><span>${now}</span></div><section class="hero"><div class="hero-copy"><div class="eyebrow">A MOMENT OF CLARITY</div><h1 class="hero-title">观天地，<em>照见自己。</em></h1><p>古老的智慧，遇见新的视角。<br>从八字到塔罗，以 AI 为伴，探索属于你的人生叙事。</p><div class="hero-meta"><span>✧ 八种探索方式</span><span>◷ 本地历史留存</span><span>↗ DeepSeek 驱动</span></div></div><div class="cosmos" aria-hidden="true"><div class="orbit one"></div><div class="orbit two"></div><div class="orbit three"></div><div class="cosmos-center">☯</div><span class="star s1">✦</span><span class="star s2">✧</span><span class="star s3">✧</span><span class="orbit-label l1">观 · 象</span><span class="orbit-label l2">知 · 己</span></div></section><div class="section-head"><div><h2 class="serif">选择一种方式，开始探索</h2><p>每一种传统，都是认识自己的另一扇窗。</p></div><div class="filters" aria-label="按类型筛选">${['全部','东方命理','西方占星','卡牌占卜'].map(v=>`<button class="filter ${filter===v?'active':''}" data-filter="${v}" aria-pressed="${filter===v}">${v}</button>`).join('')}</div></div><section class="method-grid" aria-label="命理方式">${shown.map(m=>`<a class="method-card" href="#/method/${m.id}"><div class="card-top">${methodIcon(m)}<span class="card-category">${m.category}</span></div><h3 class="method-name">${m.name}</h3><span class="method-en">${m.en}</span><p class="card-desc">${m.description}</p><div class="card-bottom"><span>开启${m.name}探索</span><span>↗</span></div></a>`).join('')}</section><div class="section-head recent-head"><div><h2 class="serif">最近的探索</h2><p>每一次驻足，都值得被记住。</p></div><a class="text-link" href="#/history">全部记录 →</a></div><div class="recent-box">${records.length?records.slice(0,3).map(item).join(''):'<div class="empty"><span class="empty-icon">◷</span><span>故事，从你的第一次探索开始。</span><span class="tiny">生成的盘面与解读会自动留存在这里</span></div>'}</div>`);
}
function field(name,label,type='text',extra='',hint='') {return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" ${extra}>${hint?`<small>${hint}</small>`:''}</label>`;}
function birthFields(m){return `<div class="form-row">${field('date','公历出生日期','date','required min="1900-01-01" max="2100-12-31"')}${field('time','出生时间','time','required')}</div>${m.id==='zodiac'?field('offset','出生地 UTC 时差','number','value="8" min="-12" max="14" step="0.25" required','例如中国为 +8；夏令时请填当时实际时差。'):`<label class="field"><span>传统排盘性别</span><select name="gender"><option>女</option><option>男</option></select><small>仅用于传统排盘与大运顺逆计算。</small></label><p class="tiny">填写北京时间（UTC+8）；海外出生请先换算。当前采用钟表时间，未校正真太阳时。</p>`}`;}
function formFields(m) {
  let html='';
  if(['bazi','zodiac','ziwei'].includes(m.id))html+=birthFields(m);
  if(m.id==='bazi')html+='<label class="field"><span>子时换日规则</span><select name="sect"><option value="2">午夜 00:00 换日（晚子时日柱不换）</option><option value="1">晚子时 23:00 换日</option></select></label>';
  if(m.id==='ziwei')html+='<label class="check-row"><input name="fixLeap" type="checkbox" checked>闰月按半月规则调整</label>';
  if(m.id==='tarot')html+='<label class="field"><span>选择牌阵</span><select name="spread"><option value="three">三张牌 · 过去 / 现在 / 未来趋势</option><option value="single">单张牌 · 当下的启示</option><option value="decision">选择牌阵 · A / B / 需要留意</option></select></label><label class="check-row"><input name="reversals" type="checkbox" checked>启用正逆位</label>';
  if(m.id==='name')html+=`<div class="form-row">${field('surname','姓氏','text','required maxlength="2" placeholder="例如：王 / 欧阳"')}${field('given','名字','text','required maxlength="2" placeholder="例如：知远"')}</div>${field('surnameStrokes','姓氏康熙笔画','text','required placeholder="例如：4；复姓：15, 17"','按字序填写，用英文逗号分隔。')}${field('givenStrokes','名字康熙笔画','text','required placeholder="例如：8, 17"','请按《康熙字典》核实；简体常用笔画不能替代。')}`;
  if(m.id==='poker')html+='<div class="tag-list"><span>♥ 情感与关系</span><span>♦ 资源与事务</span><span>♣ 行动与成长</span><span>♠ 挑战与边界</span></div>';
  if(m.id==='iching')html+='<p class="tiny">程序依次投掷三枚铜钱六次，保留每次点数。初爻在下，上爻在上；6 与 9 为变爻。</p>';
  if(m.id==='lot')html+='<p class="tiny">以六十四卦为签目，静心后等概率抽取一签。此签库为易经卦签，未使用或声称属于任何寺庙签谱。</p>';
  html+=`<label class="field"><span>${['tarot','poker','iching','lot'].includes(m.id)?'此刻，你想探索什么？':'想重点探索的方向（选填）'}</span><textarea name="question" maxlength="1000" placeholder="例如：如何更好地面对工作中的新变化？" ${['tarot','poker','iching','lot'].includes(m.id)?'required':''}></textarea></label>`;
  return html;
}
function renderMethod(id) {
  const m=methods.find(m=>m.id===id);if(!m){location.hash='/';return;}
  shell(`<a href="#/" class="back-link">← 返回探索</a><div class="page-intro">${methodIcon(m)}<div><h1>${m.name}</h1><p>${m.description}</p></div></div><div class="workspace"><section class="panel"><h2>准备你的${m.name==='塔罗'||m.name==='扑克'?'问题':'信息'}</h2><form id="reading-form" data-method="${m.id}">${formFields(m)}<button class="button full" type="submit">${m.action} <span>→</span></button><p class="busy-note">本地计算，不消耗 AI tokens</p></form><div class="rule-note"><strong>本次采用的规则</strong><br>${m.rule}</div><details class="details"><summary>关于这一体系</summary><p>不同传承可能采用不同规则，本工作室明确采用上述体系。传统解读供文化探索与自我反思参考。原始计算数据可在结果中查看和导出。</p></details></section><section class="panel" id="result-area"><div class="preview-empty"><div class="preview-symbol">${m.icon}</div><h3>从一个问题，一份好奇开始。</h3><p>填写左侧信息，生成你的盘面。<br>再让 DeepSeek 为它带来新的解读。</p><span class="tiny">生成结果会自动保存到历史记录</span></div></section></div>`,m.name,m.id);
  $('#reading-form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;const submit=form.querySelector('button[type=submit]');submit.disabled=true;submit.innerHTML='<span class="spinner"></span>正在生成…';
    const data=Object.fromEntries(new FormData(form));
    for(const name of ['offset','sect'])if(data[name]!==undefined)data[name]=Number(data[name]);
    for(const name of ['reversals','fixLeap'])if(form.elements[name])data[name]=form.elements[name].checked;
    for(const name of ['surnameStrokes','givenStrokes'])if(data[name]!==undefined)data[name]=data[name].split(/[,，\s]+/).filter(Boolean).map(Number);
    try{const record=await api('/readings',{method:'POST',body:JSON.stringify({method:m.id,input:data})});records.unshift(record);location.hash='/record/'+record.id;}
    catch(error){toast(error.message);submit.disabled=false;submit.textContent=m.action+' →';}
  });
}
function hexView(hex,lines,moving=[]) {return `<div><div class="hex-title">${hex.name} ${hex.symbol}</div><div class="hex-lines">${hex.bits.map((bit,i)=>`<div class="hex-line ${moving.includes(i+1)?'moving':''}"><div class="bar ${bit?'':'broken'}"></div><small>${lines?lines[i].value:i+1}${moving.includes(i+1)?' ◦':''}</small></div>`).join('')}</div><div class="tiny">${hex.upper.image}上 · ${hex.lower.image}下 · 第 ${hex.number} 卦</div></div>`;}
function chartView(r) {
  const c=r.chart;
  if(r.method==='bazi')return `<div class="chart-grid">${c.pillars.map(p=>`<div class="pillar">${p.label}<b>${p.ganzhi}</b><span>${p.wuxing}</span><span>${p.stemGod}</span><span>${p.nayin}</span></div>`).join('')}</div><p class="chart-meta">日主 ${c.dayMaster} · ${escapeHTML(c.lunar)}<br>起运日期 ${c.startLuck} · ${c.clock}</p><div class="tag-list">${c.luck.map(l=>`<span>${l.ganzhi} ${l.startAge}–${l.endAge}岁</span>`).join('')}</div>`;
  if(r.method==='zodiac')return `<div class="planet-list">${c.planets.map(p=>`<div class="planet-row"><span>${p.name}</span><span>${p.sign} ${p.degree.toFixed(2)}°</span></div>`).join('')}</div><div class="tag-list">${c.aspects.map(a=>`<span>${a.a} ${a.name} ${a.b} · ${a.orb.toFixed(1)}°</span>`).join('')}</div><p class="chart-meta">${c.system}</p>`;
  if(['tarot','poker'].includes(r.method))return `<div class="cards">${c.cards.map((card,i)=>`<div class="drawn-card ${r.method==='poker'?'playing':''}"><div class="card-face"><span class="tiny">${r.method==='tarot'?(card.arcana==='大阿尔卡那'?'MAJOR ARCANA':'MINOR ARCANA'):'CARTOMANCY'}</span><span class="art ${['♥','♦'].includes(card.suit)?'red-suit':''}">${r.method==='poker'?card.name:['☽','✧','☀'][i%3]}</span><strong>${escapeHTML(card.name)}</strong><small>${r.method==='tarot'?(card.reversed?'逆位':'正位'):escapeHTML(card.meaning)}</small></div><p>${card.position}</p></div>`).join('')}</div>`;
  if(r.method==='iching')return `<div class="hex-pair">${hexView(c.original,c.lines,c.moving)}${hexView(c.changed)}</div><p class="chart-meta">本卦 → 变卦 · ${c.moving.length?`变爻：第 ${c.moving.join('、')} 爻`:'无变爻'} · 铜钱原始值自下而上：${c.lines.map(l=>l.value).join(' / ')}</p>`;
  if(r.method==='name')return `<div class="number-grids">${Object.entries(c.grids).map(([name,n])=>`<div class="number-grid"><span>${name}</span><strong>${n}</strong><span>${c.elements[name]}</span></div>`).join('')}</div><p class="chart-meta">三才 ${c.threeTalents}<br>${escapeHTML(c.characters.map((char,i)=>char+' '+c.strokes[i]+' 画').join(' · '))}<br>${c.strokeSource}</p>`;
  if(r.method==='ziwei')return `<div class="ziwei-grid">${c.palaces.map(p=>`<div class="palace"><strong>${escapeHTML(p.name)}${p.isBodyPalace?' · 身宫':''}</strong><span class="muted"> ${p.heavenlyStem}${p.earthlyBranch}</span><p>${escapeHTML(p.majorStars.map(s=>s.name+(s.brightness?'('+s.brightness+')':'')+(s.mutagen?'·'+s.mutagen:'')).join('、')||'无主星')}</p><p>${escapeHTML(p.minorStars.map(s=>s.name+(s.mutagen?'·'+s.mutagen:'')).join('、'))}</p></div>`).join('')}</div><p class="chart-meta">${escapeHTML(c.lunarDate)} · ${escapeHTML(c.time)} · ${c.clock}</p>`;
  return `<div class="lot-result"><div class="eyebrow">ORACLE OF THE MOMENT</div><div class="lot-sign">${c.hexagram.symbol}</div><h3>${c.hexagram.name}</h3><div class="tiny">第 ${c.number} 签 · ${c.hexagram.upper.image}上${c.hexagram.lower.image}下</div><p class="chart-meta">${escapeHTML(c.system)}</p></div>`;
}
function markdown(text) {
  const blocks=escapeHTML(text).split(/\n\s*\n/);return blocks.map(block=>{
    const lines=block.split('\n');
    if(lines.every(l=>/^\s*[-*]\s/.test(l)))return '<ul>'+lines.map(l=>'<li>'+l.replace(/^\s*[-*]\s/,'')+'</li>').join('')+'</ul>';
    if(lines.every(l=>/^\s*\d+[.)]\s/.test(l)))return '<ol>'+lines.map(l=>'<li>'+l.replace(/^\s*\d+[.)]\s/,'')+'</li>').join('')+'</ol>';
    return lines.map(l=>/^#{1,6}\s/.test(l)?'<h3>'+l.replace(/^#{1,6}\s/,'')+'</h3>':'<p>'+l+'</p>').join('');
  }).join('').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
}
function usageView(r){if(!r.report)return '';const u=r.usage,c=r.cost;return `<div class="usage-line">${u?`输入 ${u.input.toLocaleString()} tokens（缓存命中 ${u.hit.toLocaleString()}） · 输出 ${u.output.toLocaleString()} · 合计 ${u.total.toLocaleString()} tokens`:'服务未返回 token 用量，无法估算费用'}${c?`<br>本次估算 ¥${c.amount.toFixed(6)} · ${escapeHTML(c.pricing.label)}<br>单价（每百万 tokens）：缓存命中 ¥${c.pricing.hit} / 未命中 ¥${c.pricing.miss} / 输出 ¥${c.pricing.output}`:''}<br>${escapeHTML(r.model||'DeepSeek')} · ${dateLabel(r.completedAt||r.updatedAt)} · 历史结果读取不再次计费</div>`;}
function recordContent(r) {
  const m=methods.find(m=>m.id===r.method);const loading=busy.has(r.id)||r.status==='analyzing';
  return `<div class="record-head"><div><div class="eyebrow">${m.en}</div><h2 class="serif">${escapeHTML(r.chart.title)}</h2><p>${dateLabel(r.createdAt)} · 规则 v${r.ruleVersion}</p></div><button class="icon-button" data-export="${r.id}" aria-label="导出记录">↓</button></div>${chartView(r)}${r.input.question?`<div class="question-quote">${escapeHTML(r.input.question)}</div>`:''}<div class="rule-note"><strong>计算依据</strong><br>${escapeHTML(r.rules)}</div><div class="report-box">${r.report?`<div class="eyebrow">DEEPSEEK · 你的解读</div>${r.truncated?'<div class="error-box">输出达到上限，以下解读可能不完整。</div>':''}<article class="report">${markdown(r.report)}</article>${usageView(r)}`:loading?'<div class="progress" role="status"><span class="spinner"></span>DeepSeek 正在解读这份盘面<p class="tiny">通常需要几十秒。你可以离开此页，结果会自动保存。</p></div>':`${r.error?`<div class="error-box">${escapeHTML(r.error)}<br><span class="tiny">失败或中断的请求可能已产生费用，本地无法取得该次用量。</span></div>`:''}<h3>让盘面，有一个新的视角。</h3><p class="muted">DeepSeek 将根据这份已保存的盘面，结合你的问题给出解读。</p>${config.hasKey?`<button class="button full" data-analyze="${r.id}">✧ ${r.status==='error'?'重试 DeepSeek 解读':'开始 DeepSeek 解读'}</button><p class="busy-note">解读将调用 DeepSeek API 并产生 token 费用</p>`:'<a class="button full" href="#/settings">先连接 DeepSeek →</a><p class="busy-note">盘面已保存在历史记录中，配置后可回来解读</p>'}`}</div><details class="details"><summary>查看完整排盘与抽取数据</summary><pre>${escapeHTML(JSON.stringify(r.chart,null,2))}</pre></details>`;
}
async function renderRecord(id) {
  let r=records.find(r=>r.id===id);
  if(!r){try{r=await api('/readings/'+id);records.unshift(r);}catch(e){toast(e.message);location.hash='/history';return;}}
  if(route()!=='/record/'+id)return;
  const m=methods.find(m=>m.id===r.method);
  shell(`<a href="#/history" class="back-link">← 返回历史记录</a><div class="page-intro">${methodIcon(m)}<div><h1>${m.name}探索</h1><p>一份盘面，一个观察自己的角度。</p></div></div><div class="workspace"><section class="panel"><h2>这次探索</h2><div class="rule-note">${escapeHTML(r.input.date?r.input.date+' '+r.input.time:r.method==='name'?r.chart.title:r.input.question)}</div><p class="tiny">创建于 ${dateLabel(r.createdAt)}<br>状态：${({complete:'解读已缓存',prepared:'盘面已保存',analyzing:'正在解读',error:'分析待重试'})[r.status]}<br>所有设备共享此本地工作室的历史记录。</p><a class="button secondary full" href="#/method/${m.id}">开始新的${m.name}探索 →</a><button class="button secondary full open-settings" data-export="${r.id}">导出完整记录 ↓</button><button class="button secondary full open-settings" data-delete="${r.id}" ${busy.has(r.id)||r.status==='analyzing'?'disabled':''}>删除这条记录</button></section><section class="panel" id="result-area">${recordContent(r)}</section></div>`,m.name,m.id);
}
function renderHistory(){shell(`<div class="eyebrow">YOUR JOURNEY</div><h1 class="serif">每一次探索，都有迹可循。</h1><p class="muted">盘面、问题与解读，按时间留存在本地工作室。</p><div class="history-toolbar"><input id="history-search" type="search" placeholder="搜索问题、盘面或解读…" aria-label="搜索历史"><select id="history-method" aria-label="筛选方式"><option value="">所有方式</option>${methods.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}</select><button class="button secondary" data-action="export-all">导出</button></div><div class="recent-box" id="history-list">${records.length?records.map(item).join(''):'<div class="empty"><span class="empty-icon">◷</span>这里还没有故事。<a href="#/" class="text-link">开始第一次探索 →</a></div>'}</div><button id="history-more" class="button secondary open-settings" ${records.length<200?'hidden':''}>加载更多记录 ↓</button><p class="tiny">按时间分页查看。搜索覆盖全部存档，导出包含所有记录。</p>`,'历史记录','history');let timer,offset=records.length,revision=0;
  async function load(more=false){
    const search=$('#history-search'),method=$('#history-method'),button=$('#history-more');if(!search||!method||!button)return;
    const current=++revision;button.disabled=true;
    try{const found=await api('/readings?'+new URLSearchParams({search:search.value,method:method.value,offset:more?offset:0}));if(current!==revision||!$('#history-list'))return;
      if(more){$('#history-list .empty')?.remove();$('#history-list').insertAdjacentHTML('beforeend',found.map(item).join(''));offset+=found.length;}
      else{$('#history-list').innerHTML=found.length?found.map(item).join(''):'<div class="empty">没有找到匹配的记录。</div>';offset=found.length;}
      button.hidden=found.length<200;
    }catch(e){toast(e.message);}finally{button.disabled=false;}
  }
  function search(){clearTimeout(timer);timer=setTimeout(()=>load(),220);}
  $('#history-search').addEventListener('input',search);$('#history-method').addEventListener('change',search);$('#history-more').addEventListener('click',()=>load(true));
  $('#history-list').addEventListener('record-deleted',event=>{
    revision++;
    const row=$(`#history-list [data-record-id="${event.detail.id}"]`);
    const nextFocus=row?.nextElementSibling?.querySelector('.history-open')||row?.previousElementSibling?.querySelector('.history-open')||$('#history-search');
    if(row){row.remove();offset=Math.max(0,offset-1);}
    if(!$('#history-list').querySelector('.history-item')){
      $('#history-list').innerHTML='<div class="empty">当前没有记录。<a href="#/" class="text-link">开始新的探索 →</a></div>';
    }
    if(lastFocus?.closest('.history-item')===row)nextFocus?.focus();
  });
}
function renderSettings() {
  const p=config.pricing;
  shell(`<div class="settings-wrap"><div class="eyebrow">MAKE IT YOURS</div><h1 class="serif">让工作室，按你的方式运行。</h1><p class="muted">连接 DeepSeek，调整你的解读与费用偏好。</p><form id="settings-form"><section class="panel"><h2>DeepSeek 连接</h2>${field('apiKey','API Key','password',`autocomplete="new-password" placeholder="${config.hasKey?'已有密钥 · 留空保留':'输入你的 DeepSeek API Key'}"`,config.keyFromEnv?'当前优先使用环境变量中的密钥。':'密钥保存在服务端本地配置，不回传给浏览器。')}<label class="field"><span>分析模型</span><select name="model" ${config.modelFromEnv?'disabled':''}><option value="deepseek-flash" ${config.model==='deepseek-flash'?'selected':''}>DeepSeek Flash · 日常探索</option><option value="deepseek-v4-pro" ${config.model==='deepseek-v4-pro'?'selected':''}>DeepSeek V4 Pro · 深入解读</option></select>${config.modelFromEnv?'<small>模型由 DEEPSEEK_MODEL 环境变量固定；修改该变量并重启后生效。</small>':''}</label><p class="tiny">使用官方 API：https://api.deepseek.com<br>点击解读时，会将本次盘面与问题发送给 DeepSeek。同一局域网的设备可直接使用，共享记录、设置与 API 调用额度。</p>${config.hasKey?'<button type="button" class="text-link button secondary" data-action="clear-key">清除本地密钥</button>':''}</section><section class="panel"><h2>费用估算</h2><p class="tiny">人民币 / 每百万 tokens。默认采用 2026-10-14 官方高峰时段单价；空闲时段通常减半，可手动调整。每条历史记录保留当次单价快照。</p><div class="price-row">${field('hit','输入 · 缓存命中','number',`required min="0" max="10000" step="any" value="${p.hit}"`)}${field('miss','输入 · 缓存未命中','number',`required min="0" max="10000" step="any" value="${p.miss}"`)}${field('output','输出','number',`required min="0" max="10000" step="any" value="${p.output}"`)}</div>${field('label','单价说明','text',`required maxlength="150" value="${escapeHTML(p.label)}"`)}<a class="text-link" href="https://api-docs.deepseek.com/zh-cn/quick_start/pricing/" target="_blank" rel="noreferrer">查看 DeepSeek 官方最新价格 ↗</a></section><button class="button" type="submit">保存设置 →</button></form><section class="panel open-settings"><h2>本地与局域网</h2><p class="tiny">当前地址：${escapeHTML(location.origin)}<br>历史数据库位于服务端 .data/readings.sqlite。页面顶部展示本机 192.168.* 地址，可复制给同一局域网的手机或电脑，打开即可使用，无需登录。<br>局域网为共享工作室，所有访问设备共享记录；HTTP 适用于可信局域网。如需公网访问，请自行配置 HTTPS 与身份隔离。</p></section></div>`,'设置与连接','settings');
  const form=$('#settings-form');
  form.elements.model.addEventListener('change',()=>{const pro=form.elements.model.value==='deepseek-v4-pro';for(const [name,value] of Object.entries(pro?{hit:.30,miss:9,output:27}:{hit:.04,miss:2,output:8}))form.elements[name].value=value;form.elements.label.value=`2026-10-14 官方 ${pro?'Pro':'Flash'} 高峰价估算（空闲时段通常减半）`;});
  form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;const data=Object.fromEntries(new FormData(form));const payload={model:data.model,pricing:{hit:Number(data.hit),miss:Number(data.miss),output:Number(data.output),label:data.label}};if(data.apiKey.trim())payload.apiKey=data.apiKey.trim();try{config=await api('/config',{method:'PUT',body:JSON.stringify(payload)});renderSettings();toast('设置已保存');}catch(e){toast(e.message);button.disabled=false;}});
}
function download(data,name) {const link=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function deleteRecord(id) {
  const dialog=$('#confirm-dialog');if(dialog.open||deleting.has(id))return;
  const record=records.find(r=>r.id===id);if(busy.has(id)||record?.status==='analyzing'){toast('分析完成后可删除这条记录');return;}
  lastFocus=document.activeElement;
  $('#delete-record-context').textContent=record?.input.question||record?.chart.title||$(`[data-record-id="${id}"] h3`)?.textContent||'本次探索记录';
  dialog.returnValue='cancel';dialog.showModal();
  dialog.addEventListener('close',async()=>{
    lastFocus?.focus();if(dialog.returnValue!=='delete')return;
    deleting.add(id);
    const buttons=[...document.querySelectorAll(`[data-delete="${id}"]`)];
    const labels=buttons.map(button=>button.textContent);
    buttons.forEach(button=>{button.disabled=true;button.textContent='删除中…';});
    try{
      try{await api('/readings/'+id,{method:'DELETE'});}catch(error){if(error.status!==404)throw error;}
      records=records.filter(r=>r.id!==id);
      const counter=$('.sidebar a[href="#/history"] .tiny');if(counter)counter.textContent=records.length||'';
      if(route()==='/history')$('#history-list')?.dispatchEvent(new CustomEvent('record-deleted',{detail:{id}}));
      else if(route()==='/')renderHome();
      else if(route()==='/record/'+id)location.hash='/history';
      toast('记录已删除');
    }catch(error){toast(error.message);}
    finally{
      deleting.delete(id);
      buttons.forEach((button,i)=>{if(button.isConnected){button.disabled=busy.has(id)||record?.status==='analyzing';button.textContent=labels[i];}});
    }
  },{once:true});
}
async function analyzeRecord(id) {
  const r=records.find(r=>r.id===id);if(!r||busy.has(id))return;busy.add(id);r.status='analyzing';renderRecord(id);
  try{const completed=await api('/readings/'+id+'/analyze',{method:'POST',body:'{}'});records=records.map(r=>r.id===id?completed:r);toast(completed.cached?'已读取缓存解读':'解读完成，已保存');}
  catch(e){try{const saved=await api('/readings/'+id);records=records.map(r=>r.id===id?saved:r);}catch{r.status='error';r.error=e.message;}toast(e.message);}
  finally{busy.delete(id);if(route()==='/record/'+id)renderRecord(id);}
}
async function render() {
  const path=route();if(path==='/')renderHome();else if(path==='/history')renderHistory();else if(path==='/settings')renderSettings();else if(path.startsWith('/method/'))renderMethod(path.split('/')[2]);else if(path.startsWith('/record/'))await renderRecord(path.split('/')[2]);else{location.hash='/';return;}window.scrollTo(0,0);
}
function startupError(message) {
  $('#app').innerHTML=`<div class="startup-shell"><section class="startup-card"><div class="brand"><img src="/icon.svg" alt=""><div><strong>观象</strong><small>GUANXIANG · AI STUDIO</small></div></div><h1>暂时无法连接工作室</h1><p class="muted">请确认本地服务正在运行。</p><div class="error-box" role="alert">${escapeHTML(message)}</div><button class="button full" data-action="retry">重新连接 →</button></section></div>`;
}
async function boot() {
  try {
    if(location.hash.startsWith('#access='))history.replaceState(null,'',location.pathname+'#/');
    const results=await Promise.all([api('/methods'),api('/readings'),api('/config')]);[methods,records,config]=results;await render();
  }catch(e){startupError(e.message);}
}
document.addEventListener('click',async e=>{try{
  const node=e.target.closest('[data-action],[data-filter],[data-analyze],[data-export],[data-delete]');if(!node)return;
  if(node.dataset.filter){filter=node.dataset.filter;renderHome();return;}
  if(node.dataset.analyze){analyzeRecord(node.dataset.analyze);return;}
  if(node.dataset.export){const r=await api('/readings/'+node.dataset.export);download(r,'观象-'+r.method+'-'+r.id.slice(0,8)+'.json');return;}
  if(node.dataset.delete){deleteRecord(node.dataset.delete);return;}
  const action=node.dataset.action;
  if(action==='theme'){const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem('gx-theme',theme);node.textContent=theme==='dark'?'☀':'☾';}
  if(action==='copy-lan')await copyLanUrl(node.dataset.url);
  if(action==='menu'){$('.sidebar')?.classList.toggle('open');$('.menu-scrim')?.classList.toggle('open');}
  if(action==='retry')await boot();
  if(action==='export-all')download(await api('/readings/export'),'观象-历史记录.json');
  if(action==='clear-key'){try{config=await api('/config',{method:'PUT',body:JSON.stringify({apiKey:''})});renderSettings();toast(config.keyFromEnv?'本地密钥已清除，环境变量密钥仍有效':'本地密钥已清除');}catch(e){toast(e.message);}}
}catch(error){toast(error.message);}});
window.addEventListener('hashchange',()=>{if(methods.length)render();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('.sidebar')?.classList.remove('open');$('.menu-scrim')?.classList.remove('open');}});
// Refresh records across LAN devices and recover long-running requests after navigation.
setInterval(async()=>{if(!methods.length||document.hidden||busy.size)return;try{const fresh=await api('/readings');const current=route().split('/record/')[1];const changed=current&&JSON.stringify(records.find(r=>r.id===current))!==JSON.stringify(fresh.find(r=>r.id===current));records=fresh;if(changed&&current)renderRecord(current);}catch{/* A temporary connection failure is retried on the next refresh. */}},8000);
boot();
