import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { RelationsBehavior } from "./relations";

function createBehavior(noteHierarchy: any, exclusions: Record<string, string[]> = {}) {
  const behavior = Object.create(RelationsBehavior.prototype);
  behavior.settings = {
    relations: {
      version: 1,
      tagInheritance: {
        childrenByParent: {},
        enabledParents: [],
        excludedPathsByParent: exclusions,
      },
      noteHierarchy,
    },
  };
  behavior.saveSettings = vi.fn();
  return behavior;
}

describe('关系文件迁移', () => {
  it('改名或移动时迁移父节点、子节点、alias 与继承排除路径', () => {
    const behavior = createBehavior({
      childrenByParentPath: {
        '旧.md': ['子.md'],
        '另一父.md': ['旧.md'],
      },
      displayNamesByParentPath: {
        '旧.md': { '子.md': '子别名' },
        '另一父.md': { '旧.md': '旧别名' },
      },
    }, { '#父': ['旧.md'] });

    behavior.handleRelationFileRename(new (TFile as any)('目录/新.md'), '旧.md');

    expect(behavior.settings.relations.noteHierarchy.childrenByParentPath).toEqual({
      '另一父.md': ['目录/新.md'],
      '目录/新.md': ['子.md'],
    });
    expect(behavior.settings.relations.noteHierarchy.displayNamesByParentPath).toEqual({
      '另一父.md': { '目录/新.md': '旧别名' },
      '目录/新.md': { '子.md': '子别名' },
    });
    expect(behavior.settings.relations.tagInheritance.excludedPathsByParent['#父'])
      .toEqual(['目录/新.md']);
    expect(behavior.saveSettings).toHaveBeenCalledOnce();
  });

  it('删除时清理作为父级、子级和 alias 的全部记录', () => {
    const behavior = createBehavior({
      childrenByParentPath: {
        '待删.md': ['后代.md'],
        '保留父.md': ['待删.md', '保留子.md'],
      },
      displayNamesByParentPath: {
        '待删.md': { '后代.md': '后代别名' },
        '保留父.md': { '待删.md': '待删别名', '保留子.md': '保留别名' },
      },
    }, { '#父': ['待删.md', '保留.md'] });

    behavior.handleRelationFileDelete(new (TFile as any)('待删.md'));

    expect(behavior.settings.relations.noteHierarchy.childrenByParentPath).toEqual({
      '保留父.md': ['保留子.md'],
    });
    expect(behavior.settings.relations.noteHierarchy.displayNamesByParentPath).toEqual({
      '保留父.md': { '保留子.md': '保留别名' },
    });
    expect(behavior.settings.relations.tagInheritance.excludedPathsByParent['#父'])
      .toEqual(['保留.md']);
    expect(behavior.saveSettings).toHaveBeenCalledOnce();
  });
});
