import { Modal, Notice, setIcon } from "obsidian";
import { getTagDisplayName, normalizeTag } from "./models";

class PuffsTagRenameModal extends Modal {
  isSubmitting: any;
  mode: any;
  plugin: any;
  tag: any;
  constructor(app: any, plugin: any, tag: any) {
    super(app);
    this.plugin = plugin;
    this.tag = normalizeTag(tag);
    this.mode = 'rename';
    this.isSubmitting = false;
  }

  onOpen() {
    this.modalEl.classList.add('puffs-tag-rename-modal');
    this.contentEl.empty();

    const headingEl = document.createElement('div');
    headingEl.className = 'puffs-tag-rename-heading';

    const titleEl = document.createElement('div');
    titleEl.className = 'puffs-tag-rename-title';

    const addButtonEl = document.createElement('button');
    addButtonEl.className = 'puffs-tag-rename-mode-button';
    addButtonEl.type = 'button';

    const deleteButtonEl = document.createElement('button');
    deleteButtonEl.className = 'puffs-tag-rename-mode-button';
    deleteButtonEl.type = 'button';

    const inputEl = document.createElement('input');
    inputEl.className = 'puffs-tag-rename-input';
    inputEl.type = 'text';

    headingEl.appendChild(titleEl);
    headingEl.appendChild(addButtonEl);
    headingEl.appendChild(deleteButtonEl);
    this.contentEl.appendChild(headingEl);
    this.contentEl.appendChild(inputEl);

    const focusInput = (select = false) => {
      window.setTimeout(() => {
        inputEl.focus();
        if (select) inputEl.select();
      }, 0);
    };

    const renderMode = (mode: any) => {
      this.mode = mode;
      titleEl.textContent = mode === 'add'
        ? '批量新增标签'
        : mode === 'delete'
          ? '批量删除标签'
          : '修改标签名称';
      setIcon(addButtonEl, mode === 'add' ? 'pencil' : 'plus');
      setIcon(deleteButtonEl, mode === 'delete' ? 'pencil' : 'minus');
      inputEl.value = mode === 'rename' ? getTagDisplayName(this.tag) : '';
      focusInput(mode === 'rename');
    };

    const keepInputFocused = (evt: any) => {
      evt.preventDefault();
    };
    addButtonEl.addEventListener('mousedown', keepInputFocused);
    deleteButtonEl.addEventListener('mousedown', keepInputFocused);

    addButtonEl.addEventListener('click', () => {
      renderMode(this.mode === 'add' ? 'rename' : 'add');
    });
    deleteButtonEl.addEventListener('click', () => {
      renderMode(this.mode === 'delete' ? 'rename' : 'delete');
    });

    inputEl.addEventListener('keydown', async (evt) => {
      if (evt.key !== 'Enter' || this.isSubmitting) return;

      evt.preventDefault();
      evt.stopPropagation();

      this.isSubmitting = true;
      try {
        if (this.mode === 'add') {
          await this.plugin.addTagToTaggedNotes(this.tag, inputEl.value);
        } else if (this.mode === 'delete') {
          await this.plugin.deleteTagFromTaggedNotes(this.tag, inputEl.value);
        } else {
          await this.plugin.renameTag(this.tag, inputEl.value);
        }
        this.close();
      } catch (error) {
        this.isSubmitting = false;
        const fallbackMessage = this.mode === 'add'
          ? '批量新增标签失败'
          : this.mode === 'delete'
            ? '批量删除标签失败'
            : '修改标签名称失败';
        new Notice(error && error.message ? error.message : fallbackMessage);
        inputEl.focus();
        inputEl.select();
      }
    });

    inputEl.addEventListener('blur', () => {
      if (!this.isSubmitting) this.close();
    });

    renderMode('rename');
  }
}

export { PuffsTagRenameModal };
