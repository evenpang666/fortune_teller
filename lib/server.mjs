import { createServer as httpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { localInterfaces, lanAccess, dshLanAccess } from './network.mjs';
import { METHODS } from './methods.mjs';
import { makeChart, lookupNameStrokes, InputError, textField } from './rules.mjs';
import { createStore } from './store.mjs';
import { dailyFortune } from './daily.mjs';

const PUBLIC=fileURLToPath(new URL('../public/',import.meta.url));
export function createApp({dataDir=fileURLToPath(new URL('../.data/',import.meta.url)),analyzeImpl=async()=>{throw new InputError('请通过 DSH Web 插件启动观象',503);},generation,basePath:mountPath='',instanceId,connection:hostConnection,webServer:hostServer,independent}={}) {
  const store=createStore(dataDir); const active=new Map();
  const hosts=new Set(['localhost','127.0.0.1','[::1]',...localInterfaces().map(n=>n.family==='IPv6'?`[${n.address}]`:n.address)]);
  function publicConfig(webServer){return {...store.publicConfig(),pricingModel:store.config().model,...(generation?.publicConfig()||{}),network:independent?.port?lanAccess(server.address()):webServer?dshLanAccess(webServer):lanAccess(server.address())};}
  function json(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
  async function body(req) {let str='';for await(const chunk of req){str+=chunk;if(Buffer.byteLength(str)>32768)throw new InputError('请求过大',413);}try{return JSON.parse(str||'{}');}catch{throw new InputError('JSON 数据无效');}}
  const handler=async(req,res)=>{
    const standalone=Boolean(independent?.port) && independent.port===req.socket.localPort;
    const connection=standalone?null:hostConnection, webServer=standalone?null:hostServer;
    const basePath=standalone&&!req.url.startsWith(mountPath+'/')?'':mountPath;
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const requestPath=new URL(req.url,'http://localhost').pathname;
      if(requestPath===basePath+'/health' && req.method==='GET'){json(res,200,{name:'dsh-fortuneteller',apiVersion:1,instanceId,...(independent?.port?{url:`http://127.0.0.1:${independent.port}/`}:{})});return;}
      if(connection){
        if([basePath,basePath+'/',basePath+'/index.html'].includes(requestPath)){
          // DSH authenticates a root index. Adapt only the mount and redirect so
          // the browser receives the same DSH cookie while staying in the studio.
          const indexRequest={method:req.method,headers:req.headers,url:'/'+new URL(req.url,'http://localhost').search};
          const indexResponse={writeHead(status,headers={}){return res.writeHead(status,{...headers,...(status===303?{location:basePath+'/'}:{})});},end:data=>res.end(data)};
          if(!connection.authorizeIndex(indexRequest,indexResponse))return;
        }
        else {const rejection=connection.requestRejection(req);if(rejection)throw new InputError(rejection===401?'请先登录 DSH Web，再打开观象。':'DSH 拒绝了此请求来源。',rejection);}
      }
      const authority=req.headers.host??''; const hostname=authority.startsWith('[')?authority.slice(0,authority.indexOf(']')+1):authority.split(':')[0];
      if((!connection||standalone)&&!hosts.has(hostname)) throw new InputError('不支持的访问地址，请使用 localhost 或本机局域网 IP',403);
      if((!connection||standalone)&&req.headers.origin && req.headers.origin!==`http://${authority}`)throw new InputError('请求来源不匹配',403);
      const url=new URL(req.url,`http://${authority}`); let path=url.pathname;
      if(basePath){if(path!==basePath&&!path.startsWith(basePath+'/'))throw new InputError('页面不存在',404);path=path.slice(basePath.length)||'/';}
      if(path.startsWith('/api/')) {
        if(path==='/api/name-strokes'&&req.method==='POST'){json(res,200,lookupNameStrokes(await body(req)));return;}
        if(path==='/api/methods'&&req.method==='GET'){json(res,200,METHODS);return;}
        if(path==='/api/daily'&&req.method==='GET'){json(res,200,dailyFortune());return;}
        if(path==='/api/config'&&req.method==='GET'){json(res,200,publicConfig(webServer));return;}
        if(path==='/api/config'&&req.method==='PUT'){
          const input=await body(req);const next={};
          if(generation&&(input.apiKey!==undefined||input.model!==undefined))throw new InputError('请在 DSH Web 的模型设置中修改密钥和模型');
          if(input.apiKey!==undefined)next.apiKey=textField(input.apiKey,'API Key',{required:false,max:256});
          if(input.model!==undefined){if(!['deepseek-flash','deepseek-v4-pro'].includes(input.model))throw new InputError('不支持的模型');next.model=input.model;}
          if(input.pricing!==undefined){const p=input.pricing;if(!p||['hit','miss','output'].some(k=>typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<0||p[k]>10000))throw new InputError('价格必须是有效非负数');next.pricing={hit:p.hit,miss:p.miss,output:p.output,currency:'CNY',label:textField(p.label||'自定义人民币单价','价格说明',{max:150})};}
          if(generation&&next.pricing)next.model=generation.publicConfig().model;
          store.updateConfig(next);json(res,200,publicConfig(webServer));return;
        }
        if(path==='/api/readings'&&req.method==='GET'){
          const offset=Number(url.searchParams.get('offset')||0);
          if(!Number.isSafeInteger(offset)||offset<0)throw new InputError('分页参数无效');
          json(res,200,store.list({search:url.searchParams.get('search')||'',method:url.searchParams.get('method')||'',offset}));return;
        }
        if(path==='/api/readings'&&req.method==='POST'){const data=await body(req);json(res,201,store.create(makeChart(data.method,data.input)));return;}
        const match=path.match(/^\/api\/readings\/([a-f0-9-]{36})(\/analyze)?$/);
        if(match){const id=match[1];const record=store.get(id);if(!record)throw new InputError('记录不存在',404);
          if(!match[2]&&req.method==='GET'){json(res,200,record);return;}
          if(!match[2]&&req.method==='DELETE'){if(active.has(id))throw new InputError('分析中的记录暂不能删除',409);store.delete(id);json(res,200,{ok:true});return;}
          if(match[2]&&req.method==='POST'){
            if(record.status==='complete'){json(res,200,{...record,cached:true});return;}
            if(active.has(id))throw new InputError('该记录正在分析，请稍候',409);
            if(active.size>=3)throw new InputError('当前已有三条分析请求，请稍后再试',429);
            const config={...store.config(),pricingModel:store.config().model,...(generation?.publicConfig()||{})};if(!generation&&!config.apiKey)throw new InputError('请先在设置中填写 DeepSeek API Key',422);
            const controller=new AbortController();let settled;controller.done=new Promise(resolve=>{settled=resolve;});active.set(id,controller);record.status='analyzing';record.error=null;store.save(record);
            const timeout=setTimeout(()=>controller.abort(),120000);
            try {Object.assign(record,await (generation?.analyze||analyzeImpl)(record,config,{signal:controller.signal}));record.status='complete';record.completedAt=new Date().toISOString();store.save(record);json(res,200,record);}
            catch(e){record.status='error';record.error=e instanceof InputError?e.message:'分析失败，请稍后重试';store.save(record);throw e;}
            finally{clearTimeout(timeout);active.delete(id);settled();}
            return;
          }
        }
        throw new InputError('接口不存在',404);
      }
      if(req.method!=='GET'&&req.method!=='HEAD')throw new InputError('不支持的请求方式',405);
      const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/icon.svg':'icon.svg'};
      if(!files[path])throw new InputError('页面不存在',404);
      let data=await readFile(PUBLIC+files[path]);
      if(basePath&&files[path]==='index.html')data=Buffer.from(data.toString().replaceAll('href="/','href="'+basePath+'/').replaceAll('src="/','src="'+basePath+'/'));res.writeHead(200,{'Content-Type':({'html':'text/html','js':'text/javascript','css':'text/css','svg':'image/svg+xml'}[files[path].split('.').at(-1)])+'; charset=utf-8','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
    }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e instanceof InputError?e.message:'本地服务发生错误，请检查启动窗口。'});else res.end();}
  };
  const server=httpServer(handler);
  let closing;
  function close(){return closing??= (async()=>{const controllers=[...active.values()];for(const controller of controllers)controller.abort();await Promise.allSettled(controllers.map(c=>c.done));if(server.listening)await new Promise(resolve=>server.close(resolve));store.close();})();}
  return {server,handler,store,close};
}
