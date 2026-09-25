let seq=0;
export function makeDb(tables){
  const t=(n)=>(tables[n]??=[]);
  class Q{constructor(n){this.n=n;this.f=[];this.op='select';this.lim=null;this.ord=null;this.one=false}
    select(){return this} eq(k,v){this.f.push(r=>r[k]===v);return this} neq(k,v){this.f.push(r=>r[k]!==v);return this}
    gte(k,v){this.f.push(r=>r[k]!=null&&r[k]>=v);return this} gt(k,v){this.f.push(r=>r[k]!=null&&r[k]>v);return this}
    lte(k,v){this.f.push(r=>r[k]!=null&&r[k]<=v);return this} lt(k,v){this.f.push(r=>r[k]!=null&&r[k]<v);return this}
    in(k,v){this.f.push(r=>v.includes(r[k]));return this} is(k,v){this.f.push(r=>r[k]==v);return this}
    contains(k,v){this.f.push(r=>Object.entries(v).every(([a,b])=>r[k]?.[a]===b));return this}
    not(){return this} or(){return this}
    order(k,o={}){this.ord=[k,o.ascending!==false];return this} limit(n){this.lim=n;return this}
    maybeSingle(){this.one=true;return this} single(){this.one=true;return this}
    update(v){this.op='update';this.val=v;return this} insert(v){this.op='insert';this.val=v;return this}
    upsert(v,o={}){this.op='upsert';this.val=v;this.opt=o;return this}
    run(){ const rows=t(this.n);
      if(this.op==='insert'){const r={id:'id'+(++seq),created_at:new Date(globalThis.NOW).toISOString(),...this.val};rows.push(r);return {data:r,error:null}}
      if(this.op==='upsert'){const keys=this.opt.onConflict?.split(',');const ex=keys&&rows.find(r=>keys.every(k=>r[k]===this.val[k]));
        if(ex){ if(this.opt.ignoreDuplicates) return {data:null,error:null}; Object.assign(ex,this.val); return {data:ex,error:null}}
        const r={id:'id'+(++seq),created_at:new Date(globalThis.NOW).toISOString(),status:'active',first_status:'pending',second_status:'pending',...this.val};rows.push(r);return {data:r,error:null}}
      let res=rows.filter(r=>this.f.every(f=>f(r)));
      if(this.op==='update'){res.forEach(r=>Object.assign(r,this.val));return {data:res,error:null}}
      if(this.ord){const [k,a]=this.ord;res=[...res].sort((x,y)=>(x[k]>y[k]?1:-1)*(a?1:-1))}
      if(this.lim!=null)res=res.slice(0,this.lim);
      if(this.one)return {data:res[0]??null,error:null};
      return {data:res,error:null,count:res.length}}
    then(a,b){return Promise.resolve(this.run()).then(a,b)} }
  return { from:(n)=>new Q(n), tables,
    rpc: async(fn,{p_id,p_step})=>{const s=t('nara_followup_sequences').find(r=>r.id===p_id);const k=p_step+'_status';
      if(s&&s.status==='active'&&s[k]==='pending'){s[k]='sending';return {data:true}}return {data:false}} };
}
