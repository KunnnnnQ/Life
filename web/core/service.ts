import { z } from "zod";
import { Store } from "../db/store.ts";
import { profileSchema,eventSchema,requestSchema,feedbackSchema,screeningSchema,intakeInputSchema,intakeDraftSchema } from "./contracts.ts";
import { runIntake,mergeProfile } from "./intake.ts";
import type { Profile,LifeEvent,ExperienceRequest,Decision,History,Feedback,ScreeningLevel,StudyArm } from "./contracts.ts";
import { decide,validateDates } from "./engine.ts";
import { POLICY,CATALOG } from "./catalog.ts";
import { capabilities,generate,pollMedia,selectedEvidence } from "./generation.ts";
import { pollImage } from "./media.ts";
import type { Artifact,ProviderConfig } from "./generation.ts";
import { PHQ4_ITEMS,PHQ4_OPTIONS,SUPPORT_RESOURCES,detectCrisis,safetyPayload,scorePhq4 } from "./safety.ts";
import type { ScreeningResult } from "./safety.ts";

export type Knowledge = {version:string;hash:string;nodes:Record<string,unknown>};
type ProfileRecord = {data:Profile;revision:number;updatedAt:string};
type ScreeningRecord = ScreeningResult & {answers:number[];createdAt:string};
export type Session = {id:string;createdAt:string;request:ExperienceRequest;decision:Decision;
  status:"planned"|"running"|"awaiting-media"|"ready"|"completed"|"failed"|"cancelled";
  profileRevision:number;kbVersion:string;kbHash:string;artifact?:Artifact;error?:string;
  // Not shown to the participant during the session; exported for analysis.
  study?:{arm:StudyArm}};
// The subset of the Cloudflare R2 binding this service uses.
export type AssetBucket={
  put(key:string,value:ArrayBuffer,options?:{httpMetadata?:{contentType?:string}}):Promise<unknown>;
  get(key:string):Promise<{body:ReadableStream;httpMetadata?:{contentType?:string}}|null>;
  list(options:{prefix:string;cursor?:string}):Promise<{objects:{key:string}[];truncated:boolean;cursor?:string}>;
  delete(keys:string|string[]):Promise<unknown>;
};
const ARMS:StudyArm[]=["adaptive","generic","neutral"];
const randomArm=()=>ARMS[crypto.getRandomValues(new Uint32Array(1))[0]%ARMS.length];
class ApiError extends Error {status:number;constructor(status:number,message:string){super(message);this.status=status;}}
const fail=(status:number,message:string):never=>{throw new ApiError(status,message);};
const json=(value:unknown,status=200,headers:HeadersInit={})=>new Response(JSON.stringify(value),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}});
async function body(req:Request){
  if(!req.headers.get("content-type")?.includes("application/json"))fail(415,"请使用 JSON 请求");
  if(Number(req.headers.get("content-length")??0)>16384)fail(413,"请求内容过长");
  const reader=req.body?.getReader();let raw="";let bytes=0;const decoder=new TextDecoder();
  if(!reader)fail(400,"缺少请求内容");
  while(true){const {value,done}=await reader!.read();if(done)break;bytes+=value.length;
    if(bytes>16384){await reader!.cancel();fail(413,"请求内容过长");}raw+=decoder.decode(value,{stream:true});}
  raw+=decoder.decode();try{return JSON.parse(raw);}catch{fail(400,"JSON 格式不正确");}
}
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))))
  .map(v=>v.toString(16).padStart(2,"0")).join("");
export class Service {
  store:Store;kb:Knowledge;config:ProviderConfig;fetcher:typeof fetch;now:()=>Date;bucket?:AssetBucket;
  constructor(store:Store,kb:Knowledge,config:ProviderConfig,fetcher:typeof fetch=fetch,now=()=>new Date(),bucket?:AssetBucket){
    this.store=store;this.kb=kb;this.config=config;this.fetcher=fetcher;this.now=now;this.bucket=bucket;
  }
  // Copy a provider URL (valid 24h) into R2 and return a same-origin URL. Without a bucket, keep the original.
  async persist(owner:string,sessionId:string,name:string,url:string):Promise<string>{
    if(!this.bucket)return url;
    const response=await this.fetcher(url,{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error("媒体下载失败");
    const data=await response.arrayBuffer();
    if(data.byteLength>15*1024*1024)throw new Error("媒体文件过大");
    await this.bucket.put(`${owner}/${sessionId}/${name}`,data,{httpMetadata:{contentType:response.headers.get("content-type")??"application/octet-stream"}});
    // The owner id is the session cookie, so it never appears in a URL.
    return `/api/media/${sessionId}/${name}`;
  }
  async persistArtifact(owner:string,sessionId:string,artifact:Artifact):Promise<Artifact>{
    const keep=async(name:string,url:string)=>url.startsWith("/api/")?url:await this.persist(owner,sessionId,name,url).catch(()=>url);
    const audio=artifact.audio&&await Promise.all(artifact.audio.map(async(a,i)=>({...a,url:await keep(`audio-${i}.wav`,a.url)})));
    const images=artifact.images&&await Promise.all(artifact.images.map(async im=>im.status==="ready"&&im.url?
      {...im,url:await keep(`image-${im.scene}.png`,im.url)}:im));
    return {...artifact,...(audio?{audio}:{}),...(images?{images}:{})};
  }
  async profile(owner:string):Promise<ProfileRecord>{return await this.store.get<ProfileRecord>(owner,"profile","current")??
    {data:profileSchema.parse({}),revision:0,updatedAt:this.now().toISOString()};}
  async history(owner:string):Promise<History[]>{
    const [sessions,feedback]=await Promise.all([this.store.list<Session>(owner,"session"),this.store.list<Feedback&{sessionId:string}>(owner,"feedback")]);
    const byId=new Map(feedback.map(f=>[f.sessionId,f]));
    // Neutral control sessions did not deliver the chosen mechanism, so they never train the ranking.
    return sessions.filter(s=>s.decision.selected&&s.study?.arm!=="neutral").map(s=>({id:s.id,createdAt:s.createdAt,
      modality:s.decision.selected!,request:s.request,feedback:byId.get(s.id),
      family:CATALOG.find(c=>c.id===s.decision.selected)?.family}));
  }
  async screening(owner:string):Promise<{level:ScreeningLevel;latest:ScreeningRecord|null;due:boolean}>{
    const all=await this.store.list<ScreeningRecord>(owner,"screening");
    const latest=all.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]??null;
    const age=latest?(this.now().getTime()-new Date(latest.createdAt).getTime())/86400000:Infinity;
    const current=age<=POLICY.screening.windowDays;
    return {level:current?latest!.level:"unknown",latest,due:!current};
  }
  async plan(owner:string,input:ExperienceRequest){
    const p=await this.profile(owner);
    const decision=decide(p.data,await this.store.list(owner,"event"),input,await this.history(owner),
      capabilities(this.config),this.now(),{screening:(await this.screening(owner)).level});
    return {p,decision};
  }
  async crisisStop(owner:string,source:string){
    // Record that a stop happened, never the text that triggered it.
    await this.store.put(owner,"safety",crypto.randomUUID(),{source,at:this.now().toISOString()});
    return json({safety:safetyPayload("crisis-signal")});
  }
  async getSession(owner:string,id:string){return await this.store.get<Session>(owner,"session",id)??fail(404,"找不到这次体验");}
  async handle(req:Request):Promise<Response>{
    try{return await this.route(req);}catch(e){
      if(e instanceof ApiError)return json({error:e.message},e.status);
      if(e instanceof z.ZodError)return json({error:"输入字段或范围不符合要求",fields:e.issues.map(i=>i.path.join("."))},400);
      // Do not expose provider responses, credentials, SQL, or personal data.
      return json({error:"处理未完成，请检查配置或稍后重试"},500);
    }
  }
  async route(req:Request):Promise<Response>{
    const url=new URL(req.url),path=url.pathname.replace(/^\/api\/?/,"").split("/").filter(Boolean),method=req.method;
    if(!["GET","HEAD"].includes(method)){
      const origin=req.headers.get("origin"),site=req.headers.get("sec-fetch-site");
      if((origin&&origin!==url.origin)||site==="cross-site")fail(403,"不接受跨站写入");
    }
    if(path[0]==="health"&&method==="GET")return json({ok:true,kbVersion:this.kb.version,kbHash:this.kb.hash,
      nodeCount:Object.keys(this.kb.nodes).length,policyVersion:POLICY.version,mode:this.config.mode,
      capabilities:capabilities(this.config),externalMediaConfigured:!!this.config.mediaUrl,studyMode:!!this.config.studyMode});
    if(path[0]==="knowledge"&&method==="GET"){
      const q=(url.searchParams.get("q")??"").slice(0,100);
      if(path[1])return json(this.kb.nodes[path[1]]??fail(404,"找不到此知识节点"));
      const nodes=Object.entries(this.kb.nodes).filter(([id,node])=>!q||id.includes(q)||JSON.stringify(node).includes(q));
      return json({version:this.kb.version,hash:this.kb.hash,nodes:Object.fromEntries(nodes)});
    }
    if(path[0]==="catalog"&&method==="GET")return json({policy:POLICY,candidates:CATALOG,
      capabilities:capabilities(this.config),note:"评分参数是工程假设，研究出处不等于产品效果。"});
    let owner=req.headers.get("cookie")?.match(/(?:^|;\s*)mood_workspace=([a-f0-9-]{36})(?:;|$)/)?.[1];
    if(path[0]==="workspace"&&method==="POST"){
      if(!owner||!await this.store.ownerExists(owner)){owner=crypto.randomUUID();await this.store.createOwner(owner);}
      return json({ready:true},200,{"Set-Cookie":`mood_workspace=${owner}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${url.protocol==="https:"?"; Secure":""}`});
    }
    if(!owner||!await this.store.ownerExists(owner))fail(401,"请先创建本机体验档案");
    const who=owner!;
    if(path[0]==="media"&&method==="GET"&&path.length===3){
      await this.getSession(who,path[1]);
      if(!this.bucket||!/^[\w.-]{1,60}$/.test(path[2]))fail(404,"找不到这个文件");
      const object=await this.bucket!.get(`${who}/${path[1]}/${path[2]}`)??fail(404,"找不到这个文件");
      return new Response(object.body,{headers:{"Content-Type":object.httpMetadata?.contentType??"application/octet-stream",
        "Cache-Control":"private, max-age=86400"}});
    }
    if(path[0]==="workspace"&&method==="DELETE"){
      if(this.bucket){
        // Delete stored media together with the records.
        let cursor:string|undefined;
        do{const page=await this.bucket.list({prefix:`${who}/`,cursor});
          if(page.objects.length)await this.bucket.delete(page.objects.map(o=>o.key));
          cursor=page.truncated?page.cursor:undefined;}while(cursor);
      }
      await this.store.forget(who);return json({deleted:true},200,{"Set-Cookie":"mood_workspace=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"});
    }
    if(path[0]==="export"&&method==="GET")return json({profile:await this.profile(who),
      events:await this.store.list(who,"event"),sessions:await this.store.list(who,"session"),
      feedback:await this.store.list(who,"feedback"),progress:await this.store.list(who,"progress"),
      screenings:await this.store.list(who,"screening"),safetyStops:await this.store.list(who,"safety")});
    if(path[0]==="safety"&&method==="GET"){
      const s=await this.screening(who);
      return json({items:PHQ4_ITEMS,options:PHQ4_OPTIONS,resources:SUPPORT_RESOURCES,level:s.level,due:s.due,
        lastScreenedAt:s.latest?.createdAt??null,
        note:"题目参考 PHQ-4 改写，中文版本未经验证；结果只用于调整安排和提示求助资源，不是诊断。"});
    }
    if(path[0]==="screening"&&method==="POST"){
      const {answers}=screeningSchema.parse(await body(req));
      const result=scorePhq4(answers);
      const record:ScreeningRecord={...result,answers,createdAt:this.now().toISOString()};
      await this.store.put(who,"screening",crypto.randomUUID(),record);
      return json({level:result.level,safety:result.level==="elevated"?safetyPayload("screening"):null},201);
    }
    if(path[0]==="profile"){
      if(method==="GET")return json(await this.profile(who));
      if(method==="PUT"){
        const data=profileSchema.parse(await body(req));
        const events=await this.store.list<LifeEvent>(who,"event");
        try{validateDates(data,events,this.now());}catch(e){fail(400,(e as Error).message);}
        const old=await this.profile(who),record={data,revision:old.revision+1,updatedAt:this.now().toISOString()};
        await this.store.put(who,"profile","current",record);return json(record);
      }
    }
    if(path[0]==="intake"&&method==="POST"&&!path[1]){
      const {text}=intakeInputSchema.parse(await body(req));
      const result=await runIntake(text,this.config,this.now(),this.fetcher).catch(e=>
        fail(502,e instanceof Error&&/^(文本服务|尚未配置|生成服务)/.test(e.message)?e.message:"整理未完成，请稍后重试"));
      if(result.crisis)return this.crisisStop(who,"intake");
      // The raw text is not persisted anywhere; only the reviewed draft is, after /intake/apply.
      return json({draft:result.draft,mode:result.mode});
    }
    if(path[0]==="intake"&&path[1]==="apply"&&method==="POST"){
      const draft=intakeDraftSchema.parse(await body(req));
      if(detectCrisis(JSON.stringify(draft)))return this.crisisStop(who,"intake");
      const p=await this.profile(who),existing=await this.store.list<LifeEvent>(who,"event");
      if(existing.length+draft.events.length>100)fail(409,"课堂版最多保留 100 条经历");
      const data=profileSchema.parse(mergeProfile(p.data,draft));
      const at=this.now().toISOString();
      const events=draft.events.map(({approximateDate:_,...e})=>({...eventSchema.parse(e),id:crypto.randomUUID(),confirmedAt:at}));
      try{validateDates(data,[...existing,...events],this.now());}catch(e){fail(400,(e as Error).message);}
      const record={data,revision:p.revision+1,updatedAt:at};
      await this.store.db.batch([this.store.statement(who,"profile","current",record),
        ...events.map(e=>this.store.statement(who,"event",e.id,e))]);
      return json({profile:record,events:await this.store.list(who,"event")});
    }
    if(path[0]==="events"){
      if(method==="GET")return json(await this.store.list(who,"event"));
      const p=await this.profile(who),id=path[1]??crypto.randomUUID();
      if(method==="POST"&&!path[1]||method==="PUT"&&path[1]){
        if(method==="PUT"&&!await this.store.get(who,"event",id))fail(404,"找不到这条经历");
        if(method==="POST"&&(await this.store.list(who,"event")).length>=100)fail(409,"课堂版最多保留 100 条经历");
        const parsed=eventSchema.parse(await body(req));
        const crisis=detectCrisis(parsed.title,parsed.description,...parsed.tags);
        // An entry with crisis wording is kept for the user but never handed to a content generator.
        const event={...parsed,useInContent:crisis?false:parsed.useInContent,id,confirmedAt:this.now().toISOString()};
        try{validateDates(p.data,[event],this.now());}catch(e){fail(400,(e as Error).message);}
        await this.store.db.batch([this.store.statement(who,"event",id,event),
          this.store.statement(who,"profile","current",{...p,revision:p.revision+1,updatedAt:this.now().toISOString()})]);
        if(crisis)await this.store.put(who,"safety",crypto.randomUUID(),{source:"event",at:this.now().toISOString()});
        return json(crisis?{...event,safety:safetyPayload("crisis-signal")}:event,method==="POST"?201:200);
      }
      if(method==="DELETE"&&path[1]){
        await this.store.db.batch([this.store.db.prepare("DELETE FROM records WHERE owner=? AND kind='event' AND id=?").bind(who,id),
          this.store.statement(who,"profile","current",{...p,revision:p.revision+1,updatedAt:this.now().toISOString()})]);
        return json({deleted:true});
      }
    }
    if(path[0]==="recommend"&&method==="POST"){
      const input=requestSchema.parse(await body(req));
      if(detectCrisis(input.situation))return this.crisisStop(who,"situation");
      return json((await this.plan(who,input)).decision);
    }
    if(path[0]==="sessions"){
      if(path.length===1&&method==="GET")return json(await this.store.list(who,"session"));
      if(path.length===1&&method==="POST"){
        const input=requestSchema.parse(await body(req));
        if(detectCrisis(input.situation))return this.crisisStop(who,"situation");
        const key=req.headers.get("idempotency-key")??fail(400,"缺少请求幂等标识");
        if(!/^[\w-]{1,100}$/.test(key))fail(400,"请求标识格式不正确");
        const fingerprint=await digest(JSON.stringify(input));
        const existing=await this.store.db.prepare("SELECT fingerprint,session_id FROM requests WHERE owner=? AND key=?").bind(who,key).first<{fingerprint:string;session_id:string}>();
        if(existing){if(existing.fingerprint!==fingerprint)fail(409,"同一个请求标识不能用于不同内容");return json(await this.getSession(who,existing.session_id));}
        if((await this.store.list(who,"session")).length>=500)fail(409,"课堂版最多保留 500 次体验，请先导出并清理旧档案");
        const {p,decision}=await this.plan(who,input);
        if(!decision.selected)return json({error:decision.reasons[0],decision},422);
        const session:Session={id:crypto.randomUUID(),createdAt:this.now().toISOString(),request:input,decision,
          status:"planned",profileRevision:p.revision,kbVersion:this.kb.version,kbHash:this.kb.hash,
          ...(this.config.studyMode?{study:{arm:randomArm()}}:{})};
        try{await this.store.db.batch([
          this.store.db.prepare("INSERT INTO requests(owner,key,fingerprint,session_id) VALUES(?,?,?,?)").bind(who,key,fingerprint,session.id),
          this.store.statement(who,"session",session.id,session,true),
          this.store.db.prepare("INSERT INTO jobs(owner,session_id) VALUES(?,?)").bind(who,session.id),
        ]);}catch{
          const retry=await this.store.db.prepare("SELECT fingerprint,session_id FROM requests WHERE owner=? AND key=?").bind(who,key).first<{fingerprint:string;session_id:string}>();
          if(retry?.fingerprint===fingerprint)return json(await this.getSession(who,retry.session_id));
          fail(409,"本次请求未能建立，请换一个请求标识重试");
        }
        return json(session,201);
      }
      const session=await this.getSession(who,path[1]);
      if(path.length===2&&method==="GET")return json({...session,job:await this.store.job(who,session.id)});
      if(path[2]==="cancel"&&method==="POST"){
        if(session.status==="completed")fail(409,"体验已经完成");
        await this.store.db.batch([this.store.statement(who,"session",session.id,{...session,status:"cancelled"}),
          this.store.db.prepare("UPDATE jobs SET status='cancelled',lease_until=0 WHERE owner=? AND session_id=?").bind(who,session.id)]);
        return json({cancelled:true});
      }
      if(path[2]==="generate"&&method==="POST")return this.run(who,session);
      if(path[2]==="images"&&method==="POST"){
        if(!session.artifact?.images?.some(i=>i.status==="pending"))return json(session);
        const images=await Promise.all(session.artifact.images.map(im=>pollImage(this.config,im,this.fetcher)));
        const artifact=await this.persistArtifact(who,session.id,{...session.artifact,images});
        const current=await this.getSession(who,session.id);
        // Never resurrect a cancelled session or overwrite one that moved on.
        if(current.status!=="cancelled")await this.store.put(who,"session",session.id,{...current,artifact:{...current.artifact!,images:artifact.images}});
        return json(await this.getSession(who,session.id));
      }
      if(path[2]==="media"&&method==="POST"){
        if(session.status!=="awaiting-media"||!session.artifact)fail(409,"没有待完成的媒体任务");
        const artifact=await pollMedia(session.artifact!,this.config,this.fetcher);
        const updated={...session,artifact,status:artifact.media?.status==="ready"?"ready":"awaiting-media"};
        // Conditional update prevents a late poll from resurrecting a cancelled session.
        await this.store.db.prepare("UPDATE records SET body=?,updated_at=? WHERE owner=? AND kind='session' AND id=? AND json_extract(body,'$.status')='awaiting-media'")
          .bind(JSON.stringify(updated),this.now().toISOString(),who,session.id).run();
        return json(await this.getSession(who,session.id));
      }
      if(path[2]==="progress"&&method==="POST"){
        if(session.status!=="ready")fail(409,"体验尚不可播放");
        const p=z.object({scene:z.number().int().min(0),choiceId:z.string().max(40).optional(),
          elapsedSeconds:z.number().min(0).max(7200)}).strict().parse(await body(req));
        const scene=session.artifact?.content.scenes[p.scene];
        if(!scene||p.choiceId&&!scene.choices.some(c=>c.id===p.choiceId))fail(400,"场景或选择不存在");
        const id=`${session.id}:${p.scene}`;await this.store.put(who,"progress",id,{sessionId:session.id,...p});return json({saved:true});
      }
      if(path[2]==="feedback"&&method==="POST"){
        const feedback=feedbackSchema.parse(await body(req));
        const existing=await this.store.get<Feedback&{sessionId:string}>(who,"feedback",session.id);
        if(existing){const {sessionId:_,...old}=existing;if(JSON.stringify(old)!==JSON.stringify(feedback))fail(409,"该体验已记录反馈，不能重复影响学习");return json(existing);}
        if(!["ready","cancelled"].includes(session.status)||!session.artifact||session.artifact.media?.status==="pending")
          fail(409,"尚未提供可体验内容，不能记录效果反馈");
        const record={sessionId:session.id,...feedback};
        try{await this.store.db.batch([this.store.statement(who,"feedback",session.id,record,true),
          this.store.statement(who,"session",session.id,{...session,status:"completed"})]);}catch{fail(409,"反馈已提交，请刷新后查看");}
        return json(record,201);
      }
    }
    return fail(404,"接口不存在");
  }
  async run(owner:string,session:Session):Promise<Response>{
    if(["ready","completed","awaiting-media"].includes(session.status))return json(session);
    if(session.status==="cancelled")fail(409,"体验已取消");
    const profile=await this.profile(owner);
    if(profile.revision!==session.profileRevision||session.kbHash!==this.kb.hash)
      fail(409,"背景或知识版本已更新，请重新安排体验");
    const claim=await this.store.claim(owner,session.id,this.now().getTime()) as {attempts:number}|null;
    if(!claim)return fail(409,"任务正在执行或已达到三次尝试上限");
    await this.store.put(owner,"session",session.id,{...session,status:"running"});
    try{
      const artifact=await generate(profile.data,await this.store.list(owner,"event"),session.request,session.decision,
        this.config,selectedEvidence(session.decision,this.kb.nodes),session.id,this.fetcher,session.study?.arm);
      const stored=await this.persistArtifact(owner,session.id,artifact);
      const result={...session,artifact:stored,status:artifact.media?.status==="pending"?"awaiting-media":"ready"};
      // Permissions may have changed while a provider was running.
      if((await this.profile(owner)).revision!==session.profileRevision)throw new Error("背景授权已更新，请重新安排体验");
      await this.finish(owner,session.id,claim.attempts,result,"done",null);
    }catch(e){
      const message=e instanceof Error && /^(文本服务|音视频服务|尚未配置|内容|文字量|互动体验|背景授权|该媒介|生成服务)/.test(e.message)?e.message:"生成未完成，请稍后重试";
      await this.finish(owner,session.id,claim.attempts,{...session,status:"failed",error:message},"failed",message);
    }
    const current=await this.getSession(owner,session.id);
    return json(current,current.status==="failed"?502:200);
  }
  async finish(owner:string,id:string,attempt:number,value:unknown,status:string,error:string|null){
    await this.store.db.batch([
      this.store.db.prepare(`UPDATE records SET body=?,updated_at=? WHERE owner=? AND kind='session' AND id=?
        AND EXISTS(SELECT 1 FROM jobs WHERE owner=? AND session_id=? AND status='running' AND attempts=?)`)
        .bind(JSON.stringify(value),this.now().toISOString(),owner,id,owner,id,attempt),
      this.store.db.prepare("UPDATE jobs SET status=?,lease_until=0,error=? WHERE owner=? AND session_id=? AND status='running' AND attempts=?")
        .bind(status,error,owner,id,attempt),
    ]);
  }
}
