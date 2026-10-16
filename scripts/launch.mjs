import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, openSync, closeSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { studioLaunchUrl } from '../lib/browser-launch.mjs';
import { ensureEnvironment, profileDirectory, pluginInstalled, run } from './environment.mjs';
import { registrationCurrent, rememberRegistration } from './dsh-version.mjs';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
export async function probeService(base,{fetchImpl=fetch}={}) {
  try {
    const health=await fetchImpl(new URL('/fortuneteller/health',base),{signal:AbortSignal.timeout(1500),redirect:'manual'});
    if(health.ok){const data=await health.json();if(data.name==='dsh-fortuneteller'&&data.apiVersion===1)return 'plugin';}
  }catch{}
  try {
    const response=await fetchImpl(new URL('/',base),{signal:AbortSignal.timeout(1500),redirect:'manual'});
    const text=await response.text();
    if(/<title>\s*(?:DeepSeek Harness|DSH)(?:\s*[-·|][^<]*)?\s*<\/title>|DSH_WEB_AUTH|dsh browser authentication|Open the authenticated URL printed/iu.test(text))return 'dsh';
    // DSH's unauthenticated index has a stable, purpose-specific message.
    if(response.status===401&&/dsh web|browser.*token|authenticated.*URL/iu.test(text))return 'dsh';
    return 'other';
  }catch{return null;}
}
export function serviceUrl(env=process.env) {
  const url=new URL(env.DSH_WEB_URL||`http://127.0.0.1:${env.DSH_WEB_PORT||3080}`);
  if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password)throw new Error('DSH_WEB_URL 必须是本机 HTTP 地址。');
  const port=Number(url.port||80);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('DSH Web 端口无效');
  return url.origin;
}
export function portsFromProcessList(text) {
  const ports=new Set();
  for(const line of text.split(/\r?\n/)) {
    if(!/(?:^|[/\\\s])dsh(?:[/\\\s.]|$)/i.test(line)||!/(?:\bweb\b|--profile[=\s]+web)/.test(line))continue;
    const match=line.match(/--port(?:=|\s+)["']?(\d+)/);
    if(match&&Number(match[1])>0&&Number(match[1])<=65535)ports.add(Number(match[1]));
  }
  return [...ports];
}
export async function discoverService(env=process.env,{probe=probeService,processList}={}) {
  const preferred=serviceUrl(env);
  if(env.DSH_WEB_URL||env.DSH_WEB_PORT)return {base:preferred,kind:await probe(preferred)};
  let listing=processList;
  if(listing===undefined) {
    const result=process.platform==='win32'
      ?spawnSync('powershell',['-NoProfile','-Command',"Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|dsh)(.exe)?$' } | Select-Object -ExpandProperty CommandLine"],{encoding:'utf8',timeout:5000})
      :spawnSync('ps',['-eo','args='],{encoding:'utf8',timeout:5000});
    listing=result.stdout||'';
  }
  const candidates=[preferred,...portsFromProcessList(listing).map(port=>`http://127.0.0.1:${port}`)];
  let preferredKind;
  for(const base of new Set(candidates)) {const kind=await probe(base);if(base===preferred)preferredKind=kind;if(kind==='plugin'||kind==='dsh')return {base,kind};}
  return {base:preferred,kind:preferredKind};
}
const PROXY_WARNING_OPTION='--disable-warning=UNDICI-EHPA';
export function dshRuntimeEnvironment(env) {
  const options=env.NODE_OPTIONS||'';
  return {...env,NODE_OPTIONS:options.includes(PROXY_WARNING_OPTION)?options:[options,PROXY_WARNING_OPTION].filter(Boolean).join(' ')};
}
export function dshLaunchArguments(dsh,base) {
  // Browser handoff is always off, including ordinary starts without --no-open.
  return [PROXY_WARNING_OPTION,dsh.bin,'web','--no-open','--host','127.0.0.1','--port',new URL(base).port||'80'];
}
export async function openStudio(base,{directory=root,env=process.env,argv=process.argv,fetchImpl=fetch,spawnImpl=spawn,signal,timeoutMs=30000,log=console.log}={}) {
  if(argv.includes('--no-open'))return false;
  const deadline=Date.now()+timeoutMs;
  while(!signal?.aborted&&Date.now()<deadline) {
    let health;
    try {
      const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(1000)]):AbortSignal.timeout(1000);
      const response=await fetchImpl(new URL('/fortuneteller/health',base),{signal:requestSignal});
      if(response.ok)health=await response.json();
    }catch{}
    if(health?.name==='dsh-fortuneteller'&&health.apiVersion===1) {
      const candidate=health.url?new URL(health.url):null;
      const url=candidate?.protocol==='http:'&&candidate.hostname==='127.0.0.1'&&!candidate.username&&!candidate.password?candidate.href:studioLaunchUrl(directory,base,health.instanceId);
      const command=process.platform==='win32'?'rundll32':process.platform==='darwin'?'open':'xdg-open';
      const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
      return new Promise(resolve=>{
        const browser=spawnImpl(command,args,{stdio:'ignore',detached:true,env});
        browser.once('error',()=>{log(`[观象] 浏览器未能打开，请手动访问 ${base}/fortuneteller/`);resolve(false);});
        browser.once('spawn',()=>{browser.unref();resolve(true);});
      });
    }
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!signal?.aborted)log('[观象] 工作室尚未就绪，请检查插件加载状态后访问上面的地址。');
  return false;
}
export async function launch() {
  if(existsSync(join(root,'.env')))process.loadEnvFile(join(root,'.env'));
  serviceUrl(); // Validate explicit configuration before taking the startup lock.
  const stateDir=join(root,'.data');mkdirSync(stateDir,{recursive:true});
  const lock=join(stateDir,'launch.lock');
  // Serialize bootstraps so two clicks cannot install or start concurrently.
  try{const fd=openSync(lock,'wx');writeFileSync(fd,String(process.pid));closeSync(fd);}catch(error){
    if(error.code!=='EEXIST')throw error;
    let alive=false;try{const pid=Number(readFileSync(lock,'utf8'));if(Number.isInteger(pid)&&pid>0){try{process.kill(pid,0);alive=true;}catch(e){alive=e.code!=='ESRCH';}}}catch{}
    if(alive){const service=await discoverService();if(service.kind==='plugin')await openStudio(service.base);else console.log('[观象] 已有启动流程正在运行，请查看原启动窗口。');return;}
    unlinkSync(lock);return launch();
  }
  try {
    const {base,kind:existing}=await discoverService();
    if(existing==='other')throw new Error(`${base} 已被其他服务占用；请用 DSH_WEB_URL 指定 DSH 服务地址。`);
    const runtime=ensureEnvironment(root);
    const {dsh}=runtime;const env=dshRuntimeEnvironment(runtime.env);
    const profile=profileDirectory(env);
    if(!pluginInstalled(root,profile)||!registrationCurrent(profile,'dsh-fortuneteller',dsh.version)) {
      run(process.execPath,[dsh.bin,'plugin','--profile','web','add',`link:${root.replaceAll('\\','/')}`],{cwd:root,env});
      if(!pluginInstalled(root,profile))throw new Error('DSH 未完成观象 bundle 注册。');
      rememberRegistration(profile,'dsh-fortuneteller',dsh.version);
    }
    if(existing){
      const active=await probeService(base);
      console.log(`[观象] 复用已有 DSH Web，DSH：${base}，未启动第二个 DSH 服务。`);
      if(active!=='plugin')console.log('[观象] 插件已安装。此 DSH 进程尚未加载观象，请在 DSH 插件管理中启用；若不支持热加载，请重启原 DSH Web 一次。');
      let address;try{address=(await(await fetch(new URL('/fortuneteller/health',base),{signal:AbortSignal.timeout(1500)})).json()).url;}catch{}
      console.log(`[观象] 工作室地址：${address||base+'/fortuneteller/'}`);
      if(active==='plugin')await openStudio(base,{env});
      return;
    }
    // Recheck after installation: another DSH launcher may have won the race.
    const raced=await probeService(base);
    if(raced){if(raced==='other')throw new Error('安装期间端口已被其他服务占用。');console.log(`[观象] 检测到 DSH Web 已启动，复用 ${base}`);if(raced==='plugin')await openStudio(base,{env});return;}
    console.log(`[观象] 启动 DSH Web；工作室就绪后自动打开观象页面。`);
    console.log('[观象] 独立页面默认 http://127.0.0.1:3100/，占用时自动选择空闲端口。');
    const child=spawn(process.execPath,dshLaunchArguments(dsh,base),{cwd:root,env,stdio:'inherit'});
    const browserController=new AbortController();
    child.once('exit',()=>browserController.abort());child.once('error',()=>browserController.abort());
    const browserTask=openStudio(base,{env,signal:browserController.signal}).catch(()=>console.log('[观象] 请手动访问上面的工作室地址。'));
    const stop=signal=>{if(!child.killed)child.kill(signal);};
    const int=()=>stop('SIGINT'),term=()=>stop('SIGTERM');process.on('SIGINT',int);process.on('SIGTERM',term);
    try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>{if(code&&!signal)reject(new Error(`DSH Web 退出，状态码 ${code}`));else resolve();});});}
    finally{browserController.abort();await browserTask;process.off('SIGINT',int);process.off('SIGTERM',term);}
  }finally{try{unlinkSync(lock);}catch{}}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])launch().catch(error=>{console.error('[观象] '+error.message);process.exitCode=1;});
