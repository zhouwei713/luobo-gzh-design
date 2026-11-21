import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, Bookmark, Check, ChevronRight, FileText, Library, Plus, RefreshCw, Search, Sparkles } from 'lucide-react';
import { WorkbenchShell } from '../../components/workbench/WorkbenchShell';
import { guardNavigation } from '../../components/workbench/guardNavigation';
import { useWorkspaceConfirmation } from '../../components/ui/useWorkspaceConfirmation';
import {WorkbenchSettings} from '../../components/workbench/WorkbenchSettings';
import { DevIdentitySwitcher } from '../../components/ui/DevIdentitySwitcher';
import { loadDevIdentityRole, saveDevIdentityRole, type DevIdentityRole } from '../../services/accessControl';
import { refreshUser, getAuthToken, getCurrentUser, logout, type User } from '../../services/authService';
import { api, ApiError, articleText, dateText, type Article, type LibraryStatus, type Topic, type TopicDetail } from './api';
import { importTopicBrief } from '../../services/topicImport';
import { readTopicDraft, startTopicDraft, topicDraftHref } from '../../services/topicDraft';
import { useTopicDraftOwner } from '../../services/useDraftOwner';
import { readPersonalAI } from '../../services/personalAISettings';
import { generatePersonalBrief } from './personalBrief';
import { ArticleWritingModal } from './ArticleWritingModal';
import {Modal} from './ResearchModal';
import {CollectionModal,SyncHistory} from './CollectionModal';
import {CoveragePanel} from './CoveragePanel';
import {TopicSources} from './TopicSources';
import {BriefHistory} from './BriefHistory';
import type {TopicPage} from './api';
import './research.css';

const statusLabels: Record<string, string> = { research: '待研究', writing: '待写', imported: '已带入', archived: '已归档', running: '采集中', completed: '已完成', failed: '失败', interrupted: '已中断' };

export default function ResearchView({ mode }: { mode: 'discovery' | 'topics' }) {
  const navigate = useNavigate(), { id: topicId } = useParams();
  const {confirm,confirmation}=useWorkspaceConfirmation();
  const topicDraftOwner = useTopicDraftOwner();
  const [user, setUser] = useState<User | null>(getCurrentUser);
  const [localDebug, setLocalDebug] = useState(false);
  const [historyTopicId, setHistoryTopicId] = useState<string|null>(null);
  const [devIdentityRole, setDevIdentityRole] = useState<DevIdentityRole>(loadDevIdentityRole);
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [items, setItems] = useState<Article[]>([]), [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [q, setQ] = useState(''), [category, setCategory] = useState(''), [since, setSince] = useState(''), [sort, setSort] = useState('newest');
  const [sourceFilter, setSourceFilter] = useState(''), [searchScope, setSearchScope] = useState('title');
  const [contentFilter,setContentFilter]=useState('');
  const [articleTotal,setArticleTotal]=useState<number|null>(null);
  const [cursor, setCursor] = useState<string | null>(null), [selected, setSelected] = useState<Article | null>(null);
  const [settings, setSettings] = useState(false), [syncOpen, setSyncOpen] = useState(false), [help, setHelp] = useState(false);
  const [detail, setDetail] = useState<TopicDetail | null>(null), [draft, setDraft] = useState<Topic | null>(null), [briefText, setBriefText] = useState(''), [generated, setGenerated] = useState('');
  const briefRequest = useRef<AbortController | null>(null);
  useEffect(()=>()=>briefRequest.current?.abort(),[topicId,user?.id]);
  const [topicFilter, setTopicFilter] = useState('all'), [createOpen, setCreateOpen] = useState(false), [newTitle, setNewTitle] = useState('');
  const [topicSearch, setTopicSearch] = useState(''), [collectedTopicId, setCollectedTopicId] = useState<string | null>(null);
  const [topicTag,setTopicTag]=useState(''),[topicTags,setTopicTags]=useState<string[]>([]);
  const [topicCursor,setTopicCursor]=useState<string|null>(null),[topicTotal,setTopicTotal]=useState(0),[topicCounts,setTopicCounts]=useState<Record<string,number>>({});
  const [topicLoadedKey,setTopicLoadedKey]=useState('');
  const [topicFailedKey,setTopicFailedKey]=useState('');
  const topicQueryKey=JSON.stringify([user?.id,topicFilter,topicSearch.trim(),topicTag.trim()]);
  const topicsReady=topicLoadedKey===topicQueryKey;
  const topicRequestId=useRef(0);
  const cancelTopicRequest=useCallback(()=>{topicRequestId.current++;},[]);
  const [sourcePicker, setSourcePicker] = useState(false), [sourceSearch, setSourceSearch] = useState(''), [sourceChoices, setSourceChoices] = useState<Article[]>([]);
  const [importOpen, setImportOpen] = useState(false), [importMode, setImportMode] = useState('new');
  const [writingTopicId,setWritingTopicId]=useState<string|null>(null);
  const hasTopicDraft = Boolean(user && detail && readTopicDraft(localStorage, topicDraftOwner, detail.topic.id));
  const dirty = Boolean(detail && draft && (JSON.stringify(draft) !== JSON.stringify(detail.topic) || briefText !== (detail.brief?.markdown || '')));
  const skippedRecoveryKey = useRef<string|null>(null);
  useEffect(() => {
    if (!detail || !draft || !user) return;
    const key = `gzh_topic_draft_${user.id}_${detail.topic.id}`;
    try {
      if (dirty) {
        localStorage.setItem(key, JSON.stringify({ draft, briefText }));
        skippedRecoveryKey.current=null;
      } else if (skippedRecoveryKey.current!==key) localStorage.removeItem(key);
    } catch { setError('本机临时稿保存失败，请先保存到服务器再离开页面。'); }
  }, [detail, draft, briefText, dirty, user]);
  const requestId = useRef(0);
  const cancelArticleRequest = useCallback(() => { requestId.current++; }, []);
  const fail = useCallback((e: unknown) => { if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : '请求失败'); }, []);
  const canLeave = () => !dirty || confirm({title:'离开选题？',message:'当前选题有未保存的修改。请确认是否离开编辑区。',confirmLabel:'离开选题',cancelLabel:'继续编辑'});
  useEffect(() => {
    if (!dirty || !detail || !draft || !user) return;
    const listener = (event: BeforeUnloadEvent) => {
      try { localStorage.setItem(`gzh_topic_draft_${user.id}_${detail.topic.id}`,JSON.stringify({draft,briefText})); }
      catch { event.preventDefault(); }
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty,detail,draft,user,briefText]);
  useEffect(() => {
    let alive = true;
    const loadIdentity = async () => {
      if (getAuthToken()) { try { const current = await refreshUser(); if (current) { if (alive) setUser(current); return; } } catch { /* Try the explicitly enabled local debug identity. */ } }
      try { const data = await api<{ user: User | null; localDebug: boolean }>('/api/discovery/local-session'); if (alive) { setUser(data.user); setLocalDebug(data.localDebug); } } catch (e) { if (alive) { setUser(null); if (!(e instanceof ApiError) || e.status !== 401) fail(e); } }
    };
    void loadIdentity(); return () => { alive = false; };
  }, [devIdentityRole, fail]);
  const loadStatus = useCallback(async () => { setStatus(await api<LibraryStatus>('/api/discovery/status')); }, []);
  const query = useCallback(() => new URLSearchParams({ q, category, since, sort, source: sourceFilter, scope: searchScope, content:contentFilter, limit: '20' }), [q, category, since, sort, sourceFilter, searchScope,contentFilter]);
  const loadArticles = useCallback(async (next?: string) => {
    const request = ++requestId.current; setLoading(true); setError('');
    try { const params = query(); if (next) params.set('cursor', next); const data = await api<{ items: Article[]; total: number; nextCursor: string | null }>('/api/discovery/articles?' + params); if (request !== requestId.current) return; setItems(old => next ? [...old, ...data.items] : data.items); setCursor(data.nextCursor);setArticleTotal(data.total); }
    catch (e) { if (request === requestId.current) fail(e); } finally { if (request === requestId.current) setLoading(false); }
  }, [query, fail]);
  const loadTopics = useCallback(async (next?:string) => {
    const request=++topicRequestId.current;setLoading(true);setTopicFailedKey('');
    try{
      const params=new URLSearchParams({q:topicSearch.trim(),status:topicFilter,tag:topicTag.trim(),limit:'30'});if(next)params.set('cursor',next);
      const data=await api<TopicPage>('/api/topics?'+params);if(request!==topicRequestId.current)return;
      setTopics(old=>next?[...old,...data.items.filter(t=>!old.some(prior=>prior.id===t.id))]:data.items);setTopicTotal(data.total);setTopicTags(data.tags);setTopicCounts(data.counts);setTopicCursor(data.nextCursor);setTopicLoadedKey(topicQueryKey);
    }catch(e){if(request===topicRequestId.current){setTopicFailedKey(topicQueryKey);fail(e);}}finally{if(request===topicRequestId.current)setLoading(false);}
  },[topicSearch,topicFilter,topicTag,topicQueryKey,fail]);
  useEffect(() => { if (!user) return; let alive = true; loadStatus().catch(e => { if (alive) fail(e); }); return () => { alive = false; }; }, [user,mode,loadStatus,fail]);
  useEffect(()=>{if(mode!=='topics'||!user)return;const timer=setTimeout(()=>void loadTopics(),250);return()=>{clearTimeout(timer);cancelTopicRequest();};},[mode,user,loadTopics,cancelTopicRequest]);
  useEffect(() => { if (mode !== 'discovery' || !user) return; const timer = setTimeout(() => void loadArticles(), 250); return () => { clearTimeout(timer); cancelArticleRequest(); }; }, [mode, user, loadArticles, cancelArticleRequest]);
  useEffect(() => { if (!status?.jobs?.some(j => j.status === 'running')) return; const timer = setInterval(() => { void loadStatus().catch(fail); }, 2000); return () => clearInterval(timer); }, [status, loadStatus, fail]);
  useEffect(() => {
    setDetail(null);
    setDraft(null);
    if (!topicId || !user) return;
    let alive = true;
    setError('');
    void api<TopicDetail>('/api/topics/' + topicId).then(async data => {
      if (!alive) return;
      let recovered: {draft:Topic;briefText:string}|null = null;
      const key=`gzh_topic_draft_${user.id}_${topicId}`;
      try {
        const value=JSON.parse(localStorage.getItem(key) || 'null');
        if (value?.draft?.id === data.topic.id && typeof value.briefText === 'string') {
          const restore=await confirm({
            title:'恢复本机草稿？',
            message:value.draft.revision===data.topic.revision
              ? '发现此选题有本机暂存内容。恢复后可继续编辑。'
              : '服务器上的选题已有更新。恢复本机草稿后，请核对内容再保存。',
            confirmLabel:'恢复草稿',
            cancelLabel:'使用已保存版本',
          });
          if (!alive) return;
          if (restore) recovered=value;
          else skippedRecoveryKey.current=key;
        }
      } catch { /* Open the saved version when a local draft is unreadable. */ }
      if (!alive) return;
      setDetail(data);
      setDraft(recovered ? {...data.topic,...recovered.draft,revision:data.topic.revision} : data.topic);
      setBriefText(recovered?.briefText ?? data.brief?.markdown ?? '');
      setGenerated('');
    }).catch(error=>{if(alive)fail(error);});
    return () => {alive=false;};
  }, [topicId,user,fail,confirm]);
  const action = async (fn: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); setCollectedTopicId(null); try { await fn(); } catch (e) { fail(e); } finally { setBusy(false); } };
  const adopt = (data: TopicDetail) => { setDetail(data); setDraft(data.topic); setBriefText(data.brief?.markdown || ''); };
  const saveTopic = async () => { if (!draft) return; const data = await api<{ topic: Topic }>('/api/topics/' + draft.id, draft, 'PATCH'); setDraft(data.topic); setDetail(old => old ? { ...old, topic: data.topic } : old); return data.topic; };
  const changeArchiveStatus = () => action(async()=>{
    if(!detail||dirty)return;
    const archived=detail.topic.status==='archived';
    const {topic}=await api<{topic:Topic}>('/api/topics/'+detail.topic.id,{status:archived?'research':'archived',revision:detail.topic.revision},'PATCH');
    setDraft(topic);
    setDetail({...detail,topic});
    setNotice(archived?'选题已恢复到待研究':'选题已归档');
    await loadTopics();
  });
  const saveBrief = async () => { const topic = await saveTopic(); if (!topic) return; const data = await api<TopicDetail>('/api/topics/' + topic.id + '/briefs', { revision: topic.revision, markdown: briefText }); adopt(data); setNotice('选题和简报已保存'); await loadTopics(); };
  const generateBrief = async () => {
    if (!detail || !draft || briefRequest.current) return;
    const settings = readPersonalAI();
    const apiKey = settings.apiKey.trim();
    const model = settings.model.trim() || 'gpt-4o';
    if (!apiKey) { setError('请先在工作台设置的「AI 配置」中保存个人 API。'); setSettings(true); return; }
    if (!draft.angle.trim() || !draft.audience.trim()) { setError('请先填写自己的角度和目标读者。'); return; }
    if (briefText && briefText !== (detail.brief?.markdown || '') && !await confirm({
      title:'生成新的 AI 简报？',
      message:'生成成功后会用新版本替换编辑区。当前尚未保存的简报内容将被覆盖。',
      confirmLabel:'生成新简报',
    })) return;
    const controller = new AbortController();
    briefRequest.current = controller;
    try {
      await action(async () => {
        const topic = await saveTopic();
        if (!topic || controller.signal.aborted) return;
        const timeout = AbortSignal.timeout(90_000);
        const signal = AbortSignal.any([controller.signal,timeout]);
        let markdown: string;
        try {
          markdown = await generatePersonalBrief({apiKey,baseUrl:settings.baseUrl.trim(),model},topic,detail.sources,signal);
        } catch(error) {
          if (controller.signal.aborted) return;
          if (timeout.aborted) throw new Error('简报生成超时，请稍后重试。');
          throw error;
        }
        if (controller.signal.aborted) return;
        try {
          const data = await api<TopicDetail>('/api/topics/' + topic.id + '/briefs', {revision:topic.revision,markdown,model}, 'POST', controller.signal);
          if (controller.signal.aborted) return;
          setGenerated('');
          adopt(data);
          setNotice('AI 简报已保存为新版本，请核对事实与引用');
          await loadTopics();
        } catch(error) {
          if (controller.signal.aborted) return;
          setGenerated(markdown);
          throw error;
        }
      });
    } finally {
      briefRequest.current = null;
    }
  };
  const collect = (article: Article) => action(async () => {
    const {topic}=await api<{topic:Topic}>('/api/topics',{articleId:article.id});
    setItems(items=>items.map(item=>item.id===article.id?{...item,savedTopicId:topic.id}:item));
    setSelected(item=>item?.id===article.id?{...item,savedTopicId:topic.id}:item);
    setCollectedTopicId(topic.id);
    setNotice('已加入我的选题，可继续补充自己的角度');
    if(mode==='topics')await loadTopics();
  });
  const openArticle = (id: string) => action(async () => { setSelected((await api<{ article: Article }>('/api/discovery/articles/' + encodeURIComponent(id))).article); });
  const skeleton = () => draft ? `# ${draft.title}\n\n## 我的角度\n\n${draft.angle || '待补充'}\n\n## 目标读者\n\n${draft.audience || '待补充'}\n\n## 原创素材与笔记\n\n${draft.notes || '待补充'}\n\n## 文章提纲\n\n- 想回答的具体问题\n- 用自己的材料展开\n- 结论与限制\n\n## 参考来源\n\n${detail?.sources.map(s => `- [${s.title.replaceAll('[', '').replaceAll(']', '')}](${s.url})`).join('\n') || '待补充'}\n\n## 待核验\n\n请核对事实、数据和引用，不将参考文章直接作为原创正文。` : '';
  const bringToEditor = () => { if (!detail?.brief) return; try {
    if (importMode === 'new') {
      const {id,title}=detail.topic;
      startTopicDraft(localStorage, topicDraftOwner, {id,title}, detail.brief.markdown);
    } else if (importTopicBrief(localStorage, detail.brief.id, detail.brief.markdown, importMode) === 'already-imported') { setNotice('这份简报已在本机带入过，已避免重复插入'); setImportOpen(false); return; }
    void api('/api/topics/' + detail.topic.id, { status: 'imported', revision: detail.topic.revision }, 'PATCH').catch(() => { /* Local draft remains authoritative for import. */ });
    navigate(importMode === 'new' ? topicDraftHref(detail.topic.id) : '/');
  } catch (e) { fail(e); } };
  const title = mode === 'discovery' ? '爆文文章库' : '我的选题';
  return <WorkbenchShell section={mode} userName={user?.email} userRole={user?.role} debugIdentity={localDebug} realAuth draftState="saved" toolbar={null}
    actions={<><button className="rf-button" disabled={busy || loading} onClick={() => void action(async () => { await loadStatus(); if (mode === 'discovery') await loadArticles(); else await loadTopics(); })}><RefreshCw size={14} />刷新本地库</button>{user && mode === 'topics' && <button className="rf-primary" onClick={() => setCreateOpen(true)}><Plus size={14} />新建选题</button>}{status?.canSync && mode === 'discovery' && <button className="rf-primary" onClick={() => setSyncOpen(true)}><Plus size={14} />采集入库</button>}</>}
    onLeave={canLeave} onLogin={async () => { if(await canLeave())navigate('/login', { state: { from: mode === 'topics' ? '/topics' : '/discovery' } }); }} onLogout={async () => { if (await canLeave()) void logout().then(() => { setDevIdentityRole('guest'); setUser(null); setStatus(null); setItems([]); setTopics([]); setDetail(null); }); }} onSettings={() => setSettings(true)} onConsole={async () => { if (await canLeave()) navigate('/admin'); }} onHelp={() => setHelp(true)} onVideo={async () => { if (await canLeave()) navigate('/video-compare'); }}>
    <main className="rf-content" aria-label={title}>
      {localDebug && <div className="rf-message" role="status">本地免登录调测 · 身份由工作台设置控制 · AI 简报使用个人 API · 采集需管理员登录</div>}
      {error && <div className="rf-message error" role="alert">{error}</div>}{notice && <div className="rf-message" role="status"><Check size={16} />{notice}<Link to={collectedTopicId ? "/topics/" + collectedTopicId : "/topics"} onClick={e => guardNavigation(e,canLeave,navigate)}>{collectedTopicId ? "打开该选题" : "查看选题"} <ChevronRight size={13} /></Link></div>}
      {!user ? <div className="rf-empty"><Library size={42} /><h2>登录，打开你的创作资料库。</h2><p>文章在库里积累，选题和笔记只属于你。</p><Link className="rf-primary" to="/login" state={{ from: '/' + mode }}>登录 / 注册</Link></div> : <>
      {mode === 'discovery' ? <>
        <section className="rf-overview"><div><span className="rf-kicker">YOUR READING LIBRARY</span><h2>把好文章留下来。</h2><p>发现内容，研究写法，找到自己的表达。</p></div><div className="rf-stat"><strong>{status?.total ?? '—'}</strong><span>已入库文章</span></div><div className="rf-update"><span className="rf-dot" />RedFox · 每日数据<small>最近成功采集<br />{dateText(status?.lastSuccessfulSyncAt)}</small></div></section>
        <form className="rf-filters" onSubmit={e => { e.preventDefault(); void loadArticles(); }}>
          <label className="rf-search"><Search size={17} /><input aria-label="搜索库内标题或账号" placeholder={searchScope === 'body' ? '搜索库内标题、账号及正文' : '搜索库内标题或账号'} value={q} onChange={e => setQ(e.target.value)} maxLength={100} /></label>
          <label><span>搜索范围</span><select aria-label="搜索范围" value={searchScope} onChange={e => setSearchScope(e.target.value)}><option value="title">标题与账号</option><option value="body">包含正文</option></select></label>
          <label><span>采集赛道</span><select aria-label="赛道筛选" value={category} onChange={e => setCategory(e.target.value)}><option value="">全部赛道</option>{status?.categories.map(c => <option key={c}>{c}</option>)}</select></label>
          <label><span>采集来源</span><select aria-label="榜单筛选" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}><option value="">全部来源</option><option value="original">原创爆款榜</option><option value="tenw">十万阅读榜</option><option value="keywordPremium">关键词 · 优质库</option><option value="keywordWide">关键词 · 广域库</option></select></label>
          <label><span>最早发布</span><input aria-label="最早发布日期" type="date" value={since} onChange={e => setSince(e.target.value)} /></label>
          <label><span>排序</span><select aria-label="文章排序" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">最新发布</option><option value="reads">阅读量下界</option></select></label>
          <label><span>正文</span><select aria-label="正文筛选" value={contentFilter} onChange={e=>setContentFilter(e.target.value)}><option value="">全部文章</option><option value="present">仅看有正文</option></select></label>
        </form>
        <div className="rf-library-note"><span>已显示 {items.length} / {articleTotal ?? "—"} 篇符合条件的文章，浏览不发起采集。</span><span>正文可用 {status?.quality?.withContent ?? '—'} 篇 · 非全网覆盖</span></div>
        {!status?.configured && !localDebug && <div className="rf-message">后台尚未配置 RedFox，已有文章仍可查阅。管理员配置后可手动采集。</div>}
        {status && <CoveragePanel status={status} />}
        {loading && !items.length ? <div className="rf-empty">正在查询文章库…</div> : !items.length ? <div className="rf-empty"><Search size={36} /><h3>{status?.total ? '当前条件下没有文章' : '文章库从第一轮采集开始。'}</h3><p>{status?.canSync ? '点击“采集入库”选择榜单和日期，文章会持续保存在这里。' : '管理员采集后，文章会出现在这里。也可以调整筛选条件。'}</p></div> : <div className="rf-articles">{items.map((a, i) => <article className="rf-article" key={a.id}><span className="rf-index">{String(i + 1).padStart(2, '0')}</span><div className="rf-article-main"><div className="rf-meta"><span>采集：{a.category}</span>{a.providerCategory && <span>来源分类：{a.providerCategory}</span>}{a.original === true && <b>原创</b>}<span>{a.account || '账号未提供'}</span></div><button className="rf-title" onClick={() => void openArticle(a.id)}>{a.title}</button><p>{a.summary.slice(0,110) || '打开详情，查看文章来源与已入库的内容。'}</p><div className="rf-metrics"><span>阅读 <strong>{a.readRaw ?? '暂无'}</strong></span><span>点赞 {a.likesRaw ?? '暂无'}</span><span>在看 {a.watchesRaw ?? '暂无'}</span><small>{dateText(a.publishedAt)}</small></div></div>{a.cover && <img className="rf-cover" src={a.cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none'; }} />}{a.savedTopicId ? <Link className="rf-bookmark" to={'/topics/'+a.savedTopicId} aria-label={'打开已收藏选题：'+a.title}><Check size={18} /><span>已收藏</span></Link> : <button className="rf-bookmark" disabled={busy} onClick={() => void collect(a)} aria-label={'收藏选题：' + a.title}><Bookmark size={18} /><span>收藏</span></button>}</article>)}</div>}
        {cursor && <button className="rf-more" disabled={loading} onClick={() => void loadArticles(cursor)}><ArrowDown size={15} />{loading ? '加载中…' : '加载更多库内文章'}</button>}
        {status?.jobs && <SyncHistory status={status} />}
      </> : <>
        <label className="rf-topic-search"><Search size={16} /><input aria-label="搜索我的选题" placeholder="搜索全部选题的标题、角度、读者或笔记" value={topicSearch} onChange={e => setTopicSearch(e.target.value)} maxLength={100} /></label>
        <label className="rf-topic-search"><span>标签</span><input aria-label="按标签筛选选题" list="rf-topic-tag-options" placeholder="输入或选择标签" value={topicTag} maxLength={20} onChange={e=>setTopicTag(e.target.value)}/><datalist id="rf-topic-tag-options">{topicTags.map(tag=><option key={tag} value={tag}/>)}</datalist>{topicTag&&<button className="rf-button" onClick={()=>setTopicTag('')}>清除标签</button>}</label>
        <div className="rf-topic-tabs">{[['all','全部选题'],['research','待研究'],['writing','待写'],['imported','已带入'],['archived','已归档']].map(([key,label]) => <button className={topicFilter === key ? 'active' : ''} key={key} onClick={() => setTopicFilter(key)}>{label} <small>{topicsReady ? (topicCounts[key] || 0) : "—"}</small></button>)}</div>
        {!topicsReady && topicFailedKey === topicQueryKey ? <div className="rf-empty"><h3>选题读取失败</h3><p>已保存内容保留，请点击上方“刷新本地库”重试。</p></div> : !topicsReady || (loading && !topics.length) ? <div className="rf-empty">正在读取选题…</div> : !topics.length && !topicSearch.trim() && !topicTag.trim() && topicFilter === "all" ? <div className="rf-empty"><Bookmark size={40} /><h2>先留下一点灵感。</h2><p>收藏一篇库内文章，或新建一个属于自己的选题。</p><Link className="rf-primary" to="/discovery">去发现文章 <ArrowUpRight size={15} /></Link></div> : <div className="rf-topics">{!topics.length && <div className="rf-empty"><Search size={28} /><h3>当前条件下没有选题</h3><p>调整关键词，或切换选题状态。</p></div>}{topics.map(t => <Link to={'/topics/' + t.id} className="rf-topic-card" key={t.id} onClick={e => guardNavigation(e,canLeave,navigate)}><div><span className="rf-pill">{statusLabels[t.status]}</span><ChevronRight size={16} /></div><h3>{t.title}</h3><p>{t.angle || '还没有写下自己的角度，打开选题继续。'}</p>{!!t.tags?.length&&<div className="rf-topic-tags">{t.tags.map(tag=><span className="rf-pill" key={tag}>{tag}</span>)}</div>}<footer>{t.source_count || 0} 篇参考<span>{dateText(t.updated_at)}</span></footer></Link>)}</div>}
        {topicsReady && <p className="rf-muted">已显示 {topics.length} / {topicTotal} 条符合条件的选题</p>}
        {topicsReady && topicCursor && <button className="rf-more" disabled={loading} onClick={() => void loadTopics(topicCursor)}><ArrowDown size={15}/>{loading ? "加载中…" : "加载更多选题"}</button>}
      </>}
      </>}
    </main>
    {settings && <WorkbenchSettings onClose={() => setSettings(false)}>{localDebug && <div className="rf-debug-identity"><p>调试身份</p><DevIdentitySwitcher value={devIdentityRole} onChange={async role => { if (!await canLeave()) return; saveDevIdentityRole(role); setDevIdentityRole(role); setUser(null); setStatus(null); setItems([]); setTopics([]); setTopicTags([]); setTopicTag(''); setDetail(null); setDraft(null); setError(''); setNotice(''); }} /></div>}<p className="rf-muted">RedFox 密钥由管理员在服务器配置，浏览器不保存。</p></WorkbenchSettings>}
    {help && <Modal title="让参考成为自己的选题" onClose={() => setHelp(false)}><div className="rf-modal-body"><p>发现文章 → 收藏到选题 → 补充自己的角度、读者与素材 → 编辑或生成原创简报 → 带入排版。</p><p>阅读“10w+”是下界，不能当精确数；原文数据按来源展示。正文缺失时不会假装已读全文。</p></div></Modal>}
    {syncOpen && <CollectionModal status={status} onClose={() => setSyncOpen(false)} onStarted={async () => { setSyncOpen(false); setNotice('采集任务已启动，完成后点击“刷新本地库”查看文章'); await loadStatus().catch(fail); }} />}
    {selected && <Modal title="文章详情" onClose={() => setSelected(null)}><div className="rf-modal-body"><span className="rf-pill">RedFox · 已入库</span><h2 className="rf-detail-title">{selected.title}</h2><p className="rf-muted">{selected.account} · {dateText(selected.publishedAt)} · 阅读 {selected.readRaw ?? '暂无'}</p><div className="rf-detail-actions"><a className="rf-button" href={selected.url} target="_blank" rel="noopener noreferrer">打开原文 <ArrowUpRight size={15} /></a>{selected.savedTopicId ? <Link className="rf-button" to={'/topics/'+selected.savedTopicId} onClick={()=>setSelected(null)}><Check size={15} />打开已收藏选题</Link> : <button className="rf-primary" disabled={busy} onClick={() => void collect(selected)}><Bookmark size={15} />收藏为选题</button>}</div><p className="rf-muted">入库 {dateText(selected.firstSeen)} · 最近采集 {dateText(selected.updatedAt)}</p><dl className="rf-provenance"><div><dt>采集赛道</dt><dd>{selected.category}</dd></div><div><dt>供应商分类</dt><dd>{selected.providerCategory || '未记录'}</dd></div><div><dt>原始字段</dt><dd>{selected.rawData ? '已留档' : '历史记录未留档'}</dd></div></dl><section className="rf-original"><h3>参考正文</h3><p>{selected.content ? articleText(selected.content) : '当前记录没有正文，暂时只能参考标题、摘要和指标。可打开原文核对。'}</p></section><p className="rf-muted">原文仅供研究，创作请保留自己的材料和判断。</p></div></Modal>}
    {createOpen && <Modal title="新建选题" onClose={() => setCreateOpen(false)}><form className="rf-modal-body rf-form" onSubmit={e => { e.preventDefault(); void action(async () => { const data = await api<{ topic: Topic }>('/api/topics', { title: newTitle }); setCreateOpen(false); setNewTitle(''); await loadTopics(); navigate('/topics/' + data.topic.id); }); }}><label>暂定标题<input autoFocus required maxLength={300} value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="这篇文章，你想回答什么问题？" /></label><button className="rf-primary" disabled={busy}>创建选题</button></form></Modal>}
    {topicId && detail && draft && <Modal title="把灵感变成写作简报" onClose={async () => { if (await canLeave()) navigate('/topics'); }}><div className="rf-modal-body rf-form"><div className="rf-two"><label>暂定标题<input disabled={busy} value={draft.title} maxLength={300} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><label>选题状态<select disabled={busy} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Topic['status'] })}>{['research','writing','imported','archived'].map(s => <option value={s} key={s}>{statusLabels[s]}</option>)}</select></label></div><label>标签<input aria-label="选题标签" disabled={busy} maxLength={168} placeholder="用逗号分隔，例如 AI 工具,教程" value={(draft.tags??[]).join(',')} onChange={e=>setDraft({...draft,tags:e.target.value.split(/[,，、]/)})}/></label><label>自己的角度<textarea disabled={busy} rows={2} maxLength={2000} value={draft.angle} onChange={e => setDraft({ ...draft, angle: e.target.value })} placeholder="你认同什么，又想补充什么？" /></label><label>目标读者<input disabled={busy} maxLength={500} value={draft.audience} onChange={e => setDraft({ ...draft, audience: e.target.value })} /></label><label>自己的材料和笔记<textarea disabled={busy} rows={4} maxLength={15000} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="写下自己知道的事，标明还需要核实的部分。" /></label><div className="rf-sources"><button className="rf-button" disabled={busy} onClick={() => { setSourcePicker(true); void action(async () => { setSourceChoices((await api<{ items: Article[] }>('/api/discovery/articles')).items); }); }}>添加参考文章</button><strong>参考来源 · {detail.sources.length}</strong><TopicSources sources={detail.sources} busy={busy} onView={id => void openArticle(id)} onRemove={id => void action(async () => { const t = await saveTopic(); if (!t) return; const data = await api<TopicDetail>('/api/topics/' + t.id + '/sources', { articleId: id, revision: t.revision }, 'DELETE'); setDetail(data); setDraft(data.topic); setNotice('参考已移除，笔记与简报保留，请核对简报中的引用'); await loadTopics(); })} /></div><div className="rf-detail-actions"><button className="rf-button" disabled={busy} onClick={() => void action(async () => { await saveTopic(); setNotice('选题笔记已保存'); await loadTopics(); })}>保存选题</button><button className="rf-button" disabled={busy||dirty} title={dirty?'请先保存修改':undefined} onClick={()=>void changeArchiveStatus()}>{detail.topic.status==='archived'?'移回待研究':'归档选题'}</button><button className="rf-button" disabled={busy} onClick={async () => { if (!briefText || await confirm({title:'用笔记骨架替换简报？',message:'将用当前笔记生成的骨架替换简报编辑区；保存前，已存简报不会变动。',confirmLabel:'替换为骨架'})) setBriefText(skeleton()); }}><FileText size={14} />用笔记整理骨架</button><button className="rf-button" disabled={busy} onClick={() => void generateBrief()}><Sparkles size={14} />AI 原创简报</button><button className="rf-button" disabled={busy || !detail.brief} onClick={() => setHistoryTopicId(detail.topic.id)}>简报历史</button></div><label>原创简报<textarea disabled={busy} className="rf-brief-editor" rows={14} maxLength={40000} value={briefText} onChange={e => setBriefText(e.target.value)} placeholder="可手工编辑，也可用自己的笔记整理骨架。模型建议需要你核对。" /></label>{generated && <label>AI 简报已生成但未保存，可复制后核对<textarea readOnly rows={8} value={generated} /></label>}{detail.brief && <small className="rf-muted">当前已存版本 · {detail.brief.kind === 'model' ? `模型 ${detail.brief.model}` : '手工编辑'} · {dateText(detail.brief.created_at)}</small>}{error && <p role="alert" className="rf-error-text">{error}</p>}<div className="rf-detail-actions"><button className="rf-primary" disabled={busy || !briefText.trim()} onClick={() => void action(saveBrief)}>保存选题与简报</button><button className="rf-button" disabled={busy || dirty || !detail.brief} onClick={() => { setImportMode(hasTopicDraft ? 'append' : 'new'); setImportOpen(true); }}>带入文章排版 <ArrowUpRight size={15} /></button><button className="rf-button" disabled={busy || dirty || !detail.brief} title={dirty?'请先保存选题与简报':undefined} onClick={()=>setWritingTopicId(detail.topic.id)}><Sparkles size={14}/>用简报写初稿</button>{hasTopicDraft && <Link className="rf-primary" to={topicDraftHref(detail.topic.id)} onClick={e=>guardNavigation(e,canLeave,navigate)}>继续写作 <ArrowUpRight size={15} /></Link>}</div><p className="rf-muted">带入使用已保存的简报，不会自动复制参考文章全文。已带入不代表已发布。</p></div></Modal>}
    {detail && topicId === historyTopicId && detail.topic.id === historyTopicId && <BriefHistory key={historyTopicId} topicId={historyTopicId} currentId={detail.brief?.id} onClose={()=>setHistoryTopicId(null)} onUse={async markdown=>{
      if(markdown!==briefText && briefText!==(detail.brief?.markdown ?? '') && !await confirm({title:'载入历史简报？',message:'这会替换编辑区尚未保存的内容。历史版本会保留。',confirmLabel:'载入历史版本'}))return;
      setBriefText(markdown);
      setHistoryTopicId(null);
    }}/>}
    {sourcePicker && detail && <Modal title="从库中补充参考文章" onClose={() => setSourcePicker(false)}><div className="rf-modal-body rf-form"><form onSubmit={e => { e.preventDefault(); void action(async () => { setSourceChoices((await api<{ items: Article[] }>('/api/discovery/articles?q=' + encodeURIComponent(sourceSearch))).items); }); }}><label>搜索本地文章库<input value={sourceSearch} onChange={e => setSourceSearch(e.target.value)} maxLength={100} /></label><button className="rf-button" disabled={busy}>搜索</button></form>{sourceChoices.map(a => <button className="rf-button" key={a.id} disabled={busy || detail.sources.some(s => s.id === a.id)} onClick={() => void action(async () => { const t = await saveTopic(); if (!t) return; const data = await api<TopicDetail>('/api/topics/' + t.id + '/sources', { articleId: a.id, revision: t.revision }); setDetail(data); setDraft(data.topic); setSourcePicker(false); setNotice('参考已关联，原有简报未改动'); })}>{a.title}<Plus size={14} /></button>)}{!sourceChoices.length && <p>当前条件下暂无已入库文章。</p>}{error && <p role="alert" className="rf-error-text">{error}</p>}</div></Modal>}
    {importOpen && detail?.brief && <Modal title="预览带入排版" onClose={() => setImportOpen(false)}>
      <div className="rf-modal-body rf-form">
        <label>写入方式<select value={importMode} onChange={e => setImportMode(e.target.value)}>
          <option value="new" disabled={hasTopicDraft}>新建选题草稿</option>
          <option value="append">追加到排版页的常规草稿</option>
          <option value="replace">替换排版页的常规草稿（可撤销）</option>
        </select></label>
        {hasTopicDraft && <p className="rf-muted">已有选题草稿，可关闭预览后点击「继续写作」。</p>}
        <textarea aria-label="已保存的简报预览" readOnly rows={12} value={detail.brief.markdown} />
        <button className="rf-primary" onClick={bringToEditor}>保存并进入排版</button>
        {error && <p role="alert" className="rf-error-text">{error}</p>}
      </div>
    </Modal>}
    {detail?.brief && topicId===writingTopicId && detail.topic.id===writingTopicId && <ArticleWritingModal
      key={topicDraftOwner+'/'+writingTopicId} detail={detail} owner={topicDraftOwner}
      onClose={()=>setWritingTopicId(null)} onSettings={()=>setSettings(true)}
      onAdopt={()=>{
        setWritingTopicId(null);
        navigate(topicDraftHref(detail.topic.id));
      }}
    />}
    {confirmation}
  </WorkbenchShell>;
}
