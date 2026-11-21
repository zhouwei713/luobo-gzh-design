import { getAuthToken } from './authService';
import { loadR2Config } from './imageUpload';
import { readPersonalAI } from './personalAISettings';
import { resolveChatEndpoint } from '../ai/chatCompletion';
import {
  createOssIllustrationTraceId,
  getOssIllustrationLogPreview,
  logOssIllustrationEvent,
} from './ossIllustrationDebugLogger';

export type IllustrationDensity = 'minimal' | 'balanced' | 'rich';
export type IllustrationType =
  | 'scene'
  | 'cover'
  | 'infographic'
  | 'flowchart'
  | 'comparison'
  | 'framework'
  | 'timeline';
export type IllustrationEngine = 'http_image' | 'html_infographic';

export interface IllustrationAnchor {
  kind: 'heading' | 'paragraph';
  heading?: string;
  index: number;
  excerpt?: string;
}

export interface IllustrationPlanItem {
  id: string;
  anchor: IllustrationAnchor;
  anchorLabel: string;
  reason: string;
  purpose: string;
  type: IllustrationType;
  engine: IllustrationEngine;
  style: string;
  alt: string;
  priority: number;
}

export interface IllustrationPlan {
  shouldIllustrate: boolean;
  summary: string;
  recommendedCount: number;
  density: IllustrationDensity;
  preferredStyle: string;
  existingImageCount: number;
  source: 'heuristic' | 'model' | 'model_fallback' | 'oss_heuristic';
  items: IllustrationPlanItem[];
}

export interface IllustrationPlanRequest {
  markdown: string;
  density?: IllustrationDensity;
  preferredStyle?: string;
  maxImages?: number;
  layoutStyleId?: string;
  themeId?: string;
}

export interface IllustrationJobRequest {
  markdown: string;
  plan: IllustrationPlan;
  selectedIds: string[];
}

export type IllustrationJobStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed';

export interface IllustrationJobItem extends IllustrationPlanItem {
  imageKey?: string;
  imageUrl: string;
  status: 'completed';
}

export interface IllustrationJob {
  id: string;
  status: IllustrationJobStatus;
  source: 'pending' | 'placeholder' | 'generated' | 'hybrid' | 'oss_placeholder';
  insertedCount: number;
  resultMarkdown: string;
  items: IllustrationJobItem[];
  createdAt: string;
  updatedAt?: string;
  error?: string | null;
  settings?: Record<string, unknown> | null;
  summary?: Record<string, unknown> | null;
}

interface IllustrationHighlight {
  label: string;
  detail: string;
}

type IllustrationLayout = 'overview' | 'linear-progression' | 'binary-comparison' | 'hub-spoke' | 'bridge';

interface IllustrationBridgeSpec {
  problem: string;
  tension: string;
  decision: string;
  outcome: string;
}

interface IllustrationStructuredSpec {
  layout: IllustrationLayout;
  title: string;
  subtitle: string;
  takeaway: string;
  highlights: IllustrationHighlight[];
  comparison: {
    left: { title: string; points: string[] };
    right: { title: string; points: string[] };
    conclusion: string;
  } | null;
  flow: { steps: string[] } | null;
  framework: { core: string; pillars: string[] } | null;
  timeline: Array<{ label: string; note: string }>;
  bridge: IllustrationBridgeSpec | null;
}

function getWorkerUrl(): string {
  const r2Config = loadR2Config();
  return (r2Config?.workerUrl || '').replace(/\/$/, '');
}

function getLocalAiConfig(): { apiKey: string; baseUrl: string; model: string } {
  const {apiKey,baseUrl,model} = readPersonalAI();
  return {
    apiKey: apiKey.trim(),
    baseUrl: baseUrl.trim() || 'https://api.openai.com/v1',
    model: model.trim() || 'gpt-4o',
  };
}

function extractJsonObject(value: string): string | null {
  const fencedMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : value.trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

function stripMarkdown(value: string): string {
  return value
    .replace(/[*_`>#-]/g, ' ')
    .replace(/\[[^\]]*]\(([^)]+)\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeadingLabel(raw: string): string {
  const normalized = raw.split('|').map((part) => stripMarkdown(part)).filter(Boolean);
  return normalized[1] || normalized[0] || '段落';
}

function countImages(markdown: string): number {
  const matches = markdown.match(/!\[[^\]]*]\([^)]+\)/g);
  return matches ? matches.length : 0;
}

function extractSections(markdown: string): Array<{ heading: string; index: number; content: string }> {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<{ heading: string; index: number; content: string }> = [];
  let current: { heading: string; index: number; content: string[] } | null = null;
  let fence='';

  for (const [index, line] of lines.entries()) {
    const marker=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    const match = !fence&&!marker?line.match(/^(#{1,3})\s+(.*)$/):null;
    if(marker){
      if(!fence)fence=marker[1];
      else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length&&!marker[2].trim())fence='';
    }
    if (match) {
      if (current) {
        sections.push({
          heading: current.heading,
          index: current.index,
          content: current.content.join('\n').trim(),
        });
      }

      current = {
        heading: match[2].trim(),
        index,
        content: [],
      };
      continue;
    }

    if (!current) {
      current = {
        heading: '正文概览',
        index: 0,
        content: [],
      };
    }

    current.content.push(line);
  }

  if (current) {
    sections.push({
      heading: current.heading,
      index: current.index,
      content: current.content.join('\n').trim(),
    });
  }

  return sections.filter((section) => section.heading || section.content);
}

function detectType(sectionText: string): IllustrationType {
  if (/(timeline|时间|历程|演变|发展|阶段)/i.test(sectionText)) return 'timeline';
  if (/(对比|区别|优缺点|比较|vs|versus)/i.test(sectionText)) return 'comparison';
  if (/(流程|步骤|step|操作|教程|指南|sop|checklist)/i.test(sectionText)) return 'flowchart';
  if (/(框架|模型|体系|原则|方法论|策略|结构)/i.test(sectionText)) return 'framework';
  if (/(数据|指标|结论|摘要|重点|概览|overview|summary)/i.test(sectionText)) return 'infographic';
  if (/(封面|导语|开场|主题|opening|hero)/i.test(sectionText)) return 'cover';
  return 'scene';
}

function engineForType(type: IllustrationType): IllustrationEngine {
  return type === 'scene' || type === 'cover' ? 'http_image' : 'html_infographic';
}

function defaultStyle(type: IllustrationType, preferredStyle: string): string {
  if (preferredStyle && preferredStyle !== 'auto') return preferredStyle;

  switch (type) {
    case 'flowchart':
    case 'framework':
    case 'comparison':
      return 'blueprint';
    case 'timeline':
      return 'editorial';
    case 'cover':
      return 'warm';
    case 'scene':
      return 'editorial';
    case 'infographic':
    default:
      return 'minimal';
  }
}

function purposeForType(type: IllustrationType): string {
  switch (type) {
    case 'flowchart':
      return '把步骤和流程改成更直观的图示。';
    case 'comparison':
      return '把差异点并列展示，帮助读者快速理解。';
    case 'framework':
      return '把抽象方法论收束成结构化框架。';
    case 'timeline':
      return '把时间顺序压缩成一张时间线图。';
    case 'cover':
      return '提供一张概括主题的主图，增强停留意愿。';
    case 'scene':
      return '补充场景感，减轻纯文字阅读疲劳。';
    case 'infographic':
    default:
      return '把重点整理成一张更适合扫读的信息图。';
  }
}

function altForType(label: string, type: IllustrationType): string {
  switch (type) {
    case 'flowchart':
      return `${label}流程示意图`;
    case 'comparison':
      return `${label}对比图`;
    case 'framework':
      return `${label}框架图`;
    case 'timeline':
      return `${label}时间线图`;
    case 'cover':
      return `${label}主题配图`;
    case 'scene':
      return `${label}场景插图`;
    case 'infographic':
    default:
      return `${label}信息图`;
  }
}

function buildLocalIllustrationPlan(request: IllustrationPlanRequest): IllustrationPlan {
  const density = request.density || 'balanced';
  const preferredStyle = request.preferredStyle || 'auto';
  const maxImages = Math.min(Math.max(request.maxImages || 3, 1), 6);
  const existingImageCount = countImages(request.markdown);
  const sections = extractSections(request.markdown).filter((section) => !/!\[[^\]]*]\([^)]+\)/.test(section.content));
  const textLength = stripMarkdown(request.markdown).length;

  let recommendedCount = 0;
  if (textLength > 400) recommendedCount += 1;
  if (textLength > 900) recommendedCount += 1;
  if (textLength > 1600) recommendedCount += 1;
  if (sections.length >= 6) recommendedCount += 1;
  if (density === 'minimal') recommendedCount -= 1;
  if (density === 'rich') recommendedCount += 1;
  recommendedCount -= existingImageCount;
  recommendedCount = Math.min(Math.max(recommendedCount, 0), maxImages);

  const items = sections.slice(0, recommendedCount).map((section, index): IllustrationPlanItem => {
    const type = detectType(`${section.heading}\n${section.content}`);
    const anchorLabel = normalizeHeadingLabel(section.heading);

    return {
      id: `oss-plan-${section.index}-${index + 1}`,
      anchor: {
        kind: 'heading',
        heading: section.heading,
        index: section.index,
        excerpt: stripMarkdown(section.content).slice(0, 120),
      },
      anchorLabel,
      reason: existingImageCount === 0
        ? '当前文章几乎没有插图，这一段适合补一张说明型配图。'
        : '这一段的信息密度较高，插图能提升读者理解效率。',
      purpose: purposeForType(type),
      type,
      engine: engineForType(type),
      style: defaultStyle(type, preferredStyle),
      alt: altForType(anchorLabel, type),
      priority: index + 1,
    };
  });

  return {
    shouldIllustrate: items.length > 0,
    summary: items.length > 0
      ? `建议补充 ${items.length} 张配图，优先覆盖当前缺图且信息密度较高的段落。`
      : '当前文章已有足够图片，或篇幅较短，暂不建议自动补图。',
    recommendedCount: items.length,
    density,
    preferredStyle,
    existingImageCount,
    source: 'oss_heuristic',
    items,
  };
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function typeBadge(type: IllustrationType): string {
  switch (type) {
    case 'flowchart':
      return 'FLOWCHART';
    case 'comparison':
      return 'COMPARISON';
    case 'framework':
      return 'FRAMEWORK';
    case 'timeline':
      return 'TIMELINE';
    case 'cover':
      return 'COVER';
    case 'scene':
      return 'SCENE';
    case 'infographic':
    default:
      return 'INFOGRAPHIC';
  }
}

function paletteForType(type: IllustrationType): { start: string; end: string; accent: string } {
  switch (type) {
    case 'flowchart':
      return { start: '#0f766e', end: '#115e59', accent: '#99f6e4' };
    case 'comparison':
      return { start: '#7c3aed', end: '#4c1d95', accent: '#ddd6fe' };
    case 'framework':
      return { start: '#1d4ed8', end: '#1e3a8a', accent: '#bfdbfe' };
    case 'timeline':
      return { start: '#be185d', end: '#831843', accent: '#fbcfe8' };
    case 'cover':
      return { start: '#ea580c', end: '#9a3412', accent: '#fdba74' };
    case 'scene':
      return { start: '#2563eb', end: '#1d4ed8', accent: '#bfdbfe' };
    case 'infographic':
    default:
      return { start: '#111827', end: '#334155', accent: '#cbd5e1' };
  }
}

function shortenText(value: string, limit: number): string {
  const normalized = stripMarkdown(value).replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}...`;
}

function cleanPointText(value: string): string {
  return stripMarkdown(value)
    .replace(/\s+/g, ' ')
    .replace(/^[,.;:!?，。；：！？、\-\s]+/, '')
    .replace(/^(好|好的|其实|比如|例如|另外|然后|所以|但是|而且|那么|这里|这个|这一点|这段|你可以直接用)\s*[,.;:!?，。；：！？、-]?\s*/i, '')
    .trim();
}

function isWeakPoint(value: string): boolean {
  if (!value) return true;
  if (value.length < 4) return true;
  return /^(好|好的|这个|这里|这一点|这段|那种|然后|所以|但是|其实|例如|比如)$/i.test(value);
}

export function splitPointLabelAndDetail(point: string): IllustrationHighlight {
  const normalized = stripMarkdown(point).replace(/\s+/g, ' ').trim();
  const segments = normalized.split(/[：:，,、]/).map((part) => part.trim()).filter(Boolean);

  if (segments.length >= 2) {
    return {
      label: shortenText(segments[0], 12),
      detail: shortenText(segments.slice(1).join('，'), 30),
    };
  }

  const label = shortenText(normalized, normalized.length <= 14 ? normalized.length : 12);
  const detail = normalized.length > label.length
    ? shortenText(normalized.slice(label.length).trim(), 30)
    : shortenText(normalized, 30);

  return { label, detail };
}

export function normalizeIllustrationTitle(value: string, fallback: string): string {
  const normalized = stripMarkdown(value).replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;

  if (/^(正文概览|正文概述|概览|摘要|overview|summary)$/i.test(normalized)) {
    return fallback;
  }

  return shortenText(normalized, 18);
}

function extractSectionContext(
  markdown: string,
  item: IllustrationPlanItem,
): { heading: string; content: string; points: string[]; bulletPoints: string[]; sentencePoints: string[] } {
  const sections = extractSections(markdown);
  const matched = sections.find((section) => (
    section.index === item.anchor.index
    || (item.anchor.heading && section.heading === item.anchor.heading)
  ));

  const content = matched?.content || item.anchor.excerpt || item.purpose || item.reason;
  const heading = matched?.heading || item.anchor.heading || item.anchorLabel;
  const bulletPoints = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^([-*+]|\d+\.)\s+/.test(line))
    .map((line) => stripMarkdown(line.replace(/^([-*+]|\d+\.)\s+/, '')))
    .filter(Boolean);
  const sentencePoints = stripMarkdown(content)
    .split(/[。！？!?；;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const points = (bulletPoints.length > 0 ? bulletPoints : sentencePoints)
    .slice(0, 4)
    .map((point) => shortenText(point, 24));

  if (points.length === 0) {
    points.push(shortenText(item.purpose, 24));
  }

  return { heading, content, points, bulletPoints, sentencePoints };
}

function splitStructuredPointLabelAndDetail(point: string): IllustrationHighlight {
  const normalized = cleanPointText(point).replace(/\s+/g, ' ').trim();
  const segments = normalized
    .split(/\s*[：:;；|]\s*|\s*[，,]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length >= 2) {
    return {
      label: shortenText(segments[0], 12),
      detail: shortenText(segments.slice(1).join(' '), 30),
    };
  }

  const label = shortenText(normalized, normalized.length <= 14 ? normalized.length : 12);
  const detail = normalized.length > label.length
    ? shortenText(normalized.slice(label.length).trim(), 30)
    : shortenText(normalized, 30);

  return { label, detail };
}

function normalizeStructuredIllustrationTitle(value: string, fallback: string): string {
  const normalized = cleanPointText(value).replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;

  if (/^(正文概览|正文概述|概览|摘要|overview|summary)$/i.test(normalized)) {
    return fallback;
  }

  return shortenText(normalized, 18);
}

function extractStructuredSectionContext(
  markdown: string,
  item: IllustrationPlanItem,
): { heading: string; content: string; points: string[]; bulletPoints: string[]; sentencePoints: string[] } {
  const raw = extractSectionContext(markdown, item);
  const bulletPoints = raw.bulletPoints
    .map((point) => cleanPointText(point))
    .filter((point) => !isWeakPoint(point));
  const sentencePoints = stripMarkdown(raw.content)
    .split(/[。！？!?；;]+/)
    .map((part) => cleanPointText(part))
    .filter((point) => !isWeakPoint(point));
  const points = (bulletPoints.length > 0 ? bulletPoints : sentencePoints)
    .slice(0, 4)
    .map((point) => shortenText(point, 24));

  return {
    ...raw,
    points: points.length > 0 ? points : [shortenText(item.purpose, 24)],
    bulletPoints,
    sentencePoints,
  };
}

function buildStructuredSpec(item: IllustrationPlanItem, markdown: string): IllustrationStructuredSpec {
  const context = extractStructuredSectionContext(markdown, item) as ReturnType<typeof extractSectionContext> & {
    bulletPoints: string[];
    sentencePoints: string[];
  };
  const sourcePoints = (context.bulletPoints.length > 0 ? context.bulletPoints : context.sentencePoints)
    .filter(Boolean)
    .slice(0, 6);
  const layout = inferStructuredLayout(item, context, sourcePoints);
  const bridge = layout === 'bridge' ? buildBridgeSpec(item, context, sourcePoints) : null;
  const highlights = (sourcePoints.length > 0 ? sourcePoints : [item.purpose, item.reason])
    .map(splitStructuredPointLabelAndDetail)
    .filter((entry) => entry.label && entry.detail)
    .slice(0, 4);
  const title = deriveStructuredTitle(item, context, sourcePoints);
  const subtitle = shortenText(highlights[0]?.detail || context.sentencePoints[0] || item.purpose, 34);
  const takeaway = shortenText(context.sentencePoints[context.sentencePoints.length - 1] || item.reason || item.purpose, 40);

  if (item.type === 'comparison') {
    const leftSeed = sourcePoints.slice(0, 2);
    const rightSeed = sourcePoints.slice(2, 4);
    return {
      layout,
      title,
      subtitle,
      takeaway,
      highlights: highlights.slice(0, 3),
      comparison: {
        left: {
          title: splitStructuredPointLabelAndDetail(leftSeed[0] || item.anchorLabel).label || 'Point A',
          points: leftSeed.length > 0 ? leftSeed.map((point) => shortenText(point, 26)) : [shortenText(item.reason, 26)],
        },
        right: {
          title: splitStructuredPointLabelAndDetail(rightSeed[0] || item.purpose).label || 'Point B',
          points: rightSeed.length > 0 ? rightSeed.map((point) => shortenText(point, 26)) : [shortenText(item.purpose, 26)],
        },
        conclusion: takeaway,
      },
      flow: null,
      framework: null,
      timeline: [],
      bridge: null,
    };
  }

  if (item.type === 'flowchart') {
    return {
      layout,
      title,
      subtitle,
      takeaway,
      highlights,
      comparison: null,
      flow: {
        steps: sourcePoints.slice(0, 4).map((point) => shortenText(point, 20)),
      },
      framework: null,
      timeline: [],
      bridge: null,
    };
  }

  if (item.type === 'framework') {
    const core = splitStructuredPointLabelAndDetail(sourcePoints[0] || item.anchorLabel).label || shortenText(item.anchorLabel, 14);
    return {
      layout,
      title,
      subtitle,
      takeaway,
      highlights,
      comparison: null,
      flow: null,
      framework: {
        core,
        pillars: sourcePoints.slice(1, 5).map((point) => shortenText(point, 18)),
      },
      timeline: [],
      bridge: null,
    };
  }

  if (item.type === 'timeline') {
    return {
      layout,
      title,
      subtitle,
      takeaway,
      highlights,
      comparison: null,
      flow: null,
      framework: null,
      timeline: sourcePoints.slice(0, 4).map((point, index) => {
        const split = splitStructuredPointLabelAndDetail(point);
        return {
          label: split.label || `Stage ${index + 1}`,
          note: split.detail || shortenText(point, 18),
        };
      }),
      bridge: null,
    };
  }

  return {
    layout,
    title,
    subtitle,
    takeaway,
    highlights: highlights.length > 0
      ? highlights
      : [{ label: shortenText(item.anchorLabel, 14), detail: shortenText(item.purpose, 30) }],
    comparison: null,
    flow: null,
    framework: null,
    timeline: [],
    bridge,
  };
}

function sanitizeStructuredSpecCandidate(
  candidate: Partial<IllustrationStructuredSpec> | null | undefined,
  fallback: IllustrationStructuredSpec,
  item: IllustrationPlanItem,
): IllustrationStructuredSpec {
  if (!candidate) return fallback;

  const layout = candidate.layout === 'overview'
    || candidate.layout === 'linear-progression'
    || candidate.layout === 'binary-comparison'
    || candidate.layout === 'hub-spoke'
    || candidate.layout === 'bridge'
    ? candidate.layout
    : fallback.layout;

  const highlights = Array.isArray(candidate.highlights)
    ? candidate.highlights
        .map((entry) => ({
          label: shortenText(String(entry?.label || '').trim(), 16),
          detail: shortenText(String(entry?.detail || '').trim(), 34),
        }))
        .filter((entry) => entry.label && entry.detail)
        .slice(0, 4)
    : fallback.highlights;

  const comparison = candidate.comparison
    ? {
        left: {
          title: shortenText(String(candidate.comparison.left?.title || fallback.comparison?.left.title || 'Point A').trim(), 16),
          points: Array.isArray(candidate.comparison.left?.points)
            ? candidate.comparison.left.points.map((point) => shortenText(String(point).trim(), 28)).filter(Boolean).slice(0, 3)
            : (fallback.comparison?.left.points || []).slice(0, 3),
        },
        right: {
          title: shortenText(String(candidate.comparison.right?.title || fallback.comparison?.right.title || 'Point B').trim(), 16),
          points: Array.isArray(candidate.comparison.right?.points)
            ? candidate.comparison.right.points.map((point) => shortenText(String(point).trim(), 28)).filter(Boolean).slice(0, 3)
            : (fallback.comparison?.right.points || []).slice(0, 3),
        },
        conclusion: shortenText(String(candidate.comparison.conclusion || fallback.comparison?.conclusion || item.purpose).trim(), 40),
      }
    : fallback.comparison;

  const flow = candidate.flow
    ? {
        steps: Array.isArray(candidate.flow.steps)
          ? candidate.flow.steps.map((step) => shortenText(String(step).trim(), 22)).filter(Boolean).slice(0, 4)
          : (fallback.flow?.steps || []).slice(0, 4),
      }
    : fallback.flow;

  const framework = candidate.framework
    ? {
        core: shortenText(String(candidate.framework.core || fallback.framework?.core || item.anchorLabel).trim(), 16),
        pillars: Array.isArray(candidate.framework.pillars)
          ? candidate.framework.pillars.map((pillar) => shortenText(String(pillar).trim(), 20)).filter(Boolean).slice(0, 4)
          : (fallback.framework?.pillars || []).slice(0, 4),
      }
    : fallback.framework;

  const timeline = Array.isArray(candidate.timeline)
    ? candidate.timeline
        .map((stage) => ({
          label: shortenText(String(stage?.label || '').trim(), 12),
          note: shortenText(String(stage?.note || '').trim(), 18),
        }))
        .filter((stage) => stage.label && stage.note)
        .slice(0, 4)
    : fallback.timeline;

  const bridge = candidate.bridge
    ? {
        problem: shortenText(String(candidate.bridge.problem || fallback.bridge?.problem || item.anchorLabel).trim(), 22),
        tension: shortenText(String(candidate.bridge.tension || fallback.bridge?.tension || item.purpose).trim(), 22),
        decision: shortenText(String(candidate.bridge.decision || fallback.bridge?.decision || item.reason).trim(), 22),
        outcome: shortenText(String(candidate.bridge.outcome || fallback.bridge?.outcome || item.reason).trim(), 24),
      }
    : fallback.bridge;

  return {
    layout,
    title: normalizeStructuredIllustrationTitle(String(candidate.title || fallback.title || item.anchorLabel), fallback.title),
    subtitle: shortenText(String(candidate.subtitle || fallback.subtitle || item.purpose).trim(), 34),
    takeaway: shortenText(String(candidate.takeaway || fallback.takeaway || item.reason || item.purpose).trim(), 42),
    highlights: highlights.length > 0 ? highlights : fallback.highlights,
    comparison,
    flow: flow && flow.steps.length > 0 ? flow : fallback.flow,
    framework: framework && framework.pillars.length > 0 ? framework : fallback.framework,
    timeline: timeline.length > 0 ? timeline : fallback.timeline,
    bridge,
  };
}

const STRUCTURED_META_PATTERNS = [
  /infographic/i,
  /visual/i,
  /readability/i,
  /scan/i,
  /summary/i,
  /overview/i,
  /\u4fe1\u606f\u56fe/,
  /\u53ef\u89c6\u5316/,
  /\u626b\u8bfb/,
  /\u9605\u8bfb\u6548\u7387/,
  /\u56fe\u8868\u5316/,
  /\u63d0\u70bc/,
  /\u7ed3\u6784\u5316/,
  /\u5448\u73b0\u65b9\u5f0f/,
  /\u6982\u89c8/,
  /\u6458\u8981/,
];

const STRUCTURED_GENERIC_PATTERNS = [
  /^overview$/i,
  /^summary$/i,
  /^highlight/i,
  /^key point/i,
  /^\u6b63\u6587$/,
  /^\u6b63\u6587\u6982\u89c8$/,
  /^\u6982\u89c8$/,
  /^\u6458\u8981$/,
  /^\u91cd\u70b9$/,
];

const STRUCTURED_KEYWORD_STOPWORDS = new Set([
  'article',
  'section',
  'content',
  'method',
  'thing',
  '方式',
  '内容',
  '部分',
  '问题',
  '重点',
  '概览',
  '摘要',
  '信息图',
]);

function containsStructuredMetaLanguage(value: string): boolean {
  const normalized = stripMarkdown(value).toLowerCase();
  return STRUCTURED_META_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isGenericStructuredTitle(value: string): boolean {
  const normalized = stripMarkdown(value).trim();
  return STRUCTURED_GENERIC_PATTERNS.some((pattern) => pattern.test(normalized));
}

function extractStructuredContentKeywords(context: {
  content: string;
  bulletPoints: string[];
  sentencePoints: string[];
}): string[] {
  const source = [context.content, ...context.bulletPoints, ...context.sentencePoints].join(' ');
  const matches = source.match(/[A-Za-z][A-Za-z0-9.+-]{2,}|[\u4e00-\u9fff]{2,8}/g) || [];
  const counts = new Map<string, number>();

  matches.forEach((raw) => {
    const token = cleanPointText(raw);
    if (!token || token.length < 2) return;
    if (STRUCTURED_KEYWORD_STOPWORDS.has(token.toLowerCase()) || STRUCTURED_KEYWORD_STOPWORDS.has(token)) return;
    if (containsStructuredMetaLanguage(token)) return;
    counts.set(token, (counts.get(token) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((left, right) => (right[1] - left[1]) || (right[0].length - left[0].length))
    .map(([token]) => token)
    .slice(0, 10);
}

function collectStructuredSpecText(spec: IllustrationStructuredSpec): string {
  const fragments = [
    spec.layout,
    spec.title,
    spec.subtitle,
    spec.takeaway,
    ...spec.highlights.flatMap((entry) => [entry.label, entry.detail]),
    ...(spec.comparison ? [
      spec.comparison.left.title,
      ...spec.comparison.left.points,
      spec.comparison.right.title,
      ...spec.comparison.right.points,
      spec.comparison.conclusion,
    ] : []),
    ...(spec.flow?.steps || []),
    ...(spec.framework ? [spec.framework.core, ...spec.framework.pillars] : []),
    ...spec.timeline.flatMap((stage) => [stage.label, stage.note]),
    ...(spec.bridge ? [spec.bridge.problem, spec.bridge.tension, spec.bridge.decision, spec.bridge.outcome] : []),
  ];

  return fragments.filter(Boolean).join(' ');
}

function assessStructuredSpecQuality(
  item: IllustrationPlanItem,
  context: {
    content: string;
    bulletPoints: string[];
    sentencePoints: string[];
  },
  spec: IllustrationStructuredSpec,
): { accepted: boolean; score: number; reasons: string[]; keywords: string[]; matchedKeywords: string[] } {
  const keywords = extractStructuredContentKeywords(context);
  const combinedText = collectStructuredSpecText(spec);
  const matchedKeywords = keywords.filter((keyword) => combinedText.includes(keyword)).slice(0, 6);
  const reasons: string[] = [];
  let score = 0;

  if (matchedKeywords.length >= 2) {
    score += 3;
  } else if (matchedKeywords.length === 1) {
    score += 1;
  } else {
    reasons.push('no_content_keywords');
    score -= 2;
  }

  if (containsStructuredMetaLanguage(spec.title)) {
    reasons.push('meta_title');
    score -= 3;
  }

  if (isGenericStructuredTitle(spec.title)) {
    reasons.push('generic_title');
    score -= 2;
  }

  const metaHighlightCount = spec.highlights
    .filter((entry) => containsStructuredMetaLanguage(entry.label) || containsStructuredMetaLanguage(entry.detail))
    .length;
  if (metaHighlightCount > 0) {
    reasons.push('meta_highlights');
    score -= Math.min(metaHighlightCount, 2);
  }

  if (item.type === 'infographic' && spec.highlights.length < 3) {
    reasons.push('too_few_highlights');
    score -= 1;
  }

  if (item.type === 'timeline' && spec.timeline.length < 3) {
    reasons.push('too_few_timeline_stages');
    score -= 1;
  }

  if (item.type === 'infographic' && spec.layout === 'overview' && matchedKeywords.length < 2) {
    reasons.push('weak_overview_grounding');
    score -= 2;
  }

  if (spec.layout === 'bridge' && !spec.bridge) {
    reasons.push('missing_bridge_spec');
    score -= 2;
  }

  return {
    accepted: score >= 1 && !(containsStructuredMetaLanguage(spec.title) && matchedKeywords.length === 0),
    score,
    reasons,
    keywords,
    matchedKeywords,
  };
}

function deriveStructuredTitle(
  item: IllustrationPlanItem,
  context: {
    heading: string;
    sentencePoints: string[];
  },
  sourcePoints: string[],
): string {
  const headingTitle = normalizeStructuredIllustrationTitle(
    context.heading || item.anchorLabel,
    shortenText(item.anchorLabel, 18),
  );
  if (!isGenericStructuredTitle(headingTitle) && !containsStructuredMetaLanguage(headingTitle)) {
    return headingTitle;
  }

  const primary = splitStructuredPointLabelAndDetail(sourcePoints[0] || context.sentencePoints[0] || item.anchorLabel);
  const candidate = primary.label || context.sentencePoints[0] || item.anchorLabel;
  return normalizeStructuredIllustrationTitle(candidate, shortenText(item.anchorLabel, 18));
}

function inferStructuredLayout(
  item: IllustrationPlanItem,
  context: ReturnType<typeof extractStructuredSectionContext>,
  sourcePoints: string[],
): IllustrationLayout {
  if (item.type === 'comparison') return 'binary-comparison';
  if (item.type === 'flowchart') return 'linear-progression';
  if (item.type === 'framework') return 'hub-spoke';
  if (item.type === 'timeline') return 'linear-progression';

  const content = [context.heading, context.content, ...sourcePoints].join(' ');
  if (/(?:避免|不要|不是|而是|风险|成本|方案|策略|选择|建议|渠道|代理|订阅|稳定|低价|替代|过渡|because|instead|avoid|risk|cost|strategy|choose|solution|stable|proxy|channel)/i.test(content)) {
    return 'bridge';
  }

  if (/(?:第[一二三四0-9]+|步骤|路径|流程|阶段|先|再|然后|最后|first|then|next|finally|step|path|process|sequence)/i.test(content)) {
    return 'linear-progression';
  }

  return 'overview';
}

function buildBridgeSpec(
  item: IllustrationPlanItem,
  context: ReturnType<typeof extractStructuredSectionContext>,
  sourcePoints: string[],
): IllustrationBridgeSpec {
  const points = sourcePoints.length > 0 ? sourcePoints : context.sentencePoints;
  return {
    problem: shortenText(points[0] || context.heading || item.anchorLabel, 20),
    tension: shortenText(points[1] || points[0] || item.purpose, 22),
    decision: shortenText(points[2] || points[1] || item.reason, 22),
    outcome: shortenText(points[3] || context.sentencePoints[context.sentencePoints.length - 1] || item.reason, 24),
  };
}

async function requestStructuredSpecFromLocalModel(
  item: IllustrationPlanItem,
  markdown: string,
  fallback: IllustrationStructuredSpec,
): Promise<IllustrationStructuredSpec | null> {
  const { apiKey, baseUrl, model } = getLocalAiConfig();
  const traceId = createOssIllustrationTraceId();
  if (!apiKey) return null;
  if (item.engine !== 'html_infographic') return null;

  const endpoint = resolveChatEndpoint(baseUrl);

  const context = extractStructuredSectionContext(markdown, item);
  await logOssIllustrationEvent(traceId, 'structured_spec.request.started', {
    type: item.type,
    engine: item.engine,
    model,
    heading: context.heading,
    contentPreview: getOssIllustrationLogPreview(context.content),
    bulletPoints: context.bulletPoints.slice(0, 4),
    sentencePoints: context.sentencePoints.slice(0, 4),
  }, 'verbose');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      messages: [
        {
          role: 'system',
          content: `You design concise structured infographic content for a WeChat article section.
Return one JSON object only.

Schema:
{
  "layout": "overview" | "linear-progression" | "binary-comparison" | "hub-spoke" | "bridge",
  "title": string,
  "subtitle": string,
  "takeaway": string,
  "highlights": [{ "label": string, "detail": string }],
  "comparison": null | {
    "left": { "title": string, "points": string[] },
    "right": { "title": string, "points": string[] },
    "conclusion": string
  },
  "flow": null | { "steps": string[] },
  "framework": null | { "core": string, "pillars": string[] },
  "timeline": [{ "label": string, "note": string }],
  "bridge": null | {
    "problem": string,
    "tension": string,
    "decision": string,
    "outcome": string
  }
}

Rules:
- Preserve concrete entities, claims, risks, tradeoffs, and recommendations from the section. Do not talk about visuals, readability, scanning, or infographic design itself.
- Rewrite and compress. Do not copy long raw sentences.
- Never use generic titles like "正文概览", "概览", "重点", "摘要".
- title must express the section's real takeaway.
- subtitle should explain why this section matters.
- Choose layout:
  - "bridge" for problem -> tension/risk -> decision -> outcome sections.
  - "linear-progression" for stepwise, staged, or evolving logic.
  - "overview" only when the section truly has several parallel key points.
- infographic: produce 3-4 punchy highlights.
- comparison: produce two balanced columns and one conclusion.
- flowchart: produce 3-4 short steps.
- framework: produce one core concept and 2-4 pillars.
- timeline: produce 3-4 chronological stages.
- For bridge, fill all four bridge fields with short concrete phrases.
- Keep unused schema fields null or [].
- Ground everything in the provided content only.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            type: item.type,
            anchorLabel: item.anchorLabel,
            heading: context.heading,
            content: context.content,
            bulletPoints: context.bulletPoints,
            sentencePoints: context.sentencePoints,
            fallback,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`local_illustration_spec_${response.status}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || '';
  const jsonText = extractJsonObject(text);
  if (!jsonText) {
    await logOssIllustrationEvent(traceId, 'structured_spec.request.empty', {
      type: item.type,
      outputPreview: getOssIllustrationLogPreview(text),
    }, 'verbose');
    return null;
  }

  try {
    const result = sanitizeStructuredSpecCandidate(JSON.parse(jsonText), fallback, item);
    const quality = assessStructuredSpecQuality(item, context, result);
    if (!quality.accepted) {
      await logOssIllustrationEvent(traceId, 'structured_spec.request.rejected', {
        type: item.type,
        score: quality.score,
        reasons: quality.reasons,
        keywords: quality.keywords,
        matchedKeywords: quality.matchedKeywords,
        title: result.title,
      }, 'verbose');
      return null;
    }
    await logOssIllustrationEvent(traceId, 'structured_spec.request.succeeded', {
      type: item.type,
      score: quality.score,
      matchedKeywords: quality.matchedKeywords,
      title: result.title,
      subtitle: result.subtitle,
      takeaway: result.takeaway,
      layout: result.layout,
      specPreview: getOssIllustrationLogPreview(JSON.stringify({
        highlights: result.highlights.slice(0, 3),
        comparison: result.comparison ? {
          left: result.comparison.left.title,
          right: result.comparison.right.title,
        } : null,
        bridge: result.bridge,
        flowSteps: result.flow?.steps?.slice(0, 4) || [],
        framework: result.framework ? {
          core: result.framework.core,
          pillars: result.framework.pillars.slice(0, 4),
        } : null,
        timeline: result.timeline.slice(0, 4),
      })),
    }, 'verbose');
    return result;
  } catch {
    await logOssIllustrationEvent(traceId, 'structured_spec.request.invalid_json', {
      type: item.type,
      outputPreview: getOssIllustrationLogPreview(jsonText),
    }, 'verbose');
    return null;
  }
}

async function buildStructuredSpecWithLocalModel(
  item: IllustrationPlanItem,
  markdown: string,
): Promise<IllustrationStructuredSpec> {
  const fallback = buildStructuredSpec(item, markdown);
  const traceId = createOssIllustrationTraceId();

  try {
    const fromModel = await requestStructuredSpecFromLocalModel(item, markdown, fallback);
    if (!fromModel) {
      await logOssIllustrationEvent(traceId, 'structured_spec.fallback.heuristic', {
        type: item.type,
        layout: fallback.layout,
        title: fallback.title,
        subtitle: fallback.subtitle,
        takeaway: fallback.takeaway,
      }, 'verbose');
      return fallback;
    }
    return sanitizeStructuredSpecCandidate(fromModel, fallback, item);
  } catch {
    await logOssIllustrationEvent(traceId, 'structured_spec.fallback.error', {
      type: item.type,
    }, 'verbose');
    return fallback;
  }
}

function buildSvgListCards(points: string[], palette: { accent: string }): string {
  return points
    .slice(0, 3)
    .map((point, index) => {
      const y = 404 + index * 54;
      return [
        `  <rect x="782" y="${y}" width="320" height="38" rx="16" fill="rgba(255,255,255,0.12)" stroke="${palette.accent}" stroke-opacity="0.25"/>`,
        `  <text x="806" y="${y + 25}" fill="#ffffff" font-size="18" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(point, 22))}</text>`,
      ].join('\n');
    })
    .join('\n');
}

function buildStructuredInfographicSvg(
  item: IllustrationPlanItem,
  spec: IllustrationStructuredSpec,
  palette: { start: string; end: string; accent: string },
): string {
  const badge = escapeSvgText(`${typeBadge(item.type)} / ${item.style.toUpperCase()}`);
  const cards = spec.highlights.slice(0, 3);

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">',
    '<defs>',
    '  <linearGradient id="bg-rich" x1="0" y1="0" x2="1200" y2="675" gradientUnits="userSpaceOnUse">',
    `    <stop stop-color="${palette.start}"/>`,
    `    <stop offset="1" stop-color="${palette.end}"/>`,
    '  </linearGradient>',
    '</defs>',
    '  <rect width="1200" height="675" rx="40" fill="url(#bg-rich)"/>',
    '  <rect x="56" y="56" width="1088" height="563" rx="32" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.18)"/>',
    `  <rect x="88" y="88" width="340" height="44" rx="22" fill="${palette.accent}" fill-opacity="0.16" stroke="${palette.accent}" stroke-opacity="0.48"/>`,
    `  <text x="112" y="117" fill="#ffffff" font-size="20" font-family="Arial, Helvetica, sans-serif" font-weight="700">${badge}</text>`,
    `  <text x="88" y="196" fill="#ffffff" font-size="58" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(spec.title, 18))}</text>`,
    `  <text x="88" y="238" fill="rgba(255,255,255,0.82)" font-size="24" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(spec.subtitle, 34))}</text>`,
    '  <line x1="88" y1="270" x2="332" y2="270" stroke="rgba(255,255,255,0.26)" stroke-width="4"/>',
    ...cards.flatMap((card, index) => {
      const x = 88 + index * 336;
      return [
        `  <rect x="${x}" y="322" width="296" height="178" rx="28" fill="rgba(10,14,28,0.18)" stroke="rgba(255,255,255,0.16)"/>`,
        `  <circle cx="${x + 38}" cy="362" r="16" fill="${palette.accent}" fill-opacity="0.22" stroke="${palette.accent}" stroke-width="1.5"/>`,
        `  <text x="${x + 32}" y="368" fill="#ffffff" font-size="14" font-family="Arial, Helvetica, sans-serif" font-weight="700">${index + 1}</text>`,
        `  <text x="${x + 64}" y="370" fill="${palette.accent}" font-size="16" font-family="Arial, Helvetica, sans-serif" font-weight="700">关键点</text>`,
        `  <text x="${x + 28}" y="420" fill="#ffffff" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(card.label, 14))}</text>`,
        `  <text x="${x + 28}" y="464" fill="rgba(255,255,255,0.88)" font-size="20" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(card.detail, 28))}</text>`,
      ];
    }),
    '  <rect x="88" y="534" width="1024" height="70" rx="24" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.18)"/>',
    '  <text x="120" y="577" fill="#cbd5e1" font-size="18" font-family="Arial, Helvetica, sans-serif" font-weight="700">TAKEAWAY</text>',
    `  <text x="258" y="577" fill="#ffffff" font-size="22" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(spec.takeaway, 44))}</text>`,
    '</svg>',
  ].join('\n');
}

function buildStructuredProgressionSvg(
  item: IllustrationPlanItem,
  spec: IllustrationStructuredSpec,
  palette: { start: string; end: string; accent: string },
): string {
  const badge = escapeSvgText(`${typeBadge(item.type)} / ${item.style.toUpperCase()}`);
  const steps = spec.highlights.slice(0, 4);

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">',
    '<defs>',
    '  <linearGradient id="bg-progression-rich" x1="0" y1="0" x2="1200" y2="675" gradientUnits="userSpaceOnUse">',
    `    <stop stop-color="${palette.start}"/>`,
    `    <stop offset="1" stop-color="${palette.end}"/>`,
    '  </linearGradient>',
    '</defs>',
    '  <rect width="1200" height="675" rx="40" fill="url(#bg-progression-rich)"/>',
    '  <rect x="56" y="56" width="1088" height="563" rx="32" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.18)"/>',
    `  <rect x="88" y="88" width="360" height="44" rx="22" fill="${palette.accent}" fill-opacity="0.16" stroke="${palette.accent}" stroke-opacity="0.48"/>`,
    `  <text x="112" y="117" fill="#ffffff" font-size="20" font-family="Arial, Helvetica, sans-serif" font-weight="700">${badge}</text>`,
    `  <text x="88" y="188" fill="#ffffff" font-size="56" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(spec.title, 18))}</text>`,
    `  <text x="88" y="232" fill="rgba(255,255,255,0.82)" font-size="24" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(spec.subtitle, 34))}</text>`,
    '  <line x1="116" y1="430" x2="1084" y2="430" stroke="rgba(255,255,255,0.22)" stroke-width="6" stroke-linecap="round"/>',
    ...steps.flatMap((step, index) => {
      const x = 88 + index * 252;
      return [
        `  <rect x="${x}" y="322" width="216" height="176" rx="28" fill="rgba(10,14,28,0.18)" stroke="rgba(255,255,255,0.16)"/>`,
        `  <circle cx="${x + 34}" cy="354" r="16" fill="${palette.accent}" fill-opacity="0.22" stroke="${palette.accent}" stroke-width="1.5"/>`,
        `  <text x="${x + 28}" y="360" fill="#ffffff" font-size="14" font-family="Arial, Helvetica, sans-serif" font-weight="700">${index + 1}</text>`,
        `  <text x="${x + 62}" y="360" fill="${palette.accent}" font-size="16" font-family="Arial, Helvetica, sans-serif" font-weight="700">STEP</text>`,
        `  <text x="${x + 24}" y="410" fill="#ffffff" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(step.label, 14))}</text>`,
        `  <text x="${x + 24}" y="454" fill="rgba(255,255,255,0.88)" font-size="19" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(step.detail, 24))}</text>`,
      ];
    }),
    '  <rect x="88" y="534" width="1024" height="70" rx="24" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.18)"/>',
    '  <text x="120" y="577" fill="#cbd5e1" font-size="18" font-family="Arial, Helvetica, sans-serif" font-weight="700">TAKEAWAY</text>',
    `  <text x="258" y="577" fill="#ffffff" font-size="22" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(spec.takeaway, 44))}</text>`,
    '</svg>',
  ].join('\n');
}

function buildStructuredBridgeSvg(
  item: IllustrationPlanItem,
  spec: IllustrationStructuredSpec,
  palette: { start: string; end: string; accent: string },
): string {
  const badge = escapeSvgText(`${typeBadge(item.type)} / ${item.style.toUpperCase()}`);
  const bridge = spec.bridge || {
    problem: spec.highlights[0]?.label || spec.title,
    tension: spec.highlights[1]?.label || spec.subtitle,
    decision: spec.highlights[2]?.label || spec.takeaway,
    outcome: spec.takeaway,
  };
  const stages = [
    { label: 'PROBLEM', value: bridge.problem },
    { label: 'TENSION', value: bridge.tension },
    { label: 'DECISION', value: bridge.decision },
    { label: 'OUTCOME', value: bridge.outcome },
  ];

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">',
    '<defs>',
    '  <linearGradient id="bg-bridge-rich" x1="0" y1="0" x2="1200" y2="675" gradientUnits="userSpaceOnUse">',
    `    <stop stop-color="${palette.start}"/>`,
    `    <stop offset="1" stop-color="${palette.end}"/>`,
    '  </linearGradient>',
    '</defs>',
    '  <rect width="1200" height="675" rx="40" fill="url(#bg-bridge-rich)"/>',
    '  <rect x="56" y="56" width="1088" height="563" rx="32" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.18)"/>',
    `  <rect x="88" y="88" width="360" height="44" rx="22" fill="${palette.accent}" fill-opacity="0.16" stroke="${palette.accent}" stroke-opacity="0.48"/>`,
    `  <text x="112" y="117" fill="#ffffff" font-size="20" font-family="Arial, Helvetica, sans-serif" font-weight="700">${badge}</text>`,
    `  <text x="88" y="188" fill="#ffffff" font-size="56" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(spec.title, 18))}</text>`,
    `  <text x="88" y="232" fill="rgba(255,255,255,0.82)" font-size="24" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(spec.subtitle, 34))}</text>`,
    '  <line x1="116" y1="430" x2="1084" y2="430" stroke="rgba(255,255,255,0.22)" stroke-width="6" stroke-linecap="round"/>',
    ...stages.flatMap((stage, index) => {
      const x = 88 + index * 252;
      const centerX = x + 108;
      return [
        `  <rect x="${x}" y="312" width="216" height="190" rx="28" fill="rgba(10,14,28,0.18)" stroke="rgba(255,255,255,0.16)"/>`,
        `  <circle cx="${centerX}" cy="430" r="18" fill="rgba(255,255,255,0.16)" stroke="${palette.accent}" stroke-width="2"/>`,
        `  <text x="${centerX - 5}" y="436" fill="#ffffff" font-size="14" font-family="Arial, Helvetica, sans-serif" font-weight="700">${index + 1}</text>`,
        `  <text x="${x + 24}" y="350" fill="${palette.accent}" font-size="16" font-family="Arial, Helvetica, sans-serif" font-weight="700">${stage.label}</text>`,
        `  <text x="${x + 24}" y="402" fill="#ffffff" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(stage.value, 18))}</text>`,
      ];
    }),
    '  <rect x="88" y="534" width="1024" height="70" rx="24" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.18)"/>',
    '  <text x="120" y="577" fill="#cbd5e1" font-size="18" font-family="Arial, Helvetica, sans-serif" font-weight="700">TAKEAWAY</text>',
    `  <text x="258" y="577" fill="#ffffff" font-size="22" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(spec.takeaway, 44))}</text>`,
    '</svg>',
  ].join('\n');
}

function buildStructuredComparisonSvg(
  item: IllustrationPlanItem,
  spec: IllustrationStructuredSpec,
  palette: { start: string; end: string; accent: string },
): string {
  const badge = escapeSvgText(`${typeBadge(item.type)} / ${item.style.toUpperCase()}`);
  const comparison = spec.comparison || {
    left: { title: '重点 A', points: [] },
    right: { title: '重点 B', points: [] },
    conclusion: spec.takeaway,
  };

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">',
    '<defs>',
    '  <linearGradient id="bg-compare" x1="0" y1="0" x2="1200" y2="675" gradientUnits="userSpaceOnUse">',
    `    <stop stop-color="${palette.start}"/>`,
    `    <stop offset="1" stop-color="${palette.end}"/>`,
    '  </linearGradient>',
    '</defs>',
    '  <rect width="1200" height="675" rx="40" fill="url(#bg-compare)"/>',
    '  <rect x="56" y="56" width="1088" height="563" rx="32" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.18)"/>',
    `  <rect x="88" y="88" width="340" height="44" rx="22" fill="${palette.accent}" fill-opacity="0.16" stroke="${palette.accent}" stroke-opacity="0.48"/>`,
    `  <text x="112" y="117" fill="#ffffff" font-size="20" font-family="Arial, Helvetica, sans-serif" font-weight="700">${badge}</text>`,
    `  <text x="88" y="188" fill="#ffffff" font-size="56" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(spec.title, 18))}</text>`,
    `  <text x="88" y="232" fill="rgba(255,255,255,0.82)" font-size="24" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(spec.subtitle, 34))}</text>`,
    '  <rect x="88" y="286" width="472" height="248" rx="30" fill="rgba(10,14,28,0.18)" stroke="rgba(255,255,255,0.16)"/>',
    '  <rect x="640" y="286" width="472" height="248" rx="30" fill="rgba(10,14,28,0.18)" stroke="rgba(255,255,255,0.16)"/>',
    `  <text x="120" y="338" fill="${palette.accent}" font-size="18" font-family="Arial, Helvetica, sans-serif" font-weight="700">LEFT</text>`,
    `  <text x="120" y="382" fill="#ffffff" font-size="32" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(comparison.left.title, 14))}</text>`,
    ...comparison.left.points.slice(0, 3).map((point, index) => [
      `  <circle cx="126" cy="${426 + index * 46}" r="6" fill="${palette.accent}"/>`,
      `  <text x="146" y="${433 + index * 46}" fill="rgba(255,255,255,0.9)" font-size="20" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(point, 28))}</text>`,
    ].join('\n')),
    `  <text x="672" y="338" fill="${palette.accent}" font-size="18" font-family="Arial, Helvetica, sans-serif" font-weight="700">RIGHT</text>`,
    `  <text x="672" y="382" fill="#ffffff" font-size="32" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(comparison.right.title, 14))}</text>`,
    ...comparison.right.points.slice(0, 3).map((point, index) => [
      `  <circle cx="678" cy="${426 + index * 46}" r="6" fill="${palette.accent}"/>`,
      `  <text x="698" y="${433 + index * 46}" fill="rgba(255,255,255,0.9)" font-size="20" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(point, 28))}</text>`,
    ].join('\n')),
    '  <rect x="88" y="560" width="1024" height="44" rx="22" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.18)"/>',
    `  <text x="120" y="589" fill="#ffffff" font-size="20" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(comparison.conclusion, 52))}</text>`,
    '</svg>',
  ].join('\n');
}

function buildStructuredFlowSvg(
  item: IllustrationPlanItem,
  spec: IllustrationStructuredSpec,
  palette: { start: string; end: string; accent: string },
): string {
  const badge = escapeSvgText(`${typeBadge(item.type)} / ${item.style.toUpperCase()}`);
  const steps = (spec.flow?.steps || []).slice(0, 4);

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">',
    '<defs>',
    '  <linearGradient id="bg-flow-rich" x1="0" y1="0" x2="1200" y2="675" gradientUnits="userSpaceOnUse">',
    `    <stop stop-color="${palette.start}"/>`,
    `    <stop offset="1" stop-color="${palette.end}"/>`,
    '  </linearGradient>',
    '</defs>',
    '  <rect width="1200" height="675" rx="40" fill="url(#bg-flow-rich)"/>',
    '  <rect x="56" y="56" width="1088" height="563" rx="32" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.18)"/>',
    `  <rect x="88" y="88" width="340" height="44" rx="22" fill="${palette.accent}" fill-opacity="0.16" stroke="${palette.accent}" stroke-opacity="0.48"/>`,
    `  <text x="112" y="117" fill="#ffffff" font-size="20" font-family="Arial, Helvetica, sans-serif" font-weight="700">${badge}</text>`,
    `  <text x="88" y="188" fill="#ffffff" font-size="56" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(spec.title, 18))}</text>`,
    `  <text x="88" y="232" fill="rgba(255,255,255,0.82)" font-size="24" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(spec.subtitle, 34))}</text>`,
    ...steps.flatMap((step, index) => {
      const x = 96 + index * 254;
      const connector = index < steps.length - 1
        ? [
            `  <line x1="${x + 198}" y1="410" x2="${x + 238}" y2="410" stroke="rgba(255,255,255,0.32)" stroke-width="6" stroke-linecap="round"/>`,
            `  <polygon points="${x + 238},410 ${x + 222},398 ${x + 222},422" fill="${palette.accent}" fill-opacity="0.9"/>`,
          ]
        : [];

      return [
        `  <rect x="${x}" y="332" width="206" height="160" rx="28" fill="rgba(10,14,28,0.18)" stroke="rgba(255,255,255,0.16)"/>`,
        `  <circle cx="${x + 34}" cy="368" r="16" fill="${palette.accent}" fill-opacity="0.22" stroke="${palette.accent}" stroke-width="1.5"/>`,
        `  <text x="${x + 28}" y="374" fill="#ffffff" font-size="14" font-family="Arial, Helvetica, sans-serif" font-weight="700">${index + 1}</text>`,
        `  <text x="${x + 60}" y="374" fill="${palette.accent}" font-size="16" font-family="Arial, Helvetica, sans-serif" font-weight="700">STEP</text>`,
        `  <text x="${x + 24}" y="430" fill="#ffffff" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(step, 16))}</text>`,
        ...connector,
      ];
    }),
    '  <rect x="88" y="534" width="1024" height="70" rx="24" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.18)"/>',
    '  <text x="120" y="577" fill="#cbd5e1" font-size="18" font-family="Arial, Helvetica, sans-serif" font-weight="700">TAKEAWAY</text>',
    `  <text x="258" y="577" fill="#ffffff" font-size="22" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(spec.takeaway, 46))}</text>`,
    '</svg>',
  ].join('\n');
}

function buildStructuredFrameworkSvg(
  item: IllustrationPlanItem,
  spec: IllustrationStructuredSpec,
  palette: { start: string; end: string; accent: string },
): string {
  const badge = escapeSvgText(`${typeBadge(item.type)} / ${item.style.toUpperCase()}`);
  const framework = spec.framework || { core: spec.title, pillars: [] };

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">',
    '<defs>',
    '  <linearGradient id="bg-framework-rich" x1="0" y1="0" x2="1200" y2="675" gradientUnits="userSpaceOnUse">',
    `    <stop stop-color="${palette.start}"/>`,
    `    <stop offset="1" stop-color="${palette.end}"/>`,
    '  </linearGradient>',
    '</defs>',
    '  <rect width="1200" height="675" rx="40" fill="url(#bg-framework-rich)"/>',
    '  <rect x="56" y="56" width="1088" height="563" rx="32" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.18)"/>',
    `  <rect x="88" y="88" width="340" height="44" rx="22" fill="${palette.accent}" fill-opacity="0.16" stroke="${palette.accent}" stroke-opacity="0.48"/>`,
    `  <text x="112" y="117" fill="#ffffff" font-size="20" font-family="Arial, Helvetica, sans-serif" font-weight="700">${badge}</text>`,
    `  <text x="88" y="188" fill="#ffffff" font-size="56" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(spec.title, 18))}</text>`,
    `  <text x="88" y="232" fill="rgba(255,255,255,0.82)" font-size="24" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(spec.subtitle, 34))}</text>`,
    '  <circle cx="600" cy="414" r="108" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.18)"/>',
    `  <text x="556" y="396" fill="${palette.accent}" font-size="18" font-family="Arial, Helvetica, sans-serif" font-weight="700">CORE</text>`,
    `  <text x="520" y="438" fill="#ffffff" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(framework.core, 14))}</text>`,
    ...framework.pillars.slice(0, 4).flatMap((pillar, index) => {
      const positions = [
        { x: 178, y: 314 },
        { x: 816, y: 314 },
        { x: 178, y: 460 },
        { x: 816, y: 460 },
      ];
      const pos = positions[index];
      const lineStartX = pos.x < 600 ? pos.x + 220 : pos.x;
      const lineEndX = pos.x < 600 ? 492 : 708;
      const lineY = pos.y + 42;
      return [
        `  <rect x="${pos.x}" y="${pos.y}" width="220" height="84" rx="24" fill="rgba(10,14,28,0.18)" stroke="rgba(255,255,255,0.16)"/>`,
        `  <text x="${pos.x + 24}" y="${pos.y + 50}" fill="#ffffff" font-size="24" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(pillar, 16))}</text>`,
        `  <line x1="${lineStartX}" y1="${lineY}" x2="${lineEndX}" y2="${lineY}" stroke="rgba(255,255,255,0.28)" stroke-width="4" stroke-linecap="round"/>`,
      ];
    }),
    '  <rect x="88" y="560" width="1024" height="44" rx="22" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.18)"/>',
    `  <text x="120" y="589" fill="#ffffff" font-size="20" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(spec.takeaway, 52))}</text>`,
    '</svg>',
  ].join('\n');
}

function buildStructuredTimelineSvg(
  item: IllustrationPlanItem,
  spec: IllustrationStructuredSpec,
  palette: { start: string; end: string; accent: string },
): string {
  const badge = escapeSvgText(`${typeBadge(item.type)} / ${item.style.toUpperCase()}`);
  const stages = spec.timeline.slice(0, 4);

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">',
    '<defs>',
    '  <linearGradient id="bg-timeline-rich" x1="0" y1="0" x2="1200" y2="675" gradientUnits="userSpaceOnUse">',
    `    <stop stop-color="${palette.start}"/>`,
    `    <stop offset="1" stop-color="${palette.end}"/>`,
    '  </linearGradient>',
    '</defs>',
    '  <rect width="1200" height="675" rx="40" fill="url(#bg-timeline-rich)"/>',
    '  <rect x="56" y="56" width="1088" height="563" rx="32" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.18)"/>',
    `  <rect x="88" y="88" width="340" height="44" rx="22" fill="${palette.accent}" fill-opacity="0.16" stroke="${palette.accent}" stroke-opacity="0.48"/>`,
    `  <text x="112" y="117" fill="#ffffff" font-size="20" font-family="Arial, Helvetica, sans-serif" font-weight="700">${badge}</text>`,
    `  <text x="88" y="188" fill="#ffffff" font-size="56" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(spec.title, 18))}</text>`,
    `  <text x="88" y="232" fill="rgba(255,255,255,0.82)" font-size="24" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(spec.subtitle, 34))}</text>`,
    '  <line x1="116" y1="426" x2="1084" y2="426" stroke="rgba(255,255,255,0.26)" stroke-width="6" stroke-linecap="round"/>',
    ...stages.flatMap((stage, index) => {
      const x = 154 + index * 256;
      return [
        `  <circle cx="${x}" cy="426" r="28" fill="rgba(255,255,255,0.16)" stroke="${palette.accent}" stroke-width="2"/>`,
        `  <text x="${x - 8}" y="434" fill="#ffffff" font-size="18" font-family="Arial, Helvetica, sans-serif" font-weight="700">${index + 1}</text>`,
        `  <rect x="${x - 84}" y="328" width="168" height="58" rx="20" fill="rgba(10,14,28,0.18)" stroke="rgba(255,255,255,0.16)"/>`,
        `  <text x="${x - 60}" y="365" fill="#ffffff" font-size="22" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(shortenText(stage.label, 12))}</text>`,
        `  <rect x="${x - 112}" y="466" width="224" height="92" rx="24" fill="rgba(10,14,28,0.18)" stroke="rgba(255,255,255,0.16)"/>`,
        `  <text x="${x - 84}" y="520" fill="rgba(255,255,255,0.9)" font-size="20" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(stage.note, 18))}</text>`,
      ];
    }),
    '  <rect x="88" y="584" width="1024" height="26" rx="13" fill="rgba(255,255,255,0.08)"/>',
    '  <text x="104" y="603" fill="#cbd5e1" font-size="16" font-family="Arial, Helvetica, sans-serif" font-weight="700">TAKEAWAY</text>',
    `  <text x="216" y="603" fill="#ffffff" font-size="18" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(spec.takeaway, 58))}</text>`,
    '</svg>',
  ].join('\n');
}

function buildInfographicSvg(
  item: IllustrationPlanItem,
  markdown: string,
  structuredSpecOverride?: IllustrationStructuredSpec,
): string {
  const palette = paletteForType(item.type);
  const context = extractSectionContext(markdown, item);
  const structuredSpec = structuredSpecOverride || buildStructuredSpec(item, markdown);

  if (item.type === 'infographic') {
    if (structuredSpec.layout === 'bridge') {
      return buildStructuredBridgeSvg(item, structuredSpec, palette);
    }

    if (structuredSpec.layout === 'linear-progression') {
      return buildStructuredProgressionSvg(item, structuredSpec, palette);
    }

    return buildStructuredInfographicSvg(item, structuredSpec, palette);
  }

  if (item.type === 'comparison') {
    return buildStructuredComparisonSvg(item, structuredSpec, palette);
  }

  if (item.type === 'flowchart') {
    return buildStructuredFlowSvg(item, structuredSpec, palette);
  }

  if (item.type === 'framework') {
    return buildStructuredFrameworkSvg(item, structuredSpec, palette);
  }

  if (item.type === 'timeline') {
    return buildStructuredTimelineSvg(item, structuredSpec, palette);
  }

  const points = context.points.length > 0 ? context.points : [item.purpose];
  const title = escapeSvgText(shortenText(item.alt, 22));
  const subtitle = escapeSvgText(shortenText(context.heading || item.anchorLabel, 28));
  const badge = escapeSvgText(`${typeBadge(item.type)} / ${item.style.toUpperCase()}`);
  const rightPanel = buildSvgListCards(points, palette);

  const centerMarkup = [
    '  <rect x="124" y="392" width="596" height="144" rx="26" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.18)"/>',
    ...points.slice(0, 3).map((point, index) => (
      [
        `  <circle cx="162" cy="${430 + index * 34}" r="7" fill="${palette.accent}"/>`,
        `  <text x="184" y="${437 + index * 34}" fill="#ffffff" font-size="20" font-family="Arial, Helvetica, sans-serif">${escapeSvgText(shortenText(point, 34))}</text>`,
      ].join('\n')
    )),
  ].join('\n');

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">',
    '<defs>',
    '  <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="675" gradientUnits="userSpaceOnUse">',
    `    <stop stop-color="${palette.start}"/>`,
    `    <stop offset="1" stop-color="${palette.end}"/>`,
    '  </linearGradient>',
    '</defs>',
    '  <rect width="1200" height="675" rx="40" fill="url(#bg)"/>',
    '  <rect x="64" y="64" width="1072" height="547" rx="30" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)"/>',
    `  <rect x="92" y="92" width="360" height="44" rx="22" fill="${palette.accent}" fill-opacity="0.18" stroke="${palette.accent}" stroke-opacity="0.55"/>`,
    `  <text x="116" y="121" fill="#ffffff" font-size="20" font-family="Arial, Helvetica, sans-serif" font-weight="700">${badge}</text>`,
    `  <text x="92" y="232" fill="#ffffff" font-size="56" font-family="Arial, Helvetica, sans-serif" font-weight="700">${title}</text>`,
    `  <text x="92" y="292" fill="rgba(255,255,255,0.80)" font-size="28" font-family="Arial, Helvetica, sans-serif">${subtitle}</text>`,
    '  <line x1="92" y1="332" x2="360" y2="332" stroke="rgba(255,255,255,0.32)" stroke-width="4"/>',
    centerMarkup,
    rightPanel,
    '</svg>',
  ].join('\n');
}

async function rasterizeSvgToPngDataUrl(svg: string): Promise<string> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('本地 SVG 栅格化失败'));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 675;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('浏览器无法创建 Canvas 上下文');
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function insertIllustrationsIntoMarkdown(markdown: string, items: IllustrationJobItem[]): string {
  const lines = markdown.split(/\r?\n/);
  const groups = new Map<number, IllustrationJobItem[]>();

  items
    .slice()
    .sort((left, right) => left.priority - right.priority)
    .forEach((item) => {
      const targetIndex = Math.min(Math.max(item.anchor.index + 1, 0), lines.length);
      const group = groups.get(targetIndex) || [];
      group.push(item);
      groups.set(targetIndex, group);
    });

  Array.from(groups.keys())
    .sort((left, right) => right - left)
    .forEach((targetIndex) => {
      const block: string[] = [];
      const group = groups.get(targetIndex) || [];

      group.forEach((item) => {
        if (block.length === 0 || block[block.length - 1] !== '') {
          block.push('');
        }
        block.push(`![${item.alt}](${item.imageUrl})`);
        block.push('');
      });

      lines.splice(targetIndex, 0, ...block);
    });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function createLocalIllustrationJob(request: IllustrationJobRequest): Promise<IllustrationJob> {
  const traceId = createOssIllustrationTraceId();
  const selectedItems = request.plan.items
    .filter((item) => request.selectedIds.includes(item.id))
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 6);

  if (selectedItems.length === 0) {
    throw new Error('请至少选择一条配图建议。');
  }

  await logOssIllustrationEvent(traceId, 'job.request.received', {
    selectedCount: selectedItems.length,
    markdownPreview: getOssIllustrationLogPreview(request.markdown),
    items: selectedItems.map((item) => ({
      anchorLabel: item.anchorLabel,
      type: item.type,
      engine: item.engine,
      style: item.style,
    })),
  });

  const items: IllustrationJobItem[] = await Promise.all(selectedItems.map(async (item) => {
    const structuredSpec = item.engine === 'html_infographic'
      ? await buildStructuredSpecWithLocalModel(item, request.markdown)
      : undefined;
    const svg = buildInfographicSvg(item, request.markdown, structuredSpec);

    return {
      ...item,
      imageUrl: await rasterizeSvgToPngDataUrl(svg),
      status: 'completed' as const,
    };
  }));

  await logOssIllustrationEvent(traceId, 'job.request.completed', {
    insertedCount: items.length,
    items: items.map((item) => ({
      anchorLabel: item.anchorLabel,
      type: item.type,
      engine: item.engine,
    })),
  }, 'verbose');

  return {
    id: `oss-job-${Date.now()}`,
    status: 'completed',
    source: 'generated',
    insertedCount: items.length,
    resultMarkdown: insertIllustrationsIntoMarkdown(request.markdown, items),
    items,
    createdAt: new Date().toISOString(),
  };
}

// 个人API模式不调用平台配图接口；规划与渲染复用浏览器实现。
export async function getIllustrationPlan(request: IllustrationPlanRequest): Promise<IllustrationPlan> {
  return buildLocalIllustrationPlan(request);
}

export async function createIllustrationJob(request: IllustrationJobRequest): Promise<IllustrationJob> {
  return await createLocalIllustrationJob(request);
}

export async function getIllustrationJob(jobId: string): Promise<IllustrationJob> {
  const isOnlineMode = import.meta.env.VITE_APP_MODE === 'online';
  if (!isOnlineMode) {
    throw new Error('OSS 模式下没有远程配图任务查询。');
  }

  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    throw new Error('未配置 后端地址，无法查询在线配图任务。');
  }

  const token = getAuthToken();
  const response = await fetch(`${workerUrl}/api/illustration/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || `智能配图任务查询失败 (${response.status})`);
  }

  return data.job as IllustrationJob;
}
