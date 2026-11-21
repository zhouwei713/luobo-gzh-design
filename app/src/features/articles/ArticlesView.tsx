import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {FileText,Search} from 'lucide-react';
import {WorkbenchShell} from '../../components/workbench/WorkbenchShell';
import {WorkbenchSettings} from '../../components/workbench/WorkbenchSettings';
import {Modal} from '../../components/ui/WorkspaceModal';
import {getCurrentUser,logout} from '../../services/authService';
import {articleApi,ArticleError,type ArticlePage} from './api';
import './articles.css';

export default function ArticlesView(){
 const navigate=useNavigate(),user=getCurrentUser();const [page,setPage]=useState<ArticlePage>({items:[],total:0,nextCursor:null});
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[reload,setReload]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[login,setLogin]=useState(false),[busy,setBusy]=useState(false),[settings,setSettings]=useState(false),[notice,setNotice]=useState('');
 const [editing,setEditing]=useState<{item:ArticlePage['items'][number];action:'rename'|'delete'}|null>(null),[title,setTitle]=useState('');
 const generation=useRef(0);
 useEffect(()=>{const own=++generation.current,abort=new AbortController();setLoading(true);setError('');setPage({items:[],total:0,nextCursor:null});
  void articleApi<ArticlePage>('?q='+encodeURIComponent(search),undefined,'GET',abort.signal).then(value=>{if(own===generation.current){setPage(value);setLogin(false);}}).catch(e=>{if(own===generation.current&&!abort.signal.aborted){setError(e instanceof Error?e.message:'读取失败');setLogin(e instanceof ArticleError&&e.status===401);}}).finally(()=>{if(own===generation.current)setLoading(false);});
  return()=>{generation.current=own+1;abort.abort();};
 },[search,reload]);
 const more=async()=>{if(busy||!page.nextCursor)return;const own=generation.current;setBusy(true);setError('');try{const value=await articleApi<ArticlePage>('?q='+encodeURIComponent(search)+'&cursor='+encodeURIComponent(page.nextCursor));if(own===generation.current)setPage(old=>({...value,items:[...old.items,...value.items]}));}catch(e){if(own===generation.current)setError(e instanceof Error?e.message:'读取失败');}finally{setBusy(false);}};
 const mutate=async(event:FormEvent)=>{event.preventDefault();if(!editing||busy)return;setBusy(true);setError('');try{await articleApi('/'+editing.item.id,{revision:editing.item.revision,...(editing.action==='rename'?{title}:{})},editing.action==='rename'?'PATCH':'DELETE');setEditing(null);setNotice(editing.action==='rename'?'文章标题已更新':'文章已从服务器删除，本机正在编辑的草稿保留');setReload(x=>x+1);}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{setBusy(false);}};
 const toLogin=()=>navigate('/login',{state:{from:'/articles'}});
 return <WorkbenchShell section="articles" realAuth userName={user?.email} draftState="saved" toolbar={null} actions={<Link className="article-save-trigger" to="/">回到排版</Link>} onLogin={toLogin} onLogout={()=>void logout().then(toLogin)} onSettings={()=>setSettings(true)} onConsole={()=>navigate('/admin')} onVideo={()=>navigate('/video-compare')} onHelp={()=>setNotice('在排版页点击“保存文章”存到服务器；重新打开前会保留当前正文的撤销快照。自动保存草稿仍只保存在本机。')}>
  <main className="articles-content" aria-label="我的文章">
   {notice&&<p className="article-notice" role="status">{notice}</p>}
   {error&&!editing&&<p className="article-error" role="alert">{error}{!login&&<button onClick={()=>setReload(x=>x+1)}>刷新重试</button>}</p>}
   {login?<section className="articles-empty"><FileText size={32}/><h2>登录，保存你的文章。</h2><p>同一账号可在不同设备打开已保存的正文。</p><button className="article-primary" onClick={toLogin}>登录 / 注册</button></section>:<>
    <form className="articles-search" onSubmit={e=>{e.preventDefault();setSearch(query.trim());}}><label htmlFor="article-search"><Search size={17}/>搜索文章标题</label><input id="article-search" maxLength={200} placeholder="输入标题关键词" value={query} onChange={e=>setQuery(e.target.value)}/><button type="submit">搜索</button><span>{page.total} 篇文章</span></form>
    <p className="articles-hint">文章手动保存到服务器，本机草稿继续自动保存。图片使用原链接，排版组合可另存为预设。</p>
    {loading?<section className="articles-empty" role="status">正在读取文章…</section>:!page.items.length?<section className="articles-empty"><FileText size={32}/><h2>{search?'没有匹配的文章':'把下一篇文章留在这里。'}</h2><p>{search?'换一个标题关键词试试。':'在排版页点击“保存文章”，即可收入个人文章库。'}</p>{!search&&<Link className="article-primary" to="/">开始写作</Link>}</section>:<div className="articles-list">{page.items.map(item=><article key={item.id} className="saved-article"><FileText size={22}/><div><Link to={'/?article='+encodeURIComponent(item.id)}>{item.title}</Link><p>{(item.characters||0).toLocaleString()} 字符 · 更新于 {new Date(item.updated_at).toLocaleString('zh-CN')}</p></div><nav aria-label={item.title+'操作'}><Link to={'/?article='+encodeURIComponent(item.id)}>继续排版</Link><button onClick={()=>{setEditing({item,action:'rename'});setTitle(item.title);setError('');}}>重命名</button><button className="article-delete" onClick={()=>{setEditing({item,action:'delete'});setError('');}}>删除</button></nav></article>)}</div>}
    {page.nextCursor&&<button className="articles-more" disabled={busy} onClick={()=>void more()}>{busy?'正在加载…':'继续加载'}</button>}
   </>}
  </main>
  {editing&&<Modal title={editing.action==='rename'?'重命名文章':'删除文章'} onClose={()=>{if(!busy){setEditing(null);setError('');}}}><form className="article-dialog" onSubmit={e=>void mutate(e)}>{editing.action==='rename'?<><label htmlFor="article-rename">文章标题</label><input id="article-rename" required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></>:<p>确定删除“{editing.item.title}”？服务器文章将永久删除，当前浏览器里的编辑草稿保留。</p>}{error&&<p className="article-error" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={()=>{setEditing(null);setError('');}}>取消</button><button className="article-primary" disabled={busy} type="submit">{busy?'正在处理…':editing.action==='rename'?'保存标题':'确认删除'}</button></footer></form></Modal>}
  {settings&&<WorkbenchSettings onClose={()=>setSettings(false)}/>}
 </WorkbenchShell>;
}
