import {useEffect,useRef,useState} from 'react';
import {readPersonalAI} from '../../services/personalAISettings';
import {adoptTopicDraft,readTopicDraftText} from '../../services/topicDraft';
import {useWorkspaceConfirmation} from '../../components/ui/useWorkspaceConfirmation';
import {Modal} from './ResearchModal';
import {LUOBO_WRITING_RULES,requestArticleWriting,type WritingInput} from './articleWriting';
import type {TopicDetail} from './api';

export function ArticleWritingModal({detail,owner,onClose,onSettings,onAdopt}:{detail:TopicDetail;owner:string;onClose:()=>void;onSettings:()=>void;onAdopt:()=>void}){
  const sampleKey='gzh_writing_sample:'+encodeURIComponent(owner);
  const [input,setInput]=useState<WritingInput>(()=>{
    let sample='';
    try{sample=localStorage.getItem(sampleKey)||'';}catch{/* Continue without a sample. */}
    return {claim:detail.topic.angle,material:detail.topic.notes,voice:'luobo',sample,opening:''};
  });
  const [openings,setOpenings]=useState<string[]>([]);
  const [draft,setDraft]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState<'openings'|'draft'|null>(null);
  const request=useRef<AbortController|null>(null);
  const candidate=useRef<HTMLTextAreaElement>(null);
  const {confirm,confirmation}=useWorkspaceConfirmation();
  useEffect(()=>()=>request.current?.abort(),[]);
  const update=<K extends keyof WritingInput>(key:K,value:WritingInput[K])=>setInput(current=>({...current,[key]:value}));

  async function generate(mode:'openings'|'draft'){
    if(request.current)return;
    setError('');
    setNotice('');
    if(!input.claim.trim()){setError('请先写一句你想讲清楚的判断。');return;}
    if(!readPersonalAI().apiKey.trim()){setError('请先保存个人 API。');onSettings();return;}
    if(mode==='draft'&&draft&&!await confirm({
      title:'重新生成初稿？',message:'重新生成成功后会替换当前候选初稿。选题草稿会保留。',confirmLabel:'重新生成',
    }))return;
    const controller=new AbortController();
    request.current=controller;
    setBusy(mode);
    const timeout=AbortSignal.timeout(120_000);
    try{
      const result=await requestArticleWriting(detail,input,mode,AbortSignal.any([controller.signal,timeout]));
      if(controller.signal.aborted)return;
      if(mode==='openings'){
        let options:unknown;
        try{options=JSON.parse(result.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{/* Invalid format is reported below. */}
        if(!Array.isArray(options)||options.length!==2||!options.every(option=>typeof option==='string'&&option.trim()&&option.length<=500)){
          throw new Error('模型未返回两个可用的开头，请重试或直接生成初稿。');
        }
        setOpenings(options);
      }else{
        const heading=/^#[ \t]+[^\r\n]+\r?\n/.exec(result)?.[0].trim();
        const body=heading?result.slice(heading.length).trim():'';
        if(!heading||!body)throw new Error('模型未返回带标题和正文的 Markdown，请重试。');
        const opening=input.opening.trim();
        const markdown=opening&&!body.startsWith(opening)?[heading,opening,body].join('\n\n'):result;
        if(markdown.length>40000)throw new Error('初稿超过 40000 字，请缩小写作范围后重试。');
        setDraft(markdown);
      }
    }catch(err){
      if(controller.signal.aborted)return;
      setError(timeout.aborted?'请求超时，请稍后重试。':err instanceof Error?err.message:'写作请求失败，请重试。');
    }finally{
      request.current=null;
      if(!controller.signal.aborted)setBusy(null);
    }
  }

  async function adopt(){
    const markdown=draft.trim();
    if(!markdown||busy)return;
    try{
      const previous=readTopicDraftText(localStorage,owner,detail.topic.id);
      if(previous!==null&&!await confirm({
        title:'采用初稿并替换选题草稿？',
        message:'这会替换当前选题的本机草稿。原稿可在排版页的「AI 工具」中撤销恢复。',
        confirmLabel:'采用并替换',
      }))return;
      const {id,title}=detail.topic;
      adoptTopicDraft(localStorage,owner,{id,title},markdown,previous);
      onAdopt();
    }catch(err){
      setError(err instanceof Error?err.message:'本机存储写入失败，原稿已保留。');
    }
  }

  function storeSample(value:string){
    try{
      if(value.trim())localStorage.setItem(sampleKey,value.trim().slice(0,2000));
      else localStorage.removeItem(sampleKey);
      update('sample',value.trim().slice(0,2000));
      setError('');
      setNotice(value.trim()?'已保存为本机口吻参考。':'已清除本机口吻参考。');
    }catch{setError('未能保存口吻参考，请检查浏览器存储。');}
  }

  async function close(){
    if(draft&&!await confirm({title:'关闭初稿预览？',message:'当前候选初稿还未采用。关闭后，选题草稿会保留。',confirmLabel:'关闭预览',cancelLabel:'继续编辑'}))return;
    onClose();
  }

  return <>
    <Modal title="用简报写初稿" onClose={()=>void close()}>
      <div className="rf-modal-body rf-form">
        <p className="rf-muted">适合没有旧文的第一篇。确认自己的判断，已有简报和参考资料会一起使用。</p>
        <label>这篇想说清楚什么<textarea rows={2} value={input.claim} onChange={e=>update('claim',e.target.value)} maxLength={2000} disabled={!!busy}/></label>
        <label>自己的材料<textarea rows={3} value={input.material} onChange={e=>update('material',e.target.value)} maxLength={15000} disabled={!!busy} placeholder="可补充观察、数据或实例。缺少的部分会标为待补或待核验。"/></label>
        <label>写作口吻<select value={input.voice} onChange={e=>update('voice',e.target.value==='plain'?'plain':'luobo')} disabled={!!busy}>
          <option value="luobo">萝卜哥风格（默认）</option><option value="plain">清楚直接</option>
        </select></label>
        {input.voice==='luobo'&& <details><summary>查看默认写作规则</summary><p style={{whiteSpace:'pre-line'}}>{LUOBO_WRITING_RULES}</p></details>}
        <details>
          <summary>口吻参考（可选）</summary>
          <label>我自己的段落<textarea rows={3} value={input.sample} onChange={e=>update('sample',e.target.value)} maxLength={2000} disabled={!!busy}/></label>
          <div className="rf-detail-actions"><button type="button" className="rf-button" disabled={!!busy||!input.sample.trim()} onClick={()=>storeSample(input.sample)}>保存口吻参考</button><button type="button" className="rf-button" disabled={!!busy} onClick={()=>storeSample('')}>清除参考</button></div>
        </details>
        <div className="rf-detail-actions">
          <button type="button" className="rf-button" disabled={!!busy} onClick={()=>void generate('openings')}>{busy==='openings'?'正在写开头…':'试写两个开头'}</button>
          <button type="button" className="rf-primary" disabled={!!busy} onClick={()=>void generate('draft')}>{busy==='draft'?'正在写初稿…':draft?'重新生成':'生成完整初稿'}</button>
        </div>
        {openings.map((opening,index)=><div key={index}>
          <p>{opening}</p><button type="button" className="rf-button" disabled={!!busy} onClick={()=>update('opening',opening)}>采用开头 {index+1}</button>
        </div>)}
        {(openings.length>0||input.opening)&&<label>选定的开头<textarea rows={3} value={input.opening} maxLength={1000} onChange={e=>update('opening',e.target.value)} disabled={!!busy}/></label>}
        {error&&<p role="alert" className="rf-error-text">{error}</p>}
        {notice&&<p role="status" className="rf-muted">{notice}</p>}
        {draft&&<>
          <label>初稿预览<textarea ref={candidate} rows={14} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={40000} disabled={!!busy}/></label>
          <div className="rf-detail-actions">
            <button type="button" className="rf-button" disabled={!!busy} onClick={()=>{
              const editor=candidate.current;
              const selected=editor?.value.slice(editor.selectionStart,editor.selectionEnd).trim();
              if(selected)storeSample(selected);
              else setError('请先在初稿中选中你亲自改过、想保留的文字。');
            }}>将选中文字存为口吻参考</button>
            <button type="button" className="rf-primary" disabled={!!busy||!draft.trim()} onClick={()=>void adopt()}>采用并继续写作</button>
          </div>
        </>}
      </div>
    </Modal>
    {confirmation}
  </>;
}
