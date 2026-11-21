// 编辑器草稿的本地持久化，以及"被整篇覆盖前"的一份快照（用于撤销 AI 排版、导入覆盖、应用配图）。
// localStorage 可能不可用或写满（base64 图片很占空间），所有读写都要兜底。

import {draftKeys,getDraftOwner,atomicDraftWrite} from './draftScope.ts';
import type {ArticleIdentity} from './articleIdentity.ts';
export {draftKeys,getDraftOwner} from './draftScope.ts';

export interface UndoSnapshot {
  label: string;
  markdown: string;
  savedAt: number;
  article?: ArticleIdentity|null;
  topicImport?: { briefId: string; receipt: string | null };
}

export function loadDraft(owner=getDraftOwner()): string | null {
  try {
    return localStorage.getItem(draftKeys(owner).draft);
  } catch {
    return null;
  }
}

/** 返回是否写入成功；失败通常是存储配额已满 */
export function saveDraft(markdown: string,owner=getDraftOwner()): boolean {
  try {
    localStorage.setItem(draftKeys(owner).draft, markdown);
    return true;
  } catch {
    return false;
  }
}

export function loadUndoSnapshot(owner=getDraftOwner()): UndoSnapshot | null {
  try {
    const raw = localStorage.getItem(draftKeys(owner).undo);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.markdown === 'string' && typeof parsed?.label === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveUndoSnapshot(snapshot: UndoSnapshot | null,owner=getDraftOwner()): void {
  try {
    if (snapshot) {
      localStorage.setItem(draftKeys(owner).undo, JSON.stringify(snapshot));
    } else {
      localStorage.removeItem(draftKeys(owner).undo);
    }
  } catch {
    /* 存不下时快照只保留在内存里，刷新后不可撤销 */
  }
}

export function restoreGuestDraft(owner:string,currentMarkdown:string):{markdown:string;undo:UndoSnapshot}{
 if(owner==='guest')throw new Error('当前已经是访客草稿');
 const markdown=localStorage.getItem(draftKeys('guest').draft);if(markdown===null)throw new Error('本浏览器没有可恢复的访客草稿');
 const undo={label:'恢复访客草稿',markdown:currentMarkdown,savedAt:Date.now()},keys=draftKeys(owner);
 try{atomicDraftWrite(localStorage,new Map([[keys.undo,JSON.stringify(undo)],[keys.draft,markdown]]));}catch{throw new Error('本机存储写入失败，未恢复访客草稿，请先导出当前正文。');}
 return {markdown,undo};
}
