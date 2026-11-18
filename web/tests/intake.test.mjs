// Intake agent ("关于我") plus the two risks moved into code this round:
// risk.positive-statement-backfire and risk.happiness-pressure.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {profileSchema,requestSchema} from '../core/contracts.ts';
import {decide,outcome} from '../core/engine.ts';
import {generate} from '../core/generation.ts';
import {extractByRules,runIntake,mergeProfile} from '../core/intake.ts';
import {scrubPII,findAffirmation,findPromise} from '../core/safety.ts';
import {Store} from '../db/store.ts';
import {Service} from '../core/service.ts';
import {agentMock} from './helpers.mjs';

const now=new Date('2026-11-17T12:00:00Z');
const kb=JSON.parse(readFileSync(new URL('../generated/kb.json',import.meta.url),'utf8'));
const sample='我是研二学生，平时不爱看书，看字多了就累，喜欢刷短视频，也喜欢冷笑话。喜欢猫和下雨天。上个月和室友吵架了，到现在还是有点别扭。去年外婆去世了，这件事改变了我很多。不想看到考试相关的内容。手机13812345678，邮箱a.b@example.com。';

// ---------- intake: rule extractor ----------
test('rules turn free text into profile fields, events, and avoid topics',()=>{
  const d=extractByRules(sample,now);
  assert.equal(d.profile.lifeStage,'student');
  assert.deepEqual(d.profile.habits,{reading:0,video:1,humor:1});
  assert.deepEqual(d.profile.themes,['猫','下雨天']);
  assert.deepEqual(d.profile.avoidTopics,['考试相关的内容']);
  assert.equal(d.events.length,2);
  const [fight,loss]=d.events;
  assert.equal(fight.category,'relationship');assert.equal(fight.ongoing,true);assert.equal(fight.occurredOn,'2026-10-18');
  assert.equal(loss.category,'loss');assert.equal(loss.centrality,.8);assert.ok(loss.approximateDate);
});
test('contact details and ID numbers are scrubbed before anything leaves the server',()=>{
  const s=scrubPII('电话 13812345678，座机 010-12345678，邮箱 x@y.com，证件 11010519491231002X，网址 https://a.b/c');
  for(const leaked of ['13812345678','12345678','x@y.com','1231002X','https://'])assert.ok(!s.includes(leaked),leaked);
  assert.ok(!JSON.stringify(extractByRules(sample,now)).includes('138'));
});
test('looser phrasings found in browser testing are understood',()=>{
  const d=extractByRules('我在读研，平时不爱看书，喜欢刷短视频和冷笑话。',now);
  assert.equal(d.profile.lifeStage,'student');assert.deepEqual(d.profile.habits,{reading:0,video:1,humor:1});
  assert.deepEqual(d.profile.themes,[]);
  assert.equal(extractByRules('我不喜欢别人开玩笑，但喜欢看搞笑的猫',now).profile.habits.humor,0);
});
test('preferences are not mistaken for life events',()=>{
  const d=extractByRules('我不想看到考试。我喜欢看侦探故事。',now);
  assert.equal(d.events.length,0);assert.deepEqual(d.profile.themes,['侦探故事']);
});

// ---------- intake: model path ----------
const live={mode:'live',llmUrl:'https://provider.invalid/v1',llmKey:'k',model:'m'};
const reply=obj=>async(_u,init)=>{reply.sent=JSON.parse(init.body);return Response.json({choices:[{message:{content:JSON.stringify(obj)}}]});};
test('model draft is validated, cleaned, and never pre-authorised for story content',async()=>{
  const model={profile:{themes:['猫','猫',' 海边 '],avoidTopics:['医院']},
    events:[{title:'和朋友小王闹翻了 13812345678',occurredOn:'2030-01-01',category:'relationship',currentImpact:.8,useInContent:true}]};
  const r=await runIntake(sample,live,now,reply(model));
  assert.equal(r.mode,'live');assert.deepEqual(r.draft.profile.themes,['猫','海边']);
  const [e]=r.draft.events;assert.equal(e.occurredOn,'2026-11-17','future date clamped');
  assert.equal(e.useInContent,false);assert.equal(e.useForSelection,true);assert.ok(!e.title.includes('138'));
  assert.ok(!reply.sent.messages[1].content.includes('13812345678'),'raw contact details never sent to the model');
});
test('malformed model output is rejected rather than half-saved',async()=>{
  await assert.rejects(runIntake('我喜欢猫',live,now,reply({profile:{lifeStage:'astronaut'}})),/格式不符/);
});
test('crisis wording in intake text stops before any model call',async()=>{
  let called=false;
  const r=await runIntake('最近真的不想活了',live,now,async()=>{called=true;return Response.json({});});
  assert.equal(r.crisis,true);assert.equal(called,false);
});
test('merging keeps existing values and never re-adds a theme the user has said to avoid',()=>{
  const current=profileSchema.parse({themes:['山'],avoidTopics:['猫'],habits:{audio:1}});
  const merged=mergeProfile(current,{profile:{themes:['猫','海'],avoidTopics:['考试'],habits:{reading:0}},events:[],notes:[]});
  assert.deepEqual(merged.themes,['山','海']);assert.deepEqual(merged.avoidTopics,['猫','考试']);
  assert.equal(merged.habits.audio,1);assert.equal(merged.habits.reading,0);
});

// ---------- risk.positive-statement-backfire / risk.happiness-pressure ----------
test('direct verdicts about the user and outcome promises are detected',()=>{
  for(const t of ['你一定能行','你真棒','一切都会好起来的','相信你自己'])assert.ok(findAffirmation(t),t);
  for(const t of ['店主点点头，把钟递给你','角色慢慢发现了另一条路'])assert.equal(findAffirmation(t),null,t);
  for(const t of ['五分钟让你开心','保证让你好起来','心情提升 30%'])assert.ok(findPromise(t),t);
  assert.equal(findPromise('愿你接下来的几分钟轻松一点'),null);
});
test('generated content that lectures the user is rejected',async()=>{
  const r=requestSchema.parse({goal:'encouragement',seconds:180}),p=profileSchema.parse({});
  const d=decide(p,[],r,[],['text','animation','game','speech'],now);
  const bad={title:'t',scenes:[{text:'别担心，你一定能行的。',durationSeconds:60,visual:'',choices:[{id:'a',label:'a',consequence:'a'},{id:'b',label:'b',consequence:'b'}]}],ending:'结束'};
  await assert.rejects(generate(p,[],r,d,live,[],'j',agentMock({writer:[bad]}).fetcher),/直接评价用户/);
});
test('demo content and interface copy contain no outcome promises or verdicts',async()=>{
  const r=requestSchema.parse({goal:'encouragement',seconds:180}),p=profileSchema.parse({});
  for(const goal of ['calm-down','encouragement','mastery','mood-shift']){
    const rr={...r,goal},d=decide(p,[],rr,[],['text','animation','game','speech'],now);
    const a=await generate(p,[],rr,d,{mode:'demo'},[],'j');
    assert.equal(findPromise(JSON.stringify(a.content)),null);assert.equal(findAffirmation(JSON.stringify(a.content)),null);
  }
  const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.equal(findPromise(page),null);assert.equal(findAffirmation(page),null);
});
test('"felt lectured" caps the learned outcome even when the rating improved',()=>{
  const r=requestSchema.parse({goal:'encouragement',seconds:180});
  const good={after:{...r.state,hope:9},goalAttainment:9,liked:true,discomfort:false,completion:1,elapsedSeconds:180};
  assert.ok(outcome(r,good)>.7);assert.equal(outcome(r,{...good,preachy:true}),.25);
  assert.equal(outcome(r,{liked:true,completion:1,elapsedSeconds:10,discomfort:false,preachy:true}),.25);
});

// ---------- API ----------
class LocalD1{
  db=new DatabaseSync(':memory:');
  prepare(sql){const db=this.db;let params=[];const stmt={bind(...args){params=args;return stmt;},async first(){return db.prepare(sql).get(...params)??null;},async all(){return {results:db.prepare(sql).all(...params)};},async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};}};return stmt;}
  async batch(statements){this.db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
async function fixture(){const db=new LocalD1(),store=new Store(db);await store.init();const service=new Service(store,kb,{mode:'demo'},fetch,()=>now);let cookie='';
  async function call(path,method='GET',data){const response=await service.handle(new Request('http://localhost/api/'+path,{method,headers:{'Content-Type':'application/json',cookie},body:data===undefined?undefined:JSON.stringify(data)}));if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,data:await response.json()};}
  await call('workspace','POST');return {call,db};}
test('API: intake returns a draft, saves nothing, and apply stores only what was confirmed',async()=>{const f=await fixture();try{
  const r=await f.call('intake','POST',{text:sample});assert.equal(r.status,200);assert.equal(r.data.mode,'demo');
  const exp1=(await f.call('export')).data;assert.equal(exp1.events.length,0);assert.ok(!JSON.stringify(exp1).includes('研二'));
  const draft={...r.data.draft,events:r.data.draft.events.slice(0,1),profile:{...r.data.draft.profile,themes:['猫']}};
  const a=await f.call('intake/apply','POST',draft);assert.equal(a.status,200);
  assert.deepEqual(a.data.profile.data.themes,['猫']);assert.equal(a.data.events.length,1);assert.equal(a.data.events[0].useInContent,false);
  assert.ok(!JSON.stringify((await f.call('export')).data).includes('13812345678'));
}finally{f.db.db.close();}});
test('API: intake with crisis wording returns the safety stop',async()=>{const f=await fixture();try{
  const r=await f.call('intake','POST',{text:'我有时候想结束自己的生命'});assert.equal(r.data.safety.stop,true);
}finally{f.db.db.close();}});
