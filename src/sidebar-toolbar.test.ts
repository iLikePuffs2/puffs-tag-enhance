import { describe, expect, it } from "vitest";
import {
  createDefaultSidebarToolbarButtons,
  getAvailableSidebarToolbarButtons,
  moveSidebarToolbarButton,
  normalizeSidebarToolbarButtons,
  shouldShowScrollButtons,
} from "./sidebar-toolbar";

describe('回顶/回底按钮的显示阈值', () => {
  it('阈值为 0 时一律不显示（设置面板里 0 表示关闭）', () => {
    expect(shouldShowScrollButtons(0, 0)).toBe(false);
    expect(shouldShowScrollButtons(999, 0)).toBe(false);
  });

  it('笔记数达到阈值才显示，边界值本身算达到', () => {
    expect(shouldShowScrollButtons(2, 3)).toBe(false);
    expect(shouldShowScrollButtons(3, 3)).toBe(true);
    expect(shouldShowScrollButtons(4, 3)).toBe(true);
  });

  it('没有笔记时不显示，即使阈值是 1', () => {
    expect(shouldShowScrollButtons(0, 1)).toBe(false);
  });

  it('阈值非法（负数、NaN、undefined）时按关闭处理', () => {
    expect(shouldShowScrollButtons(10, -1)).toBe(false);
    expect(shouldShowScrollButtons(10, Number.NaN)).toBe(false);
    expect(shouldShowScrollButtons(10, undefined)).toBe(false);
  });
});

describe('侧边栏顶栏按钮配置', () => {
  it('缺失或非法配置恢复为默认按钮及可见状态', () => {
    expect(normalizeSidebarToolbarButtons(null)).toEqual(createDefaultSidebarToolbarButtons());
    expect(normalizeSidebarToolbarButtons('invalid')).toEqual(createDefaultSidebarToolbarButtons());
  });

  it('去重、丢弃未知标识并修复非法可见状态', () => {
    const result = normalizeSidebarToolbarButtons([
      { id: 'scroll-top', visible: false },
      { id: 'unknown', visible: true },
      { id: 'note-hierarchy', visible: true },
      { id: 'scroll-top', visible: true },
    ]);
    expect(result.find((item) => item.id === 'scroll-top')).toEqual({ id: 'scroll-top', visible: false });
    expect(result.some((item) => String(item.id) === 'unknown')).toBe(false);
    expect(result.some((item) => String(item.id) === 'note-hierarchy')).toBe(false);
    // 顶栏现有 4 个按钮：原生的「排序」与已移除的「打开标签系统」不再计入
    expect(result).toHaveLength(4);
  });

  it('旧配置缺少按钮时按默认相对位置补齐', () => {
    const result = normalizeSidebarToolbarButtons([
      { id: 'scroll-bottom', visible: false },
      { id: 'filter', visible: true },
    ]);
    expect(result.map((item) => item.id)).toEqual([
      'expand-collapse',
      'scroll-bottom',
      'scroll-top',
      'filter',
    ]);
    expect(result.find((item) => item.id === 'scroll-bottom')?.visible).toBe(false);
  });

  it('上移和下移只改变顺序并保留可见状态', () => {
    const initial = normalizeSidebarToolbarButtons([
      { id: 'expand-collapse', visible: true },
      { id: 'scroll-bottom', visible: false },
      { id: 'scroll-top', visible: true },
      { id: 'filter', visible: true },
    ]);

    const moved = moveSidebarToolbarButton(initial, 'expand-collapse', 1);
    expect(moved.map((item) => item.id)).toEqual([
      'scroll-bottom',
      'expand-collapse',
      'scroll-top',
      'filter',
    ]);
    // 顺序变了但显隐不变
    expect(moved.find((item) => item.id === 'scroll-bottom')?.visible).toBe(false);

    // 首项再上移、末项再下移都是空操作
    expect(moveSidebarToolbarButton(moved, 'scroll-bottom', -1)).toEqual(moved);
    expect(moveSidebarToolbarButton(moved, 'filter', 1)).toEqual(moved);
  });

  it('渲染时按配置顺序跳过暂时缺失的原生按钮', () => {
    const configured = moveSidebarToolbarButton(
      createDefaultSidebarToolbarButtons(),
      'filter',
      -1
    );
    const available = getAvailableSidebarToolbarButtons(configured, [
      'scroll-bottom',
      'scroll-top',
      'filter',
    ]);
    expect(available.map((item) => item.id)).toEqual([
      'scroll-bottom',
      'filter',
      'scroll-top',
    ]);
  });
});
