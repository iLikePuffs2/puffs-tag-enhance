// 业务层：搜索语法解析。
//
// 分层约束：本文件为纯计算，不得引用 DOM、不得 import data/ 或 view/（由 architecture.test.ts 守卫）。
// 实现自 models.ts 迁入，models.ts 保留同名 re-export 作为过渡兼容层，因此所有既有
// 调用点无需改动；阶段 5 收口时清理那层转发。
//
// 六种语法：`|` 并集、`&` 交集、`*` 分隔标签与笔记名、`=` / `==` 父子层级、`：：` 当前笔记标签。
// 各自的边界行为见 search-syntax.test.ts —— 其中若干处反直觉但真实，改动前先读测试。

import { getTagDisplayName } from "./tag-name";

/** 去掉 # 前缀、裁空白、转小写，用于比较标签名。 */
export function normalizeSearchTerm(value: unknown): string {
  return String(value || '').trim().replace(/^#/, '').toLowerCase();
}

/**
 * 解析 `标签条件*笔记关键字`。
 *
 * 返回 null 表示不含 `*`。isTagOnly 对应"已输入 * 但还没输笔记名"的中间态，
 * 此时要保持标签筛选结果、不进入笔记定位。
 */
export function parseNoteCardSearch(value: unknown): {
  tagQuery: string;
  noteQuery: string;
  isValid: boolean;
  isTagOnly: boolean;
} | null {
  const text = String(value || '');
  const firstDelimiter = text.indexOf('*');
  if (firstDelimiter < 0) return null;

  const tagQuery = text.slice(0, firstDelimiter).trim();
  const noteQuery = text.slice(firstDelimiter + 1).trim();
  const hasSingleDelimiter = firstDelimiter === text.lastIndexOf('*');
  const mixesTagOperators = tagQuery.includes('|') && tagQuery.includes('&');

  return {
    tagQuery,
    noteQuery,
    isValid: !!tagQuery && !!noteQuery && hasSingleDelimiter && !mixesTagOperators,
    isTagOnly: !!tagQuery && !noteQuery && hasSingleDelimiter && !mixesTagOperators,
  };
}

/** 取出查询里的标签侧条件（有 `*` 时只要左半边）。 */
export function getTagFilterQuery(value: unknown): string {
  const noteCardSearch = parseNoteCardSearch(value);
  return noteCardSearch ? noteCardSearch.tagQuery : String(value || '');
}

/** `：：`（全角）与 `::`（半角）单独出现时定位当前笔记所属标签，带参数则退化为普通搜索。 */
export function parseCurrentNoteTagSearch(value: unknown): { matched: boolean } {
  const text = String(value || '').trim();
  return { matched: text === '：：' || text === '::' };
}

/**
 * `**笔记A`：定位指定笔记所处的全部标签。
 *
 * 与 `：：` 是同一族语法 —— 后者跟随当前笔记，本语法按名字模糊匹配指定笔记。
 * 只有 `**` 而没有笔记名时不成立：那等于「列出全部标签」，与空搜索重复。
 *
 * 笔记名里的 `*` 原样保留，模糊匹配由 fileMatchesNoteSearch 负责，
 * 因此不与 `标签*笔记名` 冲突 —— 后者要求 `*` 恰好出现一次且左侧非空。
 */
export function parseNoteTagLocateSearch(value: unknown): { matched: boolean; noteQuery: string } {
  const text = String(value || '').trim();
  if (!text.startsWith('**')) return { matched: false, noteQuery: '' };

  const noteQuery = text.slice(2).trim();
  return noteQuery ? { matched: true, noteQuery } : { matched: false, noteQuery: '' };
}

/**
 * `比赛，`：把「比赛」及其相似标签一并搜出来。
 *
 * 只认全角逗号（U+FF0C）。半角 `,` 在标签名里更常见，认它会让普通搜索被误判成
 * 相似组搜索。逗号必须在末尾，且左侧要有条件 —— 只输入一个逗号没有意义。
 */
export function parseSimilarTagSearch(value: unknown): { matched: boolean; baseQuery: string } {
  const text = String(value || '').trim();
  if (!text.endsWith('，')) return { matched: false, baseQuery: '' };

  const baseQuery = text.slice(0, -1).trim();
  return baseQuery ? { matched: true, baseQuery } : { matched: false, baseQuery: '' };
}

/**
 * 笔记名匹配。空查询返回 false —— 与标签匹配的空查询语义相反，
 * "空搜索显示全部标签但不高亮任何笔记"依赖这个不对称。
 */
export function fileMatchesNoteSearch(
  file: { basename?: string } | null | undefined,
  value: unknown,
  displayName = ''
): boolean {
  const term = String(value || '').trim().toLowerCase();
  if (!term) return false;

  const fileName = String((file && file.basename) || '').toLowerCase();
  const visibleName = String(displayName || '').toLowerCase();
  return fileName.includes(term) || (!!visibleName && visibleName.includes(term));
}

/** 拆分 `|` 并集词条。与 `&` 混用时返回 null（交给别的分支处理）。并集会去重。 */
export function splitUnionSearchTerms(value: unknown): string[] | null {
  const text = String(value || '');
  if (!text.includes('|') || text.includes('&')) return null;

  const terms = text
    .split('|')
    .map(normalizeSearchTerm)
    .filter(Boolean);

  return terms.length > 0 ? Array.from(new Set(terms)) : null;
}

/**
 * 拆分 `&` 交集词条。与 `|` 混用时返回 null。
 *
 * 两处刻意与并集不同，改动前留意：
 * - 尾随 `&`（如 `读书&`）返回长度为 1 的数组，用于"列出可与该标签组合的标签"的建议态
 * - 交集不去重
 */
export function splitIntersectionSearchTerms(value: unknown): string[] | null {
  const text = String(value || '');
  if (!text.includes('&') || text.includes('|')) return null;

  const parts = text.split('&').map(normalizeSearchTerm);
  const isTrailingSuggestionSearch = parts.length === 2 && parts[0] && !parts[1];
  if (isTrailingSuggestionSearch) return [parts[0]];

  const terms = parts.filter(Boolean);
  return terms.length >= 2 ? terms : null;
}

/** terms 为 null 时匹配所有；为空数组时不匹配任何标签。 */
export function tagMatchesAnySearchTerm(tag: unknown, terms: string[] | null): boolean {
  if (!terms) return true;

  const tagName = getTagDisplayName(tag).toLowerCase();
  const tagText = String(tag || '').toLowerCase();
  return terms.some((term) => tagName.includes(term) || tagText.includes(term));
}

/** 标签子串匹配，忽略大小写与前导 #。空查询匹配所有标签。 */
export function tagMatchesSearchText(tag: unknown, value: unknown): boolean {
  const term = String(value || '').trim().replace(/^#/, '').toLowerCase();
  if (!term) return true;

  const tagName = getTagDisplayName(tag).toLowerCase();
  const tagText = String(tag || '').toLowerCase();
  return tagName.includes(term) || tagText.includes(term);
}

/** 构造供原生标签面板消费的查询对象（阶段 4 移除寄生渲染后可一并去掉）。 */
export function createMultiTagSearchQuery(query: string, terms: string[] | null) {
  return {
    query,
    matcher: true,
    matchContent: (content: unknown) => tagMatchesAnySearchTerm(content, terms),
  };
}

export function createTagFilterSearchQuery(query: string, tagQuery: string) {
  const unionTerms = splitUnionSearchTerms(tagQuery);
  const intersectionTerms = splitIntersectionSearchTerms(tagQuery);
  const mixesTagOperators = tagQuery.includes('|') && tagQuery.includes('&');

  return {
    query,
    matcher: true,
    matchContent: (content: unknown) => {
      if (mixesTagOperators) return false;
      if (unionTerms || intersectionTerms) {
        return tagMatchesAnySearchTerm(content, unionTerms || intersectionTerms);
      }
      return tagMatchesSearchText(content, tagQuery);
    },
  };
}

/** 笔记卡片定位的会话状态（`Enter` 循环定位用）。 */
export function createNoteCardSearchState() {
  return {
    query: '',
    matches: [] as unknown[],
    activeIndex: -1,
    target: null as unknown,
    autoExpandedTag: null as string | null,
    autoExpandedWasAlreadyExpanded: false,
    lastScrolledKey: '',
    pendingScrollKey: '',
    effectTimer: null as number | null,
  };
}
