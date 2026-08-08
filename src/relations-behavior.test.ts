import { describe, expect, it, vi } from "vitest";
import { Notice, TFile } from "obsidian";
import { RELATIONS_VERSION, RelationsBehavior } from "./relations";
import { TagPaneBehavior } from "./tag-pane";
import { PuffsTagSidebarView } from "./view/tag-sidebar-view";
import { TagTreeRendererBehavior } from "./view/tag-tree-renderer";

function createBehavior(noteHierarchy: any, exclusions: Record<string, string[]> = {}) {
  const behavior = Object.create(RelationsBehavior.prototype);
  behavior.settings = {
    relations: {
      version: 1,
      tagInheritance: {
        childrenByParent: {},
        excludedPathsByParentChild: Object.fromEntries(Object.entries(exclusions).map(([parent, paths]) => [
          parent,
          { '#子': paths },
        ])),
        modeByParentChild: {},
        fixedParentByChild: {},
      },
      noteHierarchy,
    },
  };
  behavior.saveSettings = vi.fn();
  return behavior;
}

function attachFiles(behavior: any, paths: string[], aliases: Record<string, string[]> = {}) {
  const files = new Map(paths.map((path) => [path, new (TFile as any)(path)]));
  behavior.app = { vault: { getAbstractFileByPath: (path: string) => files.get(path) || null } };
  behavior.getNoteAliases = (file: any) => aliases[file.path] || [];
  behavior.refreshHierarchyViews = vi.fn();
  return behavior;
}

describe('关系文件迁移', () => {
  it('改名或移动时迁移父节点、子节点、alias 与继承排除路径', () => {
    const behavior = createBehavior({
      childrenByParentPath: {
        '旧.md': ['子.md'],
        '另一父.md': ['旧.md'],
      },
      displayNamesByParentPath: {
        '旧.md': { '子.md': '子别名' },
        '另一父.md': { '旧.md': '旧别名' },
      },
    }, { '#父': ['旧.md'] });

    behavior.handleRelationFileRename(new (TFile as any)('目录/新.md'), '旧.md');

    expect(behavior.settings.relations.noteHierarchy.childrenByParentPath).toEqual({
      '另一父.md': ['目录/新.md'],
      '目录/新.md': ['子.md'],
    });
    expect(behavior.settings.relations.noteHierarchy.displayNamesByParentPath).toEqual({
      '另一父.md': { '目录/新.md': '旧别名' },
      '目录/新.md': { '子.md': '子别名' },
    });
    expect(behavior.settings.relations.tagInheritance.excludedPathsByParentChild['#父']['#子'])
      .toEqual(['目录/新.md']);
    expect(behavior.saveSettings).toHaveBeenCalledOnce();
  });

  it('删除时清理作为父级、子级和 alias 的全部记录', () => {
    const behavior = createBehavior({
      childrenByParentPath: {
        '待删.md': ['后代.md'],
        '保留父.md': ['待删.md', '保留子.md'],
      },
      displayNamesByParentPath: {
        '待删.md': { '后代.md': '后代别名' },
        '保留父.md': { '待删.md': '待删别名', '保留子.md': '保留别名' },
      },
    }, { '#父': ['待删.md', '保留.md'] });

    behavior.handleRelationFileDelete(new (TFile as any)('待删.md'));

    expect(behavior.settings.relations.noteHierarchy.childrenByParentPath).toEqual({
      '保留父.md': ['保留子.md'],
    });
    expect(behavior.settings.relations.noteHierarchy.displayNamesByParentPath).toEqual({
      '保留父.md': { '保留子.md': '保留别名' },
    });
    expect(behavior.settings.relations.tagInheritance.excludedPathsByParentChild['#父']['#子'])
      .toEqual(['保留.md']);
    expect(behavior.saveSettings).toHaveBeenCalledOnce();
  });
});

describe('标签绑定笔记生命周期', () => {
  const makeBehavior = (bindings: Record<string, string>, paths: string[]) => {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    const files = new Map(paths.map((path) => [path, new (TFile as any)(path)]));
    behavior.settings = { tagBoundNoteByTag: { ...bindings } };
    behavior.app = { vault: { getAbstractFileByPath: (path: string) => files.get(path) || null } };
    behavior.tagFileIndex = new Map([['#标签', []], ['#目标', []]]);
    behavior.saveSettings = vi.fn().mockResolvedValue(undefined);
    return behavior;
  };

  it('绑定和解绑只修改独立映射，不改变标签索引', async () => {
    const behavior = makeBehavior({}, ['绑定.md']);
    const originalIndex = behavior.tagFileIndex;

    await behavior.setTagBoundNote('#标签', '绑定.md');
    expect(behavior.settings.tagBoundNoteByTag).toEqual({ '#标签': '绑定.md' });
    expect(behavior.tagFileIndex).toBe(originalIndex);

    await behavior.setTagBoundNote('#标签', null);
    expect(behavior.settings.tagBoundNoteByTag).toEqual({});
    expect(behavior.saveSettings).toHaveBeenCalledTimes(2);
  });

  it('标签改名迁移绑定，合并时保留目标标签绑定', () => {
    const behavior = makeBehavior({ '#来源': '来源.md', '#目标': '目标.md' }, ['来源.md', '目标.md']);
    expect(behavior.migrateTagBoundNote('#来源', '#目标')).toBe(true);
    expect(behavior.settings.tagBoundNoteByTag).toEqual({ '#目标': '目标.md' });

    behavior.settings.tagBoundNoteByTag = { '#来源': '来源.md' };
    behavior.migrateTagBoundNote('#来源', '#新标签');
    expect(behavior.settings.tagBoundNoteByTag).toEqual({ '#新标签': '来源.md' });
  });

  it('笔记改名时迁移路径，删除时解除全部相关绑定', () => {
    const behavior = makeBehavior({ '#标签': '旧.md', '#目标': '旧.md' }, ['旧.md', '目录/新.md']);
    behavior.handleTagBoundNoteFileRename(new (TFile as any)('目录/新.md'), '旧.md');
    expect(behavior.settings.tagBoundNoteByTag).toEqual({
      '#标签': '目录/新.md',
      '#目标': '目录/新.md',
    });

    behavior.handleTagBoundNoteFileDelete(new (TFile as any)('目录/新.md'));
    expect(behavior.settings.tagBoundNoteByTag).toEqual({});
    expect(behavior.saveSettings).toHaveBeenCalledTimes(2);
  });

  it('清理已消失标签和不存在的绑定文件', () => {
    const behavior = makeBehavior({
      '#标签': '保留.md',
      '#消失': '保留.md',
      '#缺失': '缺失.md',
    }, ['保留.md']);

    expect(behavior.reconcileTagBoundNotes(new Map([['#标签', []], ['#缺失', []]]))).toBe(true);
    expect(behavior.settings.tagBoundNoteByTag).toEqual({ '#标签': '保留.md' });
  });
});

describe('子标签手动排序', () => {
  it('直接使用每个父级保存的顺序，并让关系遍历使用相同顺序', () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} });
    behavior.settings.relations.tagInheritance = {
      childrenByParent: {
        '#父': ['#少', '#多', '#继承'],
        '#继承': ['#后代'],
      },
      excludedPathsByParentChild: { '#继承': { '#后代': ['后代/排除.md'] } },
      modeByParentChild: {},
      fixedParentByChild: {},
    };
    const files = (paths: string[]) => paths.map((path) => new (TFile as any)(path));
    behavior.tagFileIndex = new Map([
      ['#少', files(['少/一.md'])],
      ['#多', files(['多/一.md', '多/二.md', '多/三.md'])],
      ['#继承', files(['继承/原生.md'])],
      ['#后代', files(['后代/一.md', '后代/二.md', '后代/三.md', '后代/排除.md'])],
    ]);

    expect(behavior.getTagVisibleNoteCount('#继承')).toBe(4);
    expect(behavior.getInheritanceChildren('#父')).toEqual(['#少', '#多', '#继承']);
    expect(behavior.getTagDescendants('#父')).toEqual(['#少', '#多', '#继承', '#后代']);
  });

  it('v1 关系按升级前的可见数量顺序固化一次', () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} });
    behavior.settings.relations.version = 1;
    behavior.settings.relations.tagInheritance.childrenByParent = {
      '#父': ['#少', '#多'],
      '#另一父': ['#少', '#多'],
    };
    const files = (paths: string[]) => paths.map((path) => new (TFile as any)(path));
    behavior.tagFileIndex = new Map([
      ['#少', files(['少.md'])],
      ['#多', files(['多一.md', '多二.md'])],
    ]);

    expect(behavior.initializeTagInheritanceOrder()).toBe(true);
    // 迁移的语义是「推进到最新版」，跟着常量走，避免每次加新特性都要改断言
    expect(behavior.settings.relations.version).toBe(RELATIONS_VERSION);
    expect(behavior.settings.relations.tagInheritance.childrenByParent).toEqual({
      '#父': ['#多', '#少'],
      '#另一父': ['#多', '#少'],
    });
    behavior.settings.relations.tagInheritance.childrenByParent['#父'] = ['#少', '#多'];
    expect(behavior.initializeTagInheritanceOrder()).toBe(false);
    expect(behavior.getInheritanceChildren('#父')).toEqual(['#少', '#多']);
  });
});

describe('批量父子关系', () => {
  it('父子虚拟标签每次进入搜索时默认展开', () => {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    const state = behavior.createHierarchySurfaceState();
    expect(state.groupExpanded).toBe(true);
    expect(state.allExpanded).toBe(true);
  });

  it('父子虚拟标签重新展开时清除内部折叠状态并全部展开', () => {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    const state = behavior.createHierarchySurfaceState();
    state.allExpanded = false;
    state.expandedParents.add('父.md');
    state.expandedBranches.add('父.md\u0000子.md');

    expect(behavior.toggleHierarchyGroup(state)).toBe(false);
    expect(state.allExpanded).toBe(true);
    expect(state.expandedParents.size).toBe(0);
    expect(state.expandedBranches.size).toBe(0);
    expect(state.collapsedParents.size).toBe(0);
    expect(state.collapsedBranches.size).toBe(0);
    expect(behavior.toggleHierarchyGroup(state)).toBe(true);
    expect(state.allExpanded).toBe(true);
  });

  it('全部展开模式下仍可单独折叠和重新展开父笔记及中间分支', () => {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    const state = behavior.createHierarchySurfaceState();

    expect(behavior.isHierarchyItemExpanded(state, '父.md', 'parent')).toBe(true);
    expect(behavior.toggleHierarchyItemExpansion(state, '父.md', 'parent')).toBe(false);
    expect(behavior.isHierarchyItemExpanded(state, '父.md', 'parent')).toBe(false);
    expect(behavior.toggleHierarchyItemExpansion(state, '父.md', 'parent')).toBe(true);

    const branchKey = '父.md\u0000子.md';
    expect(behavior.isHierarchyItemExpanded(state, branchKey, 'branch')).toBe(true);
    expect(behavior.toggleHierarchyItemExpansion(state, branchKey, 'branch')).toBe(false);
    expect(behavior.isHierarchyItemExpanded(state, branchKey, 'branch')).toBe(false);
  });

  it('标签内父子分支默认展开，手动收起状态在标签关闭后清除', () => {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    behavior.collapsedInlineHierarchyBranches = new Set();
    behavior.inlineHierarchyExpansionVersion = 0;

    expect(behavior.toggleInlineHierarchyBranch('#爱情-升温\u0000父.md')).toBe(false);
    expect(behavior.inlineHierarchyExpansionVersion).toBe(1);
    expect(behavior.toggleInlineHierarchyBranch('#爱情-升温\u0000父.md')).toBe(true);
    expect(behavior.inlineHierarchyExpansionVersion).toBe(2);
    behavior.toggleInlineHierarchyBranch('#爱情-升温\u0000父.md');
    expect(behavior.clearInlineHierarchyBranchState('#爱情-升温')).toBe(true);
    expect(behavior.collapsedInlineHierarchyBranches.size).toBe(0);
    expect(behavior.inlineHierarchyExpansionVersion).toBe(4);
  });

  it('唯一标签搜索的全部收起保留外层标签并递归控制继承分组', () => {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    behavior.collapsedInlineHierarchyBranches = new Set();
    behavior.inlineHierarchyExpansionVersion = 0;
    behavior.getTagBrowseData = () => ({
      hasActiveInheritance: true,
      inheritanceTree: {
        tag: '#爱情',
        paths: ['原生.md'],
        children: [{
          tag: '#升温',
          paths: ['升温.md'],
          children: [{ tag: '#初识', paths: ['初识.md'], children: [] }],
        }],
      },
    });
    const expandedTags = new Set(['#爱情']);
    const items = [{ tag: '#爱情' }];

    const collapseControl = behavior.getUniqueSearchInheritanceControl(items, '爱情', expandedTags);
    expect(collapseControl.shouldExpand).toBe(false);
    expect(collapseControl.keys).toHaveLength(4);
    behavior.setAllTagInheritanceGroupsExpanded(collapseControl.keys, false);
    expect(expandedTags.has('#爱情')).toBe(true);
    expect(behavior.collapsedInlineHierarchyBranches.size).toBe(4);

    const [firstKey, secondKey] = collapseControl.keys;
    expect(behavior.toggleInlineHierarchyBranch(firstKey)).toBe(true);
    expect(behavior.collapsedInlineHierarchyBranches.has(firstKey)).toBe(false);
    expect(behavior.collapsedInlineHierarchyBranches.has(secondKey)).toBe(true);

    const partialControl = behavior.getUniqueSearchInheritanceControl(items, '爱情', expandedTags);
    expect(partialControl.shouldExpand).toBe(false);
    behavior.setAllTagInheritanceGroupsExpanded(partialControl.keys, false);
    expect(behavior.collapsedInlineHierarchyBranches.size).toBe(4);

    const expandControl = behavior.getUniqueSearchInheritanceControl(items, '爱情', expandedTags);
    expect(expandControl.shouldExpand).toBe(true);
    behavior.setAllTagInheritanceGroupsExpanded(expandControl.keys, true);
    expect(behavior.collapsedInlineHierarchyBranches.size).toBe(0);
  });

  it('多个结果、空搜索或外层标签收起时不启用内部批量控制', () => {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    behavior.getTagInheritanceGroupKeys = vi.fn(() => ['分组']);
    behavior.isPinnedOnlyTagResult = vi.fn(() => false);
    expect(behavior.getUniqueSearchInheritanceControl([{ tag: '#爱情' }], '', new Set(['#爱情']))).toBeNull();
    expect(behavior.getUniqueSearchInheritanceControl(
      [{ tag: '#爱情' }, { tag: '#友情' }],
      '情',
      new Set(['#爱情', '#友情'])
    )).toBeNull();
    expect(behavior.getUniqueSearchInheritanceControl(
      [{ tag: '#爱情' }],
      '爱情',
      new Set(),
      [{ tag: '#爱情' }, { tag: '#友情' }]
    )).toBeNull();
  });

  it('固定标签与唯一搜索命中标签共同控制内部继承分组', () => {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    behavior.collapsedInlineHierarchyBranches = new Set();
    behavior.getTagInheritanceGroupKeys = (tag: string) => [`${tag}\u0000分组`];
    behavior.isPinnedOnlyTagResult = vi.fn(() => false);
    const items = [{ tag: '#固定' }, { tag: '#命中' }];
    const matchingItems = [{ tag: '#命中' }];
    const expandedTags = new Set(['#命中']);

    const control = behavior.getUniqueSearchInheritanceControl(
      items,
      '命中',
      expandedTags,
      matchingItems
    );
    expect(control.tags).toEqual(['#固定', '#命中']);
    expect(control.keys).toEqual(['#固定\u0000分组', '#命中\u0000分组']);
    expect(control.shouldExpand).toBe(true);

    expandedTags.add('#固定');
    expect(behavior.getUniqueSearchInheritanceControl(
      items,
      '命中',
      expandedTags,
      matchingItems
    ).shouldExpand).toBe(false);
  });

  it('空搜索仅显示固定父标签时启用内部批量控制且不重复标签', () => {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    behavior.collapsedInlineHierarchyBranches = new Set();
    behavior.getTagInheritanceGroupKeys = vi.fn(() => ['固定分组']);
    behavior.isPinnedOnlyTagResult = vi.fn(() => true);
    const control = behavior.getUniqueSearchInheritanceControl(
      [{ tag: '#固定' }, { tag: '#固定' }],
      '',
      new Set(['#固定']),
      []
    );
    expect(control.tags).toEqual(['#固定']);
    expect(control.keys).toEqual(['固定分组']);
    expect(control.shouldExpand).toBe(false);
  });

  it('唯一搜索或固定标签首次自动展开后允许手动收起顶层标签', () => {
    // 该逻辑已随渲染层迁入 PuffsTagSidebarView（自动展开是视图会话状态，不属于关系层）
    const view = Object.create(PuffsTagSidebarView.prototype) as any;
    const expandedTags = new Set<string>();
    view.autoExpandedTag = null;
    view.autoExpandedWasAlreadyExpanded = false;
    view.plugin = {
      expandedTags,
      isPinnedOnlyTagResult: vi.fn(() => true),
      clearInlineHierarchyBranchState: vi.fn(),
    };

    view.syncAutoSingleSearchResult('唯一', [{ tag: '#唯一' }]);
    expect(expandedTags.has('#唯一')).toBe(true);

    // 用户手动收起后不应被再次自动展开
    expandedTags.delete('#唯一');
    view.syncAutoSingleSearchResult('唯一', [{ tag: '#唯一' }]);
    expect(expandedTags.has('#唯一')).toBe(false);

    view.autoExpandedTag = null;
    view.syncAutoSingleSearchResult('', [{ tag: '#固定' }]);
    expect(expandedTags.has('#固定')).toBe(true);
    expandedTags.delete('#固定');
    view.syncAutoSingleSearchResult('', [{ tag: '#固定' }]);
    expect(expandedTags.has('#固定')).toBe(false);
  });

  it('原子更新父标签并在保存失败时完整回滚', async () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.settings.relations.tagInheritance = {
      childrenByParent: { '#旧父': ['#子'], '#保留父': ['#其他'] },
      excludedPathsByParentChild: { '#旧父': { '#子': ['旧.md'] }, '#保留父': { '#其他': ['保留.md'] } },
      modeByParentChild: {},
      fixedParentByChild: {},
    };
    behavior.sortTagsByVisibleCount = (tags: string[]) => [...tags].sort();
    behavior.refreshHierarchyViews = vi.fn();

    await behavior.setInheritanceParents('#子', ['#新父']);
    expect(behavior.settings.relations.tagInheritance).toEqual({
      childrenByParent: { '#保留父': ['#其他'], '#新父': ['#子'] },
      excludedPathsByParentChild: { '#保留父': { '#其他': ['保留.md'] } },
      modeByParentChild: {},
      fixedParentByChild: {},
    });
    expect(behavior.refreshHierarchyViews).toHaveBeenCalledOnce();

    const snapshot = structuredClone(behavior.settings.relations.tagInheritance);
    behavior.saveSettings.mockRejectedValueOnce(new Error('失败'));
    await expect(behavior.setInheritanceParents('#子', ['#旧父'])).rejects.toThrow('失败');
    expect(behavior.settings.relations.tagInheritance).toEqual(snapshot);
  });

  it('标签改名迁移继承关系、折叠 key 并触发结构失效', () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.settings.relations.tagInheritance = {
      childrenByParent: {
        '#父': ['#旧子'],
        '#旧子': ['#孙'],
      },
      excludedPathsByParentChild: { '#旧子': { '#孙': ['排除.md'] } },
      modeByParentChild: {},
      fixedParentByChild: {},
    };
    behavior.collapsedInlineHierarchyBranches = new Set([
      '#父\u0000tag-group\u0000#旧子',
      '#父\u0000tag-group\u0000#旧子\u0001#孙\u0000original',
      '#旧子\u0000父笔记.md',
    ]);
    behavior.inlineHierarchyExpansionVersion = 0;
    behavior.relationStructureVersion = 3;

    expect(behavior.migrateTagRelations('#旧子', '#新子')).toBe(true);
    expect(behavior.settings.relations.tagInheritance).toEqual({
      childrenByParent: {
        '#父': ['#新子'],
        '#新子': ['#孙'],
      },
      excludedPathsByParentChild: { '#新子': { '#孙': ['排除.md'] } },
      modeByParentChild: {},
      fixedParentByChild: {},
    });
    expect(behavior.collapsedInlineHierarchyBranches).toEqual(new Set([
      '#父\u0000tag-group\u0000#新子',
      '#父\u0000tag-group\u0000#新子\u0001#孙\u0000original',
      '#新子\u0000父笔记.md',
    ]));
    expect(behavior.inlineHierarchyExpansionVersion).toBe(1);
    expect(behavior.relationStructureVersion).toBe(4);
  });

  it('无标签继承关系时仍迁移真实标签内的父子笔记折叠状态', () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.collapsedInlineHierarchyBranches = new Set(['#旧标签\u0000父笔记.md']);
    behavior.inlineHierarchyExpansionVersion = 2;
    behavior.relationStructureVersion = 5;

    expect(behavior.migrateTagRelations('#旧标签', '#新标签')).toBe(false);
    expect(behavior.collapsedInlineHierarchyBranches).toEqual(new Set(['#新标签\u0000父笔记.md']));
    expect(behavior.inlineHierarchyExpansionVersion).toBe(3);
    expect(behavior.relationStructureVersion).toBe(5);
  });

  it('继承子标签使用独立菜单标识，不冒充顶层标签', () => {
    const behavior = Object.create(TagPaneBehavior.prototype) as any;
    const tagEl = {
      dataset: {
        puffsInheritanceTag: '#子标签',
      },
    };
    expect(behavior.findTagForElement({}, tagEl)).toBe('#子标签');
    expect(tagEl.dataset).not.toHaveProperty('puffsTag');
  });

  it('建立父子关系后继承立即生效，无需再开开关', async () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.refreshHierarchyViews = vi.fn();

    await behavior.setInheritanceChildren('#父', ['#子']);
    expect(behavior.settings.relations.tagInheritance.childrenByParent['#父']).toEqual(['#子']);
    // 继承开关已移除，邻接表里出现即生效
    expect(behavior.getSortedTagInheritanceAdjacency()['#父']).toEqual(['#子']);

    await behavior.setInheritanceChildren('#父', []);
    expect(behavior.getSortedTagInheritanceAdjacency()['#父']).toBeUndefined();
  });

  it('保存失败时完整回滚', async () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.refreshHierarchyViews = vi.fn();
    const snapshot = structuredClone(behavior.settings.relations.tagInheritance);
    behavior.saveSettings.mockRejectedValueOnce(new Error('失败'));

    await expect(behavior.setInheritanceChildren('#新父', ['#子'])).rejects.toThrow('失败');
    expect(behavior.settings.relations.tagInheritance).toEqual(snapshot);
    expect(behavior.refreshHierarchyViews).not.toHaveBeenCalled();
  });

  it('新增关系默认为继承，可切换为交集', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), [
      '父.md', '子一.md', '子二.md',
    ]) as any;
    behavior.tagFileIndex = new Map([
      ['#父', [behavior.app.vault.getAbstractFileByPath('父.md')]],
      ['#子', [behavior.app.vault.getAbstractFileByPath('子一.md'), behavior.app.vault.getAbstractFileByPath('子二.md')]],
    ]);

    await behavior.setInheritanceChildren('#父', ['#子']);
    expect(behavior.getTagInheritanceMode('#父', '#子')).toBe('all');

    await behavior.setTagInheritanceMode('#父', '#子', 'intersection');
    expect(behavior.getTagInheritanceMode('#父', '#子')).toBe('intersection');
  });

  it('候选按路径去重并保留全部来源，固定路径始终显示', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), [
      '父.md', '选中.md', '未选.md', '共享.md', '固定.md',
    ]) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = {
      '#父': ['#子一', '#子二', '#父-固定'],
    };
    // 「未选.md」现在靠排除名单藏起来，不再需要白名单
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = {
      '#父': { '#子二': ['未选.md', '共享.md'] },
    };
    behavior.settings.relations.tagInheritance.fixedParentByChild = { '#父-固定': '#父' };
    behavior.tagFileIndex = new Map([
      ['#父', [behavior.app.vault.getAbstractFileByPath('父.md')]],
      ['#子一', [behavior.app.vault.getAbstractFileByPath('选中.md'), behavior.app.vault.getAbstractFileByPath('共享.md')]],
      ['#子二', [behavior.app.vault.getAbstractFileByPath('未选.md'), behavior.app.vault.getAbstractFileByPath('共享.md')]],
      ['#父-固定', [behavior.app.vault.getAbstractFileByPath('固定.md')]],
    ]);

    const firstCandidates = behavior.getInheritanceCandidates('#父', '#子一');
    const secondCandidates = behavior.getInheritanceCandidates('#父', '#子二');
    expect(firstCandidates.find((candidate: any) => candidate.path === '共享.md').sources).toEqual(['#子一']);
    expect(secondCandidates.find((candidate: any) => candidate.path === '共享.md').sources).toEqual(['#子二']);
    expect(behavior.getInheritanceCandidates('#父', '#父-固定').find((candidate: any) => candidate.path === '固定.md').fixed).toBe(true);
    expect(behavior.getTagBrowseData('#父').files.map((file: any) => file.path))
      .toEqual(['父.md', '选中.md', '共享.md', '固定.md']);
  });

  it('切到交集会清空该边的排除名单', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), [
      '一.md', '二.md',
    ]) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#父': ['#子'] };
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = { '#父': { '#子': ['二.md'] } };
    behavior.tagFileIndex = new Map([['#子', [
      behavior.app.vault.getAbstractFileByPath('一.md'),
      behavior.app.vault.getAbstractFileByPath('二.md'),
    ]]]);

    await behavior.setTagInheritanceMode('#父', '#子', 'intersection');
    expect(behavior.getExcludedInheritedPaths('#父', '#子')).toEqual([]);
    // 交集边不再向上传继承笔记，成员改由两标签的共同笔记实时算出
    expect(behavior.getTagBrowseData('#父').inheritedFiles).toEqual([]);
  });

  it('模式切换保存失败时完整回滚', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), ['一.md']) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#父': ['#子'] };
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = { '#父': { '#子': ['一.md'] } };
    behavior.tagFileIndex = new Map([['#子', [behavior.app.vault.getAbstractFileByPath('一.md')]]]);
    behavior.saveSettings.mockRejectedValueOnce(new Error('失败'));

    await expect(behavior.setTagInheritanceMode('#父', '#子', 'intersection')).rejects.toThrow('失败');
    expect(behavior.getTagInheritanceMode('#父', '#子')).toBe('all');
    expect(behavior.getExcludedInheritedPaths('#父', '#子')).toEqual(['一.md']);
  });

  it('排除名单跟随笔记路径变更并使用短菜单文案', () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = { '#父': { '#子': ['旧.md', '删除.md'] } };
    behavior.handleRelationFileRename(new (TFile as any)('目录/新.md'), '旧.md');
    behavior.handleRelationFileDelete(new (TFile as any)('删除.md'));

    expect(behavior.settings.relations.tagInheritance.excludedPathsByParentChild).toEqual({ '#父': { '#子': ['目录/新.md'] } });
    expect(behavior.getInheritedFileRemovalTitle('#很长的父标签')).toBe('从 很长的父标签 中排除');
  });

  it('不同直接子关系独立过滤，右键排除一次写入全部来源', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), [
      '甲.md', '乙.md', '共享.md',
    ]) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#父': ['#子一', '#子二'] };
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = { '#父': { '#子二': ['乙.md'] } };
    behavior.tagFileIndex = new Map([
      ['#子一', ['甲.md', '共享.md'].map((path) => behavior.app.vault.getAbstractFileByPath(path))],
      ['#子二', ['乙.md', '共享.md'].map((path) => behavior.app.vault.getAbstractFileByPath(path))],
    ]);

    expect(behavior.getTagBrowseData('#父').inheritedFiles.map((file: any) => file.path)).toEqual(['甲.md', '共享.md']);
    // 共享.md 来自两条边，右键排除要一次写进两条边、只落盘一次
    await behavior.setInheritedFileVisible('#父', '共享.md', false);
    expect(behavior.getExcludedInheritedPaths('#父', '#子一')).toEqual(['共享.md']);
    expect(behavior.getExcludedInheritedPaths('#父', '#子二')).toEqual(['乙.md', '共享.md']);
    expect(behavior.getTagBrowseData('#父').inheritedFiles.map((file: any) => file.path)).toEqual(['甲.md']);
    expect(behavior.saveSettings).toHaveBeenCalledOnce();
  });

  it('深层新增的笔记默认冒到祖先，无需在祖先侧做任何登记', () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), [
      '孙一.md', '孙二.md',
    ]) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#父': ['#子'], '#子': ['#孙'] };
    behavior.tagFileIndex = new Map([['#孙', [behavior.app.vault.getAbstractFileByPath('孙一.md')]]]);

    expect(behavior.getTagBrowseData('#父').inheritedFiles.map((file: any) => file.path)).toEqual(['孙一.md']);

    // 给最深处新增一篇，祖先侧不做任何改动就该看得到 —— 这是单名单化最直接的收益
    behavior.tagFileIndex.get('#孙').push(behavior.app.vault.getAbstractFileByPath('孙二.md'));
    expect(behavior.getTagBrowseData('#父').inheritedFiles.map((file: any) => file.path)).toEqual(['孙一.md', '孙二.md']);
  });

  it('在祖先侧排除一篇只影响祖先，不影响中间层', async () => {
    const paths = ['甲.md', '乙.md', '丙.md'];
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), paths) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#爱情': ['#亲昵'], '#亲昵': ['#言语'] };
    behavior.tagFileIndex = new Map([
      ['#言语', paths.map((path) => behavior.app.vault.getAbstractFileByPath(path))],
    ]);

    expect(behavior.getTagBrowseData('#爱情').inheritedFiles.map((file: any) => file.path)).toEqual(paths);

    await behavior.setInheritedFileVisibleForEdge('#爱情', '#亲昵', '丙.md', false);
    expect(behavior.getExcludedInheritedPaths('#爱情', '#亲昵')).toEqual(['丙.md']);
    expect(behavior.getTagBrowseData('#爱情').inheritedFiles.map((file: any) => file.path)).toEqual(['甲.md', '乙.md']);
    expect(behavior.getTagBrowseData('#亲昵').inheritedFiles.map((file: any) => file.path)).toEqual(paths);
  });

  it('恢复一篇笔记会清掉整条路径上每一层的排除记录', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), ['孙.md']) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#父': ['#子'], '#子': ['#孙'] };
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = {
      '#父': { '#子': ['孙.md'] },
      '#子': { '#孙': ['孙.md'] },
    };
    behavior.tagFileIndex = new Map([['#孙', [behavior.app.vault.getAbstractFileByPath('孙.md')]]]);

    expect(behavior.getTagBrowseData('#父').inheritedFiles).toEqual([]);

    // 只在最深那条边恢复，祖先边上的排除记录也要一并摘掉，否则还是冒不上去
    await behavior.setInheritedFileVisibleForEdge('#子', '#孙', '孙.md', true);
    expect(behavior.getExcludedInheritedPaths('#子', '#孙')).toEqual([]);
    expect(behavior.getExcludedInheritedPaths('#父', '#子')).toEqual([]);
    expect(behavior.getTagBrowseData('#父').inheritedFiles.map((file: any) => file.path)).toEqual(['孙.md']);
  });

  it('多路径逐层判定，任一条完整放行即可显示', () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), ['共享.md']) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = {
      '#根': ['#左', '#右'], '#左': ['#叶'], '#右': ['#叶'],
    };
    // 左路被拦下，右路通畅 —— 只要有一条路走得通就显示
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = {
      '#左': { '#叶': ['共享.md'] },
    };
    behavior.tagFileIndex = new Map([['#叶', [behavior.app.vault.getAbstractFileByPath('共享.md')]]]);

    expect(behavior.getInheritanceCandidates('#根', '#左')).toEqual([]);
    expect(behavior.getInheritanceCandidates('#根', '#右').map((candidate: any) => candidate.path)).toEqual(['共享.md']);
    expect(behavior.getTagBrowseData('#根').inheritedFiles.map((file: any) => file.path)).toEqual(['共享.md']);

    // 把右路也拦下，两条路都不通，笔记消失
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild['#右'] = { '#叶': ['共享.md'] };
    expect(behavior.getTagBrowseData('#根').inheritedFiles).toEqual([]);
  });

  it('固定边只豁免自身，混合路径仍受普通边过滤', () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), ['固定后代.md']) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#根': ['#自由'], '#自由': ['#固定'] };
    behavior.settings.relations.tagInheritance.fixedParentByChild = { '#固定': '#自由' };
    behavior.tagFileIndex = new Map([['#固定', [behavior.app.vault.getAbstractFileByPath('固定后代.md')]]]);

    const candidate = behavior.getInheritanceCandidates('#根', '#自由')[0];
    expect(candidate.path).toBe('固定后代.md');
    expect(candidate.fixed).toBe(false);
    expect(behavior.getTagBrowseData('#根').inheritedFiles.map((file: any) => file.path)).toEqual(['固定后代.md']);
    expect(behavior.isFixedInheritedFileForTag('#根', '固定后代.md')).toBe(false);
    // 上层的排除名单仍然拦得住 —— 固定边只豁免它自己那一段
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = { '#根': { '#自由': ['固定后代.md'] } };
    expect(behavior.getTagBrowseData('#根').inheritedFiles).toEqual([]);

    behavior.settings.relations.tagInheritance.fixedParentByChild['#自由'] = '#根';
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = {};
    expect(behavior.getTagBrowseData('#根').inheritedFiles.map((file: any) => file.path)).toEqual(['固定后代.md']);
    expect(behavior.isFixedInheritedFileForTag('#根', '固定后代.md')).toBe(true);
  });

  it('可见性写入保存失败时完整回滚', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), ['孙.md']) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#父': ['#子'], '#子': ['#孙'] };
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = { '#子': { '#孙': ['孙.md'] } };
    behavior.tagFileIndex = new Map([['#孙', [behavior.app.vault.getAbstractFileByPath('孙.md')]]]);
    behavior.saveSettings.mockRejectedValueOnce(new Error('失败'));

    await expect(behavior.setInheritedFileVisibleForEdge('#子', '#孙', '孙.md', true)).rejects.toThrow('失败');
    expect(behavior.settings.relations.tagInheritance.excludedPathsByParentChild).toEqual({
      '#子': { '#孙': ['孙.md'] },
    });
  });

  it('标签内嵌套卡片优先使用标签 alias，再回退到关系 alias 和文件名', () => {
    const behavior = attachFiles(createBehavior({
      childrenByParentPath: { '父.md': ['子.md'] },
      displayNamesByParentPath: { '父.md': { '子.md': '关系别名' } },
    }), ['父.md', '子.md'], { '子.md': ['标签别名', '关系别名'] });
    behavior.settings.noteDisplayNameByTag = { '#标签': { '子.md': '标签别名' } };
    const child = behavior.app.vault.getAbstractFileByPath('子.md');

    expect(behavior.getInlineHierarchyDisplayName('#标签', '父.md', child)).toBe('标签别名');
    delete behavior.settings.noteDisplayNameByTag['#标签']['子.md'];
    expect(behavior.getInlineHierarchyDisplayName('#标签', '父.md', child)).toBe('关系别名');
    delete behavior.settings.relations.noteHierarchy.displayNamesByParentPath['父.md']['子.md'];
    expect(behavior.getInlineHierarchyDisplayName('#标签', '父.md', child)).toBe('子');
  });

  it('支持多父一子并把子笔记 alias 写入每条新关系', async () => {
    const behavior = attachFiles(createBehavior({
      childrenByParentPath: {},
      displayNamesByParentPath: {},
    }), ['父一.md', '父二.md', '子.md'], { '子.md': ['子别名'] });

    await behavior.addNoteHierarchyEdges(
      [{ path: '父一.md' }, { path: '父二.md' }],
      [{ path: '子.md', displayName: '子别名' }]
    );

    expect(behavior.settings.relations.noteHierarchy.childrenByParentPath).toEqual({
      '父一.md': ['子.md'],
      '父二.md': ['子.md'],
    });
    expect(behavior.settings.relations.noteHierarchy.displayNamesByParentPath).toEqual({
      '父一.md': { '子.md': '子别名' },
      '父二.md': { '子.md': '子别名' },
    });
    expect(behavior.saveSettings).toHaveBeenCalledOnce();
  });

  it('发现循环时保持原数据且不保存', async () => {
    const behavior = attachFiles(createBehavior({
      childrenByParentPath: { '甲.md': ['乙.md'] },
      displayNamesByParentPath: {},
    }), ['甲.md', '乙.md']);

    await expect(behavior.addNoteHierarchyEdges(
      [{ path: '乙.md' }],
      [{ path: '甲.md' }]
    )).rejects.toThrow('循环');
    expect(behavior.settings.relations.noteHierarchy.childrenByParentPath).toEqual({ '甲.md': ['乙.md'] });
    expect(behavior.saveSettings).not.toHaveBeenCalled();
  });

  it('保存失败时回滚整批关系，不留下部分结果', async () => {
    const behavior = attachFiles(createBehavior({
      childrenByParentPath: { '原父.md': ['原子.md'] },
      displayNamesByParentPath: { '原父.md': { '原子.md': '原别名' } },
    }), ['原父.md', '原子.md', '新父.md', '新子.md'], { '新子.md': ['新别名'] });
    behavior.saveSettings.mockRejectedValueOnce(new Error('写入失败'));

    await expect(behavior.addNoteHierarchyEdges(
      [{ path: '新父.md' }],
      [{ path: '新子.md', displayName: '新别名' }]
    )).rejects.toThrow('写入失败');
    expect(behavior.settings.relations.noteHierarchy).toEqual({
      childrenByParentPath: { '原父.md': ['原子.md'] },
      displayNamesByParentPath: { '原父.md': { '原子.md': '原别名' } },
    });
    expect(behavior.refreshHierarchyViews).not.toHaveBeenCalled();
  });

  it('父卡片递归后代数量按路径去重', () => {
    const behavior = attachFiles(createBehavior({
      childrenByParentPath: {
        '父.md': ['子一.md', '子二.md'],
        '子一.md': ['孙.md'],
        '子二.md': ['孙.md'],
      },
      displayNamesByParentPath: {},
    }), ['父.md', '子一.md', '子二.md', '孙.md']);

    const parent = behavior.getHierarchyParentItems('').find((item: any) => item.parentPath === '父.md');
    expect(parent.descendantCount).toBe(3);
  });

  it('父条件只筛选分支，只有子条件生成子笔记匹配目标', () => {
    const behavior = attachFiles(createBehavior({
      childrenByParentPath: {
        '父.md': ['子.md'],
        '另一父.md': ['另一子.md'],
      },
      displayNamesByParentPath: {
        '父.md': { '子.md': '关系子别名' },
      },
    }), ['父.md', '子.md', '另一父.md', '另一子.md'], {
      '父.md': ['父别名'],
      '子.md': ['子别名', '关系子别名'],
    });

    const parentOnly = behavior.getHierarchyParentItems('父别名');
    expect(parentOnly.map((item: any) => item.parentPath)).toEqual(['父.md']);
    expect(parentOnly[0].matchingPaths.size).toBe(0);
    expect(parentOnly[0]).not.toHaveProperty('parentMatch');

    const parentAndChild = behavior.getHierarchyParentItems('父别名*关系子别名');
    expect(parentAndChild.map((item: any) => item.parentPath)).toEqual(['父.md']);
    expect(Array.from(parentAndChild[0].matchingPaths)).toEqual(['子.md']);
    expect(parentAndChild[0]).not.toHaveProperty('parentMatch');
  });

  it('按当前笔记路径合并其父级分支与自身子树，并只高亮当前子卡片', () => {
    const behavior = attachFiles(createBehavior({
      childrenByParentPath: {
        '祖.md': ['目录/当前.md'],
        '目录/当前.md': ['子.md'],
      },
      displayNamesByParentPath: {},
    }), ['祖.md', '目录/当前.md', '子.md']);

    const items = behavior.getHierarchyParentItems('', '目录/当前.md');
    expect(items.map((item: any) => item.parentPath).sort()).toEqual(['祖.md', '目录/当前.md'].sort());
    expect(Array.from(items.find((item: any) => item.parentPath === '祖.md').matchingPaths)).toEqual(['目录/当前.md']);
    expect(items.find((item: any) => item.parentPath === '祖.md').forceExpand).toBe(true);
    expect(items.find((item: any) => item.parentPath === '目录/当前.md').matchingPaths.size).toBe(0);
  });

  it('当前笔记关系只按完整路径匹配，同名笔记不混入结果', () => {
    const behavior = attachFiles(createBehavior({
      childrenByParentPath: {
        '父甲.md': ['甲/同名.md'],
        '父乙.md': ['乙/同名.md'],
      },
      displayNamesByParentPath: {},
    }), ['父甲.md', '父乙.md', '甲/同名.md', '乙/同名.md']);

    const items = behavior.getHierarchyParentItems('', '甲/同名.md');
    expect(items.map((item: any) => item.parentPath)).toEqual(['父甲.md']);
    expect(Array.from(items[0].matchingPaths)).toEqual(['甲/同名.md']);
  });

  it('没有当前笔记路径时退化为全部父子关系', () => {
    const behavior = attachFiles(createBehavior({
      childrenByParentPath: { '父甲.md': ['子甲.md'], '父乙.md': ['子乙.md'] },
      displayNamesByParentPath: {},
    }), ['父甲.md', '子甲.md', '父乙.md', '子乙.md']);

    expect(behavior.getHierarchyParentItems('', '').map((item: any) => item.parentPath).sort()).toEqual(['父甲.md', '父乙.md'].sort());
  });

  it('右键目标子笔记时仅在同一父级内移动到其下方', async () => {
    const behavior = attachFiles(createBehavior({
      childrenByParentPath: {
        '父.md': ['甲.md', '乙.md', '丙.md'],
        '另一父.md': ['甲.md', '丁.md'],
      },
      displayNamesByParentPath: {},
    }), ['父.md', '另一父.md', '甲.md', '乙.md', '丙.md', '丁.md']);
    behavior.selectedNoteOrderTarget = { hierarchyParent: '父.md', path: '甲.md' };
    behavior.refreshNoteOrderSelectionState = vi.fn();

    await expect(behavior.moveSelectedHierarchyNoteAfter('父.md', '乙.md')).resolves.toBe(true);
    expect(behavior.getHierarchyChildren('父.md')).toEqual(['乙.md', '甲.md', '丙.md']);
    expect(behavior.getHierarchyChildren('另一父.md')).toEqual(['甲.md', '丁.md']);
    expect(behavior.saveSettings).toHaveBeenCalledOnce();
  });
});

describe('固定子标签', () => {
  it('只接受单连字符、唯一且同名前缀的父子关系', () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = {
      '#秘境': ['#秘境-开始', '#秘境-阶段-开始', '#其他-结束'],
    };

    expect(behavior.parseFixedChildTag('#秘境-开始')).toEqual({ parent: '#秘境', displayName: '开始' });
    expect(behavior.parseFixedChildTag('#秘境-阶段-开始')).toBeNull();
    expect(behavior.isFixedTagRelationEligible('#秘境', '#秘境-开始')).toBe(true);
    expect(behavior.isFixedTagRelationEligible('#秘境', '#其他-结束')).toBe(false);

    behavior.settings.relations.tagInheritance.childrenByParent['#另一父'] = ['#秘境-开始'];
    expect(behavior.isFixedTagRelationEligible('#秘境', '#秘境-开始')).toBe(false);
  });

  it('固定时取消子标签置顶，解除固定时保留普通父子关系', async () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#秘境': ['#秘境-开始'] };
    behavior.settings.pinnedTag = '#秘境-开始';
    behavior.refreshHierarchyViews = vi.fn();

    await behavior.setFixedTagRelation('#秘境', '#秘境-开始', true);
    expect(behavior.getFixedParent('#秘境-开始')).toBe('#秘境');
    expect(behavior.settings.pinnedTag).toBeNull();

    await behavior.setFixedTagRelation('#秘境', '#秘境-开始', false);
    expect(behavior.getFixedParent('#秘境-开始')).toBeNull();
    expect(behavior.getInheritanceChildren('#秘境')).toEqual(['#秘境-开始']);
  });

  it('保存固定状态失败时回滚固定映射和置顶状态', async () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#秘境': ['#秘境-开始'] };
    behavior.settings.pinnedTag = '#秘境-开始';
    behavior.refreshHierarchyViews = vi.fn();
    behavior.saveSettings.mockRejectedValueOnce(new Error('写入失败'));

    await expect(behavior.setFixedTagRelation('#秘境', '#秘境-开始', true)).rejects.toThrow('写入失败');
    expect(behavior.settings.relations.tagInheritance.fixedParentByChild).toEqual({});
    expect(behavior.settings.pinnedTag).toBe('#秘境-开始');
    expect(behavior.refreshHierarchyViews).not.toHaveBeenCalled();
  });

  it('固定期间拒绝第二父级，删除唯一关系时同步清除固定状态', async () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#秘境': ['#秘境-开始'] };
    behavior.settings.relations.tagInheritance.fixedParentByChild = { '#秘境-开始': '#秘境' };
    behavior.refreshHierarchyViews = vi.fn();

    await expect(behavior.setInheritanceParents('#秘境-开始', ['#秘境', '#其他']))
      .rejects.toThrow('请先解除固定');
    await behavior.setInheritanceParents('#秘境-开始', []);

    expect(behavior.getInheritanceParents('#秘境-开始')).toEqual([]);
    expect(behavior.getFixedParent('#秘境-开始')).toBeNull();
  });

  it('改名后仅在仍符合命名规则时保留固定状态', () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#秘境': ['#秘境-开始'] };
    behavior.settings.relations.tagInheritance.fixedParentByChild = { '#秘境-开始': '#秘境' };
    behavior.collapsedInlineHierarchyBranches = new Set();

    behavior.migrateTagRelations('#秘境-开始', '#秘境-结束');
    expect(behavior.getFixedParent('#秘境-结束')).toBe('#秘境');

    behavior.migrateTagRelations('#秘境-结束', '#冒险-结束');
    expect(behavior.getFixedParent('#冒险-结束')).toBeNull();
    expect(behavior.getInheritanceParents('#冒险-结束')).toEqual(['#秘境']);
  });

  it('加载 v2 数据时清理不满足规则的固定映射并升级到最新版本', () => {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    behavior.settings = {
      relations: {
        version: 2,
        tagInheritance: {
          childrenByParent: { '#秘境': ['#秘境-开始', '#其他-结束'] },
          excludedPathsByParent: {},
          fixedParentByChild: {
            '#秘境-开始': '#秘境',
            '#其他-结束': '#秘境',
            '#不存在-开始': '#不存在',
          },
        },
        noteHierarchy: { childrenByParentPath: {}, displayNamesByParentPath: {} },
      },
    };

    behavior.normalizeRelationSettings(behavior.settings.relations);
    expect(behavior.settings.relations.tagInheritance.fixedParentByChild).toEqual({
      '#秘境-开始': '#秘境',
    });
    expect(behavior.initializeTagInheritanceOrder()).toBe(true);
    // 迁移的语义是「推进到最新版」，跟着常量走，避免每次加新特性都要改断言
    expect(behavior.settings.relations.version).toBe(RELATIONS_VERSION);
  });

  it('固定边豁免排除名单，自由边照常受排除', () => {
    const behavior = attachFiles(
      createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }),
      ['父.md', '子.md', '自由.md']
    ) as any;
    behavior.tagFileIndex = new Map([
      ['#秘境', [behavior.app.vault.getAbstractFileByPath('父.md')]],
      ['#秘境-开始', [behavior.app.vault.getAbstractFileByPath('子.md')]],
      ['#自由', [behavior.app.vault.getAbstractFileByPath('自由.md')]],
    ]);
    behavior.settings.relations.tagInheritance.childrenByParent = {
      '#秘境': ['#秘境-开始', '#自由'],
    };
    behavior.settings.relations.tagInheritance.fixedParentByChild = { '#秘境-开始': '#秘境' };
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = {
      '#秘境': { '#秘境-开始': ['子.md'], '#自由': ['自由.md'] },
    };

    // 子.md 虽在排除名单里，但走的是固定边，仍然可见；自由.md 被自由边的排除挡下
    const browseData = behavior.getTagBrowseData('#秘境');
    expect(browseData.files.map((file: any) => file.path)).toEqual(['父.md', '子.md']);
    expect(behavior.isFixedInheritedFileForTag('#秘境', '子.md')).toBe(true);
    // 被排除的笔记仍记录来源，便于在弹窗里恢复
    expect(browseData.sourcesByPath.get('自由.md')).toEqual(['#自由']);
  });

  it('搜索固定子标签时只返回父级及匹配分支', () => {
    const behavior = Object.create(TagPaneBehavior.prototype) as any;
    const parentBrowse = {
      files: [{ path: '父.md' }, { path: '子.md' }], exactCount: 1, inheritedCount: 1,
      hasInheritance: true,
      hasActiveInheritance: true, sourcesByPath: new Map(), inheritanceTree: {},
    };
    const filteredBrowse = {
      ...parentBrowse, files: [{ path: '子.md' }], exactCount: 0, fixedSearchTags: ['#秘境-开始'],
    };
    behavior.getTagInheritanceSettings = () => ({ fixedParentByChild: { '#秘境-开始': '#秘境' } });
    behavior.getTopLevelFixedParent = () => '#秘境';
    behavior.isFixedChild = (tag: string) => tag === '#秘境-开始';
    behavior.getTagBrowseData = () => parentBrowse;
    behavior.createFixedSearchBrowseData = () => filteredBrowse;
    behavior.getTagDomEntries = () => new Map([['#秘境', { tag: '#秘境' }], ['#秘境-开始', { tag: '#秘境-开始' }]]);
    behavior.getLogicalTagSet = () => new Set(['#秘境', '#秘境-开始']);

    const items = behavior.getListModeItems({}, '开始', false);
    expect(items).toHaveLength(1);
    expect(items[0].tag).toBe('#秘境');
    expect(items[0].fixedSearchTags).toEqual(['#秘境-开始']);
    expect(items[0].files).toEqual([{ path: '子.md' }]);
  });
});

describe('侧边栏快捷搜索键', () => {
  function createView(focused: boolean, value = '已输入') {
    const view = Object.create(PuffsTagSidebarView.prototype) as any;
    const inputEl: any = { value, isConnected: true, focus: vi.fn() };
    inputEl.ownerDocument = { activeElement: focused ? inputEl : { tag: '别处' } };
    view.searchComponent = { inputEl, setValue: vi.fn((next: string) => { inputEl.value = next; }) };
    view.searchQuery = value;
    view.isShowingSearch = true;
    view.syncSearchVisibility = vi.fn();
    view.render = vi.fn();
    return { view, inputEl };
  }

  it('焦点不在搜索框时移入焦点并保留已输入内容', () => {
    const { view, inputEl } = createView(false);

    view.handleQuickSearchHotkey();

    expect(inputEl.focus).toHaveBeenCalled();
    expect(view.searchQuery).toBe('已输入');
    expect(view.searchComponent.setValue).not.toHaveBeenCalled();
  });

  it('搜索框未展开时先展开再聚焦', () => {
    const { view, inputEl } = createView(false, '');
    view.isShowingSearch = false;

    view.handleQuickSearchHotkey();

    expect(view.isShowingSearch).toBe(true);
    expect(view.syncSearchVisibility).toHaveBeenCalled();
    expect(inputEl.focus).toHaveBeenCalled();
  });

  it('焦点已在搜索框时清空内容，焦点留在原地', () => {
    const { view, inputEl } = createView(true);

    view.handleQuickSearchHotkey();

    expect(view.searchComponent.setValue).toHaveBeenCalledWith('');
    expect(view.searchQuery).toBe('');
    expect(view.render).toHaveBeenCalled();
    expect(inputEl.focus).not.toHaveBeenCalled();
  });
});

describe('定位父子关系', () => {
  function createLocateBehavior(hierarchyParents: string[]) {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    const file = new (TFile as any)('笔记.md');
    const cardEl = {};
    const sidebarView = { containerEl: { contains: (el: any) => el === cardEl } };
    behavior.app = {
      vault: { getAbstractFileByPath: (path: string) => (path === '笔记.md' ? file : null) },
      workspace: {
        getLeavesOfType: (type: string) => (type === 'puffs-tag-sidebar' ? [{ view: sidebarView }] : []),
      },
    };
    behavior.getHierarchyParents = () => hierarchyParents;
    behavior.pushHierarchyNavigationForView = vi.fn();
    return { behavior, cardEl, sidebarView };
  }

  it('在自绘侧边栏里定位，而不是已经不存在的核心标签面板', () => {
    const { behavior, cardEl, sidebarView } = createLocateBehavior(['父.md']);

    behavior.openHierarchyForNote('笔记.md', cardEl);

    // 有父级时用「==子名」直接落到该笔记所在的父子分支
    expect(behavior.pushHierarchyNavigationForView)
      .toHaveBeenCalledWith(sidebarView, 'sidebar', '==笔记');
  });

  it('没有父级时用「=笔记名」把它当作父节点展开', () => {
    const { behavior, cardEl, sidebarView } = createLocateBehavior([]);

    behavior.openHierarchyForNote('笔记.md', cardEl);

    expect(behavior.pushHierarchyNavigationForView)
      .toHaveBeenCalledWith(sidebarView, 'sidebar', '=笔记');
  });

  it('找不到承载该卡片的侧边栏时提示而非静默失败', () => {
    const { behavior } = createLocateBehavior(['父.md']);
    (Notice as any).messages = [];

    behavior.openHierarchyForNote('笔记.md', {});

    expect(behavior.pushHierarchyNavigationForView).not.toHaveBeenCalled();
    expect((Notice as any).messages).toEqual(['未找到标签侧边栏，无法定位父子关系']);
  });
});

describe('父子关系定位历史恢复', () => {
  it('重绘完成后立即恢复搜索内容、滚动位置与输入焦点', () => {
    const behavior = Object.create(TagTreeRendererBehavior.prototype) as any;
    const history = { entries: [], index: 0, restoreRequestId: 3 };
    const scrollEl = { isConnected: true, scrollTop: 0 };
    const inputEl = { isConnected: true, focus: vi.fn() };
    const view = {
      searchQuery: '=旧条件',
      hierarchyState: { activeMatchIndex: 2 },
      isShowingSearch: false,
      searchComponent: { inputEl, setValue: vi.fn() },
      syncSearchVisibility: vi.fn(),
      render: vi.fn(),
    };
    behavior.getHierarchyNavigationHistory = vi.fn(() => history);
    behavior.getHierarchyNavigationScrollEl = vi.fn(() => scrollEl);

    behavior.applyHierarchyNavigationSnapshot(view, 'sidebar', {
      query: '原搜索',
      scrollTop: 73,
    });

    expect(view.searchQuery).toBe('原搜索');
    expect(view.searchComponent.setValue).toHaveBeenCalledWith('原搜索');
    expect(view.render).toHaveBeenCalledOnce();
    expect(scrollEl.scrollTop).toBe(73);
    expect(inputEl.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});

describe('搜索态标签列表性能', () => {
  it('先按名称过滤且每个命中标签只计算一次浏览数据', () => {
    const behavior = Object.create(TagPaneBehavior.prototype) as any;
    const tags = Array.from({ length: 100 }, (_, index) => `#无关${index}`);
    tags.push('#目标');
    let browseCalls = 0;
    behavior.getTagInheritanceSettings = () => ({ fixedParentByChild: {} });
    behavior.isFixedChild = () => false;
    behavior.getTagBrowseData = (tag: string) => {
      browseCalls += 1;
      return {
        files: [{ path: `${tag}.md` }], exactCount: 1, inheritedCount: 0,
        hasInheritance: false,
        hasActiveInheritance: false, sourcesByPath: new Map(), inheritanceTree: null,
      };
    };
    behavior.getTagDomEntries = () => new Map(tags.map((tag) => [tag, { tag }]));
    behavior.getLogicalTagSet = () => new Set([...tags, '#关系占位']);

    const items = behavior.getListModeItems({}, '目标', false);

    expect(items.map((item: any) => item.tag)).toEqual(['#目标']);
    expect(browseCalls).toBe(1);
  });
});

describe('v6 -> v7 迁移：选择继承改写成排除名单', () => {
  // #父 ─继承→ #子 ─继承→ #孙
  // 迁移前 #父→#子 是「选择继承」：白名单只放行 子1；深层的 孙2 由排除名单藏起来
  function createMigrationBehavior(overrides: any = {}) {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    const paths = ['父.md', '子1.md', '子2.md', '子3.md', '孙1.md', '孙2.md'];
    const files = new Map(paths.map((path) => [path, new (TFile as any)(path)]));
    behavior.app = { vault: { getAbstractFileByPath: (path: string) => files.get(path) || null } };
    behavior.tagFileIndex = new Map([
      ['#父', [files.get('父.md')]],
      ['#子', [files.get('子1.md'), files.get('子2.md'), files.get('子3.md')]],
      ['#孙', [files.get('孙1.md'), files.get('孙2.md')]],
    ]);
    behavior.settings = {
      relations: {
        version: 6,
        tagInheritance: {
          childrenByParent: { '#父': ['#子'], '#子': ['#孙'] },
          excludedPathsByParentChild: { '#父': { '#子': ['孙2.md'] } },
          modeByParentChild: { '#父': { '#子': 'selected' } },
          includedPathsByParentChild: { '#父': { '#子': ['子1.md'] } },
          fixedParentByChild: {},
          ...overrides,
        },
        noteHierarchy: { childrenByParentPath: {}, displayNamesByParentPath: {} },
      },
    };
    behavior.saveSettings = vi.fn();
    behavior.refreshHierarchyViews = vi.fn();
    return behavior;
  }

  const visiblePaths = (behavior: any, tag: string) =>
    behavior.computeTagBrowseData(tag).files.map((file: any) => file.path);

  // 这个期望值是删除白名单读取链之前、用旧语义实测出来的：
  // #父 看得到 父.md（精确）+ 子1.md（白名单放行）+ 孙1.md（深层未被排除），
  // 子2/子3 不在白名单、孙2.md 在排除名单里。迁移必须原样重现这个集合。
  it('迁移后的可见笔记与旧语义完全一致', () => {
    const behavior = createMigrationBehavior();
    behavior.initializeTagInheritanceOrder();

    expect(visiblePaths(behavior, '#父')).toEqual(['父.md', '子1.md', '孙1.md']);
  });

  it('白名单退场，未放行的笔记落进排除名单', () => {
    const behavior = createMigrationBehavior();
    behavior.initializeTagInheritanceOrder();
    const inheritance = behavior.settings.relations.tagInheritance;

    expect(inheritance.includedPathsByParentChild).toBeUndefined();
    expect(inheritance.modeByParentChild).toEqual({});
    expect([...inheritance.excludedPathsByParentChild['#父']['#子']].sort())
      .toEqual(['子2.md', '子3.md', '孙2.md']);
    // 迁移的语义是「推进到最新版」，跟着常量走，避免每次加新特性都要改断言
    expect(behavior.settings.relations.version).toBe(RELATIONS_VERSION);
  });

  it('白名单为空的边视为误设，直接转成普通继承而不是全部排除', () => {
    const behavior = createMigrationBehavior({
      includedPathsByParentChild: { '#父': { '#子': [] } },
      excludedPathsByParentChild: {},
    });
    behavior.initializeTagInheritanceOrder();
    const inheritance = behavior.settings.relations.tagInheritance;

    expect(inheritance.excludedPathsByParentChild).toEqual({});
    expect(visiblePaths(behavior, '#父')).toEqual(['父.md', '子1.md', '子2.md', '子3.md', '孙1.md', '孙2.md']);
  });

  it('固定边的模式与名单一并清空', () => {
    const behavior = createMigrationBehavior({
      childrenByParent: { '#父': ['#父-子'] },
      fixedParentByChild: { '#父-子': '#父' },
      modeByParentChild: { '#父': { '#父-子': 'selected' } },
      includedPathsByParentChild: { '#父': { '#父-子': ['子1.md'] } },
      excludedPathsByParentChild: { '#父': { '#父-子': ['子2.md'] } },
    });
    behavior.initializeTagInheritanceOrder();
    const inheritance = behavior.settings.relations.tagInheritance;

    expect(inheritance.modeByParentChild).toEqual({});
    expect(inheritance.excludedPathsByParentChild).toEqual({});
  });

  it('迁移幂等：再跑一次不改变结果', () => {
    const behavior = createMigrationBehavior();
    behavior.initializeTagInheritanceOrder();
    const snapshot = JSON.stringify(behavior.settings.relations);

    expect(behavior.initializeTagInheritanceOrder()).toBe(false);
    expect(JSON.stringify(behavior.settings.relations)).toBe(snapshot);
  });
});

describe('交集标签', () => {
  // #宗门 与 #战争 绑交集；#宗门 另有继承子标签 #内门
  function createIntersectionBehavior() {
    const paths = ['宗门一.md', '宗门二.md', '共有.md', '战争独有.md', '内门一.md', '内门战争.md'];
    const behavior = attachFiles(
      createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }),
      paths
    ) as any;
    const fileFor = (path: string) => behavior.app.vault.getAbstractFileByPath(path);
    behavior.tagFileIndex = new Map([
      ['#宗门', [fileFor('宗门一.md'), fileFor('宗门二.md'), fileFor('共有.md')]],
      ['#战争', [fileFor('共有.md'), fileFor('战争独有.md'), fileFor('内门战争.md')]],
      ['#内门', [fileFor('内门一.md'), fileFor('内门战争.md')]],
    ]);
    behavior.settings.relations.tagInheritance.childrenByParent = {
      '#宗门': ['#内门', '#战争'],
      '#战争': ['#宗门'],
    };
    behavior.settings.relations.tagInheritance.modeByParentChild = {
      '#宗门': { '#战争': 'intersection' },
      '#战争': { '#宗门': 'intersection' },
    };
    return behavior;
  }

  const groupsOf = (tree: any) => (tree?.children || [])
    .map((child: any) => [child.tag, child.isIntersection ? '交集' : '继承', child.paths]);

  it('交集组的成员是两标签的共同原生笔记', () => {
    const behavior = createIntersectionBehavior();
    expect(behavior.getIntersectionGroupPaths('#宗门', '#战争')).toEqual(['共有.md']);
    expect(behavior.getIntersectionGroupPaths('#战争', '#宗门')).toEqual(['共有.md']);
  });

  it('两个方向都挂出交集组，显示是对称的', () => {
    const behavior = createIntersectionBehavior();
    expect(groupsOf(behavior.getTagBrowseData('#宗门').inheritanceTree))
      .toContainEqual(['#战争', '交集', ['共有.md']]);
    expect(groupsOf(behavior.getTagBrowseData('#战争').inheritanceTree))
      .toEqual([['#宗门', '交集', ['共有.md']]]);
  });

  it('同一笔记命中多个具体交集分组时保留每个分组，只从原生组移除', () => {
    const behavior = createIntersectionBehavior();
    const sharedSpecificFile = behavior.app.vault.getAbstractFileByPath('宗门二.md');
    behavior.tagFileIndex.get('#战争').push(sharedSpecificFile);
    behavior.tagFileIndex.set('#牺牲', [sharedSpecificFile]);
    behavior.settings.relations.tagInheritance.childrenByParent['#宗门'].push('#牺牲');
    behavior.settings.relations.tagInheritance.childrenByParent['#牺牲'] = ['#宗门'];
    behavior.settings.relations.tagInheritance.modeByParentChild['#宗门']['#牺牲'] = 'intersection';
    behavior.settings.relations.tagInheritance.modeByParentChild['#牺牲'] = { '#宗门': 'intersection' };

    const tree = behavior.getTagBrowseData('#宗门').inheritanceTree;
    const warGroup = tree.children.find((child: any) => child.tag === '#战争');
    const sacrificeGroup = tree.children.find((child: any) => child.tag === '#牺牲');

    expect(tree.paths).not.toContain('宗门二.md');
    expect(warGroup.paths).toContain('宗门二.md');
    expect(sacrificeGroup.paths).toContain('宗门二.md');
  });

  it('交集笔记从「原生」组扣掉，但顶层计数不变', () => {
    const behavior = createIntersectionBehavior();
    const browseData = behavior.getTagBrowseData('#宗门');

    // 原生组只剩两篇，共有.md 挪进了交集组
    expect(browseData.inheritanceTree.paths).toEqual(['宗门一.md', '宗门二.md']);
    // 计数完全不受影响：交集笔记本来就是精确笔记
    expect(browseData.exactCount).toBe(3);
    expect(browseData.files.map((file: any) => file.path))
      .toEqual(['宗门一.md', '宗门二.md', '共有.md', '内门一.md', '内门战争.md']);
  });

  it('交集边对继承笔记零贡献 —— 战争独有的笔记不会冒到宗门', () => {
    const behavior = createIntersectionBehavior();
    expect(behavior.getTagBrowseData('#宗门').inheritedFiles.map((file: any) => file.path))
      .toEqual(['内门一.md', '内门战争.md']);
  });

  it('继承来的笔记留在血缘分组里，不进交集组', () => {
    const behavior = createIntersectionBehavior();
    // 内门战争.md 同时有 #内门 和 #战争，但它靠继承冒到宗门、不是宗门的原生笔记
    const groups = groupsOf(behavior.getTagBrowseData('#宗门').inheritanceTree);
    expect(groups).toContainEqual(['#内门', '继承', ['内门一.md', '内门战争.md']]);
    expect(behavior.getIntersectionGroupPaths('#宗门', '#战争')).not.toContain('内门战争.md');
  });

  it('交集组递归投影对方的继承子树，并始终保留当前标签上下文', () => {
    const behavior = createIntersectionBehavior();
    behavior.settings.relations.tagInheritance.childrenByParent['#战争'].push('#战役');
    behavior.settings.relations.tagInheritance.childrenByParent['#战役'] = ['#前线'];
    behavior.tagFileIndex.set('#战役', [
      behavior.app.vault.getAbstractFileByPath('宗门二.md'),
      behavior.app.vault.getAbstractFileByPath('战争独有.md'),
    ]);
    behavior.tagFileIndex.set('#前线', [behavior.app.vault.getAbstractFileByPath('宗门一.md')]);

    const browseData = behavior.getTagBrowseData('#宗门');
    const intersectionNode = browseData.inheritanceTree.children
      .find((child: any) => child.isIntersection);
    const battleNode = intersectionNode.children.find((child: any) => child.tag === '#战役');
    const frontNode = battleNode.children.find((child: any) => child.tag === '#前线');

    expect(intersectionNode.paths).toEqual(['共有.md']);
    expect(battleNode.paths).toEqual(['宗门二.md']);
    expect(frontNode.paths).toEqual(['宗门一.md']);
    expect(intersectionNode.subtreePaths).toEqual(['共有.md', '宗门二.md', '宗门一.md']);
    expect(battleNode.paths).not.toContain('战争独有.md');
    // 整棵交集投影接走了宗门的三篇直属笔记，原生组不再重复展示。
    expect(browseData.inheritanceTree.paths).toEqual([]);
    // 投影只改变分组展示，宗门自己的文件集合与计数保持原样。
    expect(browseData.files.map((file: any) => file.path))
      .toEqual(['宗门一.md', '宗门二.md', '共有.md', '内门一.md', '内门战争.md']);
    expect([browseData.exactCount, browseData.inheritedCount]).toEqual([3, 2]);
  });

  it('交集投影后代继续应用伙伴继承边的排除名单', () => {
    const behavior = createIntersectionBehavior();
    behavior.settings.relations.tagInheritance.childrenByParent['#战争'].push('#战役');
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = {
      '#战争': { '#战役': ['宗门二.md'] },
    };
    behavior.tagFileIndex.set('#战役', [behavior.app.vault.getAbstractFileByPath('宗门二.md')]);

    const tree = behavior.getTagBrowseData('#宗门').inheritanceTree;
    const intersectionNode = tree.children
      .find((child: any) => child.isIntersection);

    expect(intersectionNode.paths).toEqual(['共有.md']);
    expect(intersectionNode.children).toEqual([]);
    // 被排除而没有进入投影的宗门二.md 必须继续留在宗门原生组。
    expect(tree.paths).toEqual(['宗门一.md', '宗门二.md']);
  });

  it('交集伙伴没有直属交集笔记时，只要继承后代命中上下文仍显示分组', () => {
    const behavior = createIntersectionBehavior();
    behavior.settings.relations.tagInheritance.childrenByParent['#战争'].push('#战役');
    behavior.tagFileIndex.set('#战争', [behavior.app.vault.getAbstractFileByPath('战争独有.md')]);
    behavior.tagFileIndex.set('#战役', [behavior.app.vault.getAbstractFileByPath('宗门二.md')]);

    const tree = behavior.getTagBrowseData('#宗门').inheritanceTree;
    const intersectionNode = tree.children
      .find((child: any) => child.isIntersection);

    expect(intersectionNode.paths).toEqual([]);
    expect(intersectionNode.children.map((child: any) => child.tag)).toEqual(['#战役']);
    expect(intersectionNode.subtreePaths).toEqual(['宗门二.md']);
    expect(tree.paths).toEqual(['宗门一.md', '共有.md']);
  });

  it('交集投影内部由最深继承子标签逐层接走重复笔记', () => {
    const behavior = createIntersectionBehavior();
    behavior.settings.relations.tagInheritance.childrenByParent['#战争'].push('#战役');
    behavior.settings.relations.tagInheritance.childrenByParent['#战役'] = ['#前线'];
    const sharedFile = behavior.app.vault.getAbstractFileByPath('共有.md');
    behavior.tagFileIndex.set('#战役', [sharedFile]);
    behavior.tagFileIndex.set('#前线', [sharedFile]);

    const intersectionNode = behavior.getTagBrowseData('#宗门').inheritanceTree.children
      .find((child: any) => child.isIntersection);
    const battleNode = intersectionNode.children.find((child: any) => child.tag === '#战役');
    const frontNode = battleNode.children.find((child: any) => child.tag === '#前线');

    expect(intersectionNode.paths).toEqual([]);
    expect(battleNode.paths).toEqual([]);
    expect(frontNode.paths).toEqual(['共有.md']);
    expect(intersectionNode.subtreePaths).toEqual(['共有.md']);
  });

  it('交集组与继承子分组按弹窗里的排序混排', () => {
    const behavior = createIntersectionBehavior();
    expect(groupsOf(behavior.getTagBrowseData('#宗门').inheritanceTree).map((g: any) => g[0]))
      .toEqual(['#内门', '#战争']);

    // 把交集排到前面
    behavior.settings.relations.tagInheritance.childrenByParent['#宗门'] = ['#战争', '#内门'];
    expect(groupsOf(behavior.getTagBrowseData('#宗门').inheritanceTree).map((g: any) => g[0]))
      .toEqual(['#战争', '#内门']);
  });

  it('交集为空时不挂出空组', () => {
    const behavior = createIntersectionBehavior();
    behavior.tagFileIndex.set('#战争', [behavior.app.vault.getAbstractFileByPath('战争独有.md')]);
    expect(groupsOf(behavior.getTagBrowseData('#宗门').inheritanceTree).map((g: any) => g[0]))
      .toEqual(['#内门']);
  });

  it('交集签名跟随对方标签的笔记集合变化', () => {
    const behavior = createIntersectionBehavior();
    const before = behavior.getTagBrowseData('#宗门').intersectionSignature;

    // 给宗门二.md 补上 #战争 标签：宗门自己的 files 与计数都没变，只有交集组变了
    behavior.tagFileIndex.get('#战争').push(behavior.app.vault.getAbstractFileByPath('宗门二.md'));
    const after = behavior.getTagBrowseData('#宗门').intersectionSignature;
    expect(after).not.toBe(before);
  });

  it('展开/收起的 key 收集包含交集组，且与同名子标签分组不撞车', () => {
    const behavior = createIntersectionBehavior();
    behavior.settings.relations.tagInheritance.childrenByParent['#战争'].push('#战役');
    behavior.tagFileIndex.set('#战役', [behavior.app.vault.getAbstractFileByPath('宗门二.md')]);
    behavior.collapsedInlineHierarchyBranches = new Set();
    const keys = behavior.getTagInheritanceGroupKeys('#宗门');

    expect(keys.some((key: string) => key.includes('tag-intersection') && key.endsWith('#战争'))).toBe(true);
    expect(keys).toContain(`#宗门\u0000tag-intersection\u0000#战争\u0001#战役`);
    expect(keys).toContain(`#宗门\u0000tag-intersection\u0000#战争\u0000original`);
    expect(keys.some((key: string) => key.includes('tag-group') && key.endsWith('#内门'))).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // 深层交集：#门派 继承 #宗门，而 #宗门 自己与 #战争 绑了交集。
  // 展开 #门派 > 宗门 时应当与顶层展开 #宗门 呈现一致 —— 拆出「原生」与「战争」两组。
  function createNestedIntersectionBehavior() {
    const behavior = createIntersectionBehavior();
    behavior.settings.relations.tagInheritance.childrenByParent['#门派'] = ['#宗门'];
    return behavior;
  }

  const findChild = (node: any, tag: string) =>
    (node?.children || []).find((child: any) => child.tag === tag);

  it('深层节点也拆出自己的交集组', () => {
    const behavior = createNestedIntersectionBehavior();
    const tree = behavior.getTagBrowseData('#门派').inheritanceTree;
    const sectNode = findChild(tree, '#宗门');

    expect(groupsOf(sectNode)).toContainEqual(['#战争', '交集', ['共有.md']]);
    // 交集笔记从该节点的「原生」组扣掉，但仍留在它的 subtreePaths 里
    expect(sectNode.paths).toEqual(['宗门一.md', '宗门二.md']);
    expect(sectNode.subtreePaths).toContain('共有.md');
  });

  it('继承节点自己的交集只要求节点标签，不额外要求祖先标签', () => {
    const behavior = createNestedIntersectionBehavior();
    const browseData = behavior.getTagBrowseData('#门派');
    const sectNode = findChild(browseData.inheritanceTree, '#宗门');
    const intersectionNode = findChild(sectNode, '#战争');

    // 共有.md 同时有宗门与战争，但没有门派；仍显示在 门派 > 宗门 > 战争。
    expect(browseData.exactCount).toBe(0);
    expect(intersectionNode.paths).toEqual(['共有.md']);
  });

  it('祖先到交集持有节点的继承排除仍会挡下深层交集笔记', () => {
    const behavior = createNestedIntersectionBehavior();
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = {
      '#门派': { '#宗门': ['共有.md'] },
    };
    const sectNode = findChild(behavior.getTagBrowseData('#门派').inheritanceTree, '#宗门');

    expect(findChild(sectNode, '#战争')).toBeUndefined();
    expect(sectNode.subtreePaths).not.toContain('共有.md');
  });

  it('深层交集组的笔记归属持有该交集边的标签，而非继承根', () => {
    const behavior = createNestedIntersectionBehavior();
    const sectNode = findChild(behavior.getTagBrowseData('#门派').inheritanceTree, '#宗门');
    const intersectionNode = findChild(sectNode, '#战争');

    expect(intersectionNode.noteTag).toBe('#宗门');
    expect(intersectionNode.children).toEqual([]);
  });

  it('深层交集不改变继承根的计数与笔记集合', () => {
    const behavior = createNestedIntersectionBehavior();
    const browseData = behavior.getTagBrowseData('#门派');

    expect(browseData.exactCount).toBe(0);
    expect(browseData.inheritedFiles.map((file: any) => file.path))
      .toEqual(['宗门一.md', '宗门二.md', '共有.md', '内门一.md', '内门战争.md']);
  });

  it('展开/收起的 key 收集覆盖深层交集组', () => {
    const behavior = createNestedIntersectionBehavior();
    behavior.collapsedInlineHierarchyBranches = new Set();
    const keys = behavior.getTagInheritanceGroupKeys('#门派');

    // key 带完整血缘，避免 #门派 > 宗门 > 战争 与假想的 #门派 > 战争 撞车
    expect(keys).toContain(`#门派 tag-intersection #宗门#战争`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('交集签名覆盖深层节点：伙伴笔记集合变化时签名跟着变', () => {
    const behavior = createNestedIntersectionBehavior();
    const before = behavior.getTagBrowseData('#门派').intersectionSignature;

    // 宗门二.md 补上 #战争：#门派 的 files 与计数不变，只有深层交集组变了
    behavior.tagFileIndex.get('#战争').push(behavior.app.vault.getAbstractFileByPath('宗门二.md'));
    expect(behavior.getTagBrowseData('#门派').intersectionSignature).not.toBe(before);
  });

  it('对账时不会把成对的交集边当成环削掉', () => {
    const behavior = createIntersectionBehavior();
    behavior.reconcileRelationCycles();

    expect(behavior.settings.relations.tagInheritance.childrenByParent['#宗门']).toContain('#战争');
    expect(behavior.settings.relations.tagInheritance.childrenByParent['#战争']).toEqual(['#宗门']);
  });

  it('从继承切到交集时成对写入，并清掉两侧排除名单', async () => {
    const behavior = createIntersectionBehavior();
    const inheritance = behavior.settings.relations.tagInheritance;
    inheritance.childrenByParent = { '#宗门': ['#内门', '#战争'] };
    inheritance.modeByParentChild = {};
    inheritance.excludedPathsByParentChild = {
      '#宗门': { '#战争': ['旧排除.md'] },
      '#战争': { '#宗门': ['反向旧排除.md'] },
    };

    await behavior.setTagInheritanceMode('#宗门', '#战争', 'intersection');

    expect(inheritance.childrenByParent['#宗门']).toEqual(['#内门', '#战争']);
    expect(inheritance.childrenByParent['#战争']).toEqual(['#宗门']);
    expect(inheritance.modeByParentChild).toEqual({
      '#宗门': { '#战争': 'intersection' },
      '#战争': { '#宗门': 'intersection' },
    });
    expect(inheritance.excludedPathsByParentChild).toEqual({});
    expect(behavior.saveSettings).toHaveBeenCalledOnce();
  });

  it('切回继承时只保留当前方向及排序位置，并且只保存一次', async () => {
    const behavior = createIntersectionBehavior();
    const inheritance = behavior.settings.relations.tagInheritance;

    await behavior.setTagInheritanceMode('#宗门', '#战争', 'all');

    expect(inheritance.childrenByParent['#宗门']).toEqual(['#内门', '#战争']);
    expect(inheritance.childrenByParent['#战争']).toBeUndefined();
    expect(inheritance.modeByParentChild).toEqual({});
    expect(behavior.saveSettings).toHaveBeenCalledOnce();
  });

  it('从任一子标签列表移除交集伙伴时两侧一起删除', async () => {
    const behavior = createIntersectionBehavior();
    const inheritance = behavior.settings.relations.tagInheritance;

    await behavior.setInheritanceChildren('#宗门', ['#内门']);

    expect(inheritance.childrenByParent['#宗门']).toEqual(['#内门']);
    expect(inheritance.childrenByParent['#战争']).toBeUndefined();
    expect(inheritance.modeByParentChild).toEqual({});
  });

  it('管理继承父标签不会删掉或改写交集伙伴', async () => {
    const behavior = createIntersectionBehavior();
    const inheritance = behavior.settings.relations.tagInheritance;

    await behavior.setInheritanceParents('#宗门', ['#上级']);

    expect(inheritance.childrenByParent['#上级']).toContain('#宗门');
    expect(inheritance.childrenByParent['#宗门']).toContain('#战争');
    expect(inheritance.childrenByParent['#战争']).toEqual(['#宗门']);
    expect(behavior.isIntersectionEdge('#宗门', '#战争')).toBe(true);
  });

  it('交集伙伴不能再从父标签入口绑定为继承边', async () => {
    const behavior = createIntersectionBehavior();

    await expect(behavior.setInheritanceParents('#宗门', ['#战争']))
      .rejects.toThrow('已有关联');
  });

  it('半条交集边降级为普通继承，孤立标记被清理', () => {
    const behavior = createIntersectionBehavior();
    const inheritance = behavior.settings.relations.tagInheritance;
    delete inheritance.childrenByParent['#战争'];

    expect(behavior.reconcileIntersectionPairs()).toBe(true);
    expect(inheritance.childrenByParent['#宗门']).toContain('#战争');
    expect(inheritance.modeByParentChild).toEqual({});
    expect(behavior.getTagInheritanceMode('#宗门', '#战争')).toBe('all');
  });

  it('交集写入失败与切回继承失败都会整体回滚四张表', async () => {
    const behavior = createIntersectionBehavior();
    const before = JSON.stringify(behavior.settings.relations.tagInheritance);
    behavior.saveSettings = vi.fn().mockRejectedValue(new Error('失败'));

    await expect(behavior.setTagInheritanceMode('#宗门', '#战争', 'all')).rejects.toThrow('失败');
    expect(JSON.stringify(behavior.settings.relations.tagInheritance)).toBe(before);

    behavior.settings.relations.tagInheritance.childrenByParent = { '#宗门': ['#战争'] };
    behavior.settings.relations.tagInheritance.modeByParentChild = {};
    const beforeBinding = JSON.stringify(behavior.settings.relations.tagInheritance);
    await expect(behavior.setTagInheritanceMode('#宗门', '#战争', 'intersection')).rejects.toThrow('失败');
    expect(JSON.stringify(behavior.settings.relations.tagInheritance)).toBe(beforeBinding);
  });
});
