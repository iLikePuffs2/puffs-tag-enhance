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
