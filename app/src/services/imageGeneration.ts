import {readPersonalAI} from './personalAISettings';

export interface ImageGenerationSettings {
  model:string;
  baseUrl:string;
  apiKey:string;
  reuseTextApi:boolean;
}

const key='gzh_image_generation_settings';
const defaults:ImageGenerationSettings={model:'',baseUrl:'',apiKey:'',reuseTextApi:true};

export function loadImageGenerationSettings():ImageGenerationSettings {
  try{return {...defaults,...JSON.parse(localStorage.getItem(key)||'{}')};}
  catch{return defaults;}
}

export function saveImageGenerationSettings(settings:ImageGenerationSettings) {
  localStorage.setItem(key,JSON.stringify(settings));
}

function endpoint(baseUrl:string) {
  const url=new URL(baseUrl.trim()||'https://api.openai.com/v1');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))){
    throw new Error('生图接口请使用 HTTPS。');
  }
  if(url.username||url.password||url.search||url.hash)throw new Error('请填写生图服务的 Base URL。');
  const path=url.pathname.replace(/\/+$/,'').replace(/\/chat\/completions$/,'');
  url.pathname=path.endsWith('/images/generations')?path:(path||'/v1')+'/images/generations';
  return url.href;
}

export async function generatePicture(prompt:string,signal:AbortSignal) {
  const settings=loadImageGenerationSettings();
  const text=settings.reuseTextApi?readPersonalAI():null;
  const apiKey=(text?.apiKey??settings.apiKey).trim();
  if(!apiKey||!settings.model.trim())throw new Error('请先在工作台设置的「AI 配置」中填写生图模型和 API Key。');
  let url:string;
  try{url=endpoint(settings.baseUrl||text?.baseUrl||'');}
  catch(error){if(error instanceof TypeError)throw new Error('生图接口地址格式无效。');throw error;}
  const response=await fetch(url,{
    method:'POST',signal,redirect:'error',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},
    body:JSON.stringify({model:settings.model.trim(),prompt,n:1,size:'1536x1024'}),
  });
  if(!response.ok)throw new Error(`生图失败（HTTP ${response.status}）。请检查生图配置或供应商额度。`);
  const {data}=await response.json();
  const result=data?.[0];
  let blob:Blob;
  if(typeof result?.b64_json==='string'){
    if(result.b64_json.length>20_000_000)throw new Error('图片体积过大。');
    const bytes=Uint8Array.from(atob(result.b64_json),character=>character.charCodeAt(0));
    blob=new Blob([bytes],{type:'image/png'});
  }else if(typeof result?.url==='string'){
    const imageUrl=new URL(result.url);
    if(imageUrl.protocol!=='https:')throw new Error('生图服务需返回 HTTPS 图片链接。');
    const image=await fetch(imageUrl,{signal,credentials:'omit'});
    if(!image.ok)throw new Error('未能下载生图结果。');
    blob=await image.blob();
  }else throw new Error('生图服务未返回可用图片。');
  if(blob.size>15_000_000||!/^image\/(png|jpeg|webp)$/.test(blob.type))throw new Error('图片格式或体积不受支持。');
  return blob;
}
