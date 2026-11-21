import {useEffect,useRef,useState,type ReactNode} from 'react';
import {UiSkinControl} from './UiSkinControl';
import {ApiConnectionTest} from '../ui/ApiConnectionTest';
import {accountsEnabled} from '../../services/releaseScope';
import {readPersonalAI} from '../../services/personalAISettings';
import {loadImageGenerationSettings,saveImageGenerationSettings} from '../../services/imageGeneration';
import {
  loadCdnConfig,
  loadR2Config,
  loadUploadMode,
  saveCdnConfig,
  saveR2Config,
  saveUploadMode,
} from '../../services/imageUpload';
import type { UploadMode } from '../../services/imageUpload';

export function WorkbenchSettings({onClose,children}:{onClose:()=>void;children?:ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    const element=dialog.current;
    element?.showModal();
    return ()=>element?.close();
  },[]);
  const [apiKey, setApiKey] = useState(() => readPersonalAI().apiKey);
  const [apiBaseUrl, setApiBaseUrl] = useState(() => readPersonalAI().baseUrl);
  const [apiModel, setApiModel] = useState(() => readPersonalAI().model);
  const [imageApi,setImageApi]=useState(loadImageGenerationSettings);
  const [settingsTab, setSettingsTab] = useState<'ai' | 'cdn'>('ai');

  const [uploadMode, setUploadMode] = useState<UploadMode>(loadUploadMode());
  const savedR2 = loadR2Config();
  const [r2WorkerUrl, setR2WorkerUrl] = useState(savedR2?.workerUrl || '');
  const [r2UploadSecret, setR2UploadSecret] = useState(savedR2?.uploadSecret || '');
  const savedCdn = loadCdnConfig();
  const [cdnUploadUrl, setCdnUploadUrl] = useState(savedCdn?.uploadUrl || '');
  const [cdnFieldName, setCdnFieldName] = useState(savedCdn?.fieldName || 'file');
  const [cdnHeaders, setCdnHeaders] = useState(savedCdn?.headers || '');
  const [cdnResponsePath, setCdnResponsePath] = useState(savedCdn?.responsePath || 'data.url');

  const saveSettings = () => {
    try {
      localStorage.setItem('openai_api_key', apiKey.trim());
      localStorage.setItem('openai_api_base', apiBaseUrl);
      localStorage.setItem('openai_model', apiModel);
      saveImageGenerationSettings(imageApi);

      saveUploadMode(uploadMode);
      saveR2Config({
        workerUrl: r2WorkerUrl,
        uploadSecret: r2UploadSecret,
      });
      saveCdnConfig({
        uploadUrl: cdnUploadUrl,
        fieldName: cdnFieldName || 'file',
        headers: cdnHeaders,
        responsePath: cdnResponsePath || 'data.url',
      });
    } catch {
      setError('无法保存设置，请检查浏览器存储是否可用。');
      return;
    }
    onClose();
  };

  return (
    <dialog ref={dialog} data-ui-surface aria-labelledby="workbench-settings-title"
      onCancel={event=>{event.preventDefault();onClose();}}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[480px] max-w-[calc(100%-2rem)] overflow-y-auto rounded-[20px] bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 backdrop:bg-black/30 backdrop:backdrop-blur-md sm:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h3 id="workbench-settings-title" className="text-xl font-bold text-gray-900">工作台设置</h3>
        <button type="button" aria-label="关闭工作台设置" onClick={onClose} className="rounded-lg px-2 py-1 text-xl text-gray-500 hover:bg-gray-100">×</button>
      </div>
      <UiSkinControl />
      {children}
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      <div className="mb-5 flex space-x-1 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setSettingsTab('ai')}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
            settingsTab === 'ai'
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          AI 配置
        </button>
        <button
          onClick={() => setSettingsTab('cdn')}
          className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
            settingsTab === 'cdn'
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          图片上传
        </button>
      </div>

      {settingsTab === 'ai' && (
        <div className="mb-4 space-y-4">
          <p className="text-sm leading-6 text-gray-500">工作台的 AI 工具共用这套个人 API。配置保存在当前浏览器，调用费用由你的 API 账户承担。在线使用时，接口需支持浏览器跨域访问，HTTPS 网站请填写 HTTPS 接口。</p>
          <div>
            <label htmlFor="personal-ai-key" className="mb-1 block text-sm font-medium text-gray-700">OpenAI 兼容 API Key</label>
            <input
              id="personal-ai-key"
              autoComplete="off"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="personal-ai-base" className="mb-1 block text-sm font-medium text-gray-700">接口地址（Base URL）</label>
            <input
              id="personal-ai-base"
              type="text"
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              placeholder="默认: https://api.openai.com/v1"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="personal-ai-model" className="mb-1 block text-sm font-medium text-gray-700">模型名称（Model）</label>
            <input
              id="personal-ai-model"
              type="text"
              value={apiModel}
              onChange={(event) => setApiModel(event.target.value)}
              placeholder="默认: gpt-4o"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <ApiConnectionTest apiKey={apiKey} baseUrl={apiBaseUrl} model={apiModel}/>
          <details className="space-y-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
            <summary className="cursor-pointer font-medium">生图 API</summary>
            <p>供 AI 封面和正文插图共用。首版支持 OpenAI Images 兼容接口，支持跨域。</p>
            <label className="flex items-center gap-2"><input type="checkbox" checked={imageApi.reuseTextApi} onChange={e=>setImageApi({...imageApi,reuseTextApi:e.target.checked})}/>复用文字 API Key</label>
            {!imageApi.reuseTextApi&&<label className="block">生图 API Key<input type="password" autoComplete="off" className="mt-1 w-full rounded border border-gray-300 p-2" value={imageApi.apiKey} onChange={e=>setImageApi({...imageApi,apiKey:e.target.value})}/></label>}
            <label className="block">生图接口地址<input type="url" className="mt-1 w-full rounded border border-gray-300 p-2" value={imageApi.baseUrl} onChange={e=>setImageApi({...imageApi,baseUrl:e.target.value})} placeholder={imageApi.reuseTextApi?'留空则沿用文字接口地址':'https://api.openai.com/v1'}/></label>
            <label className="block">生图模型<input className="mt-1 w-full rounded border border-gray-300 p-2" value={imageApi.model} onChange={e=>setImageApi({...imageApi,model:e.target.value})} placeholder="填写服务商支持的生图模型"/></label>
          </details>
        </div>
      )}

      {settingsTab === 'cdn' && (
        <div className="mb-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">上传模式</label>
            <div className="flex space-x-1 rounded-lg bg-gray-100 p-1">
              {([
                { key: 'r2' as UploadMode, label: '服务器图床' },
                { key: 'custom' as UploadMode, label: '自定义 CDN' },
                { key: 'base64' as UploadMode, label: 'Base64' },
              ]).map((mode) => (
                <button
                  key={mode.key}
                  onClick={() => setUploadMode(mode.key)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                    uploadMode === mode.key
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {uploadMode === 'r2' && import.meta.env.VITE_API_SAME_ORIGIN === 'true' && (
            <p className="text-sm text-gray-500">{accountsEnabled?'图片保存到当前服务器，登录后即可上传。':'服务器图片上传后续开放，当前可使用其他图床或图片链接。'}</p>
          )}
          {uploadMode === 'r2' && import.meta.env.VITE_API_SAME_ORIGIN !== 'true' && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  后端地址 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={r2WorkerUrl}
                  onChange={(event) => setR2WorkerUrl(event.target.value)}
                  placeholder="https://your-worker.workers.dev"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Upload Secret</label>
                <input
                  type="password"
                  value={r2UploadSecret}
                  onChange={(event) => setR2UploadSecret(event.target.value)}
                  placeholder="可选，用于兼容旧的 Secret 模式"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </>
          )}

          {uploadMode === 'custom' && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  上传接口 URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={cdnUploadUrl}
                  onChange={(event) => setCdnUploadUrl(event.target.value)}
                  placeholder="https://upload.example.com/v1/image"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">图片字段名</label>
                <input
                  type="text"
                  value={cdnFieldName}
                  onChange={(event) => setCdnFieldName(event.target.value)}
                  placeholder="file"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">额外请求头（JSON）</label>
                <input
                  type="text"
                  value={cdnHeaders}
                  onChange={(event) => setCdnHeaders(event.target.value)}
                  placeholder='{"Authorization":"Bearer xxx"}'
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">URL 提取路径</label>
                <input
                  type="text"
                  value={cdnResponsePath}
                  onChange={(event) => setCdnResponsePath(event.target.value)}
                  placeholder="data.url"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </>
          )}

          {uploadMode === 'base64' && (
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
              <p className="text-xs text-amber-700">
                Base64 模式无需任何上传配置，但会显著增大文章体积。
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end space-x-3">
        <button
          onClick={onClose}
          className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-600 transition-all hover:bg-gray-100/80 hover:text-gray-900"
        >
          取消
        </button>
        <button
          onClick={saveSettings}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:bg-emerald-700 hover:shadow-lg"
        >
          保存设置
        </button>
      </div>
    </dialog>
  );
}
