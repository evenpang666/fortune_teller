import { readdirSync,readFileSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { METHODS } from '../lib/methods.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git','.data'].includes(e.name))continue;const p=join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(mjs|js)$/.test(p)){const result=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);}}}
walk(root);
const pkg=JSON.parse(readFileSync(join(root,'package.json')));
for(const p of Object.values(pkg.exports)){if(p.includes('*'))continue;if(!existsSync(join(root,p)))throw new Error('缺少导出文件：'+p);}
for(const m of METHODS){const skill=readFileSync(join(root,'skills',m.skill,'SKILL.md'),'utf8');if(!skill.startsWith(`---\nname: ${m.skill}\ndescription: `))throw new Error('Skill 元数据不正确：'+m.skill);}
console.log('所有 JavaScript 语法、插件导出与 8 个 Skill 元数据检查通过。');
