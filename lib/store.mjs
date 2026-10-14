import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const DEFAULT_CONFIG = { model: 'deepseek-flash', apiKey: '', pricing: { hit: 0.04, miss: 2, output: 8, currency: 'CNY', label: '2026-10-14 官方 Flash 高峰价估算（空闲时段通常减半）' } };
export function createStore(directory) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  const db = new DatabaseSync(join(directory,'readings.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS readings (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, method TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL)');
  // Interrupted requests must remain visible and retryable after restart.
  for(const row of db.prepare("SELECT id, data FROM readings WHERE status = 'analyzing'").all()) { const r=JSON.parse(row.data); r.status='error'; r.error='上次分析因服务重启中断；重试将发起新的 API 请求。'; r.updatedAt=new Date().toISOString(); db.prepare('UPDATE readings SET status=?, updated_at=?, data=? WHERE id=?').run(r.status,r.updatedAt,JSON.stringify(r),row.id); }
  const configPath=join(directory,'config.json'); let config;
  try { config={...DEFAULT_CONFIG,...JSON.parse(readFileSync(configPath,'utf8'))}; } catch(e) { if(e.code!=='ENOENT') throw new Error('配置文件损坏，请修复 .data/config.json'); config=structuredClone(DEFAULT_CONFIG); if(process.env.DEEPSEEK_MODEL==='deepseek-v4-pro'){config.model='deepseek-v4-pro';config.pricing={hit:.30,miss:9,output:27,currency:'CNY',label:'2026-10-14 官方 Pro 高峰价估算（空闲时段通常减半）'};} }
  function save(record) {record.updatedAt=new Date().toISOString();db.prepare('INSERT INTO readings VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, status=excluded.status, data=excluded.data').run(record.id,record.createdAt,record.updatedAt,record.method,record.status,JSON.stringify(record));return record;}
  return {
    config:()=>({...config,apiKey:process.env.DEEPSEEK_API_KEY||config.apiKey,model:process.env.DEEPSEEK_MODEL||config.model}),
    publicConfig:()=>({...config,apiKey:undefined,hasKey:Boolean(process.env.DEEPSEEK_API_KEY||config.apiKey),keyFromEnv:Boolean(process.env.DEEPSEEK_API_KEY),modelFromEnv:Boolean(process.env.DEEPSEEK_MODEL),model:process.env.DEEPSEEK_MODEL||config.model}),
    updateConfig(next) { config={...config,...next};const tmp=configPath+'.tmp';writeFileSync(tmp,JSON.stringify(config,null,2),{mode:0o600});chmodSync(tmp,0o600);renameSync(tmp,configPath);return this.publicConfig(); },
    create(data) {return save({...data,id:randomUUID(),createdAt:new Date().toISOString(),status:'prepared',report:null,usage:null,cost:null});},
    save,
    get(id) {const row=db.prepare('SELECT data FROM readings WHERE id=?').get(id);return row?JSON.parse(row.data):null;},
    list({search='',method='',limit=200,offset=0}={}) {return db.prepare('SELECT data FROM readings ORDER BY created_at DESC').all().map(r=>JSON.parse(r.data)).filter(r=>(!method||r.method===method)&&(!search||`${r.chart.title} ${r.input.question} ${r.report||''}`.toLowerCase().includes(search.toLowerCase()))).slice(offset,offset+limit);},
    delete(id) {return db.prepare('DELETE FROM readings WHERE id=?').run(id).changes>0;},
    close() {db.close();},
  };
}
