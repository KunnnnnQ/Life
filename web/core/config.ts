// Builds the provider configuration from environment variables (wrangler vars and secrets).
import type { ProviderConfig } from "./generation.ts";

// Presets fill in the base URL and model so only the key has to be set.
const PRESETS:Record<string,{url:string;model:string}> = {
  // OpenAI-format endpoint; models listed at api-docs.deepseek.com/quick_start/pricing (checked 2026-11-17).
  deepseek:{url:"https://api.deepseek.com",model:"deepseek-flash"},
  // Model Studio's OpenAI-compatible endpoint (Beijing).
  qwen:{url:"https://dashscope.aliyuncs.com/compatible-mode/v1",model:"qwen-plus"},
};
export function configFromEnv(env:Record<string,string|undefined>):ProviderConfig {
  const preset=PRESETS[(env.LLM_PROVIDER??"").toLowerCase()];
  const num=(v:string|undefined,d:number)=>{const n=Number(v);return Number.isFinite(n)&&v!==undefined&&v!==""?n:d;};
  const pick=(...vs:(string|undefined)[])=>vs.find(v=>v!==undefined&&v!=="");
  return {
    mode:env.CONTENT_MODE==="live"?"live":"demo",
    llmUrl:pick(env.LLM_BASE_URL,preset?.url),llmKey:pick(env.LLM_API_KEY),model:pick(env.LLM_MODEL,preset?.model),
    models:{planner:pick(env.LLM_MODEL_PLANNER),writer:pick(env.LLM_MODEL_WRITER),
      reviewer:pick(env.LLM_MODEL_REVIEWER),intake:pick(env.LLM_MODEL_INTAKE)},
    mediaUrl:pick(env.MEDIA_BASE_URL),mediaKey:pick(env.MEDIA_API_KEY),
    studyMode:env.STUDY_MODE==="on",
    dashscopeKey:pick(env.DASHSCOPE_API_KEY),dashscopeUrl:pick(env.DASHSCOPE_BASE_URL),
    imageModel:pick(env.IMAGE_MODEL),ttsModel:pick(env.TTS_MODEL),ttsVoice:pick(env.TTS_VOICE),
    imagesPerSession:Math.max(0,Math.min(3,num(env.IMAGES_PER_SESSION,1))),
  };
}
