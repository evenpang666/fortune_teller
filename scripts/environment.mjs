import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync, readdirSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname, resolve, delimiter, basename } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ensureDshVersion } from './dsh-version.mjs';

export const MIN_NODE='22.13.0';
const validVersion=value=>typeof value==='string'&&/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
export function versionAtLeast(actual,required) {
  if(!validVersion(actual?.replace(/^v/,'')))return false;
  return compareVersions(actual.replace(/^v/,''),required)>=0;
}
export function compareVersions(a,b) {
  const [ac,ap]=a.replace(/^v/,'').split('-'),[bc,bp]=b.replace(/^v/,'').split('-');
  const an=ac.split('.').map(Number),bn=bc.split('.').map(Number);
  for(let i=0;i<3;i++)if(an[i]!==bn[i])return Math.sign(an[i]-bn[i]);
  if(ap===bp)return 0;if(!ap)return 1;if(!bp)return -1;
  return ap.localeCompare(bp,undefined,{numeric:true});
}
function expandHome(path) {return path.replace(/^~(?=$|[/\\])/,homedir());}
export function profileDirectory(env=process.env) {
  return join(resolve(expandHome(env.DSH_HOME?.trim()||join(homedir(),'.dsh'))),'profiles','web');
}
function pathDirectories(env) {
  return (env.PATH??env.Path??env.path??'').split(delimiter).filter(Boolean).map(p=>p.replace(/^"(.*)"$/,'$1'));
}
function cliEntries(name,packageName,entries,env) {
  const found=[];
  for(const directory of pathDirectories(env)) {
    for(const suffix of process.platform==='win32'?['.cmd','.exe','.ps1','']:['']) {
      const command=join(directory,name+suffix);
      try {
        const bin=realpathSync(command);
        const fd=openSync(bin,'r');const prefix=Buffer.alloc(256);try{readSync(fd,prefix,0,prefix.length,0);}finally{closeSync(fd);}
        if(/\.[cm]?js$/i.test(bin)||/^#![^\r\n]*\bnode\b/.test(prefix.toString()))found.push({bin,pathDir:directory});
        else {
          for(const entry of entries){const adjacent=join(directory,'node_modules',packageName,entry);if(existsSync(adjacent))found.push({bin:adjacent,pathDir:directory});}
          if(name==='pnpm'&&(process.platform!=='win32'||/\.exe$/i.test(bin)))found.push({bin:command,pathDir:directory,native:true});
        }
      }catch{}
    }
  }
  return found;
}
export function npmInvocation(args,env=process.env) {
  const candidates=[env.npm_execpath,...cliEntries('npm','npm',['bin/npm-cli.js'],env).map(c=>c.bin),
    join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),
    resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')];
  const cli=candidates.find(p=>p&&existsSync(p));
  if(!cli)throw new Error('找不到 npm，请使用包含 npm 的 Node 安装。');
  return [process.execPath,[cli,...args]];
}
export function run(command,args,options={}) {
  if(command==='npm')[command,args]=npmInvocation(args,options.env);
  const result=spawnSync(command,args,{stdio:'inherit',...options});
  if(result.error||result.status!==0)throw new Error(`${command} 执行失败（${result.error?.code||result.status}），请查看上面的具体错误。`);
  return result;
}
function packageAt(directory) {
  try {
    const pkg=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));
    const bin=join(directory,'lib','bin.js');
    if(pkg.name==='@deepseek-ai/dsh'&&validVersion(pkg.version)&&existsSync(bin))return {directory,bin,version:pkg.version};
  }catch{}
  return null;
}
export function sharedRuntimeRoots(root,env=process.env) {
  const home=resolve(profileDirectory(env),'../..');
  const roots=[];
  try{for(const name of readdirSync(join(home,'runtimes')))roots.push(join(home,'runtimes',name,'current'));}catch{}
  // Match the existing launchers without importing their code or reading their keys.
  for(const project of ['whereto','tldr_bookshop']) {
    const path=join(dirname(root),project);
    roots.push(path,join(path,'.local','runtime'));
  }
  return roots;
}
export function findDsh(root,env=process.env) {
  const explicit=env.DSH_CLI?.trim()||env.DSH_BIN?.trim();
  if(explicit) {
    let bin;try{bin=realpathSync(resolve(expandHome(explicit)));}catch{}
    const found=bin&&packageAt(resolve(dirname(bin),'..'));
    if(!found)throw new Error('DSH_CLI / DSH_BIN 必须指向已安装 DSH 的 lib/bin.js。');
    return found;
  }
  const shared=[];
  for(const entry of cliEntries('dsh','@deepseek-ai/dsh',['lib/bin.js'],env)) {
    const found=packageAt(resolve(dirname(entry.bin),'..'));if(found)return found;
  }
  for(const path of sharedRuntimeRoots(root,env)) {
    const found=packageAt(join(path,'node_modules','@deepseek-ai','dsh'));if(found)shared.push(found);
  }
  // PATH is authoritative; existing shared/local runtimes are fallback only.
  if(shared.length)return shared[0];
  const local=[];
  try{const {version}=JSON.parse(readFileSync(join(root,'.data','runtime','active.json'),'utf8'));if(validVersion(version))local.push(join(root,'.data','runtime','versions',version,'node_modules','@deepseek-ai','dsh'));}catch{}
  local.push(join(root,'node_modules','@deepseek-ai','dsh'),join(root,'.data','runtime','node_modules','@deepseek-ai','dsh'));
  return local.map(packageAt).find(Boolean)||null;
}
function metadataField(text,key) {
  try{return JSON.parse(text)[key];}catch{}
  const value=text.match(new RegExp(`^\\s*["']?${key}["']?\\s*:\\s*(.+?)\\s*,?\\s*$`,'m'))?.[1];
  if(!value)return undefined;
  try{return JSON.parse(value.replace(/,$/,''));}catch{return value.replace(/^['"]|['"]$/g,'');}
}
export function profileTools(profile) {
  let modules='',manifest={};
  try{modules=readFileSync(join(profile,'node_modules','.modules.yaml'),'utf8');}catch{}
  try{manifest=JSON.parse(readFileSync(join(profile,'package.json'),'utf8'));}catch{}
  const manager=metadataField(modules,'packageManager')||manifest.packageManager;
  const version=typeof manager==='string'?manager.match(/^pnpm@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)?.[1]:undefined;
  const store=metadataField(modules,'storeDir');
  return {version,storeDir:typeof store==='string'?store:undefined};
}
export function ensurePnpm(root,dsh,{env=process.env,exec=run,spawnImpl=spawnSync}={}) {
  const tools=profileTools(profileDirectory(env));
  const requiredMajor=tools.version?.split('.')[0];
  const compatible=version=>validVersion(version)&&(!requiredMajor||version.split('.')[0]===requiredMajor);
  const candidates=cliEntries('pnpm','pnpm',['bin/pnpm.cjs','bin/pnpm.mjs'],env);
  const prefixes=[...sharedRuntimeRoots(root,env),resolve(dsh.directory,'../../..'),join(root,'.data','runtime')];
  if(tools.version)prefixes.push(join(root,'.data','tools',`pnpm-${tools.version}`));
  for(const prefix of prefixes) {
    for(const entry of ['bin/pnpm.cjs','bin/pnpm.mjs']) {
      const bin=join(prefix,'node_modules','pnpm',entry);
      if(existsSync(bin))candidates.push({bin,pathDir:join(prefix,'node_modules','.bin')});
    }
  }
  let selected;
  for(const candidate of candidates) {
    const probe=spawnImpl(candidate.native?candidate.bin:process.execPath,candidate.native?['--version']:[candidate.bin,'--version'],{encoding:'utf8',env,timeout:15000,windowsHide:true});
    const version=probe.stdout?.trim();
    if(probe.status===0&&compatible(version)){selected={...candidate,version};break;}
  }
  if(!selected) {
    const version=tools.version||'latest';
    const prefix=join(root,'.data','tools',`pnpm-${version}`);
    console.log(`[环境] 补齐 pnpm ${version}${tools.version?'（匹配已有 DSH profile）':''}…`);
    exec('npm',['install','--prefix',prefix,'--no-audit','--no-fund',`pnpm@${version}`],{cwd:root,env});
    for(const entry of ['bin/pnpm.cjs','bin/pnpm.mjs']) {
      const bin=join(prefix,'node_modules','pnpm',entry);if(!existsSync(bin))continue;
      const probe=spawnImpl(process.execPath,[bin,'--version'],{encoding:'utf8',env,timeout:15000,windowsHide:true});
      const version=probe.stdout?.trim();
      if(probe.status===0&&compatible(version)){selected={bin,pathDir:join(prefix,'node_modules','.bin'),version};break;}
    }
    if(!selected)throw new Error('未找到与 DSH profile 匹配的可运行 pnpm；未重建共享 node_modules。');
  }
  // Only this child environment changes; no global pnpm configuration is written.
  const childEnv={...env,PATH:[selected.pathDir,...pathDirectories(env)].join(delimiter)};
  if(tools.storeDir){
    // modules metadata stores the versioned path; pnpm's option takes its parent.
    const storeRoot=/^v\d+$/.test(basename(tools.storeDir))?dirname(tools.storeDir):tools.storeDir;
    delete childEnv.NPM_CONFIG_STORE_DIR;childEnv.npm_config_store_dir=storeRoot;
    childEnv.PNPM_CONFIG_STORE_DIR=storeRoot;
  }
  console.log(`[环境] 复用 pnpm ${selected.version}${tools.storeDir?` · store ${tools.storeDir}`:''}`);
  return {pnpm:selected,env:childEnv};
}
export function ensureEnvironment(root,{env=process.env,exec=run,spawnImpl=spawnSync,upgrade=ensureDshVersion}={}) {
  if(!versionAtLeast(process.versions.node,MIN_NODE))throw new Error(`需要 Node.js >= ${MIN_NODE}，请使用 start.sh / start.bat 自动安装兼容版本。`);
  env={...env,PATH:[dirname(process.execPath),...pathDirectories(env)].join(delimiter)};
  const stateDir=join(root,'.data');mkdirSync(stateDir,{recursive:true});
  const fingerprint=createHash('sha256').update(readFileSync(join(root,'package-lock.json'))).update(process.version+process.platform+process.arch).digest('hex');
  const stamp=join(stateDir,'environment.json');let previous={};try{previous=JSON.parse(readFileSync(stamp,'utf8'));}catch{}
  let dependenciesReady=true;
  const require=createRequire(join(root,'package.json'));
  const dependencies=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).dependencies||{};
  for(const [name,version] of Object.entries(dependencies))try {
    let directory=dirname(require.resolve(name));
    while(!existsSync(join(directory,'package.json'))&&dirname(directory)!==directory)directory=dirname(directory);
    if(JSON.parse(readFileSync(join(directory,'package.json'),'utf8')).version!==version)dependenciesReady=false;
  }catch{dependenciesReady=false;}
  if(!dependenciesReady||(previous.fingerprint&&previous.fingerprint!==fingerprint)) {
    console.log('[环境] 安装或同步观象项目依赖…');exec('npm',['ci','--omit=dev','--no-audit','--no-fund'],{cwd:root,env});
  }
  let dsh=findDsh(root,env);
  const checked=upgrade({cli:dsh?.bin,version:dsh?.version,npm:npmInvocation([],env)[1][0],env,run:spawnImpl});
  if(checked.cli!==dsh?.bin)dsh=packageAt(resolve(dirname(checked.cli),'..'));
  if(!dsh)throw new Error('DSH 更新后无法读取安装信息。');
  console.log(`[环境] 复用 Node ${process.versions.node} · DSH ${dsh.version}\n[环境] DSH 入口：${dsh.bin}`);
  const pnpm=ensurePnpm(root,dsh,{env,exec,spawnImpl});
  writeFileSync(stamp,JSON.stringify({fingerprint},null,2));
  return {dsh,env:pnpm.env,pnpm:pnpm.pnpm};
}
export function pluginInstalled(root,profile) {
  try {
    const manifest=JSON.parse(readFileSync(join(profile,'package.json'),'utf8'));
    return manifest.dsh?.profile?.bundles?.includes('dsh-fortuneteller')&&realpathSync(join(profile,'node_modules','dsh-fortuneteller'))===realpathSync(root);
  }catch{return false;}
}
