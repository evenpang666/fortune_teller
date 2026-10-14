import test from 'node:test';
import assert from 'node:assert/strict';
import { lanAccess } from '../lib/network.mjs';

const interfaces=[
  {address:'127.0.0.1',internal:true},
  {address:'192.168.124.62',internal:false},
  {address:'10.85.44.21',internal:false},
  {address:'172.17.0.1',internal:false},
  {address:'fe80::1',internal:false},
  {address:'192.168.124.62',internal:false},
];
test('局域网提示仅使用本机192.168网卡与实际服务端口',()=>{
  const network=lanAccess({address:'0.0.0.0',port:4321},interfaces);
  assert.deepEqual(network.urls,['http://192.168.124.62:4321']);
  assert.equal(network.available,true);
});
test('监听本机或其他网卡时不提供无法使用的192.168链接',()=>{
  for(const address of ['127.0.0.1','::1','10.85.44.21']){
    const network=lanAccess({address,port:3210},interfaces);
    assert.deepEqual(network.urls,[]);assert.equal(network.available,false);assert.ok(network.reason);
  }
  assert.deepEqual(lanAccess({address:'192.168.124.62',port:3210},interfaces).urls,['http://192.168.124.62:3210']);
});
test('没有192.168网卡时不回退到其他网段或虚构地址',()=>{
  const network=lanAccess({address:'0.0.0.0',port:3210},[{address:'10.85.44.21',internal:false}]);
  assert.deepEqual(network.urls,[]);assert.match(network.reason,/未检测到/);
  assert.equal(lanAccess(null,interfaces).available,false);
});
