// 继承规则测试。
//
// 这些函数纯化后可以直接构造数据调用 —— 对比之前住在 relations.ts 时，
// 测试得先 Object.create(prototype) 再 mock getTagInheritanceSettings 等一串依赖。

import { describe, expect, it } from 'vitest';
import {
  type TagInheritance,
  cloneParentChildSettings,
  createInheritanceEdgesFromLineage,
  getExcludedInheritedPaths,
  getFixedChildDisplayName,
  getFixedParent,
  getFixedTagInheritanceAdjacency,
  getInheritanceChildren,
  getInheritanceParents,
  getIncludedInheritedPaths,
  getSortedTagInheritanceAdjacency,
  getTagDescendants,
  getTagInheritanceMode,
  getTopLevelFixedParent,
  hasInheritanceChildren,
  isFixedChild,
  isFixedTagEdge,
  isFixedTagRelationEligible,
  isInheritanceEdgePathVisible,
  isInheritancePathVisible,
  isTagInheritanceEnabled,
  parseFixedChildTag,
  setParentChildValue,
  wouldCreateTagInheritanceCycle,
} from './inheritance';

function makeInheritance(overrides: Partial<TagInheritance> = {}): TagInheritance {
  return {
    childrenByParent: {},
    enabledParents: [],
    excludedPathsByParentChild: {},
    modeByParentChild: {},
    includedPathsByParentChild: {},
    fixedParentByChild: {},
    ...overrides,
  };
}

describe('固定子标签的命名规则', () => {
  it('恰好一个连字符、两侧非空才成立', () => {
    expect(parseFixedChildTag('#爱情-升温')).toEqual({ parent: '#爱情', displayName: '升温' });
  });

  it.each(['#爱情', '#爱情-', '#-升温', '#爱情-升温-额外', '#爱情/升温', ''])(
    '不成立：%s',
    (value) => {
      expect(parseFixedChildTag(value)).toBeNull();
    }
  );

  it('展示时用后缀简称，非固定格式则用完整名', () => {
    expect(getFixedChildDisplayName('#爱情-升温')).toBe('升温');
    expect(getFixedChildDisplayName('#读书')).toBe('读书');
  });

  it('只有恰好一个父级时才能锁定为固定关系', () => {
    const single = makeInheritance({ childrenByParent: { '#爱情': ['#爱情-升温'] } });
    expect(isFixedTagRelationEligible(single, '#爱情', '#爱情-升温')).toBe(true);

    const multi = makeInheritance({
      childrenByParent: { '#爱情': ['#爱情-升温'], '#其他': ['#爱情-升温'] },
    });
    expect(isFixedTagRelationEligible(multi, '#爱情', '#爱情-升温')).toBe(false);
  });

  it('名字与父标签对不上时不能锁定', () => {
    const inh = makeInheritance({ childrenByParent: { '#读书': ['#爱情-升温'] } });
    expect(isFixedTagRelationEligible(inh, '#读书', '#爱情-升温')).toBe(false);
  });

  it('识别固定关系与固定子标签', () => {
    const inh = makeInheritance({ fixedParentByChild: { '#爱情-升温': '#爱情' } });
    expect(getFixedParent(inh, '#爱情-升温')).toBe('#爱情');
    expect(isFixedChild(inh, '#爱情-升温')).toBe(true);
    expect(isFixedChild(inh, '#读书')).toBe(false);
    expect(isFixedTagEdge(inh, '#爱情', '#爱情-升温')).toBe(true);
    expect(isFixedTagEdge(inh, '#读书', '#爱情-升温')).toBe(false);
  });

  it('沿固定关系上溯到顶层', () => {
    const inh = makeInheritance({
      fixedParentByChild: { '#a-b': '#a', '#a-b-c': '#a-b' },
    });
    expect(getTopLevelFixedParent(inh, '#a-b-c')).toBe('#a');
    expect(getTopLevelFixedParent(inh, '#读书')).toBe('#读书');
  });

  it('固定关系成环时不死循环', () => {
    const inh = makeInheritance({ fixedParentByChild: { '#a': '#b', '#b': '#a' } });
    expect(typeof getTopLevelFixedParent(inh, '#a')).toBe('string');
  });
});

describe('关系查询', () => {
  const inh = makeInheritance({
    childrenByParent: { '#爱情': ['#初识', '#升温'], '#百艺': ['#炼丹'] },
    enabledParents: ['#爱情'],
  });

  it('取直接子标签，保持持久化的排序', () => {
    expect(getInheritanceChildren(inh, '#爱情')).toEqual(['#初识', '#升温']);
    expect(getInheritanceChildren(inh, '#不存在')).toEqual([]);
  });

  it('返回副本，改动不会污染原数据', () => {
    getInheritanceChildren(inh, '#爱情').push('#污染');
    expect(inh.childrenByParent['#爱情']).toEqual(['#初识', '#升温']);
  });

  it('反查父标签，支持多父级', () => {
    const multi = makeInheritance({
      childrenByParent: { '#爱情': ['#升温'], '#情节': ['#升温'] },
    });
    expect(getInheritanceParents(multi, '#升温').sort()).toEqual(['#情节', '#爱情']);
    expect(getInheritanceParents(inh, '#爱情')).toEqual([]);
  });

  it('判断是否为父标签', () => {
    expect(hasInheritanceChildren(inh, '#爱情')).toBe(true);
    expect(hasInheritanceChildren(inh, '#初识')).toBe(false);
  });

  it('继承开关按父标签持久化', () => {
    expect(isTagInheritanceEnabled(inh, '#爱情')).toBe(true);
    expect(isTagInheritanceEnabled(inh, '#百艺')).toBe(false);
  });

  it('邻接表跳过没有子标签的条目', () => {
    const withEmpty = makeInheritance({ childrenByParent: { '#爱情': ['#升温'], '#空': [] } });
    expect(getSortedTagInheritanceAdjacency(withEmpty)).toEqual({ '#爱情': ['#升温'] });
  });

  it('固定邻接表只保留固定边', () => {
    const mixed = makeInheritance({
      childrenByParent: { '#爱情': ['#爱情-升温', '#初识'] },
      fixedParentByChild: { '#爱情-升温': '#爱情' },
    });
    expect(getFixedTagInheritanceAdjacency(mixed)).toEqual({ '#爱情': ['#爱情-升温'] });
  });

  it('递归取全部后代', () => {
    const deep = makeInheritance({
      childrenByParent: { '#a': ['#b'], '#b': ['#c'], '#c': ['#d'] },
    });
    expect(getTagDescendants(deep, '#a').sort()).toEqual(['#b', '#c', '#d']);
  });

  it('阻止成环', () => {
    const chain = makeInheritance({ childrenByParent: { '#a': ['#b'], '#b': ['#c'] } });
    expect(wouldCreateTagInheritanceCycle(chain, '#c', '#a')).toBe(true);
    expect(wouldCreateTagInheritanceCycle(chain, '#a', '#a')).toBe(true);
    expect(wouldCreateTagInheritanceCycle(chain, '#a', '#d')).toBe(false);
  });
});

describe('继承模式与名单', () => {
  it('缺省是全部继承', () => {
    expect(getTagInheritanceMode(makeInheritance(), '#父', '#子')).toBe('all');
  });

  it('显式标记为选择继承', () => {
    const inh = makeInheritance({ modeByParentChild: { '#父': { '#子': 'selected' } } });
    expect(getTagInheritanceMode(inh, '#父', '#子')).toBe('selected');
  });

  it('名单取副本', () => {
    const inh = makeInheritance({
      includedPathsByParentChild: { '#父': { '#子': ['a.md'] } },
      excludedPathsByParentChild: { '#父': { '#子': ['b.md'] } },
    });
    getIncludedInheritedPaths(inh, '#父', '#子').push('污染.md');
    expect(inh.includedPathsByParentChild['#父']['#子']).toEqual(['a.md']);
    expect(getExcludedInheritedPaths(inh, '#父', '#子')).toEqual(['b.md']);
  });
});

describe('单条边的可见性', () => {
  it('全部继承下：不在黑名单即可见', () => {
    const inh = makeInheritance({ excludedPathsByParentChild: { '#父': { '#子': ['b.md'] } } });
    expect(isInheritanceEdgePathVisible(inh, '#父', '#子', 'a.md')).toBe(true);
    expect(isInheritanceEdgePathVisible(inh, '#父', '#子', 'b.md')).toBe(false);
  });

  it('选择继承下：必须在白名单里', () => {
    const inh = makeInheritance({
      modeByParentChild: { '#父': { '#子': 'selected' } },
      includedPathsByParentChild: { '#父': { '#子': ['a.md'] } },
    });
    expect(isInheritanceEdgePathVisible(inh, '#父', '#子', 'a.md')).toBe(true);
    expect(isInheritanceEdgePathVisible(inh, '#父', '#子', 'b.md')).toBe(false);
  });

  it('固定边始终放行，不看任何名单', () => {
    const inh = makeInheritance({
      fixedParentByChild: { '#子': '#父' },
      modeByParentChild: { '#父': { '#子': 'selected' } },
      includedPathsByParentChild: { '#父': { '#子': [] } },
      excludedPathsByParentChild: { '#父': { '#子': ['a.md'] } },
    });
    expect(isInheritanceEdgePathVisible(inh, '#父', '#子', 'a.md')).toBe(true);
  });

  it('路径为空时不可见', () => {
    expect(isInheritanceEdgePathVisible(makeInheritance(), '#父', '#子', '')).toBe(false);
  });
});

describe('整条路径的可见性', () => {
  const inh = makeInheritance({
    excludedPathsByParentChild: { '#祖': { '#父': ['blocked.md'] } },
  });
  const edges = [
    { parent: '#祖', child: '#父' },
    { parent: '#父', child: '#子' },
  ];

  it('必须通过路径上的每一条边', () => {
    expect(isInheritancePathVisible(inh, edges, 'ok.md')).toBe(true);
    expect(isInheritancePathVisible(inh, edges, 'blocked.md')).toBe(false);
  });

  it('可忽略指定边做推演 —— 恢复笔记时计算候选用', () => {
    expect(isInheritancePathVisible(inh, edges, 'blocked.md', { parent: '#祖', child: '#父' }))
      .toBe(true);
  });

  it('空路径视为可见', () => {
    expect(isInheritancePathVisible(inh, [], 'any.md')).toBe(true);
    expect(isInheritancePathVisible(inh, null, 'any.md')).toBe(true);
  });

  it('血缘展开成逐段的边，并标出固定段', () => {
    const fixed = makeInheritance({ fixedParentByChild: { '#子': '#父' } });
    expect(createInheritanceEdgesFromLineage(fixed, ['#祖', '#父', '#子'])).toEqual([
      { parent: '#祖', child: '#父', fixed: false },
      { parent: '#父', child: '#子', fixed: true },
    ]);
  });

  it('单元素或空血缘没有边', () => {
    expect(createInheritanceEdgesFromLineage(makeInheritance(), ['#只有一个'])).toEqual([]);
    expect(createInheritanceEdgesFromLineage(makeInheritance(), null)).toEqual([]);
  });
});

describe('两级名单的写入工具', () => {
  it('写入并按需建父层', () => {
    const target: Record<string, Record<string, string[]>> = {};
    setParentChildValue(target, '#父', '#子', ['a.md']);
    expect(target).toEqual({ '#父': { '#子': ['a.md'] } });
  });

  it('值为空时连同空壳一起删除，避免 data.json 里堆空对象', () => {
    const target = { '#父': { '#子': ['a.md'] } };
    setParentChildValue(target, '#父', '#子', []);
    expect(target).toEqual({});
  });

  it('同父下还有其他子项时只删该项', () => {
    const target = { '#父': { '#子一': ['a.md'], '#子二': ['b.md'] } };
    setParentChildValue(target, '#父', '#子一', undefined);
    expect(target).toEqual({ '#父': { '#子二': ['b.md'] } });
  });

  it('深拷贝出的快照与原数据互不影响', () => {
    const source = { '#父': { '#子': ['a.md'] } };
    const clone = cloneParentChildSettings(source);
    clone['#父']['#子'].push('b.md');
    expect(source['#父']['#子']).toEqual(['a.md']);
  });
});
