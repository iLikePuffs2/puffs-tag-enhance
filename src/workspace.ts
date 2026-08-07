import * as obsidian from "obsidian";
import { Notice, TFile } from "obsidian";
import {
  DEFAULT_MOVE_NOTE_DOWN_HOTKEY,
  DEFAULT_MOVE_NOTE_UP_HOTKEY,
  MARKDOWN_VIEW_TYPE,
  OUTLINE_VIEW_TYPE,
  TAG_SIDEBAR_VIEW_TYPE,
  formatHotkey,
  getLeafFilePath,
  normalizeTag,
  parseCurrentNoteTagSearch,
  parseHotkeyText
} from "./models";
import { readPreferredFiles } from "./data/schema";

const LEGACY_TAG_SIDEBAR_COMMAND_ID = 'puffs-immersive-mode:toggle-tag-sidebar';

export class WorkspaceBehavior {
  [key: string]: any;


  followsCurrentNote(searchValue: any) {
    return this.getHierarchySearchContext(searchValue).mode === 'current-note'
      || parseCurrentNoteTagSearch(searchValue).matched;
  }

  refreshCurrentNoteSearchViews() {
    for (const view of this.getSidebarViews()) {
      if (!this.followsCurrentNote(this.getTagSearchValue(view))) continue;
      view.requestRender();
    }
  }

  updateCurrentMainFilePath(filePath: any) {
    const nextPath = filePath || null;
    if (nextPath === this.currentMainFilePath) return false;
    this.currentMainFilePath = nextPath;
    this.refreshCurrentNoteSearchViews();
    return true;
  }

  handleWorkspaceFileOpen(_file: any) {
    const editorLeaf = this.app.workspace.activeEditor?.leaf;
    if (!this.isMarkdownMainLeaf(editorLeaf)) return;
    this.rememberMainLeaf(editorLeaf);
    const filePath = getLeafFilePath(editorLeaf);
    if (!filePath) return;
    if (this.updateCurrentMainFilePath(filePath)) this.applySidebarPreferenceForCurrentFile();
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



  isNoteOrderSearchControl(target: any) {
    if (!(target instanceof Element)) return false;
    return !!target.closest('.puffs-tag-sidebar-search-host');
  }

  isTagSidebarScrollbarPointer(evt: any, target: any) {
    if (!(target instanceof Element)) return false;

    const scrollEl: any = target.closest(
      '.workspace-leaf-content[data-type="puffs-tag-sidebar"] .tag-container'
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
    this.keydownHandler = (evt: any) => {
      if (this.handleSidebarQuickSearchHotkey(evt)) return;
      this.handleHierarchyNavigationHotkey(evt);
    };

    // 必须早于 Obsidian 在 document 上的快捷键与历史导航处理器执行；否则原生
    // Ctrl+F / Alt+方向键会先消费事件。只在 window 注册一次，避免重复处理。
    window.addEventListener('keydown', this.keydownHandler, true);
    this.pointerdownHandler = (evt: any) => {
      if (!this.selectedNoteOrderTarget) return;
      const target = evt.target instanceof Element ? evt.target : null;
      if (target && target.closest('.puffs-tag-note-order-button')) return;
      if (target && target.closest('.puffs-tag-scroll-top-button')) return;
      if (target && target.closest('.puffs-tag-scroll-bottom-button')) return;
      if (this.isNoteOrderSearchControl(target)) return;
      if (this.isTagSidebarScrollbarPointer(evt, target)) return;
      if (evt.button === 2 && target && target.closest('.puffs-tag-note-card')) return;
      this.clearOrderTarget();
    };
    document.addEventListener('pointerdown', this.pointerdownHandler, true);

    this.noteOrderContextMenuHandler = (evt: any) => {
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
        this.moveSelectedHierarchyNoteAfter(targetHierarchyParent, targetPath).catch((error: any) => {
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
      this.moveSelectedNoteAfter(targetTag, targetPath).catch((error: any) => {
        console.error('[Puffs Tag Enhance] Failed to move selected note after target:', error);
        new Notice('调整笔记顺序失败');
      });
    };
    document.addEventListener('contextmenu', this.noteOrderContextMenuHandler, true);

    this.register(() => {
      window.removeEventListener('keydown', this.keydownHandler, true);
      document.removeEventListener('pointerdown', this.pointerdownHandler, true);
      document.removeEventListener('contextmenu', this.noteOrderContextMenuHandler, true);
      this.keydownHandler = null;
      this.pointerdownHandler = null;
      this.noteOrderContextMenuHandler = null;
    });
  }

  getSidebarViewForKeyboardEvent(evt: any) {
    const eventTarget = evt?.target;
    const viewFromTarget = eventTarget && this.getSidebarViews().find((view: any) =>
      view.containerEl?.contains?.(eventTarget)
    );
    return viewFromTarget || this.getFocusedSidebarView();
  }

  handleSidebarQuickSearchHotkey(evt: any) {
    if (!this.isQuickSearchHotkey(evt)) return false;
    const view = this.getSidebarViewForKeyboardEvent(evt);
    if (!view) return false;
    evt.preventDefault();
    evt.stopPropagation();
    evt.stopImmediatePropagation();
    view.handleQuickSearchHotkey();
    return true;
  }

  getActiveHierarchyNavigationSurface(evt?: any) {
    const sidebarView = this.getSidebarViewForKeyboardEvent(evt);
    if (sidebarView) return { view: sidebarView, surface: 'sidebar' };

    return null;
  }

  handleHierarchyNavigationHotkey(evt: any) {
    if (
      !evt.altKey || evt.ctrlKey || evt.metaKey || evt.shiftKey ||
      (evt.key !== 'ArrowLeft' && evt.key !== 'ArrowRight')
    ) return false;
    const target = this.getActiveHierarchyNavigationSurface(evt);
    if (!target) return false;
    const history = this.getHierarchyNavigationHistory(target.view, target.surface);
    const direction = evt.key === 'ArrowLeft' ? -1 : 1;
    const nextIndex = history.index + direction;
    if (history.entries.length < 2 || nextIndex < 0 || nextIndex >= history.entries.length) return false;
    evt.preventDefault();
    evt.stopPropagation();
    evt.stopImmediatePropagation();
    this.navigateHierarchyHistory(target.view, target.surface, direction);
    return true;
  }

  eventMatchesHotkey(evt: any, hotkey: any) {
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

  isQuickSearchHotkey(evt: any) {
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

  handleActiveLeafChange(leaf: any) {
    if (this.isMarkdownMainLeaf(leaf)) {
      const filePath = getLeafFilePath(leaf);
      const filePathChanged = filePath !== this.currentMainFilePath;
      this.rememberMainLeaf(leaf);
      this.updateCurrentMainFilePath(filePath);
      if (filePathChanged) {
        this.applySidebarPreferenceForCurrentFile();
      }
      return;
    }

    if (this.isManagedSidebarLeaf(leaf)) {
      this.handleSidebarSelection(leaf);
    }
  }

  isMarkdownMainLeaf(leaf: any) {
    return this.isMainWorkspaceLeaf(leaf) && leaf.view && leaf.view.getViewType() === MARKDOWN_VIEW_TYPE;
  }

  isManagedSidebarLeaf(leaf: any) {
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

  handleSidebarSelection(leaf: any) {
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

    if (viewType === TAG_SIDEBAR_VIEW_TYPE) {
      this.setTagSidebarPreference(this.currentMainFilePath, true);
    } else if (previousViewType === TAG_SIDEBAR_VIEW_TYPE) {
      this.setTagSidebarPreference(this.currentMainFilePath, false);
    }
  }

  /** 偏好以路径数组保存；readPreferredFiles 同时兼容迁移前的对象形态。 */
  getPreferredFileSet() {
    return readPreferredFiles(this.settings.tagSidebarPreferredFiles);
  }

  async setTagSidebarPreference(filePath: any, enabled: any) {
    if (!filePath) return;

    const preferred = this.getPreferredFileSet();
    if (enabled === preferred.has(filePath)) return;

    if (enabled) preferred.add(filePath);
    else preferred.delete(filePath);

    this.settings.tagSidebarPreferredFiles = Array.from(preferred);
    await this.saveSettings();
  }

  hasTagSidebarPreference(filePath: any) {
    return !!filePath && this.getPreferredFileSet().has(filePath);
  }

  applySidebarPreferenceForCurrentFile() {
    const requestId = ++this.sidebarSwitchRequestId;
    const filePath = this.currentMainFilePath;
    if (!this.settings.autoSwitchToOutlineEnabled || !filePath) return;

    const targetViewType = this.hasTagSidebarPreference(filePath)
      ? TAG_SIDEBAR_VIEW_TYPE
      : OUTLINE_VIEW_TYPE;
    this.switchManagedSidebarTo(requestId, filePath, targetViewType).catch((error) => {
      console.error('[Puffs Tag Enhance] Failed to switch sidebar for current file:', error);
    });
  }

  async switchManagedSidebarTo(requestId: any, filePath: any, viewType: any) {
    const leaf = await this.getOrCreateManagedSidebarLeaf(viewType);
    if (this.isUnloaded) return;
    if (requestId !== this.sidebarSwitchRequestId) return;
    if (filePath !== this.currentMainFilePath) return;
    if (!this.settings.autoSwitchToOutlineEnabled) return;

    const currentTargetViewType = this.hasTagSidebarPreference(filePath)
      ? TAG_SIDEBAR_VIEW_TYPE
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

  async getOrCreateManagedSidebarLeaf(viewType: any) {
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

  findManagedSidebarLeaf(viewType: any) {
    return this.app.workspace.getLeavesOfType(viewType).find((leaf: any) => this.isManagedSidebarLeaf(leaf)) || null;
  }

  getSelectedManagedSidebarLeaf() {
    const group = this.findManagedSidebarTabGroup();
    if (!group || !Array.isArray(group.children) || !Number.isInteger(group.currentTab)) return null;

    const leaf = group.children[group.currentTab];
    return this.isManagedSidebarLeaf(leaf) ? leaf : null;
  }

  findManagedSidebarTabGroup() {
    const tagLeaf = this.findManagedSidebarLeaf(TAG_SIDEBAR_VIEW_TYPE);
    if (tagLeaf && tagLeaf.parent) return tagLeaf.parent;

    const outlineLeaf = this.findManagedSidebarLeaf(OUTLINE_VIEW_TYPE);
    if (outlineLeaf && outlineLeaf.parent) return outlineLeaf.parent;

    return null;
  }

  handlePreferredFileRename(file: any, oldPath: any) {
    if (!oldPath || !file || !file.path) return;
    const preferred = this.getPreferredFileSet();
    if (!preferred.has(oldPath)) return;

    preferred.delete(oldPath);
    preferred.add(file.path);
    this.settings.tagSidebarPreferredFiles = Array.from(preferred);

    if (this.currentMainFilePath === oldPath) {
      this.updateCurrentMainFilePath(file.path);
    }

    this.saveSettings();
  }

  handlePreferredFileDelete(file: any) {
    if (!file || !file.path) return;
    const preferred = this.getPreferredFileSet();
    if (!preferred.has(file.path)) return;

    preferred.delete(file.path);
    this.settings.tagSidebarPreferredFiles = Array.from(preferred);
    if (this.currentMainFilePath === file.path) {
      this.updateCurrentMainFilePath(null);
    }

    this.saveSettings();
  }

  handleNoteOrderFileRename(file: any, oldPath: any) {
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
      this.saveSettings().catch((error: any) => {
        console.error('[Puffs Tag Enhance] Failed to update note order after rename:', error);
      });
    }
  }

  handleNoteOrderFileDelete(file: any) {
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
      this.saveSettings().catch((error: any) => {
        console.error('[Puffs Tag Enhance] Failed to update note order after delete:', error);
      });
    }
  }

  handleNoteDisplayNameFileRename(file: any, oldPath: any) {
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
    for (const [tag, entries] of Object.entries<any>(this.settings.noteDisplayNameByTag)) {
      if (!entries || typeof entries !== 'object' || !entries[oldPath]) continue;

      if (!entries[file.path]) entries[file.path] = entries[oldPath];
      delete entries[oldPath];
      if (Object.keys(entries).length === 0) delete this.settings.noteDisplayNameByTag[tag];
      changed = true;
    }

    if (changed) {
      this.saveSettings().catch((error: any) => {
        console.error('[Puffs Tag Enhance] Failed to update note display name after rename:', error);
      });
    }
  }

  handleNoteDisplayNameFileDelete(file: any) {
    if (
      !(file instanceof TFile) ||
      file.extension !== 'md' ||
      !file.path ||
      !this.settings.noteDisplayNameByTag
    ) {
      return;
    }

    let changed = false;
    for (const [tag, entries] of Object.entries<any>(this.settings.noteDisplayNameByTag)) {
      if (!entries || typeof entries !== 'object' || !entries[file.path]) continue;

      delete entries[file.path];
      if (Object.keys(entries).length === 0) delete this.settings.noteDisplayNameByTag[tag];
      changed = true;
    }

    if (changed) {
      this.saveSettings().catch((error: any) => {
        console.error('[Puffs Tag Enhance] Failed to remove note display name after delete:', error);
      });
    }
  }


  async openNoteCard(cardEl: any) {
    const path = cardEl.dataset.path;
    if (!path) return;

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`未找到笔记：${path}`);
      return;
    }

    await this.openFileInMainWorkspace(file);
  }

  async openFileInMainWorkspace(file: any) {
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

  findOpenMainLeaf(filePath: any) {
    let foundLeaf: any = null;

    this.app.workspace.iterateAllLeaves((leaf: any) => {
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

    let bestLeaf: any = null;
    this.app.workspace.iterateAllLeaves((leaf: any) => {
      if (!this.isUsableMainLeaf(leaf)) return;

      if (!bestLeaf || (bestLeaf.activeTime || 0) < (leaf.activeTime || 0)) {
        bestLeaf = leaf;
      }
    });

    if (bestLeaf) return bestLeaf;

    return this.createMainWorkspaceLeaf();
  }

  isUsableMainLeaf(leaf: any) {
    if (!this.isMainWorkspaceLeaf(leaf)) return false;
    return true;
  }

  isMainWorkspaceLeaf(leaf: any) {
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

    let tabGroup: any = null;
    workspace.iterateAllLeaves((leaf: any) => {
      if (tabGroup) return;
      if (this.isMainWorkspaceLeaf(leaf) && leaf.parent) {
        tabGroup = leaf.parent;
      }
    });

    if (tabGroup) return tabGroup;

    const rootChildren = workspace.rootSplit?.children || [];
    return rootChildren.find((child: any) => Array.isArray(child.children) && Number.isInteger(child.currentTab)) || null;
  }

  rememberCurrentMainLeaf() {
    const activeLeaf = this.app.workspace.activeLeaf;
    const editorLeaf = this.app.workspace.activeEditor?.leaf;
    let leaf = this.isMarkdownMainLeaf(activeLeaf) ? activeLeaf : editorLeaf;
    if (!this.isMarkdownMainLeaf(leaf)) {
      this.app.workspace.iterateAllLeaves((candidate: any) => {
        if (!this.isMarkdownMainLeaf(candidate)) return;
        if (!leaf || (leaf.activeTime || 0) < (candidate.activeTime || 0)) leaf = candidate;
      });
    }
    this.rememberMainLeaf(leaf);
    if (this.isMarkdownMainLeaf(leaf)) {
      this.updateCurrentMainFilePath(getLeafFilePath(leaf));
    }
  }

  rememberMainLeaf(leaf: any) {
    if (this.isUsableMainLeaf(leaf)) {
      this.lastMainLeaf = leaf;
    }
  }

}
