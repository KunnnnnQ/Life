import type { Candidate } from "./contracts.ts";

// Goal-fit numbers are explicit engineering priors, not effect sizes.
// `family` mirrors the mechanic's `implements` relation in the knowledge graph.
export const CATALOG: Candidate[] = [
  {id:"micro-reading",label:"短篇阅读",medium:"text",mechanism:"mechanic.reframe-arc",family:"reappraisal",
    evidence:["source.bhattacharjee-2025"],goals:{encouragement:.85,"mood-shift":.6},
    minSeconds:60,maxSeconds:600,readingLoad:.8,interactionLoad:0,stimulation:.25,needsScreen:true,capability:"text"},
  {id:"interactive-story",label:"互动故事",medium:"text",mechanism:"mechanic.reframe-arc",family:"reappraisal",
    evidence:["source.bhattacharjee-2025","source.ryan-2006"],goals:{encouragement:.9,mastery:.85,"mood-shift":.65},
    minSeconds:180,maxSeconds:1200,readingLoad:.8,interactionLoad:.65,stimulation:.45,needsScreen:true,capability:"text"},
  {id:"humor-animation",label:"短幽默动画",medium:"animation",mechanism:"mechanic.brief-humor-video",family:"distraction",
    evidence:["source.yamakoshi-2025","source.samson-gross-2012","source.tam-inzlicht-2024"],
    goals:{encouragement:.8,"mood-shift":.9},minSeconds:30,maxSeconds:180,
    readingLoad:.15,interactionLoad:0,stimulation:.6,humor:true,needsScreen:true,capability:"animation"},
  {id:"calm-animation",label:"安静探索动画",medium:"animation",mechanism:"mechanic.slow-exploration",family:"distraction",
    evidence:["source.rupp-2017","source.collins-2019"],goals:{"calm-down":.9,"mood-shift":.5},
    minSeconds:30,maxSeconds:600,readingLoad:.1,interactionLoad:.1,stimulation:.1,needsScreen:true,capability:"animation"},
  {id:"spoken-story",label:"音频故事",medium:"audio",mechanism:"mechanic.spoken-reframe",family:"reappraisal",
    evidence:["source.bhattacharjee-2025"],goals:{encouragement:.8,"calm-down":.6,connection:.7},
    minSeconds:60,maxSeconds:1200,readingLoad:0,interactionLoad:0,stimulation:.2,needsSound:true,capability:"speech"},
  {id:"music",label:"音乐片段",medium:"audio",mechanism:"mechanic.music-pause",family:"response-modulation",
    evidence:["source.de-witte-2020","source.saarikallio-2012"],goals:{"calm-down":.85,"mood-shift":.7},
    minSeconds:60,maxSeconds:1200,readingLoad:0,interactionLoad:0,stimulation:.3,needsSound:true,capability:"music"},
  {id:"short-video",label:"完整短视频",medium:"video",mechanism:"mechanic.brief-humor-video",family:"distraction",
    evidence:["source.yamakoshi-2025","source.tam-inzlicht-2024"],goals:{"mood-shift":.85,encouragement:.75},
    minSeconds:30,maxSeconds:300,readingLoad:.1,interactionLoad:0,stimulation:.55,humor:true,needsScreen:true,capability:"video"},
  {id:"micro-game",label:"小任务与逆转",medium:"game",mechanism:"mechanic.reversal-arc",family:"distraction",
    evidence:["source.ryan-2006","source.rupp-2017"],goals:{mastery:.95,"mood-shift":.65},
    minSeconds:60,maxSeconds:600,readingLoad:.25,interactionLoad:.75,stimulation:.6,needsScreen:true,capability:"game"},
  {id:"peer-chat",label:"真人短聊",medium:"social",mechanism:"mechanic.stranger-chat",family:"situation-selection",
    evidence:["source.epley-schroeder-2014","source.rose-2002"],goals:{connection:1},
    minSeconds:300,maxSeconds:1200,readingLoad:.3,interactionLoad:.7,stimulation:.4,needsScreen:true,capability:"peer-chat"},
];
export const POLICY = {
  version:"adaptive-media-0.2.0",
  // risk.uniform-event-decay: slower decay for events people often adapt to incompletely (Lucas 2007).
  eventHalfLifeDays:{"daily-stress":30,achievement:90,"role-change":180,relationship:365,loss:730,health:730,other:90},
  // Central events (Berntsen & Rubin 2006) keep at least this share of their relevance regardless of age.
  centralityFloor:.9,
  confirmationHalfLifeDays:180,
  outcomeHalfLifeDays:60, priorObservations:5,
  factors:{goal:.34,burden:.22,comfort:.12,outcome:.25,acceptance:.04,novelty:.03},
  // risk.avoidance-overuse: gentle rebalancing, never a block.
  avoidance:{windowDays:14,minSessions:5,share:.8,bonus:.08,skipAtTension:8},
  // risk.crisis-in-session: when the latest PHQ-4 (within window) is elevated.
  screening:{windowDays:14,maxStimulation:.5,stimulationPenalty:.1},
  note:"所有数值均为可审计的工程初值，未经过产品效果验证；年龄不是媒介偏好的直接变量。",
};
