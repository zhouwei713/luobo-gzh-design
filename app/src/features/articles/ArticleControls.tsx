import {useEffect,useRef,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {Save} from 'lucide-react';
import {Modal} from '../../components/ui/WorkspaceModal';
import {articleApi,type SavedArticle} from './api';
import {getAuthToken} from '../../services/authService';
import {getDraftOwner} from '../../services/draftScope';
import {ARTICLE_IDENTITY_EVENT,loadArticleIdentity,saveArticleIdentity,type ArticleIdentity} from '../../services/articleIdentity';
import './articles.css';

export function ArticleControls({markdown,owner,accountOwner,onLoad,onLogin}:{markdown:string;owner:string;accountOwner:string;onLoad:(text:string,article:ArticleIdentity)=>void;onLogin:()=>void}){
 const [params,setParams]=useSearchParams();const requested=params.get('article');const navigate=useNavigate();
 const [active,setActive]=useState<ArticleIdentity|null>(()=>loadArticleIdentity(owner)),[pending,setPending]=useState<SavedArticle|null>(null),[opening,setOpening]=useState(false),[detach,setDetach]=useState(false);
 const [showSave,setShowSave]=useState(false),[title,setTitle]=useState(''),[asNew,setAsNew]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const latest=useRef(markdown);latest.current=markdown;
 useEffect(()=>{const update=()=>{setActive(loadArticleIdentity(owner));setNotice('');};window.addEventListener(ARTICLE_IDENTITY_EVENT,update);return()=>window.removeEventListener(ARTICLE_IDENTITY_EVENT,update);},[owner]);
 useEffect(()=>{
  if(!requested)return;
  const abort=new AbortController();let alive=true;
  void articleApi<{article:SavedArticle}>('/'+encodeURIComponent(requested),undefined,'GET',abort.signal).then(data=>{if(alive){setPending(data.article);setOpening(true);setError('');}}).catch(e=>{if(alive){setOpening(true);setError(e instanceof Error?e.message:'读取文章失败');}});
  return()=>{alive=false;abort.abort();};
 },[requested]);
 const closeOpen=()=>{setOpening(false);setPending(null);const next=new URLSearchParams(params);next.delete('article');setParams(next,{replace:true});setError('');};
 const beginSave=()=>{
  if(accountOwner==='guest'||!getAuthToken()){onLogin();return;}
  setTitle(active?.title||markdown.match(/^#\s+(.+)$/m)?.[1]?.slice(0,200)||'未命名文章');setAsNew(!active);setShowSave(true);setNotice('');setError('');
 };
 const save=async()=>{
  if(busy)return;if(getDraftOwner()!==accountOwner){setError('账号已切换，请重新进入编辑器');return;}
  setBusy(true);setError('');try{
   const result=await articleApi<{article:SavedArticle}>(active&&!asNew?'/'+active.id:'',{title,markdown:latest.current,...(active&&!asNew?{revision:active.revision}:{})},active&&!asNew?'PATCH':'POST');
   setActive(result.article);setShowSave(false);
   try{saveArticleIdentity(owner,result.article,latest.current);setNotice(`上次保存：${result.article.title}`);}
   catch{setNotice('服务器已保存，但本机未能记住文章，刷新后请从文章库重新打开');}
  }catch(e){setError(e instanceof Error?e.message:'保存失败');}finally{setBusy(false);}
 };
 return <>
  <button className="article-save-trigger" onClick={beginSave}><Save size={15}/>保存文章</button>
  {(notice||active)&&<button className="article-save-notice" onClick={()=>{try{saveArticleIdentity(owner,active,latest.current);navigate('/articles');}catch{setNotice('本机保存失败，请先导出正文再离开');}}} title={notice||`正在编辑：${active?.title}`}>{notice||`正在编辑：${active?.title}`}</button>}
  {showSave&&<Modal title="保存到我的文章" onClose={()=>{if(!busy)setShowSave(false);}}><form className="article-dialog" onSubmit={e=>{e.preventDefault();void save();}}>
   <p>保存标题和当前 Markdown 正文到服务器，可登录同一账号重新打开。正文图片保留原链接。</p>
   <label htmlFor="saved-article-title">文章标题</label><input id="saved-article-title" value={title} required maxLength={200} onChange={e=>setTitle(e.target.value)} disabled={busy}/>
   {active&&<label className="article-checkbox"><input type="checkbox" checked={asNew} onChange={e=>setAsNew(e.target.checked)} disabled={busy}/>另存为新文章，保留“{active.title}”</label>}
   {!asNew&&active&&<p>将更新“{active.title}”。其他页面有新版本时会阻止覆盖。</p>}
   {active&&<button type="button" disabled={busy} onClick={()=>{setShowSave(false);setDetach(true);}}>保留当前正文，作为新稿继续编辑</button>}
   {error&&<p role="alert" className="article-error">{error}</p>}
   <footer><button type="button" disabled={busy} onClick={()=>setShowSave(false)}>取消</button><button type="submit" className="article-primary" disabled={busy}>{busy?'正在保存…':active&&!asNew?'更新文章':'保存新文章'}</button></footer>
  </form></Modal>}
  {opening&&<Modal title="载入已保存的文章" onClose={closeOpen}><div className="article-dialog">
   {pending&&<><h3>{pending.title}</h3><p>将替换当前编辑区正文。当前正文会保留为撤销快照，可在“AI 工具”中恢复。文章的排版方案使用当前设置。</p></>}
   {error&&<p className="article-error" role="alert">{error}</p>}
   <footer><button onClick={closeOpen}>取消</button>{pending&&<button className="article-primary" onClick={()=>{try{if(getDraftOwner()!==accountOwner)throw Error('账号已切换，请重新进入编辑器');onLoad(pending.markdown,pending);setActive(pending);setNotice('已载入文章，后续修改需点击保存文章');closeOpen();}catch(e){setError(e instanceof Error?e.message:'本机保存失败');}}}>载入排版</button>}</footer>
  </div></Modal>}
  {detach&&<Modal title="作为新稿继续编辑" onClose={()=>setDetach(false)}><div className="article-dialog"><p>当前正文保留，后续保存会新建文章。服务器中的“{active?.title}”保持原样。</p>{error&&<p role="alert" className="article-error">{error}</p>}<footer><button onClick={()=>setDetach(false)}>取消</button><button className="article-primary" onClick={()=>{try{saveArticleIdentity(owner,null,latest.current);setActive(null);setNotice('当前正文已作为新稿保留');setDetach(false);}catch{setError('本机保存失败，文章关联保持原样');}}}>作为新稿</button></footer></div></Modal>}
 </>;
}
