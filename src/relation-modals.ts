// @ts-nocheck
import { Modal, Notice, TFile, setIcon } from "obsidian";
import { getTagDisplayName, isNestedTag, normalizeTag } from "./models";

function getDirectionalInputSide(activeSide, key, visibleSides) {
  if (!Array.isArray(visibleSides) || visibleSides.length < 2) return null;
  if (key === 'ArrowDown' && activeSide === 'parent' && visibleSides.includes('child')) return 'child';
  if (key === 'ArrowUp' && activeSide === 'child' && visibleSides.includes('parent')) return 'parent';
  return null;
}

function getNoteRelationSubmitError(parentCount, childCount) {
  if (!parentCount || !childCount) return '请分别选择父笔记和子笔记';
  if (parentCount > 1 && childCount > 1) return '批量关系仅支持一父多子或多父一子';
  return '';
}

function getNoteRelationEnterAction(event, isComposing, hasCandidate = false) {
  if (
    event.key !== 'Enter' ||
    event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
    isComposing || event.isComposing || event.keyCode === 229
  ) return null;
  return hasCandidate ? 'select-candidate' : 'submit';
}

function getTagRelationCandidates(tagValues, query, canUse: (tag: string) => boolean = () => true) {
  const term = String(query || '').trim().replace(/^#/, '').toLowerCase();
  if (!term) return [];
  return Array.from(new Set(Array.from(tagValues || []).map(normalizeTag).filter(Boolean)))
    .filter((tag) => !isNestedTag(tag) && canUse(tag))
    .filter((tag) => getTagDisplayName(tag).toLowerCase().includes(term))
    .sort((a, b) => getTagDisplayName(a).localeCompare(getTagDisplayName(b), 'zh-Hans-CN'));
}

function groupExcludedPathsBySource(
  paths: string[],
  sourcesByPath: Map<string, string[]>,
  orderedSources: string[] = []
) {
  const normalizedPaths = Array.from(new Set((paths || []).filter(Boolean)));
  const discoveredSources = [];
  const seenSources = new Set();
  for (const source of orderedSources || []) {
    const tag = normalizeTag(source);
    if (!tag || seenSources.has(tag)) continue;
    seenSources.add(tag);
    discoveredSources.push(tag);
  }
  for (const path of normalizedPaths) {
    for (const source of sourcesByPath.get(path) || []) {
      const tag = normalizeTag(source);
      if (!tag || seenSources.has(tag)) continue;
      seenSources.add(tag);
      discoveredSources.push(tag);
    }
  }
  const groups = discoveredSources
    .map((source) => ({
      source,
      paths: normalizedPaths.filter((path) => (sourcesByPath.get(path) || []).includes(source)),
    }))
    .filter((group) => group.paths.length > 0);
  const unknownPaths = normalizedPaths.filter((path) => !(sourcesByPath.get(path) || []).length);
  if (unknownPaths.length) groups.push({ source: null, paths: unknownPaths });
  return groups;
}

function createTagCandidatePicker(options) {
  const { hostEl, inputEl, getCandidates, onInput, onSelect, setComposing } = options;
  const resultsEl = hostEl.createDiv({ cls: 'puffs-relation-tag-results' });
  let activeIndex = 0;
  let candidates = [];
  let isComposing = false;
  const render = () => {
    resultsEl.empty();
    candidates = getCandidates(inputEl.value);
    resultsEl.classList.toggle('is-hidden', candidates.length === 0);
    if (!candidates.length) {
      activeIndex = 0;
      return;
    }
    activeIndex = Math.max(0, Math.min(candidates.length - 1, activeIndex));
    candidates.forEach((tag, index) => {
      const rowEl = resultsEl.createDiv({ cls: 'puffs-relation-tag-result is-clickable' });
      rowEl.classList.toggle('is-active', index === activeIndex);
      rowEl.createDiv({ text: getTagDisplayName(tag), cls: 'puffs-relation-tag-result-name' });
      rowEl.addEventListener('mouseenter', () => {
        activeIndex = index;
        resultsEl.querySelectorAll('.puffs-relation-tag-result').forEach((el, rowIndex) => {
          el.classList.toggle('is-active', rowIndex === index);
        });
      });
      rowEl.addEventListener('click', () => {
        onSelect(tag);
        activeIndex = 0;
        render();
      });
    });
    resultsEl.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  };
  inputEl.addEventListener('compositionstart', () => {
    isComposing = true;
    setComposing(true);
  });
  inputEl.addEventListener('compositionend', () => {
    isComposing = false;
    setComposing(false);
    onInput(inputEl.value);
    activeIndex = 0;
    render();
  });
  inputEl.addEventListener('input', () => {
    if (isComposing) return;
    onInput(inputEl.value);
    activeIndex = 0;
    render();
  });
  inputEl.addEventListener('keydown', (event) => {
    if (isComposing || event.isComposing) return;
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && candidates.length) {
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      activeIndex = Math.max(0, Math.min(candidates.length - 1, activeIndex + delta));
      event.preventDefault();
      event.stopPropagation();
      render();
      return;
    }
    if (getNoteRelationEnterAction(event, isComposing, candidates.length > 0) !== 'select-candidate') return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(candidates[activeIndex]);
    activeIndex = 0;
    render();
  });
  render();
  return { render, resultsEl };
}

class AddParentTagModal extends Modal {
  constructor(app, plugin, childTag) {
    super(app);
    this.plugin = plugin;
    this.childTag = normalizeTag(childTag);
    this.selectedParent = null;
    this.isComposing = false;
    this.isSubmitting = false;
  }

  onOpen() {
    this.modalEl.classList.add('puffs-relation-modal', 'puffs-tag-relation-modal');
    this.contentEl.empty();
    this.contentEl.createDiv({
      text: `为 ${getTagDisplayName(this.childTag)} 添加父标签`,
      cls: 'puffs-relation-modal-title puffs-tag-rename-title',
    });
    const inputEl = this.contentEl.createEl('input', { type: 'search' });
    inputEl.className = 'puffs-relation-input';
    const submit = async () => {
      if (!this.selectedParent || this.isSubmitting) return;
      this.isSubmitting = true;
      try {
        await this.plugin.addInheritanceParent(this.childTag, this.selectedParent);
        this.close();
      } catch (error) {
        new Notice(error && error.message ? error.message : '添加父标签失败');
      } finally {
        this.isSubmitting = false;
      }
    };
    const existingParents = new Set(this.plugin.getInheritanceParents(this.childTag));
    createTagCandidatePicker({
      hostEl: this.contentEl,
      inputEl,
      getCandidates: (query) => getTagRelationCandidates(this.plugin.getLogicalTagSet(), query, (tag) => (
        tag !== this.childTag &&
        !existingParents.has(tag) &&
        !this.plugin.wouldCreateTagInheritanceCycle(tag, this.childTag) &&
        tag !== this.selectedParent
      )),
      onInput: () => { this.selectedParent = null; },
      onSelect: (tag) => {
        this.selectedParent = tag;
        inputEl.value = getTagDisplayName(tag);
      },
      setComposing: (value) => { this.isComposing = value; },
    });
    this.modalEl.addEventListener('keydown', (event) => {
      if (getNoteRelationEnterAction(event, this.isComposing) !== 'submit') return;
      event.preventDefault();
      event.stopPropagation();
      void submit();
    });
    window.setTimeout(() => inputEl.focus(), 0);
  }
}

class RemoveChildTagConfirmModal extends Modal {
  constructor(app, parentTag, childTag, onConfirm) {
    super(app);
    this.parentTag = parentTag;
    this.childTag = childTag;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    this.modalEl.classList.add('puffs-relation-confirm-modal');
    this.contentEl.empty();
    this.contentEl.createDiv({ text: '移除子标签', cls: 'puffs-relation-modal-title' });
    this.contentEl.createDiv({
      text: `确定要从「${getTagDisplayName(this.parentTag)}」的子标签中移除「${getTagDisplayName(this.childTag)}」吗？此操作只解除继承关系，不会删除标签或笔记。`,
      cls: 'puffs-relation-confirm-message',
    });
    const footerEl = this.contentEl.createDiv({ cls: 'puffs-relation-modal-footer' });
    const removeButton = footerEl.createEl('button', { text: '移除', cls: 'mod-warning' });
    removeButton.addEventListener('click', () => {
      this.close();
      this.onConfirm();
    });
    this.modalEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }
}

class TagInheritanceModal extends Modal {
  constructor(app, plugin, parentTag) {
    super(app);
    this.plugin = plugin;
    this.parentTag = normalizeTag(parentTag);
    this.children = plugin.sortTagsByVisibleCount(plugin.getInheritanceChildren(parentTag));
    this.query = '';
    this.isComposing = false;
    this.isSubmitting = false;
    this.searchHostEl = null;
    this.inputEl = null;
    this.picker = null;
    this.childrenListEl = null;
    this.exclusionsSectionEl = null;
    this.exclusionGroupsEl = null;
  }

  onOpen() {
    this.modalEl.classList.add('puffs-relation-modal', 'puffs-tag-relation-modal');
    this.modalEl.addEventListener('keydown', (event) => {
      if (getNoteRelationEnterAction(event, this.isComposing) !== 'submit' || this.query.trim()) return;
      event.preventDefault();
      event.stopPropagation();
      void this.submit();
    });
    this.buildLayout();
  }

  buildLayout() {
    this.contentEl.empty();
    this.contentEl.createDiv({
      text: `管理 ${getTagDisplayName(this.parentTag)} 的子标签`,
      cls: 'puffs-relation-modal-title puffs-tag-rename-title',
    });
    this.searchHostEl = this.contentEl.createDiv({ cls: 'puffs-relation-tag-search' });
    this.inputEl = this.searchHostEl.createEl('input', { type: 'search', cls: 'puffs-relation-input' });
    this.inputEl.value = this.query;
    this.picker = createTagCandidatePicker({
      hostEl: this.searchHostEl,
      inputEl: this.inputEl,
      getCandidates: (query) => getTagRelationCandidates(this.plugin.getLogicalTagSet(), query, (tag) => (
        tag !== this.parentTag &&
        !this.children.includes(tag) &&
        !this.plugin.wouldCreateTagInheritanceCycle(this.parentTag, tag)
      )),
      onInput: (value) => { this.query = value; },
      onSelect: (tag) => {
        void this.addChild(tag);
      },
      setComposing: (value) => { this.isComposing = value; },
    });

    this.childrenListEl = this.contentEl.createDiv({ cls: 'puffs-relation-child-list' });
    this.exclusionsSectionEl = this.contentEl.createDiv({ cls: 'puffs-relation-exclusions' });
    this.exclusionsSectionEl.createEl('h4', { text: '已排除笔记' });
    this.exclusionGroupsEl = this.exclusionsSectionEl.createDiv({ cls: 'puffs-relation-exclusion-groups' });
    this.renderChildren();
    this.renderExclusionGroups();

    window.setTimeout(() => {
      if (this.inputEl) {
        this.inputEl.focus();
        return;
      }
      this.modalEl.tabIndex = -1;
      this.modalEl.focus();
    }, 0);
  }

  renderChildren() {
    if (!this.childrenListEl) return;
    this.children = this.plugin.sortTagsByVisibleCount(this.children);
    const existingRows = new Map(
      Array.from(this.childrenListEl.querySelectorAll('.puffs-relation-child-row'))
        .map((row) => [row.dataset.puffsTag, row])
    );
    this.childrenListEl.querySelector('.puffs-relation-empty')?.remove();
    for (const child of this.children) {
      let rowEl = existingRows.get(child);
      if (!rowEl) {
        rowEl = this.childrenListEl.createDiv({ cls: 'puffs-relation-child-row' });
        rowEl.dataset.puffsTag = child;
        const iconEl = rowEl.createSpan({ cls: 'puffs-relation-child-icon' });
        setIcon(iconEl, 'tag');
        rowEl.createSpan({ cls: 'puffs-relation-manage-name' });
        rowEl.createSpan({ cls: 'puffs-relation-child-count' });
        const removeButton = rowEl.createEl('button', {
          cls: 'clickable-icon puffs-relation-child-remove',
          attr: { 'aria-label': `移除 ${getTagDisplayName(child)}` },
        });
        setIcon(removeButton, 'x');
        removeButton.addEventListener('click', () => {
          new RemoveChildTagConfirmModal(this.app, this.parentTag, child, () => {
            void this.removeChild(child);
          }).open();
        });
      }
      rowEl.querySelector('.puffs-relation-manage-name').textContent = getTagDisplayName(child);
      rowEl.querySelector('.puffs-relation-child-count').textContent = String(this.plugin.getTagVisibleNoteCount(child));
      this.childrenListEl.appendChild(rowEl);
      existingRows.delete(child);
    }
    for (const rowEl of existingRows.values()) rowEl.remove();
    if (!this.children.length) {
      this.childrenListEl.createDiv({ text: '暂无子标签', cls: 'puffs-relation-empty' });
    }
    this.syncMutationState();
  }

  syncMutationState() {
    if (this.inputEl) this.inputEl.disabled = this.isSubmitting;
    for (const button of this.childrenListEl?.querySelectorAll('.puffs-relation-child-remove') || []) {
      button.disabled = this.isSubmitting;
    }
  }

  updateChildren(nextChildren) {
    this.children = this.plugin.sortTagsByVisibleCount(nextChildren);
    this.renderChildren();
    this.picker?.render();
  }

  async submit() {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.syncMutationState();
    try {
      await this.plugin.setInheritanceChildren(this.parentTag, this.children);
      this.close();
    } catch (error) {
      new Notice(error && error.message ? error.message : '保存继承关系失败');
    } finally {
      this.isSubmitting = false;
      this.syncMutationState();
    }
  }

  addChild(tag) {
    if (!tag || this.children.includes(tag)) return;
    this.updateChildren([...this.children, tag]);
    this.query = '';
    if (this.inputEl) this.inputEl.value = '';
    this.picker?.render();
    globalThis.setTimeout(() => this.inputEl?.focus(), 0);
  }

  removeChild(child) {
    if (!child || !this.children.includes(child)) return;
    this.updateChildren(this.children.filter((tag) => tag !== child));
    globalThis.setTimeout(() => this.inputEl?.focus(), 0);
  }

  renderExclusionGroups() {
    if (!this.exclusionsSectionEl || !this.exclusionGroupsEl) return;
    const exclusions = this.plugin.getTagInheritanceSettings().excludedPathsByParent[this.parentTag] || [];
    this.exclusionsSectionEl.classList.toggle('is-hidden', exclusions.length === 0);
    this.exclusionGroupsEl.empty();
    if (!exclusions.length) return;
    const sourcesByPath = new Map(exclusions.map((path) => [
      path,
      this.plugin.getInheritedFileSources(this.parentTag, path),
    ]));
    const groups = groupExcludedPathsBySource(
      exclusions,
      sourcesByPath,
      this.plugin.getTagDescendants(this.parentTag)
    );
    for (const group of groups) {
      const groupEl = this.exclusionGroupsEl.createDiv({ cls: 'puffs-relation-exclusion-group' });
      groupEl.dataset.puffsSource = group.source || '';
      const headingEl = groupEl.createDiv({ cls: 'puffs-relation-exclusion-heading' });
      if (group.source) {
        const iconEl = headingEl.createSpan({ cls: 'puffs-relation-exclusion-icon' });
        setIcon(iconEl, 'tag');
      }
      headingEl.createSpan({ text: group.source ? getTagDisplayName(group.source) : '来源未知' });
      const listEl = groupEl.createDiv({ cls: 'puffs-relation-exclusion-list' });
      for (const path of group.paths) {
        const rowEl = listEl.createDiv({ cls: 'puffs-relation-manage-row' });
        rowEl.dataset.puffsPath = path;
        const file = this.app.vault.getAbstractFileByPath(path);
        rowEl.createSpan({ text: file && file.basename ? file.basename : path, cls: 'puffs-relation-manage-name' });
        const restoreButton = rowEl.createEl('button', { text: '恢复' });
        restoreButton.addEventListener('click', async () => {
          if (restoreButton.disabled) return;
          restoreButton.disabled = true;
          try {
            await this.plugin.restoreInheritedFile(this.parentTag, path);
            this.removeExcludedPath(path);
          } catch (error) {
            console.error('[Puffs Tag Enhance] Failed to restore inherited note:', error);
            new Notice('恢复继承笔记失败');
            restoreButton.disabled = false;
          }
        });
      }
    }
  }

  removeExcludedPath(path) {
    if (!this.exclusionGroupsEl || !this.exclusionsSectionEl) return;
    for (const rowEl of Array.from(this.exclusionGroupsEl.querySelectorAll('.puffs-relation-manage-row'))) {
      if (rowEl.dataset.puffsPath === path) rowEl.remove();
    }
    for (const groupEl of Array.from(this.exclusionGroupsEl.querySelectorAll('.puffs-relation-exclusion-group'))) {
      if (!groupEl.querySelector('.puffs-relation-manage-row')) groupEl.remove();
    }
    this.exclusionsSectionEl.classList.toggle(
      'is-hidden',
      !this.exclusionGroupsEl.querySelector('.puffs-relation-manage-row')
    );
  }
}

class NoteRelationModal extends Modal {
  constructor(app, plugin, sourcePath = null, mode = null) {
    super(app);
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.mode = mode;
    this.selectedParents = new Map();
    this.selectedChildren = new Map();
    this.lockedParents = new Set();
    this.lockedChildren = new Set();
    this.queries = { parent: '', child: '' };
    this.activeSide = 'parent';
    this.activeIndex = 0;
    this.isComposing = false;
    this.isSubmitting = false;
    if (sourcePath) {
      const selection = { path: sourcePath, displayName: '' };
      if (mode === 'parent') {
        this.selectedChildren.set(sourcePath, selection);
        this.lockedChildren.add(sourcePath);
        this.activeSide = 'parent';
      } else {
        this.selectedParents.set(sourcePath, selection);
        this.lockedParents.add(sourcePath);
        this.activeSide = 'child';
      }
    }
  }

  onOpen() {
    this.modalEl.classList.add('puffs-relation-modal', 'puffs-note-relation-modal');
    this.render();
  }

  render() {
    this.contentEl.empty();
    const sourceFile = this.sourcePath && this.app.vault.getAbstractFileByPath(this.sourcePath);
    const sourceName = sourceFile instanceof TFile ? sourceFile.basename : this.sourcePath;
    const title = this.sourcePath
      ? `为 ${sourceName} 添加${this.mode === 'parent' ? '父笔记' : '子笔记'}`
      : '新增父子笔记';
    this.contentEl.createDiv({ text: title, cls: 'puffs-relation-modal-title puffs-tag-rename-title' });
    const inputBySide = {};
    const selectedBySide = {};
    const visibleSides = this.sourcePath
      ? [this.mode === 'parent' ? 'parent' : 'child']
      : ['parent', 'child'];
    const createSelector = (side, label) => {
      const sectionEl = this.contentEl.createDiv({ cls: 'puffs-relation-selector' });
      const locked = side === 'parent' ? this.lockedParents : this.lockedChildren;
      sectionEl.createDiv({ text: label, cls: 'puffs-relation-selector-label' });
      selectedBySide[side] = sectionEl.createDiv({ cls: 'puffs-relation-selected-list' });
      const inputEl = sectionEl.createEl('input', {
        type: 'search',
        cls: 'puffs-relation-input',
      });
      if (locked.size) {
        sectionEl.classList.add('is-locked');
        inputEl.disabled = true;
      }
      inputEl.value = this.queries[side];
      inputBySide[side] = inputEl;
      inputEl.addEventListener('focus', () => {
        this.activeSide = side;
        this.activeIndex = 0;
        renderResults();
      });
      inputEl.addEventListener('compositionstart', () => { this.isComposing = true; });
      inputEl.addEventListener('compositionend', () => {
        this.isComposing = false;
        this.queries[side] = inputEl.value;
        this.activeIndex = 0;
        renderResults();
      });
      inputEl.addEventListener('input', () => {
        if (this.isComposing) return;
        this.queries[side] = inputEl.value;
        this.activeIndex = 0;
        renderResults();
      });
      return inputEl;
    };
    if (visibleSides.includes('parent')) createSelector('parent', '父笔记');
    if (visibleSides.includes('child')) createSelector('child', '子笔记');
    const resultsEl = this.contentEl.createDiv({ cls: 'puffs-relation-note-results' });

    const renderSelections = () => {
      for (const side of ['parent', 'child']) {
        const map = side === 'parent' ? this.selectedParents : this.selectedChildren;
        const locked = side === 'parent' ? this.lockedParents : this.lockedChildren;
        const hostEl = selectedBySide[side];
        if (!hostEl) continue;
        hostEl.empty();
        for (const selection of map.values()) {
          const file = this.app.vault.getAbstractFileByPath(selection.path);
          const chipEl = hostEl.createDiv({ cls: 'puffs-relation-selected-chip' });
          chipEl.createSpan({ text: selection.displayName || (file instanceof TFile ? file.basename : selection.path) });
          if (!locked.has(selection.path)) {
            const removeButton = chipEl.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': '移除' } });
            setIcon(removeButton, 'x');
            removeButton.addEventListener('click', () => {
              map.delete(selection.path);
              renderSelections();
              renderResults();
            });
          }
        }
      }
    };

    const findMatch = (file, term) => {
      const basename = file.basename.toLowerCase();
      if (basename.includes(term)) return { displayName: file.basename, alias: '' };
      const alias = this.plugin.getNoteAliases(file).find((value) => value.toLowerCase().includes(term));
      return alias ? { displayName: alias, alias } : null;
    };
    const canSelect = (side, path) => {
      if (side === 'parent' && this.selectedChildren.size > 1 && this.selectedParents.size >= 1) return false;
      if (side === 'child' && this.selectedParents.size > 1 && this.selectedChildren.size >= 1) return false;
      const opposite = side === 'parent' ? this.selectedChildren : this.selectedParents;
      let hasNewRelation = opposite.size === 0;
      for (const selection of opposite.values()) {
        const parentPath = side === 'parent' ? path : selection.path;
        const childPath = side === 'child' ? path : selection.path;
        if (parentPath === childPath || this.plugin.wouldCreateNoteHierarchyCycle(parentPath, childPath)) return false;
        if (!this.plugin.getHierarchyChildren(parentPath).includes(childPath)) hasNewRelation = true;
      }
      return hasNewRelation;
    };
    const selectCandidate = (candidate) => {
      const map = this.activeSide === 'parent' ? this.selectedParents : this.selectedChildren;
      if (map.has(candidate.file.path)) map.delete(candidate.file.path);
      else if (canSelect(this.activeSide, candidate.file.path)) {
        map.set(candidate.file.path, {
          path: candidate.file.path,
          displayName: this.activeSide === 'child' ? candidate.alias : '',
        });
        this.queries[this.activeSide] = '';
        inputBySide[this.activeSide].value = '';
        this.activeIndex = 0;
      } else {
        new Notice('只能选择一篇父笔记或一篇子笔记作为批量关系的一侧');
      }
      renderSelections();
      renderResults();
      globalThis.setTimeout(() => inputBySide[this.activeSide].focus(), 0);
    };
    const renderResults = () => {
      resultsEl.empty();
      const term = this.queries[this.activeSide].trim().toLowerCase();
      if (!term) {
        resultsEl.classList.add('is-empty-query');
        return;
      }
      resultsEl.classList.remove('is-empty-query');
      const currentMap = this.activeSide === 'parent' ? this.selectedParents : this.selectedChildren;
      const candidates = this.app.vault.getMarkdownFiles()
        .map((file) => ({ file, match: findMatch(file, term) }))
        .filter(({ match }) => !!match)
        .map(({ file, match }) => ({ file, ...match }))
        .filter(({ file }) => !currentMap.has(file.path) && canSelect(this.activeSide, file.path))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-Hans-CN'));
      if (!candidates.length) {
        resultsEl.createDiv({ text: '没有可添加的笔记。', cls: 'puffs-relation-empty' });
        return;
      }
      this.activeIndex = Math.min(this.activeIndex, candidates.length - 1);
      candidates.forEach((candidate, index) => {
        const file = candidate.file;
        const rowEl = resultsEl.createDiv({ cls: 'puffs-relation-note-result is-clickable' });
        rowEl.classList.toggle('is-active', index === this.activeIndex);
        rowEl.createDiv({ text: candidate.displayName, cls: 'puffs-relation-note-result-name' });
        rowEl.createDiv({ text: file.path, cls: 'puffs-relation-note-result-path' });
        rowEl.addEventListener('mouseenter', () => {
          this.activeIndex = index;
          resultsEl.querySelectorAll('.puffs-relation-note-result').forEach((el, rowIndex) => {
            el.classList.toggle('is-active', rowIndex === index);
          });
        });
        rowEl.addEventListener('click', () => selectCandidate(candidate));
      });
      resultsEl.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    };
    for (const side of visibleSides) {
      inputBySide[side].addEventListener('keydown', (event) => {
        if (this.isComposing || event.isComposing) return;
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && visibleSides.length > 1) {
          const focusSide = getDirectionalInputSide(this.activeSide, event.key, visibleSides);
          event.preventDefault();
          event.stopPropagation();
          if (focusSide) {
            this.activeSide = focusSide;
            this.activeIndex = 0;
            inputBySide[focusSide].focus();
          }
          return;
        }
        const rows = Array.from(resultsEl.querySelectorAll('.puffs-relation-note-result'));
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && rows.length) {
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          this.activeIndex = Math.max(0, Math.min(rows.length - 1, this.activeIndex + delta));
          event.preventDefault();
          renderResults();
        } else if (getNoteRelationEnterAction(event, this.isComposing, !!rows[this.activeIndex]) === 'select-candidate') {
          event.preventDefault();
          event.stopPropagation();
          rows[this.activeIndex].click();
        }
      });
    }
    const submit = async () => {
      if (this.isSubmitting) return;
      const errorMessage = getNoteRelationSubmitError(this.selectedParents.size, this.selectedChildren.size);
      if (errorMessage) {
        new Notice(errorMessage);
        return;
      }
      this.isSubmitting = true;
      try {
        await this.plugin.addNoteHierarchyEdges(
          Array.from(this.selectedParents.values()),
          Array.from(this.selectedChildren.values())
        );
        this.close();
      } catch (error) {
        new Notice(error && error.message ? error.message : '添加父子关系失败');
      } finally {
        this.isSubmitting = false;
      }
    };
    this.modalEl.addEventListener('keydown', (event) => {
      if (getNoteRelationEnterAction(event, this.isComposing) !== 'submit') return;
      event.preventDefault();
      event.stopPropagation();
      void submit();
    });
    renderSelections();
    renderResults();
    globalThis.setTimeout(() => inputBySide[this.activeSide].focus(), 0);
  }
}

export {
  AddParentTagModal,
  NoteRelationModal,
  TagInheritanceModal,
  getDirectionalInputSide,
  getNoteRelationEnterAction,
  getNoteRelationSubmitError,
  getTagRelationCandidates,
  groupExcludedPathsBySource,
};
