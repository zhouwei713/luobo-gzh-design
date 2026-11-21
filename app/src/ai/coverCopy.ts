import { ossChatCompletion, resolveChatEndpoint } from './chatCompletion';
import { readPersonalAI } from '../services/personalAISettings';
import { COVER_COLORS } from '../components/ui/CoverTemplate';
import type { CoverTemplateId } from '../components/ui/CoverTemplate';

export interface CoverCopyProposal {
  title: string;
  subtitle: string;
  template: CoverTemplateId;
  color: string;
}

const VALID_TEMPLATES: CoverTemplateId[] = ['poster', 'note', 'split', 'mark'];

const COVER_COPY_PROMPT = `
你是一位资深的小红书内容策划，擅长写高点击率的爆款封面文案。

请通读用户给出的 Markdown 文章，为它设计 3 套风格不同的小红书封面方案。

要求：
- 每套方案包含：主标题 title、副标题 subtitle、模板 template、主题色 color。
- 主标题：不超过 14 个字，要有钩子感（数字、痛点、结果承诺、反差），禁止使用"震惊""不看后悔"等低质标题党词汇。
- 副标题：不超过 20 个字，补充信息量或点明受众，可以为空字符串。
- template 只能从 ["poster", "note", "split", "mark"] 中选择，含义分别是：大字报、便签纸、撞色分割、荧光笔记。
- color 只能从 [${COVER_COLORS.map((c) => `"${c}"`).join(', ')}] 中选择，需与文案情绪匹配。
- 3 套方案的文案角度和模板选择要互相错开。

只返回一个 JSON 对象，不要输出任何解释或代码围栏：
{"covers": [{"title": "...", "subtitle": "...", "template": "poster", "color": "#FF2442"}]}
`;

const extractJsonObject = (text: string): any => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('AI 返回的内容不是有效 JSON，请重试。');
  }
  return JSON.parse(text.slice(start, end + 1));
};

export const parseCoverCopy = (content: string): CoverCopyProposal[] => {
  const data = extractJsonObject(content);
  const covers = Array.isArray(data?.covers) ? data.covers : [];

  const proposals = covers
    .map((item: any): CoverCopyProposal | null => {
      const title = typeof item?.title === 'string' ? item.title.trim() : '';
      if (!title) return null;
      return {
        title,
        subtitle: typeof item?.subtitle === 'string' ? item.subtitle.trim() : '',
        template: VALID_TEMPLATES.includes(item?.template) ? item.template : 'poster',
        color: COVER_COLORS.includes(item?.color) ? item.color : COVER_COLORS[0],
      };
    })
    .filter((item: CoverCopyProposal | null): item is CoverCopyProposal => Boolean(item))
    .slice(0, 3);

  if (proposals.length === 0) {
    throw new Error('AI 没有返回可用的封面方案，请重试。');
  }
  return proposals;
};

/**
 * Generate Xiaohongshu cover copy proposals from the article markdown.
 * 所有部署模式均使用个人API，浏览器直连；开发环境走同源代理。
 */
export const generateCoverCopy = async (markdown: string): Promise<CoverCopyProposal[]> => {
  if (!markdown.trim()) {
    throw new Error('正文为空，无法生成封面方案。');
  }

  const {apiKey,baseUrl,model} = readPersonalAI();
  if (!apiKey) {
    throw new Error('需要先在设置中配置 API Key，才能使用 AI 封面方案。');
  }

  const content = await ossChatCompletion({
    endpoint: resolveChatEndpoint(baseUrl),
    apiKey,
    model: model || 'gpt-4o',
    systemPrompt: COVER_COPY_PROMPT,
    userContent: markdown,
    temperature: 0.8,
  });
  return parseCoverCopy(content);
};
