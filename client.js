/* DSH browser artifact; React is supplied by Harness's module loader. */
window.__ModuleLoader__.load({
  id:'dsh-fortuneteller',
  factory(require){
    const React=require('react');const h=React.createElement;
    return {
      inject:['slots','locale'],
      apply(ctx){
        ctx.locale.register('fortuneteller',{zh:{open:'打开观象工作室',hint:'复用 DSH 的模型与配置'},en:{open:'Open Guanxiang studio',hint:'Use DSH models and settings'}});
        const t=ctx.locale.bind('fortuneteller');
        function StudioEntry(){
          return h('a',{href:'/fortuneteller/',target:'_blank',rel:'noreferrer',style:{display:'inline-block',margin:8,color:'var(--dsw-alias-label-primary)',padding:'6px 10px',border:'1px solid var(--dsw-alias-border-l)',borderRadius:6}},'☯ '+t('open')+' ↗');
        }
        ctx.slots.inject('conversation.composer.dock',()=>ctx.slots.register({name:'conversation.composer.dock',id:'fortuneteller-studio',order:10},StudioEntry));
      },
    };
  },
});
