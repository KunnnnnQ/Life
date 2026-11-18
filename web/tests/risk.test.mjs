// Tests for the four knowledge-base risks implemented in code:
// risk.crisis-in-session, risk.uniform-event-decay, risk.avoidance-overuse, risk.pre-post-bias.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {profileSchema,eventSchema,requestSchema} from '../core/contracts.ts';
import {decide,eventWeights,avoidancePattern} from '../core/engine.ts';
import {generate} from '../core/generation.ts';
import {scorePhq4,detectCrisis} from '../core/safety.ts';
import {Store} from '../db/store.ts';
import {Service} from '../core/service.ts';
import {agentMock,LIVE} from './helpers.mjs';

const now=new Date('2026-11-17T12:00:00Z');
const caps=['text','animation','game','speech'];
const profile=profileSchema.parse({birthYear:1995});
const kb=JSON.parse(readFileSync(new URL('../generated/kb.json',import.meta.url),'utf8'));
const ev=({id='e',confirmedAt=now.toISOString(),...fields})=>({...eventSchema.parse({title:'经历',occurredOn:'2025-11-17',
  useForSelection:true,currentImpact:.5,...fields}),id,confirmedAt});
const daysAgo=d=>new Date(now.getTime()-d*86400000).toISOString();
const histItem=(modality,goal,d,feedback)=>({id:`${modality}-${d}-${Math.random()}`,createdAt:daysAgo(d),modality,
  request:requestSchema.parse({goal,seconds:300}),feedback});

// ---------- risk.crisis-in-session ----------
test('PHQ-4 subscale of 3 or more is elevated, otherwise none',()=>{
  assert.equal(scorePhq4([2,1,0,0]).level,'elevated');
  assert.equal(scorePhq4([0,0,1,2]).level,'elevated');
  assert.deepEqual(scorePhq4([1,1,1,1]),{anxiety:2,depression:2,total:4,level:'none'});
});
test('crisis wording is detected, ordinary exaggeration is not',()=>{
  for(const t of ['我真的不想活了','最近总想着自杀','I want to kill myself','想结束自己的生命'])assert.ok(detectCrisis(t),t);
  for(const t of ['这道题难死了','电脑又死机了','今天活动太多有点累','考试考砸了'])assert.ok(!detectCrisis(t),t);
});
test('elevated screening steers away from high-stimulation content and says so',()=>{
  const r=requestSchema.parse({goal:'mood-shift',seconds:300});
  const d=decide(profile,[],r,[],caps,now,{screening:'elevated'});
  assert.equal(d.flags.screening,'elevated');
  for(const c of d.ranked){const cand=d.candidates.find(x=>x.id===c.id);
    assert.equal(c.factors.safety,cand.stimulation>.5?-.1:0,c.id);}
  assert.ok(d.reasons.some(x=>x.includes('辛苦')));
});
test('generated content containing crisis wording is rejected',async()=>{
  const r=requestSchema.parse({goal:'encouragement',seconds:180});
  const d=decide(profile,[],r,[],caps,now);
  const bad={title:'t',scenes:[{text:'角色说他想自杀',durationSeconds:60,visual:'',choices:[]}],ending:'结束'};
  // Even if the reviewer agent wrongly passes it, the deterministic gate still rejects it.
  await assert.rejects(generate(profile,[],r,d,LIVE,[],'j',agentMock({writer:[bad]}).fetcher),/安全检查/);
});

// ---------- risk.uniform-event-decay ----------
test('loss events fade more slowly than daily stress of the same age',()=>{
  const old={occurredOn:'2025-11-17',confirmedAt:now.toISOString()};
  const [stress]=eventWeights(profile,[ev({...old,category:'daily-stress'})],now);
  const [loss]=eventWeights(profile,[ev({...old,category:'loss'})],now);
  assert.ok(loss.recency>stress.recency*10);assert.ok(loss.weight>stress.weight);
  assert.equal(loss.halfLifeDays,730);assert.equal(stress.halfLifeDays,30);
});
test('an event that became part of who I am keeps relevance years later',()=>{
  const old={occurredOn:'2018-06-01',confirmedAt:now.toISOString()};
  const [plain]=eventWeights(profile,[ev(old)],now);
  const [central]=eventWeights(profile,[ev({...old,centrality:1})],now);
  assert.ok(plain.recency<.01);assert.ok(central.persistence>=.9);assert.ok(central.weight>plain.weight+.3);
});
test('events saved before categories existed still work',()=>{
  const legacy=ev({});delete legacy.category;delete legacy.centrality;
  const [w]=eventWeights(profile,[legacy],now);assert.equal(w.halfLifeDays,90);assert.ok(w.weight>0);
});

// ---------- risk.avoidance-overuse ----------
test('mostly-distraction recent history rebalances toward other kinds of experience',()=>{
  const r=requestSchema.parse({goal:'mood-shift',seconds:300,state:{tension:5}});
  const history=[1,2,3,4,5].map(d=>histItem('humor-animation','mood-shift',d));
  const d=decide(profile,[],r,history,caps,now);
  assert.ok(d.flags.avoidancePattern);assert.equal(d.flags.recentDistractionShare,1);
  const fam=id=>d.candidates.find(c=>c.id===id).family;
  for(const c of d.ranked)assert.equal(c.factors.balance,fam(c.id)==='distraction'?0:.08,c.id);
  assert.ok(d.reasons.some(x=>x.includes('换个角度')));
});
test('no rebalancing under very high tension, with too few sessions, or with mixed history',()=>{
  const distraction=[1,2,3,4,5].map(d=>histItem('calm-animation','calm-down',d));
  assert.equal(avoidancePattern(requestSchema.parse({goal:'calm-down',seconds:300,state:{tension:9}}),distraction,now).active,false);
  const r=requestSchema.parse({goal:'calm-down',seconds:300});
  assert.equal(avoidancePattern(r,distraction.slice(0,4),now).active,false);
  const mixed=[...distraction.slice(0,3),histItem('spoken-story','calm-down',4),histItem('micro-reading','encouragement',5)];
  assert.equal(avoidancePattern(r,mixed,now).active,false);
  const old=[30,31,32,33,34].map(d=>histItem('calm-animation','calm-down',d));
  assert.equal(avoidancePattern(r,old,now).active,false);
});

// ---------- risk.pre-post-bias ----------
const improved=(goal,before,after)=>({after:{...requestSchema.parse({goal,seconds:300}).state,tension:after},goalAttainment:5,
  liked:true,completion:1,elapsedSeconds:300,discomfort:false});
test('equal improvement everywhere teaches no preference (shared regression to the mean cancels out)',()=>{
  const r=requestSchema.parse({goal:'calm-down',seconds:300});
  const history=[...[1,2,3].map(d=>histItem('calm-animation','calm-down',d,improved('calm-down',5,2))),
    ...[4,5,6].map(d=>histItem('spoken-story','calm-down',d,improved('calm-down',5,2)))];
  const d=decide(profile,[],r,history,caps,now);
  const o=id=>d.ranked.find(c=>c.id===id).factors.outcome;
  assert.ok(Math.abs(o('calm-animation')-o('spoken-story'))<.01);
  assert.ok(Math.abs(o('calm-animation')-.5)<.01);
});
test('relative differences between experience types are still learned',()=>{
  const r=requestSchema.parse({goal:'calm-down',seconds:300});
  const history=[...[1,2,3].map(d=>histItem('calm-animation','calm-down',d,improved('calm-down',5,1))),
    ...[4,5,6].map(d=>histItem('spoken-story','calm-down',d,improved('calm-down',5,5)))];
  const d=decide(profile,[],r,history,caps,now);
  const o=id=>d.ranked.find(c=>c.id===id).factors.outcome;
  // Five neutral prior observations keep three sessions from producing a large swing, by design.
  assert.ok(o('calm-animation')>o('spoken-story')+.03);
  assert.ok(o('calm-animation')>.5&&o('spoken-story')<.5);
});
test('neutral control content is informational, has no choices, and never calls a media provider',async()=>{
  const r=requestSchema.parse({goal:'mood-shift',seconds:120});
  const d=decide(profile,[],r,[],[...caps,'video','music'],now);
  let called=false;
  const a=await generate(profile,[],r,{...d,selected:'short-video'},{mode:'demo',mediaUrl:'https://media.invalid'},[],'j',
    async()=>{called=true;return Response.json({});},'neutral');
  assert.equal(called,false);assert.equal(a.renderer,'micro-reading');
  assert.ok(a.content.title.includes('铅笔'));assert.equal(a.content.scenes.flatMap(s=>s.choices).length,0);
  assert.ok(a.content.scenes.reduce((n,s)=>n+s.durationSeconds,0)<=d.seconds);
});
test('generic arm sends no personal material to the model',async()=>{
  const r=requestSchema.parse({goal:'encouragement',seconds:180,situation:'和室友吵架了',allowSituationInContent:true});
  const p=profileSchema.parse({themes:['猫']});
  const e=ev({title:'换工作',useInContent:true,currentImpact:1});
  const d=decide(p,[e],r,[],caps,now);
  const {fetcher,calls}=agentMock();
  await generate(p,[e],r,d,LIVE,[],'j',fetcher,'generic');
  assert.equal(calls.length,3);
  for(const c of calls){const ctx=JSON.parse(c.user).context;
    assert.equal(ctx.situation,'');assert.deepEqual(ctx.themes,[]);assert.deepEqual(ctx.events,[]);}
});

// ---------- API-level ----------
class LocalD1{
  db=new DatabaseSync(':memory:');
  prepare(sql){const db=this.db;let params=[];const stmt={bind(...args){params=args;return stmt;},async first(){return db.prepare(sql).get(...params)??null;},async all(){return {results:db.prepare(sql).all(...params)};},async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};}};return stmt;}
  async batch(statements){this.db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
async function fixture(config={mode:'demo'}){const db=new LocalD1(),store=new Store(db);await store.init();const service=new Service(store,kb,config,fetch,()=>now);let cookie='';
  async function call(path,method='GET',data,key){const response=await service.handle(new Request('http://localhost/api/'+path,{method,headers:{'Content-Type':'application/json',cookie,...(key?{'idempotency-key':key}:{})},body:data===undefined?undefined:JSON.stringify(data)}));if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,data:await response.json()};}
  await call('workspace','POST');return {call,db};}

test('API: crisis wording stops before any session is created and stores no text',async()=>{const f=await fixture();try{
  const r=await f.call('sessions','POST',{goal:'encouragement',seconds:180,situation:'我不想活了'},'k1');
  assert.equal(r.status,200);assert.equal(r.data.safety.stop,true);assert.ok(r.data.safety.resources.some(x=>x.contact==='12356'));
  const exp=(await f.call('export')).data;assert.equal(exp.sessions.length,0);assert.equal(exp.safetyStops.length,1);
  assert.ok(!JSON.stringify(exp.safetyStops).includes('不想活'));
  assert.equal((await f.call('recommend','POST',{goal:'encouragement',seconds:180,situation:'想自杀'})).data.safety.stop,true);
}finally{f.db.db.close();}});
test('API: an event with crisis wording is saved but never allowed into generated content',async()=>{const f=await fixture();try{
  const r=await f.call('events','POST',{title:'有过轻生的念头',occurredOn:'2026-11-01',useForSelection:true,useInContent:true});
  assert.equal(r.status,201);assert.equal(r.data.useInContent,false);assert.equal(r.data.safety.stop,true);
}finally{f.db.db.close();}});
test('API: elevated screening is used for the next fortnight, then asked again',async()=>{const f=await fixture();try{
  assert.equal((await f.call('safety')).data.due,true);
  const s=await f.call('screening','POST',{answers:[3,2,1,0]});assert.equal(s.status,201);assert.equal(s.data.level,'elevated');assert.ok(s.data.safety);
  const info=(await f.call('safety')).data;assert.equal(info.due,false);assert.equal(info.level,'elevated');
  const d=(await f.call('recommend','POST',{goal:'mood-shift',seconds:300})).data;assert.equal(d.flags.screening,'elevated');
  assert.equal((await f.call('screening','POST',{answers:[4,0,0,0]})).status,400);
}finally{f.db.db.close();}});
test('API: study mode assigns arms, neutral sessions run but never train the ranking',async()=>{const f=await fixture({mode:'demo',studyMode:true});try{
  const arms=new Set();let neutralId=null;
  for(let i=0;i<30;i++){const s=(await f.call('sessions','POST',{goal:'calm-down',seconds:180},`s${i}`)).data;arms.add(s.study.arm);if(s.study.arm==='neutral'&&!neutralId)neutralId=s.id;}
  assert.ok(arms.size>=2);assert.ok([...arms].every(a=>['adaptive','generic','neutral'].includes(a)));
  assert.ok(neutralId,'expected at least one neutral session in 30 draws');
  const g=await f.call(`sessions/${neutralId}/generate`,'POST');assert.equal(g.data.status,'ready');assert.ok(g.data.artifact.content.title.includes('铅笔'));
  await f.call(`sessions/${neutralId}/feedback`,'POST',{after:{valence:5,tension:0,energy:5,hope:5,agency:5,connection:5},goalAttainment:10,liked:true,completion:1,elapsedSeconds:180});
  const d=(await f.call('recommend','POST',{goal:'calm-down',seconds:180})).data;
  assert.ok(d.ranked.every(c=>c.personalObservations===0),'neutral feedback must not count as experience-type evidence');
  const off=await fixture();try{assert.equal((await off.call('sessions','POST',{goal:'calm-down',seconds:180},'x')).data.study,undefined);}finally{off.db.db.close();}
}finally{f.db.db.close();}});
