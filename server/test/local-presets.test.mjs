import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {resolve} from 'node:path';

const result=await build({entryPoints:[resolve(import.meta.dirname,'../../app/src/core/styleScheme.ts')],bundle:true,write:false,format:'cjs'});
const module={exports:{}};new Function('module','exports',result.outputFiles[0].text)(module,module.exports);
const api=module.exports;

test('local presets round-trip all formatting settings and import with fresh IDs',()=>{
 const source=api.STYLE_SCHEMES[1];
 const selection={...source,typography:{...source.typography,bodySize:18,lineHeight:2.2},componentStyle:{...source.componentStyle,quoteStyle:'soft-card'}};
 const preset=api.createCustomStyleScheme(' 我的常用排版 ',selection,source.preview);
 const imported=api.parseImportedStyleSchemes(api.serializeCustomStyleSchemes([preset]));
 assert.equal(imported.length,1);assert.equal(imported[0].name,'我的常用排版');assert.notEqual(imported[0].id,preset.id);
 for(const field of ['themeId','layoutId','imageStyleId','emphasis','typography','componentStyle'])assert.deepEqual(imported[0][field],preset[field],field);
 assert.equal(api.styleSchemeMatchesSelection(imported[0],selection),true);
 const store=new Map();globalThis.window={localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)}};
 try{
  api.saveCustomStyleSchemes([preset]);assert.equal(api.loadCustomStyleSchemes()[0].id,preset.id);
  window.localStorage.setItem=()=>{throw Error('Quota exceeded');};
  assert.throws(()=>api.saveCustomStyleSchemes([]),/Quota/);
  assert.equal(api.loadCustomStyleSchemes()[0].id,preset.id);
 }finally{delete globalThis.window;}
});

test('invalid imported preset values normalize to supported styles',()=>{
 assert.deepEqual(api.parseImportedStyleSchemes('{"other":[]}'),[]);
 assert.throws(()=>api.parseImportedStyleSchemes('broken json'));
 const [preset]=api.parseImportedStyleSchemes(JSON.stringify([{name:'测试',themeId:'unknown',layoutId:'unknown',typography:{bodySize:100000}}]));
 assert.equal(preset.themeId,'emerald');assert.equal(preset.layoutId,'minimalist');assert.ok(preset.typography.bodySize<100);
 assert.ok(!JSON.stringify(preset).includes('unknown'));
});
