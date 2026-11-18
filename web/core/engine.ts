import { CATALOG, POLICY } from "./catalog.ts";
import type { Profile, LifeEvent, ExperienceRequest, History, Feedback, Candidate, Decision, EventWeight, ScreeningLevel } from "./contracts.ts";

const clamp = (v:number, min=0, max=1) => Math.min(max,Math.max(min,v));
const days = (a:Date,b:string) => Math.max(0,(a.getTime()-new Date(b).getTime())/86400000);
export function validateDates(profile:Profile, events:LifeEvent[], now:Date) {
  const year=now.getUTCFullYear();
  if(profile.birthYear!==null && (profile.birthYear>year-18 || profile.birthYear<year-120))
    throw new Error("课堂版面向成年人；出生年份应与当前日期一致。");
  for(const event of events) {
    if(!Number.isFinite(Date.parse(event.occurredOn)) || new Date(event.occurredOn)>now ||
      (profile.birthYear!==null && new Date(event.occurredOn).getUTCFullYear()<profile.birthYear))
      throw new Error("经历日期不能晚于今天或早于出生年份。");
    if(!Number.isFinite(Date.parse(event.confirmedAt)) || new Date(event.confirmedAt)>now)
      throw new Error("经历确认时间无效。");
  }
}
export function eventWeights(profile:Profile, events:LifeEvent[], now:Date):EventWeight[] {
  validateDates(profile,events,now);
  const age=profile.birthYear===null?null:now.getUTCFullYear()-profile.birthYear;
  return events.filter(e=>e.useForSelection).map(e=>{
    const anchor=e.ongoing?e.confirmedAt:e.occurredOn;
    // Records saved before categories existed fall back to "other" and no centrality.
    const halfLifeDays=POLICY.eventHalfLifeDays[e.category??"other"];
    const centrality=e.centrality??null;
    const recency=2**(-days(now,anchor)/halfLifeDays);
    // Events that have become part of how someone sees themselves do not fade just because time passed.
    const persistence=Math.max(recency,(centrality??0)*POLICY.centralityFloor);
    const significance=centrality===null?e.importance:Math.max(e.importance,centrality);
    const freshness=2**(-days(now,e.confirmedAt)/POLICY.confirmationHalfLifeDays);
    const elapsedYears=days(now,e.occurredOn)/365.25;
    // Age affects relative life-course distance only, never a preference stereotype.
    const ageContext=age===null?1:1-.25*clamp(elapsedYears/age);
    const stageContext=e.lifeStage==="unknown"||profile.lifeStage==="unknown"?1:
      e.lifeStage===profile.lifeStage?1:.8;
    const weight=clamp((.4*e.currentImpact+.3*significance+.3*persistence)*freshness*ageContext*stageContext);
    return {id:e.id,weight,recency,persistence,halfLifeDays,freshness,ageContext,stageContext,load:e.cognitiveLoad*weight,
      explanation:"用于本次内容相关性和负担估计；由当前影响、重要性或中心性、按事件类型衰减的近期性、确认新鲜度及人生阶段构成，非心理风险分。"};
  }).sort((a,b)=>b.weight-a.weight);
}
export function outcome(request:ExperienceRequest,feedback:Feedback):number|null {
  if(feedback.discomfort) return 0;
  const preachyCap=.25;
  if(!feedback.after || feedback.goalAttainment===undefined) return feedback.preachy?preachyCap:null;
  const metric={"calm-down":"tension",encouragement:"hope",mastery:"agency","mood-shift":"valence",connection:"connection"} as const;
  const key=metric[request.goal];
  const delta=(feedback.after[key]-request.state[key])*(key==="tension"?-1:1);
  const score=clamp(.7*(.5+delta/20)+.3*(feedback.goalAttainment/10));
  return feedback.preachy?Math.min(score,preachyCap):score;
}
const recencyWeight=(h:History,request:ExperienceRequest,now:Date)=>
  2**(-days(now,h.createdAt)/POLICY.outcomeHalfLifeDays)*
  (Math.abs(h.request.context.cognitiveLoad-request.context.cognitiveLoad)<.35?1:.5);
// risk.pre-post-bias: people often arrive at a low point and would improve anyway (regression to the mean)
// and may report what they think is expected. Comparing each experience type against this person's own
// average change for the same goal cancels the shared part of that bias.
export function goalBaseline(request:ExperienceRequest,history:History[],now:Date) {
  let n=0,total=0;
  for(const h of history) {
    if(h.request.goal!==request.goal||!h.feedback||h.feedback.discomfort) continue;
    const score=outcome(h.request,h.feedback);
    if(score===null) continue;
    const w=recencyWeight(h,request,now);n+=w;total+=w*score;
  }
  return n>0?total/n:null;
}
function memory(candidate:Candidate,request:ExperienceRequest,history:History[],now:Date,baseline:number|null) {
  let n=0,total=0,acceptN=0,acceptTotal=0;
  for(const h of history) {
    if(h.modality!==candidate.id||h.request.goal!==request.goal||!h.feedback) continue;
    const w=recencyWeight(h,request,now);
    const score=outcome(h.request,h.feedback);
    // Discomfort stays an absolute penalty; other outcomes are relative to the person's own baseline.
    const relative=score===null?null:h.feedback.discomfort||baseline===null?score:clamp(.5+score-baseline);
    if(relative!==null){n+=w;total+=w*relative;}
    // Watch time and completion do not count as emotional improvement.
    acceptN+=w;acceptTotal+=w*(h.feedback.liked?1:0);
  }
  return {outcome:(total+.5*POLICY.priorObservations)/(n+POLICY.priorObservations),
    acceptance:(acceptTotal+2.5)/(acceptN+5),observations:n};
}
function comfort(c:Candidate,p:Profile) {
  const h=p.habits;
  const primary=c.medium==="text"?h.reading:c.medium==="video"||c.medium==="animation"?h.video:
    c.medium==="audio"?h.audio:h.interaction;
  return c.humor?((primary??.5)+(h.humor??.5))/2:primary??.5;
}
const GOAL_LABELS={"calm-down":"平静下来",encouragement:"得到鼓励",mastery:"找回成就感","mood-shift":"换个心情",connection:"感到有人陪伴"} as const;
const familyOf=(h:History)=>h.family??CATALOG.find(c=>c.id===h.modality)?.family;
// risk.avoidance-overuse: is this person's recent use dominated by distraction-type experiences?
export function avoidancePattern(request:ExperienceRequest,history:History[],now:Date) {
  const p=POLICY.avoidance;
  const recent=history.filter(h=>days(now,h.createdAt)<=p.windowDays)
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,p.minSessions+1);
  const share=recent.length?recent.filter(h=>familyOf(h)==="distraction").length/recent.length:0;
  // Under very high tension distraction is the more fitting first step (Sheppes et al. 2011), so do not rebalance.
  const active=recent.length>=p.minSessions&&share>=p.share&&request.state.tension<p.skipAtTension;
  return {active,share};
}
export function decide(profile:Profile,events:LifeEvent[],request:ExperienceRequest,
  history:History[],capabilities:string[],now=new Date(),options:{screening?:ScreeningLevel}={}):Decision {
  const weights=eventWeights(profile,events,now);
  const eventLoad=weights.reduce((v,e)=>Math.max(v,e.load),0);
  const load=Math.max(request.context.cognitiveLoad,eventLoad,1-request.state.energy/10);
  const baseline=goalBaseline(request,history,now);
  const avoidance=avoidancePattern(request,history,now);
  const screening=options.screening??"unknown";
  const ranked=CATALOG.map(c=>{
    const excluded:string[]=[];
    if(!capabilities.includes(c.capability)) excluded.push("生成或播放能力尚未接通");
    if(request.seconds<c.minSeconds) excluded.push("可用时间太短");
    if(!c.goals[request.goal]) excluded.push("与本次目标不匹配");
    if(c.needsSound&&!request.context.soundAllowed) excluded.push("当前不方便播放声音");
    if(c.needsScreen&&!request.context.screenAvailable) excluded.push("当前不能看屏幕");
    // Server-side speech synthesis removes the dependency on the browser's own voice.
    if(c.capability==="speech"&&!request.context.speechAvailable&&!capabilities.includes("tts")) excluded.push("当前设备不能朗读");
    if(c.humor&&(!request.context.allowHumor||profile.habits.humor===0||request.state.tension>=9))
      excluded.push("当前不适合或不接受幽默");
    const learned=memory(c,request,history,now,baseline);
    const stimulationTarget=request.goal==="calm-down"?.1:request.goal==="mastery"?.6:.4;
    const burden=clamp(1-load*(.65*c.readingLoad+.35*c.interactionLoad)-.15*Math.abs(c.stimulation-stimulationTarget));
    const recent=history.filter(h=>h.modality===c.id&&days(now,h.createdAt)<1).length;
    const factors={goal:c.goals[request.goal]??0,burden,comfort:comfort(c,profile),
      outcome:learned.outcome,acceptance:learned.acceptance,novelty:1/(1+recent)};
    const base=Object.entries(POLICY.factors).reduce((s,[k,w])=>s+w*factors[k as keyof typeof factors],0);
    const balance=avoidance.active&&c.family!=="distraction"?POLICY.avoidance.bonus:0;
    const safety=screening==="elevated"&&c.stimulation>POLICY.screening.maxStimulation?-POLICY.screening.stimulationPenalty:0;
    return {id:c.id,score:base+balance+safety,excluded,factors:{...factors,balance,safety},
      evidence:c.evidence,personalObservations:learned.observations};
  }).sort((a,b)=>a.excluded.length-b.excluded.length||b.score-a.score||a.id.localeCompare(b.id));
  const selected=ranked.find(c=>!c.excluded.length);
  const candidate=CATALOG.find(c=>c.id===selected?.id);
  return {policyVersion:POLICY.version,selected:selected?.id??null,
    seconds:candidate?Math.min(request.seconds,candidate.maxSeconds):request.seconds,
    stage:!selected?"no-compatible-option":selected.personalObservations<1?"cold-start":"learning",
    reasons:selected?[`根据“${GOAL_LABELS[request.goal]}”、可用时间和当前负担自动安排${candidate!.label}。`,
      `匹配参考了 ${weights.length} 条获准用于选择的经历。`,
      selected.personalObservations<1?"个人效果数据不足，当前采用可调整的初始规则。":"已参考此人在相似目标下的体验后反馈。",
      "使用习惯只影响接受度；年龄不直接决定媒介，观看时长不等于效果。",
      ...(avoidance.active?["最近几次多是帮你暂时转移注意的体验。这次也会考虑换个角度看事情的内容；如果你现在只想先缓一缓，这也完全可以。"]:[]),
      ...(screening==="elevated"?["最近两周你似乎比较辛苦，这次会避开节奏强烈的内容。"]:[])]:
      ["当前没有符合时间和环境限制的可用体验，请调整环境或稍后再试。"],
    ranked,events:weights,context:{age:profile.birthYear===null?null:now.getUTCFullYear()-profile.birthYear,
      lifeStage:profile.lifeStage,load},
    flags:{avoidancePattern:avoidance.active,recentDistractionShare:avoidance.share,screening},candidates:CATALOG};
}
export function generationContext(profile:Profile,events:LifeEvent[],request:ExperienceRequest,decision:Decision) {
  const allowed=new Map(decision.events.filter(e=>e.weight>=.1).map(e=>[e.id,e.weight]));
  return {goal:request.goal,seconds:decision.seconds,modality:decision.selected,
    themes:profile.themes.filter(t=>!profile.avoidTopics.includes(t)),avoidTopics:profile.avoidTopics,
    situation:request.allowSituationInContent?request.situation:"",
    events:events.filter(e=>e.useInContent&&e.useForSelection&&allowed.has(e.id)&&
      !profile.avoidTopics.some(t=>[e.title,e.description,...e.tags].join(" ").includes(t)))
      .sort((a,b)=>allowed.get(b.id)!-allowed.get(a.id)!).slice(0,3)
      .map(e=>({title:e.title,description:e.description,tags:e.tags})),
    reducedMotion:request.context.reducedMotion};
}
