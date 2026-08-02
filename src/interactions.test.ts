import { describe, expect, it } from "vitest";
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
});
