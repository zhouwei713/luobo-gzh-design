import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../storage.mjs';
import {createTopics} from '../topics/repository.mjs';
test('topic search and status counts cover older than 200, paginate stable ties and isolate users',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gzh-topic-list-')),db=openDatabase(join(dir,'db.sqlite'));
 try{
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('owner'),('other')");db.exec(await readFile(new URL('../discovery/schema.sql',import.meta.url),'utf8'));
  await db.batch(Array.from({length:211},(_,i)=>db.prepare('INSERT INTO topics(id,user_id,title,angle,audience,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(String(i).padStart(3,'0'),'owner',i===0?'Old unique 100%':'Topic '+i,'same angle','reader',i===1?'needle notes':'',i%2?'writing':'research','2026-11-01','2026-11-01')));
  await db.prepare("INSERT INTO topics(id,user_id,title,created_at,updated_at) VALUES('private','other','Private needle','now','now')").run();
  const topics=createTopics(db,{article:async()=>null});let query=new URLSearchParams(),page=await topics.list('owner',query);
  assert.equal(page.items.length,30);assert.equal(page.total,211);assert.equal(page.counts.all,211);assert.equal(page.counts.writing,105);assert.ok(page.nextCursor);
  const firstCursor=page.nextCursor,ids=page.items.map(t=>t.id);
  while(page.nextCursor){query=new URLSearchParams({cursor:page.nextCursor});page=await topics.list('owner',query);ids.push(...page.items.map(t=>t.id));}
  assert.equal(ids.length,211);assert.equal(new Set(ids).size,211);assert.equal(ids.at(-1),'000');
  page=await topics.list('owner',new URLSearchParams({q:'100%'}));assert.equal(page.total,1);assert.equal(page.items[0].id,'000');
  page=await topics.list('owner',new URLSearchParams({q:'needle',status:'writing'}));assert.equal(page.items.length,1);assert.equal(page.items[0].id,'001');assert.equal(page.counts.all,1);
  assert.equal((await topics.list('owner',new URLSearchParams({q:'Private'}))).total,0);
  assert.deepEqual((await topics.get('000','owner')).tags,[]);
  await topics.update('000',{revision:0,tags:[' 教程 ','AI 工具','教程'],status:'archived'},'owner');
  await topics.update('private',{revision:0,tags:['私人标签']},'other');
  const tagged=await topics.list('owner',new URLSearchParams({tag:'教程',status:'archived',q:'100%'}));
  assert.equal(tagged.total,1);assert.equal(tagged.counts.archived,1);
  assert.deepEqual(tagged.items[0].tags,['教程','AI 工具']);
  assert.deepEqual(tagged.tags,['AI 工具','教程']);
  assert.equal((await topics.list('other',new URLSearchParams({tag:'教程'}))).total,0);
  await assert.rejects(topics.list('owner',new URLSearchParams({tag:'教程',cursor:firstCursor})),e=>e.status===400);
  await assert.rejects(topics.update('000',{revision:1,tags:['x'.repeat(21)]},'owner'),e=>e.status===400);
  assert.equal((await topics.update('000',{revision:1,status:'research'},'owner')).topic.status,'research');
  for(const query of [{status:'bad'},{cursor:'bad'},{q:'different',cursor:firstCursor},{limit:'0'}])await assert.rejects(topics.list('owner',new URLSearchParams(query)),e=>e.status===400);
  await assert.rejects(topics.list('other',new URLSearchParams({cursor:firstCursor})),e=>e.status===400);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
