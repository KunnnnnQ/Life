"use client";
import { useEffect,useRef,useState } from "react";
import type { Session } from "../core/service.ts";
import type { Goal,Profile,LifeEvent,IntakeDraft,ExperienceRequest } from "../core/contracts.ts";
import { profileSchema } from "../core/contracts.ts";
import ImmersiveShop,{shopObject} from "./immersive-shop.tsx";

type State=ExperienceRequest["state"];
type Resource={name:string;contact:string;note:string};
type SafetyInfo={stop:boolean;message:string;resources:Resource[]};
type ScreenInfo={items:string[];options:string[];resources:Resource[];level:string;due:boolean;note:string};
type Outcome="better"|"same"|"worse";

const goals:Record<Goal,string>={"calm-down":"平静下来",encouragement:"得到鼓励",mastery:"找回成就感","mood-shift":"换个心情",connection:"感到有人陪伴"};
const metric={"calm-down":"tension",encouragement:"hope",mastery:"agency","mood-shift":"valence",connection:"connection"} as const;
const labels={"calm-down":"紧张程度",encouragement:"希望感",mastery:"掌控感","mood-shift":"愉快程度",connection:"被陪伴的感觉"};
const categories={other:"其他","daily-stress":"日常压力",achievement:"好消息或成就","role-change":"身份或环境变化",relationship:"关系变化",loss:"失去",health:"健康相关"};
const stages={unknown:"暂不填写",student:"在上学",working:"在工作",transition:"正在转变（毕业、换工作、搬家…）",retired:"已退休",other:"其他"};
const habitWords:Record<string,[string,string]>={reading:["看字多了会累","喜欢阅读"],video:["不太看视频","常看视频"],
  audio:["不太爱听","喜欢听（播客、音乐）"],interaction:["不想做太多选择","喜欢动手互动"],humor:["不想要玩笑","喜欢幽默"]};
const habitText=(k:string,v:number)=>v<=.25?habitWords[k][0]:v>=.75?habitWords[k][1]:`${habitWords[k][1]}（一般）`;
const neutralState:State={valence:5,tension:5,energy:5,hope:5,agency:5,connection:5};
// One tap: each card carries a goal and a rough starting state. These presets are coarse on purpose.
const MOODS:{id:string;emoji:string;label:string;goal:Goal;state:Partial<State>}[]=[
  {id:"tense",emoji:"😣",label:"紧绷，静不下来",goal:"calm-down",state:{tension:8,valence:4}},
  {id:"tired",emoji:"🥱",label:"累了，想歇一下",goal:"calm-down",state:{tension:6,energy:2,valence:4}},
  {id:"down",emoji:"😞",label:"有点低落",goal:"encouragement",state:{valence:3,hope:3,energy:4}},
  {id:"stuck",emoji:"😤",label:"憋屈，想扳回一局",goal:"mastery",state:{agency:3,tension:6,valence:4}},
  {id:"flat",emoji:"😶",label:"没劲，想换换",goal:"mood-shift",state:{valence:4,energy:3,tension:4}},
  {id:"lonely",emoji:"🫥",label:"有点孤单",goal:"connection",state:{connection:2,valence:4}},
];
const STARTERS=["最近在忙……","平时放松的时候，我喜欢……","最近发生了一件事……","我不想在故事里看到……"];
const store={get:(k:string)=>{try{return localStorage.getItem(k);}catch{return null;}},
  set:(k:string,v:string)=>{try{localStorage.setItem(k,v);}catch{/* private mode */}}};

async function api(path:string,method="GET",data?:unknown,key?:string):Promise<any>{
  const response=await fetch(`/api/${path}`,{method,headers:{"Content-Type":"application/json",...(key?{"Idempotency-Key":key}:{})},body:data===undefined?undefined:JSON.stringify(data)});
  const result=await response.json() as any;if(!response.ok)throw new Error(result.error??"请求未完成");return result;
}

export default function Home(){
  const [still,setStill]=useState(false),[returned,setReturned]=useState(false);
  const [muted,setMuted]=useState(()=>store.get("mc.muted")==="1");
  useEffect(()=>store.set("mc.muted",muted?"1":"0"),[muted]);
  const [inside,setInside]=useState(false),[chatOpen,setChatOpen]=useState(false),[greeting,setGreeting]=useState("");
  const [tab,setTab]=useState("start"),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const [mode,setMode]=useState("demo"),[study,setStudy]=useState(false);
  const [safety,setSafety]=useState<SafetyInfo|null>(null),[screen,setScreen]=useState<ScreenInfo|null>(null);
  const [profile,setProfile]=useState<Profile>(profileSchema.parse({})),[events,setEvents]=useState<LifeEvent[]>([]);
  const [session,setSession]=useState<Session|null>(null),[history,setHistory]=useState<Session[]>([]);
  async function work(action:()=>Promise<void>){setBusy(true);setNotice("");try{await action();}catch(e){setNotice((e as Error).message);}finally{setBusy(false);}}
  useEffect(()=>{work(async()=>{await api("workspace","POST");
    const [p,h,e,health,sf]=await Promise.all([api("profile"),api("sessions"),api("events"),api("health"),api("safety")]);
    setProfile(p.data);setHistory(h);setEvents(e);setMode(health.mode);setStudy(!!health.studyMode);setScreen(sf);setReady(true);});},[]);
  const refresh=async()=>{const [p,e]=await Promise.all([api("profile"),api("events")]);setProfile(p.data);setEvents(e);};
  useEffect(()=>{const q=window.matchMedia("(prefers-reduced-motion: reduce)");setStill(q.matches);const change=()=>setStill(q.matches);q.addEventListener("change",change);return()=>q.removeEventListener("change",change);},[]);
  useEffect(()=>{if(!inside)return;const timer=setTimeout(()=>setChatOpen(true),still?0:3600);return()=>clearTimeout(timer);},[inside]);
  // A one-line note the visitor leaves for their next visit; it stays in this browser and shows on the counter pad.
  const [note,setNote]=useState(()=>store.get("mc.note")??""),[noteOpen,setNoteOpen]=useState(false);
  useEffect(()=>store.set("mc.note",note),[note]);
  const enter=()=>{setInside(true);setTab("start");setGreeting(note?`便签上是你上次写的：「${note}」`:"店员抬头看了你一眼。");};
  const pet=()=>{if(!inside){enter();return;}setGreeting("它往你手边蹭了蹭。");};
  const onObject=(name:string)=>{if(!inside){enter();return;}
    if(name==="note"){setNoteOpen(true);setChatOpen(true);setTab("start");return;}
    if(shopObject(session?.decision.selected)===name){setNoteOpen(false);setChatOpen(true);}};
  return <main className={`night-store immersive-store${inside?" has-entered":""}${still?" still":""}`}>
    <ImmersiveShop inside={inside} busy={busy&&ready} device={shopObject(session?.decision.selected)} still={still} returned={returned} muted={muted}
      panelOpen={(inside&&chatOpen)||tab!=="start"||!!safety} onLeave={()=>{setInside(false);setChatOpen(false);setGreeting("");}}
      caption={session?.artifact?.content.title??""} note={note} onEnter={enter} onPet={pet} onObject={onObject}/>
    <header className="store-header"><a className="brand" href="/" aria-label="深夜情绪便利店首页"><span className="brand-mark">灯</span><span>深夜情绪便利店<small>LATE NIGHT STORE</small></span></a>
    <nav aria-label="页面导航">{[["start","店内"],["profile","我的偏好"],["history","记录"],["evidence","研究依据"]].map(([id,label])=>
      <button key={id} className={tab===id?"active":""} aria-current={tab===id?"page":undefined} onClick={()=>{setTab(id);if(id==="start"&&inside)setChatOpen(true);}}>{label}</button>)}</nav>
    <div className="header-toggles"><button className="motion-toggle" aria-pressed={!muted} onClick={()=>setMuted(!muted)}>{muted?"声音 关":"声音 开"}</button>
    <button className="motion-toggle" aria-pressed={still} onClick={()=>setStill(!still)}>{still?"动画 已暂停":"暂停动画"}</button></div></header>
    {!inside&&tab==="start"&&<div className="street-entry"><p className="eyebrow">营业中 · 22:00 – 06:00</p><h1>说一句此刻的状态，<br/>换一段几分钟的内容。</h1><button className="enter-world" onClick={enter}>进店 <span>↗</span></button><p>故事、声音或一个小练习，由系统挑选 · 也可以先在街上走走</p></div>}
    {inside&&<div className="in-world-actions"><button onClick={()=>{setInside(false);setChatOpen(false);setGreeting("");}}>← 出门</button><button onClick={()=>{setTab("start");setNoteOpen(false);setChatOpen(!chatOpen);}}>{chatOpen?"收起面板":"说点什么"}</button></div>}
    {greeting&&inside&&!chatOpen&&<p className="world-greeting" role="status">{greeting}</p>}
    <div className={`world-panel-wrap ${tab!=="start"||inside&&chatOpen||safety?"panel-visible":""} ${tab!=="start"?"notebook-wrap":""}`}>
    <div className={`store-panel ${tab!=="start"?"paper-panel":""}`}>
    <button className="close-world-panel" aria-label="收起面板" onClick={()=>{setChatOpen(false);setNoteOpen(false);setTab("start");}}>×</button>
    <div className="shop-open"><span/> 营业中 <i>22:00 – 06:00</i></div>
    {mode==="demo"&&<p className="demo-note">课堂原型 · 示例体验</p>}
    {study&&<p className="mode">研究模式：为了比较不同内容，每次安排的内容类型会随机决定，其中一部分是普通的说明性短文。</p>}
    {notice&&<p role="status" className="notice">{notice}</p>}{!ready&&<p>正在打开体验档案…</p>}
    {safety&&<SafetyPanel info={safety} onClose={()=>setSafety(null)}/>}
    {ready&&tab==="start"&&inside&&(noteOpen?<NoteView note={note} onSave={v=>{setNote(v);setNoteOpen(false);setChatOpen(false);setGreeting(v?"写好了，放在柜台上。":"便签清空了。");}}/>:session?
      <SessionView session={session} setSession={setSession} study={study} busy={busy} work={work} screen={screen}
        onDone={async()=>{setSession(null);setReturned(true);setHistory(await api("sessions"));setNotice("已记录。下次的安排会参考这次的反馈。");}}/>:
      <NowView study={study} busy={busy} work={work} screen={screen} setScreen={setScreen} setSafety={setSafety} setSession={setSession}/>)}
    {ready&&tab==="profile"&&<AboutView profile={profile} events={events} busy={busy} work={work} mode={mode} setSafety={setSafety}
      refresh={refresh} setNotice={setNotice}/>}
    {tab==="history"&&<section><h1>体验记录</h1><p>喜欢某种形式和它是否有帮助，会分别记录。单次体验前后的变化也会受当时状态自然起伏的影响，所以系统比较的是不同体验之间的差别，而不是把每次的变化都当作效果。</p>
      {history.length===0?<p>还没有体验记录。</p>:history.map(s=><article key={s.id}><strong>{s.artifact?.content.title??goals[s.request.goal]}</strong>
        <p>{new Date(s.createdAt).toLocaleString("zh-CN")} · {s.status}</p><p>{s.decision.reasons[0]}</p></article>)}</section>}
    {tab==="evidence"&&<EvidenceView work={work}/>}
    </div></div>
    <div className="world-footnote">{mode==="demo"?"课堂原型 · 示例内容":"Mood Capsule · 每次几分钟"}</div>
  </main>;
}

type Work=(action:()=>Promise<void>)=>Promise<void>;

function NowView({study,busy,work,screen,setScreen,setSafety,setSession}:{study:boolean;busy:boolean;work:Work;screen:ScreenInfo|null;
  setScreen:(s:ScreenInfo)=>void;setSafety:(s:SafetyInfo)=>void;setSession:(s:Session)=>void}){
  const [minutes,setMinutes]=useState(()=>Number(store.get("mc.minutes"))||3),[quiet,setQuiet]=useState(()=>store.get("mc.quiet")==="1");
  const [situation,setSituation]=useState(""),[situationInContent,setSituationInContent]=useState(false);
  const [picked,setPicked]=useState<typeof MOODS[number]|null>(null),[state,setState]=useState<State>(neutralState);
  const [skipScreen,setSkipScreen]=useState(true),[step,setStep]=useState(0),[answers,setAnswers]=useState<number[]>([]);
  useEffect(()=>store.set("mc.minutes",String(minutes)),[minutes]);
  useEffect(()=>store.set("mc.quiet",quiet?"1":"0"),[quiet]);
  async function start(goal:Goal,initial:State){await work(async()=>{
    const s=await api("sessions","POST",{goal,seconds:minutes*60,state:initial,situation,allowSituationInContent:situationInContent,
      context:{soundAllowed:!quiet,cognitiveLoad:1-initial.energy/10,reducedMotion:window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        speechAvailable:"speechSynthesis"in window&&!quiet}},crypto.randomUUID());
    if(s.safety){setSafety(s.safety);return;}
    // Keep the planned session available if generation fails, so the existing retry action can recover it.
    setSession(s);
    const result=await api(`sessions/${s.id}/generate`,"POST");setSession(result);
  });}
  function tap(m:typeof MOODS[number]){const initial={...neutralState,...m.state};
    // Research mode needs a real baseline rating; everyday use starts on one tap.
    if(study){setPicked(m);setState(initial);}else start(m.goal,initial);}
  function accompany(){
    // A lightweight starting estimate; the full sentence still reaches server-side safety and generation.
    const m=/累|困|疲|歇/.test(situation)?MOODS[1]:/紧张|焦虑|压力|慌/.test(situation)?MOODS[0]:/低落|难过|伤心|失落/.test(situation)?MOODS[2]:/憋屈|生气|烦/.test(situation)?MOODS[3]:/无聊|没劲/.test(situation)?MOODS[4]:MOODS[5];
    tap(m);
  }
  function answer(v:number){const next=[...answers,v];setAnswers(next);
    if(next.length<4){setStep(step+1);return;}
    work(async()=>{const r=await api("screening","POST",{answers:next});if(r.safety)setSafety(r.safety);setScreen(await api("safety"));});}
  const showScreen=screen?.due&&!skipScreen;
  return <>
    {showScreen&&<section className="screening card-lite">
      <p className="eyebrow">开始之前 · {step+1}/4 · 可以跳过</p>
      <h2>过去两周，你有多常{screen.items[step]}？</h2>
      <div className="cards small">{screen.options.map((o,v)=><button key={o} className="card" disabled={busy} onClick={()=>answer(v)}>{o}</button>)}</div>
      <button className="quiet" onClick={()=>setSkipScreen(true)}>这次先跳过</button>
      <p className="hint">答案只用来调整安排，和在需要时告诉你可以找谁聊聊，不是诊断。</p>
    </section>}
    {!showScreen&&<section className="welcome-panel">
      <p className="eyebrow">今晚</p><h1>现在感觉怎么样？</h1>
      <p className="welcome-copy">一句话就够，也可以不写。系统会据此挑一段 1–10 分钟的内容。</p>
      <form className="counter-note" onSubmit={e=>{e.preventDefault();if(!busy)accompany();}}>
        <label htmlFor="tonight-note">此刻的状态 <span>可选</span></label>
        <textarea id="tonight-note" value={situation} maxLength={1000} rows={2} placeholder="比如：刚下班，脑子还停不下来" disabled={busy} onChange={e=>setSituation(e.target.value)}/>
        {situation&&<label className="check situation-consent"><input type="checkbox" checked={situationInContent} onChange={e=>setSituationInContent(e.target.checked)}/>可以把这句话的主题放进内容里</label>}
        <button className="primary enter-shop" disabled={busy} type="submit"><span>{busy?"正在准备…":situation.trim()?"就这些，开始":"不写了，直接开始"}</span><span aria-hidden="true">↗</span></button>
      </form>
      <div className="chips" role="group" aria-label="时间与声音">
        {[1,3,5,10].map(n=><button key={n} className={`chip${minutes===n?" on":""}`} aria-pressed={minutes===n} onClick={()=>setMinutes(n)}>{n} 分钟</button>)}
        <button className={`chip sound-chip${quiet?" on":""}`} aria-pressed={quiet} onClick={()=>setQuiet(!quiet)}>{quiet?"静音":"可以有声音"}</button>
      </div>
      <p className="arrangement-note">内容形式（电视、收音机或柜台上的小练习）由系统决定。</p>
      <details className="mood-drawer"><summary>不想打字？选一个最接近的状态 <span>＋</span></summary>
        <div className="cards mood-cards">{MOODS.map((m,i)=><button key={m.id} className={`card${picked?.id===m.id?" on":""}`} disabled={busy} onClick={()=>tap(m)}><span className="mood-number">0{i+1}</span>{m.label}</button>)}</div>
      </details>
      {study&&picked&&<div className="study-baseline">
        <Range label="现在有多紧张" value={state.tension} onChange={v=>setState({...state,tension:v})}/>
        <Range label="现在还有多少精力" value={state.energy} onChange={v=>setState({...state,energy:v})}/>
        {picked.goal!=="calm-down"&&<Range label={`现在的${labels[picked.goal]}`} value={state[metric[picked.goal]]} onChange={v=>setState({...state,[metric[picked.goal]]:v})}/>}
        <button className="primary" disabled={busy} onClick={()=>start(picked.goal,state)}>{busy?"正在安排…":"开始"}</button>
      </div>}
      {busy&&!study&&<p className="hint">正在准备…</p>}
      {screen?.due&&<button className="screen-invite" disabled={busy} onClick={()=>setSkipScreen(false)}>也可以先做一个简短的近况确认 <span>↗</span></button>}
    </section>}
  </>;
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
  const device=shopObject(session.decision.selected);
  return <section className={`session-panel device-${device}`}>
    <p className="eyebrow">{device==="tv"?"电视":device==="radio"?"收音机":device==="task"?"柜台上的小练习":"今晚的内容"}</p><h1>{content?.title??"正在准备…"}</h1>
    <p>{session.decision.candidates.find(c=>c.id===session.decision.selected)?.label} · 最多约 {Math.ceil(session.decision.seconds/60)} 分钟</p>
    {session.artifact?.warnings.map(w=><p className="mode" key={w}>{w}</p>)}
    {session.decision.flags?.screening==="elevated"&&<p className="mode">如果想找人聊聊：{screen?.resources.map(r=>`${r.name} ${r.contact}`).join("；")}</p>}
    {session.status==="awaiting-media"&&<><p>音视频仍在制作，尚未完成。</p><button disabled={busy} onClick={()=>work(async()=>{const s=await api(`sessions/${session.id}/media`,"POST");setSession(s);setPlaying(s.status==="ready");})}>查看制作进度</button></>}
    {session.status==="ready"&&current&&!ended&&<>
      <div className={`experience ${animated?"animated":""}`}>
        {animated&&<div className="experience-window" aria-hidden="true"><div className="tiny-moon"/><div className="tiny-hill"/><div className="tiny-lake"/></div>}
        {session.artifact?.media?.url&&(session.decision.selected==="music"?<audio controls src={session.artifact.media.url}/>:<video controls src={session.artifact.media.url}/>)}
        {art&&<figure className="scene-art"><img src={art.url} alt="这段故事的插画"/></figure>}
        {!art&&pendingImages&&<p className="hint art-pending">插画生成中…</p>}
        <p className="story">{current.text}</p>
        {current.choices.map(c=><button key={c.id} disabled={busy||current.choices.some(x=>chosen.includes(x.id))} onClick={()=>work(async()=>{
          await api(`sessions/${session.id}/progress`,"POST",{scene,choiceId:c.id,elapsedSeconds:elapsed});setConsequence(c.consequence);setChosen(v=>[...v,c.id]);})}>{c.label}</button>)}
        {consequence&&<p className="consequence">{consequence}</p>}
      </div>
      <div className="toolbar"><button onClick={()=>{if(scene+1<content!.scenes.length){setScene(scene+1);setConsequence("");}else stop();}}>继续</button>
        <button onClick={()=>{setPlaying(!playing);if(playing){window.speechSynthesis?.pause();voice.current?.pause();}else{window.speechSynthesis?.resume();voice.current?.play().catch(()=>{});}}}>{playing?"暂停":"继续计时"}</button>
        {session.decision.selected==="spoken-story"&&<button onClick={speak}>{clips.length?"播放配音":"开始朗读"}</button>}<button onClick={stop}>提前结束</button><span>{elapsed} 秒</span></div>
    </>}
    {(session.status==="planned"||session.status==="failed")&&<button disabled={busy} onClick={()=>work(async()=>{const s=await api(`sessions/${session.id}/generate`,"POST");setSession(s);setPlaying(s.status==="ready");})}>重试准备</button>}
    {ended&&content&&<>
      <p className="story">{content.ending}</p><h2>结束了。</h2>
      <p>和进店时比，现在怎么样？</p>
      <p className="hint">没有变化，或者更难受了，也是正常而且有用的记录。</p>
      <div className="chips">
        <button className={`chip${preachy?" on":""}`} aria-pressed={preachy} onClick={()=>setPreachy(!preachy)}>有点像在被说教</button>
        <button className={`chip${discomfort?" on":""}`} aria-pressed={discomfort} onClick={()=>setDiscomfort(!discomfort)}>有让我不舒服的内容</button>
        <button className={`chip${disliked?" on":""}`} aria-pressed={disliked} onClick={()=>setDisliked(!disliked)}>不太喜欢这种形式</button>
      </div>
      {study?<>
        <Range label={`现在的${labels[session.request.goal]}`} value={after} onChange={setAfter}/>
        <Range label="这段体验满足了多少本次需要" value={attainment} onChange={setAttainment}/>
        <button className="primary" disabled={busy} onClick={()=>submit(after,attainment)}>记录这次体验</button>
      </>:<div className="cards small feedback-cups">{([["better","好一些"],["same","差不多"],["worse","更糟了"]] as [Outcome,string][]).map(([o,l])=>
        <button key={o} className={`card cup-${o}`} disabled={busy} onClick={()=>quick(o)}><span className="feedback-cup" aria-hidden="true"><i/></span>{l}</button>)}</div>}
    </>}
    <details><summary>为什么这样安排</summary>{session.decision.reasons.map(r=><p key={r}>{r}</p>)}</details>
    <button className="quiet" disabled={busy} onClick={()=>work(async()=>{await api(`sessions/${session.id}/cancel`,"POST");silence();setSession(null);})}>退出这次体验</button>
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
  return <>
    <section>
      <h1>说说你自己</h1>
      <p>想到什么写什么，不用按格式。我们会帮你整理成几条，你看一眼，删掉不对的就好。原话不会被保存。</p>
      <div className="chips">{STARTERS.map(s=><button key={s} className="chip" onClick={()=>setText(t=>(t?t+"\n":"")+s)}>{s.replace("……","")}</button>)}</div>
      <label className="sr-only" htmlFor="intake">关于自己的描述</label>
      <textarea id="intake" value={text} maxLength={2000} rows={6} onChange={e=>setText(e.target.value)}
        placeholder="比如：我在读研，最近论文压力有点大。平时不太爱看长文章，喜欢猫和下雨天。不想看到考试相关的内容。"/>
      <button className="primary" disabled={busy||!text.trim()} onClick={organize}>{busy?"正在整理…":"帮我整理"}</button>
      {mode==="demo"&&<p className="hint">示例模式：目前用简单规则整理，只能理解比较直接的说法。接入文本模型后会更准确。</p>}
    </section>
    {draft&&dp&&<section>
      <h2>我理解到的</h2><p className="hint">点 ✕ 去掉不对的。经历默认只用来安排形式，不会写进故事，除非你打开开关。</p>
      <div className="chips">
        {dp.lifeStage&&dp.lifeStage!=="unknown"&&<Tag text={stages[dp.lifeStage]} onRemove={()=>setDraft({...draft,profile:{...dp,lifeStage:undefined}})}/>}
        {Object.entries(dp.habits??{}).map(([k,v])=>v===undefined?null:<Tag key={k} text={habitText(k,v)} onRemove={()=>dropHabit(k)}/>)}
        {dp.themes.map(t=><Tag key={`t${t}`} text={`喜欢：${t}`} onRemove={()=>setDraft({...draft,profile:{...dp,themes:dp.themes.filter(x=>x!==t)}})}/>)}
        {dp.avoidTopics.map(t=><Tag key={`a${t}`} text={`不想看到：${t}`} onRemove={()=>setDraft({...draft,profile:{...dp,avoidTopics:dp.avoidTopics.filter(x=>x!==t)}})}/>)}
      </div>
      {draft.events.map((e,i)=><article key={i} className="event-card">
        <strong>{e.title}</strong>
        <p>{categories[e.category]} · {e.approximateDate?"大约 ":""}{e.occurredOn.slice(0,7)}{e.ongoing?" · 还在影响":""}{e.centrality?" · 已经是自己的一部分":""}</p>
        <label className="check"><input type="checkbox" checked={e.useInContent} onChange={ev=>setDraft({...draft,events:draft.events.map((x,j)=>j===i?{...x,useInContent:ev.target.checked}:x)})}/>可以借用这件事的主题写故事</label>
        <button className="quiet" onClick={()=>setDraft({...draft,events:draft.events.filter((_,j)=>j!==i)})}>✕ 不对，去掉</button>
      </article>)}
      {draft.notes.length>0&&<p className="hint">还提到了：{draft.notes.join("；")}</p>}
      <div className="row"><button className="primary" disabled={busy} onClick={saveDraft}>保存这些</button><button className="quiet" onClick={()=>setDraft(null)}>算了</button></div>
    </section>}
    <section>
      <h2>目前了解的你</h2>
      {!profile.themes.length&&!profile.avoidTopics.length&&!events.length&&profile.lifeStage==="unknown"&&<p className="hint">还没有内容。不填也完全可以开始。</p>}
      <div className="chips">
        {profile.lifeStage!=="unknown"&&<Tag text={stages[profile.lifeStage]} onRemove={()=>savePatch({lifeStage:"unknown"})}/>}
        {Object.entries(profile.habits).map(([k,v])=>v===null?null:<Tag key={k} text={habitText(k,v)} onRemove={()=>savePatch({habits:{...profile.habits,[k]:null}})}/>)}
        {profile.themes.map(t=><Tag key={`t${t}`} text={`喜欢：${t}`} onRemove={()=>savePatch({themes:profile.themes.filter(x=>x!==t)})}/>)}
        {profile.avoidTopics.map(t=><Tag key={`a${t}`} text={`不想看到：${t}`} onRemove={()=>savePatch({avoidTopics:profile.avoidTopics.filter(x=>x!==t)})}/>)}
      </div>
      {events.map(e=><article key={e.id} className="event-card"><strong>{e.title}</strong>
        <p>{categories[(e.category??"other") as keyof typeof categories]} · {e.occurredOn.slice(0,7)} · {e.useInContent?"可以写进故事":"只用来安排形式"}</p>
        <button disabled={busy} onClick={()=>work(async()=>{const {id,confirmedAt:_,...data}=e;await api(`events/${id}`,"PUT",data);await refresh();setNotice("好的，会继续把这件事考虑进去。");})}>这件事还在影响我</button>
        <button disabled={busy} onClick={()=>work(async()=>{await api(`events/${e.id}`,"DELETE");await refresh();})}>删除</button></article>)}
      <details><summary>想自己手动调整</summary>
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
      <hr/>
      <button onClick={()=>work(async()=>{const data=await api("export"),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="mood-capsule-data.json";a.click();URL.revokeObjectURL(url);})}>导出我的记录</button>
      <button onClick={()=>{if(window.confirm("删除当前浏览器档案、经历和体验记录？"))work(async()=>{await api("workspace","DELETE");window.location.reload();});}}>删除我的全部记录</button>
    </section>
  </>;
}

function EvidenceView({work}:{work:Work}){
  const [knowledge,setKnowledge]=useState<Record<string,{name:{zh:string};summary:string}>>({});
  useEffect(()=>{work(async()=>setKnowledge((await api("knowledge")).nodes));},[]);
  return <section><h1>这些安排参考了什么</h1><p>研究帮助我们提出和修正设计；具体体验是否有帮助，还需要实际反馈与研究检验。</p>
    {Object.entries(knowledge).filter(([id])=>id.startsWith("mechanic.")||id.startsWith("risk.")).map(([id,node])=><article key={id}>
      <h2>{id.startsWith("risk.")?"⚠ ":""}{node.name.zh}</h2><p>{node.summary}</p><a href={`/api/knowledge/${id}`} target="_blank" rel="noreferrer">查看出处与适用范围</a></article>)}</section>;
}
function Tag({text,onRemove}:{text:string;onRemove:()=>void}){return <span className="chip tag">{text}<button aria-label={`去掉 ${text}`} onClick={onRemove}>✕</button></span>;}
function SafetyPanel({info,onClose}:{info:SafetyInfo;onClose:()=>void}){return <div className="safety" role="alert">
  <h2>{info.stop?"先停一下":"想让你知道"}</h2><p>{info.message}</p>
  <ul>{info.resources.map(r=><li key={r.contact}><strong>{r.name}：{r.contact}</strong> · {r.note}</li>)}</ul>
  <button onClick={onClose}>{info.stop?"我知道了":"好的"}</button></div>;}
function Range({label,value,onChange}:{label:string;value:number;onChange:(value:number)=>void}){return <label>{label}<span className="range"><input type="range" min="0" max="10" step="1" value={value} onChange={e=>onChange(Number(e.target.value))}/><output>{value}/10</output></span></label>;}

function NoteView({note,onSave}:{note:string;onSave:(v:string)=>void}){
  const [text,setText]=useState(note);
  return <section className="note-view"><p className="eyebrow">便签</p><h1>给下次来的自己留一句</h1>
    <p className="welcome-copy">只保存在这个浏览器里，下次进店时会出现在柜台的便签上。</p>
    <label className="sr-only" htmlFor="note-text">便签内容</label>
    <textarea id="note-text" value={text} maxLength={45} rows={2} placeholder="比如：那天其实也撑过来了" onChange={e=>setText(e.target.value)}/>
    <div className="row"><button className="primary" onClick={()=>onSave(text.trim())}>放在柜台上</button>{note&&<button className="quiet" onClick={()=>onSave("")}>清空</button>}</div>
  </section>;
}
