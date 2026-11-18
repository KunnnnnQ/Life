// Safety layer for risk.crisis-in-session. Knowledge nodes: instrument.phq-4, construct.suicide-risk.
// This prototype never grades suicide risk itself; it pauses and points to people who can help.
import type { ScreeningLevel } from "./contracts.ts";

// Wording adapted for this classroom prototype from the PHQ-4 item content; not a validated Chinese version.
export const PHQ4_ITEMS = [
  "感到紧张、焦虑或心里不安",
  "无法停止或控制担忧",
  "做事提不起劲或没有兴趣",
  "感到心情低落、沮丧或绝望",
] as const;
export const PHQ4_OPTIONS = ["完全没有", "有几天", "一半以上的天数", "几乎每天"] as const;

export type ScreeningResult = {anxiety:number; depression:number; total:number; level:Exclude<ScreeningLevel,"unknown">};
export function scorePhq4(answers:readonly number[]):ScreeningResult {
  const [a1,a2,d1,d2]=answers;
  const anxiety=a1+a2, depression=d1+d2;
  // Kroenke et al. 2009: a subscale score of 3 or more is a positive screen.
  return {anxiety,depression,total:anxiety+depression,level:anxiety>=3||depression>=3?"elevated":"none"};
}

// Verified 2026-11-17 against official announcements (12356 national psychological assistance line).
export const SUPPORT_RESOURCES = [
  {name:"全国心理援助热线",contact:"12356",note:"国家卫生健康委设立的统一号码，提供心理疏导与危机干预"},
  {name:"紧急情况",contact:"110 / 120",note:"有立即的危险时，请直接拨打或前往最近的医院急诊"},
] as const;
export const SAFETY_MESSAGE="谢谢你愿意说出来。这种时候，比起一段故事，更值得有一个真人陪你聊聊。"+
  "这次体验先暂停。你可以现在拨打下面的电话，也可以联系一位信任的人陪在身边。";

// Keyword screen only: it misses indirect wording and can flag quotes or jokes. Documented in risk.crisis-in-session.
const CRISIS_PATTERNS:RegExp[] = [
  /自杀/, /自尽/, /轻生/, /寻死/, /想死/, /去死/, /不想活/, /活不下去/, /不如死/, /死了算了/,
  /结束(自己的)?生命/, /了结自己/, /结束这一切/, /割腕/, /跳楼/, /遗书/,
  /\bsuicid/i, /kill (my)?self/i, /end (my|it all)/i, /don'?t want to (live|be alive)/i,
];
export function detectCrisis(...texts:(string|undefined)[]):boolean {
  const text=texts.filter(Boolean).join("\n").replace(/\s+/g," ");
  return CRISIS_PATTERNS.some(p=>p.test(text));
}
// risk.positive-statement-backfire (Wood et al. 2009): direct positive verdicts about the user can
// make people with low self-regard feel worse. Characters may encourage each other; the narrator may not
// pronounce judgments on "you".
const AFFIRMATION_PATTERNS:RegExp[] = [
  /你(一定|肯定|绝对|必须)(能|可以|会|行)/, /你(真|很|超|特别|非常)?(棒|厉害|优秀|了不起)/, /你是最(好|棒)的/,
  /一切都会(好|过去)/, /相信你自己/, /你要相信自己/, /你值得(拥有)?(一切|所有)/,
];
export const findAffirmation=(text:string)=>AFFIRMATION_PATTERNS.find(p=>p.test(text))?.source??null;

// risk.happiness-pressure (Mauss et al. 2011): never promise an emotional outcome.
const PROMISE_PATTERNS:RegExp[] = [
  /让你(开心|快乐|高兴|好起来)/, /(保证|一定会)(让你)?(开心|快乐|好起来|变好)/, /(立刻|马上|瞬间)(好起来|开心|治愈)/,
  /心情(提升|改善|变好)了?\s*\d+\s*%/, /治愈你/, /药到病除/,
];
export const findPromise=(text:string)=>PROMISE_PATTERNS.find(p=>p.test(text))?.source??null;

// Removes contact details and identity numbers before any text leaves the server.
export function scrubPII(text:string):string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g,"［已隐去］")
    .replace(/https?:\/\/\S+/g,"［已隐去］")
    .replace(/\b\d{17}[\dXx]\b/g,"［已隐去］")
    .replace(/(?<!\d)(\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g,"［已隐去］")
    .replace(/(?<!\d)0\d{2,3}[-\s]?\d{7,8}(?!\d)/g,"［已隐去］");
}
export function safetyPayload(reason:"crisis-signal"|"screening") {
  return {stop:reason==="crisis-signal",reason,message:reason==="crisis-signal"?SAFETY_MESSAGE:
    "最近两周你的状态似乎比较辛苦。体验可以照常进行，同时也想让你知道，随时可以找人聊聊。",
    resources:SUPPORT_RESOURCES};
}
