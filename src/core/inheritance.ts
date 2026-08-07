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
  excludedPathsByParentChild: Record<string, Record<string, string[]>>;
  /** 每条边的模式：缺省为继承，'intersection' 为交集。 */
  modeByParentChild: Record<string, Record<string, string>>;
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

/**
 * 子标签方向上的相对显示名。
 *
 * 名字是「父标签-子名称」格式时只显示后缀：`#爱情-追求` 挂在 `#爱情` 下显示为「追求」。
 * 与 getFixedChildDisplayName 的区别是**不看有没有锁定为固定子标签** —— 简称只是
 * 「在这个父标签的上下文里」的展示口径，和固定关系是两件事。父标签对不上则显示全名。
 */
export function getRelativeChildDisplayName(parentValue: unknown, childValue: unknown): string {
  const parsed = parseFixedChildTag(childValue);
  return parsed && parsed.parent === normalizeTag(parentValue)
    ? parsed.displayName
    : getTagDisplayName(childValue);
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

/**
 * childrenByParent[tag] 的原始内容 —— 继承子标签与交集伙伴混在一起。
 *
 * 管理弹窗的列表、子标签排序、setInheritanceChildren 都以这个顺序为准。
 * 只想要继承边时用 getInheritanceOnlyChildren。
 */
export function getInheritanceChildren(inheritance: TagInheritance, tagValue: unknown): string[] {
  const tag = normalizeTag(tagValue);
  if (!tag) return [];
  return [...(inheritance.childrenByParent[tag] || [])];
}

// --- 交集关系 ---------------------------------------------------------------

/**
 * 这条边是不是交集边。
 *
 * 交集是对称关系，成对存两条边（A→B 与 B→A，两侧都标 intersection）。
 * 只认「两侧都标了」的情况 —— 半条边是写入中断的残留，由 reconcileIntersectionPairs 清理。
 */
export function isIntersectionEdge(
  inheritance: TagInheritance,
  parentValue: unknown,
  childValue: unknown
): boolean {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  if (!parent || !child || parent === child) return false;
  const marked = (from: string, to: string) =>
    inheritance.modeByParentChild[from]?.[to] === 'intersection' &&
    (inheritance.childrenByParent[from] || []).includes(to);
  return marked(parent, child) && marked(child, parent);
}

/** 该标签的交集伙伴，顺序即它在 childrenByParent[tag] 中的位置。 */
export function getIntersectionPartners(inheritance: TagInheritance, tagValue: unknown): string[] {
  const tag = normalizeTag(tagValue);
  if (!tag) return [];
  return (inheritance.childrenByParent[tag] || [])
    .filter((child) => isIntersectionEdge(inheritance, tag, child));
}

/** 剔除交集边后的纯继承子标签。继承图只由它构成。 */
export function getInheritanceOnlyChildren(inheritance: TagInheritance, tagValue: unknown): string[] {
  const tag = normalizeTag(tagValue);
  if (!tag) return [];
  return (inheritance.childrenByParent[tag] || [])
    .filter((child) => !isIntersectionEdge(inheritance, tag, child));
}

/**
 * 两个标签之间是否已存在任意关系（任一方向的继承边或交集边）。
 *
 * 交集与继承互斥：已有继承边的两个标签不能绑交集，反之亦然。
 */
export function areTagsRelated(inheritance: TagInheritance, a: unknown, b: unknown): boolean {
  const left = normalizeTag(a);
  const right = normalizeTag(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return (inheritance.childrenByParent[left] || []).includes(right) ||
    (inheritance.childrenByParent[right] || []).includes(left);
}

export function hasInheritanceChildren(inheritance: TagInheritance, tagValue: unknown): boolean {
  return getInheritanceChildren(inheritance, tagValue).length > 0;
}

/** 反查继承父标签。交集伙伴不是父标签，不出现在结果里。 */
export function getInheritanceParents(inheritance: TagInheritance, tagValue: unknown): string[] {
  const tag = normalizeTag(tagValue);
  if (!tag) return [];
  return Object.entries(inheritance.childrenByParent)
    .filter(([parent, children]) => (
      Array.isArray(children) &&
      children.includes(tag) &&
      !isIntersectionEdge(inheritance, parent, tag)
    ))
    .map(([parent]) => parent);
}

/**
 * 继承邻接表：只保留有继承子标签的父级，顺序即用户持久化的排序。
 *
 * **交集边不进这张图** —— 它不是继承关系，成员实时算出、也不往下递归。
 * 由此后代收集、继承树递归、环检测全都天然看不到交集边，不需要任何豁免。
 */
export function getSortedTagInheritanceAdjacency(inheritance: TagInheritance): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const parent of Object.keys(inheritance.childrenByParent)) {
    const children = getInheritanceOnlyChildren(inheritance, parent);
    if (children.length) result[parent] = children;
  }
  return result;
}

export function getTagDescendants(inheritance: TagInheritance, tagValue: unknown): string[] {
  const root = normalizeTag(tagValue);
  if (!root) return [];
  return collectDirectedDescendants(getSortedTagInheritanceAdjacency(inheritance), root);
}

/**
 * 新增一条继承边会不会成环。
 *
 * 必须在**继承图**上判定，不能用 childrenByParent 原始表 —— 成对的交集边
 * （A→B 与 B→A）在原始表里天然是个环，会让任何经过这两个标签的新继承边被误判。
 */
export function wouldCreateTagInheritanceCycle(
  inheritance: TagInheritance,
  parentValue: unknown,
  childValue: unknown
): boolean {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  if (!parent || !child) return true;
  return wouldCreateDirectedCycle(getSortedTagInheritanceAdjacency(inheritance), parent, child);
}

// --- 继承模式与名单 ---------------------------------------------------------

/** 每条边独立选择「继承」或「交集」，缺省为继承。 */
export function getTagInheritanceMode(
  inheritance: TagInheritance,
  parentValue: unknown,
  childValue: unknown
): 'all' | 'intersection' {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  if (!parent || !child) return 'all';
  return inheritance.modeByParentChild[parent]?.[child] === 'intersection' ? 'intersection' : 'all';
}

/** 排除名单：这条边上被藏起来的笔记。继承的可见性只由它一张表决定。 */
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
 * 交集边不参与继承链（它的成员是实时算出来的），出现在血缘里一律拦下。
 * 其余情况只查一张排除名单，直接笔记与深层笔记同一口径。
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
  if (getTagInheritanceMode(inheritance, parent, child) === 'intersection') return false;
  return !getExcludedInheritedPaths(inheritance, parent, child).includes(path);
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
