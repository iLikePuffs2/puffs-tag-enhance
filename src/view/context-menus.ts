// 渲染层：标签与笔记卡片的右键菜单。
//
// 同样自 relations.ts 迁出。菜单只负责收集用户意图并调用下层的变更方法，
// 不含关系计算。

import { Menu, Notice, TFile } from "obsidian";
import { getTagDisplayName, isNestedTag, normalizeTag } from "../models";
import {
  ManageParentTagModal,
  NoteRelationModal,
  TagInheritanceModal,
  TagNoteBindingModal,
} from "../relation-modals";

export class ContextMenusBehavior {
  [key: string]: any;

  showHierarchyParentMenu(event: any, file: any) {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('打开笔记').setIcon('file-text').onClick(() => this.openFileInMainWorkspace(file)));
    menu.addItem((item) => item.setTitle('添加子笔记').setIcon('user-round-plus').onClick(() => {
      new NoteRelationModal(this.app, this, file.path, 'child').open();
    }));
    menu.addItem((item) => item.setTitle('添加父笔记').setIcon('corner-left-up').onClick(() => {
      new NoteRelationModal(this.app, this, file.path, 'parent').open();
    }));
    menu.showAtMouseEvent(event);
  }

  showHierarchyChildMenu(event: any, parentPath: any, file: any) {
    const menu = new Menu();
    const aliases = this.getNoteAliases(file);
    if (aliases.length) {
      menu.addItem((item) => item.setTitle('更换显示名称').setIcon('text-cursor-input').onClick(() => {
        const position = { x: event.clientX, y: event.clientY };
        window.setTimeout(() => this.showHierarchyDisplayNameOptions(position, parentPath, file, aliases), 0);
      }));
    }
    menu.addItem((item) => item.setTitle('添加子笔记').setIcon('user-round-plus').onClick(() => new NoteRelationModal(this.app, this, file.path, 'child').open()));
    menu.addItem((item) => item.setTitle('添加父笔记').setIcon('corner-left-up').onClick(() => new NoteRelationModal(this.app, this, file.path, 'parent').open()));
    menu.addItem((item) => item.setTitle('从当前移除').setIcon('unlink').onClick(() => this.removeNoteHierarchyEdge(parentPath, file.path)));
    menu.showAtMouseEvent(event);
  }

  showHierarchyDisplayNameOptions(position: any, parentPath: any, file: any, aliases: any) {
    const current = this.getHierarchyDisplayName(parentPath, file);
    const menu = new Menu();
    menu.addItem((item) => item.setTitle(file.basename).setChecked(current === file.basename).onClick(() => this.setHierarchyDisplayName(parentPath, file, '')));
    for (const alias of aliases) {
      menu.addItem((item) => item.setTitle(alias).setChecked(current === alias).onClick(() => this.setHierarchyDisplayName(parentPath, file, alias)));
    }
    menu.showAtPosition(position);
  }

  showNoteCardContextMenu(event: any, cardEl: any) {
    const path = cardEl && cardEl.dataset.path;
    const file = path && this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== 'md') return false;
    const hierarchyParent = cardEl.dataset.puffsHierarchyParent;
    if (hierarchyParent) {
      this.showHierarchyChildMenu(event, hierarchyParent, file);
      return true;
    }

    const tag = normalizeTag(cardEl.dataset.puffsTag);
    const inheritanceRootTag = normalizeTag(cardEl.dataset.puffsInheritanceRootTag || tag);
    const menu = new Menu();
    const inherited = cardEl.dataset.puffsInherited === 'true' || (tag && this.isInheritedFileForTag(tag, path));
    const fixedInherited = inheritanceRootTag && this.isFixedInheritedFileForTag(inheritanceRootTag, path);
    if (inherited && !fixedInherited) {
      menu.addItem((item) => item
        .setTitle(this.getInheritedFileRemovalTitle(inheritanceRootTag))
        .setIcon('eye-off')
        .onClick(() => this.setInheritedFileVisible(inheritanceRootTag, path, false).catch((error: any) => {
          console.error('[Puffs Tag Enhance] Failed to exclude inherited note:', error);
          new Notice('排除继承笔记失败');
        })));
    }
    const aliases = tag && !isNestedTag(tag) ? this.getNoteAliases(file) : [];
    if (aliases.length > 0) {
      menu.addItem((item) => item.setTitle('更换显示名称').setIcon('text-cursor-input').onClick(() => {
        const position = { x: event.clientX, y: event.clientY };
        window.setTimeout(() => this.showNoteDisplayNameOptions(position, tag, file, aliases), 0);
      }));
    }
    if ((inherited && !fixedInherited) || aliases.length > 0) menu.addSeparator();
    menu.addItem((item) => item.setTitle('添加父笔记').setIcon('corner-left-up').onClick(() => {
      new NoteRelationModal(this.app, this, path, 'parent').open();
    }));
    menu.addItem((item) => item.setTitle('添加子笔记').setIcon('user-round-plus').onClick(() => {
      new NoteRelationModal(this.app, this, path, 'child').open();
    }));
    if (this.getHierarchyParents(path).length > 0 || this.getHierarchyChildren(path).length > 0) {
      menu.addItem((item) => item.setTitle('定位父子关系').setIcon('locate-fixed').onClick(() => {
        this.openHierarchyForNote(path, cardEl);
      }));
    }
    menu.showAtMouseEvent(event);
    return true;
  }

  showTagContextMenu(event: any, tagValue: any) {
    const tag = normalizeTag(tagValue);
    if (!tag) return false;
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('修改标签').setIcon('pencil').onClick(() => this.openRenameTagModal(tag)));
    menu.addItem((item) => item.setTitle('管理父标签').setIcon('corner-left-up').onClick(() => {
      new ManageParentTagModal(this.app, this, tag).open();
    }));
    menu.addItem((item) => item.setTitle('管理子标签').setIcon('git-fork').onClick(() => {
      new TagInheritanceModal(this.app, this, tag).open();
    }));
    menu.addSeparator();
    const boundFile = this.getTagBoundNoteFile(tag);
    if (boundFile) {
      menu.addItem((item) => item.setTitle('打开笔记').setIcon('file-text').onClick(() => {
        this.openFileInMainWorkspace(boundFile);
      }));
      menu.addItem((item) => item.setTitle('换绑笔记').setIcon('replace').onClick(() => {
        new TagNoteBindingModal(this.app, this, tag).open();
      }));
    } else {
      menu.addItem((item) => item.setTitle('绑定笔记').setIcon('link').onClick(() => {
        new TagNoteBindingModal(this.app, this, tag).open();
      }));
    }
    menu.showAtMouseEvent(event);
    return true;
  }

  showInheritedNoteMenu(event: any, tagValue: any, path: any) {
    const tag = normalizeTag(tagValue);
    if (!tag || !path || !this.isInheritedFileForTag(tag, path) || this.isFixedInheritedFileForTag(tag, path)) return false;
    const menu = new Menu();
    menu.addItem((item) => item
      .setTitle(this.getInheritedFileRemovalTitle(tag))
      .setIcon('eye-off')
      .onClick(() => this.setInheritedFileVisible(tag, path, false).catch((error: any) => {
        console.error('[Puffs Tag Enhance] Failed to exclude inherited note:', error);
        new Notice('排除继承笔记失败');
      })));
    menu.showAtMouseEvent(event);
    return true;
  }
}
