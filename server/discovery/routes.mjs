import {readFile} from 'node:fs/promises';
import {authenticateUser} from '../dist/backend.mjs';
import {createLibrary,HttpError} from './library.mjs';
import {createTopics} from '../topics/repository.mjs';
export async function createDiscovery(db,env,config,fetcher){
 db.exec(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
 const {results:topicColumns}=await db.prepare('PRAGMA table_info(topics)').all();
 if(!topicColumns.some(column=>column.name==='tags_json')){
  db.exec("ALTER TABLE topics ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'");
 }
 const library=createLibrary(db,config,fetcher),topics=createTopics(db,library);
 const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 const body=async(request)=>{const text=await request.text();if(text.length>60000)throw new HttpError(413,'输入内容过长');try{const value=JSON.parse(text);if(!value||Array.isArray(value)||typeof value!=='object')throw 0;return value;}catch{throw new HttpError(400,'请求内容格式无效');}};
 const localUsersReady=new Map();
 return {close:library.close,async fetch(request,{localDebug=false}={}){
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/discovery/')&&path!=='/api/topics'&&!path.startsWith('/api/topics/'))return null;
  try{
   let user=await authenticateUser(request,env);
   const debug=localDebug&&!user;
   const role=request.headers.get('X-Local-Discovery-Role')||'free';
   if(debug&&['free','vip','admin'].includes(role)){
    const localUser={id:role==='free'?'local-discovery-debug':`local-discovery-debug-${role}`,email:`本地调测 · ${role}`,role};
    if(!localUsersReady.has(role))localUsersReady.set(role,db.prepare('INSERT OR IGNORE INTO users(id,email,password_hash,role) VALUES(?,?,?,?)').bind(localUser.id,`${localUser.id}@localhost.invalid`,'!local-debug-no-password',role).run().catch(e=>{localUsersReady.delete(role);throw e;}));
    await localUsersReady.get(role);user=localUser;
   }
   if(debug&&path==='/api/discovery/local-session'&&request.method==='GET')return json({user:user||null,localDebug:true});
   if(!user)throw new HttpError(401,'请先登录后使用爆文文章库');
   if(path==='/api/discovery/local-session'&&request.method==='GET')return json({user:null,localDebug:false});
   if(debug&&path==='/api/discovery/sync')throw new HttpError(403,'本地免登录调测不调用付费服务，请登录后操作');
   const admin=user.role==='admin',method=request.method;
   if(path==='/api/discovery/status'&&method==='GET'){const status=await library.status(admin);return json(debug?{...status,canSync:false}:status);}
   if(path==='/api/discovery/articles'&&method==='GET')return json(await library.list(url.searchParams,user.id));
   if(path==='/api/discovery/coverage'&&method==='GET')return json(await library.coverage(Object.fromEntries(url.searchParams)));
   if(path==='/api/discovery/sync'&&method==='POST'){if(!admin)throw new HttpError(403,'只有管理员可以采集数据');return json(await library.sync(await body(request)),202);}
   if(path.startsWith('/api/discovery/articles/')&&method==='GET'){const article=await library.article(decodeURIComponent(path.slice('/api/discovery/articles/'.length)),user.id);if(!article)throw new HttpError(404,'文章尚未入库');return json({article});}
   if(path==='/api/topics'&&method==='GET')return json(await topics.list(user.id,url.searchParams));
   if(path==='/api/topics'&&method==='POST')return json(await topics.create(await body(request),user.id),201);
   const match=/^\/api\/topics\/([\w-]+)(\/(?:briefs|sources))?$/.exec(path);
   if(match){const [,id,suffix]=match;
    if(!suffix&&method==='GET')return json(await topics.detail(id,user.id));
    if(!suffix&&method==='PATCH')return json(await topics.update(id,await body(request),user.id));
    if(suffix==='/sources'&&method==='POST')return json(await topics.attachSource(id,await body(request),user.id));
    if(suffix==='/sources'&&method==='DELETE')return json(await topics.removeSource(id,await body(request),user.id));
    if(suffix==='/briefs'&&method==='POST')return json(await topics.saveBrief(id,await body(request),user.id),201);
    if(suffix==='/briefs'&&method==='GET')return json(await topics.briefHistory(id,user.id,url.searchParams.get('version')));
   }
   throw new HttpError(404,'接口不存在');
  }catch(e){return json({error:e.status?e.message:'请求失败，请稍后重试'},e.status??500);}
 }};
}
