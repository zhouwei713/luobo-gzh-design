import {createServer} from 'node:http';
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {createApplication} from '../application.mjs';
const root=resolve(import.meta.dirname,'../..'),out=join(root,'output/wechat-copy'),dir=await mkdtemp(join(tmpdir(),'gzh-wechat-copy-'));
let app,server,browser;const errors=[];
const cardLines=['## 我是谁','','  保留缩进','long_token_'.repeat(24),...Array.from({length:8},(_,i)=>`档案第 ${i+1} 行`)];
const markdown='# 排版验收文章\n\n这是一段**中文加粗**、*斜体*和`行内代码`。\n\n## 标题层级\n\n> 引用第一行。\n> 引用第二行。\n\n- 无序项一\n- 无序项二\n\n1. 有序项一\n2. 有序项二\n\n| 字段 | 内容 |\n| --- | --- |\n| 状态 | 已保存 |\n\n```js\nconst first = 1;\n\n  console.log(first);\n```\n\n![测试图片](/qa-image.png)\n\n[参考链接](https://example.com/reference)\n\n'
 + '<ScrollCard title="员工档案示例" height="140" hint="滑动查看">\n```markdown\n'+cardLines.join('\n')+'\n```\n</ScrollCard>';
try{
 await mkdir(out,{recursive:true});server=createServer((req,res)=>{if(req.url==='/qa-image.png'){res.writeHead(200,{'Content-Type':'image/png'}).end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jwZkAAAAASUVORK5CYII=','base64'));return;}return app.handle(req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 app=await createApplication({dataDir:dir,staticDir:join(root,'app/dist'),publicUrl:base,config:{}});
 browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,protocolTimeout:20000});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1500,height:1100});
 await page.goto(base+'/login',{waitUntil:'networkidle0'});await page.evaluate(text=>localStorage.setItem('gzh_editor_draft',text),markdown);await page.goto(base+'/',{waitUntil:'networkidle0'});await page.waitForSelector('#wechat-article-preview table');
 // Capture the application's own payloads without touching the user's OS clipboard.
 await page.evaluate(()=>{window.__qaPayload={};document.execCommand=()=>false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{const item=items[0];window.__qaPayload={html:await(await item.getType('text/html')).text(),text:await(await item.getType('text/plain')).text()};},writeText:async text=>{window.__qaPayload={text};}}});});
 const clickCopy=()=>page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='复制到公众号').click());await clickCopy();await page.waitForFunction(()=>window.__qaPayload.html);
 const captured=await page.evaluate(()=>window.__qaPayload);assert.match(captured.html,new RegExp(base+'/qa-image.png'),'Exported images must have portable absolute URLs');
 const scrollBody='[data-scroll-card-body]';
 assert.ok(await page.$eval(scrollBody,body=>body.scrollHeight>body.clientHeight&&body.scrollWidth<=body.clientWidth&&!body.querySelector('pre')));
 const pasted=await browser.newPage();
 await pasted.setViewport({width:375,height:640});
 await pasted.setContent('<body style="margin:0">'+captured.html+'</body>',{waitUntil:'domcontentloaded'});
 const copiedCard=await pasted.evaluate(lineCount=>{
  const code=[...document.querySelectorAll('code')].find(node=>node.textContent.includes('我是谁'));
  if(!code)return null;
  const body=code.parentElement.parentElement;
  body.scrollTop=body.scrollHeight;
  return {breaks:code.querySelectorAll('br').length,expected:lineCount-1,indented:code.textContent.includes('\u00a0\u00a0保留缩进'),scrolled:body.scrollTop>0,overflow:body.scrollWidth>body.clientWidth};
 },cardLines.length);
 assert.deepEqual(copiedCard,{breaks:cardLines.length-1,expected:cardLines.length-1,indented:true,scrolled:true,overflow:false});
 const exportedCard=(await pasted.evaluateHandle(()=>[...document.querySelectorAll('code')].find(node=>node.textContent.includes('我是谁'))?.closest('table'))).asElement();
 assert.ok(exportedCard);
 await exportedCard.evaluate(card=>{card.querySelector('code').parentElement.parentElement.scrollTop=0;});
 await exportedCard.screenshot({path:join(out,'scroll-code-mobile.png')});
 await pasted.close();
 assert.match(captured.text,/排版验收文章/);assert.ok(!/<section|<table/.test(captured.text));
 assert.match(captured.html,/href="https:\/\/example.com\/reference"/);
 for(const text of ['中文加粗','引用第一行','无序项一','有序项二','已保存','const first = 1;','console.log(first);']) assert.ok(captured.text.includes(text),`Missing exported text: ${text}`);
 assert.match(await page.$eval('body',e=>e.textContent),/本机或临时地址/);
 await page.$eval('#wechat-article-preview',e=>{const img=document.createElement('img');img.src='/qa-broken.png';e.append(img);});await page.waitForFunction(()=>[...document.querySelectorAll('#wechat-article-preview img')].some(i=>i.complete&&i.naturalWidth===0));await clickCopy();await page.waitForFunction(()=>document.body.textContent.includes('图片加载失败'));
 // Raw preformatted fragments also need byte-preserving fallback copying.
 await page.$eval('#wechat-article-preview',e=>{const pre=document.createElement('pre');pre.textContent='raw first\n\n  raw second';e.append(pre);});await clickCopy();await page.waitForFunction(()=>window.__qaPayload.html?.includes('raw first'));
 assert.match((await page.evaluate(()=>window.__qaPayload.html)),/raw first\n\n  raw second/);
 await page.evaluate(()=>{navigator.clipboard.write=async()=>{throw Error('Rich text denied');};window.__qaPayload={};});await clickCopy();await page.waitForFunction(()=>window.__qaPayload.text);
 assert.ok(!/<section|<pre|<span/.test(await page.evaluate(()=>window.__qaPayload.text)));assert.match(await page.$eval('body',e=>e.textContent),/纯文本/);
 await page.screenshot({path:join(out,'copy-desktop.png')});
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('Clipboard denied');};window.__qaPayload={};});await clickCopy();await page.waitForFunction(()=>document.body.textContent.includes('复制失败'));assert.deepEqual(await page.evaluate(()=>window.__qaPayload),{});
 // Render a real user article and its captured HTML in isolation. No account or main database writes.
 const articleName='我又花了上亿Token攒了一个设计skill，开源了。.md';
 const localArticle=await readFile(join(root,articleName),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 const article=localArticle??markdown;
 await page.goto(base+'/login',{waitUntil:'domcontentloaded'});await page.evaluate(text=>localStorage.setItem('gzh_editor_draft',text),article);await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#wechat-article-preview img');
 await page.evaluate(()=>{document.execCommand=()=>false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{const item=items[0];window.__qaPayload={html:await(await item.getType('text/html')).text(),text:await(await item.getType('text/plain')).text()};}}});window.__qaPayload={};});
 const sourceImages=await page.$$eval('#wechat-article-preview img',images=>images.map(i=>i.src));await clickCopy();await page.waitForFunction(()=>window.__qaPayload.html);const actual=await page.evaluate(()=>window.__qaPayload);assert.ok(actual.text.includes(localArticle?'大家好，我是萝卜哥':'排版验收文章'));
 const rendered=await browser.newPage();await rendered.setViewport({width:677,height:1000});await rendered.setContent(`<html lang="zh-CN"><meta charset="utf-8"><body style="margin:0">${actual.html}</body></html>`,{waitUntil:'domcontentloaded'});
 const exportedImages=await rendered.$$eval('img',images=>images.map(i=>i.getAttribute('src')));assert.deepEqual(exportedImages,sourceImages,'Real article image sources and order must survive export');
 await rendered.evaluate(()=>Promise.race([Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r;}))),new Promise(r=>setTimeout(r,10000))]));
 const imageStatus=await rendered.$$eval('img',images=>({total:images.length,loaded:images.filter(i=>i.complete&&i.naturalWidth>0).length,failed:images.filter(i=>i.complete&&i.naturalWidth===0).length,pending:images.filter(i=>!i.complete).length}));
 await rendered.screenshot({path:join(out,'article-desktop-top.png')});await rendered.screenshot({path:join(out,'article-desktop.png'),fullPage:true});await rendered.setViewport({width:375,height:900});await rendered.screenshot({path:join(out,'article-mobile-top.png')});await rendered.screenshot({path:join(out,'article-mobile.png'),fullPage:true});
 const horizontalOverflow=await rendered.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(horizontalOverflow,false,'Article export should fit a mobile viewport');assert.deepEqual(errors,[]);
 await writeFile(join(out,'article.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>文章导出预览</title><body style="max-width:677px;margin:0 auto">${actual.html}</body></html>`);await writeFile(join(out,'clipboard.html'),captured.html);await writeFile(join(out,'clipboard.txt'),captured.text);
 const report={clipboardMocked:true,absoluteImageUrls:true,preformattedWhitespace:true,plainTextFallbackHonest:true,deniedClipboardHonest:true,failedImageWarning:true,realArticle:localArticle?articleName:null,articleImageSourcesPreserved:true,imageStatus,horizontalOverflow,wechatEditorPasteVerified:false,pageErrors:errors,paidRequests:0};await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(app)await app.close();await rm(dir,{recursive:true,force:true});}
