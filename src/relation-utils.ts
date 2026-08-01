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

export function mergeInheritedPaths(
  exactPaths: string[],
  orderedBranches: Array<{ source: string; paths: string[] }>,
  excludedPaths: string[] = []
): { inheritedPaths: string[]; sourcesByPath: Map<string, string[]> } {
  const seen = new Set(exactPaths);
  const excluded = new Set(excludedPaths);
  const inheritedPaths: string[] = [];
  const sourcesByPath = new Map<string, string[]>();
  for (const branch of orderedBranches) {
    for (const path of branch.paths || []) {
      const sources = sourcesByPath.get(path) || [];
      if (!sources.includes(branch.source)) sources.push(branch.source);
      sourcesByPath.set(path, sources);
      if (!path || seen.has(path) || excluded.has(path)) continue;
      seen.add(path);
      inheritedPaths.push(path);
    }
  }
  return { inheritedPaths, sourcesByPath };
}

export function compareHierarchyParentItems(
  left: { directCount: number; name: string },
  right: { directCount: number; name: string }
): number {
  return right.directCount - left.directCount || left.name.localeCompare(right.name, 'zh-Hans-CN');
}
