import { lanAccess } from '../lib/network.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createApp } from '../lib/server.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
if(existsSync(root+'.env'))process.loadEnvFile(root+'.env');
const port=Number(process.env.PORT||3210),host=process.env.HOST||'0.0.0.0';
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT 必须为 1–65535 的整数');
const app=createApp({dataDir:process.env.FORTUNE_DATA_DIR||root+'.data'});
app.server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 已占用，请设置其他 PORT。`:error.message);app.store.close();process.exitCode=1;});
app.server.listen(port,host,()=>{
  console.log('\n  观象 · AI 命理工作室\n');
  console.log(`  本机访问：http://localhost:${port}`);
  const network=lanAccess(app.server.address());
  for(const url of network.urls)console.log(`  局域网：  ${url}`);
  if(!network.available)console.log(`  局域网：  ${network.reason}`);
  console.log('  本机和局域网设备打开地址即可使用。');
  console.log('  首次进入后，请在「设置与连接」配置 DeepSeek API Key。\n  关闭服务：Ctrl+C\n');
  if(!process.argv.includes('--no-open')){
    const url=`http://localhost:${port}/`;
    const command=process.platform==='win32'?'rundll32':process.platform==='darwin'?'open':'xdg-open';
    const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
    const browser=spawn(command,args,{stdio:'ignore',detached:true});browser.on('error',()=>console.log('  浏览器未自动打开，请使用上面的本机地址。'));browser.unref();
  }
});
let closing=false;
async function stop(){if(closing)return;closing=true;await app.close();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
