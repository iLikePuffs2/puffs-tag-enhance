import { afterEach, describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { InteractionsBehavior } from "./interactions";

describe('标签笔记搜索与父子嵌套', () => {
  it('可按当前可见父级下的关系 alias 命中子笔记', () => {
    const behavior = Object.create(InteractionsBehavior.prototype) as any;
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

describe('固定标签与父笔记排序', () => {
  it('搜索框为空时只返回已固定的真实标签', () => {
    const behavior = Object.create(InteractionsBehavior.prototype) as any;
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
    const behavior = Object.create(InteractionsBehavior.prototype) as any;
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
    const behavior = Object.create(InteractionsBehavior.prototype) as any;
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
    const behavior = Object.create(InteractionsBehavior.prototype) as any;
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
    const behavior = Object.create(InteractionsBehavior.prototype) as any;
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
    const behavior = Object.create(InteractionsBehavior.prototype) as any;
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
    const behavior = Object.create(InteractionsBehavior.prototype) as any;
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
    const behavior = Object.create(InteractionsBehavior.prototype) as any;
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
    const behavior = Object.create(InteractionsBehavior.prototype) as any;
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
