const { chromium } = require('C:/Users/15261/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const out = __dirname;

(async () => {
  const {createApp} = await import('../../../lib/server.mjs');
  const app = createApp({dataDir:path.join(out,'.demo-data')});
  for(const record of app.store.list({})) app.store.delete(record.id);
  await new Promise(resolve=>app.server.listen(3218,'127.0.0.1',resolve));
  const browser = await chromium.launch({ headless: true, channel: 'msedge', args:['--no-proxy-server'] });
  const context = await browser.newContext({viewport:{width:432,height:768},deviceScaleFactor:2.5,isMobile:true,hasTouch:true,colorScheme:'light',reducedMotion:'reduce',locale:'zh-CN',timezoneId:'Asia/Shanghai'});
  const page = await context.newPage();
  const issues=[];
  page.on('pageerror',e=>issues.push(e.message));
  await page.addInitScript(() => localStorage.setItem('gx-theme','light'));
  await page.goto('http://127.0.0.1:3218', {waitUntil:'networkidle'});
  const snapshots=[];
  const shots=[];
  async function snapshot(label){snapshots.push('## '+label+'\n'+await page.locator('body').ariaSnapshot());}
  async function align(selector,margin=20){await page.locator(selector).evaluate((el,margin)=>window.scrollTo(0,el.getBoundingClientRect().top+window.scrollY-margin),margin);}
  async function shot(name){
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});
    shots.push({file:name+'.png',theme:await page.locator('html').getAttribute('data-theme'),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
    console.log('saved',name);
  }
  await snapshot('首页');
  await align('.welcome');
  await shot('01-探索首页');
  await page.getByRole('button',{name:'展开导航',exact:true}).click();
  await snapshot('手机导航');
  await shot('02-八种探索方式');
  await page.getByRole('link',{name:'◈ 探索',exact:true}).click();
  await page.getByRole('button',{name:'查看今日运势 →',exact:true}).click();
  await page.locator('.daily-body').waitFor();
  await align('.daily-card');
  await snapshot('今日运势');
  await shot('03-今日运势');

  async function openMethod(id){
    await page.goto('http://127.0.0.1:3218/#/method/'+id,{waitUntil:'networkidle'});
    await page.locator('#reading-form').waitFor();
    await snapshot(id+'表单');
  }
  async function submit(){
    await page.locator('#reading-form button[type=submit]').click();
    await page.waitForURL('**/#/record/*');
    await page.locator('#result-area .record-head').waitFor();
    await snapshot('盘面结果');
  }
  await openMethod('tarot');
  await page.getByRole('textbox',{name:'此刻，你想探索什么？',exact:true}).fill('面对新机会，我该如何迈出第一步？');
  await submit();
  await align('#result-area');
  await shot('04-塔罗三张牌');

  await openMethod('bazi');
  await page.getByLabel('公历出生日期',{exact:true}).fill('1998-06-15');
  await page.getByLabel('出生时间',{exact:true}).fill('09:30');
  await page.getByRole('textbox',{name:'想重点探索的方向（选填）',exact:true}).fill('如何找到适合自己的工作节奏？');
  await submit();
  await align('#result-area');
  await shot('05-八字排盘');

  await openMethod('name');
  await page.getByRole('textbox',{name:'姓氏',exact:true}).fill('林');
  await page.getByRole('textbox',{name:'名字',exact:true}).fill('知夏');
  await page.getByText('已查询到全部笔画；可勾选手动调整进行核实。',{exact:true}).waitFor();
  await align('.page-intro');
  await snapshot('姓名自动笔画');
  await shot('06-姓名自动查笔画');
  await page.getByRole('textbox',{name:'想重点探索的方向（选填）',exact:true}).fill('从名字中发现一点新意。');
  await submit();

  await openMethod('iching');
  await page.getByRole('textbox',{name:'此刻，你想探索什么？',exact:true}).fill('怎样更从容地应对接下来的变化？');
  await submit();
  await align('#result-area');
  await shot('07-易卦本卦与变卦');

  await page.goto('http://127.0.0.1:3218/#/history',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'每一次探索，都有迹可循。',exact:true}).waitFor();
  await page.evaluate(()=>window.scrollTo(0,0));
  await snapshot('历史记录');
  await shot('08-历史自动留存');
  await fs.writeFile(path.join(out,'snapshots.txt'),snapshots.join('\n\n'));
  await fs.writeFile(path.join(out,'qa.json'),JSON.stringify({viewport:'432 × 768 CSS px',output:'1080 × 1920 px',shots,pageErrors:issues},null,2));
  await browser.close();
  await app.close();
})().catch(e=>{console.error(e);process.exit(1)});
