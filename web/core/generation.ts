import { contentSchema } from "./contracts.ts";
import type { Content, Decision, ExperienceRequest, LifeEvent, Profile, StudyArm } from "./contracts.ts";
import { generationContext } from "./engine.ts";
import { CATALOG } from "./catalog.ts";
import { detectCrisis,findAffirmation,findPromise } from "./safety.ts";
import { runPipeline } from "./agents.ts";
import type { AgentRole,TraceStep } from "./agents.ts";
import { startImage,synthesize,chunkText,pool } from "./media.ts";
import type { ImageJob,AudioClip } from "./media.ts";

export type ProviderConfig = {mode:"demo"|"live"; llmUrl?:string; llmKey?:string; model?:string;
  mediaUrl?:string; mediaKey?:string;
  // When true, each new session is randomly assigned to adaptive / generic / neutral (risk.pre-post-bias).
  studyMode?:boolean;
  // Optional per-agent model override, e.g. a stronger reviewer.
  models?:Partial<Record<AgentRole,string>>;
  // Alibaba Cloud Model Studio (DashScope) for images and speech.
  dashscopeKey?:string; dashscopeUrl?:string; imageModel?:string; ttsModel?:string; ttsVoice?:string;
  imagesPerSession?:number};
export type Artifact = {mode:"demo"|"live"; renderer:string; content:Content;
  media?:{status:"pending"|"ready";jobId?:string;url?:string}; warnings:string[];
  // Which agents ran, with which model and how long; no content is stored here.
  trace?:TraceStep[]; images?:ImageJob[]; audio?:AudioClip[]};

export function capabilities(config:ProviderConfig):string[] {
  return ["text","animation","game","speech",...(config.mediaUrl?["video","music"]:[]),
    ...(config.dashscopeKey?["image","tts"]:[])];
}
export function validateContent(value:unknown,decision:Decision,avoid:string[],requireChoices=true):Content {
  const result=contentSchema.parse(value);
  const seconds=result.scenes.reduce((n,s)=>n+s.durationSeconds,0);
  if(seconds>decision.seconds) throw new Error("内容超出本次时长预算");
  const text=JSON.stringify(result).toLowerCase();
  if(avoid.some(t=>t && text.includes(t.toLowerCase()))) throw new Error("内容包含已排除的话题");
  const choices=result.scenes.flatMap(s=>s.choices);
  if(new Set(choices.map(c=>c.id)).size!==choices.length) throw new Error("选择标识重复");
  if(requireChoices && ["interactive-story","micro-game"].includes(decision.selected??"") && choices.length<2)
    throw new Error("互动体验缺少有结果的选择");
  // Keep textual reading burden bounded even when a provider emits valid JSON.
  if(result.scenes.reduce((n,s)=>n+s.text.length,0)>Math.max(180,decision.seconds*7))
    throw new Error("文字量超出当前阅读预算");
  return result;
}
function demoContent(decision:Decision):Content {
  const humor=decision.selected==="humor-animation"||decision.selected==="short-video";
  const calm=decision.selected==="calm-animation"||decision.selected==="music";
  const interactive=["interactive-story","micro-game"].includes(decision.selected??"");
  const lines=humor?[
    "今天的事情也许有点挤。先借你一小段不用解决问题的时间。",
    "一只企鹅申请了暖气维修的工作。面试官问：你有什么优势？",
    "企鹅想了想：我能非常准确地判断它有没有修好。",
    "面试官点头：那你先坐。企鹅说：谢谢，我已经坐了一整天了。",
  ]:calm?[
    "傍晚，你走到一片没有任务清单的湖边。",
    "水面接住一盏小灯。它没有急着照亮整片湖。",
    "你把一颗小石子放在岸边，给这段时间留下一个记号。",
    "暂时停在这里也可以。接下来的一步，可以稍后再想。",
  ]:[
    "你来到一座修理旧钟的小店。今天唯一的委托，是让一只停摆的钟再次走动。",
    "钟面完好，齿轮却卡在一张旧纸条旁。店主说：先看清它卡在哪里，不必证明你能修好所有钟。",
    "你发现问题只在一枚错位的小齿轮。原来停摆并不意味着整只钟没有价值。",
    "轻轻调整之后，第一声滴答响了。店主把这次修理记在你的名字下面。",
  ];
  const count=lines.length,base=Math.floor(decision.seconds/count);
  return {title:humor?"企鹅的面试":calm?"湖边的一盏灯":"第一声滴答",
    scenes:lines.map((text,i)=>({text,visual:humor?"原创企鹅与雪地办公室":calm?"安静湖面与暖色小灯":"小店、齿轮与暖光",
      durationSeconds:base+(i===count-1?decision.seconds%count:0),
      choices:interactive&&i===1?[
        {id:"observe",label:"先观察齿轮",consequence:"你找到了磨损最浅的那一枚，直接调整位置，让钟重新走动。"},
        {id:"ask",label:"请店主一起看看",consequence:"你向店主说明发现，他扶稳钟身，你重新装回齿轮。合作完成了修理。"},
      ]:[]})),
    ending:humor?"如果这个笑话有点冷，至少企鹅应该会喜欢。愿你接下来的几分钟轻松一点。":
      calm?"把那盏小灯留在心里，按照自己的速度继续。":"这一次完成的小事已经发生，不需要把它变成对整个人生的判断。"};
}
// Study control condition (risk.pre-post-bias): emotionally neutral, informational, same time budget.
function neutralContent(decision:Decision):Content {
  const lines=[
    "一支普通铅笔的笔芯，主要由石墨和黏土混合制成。两者的比例决定了笔芯的软硬。",
    "混合物被挤压成细长的条，切段后在高温中烧制，使它变得结实。",
    "木材通常被加工成薄板，开出半圆形的槽，把笔芯放进去，再用另一块薄板盖上粘合。",
    "最后切割成单支，打磨外形、上漆，并在一端印上标识。",
  ];
  const count=lines.length,base=Math.floor(decision.seconds/count);
  return {title:"一支铅笔是怎样做成的",scenes:lines.map((text,i)=>({text,visual:"铅笔制作流程示意",
    durationSeconds:base+(i===count-1?decision.seconds%count:0),choices:[]})),
    ending:"以上是铅笔制作的大致流程。"};
}
function endpoint(value:string,path=""):string {
  const url=new URL(value);
  if(url.protocol!=="https:" && !(url.protocol==="http:" && ["localhost","127.0.0.1"].includes(url.hostname)))
    throw new Error("生成服务地址必须为 HTTPS 或本地测试地址");
  return value.replace(/\/$/,"")+path;
}
// One JSON-mode call to the configured Chat Completions-compatible text provider.
export async function chatJson(config:ProviderConfig,system:string,user:string,fetcher:typeof fetch=fetch,
  role?:AgentRole):Promise<unknown> {
  const model=(role&&config.models?.[role])||config.model;
  if(!config.llmUrl||!config.llmKey||!model) throw new Error("尚未配置文本生成服务");
  const response=await fetcher(endpoint(config.llmUrl,"/chat/completions"),{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${config.llmKey}`},
    signal:AbortSignal.timeout(60000),
    body:JSON.stringify({model,response_format:{type:"json_object"},messages:[
      {role:"system",content:system},{role:"user",content:user}]}),
  });
  if(!response.ok) throw new Error(`文本服务暂不可用（${response.status}）`);
  const raw=await response.text();
  if(raw.length>100000) throw new Error("生成服务返回内容过大");
  const message=JSON.parse(raw).choices?.[0]?.message?.content;
  if(typeof message!=="string") throw new Error("文本服务返回格式不符");
  try{return JSON.parse(message);}catch{throw new Error("文本服务返回格式不符");}
}
export async function generate(profile:Profile,events:LifeEvent[],request:ExperienceRequest,
  decision:Decision,config:ProviderConfig,kb:unknown,jobKey:string,fetcher:typeof fetch=fetch,
  arm:StudyArm="adaptive"):Promise<Artifact> {
  if(!decision.selected) throw new Error("没有可执行的体验方案");
  const neutral=arm==="neutral";
  let content:Content,trace:TraceStep[]|undefined,coverScene=0;
  if(config.mode==="demo") content=neutral?neutralContent(decision):demoContent(decision);
  else {
    if(!config.llmUrl||!config.llmKey||!config.model) throw new Error("尚未配置文本生成服务");
    const full=generationContext(profile,events,request,decision);
    // Generic arm: same mechanism and medium, no personal material. Neutral arm: no mechanism either.
    const data=arm==="adaptive"?full:{...full,themes:[],events:[],situation:""};
    if(neutral){
      const started=Date.now();
      const instruction="[agent:writer] 你为课堂研究的对照条件生成中文内容：一篇情绪中性的说明性短文，例如日常物品的制作过程。不涉及情绪、鼓励、幽默、人生经历或用户本人，不包含选择。只返回 JSON：{title,scenes:[{text,durationSeconds,visual,choices:[]}],ending}。总 durationSeconds 不超过预算。";
      content=validateContent(await chatJson(config,instruction,JSON.stringify({context:data}),fetcher,"writer"),decision,profile.avoidTopics,false);
      trace=[{agent:"writer",model:config.models?.writer??config.model,ms:Date.now()-started,outcome:"ok"}];
    } else {
      const interactive=["interactive-story","micro-game"].includes(decision.selected);
      const result=await runPipeline(config,{context:data,evidence:kb,seconds:decision.seconds,interactive},fetcher,
        value=>validateContent(value,decision,profile.avoidTopics));
      content=result.content;trace=result.trace;coverScene=result.plan.coverBeat;
    }
  }
  content=validateContent(content,decision,profile.avoidTopics,!neutral);
  const rendered=JSON.stringify(content);
  if(detectCrisis(rendered)) throw new Error("内容未通过安全检查，请重新安排");
  if(findAffirmation(rendered)) throw new Error("内容中有直接评价用户的说法，请重新安排");
  if(findPromise(rendered)) throw new Error("内容中有承诺情绪结果的说法，请重新安排");
  // The neutral control is shown as plain text so it never calls a media provider.
  const renderer=neutral?"micro-reading":decision.selected;
  const artifact:Artifact={mode:config.mode,renderer,content,trace,warnings:config.mode==="demo"?
    ["当前为本地示例内容，验证流程用途；未调用大模型，也不是已验证的干预。"]:[]};
  // Images and speech are extras: a failure leaves a warning, never blocks the text experience.
  if(!neutral&&config.dashscopeKey){
    const count=Math.min(config.imagesPerSession??1,content.scenes.length);
    if(count>0&&renderer!=="music"){
      const first=Math.min(coverScene,content.scenes.length-1);
      const picks=[first,...content.scenes.map((_,i)=>i).filter(i=>i!==first)].slice(0,count);
      const jobs=await Promise.allSettled(picks.map(i=>startImage(config,i,content.scenes[i].visual||content.scenes[i].text,fetcher)));
      artifact.images=jobs.flatMap(j=>j.status==="fulfilled"?[j.value]:[]);
      if(jobs.some(j=>j.status==="rejected"))artifact.warnings.push("插画暂时没有生成出来，不影响体验。");
    }
    if(renderer==="spoken-story"){
      try{
        // Two clips at a time stays under the provider's rate quota; order is kept by index.
        const parts=[...content.scenes.map(s=>s.text),content.ending].flatMap((s,i)=>chunkText(s).map(text=>({scene:i,text})));
        artifact.audio=await pool(parts,2,async p=>({scene:p.scene,url:await synthesize(config,p.text,fetcher)}) as AudioClip);
      }catch{artifact.warnings.push("语音合成暂时不可用，可以使用浏览器朗读。");}
    }
  }
  if(["short-video","music"].includes(renderer)) {
    if(!config.mediaUrl) throw new Error("该媒介的生成服务尚未接通");
    const response=await fetcher(endpoint(config.mediaUrl,"/jobs"),{
      method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":jobKey,
        ...(config.mediaKey?{Authorization:`Bearer ${config.mediaKey}`}:{})},
      signal:AbortSignal.timeout(20000),body:JSON.stringify({kind:renderer,seconds:decision.seconds,content}),
    });
    if(!response.ok) throw new Error(`音视频服务暂不可用（${response.status}）`);
    artifact.media=validateMedia(await response.json());
  }
  return artifact;
}
function validateMedia(raw:unknown):NonNullable<Artifact["media"]> {
  const data=raw as {status?:string;jobId?:string;url?:string};
  if(data.status==="ready"&&typeof data.url==="string"&&new URL(data.url).protocol==="https:")
    return {status:"ready",url:data.url};
  if(data.status==="pending"&&typeof data.jobId==="string"&&/^[a-zA-Z0-9_-]{1,120}$/.test(data.jobId))
    return {status:"pending",jobId:data.jobId};
  throw new Error("音视频服务返回的任务或媒体地址无效");
}
export async function pollMedia(artifact:Artifact,config:ProviderConfig,fetcher:typeof fetch=fetch):Promise<Artifact> {
  if(artifact.media?.status!=="pending"||!config.mediaUrl) throw new Error("没有待完成的音视频任务");
  const response=await fetcher(endpoint(config.mediaUrl,`/jobs/${artifact.media.jobId}`),{
    headers:config.mediaKey?{Authorization:`Bearer ${config.mediaKey}`}:{},signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error(`音视频查询暂不可用（${response.status}）`);
  return {...artifact,media:validateMedia(await response.json())};
}
export function selectedEvidence(decision:Decision,nodes:Record<string,unknown>) {
  const candidate=CATALOG.find(c=>c.id===decision.selected);
  return [...(candidate?.evidence??[]),candidate?.mechanism].filter((id):id is string=>!!id)
    .map(id=>({id,node:nodes[id]}));
}
