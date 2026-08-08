// 标签右键菜单的契约测试。
//
// 重点是虚拟交集标签这条新分支：`&` 搜索出的卡片过去右键无反应（事件委托直接跳过
// 带 puffsVirtualTag 的行）。现在它要能弹出「修改标签」，并把交集结果的笔记列表
// 作为候选池交给同一个批量操作弹窗 —— 虚拟标签不在 tagFileIndex 里，弹窗自己查不到。

import { describe, expect, it, vi } from 'vitest';
import { Menu } from './test-obsidian-mock';
import { ContextMenusBehavior } from './view/context-menus';

type AnyRecord = Record<string, unknown>;

function makeBehavior(overrides: AnyRecord = {}) {
  const behavior = Object.create(ContextMenusBehavior.prototype) as any;
  behavior.app = {};
  behavior.openRenameTagModal = vi.fn();
  behavior.openVirtualTagRenameModal = vi.fn();
  behavior.getTagBoundNoteFile = () => null;
  behavior.openFileInMainWorkspace = vi.fn();
  Object.assign(behavior, overrides);
  return behavior;
}

const titlesOf = (menu: Menu) => menu.items.map((item) => item.title);

describe('实体标签右键菜单', () => {
  it('保留原有的完整菜单项', () => {
    const behavior = makeBehavior();
    expect(behavior.showTagContextMenu({}, '#读书')).toBe(true);

    const titles = titlesOf(Menu.last!);
    expect(titles).toContain('修改标签');
    expect(titles).toContain('相似标签');
    expect(titles).toContain('管理父标签');
    expect(titles).toContain('管理子标签');
    expect(titles).toContain('绑定笔记');
  });

  it('「相似标签」紧跟在「修改标签」之后', () => {
    const behavior = makeBehavior();
    behavior.showTagContextMenu({}, '#读书');

    const titles = titlesOf(Menu.last!);
    expect(titles.indexOf('相似标签')).toBe(titles.indexOf('修改标签') + 1);
  });

  it('菜单内图标互不重复 —— 相似标签不得复用交集或绑定笔记的图标', () => {
    const behavior = makeBehavior();
    behavior.showTagContextMenu({}, '#读书');

    const icons = Menu.last!.items.map((item) => item.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('点击「修改标签」打开常规批量操作弹窗', () => {
    const behavior = makeBehavior();
    behavior.showTagContextMenu({}, '#读书');
    Menu.last!.clickItem('修改标签');

    expect(behavior.openRenameTagModal).toHaveBeenCalledWith('#读书');
  });

  it('标签为空时不弹菜单', () => {
    expect(makeBehavior().showTagContextMenu({}, '')).toBe(false);
    expect(makeBehavior().showTagContextMenu({}, null)).toBe(false);
  });
});

describe('虚拟交集标签右键菜单', () => {
  const virtualItem = {
    tag: 'intersection:#读书&#科幻',
    isVirtual: true,
    sourceTags: ['#读书', '#科幻'],
    files: [{ path: 'a.md' }, { path: 'b.md' }],
  };

  it('只提供「修改标签」—— 管理父子标签、绑定笔记对虚拟标签没有意义', () => {
    const behavior = makeBehavior();
    expect(behavior.showTagContextMenu({}, virtualItem.tag, virtualItem)).toBe(true);

    const titles = titlesOf(Menu.last!);
    expect(titles).toEqual(['修改标签']);
  });

  it('点击后把交集结果的笔记作为候选池传给弹窗', () => {
    const behavior = makeBehavior();
    behavior.showTagContextMenu({}, virtualItem.tag, virtualItem);
    Menu.last!.clickItem('修改标签');

    expect(behavior.openVirtualTagRenameModal).toHaveBeenCalledWith(virtualItem);
    expect(behavior.openRenameTagModal).not.toHaveBeenCalled();
  });

  it('拿不到 item 数据时不弹菜单 —— 没有候选池的弹窗是空的', () => {
    expect(makeBehavior().showTagContextMenu({}, 'intersection:#读书&#科幻')).toBe(false);
  });

  it('item 没有可用笔记时不弹菜单', () => {
    const behavior = makeBehavior();
    expect(behavior.showTagContextMenu({}, virtualItem.tag, { ...virtualItem, files: [] })).toBe(false);
  });
});
