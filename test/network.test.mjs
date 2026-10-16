import test from 'node:test';
import assert from 'node:assert/strict';
import { lanAccess, dshLanAccess } from '../lib/network.mjs';

const interfaces=[
  {address:'127.0.0.1',internal:true},
  {address:'192.168.124.62',internal:false},
  {address:'10.85.44.21',internal:false},
  {address:'172.17.0.1',internal:false},
  {address:'fe80::1',internal:false},
  {address:'192.168.124.62',internal:false},
];
test('局域网提示使用本机私有地址与实际服务端口',()=>{
  const network=lanAccess({address:'0.0.0.0',port:4321},interfaces);
  assert.deepEqual(network.urls,['http://10.85.44.21:4321','http://172.17.0.1:4321','http://192.168.124.62:4321']);
  assert.equal(network.available,true);
});
test('监听本机或其他网卡时不提供无法使用的192.168链接',()=>{
  for(const address of ['127.0.0.1','::1']){
    const network=lanAccess({address,port:3210},interfaces);
    assert.deepEqual(network.urls,[]);assert.equal(network.available,false);assert.ok(network.reason);
  }
  assert.deepEqual(lanAccess({address:'192.168.124.62',port:3210},interfaces).urls,['http://192.168.124.62:3210']);
});
test('没有192.168网卡时支持其他私有网段，不虚构地址',()=>{
  const network=lanAccess({address:'0.0.0.0',port:3210},[{address:'10.85.44.21',internal:false}]);
  assert.deepEqual(network.urls,['http://10.85.44.21:3210']);assert.equal(network.reason,'');
  assert.equal(lanAccess(null,interfaces).available,false);
});

const adapters=[
  {name:'lo',address:'127.0.0.1',internal:true},
  {name:'utun7',address:'10.85.43.8',internal:false},
  {name:'docker0',address:'172.17.0.1',internal:false},
  {name:'vEthernet (WSL)',address:'192.168.40.1',internal:false},
  {name:'wlan0',address:'192.168.99.20',internal:false},
  {name:'enp8s0',address:'192.168.124.62',internal:false},
  {name:'enp8s0',address:'fe80::1',internal:false},
];
test('DSH 优先展示以太网 IP 和实际端口，排除虚拟网卡与无线网卡',()=>{
  const network=dshLanAccess({host:'0.0.0.0',port:4567},adapters);
  assert.deepEqual(network,{available:true,urls:['http://192.168.124.62:4567/fortuneteller/'],reason:''});
});
test('DSH 仅监听本机时仍展示检测到的 IP，并说明需在宿主开启局域网访问',()=>{
  const network=dshLanAccess({host:'127.0.0.1',port:3080},adapters);
  assert.deepEqual(network.urls,['http://192.168.124.62:3080/fortuneteller/']);
  assert.equal(network.available,true);assert.match(network.reason,/仅监听本机.*DSH Web/);
});
test('DSH 支持其他私有网段的以太网，未接网线时回退到无线网卡',()=>{
  assert.deepEqual(dshLanAccess({host:'0.0.0.0',port:3080},[
    {name:'Ethernet 2',address:'10.20.30.40',internal:false},
    ...adapters.filter(n=>n.name!=='enp8s0'),
  ]).urls,['http://10.20.30.40:3080/fortuneteller/']);
  assert.deepEqual(dshLanAccess({host:'0.0.0.0',port:3080},adapters.filter(n=>n.name!=='enp8s0')).urls,['http://192.168.99.20:3080/fortuneteller/']);
});
test('DSH 只有虚拟网卡时不展示错误地址',()=>{
  const network=dshLanAccess({host:'0.0.0.0',port:3080},adapters.filter(n=>!['enp8s0','wlan0'].includes(n.name)));
  assert.deepEqual(network.urls,[]);assert.equal(network.available,false);assert.match(network.reason,/未检测到/);
});
