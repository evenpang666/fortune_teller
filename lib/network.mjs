import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
export function localInterfaces(){try{return Object.entries(networkInterfaces()).flatMap(([name,entries])=>(entries||[]).map(entry=>({...entry,name})));}catch{return [];}}

const virtualAdapter=/vmware|virtual|vbox|docker|wsl|vethernet|hyper-v|loopback|utun|tun|tap|tailscale|zerotier|wireguard|^br-|^virbr|^veth/i;
const ethernetAdapter=/以太网|ethernet|^eth\d|^en(?:\d|[opsx])/i;
const privateAddress=/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/;

// Show the host's LAN entry point; DSH still owns binding and authentication.
export function dshLanAccess(webServer,interfaces=localInterfaces()) {
  const candidates=interfaces.filter(n=>!n.internal&&isIP(n.address)===4&&privateAddress.test(n.address)&&!virtualAdapter.test(n.name||''));
  const ethernet=candidates.filter(n=>ethernetAdapter.test(n.name||''));
  const addresses=[...new Set((ethernet.length?ethernet:candidates).map(n=>n.address))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const urls=addresses.map(ip=>`http://${ip}:${webServer.port}/fortuneteller/`);
  const loopback=['127.0.0.1','::1'].includes(webServer.host||'127.0.0.1');
  return {urls,available:urls.length>0,reason:urls.length?(loopback?'当前 DSH Web 仅监听本机，请在 DSH Web 中开启局域网访问':''):'未检测到可用的以太网或无线局域网 IPv4 地址'};
}

// Advertise real private LAN interfaces using the actual listener port.
// Exclude virtual/VPN adapters from share links.
export function lanAccess(listener, interfaces=localInterfaces()) {
  if(!listener || typeof listener==='string')return {urls:[],available:false,reason:'服务尚未启动'};
  const {address,port}=listener;
  if(address==='127.0.0.1'||address==='::1')return {urls:[],available:false,reason:'当前服务仅监听本机，局域网访问未开启'};
  const wildcard=address==='0.0.0.0'||address==='::';
  const addresses=[...new Set(interfaces.filter(n=>!n.internal && isIP(n.address)===4 && privateAddress.test(n.address) && !virtualAdapter.test(n.name||'') && (wildcard||n.address===address)).map(n=>n.address))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const urls=addresses.map(ip=>`http://${ip}:${port}`);
  return {urls,available:urls.length>0,reason:urls.length?'':'未检测到可用的私有局域网地址，请检查网络连接和服务监听地址'};
}
