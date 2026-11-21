type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
import {draftKeys,getDraftOwner} from './draftScope.ts';
export function importTopicBrief(storage: DraftStorage, briefId: string, markdown: string, mode: string): 'imported' | 'already-imported' {
  const keys=draftKeys(getDraftOwner(storage)),receipt=keys.receipt(briefId);
  if (storage.getItem(receipt)) return 'already-imported';
  const draftKey = keys.draft, undoKey = keys.undo;
  const previous = new Map([draftKey, undoKey, receipt].map(key => [key, storage.getItem(key)]));
  const original = previous.get(draftKey) || '';
  const next = mode === 'append' && original.trim() ? original + '\n\n---\n\n' + markdown : markdown;
  try {
    storage.setItem(undoKey, JSON.stringify({ label: '带入选题简报', markdown: original, savedAt: Date.now(), topicImport: { briefId, receipt: null } }));
    storage.setItem(receipt, String(Date.now()));
    storage.setItem(draftKey, next);
  } catch {
    for (const [key, value] of previous) { try { if (value === null) storage.removeItem(key); else storage.setItem(key, value!); } catch { /* Storage may have been disabled; do not navigate. */ } }
    throw new Error('本机存储写入失败，未带入简报。请先备份原稿并检查浏览器存储。');
  }
  return 'imported';
}
