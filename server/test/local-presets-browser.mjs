import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {createApplication} from '../application.mjs';

const root=resolve(import.meta.dirname,'../..'),dir=await mkdtemp(join(tmpdir(),'gzh-presets-')),out=join(root,'output/local-presets');
const key='wechat_custom_style_schemes_v1',scope='[aria-label="排版方案库"]';
let app,server,browser;const errors=[],requests=[];
try{
 await mkdir(out,{recursive:true});
 server=createServer((req,res)=>app.handle(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 app=await createApplication({dataDir:dir,staticDir:join(root,'app/dist'),publicUrl:base,config:{NODE_ENV:'production'}});
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage();page.setDefaultTimeout(15000);await page.setViewport({width:1440,height:1000});
 await page.setRequestInterception(true);
 page.on('request',request=>{if(request.url().startsWith(base)||request.url().startsWith('data:')||request.url().startsWith('blob:'))void request.continue();else void request.abort();});
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(new URL(request.url()).pathname));
 await page.goto(base,{waitUntil:'networkidle0'});
 const initialJs=[...new Set(requests.filter(path=>path.endsWith('.js')))];
 assert.ok(initialJs.length>0);assert.ok(!initialJs.some(path=>/ImageExportPanel|VideoCompareView|IllustrationPlanModal|IllustrationJobPanel/.test(path)));
 let bytes=0,gzipBytes=0;for(const path of initialJs){const data=await readFile(join(root,'app/dist',path));bytes+=data.length;gzipBytes+=gzipSync(data,{level:9}).length;}
 const click=async(text,within=scope)=>page.evaluate(({text,within})=>{const root=within?document.querySelector(within):document;const button=[...root.querySelectorAll('button')].find(button=>button.textContent.trim()===text);if(!button)throw Error('Missing button '+text);button.click();},{text,within});
 const fill=async(selector,value)=>page.$eval(selector,(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));},value);
 const saved=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),key);
 assert.equal((await page.$$('[aria-label="排版方案"]')).length,1);
 assert.ok(await page.$('.wb-toolbar [aria-label="排版方案"]'));
 assert.equal(await page.$('.wb-preview-settings [aria-label="排版方案"]'),null);
 await page.click('[aria-label="排版方案"]');await page.waitForSelector(scope);
 assert.equal((await page.$$(scope+' button[aria-label^="应用方案 "]')).length,6);
 await page.click('[aria-label="排版方案"]');
 const open=async()=>{if(!await page.$(scope))await page.click('[aria-label="排版方案"]');await page.waitForSelector(scope);await page.evaluate(scope=>[...document.querySelector(scope).querySelectorAll('button')].find(button=>button.textContent.trim().startsWith('我的方案')).click(),scope);};
 await page.click('[aria-label="调整正文排版"]');
 await fill('.wb-control-popover input[type=range]','18');await page.click('[aria-label="调整正文排版"]');
 await open();await click('保存当前');await fill('[aria-label="方案名称"]','常用教程');await click('创建');
 let presets=await saved();assert.equal(presets.length,1);assert.equal(presets[0].typography.bodySize,18);
 const original=presets[0];
 await page.screenshot({path:join(out,'desktop.png')});
 await page.reload({waitUntil:'networkidle0'});await open();assert.equal((await saved())[0].id,original.id);
 await page.click('[aria-label="应用方案 常用教程"]');
 await page.click('[aria-label="排版方案"]');await page.click('[aria-label="调整正文排版"]');
 assert.equal(await page.$eval('.wb-control-popover input[type=range]',input=>input.value),'18');await page.click('[aria-label="调整正文排版"]');
 await open();await page.click('[aria-label="重命名方案 常用教程"]');await fill('[aria-label="新的预设名称"]','教程排版');await click('确认改名');
 assert.equal((await saved())[0].name,'教程排版');
 // Export through the real download action and import that file again.
 const cdp=await page.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});
 await click('导出');let exported;
 for(let i=0;i<40;i++){exported=(await readdir(dir)).find(name=>name.endsWith('.json'));if(exported)break;await new Promise(resolve=>setTimeout(resolve,100));}
 assert.ok(exported);const exportPath=join(dir,exported),raw=await readFile(exportPath,'utf8');
 assert.ok(!/api_key|auth_token/.test(raw));assert.equal(JSON.parse(raw).schemes[0].typography.bodySize,18);
 const invalid=join(dir,'invalid.json');await writeFile(invalid,'broken json');
 await(await page.$(scope+' input[type=file]')).uploadFile(invalid);
 await page.waitForFunction(()=>document.body.textContent.includes('导入失败'));
 assert.equal((await saved()).length,1);
 await(await page.$(scope+' input[type=file]')).uploadFile(exportPath);await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).length===2,{},key);
 presets=await saved();assert.notEqual(presets[0].id,presets[1].id);
 await page.click(scope+' [aria-label="删除方案 教程排版"]');await click('确认删除');assert.equal((await saved()).length,1);
 const before=JSON.stringify(await saved());
 await page.evaluate(key=>{const original=Storage.prototype.setItem;window.restorePresetWrites=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(name,value){if(name===key)throw Error('Test storage full');return original.call(this,name,value);};},key);
 await click('保存当前');await fill('[aria-label="方案名称"]','不应保存');await click('创建');
 assert.equal(JSON.stringify(await saved()),before);assert.ok(await page.$('[aria-label="方案名称"]'));
 assert.match(await page.$eval('body',body=>body.textContent),/预设未保存/);await page.evaluate(()=>window.restorePresetWrites());
 await page.keyboard.press('Escape');
 await page.evaluate(({key,original})=>localStorage.setItem(key,JSON.stringify(Array.from({length:30},(_,i)=>({...original,id:'custom-capacity-'+i,name:'容量测试'+i})))),{key,original});
 await page.reload({waitUntil:'networkidle0'});await open();await click('保存当前');await fill('[aria-label="方案名称"]','超过上限');await click('创建');
 assert.equal((await saved()).length,30);assert.equal((await saved()).at(-1).name,'容量测试29');
 assert.match(await page.$eval('body',body=>body.textContent),/最多保存30套/);
 await page.evaluate(({key,original})=>localStorage.setItem(key,JSON.stringify([original])),{key,original});await page.reload({waitUntil:'networkidle0'});
 // A deferred heavy module must load only after its tool is opened.
 await page.click('[data-action="image-export"]');await page.waitForFunction(()=>document.body.textContent.includes('图片导出中心'));
 assert.ok(requests.some(path=>/ImageExportPanel/.test(path)));
 await page.reload({waitUntil:'networkidle0'});await page.setViewport({width:390,height:900});await open();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:join(out,'mobile.png')});
 await page.goto(base+'/video-compare',{waitUntil:'networkidle0'});await page.waitForSelector('[aria-label="实时视频对比播放台"]');
 assert.ok(requests.some(path=>/VideoCompareView.*\.js/.test(path)));
 const failureContext=await browser.createBrowserContext();
 try{
  const failurePage=await failureContext.newPage();await failurePage.setRequestInterception(true);
  failurePage.on('request',request=>{if(/ImageExportPanel/.test(request.url()))void request.abort();else void request.continue();});
  await failurePage.goto(base,{waitUntil:'networkidle0'});await failurePage.click('[data-action="image-export"]');
  await failurePage.waitForFunction(()=>document.body.textContent.includes('工具加载失败'));
  await failurePage.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='关闭').click());
  assert.ok(await failurePage.$('textarea[aria-label="Markdown 正文"]'));
 }finally{await failureContext.close();}
 assert.deepEqual(errors,[]);
 assert.ok(!requests.some(path=>/^\/api\/(?:auth|user|admin)/.test(path)));
 const report={initialJs,initialBytes:bytes,initialGzipBytes:gzipBytes,singleToolbarEntry:true,sixFeaturedSchemes:true,guestLocalPresets:true,saveReloadApplyRenameDelete:true,jsonRoundTrip:true,storageFailurePreservesData:true,capacityPreservesExisting:true,invalidImportPreservesData:true,mobileNoOverflow:true,heavyToolsDeferred:true,failedToolCanClose:true,videoLazyRouteWorks:true,pageErrors:errors,paidRequests:0};
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}if(app)await app.close();await rm(dir,{recursive:true,force:true});}
