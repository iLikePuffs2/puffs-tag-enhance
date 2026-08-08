// @vitest-environment happy-dom
//
// 批量操作标签弹窗的 DOM 渲染契约。
//
// modals.test.ts 跑在 node 环境、只做行为断言；这里覆盖真实 DOM：勾选区的行渲染、
// 摘要文案、模式切换时源标签输入框的显隐，以及增量重绘（改搜索词后未变化的行必须
// 复用同一个 DOM 节点，否则用户的滚动位置和正在进行的交互会被打断）。

import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile } from './test-obsidian-mock';
import { PuffsTagRenameModal } from './modals';

type AnyRecord = Record<string, unknown>;

const candidateOf = (path: string) => ({ path, file: new TFile(path) });

function makeRenderModal(overrides: AnyRecord = {}) {
  const modal = Object.create(PuffsTagRenameModal.prototype) as any;
  modal.tag = '#读书';
  modal.mode = 'rename';
  modal.isSubmitting = false;
  modal.selectedPaths = new Set<string>();
  modal.selectionQuery = '';
  modal.noteCandidates = [candidateOf('三体.md'), candidateOf('散记.md')];
  modal.plugin = { getNoteAliases: () => [] };

  const host = document.createElement('div');
  modal.selectionListEl = host.createDiv();
  modal.selectionSummaryEl = host.createDiv();
  modal.sourceFieldEl = host.createDiv();

  Object.assign(modal, overrides);
  return modal;
}

const rowPaths = (modal: any): string[] =>
  Array.from(modal.selectionListEl.querySelectorAll('.puffs-note-selection-row'))
    .map((row: any) => row.dataset.puffsPath);

describe('勾选区渲染', () => {
  it('批量操作按钮依次显示全选、反选、清空', () => {
    const modal = makeRenderModal();
    modal.contentEl = document.createElement('div');
    modal.buildNoteSelectionSection();

    const buttonTexts = Array.from(modal.contentEl.querySelectorAll('button'))
      .map((button: any) => button.textContent);
    expect(buttonTexts).toEqual(['全选', '反选', '清空']);
  });

  it('列出全部候选笔记，显示文件名并把完整路径放进 title', () => {
    const modal = makeRenderModal({ noteCandidates: [candidateOf('读书/三体.md')] });
    modal.renderNoteSelection();

    const nameEl = modal.selectionListEl.querySelector('.puffs-note-selection-name');
    expect(nameEl.textContent).toBe('三体');
    expect(nameEl.getAttribute('title')).toBe('读书/三体.md');
  });

  it('摘要显示已选数与候选总数', () => {
    const modal = makeRenderModal({ selectedPaths: new Set(['三体.md']) });
    modal.renderNoteSelection();
    expect(modal.selectionSummaryEl.textContent).toBe('已选 1 / 2');
  });

  it('勾选态反映 selectedPaths', () => {
    const modal = makeRenderModal({ selectedPaths: new Set(['三体.md']) });
    modal.renderNoteSelection();

    const checkboxes = Array.from(
      modal.selectionListEl.querySelectorAll('input[type="checkbox"]')
    ) as any[];
    expect(checkboxes.map((box) => box.checked)).toEqual([true, false]);
  });

  it('搜索词只保留命中的行', () => {
    const modal = makeRenderModal();
    modal.renderNoteSelection();
    expect(rowPaths(modal)).toEqual(['三体.md', '散记.md']);

    modal.selectionQuery = '三体';
    modal.renderNoteSelection();
    expect(rowPaths(modal)).toEqual(['三体.md']);
  });

  it('候选为空与筛选无结果给出不同的空态文案', () => {
    const empty = makeRenderModal({ noteCandidates: [] });
    empty.renderNoteSelection();
    expect(empty.selectionListEl.querySelector('.puffs-relation-empty').textContent)
      .toBe('该标签下暂无笔记');

    const filtered = makeRenderModal({ selectionQuery: '不存在' });
    filtered.renderNoteSelection();
    expect(filtered.selectionListEl.querySelector('.puffs-relation-empty').textContent)
      .toBe('没有匹配的笔记');
  });

  it('增量重绘：筛选后仍在列表里的行复用同一个 DOM 节点', () => {
    const modal = makeRenderModal();
    modal.renderNoteSelection();
    const firstRow = modal.selectionListEl.querySelector('[data-puffs-path="三体.md"]');

    modal.selectionQuery = '三体';
    modal.renderNoteSelection();

    expect(modal.selectionListEl.querySelector('[data-puffs-path="三体.md"]')).toBe(firstRow);
  });

  it('提交进行中禁用复选框，结束后恢复', () => {
    const modal = makeRenderModal({ isSubmitting: true });
    modal.renderNoteSelection();
    expect(modal.selectionListEl.querySelector('input[type="checkbox"]').disabled).toBe(true);

    modal.isSubmitting = false;
    modal.renderNoteSelection();
    expect(modal.selectionListEl.querySelector('input[type="checkbox"]').disabled).toBe(false);
  });

  it('点击复选框把路径写入 selectedPaths', () => {
    const modal = makeRenderModal();
    modal.renderNoteSelection();

    const checkbox = modal.selectionListEl.querySelector('input[type="checkbox"]') as any;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    expect(Array.from(modal.selectedPaths)).toEqual(['三体.md']);
  });
});

describe('提交热键与标签候选浮层的优先级', () => {
  // 源标签框预填了当前标签，createTagCandidatePicker 构造时会立刻渲染出一条同名候选。
  // 若不收起，用户开弹窗后按的第一个回车会被候选浮层吃掉，看起来像「回车没反应」。
  const openModals: any[] = [];

  const makeSubmitModal = (resultsHidden: boolean) => {
    const modal = makeRenderModal({ mode: 'rename' });
    modal.modalEl = document.createElement('div');
    // 必须挂进真实文档，document.activeElement 才会随 focus() 变化
    document.body.appendChild(modal.modalEl);
    modal.sourceFieldEl = modal.modalEl.createDiv({ cls: 'puffs-relation-tag-search' });
    modal.sourceInputEl = modal.sourceFieldEl.createEl('input', { type: 'text' });
    const resultsEl = modal.sourceFieldEl.createDiv({ cls: 'puffs-relation-tag-results' });
    resultsEl.classList.toggle('is-hidden', resultsHidden);
    modal.targetInputEl = modal.modalEl.createEl('input', { type: 'text' });
    modal.selectedPaths = new Set(['三体.md']);
    modal.submit = vi.fn(async () => undefined);
    modal.contentEl = document.createElement('div');
    modal.registerSubmitHotkey();
    openModals.push(modal);
    return modal;
  };

  // 监听挂在 document 上，不清理会串到下一个用例
  afterEach(() => {
    while (openModals.length) {
      const modal = openModals.pop();
      modal.onClose();
      modal.modalEl.remove();
    }
    document.body.innerHTML = '';
  });

  const pressEnter = (target: any) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

  it('候选浮层收起时，回车提交', () => {
    const modal = makeSubmitModal(true);
    modal.targetInputEl.focus();
    pressEnter(modal.targetInputEl);
    expect(modal.submit).toHaveBeenCalled();
  });

  it('焦点在源标签框且候选浮层展开时，回车让给候选选择，不提交', () => {
    const modal = makeSubmitModal(false);
    modal.sourceInputEl.focus();
    pressEnter(modal.sourceInputEl);
    expect(modal.submit).not.toHaveBeenCalled();
  });

  it('焦点在目标框时，即使源标签候选浮层还开着也照常提交', () => {
    // 在源标签框输入过字之后浮层会一直开着；若不看焦点，用户在目标框按回车会永远没反应
    const modal = makeSubmitModal(false);
    modal.targetInputEl.focus();
    pressEnter(modal.targetInputEl);
    expect(modal.submit).toHaveBeenCalled();
  });

  it('焦点落在弹窗内的非输入框元素上也能提交', () => {
    const modal = makeSubmitModal(false);
    const button = modal.modalEl.createEl('button');
    button.focus();
    pressEnter(button);
    expect(modal.submit).toHaveBeenCalled();
  });

  it('点击复选框等操作让焦点掉到 body 时，回车仍然提交', () => {
    // 这是「焦点必须在输入框内才能提交」的根因：焦点在 modalEl 之外时，
    // 挂在 modalEl 上的监听收不到 keydown
    const modal = makeSubmitModal(true);
    (document.activeElement as any)?.blur?.();
    pressEnter(document.body);
    expect(modal.submit).toHaveBeenCalled();
  });

  it('中文组词期间不提交', () => {
    const modal = makeSubmitModal(true);
    modal.isComposing = true;
    modal.targetInputEl.focus();
    pressEnter(modal.targetInputEl);
    expect(modal.submit).not.toHaveBeenCalled();

    // keyCode 229 是输入法未确认时浏览器给出的信号
    modal.isComposing = false;
    modal.targetInputEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true })
    );
    expect(modal.submit).not.toHaveBeenCalled();
  });

  it('弹窗关闭后不再响应回车', () => {
    const modal = makeSubmitModal(true);
    modal.onClose();
    modal.modalEl.remove();
    pressEnter(document.body);
    expect(modal.submit).not.toHaveBeenCalled();
  });
});

describe('源标签输入框的显隐', () => {
  it('改名模式显示，增删模式隐藏', () => {
    const modal = makeRenderModal({ mode: 'rename' });
    modal.syncSourceFieldVisibility();
    expect(modal.sourceFieldEl.classList.contains('is-hidden')).toBe(false);

    modal.mode = 'add';
    modal.syncSourceFieldVisibility();
    expect(modal.sourceFieldEl.classList.contains('is-hidden')).toBe(true);

    modal.mode = 'delete';
    modal.syncSourceFieldVisibility();
    expect(modal.sourceFieldEl.classList.contains('is-hidden')).toBe(true);
  });
});
