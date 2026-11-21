import {createServer} from 'node:http';
import {mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {createApplication} from '../application.mjs';

const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/image-generation');
const dir=await mkdtemp(join(tmpdir(),'gzh-images-'));
const png='iVBORw0KGgoAAAANSUhEUgAAACAAAAAUCAIAAABj86gYAAAALklEQVR4nGNUzfRnoCVgoqnpDKMWEAFG44AgGA0igmA0iAiC0SAiCEaDiIEQAAAobQEF5bk+1gAAAABJRU5ErkJggg==';
const source='# 周末的工作台\n\n## 河边的一天\n\n'+('走了一段安静的河岸，拍下树影和水面。想用一张照片呈现当时的光线。').repeat(18);
const imageOrigin='https://images.example.test',cdnOrigin='https://cdn.example.test';
let app,server,browser;
const calls=[],errors=[];
try{
 await mkdir(out,{recursive:true});
 server=createServer((req,res)=>app.handle(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 app=await createApplication({dataDir:dir,staticDir:join(root,'app/dist'),publicUrl:base,config:{NODE_ENV:'production'}});
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});page.setDefaultTimeout(15000);
 await page.setRequestInterception(true);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{
  const {origin,pathname}=new URL(request.url());
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'POST, GET, OPTIONS'};
  if([imageOrigin,cdnOrigin].includes(origin)&&request.method()==='OPTIONS'){void request.respond({status:204,headers:cors});return;}
  if(origin===imageOrigin&&pathname==='/v1/images/generations'){
   calls.push({path:pathname,authorization:request.headers().authorization,body:JSON.parse(request.postData())});
   void request.respond({status:200,headers:cors,contentType:'application/json',body:JSON.stringify({data:[{b64_json:png}]})});return;
  }
  if(origin===cdnOrigin&&pathname==='/upload'){
   calls.push({path:pathname});
   void request.respond({status:200,headers:cors,contentType:'application/json',body:JSON.stringify({data:{url:cdnOrigin+'/article.jpg'}})});return;
  }
  if(origin===cdnOrigin&&pathname==='/article.jpg'){
   void request.respond({status:200,headers:cors,contentType:'image/png',body:Buffer.from(png,'base64')});return;
  }
  if(origin===base||/^(blob:|data:)/.test(request.url()))void request.continue();else void request.abort();
 });
 const click=async(label,within='body')=>{
  const handle=(await page.evaluateHandle((text,selector)=>[...document.querySelector(selector).querySelectorAll('button')].find(el=>el.textContent.trim()===text),label,within)).asElement();
  assert.ok(handle,`Missing button: ${label}`);
  await handle.click();
 };
 const fill=async(selector,value)=>page.$eval(selector,(element,text)=>{
  Object.getOwnPropertyDescriptor(element.constructor.prototype,'value').set.call(element,text);
  element.dispatchEvent(new Event('input',{bubbles:true}));
 },value);
 await page.goto(base,{waitUntil:'domcontentloaded'});
 const editor='textarea[aria-label="Markdown 正文"]';
 await page.waitForSelector(editor);
 await fill(editor,source);
 await page.evaluate(()=>localStorage.setItem('upload_mode','base64'));
 await page.click('.wb-sidebar button[aria-label="工作台设置"]');
 await page.type('#personal-ai-key','fixture-shared-key');
 await page.type('#personal-ai-base',imageOrigin);
 await page.click('dialog details summary');
 await page.type('dialog details input:not([type])','fixture-image');
 await click('保存设置','dialog[open]');
 await page.click('[data-action="ai-cover"]');
 await page.waitForFunction(()=>[...document.querySelectorAll('h2')].some(heading=>heading.textContent==='AI 封面'));
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='完整长图')),false);
 await page.select('select[aria-label="画面风格"]','photo');
 await click('生成一张封面底图');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='下载横版封面 PNG')||[...document.querySelectorAll('[role="alert"]')].some(alert=>alert.textContent.includes('生图')||alert.textContent.includes('image')));
 assert.ok(await page.evaluate(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='下载横版封面 PNG')),await page.$$eval('[role="alert"]',alerts=>alerts.map(alert=>alert.textContent).join('\n')));
 await page.screenshot({path:join(out,'cover-preview.png')});
 const cdp=await page.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir});
 await click('下载横版封面 PNG');
 const image=await new Promise((resolve,reject)=>{
  let attempts=0;
  const poll=async()=>{
   const name=(await readdir(dir)).find(file=>/^wechat_cover_\d+\.png$/.test(file));
   if(name){resolve(name);return;}
   if(++attempts>50){reject(new Error('Cover PNG was not downloaded'));return;}
   setTimeout(poll,200);
  };
  void poll();
 });
 const data=await readFile(join(dir,image));
 assert.equal(data.readUInt32BE(16),2000);assert.equal(data.readUInt32BE(20),852);
 await writeFile(join(out,'cover-export.png'),data);
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector(editor);
 await fill(editor,source);
 await page.setViewport({width:390,height:844});
 await page.click('[data-action="ai-illustration"]');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='生成场景插图'));
 await click('生成场景插图');
 const modal='dialog[open][aria-label="生成正文插图"]';
 await page.waitForSelector(modal);
 await page.select(modal+' select[aria-label="画面风格"]','custom');
 assert.ok(await page.$(modal+' button[disabled]'));
 await fill(modal+' textarea[maxlength="400"]','灰绿色蜡笔肌理，主体放在右侧');
 await page.screenshot({path:join(out,'inline-style-mobile.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await click('生成一张插图',modal);await page.waitForSelector(modal+' img');
 await click('上传并插入正文',modal);await page.waitForFunction(selector=>document.querySelector(selector)?.textContent.includes('配置图床'),{},modal);
 assert.equal(await page.$eval(editor,el=>el.value),source);
 await page.screenshot({path:join(out,'inline-preview.png')});
 await page.evaluate(cdn=>{localStorage.setItem('upload_mode','custom');localStorage.setItem('cdn_upload_config',JSON.stringify({uploadUrl:cdn+'/upload',responsePath:'data.url'}));},cdnOrigin);
 await click('上传并插入正文',modal);await page.waitForSelector(modal,{hidden:true});
 assert.match(await page.$eval(editor,el=>el.value),/cdn\.example\.test\/article\.jpg/);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(url=>[...document.querySelectorAll('img')].some(img=>img.src===url&&img.naturalWidth>0),{},cdnOrigin+'/article.jpg');
 await click('AI 工具');await click('撤销：插入 AI 插图');
 assert.equal(await page.$eval(editor,el=>el.value),source);
 assert.equal(calls.filter(call=>call.path==='/upload').length,1);
 assert.equal(calls.filter(call=>call.authorization==='Bearer fixture-shared-key'&&call.body.model==='fixture-image'&&call.body.n===1).length,2);
 assert.match(calls[0].body.prompt,/横版封面背景[\s\S]*自然光、真实材质/);
 assert.match(calls[1].body.prompt,/横版正文插图[\s\S]*画面风格：灰绿色蜡笔肌理，主体放在右侧/);
 assert.deepEqual(errors,[]);
 console.log('PASS: direct AI cover and illustration entries, preset and custom styles, cover export, CDN insertion and undo. No real image requests.');
}finally{
 if(browser)await browser.close();
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 if(app)await app.close();
 await rm(dir,{recursive:true,force:true});
}
