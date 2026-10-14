import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { SkillService } from '@deepseek-ai/dsh-skill';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import * as plugin from '../index.mjs';

test('真实 Cordis 与 DSH Skill 服务挂载八个Skill，卸载清理注册和HTTP监听',async()=>{
  const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const dir=mkdtempSync(join(tmpdir(),'gx-plugin-'));const ctx=new Context();
  try{
    await ctx.plugin(SkillService);
    const fiber=ctx.plugin(plugin,{port,host:'127.0.0.1',dataDir:dir});await fiber;
    const list=await ctx.skills.list();assert.equal(list.length,8);
    const loaded=await ctx.skills.get('fortune-bazi');assert.match(loaded.content,/立春/);assert.ok(loaded.invocation.modelInvocable);
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status,200);
    await fiber.dispose();assert.equal((await ctx.skills.list()).length,0);
    await assert.rejects(fetch(`http://127.0.0.1:${port}/`));
  }finally{await ctx.fiber.dispose();rmSync(dir,{recursive:true,force:true});}
});
