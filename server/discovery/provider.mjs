export const categories = ['总排名','人文资讯','知识百科','健康养生','时尚潮流','乐活生活','旅游出行','搞笑幽默','情感心理','体育娱乐','美容美体','文摘精选','财富理财','科技数码','创投商业','汽车交通','房产楼市','职场发展','教育考试','学术研究','企业品牌'];
export const sources = { tenw: '/story/api/cozeSkill/getTenWReadingRank', original: '/story/api/cozeSkill/getOriginalRank' };
export const keywordSources = { keywordPremium:'/story/api/gzhData/searchArticle',keywordWide:'/story/api/gzh/data/searchArticle' };
export const keywordCategory='关键词采集';

export function validateKeyword(input){
  const keyword=typeof input.keyword==='string'?input.keyword.trim():'';
  if(!Object.hasOwn(keywordSources,input.source))throw new Error('请选择关键词数据源');
  if(!keyword||keyword.length>100)throw new Error('关键词长度须为1至100字');
  if(input.exactMatch!==undefined&&typeof input.exactMatch!=='boolean')throw new Error('匹配方式无效');
  return {mode:'keyword',source:input.source,keyword,exactMatch:input.exactMatch===true,category:keywordCategory};
}
export function metric(input) {
  if (input === null || input === undefined || input === '') return { value: null, exact: false, raw: null };
  const raw = String(input).trim().slice(0, 40);
  const match = /^(\d+(?:\.\d+)?)(w|万|亿)?(\+)?$/i.exec(raw);
  if (!match) return { value: null, exact: false, raw };
  const value = Number(match[1]) * (match[2] === '亿' ? 1e8 : match[2] ? 1e4 : 1);
  return { value: Number.isSafeInteger(value) ? value : null, exact: !match[2] && !match[3], raw };
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function validateSync(input) {
  if (!input || !Object.hasOwn(sources, input.source) || !categories.includes(input.category)) throw new Error('请选择有效榜单和分类');
  if (!validDate(input.startDate) || !validDate(input.endDate) || input.endDate < input.startDate) throw new Error('日期范围无效');
  if ((Date.parse(input.endDate) - Date.parse(input.startDate)) / 86400000 > 59) throw new Error('单次日期范围最多 60 天');
  const today = new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  if (input.endDate > today) throw new Error('不能采集未来日期');
  return { source: input.source, category: input.category, startDate: input.startDate, endDate: input.endDate };
}
function text(value, limit) {
  return String(value ?? '').replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {const c = n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):'';}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, x) => ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[x]).slice(0, limit);
}
export function normalizeArticle(row, category) {
  const id = String(row.photoId ?? row.workUuid ?? '');
  const title = text(row.title, 600).trim();
  if (!/^[\w-]{1,160}$/.test(id) || !title) throw new Error('文章缺少有效标识或标题');
  const link = new URL(row.oriUrl ?? row.workUrl);
  if (!['http:','https:'].includes(link.protocol) || link.hostname !== 'mp.weixin.qq.com' || link.username || link.password || link.port) throw new Error('文章链接无效');
  link.protocol = 'https:';
  let cover = '';
  try {const u = new URL(row.coverUrl);if(['http:','https:'].includes(u.protocol) && !u.username && !u.password){u.protocol='https:';cover=u.href.slice(0,2048);}}catch{ /* Cover is optional. */ }
  const publishedRaw = text(row.publicTime ?? row.publishTime, 50);
  const datePart = publishedRaw.slice(0,10);
  const iso = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?$/.test(publishedRaw) && validDate(datePart)
    ? new Date(publishedRaw.length===10 ? `${publishedRaw}T00:00:00+08:00` : `${publishedRaw.replace(' ','T')}+08:00`) : null;
  const read = metric(row.clicksCount ?? row.readCount);
  const likes=metric(row.likeCount),watches=metric(row.watchCount),shares=metric(row.shareCount);
  // Keep only documented business fields, never credentials or arbitrary response metadata.
  const rawKeys=['accountId','clicksCount','commentCount','content','coverUrl','interactiveCount','likeCount','orderNum','oriUrl','originalFlag','photoId','publicTime','shareCount','summary','thumbnail','title','type','userHeadUrl','userName','watchCount'];
  const rawData=Object.fromEntries(rawKeys.filter(key=>Object.hasOwn(row,key)).map(key=>[key,typeof row[key]==='string'?row[key].slice(0,key==='content'?150000:5000):typeof row[key]==='number'||typeof row[key]==='boolean'||row[key]===null?row[key]:null]));
  return { id, title, account: text(row.userName ?? row.author,200), accountId:text(row.accountId ?? row.bizInfo,160), category,
    providerCategory:row.type?text(row.type,80):null,rawData,
    url:link.href, cover, publishedAt:iso && Number.isFinite(iso.getTime())?iso.toISOString():null, publishedRaw,
    readCount:read.value, readExact:read.exact, readRaw:read.raw,
    likes:likes.value, watches:watches.value, shares:shares.value,
    likesRaw:likes.raw,watchesRaw:watches.raw,sharesRaw:shares.raw,
    metrics:{read,likes,watches,shares},
    original: row.originalFlag===1||row.isOriginal===1 ? true : row.originalFlag===0||row.isOriginal===0 ? false : null,
    content:String(row.content??'').slice(0,150000), summary:text(row.summary,5000),
  };
}
export async function fetchRank(input, config, fetcher = fetch, signal) {
  if (!config.REDFOX_API_KEY) throw new Error('未配置 REDFOX_API_KEY');
  const params = validateSync(input);
  const data=await fetchData(sources[params.source],{type:params.category,startDate:params.startDate,endDate:params.endDate},config,fetcher,signal);
  if (!Array.isArray(data) || data.length>10000) throw new Error('RedFox 列表格式无效');
  return data;
}

export async function fetchKeyword(input,config,fetcher=fetch,signal){
  const params=validateKeyword(input);
  const data=await fetchData(keywordSources[params.source],{keyword:params.keyword,offset:0,exactMatch:params.exactMatch},config,fetcher,signal);
  const rows=Array.isArray(data)?data:data?.list??data?.items??data?.records;
  if(!Array.isArray(rows)||rows.length>100)throw new Error('RedFox 关键词搜索列表格式无效');
  return rows;
}

async function fetchData(path,body,config,fetcher,signal){
  if (!config.REDFOX_API_KEY) throw new Error('未配置 REDFOX_API_KEY');
  const timeout = AbortSignal.timeout(25000);
  const response = await fetcher('https://redfox.hk'+path, {
    method:'POST', redirect:'error', headers:{'Content-Type':'application/json',REDFOX_API_KEY:config.REDFOX_API_KEY},
    body:JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal,timeout]) : timeout,
  });
  if (!response.ok) throw new Error(`RedFox 请求失败（HTTP ${response.status}）`);
  const reader=response.body.getReader();let size=0;const chunks=[];
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12*1024*1024)throw new Error('RedFox 响应超过大小限制');chunks.push(value);}} finally {await reader.cancel().catch(()=>{});}
  let result;try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('RedFox 响应格式无效');}
  if (result.code !== 2000) throw new Error(`RedFox 业务请求失败（code ${Number(result.code)||'unknown'}）`);
  return result.data;
}
