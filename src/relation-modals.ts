// @ts-nocheck
import { Modal, Notice, TFile, setIcon } from "obsidian";
import { getTagDisplayName, normalizeTag } from "./models";

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
  constructor(app, plugin, sourcePath, mode) {
    super(app);
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.mode = mode === 'parent' ? 'parent' : 'child';
    this.query = '';
  }

  onOpen() {
    this.modalEl.classList.add('puffs-relation-modal');
    this.render();
  }

  render() {
    this.contentEl.empty();
    const sourceFile = this.app.vault.getAbstractFileByPath(this.sourcePath);
    const sourceName = sourceFile instanceof TFile ? sourceFile.basename : this.sourcePath;
    this.contentEl.createEl('h3', {
      text: this.mode === 'child' ? `为 ${sourceName} 添加子笔记` : `为 ${sourceName} 添加父笔记`,
      cls: 'puffs-relation-modal-title',
    });
    const inputEl = this.contentEl.createEl('input', {
      type: 'search',
      cls: 'puffs-relation-input',
      attr: { placeholder: '搜索文件名、路径或 alias' },
    });
    inputEl.value = this.query;
    const resultsEl = this.contentEl.createDiv({ cls: 'puffs-relation-note-results' });
    const renderResults = () => {
      resultsEl.empty();
      const term = this.query.trim().toLowerCase();
      const existing = new Set(this.mode === 'child'
        ? this.plugin.getHierarchyChildren(this.sourcePath)
        : this.plugin.getHierarchyParents(this.sourcePath));
      const files = this.app.vault.getMarkdownFiles()
        .filter((file) => file.path !== this.sourcePath && !existing.has(file.path))
        .filter((file) => {
          if (!term) return true;
          return [file.basename, file.path, ...this.plugin.getNoteAliases(file)]
            .some((value) => String(value).toLowerCase().includes(term));
        })
        .sort((a, b) => a.basename.localeCompare(b.basename, 'zh-Hans-CN'))
        .slice(0, 100);
      if (!files.length) {
        resultsEl.createDiv({ text: '没有可添加的笔记。', cls: 'puffs-relation-empty' });
        return;
      }
      for (const file of files) {
        const rowEl = resultsEl.createDiv({ cls: 'puffs-relation-note-result is-clickable' });
        rowEl.createDiv({ text: file.basename, cls: 'puffs-relation-note-result-name' });
        rowEl.createDiv({ text: file.path, cls: 'puffs-relation-note-result-path' });
        rowEl.addEventListener('click', async () => {
          try {
            const parentPath = this.mode === 'child' ? this.sourcePath : file.path;
            const childPath = this.mode === 'child' ? file.path : this.sourcePath;
            await this.plugin.addNoteHierarchyEdge(parentPath, childPath);
            this.close();
          } catch (error) {
            new Notice(error && error.message ? error.message : '添加父子关系失败');
          }
        });
      }
    };
    inputEl.addEventListener('input', () => {
      this.query = inputEl.value;
      renderResults();
    });
    renderResults();
    window.setTimeout(() => inputEl.focus(), 0);
  }
}

export { AddParentTagModal, NoteRelationModal, TagInheritanceModal };
