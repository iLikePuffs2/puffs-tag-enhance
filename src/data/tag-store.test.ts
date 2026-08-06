// 数据层测试：浏览数据缓存、元数据刷新调度、对账安全阀、路径复原。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MetadataRefreshScheduler,
  RECONCILE_GUARD_MIN_SAMPLE,
  TagBrowseCache,
  countOrderedPaths,
  evaluateReconcileSafety,
  resolveMovedPaths,
} from './tag-store';

describe('标签浏览数据缓存', () => {
  it('同一批次内重复取用只计算一次', () => {
    const cache = new TagBrowseCache();
    let computed = 0;
    const compute = () => {
      computed += 1;
      return { tag: '#读书' };
    };

    const first = cache.resolve('#读书', compute);
    const second = cache.resolve('#读书', compute);
    const third = cache.resolve('#读书', compute);

    expect(computed).toBe(1);
    expect(second).toBe(first); // 同一对象实例，不是等值副本
    expect(third).toBe(first);
    expect(cache.stats).toMatchObject({ hits: 2, misses: 1, size: 1 });
  });

  it('不同标签各自计算', () => {
    const cache = new TagBrowseCache();
    let computed = 0;
    for (const tag of ['#读书', '#科幻', '#读书']) {
      cache.resolve(tag, () => {
        computed += 1;
        return tag;
      });
    }
    expect(computed).toBe(2);
  });

  it('失效后重新计算', () => {
    const cache = new TagBrowseCache();
    let computed = 0;
    const compute = () => {
      computed += 1;
      return computed;
    };

    cache.resolve('#读书', compute);
    cache.invalidate();
    cache.resolve('#读书', compute);

    expect(computed).toBe(2);
    expect(cache.stats.size).toBe(1);
  });

  it('可只失效单个标签', () => {
    const cache = new TagBrowseCache();
    cache.resolve('#读书', () => 'a');
    cache.resolve('#科幻', () => 'b');

    cache.invalidateTag('#读书');

    let recomputed = false;
    cache.resolve('#读书', () => {
      recomputed = true;
      return 'a2';
    });
    cache.resolve('#科幻', () => {
      throw new Error('#科幻 不应重新计算');
    });
    expect(recomputed).toBe(true);
  });

  it('缓存 undefined 结果也算命中，不会反复计算', () => {
    const cache = new TagBrowseCache();
    let computed = 0;
    const compute = () => {
      computed += 1;
      return undefined;
    };
    cache.resolve('#空', compute);
    cache.resolve('#空', compute);
    expect(computed).toBe(1);
  });

  it('模拟真实渲染批次：150 标签 × 4 遍取用只算 150 次', () => {
    const cache = new TagBrowseCache();
    const tags = Array.from({ length: 150 }, (_, i) => `#标签${i}`);
    let computed = 0;

    // renderListMode、updateListModeExpandAllButton（两次）、toggleAll 各问一遍
    for (let pass = 0; pass < 4; pass += 1) {
      for (const tag of tags) {
        cache.resolve(tag, () => {
          computed += 1;
          return tag;
        });
      }
    }

    expect(computed).toBe(150); // 未加缓存时是 600
  });
});

describe('元数据刷新调度', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('窗口内的多次变更合并为一次刷新', () => {
    const runs: string[][] = [];
    const scheduler = new MetadataRefreshScheduler((paths) => runs.push(paths), 150);

    scheduler.schedule('a.md');
    scheduler.schedule('b.md');
    scheduler.schedule('c.md');
    expect(runs.length).toBe(0);

    vi.advanceTimersByTime(150);

    expect(runs.length).toBe(1);
    expect(runs[0].sort()).toEqual(['a.md', 'b.md', 'c.md']);
  });

  it('重复路径去重', () => {
    const runs: string[][] = [];
    const scheduler = new MetadataRefreshScheduler((paths) => runs.push(paths), 150);
    scheduler.schedule('a.md');
    scheduler.schedule('a.md');
    vi.advanceTimersByTime(150);
    expect(runs[0]).toEqual(['a.md']);
  });

  it('窗口结束后的新变更另起一次刷新', () => {
    const runs: string[][] = [];
    const scheduler = new MetadataRefreshScheduler((paths) => runs.push(paths), 150);

    scheduler.schedule('a.md');
    vi.advanceTimersByTime(150);
    scheduler.schedule('b.md');
    vi.advanceTimersByTime(150);

    expect(runs).toEqual([['a.md'], ['b.md']]);
  });

  it('无路径的变更也会触发刷新（如删除文件）', () => {
    const runs: string[][] = [];
    const scheduler = new MetadataRefreshScheduler((paths) => runs.push(paths), 150);
    scheduler.schedule(null);
    vi.advanceTimersByTime(150);
    expect(runs).toEqual([[]]);
  });

  it('flush 立即执行挂起的刷新', () => {
    const runs: string[][] = [];
    const scheduler = new MetadataRefreshScheduler((paths) => runs.push(paths), 150);
    scheduler.schedule('a.md');
    scheduler.flush();
    expect(runs).toEqual([['a.md']]);

    vi.advanceTimersByTime(150);
    expect(runs.length).toBe(1); // 不会再跑一次
  });

  it('cancel 丢弃挂起的刷新', () => {
    const runs: string[][] = [];
    const scheduler = new MetadataRefreshScheduler((paths) => runs.push(paths), 150);
    scheduler.schedule('a.md');
    expect(scheduler.hasPending).toBe(true);
    scheduler.cancel();
    vi.advanceTimersByTime(150);
    expect(runs.length).toBe(0);
    expect(scheduler.hasPending).toBe(false);
  });
});

describe('对账安全阀', () => {
  const big = RECONCILE_GUARD_MIN_SAMPLE * 10; // 200 条，达到样本下限

  it('没有清理时放行', () => {
    expect(evaluateReconcileSafety(big, big).safe).toBe(true);
    expect(evaluateReconcileSafety(big, big + 5).safe).toBe(true);
  });

  it('少量清理放行 —— 正常删除笔记必须能落盘', () => {
    const verdict = evaluateReconcileSafety(big, big - 2);
    expect(verdict.safe).toBe(true);
    expect(verdict.removedCount).toBe(2);
  });

  it('清理比例超过三成时拦下', () => {
    const verdict = evaluateReconcileSafety(big, Math.floor(big * 0.5));
    expect(verdict.safe).toBe(false);
    expect(verdict.removedRatio).toBeGreaterThan(0.3);
    expect(verdict.reason).toContain('元数据缓存未就绪');
  });

  it('近乎全部消失时拦下 —— 这是缓存未就绪的典型特征', () => {
    expect(evaluateReconcileSafety(1806, 0).safe).toBe(false);
    expect(evaluateReconcileSafety(1806, 12).safe).toBe(false);
  });

  it('真实规模下删除单篇笔记远低于阈值', () => {
    // 一篇笔记平均出现在 1.74 个标签下，1806 条记录里减少约 2 条
    const verdict = evaluateReconcileSafety(1806, 1804);
    expect(verdict.safe).toBe(true);
    expect(verdict.removedRatio).toBeLessThan(0.01);
  });

  it('真实规模下单个标签改名不会被拦 —— 安全阀不覆盖该场景', () => {
    // 一个标签约 30 条记录，占 1806 的 1.7%
    expect(evaluateReconcileSafety(1806, 1776).safe).toBe(true);
  });

  it('记录数低于样本下限时不做比例判断', () => {
    // 3 条里删 1 条是 33%，但小样本下比例无意义，必须放行
    const verdict = evaluateReconcileSafety(3, 2);
    expect(verdict.safe).toBe(true);
    expect(verdict.reason).toContain('样本下限');

    expect(evaluateReconcileSafety(1, 0).safe).toBe(true);
    expect(evaluateReconcileSafety(RECONCILE_GUARD_MIN_SAMPLE - 1, 0).safe).toBe(true);
  });

  it('恰好达到样本下限时启用比例判断', () => {
    expect(evaluateReconcileSafety(RECONCILE_GUARD_MIN_SAMPLE, 0).safe).toBe(false);
  });

  it('空记录放行', () => {
    expect(evaluateReconcileSafety(0, 0).safe).toBe(true);
  });
});

describe('顺序记录路径统计', () => {
  it('累加各标签的路径数', () => {
    expect(countOrderedPaths({ '#a': ['1.md', '2.md'], '#b': ['3.md'] })).toBe(3);
  });

  it('容错空值与非数组', () => {
    expect(countOrderedPaths(null)).toBe(0);
    expect(countOrderedPaths(undefined)).toBe(0);
    expect(countOrderedPaths({ '#a': null as never })).toBe(0);
  });
});

describe('移动路径复原', () => {
  it('按文件名唯一匹配时迁移路径', () => {
    const moved = resolveMovedPaths(['旧目录/笔记.md'], ['新目录/笔记.md', '新目录/其他.md']);
    expect(moved.get('旧目录/笔记.md')).toBe('新目录/笔记.md');
  });

  it('同名候选多于一个时不迁移 —— 无法判断该选哪个', () => {
    const moved = resolveMovedPaths(['旧/笔记.md'], ['甲/笔记.md', '乙/笔记.md']);
    expect(moved.size).toBe(0);
  });

  it('找不到同名候选时不迁移', () => {
    const moved = resolveMovedPaths(['旧/笔记.md'], ['新/别的.md']);
    expect(moved.size).toBe(0);
  });

  it('一个候选不会被两个缺失路径同时认领', () => {
    const moved = resolveMovedPaths(['甲/笔记.md', '乙/笔记.md'], ['新/笔记.md']);
    // 两个缺失路径同名，候选只有一个：候选按名称分组后数量为 1，
    // 第一个认领成功，第二个因已被认领而跳过
    expect(moved.size).toBe(1);
  });

  it('忽略扩展名差异之外的路径层级', () => {
    const moved = resolveMovedPaths(['a/b/c/笔记.md'], ['x/笔记.md']);
    expect(moved.get('a/b/c/笔记.md')).toBe('x/笔记.md');
  });

  it('输入为空时返回空映射', () => {
    expect(resolveMovedPaths([], ['a.md']).size).toBe(0);
    expect(resolveMovedPaths(['a.md'], []).size).toBe(0);
  });
});
