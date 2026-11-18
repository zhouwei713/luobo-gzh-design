import { lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Cloud,
  Copy,
  FileText,
  ImageDown,
  ImagePlus,
  MessageSquareQuote,
  Share2,
  Undo2,
  Wand2,
} from 'lucide-react';

import { getAITypesetMarkdown } from '../ai/formatter';
import {saveDraftBackup} from '../services/draftBackups';
import {LazyTool} from '../components/ui/LazyTool';
import {ApiConnectionTest} from '../components/ui/ApiConnectionTest';
import { WorkbenchShell } from '../components/workbench/WorkbenchShell';
import { ArticleControls } from '../features/articles/ArticleControls';
import { ArticleImages } from '../features/images/ArticleImages';
import { ImportArticleModal, type PendingArticleImport } from '../components/ui/ImportArticleModal';
import { atomicDraftWrite, draftKeys } from '../services/draftScope';
import {articleIdentityJson,loadArticleIdentity,notifyArticleIdentity} from '../services/articleIdentity';
import { UiSkinControl } from '../components/workbench/UiSkinControl';
import { analyzeAiTypesetOutput } from '../ai/aiOutputCheck';
import type { AiOutputAnalysis } from '../ai/aiOutputCheck';
import { AiResultReviewModal } from '../components/ui/AiResultReviewModal';
import { FormatPreferenceModal } from '../components/ui/FormatPreferenceModal';
import { normalizeFormatPreferences, sanitizeFormatCustomNote, type FormatPreferences } from '../ai/formatPreferences';
import { parseFormatRequest } from '../ai/formatRequestParser';
import {
  loadDraft,
  loadUndoSnapshot,
  saveDraft,
  saveUndoSnapshot,
  restoreGuestDraft,
  type UndoSnapshot,
} from '../services/draftStorage';
import { Preview } from '../components/preview/Preview';
import { buildWechatCopyRoot, copyWechatArticle } from '../core/wechatExport';
import { DevIdentitySwitcher } from '../components/ui/DevIdentitySwitcher';
import { api as discoveryApi } from '../features/discovery/api';
import {accountsEnabled,phaseTwoEnabled} from '../services/releaseScope';
import { HeaderMenu } from '../components/ui/HeaderMenu';
import { InputPromptModal } from '../components/ui/InputPromptModal';
import { ToastStack, type ToastItem, type ToastTone } from '../components/ui/ToastStack';
import { TypographyControl } from '../components/ui/TypographyControl';
import { ComponentStyleControl } from '../components/ui/ComponentStyleControl';
import { StyleSchemeControl } from '../components/ui/StyleSchemeControl';
import { Editor } from '../components/editor/Editor';
import { DEFAULT_IMAGE_STYLE, DEFAULT_LAYOUT_STYLE, IMAGE_STYLES, LAYOUT_STYLES } from '../core/style';
import type { ImageStyle, LayoutStyle } from '../core/style';
import { DEFAULT_EMPHASIS_CONFIG, normalizeEmphasisConfig } from '../core/emphasis';
import type { EmphasisConfig } from '../core/emphasis';
import {
  DEFAULT_TYPOGRAPHY_CONFIG,
  createTypographyConfigForLayout,
  normalizeTypographyConfig,
} from '../core/typography';
import type { TypographyConfig } from '../core/typography';
import {
  DEFAULT_COMPONENT_STYLE_CONFIG,
  normalizeComponentStyleConfig,
} from '../core/componentStyle';
import type { ComponentStyleConfig } from '../core/componentStyle';
import {
  STYLE_SCHEMES,
  createCustomStyleScheme,
  duplicateAsCustomStyleScheme,
  findActiveStyleScheme,
  loadCustomStyleSchemes,
  parseImportedStyleSchemes,
  saveCustomStyleSchemes,
  serializeCustomStyleSchemes,
  styleSchemeMatchesSelection,
  updateCustomStyleScheme,
} from '../core/styleScheme';
import type { StyleScheme } from '../core/styleScheme';
import { DEFAULT_THEME, THEMES } from '../core/theme';
import type { Theme } from '../core/theme';
import {
  getAiTypesetAccess,
  getIllustrationAccess,
  loadDevIdentityRole,
  saveDevIdentityRole,
  shouldShowDevIdentitySwitcher,
  usesRealAuth,
  type DevIdentityRole,
} from '../services/accessControl';
import {
  changePassword,
  fetchPresets,
  getCurrentUser,
  logout,
  refreshUser,
  savePreset,
} from '../services/authService';
import type { Preset, User } from '../services/authService';
import {
  createIllustrationJob,
  getIllustrationJob,
  type IllustrationJob,
  getIllustrationPlan,
  type IllustrationPlan,
} from '../services/illustrationService';
import {
  loadCdnConfig,
  loadR2Config,
  loadUploadMode,
  saveCdnConfig,
  saveR2Config,
  saveUploadMode,
} from '../services/imageUpload';
import type { UploadMode } from '../services/imageUpload';
import {
  generateXArticleExport,
  generateXThreadExport,
  type XArticleExport,
  type XThreadExport,
} from '../services/xExportService';

const DraftBackupsPanel = lazy(() => import('../components/ui/DraftBackupsPanel').then(module => ({default:module.DraftBackupsPanel})));
const CheatsheetModal = lazy(() => import('../components/ui/CheatsheetModal').then(module => ({default:module.CheatsheetModal})));
const FeishuSidebar = lazy(() => import('../components/ui/FeishuSidebar').then(module => ({default:module.FeishuSidebar})));
const IllustrationJobPanel = lazy(() => import('../components/ui/IllustrationJobPanel').then(module => ({default:module.IllustrationJobPanel})));
const IllustrationPlanModal = lazy(() => import('../components/ui/IllustrationPlanModal').then(module => ({default:module.IllustrationPlanModal})));
const PlatformExportPanel = lazy(() => import('../components/ui/PlatformExportPanel').then(module => ({default:module.PlatformExportPanel})));
const ImageExportPanel = lazy(() => import('../components/ui/ImageExportPanel').then(module => ({default:module.ImageExportPanel})));

const defaultMarkdown = `# 01 | 完整排版演示 | /// MARKDOWN GUIDE

这份演示覆盖当前支持的常用 Markdown 语法和公众号高级组件。你可以直接修改左侧内容，右侧会实时呈现效果。

## STEP01 | 标题层级

### 小节标签 | 三级标题支持可选标签

#### 四级标题适合段落内分层

##### 五级标题沿用轻量小标题样式

###### 六级标题适合细节备注

## STEP02 | 行内文字效果

普通正文中可以使用 **重点加粗**、*轻量斜体*、~~删除内容~~、\`行内代码\`，也可以插入[文字链接](https://mp.weixin.qq.com)。

连续书写的第一行会保留换行，
第二行仍然属于同一个段落。

## STEP03 | 列表、引用与分割线

无序列表适合并列信息：

- 主题、版式和图片样式可以自由组合
- 加粗内容支持多种强调效果
- 个人方案支持保存和导入导出

有序列表适合步骤说明：

1. 输入或导入 Markdown 内容
2. 选择风格方案并微调排版
3. 复制结果到公众号编辑器

> 好的排版会帮助读者理解内容层级，也会让重点信息更容易被看到。

---

## STEP04 | 信息卡片与总结卡片

<InfoCard title="关键提示">
信息卡片适合展示提醒、背景信息和单段重点，内部支持 **加粗**、*斜体* 与 \`行内代码\`。
</InfoCard>

<SummaryCard title="本节总结">
总结卡片适合放在章节结尾，也可以同时包含说明和列表。
- 标题负责建立层级
- 强调负责突出关键内容
- 卡片负责收纳结构化信息
</SummaryCard>

<ScrollCard title="长文滑动容器" height="180" hint="滑动查看">
长文容器适合放置接口返回、日志、代码、数据说明和资料摘录。
预览时会限制容器高度，读者可以在卡片内部滑动查看更多内容。
复制到公众号时默认保留内部滚动；如果需要复制后展开全文，可以加入 \`copy="expand"\`。
</ScrollCard>

## STEP05 | 表格与代码块

| 能力 | 当前状态 | 适用场景 |
| :--- | :---: | ---: |
| 标准 Markdown | 已支持 | 日常写作 |
| 高级排版组件 | 已支持 | 总结与提示 |
| 风格方案 | 已支持 | 快速切换整套视觉 |

\`\`\`javascript
function createArticle(title, theme = 'jade') {
  return { title, theme, ready: true };
}
\`\`\`

## STEP06 | 单图与横排图组

单独一行插入一张图片：

![玉石绿抽象插图](/syntax-demo-jade.svg)

同一行连续插入多张图片，会自动组成横排图组：

![蓝色图组示例](/syntax-demo-blue.svg) ![暖色图组示例](/syntax-demo-warm.svg)
`;

const FORMAT_PREFERENCES_STORAGE_KEY = 'ai_format_preferences';
const FORMAT_CUSTOM_NOTE_STORAGE_KEY = 'ai_format_custom_note';

function TypesetterView({draftOwner}:{draftOwner:string}) {
  const isOnlineMode = import.meta.env.VITE_APP_MODE === 'online';
  const isRealAuth = usesRealAuth();
  const [localDiscoveryDebug, setLocalDiscoveryDebug] = useState(false);
  const showDevIdentity = shouldShowDevIdentitySwitcher() || localDiscoveryDebug;
  useEffect(() => {
    if (!phaseTwoEnabled || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
    let alive = true;
    void discoveryApi<{ localDebug: boolean }>('/api/discovery/local-session').then(data => { if (alive) setLocalDiscoveryDebug(data.localDebug); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const navigate = useNavigate();

  const [markdown, setMarkdownState] = useState(() => loadDraft(draftOwner) ?? defaultMarkdown);
  const latestMarkdown=useRef(markdown);
  const setMarkdown=useCallback((value:string)=>{latestMarkdown.current=value;setMarkdownState(value);},[]);
  const [guestDraft]=useState(()=>loadDraft('guest'));
  const guestRecoveryAvailable=draftOwner!=='guest'&&Boolean(guestDraft&&guestDraft!==defaultMarkdown);
  const [showGuestRecovery,setShowGuestRecovery]=useState(()=>{try{return !localStorage.getItem('gzh_guest_draft_dismissed:'+draftOwner);}catch{return true;}});
  const [draftSaveState, setDraftSaveState] = useState<'saving' | 'saved' | 'error'>('saving');
  const [previewWidth, setPreviewWidth] = useState<375 | 677>(375);
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(()=>loadUndoSnapshot(draftOwner));
  const [pendingImport, setPendingImport] = useState<PendingArticleImport | null>(null);
  const [importError, setImportError] = useState('');
  const [pendingAiResult, setPendingAiResult] = useState<{
    original: string;
    analysis: AiOutputAnalysis;
  } | null>(null);
  const [isTypesetting, setIsTypesetting] = useState(false);
  const [showFormatPreferences, setShowFormatPreferences] = useState(false);
  const [formatPreferences, setFormatPreferences] = useState<FormatPreferences>(() => {
    try {
      return normalizeFormatPreferences(JSON.parse(localStorage.getItem(FORMAT_PREFERENCES_STORAGE_KEY) || 'null'));
    } catch {
      return normalizeFormatPreferences(null);
    }
  });
  const [formatCustomNote, setFormatCustomNote] = useState(() => {
    try {
      return sanitizeFormatCustomNote(localStorage.getItem(FORMAT_CUSTOM_NOTE_STORAGE_KEY));
    } catch {
      return '';
    }
  });
  const [isPlanningIllustration, setIsPlanningIllustration] = useState(false);
  const [isApplyingIllustration, setIsApplyingIllustration] = useState(false);
  const [isApplyingIllustrationResult, setIsApplyingIllustrationResult] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('openai_api_key') || '');
  const [apiBaseUrl, setApiBaseUrl] = useState(localStorage.getItem('openai_api_base') || '');
  const [apiModel, setApiModel] = useState(localStorage.getItem('openai_model') || '');
  const [showSettings, setShowSettings] = useState(() => new URLSearchParams(location.search).get('settings') === '1');
  const [showDraftBackups,setShowDraftBackups]=useState(false);
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const [activeTheme, setActiveTheme] = useState<Theme>(DEFAULT_THEME);
  const [activeLayoutStyle, setActiveLayoutStyle] = useState<LayoutStyle>(DEFAULT_LAYOUT_STYLE);
  const [activeImageStyle, setActiveImageStyle] = useState<ImageStyle>(DEFAULT_IMAGE_STYLE);
  const [activeEmphasis, setActiveEmphasis] = useState<EmphasisConfig>(DEFAULT_EMPHASIS_CONFIG);
  const [activeTypography, setActiveTypography] = useState<TypographyConfig>(DEFAULT_TYPOGRAPHY_CONFIG);
  const [activeComponentStyle, setActiveComponentStyle] = useState<ComponentStyleConfig>(DEFAULT_COMPONENT_STYLE_CONFIG);
  const [customStyleSchemes, setCustomStyleSchemes] = useState<StyleScheme[]>(loadCustomStyleSchemes);
  const [editingSchemeId, setEditingSchemeId] = useState<string | null>(null);
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

  const [authUser, setAuthUser] = useState<User | null>(getCurrentUser());
  const [devIdentityRole, setDevIdentityRole] = useState<DevIdentityRole>(loadDevIdentityRole());
  const [presets, setPresets] = useState<Preset[]>([]);
  const [illustrationPlan, setIllustrationPlan] = useState<IllustrationPlan | null>(null);
  const [lastIllustrationJob, setLastIllustrationJob] = useState<IllustrationJob | null>(null);
  const [selectedIllustrationIds, setSelectedIllustrationIds] = useState<string[]>([]);
  const [toastItems, setToastItems] = useState<ToastItem[]>([]);
  const [showPresetNameModal, setShowPresetNameModal] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [previewTab, setPreviewTab] = useState<'wechat' | 'xThread' | 'xArticle'>('wechat');
  const [xThreadExport, setXThreadExport] = useState<XThreadExport | null>(null);
  const [xArticleExport, setXArticleExport] = useState<XArticleExport | null>(null);
  const [showImageExportPanel, setShowImageExportPanel] = useState(false);
  const [showFeishuSidebar, setShowFeishuSidebar] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const canUseCloudPresets = isRealAuth && Boolean(authUser);
  const canChangePassword = isRealAuth && Boolean(authUser);
  const currentStyleSelection = {
    themeId: activeTheme.id,
    layoutId: activeLayoutStyle.id,
    imageStyleId: activeImageStyle.id,
    emphasis: activeEmphasis,
    typography: activeTypography,
    componentStyle: activeComponentStyle,
  };
  const activeStyleScheme = findActiveStyleScheme(
    currentStyleSelection,
    [...customStyleSchemes, ...STYLE_SCHEMES],
  );
  const editingScheme = editingSchemeId
    ? customStyleSchemes.find((scheme) => scheme.id === editingSchemeId)
    : undefined;
  const editingDirty = Boolean(
    editingScheme && !styleSchemeMatchesSelection(editingScheme, currentStyleSelection),
  );
  const currentSchemePreview = {
    paper: activeLayoutStyle.id === 'dark' ? '#0F172A' : '#FFFFFF',
    ink: activeLayoutStyle.id === 'dark' ? '#E2E8F0' : '#1F2937',
    accent: activeTheme.primary,
    soft: activeEmphasis.color,
  };

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingLeft = useRef(false);
  const isSyncingRight = useRef(false);
  const scrollSyncRafRef = useRef<number | null>(null);
  const notifiedIllustrationJobsRef = useRef<Record<string, IllustrationJob['status']>>({});

  useEffect(() => {
    if (!isRealAuth) return;

    refreshUser().then(setAuthUser).catch(() => setAuthUser(getCurrentUser()));
  }, [isRealAuth]);

  useEffect(() => {
    if (!canUseCloudPresets) {
      setPresets([]);
      return;
    }

    fetchPresets().then(setPresets).catch(console.error);
  }, [canUseCloudPresets]);

  useEffect(() => {
    if (!isOnlineMode || !lastIllustrationJob || lastIllustrationJob.id.startsWith('oss-')) return;
    if (!['queued', 'running', 'waiting'].includes(lastIllustrationJob.status)) return;

    let cancelled = false;
    const jobId = lastIllustrationJob.id;

    const pollJob = async () => {
      try {
        const nextJob = await getIllustrationJob(jobId);
        if (cancelled) return;

        setLastIllustrationJob((current) => (
          current?.id === jobId ? nextJob : current
        ));

        if (
          (nextJob.status === 'completed' || nextJob.status === 'failed')
          && notifiedIllustrationJobsRef.current[jobId] !== nextJob.status
        ) {
          notifiedIllustrationJobsRef.current[jobId] = nextJob.status;
          if (nextJob.status === 'completed') {
            pushToast('success', '配图任务已完成', '结果已经生成，可在右下角面板中决定是否应用到正文。');
          } else {
            pushToast('error', '配图任务失败', nextJob.error || '后台生成失败，请稍后重试。');
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('轮询配图任务失败:', error);
        }
      }
    };

    void pollJob();
    const timer = window.setInterval(() => {
      void pollJob();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOnlineMode, lastIllustrationJob?.id, lastIllustrationJob?.status]);

  const handleDevIdentityChange = (role: DevIdentityRole) => {
    saveDevIdentityRole(role);
    setDevIdentityRole(role);
  };

  const dismissToast = (id: string) => {
    setToastItems((current) => current.filter((item) => item.id !== id));
  };

  const pushToast = useCallback((tone: ToastTone, title: string, message?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToastItems((current) => [...current, { id, tone, title, message }]);
    window.setTimeout(() => {
      setToastItems((current) => current.filter((item) => item.id !== id));
    }, 3600);
  },[]);

  // 草稿自动保存：停止输入 800ms 后写入本地；存储写满时只提醒一次
  useEffect(()=>{
    const flush=()=>saveDraft(latestMarkdown.current,draftOwner);
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(!flush()){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);window.addEventListener('pagehide',flush);
    return()=>{window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('pagehide',flush);flush();};
  },[draftOwner]);
  const draftSaveFailedRef = useRef(false);
  useEffect(() => {
    setDraftSaveState('saving');
    const timer = window.setTimeout(() => {
      const ok = saveDraft(markdown,draftOwner);
      setDraftSaveState(ok ? 'saved' : 'error');
      if (!ok && !draftSaveFailedRef.current) {
        draftSaveFailedRef.current = true;
        pushToast('error', '草稿自动保存失败', '浏览器本地存储可能已满，请先导出正文，并减少内嵌图片。');
      } else if (ok) {
        draftSaveFailedRef.current = false;
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [markdown,draftOwner,pushToast]);

  useEffect(()=>{
    let previous=latestMarkdown.current,reported=false;
    const timer=window.setInterval(()=>{
      const current=latestMarkdown.current;
      if(current===previous)return;
      try{saveDraftBackup(draftOwner,current,'自动历史版本');window.dispatchEvent(new Event('gzh-draft-backups-changed'));previous=current;reported=false;}
      catch{if(!reported){reported=true;pushToast('info','历史备份未保存','本机历史备份不可用，请导出正文备份。正文自动保存状态请查看页面提示。');}}
    },60_000);
    return()=>window.clearInterval(timer);
  },[draftOwner,pushToast]);

  /** 整篇替换正文前先留一份快照，之后可以从「AI 工具」菜单撤销 */
  const replaceMarkdownWithUndo = (nextMarkdown: string, label: string) => {
    if (nextMarkdown === markdown) return;
    const snapshot = { label, markdown, savedAt: Date.now() };
    setUndoSnapshot(snapshot);
    saveUndoSnapshot(snapshot,draftOwner);
    setMarkdown(nextMarkdown);
  };

  const handleUndoReplace = () => {
    if (!undoSnapshot) return;
    // 撤销本身也可以再撤销回来
    const reverse: UndoSnapshot = { label: `撤销「${undoSnapshot.label}」`, markdown:latestMarkdown.current, savedAt: Date.now(), article:loadArticleIdentity(draftOwner) };
    const keys=draftKeys(draftOwner);
    const writes=new Map([[keys.draft,undoSnapshot.markdown],[keys.undo,JSON.stringify(reverse)]] as Array<[string,string|null]>);
    if(Object.prototype.hasOwnProperty.call(undoSnapshot,'article'))writes.set(keys.article,articleIdentityJson(undoSnapshot.article||null));
    try{atomicDraftWrite(localStorage,writes);}catch{pushToast('error','撤销失败','本机保存失败，当前正文保持原样。');return;}
    setMarkdown(undoSnapshot.markdown);
    setUndoSnapshot(reverse);
    notifyArticleIdentity();
    pushToast('success', '已恢复', `已回到「${undoSnapshot.label}」之前的内容。`);
  };

  const handleExternalImport = (
    title: string,
    importedMarkdown: string,
    sourceKind: 'feishu' | 'markdown' | 'plaintext' = 'feishu',
  ) => {
    setPendingImport({title, markdown: importedMarkdown, sourceKind});
    setImportError('');
  };

  const confirmExternalImport = (mode: 'replace' | 'append') => {
    if (!pendingImport) return;
    const {title,markdown: importedMarkdown,sourceKind} = pendingImport;
    const current = latestMarkdown.current;
    const next = mode === 'append' && current.trim() ? current + '\n\n' + importedMarkdown : importedMarkdown;
    const snapshot = { label: mode === 'append' ? '导入追加' : '导入覆盖', markdown: current, savedAt: Date.now() };
    const keys = draftKeys(draftOwner);
    try { atomicDraftWrite(localStorage, new Map([[keys.undo, JSON.stringify(snapshot)], [keys.draft, next]])); }
    catch { setImportError('本机保存失败，未导入。请先导出当前正文，再重试。'); return; }
    setUndoSnapshot(snapshot);
    setMarkdown(next);
    setPendingImport(null);
    setShowFeishuSidebar(false);
    if (sourceKind === 'feishu') {
      pushToast('success', '飞书文档已导入', title);
    } else if (sourceKind === 'markdown') {
      pushToast('success', 'Markdown 文件已导入', title);
    } else {
      pushToast(
        'info',
        '纯文本已导入,建议先用 AI 排版',
        `${title}，可通过“AI 工具”补充标题层级与重点。`,
      );
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const handleLocalFilePick = (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = ''; // 允许连续选同一个文件
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      pushToast('error', '文件过大', '仅支持 2MB 以内的 .md / .txt 文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const ext = (file.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
      const kind: 'markdown' | 'plaintext' =
        ext === 'md' || ext === 'markdown' ? 'markdown' : 'plaintext';
      handleExternalImport(file.name, text, kind);
    };
    reader.onerror = () => {
      pushToast('error', '读取失败', '文件无法解析为文本,请确认编码为 UTF-8');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleSavePreset = () => {
    if (!isRealAuth) {
      pushToast('info', '当前模式不支持', 'OSS 调试模式下不启用云端预设保存。');
      return;
    }

    if (!authUser) {
      pushToast('info', '需要先登录', '登录后才能保存云端预设。');
      navigate('/login', { state: { from: '/' } });
      return;
    }

    setPresetNameInput('');
    setShowPresetNameModal(true);
  };

  const handleConfirmSavePreset = async () => {
    const name = presetNameInput.trim();
    if (!name) return;

    setIsSavingPreset(true);
    try {
      await savePreset(
        name,
        {
          ...activeTheme,
          emphasisConfig: activeEmphasis,
          typographyConfig: activeTypography,
          componentStyleConfig: activeComponentStyle,
        },
        activeLayoutStyle,
        activeImageStyle,
      );
      const nextPresets = await fetchPresets();
      setPresets(nextPresets);
      setShowPresetNameModal(false);
      setPresetNameInput('');
      pushToast('success', '预设已保存', `“${name}” 已加入你的云端预设。`);
    } catch (error: any) {
      pushToast('error', '保存失败', error.message || '保存预设失败');
    } finally {
      setIsSavingPreset(false);
    }
  };

  useEffect(() => () => {
    if (scrollSyncRafRef.current !== null) {
      window.cancelAnimationFrame(scrollSyncRafRef.current);
    }
  }, []);

  const handleEditorScroll = () => {
    // rAF 节流：一次滚动事件帧内只同步一次预览滚动位置
    if (scrollSyncRafRef.current !== null) return;

    scrollSyncRafRef.current = window.requestAnimationFrame(() => {
      scrollSyncRafRef.current = null;

      if (isSyncingLeft.current) {
        isSyncingLeft.current = false;
        return;
      }

      const editor = editorRef.current;
      const preview = previewScrollRef.current;
      if (!editor || !preview) return;

      const editorScrollableHeight = editor.scrollHeight - editor.clientHeight;
      if (editorScrollableHeight <= 0) return;

      const percentage = editor.scrollTop / editorScrollableHeight;
      const previewScrollableHeight = preview.scrollHeight - preview.clientHeight;

      isSyncingRight.current = true;
      preview.scrollTop = percentage * previewScrollableHeight;
    });
  };

  const handlePreviewScroll = () => {
    if (isSyncingRight.current) {
      isSyncingRight.current = false;
      return;
    }

    const editor = editorRef.current;
    const preview = previewScrollRef.current;
    if (!editor || !preview) return;

    const previewScrollableHeight = preview.scrollHeight - preview.clientHeight;
    if (previewScrollableHeight <= 0) return;

    const percentage = preview.scrollTop / previewScrollableHeight;
    const editorScrollableHeight = editor.scrollHeight - editor.clientHeight;

    isSyncingLeft.current = true;
    editor.scrollTop = percentage * editorScrollableHeight;
  };

  const handleCopy = async () => {
    const element = document.getElementById('wechat-article-preview');
    if (!element) {
      pushToast('info', '请先打开公众号预览', '切换到公众号预览后，再复制排版内容。');
      return;
    }
    const { root, issues } = buildWechatCopyRoot(element);
    if (issues.length) console.warn('[公众号兼容检查]', issues);
    const method = await copyWechatArticle(root);
    if (method === 'failed') {
      pushToast('error', '复制失败', '请重试，或检查浏览器剪贴板权限。');
      return;
    }
    if (method === 'text') {
      pushToast('info', '已复制纯文本', '当前浏览器未能复制富文本，剪贴板中不含排版样式。');
      return;
    }
    const important = issues.filter(issue => issue.level === 'error' || issue.rule.endsWith('-image-source'));
    if (important.length) pushToast('info', '已复制，请核对内容', important.slice(0, 2).map(issue => issue.message).join('；'));
    else pushToast('success', '复制成功', '公众号富文本已复制到剪贴板。');
  };

  const copyPlainText = async (content: string, successTitle: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(content);
      pushToast('success', successTitle, successMessage);
    } catch {
      pushToast('error', '复制失败', '请重试，或检查浏览器剪贴板权限。');
    }
  };

  const copyRichText = async (
    html: string,
    plain: string,
    successTitle: string,
    successMessage: string,
  ) => {
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([clipboardItem]);
      } else {
        await navigator.clipboard.writeText(plain);
      }

      pushToast('success', successTitle, successMessage);
    } catch {
      try {
        await navigator.clipboard.writeText(plain);
        pushToast('success', successTitle, `${successMessage}（已使用纯文本兼容模式）`);
      } catch {
        pushToast('error', '复制失败', '请重试，或检查浏览器剪贴板权限。');
      }
    }
  };

  const handleCopyXThread = async () => {
    const nextExport = generateXThreadExport(markdown);
    setXThreadExport(nextExport);
    setPreviewTab('xThread');
    await copyPlainText(nextExport.combinedText, '复制成功', `X Thread 文案已复制，共 ${nextExport.posts.length} 条。`);
  };

  const handleCopyXArticle = async () => {
    const nextExport = generateXArticleExport(markdown);
    setXArticleExport(nextExport);
    setPreviewTab('xArticle');
    await copyRichText(
      nextExport.combinedHtml,
      nextExport.combinedText,
      '复制成功',
      'X Article 富文本草稿已复制，可直接手动粘贴到 X。',
    );
  };

  const handleAITypeset = async () => {
    const access = getAiTypesetAccess();
    if (!access.allowed) {
      pushToast('info', '暂不可用', access.message);
      if (access.reason === 'login_required' && isRealAuth) {
        navigate('/login', { state: { from: '/' } });
      }
      return;
    }

    if (!apiKey.trim()) {
      pushToast('info', '需要配置 API Key', '请先在工作台设置中配置个人 API Key。');
      setShowSettings(true);
      return;
    }

    // 先选排版偏好，确认后再发请求
    setShowFormatPreferences(true);
  };

  const runAITypeset = async () => {
    setShowFormatPreferences(false);
    // 没点「整理成选项」也照样整理一遍：能识别的并入选项，其余作为补充要求
    const parsed = parseFormatRequest(formatCustomNote);
    const preferences = { ...formatPreferences, ...parsed.preferences };
    const customNote = sanitizeFormatCustomNote(parsed.rest);
    setFormatPreferences(preferences);
    setFormatCustomNote(customNote);
    try {
      localStorage.setItem(FORMAT_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
      localStorage.setItem(FORMAT_CUSTOM_NOTE_STORAGE_KEY, customNote);
    } catch {}

    setIsTypesetting(true);
    const original = markdown;
    try {
      const rawOutput = await getAITypesetMarkdown(apiKey.trim(), original, apiBaseUrl.trim(), apiModel.trim(), preferences, customNote);
      // 结果不直接落地：先给用户看对比和截断检查，确认后再替换
      setPendingAiResult({ original, analysis: analyzeAiTypesetOutput(original, rawOutput) });
    } catch (error: any) {
      console.error('AI 排版失败:', error);
      pushToast('error', 'AI 排版失败', error.message || '请稍后重试。');
    } finally {
      setIsTypesetting(false);
    }
  };

  const handleAcceptAiResult = () => {
    if (!pendingAiResult) return;
    replaceMarkdownWithUndo(pendingAiResult.analysis.cleaned, 'AI 排版');
    setPendingAiResult(null);
    pushToast('success', 'AI 排版已采用', '如需恢复原文，可在「AI 工具」菜单中撤销。');
  };

  const handleIllustrationPlan = async () => {
    const access = getIllustrationAccess();
    if (!access.allowed) {
      pushToast('info', '暂不可用', access.message);
      if (access.reason === 'login_required' && isRealAuth) {
        navigate('/login', { state: { from: '/' } });
      }
      return;
    }

    setIsPlanningIllustration(true);
    try {
      const plan = await getIllustrationPlan({
        markdown,
        density: 'balanced',
        preferredStyle: 'auto',
        maxImages: 3,
        layoutStyleId: activeLayoutStyle.id,
        themeId: activeTheme.id,
      });

      setIllustrationPlan(plan);
      setSelectedIllustrationIds(plan.items.map((item) => item.id));
    } catch (error: any) {
      console.error('智能配图建议失败:', error);
      pushToast('error', '配图建议失败', error.message || '请稍后重试。');
    } finally {
      setIsPlanningIllustration(false);
    }
  };

  const handlePresetSelect = (value: string) => {
    if (!value) return;

    if (value === 'save') {
      handleSavePreset();
      return;
    }

    if (value === 'login') {
      navigate('/login', { state: { from: '/' } });
      return;
    }

    if (value === 'mock-disabled') {
      pushToast('info', '当前模式不支持', 'OSS 调试模式下不启用云端预设。');
      return;
    }

    const preset = presets.find((item) => item.id === value);
    if (!preset) return;

    const presetTheme = preset.theme as unknown as Theme;
    const presetLayoutStyle = preset.layout_style as unknown as LayoutStyle;
    const presetImageStyle = preset.image_style as unknown as ImageStyle;
    const hydratedTheme = {
      ...(THEMES[presetTheme.id] || DEFAULT_THEME),
      ...presetTheme,
    };

    setActiveTheme(hydratedTheme);
    setActiveLayoutStyle(LAYOUT_STYLES[presetLayoutStyle.id] || presetLayoutStyle || DEFAULT_LAYOUT_STYLE);
    setActiveImageStyle(IMAGE_STYLES[presetImageStyle.id] || presetImageStyle || DEFAULT_IMAGE_STYLE);
    setActiveEmphasis(normalizeEmphasisConfig(
      presetTheme.emphasisConfig,
      hydratedTheme.emphasis || hydratedTheme.highlight,
    ));
    setActiveTypography(normalizeTypographyConfig(
      presetTheme.typographyConfig,
      presetLayoutStyle.id,
    ));
    setActiveComponentStyle(normalizeComponentStyleConfig(presetTheme.componentStyleConfig));
  };

  const handleThemeSelect = (theme: Theme) => {
    setActiveTheme(theme);
    setActiveEmphasis((current) => ({
      ...current,
      color: (theme.emphasis || theme.highlight).toUpperCase(),
    }));
  };

  const handleLayoutSelect = (layoutStyle: LayoutStyle) => {
    setActiveLayoutStyle(layoutStyle);
    setActiveTypography(createTypographyConfigForLayout(layoutStyle.id));
    setActiveComponentStyle(DEFAULT_COMPONENT_STYLE_CONFIG);
  };

  const handleApplyStyleScheme = (scheme: StyleScheme, keepEditing = false) => {
    if (!keepEditing && editingSchemeId && editingDirty) {
      const shouldDiscard = window.confirm('当前方案有未保存修改，确定放弃吗？');
      if (!shouldDiscard) return;
    }
    setEditingSchemeId(keepEditing ? scheme.id : null);
    setActiveTheme(THEMES[scheme.themeId] || DEFAULT_THEME);
    setActiveLayoutStyle(LAYOUT_STYLES[scheme.layoutId] || DEFAULT_LAYOUT_STYLE);
    setActiveImageStyle(IMAGE_STYLES[scheme.imageStyleId] || DEFAULT_IMAGE_STYLE);
    setActiveEmphasis({ ...scheme.emphasis });
    setActiveTypography({ ...scheme.typography });
    setActiveComponentStyle({ ...scheme.componentStyle });
  };

  const updateCustomStyleSchemes = (
    updater: (current: StyleScheme[]) => StyleScheme[],
  ) => {
    try {
      const next = updater(customStyleSchemes);
      if (next.length > 30) throw new Error('最多保存30套本机预设，请先导出备份并删除不再使用的方案。');
      saveCustomStyleSchemes(next);
      setCustomStyleSchemes(next);
      return true;
    } catch (error) {
      pushToast('error','预设未保存',error instanceof Error?error.message:'浏览器存储不可用，请先导出备份。');
      return false;
    }
  };

  const handleCreateCustomStyleScheme = (name: string) => {
    const scheme = createCustomStyleScheme(name, currentStyleSelection, currentSchemePreview);

    if (!updateCustomStyleSchemes((current) => [scheme, ...current])) return false;
    setEditingSchemeId(scheme.id);
    pushToast('success', '方案已创建', `“${scheme.name}”已保存到当前浏览器。`);
    return true;
  };

  const handleEditCustomStyleScheme = (scheme: StyleScheme) => {
    handleApplyStyleScheme(scheme, true);
    setEditingSchemeId(scheme.id);
    pushToast('success', '已进入编辑', `现在可以调整“${scheme.name}”的排版配置。`);
  };

  const handleEditFeaturedStyleScheme = (scheme: StyleScheme) => {
    const duplicated = duplicateAsCustomStyleScheme(scheme);
    if (!updateCustomStyleSchemes((current) => [duplicated, ...current])) return;
    handleApplyStyleScheme(duplicated, true);
    setEditingSchemeId(duplicated.id);
    pushToast('success', '已复制并进入编辑', `“${duplicated.name}”已加入我的方案。`);
  };

  const handleSaveEditingStyleScheme = () => {
    if (!editingSchemeId || !editingScheme) return;
    const updated = updateCustomStyleScheme(editingScheme, currentStyleSelection, currentSchemePreview);
    if (!updateCustomStyleSchemes((current) => current.map((scheme) => (
      scheme.id === updated.id ? updated : scheme
    )))) return;
    pushToast('success', '修改已保存', `“${updated.name}”已更新。`);
  };

  const handleSaveAsStyleScheme = (name: string) => {
    const scheme = createCustomStyleScheme(name, currentStyleSelection, currentSchemePreview);
    if (!updateCustomStyleSchemes((current) => [scheme, ...current])) return false;
    setEditingSchemeId(scheme.id);
    pushToast('success', '方案已另存', `“${scheme.name}”已加入我的方案。`);
    return true;
  };

  const handleResetEditingStyleScheme = () => {
    if (!editingScheme) return;
    handleApplyStyleScheme(editingScheme, true);
    pushToast('success', '已恢复保存版本', `“${editingScheme.name}”的未保存修改已撤销。`);
  };

  const handleDuplicateStyleScheme = (scheme: StyleScheme) => {
    const duplicated = duplicateAsCustomStyleScheme(scheme);
    if (!updateCustomStyleSchemes((current) => [duplicated, ...current])) return;
    pushToast('success', '方案已复制', `“${duplicated.name}”已加入我的方案。`);
  };

  const handleDeleteCustomStyleScheme = (schemeId: string) => {
    const scheme = customStyleSchemes.find((item) => item.id === schemeId);
    if (!updateCustomStyleSchemes((current) => current.filter((item) => item.id !== schemeId))) return;
    if (editingSchemeId === schemeId) setEditingSchemeId(null);
    pushToast('success', '方案已删除', scheme ? `“${scheme.name}”已从当前浏览器移除。` : undefined);
  };

  const handleRenameCustomStyleScheme = (id:string,name:string) => {
    const clean=name.trim().slice(0,40);
    if(!clean)return false;
    return updateCustomStyleSchemes(current=>current.map(scheme=>scheme.id===id?{...scheme,name:clean,updatedAt:new Date().toISOString()}:scheme));
  };

  const handleMoveCustomStyleScheme = (schemeId: string, direction: -1 | 1) => {
    updateCustomStyleSchemes((current) => {
      const index = current.findIndex((item) => item.id === schemeId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return current;

      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const handleImportCustomStyleSchemes = (raw: string) => {
    try {
      const imported = parseImportedStyleSchemes(raw);
      if (imported.length === 0) {
        pushToast('error', '导入失败', '文件中没有可用的风格方案。');
        return;
      }

      if (!updateCustomStyleSchemes((current) => [...imported, ...current])) return;
      setEditingSchemeId(null);
      pushToast('success', '方案已导入', `已加入 ${imported.length} 套风格方案。`);
    } catch {
      pushToast('error', '导入失败', '请选择有效的 JSON 方案文件。');
    }
  };

  const handleExportCustomStyleSchemes = () => {
    if (customStyleSchemes.length === 0) return;

    const blob = new Blob([serializeCustomStyleSchemes(customStyleSchemes)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `wechat-style-schemes-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    pushToast('success', '方案已导出', `已导出 ${customStyleSchemes.length} 套个人方案。`);
  };

  const handleToggleIllustrationItem = (id: string) => {
    setSelectedIllustrationIds((current) => (
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : [...current, id]
    ));
  };

  const handleCloseIllustrationPlan = () => {
    if (isApplyingIllustration) return;
    setIllustrationPlan(null);
    setSelectedIllustrationIds([]);
  };

  const handleApplyIllustrationPlan = async () => {
    if (!illustrationPlan) return;

    const access = getIllustrationAccess();
    if (!access.allowed) {
      pushToast('info', '暂不可用', access.message);
      if (access.reason === 'login_required' && isRealAuth) {
        navigate('/login', { state: { from: '/' } });
      }
      return;
    }

    if (selectedIllustrationIds.length === 0) {
      pushToast('info', '请选择建议', '请至少保留一条配图建议。');
      return;
    }

    setIsApplyingIllustration(true);
    try {
      const job = await createIllustrationJob({
        markdown,
        plan: illustrationPlan,
        selectedIds: selectedIllustrationIds,
      });

      if (job.status === 'completed' && job.resultMarkdown) {
        replaceMarkdownWithUndo(job.resultMarkdown, '应用配图');
      }
      setLastIllustrationJob(job);
      setIllustrationPlan(null);
      setSelectedIllustrationIds([]);
      if (job.status !== 'completed' || !job.resultMarkdown) {
        pushToast('success', '配图任务已提交', '后台正在生成配图，完成后可在右下角面板中决定是否应用结果。');
        return;
      }
      const sourceLabel = job.source === 'generated'
        ? '真实生成'
        : job.source === 'hybrid'
          ? '混合生成'
          : '占位回退';
      pushToast('success', '配图已应用', `已应用 ${job.insertedCount} 张配图，当前结果为${sourceLabel}。`);
    } catch (error: any) {
      console.error('智能配图应用失败:', error);
      pushToast('error', '配图应用失败', error.message || '请稍后重试。');
    } finally {
      setIsApplyingIllustration(false);
    }
  };

  const dismissGuestRecovery = () => { setShowGuestRecovery(false); try {localStorage.setItem('gzh_guest_draft_dismissed:'+draftOwner,'1');}catch{/* A full store must not block editing. */} };
  const recoverGuest = () => {
    try {const recovered=restoreGuestDraft(draftOwner,latestMarkdown.current);setUndoSnapshot(recovered.undo);setMarkdown(recovered.markdown);dismissGuestRecovery();pushToast('success','访客草稿已恢复','当前正文已保留为可撤销快照，访客原稿仍保留。');}
    catch(e){pushToast('error','恢复失败',e instanceof Error?e.message:'请先备份当前正文。');}
  };
  const handleLogout = () => {
    if(!saveDraft(markdown,draftOwner)){pushToast('error','草稿保存失败','请先导出正文，再退出账号。');return;}
    void logout();
    setDevIdentityRole('guest');
    setAuthUser(null);
    setPresets([]);
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) {
      pushToast('error', '修改密码失败', '请填写旧密码和新密码。');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      pushToast('error', '修改密码失败', '两次输入的新密码不一致。');
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(oldPassword, newPassword);
      pushToast('success', '密码已修改', '其他设备的登录状态已失效，本设备保持登录。');
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error: any) {
      pushToast('error', '修改密码失败', error.message || '请稍后重试。');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleRefreshIllustrationJob = async () => {
    if (!lastIllustrationJob || lastIllustrationJob.id.startsWith('oss-') || import.meta.env.VITE_APP_MODE !== 'online') return;

    try {
      const nextJob = await getIllustrationJob(lastIllustrationJob.id);
      setLastIllustrationJob(nextJob);
    } catch (error) {
      console.error('刷新配图任务失败:', error);
    }
  };

  const handleApplyIllustrationResult = () => {
    if (!lastIllustrationJob?.resultMarkdown) return;

    setIsApplyingIllustrationResult(true);
    try {
      replaceMarkdownWithUndo(lastIllustrationJob.resultMarkdown, '应用配图');
      pushToast('success', '结果已应用', `已将 ${lastIllustrationJob.insertedCount} 张配图写回正文。`);
    } finally {
      window.setTimeout(() => {
        setIsApplyingIllustrationResult(false);
      }, 160);
    }
  };

  const schemeControlProps = {
    activeSchemeId: activeStyleScheme?.id,
    customSchemes: customStyleSchemes,
    editingSchemeId: editingSchemeId,
    editingDirty: editingDirty,
    onApply: handleApplyStyleScheme,
    onCreate: handleCreateCustomStyleScheme,
    onEdit: handleEditCustomStyleScheme,
    onEditFeatured: handleEditFeaturedStyleScheme,
    onDuplicate: handleDuplicateStyleScheme,
    onDelete: handleDeleteCustomStyleScheme,
    onMove: handleMoveCustomStyleScheme,
    onRename: handleRenameCustomStyleScheme,
    onSaveEditing: handleSaveEditingStyleScheme,
    onSaveAs: handleSaveAsStyleScheme,
    onResetEditing: handleResetEditingStyleScheme,
    onImport: handleImportCustomStyleSchemes,
    onExport: handleExportCustomStyleSchemes
  };

  const saveSettings = () => {
    localStorage.setItem('openai_api_key', apiKey.trim());
    localStorage.setItem('openai_api_base', apiBaseUrl);
    localStorage.setItem('openai_model', apiModel);

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

    setShowSettings(false);
  };

  const handleSelectPreviewTab = (tab: 'wechat' | 'xThread' | 'xArticle') => {
    if (tab === 'xThread') {
      setXThreadExport((current) => current || generateXThreadExport(markdown));
    }
    if (tab === 'xArticle') {
      setXArticleExport((current) => current || generateXArticleExport(markdown));
    }
    setPreviewTab(tab);
  };

  return (
    <div className="typesetter-root">
      <ToastStack items={toastItems} onDismiss={dismissToast} position="bottom" />

      <WorkbenchShell
        onLeave={() => { const ok = saveDraft(markdown,draftOwner); if (!ok) pushToast('error', '草稿保存失败', '请先导出正文，再离开排版页面。'); return ok; }}
        userName={authUser?.email.split('@')[0]}
        userRole={authUser?.role}
        realAuth={isRealAuth}
        draftState={draftSaveState}
        onLogin={() => { if(!saveDraft(markdown,draftOwner)){pushToast('error','草稿保存失败','请先导出正文，再离开页面。');return;} navigate('/login', { state: { from: '/' } }); }}
        onLogout={() => void handleLogout()}
        onSettings={() => setShowSettings(true)}
        onConsole={() => { if(!saveDraft(markdown,draftOwner)){pushToast('error','草稿保存失败','请先导出正文，再离开页面。');return;} navigate('/admin'); }}
        onHelp={() => setShowCheatsheet(true)}
        onVideo={() => { if(!saveDraft(markdown,draftOwner)){pushToast('error','草稿保存失败','请先导出正文，再离开页面。');return;} navigate('/video-compare'); }}
        toolbar={(<div className="wb-style-controls">
          <div className="flex items-center space-x-2 border-l border-gray-200 pl-4">
            <span className="mr-1 text-xs font-medium text-gray-400">主题</span>
            {Object.values(THEMES).map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleThemeSelect(theme)}
                className={`h-4 w-4 rounded-full ring-offset-1 transition-all ${
                  activeTheme.id === theme.id
                    ? 'scale-110 shadow-sm ring-2 ring-gray-400'
                    : 'opacity-70 hover:scale-110 hover:opacity-100'
                }`}
                style={{ background: theme.primary }}
                title={theme.name}
                aria-label={theme.name}
                aria-pressed={activeTheme.id === theme.id}
              />
            ))}
          </div>

          <div className="flex items-center space-x-2 border-l border-gray-200 pl-4">
            <span className="mr-1 text-xs font-medium text-gray-400">版式</span>
            <select
              value={activeLayoutStyle.id}
              aria-label="文章版式"
              onChange={(event) => handleLayoutSelect(LAYOUT_STYLES[event.target.value])}
              className="cursor-pointer rounded-md border-none bg-gray-50 px-2 py-1 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {Object.values(LAYOUT_STYLES).map((style) => (
                <option key={style.id} value={style.id}>
                  {style.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2 border-l border-gray-200 pl-4">
            <span className="mr-1 text-xs font-medium text-gray-400">图片</span>
            <select
              value={activeImageStyle.id}
              aria-label="图片样式"
              onChange={(event) => setActiveImageStyle(IMAGE_STYLES[event.target.value])}
              className="cursor-pointer rounded-md border-none bg-gray-50 px-2 py-1 text-sm text-gray-700 outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {Object.values(IMAGE_STYLES).map((style) => (
                <option key={style.id} value={style.id}>
                  {style.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center border-l border-gray-200 pl-4"><StyleSchemeControl {...schemeControlProps} /></div>
          {accountsEnabled && (          <div className="flex items-center space-x-2 border-l border-gray-200 pl-4">
            <select
              className="w-36 cursor-pointer rounded-md border-none bg-gray-50 px-2 py-1 text-sm font-medium text-emerald-700 outline-none focus:ring-1 focus:ring-emerald-500"
              defaultValue=""
              aria-label="云端预设"
              onChange={(event) => {
                handlePresetSelect(event.target.value);
                event.target.value = '';
              }}
            >
              <option value="">云端预设</option>
              {canUseCloudPresets ? (
                <>
                  <option value="save">保存当前组合...</option>
                  {presets.length > 0 && (
                    <optgroup label="已保存预设">
                      {[...presets].reverse().map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              ) : isRealAuth ? (
                <option value="login">{accountsEnabled?'登录后使用云端预设':'云端预设 · 后续开放'}</option>
              ) : (
                <option value="mock-disabled">OSS 调试模式不启用云端预设</option>
              )}
            </select>
          </div>)}

        </div>
)}
        actions={(<>
          {phaseTwoEnabled && <ArticleControls markdown={markdown} owner={draftOwner} onLogin={() => {
            if (!saveDraft(latestMarkdown.current, draftOwner)) { pushToast('error', '草稿保存失败', '请先导出正文，再登录。'); return; }
            navigate('/login', { state: { from: '/' } });
          }} onLoad={(text,article) => {
            const snapshot = { label: '载入已保存的文章', markdown: latestMarkdown.current, savedAt: Date.now(), article:loadArticleIdentity(draftOwner) };
            const keys = draftKeys(draftOwner);
            try { atomicDraftWrite(localStorage, new Map([[keys.undo, JSON.stringify(snapshot)], [keys.draft, text], [keys.article, articleIdentityJson(article)]])); }
            catch { throw new Error('本机存储写入失败，未载入文章，请先导出当前正文。'); }
            setUndoSnapshot(snapshot);
            setMarkdown(text);
          }}/>}
          <button className="wb-image-action flex items-center whitespace-nowrap" data-action="image-export" onClick={() => setShowImageExportPanel(true)}>
            <ImageDown className="mr-1.5 h-4 w-4" />导出图片
          </button>
          <HeaderMenu
            label="AI 工具"
            icon={<Wand2 className="mr-1.5 h-4 w-4" />}
            buttonClassName="flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
            items={[
              {
                key: 'ai-typeset',
                label: isTypesetting ? 'AI 排版中...' : 'AI 一键排版',
                icon: <Wand2 className={`mr-2 h-4 w-4 text-amber-600 ${isTypesetting ? 'animate-spin' : ''}`} />,
                disabled: isTypesetting,
                onSelect: () => void handleAITypeset(),
              },
              {
                key: 'illustration-plan',
                label: isPlanningIllustration ? '分析配图中...' : '智能配图建议',
                icon: <ImagePlus className={`mr-2 h-4 w-4 text-sky-600 ${isPlanningIllustration ? 'animate-pulse' : ''}`} />,
                disabled: isPlanningIllustration,
                onSelect: () => void handleIllustrationPlan(),
              },
              ...(undoSnapshot ? [{
                key: 'undo-replace',
                label: `撤销：${undoSnapshot.label}`,
                icon: <Undo2 className="mr-2 h-4 w-4 text-slate-500" />,
                onSelect: handleUndoReplace,
              }] : []),
            ]}
          />

          <HeaderMenu
            label="更多导出"
            icon={<Share2 className="mr-1.5 h-4 w-4" />}
            buttonClassName="flex items-center whitespace-nowrap rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            items={[
              {
                key: 'copy-x-thread',
                label: '复制 X Thread',
                icon: <MessageSquareQuote className="mr-2 h-4 w-4 text-sky-600" />,
                onSelect: () => void handleCopyXThread(),
              },
              {
                key: 'copy-x-article',
                label: '复制 X Article',
                icon: <FileText className="mr-2 h-4 w-4 text-violet-600" />,
                onSelect: () => void handleCopyXArticle(),
              },
              {
                key: 'export-image',
                label: '导出图片',
                icon: <ImageDown className="mr-2 h-4 w-4 text-pink-600" />,
                onSelect: () => setShowImageExportPanel(true),
              },
            ]}
          />





          <button
            onClick={handleCopy}
            className="wb-copy-action flex items-center whitespace-nowrap rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <Copy className="mr-1.5 h-4 w-4" />
            复制到公众号
          </button>

        </>)}
      >

      {guestRecoveryAvailable && showGuestRecovery && <div className="wb-draft-recovery" role="status"><div><strong>本浏览器保留了一份访客或旧版草稿</strong><p>可手动带入当前账号；原稿继续保留，当前正文可撤销恢复。</p></div><button onClick={recoverGuest}>恢复访客草稿</button><button onClick={dismissGuestRecovery}>暂不带入</button></div>}
      <main className="wb-editor-grid">
        <section className="wb-editor-pane">
          <div className="wb-pane-heading">
            <span>Markdown 输入<small className="wb-draft-owner">{!accountsEnabled?'本机草稿 · 本浏览器':draftOwner==='guest'?'访客草稿 · 本浏览器':'当前账号草稿 · 本浏览器'}</small></span>
            <div className="wb-import-actions">
              <button onClick={()=>setShowDraftBackups(true)} aria-label="草稿备份">草稿备份</button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,.txt"
                onChange={handleLocalFilePick}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-emerald-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700"
                title="上传本地 .md / .txt 文件"
              >
                <FileText className="mr-1 h-3.5 w-3.5" />
                本地
              </button>
              <button
                onClick={() => accountsEnabled ? setShowFeishuSidebar(true) : pushToast('info','飞书导入后续开放','当前可使用本地文件导入。')}
                className="flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-emerald-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700"
              >
                <Cloud className="mr-1 h-3.5 w-3.5" />
                {accountsEnabled?'飞书':'飞书 · 后续开放'}
              </button>
              <button
                onClick={() => setShowCheatsheet(true)}
                className="flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-emerald-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700"
              >
                <BookOpen className="mr-1 h-3.5 w-3.5" />
                语法参考
              </button>
            </div>
          </div>
          <div className="wb-editor-body">
            <Editor
              value={markdown}
              onChange={setMarkdown}
              editorRef={editorRef}
              onScroll={handleEditorScroll}
            />
          </div>
          <footer className="wb-editor-footer"><span>{markdown.replace(/\s/g, '').length.toLocaleString()} 字符</span><span>Markdown · 自动保存到本机</span></footer>
        </section>

        <section className="wb-preview-pane">
          <div className="wb-pane-heading wb-preview-heading">
            <div className="wb-preview-tabs" role="tablist" aria-label="预览平台">
              {([
                { key: 'wechat' as const, label: '公众号' },
                { key: 'xThread' as const, label: 'X Thread' },
                { key: 'xArticle' as const, label: 'X Article' },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleSelectPreviewTab(tab.key)}
                  role="tab"
                  aria-selected={previewTab === tab.key}
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                    previewTab === tab.key
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="wb-preview-settings">
              {previewTab === 'wechat' && (
                <>
                  <ArticleImages markdown={markdown} owner={draftOwner} onReplace={(expected,next)=>{
                    if(latestMarkdown.current!==expected)throw Error('正文已变化，请重新选择图片');
                    const snapshot={label:'替换文章图片',markdown:expected,savedAt:Date.now()};
                    const keys=draftKeys(draftOwner);
                    try{atomicDraftWrite(localStorage,new Map([[keys.undo,JSON.stringify(snapshot)],[keys.draft,next]]));}
                    catch{throw Error('本机保存失败，正文中的图片未替换，请先导出文章。');}
                    setUndoSnapshot(snapshot);setMarkdown(next);
                  }}/>
                  <TypographyControl
                    value={activeTypography}
                    emphasisValue={activeEmphasis}
                    themeColor={activeTheme.emphasis || activeTheme.highlight}
                    layoutId={activeLayoutStyle.id}
                    onChange={setActiveTypography}
                    onEmphasisChange={setActiveEmphasis}
                  />
                  <ComponentStyleControl
                    value={activeComponentStyle}
                    themeColor={activeTheme.primary}
                    onChange={setActiveComponentStyle}
                  />
                  <select className="wb-preview-width" value={previewWidth} onChange={event => setPreviewWidth(Number(event.target.value) as 375 | 677)} aria-label="预览宽度">
                    <option value={375}>手机 375px</option>
                    <option value={677}>宽屏 677px</option>
                  </select>
                </>
              )}
            </div>
          </div>

          {previewTab === 'wechat' ? (
            <div
              ref={previewScrollRef}
              onScroll={handlePreviewScroll}
              className="wb-preview-scroll"
            >
              <div
                style={{ width: `${previewWidth}px`, margin: '0 auto' }}
                data-preview-frame
                data-width={previewWidth}
                className="wb-preview-frame"
              >
                <Preview
                  markdown={markdown}
                  theme={activeTheme}
                  layoutStyle={activeLayoutStyle}
                  imageStyle={activeImageStyle}
                  emphasis={activeEmphasis}
                  typography={activeTypography}
                  componentStyle={activeComponentStyle}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <LazyTool onClose={() => setPreviewTab('wechat')}><PlatformExportPanel
                threadExport={xThreadExport}
                articleExport={xArticleExport}
                activePlatform={previewTab}
                onCopyThreadAll={() => {
                  if (!xThreadExport) return;
                  void copyPlainText(xThreadExport.combinedText, '复制成功', `X Thread 文案已复制，共 ${xThreadExport.posts.length} 条。`);
                }}
                onCopyThreadPost={(content, index) => {
                  void copyPlainText(content, '复制成功', `第 ${index} 条 Thread 已复制。`);
                }}
                onCopyArticleTitle={() => {
                  if (!xArticleExport) return;
                  void copyPlainText(xArticleExport.title, '复制成功', 'X Article 标题已复制。');
                }}
                onCopyArticleBody={() => {
                  if (!xArticleExport) return;
                  void copyRichText(
                    xArticleExport.bodyRichHtml,
                    xArticleExport.body,
                    '复制成功',
                    'X Article 正文已以富文本形式复制。',
                  );
                }}
                onCopyArticleAll={() => {
                  if (!xArticleExport) return;
                  void copyRichText(
                    xArticleExport.combinedHtml,
                    xArticleExport.combinedText,
                    '复制成功',
                    'X Article 全文已以富文本形式复制。',
                  );
                }}
                onCopyArticleCodeBlock={(content, language, index) => {
                  void copyPlainText(
                    content,
                    '复制成功',
                    `第 ${index} 段 ${language || 'text'} 代码已复制，可直接粘贴到 X 的“插入代码”块。`,
                  );
                }}
              /></LazyTool>
            </div>
          )}
        </section>
      </main>
      </WorkbenchShell>

      {pendingImport && <ImportArticleModal source={pendingImport} error={importError} hasContent={Boolean(markdown.trim())} onImport={confirmExternalImport} onClose={() => { setPendingImport(null); setImportError(''); }} />}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div data-ui-surface role="dialog" aria-modal="true" aria-labelledby="workbench-settings-title" className="m-4 max-h-[calc(100dvh-2rem)] w-[480px] max-w-full overflow-y-auto rounded-[20px] bg-white/95 p-8 shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-200">
            <div className="mb-6 flex items-center justify-between gap-3"><h3 id="workbench-settings-title" className="text-xl font-bold text-gray-900">工作台设置</h3><button type="button" aria-label="关闭工作台设置" onClick={() => setShowSettings(false)} className="rounded-lg px-2 py-1 text-xl text-gray-500 hover:bg-gray-100">×</button></div>

            <UiSkinControl />
            {guestRecoveryAvailable && <section className="wb-recovery-settings"><strong>本机草稿恢复</strong><p>访客及旧版草稿保留在本浏览器，可手动带入当前账号。</p><button onClick={()=>{recoverGuest();setShowSettings(false);}}>恢复访客草稿</button></section>}

            {showDevIdentity && (
              <div className="mb-5">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">调试身份</label>
                <DevIdentitySwitcher value={devIdentityRole} onChange={handleDevIdentityChange} />
              </div>
            )}

            {canChangePassword && (
              <div className="mb-5">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">修改密码</label>
                <div className="space-y-2">
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(event) => setOldPassword(event.target.value)}
                    placeholder="旧密码"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="新密码（至少 8 位，需包含字母和数字）"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(event) => setConfirmNewPassword(event.target.value)}
                    placeholder="确认新密码"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleChangePassword}
                      disabled={isChangingPassword}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-all hover:bg-emerald-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isChangingPassword ? '提交中…' : '确认修改'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-5 flex space-x-1 rounded-lg bg-gray-100 p-1">
              <button
                onClick={() => setSettingsTab('ai')}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  settingsTab === 'ai'
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                AI 排版
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
                <p className="text-sm leading-6 text-gray-500">个人 API：游客和登录用户均可使用。配置保存在当前浏览器，请求直接发送到你填写的服务商；调用费用由你的 API 账户承担。接口需支持浏览器跨域访问，HTTPS 网站请填写 HTTPS 接口。</p>
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
                onClick={() => setShowSettings(false)}
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
          </div>
        </div>
      )}

      {showDraftBackups && <LazyTool onClose={()=>setShowDraftBackups(false)}><DraftBackupsPanel owner={draftOwner} getCurrent={()=>latestMarkdown.current} onRestore={(next,undo)=>{setMarkdown(next);setUndoSnapshot(undo);notifyArticleIdentity();}} onClose={()=>setShowDraftBackups(false)}/></LazyTool>}
      {showCheatsheet && <LazyTool onClose={() => setShowCheatsheet(false)}><CheatsheetModal onClose={() => setShowCheatsheet(false)} /></LazyTool>}
      {showFormatPreferences && (
        <FormatPreferenceModal
          value={formatPreferences}
          onChange={setFormatPreferences}
          customNote={formatCustomNote}
          onCustomNoteChange={setFormatCustomNote}
          onConfirm={() => void runAITypeset()}
          onClose={() => setShowFormatPreferences(false)}
        />
      )}
      {pendingAiResult && (
        <AiResultReviewModal
          original={pendingAiResult.original}
          analysis={pendingAiResult.analysis}
          editedDuringRequest={markdown !== pendingAiResult.original}
          renderPreview={(previewMarkdown) => (
            <div className="w-full max-w-[677px] bg-white shadow-sm">
              <Preview
                elementId="ai-review-preview"
                markdown={previewMarkdown}
                theme={activeTheme}
                layoutStyle={activeLayoutStyle}
                imageStyle={activeImageStyle}
                emphasis={activeEmphasis}
                typography={activeTypography}
                componentStyle={activeComponentStyle}
              />
            </div>
          )}
          onAccept={handleAcceptAiResult}
          onDiscard={() => {
            setPendingAiResult(null);
            pushToast('info', '已放弃 AI 排版结果', '正文保持不变。');
          }}
        />
      )}

      {showPresetNameModal && (
        <InputPromptModal
          title="保存云端预设"
          description="给当前主题、版式和图片风格组合起一个容易辨认的名字。"
          value={presetNameInput}
          placeholder="例如：科技蓝图 / 阅读版"
          confirmLabel="保存预设"
          isSubmitting={isSavingPreset}
          onChange={setPresetNameInput}
          onConfirm={handleConfirmSavePreset}
          onClose={() => {
            if (isSavingPreset) return;
            setShowPresetNameModal(false);
            setPresetNameInput('');
          }}
        />
      )}
      {illustrationPlan && (
        <LazyTool onClose={handleCloseIllustrationPlan}><IllustrationPlanModal
          plan={illustrationPlan}
          selectedIds={selectedIllustrationIds}
          isSubmitting={isApplyingIllustration}
          onToggle={handleToggleIllustrationItem}
          onConfirm={handleApplyIllustrationPlan}
          onClose={handleCloseIllustrationPlan}
        /></LazyTool>
      )}
      {lastIllustrationJob && (
        <LazyTool onClose={() => setLastIllustrationJob(null)}><IllustrationJobPanel
          job={lastIllustrationJob}
          onRefresh={import.meta.env.VITE_APP_MODE === 'online' && !lastIllustrationJob.id.startsWith('oss-') ? handleRefreshIllustrationJob : undefined}
          onApply={handleApplyIllustrationResult}
          isApplying={isApplyingIllustrationResult}
          onClose={() => setLastIllustrationJob(null)}
        /></LazyTool>
      )}
      {showImageExportPanel && (
        <LazyTool onClose={() => setShowImageExportPanel(false)}><ImageExportPanel
          elementId="wechat-article-preview"
          markdown={markdown}
          onClose={() => setShowImageExportPanel(false)}
        /></LazyTool>
      )}
      {accountsEnabled && showFeishuSidebar && <LazyTool onClose={() => setShowFeishuSidebar(false)}><FeishuSidebar
        open={showFeishuSidebar}
        onClose={() => setShowFeishuSidebar(false)}
        onImport={(title, md) => handleExternalImport(title, md, 'feishu')}
      /></LazyTool>}
    </div>
  );
}

export default TypesetterView;
