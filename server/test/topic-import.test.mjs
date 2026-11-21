import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importTopicBrief} from '../../app/src/services/topicImport.ts';
import {adoptTopicDraft,readTopicDraft,startTopicDraft,topicDraftScope} from '../../app/src/services/topicDraft.ts';
import {draftKeys} from '../../app/src/services/draftScope.ts';
function store(fail){const map=new Map([['gzh_editor_draft','原始草稿']]);let failed=false;return {getItem:k=>map.get(k)??null,setItem:(k,v)=>{if(!failed&&k===fail){failed=true;throw Error('quota');}map.set(k,v);},removeItem:k=>map.delete(k)};}
test('topic import retains undo, prevents duplicate append, and rolls back failed storage writes',()=>{
 const s=store();assert.equal(importTopicBrief(s,'brief1','简报','append'),'imported');
 assert.match(s.getItem('gzh_editor_draft'),/原始草稿[\s\S]*简报/);
 assert.equal(JSON.parse(s.getItem('gzh_editor_undo_snapshot')).markdown,'原始草稿');
 const current=s.getItem('gzh_editor_draft');assert.equal(importTopicBrief(s,'brief1','简报','append'),'already-imported');assert.equal(s.getItem('gzh_editor_draft'),current);
 for(const key of ['gzh_editor_undo_snapshot','gzh_topic_import_brief2','gzh_editor_draft']){const failed=store(key);assert.throws(()=>importTopicBrief(failed,'brief2','简报','replace'));assert.equal(failed.getItem('gzh_editor_draft'),'原始草稿');assert.equal(failed.getItem('gzh_topic_import_brief2'),null);}
});

test('adopting an AI draft preserves undo and rejects a more recent change',()=>{
 const s=store(),owner='user:author',topic={id:'topic1',title:'待写选题'};
 const keys=draftKeys(topicDraftScope(owner,topic.id));
 adoptTopicDraft(s,owner,topic,'旧稿',null);
 assert.throws(()=>adoptTopicDraft(s,owner,topic,'新稿','过期内容'),/已有更新/);
 assert.equal(s.getItem(keys.draft),'旧稿');
 adoptTopicDraft(s,owner,topic,'新稿','旧稿');
 assert.equal(s.getItem(keys.draft),'新稿');
 assert.equal(JSON.parse(s.getItem(keys.undo)).markdown,'旧稿');
});

test('topic drafts keep regular and other owners’ drafts separate and never replace existing writing',()=>{
 const s=store(), owner='user:author', topic={id:'topic1',title:'待写选题'};
 const scope=topicDraftScope(owner,topic.id),key=draftKeys(scope).draft;
 startTopicDraft(s,owner,topic,'简报');
 assert.deepEqual(readTopicDraft(s,owner,topic.id),topic);
 assert.equal(readTopicDraft(s,'user:other',topic.id),null);
 assert.equal(readTopicDraft(s,owner,'topic2'),null);
 assert.equal(s.getItem('gzh_editor_draft'),'原始草稿');
 s.setItem(key,'已经开始写的正文');
 startTopicDraft(s,owner,topic,'新版简报');
 assert.equal(s.getItem(key),'已经开始写的正文');
 const failed=store(key);
 assert.throws(()=>startTopicDraft(failed,owner,topic,'简报'),/未新建草稿/);
 assert.equal(failed.getItem(scope),null);
 assert.equal(failed.getItem(key),null);
});
