import { mkdirSync, writeFileSync, readFileSync, renameSync, unlinkSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

export function browserLaunchPath(root,port) {return join(root,'.data',`browser-${Number(port)}.json`);}
export function registerBrowserLaunch(root,{port,instanceId,connection}) {
  const url=new URL(connection.authenticatedUrl(`http://127.0.0.1:${port}/`));
  url.pathname='/fortuneteller/';
  const path=browserLaunchPath(root,port),temporary=path+`.${process.pid}.tmp`;
  mkdirSync(join(root,'.data'),{recursive:true,mode:0o700});
  writeFileSync(temporary,JSON.stringify({instanceId,url:url.href}),{mode:0o600});
  chmodSync(temporary,0o600);renameSync(temporary,path);
  return ()=>{try{if(JSON.parse(readFileSync(path,'utf8')).instanceId===instanceId)unlinkSync(path);}catch{}};
}
export function studioLaunchUrl(root,base,instanceId) {
  const target=new URL(base);target.pathname='/fortuneteller/';
  try {
    const record=JSON.parse(readFileSync(browserLaunchPath(root,target.port||80),'utf8'));
    const saved=new URL(record.url);
    if(instanceId&&record.instanceId===instanceId&&saved.hostname==='127.0.0.1'&&saved.protocol==='http:'&&saved.port===target.port&&saved.pathname==='/fortuneteller/'&&saved.searchParams.getAll('token').length===1&&!saved.username&&!saved.password) {
      target.searchParams.set('token',saved.searchParams.get('token'));
    }
  }catch{}
  return target.href;
}
