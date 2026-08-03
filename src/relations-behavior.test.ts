import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { RelationsBehavior } from "./relations";

function createBehavior(noteHierarchy: any, exclusions: Record<string, string[]> = {}) {
  const behavior = Object.create(RelationsBehavior.prototype);
  behavior.settings = {
    relations: {
      version: 1,
      tagInheritance: {
        childrenByParent: {},
        enabledParents: [],
        excludedPathsByParent: exclusions,
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
    expect(behavior.settings.relations.tagInheritance.excludedPathsByParent['#父'])
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
    expect(behavior.settings.relations.tagInheritance.excludedPathsByParent['#父'])
      .toEqual(['保留.md']);
    expect(behavior.saveSettings).toHaveBeenCalledOnce();
  });
});

describe('子标签自动排序', () => {
  it('按包含继承结果的可见笔记数量排序，并让关系遍历使用相同顺序', () => {
    const behavior = createBehavior({ childrenByParentPath: {}, displayNamesByParentPath: {} });
    behavior.settings.relations.tagInheritance = {
      childrenByParent: {
        '#父': ['#少', '#多', '#继承'],
        '#继承': ['#后代'],
      },
      enabledParents: ['#继承'],
      excludedPathsByParent: { '#继承': ['后代/排除.md'] },
    };
    const files = (paths: string[]) => paths.map((path) => new (TFile as any)(path));
    behavior.tagFileIndex = new Map([
      ['#少', files(['少/一.md'])],
      ['#多', files(['多/一.md', '多/二.md', '多/三.md'])],
      ['#继承', files(['继承/原生.md'])],
      ['#后代', files(['后代/一.md', '后代/二.md', '后代/三.md', '后代/排除.md'])],
    ]);

    expect(behavior.getTagVisibleNoteCount('#继承')).toBe(4);
    expect(behavior.getInheritanceChildren('#父')).toEqual(['#继承', '#多', '#少']);
    expect(behavior.getTagDescendants('#父')).toEqual(['#继承', '#后代', '#多', '#少']);
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
