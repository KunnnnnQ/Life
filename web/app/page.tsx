"use client";
import { useEffect,useRef,useState } from "react";
import type { Session } from "../core/service.ts";
import type { Goal,Profile,LifeEvent,IntakeDraft,ExperienceRequest } from "../core/contracts.ts";
import { profileSchema } from "../core/contracts.ts";
import { Bunny,Icon } from "./pixel-art.tsx";

type State=ExperienceRequest["state"];
type Resource={name:string;contact:string;note:string};
type SafetyInfo={stop:boolean;message:string;resources:Resource[]};
type ScreenInfo={items:string[];options:string[];resources:Resource[];level:string;due:boolean;note:string};
type Outcome="better"|"same"|"worse";
type Tab="start"|"profile"|"history"|"evidence";

const goals:Record<Goal,string>={"calm-down":"平静下来",encouragement:"打打气",mastery:"找回掌控感","mood-shift":"换个心情",connection:"有人陪着"};
const metric={"calm-down":"tension",encouragement:"hope",mastery:"agency","mood-shift":"valence",connection:"connection"} as const;
const labels={"calm-down":"紧张程度",encouragement:"希望感",mastery:"掌控感","mood-shift":"愉快程度",connection:"被陪伴的感觉"};
const categories={other:"其他","daily-stress":"日常压力",achievement:"好消息或成就","role-change":"身份或环境变化",relationship:"关系变化",loss:"失去",health:"健康相关"};
const stages={unknown:"暂不填写",student:"在上学",working:"在工作",transition:"正在转变（毕业、换工作、搬家…）",retired:"已退休",other:"其他"};
const habitWords:Record<string,[string,string]>={reading:["看字多了会累","喜欢阅读"],video:["不太看视频","常看视频"],
  audio:["不太爱听","喜欢听（播客、音乐）"],interaction:["不想做太多选择","喜欢动手互动"],humor:["不想要玩笑","喜欢幽默"]};
const habitText=(k:string,v:number)=>v<=.25?habitWords[k][0]:v>=.75?habitWords[k][1]:`${habitWords[k][1]}（一般）`;
const neutralState:State={valence:5,tension:5,energy:5,hope:5,agency:5,connection:5};
// One tap: each status card carries a goal and a rough starting state. These presets are coarse on purpose.
const MOODS:{id:string;icon:string;colour:string;label:string;sub:string;goal:Goal;state:Partial<State>}[]=[
  {id:"tense",icon:"bolt",colour:"#ff004d",label:"紧张中",sub:"静不下来",goal:"calm-down",state:{tension:8,valence:4}},
  {id:"tired",icon:"zz",colour:"#29adff",label:"体力低",sub:"想歇一下",goal:"calm-down",state:{tension:6,energy:2,valence:4}},
  {id:"down",icon:"rain",colour:"#83769c",label:"有点丧",sub:"需要打打气",goal:"encouragement",state:{valence:3,hope:3,energy:4}},
  {id:"stuck",icon:"sword",colour:"#ffa300",label:"憋屈",sub:"想扳回一局",goal:"mastery",state:{agency:3,tension:6,valence:4}},
  {id:"flat",icon:"shuffle",colour:"#00e436",label:"没劲",sub:"想换换脑子",goal:"mood-shift",state:{valence:4,energy:3,tension:4}},
  {id:"lonely",icon:"heart",colour:"#ff77a8",label:"有点孤单",sub:"想有人陪",goal:"connection",state:{connection:2,valence:4}},
];
const STARTERS=["最近在忙……","平时放松的时候，我喜欢……","最近发生了一件事……","我不想在内容里看到……"];
// What the visitor will get, in plain words.
function kind(selected?:string|null){
  if(!selected)return "内容";
  if(selected==="music")return "音乐";
  if(selected==="spoken-story")return "音频故事";
  if(selected.includes("animation"))return "动画";
  if(selected==="short-video")return "短视频";
  if(selected==="micro-game")return "小游戏";
  if(selected==="interactive-story")return "互动故事";
  return "短阅读";
}
const store={get:(k:string)=>{try{return localStorage.getItem(k);}catch{return null;}},
  set:(k:string,v:string)=>{try{localStorage.setItem(k,v);}catch{/* private mode */}}};

async function api(path:string,method="GET",data?:unknown,key?:string):Promise<any>{
  const response=await fetch(`/api/${path}`,{method,headers:{"Content-Type":"application/json",...(key?{"Idempotency-Key":key}:{})},body:data===undefined?undefined:JSON.stringify(data)});
  const result=await response.json() as any;if(!response.ok)throw new Error(result.error??"请求未完成");return result;
}
function greeting(){const h=new Date().getHours();
  return h<5?"这么晚还没睡。现在什么状态？":h<11?"早。今天什么状态？":h<14?"中午好。现在什么状态？":h<18?"下午好。现在什么状态？":"晚上好。今天过得怎么样？";}
const clock=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

export default function Home(){
  const [tab,setTab]=useState<Tab>("start"),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const [mode,setMode]=useState("demo"),[study,setStudy]=useState(false);
  const [safety,setSafety]=useState<SafetyInfo|null>(null),[screen,setScreen]=useState<ScreenInfo|null>(null);
  const [profile,setProfile]=useState<Profile>(profileSchema.parse({})),[events,setEvents]=useState<LifeEvent[]>([]);
  const [session,setSession]=useState<Session|null>(null),[history,setHistory]=useState<Session[]>([]);
  // Navy is the default look; the light version is one tap away and remembered.
  const [light,setLight]=useState(false);
  useEffect(()=>setLight(store.get("mc.theme")==="light"),[]);
  useEffect(()=>{document.documentElement.dataset.theme=light?"light":"dark";},[light]);
  async function work(action:()=>Promise<void>){setBusy(true);setNotice("");try{await action();}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}
  useEffect(()=>{work(async()=>{await api("workspace","POST");
    const [p,h,e,health,sf]=await Promise.all([api("profile"),api("sessions"),api("events"),api("health"),api("safety")]);
    setProfile(p.data);setHistory(h);setEvents(e);setMode(health.mode);setStudy(!!health.studyMode);setScreen(sf);setReady(true);});},[]);
  const refresh=async()=>{const [p,e]=await Promise.all([api("profile"),api("events")]);setProfile(p.data);setEvents(e);};
  const done=history.filter(s=>s.status==="completed").length;
  return <main className="app">
    <div className="phone">
      <header className="hud">
        <a className="logo" href="/" aria-label="Mood Capsule 首页"><Bunny size={24}/><span>MOOD<b>CAPSULE</b></span></a>
        <span className="hud-stat" title="已完成的次数">LV.{String(done).padStart(2,"0")}</span>
        <button className="hud-btn" aria-label={light?"切换到深色":"切换到浅色"} onClick={()=>{const v=!light;setLight(v);store.set("mc.theme",v?"light":"dark");}}>{light?"☾":"☀"}</button>
      </header>
      <div className="screen">
        {ready&&mode==="demo"&&<p className="banner">课堂原型 · 示例内容</p>}
        {study&&<p className="banner">研究模式：每次的内容类型随机决定，其中一部分是普通的说明短文。</p>}
        {notice&&<p role="status" className="notice">{notice}</p>}
        {!ready&&<Loading text="读取中"/>}
        {safety&&<SafetyPanel info={safety} onClose={()=>setSafety(null)}/>}
        {ready&&tab==="start"&&(session?
          <SessionView session={session} setSession={setSession} study={study} busy={busy} work={work} screen={screen}
            onDone={async()=>{setSession(null);setHistory(await api("sessions"));setNotice("已记录。下次的安排会参考这次的反馈。");}}/>:
          <NowView study={study} busy={busy} work={work} screen={screen} setScreen={setScreen} setSafety={setSafety} setSession={setSession}/>)}
        {ready&&tab==="profile"&&<AboutView profile={profile} events={events} busy={busy} work={work} mode={mode} setSafety={setSafety}
          refresh={refresh} setNotice={setNotice}/>}
        {tab==="history"&&<HistoryView history={history}/>}
        {tab==="evidence"&&<EvidenceView work={work}/>}
      </div>
      <nav className="tabbar" aria-label="页面导航">{([["start","开始","▶"],["profile","我的","☺"],["history","记录","≡"],["evidence","依据","?"]] as [Tab,string,string][]).map(([id,label,glyph])=>
        <button key={id} className={tab===id?"on":""} aria-current={tab===id?"page":undefined} onClick={()=>setTab(id)}><i aria-hidden="true">{glyph}</i>{label}</button>)}</nav>
    </div>
  </main>;
}

type Work=(action:()=>Promise<void>)=>Promise<void>;

// RPG-style text box: the line types itself out; a tap shows it all at once.
function Dialog({who="RABBIT",text,children}:{who?:string;text:string;children?:React.ReactNode}){
  const [shown,setShown]=useState(0);
  useEffect(()=>{
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){setShown(text.length);return;}
    setShown(0);const t=setInterval(()=>setShown(n=>{if(n>=text.length){clearInterval(t);return n;}return n+1;}),32);
    return()=>clearInterval(t);},[text]);
  const typing=shown<text.length;
  return <div className="dialog px" onClick={()=>setShown(text.length)}>
    <span className="who">{who}</span>
    <p aria-live="polite">{text.slice(0,shown)}<span className="sr-only">{text.slice(shown)}</span>{!typing&&<span className="caret" aria-hidden="true">▼</span>}</p>
    {children}
  </div>;
}
function Loading({text}:{text:string}){return <div className="loading" role="status"><span>{text}</span><span className="bar" aria-hidden="true"><i/></span></div>;}

function NowView({study,busy,work,screen,setScreen,setSafety,setSession}:{study:boolean;busy:boolean;work:Work;screen:ScreenInfo|null;
  setScreen:(s:ScreenInfo)=>void;setSafety:(s:SafetyInfo)=>void;setSession:(s:Session)=>void}){
  const [minutes,setMinutes]=useState(3),[quiet,setQuiet]=useState(false);
  useEffect(()=>{setMinutes(Number(store.get("mc.minutes"))||3);setQuiet(store.get("mc.quiet")==="1");},[]);
  const [situation,setSituation]=useState(""),[situationInContent,setSituationInContent]=useState(false);
  const [picked,setPicked]=useState<typeof MOODS[number]|null>(null),[state,setState]=useState<State>(neutralState);
  const [skipScreen,setSkipScreen]=useState(true),[step,setStep]=useState(0),[answers,setAnswers]=useState<number[]>([]);
  const [hello]=useState(greeting);
  const pickMinutes=(n:number)=>{setMinutes(n);store.set("mc.minutes",String(n));};
  const toggleQuiet=()=>{setQuiet(!quiet);store.set("mc.quiet",!quiet?"1":"0");};
  async function start(goal:Goal,initial:State){await work(async()=>{
    const s=await api("sessions","POST",{goal,seconds:minutes*60,state:initial,situation,allowSituationInContent:situationInContent,
      context:{soundAllowed:!quiet,cognitiveLoad:1-initial.energy/10,reducedMotion:window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        speechAvailable:"speechSynthesis"in window&&!quiet}},crypto.randomUUID());
    if(s.safety){setSafety(s.safety);return;}
    // Keep the planned session available if generation fails, so the retry action can recover it.
    setSession(s);
    const result=await api(`sessions/${s.id}/generate`,"POST");setSession(result);
  });}
  function tap(m:typeof MOODS[number]){const initial={...neutralState,...m.state};
    // Research mode needs a real baseline rating; everyday use starts on one tap.
    if(study){setPicked(m);setState(initial);}else start(m.goal,initial);}
  function send(){
    // A lightweight starting estimate; the full sentence still reaches server-side safety and generation.
    const m=/累|困|疲|歇/.test(situation)?MOODS[1]:/紧张|焦虑|压力|慌/.test(situation)?MOODS[0]:/低落|难过|伤心|失落|丧/.test(situation)?MOODS[2]:/憋屈|生气|烦/.test(situation)?MOODS[3]:/无聊|没劲/.test(situation)?MOODS[4]:/孤单|孤独|一个人/.test(situation)?MOODS[5]:MOODS[4];
    tap(m);
  }
  function answer(v:number){const next=[...answers,v];setAnswers(next);
    if(next.length<4){setStep(step+1);return;}
    work(async()=>{const r=await api("screening","POST",{answers:next});if(r.safety)setSafety(r.safety);setScreen(await api("safety"));setSkipScreen(true);});}
  if(screen?.due&&!skipScreen)return <section className="now">
    <div className="npc"><Bunny size={120}/></div>
    <Dialog text={`过去两周，你有多常${screen.items[step]}？`}>
      <p className="meta">近况确认 {step+1}/4 · 可以跳过 · 不是诊断</p>
    </Dialog>
    <div className="menu" role="group" aria-label="选项">{screen.options.map((o,v)=><button key={o} disabled={busy} onClick={()=>answer(v)}>{o}</button>)}</div>
    <button className="quiet" onClick={()=>setSkipScreen(true)}>这次先跳过</button>
  </section>;
  return <section className="now">
    <div className="npc"><Bunny size={120} mood={busy?"busy":"idle"}/></div>
    <Dialog text={busy?"收到，正在准备……":hello}>
      {!busy&&<p className="meta">选一张状态卡，或者直接打一句。内容形式由系统挑。</p>}
    </Dialog>
    {busy?<Loading text="生成中"/>:<>
      <div className="status-grid" role="group" aria-label="当前状态">{MOODS.map(m=>
        <button key={m.id} className={`status px${picked?.id===m.id?" on":""}`} style={{"--c":m.colour} as React.CSSProperties} disabled={busy} onClick={()=>tap(m)}>
          <Icon name={m.icon} colour={m.colour}/><b>{m.label}</b><small>{m.sub}</small></button>)}</div>
      {study&&picked&&<div className="px panel">
        <Range label="现在有多紧张" value={state.tension} onChange={v=>setState({...state,tension:v})}/>
        <Range label="现在还有多少精力" value={state.energy} onChange={v=>setState({...state,energy:v})}/>
        {picked.goal!=="calm-down"&&<Range label={`现在的${labels[picked.goal]}`} value={state[metric[picked.goal]]} onChange={v=>setState({...state,[metric[picked.goal]]:v})}/>}
        <button className="primary" disabled={busy} onClick={()=>start(picked.goal,state)}>开始</button>
      </div>}
      <form className="composer" onSubmit={e=>{e.preventDefault();if(!busy&&situation.trim())send();}}>
        <label className="sr-only" htmlFor="now-text">此刻的状态</label>
        <input id="now-text" className="px" value={situation} maxLength={1000} placeholder="比如：刚下班，脑子还停不下来" disabled={busy} onChange={e=>setSituation(e.target.value)}/>
        <button className="primary" disabled={busy||!situation.trim()} type="submit" aria-label="发送">▶</button>
      </form>
      {situation&&<label className="check"><input type="checkbox" checked={situationInContent} onChange={e=>setSituationInContent(e.target.checked)}/>可以把这句话的主题写进内容里</label>}
      <div className="chips" role="group" aria-label="时长与声音">
        {[1,3,5,10].map(n=><button key={n} className={`chip${minutes===n?" on":""}`} aria-pressed={minutes===n} onClick={()=>pickMinutes(n)}>{n} 分钟</button>)}
        <button className={`chip${quiet?"":" on"}`} aria-pressed={!quiet} onClick={toggleQuiet}>{quiet?"不要声音":"可以有声音"}</button>
      </div>
      {screen?.due&&<button className="quiet" onClick={()=>setSkipScreen(false)}>先做一个 4 题的近况确认 ›</button>}
    </>}
  </section>;
}

function SessionView({session,setSession,study,busy,work,screen,onDone}:{session:Session;setSession:(s:Session|null)=>void;study:boolean;busy:boolean;
  work:Work;screen:ScreenInfo|null;onDone:()=>Promise<void>}){
  const [scene,setScene]=useState(0),[elapsed,setElapsed]=useState(0),[playing,setPlaying]=useState(session.status==="ready"),[ended,setEnded]=useState(false);
  const [consequence,setConsequence]=useState(""),[chosen,setChosen]=useState<string[]>([]);
  const [after,setAfter]=useState(session.request.state[metric[session.request.goal]]),[attainment,setAttainment]=useState(5);
  const [preachy,setPreachy]=useState(false),[discomfort,setDiscomfort]=useState(false),[disliked,setDisliked]=useState(false);
  const content=session.artifact?.content,current=content?.scenes[scene],animated=session.decision.selected?.includes("animation");
  useEffect(()=>{if(session.status==="ready")setPlaying(true);},[session.status]);
  useEffect(()=>{if(!playing||!session.artifact||ended)return;const t=setInterval(()=>setElapsed(v=>v+1),1000);return()=>clearInterval(t);},[playing,session,ended]);
  useEffect(()=>{if(elapsed>=session.decision.seconds){setEnded(true);setPlaying(false);window.speechSynthesis?.cancel();}},[elapsed,session]);
  useEffect(()=>{if(!playing||ended||!content||!animated)return;let b=0;
    for(let i=0;i<content.scenes.length;i++){b+=content.scenes[i].durationSeconds;if(elapsed<b){setScene(i);break;}}},[elapsed,playing,ended,content,animated]);
  // Server-generated narration (Qwen TTS) plays clip by clip and moves the scene along; otherwise the browser voice reads it.
  // Nothing plays until the visitor presses the button.
  const clips=session.artifact?.audio??[],voice=useRef<HTMLAudioElement|null>(null);
  const silence=()=>{window.speechSynthesis?.cancel();voice.current?.pause();voice.current=null;};
  useEffect(()=>silence,[]);
  // Illustrations are generated asynchronously; poll a few times, quietly, until they are ready.
  const pendingImages=session.artifact?.images?.some(i=>i.status==="pending");
  useEffect(()=>{if(!pendingImages)return;let tries=0;
    const t=setInterval(async()=>{tries++;if(tries>20){clearInterval(t);return;}
      try{const s=await api(`sessions/${session.id}/images`,"POST");if(s?.artifact)setSession(s);}catch{/* keep polling */}},3000);
    return()=>clearInterval(t);},[session.id,pendingImages]);
  const ready=(session.artifact?.images??[]).filter(i=>i.status==="ready"&&i.url);
  const art=ready.find(i=>i.scene===scene)??ready[0];
  const stop=()=>{setEnded(true);setPlaying(false);silence();};
  function speak(){if(!content)return;silence();
    if(clips.length){let i=0;const next=()=>{if(i>=clips.length){voice.current=null;return;}const clip=clips[i++];
        if(clip.scene<content.scenes.length)setScene(clip.scene);const a=new Audio(clip.url);voice.current=a;a.onended=next;a.onerror=next;a.play().catch(()=>{});};
      next();return;}
    if(!("speechSynthesis"in window))return;
    const u=new SpeechSynthesisUtterance(content.scenes.map(s=>s.text).join("。")+content.ending);u.lang="zh-CN";u.rate=.9;window.speechSynthesis.speak(u);}
  async function submit(afterValue:number,goalAttainment:number){await work(async()=>{
    await api(`sessions/${session.id}/feedback`,"POST",{after:{...session.request.state,[metric[session.request.goal]]:afterValue},goalAttainment,
      liked:!disliked,discomfort,preachy,completion:Math.min(1,elapsed/session.decision.seconds),elapsedSeconds:elapsed});
    silence();await onDone();});}
  // Coarse one-tap mapping; research mode uses the sliders instead.
  function quick(o:Outcome){const key=metric[session.request.goal],before=session.request.state[key],sign=key==="tension"?-1:1;
    const shift={better:3,same:0,worse:-2}[o];submit(Math.min(10,Math.max(0,before+sign*shift)),{better:7,same:4,worse:1}[o]);}
  const total=session.decision.seconds,label=kind(session.decision.selected);
  return <section className="session">
    <div className="quest px">
      <span className="tag">{label}</span><h1>{content?.title??"准备中"}</h1>
      <div className="timer"><span>{clock(Math.min(elapsed,total))}</span><span className="bar" aria-hidden="true"><i style={{width:`${Math.min(100,elapsed/total*100)}%`}}/></span><span>{clock(total)}</span></div>
    </div>
    {session.artifact?.warnings.map(w=><p className="notice" key={w}>{w}</p>)}
    {session.decision.flags?.screening==="elevated"&&<p className="notice">如果想找人聊聊：{screen?.resources.map(r=>`${r.name} ${r.contact}`).join("；")}</p>}
    {busy&&!content&&<><div className="npc"><Bunny size={96} mood="busy"/></div><Loading text={`正在准备${label}`}/></>}
    {session.status==="awaiting-media"&&<><p>音视频还在制作。</p><button disabled={busy} onClick={()=>work(async()=>{const s=await api(`sessions/${session.id}/media`,"POST");setSession(s);setPlaying(s.status==="ready");})}>查看进度</button></>}
    {session.status==="ready"&&current&&!ended&&<>
      {session.artifact?.media?.url&&(session.decision.selected==="music"?<audio controls src={session.artifact.media.url}/>:<video controls src={session.artifact.media.url}/>)}
      {art?<figure className="art px"><img src={art.url} alt="这段内容的插画"/></figure>:pendingImages?<div className="art px art-wait"><Loading text="插画生成中"/></div>:null}
      <Dialog who={`${scene+1}/${content!.scenes.length}`} text={current.text}/>
      {current.choices.length>0&&<div className="menu" role="group" aria-label="选择">{current.choices.map(c=>
        <button key={c.id} className={chosen.includes(c.id)?"on":""} disabled={busy||current.choices.some(x=>chosen.includes(x.id))} onClick={()=>work(async()=>{
          await api(`sessions/${session.id}/progress`,"POST",{scene,choiceId:c.id,elapsedSeconds:elapsed});setConsequence(c.consequence);setChosen(v=>[...v,c.id]);})}>{c.label}</button>)}</div>}
      {consequence&&<p className="consequence">{consequence}</p>}
      <div className="controls">
        <button className="primary" onClick={()=>{if(scene+1<content!.scenes.length){setScene(scene+1);setConsequence("");}else stop();}}>{scene+1<content!.scenes.length?"下一段 ▶":"完成 ▶"}</button>
        <button onClick={()=>{setPlaying(!playing);if(playing){window.speechSynthesis?.pause();voice.current?.pause();}else{window.speechSynthesis?.resume();voice.current?.play().catch(()=>{});}}}>{playing?"暂停":"继续"}</button>
        {session.decision.selected==="spoken-story"&&<button onClick={speak}>{clips.length?"播放配音":"朗读"}</button>}
        <button onClick={stop}>结束</button>
      </div>
    </>}
    {(session.status==="planned"||session.status==="failed")&&!busy&&<button className="primary" onClick={()=>work(async()=>{const s=await api(`sessions/${session.id}/generate`,"POST");setSession(s);setPlaying(s.status==="ready");})}>重试</button>}
    {ended&&content&&<>
      {content.ending&&<Dialog who="END" text={content.ending}/>}
      <div className="px panel">
        <h2>和开始时比，现在怎么样？</h2>
        <p className="meta">没有变化或者更糟，也是有用的记录。有需要的话先勾一下：</p>
        <div className="chips">
          <button className={`chip${preachy?" on":""}`} aria-pressed={preachy} onClick={()=>setPreachy(!preachy)}>有点像说教</button>
          <button className={`chip${discomfort?" on":""}`} aria-pressed={discomfort} onClick={()=>setDiscomfort(!discomfort)}>有让我不舒服的内容</button>
          <button className={`chip${disliked?" on":""}`} aria-pressed={disliked} onClick={()=>setDisliked(!disliked)}>不喜欢这种形式</button>
        </div>
        {study?<>
          <Range label={`现在的${labels[session.request.goal]}`} value={after} onChange={setAfter}/>
          <Range label="这段内容满足了多少这次的需要" value={attainment} onChange={setAttainment}/>
          <button className="primary" disabled={busy} onClick={()=>submit(after,attainment)}>记录</button>
        </>:<div className="menu">{([["better","好一些"],["same","差不多"],["worse","更糟了"]] as [Outcome,string][]).map(([o,l])=>
          <button key={o} disabled={busy} onClick={()=>quick(o)}>{l}</button>)}</div>}
      </div>
    </>}
    <details className="why"><summary>为什么是{label}</summary>{session.decision.reasons.map(r=><p key={r}>{r}</p>)}</details>
    {!ended&&<button className="quiet" disabled={busy} onClick={()=>work(async()=>{await api(`sessions/${session.id}/cancel`,"POST");silence();setSession(null);})}>退出这次</button>}
  </section>;
}

function AboutView({profile,events,busy,work,mode,setSafety,refresh,setNotice}:{profile:Profile;events:LifeEvent[];busy:boolean;work:Work;mode:string;
  setSafety:(s:SafetyInfo)=>void;refresh:()=>Promise<void>;setNotice:(s:string)=>void}){
  const [text,setText]=useState(""),[draft,setDraft]=useState<IntakeDraft|null>(null);
  const [manual,setManual]=useState<Profile>(profile);
  const [eventTitle,setEventTitle]=useState(""),[eventDate,setEventDate]=useState(""),[category,setCategory]=useState("other");
  useEffect(()=>setManual(profile),[profile]);
  const savePatch=(patch:Partial<Profile>)=>work(async()=>{await api("profile","PUT",{...profile,...patch});await refresh();});
  function organize(){work(async()=>{const r=await api("intake","POST",{text});
    if(r.safety){setSafety(r.safety);return;}
    setDraft(r.draft);if(!r.draft.events.length&&!r.draft.profile.themes.length&&!r.draft.profile.avoidTopics.length&&!r.draft.profile.habits&&!r.draft.profile.lifeStage)
      setNotice("这段话里暂时没有整理出可以保存的内容。可以换个说法，或者多说一点。");});}
  function saveDraft(){if(!draft)return;work(async()=>{const r=await api("intake/apply","POST",draft);
    if(r.safety){setSafety(r.safety);return;}setDraft(null);setText("");await refresh();setNotice("已经记下了。之后的安排会参考这些。");});}
  const dp=draft?.profile;
  const dropHabit=(k:string)=>{if(!draft||!dp?.habits)return;const {[k as keyof typeof dp.habits]:_,...rest}=dp.habits;setDraft({...draft,profile:{...dp,habits:rest}});};
  return <section className="page">
    <h1>我的偏好</h1>
    <div className="px panel">
      <p>随便写几句，不用按格式。系统整理成几条，你删掉不对的就行。原话不保存。</p>
      <div className="chips">{STARTERS.map(s=><button key={s} className="chip" onClick={()=>setText(t=>(t?t+"\n":"")+s)}>{s.replace("……","")}</button>)}</div>
      <label className="sr-only" htmlFor="intake">关于自己的描述</label>
      <textarea id="intake" className="px" value={text} maxLength={2000} rows={5} onChange={e=>setText(e.target.value)}
        placeholder="比如：在读研，最近论文有点赶。不爱看长文章，喜欢猫和下雨天。不想看到考试相关的内容。"/>
      <button className="primary" disabled={busy||!text.trim()} onClick={organize}>{busy?"整理中…":"帮我整理"}</button>
      {mode==="demo"&&<p className="meta">示例模式：目前用简单规则整理，只能理解比较直接的说法。</p>}
    </div>
    {draft&&dp&&<div className="px panel">
      <h2>整理出来的</h2><p className="meta">点 ✕ 去掉不对的。经历默认只用来挑形式，不会写进内容，除非你打开开关。</p>
      <div className="chips">
        {dp.lifeStage&&dp.lifeStage!=="unknown"&&<Tag text={stages[dp.lifeStage]} onRemove={()=>setDraft({...draft,profile:{...dp,lifeStage:undefined}})}/>}
        {Object.entries(dp.habits??{}).map(([k,v])=>v===undefined?null:<Tag key={k} text={habitText(k,v)} onRemove={()=>dropHabit(k)}/>)}
        {dp.themes.map(t=><Tag key={`t${t}`} text={`喜欢：${t}`} onRemove={()=>setDraft({...draft,profile:{...dp,themes:dp.themes.filter(x=>x!==t)}})}/>)}
        {dp.avoidTopics.map(t=><Tag key={`a${t}`} text={`不想看到：${t}`} onRemove={()=>setDraft({...draft,profile:{...dp,avoidTopics:dp.avoidTopics.filter(x=>x!==t)}})}/>)}
      </div>
      {draft.events.map((e,i)=><article key={i} className="item">
        <strong>{e.title}</strong>
        <p className="meta">{categories[e.category]} · {e.approximateDate?"大约 ":""}{e.occurredOn.slice(0,7)}{e.ongoing?" · 还在影响":""}{e.centrality?" · 已经是自己的一部分":""}</p>
        <label className="check"><input type="checkbox" checked={e.useInContent} onChange={ev=>setDraft({...draft,events:draft.events.map((x,j)=>j===i?{...x,useInContent:ev.target.checked}:x)})}/>可以借用这件事的主题写内容</label>
        <button className="quiet" onClick={()=>setDraft({...draft,events:draft.events.filter((_,j)=>j!==i)})}>✕ 去掉</button>
      </article>)}
      {draft.notes.length>0&&<p className="meta">还提到了：{draft.notes.join("；")}</p>}
      <div className="row"><button className="primary" disabled={busy} onClick={saveDraft}>保存</button><button className="quiet" onClick={()=>setDraft(null)}>算了</button></div>
    </div>}
    <div className="px panel">
      <h2>目前记下的</h2>
      {!profile.themes.length&&!profile.avoidTopics.length&&!events.length&&profile.lifeStage==="unknown"&&<p className="meta">还没有内容。不填也可以直接开始。</p>}
      <div className="chips">
        {profile.lifeStage!=="unknown"&&<Tag text={stages[profile.lifeStage]} onRemove={()=>savePatch({lifeStage:"unknown"})}/>}
        {Object.entries(profile.habits).map(([k,v])=>v===null?null:<Tag key={k} text={habitText(k,v)} onRemove={()=>savePatch({habits:{...profile.habits,[k]:null}})}/>)}
        {profile.themes.map(t=><Tag key={`t${t}`} text={`喜欢：${t}`} onRemove={()=>savePatch({themes:profile.themes.filter(x=>x!==t)})}/>)}
        {profile.avoidTopics.map(t=><Tag key={`a${t}`} text={`不想看到：${t}`} onRemove={()=>savePatch({avoidTopics:profile.avoidTopics.filter(x=>x!==t)})}/>)}
      </div>
      {events.map(e=><article key={e.id} className="item"><strong>{e.title}</strong>
        <p className="meta">{categories[(e.category??"other") as keyof typeof categories]} · {e.occurredOn.slice(0,7)} · {e.useInContent?"可以写进内容":"只用来挑形式"}</p>
        <div className="row"><button disabled={busy} onClick={()=>work(async()=>{const {id,confirmedAt:_,...data}=e;await api(`events/${id}`,"PUT",data);await refresh();setNotice("好的，会继续把这件事考虑进去。");})}>还在影响我</button>
        <button disabled={busy} onClick={()=>work(async()=>{await api(`events/${e.id}`,"DELETE");await refresh();})}>删除</button></div></article>)}
    </div>
    <details className="px panel"><summary>手动调整</summary>
      <label>出生年份（可留空）<input type="number" min="1900" value={manual.birthYear??""} onChange={e=>setManual({...manual,birthYear:e.target.value?Number(e.target.value):null})}/></label>
      <label>现在大概处在<select value={manual.lifeStage} onChange={e=>setManual({...manual,lifeStage:e.target.value as Profile["lifeStage"]})}>{Object.entries(stages).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      {Object.entries({reading:"读文字的时候",video:"看视频的时候",audio:"听声音内容的时候",interaction:"需要动手选择的时候",humor:"遇到玩笑的时候"}).map(([key,label])=>
        <label key={key}>{label}，通常<select value={manual.habits[key as keyof Profile["habits"]]??""} onChange={e=>setManual({...manual,habits:{...manual.habits,[key]:e.target.value===""?null:Number(e.target.value)}})}>
          <option value="">说不好</option><option value="0">不太舒服</option><option value="0.5">还行</option><option value="1">很享受</option></select></label>)}
      <label>不想出现的话题（用逗号隔开）<input value={manual.avoidTopics.join("，")} onChange={e=>setManual({...manual,avoidTopics:e.target.value.split(/[,，]/).map(v=>v.trim()).filter(Boolean)})}/></label>
      <button disabled={busy} onClick={()=>work(async()=>{await api("profile","PUT",manual);await refresh();setNotice("已更新。");})}>保存</button>
      <h2>记一件事</h2>
      <label>一句话就好<input value={eventTitle} onChange={e=>setEventTitle(e.target.value)} maxLength={100}/></label>
      <label>大概什么时候<input type="date" value={eventDate} onChange={e=>setEventDate(e.target.value)}/></label>
      <label>更接近哪一类<select value={category} onChange={e=>setCategory(e.target.value)}>{Object.entries(categories).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <button disabled={busy||!eventTitle||!eventDate} onClick={()=>work(async()=>{const r=await api("events","POST",{title:eventTitle,occurredOn:eventDate,category,lifeStage:profile.lifeStage,useForSelection:true,ongoing:true});
        if(r.safety)setSafety(r.safety);await refresh();setEventTitle("");})}>记下</button>
    </details>
    <div className="row">
      <button onClick={()=>work(async()=>{const data=await api("export"),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="mood-capsule-data.json";a.click();URL.revokeObjectURL(url);})}>导出我的记录</button>
      <button className="danger" onClick={()=>{if(window.confirm("删除这个浏览器里的档案、经历和全部记录？"))work(async()=>{await api("workspace","DELETE");window.location.reload();});}}>删除全部记录</button>
    </div>
  </section>;
}

function HistoryView({history}:{history:Session[]}){
  return <section className="page"><h1>记录</h1>
    <p className="meta">单次前后的变化也受当时状态自然起伏的影响，所以系统比较的是不同内容之间的差别，不把每次变化都当成效果。</p>
    {history.length===0?<p className="px panel">还没有记录。</p>:history.map(s=><article key={s.id} className="px panel item">
      <span className="tag">{kind(s.decision.selected)}</span><strong>{s.artifact?.content.title??goals[s.request.goal]}</strong>
      <p className="meta">{new Date(s.createdAt).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})} · {({completed:"已完成",cancelled:"中途退出",failed:"没生成成功","awaiting-media":"制作中"} as Record<string,string>)[s.status]??"未完成"}</p>
      <p>{s.decision.reasons[0]}</p></article>)}</section>;
}

function EvidenceView({work}:{work:Work}){
  const [knowledge,setKnowledge]=useState<Record<string,{name:{zh:string};summary:string}>>({});
  useEffect(()=>{work(async()=>setKnowledge((await api("knowledge")).nodes));},[]);
  return <section className="page"><h1>研究依据</h1><p className="meta">研究用来提出和修正设计；具体内容有没有帮助，还要看实际反馈和研究检验。</p>
    {Object.entries(knowledge).filter(([id])=>id.startsWith("mechanic.")||id.startsWith("risk.")).map(([id,node])=><article key={id} className="px panel item">
      {id.startsWith("risk.")&&<span className="tag warn">风险</span>}<strong>{node.name.zh}</strong><p>{node.summary}</p><a href={`/api/knowledge/${id}`} target="_blank" rel="noreferrer">出处与适用范围 ›</a></article>)}</section>;
}
function Tag({text,onRemove}:{text:string;onRemove:()=>void}){return <span className="chip tag-chip">{text}<button aria-label={`去掉 ${text}`} onClick={onRemove}>✕</button></span>;}
function SafetyPanel({info,onClose}:{info:SafetyInfo;onClose:()=>void}){return <div className="safety px" role="alert">
  <h2>{info.stop?"先停一下":"想让你知道"}</h2><p>{info.message}</p>
  <ul>{info.resources.map(r=><li key={r.contact}><strong>{r.name}：{r.contact}</strong> · {r.note}</li>)}</ul>
  <button className="primary" onClick={onClose}>{info.stop?"我知道了":"好的"}</button></div>;}
function Range({label,value,onChange}:{label:string;value:number;onChange:(value:number)=>void}){return <label>{label}<span className="range"><input type="range" min="0" max="10" step="1" value={value} onChange={e=>onChange(Number(e.target.value))}/><output>{value}/10</output></span></label>;}
