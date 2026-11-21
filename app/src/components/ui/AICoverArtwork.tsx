import {useEffect,useRef} from 'react';

export const AI_COVER_WIDTH=1000;
export const AI_COVER_HEIGHT=426;

export function AICoverArtwork({image,title,subtitle,author,alignment,crop}:{image:Blob;title:string;subtitle:string;author:string;alignment:'left'|'right';crop:number}){
  const imageRef=useRef<HTMLImageElement>(null);
  useEffect(()=>{
    const element=imageRef.current;
    if(!element)return;
    const url=URL.createObjectURL(image);
    element.src=url;
    return ()=>{
      element.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  },[image]);
  return <div style={{position:'relative',width:AI_COVER_WIDTH,height:AI_COVER_HEIGHT,overflow:'hidden',background:'#18271f',color:'#fff',fontFamily:'system-ui, sans-serif'}}>
    <img ref={imageRef} alt="" style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:`50% ${crop}%`}}/>
    <div style={{position:'absolute',inset:0,background:`linear-gradient(to ${alignment==='left'?'right':'left'}, rgba(0,0,0,.78), rgba(0,0,0,.12) 76%)`}}/>
    <div style={{position:'absolute',width:'67%',top:'50%',transform:'translateY(-50%)',[alignment]:55,textAlign:alignment,overflowWrap:'anywhere'}}>
      <div style={{fontWeight:750,fontSize:title.length>32?42:54,lineHeight:1.16}}>{title}</div>
      {subtitle&&<div style={{marginTop:16,fontSize:25,lineHeight:1.35}}>{subtitle}</div>}
      {author&&<div style={{marginTop:20,fontSize:19}}>{author}</div>}
    </div>
  </div>;
}
