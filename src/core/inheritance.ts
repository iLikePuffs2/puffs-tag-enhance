// 业务层：父子标签的继承规则。
//
// 这些判定原先是 relations.ts 上的方法，靠 this.getTagInheritanceSettings() 取数据，
// 因此测试必须先 Object.create(prototype) 再 mock 一堆依赖。这里改成接收
// inheritance 数据作为第一个参数的纯函数，可以直接调用、直接断言。
// relations.ts 保留同名方法作为薄委托，所有既有调用点无需改动。
//
// 分层约束：纯计算，不引用 DOM、不 import data/ 或 view/（由 architecture.test.ts 守卫）。

import { collectDirectedDescendants, wouldCreateDirectedCycle } from "../relation-utils";
import { getTagDisplayName, isNestedTag, normalizeTag } from "./tag-name";

/** settings.relations.tagInheritance 的形状。 */
export type TagInheritance = {
  childrenByParent: Record<string, string[]>;
  enabledParents: string[];
  excludedPathsByParentChild: Record<string, Record<string, string[]>>;
  modeByParentChild: Record<string, Record<string, string>>;
  includedPathsByParentChild: Record<string, Record<string, string[]>>;
  fixedParentByChild: Record<string, string>;
};

/** 继承路径上的一条边。fixed 表示这条边是固定子标签关系。 */
export type InheritanceEdge = { parent: string; child: string; fixed?: boolean };

// --- 固定子标签 -------------------------------------------------------------

/**
 * 解析「父标签-子名称」格式。
 *
 * 只有恰好一个连字符、两侧都非空的扁平标签才算数：`#爱情-升温` → 父 `#爱情`、简称 `升温`。
 */
export function parseFixedChildTag(tagValue: unknown): { parent: string | null; displayName: string } | null {
  const tag = normalizeTag(tagValue);
  if (!tag || isNestedTag(tag)) return null;
  const parts = getTagDisplayName(tag).split('-');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { parent: normalizeTag(parts[0]), displayName: parts[1] };
}

/** 固定子标签在界面上用后缀简称展示。 */
export function getFixedChildDisplayName(tagValue: unknown): string {
  return parseFixedChildTag(tagValue)?.displayName || getTagDisplayName(tagValue);
}

export function getFixedParent(inheritance: TagInheritance, childValue: unknown): string | null {
  const child = normalizeTag(childValue);
  if (!child) return null;
  return normalizeTag(inheritance.fixedParentByChild[child]);
}

export function isFixedChild(inheritance: TagInheritance, tagValue: unknown): boolean {
  return !!getFixedParent(inheritance, tagValue);
}

export function isFixedTagEdge(inheritance: TagInheritance, parentValue: unknown, childValue: unknown): boolean {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  return !!parent && !!child && getFixedParent(inheritance, child) === parent;
}

/** 只有「名字符合格式」且「恰好一个父级」的关系才能锁定为固定。 */
export function isFixedTagRelationEligible(
  inheritance: TagInheritance,
  parentValue: unknown,
  childValue: unknown
): boolean {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  const parsed = parseFixedChildTag(child);
  if (!parent || !child || !parsed || parsed.parent !== parent) return false;
  const parents = getInheritanceParents(inheritance, child);
  return parents.length === 1 && parents[0] === parent;
}

/** 沿固定关系一路上溯到顶层父标签；带 visited 防御数据里可能的环。 */
export function getTopLevelFixedParent(inheritance: TagInheritance, tagValue: unknown): string | null {
  let tag = normalizeTag(tagValue);
  if (!tag) return null;
  const visited = new Set<string>();
  let parent = getFixedParent(inheritance, tag);
  while (parent && !visited.has(tag)) {
    visited.add(tag);
    tag = parent;
    parent = getFixedParent(inheritance, tag);
  }
  return tag;
}

// --- 关系查询 ---------------------------------------------------------------

export function getInheritanceChildren(inheritance: TagInheritance, tagValue: unknown): string[] {
  const tag = normalizeTag(tagValue);
  if (!tag) return [];
  return [...(inheritance.childrenByParent[tag] || [])];
}

export function hasInheritanceChildren(inheritance: TagInheritance, tagValue: unknown): boolean {
  return getInheritanceChildren(inheritance, tagValue).length > 0;
}

export function getInheritanceParents(inheritance: TagInheritance, tagValue: unknown): string[] {
  const tag = normalizeTag(tagValue);
  if (!tag) return [];
  return Object.entries(inheritance.childrenByParent)
    .filter(([, children]) => Array.isArray(children) && children.includes(tag))
    .map(([parent]) => parent);
}

/** 父标签是否已开启「显示后代标签笔记」。 */
export function isTagInheritanceEnabled(inheritance: TagInheritance, tagValue: unknown): boolean {
  const tag = normalizeTag(tagValue);
  return !!tag && inheritance.enabledParents.includes(tag);
}

/** 邻接表：只保留有子标签的父级，子标签顺序即用户持久化的排序。 */
export function getSortedTagInheritanceAdjacency(inheritance: TagInheritance): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const parent of Object.keys(inheritance.childrenByParent)) {
    const children = getInheritanceChildren(inheritance, parent);
    if (children.length) result[parent] = children;
  }
  return result;
}

/** 只含固定关系的邻接表。固定路径上的笔记始终可见，需要单独成图。 */
export function getFixedTagInheritanceAdjacency(inheritance: TagInheritance): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [parent, children] of Object.entries(inheritance.childrenByParent)) {
    const fixedChildren = children.filter((child) => isFixedTagEdge(inheritance, parent, child));
    if (fixedChildren.length) result[parent] = fixedChildren;
  }
  return result;
}

export function getTagDescendants(inheritance: TagInheritance, tagValue: unknown): string[] {
  const root = normalizeTag(tagValue);
  if (!root) return [];
  return collectDirectedDescendants(getSortedTagInheritanceAdjacency(inheritance), root);
}

export function wouldCreateTagInheritanceCycle(
  inheritance: TagInheritance,
  parentValue: unknown,
  childValue: unknown
): boolean {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  if (!parent || !child) return true;
  return wouldCreateDirectedCycle(inheritance.childrenByParent, parent, child);
}

// --- 继承模式与名单 ---------------------------------------------------------

/** 每条边独立选择「全部继承」或「选择继承」，缺省为全部继承。 */
export function getTagInheritanceMode(
  inheritance: TagInheritance,
  parentValue: unknown,
  childValue: unknown
): 'all' | 'selected' {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  if (!parent || !child) return 'all';
  return inheritance.modeByParentChild[parent]?.[child] === 'selected' ? 'selected' : 'all';
}

/** 白名单，仅「选择继承」模式下生效。 */
export function getIncludedInheritedPaths(
  inheritance: TagInheritance,
  parentValue: unknown,
  childValue: unknown
): string[] {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  if (!parent || !child) return [];
  return [...(inheritance.includedPathsByParentChild[parent]?.[child] || [])];
}

/** 黑名单，仅「全部继承」模式下生效。 */
export function getExcludedInheritedPaths(
  inheritance: TagInheritance,
  parentValue: unknown,
  childValue: unknown
): string[] {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  if (!parent || !child) return [];
  return [...(inheritance.excludedPathsByParentChild[parent]?.[child] || [])];
}

/**
 * 单条边上某篇笔记是否可见。
 *
 * 固定边直接放行 —— 固定关系只豁免自身，不影响路径上的其他边。
 */
export function isInheritanceEdgePathVisible(
  inheritance: TagInheritance,
  parentValue: unknown,
  childValue: unknown,
  path: string
): boolean {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  if (!parent || !child || !path) return false;
  if (isFixedTagEdge(inheritance, parent, child)) return true;
  return getTagInheritanceMode(inheritance, parent, child) === 'selected'
    ? getIncludedInheritedPaths(inheritance, parent, child).includes(path)
    : !getExcludedInheritedPaths(inheritance, parent, child).includes(path);
}

/**
 * 整条继承路径是否放行：必须通过路径上的每一条边。
 *
 * ignoredEdge 用于「假设某条边放行」的推演，供恢复笔记时计算候选。
 */
export function isInheritancePathVisible(
  inheritance: TagInheritance,
  edges: InheritanceEdge[] | null | undefined,
  path: string,
  ignoredEdge: InheritanceEdge | null = null
): boolean {
  return (edges || []).every((edge) => (
    ignoredEdge && edge.parent === ignoredEdge.parent && edge.child === ignoredEdge.child
      ? true
      : isInheritanceEdgePathVisible(inheritance, edge.parent, edge.child, path)
  ));
}

/** 把一条标签血缘（[祖先, …, 后代]）展开成逐段的边。 */
export function createInheritanceEdgesFromLineage(
  inheritance: TagInheritance,
  lineage: string[] | null | undefined
): InheritanceEdge[] {
  const edges: InheritanceEdge[] = [];
  for (let index = 1; index < (lineage || []).length; index += 1) {
    const parent = lineage![index - 1];
    const child = lineage![index];
    edges.push({ parent, child, fixed: isFixedTagEdge(inheritance, parent, child) });
  }
  return edges;
}

// --- 名单写入的通用工具 -----------------------------------------------------

/**
 * 写入 parent -> child -> value 的两级结构；值为空时连同空壳一起删除，
 * 避免 data.json 里堆积 `{"#父": {}}` 这类空对象。
 */
export function setParentChildValue<T>(
  target: Record<string, Record<string, T>>,
  parent: string,
  child: string,
  value: T | undefined
): void {
  if (value === undefined || (Array.isArray(value) && !value.length)) {
    if (target[parent]) {
      delete target[parent][child];
      if (!Object.keys(target[parent]).length) delete target[parent];
    }
    return;
  }
  if (!target[parent]) target[parent] = {};
  target[parent][child] = value;
}

/** 深拷贝两级名单，供变更前留存回滚快照。 */
export function cloneParentChildSettings<T>(
  source: Record<string, Record<string, T>> | null | undefined
): Record<string, Record<string, T>> {
  return Object.fromEntries(Object.entries(source || {}).map(([parent, children]) => [
    parent,
    Object.fromEntries(Object.entries(children || {}).map(([child, value]) => [
      child,
      Array.isArray(value) ? [...value] : value,
    ])),
  ])) as Record<string, Record<string, T>>;
}
