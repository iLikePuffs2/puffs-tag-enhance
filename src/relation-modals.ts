// @ts-nocheck
import { Modal, Notice, TFile, setIcon } from "obsidian";
import { getTagDisplayName, normalizeTag } from "./models";

function getDirectionalInputSide(activeSide, key, visibleSides) {
  if (!Array.isArray(visibleSides) || visibleSides.length < 2) return null;
  if (key === 'ArrowDown' && activeSide === 'parent' && visibleSides.includes('child')) return 'child';
  if (key === 'ArrowUp' && activeSide === 'child' && visibleSides.includes('parent')) return 'parent';
  return null;
}

class AddParentTagModal extends Modal {
  constructor(app, plugin, childTag) {
    super(app);
    this.plugin = plugin;
    this.childTag = normalizeTag(childTag);
  }

  onOpen() {
    this.modalEl.classList.add('puffs-relation-modal');
    this.contentEl.empty();
    const titleEl = this.contentEl.createEl('h3', { text: `为 ${this.childTag} 添加父标签` });
    titleEl.className = 'puffs-relation-modal-title';
    const inputEl = this.contentEl.createEl('input', { type: 'text' });
    inputEl.className = 'puffs-relation-input';
    inputEl.placeholder = '输入父标签，可省略 #';
    const submit = async () => {
      try {
        await this.plugin.addInheritanceParent(this.childTag, inputEl.value);
        this.close();
      } catch (error) {
        new Notice(error && error.message ? error.message : '添加父标签失败');
      }
    };
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
    const buttonEl = this.contentEl.createEl('button', { text: '添加' });
    buttonEl.className = 'mod-cta';
    buttonEl.addEventListener('click', submit);
    window.setTimeout(() => inputEl.focus(), 0);
  }
}

class TagInheritanceModal extends Modal {
  constructor(app, plugin, parentTag) {
    super(app);
    this.plugin = plugin;
    this.parentTag = normalizeTag(parentTag);
    this.children = plugin.getInheritanceChildren(parentTag);
  }

  onOpen() {
    this.modalEl.classList.add('puffs-relation-modal');
    this.render();
  }

  render() {
    this.contentEl.empty();
    this.contentEl.createEl('h3', { text: `管理 ${this.parentTag} 的子标签`, cls: 'puffs-relation-modal-title' });
    const addRow = this.contentEl.createDiv({ cls: 'puffs-relation-add-row' });
    const inputEl = addRow.createEl('input', { type: 'text', cls: 'puffs-relation-input' });
    inputEl.placeholder = '输入子标签，可省略 #';
    const addButton = addRow.createEl('button', { text: '添加' });
    const addChild = () => {
      const child = normalizeTag(inputEl.value);
      if (!child || this.children.includes(child)) return;
      if (this.plugin.wouldCreateTagInheritanceCycle(this.parentTag, child)) {
        new Notice('不能建立循环继承');
        return;
      }
      this.children.push(child);
      this.render();
    };
    addButton.addEventListener('click', addChild);
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') addChild();
    });

    const listEl = this.contentEl.createDiv({ cls: 'puffs-relation-manage-list' });
    if (!this.children.length) listEl.createDiv({ text: '暂无子标签', cls: 'puffs-relation-empty' });
    this.children.forEach((child, index) => {
      const rowEl = listEl.createDiv({ cls: 'puffs-relation-manage-row' });
      rowEl.createSpan({ text: child, cls: 'puffs-relation-manage-name' });
      const makeButton = (icon, label, callback, disabled = false) => {
        const button = rowEl.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label } });
        setIcon(button, icon);
        button.disabled = disabled;
        button.addEventListener('click', callback);
      };
      makeButton('arrow-up', '上移', () => {
        [this.children[index - 1], this.children[index]] = [this.children[index], this.children[index - 1]];
        this.render();
      }, index === 0);
      makeButton('arrow-down', '下移', () => {
        [this.children[index], this.children[index + 1]] = [this.children[index + 1], this.children[index]];
        this.render();
      }, index === this.children.length - 1);
      makeButton('x', '移除', () => {
        this.children.splice(index, 1);
        this.render();
      });
    });

    const exclusions = this.plugin.getTagInheritanceSettings().excludedPathsByParent[this.parentTag] || [];
    if (exclusions.length) {
      this.contentEl.createEl('h4', { text: '已排除笔记' });
      const exclusionListEl = this.contentEl.createDiv({ cls: 'puffs-relation-manage-list' });
      for (const path of exclusions) {
        const rowEl = exclusionListEl.createDiv({ cls: 'puffs-relation-manage-row' });
        const file = this.app.vault.getAbstractFileByPath(path);
        rowEl.createSpan({ text: file && file.basename ? file.basename : path, cls: 'puffs-relation-manage-name' });
        const restoreButton = rowEl.createEl('button', { text: '恢复' });
        restoreButton.addEventListener('click', async () => {
          await this.plugin.restoreInheritedFile(this.parentTag, path);
          this.render();
        });
      }
    }

    const footerEl = this.contentEl.createDiv({ cls: 'puffs-relation-modal-footer' });
    const saveButton = footerEl.createEl('button', { text: '保存', cls: 'mod-cta' });
    saveButton.addEventListener('click', async () => {
      try {
        await this.plugin.setInheritanceChildren(this.parentTag, this.children);
        this.close();
      } catch (error) {
        new Notice(error && error.message ? error.message : '保存继承关系失败');
      }
    });
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
    const footerEl = this.contentEl.createDiv({ cls: 'puffs-relation-modal-footer' });
    const submitButton = footerEl.createEl('button', { cls: 'mod-cta' });

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
      const count = this.selectedParents.size * this.selectedChildren.size;
      submitButton.textContent = `添加（${count}）`;
      submitButton.disabled = !this.selectedParents.size || !this.selectedChildren.size ||
        (this.selectedParents.size > 1 && this.selectedChildren.size > 1);
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
        } else if (event.key === 'Enter' && rows[this.activeIndex]) {
          event.preventDefault();
          rows[this.activeIndex].click();
        }
      });
    }
    submitButton.addEventListener('click', async () => {
      try {
        await this.plugin.addNoteHierarchyEdges(
          Array.from(this.selectedParents.values()),
          Array.from(this.selectedChildren.values())
        );
        this.close();
      } catch (error) {
        new Notice(error && error.message ? error.message : '添加父子关系失败');
      }
    });
    renderSelections();
    renderResults();
    globalThis.setTimeout(() => inputBySide[this.activeSide].focus(), 0);
  }
}

export { AddParentTagModal, NoteRelationModal, TagInheritanceModal, getDirectionalInputSide };
