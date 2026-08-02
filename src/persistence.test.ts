import { describe, expect, it, vi } from "vitest";
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
