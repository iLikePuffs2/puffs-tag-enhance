// @ts-nocheck
import * as obsidian from "obsidian";
import { Notice, TFile } from "obsidian";
import {
  DEFAULT_MOVE_NOTE_DOWN_HOTKEY,
  DEFAULT_MOVE_NOTE_UP_HOTKEY,
  MARKDOWN_VIEW_TYPE,
  OUTLINE_VIEW_TYPE,
  TAG_SHELF_VIEW_TYPE,
  TAG_VIEW_TYPE,
  formatHotkey,
  getLeafFilePath,
  normalizeTag,
  parseHotkeyText
} from "./models";

const TAG_PLUGIN_ID = 'tag-pane';
const OPEN_TAG_COMMAND_ID = 'tag-pane:open';
const TOGGLE_RIGHT_SIDEBAR_COMMAND_ID = 'app:toggle-right-sidebar';
const LEGACY_TAG_SIDEBAR_COMMAND_ID = 'puffs-immersive-mode:toggle-tag-sidebar';

export class WorkspaceBehavior {
  [key: string]: any;

  refreshTagShelfViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_SHELF_VIEW_TYPE)) {
      if (leaf.view && typeof leaf.view.refresh === 'function') {
        leaf.view.refresh();
      }
    }
  }

  getVisibleTagLeaf() {
    return (this.app.workspace.getLeavesOfType(TAG_VIEW_TYPE) || []).find((leaf) => {
      if (typeof leaf.isVisible === 'function') return leaf.isVisible();
      return Boolean(leaf.view && leaf.view.containerEl && leaf.view.containerEl.isShown());
    }) || null;
  }

  isLeafFocused(leaf) {
    if (!leaf) return false;
    const activeEl = document.activeElement;
    const containerEl = leaf.view && leaf.view.containerEl || leaf.containerEl;
    return this.app.workspace.activeLeaf === leaf || Boolean(activeEl && containerEl && containerEl.contains(activeEl));
  }

  async focusLeaf(leaf) {
    if (!leaf) return;
    if (this.app.workspace.revealLeaf) await this.app.workspace.revealLeaf(leaf);
    if (this.app.workspace.setActiveLeaf) this.app.workspace.setActiveLeaf(leaf, { focus: true });
    const containerEl = leaf.view && leaf.view.containerEl || leaf.containerEl;
    const focusTarget = containerEl && containerEl.querySelector('input, button, [tabindex]:not([tabindex="-1"])');
    if (focusTarget && focusTarget.focus) focusTarget.focus();
    else if (containerEl && containerEl.focus) containerEl.focus();
  }

  async toggleTagSidebar() {
    const tagPlugin = this.app.internalPlugins && this.app.internalPlugins.getPluginById &&
      this.app.internalPlugins.getPluginById(TAG_PLUGIN_ID);
    if (tagPlugin && !tagPlugin.enabled) {
      new Notice('请先启用 Obsidian 核心插件 标签列表。');
      return;
    }
    const leaf = this.getVisibleTagLeaf();
    if (leaf) {
      const patch = this.viewPatches.get(leaf.view);
      if (patch && patch.hierarchyMode) {
        this.exitSidebarHierarchyMode(leaf.view, patch);
        await this.focusLeaf(leaf);
        return;
      }
      if (!this.isLeafFocused(leaf)) {
        await this.focusLeaf(leaf);
        return;
      }
      await this.app.commands.executeCommandById(TOGGLE_RIGHT_SIDEBAR_COMMAND_ID);
      return;
    }
    const opened = await this.app.commands.executeCommandById(OPEN_TAG_COMMAND_ID);
    if (opened === false) new Notice('无法打开标签列表，请确认核心插件 标签列表 已启用。');
  }

  async migrateTagSidebarHotkeys() {
    const manager = this.app.hotkeyManager;
    if (!manager || !manager.getHotkeys || !manager.setHotkeys || !manager.removeHotkeys) return;
    const nextId = `${this.manifest.id}:toggle-tag-sidebar`;
    const legacy = manager.getHotkeys(LEGACY_TAG_SIDEBAR_COMMAND_ID) || [];
    if (!legacy.length) return;
    const current = manager.getHotkeys(nextId) || [];
    const merged = Array.from(new Map([...current, ...legacy]
      .map((hotkey) => [JSON.stringify(hotkey), hotkey])).values());
    manager.setHotkeys(nextId, merged);
    manager.removeHotkeys(LEGACY_TAG_SIDEBAR_COMMAND_ID);
    if (manager.save) await manager.save();
  }

  async openTagShelf() {
    this.rememberCurrentMainLeaf();

    const existing = this.app.workspace.getLeavesOfType(TAG_SHELF_VIEW_TYPE)[0];
    const leaf = existing || this.app.workspace.getLeaf('tab');
    if (!existing) {
      await leaf.setViewState({ type: TAG_SHELF_VIEW_TYPE, state: {} });
    }

    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    if (leaf.view && typeof leaf.view.refresh === 'function') {
      leaf.view.refresh();
    }
  }


  isNoteOrderSearchControl(target) {
    if (!(target instanceof Element)) return false;
    if (target.closest('.puffs-tag-shelf-search-host')) return true;

    return this.app.workspace.getLeavesOfType(TAG_VIEW_TYPE).some((leaf) => {
      const view = leaf && leaf.view;
      const inputEl = view && view.searchComponent && view.searchComponent.inputEl;
      if (!inputEl || !inputEl.isConnected) return false;

      const searchContainerEl = inputEl.closest('.search-input-container') || inputEl;
      return searchContainerEl.contains(target);
    });
  }

  isTagSidebarScrollbarPointer(evt, target) {
    if (!(target instanceof Element)) return false;

    const scrollEl = target.closest(
      '.workspace-leaf-content[data-type="tag"] .tag-container'
    );
    if (!scrollEl || scrollEl.scrollHeight <= scrollEl.clientHeight) return false;

    const scrollbarWidth = scrollEl.offsetWidth - scrollEl.clientWidth;
    if (scrollbarWidth <= 0) return false;

    const rect = scrollEl.getBoundingClientRect();
    return (
      evt.clientX >= rect.right - scrollbarWidth &&
      evt.clientX <= rect.right &&
      evt.clientY >= rect.top &&
      evt.clientY <= rect.bottom
    );
  }

  registerKeyboardHandler() {
    this.keydownHandler = (evt) => {
      if (!this.isQuickSearchHotkey(evt)) return;

      const view = this.getFocusedTagView();
      if (!view) return;

      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      this.toggleTagSearch(view);
    };

    document.addEventListener('keydown', this.keydownHandler, true);
    this.pointerdownHandler = (evt) => {
      if (!this.selectedNoteOrderTarget) return;
      const target = evt.target instanceof Element ? evt.target : null;
      if (target && target.closest('.puffs-tag-note-order-button')) return;
      if (target && target.closest('.puffs-tag-scroll-top-button')) return;
      if (target && target.closest('.puffs-tag-scroll-bottom-button')) return;
      if (this.isNoteOrderSearchControl(target)) return;
      if (this.isTagSidebarScrollbarPointer(evt, target)) return;
      if (evt.button === 2 && target && target.closest('.puffs-tag-note-card')) return;
      this.clearNoteOrderTarget();
    };
    document.addEventListener('pointerdown', this.pointerdownHandler, true);

    this.noteOrderContextMenuHandler = (evt) => {
      const selected = this.selectedNoteOrderTarget;
      if (!selected) return;

      const target = evt.target instanceof Element ? evt.target : null;
      if (!target) return;
      if (target.closest('.puffs-tag-note-order-button')) return;

      const cardEl = target.closest('.puffs-tag-note-card');
      if (!cardEl) return;

      const targetTag = normalizeTag(cardEl.dataset.puffsTag);
      const targetHierarchyParent = cardEl.dataset.puffsHierarchyParent;
      const targetPath = cardEl.dataset.path;
      if (selected.hierarchyParent) {
        if (targetHierarchyParent === selected.hierarchyParent && targetPath === selected.path) return;
        if (!targetHierarchyParent || targetHierarchyParent !== selected.hierarchyParent || !targetPath) {
          this.clearNoteOrderTarget();
          return;
        }
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.moveSelectedHierarchyNoteAfter(targetHierarchyParent, targetPath).catch((error) => {
          console.error('[Puffs Tag Enhance] Failed to move hierarchy note:', error);
          new Notice('调整子笔记顺序失败');
        });
        return;
      }
      if (targetTag === selected.tag && targetPath === selected.path) return;

      if (!targetTag || targetTag !== selected.tag || !targetPath) {
        this.clearNoteOrderTarget();
        return;
      }

      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      this.moveSelectedNoteAfter(targetTag, targetPath).catch((error) => {
        console.error('[Puffs Tag Enhance] Failed to move selected note after target:', error);
        new Notice('调整笔记顺序失败');
      });
    };
    document.addEventListener('contextmenu', this.noteOrderContextMenuHandler, true);

    this.register(() => {
      document.removeEventListener('keydown', this.keydownHandler, true);
      document.removeEventListener('pointerdown', this.pointerdownHandler, true);
      document.removeEventListener('contextmenu', this.noteOrderContextMenuHandler, true);
      this.keydownHandler = null;
      this.pointerdownHandler = null;
      this.noteOrderContextMenuHandler = null;
    });
  }

  eventMatchesHotkey(evt, hotkey) {
    const keyMatches = evt.key && evt.key.toLowerCase() === hotkey.key.toLowerCase();
    if (!keyMatches) return false;

    const wantsCtrl = hotkey.modifiers.includes('Ctrl');
    const wantsMeta = hotkey.modifiers.includes('Meta');
    const wantsMod = hotkey.modifiers.includes('Mod');
    const wantsAlt = hotkey.modifiers.includes('Alt');
    const wantsShift = hotkey.modifiers.includes('Shift');

    const modCtrl = wantsMod && !obsidian.Platform?.isMacOS;
    const modMeta = wantsMod && obsidian.Platform?.isMacOS;

    return (
      evt.ctrlKey === (wantsCtrl || modCtrl) &&
      evt.metaKey === (wantsMeta || modMeta) &&
      evt.altKey === wantsAlt &&
      evt.shiftKey === wantsShift
    );
  }

  isQuickSearchHotkey(evt) {
    return this.eventMatchesHotkey(evt, this.getQuickSearchHotkey());
  }

  getQuickSearchHotkey() {
    return parseHotkeyText(this.settings.toggleSearchHotkey);
  }

  getQuickSearchHotkeyDisplay() {
    return formatHotkey(this.getQuickSearchHotkey());
  }

  getMoveNoteUpHotkeyDisplay() {
    return formatHotkey(
      parseHotkeyText(this.settings.moveNoteUpHotkey, DEFAULT_MOVE_NOTE_UP_HOTKEY)
    );
  }

  getMoveNoteDownHotkeyDisplay() {
    return formatHotkey(
      parseHotkeyText(this.settings.moveNoteDownHotkey, DEFAULT_MOVE_NOTE_DOWN_HOTKEY)
    );
  }

  handleActiveLeafChange(leaf) {
    if (this.isMarkdownMainLeaf(leaf)) {
      const filePath = getLeafFilePath(leaf);
      const filePathChanged = filePath !== this.currentMainFilePath;
      this.rememberMainLeaf(leaf);
      this.currentMainFilePath = filePath;
      if (filePathChanged) {
        this.applySidebarPreferenceForCurrentFile();
      }
      return;
    }

    if (this.isManagedSidebarLeaf(leaf)) {
      this.handleSidebarSelection(leaf);
    }
  }

  isMarkdownMainLeaf(leaf) {
    return this.isMainWorkspaceLeaf(leaf) && leaf.view && leaf.view.getViewType() === MARKDOWN_VIEW_TYPE;
  }

  isManagedSidebarLeaf(leaf) {
    return !!(
      leaf &&
      leaf.view &&
      !this.isMainWorkspaceLeaf(leaf) &&
      leaf.parent &&
      leaf.parent.type === 'tabs'
    );
  }

  captureSelectedSidebarState() {
    const leaf = this.getSelectedManagedSidebarLeaf();
    this.selectedSidebarViewType = leaf && leaf.view ? leaf.view.getViewType() : null;
  }

  syncSelectedSidebarState() {
    const leaf = this.getSelectedManagedSidebarLeaf();
    if (!leaf || !leaf.view) return;

    this.handleSidebarSelection(leaf);
  }

  handleSidebarSelection(leaf) {
    if (!this.isManagedSidebarLeaf(leaf)) return;

    const operation = this.activeSidebarSelectionOperation;
    if (operation && leaf.parent === operation.group) {
      return;
    }

    const viewType = leaf.view.getViewType();
    if (!viewType || viewType === this.selectedSidebarViewType) return;

    const previousViewType = this.selectedSidebarViewType;
    this.selectedSidebarViewType = viewType;
    this.sidebarSwitchRequestId += 1;

    if (!this.settings.autoSwitchToOutlineEnabled) return;

    if (viewType === TAG_VIEW_TYPE) {
      this.setTagSidebarPreference(this.currentMainFilePath, true);
    } else if (previousViewType === TAG_VIEW_TYPE) {
      this.setTagSidebarPreference(this.currentMainFilePath, false);
    }
  }

  async setTagSidebarPreference(filePath, enabled) {
    if (!filePath) return;

    const preferredFiles = this.settings.tagSidebarPreferredFiles || {};
    const hasPreference = preferredFiles[filePath] === true;
    if (enabled === hasPreference) return;

    if (enabled) {
      preferredFiles[filePath] = true;
    } else {
      delete preferredFiles[filePath];
    }

    this.settings.tagSidebarPreferredFiles = preferredFiles;
    await this.saveSettings();
  }

  hasTagSidebarPreference(filePath) {
    return !!(filePath && this.settings.tagSidebarPreferredFiles && this.settings.tagSidebarPreferredFiles[filePath]);
  }

  applySidebarPreferenceForCurrentFile() {
    const requestId = ++this.sidebarSwitchRequestId;
    const filePath = this.currentMainFilePath;
    if (!this.settings.autoSwitchToOutlineEnabled || !filePath) return;

    const targetViewType = this.hasTagSidebarPreference(filePath)
      ? TAG_VIEW_TYPE
      : OUTLINE_VIEW_TYPE;
    this.switchManagedSidebarTo(requestId, filePath, targetViewType).catch((error) => {
      console.error('[Puffs Tag Enhance] Failed to switch sidebar for current file:', error);
    });
  }

  async switchManagedSidebarTo(requestId, filePath, viewType) {
    const leaf = await this.getOrCreateManagedSidebarLeaf(viewType);
    if (this.isUnloaded) return;
    if (requestId !== this.sidebarSwitchRequestId) return;
    if (filePath !== this.currentMainFilePath) return;
    if (!this.settings.autoSwitchToOutlineEnabled) return;

    const currentTargetViewType = this.hasTagSidebarPreference(filePath)
      ? TAG_VIEW_TYPE
      : OUTLINE_VIEW_TYPE;
    if (currentTargetViewType !== viewType) return;
    if (!leaf || !leaf.parent || typeof leaf.parent.selectTab !== 'function') return;

    const group = leaf.parent;
    const operation = {
      requestId,
      filePath,
      targetLeaf: leaf,
      targetViewType: viewType,
      group,
    };
    this.activeSidebarSelectionOperation = operation;

    try {
      leaf.parent.selectTab(leaf);
    } finally {
      if (this.activeSidebarSelectionOperation === operation) {
        this.activeSidebarSelectionOperation = null;
      }
      const selectedLeaf = Array.isArray(group.children) && Number.isInteger(group.currentTab)
        ? group.children[group.currentTab]
        : null;
      this.selectedSidebarViewType = this.isManagedSidebarLeaf(selectedLeaf)
        ? selectedLeaf.view.getViewType()
        : null;
    }

    const mainLeaf = this.lastMainLeaf;
    if (
      this.selectedSidebarViewType === viewType &&
      this.isUsableMainLeaf(mainLeaf) &&
      getLeafFilePath(mainLeaf) === filePath
    ) {
      this.app.workspace.setActiveLeaf(mainLeaf, { focus: true });
    }
  }

  async getOrCreateManagedSidebarLeaf(viewType) {
    const existingLeaf = this.findManagedSidebarLeaf(viewType);
    if (existingLeaf) return existingLeaf;

    const targetGroup = this.findManagedSidebarTabGroup();
    let leaf = null;

    if (targetGroup && typeof this.app.workspace.createLeafInTabGroup === 'function') {
      leaf = this.app.workspace.createLeafInTabGroup(targetGroup);
    } else if (typeof this.app.workspace.getRightLeaf === 'function') {
      leaf = this.app.workspace.getRightLeaf(false);
    } else if (typeof this.app.workspace.getLeaf === 'function') {
      leaf = this.app.workspace.getLeaf(false);
    }

    if (!leaf || typeof leaf.setViewState !== 'function') return null;

    await leaf.setViewState({ type: viewType, state: {}, active: false });
    return leaf;
  }

  findManagedSidebarLeaf(viewType) {
    return this.app.workspace.getLeavesOfType(viewType).find((leaf) => this.isManagedSidebarLeaf(leaf)) || null;
  }

  getSelectedManagedSidebarLeaf() {
    const group = this.findManagedSidebarTabGroup();
    if (!group || !Array.isArray(group.children) || !Number.isInteger(group.currentTab)) return null;

    const leaf = group.children[group.currentTab];
    return this.isManagedSidebarLeaf(leaf) ? leaf : null;
  }

  findManagedSidebarTabGroup() {
    const tagLeaf = this.findManagedSidebarLeaf(TAG_VIEW_TYPE);
    if (tagLeaf && tagLeaf.parent) return tagLeaf.parent;

    const outlineLeaf = this.findManagedSidebarLeaf(OUTLINE_VIEW_TYPE);
    if (outlineLeaf && outlineLeaf.parent) return outlineLeaf.parent;

    return null;
  }

  handlePreferredFileRename(file, oldPath) {
    if (!oldPath || !file || !file.path || !this.settings.tagSidebarPreferredFiles) return;
    if (!this.settings.tagSidebarPreferredFiles[oldPath]) return;

    delete this.settings.tagSidebarPreferredFiles[oldPath];
    this.settings.tagSidebarPreferredFiles[file.path] = true;

    if (this.currentMainFilePath === oldPath) {
      this.currentMainFilePath = file.path;
    }

    this.saveSettings();
  }

  handlePreferredFileDelete(file) {
    if (!file || !file.path || !this.settings.tagSidebarPreferredFiles) return;
    if (!this.settings.tagSidebarPreferredFiles[file.path]) return;

    delete this.settings.tagSidebarPreferredFiles[file.path];
    if (this.currentMainFilePath === file.path) {
      this.currentMainFilePath = null;
    }

    this.saveSettings();
  }

  handleNoteOrderFileRename(file, oldPath) {
    if (!(file instanceof TFile) || file.extension !== 'md' || !oldPath || !file.path) return;

    let changed = false;
    for (const [tag, paths] of Object.entries(this.settings.noteOrderByTag)) {
      if (!Array.isArray(paths) || !paths.includes(oldPath)) continue;

      this.settings.noteOrderByTag[tag] = Array.from(
        new Set(paths.map((path) => (path === oldPath ? file.path : path)))
      );
      changed = true;
    }

    if (changed) {
      this.saveSettings().catch((error) => {
        console.error('[Puffs Tag Enhance] Failed to update note order after rename:', error);
      });
    }
  }

  handleNoteOrderFileDelete(file) {
    if (!(file instanceof TFile) || file.extension !== 'md' || !file.path) return;

    let changed = false;
    for (const [tag, paths] of Object.entries(this.settings.noteOrderByTag)) {
      if (!Array.isArray(paths) || !paths.includes(file.path)) continue;

      const nextPaths = paths.filter((path) => path !== file.path);
      if (nextPaths.length > 0) this.settings.noteOrderByTag[tag] = nextPaths;
      else delete this.settings.noteOrderByTag[tag];
      changed = true;
    }

    if (changed) {
      this.saveSettings().catch((error) => {
        console.error('[Puffs Tag Enhance] Failed to update note order after delete:', error);
      });
    }
  }

  handleNoteDisplayNameFileRename(file, oldPath) {
    if (
      !(file instanceof TFile) ||
      file.extension !== 'md' ||
      !oldPath ||
      !file.path ||
      !this.settings.noteDisplayNameByTag
    ) {
      return;
    }

    let changed = false;
    for (const [tag, entries] of Object.entries(this.settings.noteDisplayNameByTag)) {
      if (!entries || typeof entries !== 'object' || !entries[oldPath]) continue;

      if (!entries[file.path]) entries[file.path] = entries[oldPath];
      delete entries[oldPath];
      if (Object.keys(entries).length === 0) delete this.settings.noteDisplayNameByTag[tag];
      changed = true;
    }

    if (changed) {
      this.saveSettings().catch((error) => {
        console.error('[Puffs Tag Enhance] Failed to update note display name after rename:', error);
      });
    }
  }

  handleNoteDisplayNameFileDelete(file) {
    if (
      !(file instanceof TFile) ||
      file.extension !== 'md' ||
      !file.path ||
      !this.settings.noteDisplayNameByTag
    ) {
      return;
    }

    let changed = false;
    for (const [tag, entries] of Object.entries(this.settings.noteDisplayNameByTag)) {
      if (!entries || typeof entries !== 'object' || !entries[file.path]) continue;

      delete entries[file.path];
      if (Object.keys(entries).length === 0) delete this.settings.noteDisplayNameByTag[tag];
      changed = true;
    }

    if (changed) {
      this.saveSettings().catch((error) => {
        console.error('[Puffs Tag Enhance] Failed to remove note display name after delete:', error);
      });
    }
  }


  async openNoteCard(cardEl) {
    const path = cardEl.dataset.path;
    if (!path) return;

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`未找到笔记：${path}`);
      return;
    }

    await this.openFileInMainWorkspace(file);
  }

  async openFileInMainWorkspace(file) {
    const openLeaf = this.findOpenMainLeaf(file.path);
    if (openLeaf) {
      await this.app.workspace.revealLeaf(openLeaf);
      this.app.workspace.setActiveLeaf(openLeaf, { focus: true });
      this.rememberMainLeaf(openLeaf);
      return;
    }

    const leaf = this.getBestMainLeaf();
    if (!leaf || !this.isMainWorkspaceLeaf(leaf)) {
      new Notice('未找到可用的主编辑区标签页');
      return;
    }

    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    this.rememberMainLeaf(leaf);
    await this.app.workspace.openLinkText(file.path, '', false);
  }

  findOpenMainLeaf(filePath) {
    let foundLeaf = null;

    this.app.workspace.iterateAllLeaves((leaf) => {
      if (foundLeaf) return;
      if (!this.isMainWorkspaceLeaf(leaf)) return;
      if (getLeafFilePath(leaf) !== filePath) return;
      foundLeaf = leaf;
    });

    return foundLeaf;
  }

  getBestMainLeaf() {
    if (this.isUsableMainLeaf(this.lastMainLeaf)) {
      return this.lastMainLeaf;
    }

    const activeLeaf = this.app.workspace.activeLeaf;
    if (this.isUsableMainLeaf(activeLeaf)) {
      return activeLeaf;
    }

    let bestLeaf = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (!this.isUsableMainLeaf(leaf)) return;

      if (!bestLeaf || (bestLeaf.activeTime || 0) < (leaf.activeTime || 0)) {
        bestLeaf = leaf;
      }
    });

    if (bestLeaf) return bestLeaf;

    return this.createMainWorkspaceLeaf();
  }

  isUsableMainLeaf(leaf) {
    if (!this.isMainWorkspaceLeaf(leaf)) return false;
    return !leaf.view || leaf.view.getViewType() !== TAG_SHELF_VIEW_TYPE;
  }

  isMainWorkspaceLeaf(leaf) {
    if (!leaf || !leaf.getRoot) return false;
    return leaf.getRoot() === this.app.workspace.rootSplit;
  }

  createMainWorkspaceLeaf() {
    const workspace = this.app.workspace;
    const tabGroup = this.findMainWorkspaceTabGroup();

    if (tabGroup && typeof workspace.createLeafInTabGroup === 'function') {
      return workspace.createLeafInTabGroup(tabGroup);
    }

    if (workspace.rootSplit && typeof workspace.createLeafInParent === 'function') {
      return workspace.createLeafInParent(workspace.rootSplit, workspace.rootSplit.children?.length || 0);
    }

    return workspace.getLeaf('tab');
  }

  findMainWorkspaceTabGroup() {
    const workspace = this.app.workspace;
    const activeLeaf = workspace.activeLeaf;
    if (this.isMainWorkspaceLeaf(activeLeaf) && activeLeaf.parent) {
      return activeLeaf.parent;
    }

    if (this.isMainWorkspaceLeaf(this.lastMainLeaf) && this.lastMainLeaf.parent) {
      return this.lastMainLeaf.parent;
    }

    let tabGroup = null;
    workspace.iterateAllLeaves((leaf) => {
      if (tabGroup) return;
      if (this.isMainWorkspaceLeaf(leaf) && leaf.parent) {
        tabGroup = leaf.parent;
      }
    });

    if (tabGroup) return tabGroup;

    const rootChildren = workspace.rootSplit?.children || [];
    return rootChildren.find((child) => Array.isArray(child.children) && Number.isInteger(child.currentTab)) || null;
  }

  rememberCurrentMainLeaf() {
    const activeLeaf = this.app.workspace.activeLeaf;
    const editorLeaf = this.app.workspace.activeEditor?.leaf;
    const leaf = this.isMarkdownMainLeaf(activeLeaf) ? activeLeaf : editorLeaf;
    this.rememberMainLeaf(leaf);
    if (this.isMarkdownMainLeaf(leaf)) {
      this.currentMainFilePath = getLeafFilePath(leaf);
    }
  }

  rememberMainLeaf(leaf) {
    if (this.isUsableMainLeaf(leaf)) {
      this.lastMainLeaf = leaf;
    }
  }

}
