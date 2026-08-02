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
