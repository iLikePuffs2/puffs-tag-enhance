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

export function sanitizeAcyclicAdjacency(value: Record<string, string[]>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [parent, children] of Object.entries(value || {})) {
    for (const child of Array.isArray(children) ? children : []) {
      if (!child || wouldCreateDirectedCycle(result, parent, child)) continue;
      if (!result[parent]) result[parent] = [];
      if (!result[parent].includes(child)) result[parent].push(child);
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

export function mergeInheritedPaths(
  exactPaths: string[],
  orderedBranches: Array<{ source: string; paths: string[]; fixed?: boolean }>,
  excludedPaths: string[] = [],
  includedPaths: string[] | null = null
): { inheritedPaths: string[]; sourcesByPath: Map<string, string[]> } {
  const seen = new Set(exactPaths);
  const excluded = new Set(excludedPaths);
  const included = includedPaths === null ? null : new Set(includedPaths);
  const inheritedPaths: string[] = [];
  const sourcesByPath = new Map<string, string[]>();
  for (const branch of orderedBranches) {
    for (const path of branch.paths || []) {
      const sources = sourcesByPath.get(path) || [];
      if (!sources.includes(branch.source)) sources.push(branch.source);
      sourcesByPath.set(path, sources);
      if (
        !path ||
        seen.has(path) ||
        (!branch.fixed && (included ? !included.has(path) : excluded.has(path)))
      ) continue;
      seen.add(path);
      inheritedPaths.push(path);
    }
  }
  return { inheritedPaths, sourcesByPath };
}

export type TagInheritanceGroupNode = {
  tag: string;
  paths: string[];
  children: TagInheritanceGroupNode[];
  subtreePaths: string[];
};

export function buildTagInheritanceGroupTree(
  rootTag: string,
  childrenByParent: Record<string, string[]>,
  orderedPathsByTag: Record<string, string[]>,
  excludedPaths: string[] = [],
  fixedTags: Set<string> = new Set(),
  includedPaths: string[] | null = null,
  isPathVisible?: (tag: string, path: string, lineage: string[]) => boolean
): TagInheritanceGroupNode | null {
  if (!rootTag) return null;
  const excluded = new Set(excludedPaths || []);
  const included = includedPaths === null ? null : new Set(includedPaths);
  const visit = (tag: string, branch: Set<string>, lineage: string[], isRoot = false): TagInheritanceGroupNode | null => {
    if (!tag || branch.has(tag)) return null;
    const nextBranch = new Set(branch);
    nextBranch.add(tag);
    const paths = Array.from(new Set(orderedPathsByTag[tag] || []))
      .filter((path) => path && (
        isRoot ||
        (isPathVisible
          ? isPathVisible(tag, path, lineage)
          : (fixedTags.has(tag) || (included ? included.has(path) : !excluded.has(path))))
      ));
    const children = (childrenByParent[tag] || [])
      .map((child) => visit(child, nextBranch, [...lineage, child], false))
      .filter((child): child is TagInheritanceGroupNode => !!child && child.subtreePaths.length > 0);
    const subtreePaths = Array.from(new Set([
      ...paths,
      ...children.flatMap((child) => child.subtreePaths),
    ]));
    return { tag, paths, children, subtreePaths };
  };
  return visit(rootTag, new Set(), [rootTag], true);
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
