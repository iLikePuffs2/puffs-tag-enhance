import { App, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, TAG_SHELF_VIEW_TYPE, TAG_SYSTEM_ICON } from "./models";
import { PuffsTagShelfView } from "./views";
import { PuffsTagEnhanceSettingTab } from "./settings";
import { PersistenceBehavior } from "./persistence";
import { InteractionsBehavior } from "./interactions";
import { WorkspaceBehavior } from "./workspace";
import { TagIndexBehavior } from "./tag-index";
import { TagPaneBehavior } from "./tag-pane";
import { RelationsBehavior } from "./relations";

class PuffsTagEnhancePlugin extends Plugin {
  [key: string]: any;
  constructor(app: App, manifest: ConstructorParameters<typeof Plugin>[1]) {
    super(app, manifest);

    this.settings = { ...DEFAULT_SETTINGS };
    this.tagFileIndex = new Map();
    this.expandedTags = new Set();
    this.collapsedInlineHierarchyBranches = new Set();
    this.inlineHierarchyExpansionVersion = 0;
    this.relationStructureVersion = 0;
    this.selectedNoteOrderTarget = null;
    this.activeTagOrderParent = null;
    this.activeTagOrderSurface = '';
    this.selectedTagOrderTarget = null;
    this.tagOrderModeVisibilityTimer = null;
    this.noteOrderHotkeyScope = null;
    this.viewPatches = new WeakMap();
    this.lastMainLeaf = null;
    this.currentMainFilePath = null;
    this.selectedSidebarViewType = null;
    this.sidebarSwitchRequestId = 0;
    this.activeSidebarSelectionOperation = null;
    this.initialTagIndexRefreshTimers = [];
    this.noteOrderTrackingReady = false;
    this.tagBindingTrackingReady = false;
    this.settingsSavePromise = Promise.resolve();
    this.backupTimer = null;
    this.activeTagRename = null;
    this.tagRenameProtectionTimer = null;
    this.isUnloaded = false;
  }

  async onload() {
    await this.loadSettings();

    this.isUnloaded = false;
    this.restartBackupTimer();
    this.registerView(TAG_SHELF_VIEW_TYPE, (leaf) => new PuffsTagShelfView(leaf, this));
    this.addCommand({
      id: 'open-tag-shelf',
      name: '打开标签系统',
      callback: () => this.openTagShelf(),
    });
    this.addCommand({
      id: 'toggle-tag-sidebar',
      name: '打开或收起标签侧边栏',
      callback: () => this.toggleTagSidebar(),
    });
    await this.migrateTagSidebarHotkeys();
    this.addRibbonIcon(TAG_SYSTEM_ICON, '打开标签系统', () => this.openTagShelf());
    this.refreshTagIndexAndViews();
    this.registerKeyboardHandler();
    this.registerWorkspaceHandlers();
    this.registerMetadataHandlers();
    this.registerInitialMetadataRefresh();
    this.addSettingTab(new PuffsTagEnhanceSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      if (this.isUnloaded) return;
      this.rememberCurrentMainLeaf();
      this.captureSelectedSidebarState();
      this.refreshTagIndexAndViews();
      this.refreshTagViews();
      this.queueInitialTagIndexRefreshes();
      this.applySidebarPreferenceForCurrentFile();
    });

    console.log('Puffs 标签增强: 已加载');
  }

  onunload() {
    this.isUnloaded = true;
    this.deactivateNoteOrderHotkeyScope();
    if (this.tagOrderModeVisibilityTimer) {
      globalThis.clearTimeout(this.tagOrderModeVisibilityTimer);
      this.tagOrderModeVisibilityTimer = null;
    }
    this.clearBackupTimer();
    this.clearInitialTagIndexRefreshTimers();
    this.clearTagRenameProtectionTimer();
    this.restoreAllTagViews();
    console.log('Puffs 标签增强: 已卸载');
  }
}


const applyBehavior = (behavior: Function): void => {
  for (const [name, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(behavior.prototype)
  )) {
    if (name !== "constructor") {
      Object.defineProperty(PuffsTagEnhancePlugin.prototype, name, descriptor);
    }
  }
};

[
  PersistenceBehavior,
  InteractionsBehavior,
  WorkspaceBehavior,
  TagIndexBehavior,
  TagPaneBehavior,
  RelationsBehavior
].forEach(applyBehavior);

export default PuffsTagEnhancePlugin;
