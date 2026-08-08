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

// 指定文件夹默认打开标签面板。
//
// 判定分三层：例外名单 → 默认文件夹 → 原有白名单。
// 关键约束是「只记录例外」：默认文件夹里的笔记走的是排除名单，
// 不能再往白名单里逐篇写入，否则 data.json 会把整个文件夹的笔记记一遍。
describe('文件夹默认面板偏好', () => {
  const createBehavior = (settings: Record<string, unknown> = {}) => {
    const behavior = Object.create(WorkspaceBehavior.prototype) as any;
    behavior.settings = {
      tagSidebarPreferredFiles: [],
      tagSidebarDefaultFolders: [],
      tagSidebarExcludedFiles: [],
      ...settings,
    };
    behavior.saveSettings = vi.fn(async () => undefined);
    return behavior;
  };

  it('默认文件夹里的笔记默认开标签面板', () => {
    const behavior = createBehavior({ tagSidebarDefaultFolders: ['日记'] });
    expect(behavior.hasTagSidebarPreference('日记/今天.md')).toBe(true);
    expect(behavior.hasTagSidebarPreference('日记/2026/今天.md')).toBe(true);
  });

  it('例外名单优先于默认文件夹', () => {
    const behavior = createBehavior({
      tagSidebarDefaultFolders: ['日记'],
      tagSidebarExcludedFiles: ['日记/今天.md'],
    });
    expect(behavior.hasTagSidebarPreference('日记/今天.md')).toBe(false);
    expect(behavior.hasTagSidebarPreference('日记/昨天.md')).toBe(true);
  });

  it('文件夹之外仍走原有白名单', () => {
    const behavior = createBehavior({ tagSidebarPreferredFiles: ['别处/散记.md'] });
    expect(behavior.hasTagSidebarPreference('别处/散记.md')).toBe(true);
    expect(behavior.hasTagSidebarPreference('别处/其他.md')).toBe(false);
  });

  it('在默认文件夹里切走时写入例外，而不是往白名单塞记录', async () => {
    const behavior = createBehavior({ tagSidebarDefaultFolders: ['日记'] });
    await behavior.setTagSidebarPreference('日记/今天.md', false);

    expect(behavior.settings.tagSidebarExcludedFiles).toEqual(['日记/今天.md']);
    expect(behavior.settings.tagSidebarPreferredFiles).toEqual([]);
  });

  it('在默认文件夹里切回标签面板时移除例外，同样不碰白名单', async () => {
    const behavior = createBehavior({
      tagSidebarDefaultFolders: ['日记'],
      tagSidebarExcludedFiles: ['日记/今天.md'],
    });
    await behavior.setTagSidebarPreference('日记/今天.md', true);

    expect(behavior.settings.tagSidebarExcludedFiles).toEqual([]);
    expect(behavior.settings.tagSidebarPreferredFiles).toEqual([]);
  });

  it('文件夹之外的笔记仍按白名单增删', async () => {
    const behavior = createBehavior();
    await behavior.setTagSidebarPreference('别处/散记.md', true);
    expect(behavior.settings.tagSidebarPreferredFiles).toEqual(['别处/散记.md']);

    await behavior.setTagSidebarPreference('别处/散记.md', false);
    expect(behavior.settings.tagSidebarPreferredFiles).toEqual([]);
  });

  it('状态本就正确时不写盘', async () => {
    const behavior = createBehavior({ tagSidebarDefaultFolders: ['日记'] });
    await behavior.setTagSidebarPreference('日记/今天.md', true);
    expect(behavior.saveSettings).not.toHaveBeenCalled();
  });

  it('笔记改名时例外名单跟着迁移', () => {
    const behavior = createBehavior({
      tagSidebarDefaultFolders: ['日记'],
      tagSidebarExcludedFiles: ['日记/旧名.md'],
    });
    behavior.updateCurrentMainFilePath = vi.fn();
    behavior.handlePreferredFileRename({ path: '日记/新名.md' }, '日记/旧名.md');

    expect(behavior.settings.tagSidebarExcludedFiles).toEqual(['日记/新名.md']);
  });

  it('笔记删除时例外名单跟着清理', () => {
    const behavior = createBehavior({
      tagSidebarDefaultFolders: ['日记'],
      tagSidebarExcludedFiles: ['日记/今天.md'],
    });
    behavior.updateCurrentMainFilePath = vi.fn();
    behavior.handlePreferredFileDelete({ path: '日记/今天.md' });

    expect(behavior.settings.tagSidebarExcludedFiles).toEqual([]);
  });
});
