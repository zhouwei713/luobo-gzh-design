import { ossChatCompletion, resolveChatEndpoint } from './chatCompletion';
import { readPersonalAI } from '../services/personalAISettings';
import { XHS_THEME_PACKS } from '../components/ui/XhsCard';
import { XHS_STICKER_THEMES } from '../components/ui/XhsStickerCard';
import { XHS_MINIMAL_THEMES } from '../components/ui/XhsMinimalCard';
import { XHS_WORKBENCH_THEMES } from '../components/ui/XhsWorkbenchCard';
import { XHS_PULSE_THEMES } from '../components/ui/XhsPulseCard';
import { XHS_POSTER_THEMES } from '../components/ui/XhsPosterCard';
import type { XhsCardSpec } from '../components/ui/XhsCard';

export type XhsSystem = 'editorial' | 'sticker' | 'minimal' | 'workbench' | 'pulse' | 'poster';

export interface XhsDeck {
  system: XhsSystem;
  theme: string;
  cards: XhsCardSpec[];
}

const THEME_IDS = XHS_THEME_PACKS.map((t) => t.id);
const STICKER_IDS = XHS_STICKER_THEMES.map((t) => t.id);
const MINIMAL_IDS = XHS_MINIMAL_THEMES.map((t) => t.id);
const WORKBENCH_IDS = XHS_WORKBENCH_THEMES.map((t) => t.id);
const PULSE_IDS = XHS_PULSE_THEMES.map((t) => t.id);
const POSTER_IDS = XHS_POSTER_THEMES.map((t) => t.id);

const VALID_SYSTEMS: XhsSystem[] = ['editorial', 'sticker', 'minimal', 'workbench', 'pulse', 'poster'];

const themesForSystem = (system: XhsSystem): string[] => {
  switch (system) {
    case 'sticker': return STICKER_IDS;
    case 'minimal': return MINIMAL_IDS;
    case 'workbench': return WORKBENCH_IDS;
    case 'pulse': return PULSE_IDS;
    case 'poster': return POSTER_IDS;
    default: return THEME_IDS;
  }
};

// 内容规划方法论参考 zhouwei713/article-visual-director 的公开策略文档
// (references/xiaohongshu-carousel-structures.md 与 xiaohongshu-strategies.md)：
// 每页只承担一个阅读任务、按内容类型走模板结构、四至八字视觉短标题、
// 动作优先、拒绝空泛承诺。此处为重新表述，未复制其原文。
const XHS_CARDS_PROMPT = `
你是一位资深的小红书图文策划。请通读用户的 Markdown 文章，把它改写成一套小红书轮播图文卡片。

【每页契约】
- 每张卡片只承担一个主阅读任务：一个论点、一段流程、一份清单，或一次对比。
- 先用一句话锁定文章的核心动作："谁、对什么、做什么、交付什么"，再围绕这条主线选卡片。
- 图集是视觉大纲，不是全文誊写；一页塞不下就拆成两页，不要压缩字号。

【结构模板（先判断文章类型，选一个作为骨架，可 ±1 页）】
- 教程类（tutorial，约 8 页）：钩子封面 → 常见误区 → 核心原理 → 关键步骤 A → 关键步骤 B → 结果验证 → 适用边界 → 行动清单
- 观点类（opinion，约 7 页）：观点冲突封面 → 常见现象 → 反直觉判断 → 支撑论据 → 具体案例 → 反例边界 → 行动建议
- 工具/评测类（review，约 8 页）：结论封面 → 适用场景 → 输入/操作 → 输出效果 → 优点 → 局限与成本 → 目标读者 → 收尾判断
- 复盘类（story，约 8 页）：转折点封面 → 起点 → 失败尝试 → 关键发现 → 采取行动 → 结果变化 → 保留边界 → 给读者的建议

【页面角色映射到 layout】
- 钩子/冲突/结论封面 → cover
- 现象/清单/边界/行动清单 → checklist
- 步骤/流程/操作 → steps
- 误区 vs 正解、前 vs 后、优点 vs 限制 → compare
- 反直觉金句、关键判断 → quote（整套图最多 1 张）
- 真实存在的数据、比例、指标 → data（禁止编造数据）
- 收尾/带走清单 → summary（末页）

【硬约束】
- 第一张必须是 cover，最后一张必须是 summary。
- 至少覆盖 3 种不同的 layout，不要 5 张都是 checklist。
- kicker：每页一个分类小标签，如 "教程 · 新手向"、"AI TOOL · 2026"，≤16 字。
- 文案：口语、动词、结果；禁止 "必看" "震撼" "干货满满" 这类空泛承诺；封面用 "我替你踩过 3 个坑" "先看这 5 步" 这种具体承诺。
- 视角：作者第一人称（我做了什么、我看到什么），第三方素材保留归因。

【版式与字数硬上限（中文以汉字计；1080×1440 画布能塞下的实测容量，超限必须砍文案不允许堆砌）】
- cover: {"layout":"cover","kicker","title","subtitle","points":[]}
  - title：**必须 4-8 个汉字**的视觉短标题（缩略图能一眼读到），最多 10 字
  - subtitle：一句具体承诺，≤18 字
  - points：**0-3 条**钩子小标签，每条 ≤8 字
- checklist: {"layout":"checklist","kicker","heading","items":[{"label","detail"}]}
  - heading ≤14 字，**3-4 条**，label ≤8 字，detail ≤16 字（label 用短语、detail 用一句解释）
- steps: {"layout":"steps","kicker","heading","steps":[{"title","desc"}]}
  - heading ≤14 字，**3 步为佳，最多 3 步**（超过请拆两页），title ≤8 字，desc ≤16 字
- compare: {"layout":"compare","kicker","heading","before":{"label","points":[]},"after":{"label","points":[]}}
  - heading ≤14 字，每侧 label ≤5 字，每侧 **2 条**，每条 ≤12 字
- quote: {"layout":"quote","kicker","quote","source"}
  - quote ≤30 字（短更有力），source ≤12 字
- data: {"layout":"data","kicker","heading","rows":[{"label","value","pct"}]}
  - 仅当文中有真实数字时使用；**3-4 行**，label ≤5 字，value ≤6 字
  - pct 是 0-100 的**相对比例**：同组数据里最大值对应 100，其他按比例缩放；不是原始百分号数字
- summary: {"layout":"summary","kicker","heading","items":[{"label","detail"}],"closing"}
  - heading ≤14 字，**3 条**，label ≤8 字，detail ≤16 字，closing 一句 ≤18 字的收尾判断

【文字规则再强调】
- label / heading / title 都是"短语级"：3-8 个汉字，动词开头，禁止"的"字连词、禁止解释性描述。
- detail / desc 是一句话补充，不是段落，禁止逗号连接多个短句。
- 无法压缩就删条不删字数：宁可 3 条 checklist，也不要 5 条被截断成"…"。

【视觉系统 system（六选一。先按文章调性挑一套，再从这套里挑 theme）】
- "editorial"（杂志风：衬线大标 + mono 小标签 + 发丝分栏）
  → 深度观点 / 评测 / 长文导读 / AI 方法论等"偏读"的内容
- "sticker"（手账笔记风：纸纹 + 淡网格 + 和纸胶带 + 荧光笔）
  → 心得 / 清单 / 生活攻略 / 学习记录等"偏记"的内容
- "minimal"（简约风：大量留白 + 极细字重 + 单点强调色）
  → 复盘 / 极简理念 / 高端产品 / 年终总结等"偏净"的内容
- "workbench"（工作台风：木桌面 + 便签卡 + 荧光笔 + 手绘箭头）  ★ 教程首选
  → 手把手教程 / 工作流拆解 / 工具使用手册 / 项目搭建等"偏做"的内容
- "pulse"（深色系统风：近黑底 + 扫描线 + 铜色 LED + mono 数字）  ★ 技术首选
  → 基础设施 / 后端架构 / 监控与性能 / 工程复盘 / 命令行工具等"偏系统"的内容
- "poster"（高概念海报：单一强饱和色 + 巨型粗黑体 + 极简装饰）  ★ 观点首选
  → 观点宣言 / 反直觉判断 / 金句合集 / 立场型内容等"偏喊"的内容

【主题 theme 只能落在所选 system 的主题列表里】
- editorial → [${THEME_IDS.map((t) => `"${t}"`).join(', ')}]
  科技/AI/方法论 → "indigo-porcelain"，通用/文字向 → "ink-classic"，自然/户外/生活 → "forest-ink"，
  人文/阅读/复盘 → "kraft-paper"，年轻/消费/工具 → "swiss-lemon"，游戏/影视/夜间 → "midnight-ink"
- sticker → [${STICKER_IDS.map((t) => `"${t}"`).join(', ')}]
  暖调通用 → "sticker-butter"，冷静/职场 → "sticker-sea"，情感/穿搭 → "sticker-peach"，
  自然/健康 → "sticker-mint"，创意/文艺 → "sticker-grape"，夜间/深色 → "sticker-carbon"
- minimal → [${MINIMAL_IDS.map((t) => `"${t}"`).join(', ')}]
  极简黑白 → "minimal-pure"，米灰暖色 → "minimal-caramel"，商务冷蓝 → "minimal-cobalt"，
  柔和粉色 → "minimal-coral"，自然森绿 → "minimal-pine"，暗色高级 → "minimal-graphite"
- workbench → [${WORKBENCH_IDS.map((t) => `"${t}"`).join(', ')}]
  橡木暖色/日常教程 → "workbench-oak"，胡桃暗桌/深度技艺 → "workbench-walnut"，亚麻粗纸/文艺手作 → "workbench-linen"
- pulse → [${PULSE_IDS.map((t) => `"${t}"`).join(', ')}]
  基础设施/复古 → "pulse-copper"，数据/前端 → "pulse-cyan"，绿色终端/命令行 → "pulse-jade"，警报/事故复盘 → "pulse-alert"
- poster → [${POSTER_IDS.map((t) => `"${t}"`).join(', ')}]
  锋利宣言 → "poster-neon"，情绪冲击 → "poster-hot"，警示/热点 → "poster-electric"，
  冷静立场 → "poster-ice"，反主流/极客 → "poster-void"，克制文艺 → "poster-cream"

只返回一个 JSON 对象，不要输出任何解释或代码围栏：
{"system": "editorial", "theme": "ink-classic", "cards": [{"layout": "cover", ...}]}
`;

// ---------------------------------------------------------------------------
// 解析与校验：每个版式执行字数/条数硬上限，超限截断，非法卡片丢弃
// ---------------------------------------------------------------------------

const cut = (value: unknown, max: number): string =>
  typeof value === 'string' ? (value.length > max ? `${value.slice(0, max - 1)}…` : value) : '';

const textList = (value: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(value) ? value.map((v) => cut(v, maxLen)).filter(Boolean).slice(0, maxItems) : [];

const labelDetails = (value: unknown, maxItems: number, labelMax: number, detailMax: number) =>
  Array.isArray(value)
    ? value
        .map((v: any) => ({ label: cut(v?.label, labelMax), detail: cut(v?.detail, detailMax) }))
        .filter((v) => v.label)
        .slice(0, maxItems)
    : [];

// 说明：字数上限根据实测（1080x1440 画布 + 84px 内边距）反推的"能放下"上限，
// 而不是"读者理论上愿意读多少"。所有版式默认按 3-4 条主内容 + label≤8 汉字 + detail≤14 汉字 走，
// 超限时先砍 detail 保 label。
const trimForFit = <T extends { label: string; detail: string }>(items: T[], labelMax: number, detailMax: number): T[] =>
  items.map((it) => ({
    ...it,
    label: cut(it.label, labelMax),
    detail: cut(it.detail, detailMax),
  }));

const sanitizeCard = (raw: any): XhsCardSpec | null => {
  if (!raw || typeof raw !== 'object') return null;
  const kicker = cut(raw.kicker, 14);

  switch (raw.layout) {
    case 'cover': {
      const title = cut(raw.title, 10);
      if (!title) return null;
      return { layout: 'cover', kicker, title, subtitle: cut(raw.subtitle, 18), points: textList(raw.points, 3, 8) };
    }
    case 'checklist': {
      const heading = cut(raw.heading, 14);
      const items = trimForFit(labelDetails(raw.items, 4, 8, 16), 8, 16);
      if (!heading || items.length < 2) return null;
      return { layout: 'checklist', kicker, heading, items };
    }
    case 'steps': {
      const heading = cut(raw.heading, 14);
      const steps = Array.isArray(raw.steps)
        ? raw.steps
            .map((s: any) => ({ title: cut(s?.title, 8), desc: cut(s?.desc, 16) }))
            .filter((s: { title: string }) => s.title)
            .slice(0, 3)
        : [];
      if (!heading || steps.length < 2) return null;
      return { layout: 'steps', kicker, heading, steps };
    }
    case 'compare': {
      const heading = cut(raw.heading, 14);
      const before = { label: cut(raw.before?.label, 5) || '之前', points: textList(raw.before?.points, 2, 12) };
      const after = { label: cut(raw.after?.label, 5) || '之后', points: textList(raw.after?.points, 2, 12) };
      if (!heading || before.points.length === 0 || after.points.length === 0) return null;
      return { layout: 'compare', kicker, heading, before, after };
    }
    case 'quote': {
      const quote = cut(raw.quote, 30);
      if (!quote) return null;
      return { layout: 'quote', kicker, quote, source: cut(raw.source, 12) };
    }
    case 'data': {
      const heading = cut(raw.heading, 14);
      const rows: Array<{ label: string; value: string; pct: number }> = Array.isArray(raw.rows)
        ? raw.rows
            .map((r: any) => ({
              label: cut(r?.label, 5),
              value: cut(r?.value, 6),
              pct: typeof r?.pct === 'number' && Number.isFinite(r.pct) ? Math.max(0, r.pct) : 0,
            }))
            .filter((r: { label: string; value: string }) => r.label && r.value)
            .slice(0, 4)
        : [];
      if (!heading || rows.length < 2) return null;
      // 相对归一：AI 常把原始数字（38、3.2e8）也塞进 pct，这里统一按组内最大值缩放到 0-100。
      const maxPct = rows.reduce((m: number, r: { pct: number }) => (r.pct > m ? r.pct : m), 0);
      const normalized = rows.map((r) => ({
        ...r,
        pct: maxPct > 0 ? Math.round((r.pct / maxPct) * 100) : 0,
      }));
      return { layout: 'data', kicker, heading, rows: normalized };
    }
    case 'summary': {
      const heading = cut(raw.heading, 14);
      const items = trimForFit(labelDetails(raw.items, 3, 8, 16), 8, 16);
      if (!heading || items.length < 2) return null;
      return { layout: 'summary', kicker, heading, items, closing: cut(raw.closing, 18) };
    }
    default:
      return null;
  }
};

// 从正文提取兜底封面主标题：优先第一个 H1，其次首个非空行的短句；
// 尽量取 4-8 个汉字，避免"这篇文章讲了什么"这种废话占位。
const deriveFallbackCoverTitle = (markdown: string): string => {
  const source = markdown || '';
  const h1 = source.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  const h2 = source.match(/^##\s+(.+?)\s*$/m)?.[1]?.trim();
  const firstLine = source
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('```'));

  const raw = h1 || h2 || firstLine || '';
  // 只保留中英文数字，去掉 Markdown 装饰与标点尾巴
  const cleaned = raw.replace(/[*_`~\[\]()!"'"'"—…·•\-—。，,.:：；;?？!！]+/g, ' ').trim();
  if (!cleaned) return '一篇值得读的文章';
  // 优先取头 8 个字符，若第一句已经是短标题就整句用
  return cleaned.length <= 12 ? cleaned : cleaned.slice(0, 12);
};

// AI 返回里最常见的三种 JSON 破损：代码围栏、尾随逗号、"//" 注释。
// 全部本地救回，能救就不用再花一次调用。
const relaxedJsonParse = (raw: string): unknown => {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no-json');
  const stripped = raw
    .slice(start, end + 1)
    .replace(/,\s*([\]}])/g, '$1') // 尾随逗号
    .replace(/\/\/[^\n\r]*/g, ''); // 行注释
  return JSON.parse(stripped);
};

export const parseXhsDeck = (content: string, markdown = ''): XhsDeck => {
  let data: any;
  try {
    data = relaxedJsonParse(content);
  } catch {
    throw new Error('AI 返回的内容不是有效 JSON，请重试。');
  }

  // system 未指定或非法 → editorial 兜底；theme 必须落在所选 system 的清单里
  const system: XhsSystem = VALID_SYSTEMS.includes(data?.system) ? data.system : 'editorial';
  const allowedThemes = themesForSystem(system);
  const theme = allowedThemes.includes(data?.theme) ? data.theme : allowedThemes[0];
  let cards: XhsCardSpec[] = (Array.isArray(data?.cards) ? data.cards : [])
    .map(sanitizeCard)
    .filter((c: XhsCardSpec | null): c is XhsCardSpec => Boolean(c));

  // quote 整套图最多 1 张：多余的 quote 丢弃
  let quoteSeen = false;
  cards = cards.filter((c) => {
    if (c.layout !== 'quote') return true;
    if (quoteSeen) return false;
    quoteSeen = true;
    return true;
  });

  cards = cards.slice(0, 9);

  // 第一张必须是封面：AI 没给就从正文里挑一个有信息量的短标题
  if (cards.length === 0 || cards[0].layout !== 'cover') {
    cards.unshift({
      layout: 'cover',
      kicker: '图文笔记',
      title: deriveFallbackCoverTitle(markdown),
      subtitle: '',
      points: [],
    });
  }

  // 末页尽量落在 summary 上（article-visual-director 的收尾契约）
  const last = cards[cards.length - 1];
  const hasSummary = cards.some((c) => c.layout === 'summary');
  if (!hasSummary && last && last.layout !== 'summary' && last.layout !== 'cover') {
    // 若已经 9 张就替换末页，否则追加；用 checklist 里的条目兜底成 summary
    const items =
      last.layout === 'checklist'
        ? last.items.slice(0, 4)
        : last.layout === 'steps'
          ? last.steps.slice(0, 4).map((s) => ({ label: s.title, detail: s.desc }))
          : [];
    if (items.length >= 2) {
      const summaryCard: XhsCardSpec = {
        layout: 'summary',
        kicker: '带走',
        heading: '这几条能直接用',
        items,
        closing: '',
      };
      if (cards.length >= 9) cards[cards.length - 1] = summaryCard;
      else cards.push(summaryCard);
    }
  }

  if (cards.length < 3) {
    throw new Error('AI 生成的卡片数量太少，请重试。');
  }
  return { system, theme, cards };
};

// ---------------------------------------------------------------------------
// 调用：个人API浏览器直连，开发环境走同源代理
// ---------------------------------------------------------------------------

// 一次调用 + 一次解析。解析失败/卡片过少时会由外层 generateXhsCards 再重试一次。
const requestAndParse = async (markdown: string): Promise<XhsDeck> => {
  const {apiKey,baseUrl,model} = readPersonalAI();
  if (!apiKey) {
    throw new Error('需要先在设置中配置 API Key，才能使用 AI 图文生成。');
  }

  const content = await ossChatCompletion({
    endpoint: resolveChatEndpoint(baseUrl),
    apiKey,
    model: model || 'gpt-4o',
    systemPrompt: XHS_CARDS_PROMPT,
    userContent: markdown,
    temperature: 0.7,
  });
  return parseXhsDeck(content, markdown);
};

export const generateXhsCards = async (markdown: string): Promise<XhsDeck> => {
  if (!markdown.trim()) {
    throw new Error('正文为空，无法生成图文。');
  }
  // 首次调用；解析失败或卡片过少时静默重试一次 —— 这是一次昂贵调用，
  // 但 GPT 偶发 JSON 破损/摊薄的成本远高于让用户手动重试一次的沟通成本。
  try {
    return await requestAndParse(markdown);
  } catch (err: any) {
    const msg = String(err?.message || '');
    const retriable = msg.includes('JSON') || msg.includes('太少');
    if (!retriable) throw err;
    return await requestAndParse(markdown);
  }
};
