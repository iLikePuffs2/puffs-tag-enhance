import { describe, expect, it } from "vitest";
import {
  collectDirectedDescendants,
  compareHierarchyParentItems,
  buildVisibleHierarchyForest,
  buildTagInheritanceGroupTree,
  getHierarchySearchKeywordError,
  mergeInheritedPaths,
  normalizeHierarchySearchKeyword,
  parseHierarchySearch,
  parseUnifiedHierarchySearch,
  sanitizeAcyclicAdjacency,
  wouldCreateDirectedCycle,
} from "./relation-utils";

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
  it('父精确笔记优先、子分支有序、路径去重后应用排除', () => {
    const result = mergeInheritedPaths(
      ['exact.md', 'shared.md'],
      [
        { source: '#子一', paths: ['one.md', 'shared.md', 'excluded.md'] },
        { source: '#子二', paths: ['two.md', 'one.md'] },
      ],
      ['excluded.md']
    );
    expect(result.inheritedPaths).toEqual(['one.md', 'two.md']);
    expect(result.sourcesByPath.get('one.md')).toEqual(['#子一', '#子二']);
    expect(result.sourcesByPath.get('shared.md')).toEqual(['#子一']);
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
});
