import { EventEmitter } from 'node:events';
import { registerBrowserLaunch,studioLaunchUrl,browserLaunchPath } from '../lib/browser-launch.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,symlinkSync,rmSync,chmodSync,statSync,existsSync,realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { probeService,serviceUrl,portsFromProcessList,discoverService,dshLaunchArguments,dshRuntimeEnvironment,openStudio } from '../scripts/launch.mjs';
import { versionAtLeast,compareVersions,pluginInstalled,findDsh,ensureEnvironment,ensurePnpm,profileTools,profileDirectory } from '../scripts/environment.mjs';

test('区分观象插件、原生 DSH 登录页、其他占用和未运行服务',async()=>{
  assert.equal(await probeService('http://127.0.0.1:3080',{fetchImpl:async()=>Response.json({name:'dsh-fortuneteller',apiVersion:1})}),'plugin');
  assert.equal(await probeService('http://127.0.0.1:3080',{fetchImpl:async()=>new Response('dsh web authentication required; reopen the URL printed by dsh web.',{status:401})}),'dsh');
  assert.equal(await probeService('http://127.0.0.1:3080',{fetchImpl:async()=>new Response('<title>DeepSeek Harness</title>')}),'dsh');
  assert.equal(await probeService('http://127.0.0.1:3080',{fetchImpl:async()=>new Response('other service')}),'other');
  assert.equal(await probeService('http://127.0.0.1:3080',{fetchImpl:async()=>{throw new Error('ECONNREFUSED');}}),null);
});
test('非默认端口的已有 DSH 会被发现，显式地址优先，其他服务不被认作 DSH',async()=>{
  const listing='node /opt/lib/node_modules/@deepseek-ai/dsh/lib/bin.js web --port 4100 --no-open\nnode /opt/other.js --port 4200\ndsh --profile web --port=4300';
  assert.deepEqual(portsFromProcessList(listing),[4100,4300]);
  const calls=[];const probe=async base=>{calls.push(base);return base.endsWith(':4100')?'dsh':'other';};
  assert.deepEqual(await discoverService({}, {probe,processList:listing}),{base:'http://127.0.0.1:4100',kind:'dsh'});
  calls.length=0;assert.deepEqual(await discoverService({DSH_WEB_URL:'http://localhost:3081'},{probe,processList:listing}),{base:'http://localhost:3081',kind:'other'});assert.equal(calls.length,1);
});
test('校验本机服务地址和环境升级版本，不将新版降级到旧版',()=>{
  assert.equal(serviceUrl({}),'http://127.0.0.1:3080');assert.equal(serviceUrl({DSH_WEB_PORT:'4000'}),'http://127.0.0.1:4000');
  for(const url of ['https://localhost:3080','http://example.com','http://user:pass@localhost:3080'])assert.throws(()=>serviceUrl({DSH_WEB_URL:url}));
  assert.equal(versionAtLeast('22.12.0','22.13.0'),false);assert.equal(versionAtLeast('22.13.0','22.13.0'),true);assert.equal(versionAtLeast('24.0.0','22.13.0'),true);
  assert.ok(compareVersions('0.1.5-rc.10','0.1.5-rc.2')>0);assert.ok(compareVersions('0.1.5','0.1.5-rc.10')>0);assert.ok(compareVersions('0.1.4','0.1.5-rc.1')<0);
});
test('仅当前 checkout 的已登记链接视作安装完成，能够发现项目内 DSH runtime',()=>{
  const root=mkdtempSync(join(tmpdir(),'gx-env-'));const profile=join(root,'profile');
  try{
    mkdirSync(join(profile,'node_modules'),{recursive:true});writeFileSync(join(profile,'package.json'),JSON.stringify({dsh:{profile:{bundles:['dsh-fortuneteller']}}}));
    assert.equal(pluginInstalled(root,profile),false);symlinkSync(root,join(profile,'node_modules','dsh-fortuneteller'),'junction');assert.equal(pluginInstalled(root,profile),true);
    const runtime=join(root,'.data','runtime','node_modules','@deepseek-ai','dsh');mkdirSync(join(runtime,'lib'),{recursive:true});writeFileSync(join(runtime,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh',version:'0.1.5-rc.1'}));writeFileSync(join(runtime,'lib','bin.js'),'');assert.equal(findDsh(root,{PATH:'',DSH_HOME:join(root,'home')}).version,'0.1.5-rc.1');
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('已有 DSH 直接复用，即使旧更新开关开启也不查询 npm 或另装版本',()=>{
  const root=mkdtempSync(join(tmpdir(),'gx-installed-'));const calls=[];
  try{
    writeFileSync(join(root,'package.json'),JSON.stringify({dependencies:{}}));writeFileSync(join(root,'package-lock.json'),'{}');
    const runtime=join(root,'.data','runtime','node_modules','@deepseek-ai','dsh');mkdirSync(join(runtime,'lib'),{recursive:true});writeFileSync(join(runtime,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh',version:'0.2.0-rc.2'}));writeFileSync(join(runtime,'lib','bin.js'),'');
    const bin=join(root,'bin');mkdirSync(bin);writeFileSync(join(bin,'pnpm'),'#!/usr/bin/env node\n');
    const options={env:{PATH:bin,DSH_HOME:join(root,'home'),FORTUNE_AUTO_UPDATE:'1'},exec:(...args)=>calls.push(args),spawnImpl:(command,args)=>{assert.equal(args.includes('view'),false);return {status:0,stdout:'12.3.4'};}};
    assert.equal(ensureEnvironment(root,options).dsh.version,'0.2.0-rc.2');assert.equal(calls.length,0);
    ensureEnvironment(root,options);assert.equal(calls.length,0);
    writeFileSync(join(root,'package-lock.json'),'new project dependency lock');ensureEnvironment(root,options);
    assert.equal(calls.length,1);assert.equal(calls[0][1][0],'ci');
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('DSH 缺失时调用固定版本升级流程，安装失败则停止',()=>{
  const root=mkdtempSync(join(tmpdir(),'gx-missing-'));
  try{
    writeFileSync(join(root,'package.json'),JSON.stringify({dependencies:{}}));writeFileSync(join(root,'package-lock.json'),'{}');
    assert.throws(()=>ensureEnvironment(root,{env:{PATH:'',DSH_HOME:join(root,'home')},exec:()=>assert.fail('不应安装项目依赖'),spawnImpl:()=>assert.fail('不应查询 npm'),upgrade:options=>{assert.equal(options.version,undefined);assert.ok(options.npm);throw new Error('offline upgrade');}}),/offline upgrade/);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('优先复用共享 DSH，忽略观象之前安装的副本，并支持显式 DSH_CLI',()=>{
  const parent=mkdtempSync(join(tmpdir(),'gx-shared-'));const root=join(parent,'fortune');
  const put=(prefix,version)=>{const path=join(prefix,'node_modules','@deepseek-ai','dsh');mkdirSync(join(path,'lib'),{recursive:true});writeFileSync(join(path,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh',version}));writeFileSync(join(path,'lib','bin.js'),'');return join(path,'lib','bin.js');};
  try{
    const shared=put(join(parent,'whereto','.local','runtime'),'0.2.0-rc.2');put(join(root,'.data','runtime'),'9.0.0');
    const env={PATH:'',DSH_HOME:join(parent,'home')};
    assert.equal(findDsh(root,env).bin,shared);
    assert.equal(findDsh(root,{...env,DSH_CLI:shared}).bin,shared);
    assert.throws(()=>findDsh(root,{...env,DSH_CLI:join(parent,'missing')}),/DSH_CLI/);
  }finally{rmSync(parent,{recursive:true,force:true});}
});

test('复用 profile 的 pnpm 12 与原 store，跳过 PATH 中的 pnpm 10，不重复安装 DSH',()=>{
  const root=mkdtempSync(join(tmpdir(),'gx-reuse-'));const calls=[];
  try{
    const home=join(root,'home'),profile=join(home,'profiles','web');mkdirSync(join(profile,'node_modules'),{recursive:true});
    const store=join(root,'shared-store','v11');
    writeFileSync(join(profile,'node_modules','.modules.yaml'),JSON.stringify({packageManager:'pnpm@12.3.4',storeDir:store}));
    const bins=[join(root,'shadow'),join(root,'shared')];
    for(const dir of bins){mkdirSync(dir);writeFileSync(join(dir,'pnpm'),'#!/usr/bin/env node\n');}
    const env={PATH:bins.join(process.platform==='win32'?';':':'),DSH_HOME:home};
    const spawnImpl=(command,args)=>({status:0,stdout:args[0]?.includes('shadow')?'10.0.0\n':'12.3.4\n'});
    const dsh={directory:join(root,'dsh','node_modules','@deepseek-ai','dsh')};
    const result=ensurePnpm(root,dsh,{env,spawnImpl,exec:(...args)=>{calls.push(args);}});
    assert.equal(result.pnpm.version,'12.3.4');assert.equal(result.env.PATH.split(process.platform==='win32'?';':':')[0],bins[1]);assert.equal(result.env.npm_config_store_dir,dirname(store));assert.equal(result.env.PNPM_CONFIG_STORE_DIR,dirname(store));assert.equal(calls.length,0);assert.equal(env.npm_config_store_dir,undefined);
    // A second run with a complete runtime must neither query npm nor install.
    writeFileSync(join(root,'package.json'),JSON.stringify({dependencies:{}}));writeFileSync(join(root,'package-lock.json'),'{}');
    const runtime=join(home,'runtimes','existing','current','node_modules','@deepseek-ai','dsh');mkdirSync(join(runtime,'lib'),{recursive:true});writeFileSync(join(runtime,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh',version:'0.2.0-rc.2'}));writeFileSync(join(runtime,'lib','bin.js'),'');
    const checked=ensureEnvironment(root,{env,spawnImpl:(command,args)=>{assert.equal(args.includes('view'),false);return spawnImpl(command,args);},exec:()=>assert.fail('已有环境不应安装')});
    assert.equal(checked.dsh.version,'0.2.0-rc.2');
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('兼容普通 YAML profile 元数据与展开 DSH_HOME，缺失 pnpm 时只补齐匹配版本',()=>{
  const root=mkdtempSync(join(tmpdir(),'gx-pnpm-'));const env={PATH:'',DSH_HOME:join(root,'home')};
  try{
    const profile=profileDirectory(env);mkdirSync(join(profile,'node_modules'),{recursive:true});
    writeFileSync(join(profile,'node_modules','.modules.yaml'),'packageManager: pnpm@12.3.4\nstoreDir: /private/custom-store/v11\n');
    assert.deepEqual(profileTools(profile),{version:'12.3.4',storeDir:'/private/custom-store/v11'});
    const result=ensurePnpm(root,{directory:join(root,'dsh')},{env,spawnImpl:()=>({status:0,stdout:'12.3.4'}),exec:(command,args)=>{
      assert.equal(command,'npm');assert.ok(args.includes('pnpm@12.3.4'));assert.equal(args.some(a=>a.startsWith('@deepseek-ai/dsh@')),false);
      const prefix=args[args.indexOf('--prefix')+1];mkdirSync(join(prefix,'node_modules','pnpm','bin'),{recursive:true});writeFileSync(join(prefix,'node_modules','pnpm','bin','pnpm.mjs'),'');
    }});
    assert.equal(result.pnpm.version,'12.3.4');assert.equal(result.env.npm_config_store_dir,'/private/custom-store');assert.equal(result.env.PNPM_CONFIG_STORE_DIR,'/private/custom-store');
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('sh start.sh 与 bash start.sh 都可启动，保留工作目录和参数',{skip:process.platform==='win32'},()=>{
  const temp=mkdtempSync(join(tmpdir(),'gx-shell-'));const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
  try{
    const bin=join(temp,'node');writeFileSync(bin,'#!/bin/sh\nif [ "$1" = "-e" ]; then exit 0; fi\nprintf "%s\\n" "$PWD" "$@"\n');chmodSync(bin,0o755);
    for(const shell of ['sh','bash']) {
      const result=spawnSync(shell,[join(root,'start.sh'),'--no-open'],{cwd:temp,env:{...process.env,PATH:temp+':'+process.env.PATH},encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');assert.deepEqual(result.stdout.trim().split('\n'),[root,'--disable-warning=UNDICI-EHPA','scripts/launch.mjs','--no-open']);
    }
  }finally{rmSync(temp,{recursive:true,force:true});}
});

test('Windows 双击入口兼容 PowerShell 5.1，在中文空格路径中保留工作目录和参数',{skip:process.platform!=='win32'},()=>{
  const temp=mkdtempSync(join(tmpdir(),'gx-windows-'));
  const fixture=join(temp,'观象 launcher');
  const root=fileURLToPath(new URL('../',import.meta.url));
  try{
    mkdirSync(join(fixture,'scripts'),{recursive:true});
    for(const path of ['start.bat','scripts/bootstrap.ps1'])copyFileSync(join(root,path),join(fixture,path));
    // Exercise the batch file and Windows PowerShell without installing or starting DSH.
    writeFileSync(join(fixture,'scripts','launch.mjs'),"import { writeFileSync } from 'node:fs'; writeFileSync('invocation.json', JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }));");
    const result=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',`""${join(fixture,'start.bat')}" --no-open "argument with spaces""`],{
      cwd:temp,env:{...process.env,PATH:dirname(process.execPath)+';'+process.env.PATH},
      encoding:'utf8',input:'',timeout:30000,windowsHide:true,windowsVerbatimArguments:true,
    });
    assert.equal(result.error,undefined);
    assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
    assert.equal(result.stderr,'');
    assert.deepEqual(JSON.parse(readFileSync(join(fixture,'invocation.json'),'utf8')),{cwd:fixture,args:['--no-open','argument with spaces']});
  }finally{rmSync(temp,{recursive:true,force:true});}
});

test('复用 pnpm 12 原生可执行入口，不将其误当 Node 脚本或触发安装',{skip:process.platform==='win32'},()=>{
  const root=mkdtempSync(join(tmpdir(),'gx-native-pnpm-'));
  try{
    const bin=join(root,'bin');mkdirSync(bin);writeFileSync(join(bin,'pnpm'),'#!/bin/sh\nprintf "12.3.4\\n"\n');chmodSync(join(bin,'pnpm'),0o755);
    const env={PATH:bin,DSH_HOME:join(root,'home')};
    const profile=profileDirectory(env);mkdirSync(join(profile,'node_modules'),{recursive:true});writeFileSync(join(profile,'node_modules','.modules.yaml'),'packageManager: pnpm@12.3.4\nstoreDir: /existing/store/v11\n');
    const result=ensurePnpm(root,{directory:join(root,'dsh')},{env,exec:()=>assert.fail('不应重复安装 pnpm')});
    assert.equal(result.pnpm.native,true);assert.equal(result.pnpm.version,'12.3.4');assert.equal(result.env.PNPM_CONFIG_STORE_DIR,'/existing/store');
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('默认 DSH 启动参数始终禁用浏览器，保留自定义端口与代理配置',()=>{
  const dsh={bin:'/existing/dsh/lib/bin.js'};
  const args=dshLaunchArguments(dsh,'http://127.0.0.1:4380');
  assert.ok(args.includes('--no-open'));assert.equal(args[args.indexOf('--port')+1],'4380');
  const original={NODE_OPTIONS:'--max-old-space-size=2048',HTTP_PROXY:'http://127.0.0.1:8090',HTTPS_PROXY:'http://127.0.0.1:8090',NO_PROXY:'localhost,127.0.0.1',NODE_USE_ENV_PROXY:'1'};
  const env=dshRuntimeEnvironment(original);
  assert.equal(env.NODE_OPTIONS,'--max-old-space-size=2048 --disable-warning=UNDICI-EHPA');
  for(const key of ['HTTP_PROXY','HTTPS_PROXY','NO_PROXY','NODE_USE_ENV_PROXY'])assert.equal(env[key],original[key]);
  assert.equal(original.NODE_OPTIONS,'--max-old-space-size=2048');
  assert.equal(dshRuntimeEnvironment(env).NODE_OPTIONS,env.NODE_OPTIONS);
});

test('实际 Node 子进程只过滤 UNDICI-EHPA，保留其他 warning 和子进程继承配置',()=>{
  const code="process.emitWarning('proxy experimental',{code:'UNDICI-EHPA'});process.emitWarning('unrelated issue',{code:'GX_TEST_WARNING'});";
  const env=dshRuntimeEnvironment({...process.env,NODE_OPTIONS:'--max-old-space-size=128'});
  const result=spawnSync(process.execPath,['-e',code],{env,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stderr,/UNDICI-EHPA|proxy experimental/);assert.match(result.stderr,/GX_TEST_WARNING.*unrelated issue/);
});

test('默认等待观象就绪后只打开观象页面，首次访问带宿主认证，--no-open 不打开任何页面',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'gx-open-'));let cleanup;
  try{
    cleanup=registerBrowserLaunch(directory,{port:3080,instanceId:'active',connection:{authenticatedUrl:base=>base+'?token=private-test-token'}});
    let probes=0;const opened=[];
    const spawnImpl=(command,args)=>{opened.push({command,args});const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;};
    const fetchImpl=async()=>{if(++probes===1)throw Error('尚未启动');return Response.json({name:'dsh-fortuneteller',apiVersion:1,instanceId:'active'});};
    assert.equal(await openStudio('http://127.0.0.1:3080',{directory,argv:[],fetchImpl,spawnImpl}),true);
    assert.equal(opened.length,1);const target=new URL(opened[0].args.at(-1));assert.equal(target.pathname,'/fortuneteller/');assert.equal(target.searchParams.get('token'),'private-test-token');assert.equal(probes,2);
    assert.equal(await openStudio('http://127.0.0.1:3080',{argv:['--no-open'],fetchImpl:()=>assert.fail('无需等待服务'),spawnImpl:()=>assert.fail('禁止打开浏览器')}),false);
  }finally{cleanup?.();rmSync(directory,{recursive:true,force:true});}
});

test('浏览器认证入口仅存本地私有文件，不复用其他宿主的过期 token，卸载清理自身入口',()=>{
  const directory=mkdtempSync(join(tmpdir(),'gx-entry-'));
  try{
    const connection={authenticatedUrl:base=>base+'?token=host-test-token'};
    const first=registerBrowserLaunch(directory,{port:3080,instanceId:'old',connection});
    const path=browserLaunchPath(directory,3080);
    if(process.platform!=='win32')assert.equal(statSync(path).mode&0o777,0o600);
    assert.equal(studioLaunchUrl(directory,'http://localhost:3080','old'),'http://localhost:3080/fortuneteller/?token=host-test-token');
    assert.equal(studioLaunchUrl(directory,'http://localhost:3080','different'),'http://localhost:3080/fortuneteller/');
    const second=registerBrowserLaunch(directory,{port:3080,instanceId:'new',connection});first();assert.equal(existsSync(path),true);second();assert.equal(existsSync(path),false);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('统一使用 PATH 中的 DSH，而非项目或其他运行时的私有版本',()=>{
  const root=mkdtempSync(join(tmpdir(),'gx-path-first-'));
  try{
    const global=join(root,'global','node_modules','@deepseek-ai','dsh');mkdirSync(join(global,'lib'),{recursive:true});writeFileSync(join(global,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh',version:'0.2.0-rc.2'}));writeFileSync(join(global,'lib','bin.js'),'#!/usr/bin/env node\n');
    const bin=join(root,'bin');mkdirSync(bin);
    if(process.platform==='win32'){symlinkSync(join(root,'global','node_modules'),join(bin,'node_modules'),'junction');writeFileSync(join(bin,'dsh.cmd'),'@echo off\r\n');}
    else symlinkSync(join(global,'lib','bin.js'),join(bin,'dsh'));
    const other=join(root,'home','runtimes','private','current','node_modules','@deepseek-ai','dsh');mkdirSync(join(other,'lib'),{recursive:true});writeFileSync(join(other,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh',version:'9.0.0'}));writeFileSync(join(other,'lib','bin.js'),'');
    assert.equal(realpathSync(findDsh(root,{PATH:bin,DSH_HOME:join(root,'home')}).bin),realpathSync(join(global,'lib','bin.js')));
  }finally{rmSync(root,{recursive:true,force:true});}
});
