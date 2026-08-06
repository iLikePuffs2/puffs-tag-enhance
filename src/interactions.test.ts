import { afterEach, describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { InteractionsBehavior } from './interactions';
import { OrderControllerBehavior } from './view/order-controller';

// 排序交互的 DOM 部分已搬到 view/order-controller.ts，数据部分仍在 interactions.ts。
// 运行时两者都被 mixin 到同一个 plugin 对象上，这里如实模拟那个合并后的对象。
function createMixedBehavior(): any {
  const behavior: any = Object.create(InteractionsBehavior.prototype);
  for (const [name, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(OrderControllerBehavior.prototype)
  )) {
    if (name !== 'constructor') Object.defineProperty(behavior, name, descriptor);
  }
  return behavior;
}
import { createNoteCardSearchState } from "./models";

describe('标签笔记搜索与父子嵌套', () => {
  it('可按当前可见父级下的关系 alias 命中子笔记', () => {
    const behavior = createMixedBehavior();
    behavior.getNoteDisplayName = (_tag: string, file: any) => file.basename;
    behavior.getHierarchyParents = (path: string) => path === '子.md' ? ['父.md'] : [];
    behavior.getInlineHierarchyDisplayName = () => '关系别名';
    const parent = new (TFile as any)('父.md');
    const child = new (TFile as any)('子.md');

    expect(behavior.getNoteCardSearchMatches('#标签*关系别名', [{
      tag: '#标签',
      files: [parent, child],
      isVirtual: false,
    }])).toEqual([{ tag: '#标签', path: '子.md', key: '#标签\u0000子.md' }]);
  });
});

describe('当前笔记标签定位', () => {
  const createBehavior = (currentPath: string | null, files: Record<string, any>) => {
    const behavior = createMixedBehavior();
    behavior.currentMainFilePath = currentPath;
    behavior.app = {
      vault: {
        getAbstractFileByPath: (path: string) => files[path] || null,
      },
    };
    behavior.clearInlineHierarchyBranchState = () => {};
    return behavior;
  };

  const 当前 = new (TFile as any)('当前.md');
  const 其他 = new (TFile as any)('其他.md');
  const vault = { '当前.md': 当前, '其他.md': 其他 };

  it('只返回当前笔记直接打了的标签，排除仅继承而来的', () => {
    const behavior = createBehavior('当前.md', vault);
    behavior.getLogicalTagSet = () => new Set(['#读书', '#科幻', '#无关', '#继承来的']);
    behavior.getTagBrowseData = (tag: string) => {
      const exactFiles = {
        '#读书': [当前, 其他],
        '#科幻': [当前],
        '#无关': [其他],
        '#继承来的': [],
      }[tag] || [];
      const inheritedFiles = tag === '#继承来的' ? [当前] : [];
      return {
        exactFiles,
        inheritedFiles,
        files: exactFiles.concat(inheritedFiles),
        exactCount: exactFiles.length,
        inheritedCount: inheritedFiles.length,
        inheritanceEnabled: false,
        hasInheritance: false,
        sourcesByPath: new Map(),
      };
    };

    expect(behavior.getCurrentNoteTagItems().map((item: any) => item.tag))
      .toEqual(['#读书', '#科幻']);
  });

  it('排除嵌套标签', () => {
    const behavior = createBehavior('当前.md', vault);
    behavior.getLogicalTagSet = () => new Set(['#读书', '#读书/科幻']);
    behavior.getTagBrowseData = () => ({
      exactFiles: [当前],
      inheritedFiles: [],
      files: [当前],
      exactCount: 1,
      inheritedCount: 0,
      inheritanceEnabled: false,
      hasInheritance: false,
      sourcesByPath: new Map(),
    });

    expect(behavior.getCurrentNoteTagItems().map((item: any) => item.tag)).toEqual(['#读书']);
  });

  it.each([
    ['无打开笔记', null, '当前没有打开笔记。'],
    ['打开的不是 md', '图片.png', '当前没有打开笔记。'],
  ])('%s 时返回空列表并给出提示', (_name, currentPath, expectedMessage) => {
    const behavior = createBehavior(currentPath, {
      ...vault,
      '图片.png': new (TFile as any)('图片.png'),
    });
    behavior.getLogicalTagSet = () => new Set(['#读书']);
    behavior.getTagBrowseData = () => ({ exactFiles: [当前] });

    expect(behavior.getCurrentNoteTagItems()).toEqual([]);
    expect(behavior.getCurrentNoteTagEmptyMessage()).toBe(expectedMessage);
  });

  it('当前笔记没有标签时给出对应提示', () => {
    const behavior = createBehavior('当前.md', vault);
    expect(behavior.getCurrentNoteTagEmptyMessage()).toBe('当前笔记没有标签。');
  });

  it('为每个标签生成一条指向当前笔记的定位记录', () => {
    const behavior = createBehavior('当前.md', vault);
    expect(behavior.getCurrentNoteTagMatches([{ tag: '#读书' }, { tag: '#科幻' }])).toEqual([
      { tag: '#读书', path: '当前.md', key: '#读书\u0000当前.md' },
      { tag: '#科幻', path: '当前.md', key: '#科幻\u0000当前.md' },
    ]);
  });

  it('切换笔记时把定位重置到第一个标签', () => {
    const behavior = createBehavior('当前.md', vault);
    behavior.expandedTags = new Set();
    const state = createNoteCardSearchState() as any;
    const items = [{ tag: '#读书' }, { tag: '#科幻' }];

    behavior.syncCurrentNoteTagSearchState(state, items, behavior.expandedTags);
    behavior.advanceNoteCardSearchState(state, behavior.expandedTags);
    expect(state.activeIndex).toBe(1);

    behavior.currentMainFilePath = '其他.md';
    behavior.syncCurrentNoteTagSearchState(state, items, behavior.expandedTags);
    expect(state.activeIndex).toBe(0);
    expect(state.target?.path).toBe('其他.md');
  });

  it('同一篇笔记重绘时保持当前定位不跳回开头', () => {
    const behavior = createBehavior('当前.md', vault);
    behavior.expandedTags = new Set();
    const state = createNoteCardSearchState() as any;
    const items = [{ tag: '#读书' }, { tag: '#科幻' }];

    behavior.syncCurrentNoteTagSearchState(state, items, behavior.expandedTags);
    behavior.advanceNoteCardSearchState(state, behavior.expandedTags);
    behavior.syncCurrentNoteTagSearchState(state, items, behavior.expandedTags);

    expect(state.activeIndex).toBe(1);
    expect(state.target?.tag).toBe('#科幻');
  });

  it('没有匹配标签时清空定位状态', () => {
    const behavior = createBehavior('当前.md', vault);
    behavior.expandedTags = new Set();
    const state = createNoteCardSearchState() as any;

    expect(behavior.syncCurrentNoteTagSearchState(state, [], behavior.expandedTags)).toBeNull();
    expect(state.matches).toEqual([]);
    expect(state.activeIndex).toBe(-1);
  });
});

describe('固定标签与父笔记排序', () => {
  it('搜索框为空时只返回已固定的真实标签', () => {
    const behavior = createMixedBehavior();
    behavior.settings = { pinnedTag: '#固定' };
    behavior.getPinnedTagItem = () => ({ tag: '#固定', files: [] });
    const items = [
      { tag: '#其他', files: [] },
      { tag: '#固定', files: [] },
    ];

    expect(behavior.prependPinnedTagItem(items, '')).toEqual([
      { tag: '#固定', files: [], isPinnedExtra: false },
    ]);
    expect(behavior.prependPinnedTagItem(items, '其他').map((item: any) => item.tag))
      .toEqual(['#其他', '#固定']);
    expect(behavior.isPinnedOnlyTagResult('', behavior.prependPinnedTagItem(items, ''))).toBe(true);
    expect(behavior.isPinnedOnlyTagResult('固定', behavior.prependPinnedTagItem(items, ''))).toBe(false);
  });

  it('移动父笔记时忽略嵌套在卡片内的子笔记', () => {
    const behavior = createMixedBehavior();
    behavior.settings = {
      noteOrderByTag: {
        '#标签': ['父一.md', '子一.md', '子二.md', '父二.md'],
      },
    };
    behavior.getHierarchyParents = (path: string) =>
      ['子一.md', '子二.md'].includes(path) ? ['父一.md'] : [];
    const files = ['父一.md', '子一.md', '子二.md', '父二.md']
      .map((path) => new (TFile as any)(path));

    expect(behavior.getOrderedRootFilesForTag('#标签', files).map((file: any) => file.path))
      .toEqual(['父一.md', '父二.md']);
  });

  const createPointerButton = () => {
    const listeners = new Map<string, Set<(event: any) => void>>();
    return {
      dataset: { puffsTag: '#标签', path: '父.md' },
      addEventListener(type: string, listener: (event: any) => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)?.add(listener);
      },
      removeEventListener(type: string, listener: (event: any) => void) {
        listeners.get(type)?.delete(listener);
      },
      emit(type: string, properties: Record<string, unknown> = {}) {
        const event = {
          button: 0,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          ...properties,
        };
        for (const listener of listeners.get(type) || []) listener(event);
        return event;
      },
    } as any;
  };

  afterEach(() => vi.useRealTimers());

  it('父笔记组合按钮短按只切换展开状态', () => {
    const behavior = createMixedBehavior();
    behavior.isNoteOrderTargetSelected = () => false;
    const button = createPointerButton();
    const toggleExpansion = vi.fn();
    const toggleOrder = vi.fn();

    behavior.bindNoteParentControlButton(button, toggleExpansion, toggleOrder);
    button.emit('pointerdown');
    button.emit('pointerup');
    button.emit('click');

    expect(toggleExpansion).toHaveBeenCalledOnce();
    expect(toggleOrder).not.toHaveBeenCalled();
  });

  it('父笔记组合按钮长按 500ms 只进入排序且释放时不折叠', () => {
    vi.useFakeTimers();
    let selected = false;
    const behavior = createMixedBehavior();
    behavior.isNoteOrderTargetSelected = () => selected;
    const button = createPointerButton();
    const toggleExpansion = vi.fn();
    const toggleOrder = vi.fn(() => { selected = !selected; });

    behavior.bindNoteParentControlButton(button, toggleExpansion, toggleOrder);
    button.emit('pointerdown');
    vi.advanceTimersByTime(InteractionsBehavior.NOTE_ORDER_LONG_PRESS_MS - 1);
    expect(toggleOrder).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    button.emit('pointerup');
    button.emit('click');

    expect(InteractionsBehavior.NOTE_ORDER_LONG_PRESS_MS).toBe(500);
    expect(toggleOrder).toHaveBeenCalledOnce();
    expect(toggleExpansion).not.toHaveBeenCalled();
  });

  it('排序选中态单击只取消排序，移出按钮会取消未完成的长按', () => {
    vi.useFakeTimers();
    let selected = true;
    const behavior = createMixedBehavior();
    behavior.isNoteOrderTargetSelected = () => selected;
    const button = createPointerButton();
    const toggleExpansion = vi.fn();
    const toggleOrder = vi.fn(() => { selected = !selected; });

    behavior.bindNoteParentControlButton(button, toggleExpansion, toggleOrder);
    button.emit('click');
    expect(toggleOrder).toHaveBeenCalledOnce();
    expect(toggleExpansion).not.toHaveBeenCalled();

    button.emit('pointerdown');
    button.emit('pointerleave');
    vi.advanceTimersByTime(InteractionsBehavior.NOTE_ORDER_LONG_PRESS_MS);
    expect(toggleOrder).toHaveBeenCalledOnce();

    button.emit('pointerdown');
    button.emit('pointercancel');
    vi.advanceTimersByTime(InteractionsBehavior.NOTE_ORDER_LONG_PRESS_MS);
    expect(toggleOrder).toHaveBeenCalledOnce();
  });
});

describe('子标签排序', () => {
  afterEach(() => vi.useRealTimers());

  const createTagControlButton = (dataset: Record<string, string>) => {
    const listeners = new Map<string, Set<(event: any) => void>>();
    return {
      dataset,
      addEventListener(type: string, listener: (event: any) => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)?.add(listener);
      },
      removeEventListener(type: string, listener: (event: any) => void) {
        listeners.get(type)?.delete(listener);
      },
      emit(type: string, properties: Record<string, unknown> = {}) {
        const event = {
          button: 0,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          ...properties,
        };
        for (const listener of listeners.get(type) || []) listener(event);
        return event;
      },
    } as any;
  };

  it('右键跳跃移动仅修改当前父级并保持其他父级独立', async () => {
    const childrenByParent: Record<string, string[]> = {
      '#父': ['#甲', '#乙', '#丙'],
      '#另一父': ['#甲', '#丁'],
    };
    const behavior = createMixedBehavior();
    behavior.activeTagOrderParent = '#父';
    behavior.selectedTagOrderTarget = { parentTag: '#父', tag: '#甲', surface: 'sidebar' };
    behavior.getInheritanceChildren = (parent: string) => [...childrenByParent[parent]];
    behavior.setInheritanceChildren = vi.fn(async (parent: string, children: string[]) => {
      childrenByParent[parent] = [...children];
    });
    behavior.refreshTagOrderSelectionState = vi.fn();

    await expect(behavior.moveSelectedTagAfter('#父', '#乙')).resolves.toBe(true);
    expect(childrenByParent['#父']).toEqual(['#乙', '#甲', '#丙']);
    expect(childrenByParent['#另一父']).toEqual(['#甲', '#丁']);
    await expect(behavior.moveSelectedTagAfter('#另一父', '#丁')).resolves.toBe(false);
  });

  it('父级模式与子标签选择分离，并与笔记排序互斥', () => {
    const behavior = createMixedBehavior();
    behavior.selectedNoteOrderTarget = { tag: '#标签', path: '笔记.md' };
    behavior.activeTagOrderParent = null;
    behavior.selectedTagOrderTarget = null;
    behavior.hasInheritanceChildren = () => true;
    behavior.deactivateNoteOrderHotkeyScope = vi.fn();
    behavior.refreshNoteOrderHotkeyScope = vi.fn();
    behavior.refreshOrderSelectionState = vi.fn();

    behavior.toggleTagOrderMode('#父', 'shelf');
    expect(behavior.selectedNoteOrderTarget).toBeNull();
    expect(behavior.activeTagOrderParent).toBe('#父');
    expect(behavior.selectedTagOrderTarget).toBeNull();

    behavior.toggleTagOrderTarget('#父', '#子', 'shelf');
    expect(behavior.selectedTagOrderTarget).toEqual({ parentTag: '#父', tag: '#子', surface: 'shelf' });

    behavior.toggleNoteOrderTarget('#标签', '笔记.md', 'sidebar');
    expect(behavior.activeTagOrderParent).toBeNull();
    expect(behavior.selectedTagOrderTarget).toBeNull();
    expect(behavior.selectedNoteOrderTarget).toEqual({ tag: '#标签', path: '笔记.md', surface: 'sidebar' });
  });

  it('长按父标签进入或退出模式且释放时不折叠', () => {
    vi.useFakeTimers();
    const behavior = createMixedBehavior();
    behavior.activeTagOrderParent = null;
    behavior.activeTagOrderSurface = '';
    behavior.selectedNoteOrderTarget = null;
    behavior.selectedTagOrderTarget = null;
    behavior.hasInheritanceChildren = () => true;
    behavior.deactivateNoteOrderHotkeyScope = vi.fn();
    behavior.refreshOrderSelectionState = vi.fn();
    const button = createTagControlButton({
      puffsTagOrderTag: '#父',
      puffsHasChildren: 'true',
      puffsSurface: 'shelf',
      puffsExpanded: 'false',
    });
    const toggleExpansion = vi.fn();
    behavior.bindTagHierarchyControlButton(button, toggleExpansion);

    button.emit('pointerdown');
    vi.advanceTimersByTime(InteractionsBehavior.NOTE_ORDER_LONG_PRESS_MS);
    button.emit('pointerup');
    button.emit('click');
    expect(behavior.activeTagOrderParent).toBe('#父');
    expect(behavior.selectedTagOrderTarget).toBeNull();
    expect(toggleExpansion).toHaveBeenCalledOnce();

    button.emit('pointerdown');
    vi.advanceTimersByTime(InteractionsBehavior.NOTE_ORDER_LONG_PRESS_MS);
    button.emit('pointerup');
    button.emit('click');
    expect(behavior.activeTagOrderParent).toBeNull();
    expect(toggleExpansion).toHaveBeenCalledOnce();
  });

  it('父级模式中子按钮点击选中，点击外部只取消选中', () => {
    vi.useFakeTimers();
    const behavior = createMixedBehavior();
    behavior.activeTagOrderParent = '#父';
    behavior.activeTagOrderSurface = 'sidebar';
    behavior.selectedNoteOrderTarget = null;
    behavior.selectedTagOrderTarget = null;
    behavior.deactivateNoteOrderHotkeyScope = vi.fn();
    behavior.refreshNoteOrderHotkeyScope = vi.fn();
    behavior.refreshOrderSelectionState = vi.fn();
    const button = createTagControlButton({
      puffsTagOrderParent: '#父',
      puffsTagOrderTag: '#子',
      puffsHasChildren: 'true',
      puffsSurface: 'sidebar',
    });
    const toggleExpansion = vi.fn();
    behavior.bindTagHierarchyControlButton(button, toggleExpansion);

    button.emit('pointerdown');
    vi.advanceTimersByTime(InteractionsBehavior.NOTE_ORDER_LONG_PRESS_MS);
    expect(behavior.activeTagOrderParent).toBe('#父');
    expect(toggleExpansion).not.toHaveBeenCalled();

    button.emit('click');
    expect(behavior.selectedTagOrderTarget).toEqual({ parentTag: '#父', tag: '#子', surface: 'sidebar' });
    expect(toggleExpansion).not.toHaveBeenCalled();

    behavior.clearOrderTarget();
    expect(behavior.activeTagOrderParent).toBe('#父');
    expect(behavior.selectedTagOrderTarget).toBeNull();
  });
});
