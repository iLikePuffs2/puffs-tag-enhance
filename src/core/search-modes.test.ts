// 搜索模式策略表测试。
//
// 这张表要替代原先散在 updateSearch / renderListMode / renderTagList 三处的
// if-else 判断链，因此判定结果必须与旧行为逐一对齐 —— 尤其是优先级顺序，
// 以及"层级与当前笔记语法用原始查询判断、其余用置顶解析后的查询判断"这个时机。

import { describe, expect, it } from 'vitest';
import { clearsNoteCardSearchState, rendersOwnTagList, resolveSearch } from './search-modes';

describe('搜索模式判定', () => {
  it('普通模糊搜索', () => {
    expect(resolveSearch('读书').id).toBe('plain');
    expect(resolveSearch('').id).toBe('plain');
  });

  it('父子层级语法优先级最高', () => {
    expect(resolveSearch('=').id).toBe('hierarchy');
    expect(resolveSearch('==').id).toBe('hierarchy');
    expect(resolveSearch('=父笔记').id).toBe('hierarchy');
    expect(resolveSearch('=父*子').id).toBe('hierarchy');
  });

  it('当前笔记标签语法', () => {
    expect(resolveSearch('：：').id).toBe('current-note-tags');
    expect(resolveSearch('::').id).toBe('current-note-tags');
    // 带参数时退化为普通搜索
    expect(resolveSearch('：：读书').id).toBe('plain');
  });

  it('笔记定位：标签与笔记名都有', () => {
    const resolved = resolveSearch('读书*笔记');
    expect(resolved.id).toBe('note-card');
    expect(resolved.tagQuery).toBe('读书');
    expect(resolved.noteQuery).toBe('笔记');
  });

  it('只输入到 * 时是 tag-filter 中间态，不是 note-card', () => {
    const resolved = resolveSearch('读书*');
    expect(resolved.id).toBe('tag-filter');
    expect(resolved.tagQuery).toBe('读书');
    expect(resolved.noteQuery).toBe('');
  });

  it('交集与并集', () => {
    expect(resolveSearch('读书&科幻').id).toBe('intersection');
    expect(resolveSearch('读书|科幻').id).toBe('union');
    // 尾随 & 的建议态仍归入交集
    expect(resolveSearch('读书&').id).toBe('intersection');
  });

  it('混用 | 与 & 时两者都不成立，退回普通搜索', () => {
    expect(resolveSearch('读书|科幻&玄幻').id).toBe('plain');
  });

  it('标签侧带操作符的笔记定位仍是 note-card', () => {
    expect(resolveSearch('读书|科幻*笔记').id).toBe('note-card');
    expect(resolveSearch('读书&科幻*笔记').id).toBe('note-card');
  });

  it('多个 * 时不成立 —— 与 parseNoteCardSearch 的 isValid 一致', () => {
    expect(resolveSearch('读书*笔记*补充').id).toBe('plain');
  });
});

describe('置顶标签的解析时机', () => {
  const resolvePinned = (query: string) =>
    ['*', '&', '|'].includes(query.charAt(0)) ? `读书${query}` : query;

  it('省略左侧条件时由置顶标签补全，并据此判定模式', () => {
    const resolved = resolveSearch('*笔记', resolvePinned);
    expect(resolved.id).toBe('note-card');
    expect(resolved.effectiveQuery).toBe('读书*笔记');
    expect(resolved.tagQuery).toBe('读书');
    expect(resolved.rawQuery).toBe('*笔记'); // 原始输入保留
  });

  it('省略左侧条件的交集同样被补全', () => {
    const resolved = resolveSearch('&科幻', resolvePinned);
    expect(resolved.id).toBe('intersection');
    expect(resolved.intersectionTerms).toEqual(['读书', '科幻']);
  });

  it('层级语法不经过置顶解析 —— 与原实现的判断顺序一致', () => {
    const resolved = resolveSearch('=父笔记', resolvePinned);
    expect(resolved.id).toBe('hierarchy');
    expect(resolved.effectiveQuery).toBe('=父笔记');
  });

  it('当前笔记语法不经过置顶解析', () => {
    const resolved = resolveSearch('：：', resolvePinned);
    expect(resolved.id).toBe('current-note-tags');
    expect(resolved.effectiveQuery).toBe('：：');
  });

  it('不传解析函数时按原样判定', () => {
    expect(resolveSearch('*笔记').id).toBe('plain'); // 标签侧为空，note-card 不成立
  });
});

describe('解析结果的词条', () => {
  it('并集词条归一化并去重', () => {
    expect(resolveSearch('#读书|读书|科幻').unionTerms).toEqual(['读书', '科幻']);
  });

  it('交集词条不去重', () => {
    expect(resolveSearch('读书&读书').intersectionTerms).toEqual(['读书', '读书']);
  });

  it('isMultiTag 标记并集与交集', () => {
    expect(resolveSearch('读书|科幻').isMultiTag).toBe(true);
    expect(resolveSearch('读书&科幻').isMultiTag).toBe(true);
    expect(resolveSearch('读书').isMultiTag).toBe(false);
    expect(resolveSearch('读书*笔记').isMultiTag).toBe(false);
  });

  it('note-card 模式下标签侧词条仍可用', () => {
    const resolved = resolveSearch('读书|科幻*笔记');
    expect(resolved.tagQuery).toBe('读书|科幻');
    expect(resolved.unionTerms).toEqual(['读书', '科幻']);
    expect(resolved.noteQuery).toBe('笔记');
  });
});

describe('模式派生的行为开关', () => {
  it('只有笔记定位与当前笔记模式参与卡片定位循环', () => {
    expect(clearsNoteCardSearchState('note-card')).toBe(false);
    expect(clearsNoteCardSearchState('current-note-tags')).toBe(false);
    expect(clearsNoteCardSearchState('plain')).toBe(true);
    expect(clearsNoteCardSearchState('hierarchy')).toBe(true);
  });

  it('普通搜索之外的模式都由插件自绘标签列表', () => {
    expect(rendersOwnTagList('plain')).toBe(false);
    for (const id of ['hierarchy', 'current-note-tags', 'note-card', 'tag-filter', 'intersection', 'union'] as const) {
      expect(rendersOwnTagList(id)).toBe(true);
    }
  });
});
