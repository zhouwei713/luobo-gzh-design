/**
 * FeishuSidebar — 飞书文档同步侧边栏。
 * 从左侧滑出的固定浅色面板：绑定飞书账号、浏览最近文档、粘贴链接导入 Markdown。
 * 仅在 online 模式调 API；OSS 模式显示提示。
 */

import { useCallback, useEffect, useState } from 'react';
import { FileText, Link2, Loader2, RefreshCw, X } from 'lucide-react';
import { useWorkspaceConfirmation } from './useWorkspaceConfirmation';

import {
  asFeishuError,
  disconnect,
  getAppConfig,
  getOauthUrl,
  getStatus,
  importDoc,
  listDocs,
  saveAppConfig,
  type FeishuDocItem,
} from '../../services/feishuService';

interface FeishuSidebarProps {
  open: boolean;
  onClose: () => void;
  onImport: (title: string, markdown: string) => void;
}

const FEISHU_REDIRECT_URI = () => `${window.location.origin}/feishu/callback`;

function formatModifiedTime(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function FeishuSidebar({ open, onClose, onImport }: FeishuSidebarProps) {
  const {confirm,confirmation}=useWorkspaceConfirmation();
  const isOnlineMode = import.meta.env.VITE_APP_MODE === 'online';

  const [statusLoading, setStatusLoading] = useState(true);
  const [bound, setBound] = useState(false);
  const [feishuUserName, setFeishuUserName] = useState('');
  const [docs, setDocs] = useState<FeishuDocItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [importingLink, setImportingLink] = useState(false);
  const [importingToken, setImportingToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [needRebind, setNeedRebind] = useState(false);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [appConfigured, setAppConfigured] = useState(false);
  const [secretPreview, setSecretPreview] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const list = await listDocs();
      setDocs(list);
    } catch (err: unknown) {
      const apiErr = asFeishuError(err);
      if (apiErr.needBind || apiErr.needRebind) {
        setBound(false);
        setNeedRebind(true);
        setError('授权已失效，请重新绑定飞书账号。');
      } else {
        setError(apiErr.message || '获取文档列表失败');
      }
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !isOnlineMode) return;

    let cancelled = false;
    setStatusLoading(true);
    setError('');
    setNeedRebind(false);

    getStatus()
      .then((status) => {
        if (cancelled) return;
        setBound(status.bound);
        setFeishuUserName(status.feishuUserName || '');
        setAppConfigured(status.appConfigured);
        if (status.bound) {
          void loadDocs();
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBound(false);
        setError(asFeishuError(err).message || '查询绑定状态失败');
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });

    getAppConfig()
      .then((config) => {
        if (cancelled) return;
        setAppConfigured(config.configured);
        setAppId(config.appId || '');
        setSecretPreview(config.secretPreview || '');
      })
      .catch(() => {
        // 配置读取失败不阻塞主流程
      });

    return () => {
      cancelled = true;
    };
  }, [open, isOnlineMode, loadDocs]);

  if (!open) return null;

  const startBind = async () => {
    setError('');
    setNeedRebind(false);
    try {
      const authorizeUrl = await getOauthUrl(FEISHU_REDIRECT_URI());
      window.location.href = authorizeUrl;
    } catch (err: unknown) {
      setError(asFeishuError(err).message || '获取授权链接失败');
    }
  };

  const handleSaveConfig = async () => {
    if (!appId.trim() || savingConfig) return;
    setSavingConfig(true);
    setConfigSaved(false);
    setError('');
    try {
      await saveAppConfig(appId.trim(), appSecret.trim());
      setAppConfigured(true);
      setAppSecret('');
      setConfigSaved(true);
    } catch (err: unknown) {
      setError(asFeishuError(err).message || '保存凭证失败');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDisconnect = async () => {
    if (!await confirm({title:'解绑飞书账号？',message:`解绑「${feishuUserName}」后，再次从飞书导入文档时需要重新授权。`,confirmLabel:'确认解绑'})) return;
    setError('');
    try {
      await disconnect();
      setBound(false);
      setFeishuUserName('');
      setDocs([]);
    } catch (err: unknown) {
      setError(asFeishuError(err).message || '解绑失败');
    }
  };

  const runImport = async (input: string, markLoading: (loading: boolean) => void) => {
    setError('');
    setNeedRebind(false);
    markLoading(true);
    try {
      const result = await importDoc(input);
      onImport(result.title, result.markdown);
    } catch (err: unknown) {
      const apiErr = asFeishuError(err);
      if (apiErr.needBind || apiErr.needRebind) {
        setBound(false);
        setNeedRebind(true);
        setError('授权已失效，请重新绑定飞书账号。');
      } else {
        setError(apiErr.message || '导入失败，请稍后重试');
      }
    } finally {
      markLoading(false);
    }
  };

  const handleImportLink = () => {
    const input = linkInput.trim();
    if (!input || importingLink) return;
    void runImport(input, setImportingLink);
  };

  const handleImportDoc = (doc: FeishuDocItem) => {
    if (importingToken) return;
    setImportingToken(doc.token);
    void runImport(doc.url || doc.token, (loading) => {
      if (!loading) setImportingToken(null);
    });
  };

  const renderBindSection = () => {
    if (statusLoading) {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在查询绑定状态…
        </div>
      );
    }

    if (!bound) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">绑定飞书账号后，可浏览最近文档并一键导入 Markdown。</p>
          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="flex items-center justify-between text-xs font-medium text-gray-600">
              <span>你的飞书应用凭证（保存在服务端，仅自己可用）</span>
              <span className={appConfigured ? 'text-emerald-600' : 'text-gray-400'}>
                {appConfigured ? '已配置' : '未配置'}
              </span>
            </p>
            <input
              type="text"
              value={appId}
              onChange={(event) => {
                setAppId(event.target.value);
                setConfigSaved(false);
              }}
              placeholder="App ID（cli_ 开头）"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            />
            <input
              type="password"
              value={appSecret}
              onChange={(event) => {
                setAppSecret(event.target.value);
                setConfigSaved(false);
              }}
              placeholder={secretPreview ? `已保存 ${secretPreview}（留空不修改）` : 'App Secret'}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={() => void handleSaveConfig()}
              disabled={!appId.trim() || savingConfig}
              className="w-full rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"
            >
              {savingConfig ? '保存中…' : configSaved ? '已保存 ✓' : '保存凭证'}
            </button>
            <details className="text-xs leading-5 text-gray-400">
              <summary className="cursor-pointer text-gray-500 transition-colors hover:text-emerald-600">
                如何获取飞书应用凭证？
              </summary>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li>打开飞书开放平台（open.feishu.cn），创建「企业自建应用」</li>
                <li>开通权限：docx:document:readonly、drive:drive:readonly</li>
                <li>
                  安全设置里添加重定向 URL：
                  <code className="mt-0.5 block break-all rounded bg-gray-100 px-1.5 py-1 text-[11px] text-gray-600">
                    {FEISHU_REDIRECT_URI()}
                  </code>
                </li>
                <li>发布应用版本后，把 App ID / Secret 填到上面</li>
              </ol>
            </details>
          </div>
          <button
            onClick={() => void startBind()}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            绑定飞书账号
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
        <span className="truncate text-sm text-emerald-800">
          已绑定：<span className="font-medium">{feishuUserName || '飞书用户'}</span>
        </span>
        <button
          onClick={() => void handleDisconnect()}
          className="ml-2 flex-none text-xs text-gray-400 transition-colors hover:text-red-500"
        >
          解绑
        </button>
      </div>
    );
  };

  return (
    <div data-ui-surface className="fixed inset-y-0 left-0 z-40 flex w-[360px] flex-col border-r border-gray-200 bg-white shadow-2xl">
      {confirmation}
      <div className="flex h-12 flex-none items-center justify-between border-b border-gray-200 px-4">
        <h2 className="text-sm font-semibold text-gray-800">飞书文档</h2>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {!isOnlineMode ? (
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
            <p className="text-xs text-amber-700">飞书文档同步仅在 online 模式可用。</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                <p className="text-xs text-red-600">{error}</p>
                {needRebind && (
                  <button
                    onClick={() => void startBind()}
                    className="mt-2 w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                  >
                    授权已失效，请重新绑定
                  </button>
                )}
              </div>
            )}

            <section className="space-y-2">{renderBindSection()}</section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">粘贴链接导入</h3>
              <input
                type="text"
                value={linkInput}
                onChange={(event) => setLinkInput(event.target.value)}
                placeholder="粘贴飞书 docx / wiki 文档链接"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleImportLink();
                }}
              />
              <button
                onClick={handleImportLink}
                disabled={importingLink || !linkInput.trim()}
                className="flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {importingLink ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="mr-1.5 h-4 w-4" />
                )}
                {importingLink ? '导入中…' : '导入'}
              </button>
            </section>

            {bound && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">最近文档</h3>
                  <button
                    onClick={() => void loadDocs()}
                    disabled={docsLoading}
                    className="flex items-center rounded-md px-2 py-1 text-xs text-emerald-600 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-gray-400"
                  >
                    <RefreshCw className={`mr-1 h-3 w-3 ${docsLoading ? 'animate-spin' : ''}`} />
                    刷新
                  </button>
                </div>

                {docsLoading && docs.length === 0 ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在加载文档列表…
                  </div>
                ) : docs.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-200 p-3 text-xs text-gray-400">
                    没有找到文档，也可以直接粘贴链接导入。
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {docs.map((doc) => (
                      <li key={doc.token} className="flex items-center gap-2 px-3 py-2.5">
                        <FileText className="h-4 w-4 flex-none text-gray-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-gray-800" title={doc.name}>
                            {doc.name || '未命名文档'}
                          </p>
                          <p className="text-xs text-gray-400">{formatModifiedTime(doc.modifiedTime)}</p>
                        </div>
                        <button
                          onClick={() => handleImportDoc(doc)}
                          disabled={importingToken !== null}
                          className="flex flex-none items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:text-gray-400"
                        >
                          {importingToken === doc.token && (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          )}
                          导入
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default FeishuSidebar;
