import {randomUUID} from 'node:crypto';
import {categories,normalizeArticle,fetchRank,fetchKeyword,keywordSources,keywordCategory,validDate,validateSync} from './provider.mjs';
import {planBackfill,publicSyncError} from './backfill.mjs';
import {readCoverage} from './coverage.mjs';
const now=()=>new Date().toISOString();
const hasContent="LENGTH(TRIM(COALESCE(json_extract(a.data_json,'$.content'),''), char(9,10,13,32)))>0";
const savedTopicId=`(SELECT t.id FROM topic_sources s JOIN topics t ON t.id=s.topic_id
 WHERE s.article_id=a.id AND t.user_id=? ORDER BY t.created_at,t.id LIMIT 1) AS saved_topic_id`;
export const chinaDay=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export function positive(value,fallback,max=10000){const n=Number(value);return Number.isInteger(n)&&n>=0&&n<=max?n:fallback;}
export function decodeArticle(row,full=false){
 if(!row)return null;const data=JSON.parse(row.data_json);
 // Retired fields may remain in historical snapshots; omit them from public contracts.
 delete data.fans;delete data.fansRaw;delete data.fansExact;
 if(data.metrics&&typeof data.metrics==='object')delete data.metrics.fans;
 if(data.rawData&&typeof data.rawData==='object')delete data.rawData.fans;
 if(!full){delete data.content;delete data.rawData;}
 return {...data,firstSeen:row.first_seen,updatedAt:row.updated_at,savedTopicId:row.saved_topic_id??null};
}
export function createLibrary(db,config,fetcher){
 let active=null,closing=false;const abort=new AbortController();
 const ready=db.batch([
  db.prepare("UPDATE discovery_job_steps SET status='interrupted',error='服务重启，请核对请求结果',finished_at=? WHERE status='running'").bind(now()),
  db.prepare("UPDATE discovery_job_steps SET status='cancelled',error='任务中断，未发起请求',finished_at=? WHERE status='queued' AND job_id IN(SELECT id FROM discovery_jobs WHERE status IN('queued','running'))").bind(now()),
  db.prepare("UPDATE discovery_jobs SET status='interrupted',error='服务已重启，请检查请求记录后手动重试',finished_at=? WHERE status IN ('queued','running')").bind(now()),
 ]);
 const article=async(id,userId=null)=>decodeArticle(await db.prepare(`SELECT a.*, ${savedTopicId} FROM discovery_articles a WHERE a.id=?`).bind(userId,id).first(),true);
 async function coverage(input){await ready;try{validateSync(input);}catch(e){throw new HttpError(400,e.message);}return readCoverage(db,input);}
 async function list(query,userId=null){
  let cursor=null;
  const sort=query.get('sort')==='reads'?'reads':'newest';
  if(query.has('sort')&&!['reads','newest'].includes(query.get('sort')))throw new HttpError(400,'排序方式无效');
  if(query.get('cursor')){try{cursor=JSON.parse(Buffer.from(query.get('cursor'),'base64url').toString());if(cursor.sort!==sort||typeof cursor.id!=='string'||typeof cursor.value!=='string'&&typeof cursor.value!=='number')throw 0;}catch{throw new HttpError(400,'分页游标无效，请重新查询');}}
  const where=[],args=[];const q=(query.get('q')||'').trim();
  if(q.length>100)throw new HttpError(400,'搜索词最多100字');
  const scope=query.get('scope')||'title';if(!['title','body'].includes(scope))throw new HttpError(400,'搜索范围无效');
  if(q){const term='%'+q.replace(/[\\%_]/g,'\\$&')+'%';where.push(scope==='body'?"(a.title LIKE ? ESCAPE '\\' OR a.account LIKE ? ESCAPE '\\' OR json_extract(a.data_json,'$.content') LIKE ? ESCAPE '\\')":"(a.title LIKE ? ESCAPE '\\' OR a.account LIKE ? ESCAPE '\\')");args.push(term,term);if(scope==='body')args.push(term);}
  const category=query.get('category'),source=query.get('source'),membership=[];
  if(category){if(!categories.includes(category)&&category!==keywordCategory)throw new HttpError(400,'分类无效');membership.push('m.category=?');args.push(category);}
  if(source){if(!['original','tenw'].includes(source)&&!Object.hasOwn(keywordSources,source))throw new HttpError(400,'采集来源无效');membership.push('m.source=?');args.push(source);}
  if(membership.length)where.push(`EXISTS(SELECT 1 FROM discovery_memberships m WHERE m.article_id=a.id AND ${membership.join(' AND ')})`);
  const since=query.get('since');if(since){if(!validDate(since))throw new HttpError(400,'日期无效');where.push('a.published_at>=?');args.push(new Date(since+'T00:00:00+08:00').toISOString());}
  const content=query.get('content')??'';
  if(content!==''&&content!=='present')throw new HttpError(400,'正文筛选条件无效');
  if(content==='present')where.push(hasContent);
  const filterKey=JSON.stringify({q,scope,sort,category:category||'',source:source||'',since:since||'',content});
  if(cursor&&cursor.filterKey!==filterKey)throw new HttpError(400,'筛选条件已变化，请重新查询');
  const total=await db.prepare(`SELECT COUNT(*) AS n FROM discovery_articles a ${where.length?'WHERE '+where.join(' AND '):''}`).bind(...args).first();
  const col=sort==='reads'?'COALESCE(a.read_count,-1)':"COALESCE(a.published_at,'')";
  if(cursor){where.push(`(${col}<? OR (${col}=? AND a.id<?))`);args.push(cursor.value,cursor.value,cursor.id);}
  const limit=Math.min(positive(query.get('limit'),20,50)||20,50);
  const {results}=await db.prepare(`SELECT a.*, ${savedTopicId} FROM discovery_articles a ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ${col} DESC,a.id DESC LIMIT ?`).bind(userId,...args,limit+1).all();
  const rows=results.slice(0,limit),last=rows.at(-1);
  return {items:rows.map(r=>decodeArticle(r)),total:total.n,nextCursor:results.length>limit?Buffer.from(JSON.stringify({filterKey,sort,id:last.id,value:sort==='reads'?(last.read_count??-1):(last.published_at??'')})).toString('base64url'):null};
 }
 async function status(admin){
  await ready;
  const total=await db.prepare(`SELECT COUNT(*) AS count,MIN(published_at) AS earliest,MAX(published_at) AS latest,SUM(CASE WHEN ${hasContent} THEN 1 ELSE 0 END) AS with_content FROM discovery_articles a`).first();
  const {results:coverage}=await db.prepare("SELECT s.params_json,s.finished_at FROM discovery_job_steps s WHERE s.status='completed' AND COALESCE(json_extract(s.params_json,'$.mode'),'')<>'keyword' UNION ALL SELECT j.params_json,j.finished_at FROM discovery_jobs j WHERE j.status='completed' AND COALESCE(json_extract(j.params_json,'$.mode'),'')<>'keyword' AND NOT EXISTS(SELECT 1 FROM discovery_job_steps s WHERE s.job_id=j.id) ORDER BY finished_at DESC LIMIT 20").all();
  const used=await db.prepare('SELECT count FROM discovery_usage WHERE day=?').bind(chinaDay()).first();
  const latestSync=await db.prepare("SELECT MAX(finished_at) AS stamp FROM discovery_job_steps WHERE status='completed'").first();
  const result={provider:'redfox',configured:Boolean(config.REDFOX_API_KEY),categories,total:total.count,quality:{withContent:total.with_content??0},earliest:total.earliest,latest:total.latest,lastSuccessfulSyncAt:[latestSync?.stamp,coverage[0]?.finished_at].filter(Boolean).sort().at(-1)??null,coverage:coverage.map(r=>({...JSON.parse(r.params_json),finishedAt:r.finished_at})),canSync:admin,used:admin?(used?.count??0):undefined,dailyLimit:admin?positive(config.REDFOX_DAILY_REQUEST_LIMIT,20):undefined,maxBatchRequests:admin?Math.max(1,positive(config.REDFOX_MAX_BATCH_REQUESTS,7,31)):undefined};
  if(admin){
   result.canSearchKeywords=config.REDFOX_KEYWORD_COLLECTION==='1';
   result.jobs=[];
   const jobs=(await db.prepare('SELECT * FROM discovery_jobs ORDER BY created_at DESC,id DESC LIMIT 10').all()).results;
   for(const row of jobs){
    const steps=(await db.prepare('SELECT * FROM discovery_job_steps WHERE job_id=? ORDER BY step_index').bind(row.id).all()).results.map(s=>({...s,params:JSON.parse(s.params_json),params_json:undefined}));
    result.jobs.push({...row,params:JSON.parse(row.params_json),params_json:undefined,steps,requests_used:steps.length?steps.reduce((n,s)=>n+s.attempted,0):1,request_budget:steps.length||1});
   }
  }
  return result;
 }
 async function sync(input){
  await ready;if(closing)throw new HttpError(503,'服务正在停止');if(!config.REDFOX_API_KEY)throw new HttpError(503,'未配置 REDFOX_API_KEY，请由管理员在服务器配置');
  if(input.mode==='keyword'&&config.REDFOX_KEYWORD_COLLECTION!=='1')throw new HttpError(403,'关键词采集尚未启用');
  let plan;try{plan=planBackfill(input,Math.max(1,positive(config.REDFOX_MAX_BATCH_REQUESTS,7,31)));}catch(e){throw new HttpError(400,e.message);}
  if(active)throw new HttpError(409,'已有采集任务正在执行，请稍后查看');
  // The lease covers preflight, submission and execution, so shutdown cannot close
  // SQLite between an awaited preflight read and creating the job.
  let release;
  const lease=new Promise(resolve=>{release=resolve;});active=lease;
  const finish=()=>{if(active===lease)active=null;release();};
  try{
   if(input.skipCollected===true&&plan.params.mode==='daily'){
    const covered=new Set((await coverage(plan.params)).days.filter(d=>d.state==='daily').map(d=>d.date));
    plan.params={...plan.params,skipCollected:true,skippedDates:plan.steps.filter(s=>covered.has(s.startDate)).map(s=>s.startDate)};
    plan.steps=plan.steps.filter(s=>!covered.has(s.startDate));
    if(!plan.steps.length)throw new HttpError(409,'所选日期均已有成功的当日查询，无需补采；如需更新指标，请取消跳过选项');
   }
   const recent=await db.prepare('SELECT created_at FROM discovery_jobs ORDER BY created_at DESC LIMIT 1').first();
   if(closing)throw new HttpError(503,'服务正在停止，未创建采集任务');
   if(recent&&Date.now()-Date.parse(recent.created_at)<positive(config.REDFOX_SYNC_COOLDOWN_SECONDS,60,3600)*1000)throw new HttpError(429,'采集操作过于频繁，请稍后再试');
   const limit=positive(config.REDFOX_DAILY_REQUEST_LIMIT,20);
   const used=await db.prepare('SELECT count FROM discovery_usage WHERE day=?').bind(chinaDay()).first();
   if(closing)throw new HttpError(503,'服务正在停止，未创建采集任务');
   if(plan.steps.length>limit-(used?.count??0))throw new HttpError(429,'今日剩余请求预算不足以完成这批采集');
   const id=randomUUID();await db.batch([
    db.prepare("INSERT INTO discovery_jobs(id,status,params_json,created_at) VALUES(?,'running',?,?)").bind(id,JSON.stringify(plan.params),now()),
    ...plan.steps.map((params,index)=>db.prepare('INSERT INTO discovery_job_steps(job_id,step_index,params_json) VALUES(?,?,?)').bind(id,index,JSON.stringify(params))),
   ]);
   if(closing){await db.batch([db.prepare("UPDATE discovery_job_steps SET status='cancelled',finished_at=?,error='服务正在停止，未请求' WHERE job_id=?").bind(now(),id),db.prepare("UPDATE discovery_jobs SET status='interrupted',finished_at=?,error='服务正在停止，未请求' WHERE id=?").bind(now(),id)]);throw new HttpError(503,'服务正在停止，未请求供应商');}
   void run(id,plan.steps).catch(()=>{console.error('[discovery] task state could not be persisted');}).finally(finish);
   return {jobId:id,requestBudget:plan.steps.length};
  }catch(e){finish();throw e;}
 }
 async function storePage(id,index,params,rows){
   let added=0,updated=0,skipped=0;const statements=[],seen=new Set(),captured=now();
   const seenUrls=new Set();
   for(const raw of rows){let a;try{a=normalizeArticle(raw,params.category);}catch{skipped++;continue;}
    const match=await db.prepare("SELECT id FROM discovery_articles WHERE id=? OR json_extract(data_json,'$.url')=? ORDER BY (id=?) DESC,first_seen,id LIMIT 1").bind(a.id,a.url,a.id).first();
    if(match)a.id=match.id;
    if(seen.has(a.id)||seenUrls.has(a.url)){skipped++;continue;}seen.add(a.id);seenUrls.add(a.url);
    const prior=await db.prepare('SELECT * FROM discovery_articles WHERE id=?').bind(a.id).first();if(prior){updated++;const old=JSON.parse(prior.data_json);for(const key of ['content','summary','account','accountId','cover','publishedAt','publishedRaw','providerCategory'])if(!a[key])a[key]=old[key];
     if(params.mode==='keyword'&&old.category)a.category=old.category;
     for(const [field,count,raw] of [['read','readCount','readRaw'],['likes','likes','likesRaw'],['watches','watches','watchesRaw'],['shares','shares','sharesRaw']]){
      if(a[count]===null&&old[count]!=null){a[count]=old[count];a[raw]=old[raw];a.metrics[field]=old.metrics?.[field]??a.metrics[field];if(field==='read')a.readExact=old.readExact;}
     }
    }else added++;
    const json=JSON.stringify(a);
    statements.push(db.prepare('INSERT INTO discovery_articles(id,title,account,published_at,read_count,data_json,first_seen,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,account=excluded.account,published_at=COALESCE(excluded.published_at,discovery_articles.published_at),read_count=excluded.read_count,data_json=excluded.data_json,updated_at=excluded.updated_at').bind(a.id,a.title,a.account,a.publishedAt,a.readCount,json,captured,captured));
    statements.push(db.prepare('INSERT OR IGNORE INTO discovery_memberships(article_id,category,source) VALUES(?,?,?)').bind(a.id,params.category,params.source));
    statements.push(db.prepare('INSERT INTO discovery_snapshots(article_id,job_id,captured_at,data_json) VALUES(?,?,?,?)').bind(a.id,`${id}:${index}`,captured,json));
   }
   if(rows.length&&!seen.size)throw new Error('RedFox 返回记录均未通过字段校验，未写入文章库');
   statements.push(db.prepare("UPDATE discovery_job_steps SET status='completed',finished_at=?,new_count=?,updated_count=?,skipped_count=? WHERE job_id=? AND step_index=?").bind(now(),added,updated,skipped,id,index));
   statements.push(db.prepare('UPDATE discovery_jobs SET new_count=new_count+?,updated_count=updated_count+?,skipped_count=skipped_count+? WHERE id=?').bind(added,updated,skipped,id));
   await db.batch(statements);
 }
 async function run(id,steps){
  let completed=0,current=0;
  try{
   for(let index=0;index<steps.length;index++){
    current=index;
    if(abort.signal.aborted)throw new DOMException('Aborted','AbortError');
    const limit=positive(config.REDFOX_DAILY_REQUEST_LIMIT,20);
    const reservation=await db.batch([
     db.prepare('INSERT INTO discovery_usage(day,count) SELECT ?,1 WHERE ?>0 ON CONFLICT(day) DO UPDATE SET count=count+1 WHERE count<?').bind(chinaDay(),limit,limit),
     db.prepare("UPDATE discovery_job_steps SET status='running',attempted=1,started_at=? WHERE job_id=? AND step_index=? AND status='queued' AND changes()=1").bind(now(),id,index),
    ]);
    if(reservation[0].meta.changes!==1)throw new HttpError(429,'今日采集预算已用完');
    if(reservation[1].meta.changes!==1)throw new Error('Request step reservation failed');
    const step=steps[index];
    const rows=await (step.mode==='keyword'?fetchKeyword:fetchRank)(step,config,fetcher,abort.signal);
    await storePage(id,index,steps[index],rows);completed++;
    if(index<steps.length-1){const delay=positive(config.REDFOX_BATCH_INTERVAL_MS,1000,10000);if(delay)await new Promise(r=>setTimeout(r,delay));}
   }
   await db.prepare("UPDATE discovery_jobs SET status='completed',finished_at=? WHERE id=?").bind(now(),id).run();
  }catch(e){
   const error=publicSyncError(e),stamp=now();
   await db.batch([
    db.prepare("UPDATE discovery_job_steps SET status=CASE WHEN attempted=1 THEN 'failed' ELSE 'cancelled' END,error=?,finished_at=? WHERE job_id=? AND step_index=? AND status<>'completed'").bind(error,stamp,id,current),
    db.prepare("UPDATE discovery_job_steps SET status='cancelled',error='前序采集未完成，本日未请求',finished_at=? WHERE job_id=? AND status='queued'").bind(stamp,id),
    db.prepare('UPDATE discovery_jobs SET status=?,error=?,finished_at=? WHERE id=?').bind(completed?'partial':abort.signal.aborted?'interrupted':'failed',error,stamp,id),
   ]);
  }
  await db.prepare('DELETE FROM discovery_snapshots WHERE captured_at<?').bind(new Date(Date.now()-30*86400000).toISOString()).run().catch(()=>{console.warn('[discovery] snapshot cleanup failed');});
 }
 return {list,article,status,coverage,sync,async close(){closing=true;abort.abort();if(active)await active;}};
}
