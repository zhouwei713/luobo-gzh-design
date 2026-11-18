import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {webcrypto} from 'node:crypto';
const bundle=await build({entryPoints:[resolve(import.meta.dirname,'../../app/src/services/draftBackups.ts')],bundle:true,write:false,format:'cjs'});
const module={exports:{}};new Function('module','exports',bundle.outputFiles[0].text)(module,module.exports);const api=module.exports;
globalThis.crypto??=webcrypto;
function memory(){const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}

test('history deduplicates consecutive contents, bounds oldest records and isolates owners',()=>{
 const storage=memory();for(let i=0;i<25;i++)api.saveDraftBackup('guest','文章'+i,'测试',storage);
 let items=api.loadDraftBackups('guest',storage);assert.equal(items.length,20);assert.equal(items[0].markdown,'文章24');assert.equal(items.at(-1).markdown,'文章5');
 api.saveDraftBackup('guest','文章24','重复',storage);assert.equal(api.loadDraftBackups('guest',storage).length,20);
 storage.setItem('auth_token','token');storage.setItem('auth_user',JSON.stringify({id:'alice'}));
 assert.throws(()=>api.saveDraftBackup('guest','晚返回内容','',storage),/身份/);
 api.saveDraftBackup('user:alice','Alice','',storage);assert.equal(api.loadDraftBackups('user:alice',storage)[0].markdown,'Alice');
 assert.equal(api.loadDraftBackups('guest',storage)[0].markdown,'文章24');
});

test('restore keeps current text and undo metadata and rolls back every key on failure',()=>{
 const storage=memory();const [target]=api.saveDraftBackup('guest','旧稿','之前',storage);
 storage.setItem('gzh_editor_draft','当前稿');storage.setItem('gzh_editor:guest:article',JSON.stringify({id:'article',title:'当前文章',revision:2}));
 const previous=new Map(storage.data);const set=storage.setItem;let fail=true;
 storage.setItem=(key,value)=>{if(key==='gzh_editor_draft'&&fail){fail=false;throw Error('Storage full');}return set(key,value);};
 assert.throws(()=>api.restoreDraftBackup('guest',target.id,'当前稿',storage),/Storage full/);assert.deepEqual(storage.data,previous);
 const result=api.restoreDraftBackup('guest',target.id,'当前稿',storage);
 assert.equal(result.markdown,'旧稿');assert.equal(result.undo.markdown,'当前稿');assert.equal(result.undo.article.id,'article');
 assert.equal(storage.getItem('gzh_editor_draft'),'旧稿');assert.equal(storage.getItem('gzh_editor:guest:article'),null);
 assert.equal(api.loadDraftBackups('guest',storage)[0].markdown,'当前稿');
});

test('JSON imports are explicit, validated, deduplicated and never replace the editor draft',()=>{
 const source=memory(),destination=memory();api.saveDraftBackup('guest','# A','A',source);
 source.setItem('openai_api_key','SECRET');source.setItem('auth_user','SENSITIVE');
 const raw=api.exportDraftBackups('guest','# B',source);assert.ok(!/SECRET|SENSITIVE|openai_api_key/.test(raw));
 destination.setItem('gzh_editor_draft','目标正文');const imported=api.importDraftBackups('guest',raw,destination);
 assert.equal(imported.length,2);assert.equal(destination.getItem('gzh_editor_draft'),'目标正文');
 api.importDraftBackups('guest',raw,destination);assert.equal(api.loadDraftBackups('guest',destination).length,2);
 const snapshot=new Map(destination.data);
 for(const invalid of ['broken','{}','{"format":"luobo-draft-backup","version":2,"backups":[]}'])assert.throws(()=>api.importDraftBackups('guest',invalid,destination));
 assert.deepEqual(destination.data,snapshot);
});

test('corrupt records, over-budget restoration and storage failure preserve previous history',()=>{
 const storage=memory();storage.setItem(api.backupKey('guest'),'broken');
 assert.throws(()=>api.saveDraftBackup('guest','新稿','',storage));assert.equal(storage.getItem(api.backupKey('guest')),'broken');
 storage.removeItem(api.backupKey('guest'));const [target]=api.saveDraftBackup('guest','旧稿','',storage);const snapshot=new Map(storage.data);
 assert.throws(()=>api.restoreDraftBackup('guest',target.id,'大'.repeat(800000),storage),/过大/);assert.deepEqual(storage.data,snapshot);
 storage.setItem=()=>{throw Error('Quota');};assert.throws(()=>api.saveDraftBackup('guest','新稿','',storage),/Quota/);assert.deepEqual(storage.data,snapshot);
});
