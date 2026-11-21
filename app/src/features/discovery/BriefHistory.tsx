import {useEffect,useState} from 'react';
import {api,dateText,type Brief} from './api';
import {Modal} from './ResearchModal';

type Version = Omit<Brief,'markdown'>;

export function BriefHistory({topicId,currentId,onClose,onUse}:{topicId:string;currentId?:string;onClose:()=>void;onUse:(markdown:string)=>void}){
  const [versions,setVersions]=useState<Version[]|null>(null);
  const [selected,setSelected]=useState('');
  const [brief,setBrief]=useState<Brief|null>(null);
  const [listError,setListError]=useState('');
  const [versionError,setVersionError]=useState('');
  const endpoint=`/api/topics/${topicId}/briefs`;

  useEffect(()=>{
    const controller=new AbortController();
    void api<{versions:Version[]}>(endpoint,undefined,'GET',controller.signal).then(result=>{
      if(controller.signal.aborted)return;
      setVersions(result.versions);
      setSelected(result.versions[0]?.id ?? '');
    }).catch(error=>{if(!controller.signal.aborted)setListError(error.message);});
    return ()=>controller.abort();
  },[endpoint]);

  useEffect(()=>{
    if(!selected)return;
    const controller=new AbortController();
    void api<{brief:Brief}>(`${endpoint}?version=${encodeURIComponent(selected)}`,undefined,'GET',controller.signal)
      .then(result=>{if(!controller.signal.aborted)setBrief(result.brief);})
      .catch(error=>{if(!controller.signal.aborted)setVersionError(error.message);});
    return ()=>controller.abort();
  },[endpoint,selected]);

  const preview=brief?.id===selected?brief:null;
  return <Modal title="简报历史" onClose={onClose}>
    <div className="rf-modal-body rf-form">
      <p>显示最近 30 个已保存版本。载入后可继续编辑，保存时会生成新版本。</p>
      {listError && <p role="alert">{listError}</p>}
      {!versions && !listError && <p role="status">正在读取简报历史…</p>}
      {versions?.length===0 && <p>暂无已保存版本。</p>}
      {!!versions?.length && <label>选择版本<select value={selected} onChange={event=>{setVersionError('');setSelected(event.target.value);}}>
        {versions.map((version,index)=><option key={version.id} value={version.id}>{`${index+1}. ${dateText(version.created_at)} · ${version.kind==='model'?'AI 生成':'手工编辑'}${version.id===currentId?' · 当前版本':''}`}</option>)}
      </select></label>}
      {versionError && <p role="alert">{versionError}</p>}
      {selected && !preview && !versionError && <p role="status">正在读取版本正文…</p>}
      {preview && <label>版本正文<textarea rows={12} readOnly value={preview.markdown}/></label>}
      <button className="rf-primary" disabled={!preview} onClick={()=>{if(preview)onUse(preview.markdown);}}>载入编辑区</button>
    </div>
  </Modal>;
}
