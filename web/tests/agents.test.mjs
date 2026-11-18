// Multi-agent pipeline, DeepSeek/Qwen presets, DashScope images and speech, and R2 persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {profileSchema,requestSchema} from '../core/contracts.ts';
import {decide} from '../core/engine.ts';
import {generate,capabilities} from '../core/generation.ts';
import {startImage,pollImage,chunkText} from '../core/media.ts';
import {configFromEnv} from '../core/config.ts';
import {Store} from '../db/store.ts';
import {Service} from '../core/service.ts';
import {agentMock,LIVE,CONTENT,PASS} from './helpers.mjs';

const now=new Date('2026-11-17T12:00:00Z');
const kb=JSON.parse(readFileSync(new URL('../generated/kb.json',import.meta.url),'utf8'));
const p=profileSchema.parse({});
const caps=['text','animation','game','speech'];
const story=requestSchema.parse({goal:'encouragement',seconds:300,context:{cognitiveLoad:0},state:{energy:10}});
const decisionFor=(r,c=caps)=>decide(p,[],r,[],c,now);

// ---------- pipeline ----------
test('planner, writer and reviewer run in order, each with its own model when configured',async()=>{
  const {fetcher,calls}=agentMock();
  const cfg={...LIVE,models:{reviewer:'deepseek-v4-pro'}};
  const a=await generate(p,[],story,decisionFor(story),cfg,[],'j',fetcher);
  assert.deepEqual(calls.map(c=>[c.role,c.model]),[['planner','deepseek-flash'],['writer','deepseek-flash'],['reviewer','deepseek-v4-pro']]);
  assert.deepEqual(a.trace.map(t=>t.agent),['planner','writer','reviewer']);
  assert.ok(!JSON.stringify(a.trace).includes('齿轮'),'trace stores no content');
});
test('a failed review triggers exactly one revision with the issues attached',async()=>{
  const fail={pass:false,issues:[{scene:1,problem:'像在说教',fix:'改成角色自己发现'}]};
  const {fetcher,calls}=agentMock({writer:[CONTENT,CONTENT],reviewer:[fail,PASS]});
  const a=await generate(p,[],story,decisionFor(story),LIVE,[],'j',fetcher);
  assert.deepEqual(calls.map(c=>c.role),['planner','writer','reviewer','writer','reviewer']);
  assert.ok(JSON.parse(calls[3].user).issues[0].problem.includes('说教'));
  assert.deepEqual(a.trace.map(t=>t.outcome),['ok','ok','revise','ok','ok']);
});
test('an ending copied from the director\'s note is sent back for one revision, then dropped if it persists',async()=>{
  const leaked={...CONTENT,ending:'结尾不宣布“已经平静”，只留下一个安静画面。'};
  const fixed=agentMock({writer:[leaked,CONTENT]});
  const a=await generate(p,[],story,decisionFor(story),LIVE,[],'j',fixed.fetcher);
  assert.deepEqual(fixed.calls.map(c=>c.role),['planner','writer','reviewer','writer','reviewer']);
  assert.equal(a.content.ending,'钟又走起来了。');
  const stubborn=await generate(p,[],story,decisionFor(story),LIVE,[],'j',agentMock({writer:[leaked]}).fetcher);
  assert.equal(stubborn.content.ending,'（完）');
});
test('two failed reviews reject the content instead of showing it',async()=>{
  const fail={pass:false,issues:[{scene:0,problem:'出现禁止话题的同义说法',fix:''}]};
  await assert.rejects(generate(p,[],story,decisionFor(story),LIVE,[],'j',agentMock({reviewer:[fail]}).fetcher),/两次未通过审核/);
});
test('a plan over the time budget is rejected before any writing',async()=>{
  const long={title:'t',beats:[{purpose:'x',durationSeconds:1000}]};
  const {fetcher,calls}=agentMock({plan:long});
  await assert.rejects(generate(p,[],story,decisionFor(story),LIVE,[],'j',fetcher),/超出时长预算/);
  assert.deepEqual(calls.map(c=>c.role),['planner']);
});

// ---------- presets ----------
test('DeepSeek and Qwen presets fill the endpoint and model; explicit values win',()=>{
  const d=configFromEnv({CONTENT_MODE:'live',LLM_PROVIDER:'deepseek',LLM_API_KEY:'k'});
  assert.equal(d.llmUrl,'https://api.deepseek.com');assert.equal(d.model,'deepseek-flash');
  assert.equal(configFromEnv({LLM_PROVIDER:'deepseek',LLM_MODEL:'deepseek-v4-pro'}).model,'deepseek-v4-pro');
  assert.equal(configFromEnv({LLM_PROVIDER:'qwen'}).llmUrl,'https://dashscope.aliyuncs.com/compatible-mode/v1');
  assert.equal(configFromEnv({}).mode,'demo');assert.equal(configFromEnv({IMAGES_PER_SESSION:'9'}).imagesPerSession,3);
  assert.ok(capabilities(configFromEnv({DASHSCOPE_API_KEY:'x'})).includes('tts'));
});

// ---------- DashScope ----------
const DS={...LIVE,dashscopeKey:'ds-test'};
test('image tasks use the legacy or the message-style endpoint depending on the model',async()=>{
  const seen=[];const f=async(url,init)=>{seen.push({url,body:JSON.parse(init.body),async:init.headers['X-DashScope-Async']});return Response.json({output:{task_id:'task-1'}});};
  const a=await startImage(DS,0,'湖边的灯',f);
  assert.equal(a.taskId,'task-1');assert.ok(seen[0].url.endsWith('/text2image/image-synthesis'));
  assert.equal(seen[0].body.model,'wan2.2-t2i-flash');assert.ok(seen[0].body.input.prompt.includes('湖边的灯'));assert.equal(seen[0].async,'enable');
  await startImage({...DS,imageModel:'wan2.6-t2i'},0,'湖边的灯',f);
  assert.ok(seen[1].url.endsWith('/image-generation/generation'));assert.ok(seen[1].body.input.messages[0].content[0].text.includes('湖边的灯'));
});
test('polling reads both result shapes and ignores non-https URLs',async()=>{
  const job={scene:0,prompt:'x',status:'pending',taskId:'t'};
  const legacy=async()=>Response.json({output:{task_status:'SUCCEEDED',results:[{url:'https://oss.example/a.png'}]}});
  const modern=async()=>Response.json({output:{task_status:'SUCCEEDED',choices:[{message:{content:[{image:'https://oss.example/b.png'}]}}]}});
  const bad=async()=>Response.json({output:{task_status:'SUCCEEDED',results:[{url:'javascript:alert(1)'}]}});
  assert.equal((await pollImage(DS,job,legacy)).url,'https://oss.example/a.png');
  assert.equal((await pollImage(DS,job,modern)).url,'https://oss.example/b.png');
  assert.equal((await pollImage(DS,job,bad)).status,'failed');
  assert.equal((await pollImage(DS,job,async()=>Response.json({output:{task_status:'RUNNING'}}))).status,'pending');
});
test('http audio links on Alibaba Cloud OSS are upgraded to https; other http links are refused',async()=>{
  const {synthesize}=await import('../core/media.ts');
  const reply=url=>async()=>Response.json({output:{audio:{url}}});
  assert.equal(await synthesize(DS,'测试',reply('http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.wav?Expires=1')),
    'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.wav?Expires=1');
  await assert.rejects(synthesize(DS,'测试',reply('http://evil.example/a.wav')),/音频地址无效/);
  await assert.rejects(synthesize(DS,'测试',reply('http://aliyuncs.com.evil.example/a.wav')),/音频地址无效/);
});
test('speech retries on the provider rate limit and the pool keeps order under a concurrency cap',async()=>{
  const {synthesize,pool}=await import('../core/media.ts');
  let calls=0;const f=async()=>++calls<3?new Response('{}',{status:429}):Response.json({output:{audio:{url:'https://oss.example/a.wav'}}});
  assert.equal(await synthesize(DS,'测试',f,async()=>{}),'https://oss.example/a.wav');assert.equal(calls,3);
  let active=0,peak=0;
  const out=await pool([5,1,4,2,3],2,async n=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,n));active--;return n*10;});
  assert.deepEqual(out,[50,10,40,20,30]);assert.equal(peak,2);
});
test('speech text is split under the 600-character limit on sentence ends',()=>{
  const text='一句话。'.repeat(400);const parts=chunkText(text);
  assert.ok(parts.every(x=>x.length<=600));assert.equal(parts.join(''),text);
});
test('images and speech are added to a live story; their failures only add warnings',async()=>{
  const spoken=requestSchema.parse({goal:'encouragement',seconds:300,context:{cognitiveLoad:1,speechAvailable:false}});
  const d=decide(p,[],spoken,[],[...caps,'image','tts'],now);
  assert.equal(d.selected,'spoken-story','server speech makes audio stories available without browser voices');
  const media=async(url)=>url.includes('/tasks/')?null:url.includes('image')||url.includes('text2image')?
    Response.json({output:{task_id:'t1'}}):url.includes('multimodal-generation')?Response.json({output:{audio:{url:'https://oss.example/a.wav'}}}):null;
  const a=await generate(p,[],spoken,d,DS,[],'j',agentMock({extra:media}).fetcher);
  assert.equal(a.images.length,1);assert.equal(a.images[0].scene,1,'cover beat chosen by the planner');
  assert.ok(a.audio.length>=4);assert.equal(a.warnings.length,0);
  const broken=async(url)=>url.includes('dashscope')?new Response('down',{status:503}):null;
  const b=await generate(p,[],spoken,d,DS,[],'j',agentMock({extra:broken}).fetcher);
  assert.equal(b.images.length,0);assert.equal(b.audio,undefined);assert.equal(b.warnings.length,2);
});

// ---------- service: R2 persistence and isolation ----------
class LocalD1{
  db=new DatabaseSync(':memory:');
  prepare(sql){const db=this.db;let params=[];const stmt={bind(...args){params=args;return stmt;},async first(){return db.prepare(sql).get(...params)??null;},async all(){return {results:db.prepare(sql).all(...params)};},async run(){const r=db.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};}};return stmt;}
  async batch(statements){this.db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
class FakeR2{
  objects=new Map();
  async put(key,value,o){this.objects.set(key,{value,type:o?.httpMetadata?.contentType});}
  async get(key){const v=this.objects.get(key);return v?{body:new Blob([v.value]).stream(),httpMetadata:{contentType:v.type}}:null;}
  async list({prefix}){return {objects:[...this.objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false};}
  async delete(keys){for(const k of [].concat(keys))this.objects.delete(k);}
}
test('API: generated media is copied to R2, served only to its owner, and deleted with the workspace',async()=>{
  const db=new LocalD1(),store=new Store(db);await store.init();const bucket=new FakeR2();
  let poll=0;
  const media=async(url)=>url.startsWith('https://oss.example/')?new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}}):
    url.includes('/tasks/')?Response.json({output:{task_status:poll++?'SUCCEEDED':'RUNNING',results:[{url:'https://oss.example/c.png'}]}}):
    url.includes('text2image')?Response.json({output:{task_id:'t9'}}):null;
  const service=new Service(store,kb,DS,agentMock({extra:media}).fetcher,()=>now,bucket);
  const jar={};
  const call=async(path,method='GET',data,who='a')=>{const r=await service.handle(new Request('http://localhost/api/'+path,{method,
    headers:{'Content-Type':'application/json',cookie:jar[who]??'','idempotency-key':crypto.randomUUID()},body:data===undefined?undefined:JSON.stringify(data)}));
    if(r.headers.has('set-cookie'))jar[who]=r.headers.get('set-cookie').split(';')[0];return r;};
  try{
    await call('workspace','POST');await call('workspace','POST',undefined,'b');
    const s=await (await call('sessions','POST',{goal:'encouragement',seconds:300,context:{cognitiveLoad:0},state:{energy:10}})).json();
    const g=await (await call(`sessions/${s.id}/generate`,'POST')).json();
    assert.equal(g.status,'ready');assert.equal(g.artifact.images[0].status,'pending');
    await call(`sessions/${s.id}/images`,'POST');
    const done=await (await call(`sessions/${s.id}/images`,'POST')).json();
    const url=done.artifact.images[0].url;assert.match(url,/^\/api\/media\/[\w-]+\/image-1\.png$/);
    assert.ok(!url.includes(jar.a.split('=')[1]),'owner id never appears in a URL');
    const mine=await call(url.replace('/api/',''));assert.equal(mine.status,200);assert.equal(mine.headers.get('content-type'),'image/png');
    assert.equal((await call(url.replace('/api/',''),'GET',undefined,'b')).status,404,'other users cannot read it');
    await call('workspace','DELETE');assert.equal(bucket.objects.size,0);
  }finally{db.db.close();}
});
