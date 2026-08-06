// 标签项装配契约测试。
//
// 侧边栏用 TagPaneBehavior.getListModeItems，标签系统页用 InteractionsBehavior.getTagShelfItems。
// 两者做的是同一件事，但实现独立、行为已经跑偏。阶段 3 要把它们合并为一份，
// 因此这里把**两边各自的现状**都钉下来，作为合并时的对照依据：
// 合并后的实现应当匹配 getListModeItems 的行为（功能更全），
// 而本文件中标记「差异」的用例届时需要按预期更新。

import { describe, expect, it } from 'vitest';
import { TagPaneBehavior } from './tag-pane';
import { InteractionsBehavior } from './interactions';

/** 造一份形状完整的 browseData，字段齐全以便观察下游到底透传了哪些。 */
function makeBrowseData(tag: string, fileCount = 1, extra: Record<string, unknown> = {}) {
  const files = Array.from({ length: fileCount }, (_, i) => ({ path: `${tag}-${i}.md` }));
  return {
    tag,
    files,
    exactFiles: files,
    inheritedFiles: [],
    exactCount: files.length,
    inheritedCount: 0,
    inheritanceEnabled: false,
    hasInheritance: false,
    hasFreeInheritance: false,
    hasActiveInheritance: false,
    sourcesByPath: new Map(),
    inheritanceTree: null,
    fixedTags: new Set(),
    fixedPaths: new Set(),
    ...extra,
  };
}

function makeSidebarBehavior(tags: string[], browse: (tag: string) => unknown = (t) => makeBrowseData(t)) {
  const behavior = Object.create(TagPaneBehavior.prototype) as Record<string, unknown> & {
    getListModeItems: (view: unknown, query?: string, includePinned?: boolean) => never[];
  };
  behavior.settings = { pinnedTag: null };
  behavior.getTagInheritanceSettings = () => ({ fixedParentByChild: {} });
  behavior.isFixedChild = () => false;
  behavior.getTagBrowseData = browse;
  behavior.getTagDomEntries = () => new Map(tags.map((tag) => [tag, { tag }]));
  behavior.getLogicalTagSet = () => new Set(tags);
  behavior.prependPinnedTagItem = (items: unknown) => items;
  return behavior;
}

function makeShelfBehavior(tags: string[], browse: (tag: string) => unknown = (t) => makeBrowseData(t)) {
  const behavior = Object.create(InteractionsBehavior.prototype) as Record<string, unknown> & {
    getTagShelfItems: (query?: string, includePinned?: boolean) => never[];
  };
  behavior.settings = { pinnedTag: null };
  behavior.getTagBrowseData = browse;
  behavior.getLogicalTagSet = () => new Set(tags);
  behavior.prependPinnedTagItem = (items: unknown) => items;
  return behavior;
}

describe('标签项装配 · 两边共同的行为', () => {
  it('都按名称过滤命中标签', () => {
    const tags = ['#读书', '#科幻', '#玄幻'];
    expect(makeSidebarBehavior(tags).getListModeItems({}, '读书', false).map((i: never) => (i as { tag: string }).tag))
      .toEqual(['#读书']);
    expect(makeShelfBehavior(tags).getTagShelfItems('读书', false).map((i: never) => (i as { tag: string }).tag))
      .toEqual(['#读书']);
  });

  it('都排除嵌套标签（含斜杠）', () => {
    const tags = ['#读书', '#读书/小说'];
    expect(makeSidebarBehavior(tags).getListModeItems({}, '', false).map((i: never) => (i as { tag: string }).tag))
      .toEqual(['#读书']);
    expect(makeShelfBehavior(tags).getTagShelfItems('', false).map((i: never) => (i as { tag: string }).tag))
      .toEqual(['#读书']);
  });

  it('都排除没有笔记且没有继承关系的标签', () => {
    const browse = (tag: string) => makeBrowseData(tag, tag === '#空标签' ? 0 : 1);
    expect(makeSidebarBehavior(['#读书', '#空标签'], browse).getListModeItems({}, '', false)
      .map((i: never) => (i as { tag: string }).tag)).toEqual(['#读书']);
    expect(makeShelfBehavior(['#读书', '#空标签'], browse).getTagShelfItems('', false)
      .map((i: never) => (i as { tag: string }).tag)).toEqual(['#读书']);
  });

  it('都保留没有笔记但有继承关系的父标签', () => {
    const browse = (tag: string) => tag === '#父标签'
      ? makeBrowseData(tag, 0, { hasInheritance: true })
      : makeBrowseData(tag, 1);
    expect(makeSidebarBehavior(['#父标签'], browse).getListModeItems({}, '', false).length).toBe(1);
    expect(makeShelfBehavior(['#父标签'], browse).getTagShelfItems('', false).length).toBe(1);
  });

  it('都按笔记数量降序排列，数量相同时按中文拼音序（非 Unicode 序）', () => {
    // 拼音序：波(bo) < 春(chun) < 阿(a)? 否 —— a < b < c，所以 阿 < 波 < 春。
    // 这里让三者数量相同，只考察名称排序。
    const counts: Record<string, number> = { '#多': 5, '#春': 3, '#阿': 3, '#波': 3, '#少': 1 };
    const browse = (tag: string) => makeBrowseData(tag, counts[tag] ?? 1);
    const tags = ['#少', '#春', '#多', '#波', '#阿'];
    const expected = ['#多', '#阿', '#波', '#春', '#少'];
    expect(makeSidebarBehavior(tags, browse).getListModeItems({}, '', false)
      .map((i: never) => (i as { tag: string }).tag)).toEqual(expected);
    expect(makeShelfBehavior(tags, browse).getTagShelfItems('', false)
      .map((i: never) => (i as { tag: string }).tag)).toEqual(expected);
  });

  it('空查询返回全部可见标签', () => {
    const tags = ['#读书', '#科幻'];
    expect(makeSidebarBehavior(tags).getListModeItems({}, '', false).length).toBe(2);
    expect(makeShelfBehavior(tags).getTagShelfItems('', false).length).toBe(2);
  });
});

describe('标签项装配 · 两边的差异（阶段 3 合并时需消除）', () => {
  it('差异一：侧边栏透传完整 browseData 字段，标签系统页缺 5 个', () => {
    const tags = ['#读书'];
    const browse = () => makeBrowseData('#读书', 2, {
      hasFreeInheritance: true,
      hasActiveInheritance: true,
      inheritanceTree: { tag: '#读书' },
    });

    const sidebarItem = makeSidebarBehavior(tags, browse).getListModeItems({}, '', false)[0] as Record<string, unknown>;
    const shelfItem = makeShelfBehavior(tags, browse).getTagShelfItems('', false)[0] as Record<string, unknown>;

    // 侧边栏：字段齐全，渲染层才能画出继承开关与继承树
    expect(sidebarItem.hasFreeInheritance).toBe(true);
    expect(sidebarItem.hasActiveInheritance).toBe(true);
    expect(sidebarItem.inheritanceTree).toEqual({ tag: '#读书' });
    expect(sidebarItem.browseData).toBeDefined();
    expect(sidebarItem.fixedSearchTags).toEqual([]);

    // 标签系统页：这 5 个字段全部缺失 —— 所以该页永远画不出继承开关按钮。
    // 这是双份实现跑偏的实证，合并后应与上面一致。
    expect(shelfItem.hasFreeInheritance).toBeUndefined();
    expect(shelfItem.hasActiveInheritance).toBeUndefined();
    expect(shelfItem.inheritanceTree).toBeUndefined();
    expect(shelfItem.browseData).toBeUndefined();
    expect(shelfItem.fixedSearchTags).toBeUndefined();
  });

  it('差异二：只有侧边栏认识固定子标签 —— 搜子标签名会展开所属父标签', () => {
    const behavior = makeSidebarBehavior(['#爱情', '#升温']);
    behavior.getTagInheritanceSettings = () => ({ fixedParentByChild: { '#升温': '#爱情' } });
    behavior.isFixedChild = (tag: string) => tag === '#升温';
    behavior.getTopLevelFixedParent = (tag: string) => (tag === '#升温' ? '#爱情' : null);
    behavior.createFixedSearchBrowseData = (tag: string, included: string[]) => ({
      ...makeBrowseData(tag, 3),
      fixedSearchIncluded: included,
    });

    const items = behavior.getListModeItems({}, '升温', false) as unknown as Array<Record<string, unknown>>;

    // 固定子标签自身不占顶层入口，改为命中父标签并带上匹配分支
    expect(items.map((i) => i.tag)).toEqual(['#爱情']);
    expect(items[0].fixedSearchTags).toEqual(['#升温']);

    // 标签系统页没有这套逻辑：搜「升温」时它把子标签当普通标签直接列出
    const shelfItems = makeShelfBehavior(['#爱情', '#升温']).getTagShelfItems('升温', false) as unknown as Array<Record<string, unknown>>;
    expect(shelfItems.map((i) => i.tag)).toEqual(['#升温']);
  });

  it('差异三：搜索时侧边栏只为命中标签算 browseData，标签系统页为全部标签都算', () => {
    const tags = Array.from({ length: 50 }, (_, i) => `#无关${i}`).concat('#目标');

    let sidebarCalls = 0;
    const sidebar = makeSidebarBehavior(tags, (tag) => {
      sidebarCalls += 1;
      return makeBrowseData(tag);
    });
    sidebar.getListModeItems({}, '目标', false);

    let shelfCalls = 0;
    const shelf = makeShelfBehavior(tags, (tag) => {
      shelfCalls += 1;
      return makeBrowseData(tag);
    });
    shelf.getTagShelfItems('目标', false);

    // 侧边栏：先做轻量名称过滤，只对命中的 1 个标签计算
    expect(sidebarCalls).toBe(1);
    // 标签系统页：51 个标签全算一遍才过滤 —— 合并后应采用侧边栏的先过滤策略
    expect(shelfCalls).toBe(51);
  });
});

describe('标签项装配 · 置顶标签', () => {
  it('includePinned 为 false 时不调用置顶拼接', () => {
    const sidebar = makeSidebarBehavior(['#读书']);
    let called = false;
    sidebar.prependPinnedTagItem = (items: unknown) => {
      called = true;
      return items;
    };
    sidebar.getListModeItems({}, '', false);
    expect(called).toBe(false);
  });

  it('includePinned 为 true 时经过置顶拼接', () => {
    const sidebar = makeSidebarBehavior(['#读书']);
    let called = false;
    sidebar.prependPinnedTagItem = (items: unknown) => {
      called = true;
      return items;
    };
    sidebar.getListModeItems({}, '', true);
    expect(called).toBe(true);
  });
});
