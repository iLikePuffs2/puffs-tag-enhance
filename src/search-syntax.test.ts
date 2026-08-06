// 搜索语法契约测试。
//
// 这些断言记录的是**重构前的实际行为**，用于在重构（把解析逻辑搬到 core/syntax.ts）
// 前后比对。凡是反直觉但真实的行为都显式标注了，因为它们最容易在重构中被"顺手改对"，
// 而那恰恰会改变使用体感。
//
// `：：` 语法见 models.test.ts；`=` / `==` 父子层级语法见 relation-utils.test.ts。

import { describe, expect, it } from 'vitest';
import {
  createMultiTagSearchQuery,
  createTagFilterSearchQuery,
  fileMatchesNoteSearch,
  getTagDisplayName,
  getTagFilterQuery,
  isNestedTag,
  normalizeSearchTerm,
  normalizeTag,
  parseNoteCardSearch,
  splitIntersectionSearchTerms,
  splitUnionSearchTerms,
  tagMatchesAnySearchTerm,
  tagMatchesSearchText,
} from './models';

describe('* 笔记名分隔语法', () => {
  it('没有 * 时返回 null', () => {
    expect(parseNoteCardSearch('读书')).toBeNull();
    expect(parseNoteCardSearch('')).toBeNull();
    expect(parseNoteCardSearch(null)).toBeNull();
  });

  it('标签与笔记名都存在时有效', () => {
    expect(parseNoteCardSearch('读书*笔记')).toEqual({
      tagQuery: '读书',
      noteQuery: '笔记',
      isValid: true,
      isTagOnly: false,
    });
  });

  it('两侧空白被裁剪', () => {
    expect(parseNoteCardSearch('  读书  *  笔记  ')).toMatchObject({
      tagQuery: '读书',
      noteQuery: '笔记',
      isValid: true,
    });
  });

  it('只有标签时是 isTagOnly 而非 isValid（用于"已输入 * 但还没输笔记名"的中间态）', () => {
    expect(parseNoteCardSearch('读书*')).toEqual({
      tagQuery: '读书',
      noteQuery: '',
      isValid: false,
      isTagOnly: true,
    });
  });

  it('只有笔记名时两者都不成立', () => {
    expect(parseNoteCardSearch('*笔记')).toEqual({
      tagQuery: '',
      noteQuery: '笔记',
      isValid: false,
      isTagOnly: false,
    });
  });

  it('多个 * 一律无效，但仍按首个 * 切分', () => {
    expect(parseNoteCardSearch('读书**笔记')).toEqual({
      tagQuery: '读书',
      noteQuery: '*笔记',
      isValid: false,
      isTagOnly: false,
    });
    // 入参都含 *，故解析结果必定非 null（上面「没有 * 时返回 null」已覆盖该分支）
    expect(parseNoteCardSearch('读书*笔记*补充')!.isValid).toBe(false);
  });

  it('标签侧混用 | 与 & 时无效', () => {
    expect(parseNoteCardSearch('读书|科幻&玄幻*笔记')!.isValid).toBe(false);
    expect(parseNoteCardSearch('读书|科幻&玄幻*')!.isTagOnly).toBe(false);
  });

  it('标签侧单独使用 | 或 & 仍然有效', () => {
    expect(parseNoteCardSearch('读书|科幻*笔记')!.isValid).toBe(true);
    expect(parseNoteCardSearch('读书&科幻*笔记')!.isValid).toBe(true);
  });
});

describe('| 标签并集语法', () => {
  it('没有 | 时返回 null', () => {
    expect(splitUnionSearchTerms('读书')).toBeNull();
    expect(splitUnionSearchTerms('')).toBeNull();
  });

  it('与 & 混用时返回 null（交给交集或普通搜索处理）', () => {
    expect(splitUnionSearchTerms('读书|科幻&玄幻')).toBeNull();
  });

  it('拆分并归一化：去 #、转小写', () => {
    expect(splitUnionSearchTerms('#读书|科幻')).toEqual(['读书', '科幻']);
    expect(splitUnionSearchTerms('ABC|Def')).toEqual(['abc', 'def']);
  });

  it('丢弃空词条', () => {
    expect(splitUnionSearchTerms('读书|')).toEqual(['读书']);
    expect(splitUnionSearchTerms('|读书')).toEqual(['读书']);
    expect(splitUnionSearchTerms('读书||科幻')).toEqual(['读书', '科幻']);
  });

  it('全为空时返回 null', () => {
    expect(splitUnionSearchTerms('|')).toBeNull();
    expect(splitUnionSearchTerms('||')).toBeNull();
  });

  it('并集会去重', () => {
    expect(splitUnionSearchTerms('读书|读书')).toEqual(['读书']);
    expect(splitUnionSearchTerms('#读书|读书')).toEqual(['读书']);
  });
});

describe('& 标签交集语法', () => {
  it('没有 & 时返回 null', () => {
    expect(splitIntersectionSearchTerms('读书')).toBeNull();
  });

  it('与 | 混用时返回 null', () => {
    expect(splitIntersectionSearchTerms('读书&科幻|玄幻')).toBeNull();
  });

  it('拆分并归一化', () => {
    expect(splitIntersectionSearchTerms('#读书&科幻')).toEqual(['读书', '科幻']);
    expect(splitIntersectionSearchTerms('读书&科幻&玄幻')).toEqual(['读书', '科幻', '玄幻']);
  });

  it('尾随 & 返回单个词条 —— 这是"列出可与该标签组合的标签"的建议态', () => {
    // 注意：返回长度为 1 的数组，与"至少两项"的常规约束不同。
    // 下游 getIntersectionSearchItems 靠它触发组合枚举，重构时不能把它归一成 null。
    expect(splitIntersectionSearchTerms('读书&')).toEqual(['读书']);
  });

  it('仅有分隔符或首项为空时返回 null', () => {
    expect(splitIntersectionSearchTerms('&')).toBeNull();
    expect(splitIntersectionSearchTerms('&读书')).toBeNull();
  });

  it('三段中末段为空时退化为前两项，不走建议态', () => {
    expect(splitIntersectionSearchTerms('读书&科幻&')).toEqual(['读书', '科幻']);
  });

  it('交集不去重 —— 与并集的行为差异，重构时容易被统一掉', () => {
    expect(splitIntersectionSearchTerms('读书&读书')).toEqual(['读书', '读书']);
  });
});

describe('getTagFilterQuery 取标签侧查询', () => {
  it('有 * 时只取标签侧', () => {
    expect(getTagFilterQuery('读书*笔记')).toBe('读书');
    expect(getTagFilterQuery('读书*')).toBe('读书');
  });

  it('无 * 时原样返回', () => {
    expect(getTagFilterQuery('读书')).toBe('读书');
    expect(getTagFilterQuery('读书|科幻')).toBe('读书|科幻');
  });

  it('空值归一为空串', () => {
    expect(getTagFilterQuery(null)).toBe('');
    expect(getTagFilterQuery(undefined)).toBe('');
  });
});

describe('标签匹配', () => {
  it('空查询匹配所有标签', () => {
    expect(tagMatchesSearchText('#读书', '')).toBe(true);
    expect(tagMatchesSearchText('#读书', '   ')).toBe(true);
    expect(tagMatchesSearchText('#读书', null)).toBe(true);
  });

  it('按子串匹配，忽略大小写与前导 #', () => {
    expect(tagMatchesSearchText('#读书笔记', '读书')).toBe(true);
    expect(tagMatchesSearchText('#ABC', 'abc')).toBe(true);
    expect(tagMatchesSearchText('#abc', '#ABC')).toBe(true);
    expect(tagMatchesSearchText('#读书', '科幻')).toBe(false);
  });

  it('terms 为 null 时匹配所有；为空数组时不匹配', () => {
    expect(tagMatchesAnySearchTerm('#读书', null)).toBe(true);
    expect(tagMatchesAnySearchTerm('#读书', [])).toBe(false);
  });

  it('命中任一词条即算匹配', () => {
    expect(tagMatchesAnySearchTerm('#读书', ['科幻', '读书'])).toBe(true);
    expect(tagMatchesAnySearchTerm('#读书', ['科幻', '玄幻'])).toBe(false);
  });
});

describe('笔记名匹配', () => {
  const file = { basename: '读书笔记' } as never;

  it('空查询不匹配任何笔记 —— 与标签匹配的空查询语义相反', () => {
    // tagMatchesSearchText('', ...) 返回 true，这里返回 false。
    // 空搜索时"显示全部标签、但不高亮任何笔记"依赖这个不对称。
    expect(fileMatchesNoteSearch(file, '')).toBe(false);
    expect(fileMatchesNoteSearch(file, '  ')).toBe(false);
  });

  it('匹配文件名，忽略大小写', () => {
    expect(fileMatchesNoteSearch(file, '读书')).toBe(true);
    expect(fileMatchesNoteSearch({ basename: 'ABC' } as never, 'abc')).toBe(true);
    expect(fileMatchesNoteSearch(file, '科幻')).toBe(false);
  });

  it('也匹配传入的展示名（别名）', () => {
    expect(fileMatchesNoteSearch(file, '别名', '我的别名')).toBe(true);
    expect(fileMatchesNoteSearch(file, '别名', '')).toBe(false);
  });
});

describe('搜索查询对象的 matchContent', () => {
  it('多标签查询按词条列表匹配', () => {
    const query = createMultiTagSearchQuery('读书|科幻', ['读书', '科幻']);
    expect(query.query).toBe('读书|科幻');
    expect(query.matchContent('#读书')).toBe(true);
    expect(query.matchContent('#玄幻')).toBe(false);
  });

  it('标签过滤查询在混用 | 与 & 时一律不匹配', () => {
    const query = createTagFilterSearchQuery('读书|科幻&玄幻*笔记', '读书|科幻&玄幻');
    expect(query.matchContent('#读书')).toBe(false);
  });

  it('标签过滤查询会识别并集与交集词条', () => {
    expect(createTagFilterSearchQuery('读书|科幻*笔记', '读书|科幻').matchContent('#科幻')).toBe(true);
    expect(createTagFilterSearchQuery('读书&科幻*笔记', '读书&科幻').matchContent('#读书')).toBe(true);
  });

  it('无操作符时退化为子串匹配', () => {
    expect(createTagFilterSearchQuery('读书*笔记', '读书').matchContent('#读书笔记')).toBe(true);
    expect(createTagFilterSearchQuery('读书*笔记', '读书').matchContent('#科幻')).toBe(false);
  });
});

describe('标签名归一化', () => {
  it('normalizeTag 补上 # 前缀', () => {
    expect(normalizeTag('读书')).toBe('#读书');
    expect(normalizeTag('#读书')).toBe('#读书');
    expect(normalizeTag('  读书  ')).toBe('#读书');
  });

  it('normalizeTag 对空值返回 null', () => {
    expect(normalizeTag('')).toBeNull();
    expect(normalizeTag('   ')).toBeNull();
    expect(normalizeTag(null)).toBeNull();
    expect(normalizeTag(undefined)).toBeNull();
  });

  it('getTagDisplayName 去掉 # 前缀', () => {
    expect(getTagDisplayName('#读书')).toBe('读书');
    expect(getTagDisplayName('读书')).toBe('读书');
    expect(getTagDisplayName(null)).toBe('');
  });

  it('isNestedTag 识别斜杠嵌套标签', () => {
    expect(isNestedTag('#读书/小说')).toBe(true);
    expect(isNestedTag('#读书')).toBe(false);
    expect(isNestedTag(null)).toBe(false);
  });

  it('normalizeSearchTerm 去 #、裁空白、转小写', () => {
    expect(normalizeSearchTerm('  #ABC  ')).toBe('abc');
    expect(normalizeSearchTerm(null)).toBe('');
  });
});
