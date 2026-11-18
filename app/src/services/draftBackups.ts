import {atomicDraftWrite,draftKeys,getDraftOwner,type LocalDraftStorage} from './draftScope';

export interface DraftBackup {id:string;label:string;markdown:string;savedAt:number}
export const MAX_DRAFT_BACKUPS=20;
const MAX_BYTES=2_000_000;
const bytes=(text:string)=>new TextEncoder().encode(text).length;
export const backupKey=(owner:string)=>'gzh_draft_backups_v1:'+encodeURIComponent(owner);
const assertOwner=(owner:string,storage:LocalDraftStorage)=>{if(getDraftOwner(storage)!==owner)throw Error('草稿身份已变化，请重新打开备份面板。');};
const valid=(item:unknown):item is DraftBackup=>{
 if(!item||typeof item!=='object')return false;
 const value=item as DraftBackup;
 return typeof value.id==='string'&&typeof value.label==='string'&&typeof value.markdown==='string'&&Number.isFinite(value.savedAt)&&value.savedAt>0;
};
export function loadDraftBackups(owner:string,storage:LocalDraftStorage=localStorage):DraftBackup[]{
 const raw=storage.getItem(backupKey(owner));if(raw===null)return [];
 const parsed:unknown=JSON.parse(raw);
 if(!Array.isArray(parsed)||!parsed.every(valid))throw Error('本机备份记录无法读取，请先导出当前正文，避免覆盖旧记录。');
 return parsed.map(({id,label,markdown,savedAt})=>({id,label:label.slice(0,80),markdown,savedAt}));
}
function entry(markdown:string,label:string):DraftBackup{return {id:crypto.randomUUID(),label:label.trim().slice(0,80)||'手动备份',markdown,savedAt:Date.now()};}
function bounded(items:DraftBackup[]):DraftBackup[]{
 const next=items.slice(0,MAX_DRAFT_BACKUPS);
 if(next[0]&&bytes(JSON.stringify([next[0]]))>MAX_BYTES)throw Error('当前正文过大，无法保存历史版本，请直接导出到文件。');
 while(bytes(JSON.stringify(next))>MAX_BYTES)next.pop();
 return next;
}
export function saveDraftBackup(owner:string,markdown:string,label='手动备份',storage:LocalDraftStorage=localStorage):DraftBackup[]{
 assertOwner(owner,storage);const history=loadDraftBackups(owner,storage);
 if(history[0]?.markdown===markdown)return history;
 const next=bounded([entry(markdown,label),...history]);storage.setItem(backupKey(owner),JSON.stringify(next));return next;
}
export function deleteDraftBackup(owner:string,id:string,storage:LocalDraftStorage=localStorage):DraftBackup[]{
 assertOwner(owner,storage);const next=loadDraftBackups(owner,storage).filter(item=>item.id!==id);storage.setItem(backupKey(owner),JSON.stringify(next));return next;
}
export function restoreDraftBackup(owner:string,id:string,current:string,storage:LocalDraftStorage=localStorage){
 assertOwner(owner,storage);const history=loadDraftBackups(owner,storage),target=history.find(item=>item.id===id);
 if(!target)throw Error('该备份已不存在，请重新选择。');
 const next=history[0]?.markdown===current?history:bounded([entry(current,'恢复前的正文'),...history]);
 const keys=draftKeys(owner),article=JSON.parse(storage.getItem(keys.article)||'null');
 const undo={label:'恢复历史备份',markdown:current,savedAt:Date.now(),article};
 atomicDraftWrite(storage,new Map([[backupKey(owner),JSON.stringify(next)],[keys.undo,JSON.stringify(undo)],[keys.draft,target.markdown],[keys.article,null]]));
 return {markdown:target.markdown,undo,history:next};
}
export function exportDraftBackups(owner:string,current:string,storage:LocalDraftStorage=localStorage):string{
 assertOwner(owner,storage);const history=loadDraftBackups(owner,storage);
 const backups=history[0]?.markdown===current?history:[entry(current,'导出时的正文'),...history];
 const raw=JSON.stringify({format:'luobo-draft-backup',version:1,exportedAt:new Date().toISOString(),backups},null,2);
 if(bytes(raw)>3_000_000)throw Error('备份文件过大，请先单独导出当前Markdown正文，再清理历史版本。');
 return raw;
}
export function importDraftBackups(owner:string,raw:string,storage:LocalDraftStorage=localStorage):DraftBackup[]{
 assertOwner(owner,storage);
 if(bytes(raw)>3_000_000)throw Error('备份文件超过3MB，请改用Markdown文件导入。');
 const parsed=JSON.parse(raw);
 if(parsed?.format!=='luobo-draft-backup'||parsed.version!==1||!Array.isArray(parsed.backups)||!parsed.backups.length||!parsed.backups.every(valid))throw Error('请选择有效的萝卜排版草稿备份文件。');
 const history=loadDraftBackups(owner,storage),incoming:DraftBackup[]=[];
 for(const item of parsed.backups as DraftBackup[]){if(!history.some(old=>old.markdown===item.markdown)&&!incoming.some(old=>old.markdown===item.markdown))incoming.push({...entry(item.markdown,item.label),savedAt:item.savedAt});}
 const next=[...history,...incoming].slice(0,MAX_DRAFT_BACKUPS);
 if(next.length<history.length+incoming.length||bytes(JSON.stringify(next))>MAX_BYTES)throw Error('备份空间不足，请先导出并删除部分历史版本，再导入。');
 storage.setItem(backupKey(owner),JSON.stringify(next));return next;
}
