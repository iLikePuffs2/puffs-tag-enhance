import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { PersistenceBehavior } from "./persistence";

describe('父子搜索关键字配置迁移', () => {
  it('加载时把任意旧值固定为等号并立即持久化', async () => {
    const behavior = Object.create(PersistenceBehavior.prototype) as any;
    behavior.loadData = vi.fn().mockResolvedValue({ noteHierarchySearchKeyword: '自定义关键字' });
    behavior.saveData = vi.fn().mockResolvedValue(undefined);
    behavior.settingsSavePromise = Promise.resolve();
    behavior.normalizeNoteOrderByTag = (value: unknown) => value || {};
    behavior.normalizeNoteDisplayNameByTag = (value: unknown) => value || {};
    behavior.normalizeRelationSettings = vi.fn();

    await behavior.loadSettings();

    expect(behavior.settings.noteHierarchySearchKeyword).toBe('=');
    expect(behavior.saveData).toHaveBeenCalledOnce();
    expect(behavior.saveData.mock.calls[0][0].noteHierarchySearchKeyword).toBe('=');
  });
});

describe('标签绑定笔记设置规范化', () => {
  it('只保留首个规范化标签对应的现存 Markdown 文件', () => {
    const behavior = Object.create(PersistenceBehavior.prototype) as any;
    const files = new Map([
      ['目录/绑定.md', new (TFile as any)('目录/绑定.md')],
      ['附件.png', new (TFile as any)('附件.png')],
    ]);
    behavior.app = { vault: { getAbstractFileByPath: (path: string) => files.get(path) || null } };

    expect(behavior.normalizeTagBoundNoteByTag({
      标签: '目录/绑定.md',
      '#标签': '其他.md',
      '#附件': '附件.png',
      '#缺失': '缺失.md',
      '#空': ' ',
      '#无效': 42,
    })).toEqual({ '#标签': '目录/绑定.md' });
  });
});
