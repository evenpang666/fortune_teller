import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { registerBrowserLaunch } from './lib/browser-launch.mjs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './lib/server.mjs';
import { METHODS } from './lib/methods.mjs';
import { listenIndependent } from './lib/independent-http.mjs';
import { lanAccess } from './lib/network.mjs';
import { createDshGeneration } from './lib/dsh.mjs';

export const name='fortuneteller';
export const inject=['llm','agentDefaultModel','webServer','connection'];
export async function apply(ctx,config={}) {
  const basePath='/fortuneteller',instanceId=randomUUID();
  let app;
  const independent={};
  ctx.effect(()=>{
    app=createApp({dataDir:config.dataDir||process.env.FORTUNE_DATA_DIR||fileURLToPath(new URL('./.data/',import.meta.url)),generation:createDshGeneration(ctx),basePath,instanceId,independent,connection:ctx.connection,webServer:ctx.webServer});
    return ()=>app.close();
  },'fortuneteller: studio storage and generation');
  independent.port=await listenIndependent(app.server,config.port??process.env.FORTUNE_PORT??3100);
  ctx.effect(()=>ctx.webServer.register({kind:'prefix',path:basePath,handler:app.handler}),'fortuneteller: authenticated web route');
  ctx.effect(()=>registerBrowserLaunch(fileURLToPath(new URL('./',import.meta.url)),{port:ctx.webServer.port,instanceId,connection:ctx.connection}),'fortuneteller: private browser handoff');
  ctx.inject(['skills'],scope=>{
    for(const method of METHODS){
      const path=fileURLToPath(new URL(`./skills/${method.skill}/SKILL.md`,import.meta.url));
      const text=readFileSync(path,'utf8'); const description=text.match(/^description: (.+)$/m)?.[1]||method.description;
      scope.skills.register({name:method.skill,description,content:text.replace(/^---\n[\s\S]*?\n---\n/,''),source:'bundled',path,resourceBase:{kind:'directory',path:dirname(path)}});
    }
  });
  const network=lanAccess(app.server.address());
  console.log([
    '[DSH 插件] 观象 (fortuneteller) · 已加载',
    `[DSH 插件]   本机：http://127.0.0.1:${independent.port}/`,
    ...network.urls.map(url=>`[DSH 插件]   局域网：${url}`),
    ...(network.reason?[`[DSH 插件]   访问：${network.reason}`]:[]),
    '[DSH 插件]   生成：复用 DSH 默认模型与凭据',
  ].join('\n'));
}
