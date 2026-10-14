import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './lib/server.mjs';
import { METHODS } from './lib/methods.mjs';
import { lanAccess } from './lib/network.mjs';

export const name='fortuneteller';
export async function apply(ctx,config={}) {
  const port=Number(config.port??process.env.FORTUNE_PORT??3210);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('观象插件端口无效');
  let app;
  ctx.effect(()=>{
    app=createApp({dataDir:config.dataDir||process.env.FORTUNE_DATA_DIR||resolve(process.cwd(),'.data','fortuneteller')});
    return ()=>app.close();
  },'fortuneteller: local web server');
  await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(port,config.host||'0.0.0.0',()=>{app.server.removeListener('error',reject);resolve();});});
  ctx.inject(['skills'],scope=>{
    for(const method of METHODS){
      const path=fileURLToPath(new URL(`./skills/${method.skill}/SKILL.md`,import.meta.url));
      const text=readFileSync(path,'utf8'); const description=text.match(/^description: (.+)$/m)?.[1]||method.description;
      scope.skills.register({name:method.skill,description,content:text.replace(/^---\n[\s\S]*?\n---\n/,''),source:'bundled',path,resourceBase:{kind:'directory',path:dirname(path)}});
    }
  });
  const network=lanAccess(app.server.address());
  console.log(`\n[观象] 本地 Web 工作室：http://localhost:${port}\n[观象] 本机和局域网设备打开地址即可使用。`);
  for(const url of network.urls)console.log(`[观象] 局域网访问：${url}`);
  if(!network.available)console.log(`[观象] ${network.reason}`);
}
