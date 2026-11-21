import {HttpError} from '../discovery/library.mjs';
export function topicWithTags(row){
 if(!row)return row;
 const {tags_json,...topic}=row;
 return {...topic,tags:JSON.parse(tags_json??'[]')};
}
export async function listTopics(db,userId,query=new URLSearchParams()){
 const q=(query.get('q')||'').trim(),status=query.get('status')||'all';
 const tag=(query.get('tag')||'').trim();
 if(tag.length>20)throw new HttpError(400,'标签最多20字');
 if(q.length>100)throw new HttpError(400,'搜索词最多100字');
 if(!['all','research','writing','imported','archived'].includes(status))throw new HttpError(400,'选题状态无效');
 const limit=query.has('limit')?Number(query.get('limit')):30;
 if(!Number.isInteger(limit)||limit<1||limit>50)throw new HttpError(400,'每页数量必须在1至50之间');
 const where=['t.user_id=?'],args=[userId];
 const {results:tags}=await db.prepare('SELECT DISTINCT j.value AS label FROM topics t, json_each(t.tags_json) j WHERE t.user_id=? ORDER BY j.value LIMIT 100').bind(userId).all();
 if(tag){where.push('EXISTS (SELECT 1 FROM json_each(t.tags_json) WHERE value=?)');args.push(tag);}
 if(q){const term='%'+q.replace(/[\\%_]/g,'\\$&')+'%';where.push("(t.title LIKE ? ESCAPE '\\' OR t.angle LIKE ? ESCAPE '\\' OR t.audience LIKE ? ESCAPE '\\' OR t.notes LIKE ? ESCAPE '\\')");args.push(term,term,term,term);}
 const counts={all:0,research:0,writing:0,imported:0,archived:0};
 const groups=(await db.prepare(`SELECT t.status,COUNT(*) AS n FROM topics t WHERE ${where.join(' AND ')} GROUP BY t.status`).bind(...args).all()).results;
 for(const row of groups){counts[row.status]=row.n;counts.all+=row.n;}
 if(status!=='all'){where.push('t.status=?');args.push(status);}
 if(query.get('cursor')){
  let cursor;try{const encoded=query.get('cursor');if(encoded.length>2000)throw 0;cursor=JSON.parse(Buffer.from(encoded,'base64url').toString());if(cursor.userId!==userId||cursor.q!==q||cursor.status!==status||(cursor.tag??'')!==tag||typeof cursor.id!=='string'||typeof cursor.updatedAt!=='string')throw 0;}catch{throw new HttpError(400,'分页游标无效，请重新查询');}
  where.push('(t.updated_at<? OR (t.updated_at=? AND t.id<?))');args.push(cursor.updatedAt,cursor.updatedAt,cursor.id);
 }
 const rows=(await db.prepare(`SELECT t.*,(SELECT COUNT(*) FROM topic_sources s WHERE s.topic_id=t.id) AS source_count FROM topics t WHERE ${where.join(' AND ')} ORDER BY t.updated_at DESC,t.id DESC LIMIT ?`).bind(...args,limit+1).all()).results;
 const items=rows.slice(0,limit),last=items.at(-1);
 return {items:items.map(topicWithTags),tags:tags.map(row=>row.label),total:status==='all'?counts.all:counts[status],counts,nextCursor:rows.length>limit?Buffer.from(JSON.stringify({userId,q,status,tag,id:last.id,updatedAt:last.updated_at})).toString('base64url'):null};
}
