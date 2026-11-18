import {useEffect,useRef,useState} from 'react';
import {Modal} from './WorkspaceModal';
import {backupKey,deleteDraftBackup,exportDraftBackups,importDraftBackups,loadDraftBackups,restoreDraftBackup,saveDraftBackup,type DraftBackup} from '../../services/draftBackups';
import type {UndoSnapshot} from '../../services/draftStorage';
import './draft-backups.css';

export function DraftBackupsPanel({owner,getCurrent,onRestore,onClose}:{owner:string;getCurrent:()=>string;onRestore:(markdown:string,undo:UndoSnapshot)=>void;onClose:()=>void}){
 const [initial]=useState(()=>{try{return {items:loadDraftBackups(owner),error:''};}catch(error){return {items:[] as DraftBackup[],error:error instanceof Error?error.message:'备份记录无法读取'};}});
 const [items,setItems]=useState<DraftBackup[]>(initial.items),[label,setLabel]=useState(''),[error,setError]=useState(initial.error),[notice,setNotice]=useState(''),[selection,setSelection]=useState<{id:string;action:'restore'|'delete'}|null>(null);
 useEffect(()=>{const refresh=()=>{try{setItems(loadDraftBackups(owner));}catch(error){setError(error instanceof Error?error.message:'备份无法读取');}};window.addEventListener('storage',refresh);window.addEventListener('gzh-draft-backups-changed',refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('gzh-draft-backups-changed',refresh);};},[owner]);
 const input=useRef<HTMLInputElement>(null);
 const run=(action:()=>void)=>{try{setError('');setNotice('');action();}catch(error){setError(error instanceof Error?error.message:'本机存储不可用，请先导出正文。');}};
 const download=(raw:string)=>{const url=URL.createObjectURL(new Blob([raw],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`luobo-drafts-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <Modal title="草稿备份" onClose={onClose}><div className="draft-backups">
  <p>正文自动保存与历史备份分别保留。内容变化时每分钟留一版，最多20版、约2MB，超过后淘汰最旧版本。清理浏览器前请导出文件，备份仅包含正文。</p>
  <div className="draft-backup-actions"><input aria-label="备份名称" maxLength={80} value={label} onChange={e=>setLabel(e.target.value)} placeholder="备份名称（选填）"/><button onClick={()=>run(()=>{setItems(saveDraftBackup(owner,getCurrent(),label));setNotice('当前正文已备份，相同内容不会重复保存。');setLabel('');})}>立即备份</button></div>
  <div className="draft-backup-actions"><button onClick={()=>run(()=>download(exportDraftBackups(owner,getCurrent())))}>导出全部备份</button><button onClick={()=>input.current?.click()}>导入备份文件</button><small>导入仅加入历史，不覆盖编辑器正文。</small></div>
  <input ref={input} hidden type="file" accept="application/json,.json" aria-label="导入草稿备份文件" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>3_000_000)throw Error('备份文件不能超过3MB。');const raw=await file.text();run(()=>{setItems(importDraftBackups(owner,raw));setNotice('备份已导入，请选择需要恢复的版本。');});}catch(error){setError(error instanceof Error?error.message:'文件读取失败');}}}/>
  {error&&<p className="draft-backup-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {selection&&<div className="draft-backup-confirm"><p>{selection.action==='restore'?'恢复会替换当前正文，并先保留恢复前的版本，可通过AI工具撤销。':'确定删除这一个历史版本？当前正文保持不变。'}</p><button onClick={()=>setSelection(null)}>取消</button><button onClick={()=>run(()=>{if(selection.action==='restore'){const result=restoreDraftBackup(owner,selection.id,getCurrent());onRestore(result.markdown,result.undo);setItems(result.history);setNotice('已恢复历史版本，恢复前正文已保留。');}else setItems(deleteDraftBackup(owner,selection.id));setSelection(null);})}>{selection.action==='restore'?'确认恢复':'确认删除'}</button></div>}
  {!items.length?<p>还没有历史备份，可以先点击“立即备份”。</p>:<ol>{items.map(item=><li key={item.id}><strong>{item.label}</strong><small>{new Date(item.savedAt).toLocaleString()} · {item.markdown.length.toLocaleString()}字</small><pre>{item.markdown.slice(0,160)||'（空白正文）'}</pre><button onClick={()=>setSelection({id:item.id,action:'restore'})}>恢复此版本</button><button onClick={()=>setSelection({id:item.id,action:'delete'})}>删除备份</button></li>)}</ol>}
  <details><summary>历史记录损坏时如何处理</summary><p>当前正文仍可单独导出。可通过下方按钮下载原始记录交给维护者检查，文件可能包含文章内容，请自行保管。</p><button onClick={()=>run(()=>download(JSON.stringify({raw:localStorage.getItem(backupKey(owner))})))}>导出原始记录</button></details>
 </div></Modal>;
}
