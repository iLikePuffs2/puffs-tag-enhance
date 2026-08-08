import { describe, expect, it } from "vitest";
import {
  collectDirectedDescendants,
  collectBrowseSignature,
  compareHierarchyParentItems,
  compareTagItemsByCount,
  createHierarchyNavigationHistory,
  buildVisibleHierarchyForest,
  buildTagInheritanceGroupTree,
  getHierarchySearchKeywordError,
  moveHierarchyNavigation,
  normalizeHierarchySearchKeyword,
  parseHierarchySearch,
  parseUnifiedHierarchySearch,
  pushHierarchyNavigation,
  sanitizeAcyclicAdjacency,
  wouldCreateDirectedCycle,
} from "./relation-utils";

// 供标签行签名使用：整棵展开树的内容指纹。
// 与 collectIntersectionSignature 的区别是它扫的是**全部节点**而不只交集节点，
// 因此子标签分组里少一篇笔记也能被察觉 —— 这正是「移除标签不实时刷新」的根因。
describe('标签浏览内容签名', () => {
  const leaf = (tag: string, paths: string[]) => ({ tag, paths, subtreePaths: paths, children: [] });

  it('空树返回空串，不抛错', () => {
    expect(collectBrowseSignature(null)).toBe('');
  });

  it('根标签的原生笔记进签名', () => {
    expect(collectBrowseSignature({ ...leaf('#读书', ['a.md', 'b.md']) }))
      .not.toBe(collectBrowseSignature({ ...leaf('#读书', ['a.md']) }));
  });

  it('子标签分组里少一篇笔记会改变签名（根标签自身不变）', () => {
    const before = {
      tag: '#爱情', paths: [], subtreePaths: ['x.md', 'y.md'],
      children: [leaf('#升温', ['x.md', 'y.md'])],
    };
    const after = {
      tag: '#爱情', paths: [], subtreePaths: ['x.md'],
      children: [leaf('#升温', ['x.md'])],
    };
    expect(collectBrowseSignature(after)).not.toBe(collectBrowseSignature(before));
  });

  it('深层节点的变化同样被覆盖', () => {
    const build = (deepPaths: string[]) => ({
      tag: '#甲', paths: [], subtreePaths: deepPaths,
      children: [{
        tag: '#乙', paths: [], subtreePaths: deepPaths,
        children: [leaf('#丙', deepPaths)],
      }],
    });
    expect(collectBrowseSignature(build(['p.md'])))
      .not.toBe(collectBrowseSignature(build(['p.md', 'q.md'])));
  });

  it('交集组也进签名，且与同名的普通分组可区分', () => {
    const intersection = {
      tag: '#爱情', paths: [], subtreePaths: [],
      children: [{ ...leaf('#升温', ['x.md']), isIntersection: true }],
    };
    const normal = {
      tag: '#爱情', paths: [], subtreePaths: ['x.md'],
      children: [leaf('#升温', ['x.md'])],
    };
    expect(collectBrowseSignature(intersection)).not.toBe(collectBrowseSignature(normal));
  });

  it('内容不变时签名稳定', () => {
    const tree = { tag: '#爱情', paths: ['r.md'], subtreePaths: ['r.md', 'x.md'], children: [leaf('#升温', ['x.md'])] };
    expect(collectBrowseSignature(tree)).toBe(collectBrowseSignature({ ...tree }));
  });

  it('不使用 JSON 序列化', () => {
    const tree = { tag: '#爱情', paths: ['r.md'], subtreePaths: ['r.md'], children: [] };
    const signature = collectBrowseSignature(tree);
    expect(signature).not.toContain('{');
    expect(signature).not.toContain('"');
  });
});

describe('关系 DAG', () => {
  it('递归后代按分支顺序去重并支持多父级', () => {
    const graph = { A: ['B', 'C'], B: ['D'], C: ['D', 'E'] };
    expect(collectDirectedDescendants(graph, 'A')).toEqual(['B', 'D', 'C', 'E']);
    expect(collectDirectedDescendants(graph, 'C')).toEqual(['D', 'E']);
  });

  it('阻止自引用、直接环和间接环', () => {
    const graph = { A: ['B'], B: ['C'] };
    expect(wouldCreateDirectedCycle(graph, 'A', 'A')).toBe(true);
    expect(wouldCreateDirectedCycle(graph, 'C', 'A')).toBe(true);
    expect(wouldCreateDirectedCycle(graph, 'A', 'C')).toBe(false);
  });

  it('清理持久化数据中的环且保留先出现的边顺序', () => {
    expect(sanitizeAcyclicAdjacency({ A: ['B', 'B'], B: ['C'], C: ['A', 'D'] }))
      .toEqual({ A: ['B'], B: ['C'], C: ['D'] });
  });
});

describe('标签继承合并', () => {
  it('排除名单挡下自由分支的路径，固定分支始终放行', () => {
    const tree = buildTagInheritanceGroupTree(
      '#父',
      { '#父': ['#自由', '#固定'] },
      { '#父': [], '#自由': ['保留.md', '排除.md'], '#固定': ['固定.md'] },
      ['排除.md'],
      new Set(['#固定'])
    );
    expect(tree?.children.map((child) => [child.tag, child.paths]))
      .toEqual([['#自由', ['保留.md']], ['#固定', ['固定.md']]]);
  });

  it('按标签关系递归构建分组、保留跨组重复并统计子树去重数量', () => {
    const tree = buildTagInheritanceGroupTree(
      '#帮助',
      { '#帮助': ['#保护', '#陪伴'], '#保护': ['#救援'] },
      {
        '#帮助': ['原生一.md', '共享.md'],
        '#保护': ['保护一.md', '共享.md'],
        '#救援': ['救援一.md', '保护一.md'],
        '#陪伴': ['陪伴一.md'],
      }
    );

    expect(tree?.paths).toEqual(['原生一.md', '共享.md']);
    expect(tree?.children.map((child) => child.tag)).toEqual(['#保护', '#陪伴']);
    expect(tree?.children[0].paths).toEqual(['保护一.md', '共享.md']);
    expect(tree?.children[0].subtreePaths).toEqual(['保护一.md', '共享.md', '救援一.md']);
    expect(tree?.subtreePaths).toEqual(['原生一.md', '共享.md', '保护一.md', '救援一.md', '陪伴一.md']);
  });

  it('根标签原生笔记不受排除影响，后代分组应用根排除并隐藏空组', () => {
    const tree = buildTagInheritanceGroupTree(
      '#父',
      { '#父': ['#子一', '#子二'] },
      {
        '#父': ['共享.md'],
        '#子一': ['共享.md', '排除.md'],
        '#子二': ['排除.md'],
      },
      ['共享.md', '排除.md']
    );

    expect(tree?.paths).toEqual(['共享.md']);
    expect(tree?.children).toEqual([]);
    expect(tree?.subtreePaths).toEqual(['共享.md']);
  });

  it('遇到循环关系时停止当前分支', () => {
    const tree = buildTagInheritanceGroupTree(
      '#甲',
      { '#甲': ['#乙'], '#乙': ['#甲'] },
      { '#甲': ['甲.md'], '#乙': ['乙.md'] }
    );
    expect(tree?.children[0].tag).toBe('#乙');
    expect(tree?.children[0].children).toEqual([]);
  });
});

describe('父子笔记搜索和排序', () => {
  it('解析普通、父*子与*子搜索并拒绝多个分隔符', () => {
    expect(parseHierarchySearch('父笔记')).toMatchObject({ valid: true, parentQuery: '父笔记', childQuery: '' });
    expect(parseHierarchySearch('父笔记 * 子笔记')).toMatchObject({ valid: true, parentQuery: '父笔记', childQuery: '子笔记' });
    expect(parseHierarchySearch('* 子笔记')).toMatchObject({ valid: true, parentQuery: '', childQuery: '子笔记' });
    expect(parseHierarchySearch('父*子*孙')).toMatchObject({ valid: false });
  });

  it('仅用固定等号语法进入父子搜索', () => {
    expect(parseUnifiedHierarchySearch('=')).toEqual({ matched: true, query: '', mode: 'query' });
    expect(parseUnifiedHierarchySearch('=父笔记')).toEqual({ matched: true, query: '父笔记', mode: 'query' });
    expect(parseUnifiedHierarchySearch('==')).toEqual({ matched: true, query: '', mode: 'current-note' });
    expect(parseUnifiedHierarchySearch('==子笔记')).toEqual({ matched: true, query: '*子笔记', mode: 'query' });
    expect(parseUnifiedHierarchySearch('=父笔记*子笔记')).toEqual({ matched: true, query: '父笔记*子笔记', mode: 'query' });
  });

  it('拒绝旧语法、全角等号与格式错误的新语法', () => {
    for (const query of ['父', '父*父笔记', '=*子笔记', '=父*子*孙', '=父*', '==子*孙', '＝']) {
      expect(parseUnifiedHierarchySearch(query)).toEqual({ matched: false, query: '', mode: 'query' });
    }
  });

  it('忽略旧配置并把父子搜索关键字固定为等号', () => {
    expect(normalizeHierarchySearchKeyword('父')).toBe('=');
    expect(normalizeHierarchySearchKeyword('任意自定义值')).toBe('=');
    expect(normalizeHierarchySearchKeyword('')).toBe('=');
    expect(getHierarchySearchKeywordError('任意值', ['#任意值'])).toBe('');
  });

  it('按可见集合构建关系森林并保留多父级与关系顺序', () => {
    const forest = buildVisibleHierarchyForest(
      ['A', 'B', 'C', 'D', 'E'],
      { A: ['C', 'B', 'X'], B: ['D'], C: ['D'], X: ['E'] }
    );
    expect(forest.roots).toEqual(['A', 'E']);
    expect(forest.childrenByParent).toEqual({ A: ['C', 'B'], B: ['D'], C: ['D'] });
    expect(forest.parentsByChild.D).toEqual(['B', 'C']);
  });

  it('先按直接子级数量降序，再按中文名称排序', () => {
    const items = [
      { directCount: 2, name: '赵' },
      { directCount: 3, name: '李' },
      { directCount: 2, name: '阿' },
    ];
    items.sort(compareHierarchyParentItems);
    expect(items.map((item) => item.name)).toEqual(['李', '阿', '赵']);
  });

  it('标签通用排序按可见笔记数量降序并以中文名称兜底', () => {
    const items = [
      { count: 2, name: '赵' },
      { count: 3, name: '李' },
      { count: 2, name: '阿' },
    ];
    items.sort(compareTagItemsByCount);
    expect(items.map((item) => item.name)).toEqual(['李', '阿', '赵']);
  });
});

describe('父子关系定位历史', () => {
  it('支持连续定位及前进后退，并在离开时保存实时状态', () => {
    const history = createHierarchyNavigationHistory();
    pushHierarchyNavigation(history, { query: '爱情', scrollTop: 120 }, { query: '=父*子', scrollTop: 0 });
    pushHierarchyNavigation(history, { query: '=父*手动修改', scrollTop: 260 }, { query: '==孙', scrollTop: 0 });

    expect(moveHierarchyNavigation(history, -1, { query: '==孙', scrollTop: 40 }))
      .toEqual({ query: '=父*手动修改', scrollTop: 260 });
    expect(moveHierarchyNavigation(history, -1, { query: '=父*手动修改', scrollTop: 280 }))
      .toEqual({ query: '爱情', scrollTop: 120 });
    expect(moveHierarchyNavigation(history, 1, { query: '爱情', scrollTop: 130 }))
      .toEqual({ query: '=父*手动修改', scrollTop: 280 });
    expect(moveHierarchyNavigation(history, 1, { query: '=父*手动修改', scrollTop: 300 }))
      .toEqual({ query: '==孙', scrollTop: 40 });
  });

  it('在旧历史项重新定位时清除原前进分支', () => {
    const history = createHierarchyNavigationHistory();
    pushHierarchyNavigation(history, { query: '原搜索', scrollTop: 10 }, { query: '=甲', scrollTop: 0 });
    pushHierarchyNavigation(history, { query: '=甲', scrollTop: 20 }, { query: '=乙', scrollTop: 0 });
    moveHierarchyNavigation(history, -1, { query: '=乙', scrollTop: 30 });
    pushHierarchyNavigation(history, { query: '=甲修改', scrollTop: 40 }, { query: '=丙', scrollTop: 0 });

    expect(history.entries).toEqual([
      { query: '原搜索', scrollTop: 10 },
      { query: '=甲修改', scrollTop: 40 },
      { query: '=丙', scrollTop: 0 },
    ]);
    expect(moveHierarchyNavigation(history, 1, { query: '=丙', scrollTop: 50 })).toBeNull();
    expect(moveHierarchyNavigation(history, -1, { query: '=丙', scrollTop: 60 }))
      .toEqual({ query: '=甲修改', scrollTop: 40 });
  });

  it('历史边界不移动索引，但保留当前实时状态', () => {
    const history = createHierarchyNavigationHistory();
    pushHierarchyNavigation(history, { query: '', scrollTop: 0 }, { query: '=父', scrollTop: 0 });
    expect(moveHierarchyNavigation(history, 1, { query: '=父修改', scrollTop: 88 })).toBeNull();
    expect(history.index).toBe(1);
    expect(history.entries[1]).toEqual({ query: '=父修改', scrollTop: 88 });
  });
});
