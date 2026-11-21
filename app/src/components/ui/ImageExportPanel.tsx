import { Download, Image as ImageIcon, Images, Layers, LayoutTemplate, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { generateCoverCopy } from '../../ai/coverCopy';
import type { CoverCopyProposal } from '../../ai/coverCopy';
import { generateXhsCards } from '../../ai/xhsCards';
import type { XhsDeck } from '../../ai/xhsCards';
import { generateCoverImage, generateLongImage, generateSlicedImages } from '../../services/imageExportService';
import { COVER_COLORS, COVER_HEIGHT, COVER_TEMPLATES, COVER_WIDTH, CoverTemplate } from './CoverTemplate';
import type { CoverTemplateId } from './CoverTemplate';
import {PictureGenerator} from './PictureGenerator';
import {AICoverArtwork,AI_COVER_HEIGHT,AI_COVER_WIDTH} from './AICoverArtwork';
import { getXhsTheme, XHS_CARD_HEIGHT, XHS_CARD_WIDTH, XHS_THEME_PACKS, XhsCard } from './XhsCard';
import type { XhsCardSpec } from './XhsCard';
import { getStickerTheme, XHS_STICKER_THEMES, XhsStickerCard } from './XhsStickerCard';
import { getMinimalTheme, XHS_MINIMAL_THEMES, XhsMinimalCard } from './XhsMinimalCard';
import { getWorkbenchTheme, XHS_WORKBENCH_THEMES, XhsWorkbenchCard } from './XhsWorkbenchCard';
import { getPulseTheme, XHS_PULSE_THEMES, XhsPulseCard } from './XhsPulseCard';
import { getPosterTheme, XHS_POSTER_THEMES, XhsPosterCard } from './XhsPosterCard';

type XhsSystemId = 'editorial' | 'sticker' | 'minimal' | 'workbench' | 'pulse' | 'poster';

interface ImageExportPanelProps {
  elementId: string;
  markdown?: string;
  onClose: () => void;
  onSettings?:()=>void;
  coverOnly?:boolean;
}

const RATIO_OPTIONS = [
  { label: '3:4 (小红书最佳)', value: 4 / 3 },
  { label: '1:1 (正方形)', value: 1 },
  { label: '4:3 (宽图)', value: 3 / 4 },
  { label: '16:9 (超宽图)', value: 9 / 16 },
];

/** Scale used to fit the 1080x1440 cover node into the preview area. */
const COVER_PREVIEW_SCALE = 0.34;

/** Scale used for the AI proposal thumbnail cards. */
const COVER_THUMB_SCALE = 0.115;

/** Scale used for each card thumbnail in the XHS deck grid. */
const XHS_CARD_THUMB_SCALE = 0.2;

// --- 图文卡片编辑器：把不同版式的文本字段统一成「主文案 / 次文案 / 要点行」 ---

const cardMainText = (card: XhsCardSpec): string =>
  card.layout === 'cover' ? card.title : card.layout === 'quote' ? card.quote : card.heading;

const withMainText = (card: XhsCardSpec, value: string): XhsCardSpec => {
  if (card.layout === 'cover') return { ...card, title: value };
  if (card.layout === 'quote') return { ...card, quote: value };
  return { ...card, heading: value };
};

const cardSecondaryText = (card: XhsCardSpec): string | null => {
  if (card.layout === 'cover') return card.subtitle;
  if (card.layout === 'quote') return card.source;
  if (card.layout === 'summary') return card.closing;
  return null;
};

const withSecondaryText = (card: XhsCardSpec, value: string): XhsCardSpec => {
  if (card.layout === 'cover') return { ...card, subtitle: value };
  if (card.layout === 'quote') return { ...card, source: value };
  if (card.layout === 'summary') return { ...card, closing: value };
  return card;
};

/** 要点行序列化：每行一条，复合结构用 ｜ 分隔 */
const cardLines = (card: XhsCardSpec): string | null => {
  switch (card.layout) {
    case 'cover':
      return card.points.join('\n');
    case 'checklist':
    case 'summary':
      return card.items.map((it) => (it.detail ? `${it.label}｜${it.detail}` : it.label)).join('\n');
    case 'steps':
      return card.steps.map((s) => (s.desc ? `${s.title}｜${s.desc}` : s.title)).join('\n');
    case 'data':
      return card.rows.map((r) => `${r.label}|${r.value}|${r.pct}`).join('\n');
    default:
      return null;
  }
};

const withLines = (card: XhsCardSpec, text: string): XhsCardSpec => {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const pair = (l: string) => {
    const [a = '', b = ''] = l.split('｜').map((s) => s.trim());
    return { label: a, detail: b };
  };
  switch (card.layout) {
    case 'cover':
      return { ...card, points: lines };
    case 'checklist':
    case 'summary':
      return { ...card, items: lines.map(pair).filter((it) => it.label) };
    case 'steps':
      return { ...card, steps: lines.map(pair).filter((s) => s.label).map((s) => ({ title: s.label, desc: s.detail })) };
    case 'data':
      return {
        ...card,
        rows: lines
          .map((l) => {
            const [label = '', value = '', pct = '0'] = l.split('|').map((s) => s.trim());
            return { label, value, pct: Number(pct) || 0 };
          })
          .filter((r) => r.label && r.value),
      };
    default:
      return card;
  }
};

const extractCoverDefaults = (markdown: string): { title: string; subtitle: string } => {
  const line = markdown
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('# '));
  if (!line) return { title: '', subtitle: '' };
  const raw = line.replace(/^#\s+/, '');
  const parts = raw.split('|').map((s) => s.trim());
  if (parts.length >= 2) {
    return {
      title: parts[1] || parts[0],
      subtitle: (parts[2] || '').replace(/^\/+\s*/, ''),
    };
  }
  return { title: raw, subtitle: '' };
};

export function ImageExportPanel({ elementId, markdown, onClose, onSettings,coverOnly=false }: ImageExportPanelProps) {
  const [activeMode, setActiveMode] = useState<'long' | 'slice' | 'cover' | 'cards'>(coverOnly?'cover':'long');
  const [sliceRatio, setSliceRatio] = useState<number>(4 / 3);
  const [images, setImages] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverTitle, setCoverTitle] = useState(() => extractCoverDefaults(markdown ?? '').title);
  const [coverSubtitle, setCoverSubtitle] = useState(() => extractCoverDefaults(markdown ?? '').subtitle);
  const [coverTemplate, setCoverTemplate] = useState<CoverTemplateId>('poster');
  const [coverColor, setCoverColor] = useState(COVER_COLORS[0]);
  const [coverArt,setCoverArt]=useState<Blob|null>(null);
  const [coverAuthor,setCoverAuthor]=useState('');
  const [coverAlignment,setCoverAlignment]=useState<'left'|'right'>('left');
  const [coverCrop,setCoverCrop]=useState(50);
  const [isDownloadingCover, setIsDownloadingCover] = useState(false);
  const [coverProposals, setCoverProposals] = useState<CoverCopyProposal[]>([]);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [appliedProposalIndex, setAppliedProposalIndex] = useState<number | null>(null);
  const [xhsDeck, setXhsDeck] = useState<XhsDeck | null>(null);
  const [cardSystem, setCardSystem] = useState<XhsSystemId>('editorial');
  const [stickerThemeId, setStickerThemeId] = useState(XHS_STICKER_THEMES[0].id);
  const [minimalThemeId, setMinimalThemeId] = useState(XHS_MINIMAL_THEMES[0].id);
  const [workbenchThemeId, setWorkbenchThemeId] = useState(XHS_WORKBENCH_THEMES[0].id);
  const [pulseThemeId, setPulseThemeId] = useState(XHS_PULSE_THEMES[0].id);
  const [posterThemeId, setPosterThemeId] = useState(XHS_POSTER_THEMES[0].id);
  const [isGeneratingDeck, setIsGeneratingDeck] = useState(false);
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);
  const [isDownloadingCards, setIsDownloadingCards] = useState(false);
  const [overflowCards, setOverflowCards] = useState<Set<number>>(new Set());
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  // 截图专用：屏幕外渲染的原始尺寸节点。直接截缩略图会被 scale 变换污染。
  const cardCaptureRefs = useRef<(HTMLDivElement | null)[]>([]);
  const coverCaptureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeMode === 'cover' || activeMode === 'cards') return;
    generate();
  }, [activeMode, sliceRatio]);

  // 渲染后测量每张卡片是否溢出（文字超出画布）。之前深度遍历会误报两类：
  //   (1) 绝对定位装饰（胶带/页脚/LED）
  //   (2) 带 letter-spacing 的 CJK 文本 —— 每字尾间距累加到 scrollWidth 但不算入
  //       clientWidth，5-10 字就能虚增 20-40px，把每个 kicker 标签都标成溢出。
  // 现在只报"高度纵向真正超" —— 横向由 CSS overflowWrap 兜住，几乎不会真溢出。
  useEffect(() => {
    if (!xhsDeck) return;
    const timer = setTimeout(() => {
      const overflow = new Set<number>();
      const HEIGHT_TOL = 12;
      const hasDirectText = (node: HTMLElement) => {
        for (let n = 0; n < node.childNodes.length; n += 1) {
          const child = node.childNodes[n];
          if (child.nodeType === Node.TEXT_NODE && (child.textContent || '').trim().length > 2) return true;
        }
        return false;
      };
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const nodes = el.querySelectorAll<HTMLElement>('*');
        for (let n = 0; n < nodes.length; n += 1) {
          const node = nodes[n];
          if (node.tagName === 'SVG' || node.tagName === 'svg') continue;
          const cs = window.getComputedStyle(node);
          if (cs.position === 'absolute' || cs.position === 'fixed') continue;
          if (!hasDirectText(node)) continue;
          // 只信纵向：文字真的顶破容器高度才是溢出。
          if (node.scrollHeight > node.clientHeight + HEIGHT_TOL) {
            overflow.add(i);
            break;
          }
        }
      });
      setOverflowCards(overflow);
    }, 220);
    return () => clearTimeout(timer);
  }, [xhsDeck, cardSystem, stickerThemeId, minimalThemeId, workbenchThemeId, pulseThemeId, posterThemeId]);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      // Small timeout to allow UI to update (show spinner)
      await new Promise((resolve) => setTimeout(resolve, 50));
      
      if (activeMode === 'long') {
        const img = await generateLongImage(elementId);
        setImages([img]);
      } else {
        const imgs = await generateSlicedImages(elementId, sliceRatio);
        setImages(imgs);
      }
    } catch (e: any) {
      setError(e.message || '生成图片失败');
      setImages([]);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAll = () => {
    images.forEach((img, index) => {
      setTimeout(() => {
        downloadImage(img, `export_${activeMode}_${Date.now()}_${index + 1}.png`);
      }, index * 300);
    });
  };

  const handleDownloadCover = async () => {
    if (!coverCaptureRef.current) return;
    setIsDownloadingCover(true);
    setError(null);
    try {
      if(coverArt){
        const image=coverCaptureRef.current.querySelector('img');
        if(!image)throw new Error('底图仍在加载，请稍后再下载。');
        await image.decode();
      }
      const img = await generateCoverImage(coverCaptureRef.current);
      downloadImage(img, `${coverArt?'wechat':'xiaohongshu'}_cover_${Date.now()}.png`);
    } catch (e: any) {
      setError(e.message || '生成封面失败');
    } finally {
      setIsDownloadingCover(false);
    }
  };

  const coverPreview=()=>coverArt
    ? <AICoverArtwork image={coverArt} title={coverTitle} subtitle={coverSubtitle} author={coverAuthor} alignment={coverAlignment} crop={coverCrop}/>
    : <CoverTemplate title={coverTitle||'输入封面主标题'} subtitle={coverSubtitle} template={coverTemplate} accentColor={coverColor}/>;

  const handleGenerateCopy = async () => {
    setIsGeneratingCopy(true);
    setError(null);
    try {
      const proposals = await generateCoverCopy(markdown ?? '');
      setCoverProposals(proposals);
      setAppliedProposalIndex(null);
    } catch (e: any) {
      setError(e.message || 'AI 封面方案生成失败');
    } finally {
      setIsGeneratingCopy(false);
    }
  };

  const applyProposal = (proposal: CoverCopyProposal, index: number) => {
    setCoverTitle(proposal.title);
    setCoverSubtitle(proposal.subtitle);
    setCoverTemplate(proposal.template);
    setCoverColor(proposal.color);
    setAppliedProposalIndex(index);
  };

  const handleGenerateDeck = async () => {
    setIsGeneratingDeck(true);
    setError(null);
    try {
      const deck = await generateXhsCards(markdown ?? '');
      setXhsDeck(deck);
      setSelectedCardIndex(0);
      // AI 会先按文章调性挑一套视觉系统，UI 顺势切过去，用户仍可手动改
      setCardSystem(deck.system);
      if (deck.system === 'sticker') setStickerThemeId(deck.theme);
      else if (deck.system === 'minimal') setMinimalThemeId(deck.theme);
      else if (deck.system === 'workbench') setWorkbenchThemeId(deck.theme);
      else if (deck.system === 'pulse') setPulseThemeId(deck.theme);
      else if (deck.system === 'poster') setPosterThemeId(deck.theme);
    } catch (e: any) {
      setError(e.message || 'AI 图文生成失败');
    } finally {
      setIsGeneratingDeck(false);
    }
  };

  const updateCard = (index: number, next: XhsCardSpec) => {
    setXhsDeck((d) => (d ? { ...d, cards: d.cards.map((c, i) => (i === index ? next : c)) } : d));
  };

  /** 按当前视觉系统渲染一张卡片（缩略图与截图宿主共用） */
  const renderDeckCard = (card: XhsCardSpec, index: number) => {
    if (!xhsDeck) return null;
    const page = index + 1;
    const total = xhsDeck.cards.length;
    if (cardSystem === 'sticker') return <XhsStickerCard card={card} theme={getStickerTheme(stickerThemeId)} page={page} total={total} />;
    if (cardSystem === 'minimal') return <XhsMinimalCard card={card} theme={getMinimalTheme(minimalThemeId)} page={page} total={total} />;
    if (cardSystem === 'workbench') return <XhsWorkbenchCard card={card} theme={getWorkbenchTheme(workbenchThemeId)} page={page} total={total} />;
    if (cardSystem === 'pulse') return <XhsPulseCard card={card} theme={getPulseTheme(pulseThemeId)} page={page} total={total} />;
    if (cardSystem === 'poster') return <XhsPosterCard card={card} theme={getPosterTheme(posterThemeId)} page={page} total={total} />;
    return <XhsCard card={card} theme={getXhsTheme(xhsDeck.theme)} page={page} total={total} />;
  };

  const handleDownloadCards = async () => {
    if (!xhsDeck) return;
    setIsDownloadingCards(true);
    setError(null);
    try {
      for (let i = 0; i < xhsDeck.cards.length; i++) {
        const node = cardCaptureRefs.current[i];
        if (!node) continue;
        const img = await generateCoverImage(node);
        downloadImage(img, `xhs_card_${Date.now()}_${String(i + 1).padStart(2, '0')}.png`);
        // 避免浏览器拦截连续下载
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (e: any) {
      setError(e.message || '图文下载失败');
    } finally {
      setIsDownloadingCards(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(7,10,18,0.42)] p-4 backdrop-blur-md">
      <div className="relative flex h-[min(88vh,860px)] w-[min(1040px,100%)] flex-col overflow-hidden rounded-[32px] border border-white/15 bg-[linear-gradient(135deg,rgba(8,12,22,0.98),rgba(17,24,39,0.95))] text-white shadow-[0_40px_120px_rgba(2,8,23,0.55)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(236,72,153,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(244,63,94,0.12),transparent_26%)]" />

        <div className="relative flex items-start justify-between gap-4 border-b border-white/10 px-7 py-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-pink-200">
              <Sparkles className="h-3.5 w-3.5" />
              {coverOnly?'AI COVER':'Image Export'}
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">{coverOnly?'AI 封面':'图片导出中心'}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {coverOnly?'选择画面风格，生成底图，再编辑标题和署名。':'生成高清长图、平台切片、封面和小红书图文。'}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            title="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!coverOnly&&<div className="relative flex items-center justify-between gap-3 border-b border-white/10 px-7 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveMode('long')}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                activeMode === 'long'
                  ? 'bg-pink-400 text-slate-950 shadow-[0_10px_30px_rgba(244,114,182,0.35)]'
                  : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <ImageIcon className="h-4 w-4" />
              完整长图
            </button>
            <button
              onClick={() => setActiveMode('slice')}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                activeMode === 'slice'
                  ? 'bg-rose-400 text-slate-950 shadow-[0_10px_30px_rgba(251,113,133,0.35)]'
                  : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <Layers className="h-4 w-4" />
              切片多图
            </button>
            <button
              onClick={() => setActiveMode('cover')}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                activeMode === 'cover'
                  ? 'bg-amber-300 text-slate-950 shadow-[0_10px_30px_rgba(252,211,77,0.35)]'
                  : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <LayoutTemplate className="h-4 w-4" />
              爆款封面
            </button>
            <button
              onClick={() => setActiveMode('cards')}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                activeMode === 'cards'
                  ? 'bg-emerald-300 text-slate-950 shadow-[0_10px_30px_rgba(110,231,183,0.35)]'
                  : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <Images className="h-4 w-4" />
              小红书图文
            </button>
          </div>
          
          {activeMode === 'slice' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">切图比例:</span>
              <select
                value={sliceRatio}
                onChange={(e) => setSliceRatio(Number(e.target.value))}
                className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none transition-colors hover:bg-white/10 focus:border-rose-400/50"
              >
                {RATIO_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value} className="bg-slate-900 text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>}

        <div className="relative flex min-h-0 flex-1 flex-col overflow-auto px-7 py-6">
          {error && (
            <div className="mb-4 rounded-[26px] border border-red-400/20 bg-red-400/10 p-5 text-sm text-red-200">
              {error}
            </div>
          )}

          {activeMode === 'cards' ? (
            !xhsDeck ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-center">
                  <Images className="h-10 w-10 text-emerald-300" />
                  <p className="max-w-[420px] text-sm leading-6 text-slate-300">
                    AI 会通读正文，把文章拆成封面 + 若干张内容卡（清单 / 步骤 / 对比 / 金句 / 总结），
                    生成一整组 3:4 小红书轮播图文。
                  </p>
                  <button
                    onClick={handleGenerateDeck}
                    disabled={isGeneratingDeck}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-300 px-6 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGeneratingDeck ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    {isGeneratingDeck ? 'AI 正在拆解文章...' : 'AI 生成图文'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-8 lg:flex-row">
                <div className="w-full shrink-0 space-y-6 lg:w-[300px]">
                  <button
                    onClick={handleGenerateDeck}
                    disabled={isGeneratingDeck}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-2.5 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGeneratingDeck ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    {isGeneratingDeck ? 'AI 正在拆解文章...' : '重新生成'}
                  </button>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                      视觉系统
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: 'editorial', name: '杂志风' },
                        { id: 'sticker', name: '手账风' },
                        { id: 'minimal', name: '简约风' },
                        { id: 'workbench', name: '工作台' },
                        { id: 'pulse', name: '系统脉冲' },
                        { id: 'poster', name: '海报' },
                      ] as const).map((sys) => (
                        <button
                          key={sys.id}
                          onClick={() => setCardSystem(sys.id)}
                          className={`rounded-[14px] px-2 py-2 text-xs font-medium transition-all ${
                            cardSystem === sys.id
                              ? 'bg-emerald-300 text-slate-950 shadow-[0_8px_24px_rgba(110,231,183,0.3)]'
                              : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          {sys.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                      主题包
                    </label>
                    {(() => {
                      // 每套视觉系统各自的主题列表；用最小共同接口 { id, name, bg, fg, accent } 展示预览
                      type ThemePreview = { id: string; name: string; bg: string; fg: string; accent: string };
                      const packs: ThemePreview[] =
                        cardSystem === 'sticker' ? XHS_STICKER_THEMES
                        : cardSystem === 'minimal' ? XHS_MINIMAL_THEMES
                        : cardSystem === 'workbench' ? XHS_WORKBENCH_THEMES.map((t) => ({ id: t.id, name: t.name, bg: t.wood, fg: t.fg, accent: t.accent }))
                        : cardSystem === 'pulse' ? XHS_PULSE_THEMES
                        : cardSystem === 'poster' ? XHS_POSTER_THEMES
                        : XHS_THEME_PACKS;
                      const activeId =
                        cardSystem === 'sticker' ? stickerThemeId
                        : cardSystem === 'minimal' ? minimalThemeId
                        : cardSystem === 'workbench' ? workbenchThemeId
                        : cardSystem === 'pulse' ? pulseThemeId
                        : cardSystem === 'poster' ? posterThemeId
                        : xhsDeck.theme;
                      const select = (id: string) => {
                        if (cardSystem === 'sticker') setStickerThemeId(id);
                        else if (cardSystem === 'minimal') setMinimalThemeId(id);
                        else if (cardSystem === 'workbench') setWorkbenchThemeId(id);
                        else if (cardSystem === 'pulse') setPulseThemeId(id);
                        else if (cardSystem === 'poster') setPosterThemeId(id);
                        else setXhsDeck((d) => (d ? { ...d, theme: id } : d));
                      };
                      return (
                        <div className="grid grid-cols-3 gap-2">
                          {packs.map((pack) => (
                            <button
                              key={pack.id}
                              onClick={() => select(pack.id)}
                              title={pack.name}
                              className={`overflow-hidden rounded-[12px] border transition-all ${
                                activeId === pack.id
                                  ? 'border-emerald-300 ring-1 ring-emerald-300'
                                  : 'border-white/10 hover:border-white/30'
                              }`}
                              style={{ background: pack.bg }}
                            >
                              <div className="flex h-8 items-end justify-between p-1.5">
                                <span style={{ width: 12, height: 12, borderRadius: 4, background: pack.accent }} />
                                <span style={{ width: 18, height: 3, borderRadius: 2, background: pack.fg, opacity: 0.7 }} />
                              </div>
                              <div className="px-1.5 pb-1.5 text-left text-[10px] font-medium" style={{ color: pack.fg }}>
                                {pack.name}
                              </div>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {(() => {
                    const card = xhsDeck.cards[selectedCardIndex];
                    if (!card) return null;
                    const secondary = cardSecondaryText(card);
                    const lines = cardLines(card);
                    return (
                      <div className="space-y-3 rounded-[18px] border border-white/10 bg-white/5 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                          编辑第 {selectedCardIndex + 1} 张（{card.layout}）
                        </div>
                        <input
                          value={card.kicker}
                          onChange={(e) => updateCard(selectedCardIndex, { ...card, kicker: e.target.value })}
                          placeholder="分类标签 kicker"
                          className="w-full rounded-[12px] border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/50"
                        />
                        <textarea
                          value={cardMainText(card)}
                          onChange={(e) => updateCard(selectedCardIndex, withMainText(card, e.target.value))}
                          rows={2}
                          placeholder="主标题 / 主文案"
                          className="w-full resize-none rounded-[12px] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/50"
                        />
                        {secondary !== null && (
                          <input
                            value={secondary}
                            onChange={(e) => updateCard(selectedCardIndex, withSecondaryText(card, e.target.value))}
                            placeholder="副标题 / 来源 / 收尾语"
                            className="w-full rounded-[12px] border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/50"
                          />
                        )}
                        {lines !== null && (
                          <textarea
                            value={lines}
                            onChange={(e) => updateCard(selectedCardIndex, withLines(card, e.target.value))}
                            rows={Math.min(7, lines.split('\n').length + 1)}
                            placeholder="要点：每行一条，复合结构用 ｜ 分隔"
                            className="w-full resize-none rounded-[12px] border border-white/10 bg-white/5 px-3 py-2 text-xs leading-5 text-white outline-none placeholder:text-slate-500 focus:border-emerald-300/50"
                          />
                        )}
                        {overflowCards.has(selectedCardIndex) && (
                          <p className="text-xs leading-5 text-amber-300">
                            这张卡片内容超出画布，请删减文案，否则下载的图会被截断。
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  <button
                    onClick={handleDownloadCards}
                    disabled={isDownloadingCards}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDownloadingCards ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    下载全部 {xhsDeck.cards.length} 张 PNG
                  </button>
                  {overflowCards.size > 0 && (
                    <p className="text-xs leading-5 text-amber-300">
                      第 {Array.from(overflowCards).map((i) => i + 1).join('、')} 张内容溢出，建议先精简再下载。
                    </p>
                  )}
                </div>

                <div className="flex flex-1 items-start justify-center overflow-auto rounded-[26px] border border-white/10 bg-[rgba(15,23,42,0.46)] p-6">
                  <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
                    {xhsDeck.cards.map((card, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedCardIndex(i)}
                        className={`relative overflow-hidden rounded-[12px] transition-all ${
                          selectedCardIndex === i
                            ? 'ring-2 ring-emerald-300'
                            : 'opacity-85 hover:opacity-100 hover:ring-1 hover:ring-white/40'
                        }`}
                        style={{
                          width: XHS_CARD_WIDTH * XHS_CARD_THUMB_SCALE,
                          height: XHS_CARD_HEIGHT * XHS_CARD_THUMB_SCALE,
                        }}
                      >
                        <div
                          className="pointer-events-none"
                          style={{
                            transform: `scale(${XHS_CARD_THUMB_SCALE})`,
                            transformOrigin: 'top left',
                          }}
                        >
                          <div ref={(el) => { cardRefs.current[i] = el; }}>
                            {renderDeckCard(card, i)}
                          </div>
                        </div>
                        {overflowCards.has(i) && (
                          <span className="absolute right-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">
                            溢出
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 截图专用：屏幕外渲染的原始尺寸卡片（勿加 visibility/opacity，否则截出空白） */}
                <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }} aria-hidden>
                  {xhsDeck.cards.map((card, i) => (
                    <div key={i} ref={(el) => { cardCaptureRefs.current[i] = el; }}>
                      {renderDeckCard(card, i)}
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : activeMode === 'cover' ? (
            <div className="flex flex-1 flex-col gap-8 lg:flex-row">
              <div className="w-full shrink-0 space-y-6 lg:w-[300px]">
                <div>
                  <button
                    onClick={handleGenerateCopy}
                    disabled={isGeneratingCopy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-5 py-2.5 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGeneratingCopy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    {isGeneratingCopy ? 'AI 正在分析文章...' : 'AI 生成封面方案'}
                  </button>
                  {coverProposals.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {coverProposals.map((proposal, index) => (
                        <button
                          key={index}
                          onClick={() => applyProposal(proposal, index)}
                          title={`${proposal.title}\n点击应用此方案`}
                          className={`overflow-hidden rounded-[10px] transition-all ${
                            appliedProposalIndex === index
                              ? 'ring-2 ring-amber-300'
                              : 'opacity-80 hover:opacity-100 hover:ring-1 hover:ring-white/40'
                          }`}
                          style={{
                            width: COVER_WIDTH * COVER_THUMB_SCALE,
                            height: COVER_HEIGHT * COVER_THUMB_SCALE,
                          }}
                        >
                          <div
                            className="pointer-events-none"
                            style={{
                              transform: `scale(${COVER_THUMB_SCALE})`,
                              transformOrigin: 'top left',
                            }}
                          >
                            <CoverTemplate
                              title={proposal.title}
                              subtitle={proposal.subtitle}
                              template={proposal.template}
                              accentColor={proposal.color}
                            />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {coverProposals.length > 0 && (
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      点击缩略图应用方案，应用后仍可继续手动调整。
                    </p>
                  )}
                </div>
                <PictureGenerator initialPrompt={`公众号文章横版封面背景。主题：${coverTitle.slice(0,150)}。${markdown?.split(/\n+/).filter(line=>line.trim()&&!line.startsWith('#')).join(' ').slice(0,300)||''}。做出清楚的视觉主体，主体靠右，左侧留出干净暗色区域放标题。不要文字、数字、水印和标志。`}
                  label="生成一张封面底图" onPicture={picture=>setCoverArt(picture?.blob??null)} onSettings={onSettings}/>
                {coverArt&&<div className="flex flex-wrap items-center gap-3 text-sm">
                  <label>署名 <input className="rounded border border-white/20 bg-white/5 p-1" maxLength={24} value={coverAuthor} onChange={e=>setCoverAuthor(e.target.value)}/></label>
                  <label>标题位置 <select className="rounded border border-white/20 bg-slate-800 p-1" value={coverAlignment} onChange={e=>setCoverAlignment(e.target.value==='right'?'right':'left')}><option value="left">左侧</option><option value="right">右侧</option></select></label>
                  <label className="flex gap-2">底图上下裁切 <input type="range" min={0} max={100} value={coverCrop} onChange={e=>setCoverCrop(Number(e.target.value))}/></label>
                  <button type="button" className="underline" onClick={()=>setCoverArt(null)}>使用模板封面</button>
                </div>}
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                    主标题
                  </label>
                  <textarea
                    value={coverTitle}
                    onChange={(e) => setCoverTitle(e.target.value)}
                    rows={3}
                    placeholder="输入封面主标题"
                    className="w-full resize-none rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-amber-300/50"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                    副标题（可选）
                  </label>
                  <textarea
                    value={coverSubtitle}
                    onChange={(e) => setCoverSubtitle(e.target.value)}
                    rows={2}
                    placeholder="输入副标题或钩子文案"
                    className="w-full resize-none rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-500 focus:border-amber-300/50"
                  />
                </div>
                {!coverArt&&<><div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                    封面模板
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {COVER_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => setCoverTemplate(tpl.id)}
                        className={`rounded-[14px] px-3 py-2.5 text-sm font-medium transition-all ${
                          coverTemplate === tpl.id
                            ? 'bg-amber-300 text-slate-950 shadow-[0_8px_24px_rgba(252,211,77,0.3)]'
                            : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        {tpl.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                    主题色
                  </label>
                  <div className="flex flex-wrap gap-2.5">
                    {COVER_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setCoverColor(color)}
                        title={color}
                        className={`h-9 w-9 rounded-full transition-all ${
                          coverColor === color
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                </div></>}
                <button
                  onClick={handleDownloadCover}
                  disabled={isDownloadingCover || !coverTitle.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDownloadingCover ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {coverArt?'下载横版封面 PNG':'下载封面 PNG（3:4 高清）'}
                </button>
              </div>

              <div className="flex flex-1 items-start justify-center overflow-auto rounded-[26px] border border-white/10 bg-[rgba(15,23,42,0.46)] p-6">
                <div
                  style={{
                    width: (coverArt?AI_COVER_WIDTH:COVER_WIDTH) * COVER_PREVIEW_SCALE,
                    height: (coverArt?AI_COVER_HEIGHT:COVER_HEIGHT) * COVER_PREVIEW_SCALE,
                    overflow: 'hidden',
                    borderRadius: 12,
                    boxShadow: '0 20px 60px rgba(2,8,23,0.5)',
                  }}
                >
                  <div
                    style={{
                      transform: `scale(${COVER_PREVIEW_SCALE})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <div>
                      {coverPreview()}
                    </div>
                  </div>
                </div>
              </div>

              {/* 截图专用：屏幕外的原始尺寸封面节点（勿加 visibility/opacity，否则截出空白） */}
              <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }} aria-hidden>
                <div ref={coverCaptureRef} style={{width:coverArt?AI_COVER_WIDTH:COVER_WIDTH}}>
                  {coverPreview()}
                </div>
              </div>
            </div>
          ) : isGenerating ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-pink-400" />
                <span className="text-sm font-medium text-slate-300">正在生成图片，请稍候...</span>
              </div>
            </div>
          ) : (
            images.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between rounded-[26px] border border-pink-300/20 bg-pink-300/10 p-5">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-pink-200">
                      {activeMode === 'long' ? 'Long Image Ready' : 'Sliced Images Ready'}
                    </div>
                    <div className="mt-2 text-xl font-semibold">
                      已生成 {images.length} 张图片
                    </div>
                  </div>
                  <button
                    onClick={downloadAll}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100"
                  >
                    <Download className="h-4 w-4" />
                    {images.length > 1 ? '下载全部图片' : '下载图片'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {images.map((img, index) => (
                    <div key={index} className="group relative overflow-hidden rounded-[24px] border border-white/10 bg-white/5 shadow-lg">
                      <div className="flex h-[320px] items-center justify-center bg-[rgba(15,23,42,0.46)] p-2">
                        <img 
                          src={img} 
                          alt={`Generated export ${index + 1}`} 
                          className="max-h-full max-w-full object-contain drop-shadow-md"
                        />
                      </div>
                      <div className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-between bg-black/60 p-4 backdrop-blur-md transition-transform duration-300 group-hover:translate-y-0">
                        <span className="text-xs font-semibold text-white">图 {index + 1}</span>
                        <button
                          onClick={() => downloadImage(img, `export_${activeMode}_${Date.now()}_${index + 1}.png`)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/30"
                        >
                          <Download className="h-3.5 w-3.5" />
                          单张下载
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
