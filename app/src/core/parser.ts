import MarkdownIt from 'markdown-it';
import type { BlockComponent } from './types';
import type { Theme } from './theme';
import type { LayoutStyle } from './style';
import type { EmphasisConfig } from './emphasis';
import {sanitizeArticleHtml,safeImageUrl} from './safeHtml.ts';

const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
});
const renderInline = md.renderInline.bind(md);
const renderBlock = md.render.bind(md);
md.renderInline = (source, env) => sanitizeArticleHtml(renderInline(source, env));
md.render = (source, env) => sanitizeArticleHtml(renderBlock(source, env));

// CommonMark 的 flanking 规则以“空格分词”为前提：`**风景。**你好` 中闭合的 `**`
// 前面是标点、后面是汉字，会被判定为不能闭合，导致加粗失效。
// 这里把中文全角标点视为普通字符参与判断（与 markdown-it-cjk-friendly 思路一致）。
const isCjkPunct = (code: number) =>
  (code >= 0x3000 && code <= 0x303f) || // 。、「」《》【】等
  (code >= 0xff00 && code <= 0xffef) || // ，！？：；（）等全角字符
  (code >= 0x2018 && code <= 0x201f) || // “”‘’
  code === 0x2026 || code === 0x2014; // … —

const { isWhiteSpace, isPunctChar, isMdAsciiPunct } = md.utils;
md.inline.State.prototype.scanDelims = function (start: number, canSplitWord: boolean) {
  const max = this.posMax;
  const marker = this.src.charCodeAt(start);
  const lastChar = start > 0 ? this.src.charCodeAt(start - 1) : 0x20;

  let pos = start;
  while (pos < max && this.src.charCodeAt(pos) === marker) pos++;
  const count = pos - start;
  const nextChar = pos < max ? this.src.charCodeAt(pos) : 0x20;

  const isLastPunctChar = !isCjkPunct(lastChar) &&
    (isMdAsciiPunct(lastChar) || isPunctChar(String.fromCharCode(lastChar)));
  const isNextPunctChar = !isCjkPunct(nextChar) &&
    (isMdAsciiPunct(nextChar) || isPunctChar(String.fromCharCode(nextChar)));
  const isLastWhiteSpace = isWhiteSpace(lastChar);
  const isNextWhiteSpace = isWhiteSpace(nextChar);

  const leftFlanking = !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar);
  const rightFlanking = !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar);

  return {
    can_open: leftFlanking && (canSplitWord || !rightFlanking || isLastPunctChar),
    can_close: rightFlanking && (canSplitWord || !leftFlanking || isNextPunctChar),
    length: count,
  };
};

// override strong token to add WeChat inline styles based on layoutStyle
md.renderer.rules.strong_open = (_tokens, _idx, _options, env, _self) => {
  const highlight = env.theme?.highlight || '#FDE68A';
  const emphasisColor = env.emphasis?.color || env.theme?.emphasis || highlight;
  const emphasisStyleId = env.emphasis?.styleId || 'follow-layout';
  const primary = env.theme?.primary || '#059669';
  const layoutStyleId = env.layoutStyle?.id || 'minimalist';

  if (emphasisStyleId === 'gradient') {
    return `<strong style="background: linear-gradient(120deg, ${emphasisColor} 0%, rgba(255,255,255,0) 100%); padding: 0 4px; border-radius: 2px; font-weight: 600; color: #111827;">`;
  }
  if (emphasisStyleId === 'soft-fill') {
    return `<strong style="background: ${emphasisColor}; padding: 1px 4px; border-radius: 3px; font-weight: 600; color: #111827;">`;
  }
  if (emphasisStyleId === 'light-band') {
    return `<strong style="background: linear-gradient(180deg, rgba(255,255,255,0) 52%, ${emphasisColor} 52%, ${emphasisColor} 92%, rgba(255,255,255,0) 92%); padding: 0 2px; font-weight: 600; color: #111827;">`;
  }
  if (emphasisStyleId === 'underline') {
    return `<strong style="border-bottom: 3px solid ${emphasisColor}; padding-bottom: 1px; font-weight: 700; color: #111827;">`;
  }
  if (emphasisStyleId === 'plain-bold') {
    return `<strong style="font-weight: 700; color: #111827;">`;
  }
  
  if (layoutStyleId === 'literary') {
    return `<strong style="border-bottom: 0.5px solid ${primary}; padding-bottom: 2px; font-weight: 400; color: #374151;">`;
  }
  if (layoutStyleId === 'tech') {
    return `<strong style="background: ${primary}; color: #FFF; padding: 2px 6px; border-radius: 2px; font-weight: 800; font-family: monospace;">`;
  }
  if (layoutStyleId === 'cute') {
    return `<strong style="background: ${highlight}; color: ${primary}; padding: 2px 10px; border-radius: 12px; font-weight: 800;">`;
  }
  if (layoutStyleId === 'classic') {
    return `<strong style="border-bottom: 3px double ${primary}; padding-bottom: 1px; font-weight: bold; color: #111827; font-family: 'Songti SC', 'SimSun', STSong, serif;">`;
  }
  if (layoutStyleId === 'magazine') {
    return `<strong style="font-weight: 600; color: #111827; border-bottom: 2px solid ${primary}; font-family: Georgia, 'Times New Roman', 'Songti SC', serif;">`;
  }
  if (layoutStyleId === 'dark') {
    return `<strong style="background: ${primary}; color: #FFF; padding: 2px 6px; border-radius: 4px; font-weight: 700;">`;
  }
  
  // Minimalist (default)
  return `<strong style="background: linear-gradient(120deg, ${emphasisColor} 0%, rgba(255,255,255,0) 100%); padding: 0 4px; border-radius: 2px; font-weight: 600; color: #111827;">`;
};
md.renderer.rules.strong_close = () => {
  return '</strong>';
};

md.renderer.rules.code_inline = (tokens, idx, _options, env, _self) => {
  const primary = env.theme?.primary || '#059669';
  const content = tokens[idx].content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (env.layoutStyle?.id === 'dark') {
    return `<code style="background: #1E293B; color: #7DD3FC; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; margin: 0 2px;">${content}</code>`;
  }
  return `<code style="background: #efefef; color: ${primary}; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; margin: 0 2px;">${content}</code>`;
};

md.renderer.rules.link_open = (tokens, idx, _options, env, _self) => {
  const primary = env.theme?.primary || '#059669';
  const href = md.utils.escapeHtml(tokens[idx].attrGet('href') || '');
  return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color: ${primary}; text-decoration: none; border-bottom: 1px dashed ${primary}; outline: none; cursor: pointer;">`;
};
md.renderer.rules.link_close = () => {
  return `</a>`;
};

md.renderer.rules.em_open = (_tokens, _idx, _options, env, _self) => {
  const primary = env.theme?.primary || '#059669';
  return `<em style="color: ${primary}; font-style: italic; font-weight: 300;">`;
};
md.renderer.rules.em_close = () => {
  return `</em>`;
};

md.renderer.rules.s_open = () => {
  return `<span style="text-decoration: line-through; color: #9CA3AF;">`;
};
md.renderer.rules.s_close = () => {
  return `</span>`;
};

type ParserEnv = {
  theme?: Theme;
  layoutStyle?: LayoutStyle;
  emphasis?: EmphasisConfig;
  scrollCard?: boolean;
};

const CUSTOM_COMPONENT_REGEX = /^<(SummaryCard|InfoCard|ScrollCard|LongImageCard|CoverCard|TocCard|AuthorCard)\b([^>]*)>([\s\S]*?)<\/\1>$/i;
const TITLE_ATTR_REGEX = /\btitle=(?:"([^"]*)"|'([^']*)')/i;
const HEIGHT_ATTR_REGEX = /\bheight=(?:"([^"]*)"|'([^']*)')/i;
const COPY_ATTR_REGEX = /\bcopy=(?:"([^"]*)"|'([^']*)')/i;
const HINT_ATTR_REGEX = /\bhint=(?:"([^"]*)"|'([^']*)')/i;
const LIST_MARKER_REGEX = /^(?:[-*+]\s+|\d+\.\s+)/;
const DEFAULT_SCROLL_CARD_HEIGHT = 220;
const DEFAULT_LONG_IMAGE_CARD_HEIGHT = 360;
// 覆盖全部自定义组件——CommonMark HTML block 类型 7 会在空行处终止,
// 用户在卡片里换段就会把标签切碎。这条 ruler 主动扫到闭合标签,把整块吃完。
const SCROLLABLE_COMPONENT_OPEN_REGEX = /^<(ScrollCard|LongImageCard|InfoCard|SummaryCard|CoverCard|TocCard|AuthorCard)\b[^>]*>/i;
const SELF_CLOSING_COMPONENT_REGEX = /^<(\w+)\b([^>]*?)\s*\/>$/;

md.block.ruler.before(
  'html_block',
  'scrollable_component_block',
  (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const end = state.eMarks[startLine];

    if (state.sCount[startLine] - state.blkIndent >= 4) return false;

    const openingLine = state.src.slice(start, end);
    const openingMatch = openingLine.match(SCROLLABLE_COMPONENT_OPEN_REGEX);
    if (!openingMatch) return false;

    // <TocCard /> 这类自闭合写法单独占一行
    if (/\/>\s*$/.test(openingLine)) {
      if (silent) return true;
      state.line = startLine + 1;
      const token = state.push('html_block', '', 0);
      token.map = [startLine, startLine + 1];
      token.content = openingLine;
      return true;
    }

    const closingTagRegex = new RegExp(`</${openingMatch[1]}>\\s*$`, 'i');

    let nextLine = startLine;

    while (nextLine < endLine) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      const lineText = state.src.slice(lineStart, lineEnd);
      nextLine++;

      if (closingTagRegex.test(lineText)) {
        if (silent) return false;

        state.line = nextLine;
        const token = state.push('html_block', '', 0);
        token.map = [startLine, nextLine];
        token.content = state.getLines(startLine, nextLine, state.blkIndent, true);
        return true;
      }
    }

    return false;
  },
  { alt: ['paragraph', 'reference', 'blockquote'] },
);

// 代码块逐行用 <br/> 连接（不用 white-space:pre，公众号里会渲染出大块空白），
// 行首缩进换成不折叠的空格，否则缩进会被 HTML 吞掉
function renderCodeLines(code: string): string {
  return code
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => {
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return escaped.replace(/^[ \t]+/, (indent) => indent.replace(/\t/g, '    ').replace(/ /g, '&nbsp;'));
    })
    .join('<br/>');
}

// ScrollCard renders nested Markdown directly, so its fences bypass the top-level CodeBlock component.
for (const type of ['fence', 'code_block'] as const) {
  const renderDefault = md.renderer.rules[type]!;
  md.renderer.rules[type] = (tokens, index, options, env: ParserEnv, renderer) => {
    if (!env?.scrollCard) return renderDefault(tokens, index, options, env, renderer);
    return '<section style="margin:0;padding:0;line-height:1.75;white-space:normal;word-break:break-all">'
      + '<code style="font-family:monospace;font-size:13px;white-space:normal;word-break:break-all">'
      + renderCodeLines(tokens[index].content)
      + '</code></section>\n';
  };
}

function renderInlineLines(content: string, env: ParserEnv): string {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => md.renderInline(line, env))
    .join('<br/>');
}

function extractMarkdownImages(content: string, env: ParserEnv) {
  const images: Array<{ src: string; alt: string }> = [];

  md.parse(content, env).forEach((token) => {
    token.children?.forEach((child) => {
      if (child.type !== 'image') return;

      const src = safeImageUrl(child.attrGet('src') || '');
      if (!src) return;

      images.push({ src, alt: child.content || '长图' });
    });
  });

  return images;
}

function readAttr(rawAttrs: string, name: string): string | undefined {
  const match = rawAttrs.match(new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  if (!match) return undefined;
  return (match[1] ?? match[2] ?? '').trim();
}

function renderAttr(rawAttrs: string, name: string, env: ParserEnv): string {
  const value = readAttr(rawAttrs, name);
  return value ? md.renderInline(value, env) : '';
}

function parseCustomComponent(content: string, env: ParserEnv): BlockComponent | null {
  const match = content.trim().replace(SELF_CLOSING_COMPONENT_REGEX, '<$1$2></$1>').match(CUSTOM_COMPONENT_REGEX);
  if (!match) return null;

  const [, componentName, rawAttrs, rawBody] = match;
  const titleMatch = rawAttrs.match(TITLE_ATTR_REGEX);
  const title = (titleMatch?.[1] ?? titleMatch?.[2] ?? '').trim();
  const body = rawBody.trim();

  if (componentName === 'ScrollCard') {
    const heightMatch = rawAttrs.match(HEIGHT_ATTR_REGEX);
    const rawHeight = (heightMatch?.[1] ?? heightMatch?.[2] ?? '').trim().replace(/px$/i, '');
    const parsedHeight = Number(rawHeight);
    const height = rawHeight && Number.isFinite(parsedHeight)
      ? Math.min(360, Math.max(140, Math.round(parsedHeight)))
      : DEFAULT_SCROLL_CARD_HEIGHT;
    const copyMatch = rawAttrs.match(COPY_ATTR_REGEX);
    const copyMode = (copyMatch?.[1] ?? copyMatch?.[2] ?? '').trim().toLowerCase() === 'expand'
      ? 'expand'
      : 'scroll';
    const hintMatch = rawAttrs.match(HINT_ATTR_REGEX);
    const hint = hintMatch
      ? (hintMatch[1] ?? hintMatch[2] ?? '').trim()
      : undefined;

    return {
      id: Math.random().toString(36).substring(7),
      type: 'scroll_card',
      content: md.render(body, { ...env, scrollCard: true }),
      metadata: { title, height, copyMode, hint },
    };
  }

  if (componentName === 'LongImageCard') {
    const heightMatch = rawAttrs.match(HEIGHT_ATTR_REGEX);
    const rawHeight = (heightMatch?.[1] ?? heightMatch?.[2] ?? '').trim().replace(/px$/i, '');
    const parsedHeight = Number(rawHeight);
    const height = Number.isFinite(parsedHeight)
      ? Math.min(720, Math.max(240, Math.round(parsedHeight)))
      : DEFAULT_LONG_IMAGE_CARD_HEIGHT;
    const copyMatch = rawAttrs.match(COPY_ATTR_REGEX);
    const copyMode = (copyMatch?.[1] ?? copyMatch?.[2] ?? '').trim().toLowerCase() === 'scroll'
      ? 'scroll'
      : 'expand';
    const hintMatch = rawAttrs.match(HINT_ATTR_REGEX);
    const hint = hintMatch
      ? (hintMatch[1] ?? hintMatch[2] ?? '').trim()
      : undefined;
    const images = extractMarkdownImages(body, env);

    return {
      id: Math.random().toString(36).substring(7),
      type: 'long_image_card',
      content: body,
      metadata: { title, height, copyMode, hint, images },
    };
  }

  if (componentName === 'CoverCard') {
    return {
      id: Math.random().toString(36).substring(7),
      type: 'cover_card',
      content: body ? renderInlineLines(body, env) : '',
      metadata: {
        title: title ? md.renderInline(title, env) : '',
        subtitle: renderAttr(rawAttrs, 'subtitle', env),
        kicker: renderAttr(rawAttrs, 'kicker', env),
        date: renderAttr(rawAttrs, 'date', env),
      },
    };
  }

  if (componentName === 'TocCard') {
    // 不写条目时留空，parseMarkdownToJSON 收尾时用全文二级标题补齐
    const items = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => md.renderInline(line.replace(LIST_MARKER_REGEX, ''), env));
    return {
      id: Math.random().toString(36).substring(7),
      type: 'toc_card',
      content: '',
      metadata: { title, items, auto: items.length === 0 },
    };
  }

  if (componentName === 'AuthorCard') {
    const ctaRaw = readAttr(rawAttrs, 'cta');
    return {
      id: Math.random().toString(36).substring(7),
      type: 'author_card',
      content: body ? renderInlineLines(body, env) : '',
      metadata: {
        name: renderAttr(rawAttrs, 'name', env),
        avatar: safeImageUrl(readAttr(rawAttrs, 'avatar') || ''),
        // 不写 cta 用默认引导语；写 cta="" 表示不要这一行
        cta: ctaRaw === undefined ? undefined : md.renderInline(ctaRaw, env),
      },
    };
  }

  if (componentName === 'InfoCard') {
    return {
      id: Math.random().toString(36).substring(7),
      type: 'info_card',
      content: renderInlineLines(body, env),
      metadata: { title },
    };
  }

  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items = lines
    .filter((line) => LIST_MARKER_REGEX.test(line))
    .map((line) => md.renderInline(line.replace(LIST_MARKER_REGEX, ''), env));
  const contentLines = lines.filter((line) => !LIST_MARKER_REGEX.test(line));

  return {
    id: Math.random().toString(36).substring(7),
    type: 'summary_card',
    content: renderInlineLines(contentLines.join('\n'), env),
    metadata: {
      title,
      items: items.length > 0 ? items : undefined,
    },
  };
}

export const parseMarkdownToJSON = (
  markdown: string,
  theme?: Theme,
  layoutStyle?: LayoutStyle,
  emphasis?: EmphasisConfig,
): BlockComponent[] => {
  const env = { theme, layoutStyle, emphasis };
  const tokens = md.parse(markdown, env);
  const components: BlockComponent[] = [];
  
  // We'll process the flat token array into our Component structure
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === 'heading_open') {
      const tag = token.tag;
      const contentToken = tokens[i + 1];
      const rawText = contentToken.content;
      const parts = rawText.split('|').map(p => p.trim());

      // h3：小节标题，支持可选「标签 | 标题」
      if (tag === 'h3') {
        const hasLabel = parts.length > 1;
        components.push({
          id: Math.random().toString(36).substring(7),
          type: 'heading3',
          content: md.renderInline(hasLabel ? parts.slice(1).join(' | ') : rawText, env),
          metadata: {
            label: hasLabel ? md.renderInline(parts[0], env) : undefined,
          },
        });
        i += 3;
        continue;
      }

      // h4-h6：段落小标题，按级别分三档视觉装置
      if (tag !== 'h1' && tag !== 'h2') {
        const level = tag === 'h4' ? 4 : tag === 'h5' ? 5 : 6;
        components.push({
          id: Math.random().toString(36).substring(7),
          type: 'heading4',
          content: md.renderInline(rawText, env),
          metadata: { level },
        });
        i += 3;
        continue;
      }

      const isH1 = tag === 'h1';
      
      let props: any = {};
      let mainContent = rawText;

      if (parts.length > 1) {
        if (isH1) {
          if (parts.length >= 3) {
            props = { num: parts[0], sub: parts[2] };
            mainContent = parts[1];
          } else if (parts.length === 2) {
            props = { num: parts[0] };
            mainContent = parts[1];
          }
        } else {
          props = { step: parts[0] };
          mainContent = parts.slice(1).join(' | ');
        }
      }

      components.push({
        id: Math.random().toString(36).substring(7),
        type: isH1 ? 'title' : 'subtitle',
        content: md.renderInline(mainContent, env),
        metadata: {
          num: props.num ? md.renderInline(props.num, env) : undefined,
          sub: props.sub ? md.renderInline(props.sub, env) : undefined,
          step: props.step ? md.renderInline(props.step, env) : undefined,
        }
      });
      i += 3; // heading_open, inline, heading_close
      continue;
    }

    if (token.type === 'html_block' || token.type === 'html_inline') {
      const customComponent = parseCustomComponent(token.content, env);
      if (customComponent) {
        components.push(customComponent);
        i++;
        continue;
      }
    }

    if (token.type === 'hr') {
      components.push({
        id: Math.random().toString(36).substring(7),
        type: 'divider',
        content: '',
      });
      i++;
      continue;
    }

    if (token.type === 'paragraph_open') {
      const contentToken = tokens[i + 1];

      const customComponent = parseCustomComponent(contentToken.content, env);
      if (customComponent) {
        components.push(customComponent);
        i += 3;
        continue;
      }
      
      // Check if paragraph contains image(s)
      const imageTokens = contentToken.children?.filter(t => t.type === 'image') || [];
      if (imageTokens.length > 0) {
        const images = imageTokens.map(img => ({
          src: safeImageUrl(img.attrGet('src') || ''),
          alt: img.content || ''
        }));
        components.push({
          id: Math.random().toString(36).substring(7),
          type: 'image',
          content: images[0].src,
          metadata: { alt: images[0].alt, images: images.length > 1 ? images : undefined }
        });
        i += 3;
        continue;
      }
      
      if (contentToken.content.trim() === '---') {
         components.push({
          id: Math.random().toString(36).substring(7),
          type: 'divider',
          content: '',
        });
      } else {
        // Here we could handle strong/highlight individually, but for standard paragraphs we can parse the inline tokens
        // For simplicity right now, we just pass the RAW content containing markdown or parse the inline text
        // If contentToken has bold (`**`), we might want to flag it or extract it.
        // Or we can let paragraph render inline HTML safely. Let's pass the raw text and parse later, or process children.
        
        components.push({
          id: Math.random().toString(36).substring(7),
          type: 'paragraph',
          content: md.renderInline(contentToken.content, env), 
        });
      }
      i += 3;
      continue;
    }

    if (token.type === 'blockquote_open') {
      // Find the closing blockquote
      let blockquoteContent = '';
      i++;
      while (i < tokens.length && tokens[i].type !== 'blockquote_close') {
         if (tokens[i].type === 'inline') {
             blockquoteContent += md.renderInline(tokens[i].content, env) + '<br/>';
         }
         i++;
      }
      // Remove trailing <br/>
      if (blockquoteContent.endsWith('<br/>')) {
        blockquoteContent = blockquoteContent.slice(0, -5);
      }
      components.push({
        id: Math.random().toString(36).substring(7),
        type: 'quote',
        content: blockquoteContent.trim(),
      });
      i++;
      continue;
    }

    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const isOrdered = token.type === 'ordered_list_open';
      const listItems: string[] = [];
      i++;
      while (i < tokens.length && !tokens[i].type.endsWith('list_close')) {
         if (tokens[i].type === 'inline') {
             listItems.push(md.renderInline(tokens[i].content, env));
         }
         i++;
      }
      // Combine into a JSON structure for lists
      components.push({
        id: Math.random().toString(36).substring(7),
        type: 'list',
        content: JSON.stringify(listItems),
        metadata: { ordered: isOrdered },
      });
      i++;
      continue;
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      components.push({
        id: Math.random().toString(36).substring(7),
        type: 'code_block',
        content: renderCodeLines(token.content),
        metadata: { language: token.info }
      });
      i++;
      continue;
    }

    if (token.type === 'table_open') {
       let headers: string[] = [];
       let rows: string[][] = [];
       i++;
       while (i < tokens.length && tokens[i].type !== 'table_close') {
          if (tokens[i].type === 'tr_open') {
             let isHeader = false;
             let rowData: string[] = [];
             i++;
             while (i < tokens.length && tokens[i].type !== 'tr_close') {
                if (tokens[i].type === 'th_open') isHeader = true;
                if (tokens[i].type === 'inline') {
                   rowData.push(md.renderInline(tokens[i].content, env));
                }
                i++;
             }
             if (isHeader) headers = rowData;
             else rows.push(rowData);
          }
          i++;
       }
       components.push({
          id: Math.random().toString(36).substring(7),
          type: 'table',
          content: rows,
          metadata: { headers }
       });
       i++;
       continue;
    }
    
    i++;
  }

  // 空的导读卡用全文二级标题补齐（最多 6 条）
  const headings = components
    .filter((component) => component.type === 'subtitle')
    .map((component) => component.content as string)
    .slice(0, 6);
  components.forEach((component) => {
    if (component.type === 'toc_card' && component.metadata?.auto) {
      component.metadata.items = headings;
    }
  });

  return components;
};
