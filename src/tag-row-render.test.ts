// @vitest-environment happy-dom
//
// 标签行渲染的 DOM 契约测试 —— "体感不变"最直接的锚点。
//
// 阶段 3 会把侧边栏的 renderListModeTagItem 与标签系统页的 renderTagCard 合并成一份
// 渲染实现，并改为 keyed 增量重绘。届时这些断言必须依然成立：class 名、dataset、
// 按钮的出现条件与排列顺序、计数文案，共同决定了用户看到和点到的东西。

import { TFile } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagPaneBehavior } from './tag-pane';
import { PuffsTagSidebarView } from './view/tag-sidebar-view';
import { TagTreeRendererBehavior } from './view/tag-tree-renderer';

type AnyRecord = Record<string, unknown>;

function makeTFile(path: string): TFile {
  return new (TFile as any)(path) as TFile;
}

function makeItem(overrides: AnyRecord = {}): AnyRecord {
  const files = [{ path: 'a.md' }, { path: 'b.md' }];
  return {
    tag: '#读书',
    displayName: '读书',
    isVirtual: false,
    files,
    exactCount: 2,
    inheritedCount: 0,
    hasInheritance: false,
    hasActiveInheritance: false,
    sourcesByPath: new Map(),
    inheritanceTree: null,
    fixedSearchTags: [],
    browseData: null,
    ...overrides,
  };
}

function makeBehavior(
  expandedTags: string[] = [],
  pinnedTag: string | null = null,
  // 阈值 1 = 「只要有笔记就显示」，等价于引入阈值之前的行为，故既有用例无需改动
  scrollTopButtonThreshold = 1
) {
  const behavior = Object.create(TagPaneBehavior.prototype) as AnyRecord & {
    renderListModeTagItem: (listEl: HTMLElement, item: AnyRecord, view: unknown, patch: unknown) => void;
  };
  behavior.settings = { pinnedTag, scrollTopButtonThreshold };
  behavior.expandedTags = new Set(expandedTags);
  behavior.noteListCalls = [];
  // 笔记列表本身另有测试，这里只关心标签行
  behavior.renderNoteList = (...args: unknown[]) => {
    (behavior.noteListCalls as unknown[]).push(args);
  };
  behavior.bindTagHierarchyControlButton = () => undefined;
  behavior.syncTagOrderButtonSelection = () => undefined;
  behavior.toggleTagExpansion = () => undefined;
  return behavior;
}

function render(behavior: AnyRecord & { renderListModeTagItem: (...a: never[]) => void }, item: AnyRecord) {
  const listEl = document.createElement('div');
  behavior.renderListModeTagItem(listEl as never, item as never, {} as never, null as never);
  const treeItemEl = listEl.firstElementChild as HTMLElement;
  const rowEl = treeItemEl.querySelector('.puffs-tag-list-row') as HTMLElement;
  return { listEl, treeItemEl, rowEl };
}

describe('标签行 · 骨架结构', () => {
  it('外层是 tree-item，行是 tag-pane-tag（沿用 app.css 全局类名，故与原生视觉一致）', () => {
    const { treeItemEl, rowEl } = render(makeBehavior(), makeItem());

    expect(treeItemEl.classList.contains('tree-item')).toBe(true);
    expect(treeItemEl.classList.contains('puffs-tag-list-item')).toBe(true);

    for (const cls of ['tree-item-self', 'tag-pane-tag', 'is-clickable', 'mod-collapsible', 'puffs-tag-list-row']) {
      expect(rowEl.classList.contains(cls)).toBe(true);
    }
  });

  it('标签写入 dataset.puffsTag，供事件委托取用', () => {
    const { rowEl } = render(makeBehavior(), makeItem({ tag: '#科幻' }));
    expect(rowEl.dataset.puffsTag).toBe('#科幻');
    expect(rowEl.dataset.puffsVirtualTag).toBeUndefined();
  });

  it('交集虚拟标签额外标记 puffsVirtualTag', () => {
    const { rowEl } = render(makeBehavior(), makeItem({ isVirtual: true, tag: 'intersection:#a&#b' }));
    expect(rowEl.dataset.puffsVirtualTag).toBe('true');
  });

  it('缩进用 important 内联样式覆盖原生嵌套缩进', () => {
    const { rowEl } = render(makeBehavior(), makeItem());
    expect(rowEl.style.getPropertyValue('margin-inline-start')).toBe('0px');
    expect(rowEl.style.getPropertyPriority('margin-inline-start')).toBe('important');
    expect(rowEl.style.getPropertyValue('padding-inline-start')).toBe('24px');
    expect(rowEl.style.getPropertyPriority('padding-inline-start')).toBe('important');
  });

  it('显示名走 tree-item-inner-text', () => {
    const { rowEl } = render(makeBehavior(), makeItem({ displayName: '读书' }));
    const textEl = rowEl.querySelector('.tree-item-inner .tree-item-inner-text');
    expect(textEl?.textContent).toBe('读书');
  });

  it('子元素顺序固定：折叠箭头 → 名称 → 数量容器', () => {
    const { rowEl } = render(makeBehavior(), makeItem());
    const classes = Array.from(rowEl.children).map((el) => el.className);
    expect(classes[0]).toContain('puffs-tag-list-toggle');
    expect(classes[1]).toContain('tree-item-inner');
    expect(classes[classes.length - 1]).toContain('tree-item-flair-outer');
  });
});

describe('标签行 · 展开态', () => {
  it('未展开时折叠箭头带 is-collapsed，外层无 puffs-tag-expanded', () => {
    const { treeItemEl, rowEl } = render(makeBehavior(), makeItem());
    expect(treeItemEl.classList.contains('puffs-tag-expanded')).toBe(false);
    expect(rowEl.querySelector('.puffs-tag-list-toggle')?.classList.contains('is-collapsed')).toBe(true);
  });

  it('展开时去掉 is-collapsed，外层加 puffs-tag-expanded', () => {
    const { treeItemEl, rowEl } = render(makeBehavior(['#读书']), makeItem());
    expect(treeItemEl.classList.contains('puffs-tag-expanded')).toBe(true);
    expect(rowEl.querySelector('.puffs-tag-list-toggle')?.classList.contains('is-collapsed')).toBe(false);
  });

  it('展开时才渲染笔记列表，并把 browseData 透传下去', () => {
    const collapsed = makeBehavior();
    render(collapsed, makeItem());
    expect((collapsed.noteListCalls as unknown[]).length).toBe(0);

    const browseData = { tag: '#读书', inheritanceTree: { tag: '#读书' } };
    const expanded = makeBehavior(['#读书']);
    render(expanded, makeItem({ browseData }));
    const calls = expanded.noteListCalls as unknown[][];
    expect(calls.length).toBe(1);
    expect(calls[0][4]).toMatchObject({ surface: 'sidebar', browseData });
  });
});

describe('标签行 · 计数文案', () => {
  it('无继承笔记时显示总数', () => {
    const { rowEl } = render(makeBehavior(), makeItem());
    expect(rowEl.querySelector('.tag-pane-tag-count')?.textContent).toBe('2');
  });

  it('有继承笔记时显示「精确+继承」', () => {
    const { rowEl } = render(makeBehavior(), makeItem({ exactCount: 3, inheritedCount: 5 }));
    expect(rowEl.querySelector('.tag-pane-tag-count')?.textContent).toBe('3+5');
  });

  it('计数容器同时带 tree-item-flair，继承主题样式', () => {
    const { rowEl } = render(makeBehavior(), makeItem());
    const countEl = rowEl.querySelector('.tag-pane-tag-count');
    expect(countEl?.classList.contains('tree-item-flair')).toBe(true);
  });
});

describe('标签行 · 不再有继承开关按钮', () => {
  it('任何标签行都不渲染继承开关 —— 该功能已随 enabledParents 一并移除', () => {
    expect(render(makeBehavior(), makeItem()).rowEl
      .querySelector('.puffs-tag-inheritance-button')).toBeNull();
    expect(render(makeBehavior(), makeItem({ hasInheritance: true, hasActiveInheritance: true })).rowEl
      .querySelector('.puffs-tag-inheritance-button')).toBeNull();
  });
});

describe('标签行 · 回底与置顶按钮', () => {
  it('折叠时都不出现', () => {
    const { rowEl } = render(makeBehavior(), makeItem());
    expect(rowEl.querySelector('.puffs-tag-scroll-bottom-button')).toBeNull();
    expect(rowEl.querySelector('.puffs-tag-pin-button')).toBeNull();
  });

  it('展开且有笔记时都出现', () => {
    const { rowEl } = render(makeBehavior(['#读书']), makeItem());
    expect(rowEl.querySelector('.puffs-tag-scroll-bottom-button')).not.toBeNull();
    expect(rowEl.querySelector('.puffs-tag-pin-button')).not.toBeNull();
  });

  it('展开但没有笔记时都不出现', () => {
    const { rowEl } = render(makeBehavior(['#读书']), makeItem({ files: [], exactCount: 0 }));
    expect(rowEl.querySelector('.puffs-tag-scroll-bottom-button')).toBeNull();
    expect(rowEl.querySelector('.puffs-tag-pin-button')).toBeNull();
  });

  it('虚拟标签有回底但没有置顶（交集结果不可置顶）', () => {
    const { rowEl } = render(makeBehavior(['intersection:x']), makeItem({ isVirtual: true, tag: 'intersection:x' }));
    expect(rowEl.querySelector('.puffs-tag-scroll-bottom-button')).not.toBeNull();
    expect(rowEl.querySelector('.puffs-tag-pin-button')).toBeNull();
  });

  it('置顶按钮的 is-active 反映当前置顶标签', () => {
    const plain = render(makeBehavior(['#读书'], null), makeItem()).rowEl
      .querySelector('.puffs-tag-pin-button') as HTMLElement;
    expect(plain.classList.contains('is-active')).toBe(false);

    const pinned = render(makeBehavior(['#读书'], '#读书'), makeItem()).rowEl
      .querySelector('.puffs-tag-pin-button') as HTMLElement;
    expect(pinned.classList.contains('is-active')).toBe(true);
  });

  it('两个按钮都带 tag 以供事件委托，且排在数量容器之前', () => {
    const { rowEl } = render(makeBehavior(['#读书']), makeItem());
    const scrollEl = rowEl.querySelector('.puffs-tag-scroll-bottom-button') as HTMLElement;
    const pinEl = rowEl.querySelector('.puffs-tag-pin-button') as HTMLElement;
    expect(scrollEl.dataset.puffsTag).toBe('#读书');
    expect(pinEl.dataset.puffsTag).toBe('#读书');

    const children = Array.from(rowEl.children);
    expect(children.indexOf(scrollEl)).toBeLessThan(children.length - 1);
    expect(children.indexOf(pinEl)).toBeLessThan(children.length - 1);
  });
});

describe('标签行 · 回底按钮受阈值控制', () => {
  // 阈值此前只管笔记卡片上的回顶按钮，标签行的回底按钮一律显示，两处口径不一致
  it('笔记数低于阈值时不出现回底按钮', () => {
    const { rowEl } = render(makeBehavior(['#读书'], null, 3), makeItem());
    expect(rowEl.querySelector('.puffs-tag-scroll-bottom-button')).toBeNull();
  });

  it('笔记数达到阈值时出现回底按钮', () => {
    const item = makeItem({ files: [{ path: 'a.md' }, { path: 'b.md' }, { path: 'c.md' }], exactCount: 3 });
    const { rowEl } = render(makeBehavior(['#读书'], null, 3), item);
    expect(rowEl.querySelector('.puffs-tag-scroll-bottom-button')).not.toBeNull();
  });

  it('阈值为 0 时任何标签行都没有回底按钮', () => {
    const { rowEl } = render(makeBehavior(['#读书'], null, 0), makeItem());
    expect(rowEl.querySelector('.puffs-tag-scroll-bottom-button')).toBeNull();
  });

  it('置顶按钮不受阈值影响 —— 它与滚动无关，只要展开且有笔记就该在', () => {
    const { rowEl } = render(makeBehavior(['#读书'], null, 99), makeItem());
    expect(rowEl.querySelector('.puffs-tag-scroll-bottom-button')).toBeNull();
    expect(rowEl.querySelector('.puffs-tag-pin-button')).not.toBeNull();
  });

  it('展开态原地更新走的是另一条渲染路径，同样按阈值增删回底按钮', () => {
    const behavior = makeBehavior([], null, 3) as any;
    behavior.renderNoteList = () => undefined;
    behavior.removeNoteList = () => undefined;
    const item = makeItem();
    const { treeItemEl } = render(behavior, item);

    behavior.expandedTags.add('#读书');
    behavior.syncListModeTagExpansion(treeItemEl, item, null, null);
    expect(treeItemEl.querySelector('.puffs-tag-scroll-bottom-button')).toBeNull();
    expect(treeItemEl.querySelector('.puffs-tag-pin-button')).not.toBeNull();

    const bigItem = makeItem({ files: [{ path: 'a.md' }, { path: 'b.md' }, { path: 'c.md' }] });
    behavior.syncListModeTagExpansion(treeItemEl, bigItem, null, null);
    expect(treeItemEl.querySelector('.puffs-tag-scroll-bottom-button')).not.toBeNull();
  });
});

describe('标签行 · 折叠箭头是纯装饰', () => {
  // 子标签排序已搬进管理子标签弹窗，箭头不再兼任排序入口
  it.each([
    ['有子标签的父标签', { hasInheritance: true }],
    ['虚拟标签', { isVirtual: true, hasInheritance: true }],
    ['普通标签', {}],
  ])('%s：不升级为可聚焦按钮', (_label, extra) => {
    const toggleEl = render(makeBehavior(), makeItem(extra as AnyRecord)).rowEl
      .querySelector('.puffs-tag-list-toggle') as HTMLElement;
    expect(toggleEl.classList.contains('puffs-tag-order-parent-button')).toBe(false);
    expect(toggleEl.getAttribute('aria-hidden')).toBe('true');
    expect(toggleEl.dataset.puffsTagOrderTag).toBeUndefined();
  });
});

describe('标签行 · 展开态原地更新', () => {
  function createSidebarHarness() {
    const behavior = makeBehavior() as any;
    behavior.inlineHierarchyExpansionVersion = 0;
    behavior.relationStructureVersion = 0;
    behavior.renderNoteList = (treeItemEl: HTMLElement) => {
      let listEl = treeItemEl.querySelector('.puffs-tag-note-list') as HTMLElement | null;
      if (!listEl) {
        listEl = document.createElement('div');
        listEl.className = 'tree-item-children puffs-tag-note-list';
        treeItemEl.appendChild(listEl);
      }
      listEl.textContent = 'notes';
    };

    const sidebar = Object.create(PuffsTagSidebarView.prototype) as any;
    sidebar.plugin = behavior;
    sidebar.listEl = document.createElement('div');
    sidebar.tagContainerEl = document.createElement('div');
    sidebar.tagContainerEl.appendChild(sidebar.listEl);
    document.body.appendChild(sidebar.tagContainerEl);
    sidebar.lastRowSignatures = new Map();
    sidebar.noteCardSearchState = { target: null };
    return { behavior, sidebar };
  }

  it('展开和收起复用同一标签行，只增删按钮与笔记列表', () => {
    const { behavior, sidebar } = createSidebarHarness();
    const item = makeItem();
    sidebar.renderTagRows([item], {});
    const original = sidebar.listEl.firstElementChild as HTMLElement;
    const originalRow = original.querySelector('.puffs-tag-list-row') as HTMLElement;
    originalRow.tabIndex = 0;
    originalRow.focus();
    sidebar.tagContainerEl.scrollTop = 120;

    behavior.expandedTags.add('#读书');
    sidebar.renderTagRows([item], {});
    expect(sidebar.listEl.firstElementChild).toBe(original);
    expect(document.activeElement).toBe(originalRow);
    expect(sidebar.tagContainerEl.scrollTop).toBe(120);
    expect(original.classList.contains('puffs-tag-expanded')).toBe(true);
    expect(original.querySelector('.puffs-tag-note-list')).not.toBeNull();
    expect(original.querySelector('.puffs-tag-scroll-bottom-button')).not.toBeNull();
    expect(original.querySelector('.puffs-tag-pin-button')).not.toBeNull();

    behavior.expandedTags.delete('#读书');
    sidebar.renderTagRows([item], {});
    expect(sidebar.listEl.firstElementChild).toBe(original);
    expect(original.classList.contains('puffs-tag-expanded')).toBe(false);
    expect(original.querySelector('.puffs-tag-note-list')).toBeNull();
    expect(original.querySelector('.puffs-tag-scroll-bottom-button')).toBeNull();
    expect(original.querySelector('.puffs-tag-pin-button')).toBeNull();
  });

  it('除展开态外的数据变化仍重建标签行', () => {
    const { sidebar } = createSidebarHarness();
    const item = makeItem();
    sidebar.renderTagRows([item], {});
    const original = sidebar.listEl.firstElementChild;

    sidebar.renderTagRows([{ ...item, displayName: '新的显示名' }], {});
    expect(sidebar.listEl.firstElementChild).not.toBe(original);
    expect(sidebar.listEl.querySelector('.tree-item-inner-text')?.textContent).toBe('新的显示名');
  });

  it('内层展开版本变化不再让顶层标签行失效', () => {
    const { behavior, sidebar } = createSidebarHarness();
    const item = makeItem();
    sidebar.renderTagRows([item], {});
    const original = sidebar.listEl.firstElementChild;

    behavior.inlineHierarchyExpansionVersion += 1;
    sidebar.renderTagRows([item], {});
    expect(sidebar.listEl.firstElementChild).toBe(original);
  });
});

function createTreeRendererBehavior() {
  const behavior = Object.create(TagTreeRendererBehavior.prototype) as any;
  behavior.collapsedInlineHierarchyBranches = new Set();
  behavior.inlineHierarchyExpansionVersion = 0;
  behavior.settings = { scrollTopButtonThreshold: 0 };
  behavior.getRelativeChildDisplayName = (_parent: string, child: string) => child.replace(/^#/, '');
  behavior.showTagContextMenu = vi.fn();
  behavior.toggleInlineHierarchyBranch = (key: string) => {
    if (behavior.collapsedInlineHierarchyBranches.has(key)) {
      behavior.collapsedInlineHierarchyBranches.delete(key);
    } else {
      behavior.collapsedInlineHierarchyBranches.add(key);
    }
    behavior.inlineHierarchyExpansionVersion += 1;
    return !behavior.collapsedInlineHierarchyBranches.has(key);
  };
  behavior.renderInlineTagNoteTree = (hostEl: HTMLElement, files: TFile[]) => {
    hostEl.empty();
    for (const file of files) hostEl.createDiv({ text: file.basename, cls: 'mock-note' });
  };
  return behavior;
}

describe('内层继承标签 · 原地展开', () => {
  it('只增删目标内容，目标行与兄弟分组均保持同一实例', () => {
    const behavior = createTreeRendererBehavior();
    const files = new Map([
      ['初识.md', makeTFile('初识.md')],
      ['升温.md', makeTFile('升温.md')],
    ]);
    behavior.app = { vault: { getAbstractFileByPath: (path: string) => files.get(path) } };
    const hostEl = document.createElement('div') as any;
    document.body.appendChild(hostEl);
    behavior.renderTagInheritanceBrowseTree(hostEl, {
      tag: '#爱情',
      paths: [],
      children: [
        { tag: '#初识', paths: ['初识.md'], subtreePaths: ['初识.md'], children: [] },
        { tag: '#升温', paths: ['升温.md'], subtreePaths: ['升温.md'], children: [] },
      ],
    });

    const findGroup = (tag: string) => Array.from<HTMLElement>(
      hostEl.querySelectorAll('.puffs-inheritance-tag-group')
    ).find((el) => (el.querySelector('.puffs-inheritance-tag-group-row') as HTMLElement | null)
      ?.dataset.puffsInheritanceTag === tag)!;
    const first = findGroup('#初识');
    const target = findGroup('#升温');
    const targetRow = target.querySelector('.puffs-inheritance-tag-group-row') as HTMLElement;
    targetRow.focus();

    targetRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(findGroup('#初识')).toBe(first);
    expect(findGroup('#升温')).toBe(target);
    expect(target.querySelector('.puffs-inheritance-tag-group-content')).toBeNull();
    expect(targetRow.getAttribute('aria-expanded')).toBe('false');

    targetRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(findGroup('#初识')).toBe(first);
    expect(findGroup('#升温')).toBe(target);
    expect(target.querySelector('.puffs-inheritance-tag-group-content')).not.toBeNull();
  });

  it('分组行的笔记数达到阈值时挂出回底按钮，低于阈值则没有', () => {
    const behavior = createTreeRendererBehavior();
    behavior.settings.scrollTopButtonThreshold = 2;
    const files = new Map([
      ['初识.md', makeTFile('初识.md')],
      ['升温.md', makeTFile('升温.md')],
      ['热恋.md', makeTFile('热恋.md')],
    ]);
    behavior.app = { vault: { getAbstractFileByPath: (path: string) => files.get(path) } };
    const hostEl = document.createElement('div') as any;
    behavior.renderTagInheritanceBrowseTree(hostEl, {
      tag: '#爱情',
      paths: [],
      children: [
        { tag: '#初识', paths: ['初识.md'], subtreePaths: ['初识.md'], children: [] },
        {
          tag: '#升温',
          paths: ['升温.md', '热恋.md'],
          subtreePaths: ['升温.md', '热恋.md'],
          children: [],
        },
      ],
    });

    const rowFor = (tag: string) => Array.from<HTMLElement>(
      hostEl.querySelectorAll('.puffs-inheritance-tag-group-row')
    ).find((el) => el.dataset.puffsInheritanceTag === tag)!;

    expect(rowFor('#初识').querySelector('.puffs-tag-scroll-bottom-button')).toBeNull();
    expect(rowFor('#升温').querySelector('.puffs-tag-scroll-bottom-button')).not.toBeNull();
  });

  it('分组行折叠时不显示回底按钮，展开后才出现 —— 与顶层标签行行为一致', () => {
    const behavior = createTreeRendererBehavior();
    behavior.settings.scrollTopButtonThreshold = 1;
    const file = makeTFile('升温.md');
    behavior.app = { vault: { getAbstractFileByPath: () => file } };
    const hostEl = document.createElement('div') as any;
    document.body.appendChild(hostEl);
    behavior.renderTagInheritanceBrowseTree(hostEl, {
      tag: '#爱情',
      paths: [],
      children: [{ tag: '#升温', paths: ['升温.md'], subtreePaths: ['升温.md'], children: [] }],
    });

    const rowEl = hostEl.querySelector('.puffs-inheritance-tag-group-row') as HTMLElement;
    // 初始展开
    expect(rowEl.querySelector('.puffs-tag-scroll-bottom-button')).not.toBeNull();

    rowEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(rowEl.getAttribute('aria-expanded')).toBe('false');
    expect(rowEl.querySelector('.puffs-tag-scroll-bottom-button')).toBeNull();

    rowEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(rowEl.getAttribute('aria-expanded')).toBe('true');
    expect(rowEl.querySelector('.puffs-tag-scroll-bottom-button')).not.toBeNull();
  });

  it('批量同步展开态时同样增删回底按钮', () => {
    const behavior = createTreeRendererBehavior();
    behavior.settings.scrollTopButtonThreshold = 1;
    const file = makeTFile('升温.md');
    behavior.app = { vault: { getAbstractFileByPath: () => file } };
    const hostEl = document.createElement('div') as any;
    behavior.renderTagInheritanceBrowseTree(hostEl, {
      tag: '#爱情',
      paths: [],
      children: [{ tag: '#升温', paths: ['升温.md'], subtreePaths: ['升温.md'], children: [] }],
    });
    const rowEl = hostEl.querySelector('.puffs-inheritance-tag-group-row') as HTMLElement;
    const key = rowEl.dataset.puffsInheritanceGroup!;

    behavior.collapsedInlineHierarchyBranches.add(key);
    behavior.syncInlineHierarchyExpansion(hostEl);
    expect(rowEl.querySelector('.puffs-tag-scroll-bottom-button')).toBeNull();

    behavior.collapsedInlineHierarchyBranches.delete(key);
    behavior.syncInlineHierarchyExpansion(hostEl);
    expect(rowEl.querySelector('.puffs-tag-scroll-bottom-button')).not.toBeNull();
  });

  it('分组行的回底按钮带滚动锚点，供事件委托在本子树内定位而非全局搜同名标签', () => {
    const behavior = createTreeRendererBehavior();
    behavior.settings.scrollTopButtonThreshold = 1;
    const file = makeTFile('升温.md');
    behavior.app = { vault: { getAbstractFileByPath: () => file } };
    const hostEl = document.createElement('div') as any;
    behavior.renderTagInheritanceBrowseTree(hostEl, {
      tag: '#爱情',
      paths: [],
      children: [{ tag: '#升温', paths: ['升温.md'], subtreePaths: ['升温.md'], children: [] }],
    });

    const buttonEl = hostEl.querySelector('.puffs-tag-scroll-bottom-button') as HTMLElement;
    expect(buttonEl.dataset.puffsScrollAnchor).toBe('true');
    // 锚点存在时不再需要 puffsTag 全局查找，但仍保留标签值供调试与样式
    expect(buttonEl.closest('.puffs-inheritance-tag-group')).not.toBeNull();
  });

  it('批量同步复用已有分组节点', () => {
    const behavior = createTreeRendererBehavior();
    const file = makeTFile('升温.md');
    behavior.app = { vault: { getAbstractFileByPath: () => file } };
    const hostEl = document.createElement('div') as any;
    behavior.renderTagInheritanceBrowseTree(hostEl, {
      tag: '#爱情', paths: [],
      children: [{ tag: '#升温', paths: ['升温.md'], subtreePaths: ['升温.md'], children: [] }],
    });
    const group = hostEl.querySelector('.puffs-inheritance-tag-group') as any;
    const key = group.querySelector('.puffs-inheritance-tag-group-row').dataset.puffsInheritanceGroup;

    behavior.collapsedInlineHierarchyBranches.add(key);
    behavior.syncInlineHierarchyExpansion(hostEl);
    expect(hostEl.querySelector('.puffs-inheritance-tag-group')).toBe(group);
    expect(group.querySelector('.puffs-inheritance-tag-group-content')).toBeNull();

    behavior.collapsedInlineHierarchyBranches.delete(key);
    behavior.syncInlineHierarchyExpansion(hostEl);
    expect(hostEl.querySelector('.puffs-inheritance-tag-group')).toBe(group);
    expect(group.querySelector('.puffs-inheritance-tag-group-content')).not.toBeNull();
  });

  it('交集根按普通分组展开原生笔记与递归继承子标签，并沿用交集键命名空间', () => {
    const behavior = createTreeRendererBehavior();
    const files = new Map([
      ['帮助.md', makeTFile('帮助.md')],
      ['保护.md', makeTFile('保护.md')],
    ]);
    behavior.app = { vault: { getAbstractFileByPath: (path: string) => files.get(path) } };
    const hostEl = document.createElement('div') as any;

    behavior.renderTagInheritanceBrowseTree(hostEl, {
      tag: '#爱情', paths: [], subtreePaths: ['帮助.md', '保护.md'],
      children: [{
        tag: '#帮助',
        paths: ['帮助.md'],
        subtreePaths: ['帮助.md', '保护.md'],
        isIntersection: true,
        noteTag: '#爱情',
        children: [{ tag: '#保护', paths: ['保护.md'], subtreePaths: ['保护.md'], children: [] }],
      }],
    });

    const rows = Array.from<HTMLElement>(hostEl.querySelectorAll('.puffs-inheritance-tag-group-row'));
    const helpRow = rows.find((row) => row.dataset.puffsInheritanceTag === '#帮助')!;
    const protectionRow = rows.find((row) => row.dataset.puffsInheritanceTag === '#保护')!;
    const originalRow = rows.find((row) => row.dataset.puffsInheritanceGroup?.endsWith('\u0000original'))!;

    expect(helpRow.dataset.puffsInheritanceGroup)
      .toBe(`#爱情\u0000tag-intersection\u0000#帮助`);
    expect(helpRow.querySelector('.tag-pane-tag-count')?.textContent).toBe('2');
    expect(originalRow.textContent).toContain('原生');
    expect(protectionRow.dataset.puffsInheritanceGroup)
      .toBe(`#爱情\u0000tag-intersection\u0000#帮助\u0001#保护`);
    expect(hostEl.textContent).toContain('帮助');
    expect(hostEl.textContent).toContain('保护');
  });
});

function createInlineNoteBehavior() {
  const behavior = createTreeRendererBehavior();
  behavior.renderInlineTagNoteTree = TagTreeRendererBehavior.prototype.renderInlineTagNoteTree;
  behavior.getNoteHierarchySettings = () => ({ childrenByParentPath: { '父.md': ['子.md'] } });
  behavior.getInlineHierarchyBranchKey = (tag: string, path: string) => `${tag}\u0000${path}`;
  behavior.hierarchyBranchContains = () => false;
  behavior.isInheritedFileForTag = () => false;
  behavior.isNoteOrderTargetSelected = () => false;
  behavior.syncNoteOrderButtonSelection = (button: HTMLElement) => {
    const expanded = button.dataset.puffsExpanded === 'true';
    button.classList.toggle('is-collapsed', !expanded);
    button.setAttribute('aria-expanded', String(expanded));
  };
  behavior.bindNoteParentControlButton = (button: HTMLElement, toggleExpansion: () => void) => {
    button.addEventListener('click', toggleExpansion);
  };
  behavior.getInlineHierarchyDisplayName = (_tag: string, _parent: string, file: TFile) => file.basename;
  behavior.openFileInMainWorkspace = vi.fn();
  behavior.showHierarchyChildMenu = vi.fn();
  behavior.showNoteCardContextMenu = vi.fn();
  behavior.toggleNoteOrderTarget = vi.fn();
  behavior.toggleHierarchyNoteOrderTarget = vi.fn();
  behavior.scheduleTagTopScroll = vi.fn();
  return behavior;
}

describe('内层父子笔记 · 原地展开', () => {
  it.each([
    ['组合按钮', false, '.puffs-note-parent-control-button'],
    ['独立箭头', true, '.puffs-inline-hierarchy-toggle'],
  ])('%s只更新当前父笔记，兄弟根笔记保持同一实例', (_label, isVirtual, selector) => {
    const behavior = createInlineNoteBehavior();
    const hostEl = document.createElement('div') as any;
    document.body.appendChild(hostEl);
    behavior.renderInlineTagNoteTree(
      hostEl,
      [makeTFile('父.md'), makeTFile('子.md'), makeTFile('旁支.md')],
      '#读书',
      isVirtual
    );
    const findItem = (path: string) => Array.from<HTMLElement>(
      hostEl.querySelectorAll('.puffs-tag-note-item')
    ).find((el) => el.dataset.path === path)!;
    const parent = findItem('父.md');
    const sibling = findItem('旁支.md');
    const control = parent.querySelector(selector) as HTMLElement;

    control.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(findItem('父.md')).toBe(parent);
    expect(findItem('旁支.md')).toBe(sibling);
    expect(parent.querySelector('.puffs-inline-hierarchy-children')).toBeNull();

    control.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(findItem('父.md')).toBe(parent);
    expect(findItem('旁支.md')).toBe(sibling);
    expect(parent.querySelector('.puffs-inline-hierarchy-children')).not.toBeNull();
  });
});

describe('内层笔记卡片 · 回顶按钮', () => {
  function renderNotes(threshold: number, paths: string[]) {
    const behavior = createInlineNoteBehavior();
    behavior.settings.scrollTopButtonThreshold = threshold;
    behavior.getNoteHierarchySettings = () => ({ childrenByParentPath: {} });
    const hostEl = document.createElement('div') as any;
    behavior.renderInlineTagNoteTree(hostEl, paths.map(makeTFile), '#读书', false);
    return hostEl;
  }

  it('笔记数低于阈值时最后一张卡片上没有回顶按钮', () => {
    const hostEl = renderNotes(3, ['a.md', 'b.md']);
    expect(hostEl.querySelector('.puffs-tag-scroll-top-button')).toBeNull();
  });

  it('达到阈值时回顶按钮挂在最后一张卡片上，并带滚动锚点', () => {
    const hostEl = renderNotes(3, ['a.md', 'b.md', 'c.md']);
    const buttonEl = hostEl.querySelector('.puffs-tag-scroll-top-button') as HTMLElement;
    expect(buttonEl).not.toBeNull();
    const itemEl = buttonEl.closest('.puffs-tag-note-item') as HTMLElement | null;
    expect(itemEl?.dataset.path).toBe('c.md');
    expect(buttonEl.dataset.puffsScrollAnchor).toBe('true');
  });
});

describe('标签行 · happy-dom 环境自检', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('obsidian mock 的 DOM 扩展已挂到 HTMLElement 上', () => {
    const el = document.createElement('div');
    const child = (el as unknown as { createDiv: (o: unknown) => HTMLElement }).createDiv({ cls: 'x y', text: 'hi' });
    expect(child.parentElement).toBe(el);
    expect(child.className).toBe('x y');
    expect(child.textContent).toBe('hi');

    (el as unknown as { empty: () => void }).empty();
    expect(el.children.length).toBe(0);
  });
});
