import {useRef,useState} from 'react';
import {Modal} from './WorkspaceModal';
import {PictureGenerator,type GeneratedPicture} from './PictureGenerator';
import {compressImageToBlob,loadCdnConfig,loadR2Config,loadUploadMode,uploadImageToCdn,uploadImageToR2} from '../../services/imageUpload';
import type {IllustrationPlanItem} from '../../services/illustrationService';

export function ArticlePictureModal({item,onClose,onSettings,onInsert}:{item:IllustrationPlanItem;onClose:()=>void;onSettings:()=>void;onInsert:(url:string,alt:string)=>void}){
  const [picture,setPicture]=useState<GeneratedPicture|null>(null);
  const [alt,setAlt]=useState(item.alt);
  const [error,setError]=useState('');
  const [uploading,setUploading]=useState(false);
  const uploadStarted=useRef(false);
  const [uploaded,setUploaded]=useState<{picture:GeneratedPicture;url:string}|null>(null);

  async function insert(){
    if(!picture||uploadStarted.current)return;
    setError('');
    uploadStarted.current=true;
    setUploading(true);
    try{
      let url=uploaded?.picture===picture?uploaded.url:null;
      if(!url){
        const mode=loadUploadMode();
        const cdn=mode==='custom'?loadCdnConfig():null;
        const server=mode==='r2'?loadR2Config():null;
        if(!cdn?.uploadUrl&&!server?.workerUrl)throw new Error('请先在「工作台设置 → 图片上传」配置图床，或下载后自行上传。');
        const jpeg=await compressImageToBlob(new File([picture.blob],'inline-image',{type:picture.blob.type}),1440);
        try{url=cdn?await uploadImageToCdn(jpeg,cdn):await uploadImageToR2(jpeg,server!);}
        catch{throw new Error('上传图床失败。图片仍可下载，请检查图片上传设置后重试。');}
        const imageUrl=new URL(url,location.href);
        if(imageUrl.protocol!=='https:')throw new Error('图床需返回可访问的 HTTPS 图片地址。');
        url=imageUrl.href;
        setUploaded({picture,url});
      }
      onInsert(url,alt);
    }catch(err){
      setError(err instanceof Error?err.message:'无法插入图片，请重试。');
    }finally{
      uploadStarted.current=false;
      setUploading(false);
    }
  }

  return <Modal title="生成正文插图" onClose={()=>{if(!uploading)onClose();}}>
    <div className="space-y-4 p-6">
      <p>插入位置：{!item.anchor.heading||item.anchor.heading==='正文概览'?'文末':`「${item.anchorLabel}」标题之后`}</p>
      <PictureGenerator label="生成一张插图" initialPrompt={`为公众号文章制作一张横版正文插图。位置：${item.anchorLabel}。用途：${item.purpose}。参考内容：${item.anchor.excerpt||item.reason}。清楚的视觉重点，不要文字、标志或水印。`} onPicture={setPicture} onSettings={onSettings}/>
      {picture&&<>
        <img className="max-h-[45vh] w-full rounded-xl object-contain" src={picture.url} alt={alt}/>
        <label className="block">图片说明<input className="ml-2 rounded border border-gray-400/40 bg-transparent p-2" value={alt} maxLength={150} onChange={e=>setAlt(e.target.value)}/></label>
        <button type="button" disabled={uploading} className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-50" onClick={()=>void insert()}>{uploading?'正在上传…':'上传并插入正文'}</button>
      </>}
      {error&&<p role="alert" className="text-red-500">{error}</p>}
    </div>
  </Modal>;
}
