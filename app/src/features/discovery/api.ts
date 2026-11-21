import { getAuthToken } from '../../services/authService';
import { loadR2Config } from '../../services/imageUpload';
import { loadDevIdentityRole } from '../../services/accessControl';
export interface Article { id: string; savedTopicId?: string | null; title: string; account: string; accountId: string; category: string; providerCategory?: string | null; rawData?: Record<string, unknown>; url: string; cover: string; publishedAt: string | null; publishedRaw: string; readCount: number | null; readExact: boolean; readRaw: string | null; likes: number | null; watches: number | null; shares: number | null; likesRaw: string | null; watchesRaw: string | null; sharesRaw: string | null; original: boolean | null; summary: string; content?: string; firstSeen: string; updatedAt: string }
export interface SyncParams { category: string; source: string; startDate: string; endDate: string; mode?: 'range'|'daily'|'keyword'; keyword?: string; skipCollected?: boolean; skippedDates?: string[] }
export interface CoverageDay { date: string; state: 'daily'|'range'|'missing'; lastSuccessAt: string | null; lastAttempt: { status: string; finishedAt: string | null; newCount: number; updatedCount: number; skippedCount: number } | null }
export interface Coverage { category: string; source: string; startDate: string; endDate: string; days: CoverageDay[] }
export interface SyncStep { step_index: number; params: SyncParams; status: string; attempted: number; new_count: number; updated_count: number; skipped_count: number; error: string | null }
export interface SyncJob { id: string; status: string; params: SyncParams; created_at: string; finished_at: string | null; new_count: number; updated_count: number; skipped_count: number; error: string | null; steps?: SyncStep[]; requests_used?: number; request_budget?: number }
export interface LibraryStatus { configured: boolean; categories: string[]; total: number; quality?: { withContent: number }; earliest: string | null; latest: string | null; lastSuccessfulSyncAt: string | null; canSync: boolean; canSearchKeywords?: boolean; used?: number; dailyLimit?: number; maxBatchRequests?: number; coverage: { category: string; source: string; startDate: string; endDate: string; finishedAt: string }[]; jobs?: SyncJob[] }
export interface Topic { id: string; tags?: string[]; title: string; angle: string; audience: string; notes: string; status: 'research'|'writing'|'imported'|'archived'; revision: number; updated_at: string; source_count?: number }
export interface Brief { id: string; markdown: string; kind: string; model: string | null; created_at: string }
export interface TopicDetail { topic: Topic; sources: Article[]; brief: Brief | null }
export interface TopicPage { items: Topic[]; tags: string[]; total: number; counts: Record<string,number>; nextCursor: string | null }
export class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
export async function api<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST', signal?: AbortSignal): Promise<T> {
  const localOss = import.meta.env.DEV && import.meta.env.VITE_APP_MODE === 'oss' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const base = (localOss ? '' : loadR2Config()?.workerUrl || '').replace(/\/$/, '');
  const token = getAuthToken();
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(base || location.origin, location.origin).hostname);
  const response = await fetch(base + path, { method, signal, headers: { 'Content-Type': 'application/json', ...(local ? { 'X-Local-Discovery-Role': loadDevIdentityRole() } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new ApiError('文章库接口未接通，请检查本地开发服务。', 503);
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(value.error || '请求失败，请稍后重试', response.status);
  return value as T;
}
export const dateText = (value: string | null | undefined) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '暂无';
export function articleText(content: string) { const doc = new DOMParser().parseFromString(content, 'text/html'); doc.querySelectorAll('script,style').forEach(n => n.remove()); doc.querySelectorAll('p,div,section,br').forEach(n => n.append('\n')); return doc.body.textContent || content; }
