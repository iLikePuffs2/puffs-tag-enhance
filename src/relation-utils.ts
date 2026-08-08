export function collectDirectedDescendants(adjacency: Record<string, string[]>, root: string): string[] {
  const output: string[] = [];
  const seen = new Set<string>([root]);
  const visit = (node: string) => {
    for (const child of adjacency[node] || []) {
      if (!child || seen.has(child)) continue;
      seen.add(child);
      output.push(child);
      visit(child);
    }
  };
  visit(root);
  return output;
}

export function wouldCreateDirectedCycle(
  adjacency: Record<string, string[]>,
  parent: string,
  child: string
): boolean {
  return !parent || !child || parent === child || collectDirectedDescendants(adjacency, child).includes(parent);
}

/**
 * 消除持久化数据里的环，保留先出现的边。
 *
 * isExemptEdge 命中的边不参与环检测、原样保留 —— 标签交集是对称关系，
 * 成对存的两条边（A→B 与 B→A）在这张表里天然构成环，但它们不是继承边、
 * 不会造成递归，必须豁免，否则每次对账都会削掉其中一条。
 */
export function sanitizeAcyclicAdjacency(
  value: Record<string, string[]>,
  isExemptEdge?: (parent: string, child: string) => boolean
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const cycleGraph: Record<string, string[]> = {};
  const keep = (parent: string, child: string) => {
    if (!result[parent]) result[parent] = [];
    if (!result[parent].includes(child)) result[parent].push(child);
  };
  for (const [parent, children] of Object.entries(value || {})) {
    for (const child of Array.isArray(children) ? children : []) {
      if (!child) continue;
      if (isExemptEdge?.(parent, child)) {
        keep(parent, child);
        continue;
      }
      if (wouldCreateDirectedCycle(cycleGraph, parent, child)) continue;
      if (!cycleGraph[parent]) cycleGraph[parent] = [];
      if (!cycleGraph[parent].includes(child)) cycleGraph[parent].push(child);
      keep(parent, child);
    }
  }
  return result;
}

export function parseHierarchySearch(value: string): {
  valid: boolean;
  parentQuery: string;
  childQuery: string;
  hasChildQuery: boolean;
} {
  const text = String(value || '').trim();
  const delimiter = text.indexOf('*');
  if (delimiter >= 0 && delimiter !== text.lastIndexOf('*')) {
    return { valid: false, parentQuery: '', childQuery: '', hasChildQuery: false };
  }
  return {
    valid: true,
    parentQuery: (delimiter < 0 ? text : text.slice(0, delimiter)).trim().toLowerCase(),
    childQuery: (delimiter < 0 ? '' : text.slice(delimiter + 1)).trim().toLowerCase(),
    hasChildQuery: delimiter >= 0,
  };
}

export const DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD = '=';

export function normalizeHierarchySearchKeyword(
  _value: unknown,
  _fallback = DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD
): string {
  return DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD;
}

export function getHierarchySearchKeywordError(_value: unknown, _tagValues: Iterable<string> = []): string {
  return '';
}

export function parseUnifiedHierarchySearch(value: unknown, _keywordValue?: unknown): {
  matched: boolean;
  query: string;
  mode: 'query' | 'current-note';
} {
  const text = String(value ?? '').trim();
  if (text === '=') return { matched: true, query: '', mode: 'query' };
  if (text === '==') return { matched: true, query: '', mode: 'current-note' };
  if (!text.startsWith('=')) return { matched: false, query: '', mode: 'query' };

  if (text.startsWith('==')) {
    const childQuery = text.slice(2).trim();
    if (childQuery.includes('=') || childQuery.includes('*')) {
      return { matched: false, query: '', mode: 'query' };
    }
    return { matched: true, query: `*${childQuery}`, mode: 'query' };
  }

  const query = text.slice(1).trim();
  const delimiter = query.indexOf('*');
  if (
    !query ||
    query.includes('=') ||
    delimiter === 0 ||
    (delimiter >= 0 && (delimiter !== query.lastIndexOf('*') || !query.slice(delimiter + 1).trim()))
  ) {
    return { matched: false, query: '', mode: 'query' };
  }
  return { matched: true, query, mode: 'query' };
}

export type VisibleHierarchyForest = {
  roots: string[];
  childrenByParent: Record<string, string[]>;
  parentsByChild: Record<string, string[]>;
};

export function buildVisibleHierarchyForest(
  orderedPaths: string[],
  adjacency: Record<string, string[]>
): VisibleHierarchyForest {
  const paths = Array.from(new Set((orderedPaths || []).filter(Boolean)));
  const visible = new Set(paths);
  const childrenByParent: Record<string, string[]> = {};
  const parentsByChild: Record<string, string[]> = {};
  for (const parent of paths) {
    const children = Array.from(new Set((adjacency[parent] || []).filter((child) => visible.has(child))));
    if (!children.length) continue;
    childrenByParent[parent] = children;
    for (const child of children) {
      if (!parentsByChild[child]) parentsByChild[child] = [];
      parentsByChild[child].push(parent);
    }
  }
  return {
    roots: paths.filter((path) => !parentsByChild[path]?.length),
    childrenByParent,
    parentsByChild,
  };
}

export type TagInheritanceGroupNode = {
  tag: string;
  paths: string[];
  children: TagInheritanceGroupNode[];
  subtreePaths: string[];
  /** 交集分组根；children 是在当前标签上下文中过滤后的伙伴继承子树。 */
  isIntersection?: boolean;
  /**
   * 交集分组里的笔记归属**持有这条交集边的那个标签**（即该交集节点的父节点），
   * 而不是当前展开的根标签 —— 它们本就是那个标签的原生笔记。渲染时按这个标签走，
   * 这样 `#爱情 > 升温 > 欣赏` 里的卡片与顶层展开 `#升温` 时共用同一份排序与排除名单。
   */
  noteTag?: string;
};

/** 某个标签上要额外挂出的交集分组。 */
export type IntersectionGroupInput = { tag: string; paths: string[] };

/**
 * 按继承关系递归分组。
 *
 * 交集组在**每一层**生效，不只是 root：任何节点只要自己有交集伙伴，就把交集笔记
 * 从它的「原生」组里扣掉、另挂成分组，并在当前标签的直属笔记上下文中投影伙伴的
 * 纯继承子树。伙伴后代没有同时打当前标签的笔记会被裁掉，伙伴的其他交集不会扩散。
 * 交集组与继承子分组按
 * getChildOrder(tag) 与该节点的继承子分组混合排序 —— 两者本就同在
 * childrenByParent[tag] 数组里，顺序由管理弹窗内的排序决定。
 */
export function buildTagInheritanceGroupTree(
  rootTag: string,
  childrenByParent: Record<string, string[]>,
  orderedPathsByTag: Record<string, string[]>,
  excludedPaths: string[] = [],
  fixedTags: Set<string> = new Set(),
  isPathVisible?: (tag: string, path: string, lineage: string[]) => boolean,
  getIntersectionGroups?: (tag: string) => IntersectionGroupInput[],
  getChildOrder?: (tag: string) => string[],
  getOrderedPaths?: (tag: string) => string[]
): TagInheritanceGroupNode | null {
  if (!rootTag) return null;
  const excluded = new Set(excludedPaths || []);
  const pathsForTag = (tag: string) => orderedPathsByTag[tag] || getOrderedPaths?.(tag) || [];

  /** 交集伙伴只沿继承边递归，并在最初持有交集边的标签路径集内过滤。 */
  const visitIntersectionProjection = (
    tag: string,
    contextPaths: Set<string>,
    branch: Set<string>,
    lineage: string[],
    rootPaths?: string[]
  ): TagInheritanceGroupNode | null => {
    if (!tag || branch.has(tag)) return null;
    const nextBranch = new Set(branch);
    nextBranch.add(tag);
    const isProjectionRoot = rootPaths !== undefined;
    const paths = Array.from(new Set(rootPaths || pathsForTag(tag)))
      .filter((path) => path && contextPaths.has(path) && (
        isProjectionRoot ||
        (isPathVisible
          ? isPathVisible(tag, path, lineage)
          : (fixedTags.has(tag) || !excluded.has(path)))
      ));
    const children = (childrenByParent[tag] || [])
      .map((child) => visitIntersectionProjection(
        child,
        contextPaths,
        nextBranch,
        [...lineage, child]
      ))
      .filter((child): child is TagInheritanceGroupNode => !!child && child.subtreePaths.length > 0);
    const subtreePaths = Array.from(new Set([
      ...paths,
      ...children.flatMap((child) => child.subtreePaths),
    ]));
    if (!subtreePaths.length) return null;
    return { tag, paths, children, subtreePaths };
  };

  const visit = (tag: string, branch: Set<string>, lineage: string[], isRoot = false): TagInheritanceGroupNode | null => {
    if (!tag || branch.has(tag)) return null;
    const nextBranch = new Set(branch);
    nextBranch.add(tag);
    let paths = Array.from(new Set(pathsForTag(tag)))
      .filter((path) => path && (
        isRoot ||
        (isPathVisible
          ? isPathVisible(tag, path, lineage)
          : (fixedTags.has(tag) || !excluded.has(path)))
      ));
    let children = (childrenByParent[tag] || [])
      .map((child) => visit(child, nextBranch, [...lineage, child], false))
      .filter((child): child is TagInheritanceGroupNode => !!child && child.subtreePaths.length > 0);

    const groups = (getIntersectionGroups?.(tag) || [])
      .filter((group) => group.tag);
    if (groups.length) {
      // 每个交集伙伴都从相同的原生路径集投影；不能在处理第一个伙伴后复用已扣减的 paths。
      const contextPaths = new Set(paths);
      // 交集笔记从本节点的「原生」组挪进各自的交集组
      const intersectionPaths = new Set(groups.flatMap((group) => group.paths));
      paths = paths.filter((path) => !intersectionPaths.has(path));
      const intersectionNodes: TagInheritanceGroupNode[] = groups
        .flatMap((group): TagInheritanceGroupNode[] => {
          const projected = visitIntersectionProjection(
            group.tag,
            contextPaths,
            new Set(),
            [group.tag],
            [...(group.paths || [])]
          );
          return projected
            ? [{ ...projected, isIntersection: true, noteTag: tag }]
            : [];
        });
      // 与继承子分组混排：都按各自标签在本节点子标签顺序里的位置排，未收录的排在最后
      const childOrder = getChildOrder?.(tag) || [];
      const orderOf = (node: TagInheritanceGroupNode) => {
        const index = childOrder.indexOf(node.tag);
        return index < 0 ? Number.MAX_SAFE_INTEGER : index;
      };
      children = [...children, ...intersectionNodes]
        .map((node, index) => ({ node, index }))
        .sort((a, b) => orderOf(a.node) - orderOf(b.node) || a.index - b.index)
        .map((entry) => entry.node);
    }

    // paths 可能被扣掉了交集路径，subtreePaths 从交集节点那边并回来
    const subtreePaths = Array.from(new Set([
      ...paths,
      ...children.flatMap((child) => child.subtreePaths),
    ]));
    return { tag, paths, children, subtreePaths };
  };

  return visit(rootTag, new Set(), [rootTag], true);
}

/**
 * 全树交集组的内容签名，供增量重绘判定「有没有变」。
 *
 * 交集组的成员取决于**伙伴标签**的笔记集合，而那不影响本标签的 files 与计数 ——
 * 不进签名的话，「某篇笔记新加了伙伴标签」时旧 DOM 会被判无变化而原样复用。
 * 必须覆盖任意深度的节点：深层节点（如 #爱情 > 升温）的交集组同样会变。
 */
export function collectIntersectionSignature(tree: TagInheritanceGroupNode | null): string {
  const parts: string[] = [];
  const visit = (node: TagInheritanceGroupNode, lineage: string[]) => {
    for (const child of node.children) {
      const childLineage = [...lineage, child.tag];
      if (child.isIntersection) parts.push(`${childLineage.join('>')}:${child.subtreePaths.join('|')}`);
      // 交集根现在可以携带纯继承投影，后代变化也必须进入增量重绘签名。
      visit(child, childLineage);
    }
  };
  if (tree) visit(tree, [tree.tag]);
  return parts.join(';');
}

/**
 * 整棵展开树的内容指纹，供标签行签名判断能否复用旧 DOM。
 *
 * 与 collectIntersectionSignature 只记交集节点不同，这里**每个节点都记**。
 * 起因是「移除笔记标签后侧边栏不实时刷新」：标签行签名在折叠态刻意丢弃路径列表
 * （性能优化），展开态也只带根标签的 files，于是两种变化会被漏掉 ——
 * 一是笔记总数不变但成员换了人，二是变化发生在子标签分组内部而父标签的计数没动。
 *
 * 本函数由 computeTagBrowseData 调用一次、结果随 browseData 缓存，因此即使折叠态
 * 也能参与签名而不重新付出拼接代价。刻意不用 JSON.stringify —— 它在 150 标签 ×
 * 每行上千字符的规模下本身就是开销来源（见 view/reconcile.ts 的说明）。
 */
export function collectBrowseSignature(tree: TagInheritanceGroupNode | null): string {
  if (!tree) return '';
  const parts: string[] = [];
  const visit = (node: TagInheritanceGroupNode, lineage: string[]) => {
    const path = lineage.join('>');
    // 交集组与同名普通分组的成员算法不同，前缀区分开，避免二者互相冒充
    parts.push(`${node.isIntersection ? '&' : ''}${path}:${node.paths.join('|')}`);
    for (const child of node.children) visit(child, [...lineage, child.tag]);
  };
  visit(tree, [tree.tag]);
  return parts.join(';');
}

export function compareHierarchyParentItems(
  left: { directCount: number; name: string },
  right: { directCount: number; name: string }
): number {
  return compareTagItemsByCount(
    { count: left.directCount, name: left.name },
    { count: right.directCount, name: right.name }
  );
}

export function compareTagItemsByCount(
  left: { count: number; name: string },
  right: { count: number; name: string }
): number {
  return right.count - left.count || left.name.localeCompare(right.name, 'zh-Hans-CN');
}

export type HierarchyNavigationSnapshot = {
  query: string;
  scrollTop: number;
};

export type HierarchyNavigationHistory = {
  entries: HierarchyNavigationSnapshot[];
  index: number;
  restoreRequestId: number;
};

export function createHierarchyNavigationHistory(): HierarchyNavigationHistory {
  return { entries: [], index: -1, restoreRequestId: 0 };
}

const copyHierarchyNavigationSnapshot = (
  snapshot: HierarchyNavigationSnapshot
): HierarchyNavigationSnapshot => ({
  query: String(snapshot?.query ?? ''),
  scrollTop: Number.isFinite(snapshot?.scrollTop) ? Math.max(0, snapshot.scrollTop) : 0,
});

export function pushHierarchyNavigation(
  history: HierarchyNavigationHistory,
  current: HierarchyNavigationSnapshot,
  target: HierarchyNavigationSnapshot
): HierarchyNavigationSnapshot {
  const currentSnapshot = copyHierarchyNavigationSnapshot(current);
  const targetSnapshot = copyHierarchyNavigationSnapshot(target);
  if (history.index < 0 || history.index >= history.entries.length) {
    history.entries = [currentSnapshot];
    history.index = 0;
  } else {
    history.entries[history.index] = currentSnapshot;
    history.entries = history.entries.slice(0, history.index + 1);
  }
  history.entries.push(targetSnapshot);
  history.index = history.entries.length - 1;
  history.restoreRequestId += 1;
  return { ...targetSnapshot };
}

export function moveHierarchyNavigation(
  history: HierarchyNavigationHistory,
  direction: -1 | 1,
  current: HierarchyNavigationSnapshot
): HierarchyNavigationSnapshot | null {
  if (history.index < 0 || history.index >= history.entries.length) return null;
  history.entries[history.index] = copyHierarchyNavigationSnapshot(current);
  const nextIndex = history.index + direction;
  if (nextIndex < 0 || nextIndex >= history.entries.length) return null;
  history.index = nextIndex;
  history.restoreRequestId += 1;
  return { ...history.entries[nextIndex] };
}
