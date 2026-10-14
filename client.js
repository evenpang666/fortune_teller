/* DSH browser artifact; React is supplied by Harness's module loader. */
window.__ModuleLoader__.load({
  id:'dsh-fortuneteller',
  factory(require){
    const React=require('react');const h=React.createElement;
    return {
      inject:['slots','locale'],
      apply(ctx){
        ctx.locale.register('fortuneteller',{zh:{open:'打开观象工作室',port:'工作室端口',hint:'本机和局域网设备打开即可使用'},en:{open:'Open Guanxiang studio',port:'Studio port',hint:'Open directly from this machine or your LAN'}});
        const t=ctx.locale.bind('fortuneteller');
        function StudioEntry(){
          const [port,setPort]=React.useState(localStorage.getItem('gx-plugin-port')||'3210');
          const valid=/^\d+$/.test(port)&&Number(port)>0&&Number(port)<=65535;
          const hostname=location.hostname.includes(':')?`[${location.hostname}]`:location.hostname;
          return h('div',{style:{display:'flex',alignItems:'center',flexWrap:'wrap',gap:8,padding:'8px 12px',color:'var(--dsw-alias-label-primary)',fontSize:12}},
            h('a',{href:valid?`http://${hostname}:${port}`:undefined,target:'_blank',rel:'noreferrer',title:t('hint'),style:{color:'var(--dsw-alias-label-primary)',textDecoration:'none',padding:'6px 10px',border:'1px solid var(--dsw-alias-border-l)',borderRadius:6}},'☯ '+t('open')+' ↗'),
            h('label',{style:{display:'flex',alignItems:'center',gap:6}},t('port'),h('input',{type:'number',min:1,max:65535,value:port,onChange:e=>{setPort(e.target.value);localStorage.setItem('gx-plugin-port',e.target.value);},style:{width:72,border:'1px solid var(--dsw-alias-border-l)',borderRadius:4,background:'transparent',color:'inherit',padding:4}})),
          );
        }
        ctx.slots.inject('conversation.composer.dock',()=>ctx.slots.register({name:'conversation.composer.dock',id:'fortuneteller-studio',order:10},StudioEntry));
      },
    };
  },
});
