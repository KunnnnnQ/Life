// Fake Chat Completions provider that answers per agent, routed by the "[agent:role]" tag in the system prompt.
export const PLAN={title:'第一声滴答',tone:'安静',beats:[
  {purpose:'进入场景',durationSeconds:40,visual:'旧钟表店',choice:false},
  {purpose:'做一个选择',durationSeconds:40,visual:'齿轮特写',choice:true},
  {purpose:'收尾',durationSeconds:40,visual:'暖光',choice:false}],ending:'开放',coverBeat:1};
export const CONTENT={title:'第一声滴答',scenes:[
  {text:'你来到一座修理旧钟的小店。',durationSeconds:40,visual:'旧钟表店',choices:[]},
  {text:'齿轮卡住了。',durationSeconds:40,visual:'齿轮特写',choices:[{id:'a',label:'先观察',consequence:'找到错位的齿轮'},{id:'b',label:'问店主',consequence:'两人一起修好'}]},
  {text:'第一声滴答响了。',durationSeconds:40,visual:'暖光',choices:[]}],ending:'钟又走起来了。'};
export const PASS={pass:true,issues:[]};
export function agentMock({plan=PLAN,writer=[CONTENT],reviewer=[PASS],extra}={}){
  const calls=[];let w=0,r=0;
  const fetcher=async(url,init)=>{
    if(extra){const handled=await extra(url,init);if(handled)return handled;}
    const body=JSON.parse(init.body);const system=body.messages[0].content;
    const role=system.match(/^\[agent:(\w+)\]/)?.[1]??'unknown';
    calls.push({role,model:body.model,user:body.messages[1].content});
    const value=role==='planner'?plan:role==='writer'?writer[Math.min(w++,writer.length-1)]:
      role==='reviewer'?reviewer[Math.min(r++,reviewer.length-1)]:{};
    return Response.json({choices:[{message:{content:JSON.stringify(value)}}]});
  };
  return {fetcher,calls};
}
export const LIVE={mode:'live',llmUrl:'https://api.deepseek.com',llmKey:'test-only',model:'deepseek-flash'};
