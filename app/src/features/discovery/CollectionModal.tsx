import {useEffect,useState} from 'react';
import {api,dateText,type Coverage,type LibraryStatus} from './api';
import {Modal} from './ResearchModal';
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const yesterday=()=>new Date(Date.now()+8*3600000-86400000).toISOString().slice(0,10);
export function CollectionModal({status,onClose,onStarted}:{status:LibraryStatus|null;onClose:()=>void;onStarted:()=>Promise<void>}){
 const [mode,setMode]=useState('range'),[category,setCategory]=useState('科技数码'),[source,setSource]=useState('original');
 const [keyword,setKeyword]=useState(''),[keywordSource,setKeywordSource]=useState('keywordPremium'),[exactMatch,setExactMatch]=useState(false);
 const [startDate,setStartDate]=useState(yesterday),[endDate,setEndDate]=useState(yesterday);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [skipCollected,setSkipCollected]=useState(true),[coverage,setCoverage]=useState<{key:string;data:Coverage}|null>(null),[coverageError,setCoverageError]=useState('');
 const days=(Date.parse(endDate)-Date.parse(startDate))/86400000+1;
 const coverageKey=JSON.stringify([category,source,startDate,endDate]);
 const needsCoverage=mode==='daily'&&skipCollected&&Number.isFinite(days)&&days>0&&days<=60;
 const checked=coverage?.key===coverageKey?coverage.data:null;
 useEffect(()=>{
  if(!needsCoverage)return;const controller=new AbortController();setCoverageError('');
  void api<Coverage>('/api/discovery/coverage?'+new URLSearchParams({category,source,startDate,endDate}),undefined,'GET',controller.signal).then(data=>setCoverage({key:coverageKey,data})).catch(e=>{if(!controller.signal.aborted)setCoverageError(e instanceof Error?e.message:'日期记录读取失败');});
  return ()=>controller.abort();
 },[needsCoverage,category,source,startDate,endDate,coverageKey]);
 const skipped=needsCoverage?(checked?.days.filter(d=>d.state==='daily').length??0):0;
 const requests=mode==='daily'?days-skipped:1,remaining=Math.max(0,(status?.dailyLimit??0)-(status?.used??0));
 const maxBatch=status?.maxBatchRequests??7;
 const invalid=mode==='keyword'?(!keyword.trim()||requests>remaining):(!Number.isFinite(days)||days<1||days>60||(mode==='daily'&&days>maxBatch)||requests>remaining||requests===0);
 const checking=needsCoverage&&!checked;
 return <Modal title="采集到文章库" onClose={()=>{if(!busy)onClose();}}>
  <form className="rf-modal-body rf-form" onSubmit={async e=>{
   e.preventDefault();if(invalid||busy||checking)return;setBusy(true);setError('');
   const params=mode==='keyword'?{mode,source:keywordSource,keyword:keyword.trim(),exactMatch}:{mode,category,source,startDate,endDate,skipCollected:mode==='daily'&&skipCollected};
   try{await api('/api/discovery/sync',params);await onStarted();}
   catch(e){setError(e instanceof Error?e.message:'采集提交失败');}
   finally{setBusy(false);}
  }}>
   <p>采集结果会保存到文章库，重复文章会合并。</p>
   <label>采集方式<select aria-label="采集方式" value={mode} disabled={busy} onChange={e=>setMode(e.target.value)}><option value="range">按区间采集 · 最多 1 次请求</option><option value="daily">逐日补采 · 每天最多 1 次请求</option>{status?.canSearchKeywords&&<option value="keyword">关键词采集 · 最多 1 次请求</option>}</select></label>
   {mode==='keyword'?<>
    <label>关键词<input aria-label="采集关键词" required maxLength={100} disabled={busy} value={keyword} onChange={e=>setKeyword(e.target.value)}/></label>
    <label>搜索范围<select aria-label="关键词数据源" value={keywordSource} disabled={busy} onChange={e=>setKeywordSource(e.target.value)}><option value="keywordPremium">优质库</option><option value="keywordWide">广域库</option></select></label>
    <label className="rf-skip-collected"><input type="checkbox" checked={exactMatch} disabled={busy} onChange={e=>setExactMatch(e.target.checked)}/>精准匹配完整短语</label>
   </>:<>
   <div className="rf-two"><label>榜单<select value={source} disabled={busy} onChange={e=>setSource(e.target.value)}><option value="original">原创爆款榜</option><option value="tenw">十万阅读榜</option></select></label><label>采集赛道<select value={category} disabled={busy} onChange={e=>setCategory(e.target.value)}>{status?.categories.map(c=><option key={c}>{c}</option>)}</select></label></div>
   <div className="rf-two"><label>开始日期<input required type="date" max={today()} value={startDate} disabled={busy} onChange={e=>setStartDate(e.target.value)}/></label><label>结束日期<input required type="date" max={today()} min={startDate} value={endDate} disabled={busy} onChange={e=>setEndDate(e.target.value)}/></label></div>
   {mode==='daily'&&<label className="rf-skip-collected"><input aria-label="跳过已成功查询日期" type="checkbox" checked={skipCollected} disabled={busy} onChange={e=>setSkipCollected(e.target.checked)}/>跳过已有成功当日查询的日期</label>}
   {needsCoverage&&<p className="rf-muted">{coverageError|| (checking?'正在核对库内记录…':`将跳过 ${skipped} 天；区间查询涉及的日期不自动跳过。如需更新已查日期的指标，可取消此选项。`)}</p>}
   </>}
   <div className="rf-collection-budget"><strong>本次最多请求 {Number.isFinite(requests)&&requests>0?requests:'—'} 次</strong><span>今日剩余预算 {remaining} 次</span><p>{mode==='keyword'?'查询结果按所选数据源入库。':mode==='daily'?`单批最多 ${maxBatch} 天，按日期顺序采集。任一天失败即停止，后续日期不会自动请求。`:'区间查询不保证返回所有文章；某些榜单有返回数量限制，可改用逐日补采。'}</p></div>
   {invalid&&<p className="rf-error-text">{mode==='keyword'?'请填写关键词并确认今日仍有请求预算。':requests===0?'所选日期已有成功当日查询，无需补采。取消跳过选项可重新查询。':`请检查日期范围与剩余预算。区间最多60天，逐日补采最多${maxBatch}天。`}</p>}
   <p className="rf-muted">{mode==='keyword'?'关键词采集只请求第一页，不自动补抓正文或翻页。':'榜单文档说明每日18:30更新昨日数据。采集赛道是请求条件，文章自身分类以供应商准。'}此操作可能扣除 RedFox 接口额度，浏览文章库不会扣除。</p>
   {error&&<p role="alert" className="rf-error-text">{error}</p>}
   <button className="rf-primary" disabled={busy||invalid||checking||!status?.configured}>{busy?'正在提交…':checking?'正在核对日期…':`开始采集（最多 ${Number.isFinite(requests)?requests:0} 次请求）`}</button>
  </form>
 </Modal>;
}
const labels:Record<string,string>={queued:'待请求',running:'采集中',completed:'已完成',partial:'部分完成',failed:'失败',interrupted:'已中断',cancelled:'未请求'};
const keywordLabel=(source:string)=>source==='keywordWide'?'广域库':'优质库';
export function SyncHistory({status}:{status:LibraryStatus}){
 return <section className="rf-history"><h3>最近采集记录<span>今日请求 {status.used} / {status.dailyLimit}</span></h3>
  {status.jobs?.length?status.jobs.map(j=><div className="rf-job" key={j.id}>
   <div className="rf-job-heading"><span>{j.params.category} · {j.params.mode==='keyword'?keywordLabel(j.params.source):j.params.source==='original'?'原创榜':'十万阅读榜'}<small>{j.params.mode==='keyword'?j.params.keyword:`${j.params.startDate} 至 ${j.params.endDate} · ${j.params.mode==='daily'?'逐日补采':'区间采集'}`}</small></span><span>{labels[j.status]||j.status}<small>已计入预算 {j.requests_used??1} / 最多 {j.request_budget??1} 次</small></span></div>
   <p>新增 {j.new_count} · 更新 {j.updated_count} · 跳过记录 {j.skipped_count}{j.error&&` · ${j.error}`}</p>
   {Boolean(j.params.skippedDates?.length)&&<p>跳过已有当日查询：{j.params.skippedDates?.join('、')}</p>}
   {Boolean(j.steps?.length)&&<details><summary>查看每次请求结果</summary><ol>{j.steps?.map(s=><li key={s.step_index}><span>{s.params.mode==='keyword'?s.params.keyword:`${s.params.startDate}${s.params.endDate!==s.params.startDate?' 至 '+s.params.endDate:''}`}</span><span>{labels[s.status]||s.status} · {s.attempted?'已计入请求预算':'未请求'}<small>{s.error||`新增 ${s.new_count} · 更新 ${s.updated_count} · 跳过 ${s.skipped_count}`}</small></span></li>)}</ol></details>}
   <small>任务开始 {dateText(j.created_at)}</small>
  </div>):<p>暂无采集记录。不会自动请求供应商接口。</p>}
 </section>;
}
