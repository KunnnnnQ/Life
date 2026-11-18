// Multimodal output through Alibaba Cloud Model Studio (DashScope), Beijing region.
// Image: Wan text-to-image, asynchronous task. Speech: Qwen TTS, one synchronous call per ≤600 characters.
// Both return URLs that expire after 24 hours, so the service copies them to R2 when a bucket is bound.
import type { ProviderConfig } from "./generation.ts";

export type ImageJob = {scene:number;prompt:string;status:"pending"|"ready"|"failed";taskId?:string;url?:string};
export type AudioClip = {scene:number;url:string};

const base=(c:ProviderConfig)=>(c.dashscopeUrl??"https://dashscope.aliyuncs.com").replace(/\/$/,"");
const auth=(c:ProviderConfig)=>({Authorization:`Bearer ${c.dashscopeKey}`});
// Speech results come back as http:// links on Alibaba Cloud OSS; the same object is served over https,
// so those are upgraded. Any other non-https URL is rejected.
const httpsUrl=(v:unknown):string|null=>{
  if(typeof v!=="string")return null;
  try{const u=new URL(v);
    if(u.protocol==="https:")return v;
    if(u.protocol==="http:"&&u.hostname.endsWith(".aliyuncs.com")){u.protocol="https:";return u.toString();}
    return null;}catch{return null;}
};
// Original characters only; no text in images so nothing unreviewed is rendered.
const STYLE="原创插画风格，温暖柔和，干净的构图，画面中不要出现文字、真实人物或已有作品角色。";

export async function startImage(config:ProviderConfig,scene:number,prompt:string,fetcher:typeof fetch=fetch):Promise<ImageJob> {
  if(!config.dashscopeKey) throw new Error("尚未配置图片生成服务");
  const model=config.imageModel??"wan2.2-t2i-flash";
  // wan2.6 and later use the message-style endpoint; earlier models use text2image/image-synthesis.
  const modern=/^wan2\.[6-9]|^wan[3-9]/.test(model);
  const text=`${prompt.slice(0,600)}。${STYLE}`;
  const response=await fetcher(`${base(config)}/api/v1/services/aigc/${modern?"image-generation/generation":"text2image/image-synthesis"}`,{
    method:"POST",headers:{...auth(config),"Content-Type":"application/json","X-DashScope-Async":"enable"},
    signal:AbortSignal.timeout(20000),
    body:JSON.stringify(modern?{model,input:{messages:[{role:"user",content:[{text}]}]},parameters:{size:"1280*1280",n:1}}:
      {model,input:{prompt:text},parameters:{size:"1024*1024",n:1}}),
  });
  if(!response.ok) throw new Error(`图片服务暂不可用（${response.status}）`);
  const taskId=(await response.json() as {output?:{task_id?:unknown}}).output?.task_id;
  if(typeof taskId!=="string"||!/^[\w-]{1,120}$/.test(taskId)) throw new Error("图片服务返回的任务无效");
  return {scene,prompt,status:"pending",taskId};
}
export async function pollImage(config:ProviderConfig,job:ImageJob,fetcher:typeof fetch=fetch):Promise<ImageJob> {
  if(job.status!=="pending"||!job.taskId) return job;
  const response=await fetcher(`${base(config)}/api/v1/tasks/${job.taskId}`,{headers:auth(config),signal:AbortSignal.timeout(10000)});
  if(!response.ok) return job;
  const out=(await response.json() as {output?:{task_status?:string;results?:{url?:unknown}[];
    choices?:{message?:{content?:{image?:unknown}[]}}[]}}).output;
  if(out?.task_status==="SUCCEEDED"){
    const url=httpsUrl(out.results?.[0]?.url)??httpsUrl(out.choices?.[0]?.message?.content?.[0]?.image);
    return url?{...job,status:"ready",url}:{...job,status:"failed"};
  }
  if(["FAILED","CANCELED","UNKNOWN"].includes(out?.task_status??""))return {...job,status:"failed"};
  return job;
}
// Run async jobs with a small concurrency limit, keeping results in input order.
export async function pool<T,R>(items:T[],limit:number,fn:(item:T)=>Promise<R>):Promise<R[]> {
  const out:R[]=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
    while(next<items.length){const i=next++;out[i]=await fn(items[i]);}
  }));
  return out;
}
// Split on sentence ends so no request exceeds the 600-character limit.
export function chunkText(text:string,max=600):string[] {
  const parts=text.match(/[^。！？!?\n]+[。！？!?\n]*/g)??[text];
  const out:string[]=[];let current="";
  for(const p of parts){
    if((current+p).length>max&&current){out.push(current);current="";}
    current+=p.length>max?p.slice(0,max):p;
  }
  if(current.trim())out.push(current);
  return out;
}
export async function synthesize(config:ProviderConfig,text:string,fetcher:typeof fetch=fetch,
  wait=(ms:number)=>new Promise(r=>setTimeout(r,ms))):Promise<string> {
  if(!config.dashscopeKey) throw new Error("尚未配置语音服务");
  let response:Response|undefined;
  // The account's rate quota is small (about 3 concurrent calls in testing); back off and retry on 429.
  for(let attempt=0;attempt<4;attempt++){
    response=await fetcher(`${base(config)}/api/v1/services/aigc/multimodal-generation/generation`,{
      method:"POST",headers:{...auth(config),"Content-Type":"application/json"},signal:AbortSignal.timeout(30000),
      body:JSON.stringify({model:config.ttsModel??"qwen3-tts-flash",
        input:{text,voice:config.ttsVoice??"Cherry",language_type:"Chinese"}}),
    });
    if(response.status!==429)break;
    await wait(700*(attempt+1));
  }
  if(!response!.ok) throw new Error(`语音服务暂不可用（${response!.status}）`);
  const url=httpsUrl((await response!.json() as {output?:{audio?:{url?:unknown}}}).output?.audio?.url);
  if(!url) throw new Error("语音服务返回的音频地址无效");
  return url;
}
