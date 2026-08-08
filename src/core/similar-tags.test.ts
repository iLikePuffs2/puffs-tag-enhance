// 相似标签组的纯计算测试。
//
// 数据存成邻接表而非「组 id」：写入时对称写两侧，读取时求传递闭包。
// 这样「比赛-秘境」「秘境-试炼」两条边自然合成一个三元组，
// 与用户描述的「给比赛绑定秘境和试炼后，秘境的弹窗里也能看到另外两个」一致。

import { describe, expect, it } from 'vitest';
import {
  linkSimilarTags,
  normalizeSimilarTagSettings,
  resolveSimilarTagGroup,
  unlinkSimilarTags,
} from './similar-tags';

describe('相似标签组解析', () => {
  it('没有任何关系时只返回自己', () => {
    expect(resolveSimilarTagGroup({}, '#比赛')).toEqual(['#比赛']);
  });

  it('直接相连的标签同组', () => {
    const groups = { '#比赛': ['#秘境'], '#秘境': ['#比赛'] };
    expect(resolveSimilarTagGroup(groups, '#比赛')).toEqual(['#比赛', '#秘境']);
    expect(resolveSimilarTagGroup(groups, '#秘境')).toEqual(['#比赛', '#秘境']);
  });

  it('传递闭包：比赛-秘境、秘境-试炼 合成一个三元组', () => {
    const groups = {
      '#比赛': ['#秘境'],
      '#秘境': ['#比赛', '#试炼'],
      '#试炼': ['#秘境'],
    };
    // 三个标签中任取一个，看到的都是完整的组
    for (const tag of ['#比赛', '#秘境', '#试炼']) {
      expect(resolveSimilarTagGroup(groups, tag)).toEqual(['#比赛', '#秘境', '#试炼']);
    }
  });

  it('成环也能终止，不重复不死循环', () => {
    const groups = {
      '#甲': ['#乙', '#丙'],
      '#乙': ['#甲', '#丙'],
      '#丙': ['#甲', '#乙'],
    };
    // 顺序由中文排序决定（丙 < 甲 < 乙），这里只关心成员完整且不重复
    expect(resolveSimilarTagGroup(groups, '#甲')).toEqual(['#丙', '#甲', '#乙']);
  });

  it('不同的组互不串联', () => {
    const groups = {
      '#比赛': ['#秘境'], '#秘境': ['#比赛'],
      '#读书': ['#写作'], '#写作': ['#读书'],
    };
    expect(resolveSimilarTagGroup(groups, '#比赛')).toEqual(['#比赛', '#秘境']);
    expect(resolveSimilarTagGroup(groups, '#读书')).toEqual(['#读书', '#写作']);
  });

  it('空标签返回空数组', () => {
    expect(resolveSimilarTagGroup({ '#比赛': ['#秘境'] }, '')).toEqual([]);
    expect(resolveSimilarTagGroup({}, null)).toEqual([]);
  });
});

describe('相似标签的绑定与解绑', () => {
  it('绑定对称写入两侧', () => {
    const groups: Record<string, string[]> = {};
    linkSimilarTags(groups, '#比赛', '#秘境');
    expect(groups['#比赛']).toEqual(['#秘境']);
    expect(groups['#秘境']).toEqual(['#比赛']);
  });

  it('重复绑定不产生重复项', () => {
    const groups: Record<string, string[]> = {};
    linkSimilarTags(groups, '#比赛', '#秘境');
    linkSimilarTags(groups, '#比赛', '#秘境');
    expect(groups['#比赛']).toEqual(['#秘境']);
  });

  it('自己不能与自己相似', () => {
    const groups: Record<string, string[]> = {};
    expect(linkSimilarTags(groups, '#比赛', '#比赛')).toBe(false);
    expect(groups['#比赛']).toBeUndefined();
  });

  it('空标签不写入', () => {
    const groups: Record<string, string[]> = {};
    expect(linkSimilarTags(groups, '#比赛', '')).toBe(false);
    expect(Object.keys(groups)).toEqual([]);
  });

  it('解绑同样对称移除，空数组随之删除键', () => {
    const groups: Record<string, string[]> = {};
    linkSimilarTags(groups, '#比赛', '#秘境');
    expect(unlinkSimilarTags(groups, '#比赛', '#秘境')).toBe(true);
    expect(groups['#比赛']).toBeUndefined();
    expect(groups['#秘境']).toBeUndefined();
  });

  it('解绑不存在的关系返回 false', () => {
    expect(unlinkSimilarTags({}, '#比赛', '#秘境')).toBe(false);
  });

  it('解绑只断这一条边，同组其它成员的关系保留', () => {
    const groups: Record<string, string[]> = {};
    linkSimilarTags(groups, '#比赛', '#秘境');
    linkSimilarTags(groups, '#比赛', '#试炼');
    unlinkSimilarTags(groups, '#比赛', '#秘境');

    expect(resolveSimilarTagGroup(groups, '#比赛')).toEqual(['#比赛', '#试炼']);
    expect(resolveSimilarTagGroup(groups, '#秘境')).toEqual(['#秘境']);
  });
});

describe('相似标签配置的归一化', () => {
  it('非法输入回落到空对象', () => {
    expect(normalizeSimilarTagSettings(null)).toEqual({});
    expect(normalizeSimilarTagSettings('x')).toEqual({});
    expect(normalizeSimilarTagSettings([])).toEqual({});
  });

  it('补齐 # 前缀、去重、丢掉自指与空值（结果仍是对称的两条边）', () => {
    expect(normalizeSimilarTagSettings({ '比赛': ['秘境', '秘境', '比赛', ''] }))
      .toEqual({ '#比赛': ['#秘境'], '#秘境': ['#比赛'] });
  });

  it('半条边补成对称的两条 —— 数据损坏时也不会出现单向相似', () => {
    expect(normalizeSimilarTagSettings({ '#比赛': ['#秘境'] }))
      .toEqual({ '#比赛': ['#秘境'], '#秘境': ['#比赛'] });
  });

  it('嵌套标签不参与相似组（与继承关系口径一致）', () => {
    expect(normalizeSimilarTagSettings({ '#比赛': ['#比赛/初赛'] })).toEqual({});
  });

  it('空数组的键被丢弃', () => {
    expect(normalizeSimilarTagSettings({ '#比赛': [] })).toEqual({});
  });
});
