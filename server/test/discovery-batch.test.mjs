import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../storage.mjs';
import {createLibrary} from '../discovery/library.mjs';
const base={source:'original',category:'科技数码',startDate:'2026-11-10',endDate:'2026-11-12'};
async function setup(fetcher,limit='10',options={}){
 const dir=await mkdtemp(join(tmpdir(),'gzh-batch-')),db=openDatabase(join(dir,'db.sqlite'));
 db.exec('CREATE TABLE users(id TEXT PRIMARY KEY)');db.exec(await readFile(new URL('../discovery/schema.sql',import.meta.url),'utf8'));
 const library=createLibrary(db,{REDFOX_API_KEY:'fixture-only',REDFOX_DAILY_REQUEST_LIMIT:limit,REDFOX_SYNC_COOLDOWN_SECONDS:'0',REDFOX_BATCH_INTERVAL_MS:'0',...options},fetcher);
 return {db,library,async close(){await library.close();db.close();await rm(dir,{recursive:true,force:true});}};
}
async function finished(library,id){for(let n=0;n<150;n++){const j=(await library.status(true)).jobs.find(j=>j.id===id);if(j&&!['running','queued'].includes(j.status))return j;await new Promise(r=>setTimeout(r,10));}throw Error('job did not finish');}
test('keyword jobs share budget, merge by article URL and leave rank coverage intact',async()=>{
 const url='https://mp.weixin.qq.com/s?__biz=keyword&mid=1&idx=1';
 const keyword={mode:'keyword',source:'keywordWide',keyword:'AI 工具'};
 let calls=0;
 const settings={REDFOX_KEYWORD_COLLECTION:'0'};
 const ctx=await setup(async(path)=>{
  calls++;
  const data=path.endsWith('/searchArticle')?{list:[{workUuid:'different-id',title:'关键词结果',workUrl:url}]}:[{photoId:'rank-id',title:'榜单结果',oriUrl:url,content:'原有正文',clicksCount:'10w+'}];
  return Response.json({code:2000,data});
 },'2',settings);
 try{
  await assert.rejects(ctx.library.sync(keyword),e=>e.status===403);
  assert.equal(calls,0);
  const rank=await finished(ctx.library,(await ctx.library.sync(base)).jobId);
  assert.equal(rank.status,'completed');
  await ctx.library.close();
  const enabled=createLibrary(ctx.db,{REDFOX_API_KEY:'fixture-only',REDFOX_KEYWORD_COLLECTION:'1',REDFOX_DAILY_REQUEST_LIMIT:'2',REDFOX_SYNC_COOLDOWN_SECONDS:'0'},async()=>{
   calls++;
   return Response.json({code:2000,data:{list:[{workUuid:'different-id',title:'关键词结果',workUrl:url}]}});
  });
  try{
   const job=await finished(enabled,(await enabled.sync(keyword)).jobId);
   assert.equal(job.status,'completed');assert.equal(job.new_count,0);assert.equal(job.updated_count,1);
   const article=await enabled.article('rank-id');assert.equal(article.content,'原有正文');assert.equal(article.readCount,100000);
   assert.equal((await enabled.list(new URLSearchParams('source=keywordWide'))).total,1);
   const status=await enabled.status(true);assert.equal(status.used,2);assert.equal(status.coverage.length,1);assert.equal(status.coverage[0].source,'original');
   await assert.rejects(enabled.sync(keyword),e=>e.status===429);assert.equal(calls,2);
  }finally{await enabled.close();}
 }finally{await ctx.close();}
});
test('daily backfill is bounded, sequential, deduplicated and records each day',async()=>{
 const requests=[];let inFlight=0,maxInFlight=0;
 const ctx=await setup(async(url,init)=>{requests.push(JSON.parse(init.body));maxInFlight=Math.max(maxInFlight,++inFlight);await new Promise(r=>setTimeout(r,5));inFlight--;return Response.json({code:2000,data:[{photoId:'same',title:'同一文章',oriUrl:'https://mp.weixin.qq.com/s?__biz=test',clicksCount:'10w+',type:'知识百科',commentCount:'8',content:'正文'}]});});
 try{const result=await ctx.library.sync({...base,mode:'daily'});const job=await finished(ctx.library,result.jobId);assert.equal(job.status,'completed');assert.equal(requests.length,3);assert.equal(maxInFlight,1);assert.deepEqual(requests.map(r=>[r.startDate,r.endDate]),[['2026-11-10','2026-11-10'],['2026-11-11','2026-11-11'],['2026-11-12','2026-11-12']]);assert.equal(job.steps.length,3);assert.equal(job.requests_used,3);assert.equal(job.new_count,1);assert.equal(job.updated_count,2);assert.equal((await ctx.library.status(true)).total,1);
  const a=await ctx.library.article('same');assert.equal(a.providerCategory,'知识百科');assert.equal(a.rawData.commentCount,'8');assert.equal(a.rawData.content,'正文');
  const list=await ctx.library.list(new URLSearchParams());assert.equal(list.items[0].rawData,undefined);assert.equal(list.items[0].content,undefined);
  assert.equal((await ctx.library.list(new URLSearchParams('source=tenw'))).items.length,0);
  assert.equal((await ctx.library.list(new URLSearchParams('q='+encodeURIComponent('正文')+'&scope=body'))).items.length,1);
  assert.equal((await ctx.library.status(false)).quality.withContent,1);
  assert.equal((await ctx.library.status(false)).quality.withFans,undefined);
 }finally{await ctx.close();}
});
test('an upstream failure stops a batch without charging unattempted dates or losing earlier days',async()=>{
 let calls=0;const ctx=await setup(async()=>{if(++calls===2)return Response.json({code:5000,data:null});return Response.json({code:2000,data:[{photoId:'kept',title:'保留文章',oriUrl:'https://mp.weixin.qq.com/s?__biz=test'}]});});
 try{const {jobId}=await ctx.library.sync({...base,mode:'daily'});const job=await finished(ctx.library,jobId);assert.equal(job.status,'partial');assert.equal(calls,2);assert.deepEqual(job.steps.map(s=>s.status),['completed','failed','cancelled']);assert.equal((await ctx.library.status(true)).used,2);assert.equal((await ctx.library.status(true)).total,1);assert.equal((await ctx.library.status(false)).coverage.length,1);
 }finally{await ctx.close();}
});
test('oversized batches and insufficient budgets are rejected before any provider request',async()=>{
 let calls=0;const ctx=await setup(async()=>{calls++;return Response.json({code:2000,data:[]});},'2');
 try{await assert.rejects(ctx.library.sync({...base,mode:'daily'}),e=>e.status===429);assert.equal(calls,0);await assert.rejects(ctx.library.sync({...base,startDate:'2026-11-01',mode:'daily'}),e=>e.status===400);assert.equal(calls,0);assert.equal((await ctx.library.status(true)).used,0);}finally{await ctx.close();}
});
test('shutdown waits for a submitting job and prevents collection after shutdown begins',async()=>{
 let calls=0,enter,release;const entered=new Promise(r=>{enter=r;}),gate=new Promise(r=>{release=r;});
 const ctx=await setup(async()=>{calls++;return Response.json({code:2000,data:[]});});
 const prepare=ctx.db.prepare.bind(ctx.db);
 ctx.db.prepare=(sql,...args)=>{const stmt=prepare(sql,...args);if(sql.startsWith('SELECT created_at FROM discovery_jobs')){const first=stmt.first.bind(stmt);stmt.first=async()=>{enter();await gate;return first();};}return stmt;};
 const submitted=ctx.library.sync({...base,mode:'daily'}).then(v=>({value:v}),error=>({error}));
 try{await entered;let closed=false;const closing=ctx.library.close().then(()=>{closed=true;});await new Promise(r=>setTimeout(r,10));assert.equal(closed,false);release();const result=await submitted;await closing;assert.equal(result.error?.status,503);assert.equal(calls,0);assert.equal((await ctx.db.prepare('SELECT COUNT(*) AS n FROM discovery_jobs').first()).n,0);}
 finally{release();await submitted;await ctx.close();}
});
test('quota reservation rolls back when the request step cannot be persisted',async()=>{
 let calls=0;const ctx=await setup(async()=>{calls++;return Response.json({code:2000,data:[]});});
 try{ctx.db.exec("CREATE TRIGGER block_step_update BEFORE UPDATE OF status ON discovery_job_steps WHEN NEW.status='running' BEGIN SELECT RAISE(ABORT,'test persistence failure'); END");const {jobId}=await ctx.library.sync({...base,mode:'range'});const job=await finished(ctx.library,jobId);assert.equal(job.status,'failed');assert.equal(calls,0);assert.equal((await ctx.library.status(true)).used,0);}
 finally{await ctx.close();}
});
