// @vitest-environment happy-dom
//
// 管理子标签弹窗的 DOM 渲染契约。
//
// relation-modals.test.ts 跑在 node 环境、只做 Object.create + mock 的行为断言；
// 涉及真实 DOM 结构（行名、按钮出现条件、选中态）的用例放这里。

import { describe, expect, it, vi } from 'vitest';
import { ManageParentTagModal, TagInheritanceModal } from './relation-modals';
import { getRelativeChildDisplayName } from './core/inheritance';

function createRenderModal(overrides: Record<string, unknown> = {}) {
  const modal = Object.create(TagInheritanceModal.prototype) as any;
  modal.relationMode = 'children';
  modal.parentTag = '#爱情';
  modal.children = ['#爱情-追求'];
  modal.activeChild = '#爱情-追求';
  modal.isSubmitting = false;
  modal.childrenListEl = document.createElement('div');
  modal.selectionSectionEl = null;
  modal.selectionInputEl = null;
  modal.inputEl = null;
  modal.plugin = {
    getTagVisibleNoteCount: () => 3,
    getRelativeChildDisplayName: (parent: unknown, child: unknown) =>
      getRelativeChildDisplayName(parent, child),
    isFixedTagEdge: () => false,
    getTagInheritanceMode: () => 'all',
    isFixedTagRelationEligible: () => false,
    sortTagsByVisibleCount: (tags: string[]) => [...tags],
  };
  Object.assign(modal, overrides);
  return modal;
}

function getRowNames(modal: any): string[] {
  return Array.from(modal.childrenListEl.querySelectorAll('.puffs-relation-manage-name'))
    .map((el: any) => el.textContent);
}

describe('管理子标签弹窗的行名', () => {
  it('子标签名符合「父标签-子名称」时只显示后缀', () => {
    const modal = createRenderModal();
    modal.renderChildren();
    expect(getRowNames(modal)).toEqual(['追求']);
  });

  it('不看是否锁定为固定子标签，只看名字格式', () => {
    // isFixedTagEdge 恒为 false，简称照样成立
    const modal = createRenderModal({ children: ['#爱情-升温'], activeChild: '#爱情-升温' });
    modal.renderChildren();
    expect(getRowNames(modal)).toEqual(['升温']);
  });

  it('父标签对不上或不符合格式时显示完整名', () => {
    const modal = createRenderModal({
      children: ['#亲昵', '#痛苦-心理'],
      activeChild: '#亲昵',
    });
    modal.renderChildren();
    expect(getRowNames(modal)).toEqual(['亲昵', '痛苦-心理']);
  });

  it('管理父标签弹窗那一列是父标签，不做简化', () => {
    const modal = Object.create(ManageParentTagModal.prototype) as any;
    Object.assign(modal, createRenderModal(), {
      relationMode: 'parents',
      parentTag: '#爱情-追求',
      children: ['#爱情'],
      activeChild: '#爱情',
    });
    modal.renderChildren();
    expect(getRowNames(modal)).toEqual(['爱情']);
  });
});

function createOrderModal(children = ['#甲', '#乙', '#丙']) {
  const saved: string[][] = [];
  const modal = createRenderModal({
    children: [...children],
    activeChild: children[0],
    renderExclusionGroups: vi.fn(),
    renderInheritanceSelection: vi.fn(),
    syncMutationState: vi.fn(),
    picker: { render: vi.fn() },
  });
  modal.plugin.setInheritanceChildren = vi.fn(async (_parent: string, next: string[]) => {
    saved.push([...next]);
  });
  return { modal, saved };
}

describe('管理子标签弹窗内的排序', () => {
  it('每行左侧是排序按钮，选中行的按钮高亮', () => {
    const { modal } = createOrderModal();
    modal.activeChild = '#乙';
    modal.renderChildren();

    const buttons = Array.from(
      modal.childrenListEl.querySelectorAll('.puffs-relation-child-order-button')
    ) as HTMLElement[];
    expect(buttons).toHaveLength(3);
    expect(buttons.map((el) => el.classList.contains('is-selected'))).toEqual([false, true, false]);
    // 选中行同时有背景色类，不再有蓝色竖线那种第三种标记
    const activeRow = modal.childrenListEl.querySelector('.puffs-relation-child-row.is-active') as HTMLElement;
    expect(activeRow.dataset.puffsTag).toBe('#乙');
  });

  it('点击排序按钮即选中该行', () => {
    const { modal } = createOrderModal();
    modal.renderChildren();
    const secondButton = modal.childrenListEl
      .querySelectorAll('.puffs-relation-child-order-button')[1] as HTMLElement;

    secondButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(modal.activeChild).toBe('#乙');
  });

  it('上下移动逐格调整并按新顺序持久化', async () => {
    const { modal, saved } = createOrderModal();
    modal.activeChild = '#丙';

    expect(await modal.moveActiveChild(-1)).toBe(true);
    expect(saved.at(-1)).toEqual(['#甲', '#丙', '#乙']);

    expect(await modal.moveActiveChild(-1)).toBe(true);
    expect(saved.at(-1)).toEqual(['#丙', '#甲', '#乙']);
  });

  it('已在边界时不再移动，也不写入', async () => {
    const { modal, saved } = createOrderModal();
    modal.activeChild = '#甲';
    expect(await modal.moveActiveChild(-1)).toBe(false);
    expect(saved).toHaveLength(0);
  });

  it('右键另一行把选中项移到它下方', async () => {
    const { modal, saved } = createOrderModal();
    modal.activeChild = '#甲';

    expect(await modal.moveActiveChildAfter('#丙')).toBe(true);
    expect(saved.at(-1)).toEqual(['#乙', '#丙', '#甲']);
  });

  it('已经紧跟在目标下方时不产生写入', async () => {
    const { modal, saved } = createOrderModal();
    modal.activeChild = '#乙';
    expect(await modal.moveActiveChildAfter('#甲')).toBe(false);
    expect(saved).toHaveLength(0);
  });

  it('复用笔记排序的上下移动快捷键', async () => {
    const { modal, saved } = createOrderModal();
    modal.activeChild = '#丙';
    modal.plugin.settings = {
      moveNoteUpHotkey: 'Alt + Shift + ↑',
      moveNoteDownHotkey: 'Alt + Shift + ↓',
    };
    const makeEvent = (key: string) => Object.assign(
      new KeyboardEvent('keydown', { key, altKey: true, shiftKey: true, bubbles: true }),
      { preventDefault: vi.fn(), stopPropagation: vi.fn() }
    );

    expect(modal.handleChildOrderHotkey(makeEvent('ArrowUp'))).toBe(true);
    await Promise.resolve();
    expect(saved.at(-1)).toEqual(['#甲', '#丙', '#乙']);

    // 不带修饰键的方向键不归排序管，交给弹窗内其它处理器
    expect(modal.handleChildOrderHotkey(
      new KeyboardEvent('keydown', { key: 'ArrowUp' })
    )).toBe(false);
  });

  it('管理父标签弹窗不渲染排序按钮 —— 那一列按笔记数量自动排序', () => {
    const modal = Object.create(ManageParentTagModal.prototype) as any;
    Object.assign(modal, createRenderModal(), {
      relationMode: 'parents',
      children: ['#甲', '#乙'],
      activeChild: '#甲',
    });
    modal.renderChildren();

    expect(modal.childrenListEl.querySelector('.puffs-relation-child-order-button')).toBeNull();
    expect(modal.childrenListEl.querySelectorAll('.puffs-relation-child-icon')).toHaveLength(2);
  });
});

function createSelectionModal(overrides: Record<string, unknown> = {}) {
  const modal = createRenderModal({
    children: ['#子'],
    activeChild: '#子',
    selectionQuery: '',
    selectionSectionEl: document.createElement('div'),
    selectionGroupsEl: document.createElement('div'),
    selectionSummaryEl: document.createElement('span'),
    selectionTitleEl: document.createElement('h4'),
    ...overrides,
  });
  modal.plugin.getInheritanceCandidates = () => [
    { path: '甲.md', file: { basename: '甲' }, source: '#子', sources: ['#子'], fixed: false },
    { path: '乙.md', file: { basename: '乙' }, source: '#子', sources: ['#子'], fixed: false },
  ];
  // 乙.md 被排除，只有甲.md 可见
  modal.plugin.collectVisiblePathsForEdge = () => new Set(['甲.md']);
  modal.plugin.getNoteAliases = () => [];
  return modal;
}

describe('继承笔记勾选面板', () => {
  it('普通继承下常驻显示，勾选态就是这条边上的可见性', () => {
    const modal = createSelectionModal();
    modal.renderInheritanceSelection();

    expect(modal.selectionSectionEl.classList.contains('is-hidden')).toBe(false);
    expect(modal.selectionSummaryEl.textContent).toBe('已选 1 / 2');
    const checked = Array.from(
      modal.selectionGroupsEl.querySelectorAll('input[type="checkbox"]')
    ).map((el: any) => el.checked);
    expect(checked).toEqual([true, false]);
  });

  it('交集边整块隐藏 —— 成员实时算出来，没有可维护的名单', () => {
    const modal = createSelectionModal();
    modal.plugin.getTagInheritanceMode = () => 'intersection';
    modal.renderInheritanceSelection();

    expect(modal.selectionSectionEl.classList.contains('is-hidden')).toBe(true);
  });

  it('固定边整块隐藏 —— 固定关系不受排除名单影响', () => {
    const modal = createSelectionModal();
    modal.plugin.isFixedTagEdge = () => true;
    modal.renderInheritanceSelection();

    expect(modal.selectionSectionEl.classList.contains('is-hidden')).toBe(true);
  });

  it('没有选中任何子标签时隐藏', () => {
    const modal = createSelectionModal({ activeChild: null });
    modal.renderInheritanceSelection();

    expect(modal.selectionSectionEl.classList.contains('is-hidden')).toBe(true);
  });
});
