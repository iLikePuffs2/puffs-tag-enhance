import { describe, expect, it } from "vitest";
import {
  collectDirectedDescendants,
  compareHierarchyParentItems,
  mergeInheritedPaths,
  parseHierarchySearch,
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
});

describe('父子笔记搜索和排序', () => {
  it('解析普通、父*子与*子搜索并拒绝多个分隔符', () => {
    expect(parseHierarchySearch('父笔记')).toMatchObject({ valid: true, parentQuery: '父笔记', childQuery: '' });
    expect(parseHierarchySearch('父笔记 * 子笔记')).toMatchObject({ valid: true, parentQuery: '父笔记', childQuery: '子笔记' });
    expect(parseHierarchySearch('* 子笔记')).toMatchObject({ valid: true, parentQuery: '', childQuery: '子笔记' });
    expect(parseHierarchySearch('父*子*孙')).toMatchObject({ valid: false });
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
