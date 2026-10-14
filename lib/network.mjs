import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
export function localInterfaces(){try{return Object.values(networkInterfaces()).flat();}catch{return [];}}

// Only advertise this machine's 192.168.* interfaces, using the actual listener
// port. Other adapters (VPN, containers, etc.) must not become share links.
export function lanAccess(listener, interfaces=localInterfaces()) {
  if(!listener || typeof listener==='string')return {urls:[],available:false,reason:'服务尚未启动'};
  const {address,port}=listener;
  if(address==='127.0.0.1'||address==='::1')return {urls:[],available:false,reason:'当前服务仅监听本机，局域网访问未开启'};
  const wildcard=address==='0.0.0.0'||address==='::';
  const addresses=[...new Set(interfaces.filter(n=>!n.internal && isIP(n.address)===4 && n.address.startsWith('192.168.') && (wildcard||n.address===address)).map(n=>n.address))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const urls=addresses.map(ip=>`http://${ip}:${port}`);
  return {urls,available:urls.length>0,reason:urls.length?'':'未检测到可用的 192.168.* 局域网地址，请检查网络连接和服务监听地址'};
}
