import {useEffect,useRef,useState} from 'react';
import {generatePicture} from '../../services/imageGeneration';

export interface GeneratedPicture {blob:Blob;url:string}

const pictureStyles=[
  {id:'auto',label:'自动搭配',description:''},
  {id:'editorial',label:'杂志插画',description:'现代杂志编辑插画，构图简洁，有明确视觉重点和适度留白。'},
  {id:'photo',label:'真实摄影感',description:'自然光、真实材质和适度景深，像生活摄影。画面是概念配图，避免伪造新闻现场、实验记录或产品实拍。'},
  {id:'flat',label:'扁平插画',description:'扁平矢量感，干净的几何色块、清晰轮廓和有限的配色。'},
  {id:'sketch',label:'手绘线稿',description:'手绘墨线，少量点缀色和自然纸张质感，轮廓简洁。'},
  {id:'collage',label:'复古拼贴',description:'复古纸片拼贴，叠加剪纸边缘和轻微印刷纹理，保持主体突出。'},
  {id:'3d',label:'3D 渲染',description:'简洁的三维造型、柔和的棚拍光线和清楚的空间关系。'},
  {id:'custom',label:'自定义风格',description:''},
];

export function PictureGenerator({initialPrompt,label,onPicture,onSettings}:{initialPrompt:string;label:string;onPicture:(picture:GeneratedPicture|null)=>void;onSettings?:()=>void}){
  const [prompt,setPrompt]=useState(initialPrompt);
  const [style,setStyle]=useState('auto');
  const [customStyle,setCustomStyle]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [picture,setPicture]=useState<GeneratedPicture|null>(null);
  const request=useRef<AbortController|null>(null);
  const objectUrl=useRef('');
  useEffect(()=>()=>{
    request.current?.abort();
    if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
  },[]);

  const styleDescription=style==='custom'?customStyle.trim():pictureStyles.find(option=>option.id===style)?.description;
  const canGenerate=Boolean(prompt.trim()&&(style!=='custom'||styleDescription));

  async function generate(){
    if(!canGenerate||request.current)return;
    const controller=new AbortController();
    request.current=controller;
    setBusy(true);
    setError('');
    const timeout=AbortSignal.timeout(180000);
    try{
      const fullPrompt=styleDescription?`${prompt.trim()}\n\n画面风格：${styleDescription}`:prompt.trim();
      const blob=await generatePicture(fullPrompt,AbortSignal.any([timeout,controller.signal]));
      if(controller.signal.aborted)return;
      const bitmap=await createImageBitmap(blob);
      bitmap.close();
      if(controller.signal.aborted)return;
      const url=URL.createObjectURL(blob);
      if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);
      objectUrl.current=url;
      const result={blob,url};
      setPicture(result);
      onPicture(result);
    }catch(err){
      if(controller.signal.aborted)return;
      setError(timeout.aborted?'生图请求超时，请在供应商后台确认是否已完成。':err instanceof TypeError?'未能连接生图接口或下载结果，请检查地址及跨域设置。':err instanceof Error?err.message:'生图失败，请重试。');
    }finally{
      request.current=null;
      if(!controller.signal.aborted)setBusy(false);
    }
  }

  return <div className="space-y-3 rounded-xl border border-gray-300/40 p-3 text-sm">
    <label className="block">画面风格
      <select aria-label="画面风格" className="mt-1 w-full rounded-md border border-gray-400/40 bg-transparent p-2" value={style} disabled={busy} onChange={e=>setStyle(e.target.value)}>
        {pictureStyles.map(option=><option className="bg-white text-slate-900" key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
    {style==='custom'?<label className="block">自定义风格描述
      <textarea className="mt-1 w-full rounded-md border border-gray-400/40 bg-transparent p-2" rows={2} maxLength={400} value={customStyle} disabled={busy} onChange={e=>setCustomStyle(e.target.value)} placeholder="例如纸面铅笔速写，灰绿主色，光线柔和"/>
    </label>:styleDescription&&<p className="text-xs opacity-80">{styleDescription}</p>}
    <label className="block">生图提示词<textarea className="mt-1 w-full rounded-md border border-gray-400/40 bg-transparent p-2" rows={4} maxLength={4000} value={prompt} disabled={busy} onChange={e=>setPrompt(e.target.value)}/></label>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy||!canGenerate} onClick={()=>void generate()} className="rounded-lg bg-emerald-700 px-3 py-2 text-white disabled:opacity-50">{busy?'正在生成一张图片…':label}</button>
      {onSettings&&<button type="button" onClick={onSettings} className="underline">生图 API 设置</button>}
      {picture&&<a href={picture.url} download={`ai-image.${picture.blob.type.split('/')[1]}`} className="underline">下载原图</a>}
      {picture&&<button type="button" disabled={busy} onClick={()=>{setPicture(null);onPicture(null);}} className="underline">移除图片</button>}
    </div>
    {error&&<p role="alert" className="text-red-500">{error}</p>}
  </div>;
}
