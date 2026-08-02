import { describe, expect, it } from "vitest";
import {
  createDefaultSidebarToolbarButtons,
  getAvailableSidebarToolbarButtons,
  moveSidebarToolbarButton,
  normalizeSidebarToolbarButtons,
} from "./sidebar-toolbar";

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
      { id: 'sort', visible: 'no' },
    ]);
    expect(result.find((item) => item.id === 'scroll-top')).toEqual({ id: 'scroll-top', visible: false });
    expect(result.find((item) => item.id === 'sort')).toEqual({ id: 'sort', visible: true });
    expect(result.some((item) => String(item.id) === 'unknown')).toBe(false);
    expect(result.some((item) => String(item.id) === 'note-hierarchy')).toBe(false);
    expect(result).toHaveLength(6);
  });

  it('旧配置缺少按钮时按默认相对位置补齐', () => {
    const result = normalizeSidebarToolbarButtons([
      { id: 'sort', visible: true },
      { id: 'scroll-bottom', visible: false },
      { id: 'filter', visible: true },
    ]);
    expect(result.map((item) => item.id)).toEqual([
      'sort',
      'expand-collapse',
      'open-tag-system',
      'scroll-bottom',
      'scroll-top',
      'filter',
    ]);
    expect(result.find((item) => item.id === 'scroll-bottom')?.visible).toBe(false);
  });

  it('上移和下移只改变顺序并保留隐藏状态', () => {
    const initial = createDefaultSidebarToolbarButtons();
    const moved = moveSidebarToolbarButton(initial, 'open-tag-system', 1);
    expect(moved.map((item) => item.id).slice(1, 4)).toEqual([
      'expand-collapse',
      'scroll-bottom',
      'open-tag-system',
    ]);
    expect(moved.find((item) => item.id === 'open-tag-system')?.visible).toBe(false);
    expect(moveSidebarToolbarButton(moved, 'sort', -1)).toEqual(moved);
  });

  it('渲染时按配置顺序跳过暂时缺失的原生按钮', () => {
    const configured = moveSidebarToolbarButton(
      createDefaultSidebarToolbarButtons(),
      'filter',
      -1
    );
    const available = getAvailableSidebarToolbarButtons(configured, [
      'sort',
      'scroll-bottom',
      'scroll-top',
      'filter',
    ]);
    expect(available.map((item) => item.id)).toEqual([
      'sort',
      'scroll-bottom',
      'filter',
      'scroll-top',
    ]);
  });
});
