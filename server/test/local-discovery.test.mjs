import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,get} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../application.mjs';

test('local discovery identity is opt-in, loopback-only, production-disabled and cannot spend quota',async()=>{
 for(const mode of ['local','default','production','public']){
  const dir=await mkdtemp(join(tmpdir(),'gzh-local-'));let app,server,calls=0;
  try{
   server=createServer((req,res)=>app.handle(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
   const base=`http://127.0.0.1:${server.address().port}`;
   const config={ENABLE_PHASE2:'1',NODE_ENV:mode==='production'?'production':'development',LOCAL_DISCOVERY_DEBUG:mode==='default'?'0':'1',REDFOX_API_KEY:'fixture'};
   app=await createApplication({dataDir:dir,staticDir:dir,publicUrl:mode==='public'?'https://editor.example.test':base,config,redfoxFetch:async()=>{calls++;throw Error('No paid calls');}});
   const request=async(path,body,headers={})=>{const r=await fetch(base+path,{headers:{'Content-Type':'application/json',...headers},method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
   const identity=await request('/api/discovery/local-session');
   if(mode!=='local'){assert.equal(identity.status,mode==='production'?404:401);assert.equal((await request('/api/discovery/articles')).status,mode==='production'?404:401);continue;}
   assert.equal(identity.status,200);assert.equal(identity.data.user.id,'local-discovery-debug');
   assert.equal((await request('/api/discovery/articles')).status,200);
   assert.equal((await request('/api/discovery/status')).data.canSync,false);
   const created=await request('/api/topics',{title:'Local topic'});assert.equal(created.status,201);
   assert.equal((await request('/api/topics')).data.items.length,1);
   assert.equal((await request('/api/discovery/sync',{})).status,403);
   assert.equal((await request(`/api/topics/${created.data.topic.id}/briefs/generate`,{revision:0})).status,404);
   assert.equal((await request('/api/discovery/articles',null,{Origin:'https://foreign.example'})).status,401);
   const forged=await new Promise((resolve,reject)=>{get(base+'/api/discovery/articles',{headers:{Host:'foreign.example','X-Forwarded-For':'127.0.0.1'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
   assert.equal(forged,401);
   assert.equal((await request('/api/user/info')).status,401);
   assert.equal(calls,0);
   const guest=await request('/api/discovery/local-session',null,{'X-Local-Discovery-Role':'guest'});
   assert.equal(guest.data.localDebug,true);assert.equal(guest.data.user,null);
   assert.equal((await request('/api/discovery/articles',null,{'X-Local-Discovery-Role':'guest'})).status,401);
   for(const role of ['free','vip','admin']){
    const headers={'X-Local-Discovery-Role':role};
    assert.equal((await request('/api/discovery/local-session',null,headers)).data.user.role,role);
    assert.equal((await request('/api/discovery/articles',null,headers)).status,200);
    assert.equal((await request('/api/discovery/status',null,headers)).data.canSync,false);
    assert.equal((await request('/api/discovery/sync',{},headers)).status,403);
   }
   assert.equal((await request('/api/topics',null,{'X-Local-Discovery-Role':'vip'})).data.items.length,0);
  }finally{if(server)await new Promise(r=>server.close(r));if(app)await app.close();await rm(dir,{recursive:true,force:true});}
 }
});
