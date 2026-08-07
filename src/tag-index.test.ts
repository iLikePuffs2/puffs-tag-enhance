// 标签索引与笔记顺序对账的契约测试。
//
// 阶段 1 要把这块搬进 data/tag-store.ts，并加上防抖、增量更新和「对账安全阀」。
// 这里先钉住现状，其中「标签消失导致顺序记录被整体丢弃」的用例记录的是一个
// 真实的数据风险（详见方案「数据安全」一节）—— 阶段 1 加安全阀后，该用例需按新
// 预期更新，届时它正好是安全阀生效的证据。

import { describe, expect, it, vi } from 'vitest';
import { TFile } from './test-obsidian-mock';
import { TagIndexBehavior } from './tag-index';

type AnyRecord = Record<string, unknown>;

function makeBehavior(options: {
  files?: string[];
  cacheByPath?: Record<string, unknown>;
  noteOrderByTag?: Record<string, string[]>;
  newNotePosition?: 'start' | 'end';
  noteOrderTrackingReady?: boolean;
  cacheReady?: boolean;
} = {}) {
  const {
    files = [],
    cacheByPath = {},
    noteOrderByTag = {},
    newNotePosition = 'end',
    noteOrderTrackingReady = true,
    cacheReady = true,
  } = options;

  const tFiles = files.map((path) => new TFile(path));
  const behavior = Object.create(TagIndexBehavior.prototype) as AnyRecord & {
    rebuildTagFileIndex: (changedPath?: string | null) => boolean;
    reconcileNoteOrders: (nextIndex: Map<string, unknown[]>, changedPath?: string | null) => boolean;
    initializeNoteOrders: (nextIndex: Map<string, unknown[]>) => boolean;
    getExactTagsForFile: (file: unknown) => Set<string>;
    reconcileExpandedTags: () => void;
    getStableNoteOrderTags: (nextIndex: Map<string, unknown[]>) => string[];
  };

  behavior.app = {
    vault: {
      getMarkdownFiles: () => tFiles,
      getAbstractFileByPath: (path: string) => tFiles.find((f) => f.path === path) || null,
    },
    metadataCache: {
      initialized: true,
      inProgressTaskCount: 0,
      getFileCache: (file: { path: string }) => (cacheReady ? cacheByPath[file.path] ?? {} : null),
    },
  };
  behavior.settings = {
    noteOrderByTag,
    noteDisplayNameByTag: {},
    tagBoundNoteByTag: {},
    newNotePosition,
    pinnedTag: null,
    relations: { tagInheritance: { childrenByParent: {} } },
  };
  behavior.tagFileIndex = new Map();
  behavior.expandedTags = new Set<string>();
  behavior.noteOrderTrackingReady = noteOrderTrackingReady;
  behavior.tagBindingTrackingReady = true;
  behavior.activeTagRename = null;
  behavior.isUnloaded = false;

  // 跨 Behavior 的协作方法，在此以最小实现替身
  behavior.initializeTagInheritanceOrder = () => false;
  behavior.reconcileNoteDisplayNames = () => false;
  behavior.reconcileTagBoundNotes = () => false;
  behavior.reconcilePinnedTag = () => false;
  behavior.clearInlineHierarchyBranchState = () => undefined;
  behavior.isFixedChild = () => false;
  behavior.getNoteAliases = () => [];
  behavior.normalizeNoteOrderByTag = (value: unknown) => value;

  return behavior;
}

describe('从元数据提取标签', () => {
  it('合并正文标签与 frontmatter tags 并去重', () => {
    const behavior = makeBehavior();
    const tags = behavior.getExactTagsForFile.call(behavior, { path: 'a.md' } as never);
    expect(tags.size).toBe(0);

    const withCache = makeBehavior({
      cacheByPath: {
        'a.md': { tags: [{ tag: '#读书' }], frontmatter: { tags: ['科幻', '读书'] } },
      },
    });
    const merged = withCache.getExactTagsForFile.call(withCache, { path: 'a.md' } as never);
    expect(Array.from(merged).sort()).toEqual(['#科幻', '#读书']);
  });

  it('frontmatter 的逗号与空格分隔写法都能拆开', () => {
    const behavior = makeBehavior({
      cacheByPath: { 'a.md': { frontmatter: { tags: '读书, 科幻 玄幻' } } },
    });
    const tags = behavior.getExactTagsForFile.call(behavior, { path: 'a.md' } as never);
    expect(Array.from(tags).sort()).toEqual(['#玄幻', '#科幻', '#读书']);
  });

  it('没有缓存时返回空集合', () => {
    const behavior = makeBehavior({ cacheReady: false });
    expect(behavior.getExactTagsForFile.call(behavior, { path: 'a.md' } as never).size).toBe(0);
  });
});

describe('重建标签索引', () => {
  it('按标签聚合笔记，一篇多标签的笔记出现在每个标签下', () => {
    const behavior = makeBehavior({
      files: ['a.md', 'b.md'],
      cacheByPath: {
        'a.md': { frontmatter: { tags: ['读书', '科幻'] } },
        'b.md': { frontmatter: { tags: ['读书'] } },
      },
    });

    behavior.rebuildTagFileIndex();
    const index = behavior.tagFileIndex as Map<string, Array<{ path: string }>>;

    expect(index.get('#读书')?.map((f) => f.path)).toEqual(['a.md', 'b.md']);
    expect(index.get('#科幻')?.map((f) => f.path)).toEqual(['a.md']);
  });

  it('同一标签下的笔记按文件名中文拼音序排列', () => {
    const behavior = makeBehavior({
      files: ['波.md', '阿.md', '春.md'],
      cacheByPath: {
        '波.md': { frontmatter: { tags: ['读书'] } },
        '阿.md': { frontmatter: { tags: ['读书'] } },
        '春.md': { frontmatter: { tags: ['读书'] } },
      },
    });

    behavior.rebuildTagFileIndex();
    const index = behavior.tagFileIndex as Map<string, Array<{ path: string }>>;
    expect(index.get('#读书')?.map((f) => f.path)).toEqual(['阿.md', '波.md', '春.md']);
  });

  it('没有标签的笔记不进入索引', () => {
    const behavior = makeBehavior({
      files: ['a.md', 'b.md'],
      cacheByPath: { 'a.md': { frontmatter: { tags: ['读书'] } }, 'b.md': {} },
    });

    behavior.rebuildTagFileIndex();
    expect((behavior.tagFileIndex as Map<string, unknown>).size).toBe(1);
  });
});

describe('笔记顺序对账', () => {
  const indexOf = (entries: Record<string, string[]>) =>
    new Map(Object.entries(entries).map(([tag, paths]) => [tag, paths.map((p) => new TFile(p))]));

  it('保留已存在笔记的手工顺序', () => {
    const behavior = makeBehavior({ noteOrderByTag: { '#读书': ['b.md', 'a.md'] } });
    behavior.reconcileNoteOrders(indexOf({ '#读书': ['a.md', 'b.md'] }));
    expect((behavior.settings as AnyRecord & { noteOrderByTag: Record<string, string[]> })
      .noteOrderByTag['#读书']).toEqual(['b.md', 'a.md']);
  });

  it('新笔记按配置追加到末尾', () => {
    const behavior = makeBehavior({ noteOrderByTag: { '#读书': ['b.md'] }, newNotePosition: 'end' });
    behavior.reconcileNoteOrders(indexOf({ '#读书': ['a.md', 'b.md'] }));
    expect((behavior.settings as AnyRecord & { noteOrderByTag: Record<string, string[]> })
      .noteOrderByTag['#读书']).toEqual(['b.md', 'a.md']);
  });

  it('新笔记也可配置插入到最前', () => {
    // 用 c 作为新笔记：插到最前得到 [c, b]，与默认序 [b, c] 不同，才不会被省略
    const behavior = makeBehavior({ noteOrderByTag: { '#读书': ['b.md'] }, newNotePosition: 'start' });
    behavior.reconcileNoteOrders(indexOf({ '#读书': ['b.md', 'c.md'] }));
    expect((behavior.settings as AnyRecord & { noteOrderByTag: Record<string, string[]> })
      .noteOrderByTag['#读书']).toEqual(['c.md', 'b.md']);
  });

  it('移除已不在标签下的笔记', () => {
    // 保留的部分维持手工顺序 [c, a]（默认序是 [a, c]），确认删除不打乱剩余排列
    const behavior = makeBehavior({ noteOrderByTag: { '#读书': ['c.md', 'b.md', 'a.md'] } });
    behavior.reconcileNoteOrders(indexOf({ '#读书': ['a.md', 'c.md'] }));
    expect((behavior.settings as AnyRecord & { noteOrderByTag: Record<string, string[]> })
      .noteOrderByTag['#读书']).toEqual(['c.md', 'a.md']);
  });

  it('刚变更的笔记排在其他新增笔记之后', () => {
    const behavior = makeBehavior({ noteOrderByTag: { '#读书': ['a.md'] } });
    behavior.reconcileNoteOrders(indexOf({ '#读书': ['a.md', 'b.md', 'c.md'] }), 'b.md');
    expect((behavior.settings as AnyRecord & { noteOrderByTag: Record<string, string[]> })
      .noteOrderByTag['#读书']).toEqual(['a.md', 'c.md', 'b.md']);
  });

  it('返回值表示顺序是否发生变化', () => {
    const unchanged = makeBehavior({ noteOrderByTag: { '#读书': ['b.md', 'a.md'] } });
    expect(unchanged.reconcileNoteOrders(indexOf({ '#读书': ['a.md', 'b.md'] }))).toBe(false);

    const changed = makeBehavior({ noteOrderByTag: { '#读书': ['b.md', 'a.md'] } });
    expect(changed.reconcileNoteOrders(indexOf({ '#读书': ['a.md', 'b.md', 'c.md'] }))).toBe(true);
  });

  it('【已知数据风险】标签从索引消失时，其顺序记录被整体丢弃', () => {
    // 只遍历 nextIndex 里还存在的标签，所以旧标签的顺序不会被保留。
    // 插件关闭期间重命名标签，重新启用后该标签的手工排序即永久丢失。
    //
    // 阶段 1 的对账安全阀**不覆盖这个场景**：单个标签改名只影响它自己的记录，
    // 占总量比例很低（真实数据约 1.7%），本就不该被拦。安全阀防的是缓存未就绪
    // 导致的大面积误删，见 data/tag-store.test.ts。此处规模也低于样本下限。
    const behavior = makeBehavior({
      noteOrderByTag: { '#读书': ['b.md', 'a.md'], '#科幻': ['y.md', 'x.md'] },
    });

    behavior.reconcileNoteOrders(indexOf({ '#科幻': ['x.md', 'y.md'] }));

    const orders = (behavior.settings as AnyRecord & { noteOrderByTag: Record<string, string[]> }).noteOrderByTag;
    expect(orders['#读书']).toBeUndefined();
    expect(orders['#科幻']).toEqual(['y.md', 'x.md']);
  });

  it('空顺序的标签不写入记录', () => {
    const behavior = makeBehavior({ noteOrderByTag: { '#读书': ['a.md'] } });
    behavior.reconcileNoteOrders(indexOf({ '#读书': [] }));
    expect((behavior.settings as AnyRecord & { noteOrderByTag: Record<string, string[]> })
      .noteOrderByTag['#读书']).toBeUndefined();
  });
});

describe('顺序初始化与标签排序基准', () => {
  const indexOf = (entries: Record<string, string[]>) =>
    new Map(Object.entries(entries).map(([tag, paths]) => [tag, paths.map((p) => new TFile(p))]));

  it('初始化时保留已保存顺序，未记录的笔记追加在后', () => {
    const behavior = makeBehavior({ noteOrderByTag: { '#读书': ['c.md', 'a.md'] } });
    behavior.initializeNoteOrders(indexOf({ '#读书': ['a.md', 'b.md', 'c.md'] }));
    expect((behavior.settings as AnyRecord & { noteOrderByTag: Record<string, string[]> })
      .noteOrderByTag['#读书']).toEqual(['c.md', 'a.md', 'b.md']);
  });

  it('已有标签保持原有键顺序，新标签按中文序追加', () => {
    const behavior = makeBehavior({ noteOrderByTag: { '#读书': ['a.md'] } });
    const tags = behavior.getStableNoteOrderTags(indexOf({
      '#春': ['x.md'], '#读书': ['a.md'], '#阿': ['y.md'],
    }));
    expect(tags).toEqual(['#读书', '#阿', '#春']);
  });
});

describe('展开态对账', () => {
  it('清理已不存在的标签，但保留交集虚拟标签', () => {
    const behavior = makeBehavior();
    behavior.tagFileIndex = new Map([['#读书', []]]);
    behavior.expandedTags = new Set(['#读书', '#已删除', 'intersection:#a&#b']);

    behavior.reconcileExpandedTags();

    expect(Array.from(behavior.expandedTags as Set<string>).sort())
      .toEqual(['#读书', 'intersection:#a&#b']);
  });
});

// 批量操作标签的写盘路径。
//
// 这批用例锁定「作用域」这一核心语义：过去批量增删改一律作用于标签下的全部笔记，
// 现在弹窗允许用户勾选子集，因此业务层必须接受一份路径白名单并严格遵守它。
// 传 null 的用例是回归保护——右键菜单等旧入口仍依赖全量行为。
function makeWriteBehavior(options: {
  files?: string[];
  cacheByPath?: Record<string, unknown>;
  noteOrderByTag?: Record<string, string[]>;
  newNotePosition?: 'start' | 'end';
} = {}) {
  const behavior = makeBehavior(options) as unknown as AnyRecord & {
    app: AnyRecord;
    updateTagPropertiesForTaggedNotes: (
      mode: string, source: string, target: string, selectedPaths?: Set<string> | null,
    ) => Promise<void>;
    renameTagInSelectedNotes: (
      source: string, target: string, selectedPaths?: Set<string> | null,
    ) => Promise<void>;
  };

  // 记录每次 processFrontMatter 命中的文件，断言作用域是否被正确收窄
  const frontMatterCalls: string[] = [];
  const frontMatterByPath = options.cacheByPath || {};
  behavior.app.fileManager = {
    processFrontMatter: async (file: { path: string }, fn: (fm: AnyRecord) => void) => {
      frontMatterCalls.push(file.path);
      const cache = (frontMatterByPath[file.path] || {}) as AnyRecord;
      const frontmatter = (cache.frontmatter || {}) as AnyRecord;
      fn(frontmatter);
      cache.frontmatter = frontmatter;
    },
  };
  behavior.frontMatterCalls = frontMatterCalls;

  behavior.renameCalls = [] as Array<{ path: string; oldTag: string; newTag: string }>;
  behavior.renameTagInFile = async (file: { path: string }, oldTag: string, newTag: string) => {
    (behavior.renameCalls as AnyRecord[]).push({ path: file.path, oldTag, newTag });
  };

  // getOrderedFilesForTag 由 InteractionsBehavior 提供，运行时经 mixin 挂到同一实例上；
  // 这里按保存顺序做最小实现，未记录顺序的笔记保持索引原序。
  behavior.getOrderedFilesForTag = (tag: string, files: Array<{ path: string }>) => {
    const savedOrder = (options.noteOrderByTag || {})[tag];
    if (!Array.isArray(savedOrder) || savedOrder.length === 0) return files;
    return [...files].sort((left, right) => {
      const leftRank = savedOrder.indexOf(left.path);
      const rightRank = savedOrder.indexOf(right.path);
      return (leftRank < 0 ? Number.MAX_SAFE_INTEGER : leftRank)
        - (rightRank < 0 ? Number.MAX_SAFE_INTEGER : rightRank);
    });
  };

  behavior.saveSettings = vi.fn(async () => undefined);
  behavior.refreshTagIndexAndViews = () => undefined;
  behavior.finishTagRenameProtectionIfSettled = () => true;
  behavior.scheduleTagRenameProtectionFallback = () => undefined;
  behavior.clearTagRenameProtectionTimer = () => undefined;
  behavior.migrateTagRelations = vi.fn();
  behavior.migrateTagBoundNote = vi.fn();
  behavior.normalizeNoteOrderByTag = (value: unknown) => value;
  behavior.normalizeNoteDisplayNameByTag = (value: unknown) => value;

  return behavior;
}

describe('批量增删标签的作用域', () => {
  const cacheOf = (tagsByPath: Record<string, string[]>) =>
    Object.fromEntries(Object.entries(tagsByPath).map(([path, tags]) => [path, { frontmatter: { tags } }]));

  it('传入 selectedPaths 时只处理白名单内的笔记', async () => {
    const behavior = makeWriteBehavior({
      files: ['a.md', 'b.md', 'c.md'],
      cacheByPath: cacheOf({ 'a.md': ['读书'], 'b.md': ['读书'], 'c.md': ['读书'] }),
    });

    await behavior.updateTagPropertiesForTaggedNotes(
      'add', '#读书', '#科幻', new Set(['a.md', 'c.md']),
    );

    expect(behavior.frontMatterCalls).toEqual(['a.md', 'c.md']);
  });

  it('不传 selectedPaths 时保持全量行为', async () => {
    const behavior = makeWriteBehavior({
      files: ['a.md', 'b.md'],
      cacheByPath: cacheOf({ 'a.md': ['读书'], 'b.md': ['读书'] }),
    });

    await behavior.updateTagPropertiesForTaggedNotes('add', '#读书', '#科幻');

    expect(behavior.frontMatterCalls).toEqual(['a.md', 'b.md']);
  });

  it('白名单与标签下的笔记无交集时不写盘', async () => {
    const behavior = makeWriteBehavior({
      files: ['a.md'],
      cacheByPath: cacheOf({ 'a.md': ['读书'] }),
    });

    await behavior.updateTagPropertiesForTaggedNotes(
      'add', '#读书', '#科幻', new Set(['不存在.md']),
    );

    expect(behavior.frontMatterCalls).toEqual([]);
    expect(behavior.saveSettings).not.toHaveBeenCalled();
  });

  it('删除同样受白名单约束', async () => {
    const behavior = makeWriteBehavior({
      files: ['a.md', 'b.md'],
      cacheByPath: cacheOf({ 'a.md': ['读书', '科幻'], 'b.md': ['读书', '科幻'] }),
    });

    await behavior.updateTagPropertiesForTaggedNotes(
      'delete', '#读书', '#科幻', new Set(['b.md']),
    );

    expect(behavior.frontMatterCalls).toEqual(['b.md']);
  });
});

describe('选中笔记范围内的标签改名', () => {
  const cacheOf = (tagsByPath: Record<string, string[]>) =>
    Object.fromEntries(Object.entries(tagsByPath).map(([path, tags]) => [path, { frontmatter: { tags } }]));

  it('只改选中且真正持有源标签的笔记', async () => {
    const behavior = makeWriteBehavior({
      files: ['a.md', 'b.md', 'c.md'],
      cacheByPath: cacheOf({ 'a.md': ['读书'], 'b.md': ['读书'], 'c.md': ['科幻'] }),
    });

    // c.md 被选中但没有源标签 #读书，应被静默跳过
    await behavior.renameTagInSelectedNotes('#读书', '#新书', new Set(['a.md', 'c.md']));

    expect((behavior.renameCalls as Array<{ path: string }>).map((call) => call.path)).toEqual(['a.md']);
  });

  it('选中的笔记全都没有源标签时直接返回，不写盘', async () => {
    const behavior = makeWriteBehavior({
      files: ['a.md', 'c.md'],
      cacheByPath: cacheOf({ 'a.md': ['读书'], 'c.md': ['科幻'] }),
    });

    await behavior.renameTagInSelectedNotes('#读书', '#新书', new Set(['c.md']));

    expect(behavior.renameCalls).toEqual([]);
    expect(behavior.saveSettings).not.toHaveBeenCalled();
  });

  it('不迁移置顶标签、展开态与标签关系（源标签仍然存在）', async () => {
    const behavior = makeWriteBehavior({
      files: ['a.md', 'b.md'],
      cacheByPath: cacheOf({ 'a.md': ['读书'], 'b.md': ['读书'] }),
    });
    (behavior.settings as AnyRecord).pinnedTag = '#读书';
    behavior.expandedTags = new Set(['#读书']);

    await behavior.renameTagInSelectedNotes('#读书', '#新书', new Set(['a.md']));

    expect((behavior.settings as AnyRecord).pinnedTag).toBe('#读书');
    expect(Array.from(behavior.expandedTags as Set<string>)).toEqual(['#读书']);
    expect(behavior.migrateTagRelations).not.toHaveBeenCalled();
    expect(behavior.migrateTagBoundNote).not.toHaveBeenCalled();
  });

  it('把改动的笔记并入目标标签的顺序记录', async () => {
    const behavior = makeWriteBehavior({
      files: ['a.md', 'b.md'],
      cacheByPath: cacheOf({ 'a.md': ['读书'], 'b.md': ['新书'] }),
      noteOrderByTag: { '#新书': ['b.md'] },
      newNotePosition: 'end',
    });

    await behavior.renameTagInSelectedNotes('#读书', '#新书', new Set(['a.md']));

    const orders = (behavior.settings as AnyRecord & { noteOrderByTag: Record<string, string[]> }).noteOrderByTag;
    expect(orders['#新书']).toEqual(['b.md', 'a.md']);
  });

  it('把改动的笔记从源标签的顺序记录中移除', async () => {
    // 手工序必须不同于默认序，否则 reconcileNoteOrders 会因「等于默认序」而不落盘（见 tag-index.ts 的 isDefaultNoteOrder）
    const behavior = makeWriteBehavior({
      files: ['a.md', 'b.md', 'c.md'],
      cacheByPath: cacheOf({ 'a.md': ['读书'], 'b.md': ['读书'], 'c.md': ['读书'] }),
      noteOrderByTag: { '#读书': ['c.md', 'a.md', 'b.md'] },
    });

    await behavior.renameTagInSelectedNotes('#读书', '#新书', new Set(['a.md']));

    const orders = (behavior.settings as AnyRecord & { noteOrderByTag: Record<string, string[]> }).noteOrderByTag;
    expect(orders['#读书']).toEqual(['c.md', 'b.md']);
  });

  it('校验标签名：空名与含空格都拒绝', async () => {
    const behavior = makeWriteBehavior({
      files: ['a.md'],
      cacheByPath: cacheOf({ 'a.md': ['读书'] }),
    });

    await expect(behavior.renameTagInSelectedNotes('#读书', '', new Set(['a.md'])))
      .rejects.toThrow('标签名称不能为空');
    await expect(behavior.renameTagInSelectedNotes('#读书', '新 书', new Set(['a.md'])))
      .rejects.toThrow('标签名称不能包含空格');
  });

  it('源标签与目标标签相同时不做任何事', async () => {
    const behavior = makeWriteBehavior({
      files: ['a.md'],
      cacheByPath: cacheOf({ 'a.md': ['读书'] }),
    });

    await behavior.renameTagInSelectedNotes('#读书', '#读书', new Set(['a.md']));

    expect(behavior.renameCalls).toEqual([]);
  });
});
