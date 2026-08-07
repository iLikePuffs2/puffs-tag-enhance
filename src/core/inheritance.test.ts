// 继承规则测试。
//
// 这些函数纯化后可以直接构造数据调用 —— 对比之前住在 relations.ts 时，
// 测试得先 Object.create(prototype) 再 mock getTagInheritanceSettings 等一串依赖。

import { describe, expect, it } from 'vitest';
import {
  type TagInheritance,
  areTagsRelated,
  cloneParentChildSettings,
  createInheritanceEdgesFromLineage,
  getExcludedInheritedPaths,
  getFixedChildDisplayName,
  getFixedParent,
  getInheritanceChildren,
  getInheritanceOnlyChildren,
  getInheritanceParents,
  getIntersectionPartners,
  getRelativeChildDisplayName,
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
  isIntersectionEdge,
  parseFixedChildTag,
  setParentChildValue,
  wouldCreateTagInheritanceCycle,
} from './inheritance';

function makeInheritance(overrides: Partial<TagInheritance> = {}): TagInheritance {
  return {
    childrenByParent: {},
    excludedPathsByParentChild: {},
    modeByParentChild: {},
    fixedParentByChild: {},
    ...overrides,
  };
}

describe('子标签的相对显示名', () => {
  it('名字符合「父标签-子名称」时只显示后缀', () => {
    expect(getRelativeChildDisplayName('#爱情', '#爱情-追求')).toBe('追求');
  });

  it('不看是否锁定为固定子标签，只看名字格式', () => {
    // 这里没有任何 fixedParentByChild 数据，简称照样成立
    expect(getRelativeChildDisplayName('#爱情', '#爱情-升温')).toBe('升温');
  });

  it('父标签对不上时显示完整名', () => {
    expect(getRelativeChildDisplayName('#亲昵', '#爱情-追求')).toBe('爱情-追求');
  });

  it.each(['#读书', '#爱情-追求-额外', '#爱情/追求', '#-追求', '#爱情-'])(
    '不符合格式时显示完整名：%s',
    (child) => {
      expect(getRelativeChildDisplayName('#爱情', child)).toBe(child.replace(/^#/, ''));
    }
  );
});

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

  it('邻接表跳过没有子标签的条目', () => {
    const withEmpty = makeInheritance({ childrenByParent: { '#爱情': ['#升温'], '#空': [] } });
    expect(getSortedTagInheritanceAdjacency(withEmpty)).toEqual({ '#爱情': ['#升温'] });
  });

  it('邻接表对固定边与自由边一视同仁', () => {
    // 继承开关移除后不再有「只走固定边」的退化状态
    const mixed = makeInheritance({
      childrenByParent: { '#爱情': ['#爱情-升温', '#初识'] },
      fixedParentByChild: { '#爱情-升温': '#爱情' },
    });
    expect(getSortedTagInheritanceAdjacency(mixed)).toEqual({ '#爱情': ['#爱情-升温', '#初识'] });
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
  it('缺省是继承', () => {
    expect(getTagInheritanceMode(makeInheritance(), '#父', '#子')).toBe('all');
  });

  it('显式标记为交集', () => {
    const inh = makeInheritance({ modeByParentChild: { '#父': { '#子': 'intersection' } } });
    expect(getTagInheritanceMode(inh, '#父', '#子')).toBe('intersection');
  });

  it('名单取副本', () => {
    const inh = makeInheritance({
      excludedPathsByParentChild: { '#父': { '#子': ['b.md'] } },
    });
    getExcludedInheritedPaths(inh, '#父', '#子').push('污染.md');
    expect(inh.excludedPathsByParentChild['#父']['#子']).toEqual(['b.md']);
  });
});

describe('单条边的可见性', () => {
  it('不在排除名单即可见', () => {
    const inh = makeInheritance({ excludedPathsByParentChild: { '#父': { '#子': ['b.md'] } } });
    expect(isInheritanceEdgePathVisible(inh, '#父', '#子', 'a.md')).toBe(true);
    expect(isInheritanceEdgePathVisible(inh, '#父', '#子', 'b.md')).toBe(false);
  });

  it('直接笔记与深层笔记同一口径 —— 只查一张排除名单', () => {
    const inh = makeInheritance({ excludedPathsByParentChild: { '#父': { '#子': ['c.md'] } } });
    expect(isInheritanceEdgePathVisible(inh, '#父', '#子', 'b.md')).toBe(true);
    expect(isInheritanceEdgePathVisible(inh, '#父', '#子', 'c.md')).toBe(false);
  });

  it('固定边始终放行，不看排除名单', () => {
    const inh = makeInheritance({
      fixedParentByChild: { '#子': '#父' },
      excludedPathsByParentChild: { '#父': { '#子': ['a.md'] } },
    });
    expect(isInheritanceEdgePathVisible(inh, '#父', '#子', 'a.md')).toBe(true);
  });

  it('交集边不参与继承链，一律拦下', () => {
    const inh = makeInheritance({ modeByParentChild: { '#父': { '#子': 'intersection' } } });
    expect(isInheritanceEdgePathVisible(inh, '#父', '#子', 'a.md')).toBe(false);
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

  // 单名单化之后不再有「下级决定、上层只排除」的分工：每条边都只做排除，
  // 因此给子标签新增孙标签、孙笔记时，祖先侧不需要任何跟进就自动放行。
  it('新增的深层笔记默认放行，无需在上游做任何登记', () => {
    expect(isInheritancePathVisible(inh, edges, '刚加的孙.md')).toBe(true);
  });

  it('任意一层排除掉就拦得住', () => {
    const blocked = makeInheritance({
      excludedPathsByParentChild: { '#父': { '#子': ['孙.md'] } },
    });
    expect(isInheritancePathVisible(blocked, edges, '孙.md')).toBe(false);
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

describe('交集关系', () => {
  // 交集成对存两条边，两侧都标 intersection
  const pair = (a: string, b: string, extra: Partial<TagInheritance> = {}) => makeInheritance({
    childrenByParent: { [a]: [b], [b]: [a], ...(extra.childrenByParent || {}) },
    modeByParentChild: {
      [a]: { [b]: 'intersection' },
      [b]: { [a]: 'intersection' },
      ...(extra.modeByParentChild || {}),
    },
    ...(extra.fixedParentByChild ? { fixedParentByChild: extra.fixedParentByChild } : {}),
  });

  it('两侧都标记才算交集边', () => {
    const inh = pair('#宗门', '#战争');
    expect(isIntersectionEdge(inh, '#宗门', '#战争')).toBe(true);
    expect(isIntersectionEdge(inh, '#战争', '#宗门')).toBe(true);
  });

  it('半条边不算 —— 那是写入中断的残留', () => {
    const half = makeInheritance({
      childrenByParent: { '#宗门': ['#战争'], '#战争': ['#宗门'] },
      modeByParentChild: { '#宗门': { '#战争': 'intersection' } },
    });
    expect(isIntersectionEdge(half, '#宗门', '#战争')).toBe(false);
  });

  it('边不存在于 childrenByParent 时不算', () => {
    const orphan = makeInheritance({
      modeByParentChild: { '#宗门': { '#战争': 'intersection' }, '#战争': { '#宗门': 'intersection' } },
    });
    expect(isIntersectionEdge(orphan, '#宗门', '#战争')).toBe(false);
  });

  it('伙伴列表保持在 childrenByParent 里的顺序', () => {
    const inh = makeInheritance({
      childrenByParent: { '#宗门': ['#内门', '#战争', '#秘境'], '#战争': ['#宗门'], '#秘境': ['#宗门'] },
      modeByParentChild: {
        '#宗门': { '#战争': 'intersection', '#秘境': 'intersection' },
        '#战争': { '#宗门': 'intersection' },
        '#秘境': { '#宗门': 'intersection' },
      },
    });
    expect(getIntersectionPartners(inh, '#宗门')).toEqual(['#战争', '#秘境']);
    expect(getInheritanceOnlyChildren(inh, '#宗门')).toEqual(['#内门']);
  });

  it('继承邻接表不含交集边', () => {
    const inh = pair('#宗门', '#战争');
    expect(getSortedTagInheritanceAdjacency(inh)).toEqual({});
  });

  it('交集伙伴不算父标签', () => {
    const inh = pair('#宗门', '#战争');
    expect(getInheritanceParents(inh, '#战争')).toEqual([]);
    expect(getInheritanceParents(inh, '#宗门')).toEqual([]);
  });

  it('交集边不产生后代关系', () => {
    const inh = pair('#宗门', '#战争');
    expect(getTagDescendants(inh, '#宗门')).toEqual([]);
  });

  it('成对的交集边不会把新继承边误判成环', () => {
    // A↔B 交集。此时 A→C→B 这条继承链完全合法，环检测必须放行
    const inh = pair('#宗门', '#战争');
    expect(wouldCreateTagInheritanceCycle(inh, '#宗门', '#内门')).toBe(false);
    expect(wouldCreateTagInheritanceCycle(inh, '#内门', '#战争')).toBe(false);
  });

  it('真正的继承环仍然拦得住', () => {
    const chain = makeInheritance({ childrenByParent: { '#a': ['#b'], '#b': ['#c'] } });
    expect(wouldCreateTagInheritanceCycle(chain, '#c', '#a')).toBe(true);
  });

  it('互斥判定：任一方向的任意关系都算已关联', () => {
    const inh = pair('#宗门', '#战争');
    expect(areTagsRelated(inh, '#宗门', '#战争')).toBe(true);
    expect(areTagsRelated(inh, '#战争', '#宗门')).toBe(true);
    expect(areTagsRelated(inh, '#宗门', '#无关')).toBe(false);

    const inherit = makeInheritance({ childrenByParent: { '#父': ['#子'] } });
    expect(areTagsRelated(inherit, '#父', '#子')).toBe(true);
    expect(areTagsRelated(inherit, '#子', '#父')).toBe(true);
  });
});
