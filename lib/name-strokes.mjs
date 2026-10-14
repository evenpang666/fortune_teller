import { resolveChar, lookupChar, searchChars } from 'shunshi-kangxi-core';

export const STROKE_SOURCE={name:'shunshi-kangxi-core',version:'0.1.1',label:'离线字典 · 姓名学康熙笔画口径',url:'https://github.com/shunshi-ai/kangxi-mcp'};
const valid=value=>Number.isInteger(value)&&value>=1&&value<=64;
let conflicts;
function conflictingForms(){
  if(conflicts)return conflicts;
  conflicts=new Map();
  // Preserve disagreements instead of silently converting a character into a
  // different form with a different count. The dependency documents this caveat.
  for(const hit of searchChars({commonOnly:false,limit:25000})){
    const entry=lookupChar(hit.字);if(!entry?.t||entry.t===hit.字)continue;
    const traditional=lookupChar(entry.t);
    if(!traditional||!valid(entry.kx)||!valid(traditional.kx)||entry.kx===traditional.kx)continue;
    const pair=[{character:hit.字,strokes:entry.kx},{character:entry.t,strokes:traditional.kx}];
    for(const char of [hit.字,entry.t]){
      const rows=conflicts.get(char)||[];
      for(const candidate of pair)if(!rows.some(r=>r.character===candidate.character&&r.strokes===candidate.strokes))rows.push(candidate);
      conflicts.set(char,rows);
    }
  }
  return conflicts;
}
export function characterStrokes(char){
  const resolved=resolveChar(char);
  if(!resolved||!valid(resolved[1].kx))return {character:char,strokes:null,status:'missing',message:'字典未收录可用笔画，请手动核实'};
  const [key,entry]=resolved;const candidates=conflictingForms().get(char)||conflictingForms().get(key);
  if(candidates)return {character:char,strokes:null,status:'ambiguous',candidates,message:'字形对应的笔画有差异，请手动核实'};
  return {character:char,dictionaryCharacter:key,traditional:entry.t||key,strokes:entry.kx,status:'found'};
}
export function nameStrokes(surname,given){
  const surnameEntries=[...surname].map(characterStrokes),givenEntries=[...given].map(characterStrokes);
  return {surname:surnameEntries,given:givenEntries,complete:[...surnameEntries,...givenEntries].every(e=>e.status==='found'),source:STROKE_SOURCE};
}
