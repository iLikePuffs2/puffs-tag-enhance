import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { RelationsBehavior } from "./relations";
import { TagPaneBehavior } from "./tag-pane";

function createBehavior(noteHierarchy: any, exclusions: Record<string, string[]> = {}) {
  const behavior = Object.create(RelationsBehavior.prototype);
  behavior.settings = {
    relations: {
      version: 1,
      tagInheritance: {
        childrenByParent: {},
        enabledParents: [],
        excludedPathsByParentChild: Object.fromEntries(Object.entries(exclusions).map(([parent, paths]) => [
          parent,
          { '#子': paths },
        ])),
        modeByParentChild: {},
        includedPathsByParentChild: {},
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
      enabledParents: ['#继承'],
      excludedPathsByParentChild: { '#继承': { '#后代': ['后代/排除.md'] } },
      modeByParentChild: {},
      includedPathsByParentChild: {},
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
    expect(behavior.settings.relations.version).toBe(6);
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
      inheritanceEnabled: true,
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
    expect(behavior.toggleInlineHierarchyBranch(firstKey)).toBe(false);

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
    const behavior = Object.create(TagPaneBehavior.prototype) as any;
    behavior.expandedTags = new Set<string>();
    behavior.isPinnedOnlyTagResult = vi.fn(() => true);
    behavior.clearInlineHierarchyBranchState = vi.fn();
    const patch = {
      autoExpandedTag: null,
      autoExpandedWasAlreadyExpanded: false,
    };

    behavior.syncAutoSingleSearchResult({}, patch, [{ tag: '#唯一' }], '唯一');
    expect(behavior.expandedTags.has('#唯一')).toBe(true);

    behavior.expandedTags.delete('#唯一');
    behavior.syncAutoSingleSearchResult({}, patch, [{ tag: '#唯一' }], '唯一');
    expect(behavior.expandedTags.has('#唯一')).toBe(false);

    patch.autoExpandedTag = null;
    behavior.syncAutoSingleSearchResult({}, patch, [{ tag: '#固定' }], '');
    expect(behavior.expandedTags.has('#固定')).toBe(true);
    behavior.expandedTags.delete('#固定');
    behavior.syncAutoSingleSearchResult({}, patch, [{ tag: '#固定' }], '');
    expect(behavior.expandedTags.has('#固定')).toBe(false);
  });

  it('原子更新父标签并在保存失败时完整回滚', async () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.settings.relations.tagInheritance = {
      childrenByParent: { '#旧父': ['#子'], '#保留父': ['#其他'] },
      enabledParents: ['#旧父', '#保留父'],
      excludedPathsByParentChild: { '#旧父': { '#子': ['旧.md'] }, '#保留父': { '#其他': ['保留.md'] } },
      modeByParentChild: {},
      includedPathsByParentChild: {},
      fixedParentByChild: {},
    };
    behavior.sortTagsByVisibleCount = (tags: string[]) => [...tags].sort();
    behavior.refreshHierarchyViews = vi.fn();

    await behavior.setInheritanceParents('#子', ['#新父']);
    expect(behavior.settings.relations.tagInheritance).toEqual({
      childrenByParent: { '#保留父': ['#其他'], '#新父': ['#子'] },
      enabledParents: ['#保留父', '#新父'],
      excludedPathsByParentChild: { '#保留父': { '#其他': ['保留.md'] } },
      modeByParentChild: {},
      includedPathsByParentChild: {},
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
      enabledParents: ['#父', '#旧子'],
      excludedPathsByParentChild: { '#旧子': { '#孙': ['排除.md'] } },
      modeByParentChild: {},
      includedPathsByParentChild: {},
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
      enabledParents: ['#父', '#新子'],
      excludedPathsByParentChild: { '#新子': { '#孙': ['排除.md'] } },
      modeByParentChild: {},
      includedPathsByParentChild: {},
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

  it('新父标签默认启用，已有父标签保留手动关闭状态', async () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.refreshHierarchyViews = vi.fn();

    await behavior.setInheritanceChildren('#父', ['#子']);
    expect(behavior.settings.relations.tagInheritance.enabledParents).toEqual(['#父']);

    behavior.settings.relations.tagInheritance.enabledParents = [];
    await behavior.setInheritanceChildren('#父', ['#子', '#另一个']);
    expect(behavior.settings.relations.tagInheritance.enabledParents).toEqual([]);

    await behavior.setInheritanceChildren('#父', []);
    await behavior.setInheritanceChildren('#父', ['#子']);
    expect(behavior.settings.relations.tagInheritance.enabledParents).toEqual(['#父']);
  });

  it('新父标签默认启用的保存失败时完整回滚', async () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.refreshHierarchyViews = vi.fn();
    const snapshot = structuredClone(behavior.settings.relations.tagInheritance);
    behavior.saveSettings.mockRejectedValueOnce(new Error('失败'));

    await expect(behavior.setInheritanceChildren('#新父', ['#子'])).rejects.toThrow('失败');
    expect(behavior.settings.relations.tagInheritance).toEqual(snapshot);
    expect(behavior.refreshHierarchyViews).not.toHaveBeenCalled();
  });

  it('新增关系默认为全部继承，切换该关系后从当前可见集合开始', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), [
      '父.md', '子一.md', '子二.md',
    ]) as any;
    behavior.tagFileIndex = new Map([
      ['#父', [behavior.app.vault.getAbstractFileByPath('父.md')]],
      ['#子', [behavior.app.vault.getAbstractFileByPath('子一.md'), behavior.app.vault.getAbstractFileByPath('子二.md')]],
    ]);

    await behavior.setInheritanceChildren('#父', ['#子']);

    expect(behavior.getTagInheritanceMode('#父', '#子')).toBe('all');
    await behavior.setTagInheritanceMode('#父', '#子', 'selected');
    expect(behavior.getIncludedInheritedPaths('#父', '#子')).toEqual(['子一.md', '子二.md']);
  });

  it('选择继承按路径去重并保留全部来源，固定路径始终显示', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), [
      '父.md', '选中.md', '未选.md', '共享.md', '固定.md',
    ]) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = {
      '#父': ['#子一', '#子二', '#父-固定'],
    };
    behavior.settings.relations.tagInheritance.enabledParents = ['#父'];
    behavior.settings.relations.tagInheritance.modeByParentChild = {
      '#父': { '#子一': 'selected', '#子二': 'selected' },
    };
    behavior.settings.relations.tagInheritance.includedPathsByParentChild = {
      '#父': { '#子一': ['选中.md', '共享.md'], '#子二': [] },
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

  it('切换模式保持当前可见集合，之后的新笔记遵循目标模式', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), [
      '一.md', '二.md', '新增.md',
    ]) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#父': ['#子'] };
    behavior.settings.relations.tagInheritance.enabledParents = ['#父'];
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = { '#父': { '#子': ['二.md'] } };
    behavior.tagFileIndex = new Map([['#子', [
      behavior.app.vault.getAbstractFileByPath('一.md'),
      behavior.app.vault.getAbstractFileByPath('二.md'),
    ]]]);

    await behavior.setTagInheritanceMode('#父', '#子', 'selected');
    expect(behavior.getIncludedInheritedPaths('#父', '#子')).toEqual(['一.md']);
    expect(behavior.getTagBrowseData('#父').inheritedFiles.map((file: any) => file.path)).toEqual(['一.md']);

    behavior.tagFileIndex.get('#子').push(behavior.app.vault.getAbstractFileByPath('新增.md'));
    expect(behavior.getTagBrowseData('#父').inheritedFiles.map((file: any) => file.path)).toEqual(['一.md']);

    await behavior.setTagInheritanceMode('#父', '#子', 'all');
    expect(behavior.settings.relations.tagInheritance.excludedPathsByParentChild['#父']['#子']).toEqual(['二.md', '新增.md']);
    expect(behavior.getTagBrowseData('#父').inheritedFiles.map((file: any) => file.path)).toEqual(['一.md']);
  });

  it('模式切换保存失败时完整回滚', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), ['一.md']) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#父': ['#子'] };
    behavior.settings.relations.tagInheritance.enabledParents = ['#父'];
    behavior.tagFileIndex = new Map([['#子', [behavior.app.vault.getAbstractFileByPath('一.md')]]]);
    behavior.saveSettings.mockRejectedValueOnce(new Error('失败'));

    await expect(behavior.setTagInheritanceMode('#父', '#子', 'selected')).rejects.toThrow('失败');
    expect(behavior.getTagInheritanceMode('#父', '#子')).toBe('all');
    expect(behavior.settings.relations.tagInheritance.includedPathsByParentChild).toEqual({});
  });

  it('继承名单跟随笔记路径变更并使用短菜单文案', () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }) as any;
    behavior.settings.relations.tagInheritance.includedPathsByParentChild = { '#父': { '#子': ['旧.md', '删除.md'] } };
    behavior.handleRelationFileRename(new (TFile as any)('目录/新.md'), '旧.md');
    behavior.handleRelationFileDelete(new (TFile as any)('删除.md'));

    expect(behavior.settings.relations.tagInheritance.includedPathsByParentChild).toEqual({ '#父': { '#子': ['目录/新.md'] } });
    expect(behavior.getInheritedFileRemovalTitle('#很长的父标签')).toBe('从 很长的父标签 中排除');
  });

  it('v4 父级模式和名单迁移到每条直接子关系并按分支清理', () => {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    behavior.settings = {
      relations: {
        version: 4,
        tagInheritance: {
          childrenByParent: { '#父': ['#子一', '#子二'] },
          enabledParents: ['#父'],
          excludedPathsByParent: { '#父': ['一.md', '二.md', '无关.md'] },
          modeByParent: { '#父': 'selected' },
          includedPathsByParent: { '#父': ['一.md', '二.md', '共享.md', '无关.md'] },
          fixedParentByChild: {},
        },
        noteHierarchy: { childrenByParentPath: {}, displayNamesByParentPath: {} },
      },
    };
    behavior.normalizeRelationSettings(behavior.settings.relations);
    const files = ['一.md', '二.md', '共享.md'].map((path) => new (TFile as any)(path));
    behavior.tagFileIndex = new Map([
      ['#子一', [files[0], files[2]]],
      ['#子二', [files[1], files[2]]],
    ]);

    expect(behavior.initializeTagInheritanceOrder()).toBe(true);
    expect(behavior.settings.relations.version).toBe(6);
    expect(behavior.settings.relations.tagInheritance.modeByParentChild).toEqual({
      '#父': { '#子一': 'selected', '#子二': 'selected' },
    });
    expect(behavior.settings.relations.tagInheritance.includedPathsByParentChild).toEqual({
      '#父': { '#子一': ['一.md', '共享.md'], '#子二': ['二.md', '共享.md'] },
    });
    expect(behavior.settings.relations.tagInheritance.excludedPathsByParentChild).toEqual({
      '#父': { '#子一': ['一.md'], '#子二': ['二.md'] },
    });
  });

  it('不同直接子关系独立过滤，多来源按任一允许显示且右键排除一次写入全部来源', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), [
      '甲.md', '乙.md', '共享.md',
    ]) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#父': ['#子一', '#子二'] };
    behavior.settings.relations.tagInheritance.enabledParents = ['#父'];
    behavior.settings.relations.tagInheritance.modeByParentChild = { '#父': { '#子一': 'selected' } };
    behavior.settings.relations.tagInheritance.includedPathsByParentChild = { '#父': { '#子一': ['甲.md', '共享.md'] } };
    behavior.settings.relations.tagInheritance.excludedPathsByParentChild = { '#父': { '#子二': ['乙.md'] } };
    behavior.tagFileIndex = new Map([
      ['#子一', ['甲.md', '共享.md'].map((path) => behavior.app.vault.getAbstractFileByPath(path))],
      ['#子二', ['乙.md', '共享.md'].map((path) => behavior.app.vault.getAbstractFileByPath(path))],
    ]);

    expect(behavior.getTagBrowseData('#父').inheritedFiles.map((file: any) => file.path)).toEqual(['甲.md', '共享.md']);
    await behavior.setInheritedFileVisible('#父', '共享.md', false);
    expect(behavior.getIncludedInheritedPaths('#父', '#子一')).toEqual(['甲.md']);
    expect(behavior.getExcludedInheritedPaths('#父', '#子二')).toEqual(['乙.md', '共享.md']);
    expect(behavior.getTagBrowseData('#父').inheritedFiles.map((file: any) => file.path)).toEqual(['甲.md']);
    expect(behavior.saveSettings).toHaveBeenCalledOnce();
  });

  it('下游选择限制上层候选并同步清除祖先名单，重新放行后不自动恢复', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), ['孙.md']) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#父': ['#子'], '#子': ['#孙'] };
    behavior.settings.relations.tagInheritance.enabledParents = ['#父', '#子'];
    behavior.settings.relations.tagInheritance.modeByParentChild = {
      '#父': { '#子': 'selected' },
      '#子': { '#孙': 'selected' },
    };
    behavior.settings.relations.tagInheritance.includedPathsByParentChild = {
      '#父': { '#子': ['孙.md'] },
      '#子': { '#孙': ['孙.md'] },
    };
    behavior.tagFileIndex = new Map([['#孙', [behavior.app.vault.getAbstractFileByPath('孙.md')]]]);

    expect(behavior.getInheritanceCandidates('#父', '#子').map((candidate: any) => candidate.path)).toEqual(['孙.md']);
    expect(behavior.getTagBrowseData('#父').inheritedFiles.map((file: any) => file.path)).toEqual(['孙.md']);
    await behavior.setIncludedInheritedPaths('#子', '#孙', []);
    expect(behavior.getIncludedInheritedPaths('#父', '#子')).toEqual([]);
    expect(behavior.getInheritanceCandidates('#父', '#子')).toEqual([]);
    expect(behavior.getTagBrowseData('#父').inheritedFiles).toEqual([]);

    await behavior.setIncludedInheritedPaths('#子', '#孙', ['孙.md']);
    expect(behavior.getInheritanceCandidates('#父', '#子').map((candidate: any) => candidate.path)).toEqual(['孙.md']);
    expect(behavior.getIncludedInheritedPaths('#父', '#子')).toEqual([]);
    expect(behavior.getTagBrowseData('#父').inheritedFiles).toEqual([]);
  });

  it('v5 名单升级时按下游放行范围从后向前清理', () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), [
      '保留.md', '清理一.md', '清理二.md',
    ]) as any;
    behavior.settings.relations.version = 5;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#爱情': ['#亲昵'], '#亲昵': ['#言语'] };
    behavior.settings.relations.tagInheritance.enabledParents = ['#爱情', '#亲昵'];
    behavior.settings.relations.tagInheritance.modeByParentChild = {
      '#爱情': { '#亲昵': 'selected' },
      '#亲昵': { '#言语': 'selected' },
    };
    behavior.settings.relations.tagInheritance.includedPathsByParentChild = {
      '#爱情': { '#亲昵': ['保留.md', '清理一.md', '清理二.md'] },
      '#亲昵': { '#言语': ['保留.md'] },
    };
    behavior.tagFileIndex = new Map([['#言语', ['保留.md', '清理一.md', '清理二.md']
      .map((path) => behavior.app.vault.getAbstractFileByPath(path))]]);

    expect(behavior.initializeTagInheritanceOrder()).toBe(true);
    expect(behavior.settings.relations.version).toBe(6);
    expect(behavior.getIncludedInheritedPaths('#爱情', '#亲昵')).toEqual(['保留.md']);
    expect(behavior.getTagBrowseData('#爱情').inheritedFiles.map((file: any) => file.path)).toEqual(['保留.md']);
  });

  it('多路径内部逐层取交集，路径之间任一完整放行即可显示', () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), ['共享.md']) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = {
      '#根': ['#左', '#右'], '#左': ['#叶'], '#右': ['#叶'],
    };
    behavior.settings.relations.tagInheritance.enabledParents = ['#根', '#左', '#右'];
    behavior.settings.relations.tagInheritance.modeByParentChild = {
      '#根': { '#左': 'selected', '#右': 'selected' },
      '#左': { '#叶': 'selected' }, '#右': { '#叶': 'selected' },
    };
    behavior.settings.relations.tagInheritance.includedPathsByParentChild = {
      '#根': { '#左': ['共享.md'], '#右': ['共享.md'] },
      '#右': { '#叶': ['共享.md'] },
    };
    behavior.tagFileIndex = new Map([['#叶', [behavior.app.vault.getAbstractFileByPath('共享.md')]]]);

    expect(behavior.getInheritanceCandidates('#根', '#左')).toEqual([]);
    expect(behavior.getInheritanceCandidates('#根', '#右').map((candidate: any) => candidate.path)).toEqual(['共享.md']);
    expect(behavior.getTagBrowseData('#根').inheritedFiles.map((file: any) => file.path)).toEqual(['共享.md']);
    behavior.settings.relations.tagInheritance.includedPathsByParentChild['#右']['#叶'] = [];
    expect(behavior.getTagBrowseData('#根').inheritedFiles).toEqual([]);
  });

  it('固定边只豁免自身，混合路径仍受普通边过滤', () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), ['固定后代.md']) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#根': ['#自由'], '#自由': ['#固定'] };
    behavior.settings.relations.tagInheritance.enabledParents = ['#根', '#自由'];
    behavior.settings.relations.tagInheritance.fixedParentByChild = { '#固定': '#自由' };
    behavior.settings.relations.tagInheritance.modeByParentChild = { '#根': { '#自由': 'selected' } };
    behavior.tagFileIndex = new Map([['#固定', [behavior.app.vault.getAbstractFileByPath('固定后代.md')]]]);

    const candidate = behavior.getInheritanceCandidates('#根', '#自由')[0];
    expect(candidate.path).toBe('固定后代.md');
    expect(candidate.fixed).toBe(false);
    expect(behavior.getTagBrowseData('#根').inheritedFiles).toEqual([]);
    behavior.settings.relations.tagInheritance.includedPathsByParentChild = { '#根': { '#自由': ['固定后代.md'] } };
    expect(behavior.getTagBrowseData('#根').inheritedFiles.map((file: any) => file.path)).toEqual(['固定后代.md']);
    expect(behavior.isFixedInheritedFileForTag('#根', '固定后代.md')).toBe(false);

    behavior.settings.relations.tagInheritance.fixedParentByChild['#自由'] = '#根';
    behavior.settings.relations.tagInheritance.includedPathsByParentChild = {};
    expect(behavior.getTagBrowseData('#根').inheritedFiles.map((file: any) => file.path)).toEqual(['固定后代.md']);
    expect(behavior.isFixedInheritedFileForTag('#根', '固定后代.md')).toBe(true);
  });

  it('下游保存失败时回滚下游修改和祖先名单清理', async () => {
    const behavior = attachFiles(createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} }), ['孙.md']) as any;
    behavior.settings.relations.tagInheritance.childrenByParent = { '#父': ['#子'], '#子': ['#孙'] };
    behavior.settings.relations.tagInheritance.modeByParentChild = {
      '#父': { '#子': 'selected' }, '#子': { '#孙': 'selected' },
    };
    behavior.settings.relations.tagInheritance.includedPathsByParentChild = {
      '#父': { '#子': ['孙.md'] }, '#子': { '#孙': ['孙.md'] },
    };
    behavior.tagFileIndex = new Map([['#孙', [behavior.app.vault.getAbstractFileByPath('孙.md')]]]);
    behavior.saveSettings.mockRejectedValueOnce(new Error('失败'));

    await expect(behavior.setIncludedInheritedPaths('#子', '#孙', [])).rejects.toThrow('失败');
    expect(behavior.settings.relations.tagInheritance.includedPathsByParentChild).toEqual({
      '#父': { '#子': ['孙.md'] }, '#子': { '#孙': ['孙.md'] },
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

  it('加载 v2 数据时清理不满足规则的固定映射并升级到 v6', () => {
    const behavior = Object.create(RelationsBehavior.prototype) as any;
    behavior.settings = {
      relations: {
        version: 2,
        tagInheritance: {
          childrenByParent: { '#秘境': ['#秘境-开始', '#其他-结束'] },
          enabledParents: [],
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
    expect(behavior.settings.relations.version).toBe(6);
  });

  it('关闭普通继承时只归入固定分支且固定笔记覆盖排除', () => {
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

    let browseData = behavior.getTagBrowseData('#秘境');
    expect(browseData.files.map((file: any) => file.path)).toEqual(['父.md', '子.md']);
    expect(browseData.hasFreeInheritance).toBe(true);
    expect(behavior.isFixedInheritedFileForTag('#秘境', '子.md')).toBe(true);

    behavior.settings.relations.tagInheritance.enabledParents = ['#秘境'];
    browseData = behavior.getTagBrowseData('#秘境');
    expect(browseData.files.map((file: any) => file.path)).toEqual(['父.md', '子.md']);
    expect(browseData.sourcesByPath.get('自由.md')).toEqual(['#自由']);
  });

  it('搜索固定子标签时只返回父级及匹配分支', () => {
    const behavior = Object.create(TagPaneBehavior.prototype) as any;
    const parentBrowse = {
      files: [{ path: '父.md' }, { path: '子.md' }], exactCount: 1, inheritedCount: 1,
      inheritanceEnabled: false, hasInheritance: true, hasFreeInheritance: false,
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
        inheritanceEnabled: false, hasInheritance: false, hasFreeInheritance: false,
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
