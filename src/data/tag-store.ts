// 数据层：标签浏览数据缓存与元数据刷新调度。
//
// 分层约束：本文件不得引用 DOM，也不得 import view/ 下的任何模块（由 architecture.test.ts 守卫）。
//
// 解决三个实测到的性能问题：
// 1. getTagBrowseData 无缓存，一次渲染被调 450–600 次（150 标签 × 3–4 遍）
// 2. 元数据变化无防抖，每次 changed 都全量遍历 2191 个文件重建索引
// 3. 顺序对账没有兜底，缓存未就绪时会误判笔记已删除

/** 一次渲染批次内复用标签浏览数据。失效由调用方在索引重建、设置保存、渲染入口显式触发。 */
export class TagBrowseCache {
  private entries = new Map<string, unknown>();
  private hitCount = 0;
  private missCount = 0;

  /** 命中则直接返回，未命中才调用 compute 并记入缓存。 */
  resolve<T>(tag: string, compute: () => T): T {
    if (this.entries.has(tag)) {
      this.hitCount += 1;
      return this.entries.get(tag) as T;
    }
    this.missCount += 1;
    const value = compute();
    this.entries.set(tag, value);
    return value;
  }

  invalidate(): void {
    this.entries.clear();
  }

  /** 单个标签失效，用于关系仅影响局部时的精确失效。 */
  invalidateTag(tag: string): void {
    this.entries.delete(tag);
  }

  get stats(): { hits: number; misses: number; size: number } {
    return { hits: this.hitCount, misses: this.missCount, size: this.entries.size };
  }

  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
  }
}

/**
 * 把密集的元数据变更合并成一次刷新，并累积期间变更过的路径。
 *
 * 原实现每收到一个 metadataCache 的 changed 事件就全量重建索引；批量保存、
 * 仓库同步时会连续触发数十次。这里按时间窗口合并，窗口内的路径一并交给对账。
 */
export class MetadataRefreshScheduler {
  private timer: number | null = null;
  private pendingPaths = new Set<string>();

  constructor(
    private readonly run: (changedPaths: string[]) => void,
    private readonly delayMs = 150
  ) {}

  schedule(changedPath?: string | null): void {
    if (changedPath) this.pendingPaths.add(changedPath);
    if (this.timer !== null) return;

    this.timer = globalThis.setTimeout(() => {
      this.timer = null;
      const paths = Array.from(this.pendingPaths);
      this.pendingPaths.clear();
      this.run(paths);
    }, this.delayMs) as unknown as number;
  }

  /** 立即执行挂起的刷新，用于需要同步结果的场合（如标签改名后）。 */
  flush(): void {
    if (this.timer === null) return;
    globalThis.clearTimeout(this.timer);
    this.timer = null;
    const paths = Array.from(this.pendingPaths);
    this.pendingPaths.clear();
    this.run(paths);
  }

  cancel(): void {
    if (this.timer !== null) globalThis.clearTimeout(this.timer);
    this.timer = null;
    this.pendingPaths.clear();
  }

  get hasPending(): boolean {
    return this.timer !== null;
  }
}

/** 对账安全阀的判定结果。 */
export type ReconcileGuardVerdict = {
  safe: boolean;
  removedRatio: number;
  removedCount: number;
  totalCount: number;
  reason: string;
};

/** 超过该比例的记录将被清理时，判定为元数据异常而不是用户真的删了那么多笔记。 */
export const RECONCILE_REMOVAL_LIMIT = 0.3;

/**
 * 记录总数低于此值时不做比例判断。
 *
 * 小样本下比例毫无意义：只有 3 条记录时删掉 1 条就是 33%，会把正常的删除笔记
 * 操作误判为异常。而安全阀真正要防的是"缓存未就绪导致大面积误删"，那种场景
 * 的清理比例接近 100%，且只发生在有相当数量记录的库上。
 */
export const RECONCILE_GUARD_MIN_SAMPLE = 20;

/**
 * 顺序对账的安全阀。
 *
 * 元数据缓存在某些时机（Obsidian 重建缓存、仓库同步中途）会短暂查不到大量文件，
 * 此时照常对账会把这些笔记当成已删除、连带丢弃它们的手工排序。这里在写盘前
 * 先看一眼"要删掉多少"，比例过高就跳过本次写入，等下一轮缓存就绪后再对账。
 *
 * 适用边界要说清楚：它防的是"大面积误删"，不防"单个标签改名导致的顺序丢失"
 * —— 后者只影响一个标签的记录，占总量比例很低，本就不该被拦。
 *
 * 注意：少量清理必须放行，否则正常的删除笔记操作无法落盘。
 */
export function evaluateReconcileSafety(
  previousPathCount: number,
  nextPathCount: number,
  limit = RECONCILE_REMOVAL_LIMIT,
  minSample = RECONCILE_GUARD_MIN_SAMPLE
): ReconcileGuardVerdict {
  const removedCount = Math.max(0, previousPathCount - nextPathCount);
  const removedRatio = previousPathCount > 0 ? removedCount / previousPathCount : 0;

  if (previousPathCount === 0) {
    return { safe: true, removedRatio: 0, removedCount, totalCount: previousPathCount, reason: '无既有记录' };
  }
  if (removedCount === 0) {
    return { safe: true, removedRatio, removedCount, totalCount: previousPathCount, reason: '没有记录被清理' };
  }
  if (previousPathCount < minSample) {
    return {
      safe: true,
      removedRatio,
      removedCount,
      totalCount: previousPathCount,
      reason: `记录仅 ${previousPathCount} 条，低于 ${minSample} 条样本下限，不做比例判断`,
    };
  }
  if (removedRatio > limit) {
    return {
      safe: false,
      removedRatio,
      removedCount,
      totalCount: previousPathCount,
      reason: `本次将清理 ${removedCount}/${previousPathCount} 条顺序记录（${(removedRatio * 100).toFixed(1)}%），超过 ${(limit * 100).toFixed(0)}% 阈值，判定为元数据缓存未就绪`,
    };
  }
  return { safe: true, removedRatio, removedCount, totalCount: previousPathCount, reason: '清理比例在阈值内' };
}

/** 统计一份 tag -> paths 记录里的路径总数，供安全阀比较。 */
export function countOrderedPaths(orderByTag: Record<string, string[]> | null | undefined): number {
  if (!orderByTag) return 0;
  let total = 0;
  for (const paths of Object.values(orderByTag)) {
    if (Array.isArray(paths)) total += paths.length;
  }
  return total;
}

/**
 * 按文件名反查"疑似被移动"的路径。
 *
 * 插件关闭期间移动或重命名笔记时收不到 vault 事件，重新启用后旧路径已不存在，
 * 对账会把它当作新笔记追加到末尾、丢掉手工排序位置。这里按 basename 找唯一
 * 同名候选，把顺序迁移过去。只有唯一匹配才迁移 —— 同名多份时无法判断，宁可不动。
 */
export function resolveMovedPaths(
  missingPaths: string[],
  candidatePaths: string[]
): Map<string, string> {
  const result = new Map<string, string>();
  if (missingPaths.length === 0 || candidatePaths.length === 0) return result;

  const basename = (path: string) => {
    const file = path.split('/').pop() || path;
    return file.replace(/\.[^.]+$/, '');
  };

  const candidatesByName = new Map<string, string[]>();
  for (const path of candidatePaths) {
    const name = basename(path);
    const list = candidatesByName.get(name);
    if (list) list.push(path);
    else candidatesByName.set(name, [path]);
  }

  const claimed = new Set<string>();
  for (const missing of missingPaths) {
    const matches = candidatesByName.get(basename(missing));
    if (!matches || matches.length !== 1) continue;
    const target = matches[0];
    if (claimed.has(target)) continue;
    claimed.add(target);
    result.set(missing, target);
  }

  return result;
}
