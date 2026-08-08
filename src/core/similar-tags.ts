// 业务层：相似标签组。
//
// 「比赛」「秘境」「试炼」这类标签彼此关联但没有从属关系，因此不适合用继承表达。
// 相似组是**对称、无向、无层级**的：搜索 `比赛，` 会把整组一起搜出来。
//
// 存邻接表而非「组 id」有两个好处：写入只需改动两个键，不必维护组的生命周期；
// 读取时求一次传递闭包，`比赛-秘境` 与 `秘境-试炼` 自然合成三元组 ——
// 这正是用户描述的「给比赛绑定秘境和试炼后，秘境的弹窗里也能看到另外两个」。
//
// 分层约束：纯计算，不引用 DOM、不 import data/ 或 view/（由 architecture.test.ts 守卫）。

import { getTagDisplayName, isNestedTag, normalizeTag } from "./tag-name";

/** tag -> 与它直接相连的标签。始终对称：A 在 B 的数组里，B 也必在 A 的数组里。 */
export type SimilarTagGroups = Record<string, string[]>;

/** 组内顺序：按中文标签名排序，保证弹窗与搜索结果的呈现稳定。 */
function compareTags(left: string, right: string): number {
  return getTagDisplayName(left).localeCompare(getTagDisplayName(right), 'zh-Hans-CN');
}

/**
 * 求 tag 所在的完整相似组（含自身），已去重并排序。
 *
 * 走广度优先的传递闭包，visited 集合同时负责终止成环的情况。
 */
export function resolveSimilarTagGroup(groups: SimilarTagGroups, tagValue: unknown): string[] {
  const tag = normalizeTag(tagValue);
  if (!tag) return [];

  const visited = new Set<string>([tag]);
  const queue = [tag];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of groups[current] || []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }

  return Array.from(visited).sort(compareTags);
}

/** 就地绑定两个标签为相似。返回是否发生过改动。 */
export function linkSimilarTags(
  groups: SimilarTagGroups,
  leftValue: unknown,
  rightValue: unknown
): boolean {
  const left = normalizeTag(leftValue);
  const right = normalizeTag(rightValue);
  if (!left || !right || left === right) return false;
  if (isNestedTag(left) || isNestedTag(right)) return false;

  let changed = false;
  const connect = (from: string, to: string) => {
    const neighbors = groups[from] || [];
    if (neighbors.includes(to)) return;
    groups[from] = neighbors.concat(to).sort(compareTags);
    changed = true;
  };
  connect(left, right);
  connect(right, left);
  return changed;
}

/**
 * 就地解除两个标签的相似关系。返回是否发生过改动。
 *
 * 只断这一条边 —— 同组其它成员之间的关系不受影响。若两者是靠这条边才连通的，
 * 它们会自然分成两个组。
 */
export function unlinkSimilarTags(
  groups: SimilarTagGroups,
  leftValue: unknown,
  rightValue: unknown
): boolean {
  const left = normalizeTag(leftValue);
  const right = normalizeTag(rightValue);
  if (!left || !right) return false;

  let changed = false;
  const disconnect = (from: string, to: string) => {
    const neighbors = groups[from];
    if (!Array.isArray(neighbors) || !neighbors.includes(to)) return;
    const remaining = neighbors.filter((tag) => tag !== to);
    // 不留空数组，免得 data.json 里堆一堆 `"#比赛": []`
    if (remaining.length > 0) groups[from] = remaining;
    else delete groups[from];
    changed = true;
  };
  disconnect(left, right);
  disconnect(right, left);
  return changed;
}

/**
 * 读盘时的归一化：补 # 前缀、去重、丢掉自指与嵌套标签，并把半条边补成对称的两条。
 *
 * 对称补齐很重要：只剩单向边时，从另一端打开弹窗会看不到对方，
 * 用户会以为绑定失败又绑一次。
 */
export function normalizeSimilarTagSettings(value: unknown): SimilarTagGroups {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const result: SimilarTagGroups = {};
  for (const [rawTag, rawNeighbors] of Object.entries(value as Record<string, unknown>)) {
    const tag = normalizeTag(rawTag);
    if (!tag || isNestedTag(tag) || !Array.isArray(rawNeighbors)) continue;

    for (const rawNeighbor of rawNeighbors) {
      // linkSimilarTags 自带去重、自指与嵌套检查，且天然写成对称的两条边
      linkSimilarTags(result, tag, rawNeighbor);
    }
  }
  return result;
}
