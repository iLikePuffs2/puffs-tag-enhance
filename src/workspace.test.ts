import { describe, expect, it, vi } from 'vitest';
import { WorkspaceBehavior } from './workspace';

const createKeyEvent = (key: string, overrides: Record<string, unknown> = {}) => ({
  key,
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  stopImmediatePropagation: vi.fn(),
  ...overrides,
});

describe('父子关系定位历史快捷键', () => {
  it.each([
    ['sidebar', 'ArrowLeft', -1],
    ['sidebar', 'ArrowRight', 1],
  ])('在活动的 %s 界面拦截 Alt 方向键', (surface, key, direction) => {
    const behavior = Object.create(WorkspaceBehavior.prototype) as any;
    const view = { id: surface };
    behavior.getActiveHierarchyNavigationSurface = vi.fn(() => ({ view, surface }));
    behavior.getHierarchyNavigationHistory = vi.fn(() => ({
      entries: [{}, {}],
      index: key === 'ArrowLeft' ? 1 : 0,
    }));
    behavior.navigateHierarchyHistory = vi.fn();
    const event = createKeyEvent(key);

    expect(behavior.handleHierarchyNavigationHotkey(event)).toBe(true);
    expect(behavior.navigateHierarchyHistory).toHaveBeenCalledWith(view, surface, direction);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it('没有插件历史时不拦截 Obsidian 快捷键', () => {
    const behavior = Object.create(WorkspaceBehavior.prototype) as any;
    behavior.getActiveHierarchyNavigationSurface = vi.fn(() => ({ view: {}, surface: 'sidebar' }));
    behavior.getHierarchyNavigationHistory = vi.fn(() => ({ entries: [], index: -1 }));
    behavior.navigateHierarchyHistory = vi.fn();
    const event = createKeyEvent('ArrowLeft');

    expect(behavior.handleHierarchyNavigationHotkey(event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(behavior.navigateHierarchyHistory).not.toHaveBeenCalled();
  });

  it('位于历史边界时把快捷键留给 Obsidian', () => {
    const behavior = Object.create(WorkspaceBehavior.prototype) as any;
    behavior.getActiveHierarchyNavigationSurface = vi.fn(() => ({ view: {}, surface: 'sidebar' }));
    behavior.getHierarchyNavigationHistory = vi.fn(() => ({ entries: [{}, {}], index: 0 }));
    behavior.navigateHierarchyHistory = vi.fn();
    const event = createKeyEvent('ArrowLeft');

    expect(behavior.handleHierarchyNavigationHotkey(event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(behavior.navigateHierarchyHistory).not.toHaveBeenCalled();
  });

  it('仅匹配不带其他修饰键的 Alt+左右方向键', () => {
    const behavior = Object.create(WorkspaceBehavior.prototype) as any;
    behavior.getActiveHierarchyNavigationSurface = vi.fn();

    expect(behavior.handleHierarchyNavigationHotkey(createKeyEvent('ArrowUp'))).toBe(false);
    expect(behavior.handleHierarchyNavigationHotkey(createKeyEvent('ArrowLeft', { ctrlKey: true }))).toBe(false);
    expect(behavior.getActiveHierarchyNavigationSurface).not.toHaveBeenCalled();
  });
});

describe('侧边栏快捷搜索键入口', () => {
  it('焦点事件来自侧边栏时，在 Obsidian 之前拦截并聚焦搜索框', () => {
    const behavior = Object.create(WorkspaceBehavior.prototype) as any;
    const view = { handleQuickSearchHotkey: vi.fn() };
    behavior.isQuickSearchHotkey = vi.fn(() => true);
    behavior.getSidebarViewForKeyboardEvent = vi.fn(() => view);
    const event = createKeyEvent('f', { altKey: false, ctrlKey: true });

    expect(behavior.handleSidebarQuickSearchHotkey(event)).toBe(true);
    expect(view.handleQuickSearchHotkey).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it('焦点不在侧边栏时不影响编辑器原生查找', () => {
    const behavior = Object.create(WorkspaceBehavior.prototype) as any;
    behavior.isQuickSearchHotkey = vi.fn(() => true);
    behavior.getSidebarViewForKeyboardEvent = vi.fn(() => null);
    const event = createKeyEvent('f', { altKey: false, ctrlKey: true });

    expect(behavior.handleSidebarQuickSearchHotkey(event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
