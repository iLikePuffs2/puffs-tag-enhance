import { describe, expect, it } from 'vitest';
import { parseCurrentNoteTagSearch, replaceFrontmatterTagValue } from './models';

describe('当前笔记标签定位语法', () => {
  it.each(['：：', '::', '  ：：  ', '  ::  '])('命中全角与半角写法：%s', (value) => {
    expect(parseCurrentNoteTagSearch(value).matched).toBe(true);
  });

  it.each([
    '：：读书',
    '::读书',
    '：:',
    ':：',
    '：',
    ':',
    '：：：',
    ':::',
    '',
    '读书',
  ])('不命中其他写法：%s', (value) => {
    expect(parseCurrentNoteTagSearch(value).matched).toBe(false);
  });

  it('容错空值输入', () => {
    expect(parseCurrentNoteTagSearch(null).matched).toBe(false);
    expect(parseCurrentNoteTagSearch(undefined).matched).toBe(false);
  });
});

describe('frontmatter 标签改名去重', () => {
  it.each([
    [['旧标签', '已有标签'], ['已有标签']],
    [['已有标签', '旧标签'], ['已有标签']],
    [['旧标签', '其他标签', '已有标签'], ['已有标签', '其他标签']],
  ])('改名到已有标签时按原顺序保留第一次出现项', (value, expected) => {
    expect(replaceFrontmatterTagValue(value, '#旧标签', '#已有标签')).toEqual(expected);
  });

  it('将带井号和不带井号的写法视为同一标签', () => {
    expect(replaceFrontmatterTagValue(['#已有标签', '旧标签'], '#旧标签', '#已有标签'))
      .toEqual(['#已有标签']);
  });

  it.each([
    ['旧标签, 已有标签', ['已有标签']],
    ['已有标签 旧标签', ['已有标签']],
  ])('去重字符串属性中的标签：%s', (value, expected) => {
    expect(replaceFrontmatterTagValue(value, '#旧标签', '#已有标签')).toEqual(expected);
  });

  it('改名到不存在的标签时保持原数据形态', () => {
    expect(replaceFrontmatterTagValue('旧标签, 其他标签', '#旧标签', '#新标签'))
      .toBe('新标签, 其他标签');
    expect(replaceFrontmatterTagValue(['旧标签', '其他标签'], '#旧标签', '#新标签'))
      .toEqual(['新标签', '其他标签']);
  });
});
