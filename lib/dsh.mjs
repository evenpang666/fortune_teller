import { randomUUID } from 'node:crypto';
import { buildMessages, estimateCost } from './deepseek.mjs';
import { InputError } from './rules.mjs';

// DSH owns endpoint selection, credentials, and provider protocol translation.
export function createDshGeneration(ctx) {
  function selection() {
    const current=ctx.agentDefaultModel.currentSelection();
    return {provider:current.provider,model:current.model,...(current.reasoningEffort?{reasoningEffort:current.reasoningEffort}:{})};
  }
  return {
    publicConfig() {
      const current=selection();
      return {generation:'dsh',hasKey:ctx.llm.listProviders().some(p=>p.id===current.provider),keyManagedBy:'dsh',modelFromEnv:true,...current};
    },
    async analyze(record,config,{signal}={}) {
      const current=selection();
      const [system,user]=buildMessages(record);
      let report='',usage=null,finish;
      try {
        for await(const chunk of ctx.llm.stream({...current,system:system.content,messages:[{id:randomUUID(),role:'user',source:{kind:'user'},content:[{type:'text',text:user.content}]}],maxTokens:4096,signal})) {
          if(chunk.type==='text-delta')report+=chunk.text;
          if(chunk.type==='usage') {
            const u=chunk.usage;
            if([u.inputTokens,u.outputTokens,u.cacheReadTokens??0,u.cacheWriteTokens??0].every(n=>Number.isFinite(n)&&n>=0)) {
              const hit=u.cacheReadTokens??0,miss=u.inputTokens+(u.cacheWriteTokens??0),input=hit+miss;
              usage={input,output:u.outputTokens,total:input+u.outputTokens,hit,miss,reasoning:u.reasoningTokens??null};
            }
          }
          if(chunk.type==='finish')finish=chunk.reason;
        }
      } catch(error) {
        if(error instanceof InputError)throw error;
        throw new InputError(signal?.aborted?'DSH 解读已超时或中断，请重试。':'DSH 生成失败，请检查 DSH Web 的模型连接与服务日志。',502);
      }
      if(finish?.kind==='error'||finish?.kind==='aborted') {
        const messages={MISSING_CREDENTIAL:'请在 DSH Web 的模型设置中配置 API Key。',INVALID_CREDENTIAL:'DSH 中的模型凭据格式无效，请检查模型设置。',AUTH:'DSH 模型认证失败，请检查模型设置中的 API Key。',NO_ADAPTER:'DSH 默认模型的提供方未启用，请检查模型设置。',RATE_LIMIT:'DSH 模型请求过于频繁，请稍后重试。'};
        throw new InputError(messages[finish.failure?.code]||(finish.kind==='aborted'?'DSH 解读已中断，请重试。':'DSH 模型生成失败，请检查模型连接。'),502);
      }
      if(!finish||!['stop','max-tokens'].includes(finish.kind)||!report.trim())throw new InputError('DSH 未返回完整可用的解读，请重试。',502);
      return {report,usage,cost:current.provider==='deepseek-official'&&current.model===config.pricingModel?estimateCost(usage,config.pricing):null,...current,finishReason:finish.kind,truncated:finish.kind==='max-tokens'};
    },
  };
}
