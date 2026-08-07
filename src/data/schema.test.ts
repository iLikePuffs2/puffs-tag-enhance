// 数据层测试：结构迁移链、默认顺序判定、侧边栏偏好的形态兼容。

import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  isDefaultNoteOrder,
  migrateSchema,
  readPreferredFiles,
} from './schema';

const file = (path: string) => ({ path, basename: path.replace(/\.[^.]+$/, '') });

describe('结构迁移链', () => {
  it('没有版本号的旧数据从 0 开始迁移，跑完打上当前版本', () => {
    const data: any = { tagSidebarPreferredFiles: { 'a.md': true } };
    expect(migrateSchema(data)).toBe(true);
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('已是当前版本时不重复迁移', () => {
    const data: any = { schemaVersion: CURRENT_SCHEMA_VERSION, tagSidebarPreferredFiles: { 'a.md': true } };
    expect(migrateSchema(data)).toBe(false);
    expect(data.tagSidebarPreferredFiles).toEqual({ 'a.md': true }); // 原样保留
  });

  it('容错空值', () => {
    expect(migrateSchema(null)).toBe(false);
    expect(migrateSchema(undefined)).toBe(false);
  });

  it('侧边栏偏好由对象改为数组，只保留值为 true 的项', () => {
    const data: any = { tagSidebarPreferredFiles: { 'a.md': true, 'b.md': false, 'c.md': true } };
    migrateSchema(data);
    expect(data.tagSidebarPreferredFiles.sort()).toEqual(['a.md', 'c.md']);
  });
});

describe('侧边栏偏好的形态兼容', () => {
  it('读数组', () => {
    expect(Array.from(readPreferredFiles(['a.md', 'b.md']))).toEqual(['a.md', 'b.md']);
  });

  it('读迁移前的对象形态，只认 true', () => {
    expect(Array.from(readPreferredFiles({ 'a.md': true, 'b.md': false }))).toEqual(['a.md']);
  });

  it('去重与容错', () => {
    expect(readPreferredFiles(['a.md', 'a.md']).size).toBe(1);
    expect(readPreferredFiles(null).size).toBe(0);
    expect(readPreferredFiles(undefined).size).toBe(0);
    expect(readPreferredFiles(['', 'a.md']).size).toBe(1);
  });
});

describe('默认顺序判定', () => {
  const files = [file('阿.md'), file('波.md'), file('春.md')];

  it('与中文拼音序完全一致时判为默认顺序', () => {
    expect(isDefaultNoteOrder(['阿.md', '波.md', '春.md'], files)).toBe(true);
  });

  it('顺序不同即非默认', () => {
    expect(isDefaultNoteOrder(['春.md', '阿.md', '波.md'], files)).toBe(false);
  });

  it('数量不符即非默认', () => {
    expect(isDefaultNoteOrder(['阿.md', '波.md'], files)).toBe(false);
    expect(isDefaultNoteOrder(['阿.md', '波.md', '春.md', '多.md'], files)).toBe(false);
  });

  it('同名文件按路径兜底排序', () => {
    const dup = [file('乙/同名.md'), file('甲/同名.md')];
    expect(isDefaultNoteOrder(['甲/同名.md', '乙/同名.md'], dup)).toBe(true);
    expect(isDefaultNoteOrder(['乙/同名.md', '甲/同名.md'], dup)).toBe(false);
  });

  it('空列表算默认顺序', () => {
    expect(isDefaultNoteOrder([], [])).toBe(true);
  });

  it('新笔记追加到末尾造成的偏离不算默认序 —— 那种顺序带有加入先后的信息', () => {
    // 默认序是 [阿, 波, 春]，把后加入的「阿」放到末尾属于有信息量的排列
    expect(isDefaultNoteOrder(['波.md', '春.md', '阿.md'], files)).toBe(false);
  });
});
