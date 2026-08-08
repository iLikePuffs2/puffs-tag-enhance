// 业务层：搜索模式策略表。
//
// 原先"这个查询属于哪种语法"的判断链在三处各写了一遍 —— tag-pane 的 updateSearch、
// renderListMode，以及 views 的 renderTagList。三份 if-else 顺序必须保持一致，
// 任何一处漏改就会出现"侧边栏认它、标签系统页不认"的分歧。
//
// 这里收敛成一张按优先级排列的策略表：新增语法只加一项，判断顺序只有一处定义。
// 分层约束：纯计算，不引用 DOM、不 import data/ 或 view/。

import { parseUnifiedHierarchySearch } from "../relation-utils";
import {
  getTagFilterQuery,
  parseCurrentNoteTagSearch,
  parseNoteCardSearch,
  parseNoteTagLocateSearch,
  parseSimilarTagSearch,
  splitIntersectionSearchTerms,
  splitUnionSearchTerms,
} from "./syntax";

export type SearchModeId =
  | 'hierarchy'          // = / == 父子层级
  | 'current-note-tags'  // ：： / :: 当前笔记所属标签
  | 'note-tag-locate'    // **笔记A 指定笔记所属标签
  | 'note-card'          // 标签*笔记名，两侧都有
  | 'tag-filter'         // 标签*，只有标签侧（已输入 * 的中间态）
  | 'intersection'       // &
  | 'union'              // |
  | 'similar-tags'       // 尾随全角逗号，连同相似标签一起搜
  | 'plain';             // 普通模糊搜索

/**
 * 策略表按优先级排列，顺序即原 if-else 的判断顺序，不可随意调整：
 * 层级与当前笔记两种语法用**原始查询**判断（不受置顶标签改写影响），
 * 其余用置顶标签解析后的查询判断。
 */
type SearchModeSpec = {
  id: SearchModeId;
  /** true 表示该模式用原始查询判断，否则用置顶解析后的查询。 */
  usesRawQuery: boolean;
  match: (query: string) => boolean;
};

const SEARCH_MODE_SPECS: SearchModeSpec[] = [
  {
    id: 'hierarchy',
    usesRawQuery: true,
    match: (query) => parseUnifiedHierarchySearch(query).matched,
  },
  {
    id: 'current-note-tags',
    usesRawQuery: true,
    match: (query) => parseCurrentNoteTagSearch(query).matched,
  },
  {
    // 必须用原始查询并排在 note-card 之前：用户要求本语法不受固定标签影响，
    // 且若先经过置顶解析，`**笔记A` 会被改写成 `读书**笔记A`（含两个 *），
    // note-card 的 isValid 不成立、最终落到 plain，定位结果就看不见了
    id: 'note-tag-locate',
    usesRawQuery: true,
    match: (query) => parseNoteTagLocateSearch(query).matched,
  },
  {
    id: 'note-card',
    usesRawQuery: false,
    match: (query) => parseNoteCardSearch(query)?.isValid === true,
  },
  {
    id: 'tag-filter',
    usesRawQuery: false,
    match: (query) => parseNoteCardSearch(query)?.isTagOnly === true,
  },
  {
    id: 'intersection',
    usesRawQuery: false,
    match: (query) => splitIntersectionSearchTerms(getTagFilterQuery(query)) !== null,
  },
  {
    id: 'union',
    usesRawQuery: false,
    match: (query) => splitUnionSearchTerms(getTagFilterQuery(query)) !== null,
  },
  {
    // 排在交集与并集之后：`比赛&秘境，` 这类混合输入优先按操作符处理，
    // 否则两种语法会互相吞掉
    id: 'similar-tags',
    usesRawQuery: false,
    match: (query) => parseSimilarTagSearch(getTagFilterQuery(query)).matched,
  },
];

export type ResolvedSearch = {
  id: SearchModeId;
  /** 用户实际输入 */
  rawQuery: string;
  /** 置顶标签解析后的查询；层级与当前笔记模式下等于 rawQuery */
  effectiveQuery: string;
  /** 标签侧条件（去掉 `*` 右半边） */
  tagQuery: string;
  /** 笔记侧关键字，仅 note-card 模式非空 */
  noteQuery: string;
  unionTerms: string[] | null;
  intersectionTerms: string[] | null;
  /** 是否属于"多标签"模式（并集或交集），供需要区分的调用方使用 */
  isMultiTag: boolean;
};

/**
 * 判定查询属于哪种搜索模式，并一次性给出各分支需要的解析结果。
 *
 * @param rawQuery 用户输入
 * @param resolvePinnedQuery 置顶标签改写函数；层级与当前笔记模式不经过它，
 *        与原实现中"先判 hierarchy/currentNote，再 resolvePinnedSearchQuery"的顺序一致。
 */
export function resolveSearch(
  rawQuery: unknown,
  resolvePinnedQuery: (query: string) => string = (query) => query
): ResolvedSearch {
  const raw = String(rawQuery || '');

  for (const spec of SEARCH_MODE_SPECS) {
    if (!spec.usesRawQuery) continue;
    if (!spec.match(raw)) continue;
    return buildResult(spec.id, raw, raw);
  }

  const effective = resolvePinnedQuery(raw);
  for (const spec of SEARCH_MODE_SPECS) {
    if (spec.usesRawQuery) continue;
    if (!spec.match(effective)) continue;
    return buildResult(spec.id, raw, effective);
  }

  return buildResult('plain', raw, effective);
}

function buildResult(id: SearchModeId, rawQuery: string, effectiveQuery: string): ResolvedSearch {
  const noteCard = parseNoteCardSearch(effectiveQuery);
  // 这三种模式整条查询就是它们自己的条件，不该被当作标签筛选串再切一刀
  const usesWholeQueryAsCondition =
    id === 'hierarchy' || id === 'current-note-tags' || id === 'note-tag-locate';
  const rawTagQuery = usesWholeQueryAsCondition ? effectiveQuery : getTagFilterQuery(effectiveQuery);
  // 相似标签模式下把末尾的全角逗号摘掉，下游按普通标签条件筛选后再展开相似组
  const tagQuery = id === 'similar-tags'
    ? parseSimilarTagSearch(rawTagQuery).baseQuery
    : rawTagQuery;
  const unionTerms = usesWholeQueryAsCondition ? null : splitUnionSearchTerms(tagQuery);
  const intersectionTerms = usesWholeQueryAsCondition ? null : splitIntersectionSearchTerms(tagQuery);

  const noteQuery = id === 'note-card'
    ? (noteCard?.noteQuery ?? '')
    : id === 'note-tag-locate'
      ? parseNoteTagLocateSearch(effectiveQuery).noteQuery
      : '';

  return {
    id,
    rawQuery,
    effectiveQuery,
    tagQuery,
    noteQuery,
    unionTerms,
    intersectionTerms,
    isMultiTag: id === 'union' || id === 'intersection',
  };
}

/** 该模式下是否需要清空笔记卡片定位状态（层级与普通搜索不参与卡片定位循环）。 */
export function clearsNoteCardSearchState(id: SearchModeId): boolean {
  return id !== 'note-card' && id !== 'current-note-tags' && id !== 'note-tag-locate';
}

/** 该模式下标签列表是否由插件自绘（而非交回原生标签面板渲染）。 */
export function rendersOwnTagList(id: SearchModeId): boolean {
  return id !== 'plain';
}
