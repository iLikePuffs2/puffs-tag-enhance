// @vitest-environment happy-dom
//
// 标签行渲染的 DOM 契约测试 —— "体感不变"最直接的锚点。
//
// 阶段 3 会把侧边栏的 renderListModeTagItem 与标签系统页的 renderTagCard 合并成一份
// 渲染实现，并改为 keyed 增量重绘。届时这些断言必须依然成立：class 名、dataset、
// 按钮的出现条件与排列顺序、计数文案，共同决定了用户看到和点到的东西。

import { beforeEach, describe, expect, it } from 'vitest';
import { TagPaneBehavior } from './tag-pane';

type AnyRecord = Record<string, unknown>;

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

function makeBehavior(expandedTags: string[] = [], pinnedTag: string | null = null) {
  const behavior = Object.create(TagPaneBehavior.prototype) as AnyRecord & {
    renderListModeTagItem: (listEl: HTMLElement, item: AnyRecord, view: unknown, patch: unknown) => void;
  };
  behavior.settings = { pinnedTag };
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
