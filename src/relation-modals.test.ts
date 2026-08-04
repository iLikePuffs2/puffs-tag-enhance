import { describe, expect, it, vi } from "vitest";
import { Notice, TFile } from "obsidian";
import {
  ManageParentTagModal,
  TagInheritanceModal,
  getDirectionalInputSide,
  getNoteBindingCandidates,
  getNoteRelationEnterAction,
  getNoteRelationSubmitError,
  getTagRelationCandidates,
  groupExcludedPathsBySource,
} from "./relation-modals";

describe('标签绑定笔记候选', () => {
  const files = [
    new (TFile as any)('目录/Alpha.md'),
    new (TFile as any)('目录/Beta.md'),
  ];
  const aliases: Record<string, string[]> = {
    '目录/Beta.md': ['共同别名', '第二别名'],
  };

  it('支持按文件名与 alias 匹配并返回展示路径', () => {
    expect(getNoteBindingCandidates(files, 'alpha', (file: any) => aliases[file.path] || []))
      .toEqual([{ file: files[0], displayName: 'Alpha', alias: '' }]);
    expect(getNoteBindingCandidates(files, '共同', (file: any) => aliases[file.path] || []))
      .toEqual([{ file: files[1], displayName: '共同别名', alias: '共同别名' }]);
  });

  it('空查询不展示候选，并忽略非 Markdown 文件', () => {
    const attachment = new (TFile as any)('附件.png');
    expect(getNoteBindingCandidates([...files, attachment], '', () => [])).toEqual([]);
    expect(getNoteBindingCandidates([attachment], '附件', () => [])).toEqual([]);
  });
});

describe('新增父子笔记弹窗输入框方向键导航', () => {
  const sides = ['parent', 'child'];

  it('向下从父笔记输入框切到子笔记输入框', () => {
    expect(getDirectionalInputSide('parent', 'ArrowDown', sides)).toBe('child');
  });

  it('向上从子笔记输入框切到父笔记输入框', () => {
    expect(getDirectionalInputSide('child', 'ArrowUp', sides)).toBe('parent');
  });

  it('到达上下边界时不循环', () => {
    expect(getDirectionalInputSide('parent', 'ArrowUp', sides)).toBeNull();
    expect(getDirectionalInputSide('child', 'ArrowDown', sides)).toBeNull();
  });

  it('只显示一个输入框时不接管原有候选导航', () => {
    expect(getDirectionalInputSide('parent', 'ArrowDown', ['parent'])).toBeNull();
    expect(getDirectionalInputSide('child', 'ArrowUp', ['child'])).toBeNull();
  });
});

describe('标签关系候选', () => {
  it('只返回现有扁平标签并按不含井号的中文显示名排序', () => {
    expect(getTagRelationCandidates(
      ['#子项', '#父项', '#父项/嵌套', '#另一个父项', '#父项'],
      '父项'
    )).toEqual(['#父项', '#另一个父项']);
  });

  it('支持省略井号搜索并按调用方规则排除不可用关系', () => {
    expect(getTagRelationCandidates(
      ['#甲', '#乙', '#丙'],
      '#',
      (tag: string) => tag !== '#乙'
    )).toEqual([]);
    expect(getTagRelationCandidates(
      ['#甲标签', '#乙标签', '#丙'],
      '#标签',
      (tag: string) => tag !== '#乙标签'
    )).toEqual(['#甲标签']);
  });

  it('空查询不展示候选', () => {
    expect(getTagRelationCandidates(['#甲'], '')).toEqual([]);
  });
});

describe('已排除继承笔记分组', () => {
  it('按来源顺序分组，并让多来源笔记在各组重复出现', () => {
    const sources = new Map([
      ['共享.md', ['#子二', '#子一']],
      ['子一.md', ['#子一']],
      ['未知.md', []],
    ]);
    expect(groupExcludedPathsBySource(
      ['共享.md', '子一.md', '未知.md'],
      sources,
      ['#子一', '#子二']
    )).toEqual([
      { source: '#子一', paths: ['共享.md', '子一.md'] },
      { source: '#子二', paths: ['共享.md'] },
      { source: null, paths: ['未知.md'] },
    ]);
  });

  it('去重路径并在已知顺序后追加新发现来源', () => {
    const sources = new Map([['笔记.md', ['#未排序来源']]]);
    expect(groupExcludedPathsBySource(['笔记.md', '笔记.md'], sources, ['#空来源']))
      .toEqual([{ source: '#未排序来源', paths: ['笔记.md'] }]);
  });
});

describe('管理子标签立即保存', () => {
  function createModal(children = ['#旧']) {
    const modal = Object.create(TagInheritanceModal.prototype) as any;
    modal.parentTag = '#父';
    modal.children = children;
    modal.isSubmitting = false;
    modal.inputEl = null;
    modal.childrenListEl = null;
    modal.renderChildren = vi.fn();
    modal.renderExclusionGroups = vi.fn();
    modal.picker = { render: vi.fn() };
    modal.plugin = {
      sortTagsByVisibleCount: (tags: string[]) => [...tags].sort(),
      setInheritanceChildren: vi.fn(async () => undefined),
    };
    return modal;
  }

  it('新增后立即持久化并更新列表，不关闭弹窗', async () => {
    const modal = createModal();
    modal.close = vi.fn();

    await modal.addChild('#新');
    expect(modal.plugin.setInheritanceChildren).toHaveBeenCalledWith('#父', ['#旧', '#新']);
    expect(modal.children).toEqual(['#旧', '#新']);
    expect(modal.renderChildren).toHaveBeenCalled();
    expect(modal.renderExclusionGroups).toHaveBeenCalledOnce();
    expect(modal.close).not.toHaveBeenCalled();
    expect(modal.isSubmitting).toBe(false);
  });

  it('删除后立即持久化并更新列表，不关闭弹窗', async () => {
    const modal = createModal(['#旧', '#新']);
    modal.close = vi.fn();

    await modal.removeChild('#旧');
    expect(modal.plugin.setInheritanceChildren).toHaveBeenCalledWith('#父', ['#新']);
    expect(modal.children).toEqual(['#新']);
    expect(modal.renderExclusionGroups).toHaveBeenCalledOnce();
    expect(modal.close).not.toHaveBeenCalled();
    expect(modal.isSubmitting).toBe(false);
  });

  it('连续增删时每次操作都持久化最新列表', async () => {
    const modal = createModal();

    await modal.addChild('#新');
    await modal.addChild('#另一个');
    await modal.removeChild('#旧');

    expect(modal.plugin.setInheritanceChildren.mock.calls).toEqual([
      ['#父', ['#旧', '#新']],
      ['#父', ['#旧', '#新', '#另一个']],
      ['#父', ['#新', '#另一个']],
    ]);
    expect(modal.children).toEqual(['#新', '#另一个']);
  });

  it('保存失败时保留原列表、恢复控件状态并提示错误', async () => {
    const modal = createModal();
    modal.plugin.setInheritanceChildren.mockRejectedValueOnce(new Error('保存失败'));
    (Notice as any).messages = [];

    await modal.addChild('#新');

    expect(modal.children).toEqual(['#旧']);
    expect(modal.renderChildren).not.toHaveBeenCalled();
    expect(modal.renderExclusionGroups).not.toHaveBeenCalled();
    expect(modal.isSubmitting).toBe(false);
    expect((Notice as any).messages).toEqual(['保存失败']);
  });
});

describe('管理父标签立即保存', () => {
  function createModal(parents = ['#旧父']) {
    const modal = Object.create(ManageParentTagModal.prototype) as any;
    modal.parentTag = '#子';
    modal.relationMode = 'parents';
    modal.children = parents;
    modal.isSubmitting = false;
    modal.inputEl = null;
    modal.childrenListEl = null;
    modal.renderChildren = vi.fn();
    modal.renderExclusionGroups = vi.fn();
    modal.picker = { render: vi.fn() };
    modal.plugin = {
      sortTagsByVisibleCount: (tags: string[]) => [...tags].sort(),
      setInheritanceParents: vi.fn(async () => undefined),
    };
    return modal;
  }

  it('新增和移除父标签时原子保存并保持弹窗开启', async () => {
    const modal = createModal();
    modal.close = vi.fn();

    await modal.addChild('#新父');
    await modal.removeChild('#旧父');

    expect(modal.plugin.setInheritanceParents.mock.calls).toEqual([
      ['#子', ['#新父', '#旧父']],
      ['#子', ['#新父']],
    ]);
    expect(modal.children).toEqual(['#新父']);
    expect(modal.close).not.toHaveBeenCalled();
  });

  it('保存失败时保留原父标签列表', async () => {
    const modal = createModal();
    modal.plugin.setInheritanceParents.mockRejectedValueOnce(new Error('保存失败'));
    (Notice as any).messages = [];

    await modal.addChild('#新父');

    expect(modal.children).toEqual(['#旧父']);
    expect((Notice as any).messages).toEqual(['保存失败']);
  });
});

describe('新增父子笔记弹窗 Enter 保存校验', () => {
  it('候选存在时优先选择候选，否则执行保存', () => {
    expect(getNoteRelationEnterAction({ key: 'Enter' }, false, true)).toBe('select-candidate');
    expect(getNoteRelationEnterAction({ key: 'Enter' }, false, false)).toBe('submit');
  });

  it('输入法组词、IME 处理事件和带修饰键的 Enter 均不响应', () => {
    expect(getNoteRelationEnterAction({ key: 'Enter' }, true)).toBeNull();
    expect(getNoteRelationEnterAction({ key: 'Enter', isComposing: true }, false)).toBeNull();
    expect(getNoteRelationEnterAction({ key: 'Enter', keyCode: 229 }, false)).toBeNull();
    expect(getNoteRelationEnterAction({ key: 'Enter', ctrlKey: true }, false)).toBeNull();
    expect(getNoteRelationEnterAction({ key: 'Escape' }, false)).toBeNull();
  });

  it('父级或子级未选择时返回明确提示', () => {
    expect(getNoteRelationSubmitError(0, 1)).toBe('请分别选择父笔记和子笔记');
    expect(getNoteRelationSubmitError(1, 0)).toBe('请分别选择父笔记和子笔记');
    expect(getNoteRelationSubmitError(0, 0)).toBe('请分别选择父笔记和子笔记');
  });

  it('拒绝多父对多子', () => {
    expect(getNoteRelationSubmitError(2, 2)).toBe('批量关系仅支持一父多子或多父一子');
  });

  it('允许单条、一父多子和多父一子', () => {
    expect(getNoteRelationSubmitError(1, 1)).toBe('');
    expect(getNoteRelationSubmitError(1, 3)).toBe('');
    expect(getNoteRelationSubmitError(3, 1)).toBe('');
  });
});
