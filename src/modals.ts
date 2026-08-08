import { Modal, Notice, TFile, setIcon } from "obsidian";
import { getTagDisplayName, normalizeTag } from "./models";
import { createTagCandidatePicker, getTagRelationCandidates } from "./relation-modals";

/** 按 路径 ∪ 文件名 ∪ 别名 做小写子串匹配；空搜索词返回全部候选。 */
function filterNoteCandidates(candidates: any, query: any, getAliases: (file: TFile) => string[] = () => []) {
  const term = String(query || '').trim().toLowerCase();
  if (!term) return [...(candidates || [])];
  return (candidates || []).filter((candidate: any) => {
    const file = candidate.file;
    return String(candidate.path || '').toLowerCase().includes(term) ||
      String(file?.basename || '').toLowerCase().includes(term) ||
      (file instanceof TFile && (getAliases(file) || []).some((alias) => String(alias).toLowerCase().includes(term)));
  });
}

/**
 * 批量操作标签弹窗：在右键的标签下勾选笔记，对这批笔记增标签、删标签或改标签名。
 *
 * 三个作用域概念要分清：
 * - this.tag —— 右键打开弹窗的那个标签，决定**候选笔记池**（它的直属笔记），全程不变
 * - this.scopeTag —— 传给增删业务方法的作用域标签。实体标签下等于 this.tag；
 *   虚拟交集标签没有索引记录，改用它的某个成员标签，否则业务层按虚拟标签名查不到笔记
 * - sourceTagValue —— 仅改名模式使用，决定**改哪个标签名**，可以是任意已有标签
 * 三者刻意解耦：改了源标签不会让已勾选的笔记突然消失。
 *
 * options 用于 `&` 交集搜索出的虚拟标签卡片：它不在 tagFileIndex 里，
 * 候选池必须由调用方直接把交集结果传进来。
 */
class PuffsTagRenameModal extends Modal {
  isSubmitting: any;
  mode: any;
  plugin: any;
  tag: any;
  noteCandidates: any;
  selectedPaths: any;
  selectionQuery: any;
  sourceTagValue: any;
  targetTagValue: any;
  sourceFieldEl: any;
  sourceInputEl: any;
  targetInputEl: any;
  selectionInputEl: any;
  selectionListEl: any;
  selectionSummaryEl: any;
  titleEl: any;
  modeButtons: any;
  isComposing: any;
  submitHotkeyHandler: any;
  candidateFiles: any;
  scopeTag: any;

  constructor(app: any, plugin: any, tag: any, options: any = {}) {
    super(app);
    this.plugin = plugin;
    this.tag = normalizeTag(tag) || String(tag || '');
    this.mode = 'rename';
    this.isSubmitting = false;
    this.isComposing = false;
    // 勾选态只是这一次操作的作用域，不落盘；默认全不选，避免误改整个标签下的笔记
    this.selectedPaths = new Set();
    this.selectionQuery = '';
    // 虚拟标签场景由调用方给出候选池与作用域标签；实体标签走原有路径
    this.candidateFiles = options.candidateFiles || null;
    this.scopeTag = normalizeTag(options.sourceTag) || this.tag;
    this.sourceTagValue = this.scopeTag;
    this.targetTagValue = '';
    this.noteCandidates = [];
  }

  onOpen() {
    this.modalEl.classList.add('puffs-tag-rename-modal');
    this.contentEl.empty();
    this.noteCandidates = this.collectNoteCandidates();
    this.buildLayout();
    this.renderMode('rename');
    this.renderNoteSelection();
  }

  /**
   * 候选池固定为右键标签的直属笔记，顺序沿用侧边栏的笔记排序。
   *
   * 虚拟交集标签没有索引记录，候选池由调用方直接传入（顺序即交集卡片里的呈现顺序）。
   */
  collectNoteCandidates() {
    if (this.candidateFiles) {
      return Array.from(new Set(this.candidateFiles))
        .map((file: any) => ({ path: file.path, file }));
    }
    const files = Array.from(new Set(this.plugin.tagFileIndex?.get(this.tag) || []));
    return this.plugin.getOrderedFilesForTag(this.tag, files)
      .map((file: any) => ({ path: file.path, file }));
  }

  buildLayout() {
    const headingEl = this.contentEl.createDiv({ cls: 'puffs-tag-rename-heading' });
    this.titleEl = headingEl.createDiv({ cls: 'puffs-tag-rename-title' });
    const addButtonEl = headingEl.createEl('button', { cls: 'puffs-tag-rename-mode-button', attr: { type: 'button' } });
    const deleteButtonEl = headingEl.createEl('button', { cls: 'puffs-tag-rename-mode-button', attr: { type: 'button' } });
    addButtonEl.addEventListener('click', () => this.renderMode(this.mode === 'add' ? 'rename' : 'add'));
    deleteButtonEl.addEventListener('click', () => this.renderMode(this.mode === 'delete' ? 'rename' : 'delete'));
    this.modeButtons = { add: addButtonEl, delete: deleteButtonEl };

    const fieldsEl = this.contentEl.createDiv({ cls: 'puffs-tag-rename-fields' });

    // 源标签：必须是已有标签，因此走候选选择器；仅改名模式可见
    this.sourceFieldEl = fieldsEl.createDiv({ cls: 'puffs-relation-tag-search' });
    this.sourceInputEl = this.sourceFieldEl.createEl('input', { type: 'text', cls: 'puffs-tag-rename-input' });
    this.sourceInputEl.value = getTagDisplayName(this.scopeTag);
    let sourcePicker: any = null;
    sourcePicker = createTagCandidatePicker({
      hostEl: this.sourceFieldEl,
      inputEl: this.sourceInputEl,
      getCandidates: (query: any) => getTagRelationCandidates(this.plugin.getLogicalTagSet(), query),
      onInput: (value: any) => { this.sourceTagValue = value; },
      onSelect: (tag: any) => {
        this.sourceTagValue = tag;
        this.sourceInputEl.value = getTagDisplayName(tag);
        // 选完候选把焦点交给目标框，让用户可以直接输入新名字后回车。
        // picker 会在 onSelect 之后再 render() 一次（浮层又被打开），
        // 所以收起动作要排到那次 render 之后执行。
        this.targetInputEl?.focus();
        window.setTimeout(() => sourcePicker?.resultsEl.classList.add('is-hidden'), 0);
      },
      setComposing: (value: any) => { this.isComposing = value; },
    });
    // picker 构造时会立即渲染，而输入框预填了当前标签，于是浮层一开始就展开着，
    // 会吃掉用户按下的第一个回车。这里主动收起，等用户真正输入时再由 picker 自己展开。
    sourcePicker.resultsEl.classList.add('is-hidden');

    // 目标标签：允许输入当前不存在的标签
    this.targetInputEl = fieldsEl.createEl('input', { type: 'text', cls: 'puffs-tag-rename-input' });
    this.targetInputEl.addEventListener('input', () => { this.targetTagValue = this.targetInputEl.value; });
    this.targetInputEl.addEventListener('compositionstart', () => { this.isComposing = true; });
    this.targetInputEl.addEventListener('compositionend', () => {
      this.isComposing = false;
      this.targetTagValue = this.targetInputEl.value;
    });

    this.buildNoteSelectionSection();
    this.registerSubmitHotkey();
    this.registerSearchHotkey();
    window.setTimeout(() => this.targetInputEl?.focus(), 0);
  }

  buildNoteSelectionSection() {
    const sectionEl = this.contentEl.createDiv({ cls: 'puffs-note-selection' });
    const headingEl = sectionEl.createDiv({ cls: 'puffs-note-selection-heading' });
    headingEl.createEl('h4', { text: '选择笔记' });
    this.selectionSummaryEl = headingEl.createSpan({ cls: 'puffs-note-selection-summary' });

    const toolbarEl = sectionEl.createDiv({ cls: 'puffs-note-selection-toolbar' });
    this.selectionInputEl = toolbarEl.createEl('input', { type: 'search', cls: 'puffs-relation-input' });
    this.selectionInputEl.addEventListener('input', () => {
      this.selectionQuery = this.selectionInputEl.value;
      this.renderNoteSelection();
    });
    const selectAllButton = toolbarEl.createEl('button', { text: '全选结果', attr: { type: 'button' } });
    selectAllButton.dataset.puffsSelectionAction = 'select';
    selectAllButton.addEventListener('click', () => {
      this.applyNoteSelectionBatch(true);
      this.renderNoteSelection();
    });
    const clearButton = toolbarEl.createEl('button', { text: '清空结果', attr: { type: 'button' } });
    clearButton.dataset.puffsSelectionAction = 'clear';
    clearButton.addEventListener('click', () => {
      this.applyNoteSelectionBatch(false);
      this.renderNoteSelection();
    });

    this.selectionListEl = sectionEl.createDiv({ cls: 'puffs-note-selection-list' });
  }

  /**
   * 回车提交：焦点在弹窗内的任意位置都生效，中文组词期间不响应。
   *
   * 监听挂在 document 上而非 modalEl：点击复选框、按钮或弹窗空白处之后，
   * 焦点可能落到 document.body（在 modalEl 之外），此时 keydown 根本不会
   * 冒泡到 modalEl，回车就没反应。改为在 document 捕获、再判断事件是否
   * 发生在本弹窗范围内，才能覆盖「焦点在弹窗内任意位置」这个要求。
   */
  registerSubmitHotkey() {
    this.submitHotkeyHandler = (event: any) => {
      if (event.key !== 'Enter') return;
      if (this.isComposing || event.isComposing || event.keyCode === 229) return;
      // 弹窗已关闭或事件来自别的弹窗/界面时不接管
      if (!this.modalEl?.isConnected) return;
      const target = event.target;
      const insideModal = target instanceof Node && this.modalEl.contains(target);
      const focusOutside = !(document.activeElement instanceof Node)
        || !this.modalEl.contains(document.activeElement);
      if (!insideModal && !focusOutside) return;
      // 只有「焦点确实在源标签框」且候选浮层开着时，才把回车让给候选选择。
      // 不能只看浮层开没开：在源标签框输入过字之后浮层会一直开着，
      // 那样用户在目标框按回车会被永久吞掉，表现为「回车没反应」。
      if (
        document.activeElement === this.sourceInputEl &&
        !this.sourceFieldEl?.classList.contains('is-hidden')
      ) {
        const resultsEl = this.sourceFieldEl.querySelector('.puffs-relation-tag-results');
        if (resultsEl && !resultsEl.classList.contains('is-hidden')) return;
      }
      event.preventDefault();
      event.stopPropagation();
      void this.submit();
    };
    document.addEventListener('keydown', this.submitHotkeyHandler, true);
  }

  onClose() {
    if (this.submitHotkeyHandler) {
      document.removeEventListener('keydown', this.submitHotkeyHandler, true);
      this.submitHotkeyHandler = null;
    }
    this.contentEl?.empty();
  }

  registerSearchHotkey() {
    this.modalEl.addEventListener('keydown', (event: any) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') return;
      event.preventDefault();
      event.stopPropagation();
      if (document.activeElement === this.selectionInputEl && this.selectionInputEl.value) {
        this.selectionInputEl.value = '';
        this.selectionQuery = '';
        this.renderNoteSelection();
      }
      this.selectionInputEl?.focus();
    }, true);
  }

  renderMode(mode: any) {
    this.mode = mode;
    this.titleEl.textContent = mode === 'add'
      ? '批量新增标签'
      : mode === 'delete'
        ? '批量删除标签'
        : '批量修改标签名称';
    setIcon(this.modeButtons.add, mode === 'add' ? 'pencil' : 'plus');
    setIcon(this.modeButtons.delete, mode === 'delete' ? 'pencil' : 'minus');
    // 切换模式保留已勾选的笔记，只清空标签输入
    this.targetInputEl.value = '';
    this.targetTagValue = '';
    this.syncSourceFieldVisibility();
    window.setTimeout(() => this.targetInputEl?.focus(), 0);
  }

  syncSourceFieldVisibility() {
    this.sourceFieldEl?.classList.toggle('is-hidden', this.mode !== 'rename');
  }

  getFilteredNoteCandidates() {
    return filterNoteCandidates(
      this.noteCandidates,
      this.selectionQuery,
      (file) => this.plugin.getNoteAliases(file)
    );
  }

  toggleNoteCandidate(path: any, selected: any) {
    if (selected) this.selectedPaths.add(path);
    else this.selectedPaths.delete(path);
  }

  /** 全选/清空只作用于当前筛选结果，不影响筛选之外的已选笔记。 */
  applyNoteSelectionBatch(selected: any) {
    for (const candidate of this.getFilteredNoteCandidates()) {
      this.toggleNoteCandidate(candidate.path, selected);
    }
  }

  /** 增量对账：复用未变化的行，保留滚动位置，避免打断用户操作。 */
  renderNoteSelection() {
    if (!this.selectionListEl || !this.selectionSummaryEl) return;
    this.selectionSummaryEl.textContent = `已选 ${this.selectedPaths.size} / ${this.noteCandidates.length}`;

    const filtered = this.getFilteredNoteCandidates();
    const scrollTop = this.selectionListEl.scrollTop;
    const existingRows = new Map(
      Array.from<any>(this.selectionListEl.querySelectorAll('.puffs-note-selection-row'))
        .map((rowEl) => [rowEl.dataset.puffsPath || '', rowEl])
    );

    if (!filtered.length) {
      for (const rowEl of existingRows.values()) rowEl.remove();
      let emptyEl = this.selectionListEl.querySelector('.puffs-relation-empty');
      if (!emptyEl) emptyEl = this.selectionListEl.createDiv({ cls: 'puffs-relation-empty' });
      emptyEl.textContent = this.noteCandidates.length ? '没有匹配的笔记' : '该标签下暂无笔记';
      return;
    }
    this.selectionListEl.querySelector('.puffs-relation-empty')?.remove();

    for (const candidate of filtered) {
      let rowEl = existingRows.get(candidate.path);
      if (!rowEl) {
        rowEl = this.selectionListEl.createEl('label', { cls: 'puffs-note-selection-row' });
        const checkbox = rowEl.createEl('input', { type: 'checkbox' });
        // 事件处理器读 dataset 而非闭包变量，复用节点时才不会引用到旧数据
        checkbox.addEventListener('change', () => {
          this.toggleNoteCandidate(rowEl.dataset.puffsPath, checkbox.checked);
          this.selectionSummaryEl.textContent = `已选 ${this.selectedPaths.size} / ${this.noteCandidates.length}`;
        });
        rowEl.createSpan({ cls: 'puffs-note-selection-name' });
      }
      rowEl.dataset.puffsPath = candidate.path;
      const checkbox = rowEl.querySelector('input[type="checkbox"]');
      checkbox.checked = this.selectedPaths.has(candidate.path);
      checkbox.disabled = !!this.isSubmitting;
      const nameEl = rowEl.querySelector('.puffs-note-selection-name');
      nameEl.textContent = candidate.file?.basename || candidate.path;
      nameEl.setAttribute('title', candidate.path);
      this.selectionListEl.appendChild(rowEl);
      existingRows.delete(candidate.path);
    }
    for (const rowEl of existingRows.values()) rowEl.remove();
    this.selectionListEl.scrollTop = scrollTop;
  }

  async submit() {
    if (this.isSubmitting) return;
    if (this.selectedPaths.size === 0) {
      new Notice('请先选择笔记');
      return;
    }

    this.isSubmitting = true;
    this.renderNoteSelection();
    try {
      // 增删传 scopeTag 而非 this.tag：虚拟交集标签名在 tagFileIndex 里查不到笔记。
      // 业务层只把它当候选池起点，实际作用范围已由 selectedPaths 白名单收窄，语义不变。
      if (this.mode === 'add') {
        await this.plugin.addTagToTaggedNotes(this.scopeTag, this.targetTagValue, this.selectedPaths);
      } else if (this.mode === 'delete') {
        await this.plugin.deleteTagFromTaggedNotes(this.scopeTag, this.targetTagValue, this.selectedPaths);
      } else {
        await this.plugin.renameTagInSelectedNotes(this.sourceTagValue, this.targetTagValue, this.selectedPaths);
      }
      this.close();
    } catch (error) {
      const fallbackMessage = this.mode === 'add'
        ? '批量新增标签失败'
        : this.mode === 'delete'
          ? '批量删除标签失败'
          : '批量修改标签名称失败';
      new Notice(error && error.message ? error.message : fallbackMessage);
      this.targetInputEl?.focus();
      this.targetInputEl?.select();
    } finally {
      this.isSubmitting = false;
      this.renderNoteSelection();
    }
  }
}

export { PuffsTagRenameModal, filterNoteCandidates };
