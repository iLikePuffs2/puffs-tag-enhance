// 数据层测试：结构迁移链、默认顺序判定、侧边栏偏好的形态兼容。

import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  isDefaultNoteOrder,
  isPathInDefaultFolders,
  migrateSchema,
  normalizeDefaultFolders,
  readPreferredFiles,
} from './schema';

describe('默认打开标签面板的文件夹匹配', () => {
  it('文件夹内的直属笔记命中', () => {
    expect(isPathInDefaultFolders('日记/今天.md', ['日记'])).toBe(true);
  });

  it('子文件夹里的笔记同样命中（用户确认要包含子文件夹）', () => {
    expect(isPathInDefaultFolders('日记/2026/08/今天.md', ['日记'])).toBe(true);
  });

  it('同前缀但不同名的文件夹不误命中', () => {
    // 「日记本」不是「日记」的子文件夹，仅仅是字符串前缀相同
    expect(isPathInDefaultFolders('日记本/今天.md', ['日记'])).toBe(false);
  });

  it('与文件夹同名的笔记不命中 —— 它是文件不是目录下的内容', () => {
    expect(isPathInDefaultFolders('日记.md', ['日记'])).toBe(false);
  });

  it('多个文件夹里命中任意一个即可', () => {
    expect(isPathInDefaultFolders('随笔/散记.md', ['日记', '随笔'])).toBe(true);
    expect(isPathInDefaultFolders('别处/散记.md', ['日记', '随笔'])).toBe(false);
  });

  it('没有配置文件夹时一律不命中', () => {
    expect(isPathInDefaultFolders('日记/今天.md', [])).toBe(false);
    expect(isPathInDefaultFolders('日记/今天.md', null)).toBe(false);
  });

  it('空路径不命中', () => {
    expect(isPathInDefaultFolders('', ['日记'])).toBe(false);
    expect(isPathInDefaultFolders(null, ['日记'])).toBe(false);
  });

  it('反斜杠输入的文件夹也能匹配（Windows 用户习惯）', () => {
    expect(isPathInDefaultFolders('日记/2026/今天.md', ['日记\\2026'])).toBe(true);
  });
});

describe('默认文件夹配置的归一化', () => {
  it('按行拆分，去掉空行与首尾空白', () => {
    expect(normalizeDefaultFolders('日记\n\n  随笔  \n')).toEqual(['日记', '随笔']);
  });

  it('反斜杠统一成正斜杠，并去掉末尾斜杠', () => {
    expect(normalizeDefaultFolders('日记\\2026\\\n随笔/')).toEqual(['日记/2026', '随笔']);
  });

  it('去重且保持首次出现的顺序', () => {
    expect(normalizeDefaultFolders('随笔\n日记\n随笔')).toEqual(['随笔', '日记']);
  });

  it('数组输入同样接受（读取 data.json 时就是数组）', () => {
    expect(normalizeDefaultFolders(['日记', ' 随笔 '])).toEqual(['日记', '随笔']);
  });

  it('非法输入回落到空数组', () => {
    expect(normalizeDefaultFolders(null)).toEqual([]);
    expect(normalizeDefaultFolders(123)).toEqual([]);
    expect(normalizeDefaultFolders('   ')).toEqual([]);
  });
});

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
