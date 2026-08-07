// 批量操作标签弹窗的行为契约。
//
// 这个弹窗过去是「隐式全选」：右键某标签打开后，增/删/改名一律作用于该标签下的
// 全部笔记。现在加入了笔记勾选区，作用域由用户勾选决定，因此下面的用例重点锁两件事：
// 勾选集合的增减是否只作用于当前筛选结果，以及提交时是否把正确的标签与路径集合
// 传给业务层（尤其是改名——源标签取自输入框，而不再是右键的那个标签）。
//
// 涉及真实 DOM 结构的断言放在 modals-render.test.ts。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice, TFile } from './test-obsidian-mock';
import { PuffsTagRenameModal, filterNoteCandidates } from './modals';

type AnyRecord = Record<string, unknown>;

function makeModal(overrides: AnyRecord = {}) {
  const modal = Object.create(PuffsTagRenameModal.prototype) as any;
  modal.tag = '#读书';
  modal.mode = 'rename';
  modal.isSubmitting = false;
  modal.selectedPaths = new Set<string>();
  modal.selectionQuery = '';
  modal.noteCandidates = [];
  modal.sourceTagValue = '#读书';
  modal.targetTagValue = '';
  modal.close = vi.fn();
  modal.renderNoteSelection = vi.fn();
  modal.plugin = {
    addTagToTaggedNotes: vi.fn(async () => undefined),
    deleteTagFromTaggedNotes: vi.fn(async () => undefined),
    renameTagInSelectedNotes: vi.fn(async () => undefined),
    getNoteAliases: () => [],
  };
  Object.assign(modal, overrides);
  return modal;
}

const candidateOf = (path: string) => ({ path, file: new TFile(path) });

beforeEach(() => {
  Notice.messages.length = 0;
});

describe('笔记候选筛选', () => {
  const candidates = [
    candidateOf('读书/三体.md'),
    candidateOf('随笔/散记.md'),
  ];

  it('空搜索词返回全部候选', () => {
    expect(filterNoteCandidates(candidates, '')).toHaveLength(2);
    expect(filterNoteCandidates(candidates, '   ')).toHaveLength(2);
  });

  it('按文件名匹配', () => {
    expect(filterNoteCandidates(candidates, '三体').map((c: any) => c.path)).toEqual(['读书/三体.md']);
  });

  it('按路径匹配', () => {
    expect(filterNoteCandidates(candidates, '随笔').map((c: any) => c.path)).toEqual(['随笔/散记.md']);
  });

  it('按别名匹配，且大小写不敏感', () => {
    const getAliases = (file: TFile) => (file.path === '随笔/散记.md' ? ['Essay'] : []);
    expect(filterNoteCandidates(candidates, 'essay', getAliases).map((c: any) => c.path))
      .toEqual(['随笔/散记.md']);
  });

  it('没有匹配时返回空数组', () => {
    expect(filterNoteCandidates(candidates, '不存在的名字')).toEqual([]);
  });
});

describe('批量勾选只作用于当前筛选结果', () => {
  const candidates = [candidateOf('a.md'), candidateOf('b.md'), candidateOf('c.md')];

  it('全选结果只加入筛选命中的笔记', () => {
    const modal = makeModal({ noteCandidates: candidates, selectionQuery: 'a' });
    modal.applyNoteSelectionBatch(true);
    expect(Array.from(modal.selectedPaths)).toEqual(['a.md']);
  });

  it('清空结果只移除筛选命中的笔记，其余已选保持不变', () => {
    const modal = makeModal({
      noteCandidates: candidates,
      selectionQuery: 'a',
      selectedPaths: new Set(['a.md', 'b.md']),
    });
    modal.applyNoteSelectionBatch(false);
    expect(Array.from(modal.selectedPaths)).toEqual(['b.md']);
  });

  it('无搜索词时全选覆盖所有候选', () => {
    const modal = makeModal({ noteCandidates: candidates });
    modal.applyNoteSelectionBatch(true);
    expect(Array.from(modal.selectedPaths).sort()).toEqual(['a.md', 'b.md', 'c.md']);
  });
});

describe('单篇勾选', () => {
  it('勾选加入、取消勾选移除', () => {
    const modal = makeModal();
    modal.toggleNoteCandidate('a.md', true);
    expect(Array.from(modal.selectedPaths)).toEqual(['a.md']);
    modal.toggleNoteCandidate('a.md', false);
    expect(Array.from(modal.selectedPaths)).toEqual([]);
  });
});

describe('提交时的作用域与标签分发', () => {
  it('改名用输入框里的源标签，而不是右键打开时的标签', async () => {
    const modal = makeModal({
      mode: 'rename',
      tag: '#读书',
      sourceTagValue: '#科幻',
      targetTagValue: '#新科幻',
      selectedPaths: new Set(['a.md']),
    });

    await modal.submit();

    expect(modal.plugin.renameTagInSelectedNotes).toHaveBeenCalledWith(
      '#科幻', '#新科幻', modal.selectedPaths,
    );
    expect(modal.close).toHaveBeenCalled();
  });

  it('新增把右键的标签作为来源，并带上勾选路径', async () => {
    const modal = makeModal({
      mode: 'add',
      targetTagValue: '#科幻',
      selectedPaths: new Set(['a.md', 'b.md']),
    });

    await modal.submit();

    expect(modal.plugin.addTagToTaggedNotes).toHaveBeenCalledWith(
      '#读书', '#科幻', modal.selectedPaths,
    );
  });

  it('删除同样带上勾选路径', async () => {
    const modal = makeModal({
      mode: 'delete',
      targetTagValue: '#科幻',
      selectedPaths: new Set(['b.md']),
    });

    await modal.submit();

    expect(modal.plugin.deleteTagFromTaggedNotes).toHaveBeenCalledWith(
      '#读书', '#科幻', modal.selectedPaths,
    );
  });

  it('一篇都没勾选时提示并保持弹窗，不调用任何业务方法', async () => {
    const modal = makeModal({ mode: 'add', targetTagValue: '#科幻' });

    await modal.submit();

    expect(Notice.messages).toContain('请先选择笔记');
    expect(modal.plugin.addTagToTaggedNotes).not.toHaveBeenCalled();
    expect(modal.close).not.toHaveBeenCalled();
  });

  it('业务层抛错时保持弹窗并提示错误信息', async () => {
    const modal = makeModal({
      mode: 'add',
      targetTagValue: '#科幻',
      selectedPaths: new Set(['a.md']),
    });
    modal.plugin.addTagToTaggedNotes = vi.fn(async () => {
      throw new Error('标签名称不能包含空格');
    });

    await modal.submit();

    expect(Notice.messages).toContain('标签名称不能包含空格');
    expect(modal.close).not.toHaveBeenCalled();
    // 失败后必须解锁，否则用户改完输入再回车会被忽略
    expect(modal.isSubmitting).toBe(false);
  });

  it('提交进行中重复触发不会重复写盘', async () => {
    const modal = makeModal({
      mode: 'add',
      targetTagValue: '#科幻',
      selectedPaths: new Set(['a.md']),
      isSubmitting: true,
    });

    await modal.submit();

    expect(modal.plugin.addTagToTaggedNotes).not.toHaveBeenCalled();
  });
});
