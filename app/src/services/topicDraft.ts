import {atomicDraftWrite, draftKeys, type LocalDraftStorage} from './draftScope.ts';

export interface TopicDraft {
  id: string;
  title: string;
}

export function topicDraftScope(owner: string, id: string): string {
  return 'topic:' + JSON.stringify([owner, id]);
}

export function topicDraftHref(id: string): string {
  return '/?topic=' + encodeURIComponent(id);
}

export function readTopicDraft(storage: LocalDraftStorage, owner: string, id: string): TopicDraft | null {
  const scope = topicDraftScope(owner, id);
  try {
    const value = JSON.parse(storage.getItem(scope) ?? 'null');
    return value?.id === id && typeof value.title === 'string' && storage.getItem(draftKeys(scope).draft) !== null ? value : null;
  } catch {
    return null;
  }
}

export function startTopicDraft(storage: LocalDraftStorage, owner: string, topic: TopicDraft, markdown: string) {
  const scope = topicDraftScope(owner, topic.id);
  const key = draftKeys(scope).draft;
  try {
    if (storage.getItem(key) !== null) return;
    atomicDraftWrite(storage, new Map([[scope, JSON.stringify(topic)], [key, markdown]]));
  } catch {
    throw new Error('本机存储写入失败，未新建草稿。请检查浏览器存储后重试。');
  }
}

export function readTopicDraftText(storage: LocalDraftStorage, owner: string, id: string) {
  return storage.getItem(draftKeys(topicDraftScope(owner,id)).draft);
}

export function adoptTopicDraft(storage: LocalDraftStorage, owner: string, topic: TopicDraft, markdown: string, previous: string|null) {
  if(readTopicDraftText(storage,owner,topic.id)!==previous)throw new Error('选题草稿已有更新，请重新确认后再采用。');
  if(previous===null){
    startTopicDraft(storage,owner,topic,markdown);
    return;
  }
  const keys=draftKeys(topicDraftScope(owner,topic.id));
  try{
    atomicDraftWrite(storage,new Map([
      [keys.undo,JSON.stringify({label:'采用 AI 初稿',markdown:previous,savedAt:Date.now()})],
      [keys.draft,markdown],
    ]));
  }catch{
    throw new Error('本机存储写入失败，原稿已保留。');
  }
}
