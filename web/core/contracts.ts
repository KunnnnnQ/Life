import { z } from "zod";

export const goalSchema = z.enum(["calm-down", "encouragement", "mastery", "mood-shift", "connection"]);
export const stageSchema = z.enum(["unknown", "student", "working", "transition", "retired", "other"]);
const unit = z.number().min(0).max(1);
const rating = z.number().min(0).max(10);
export const profileSchema = z.object({
  birthYear: z.number().int().min(1900).max(2100).nullable().default(null),
  lifeStage: stageSchema.default("unknown"),
  habits: z.object({
    reading: unit.nullable().default(null), video: unit.nullable().default(null),
    audio: unit.nullable().default(null), interaction: unit.nullable().default(null),
    humor: unit.nullable().default(null),
  }).strict().default({}),
  themes: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  avoidTopics: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
}).strict();
// Adaptation speed differs by event type (risk.uniform-event-decay); see POLICY.eventHalfLifeDays.
export const eventCategorySchema = z.enum(["daily-stress", "achievement", "role-change", "relationship", "loss", "health", "other"]);
export const eventSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1500).default(""),
  occurredOn: z.string().date(),
  lifeStage: stageSchema.default("unknown"),
  category: eventCategorySchema.default("other"),
  importance: unit.default(0.5), currentImpact: unit.default(0.5),
  // Event-centrality style: how far this has become part of how the user sees themselves.
  centrality: unit.nullable().default(null),
  cognitiveLoad: unit.default(0), ongoing: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  useForSelection: z.boolean().default(false),
  useInContent: z.boolean().default(false),
}).strict();
export const stateSchema = z.object({
  valence: rating.default(5), tension: rating.default(5), energy: rating.default(5),
  hope: rating.default(5), agency: rating.default(5), connection: rating.default(5),
}).strict();
export const requestSchema = z.object({
  goal: goalSchema,
  seconds: z.number().int().min(30).max(1200),
  state: stateSchema.default({}),
  context: z.object({
    cognitiveLoad: unit.default(0.5), soundAllowed: z.boolean().default(true),
    screenAvailable: z.boolean().default(true), reducedMotion: z.boolean().default(false),
    speechAvailable: z.boolean().default(false),
    allowHumor: z.boolean().default(true),
  }).strict().default({}),
  situation: z.string().trim().max(1000).default(""),
  allowSituationInContent: z.boolean().default(false),
}).strict();
export const feedbackSchema = z.object({
  after: stateSchema.optional(), goalAttainment: rating.optional(),
  liked: z.boolean(), discomfort: z.boolean().default(false),
  // "Felt lectured" (risk.positive-statement-backfire): a softer negative signal than discomfort.
  preachy: z.boolean().default(false),
  completion: unit, elapsedSeconds: z.number().int().min(0).max(7200),
}).strict().refine(f => !f.after || f.goalAttainment !== undefined,
  "提供体验后状态时，也请提供目标达成感");
export const choiceSchema = z.object({ id: z.string().max(40), label: z.string().min(1).max(100),
  consequence: z.string().min(1).max(800) }).strict();
export const contentSchema = z.object({
  title: z.string().min(1).max(100),
  scenes: z.array(z.object({
    text: z.string().min(1).max(1500),
    durationSeconds: z.number().int().min(1).max(1200),
    visual: z.string().max(500).default(""),
    choices: z.array(choiceSchema).max(3).default([]),
  }).strict()).min(1).max(12),
  ending: z.string().min(1).max(1000),
}).strict();
// Intake agent: free text in, a reviewable draft out. Nothing is saved until the user confirms.
export const intakeInputSchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict();
export const intakeEventSchema = eventSchema.extend({ approximateDate: z.boolean().default(false) });
export const intakeDraftSchema = z.object({
  profile: z.object({
    lifeStage: stageSchema.optional(),
    habits: z.object({reading:unit.optional(),video:unit.optional(),audio:unit.optional(),
      interaction:unit.optional(),humor:unit.optional()}).strict().optional(),
    themes: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
    avoidTopics: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  }).strict().default({}),
  events: z.array(intakeEventSchema).max(8).default([]),
  // What the agent noticed but could not turn into a field; shown to the user, never stored.
  notes: z.array(z.string().max(200)).max(5).default([]),
}).strict();
export type IntakeDraft = z.infer<typeof intakeDraftSchema>;
const phqAnswer = z.number().int().min(0).max(3);
// PHQ-4 order: two anxiety items (GAD-2), then two depression items (PHQ-2).
export const screeningSchema = z.object({ answers: z.tuple([phqAnswer, phqAnswer, phqAnswer, phqAnswer]) }).strict();
export type ScreeningLevel = "unknown" | "none" | "elevated";
export type StrategyFamily = "distraction" | "reappraisal" | "response-modulation" | "situation-selection";
export type StudyArm = "adaptive" | "generic" | "neutral";
export type Profile = z.infer<typeof profileSchema>;
export type LifeEvent = z.infer<typeof eventSchema> & {id: string; confirmedAt: string};
export type ExperienceRequest = z.infer<typeof requestSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;
export type Content = z.infer<typeof contentSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type History = {id: string; createdAt: string; modality: string; request: ExperienceRequest; feedback?: Feedback;
  family?: StrategyFamily};
export type Modality = "micro-reading" | "interactive-story" | "humor-animation" | "calm-animation" | "spoken-story" | "music" | "short-video" | "micro-game" | "peer-chat";
export type Candidate = {
  id: Modality; label: string; medium: string; mechanism: string; family: StrategyFamily; evidence: string[];
  goals: Partial<Record<Goal, number>>; minSeconds: number; maxSeconds: number;
  readingLoad: number; interactionLoad: number; stimulation: number;
  humor?: boolean; needsSound?: boolean; needsScreen?: boolean; capability: string;
};
export type EventWeight = {id: string; weight: number; recency: number; persistence: number; halfLifeDays: number;
  freshness: number; ageContext: number; stageContext: number; load: number; explanation: string};
export type CandidateScore = {id: Modality; score: number; excluded: string[];
  factors: Record<string, number>; evidence: string[]; personalObservations: number};
export type Decision = {policyVersion: string; selected: Modality | null;
  seconds: number; stage: "cold-start" | "learning" | "no-compatible-option";
  reasons: string[]; ranked: CandidateScore[]; events: EventWeight[];
  context: {age: number | null; load: number; lifeStage: Profile["lifeStage"]};
  flags: {avoidancePattern: boolean; recentDistractionShare: number; screening: ScreeningLevel};
  candidates: Candidate[]};
