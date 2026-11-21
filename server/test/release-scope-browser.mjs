import {createServer} from 'node:http';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {createApplication} from '../application.mjs';

const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/release-scope');
const dir=await mkdtemp(join(tmpdir(),'gzh-release-ui-'));
let app,server,browser;
const errors=[],phaseTwoRequests=[];
try{
 await mkdir(out,{recursive:true});
 server=createServer((request,response)=>app.handle(request,response));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 app=await createApplication({dataDir:dir,staticDir:join(root,'app/dist'),publicUrl:base,config:{NODE_ENV:'production',ENABLE_PHASE2:'1'}});
 const seed=await createApplication({dataDir:dir,staticDir:dir,publicUrl:base});
 const seedServer=createServer(seed.handle);await new Promise(resolve=>seedServer.listen(0,'127.0.0.1',resolve));
 const seedBase=`http://127.0.0.1:${seedServer.address().port}`;
 const auth=await(await fetch(seedBase+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'scope-admin@example.test',password:'Scope-test123'})})).json();
 seedServer.closeAllConnections();await new Promise(resolve=>seedServer.close(resolve));await seed.close();
 await app.db.prepare("UPDATE users SET role='admin' WHERE id=?").bind(auth.user.id).run();auth.user.role='admin';
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const role of ['guest','admin']){
  const context=await browser.createBrowserContext();
  try{
   const page=await context.newPage();page.setDefaultTimeout(12000);await page.setViewport({width:1440,height:1000});
   page.on('pageerror',error=>errors.push(error.message));
   page.on('request',request=>{if(/^\/api\/(articles|discovery|topics|auth|user|admin|feishu)(\/|$)/.test(new URL(request.url()).pathname))phaseTwoRequests.push(request.url());});
   await page.goto(base,{waitUntil:'networkidle0'});
   if(role==='admin'){await page.evaluate(auth=>{localStorage.setItem('auth_token',auth.token);localStorage.setItem('auth_user',JSON.stringify(auth.user));localStorage.setItem('dev_identity_role','admin');},auth);await page.reload({waitUntil:'networkidle0'});}
   const check=async()=>{
    assert.equal(await page.$eval('body',element=>element.textContent.includes('配置与诊断')),false);
    for(const path of ['/articles','/discovery','/topics'])assert.ok(await page.$(`a[href="${path}"]`));
    assert.equal(await page.$$eval('.wb-sidebar .wb-tag',tags=>tags.filter(tag=>tag.textContent==='后续实现').length),3);
    assert.equal(await page.$('.rf-overview,.rf-articles,.articles-content,.article-save-trigger'),null);
   };
   await check();await page.screenshot({path:join(out,role+'-desktop.png')});
   await page.goto(base+'/admin',{waitUntil:'networkidle0'});
   await page.waitForSelector('textarea[aria-label="Markdown 正文"]');
   assert.equal(new URL(page.url()).pathname,'/');
   assert.equal(await page.$eval('body',element=>element.textContent.includes('本地环境诊断')),false);
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='工作台设置')?.click());
   await page.waitForSelector('#personal-ai-key');
   await page.click('button[aria-label="关闭工作台设置"]');
   for(const path of ['/articles','/discovery','/topics','/topics/old-topic','/login','/register','/account']){
    await page.goto(base+path,{waitUntil:'networkidle0'});await page.waitForSelector('.wb-planned-status');assert.equal(new URL(page.url()).pathname,path);await check();assert.equal(await page.$('input[type=password]'),null);
    assert.match(await page.$eval('.wb-planned',element=>element.textContent),/后续实现/);
    if(path==='/login')await page.screenshot({path:join(out,role+'-login-planned.png')});
    if(path==='/articles')await page.screenshot({path:join(out,role+'-articles-planned.png')});
   }
   await page.goto(base+'/discovery',{waitUntil:'domcontentloaded'});
   await page.waitForSelector('.wb-planned-status');
   await page.click('.wb-sidebar button[aria-label="工作台设置"]');
   await page.waitForSelector('dialog[open] #personal-ai-key');
   assert.ok(await page.$('dialog[open] .api-connection-test'));
   assert.equal(new URL(page.url()).pathname,'/discovery');
   await page.keyboard.press('Escape');
   await page.waitForSelector('dialog[open]',{hidden:true});
   await page.goto(base+(role==='admin'?'/account':'/login'),{waitUntil:'networkidle0'});
   if(role==='admin')await check();
   assert.match(await page.$eval('body',element=>element.textContent),/后续开放|后续实现/);
   if(role==='admin')assert.ok(await page.$('a[href="/articles"]'));
   await page.setViewport({width:390,height:900});await page.goto(base,{waitUntil:'networkidle0'});
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='导航')?.click());await check();
   await page.screenshot({path:join(out,role+'-mobile.png')});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }finally{await context.close();}
 }
 assert.deepEqual(errors,[]);assert.deepEqual(phaseTwoRequests,[]);
 const report={productionBuild:true,guestAndAdmin:true,desktopAndMobile:true,plannedNavigationVisible:true,plannedRoutesVisible:true,articleManagementDeferred:true,loginAndAccountCopy:true,automaticDeferredRequests:0,pageErrors:errors,temporaryDatabase:true,paidRequests:0};
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{
 if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(app)await app.close();await rm(dir,{recursive:true,force:true});
}
