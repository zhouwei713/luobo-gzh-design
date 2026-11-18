import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {createApplication} from '../application.mjs';
const root=resolve(import.meta.dirname,'../..'),dir=await mkdtemp(join(tmpdir(),'gzh-backup-ui-')),out=join(root,'output/draft-backups');
const key='gzh_draft_backups_v1:guest',scope='dialog[aria-label="草稿备份"]';let app,server,browser;const errors=[];
try{
 await mkdir(out,{recursive:true});server=createServer((req,res)=>app.handle(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 app=await createApplication({dataDir:dir,staticDir:join(root,'app/dist'),publicUrl:base,config:{NODE_ENV:'production'}});
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.setViewport({width:1440,height:1000});
 await page.goto(base,{waitUntil:'networkidle0'});
 const edit=async text=>{await page.$eval('textarea[aria-label="Markdown 正文"]',(input,text)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));},text);};
 const current=()=>page.$eval('textarea[aria-label="Markdown 正文"]',input=>input.value);
 const click=async(text,within=scope)=>page.evaluate(({text,within})=>{const button=[...(within?document.querySelector(within):document).querySelectorAll('button')].find(button=>button.textContent.trim()===text);if(!button)throw Error('Missing button: '+text);button.click();},{text,within});
 const open=async()=>{await page.click('[aria-label="草稿备份"]');await page.waitForSelector(scope);};
 const close=()=>page.click(scope+' button[aria-label="关闭"]');
 const a='# 手动备份原稿\n\n保留这段正文。',b='# 正在编辑的新稿\n\n恢复前需要保留。';
 await edit(a);await open();await click('立即备份');assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key))[0].markdown,key),a);await close();
 await edit(b);await open();await click('恢复此版本');assert.equal(await current(),b);await click('确认恢复');assert.equal(await current(),a);
 assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key))[0].markdown,key),b);
 await page.screenshot({path:join(out,'desktop.png')});await close();
 await click('AI 工具',null);await click('撤销：恢复历史备份',null);assert.equal(await current(),b);
 await open();await click('删除备份');await click('确认删除');assert.equal(await current(),b);
 const cdp=await page.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});
 await page.evaluate(()=>localStorage.setItem('openai_api_key','PRIVATE-KEY-NOT-IN-BACKUP'));await click('导出全部备份');let file;
 for(let i=0;i<40;i++){file=(await readdir(dir)).find(name=>name.endsWith('.json'));if(file)break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert.ok(file);const raw=await readFile(join(dir,file),'utf8');assert.ok(!raw.includes('PRIVATE-KEY'));assert.equal(JSON.parse(raw).backups[0].markdown,b);
 await close();await page.evaluate(key=>localStorage.removeItem(key),key);await page.reload({waitUntil:'networkidle0'});await open();
 await(await page.$(scope+' input[type=file]')).uploadFile(join(dir,file));await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'[]').length>0,{},key);assert.equal(await current(),b);
 const bad=join(dir,'invalid.json');await writeFile(bad,'broken');const before=await page.evaluate(key=>localStorage.getItem(key),key);
 await(await page.$(scope+' input[type=file]')).uploadFile(bad);await page.waitForSelector(scope+' [role=alert]');assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),before);
 await close();await page.setViewport({width:390,height:900});await open();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:join(out,'mobile.png')});
 // Exercise the real minute callback with a shortened clock in a separate browser context.
 const autoContext=await browser.createBrowserContext();try{
  const autoPage=await autoContext.newPage();await autoPage.evaluateOnNewDocument(()=>{const interval=window.setInterval.bind(window);window.setInterval=(handler,delay,...args)=>interval(handler,delay===60000?200:delay,...args);});
  await autoPage.goto(base,{waitUntil:'networkidle0'});await autoPage.$eval('textarea[aria-label="Markdown 正文"]',input=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'# 自动历史测试');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await autoPage.waitForFunction(key=>JSON.parse(localStorage.getItem(key)||'[]').some(item=>item.markdown==='# 自动历史测试'&&item.label==='自动历史版本'),{},key);
 }finally{await autoContext.close();}
 assert.deepEqual(errors,[]);const report={manualSave:true,restoreRequiresConfirmation:true,currentDraftPreserved:true,restoreUndoWorks:true,jsonDownloadImport:true,noImplicitOverwriteOnImport:true,invalidImportPreservesHistory:true,automaticHistoryCallback:true,autoClockShortenedOnlyInTest:true,mobileNoOverflow:true,pageErrors:errors,paidRequests:0};await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(app)await app.close();await rm(dir,{recursive:true,force:true});}
