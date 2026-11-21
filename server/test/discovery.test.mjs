import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../application.mjs';

test('persistent library, zero read-through, bounded admin sync and isolated topics/briefs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gzh-redfox-'));let app,server,base,calls=0;
 const fixture={photoId:'article1',title:'测试 AI 文章',userName:'样本账号',accountId:'sample',oriUrl:'https://mp.weixin.qq.com/s?__biz=test&mid=1&idx=1',clicksCount:'10w+',fans:null,content:'这是一段用于测试的文章正文。',publicTime:'2026-11-12 12:00:00'};
 const options={dataDir:dir,staticDir:dir,publicUrl:'https://editor.example.test',config:{NODE_ENV:'development',ENABLE_PHASE2:'1',REDFOX_API_KEY:'test-secret',REDFOX_DAILY_REQUEST_LIMIT:'2',REDFOX_SYNC_COOLDOWN_SECONDS:'0'},redfoxFetch:async()=>{calls++;return Response.json({code:2000,data:[fixture]});}};
 const start=async()=>{app=await createApplication(options);server=createServer(app.handle);await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;};
 const stop=async()=>{await new Promise(r=>server.close(r));await app.close();server=null;app=null;};
 const api=async(path,token,body,method=body?'POST':'GET')=>{const r=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 try{
  await start();assert.equal((await api('/api/discovery/articles')).status,401);
  const first=(await api('/api/auth/register',null,{email:'owner@example.test',password:'Strong-test123'})).data;
  const other=(await api('/api/auth/register',null,{email:'other@example.test',password:'Strong-test123'})).data;
  const jobInput={source:'original',category:'科技数码',startDate:'2026-11-12',endDate:'2026-11-12'};
  assert.equal((await api('/api/discovery/sync',first.token,jobInput)).status,403);
  assert.equal((await api('/api/discovery/articles?q=missing',first.token)).data.items.length,0);assert.equal(calls,0);
  await app.db.prepare("UPDATE users SET role='admin' WHERE id=?").bind(first.user.id).run();
  const sync=await api('/api/discovery/sync',first.token,jobInput);assert.equal(sync.status,202,JSON.stringify(sync.data));
  let job;for(let i=0;i<80;i++){job=(await api('/api/discovery/status',first.token)).data.jobs[0];if(job?.status==='completed')break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(job.status,'completed',JSON.stringify(job));assert.equal(calls,1);
  const list=(await api('/api/discovery/articles?category='+encodeURIComponent('科技数码'),first.token)).data;
  assert.equal(list.items.length,1);assert.equal(list.items[0].readExact,false);assert.equal(list.items[0].fans,undefined);assert.equal(list.items[0].content,undefined);
  const id=list.items[0].id;
  assert.equal((await api('/api/discovery/articles/'+id,first.token)).data.article.content,fixture.content);
  assert.equal((await api('/api/discovery/articles?q=%25',first.token)).data.items.length,0);
  assert.equal((await api('/api/discovery/articles?cursor=garbage',first.token)).status,400);assert.equal(calls,1);
  const topic=(await api('/api/topics',first.token,{articleId:id})).data.topic;
  assert.equal((await api('/api/discovery/articles?content=present',first.token)).data.items[0].savedTopicId,topic.id);
  assert.equal((await api('/api/discovery/articles/'+id,first.token)).data.article.savedTopicId,topic.id);
  assert.equal((await api('/api/discovery/articles?content=present',other.token)).data.items[0].savedTopicId,null);
  assert.equal((await api('/api/discovery/articles/'+id,other.token)).data.article.savedTopicId,null);
  assert.equal((await api('/api/discovery/articles?content=invalid',first.token)).status,400);
  assert.equal((await api('/api/topics',first.token,{articleId:id})).data.topic.id,topic.id);
  const manual=(await api('/api/topics',first.token,{title:'额外参考'})).data.topic;
  assert.equal((await api('/api/topics/'+manual.id+'/sources',first.token,{articleId:id,revision:manual.revision})).status,200);
  assert.equal((await api('/api/topics/'+manual.id,first.token)).data.sources.length,1);
  assert.equal((await api('/api/topics/'+manual.id+'/sources',other.token,{articleId:id,revision:1},'DELETE')).status,404);
  assert.equal((await api('/api/topics/'+manual.id+'/sources',first.token,{articleId:id,revision:1},'DELETE')).status,200);
  assert.equal((await api('/api/topics/'+manual.id,first.token)).data.sources.length,0);
  assert.equal((await api('/api/topics/'+topic.id,other.token)).status,404);
  assert.equal((await api('/api/topics/'+topic.id,other.token,{title:'stolen',revision:0},'PATCH')).status,404);
  const saved=await api('/api/topics/'+topic.id,first.token,{title:'自己的选题',angle:'讨论工具的真实限制',audience:'公众号作者',notes:'我自己的使用材料',revision:topic.revision},'PATCH');
  assert.equal(saved.status,200);
  assert.equal((await api('/api/topics/'+topic.id,first.token,{title:'stale',revision:topic.revision},'PATCH')).status,409);
  const brief=await api('/api/topics/'+topic.id+'/briefs',first.token,{markdown:'# 原创简报\n\n自己的角度',revision:saved.data.topic.revision});
  assert.equal(brief.status,201);assert.match(brief.data.brief.markdown,/自己的角度/);
  const historyPath='/api/topics/'+topic.id+'/briefs';
  const history=await api(historyPath,first.token);
  assert.equal(history.data.versions[0].id,brief.data.brief.id);
  assert.equal(Object.hasOwn(history.data.versions[0],'markdown'),false);
  assert.equal((await api(historyPath,other.token)).status,404);
  assert.equal((await api(historyPath+'?version='+brief.data.brief.id,other.token)).status,404);
  assert.equal((await api(historyPath+'?version='+brief.data.brief.id,first.token)).data.brief.markdown,brief.data.brief.markdown);
  assert.equal((await api(historyPath+'/generate',first.token,{revision:brief.data.topic.revision})).status,404);
  const personal={markdown:'# 个人 API 简报',model:'personal-model',revision:brief.data.topic.revision};
  assert.equal((await api(historyPath,other.token,personal)).status,404);
  const generated=await api(historyPath,first.token,personal);
  assert.equal(generated.status,201);
  assert.equal(generated.data.brief.kind,'model');assert.equal(generated.data.brief.model,personal.model);
  assert.equal((await api(historyPath,first.token,personal)).status,409);
  await stop();await start();
  assert.equal((await api('/api/discovery/articles',first.token)).data.items.length,1);
  assert.equal((await api('/api/topics/'+topic.id,first.token)).data.brief.markdown,personal.markdown);assert.equal(calls,1);
  fixture.content='';
  for(let n=0;n<2;n++){
   const r=await api('/api/discovery/sync',first.token,jobInput);
   assert.equal(r.status,n===0?202:429,JSON.stringify(r.data));
   if(n===0){for(let i=0;i<80;i++){const j=(await api('/api/discovery/status',first.token)).data.jobs[0];if(j?.status==='completed')break;await new Promise(r=>setTimeout(r,10));}}
  }
  assert.equal(calls,2);assert.equal((await api('/api/discovery/articles',first.token)).data.items.length,1);
  assert.ok((await api('/api/discovery/articles/'+id,first.token)).data.article.content.length>0);
  delete options.config.REDFOX_API_KEY;
  assert.equal((await api('/api/discovery/status',first.token)).data.configured,false);
  assert.equal((await api('/api/discovery/articles?sort=reads',first.token)).data.items.length,1);
  assert.equal((await api('/api/discovery/articles/missing',first.token)).status,404);
  assert.equal((await api('/api/discovery/sync',first.token,jobInput)).status,503);
  assert.equal(calls,2);
 }finally{if(server)await stop();await rm(dir,{recursive:true,force:true});}
});
