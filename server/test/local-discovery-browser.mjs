// Browser QA on a disposable real-library copy. No credentials or paid requests.
import {createServer} from 'node:http';
import {mkdtemp,copyFile,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {createApplication} from '../application.mjs';
import {createPhaseTwoFrontend} from './phase-two-frontend.mjs';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/local-discovery');
const dir=await mkdtemp(join(tmpdir(),'gzh-local-browser-'));let frontend,app,browser,server,calls=0;const errors=[];
try{
 await mkdir(out,{recursive:true});await copyFile(join(root,'server/data/gzh.sqlite'),join(dir,'gzh.sqlite'));
 frontend=await createPhaseTwoFrontend(root);server=createServer((req,res)=>frontend.handle(req,res,app));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 app=await createApplication({dataDir:dir,staticDir:join(root,'app/dist'),publicUrl:base,config:{ENABLE_PHASE2:'1',NODE_ENV:'development',LOCAL_DISCOVERY_DEBUG:'1'},redfoxFetch:async()=>{calls++;throw Error('Provider disabled');}});
 browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 const modelCalls=[],topicWrites=[];
 let modelFails=false;
 await page.setRequestInterception(true);
 page.on('request',request=>{
  const path=new URL(request.url()).pathname;
  if(path==='/__ai-proxy'){
   const payload=JSON.parse(request.postData());
   modelCalls.push(payload);
   const prompt=payload.payload.messages[0].content;
   const markdown=prompt.startsWith('写两个不同')
    ? JSON.stringify(['先说结论，再看实测。','碰到这个问题时，先检查这一项。'])
    : prompt.startsWith('写一篇完整')
      ? '# 从实测说起\n\n## 先核对适用范围\n\n以下是初稿正文。缺少数据的地方待核验。'
      : '# 本地调测简报\n\n## 提纲\n\n结合自己的实测笔记逐节说明适用的读者、具体问题和限制，并单独检查引用来源。';
   void request.respond({status:modelFails?401:200,contentType:'application/json',body:JSON.stringify(modelFails?{error:{message:'private-test-key upstream error'}}:{choices:[{message:{content:markdown}}]})});
   return;
  }
  if(path.startsWith('/api/topics')&&request.postData())topicWrites.push(request.postData());
  void request.continue();
 });
 await page.setViewport({width:1500,height:1100});await page.goto(base+'/',{waitUntil:'networkidle0'});
 await page.click('button[aria-label="工作台设置"]');await page.waitForSelector('select[aria-label="调试身份"]');
 await page.select('select[aria-label="调试身份"]','vip');
 await page.click('button[aria-label="关闭工作台设置"]');
 await page.goto(base+'/discovery',{waitUntil:'networkidle0'});
 await page.waitForSelector('.rf-article');
 assert.equal(await page.evaluate(()=>localStorage.getItem('auth_token')),null);
 assert.match(await page.$eval('main',e=>e.textContent),/本地免登录调测/);
 await page.click('button[aria-label="工作台设置"]');await page.waitForSelector('select[aria-label="调试身份"]');
 assert.equal(await page.$eval('select[aria-label="调试身份"]',e=>e.value),'vip');
 await page.waitForSelector('dialog[open] #personal-ai-model');
 for(const label of ['图片上传','AI 配置']){
  await page.evaluate(text=>Array.from(document.querySelectorAll('dialog[open] button')).find(button=>button.textContent.trim()===text).click(),label);
  if(label==='图片上传')await page.waitForFunction(()=>document.querySelector('dialog[open]')?.textContent.includes('上传模式'));
 }
 await page.type('#personal-ai-model','shared-settings-fixture');
 await page.select('select[aria-label="调试身份"]','guest');
 await page.waitForFunction(()=>document.querySelectorAll('.rf-article').length===0&&document.body.textContent.includes('登录，打开你的创作资料库'));
 await page.select('select[aria-label="调试身份"]','admin');await page.waitForSelector('.rf-article');
 assert.equal(await page.evaluate(()=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent.includes('采集入库'))),false);
 await page.screenshot({path:join(out,'identity-settings.png')});
 await page.select('select[aria-label="调试身份"]','vip');await page.waitForSelector('.rf-article');
 await page.select('select[aria-label="调试身份"]','free');await page.waitForSelector('.rf-article');
 await page.evaluate(()=>Array.from(document.querySelectorAll('dialog[open] button')).find(button=>button.textContent.trim()==='保存设置').click());
 await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('.rf-article');
 await page.screenshot({path:join(out,'discovery-desktop.png')});
 await page.click('.rf-title');await page.waitForSelector('dialog[open] .rf-original');
 const collect=await page.$$('dialog button');for(const b of collect){if((await b.evaluate(e=>e.textContent)).includes('收藏为选题')){await b.click();break;}}
 await page.waitForFunction(()=>document.body.textContent.includes('已加入我的选题'));
 await page.goto(base+'/topics',{waitUntil:'networkidle0'});await page.waitForSelector('.rf-topic-card');await page.click('.rf-topic-card');await page.waitForSelector('.rf-brief-editor');
 const freeTopicUrl=page.url();
 await page.evaluate(()=>Array.from(document.querySelectorAll('dialog button')).find(button=>button.textContent.trim()==='AI 原创简报').click());
 await page.waitForSelector('#personal-ai-key');
 assert.equal(modelCalls.length,0);
 await page.keyboard.press('Escape');await page.waitForSelector('#personal-ai-key',{hidden:true});
 await page.$eval('.rf-sources',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:join(out,'topic-sources-desktop.png')});
 await page.setViewport({width:390,height:1000});await page.$eval('.rf-sources',e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:join(out,'topic-sources-mobile.png')});
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('dialog[open]')].some(e=>e.scrollWidth>e.clientWidth)),false);
 await page.setViewport({width:1500,height:1100});
 await page.$eval('dialog textarea[maxlength="15000"]',e=>{const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(e,'本地免登录保存测试');e.dispatchEvent(new Event('input',{bubbles:true}));});
 const buttons=await page.$$('dialog button');for(const b of buttons){if((await b.evaluate(e=>e.textContent)).includes('保存选题与简报')){ // Add a brief before saving.
   await page.$eval('.rf-brief-editor',e=>{const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(e,'# 本地调测简报');e.dispatchEvent(new Event('input',{bubbles:true}));});await b.click();break;
 }}
 await page.waitForFunction(()=>document.body.textContent.includes('选题和简报已保存'));
 await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('.rf-brief-editor');
 assert.equal(await page.$eval('dialog textarea[maxlength="15000"]',e=>e.value),'本地免登录保存测试');
 const clickButton=async text=>{
  const handle=await page.evaluateHandle(label=>Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===label),text);
  const button=handle.asElement();assert.ok(button,`Missing button: ${text}`);await button.click();await handle.dispose();
 };
 await clickButton('AI 原创简报');
 await page.waitForSelector('#personal-ai-key');
 await page.type('#personal-ai-key','private-test-key');
 await page.type('#personal-ai-base','https://local-ai-fixture.example.test/v1');
 await clickButton('保存设置');
 const fill=async(selector,value)=>page.$eval(selector,(e,v)=>{Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);
 await fill('dialog textarea[maxlength="2000"]','比较我的实测限制');
 await fill('dialog input[maxlength="500"]','公众号作者');
 modelFails=true;
 await clickButton('AI 原创简报');
 await page.waitForFunction(()=>document.querySelector('dialog [role="alert"]')?.textContent.includes('HTTP 401'));
 assert.equal(await page.$eval('dialog [role="alert"]',e=>e.textContent.includes('private-test-key')),false);
 assert.equal(await page.$eval('.rf-brief-editor',e=>e.value),'# 本地调测简报');
 modelFails=false;
 await clickButton('AI 原创简报');
 await page.waitForFunction(()=>document.body.textContent.includes('AI 简报已保存为新版本'));
 assert.equal(modelCalls.length,2);
 assert.equal(modelCalls[1].endpoint,'https://local-ai-fixture.example.test/v1/chat/completions');
 assert.equal(modelCalls[1].headers.Authorization,'Bearer private-test-key');
 assert.equal(modelCalls[1].payload.model,'shared-settings-fixture');
 assert.match(modelCalls[1].payload.messages[1].content,/比较我的实测限制/);
 assert.ok(topicWrites.some(payload=>JSON.parse(payload).model==='shared-settings-fixture'));
 assert.ok(topicWrites.every(payload=>!payload.includes('private-test-key')&&!payload.includes('local-ai-fixture.example.test')));
 await page.screenshot({path:join(out,'personal-ai-brief.png')});
 await clickButton('带入文章排版');await page.waitForSelector('dialog[aria-label="预览带入排版"]');
 await clickButton('保存并进入排版');await page.waitForSelector('textarea[aria-label="Markdown 正文"]');
 assert.match(await page.$eval('textarea[aria-label="Markdown 正文"]',element=>element.value),/本地调测简报/);
 const freeDraftUrl=page.url();
 const articleEditor='textarea[aria-label="Markdown 正文"]';
 const originalDraft=await page.$eval(articleEditor,element=>element.value);
 await page.click('.wb-topic-draft a');
 await page.waitForSelector('.rf-brief-editor');
 await clickButton('用简报写初稿');
 const writing='dialog[open][aria-label="用简报写初稿"]';
 await page.waitForSelector(writing);
 assert.equal(await page.$eval(writing+' select',element=>element.value),'luobo');
 await clickButton('试写两个开头');
 await page.waitForFunction(()=>document.body.textContent.includes('采用开头 2'));
 await clickButton('采用开头 2');
 const opening=await page.$eval(writing+' textarea[maxlength="1000"]',element=>element.value);
 await clickButton('生成完整初稿');
 const candidate=writing+' textarea[maxlength="40000"]';
 await page.waitForSelector(candidate);
 assert.match(await page.$eval(candidate,element=>element.value),/碰到这个问题时，先检查这一项/);
 assert.equal(JSON.parse(modelCalls.at(-1).payload.messages[1].content).opening,opening);
 assert.match(modelCalls.at(-1).payload.messages[0].content,/小标题说出观点/);
 await page.$eval(candidate,element=>{element.selectionStart=0;element.selectionEnd=8;});
 await clickButton('将选中文字存为口吻参考');
 await page.waitForFunction(()=>document.body.textContent.includes('已保存为本机口吻参考'));
 await page.$eval(candidate,element=>element.scrollIntoView({block:'center'}));
 await page.screenshot({path:join(out,'ai-article-draft.png')});
 await clickButton('采用并继续写作');
 await page.waitForSelector('dialog[open][aria-label="采用初稿并替换选题草稿？"]');
 await page.keyboard.press('Escape');
 await page.waitForSelector('dialog[open][aria-label="采用初稿并替换选题草稿？"]',{hidden:true});
 assert.ok(await page.$(candidate));
 await clickButton('采用并继续写作');await clickButton('采用并替换');
 await page.waitForSelector(articleEditor);
 assert.match(await page.$eval(articleEditor,element=>element.value),/从实测说起/);
 await clickButton('AI 工具');await clickButton('撤销：采用 AI 初稿');
 assert.equal(await page.$eval(articleEditor,element=>element.value),originalDraft);
 await page.click('button[aria-label="工作台设置"]');await page.waitForSelector('dialog[open] #personal-ai-model');
 assert.equal(await page.$eval('#personal-ai-model',input=>input.value),'shared-settings-fixture');
 await page.keyboard.press('Escape');await page.waitForSelector('#personal-ai-model',{hidden:true});
 await page.evaluate(()=>localStorage.setItem('dev_identity_role','vip'));
 await page.goto(freeDraftUrl,{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>location.search==='');
 assert.doesNotMatch(await page.$eval('textarea[aria-label="Markdown 正文"]',element=>element.value),/本地调测简报/);
 await page.goto(freeTopicUrl,{waitUntil:'networkidle0'});
 await page.waitForSelector('main [role="alert"]');
 assert.equal(await page.$('.rf-brief-editor'),null);
 await page.goto(base+'/discovery',{waitUntil:'networkidle0'});await page.waitForSelector('.rf-article');await page.setViewport({width:390,height:1000});
 await page.screenshot({path:join(out,'discovery-mobile.png')});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);assert.deepEqual(errors,[]);assert.equal(calls,0);
 await page.evaluate(()=>localStorage.setItem('dev_identity_role','guest'));
 await page.goto(base+'/topics',{waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.body.textContent.includes('登录，打开你的创作资料库'));
 assert.equal(await page.evaluate(()=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent.trim()==='新建选题')),false);
 const report={noLogin:true,sharedIdentitySettings:true,guestBlocked:true,adminVipAndFreeBrowse:true,debugAdminCollectionHidden:true,personalAiBrief:true,failedRequestPreservesBrief:true,personalKeyAbsentFromTopicRequests:true,freeTopicPersistsAndImports:true,vipCannotOpenFreeTopic:true,providerRequests:calls,browserErrors:errors,mobileOverflow:overflow,disposableDatabase:true};
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(frontend)await frontend.close();if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));if(app)await app.close();await rm(dir,{recursive:true,force:true});}
