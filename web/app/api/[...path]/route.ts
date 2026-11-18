import { env } from "cloudflare:workers";
import { Store } from "../../../db/store.ts";
import { Service } from "../../../core/service.ts";
import knowledge from "../../../generated/kb.json";
import { configFromEnv } from "../../../core/config.ts";
import type { AssetBucket } from "../../../core/service.ts";

export const dynamic="force-dynamic";
let initialized:Promise<void>|undefined;
async function handle(request:Request){
  if(!env.DB)return Response.json({error:"数据库尚未绑定"},{status:503});
  const store=new Store(env.DB);
  initialized??=store.init().catch(e=>{initialized=undefined;throw e;});
  await initialized;
  const bindings=env as unknown as Record<string,unknown>;
  const config=configFromEnv(env as unknown as Record<string,string|undefined>);
  // Optional R2 bucket: generated images and audio are copied here because provider URLs expire after 24 hours.
  const bucket=bindings.MEDIA as AssetBucket|undefined;
  return new Service(store,knowledge,config,fetch,()=>new Date(),bucket).handle(request);
}
export const GET=handle;
export const POST=handle;
export const PUT=handle;
export const DELETE=handle;
