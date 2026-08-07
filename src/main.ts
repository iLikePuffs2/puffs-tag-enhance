import { App, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, TAG_SIDEBAR_VIEW_TYPE } from "./models";
import { MetadataRefreshScheduler, TagBrowseCache } from "./data/tag-store";
import { PuffsTagSidebarView } from "./view/tag-sidebar-view";
import { SidebarRegistryBehavior } from "./view/sidebar-registry";
import { TagTreeRendererBehavior } from "./view/tag-tree-renderer";
import { ContextMenusBehavior } from "./view/context-menus";
import { OrderControllerBehavior } from "./view/order-controller";
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
    // 数据层：标签浏览数据的批次缓存，失效点见 data/tag-store.ts 的说明
    this.tagBrowseCache = new TagBrowseCache();
    this.metadataRefreshScheduler = new MetadataRefreshScheduler(
      (changedPaths) => this.runScheduledMetadataRefresh(changedPaths)
    );
    this.expandedTags = new Set();
    this.collapsedInlineHierarchyBranches = new Set();
    this.inlineHierarchyExpansionVersion = 0;
    this.relationStructureVersion = 0;
    this.selectedNoteOrderTarget = null;
    this.noteOrderHotkeyScope = null;
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
    this.registerView(TAG_SIDEBAR_VIEW_TYPE, (leaf) => new PuffsTagSidebarView(leaf, this));
    this.addCommand({
      id: 'toggle-tag-sidebar',
      name: '打开或收起标签侧边栏',
      callback: () => this.toggleTagSidebar(),
    });
    await this.migrateTagSidebarHotkeys();
    this.refreshTagIndexAndViews();
    this.registerKeyboardHandler();
    this.registerWorkspaceHandlers();
    this.registerMetadataHandlers();
    this.registerInitialMetadataRefresh();
    this.addSettingTab(new PuffsTagEnhanceSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(async () => {
      if (this.isUnloaded) return;
      // 先把核心插件的标签页换成自绘视图，再做其余初始化
      await this.migrateSidebarLayout();
      if (this.isUnloaded) return;
      this.rememberCurrentMainLeaf();
      this.captureSelectedSidebarState();
      this.refreshTagIndexAndViews();
      this.queueInitialTagIndexRefreshes();
      this.applySidebarPreferenceForCurrentFile();
    });

    console.log('Puffs 标签增强: 已加载');
  }

  onunload() {
    this.isUnloaded = true;
    this.metadataRefreshScheduler.cancel();
    this.tagBrowseCache.invalidate();
    this.deactivateNoteOrderHotkeyScope();
    this.clearBackupTimer();
    this.clearInitialTagIndexRefreshTimers();
    this.clearTagRenameProtectionTimer();
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
  RelationsBehavior,
  SidebarRegistryBehavior,
  TagTreeRendererBehavior,
  ContextMenusBehavior,
  OrderControllerBehavior
].forEach(applyBehavior);

export default PuffsTagEnhancePlugin;
