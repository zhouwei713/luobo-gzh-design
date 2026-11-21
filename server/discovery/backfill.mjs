import {validateKeyword,validateSync} from './provider.mjs';
export function planBackfill(input,maxRequests=7){
 if(input?.mode==='keyword'){
  const params=validateKeyword(input);
  return {params,steps:[params]};
 }
 const params=validateSync(input),mode=input.mode??'range';
 if(!['range','daily'].includes(mode))throw new Error('采集方式无效');
 if(mode==='range')return {params:{...params,mode},steps:[params]};
 const count=(Date.parse(params.endDate)-Date.parse(params.startDate))/86400000+1;
 if(count>maxRequests)throw new Error(`逐日补采单次最多 ${maxRequests} 天，请缩小日期范围`);
 const steps=Array.from({length:count},(_,index)=>{const date=new Date(Date.parse(params.startDate)+index*86400000).toISOString().slice(0,10);return {...params,startDate:date,endDate:date};});
 return {params:{...params,mode},steps};
}
export const publicSyncError=e=>e.name==='AbortError'?'采集中断，请检查请求记录后重试':e.status===429?'今日采集预算已用完，剩余日期未请求':/^RedFox|^未配置/.test(e.message)?e.message:'采集失败，已入库文章保留，请检查服务配置后重试';
