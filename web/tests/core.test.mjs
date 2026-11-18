import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {profileSchema,eventSchema,requestSchema} from '../core/contracts.ts';
import {decide,eventWeights,outcome,generationContext} from '../core/engine.ts';
import {generate,validateContent} from '../core/generation.ts';
import {Store} from '../db/store.ts';
import {Service} from '../core/service.ts';
import {agentMock,LIVE} from './helpers.mjs';
const now=new Date('2026-11-17T12:00:00Z');
const profile=profileSchema.parse({birthYear:2000});
const request=requestSchema.parse({goal:'calm-down',seconds:180});
const caps=['text','animation','game','speech'];
const event={...eventSchema.parse({title:'最近换工作',occurredOn:'2026-11-16',useForSelection:true,currentImpact:1,cognitiveLoad:1,ongoing:true}),id:'event1',confirmedAt:now.toISOString()};
const kb=JSON.parse(readFileSync(new URL('../generated/kb.json',import.meta.url),'utf8'));
test('request never asks user to select a format',()=>assert.throws(()=>requestSchema.parse({...request,format:'video'})));
test('selection works without a profile history',()=>assert.ok(decide(profile,[],request,[],caps,now).selected));
test('unavailable video is excluded rather than pretending a storyboard is a video',()=>assert.ok(decide(profile,[],request,[],caps,now).ranked.find(c=>c.id==='short-video').excluded.length));
test('sound and screen constraints can produce an explicit no-option result',()=>assert.equal(decide(profile,[],requestSchema.parse({...request,context:{soundAllowed:false,screenAvailable:false}}),[],caps,now).selected,null));
test('future events rejected',()=>assert.throws(()=>eventWeights(profile,[{...event,occurredOn:'2027-01-01'}],now)));
test('unauthorized events never influence ranking',()=>assert.deepEqual(eventWeights(profile,[{...event,useForSelection:false}],now),[]));
test('unconfirmed old event influence decays',()=>assert.ok(eventWeights(profile,[event],new Date('2027-11-17'))[0].weight<eventWeights(profile,[event],now)[0].weight));
test('reconfirming an ongoing event restores current relevance',()=>{const later=new Date('2027-11-17');assert.ok(eventWeights(profile,[{...event,confirmedAt:later.toISOString()}],later)[0].weight>eventWeights(profile,[event],later)[0].weight);});
test('life-stage changes change retrieval weights',()=>assert.ok(eventWeights({...profile,lifeStage:'working'},[{...event,lifeStage:'working'}],now)[0].weight>eventWeights({...profile,lifeStage:'student'},[{...event,lifeStage:'working'}],now)[0].weight));
test('age alone does not choose a different medium',()=>assert.equal(decide({...profile,birthYear:1950},[],request,[],caps,now).selected,decide(profile,[],request,[],caps,now).selected));
test('different habits and current load actually change the selected medium',()=>{
  const r=requestSchema.parse({goal:'encouragement',seconds:300,state:{energy:10},context:{cognitiveLoad:0}});
  const reader=profileSchema.parse({habits:{reading:1,video:0,humor:0}});
  const viewer=profileSchema.parse({habits:{reading:0,video:1,humor:1}});
  assert.notEqual(decide(reader,[],r,[],caps,now).selected,decide(viewer,[],{...r,context:{...r.context,cognitiveLoad:.9}},[],caps,now).selected);
});
test('live adapter validates real JSON and does not attach unauthorized event text',async()=>{
  const decision=decide(profile,[event],request,[],caps,now);
  const demo=await generate(profile,[],request,decision,{mode:'demo'},[],'one');
  const {fetcher,calls}=agentMock({writer:[demo.content]});
  const result=await generate(profile,[event],request,decision,LIVE,[],'one',fetcher);
  assert.equal(result.mode,'live');assert.deepEqual(calls.map(c=>c.role),['planner','writer','reviewer']);
  for(const c of calls)assert.equal(JSON.parse(c.user).context.events.length,0);
});
test('recent events change effective load',()=>assert.ok(decide(profile,[event],request,[],caps,now).context.load>decide(profile,[],request,[],caps,now).context.load));
test('ranking permission does not permit disclosure to model',()=>{const d=decide(profile,[event],request,[],caps,now);assert.equal(generationContext(profile,[event],request,d).events.length,0);});
test('watching and liking without state feedback never count as improvement',()=>assert.equal(outcome(request,{liked:true,completion:1,elapsedSeconds:180,discomfort:false}),null));
test('calm-down measures tension, not energy',()=>{const feedback={after:{...request.state,tension:2,energy:9},goalAttainment:8,liked:true,completion:1,elapsedSeconds:180,discomfort:false};assert.ok(outcome(request,feedback)>.5);});
test('discomfort lowers learned outcome even if liked',()=>assert.equal(outcome(request,{liked:true,completion:1,elapsedSeconds:180,discomfort:true}),0));
test('personal negative outcomes reduce candidate score',()=>{const before=decide(profile,[],request,[],caps,now);const history=Array.from({length:10},(_,i)=>({id:String(i),createdAt:now.toISOString(),modality:before.selected,request,feedback:{liked:true,completion:1,elapsedSeconds:180,discomfort:true}}));assert.ok(decide(profile,[],request,history,caps,now).ranked.find(c=>c.id===before.selected).factors.outcome<.5);});
test('every catalog evidence ID exists in the pinned knowledge graph',()=>{const d=decide(profile,[],request,[],caps,now);for(const c of d.candidates)for(const id of [...c.evidence,c.mechanism])assert.ok(kb.nodes[id],id);});
test('demo content is marked demo and respects duration and exclusions',async()=>{const d=decide(profile,[],request,[],caps,now),a=await generate(profile,[],request,d,{mode:'demo'},[], 'job');assert.equal(a.mode,'demo');assert.ok(a.content.scenes.reduce((n,s)=>n+s.durationSeconds,0)<=180);assert.throws(()=>validateContent(a.content,d,['湖边']));});
// Execute the real repository SQL against SQLite; D1 implements this SQL surface.
class LocalD1{
  db=new DatabaseSync(':memory:');
  prepare(sql){const db=this.db;let params=[];const stmt={bind(...args){params=args;return stmt;},async first(){return db.prepare(sql).get(...params)??null;},async all(){return {results:db.prepare(sql).all(...params)};},async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};}};return stmt;}
  async batch(statements){this.db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
async function fixture(config={mode:'demo'},fetcher=fetch){const db=new LocalD1(),store=new Store(db);await store.init();const service=new Service(store,kb,config,fetcher,()=>now);let cookie='';async function call(path,method='GET',data,key,otherCookie){const response=await service.handle(new Request('http://localhost/api/'+path,{method,headers:{'Content-Type':'application/json',cookie:otherCookie??cookie,...(key?{'idempotency-key':key}:{})},body:data===undefined?undefined:JSON.stringify(data)}));if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,data:await response.json()};}await call('workspace','POST');return {call,service,store,db};}
test('API complete flow, duplicate requests, feedback exactly once, export and deletion',async()=>{const f=await fixture();try{const a=await f.call('sessions','POST',request,'same');assert.equal(a.status,201);const duplicate=await f.call('sessions','POST',request,'same');assert.equal(a.data.id,duplicate.data.id);assert.equal((await f.call('sessions','POST',{...request,seconds:300},'same')).status,409);const id=a.data.id;assert.equal((await f.call(`sessions/${id}/generate`,'POST')).data.status,'ready');const feedback={after:{...request.state,tension:2},goalAttainment:8,liked:true,completion:1,elapsedSeconds:180};assert.equal((await f.call(`sessions/${id}/feedback`,'POST',feedback)).status,201);assert.equal((await f.call(`sessions/${id}/feedback`,'POST',feedback)).status,200);assert.equal((await f.call(`sessions/${id}/feedback`,'POST',{...feedback,liked:false})).status,409);assert.equal((await f.call('export')).data.feedback.length,1);await f.call('workspace','DELETE');assert.equal((await f.call('export')).status,401);}finally{f.db.db.close();}});
test('cross-owner access and cross-origin writes are denied',async()=>{const f=await fixture();try{const a=await f.call('sessions','POST',request,'one');await f.call('workspace','POST',undefined,undefined,'');assert.equal((await f.call(`sessions/${a.data.id}`)).status,404);const r=await f.service.handle(new Request('http://localhost/api/workspace',{method:'POST',headers:{Origin:'https://evil.invalid'}}));assert.equal(r.status,403);}finally{f.db.db.close();}});
test('changed profile invalidates a pending generation',async()=>{const f=await fixture();try{const a=await f.call('sessions','POST',request,'one');await f.call('profile','PUT',{birthYear:2000});assert.equal((await f.call(`sessions/${a.data.id}/generate`,'POST')).status,409);}finally{f.db.db.close();}});
test('failed live provider does not silently become demo content; retry limit works',async()=>{const f=await fixture({mode:'live'});try{const a=await f.call('sessions','POST',request,'one'),url=`sessions/${a.data.id}/generate`;for(let i=0;i<3;i++)assert.equal((await f.call(url,'POST')).status,502);assert.equal((await f.call(url,'POST')).status,409);}finally{f.db.db.close();}});
test('cancelled sessions cannot regenerate or accept imaginary feedback',async()=>{const f=await fixture();try{const a=await f.call('sessions','POST',request,'one');await f.call(`sessions/${a.data.id}/cancel`,'POST');assert.equal((await f.call(`sessions/${a.data.id}/generate`,'POST')).status,409);assert.equal((await f.call(`sessions/${a.data.id}/feedback`,'POST',{liked:true,completion:1,elapsedSeconds:180})).status,409);}finally{f.db.db.close();}});
