// @ts-nocheck
import { normalizePath } from "obsidian";
import {
  BACKUP_FILE_NAME,
  DEFAULT_MOVE_NOTE_DOWN_HOTKEY,
  DEFAULT_MOVE_NOTE_UP_HOTKEY,
  DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD,
  DEFAULT_SETTINGS,
  getBackupPathParts,
  isNestedTag,
  normalizeBackupFolderPath,
  normalizeBackupFileName,
  normalizeBackupInterval,
  normalizeHierarchySearchKeyword,
  normalizeHotkeyText,
  normalizeNewNotePosition,
  normalizeScrollTopButtonThreshold,
  normalizeTag
} from "./models";
import { normalizeSidebarToolbarButtons } from "./sidebar-toolbar";

export class PersistenceBehavior {
  [key: string]: any;

  async loadSettings() {
    const savedSettings = (await this.loadData()) || {};
    const shouldPersistFixedHierarchyKeyword =
      Object.prototype.hasOwnProperty.call(savedSettings, 'noteHierarchySearchKeyword') &&
      savedSettings.noteHierarchySearchKeyword !== DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);
    this.settings.freezeSearchWhileComposing = this.settings.freezeSearchWhileComposing !== false;
    this.settings.toggleSearchHotkey = normalizeHotkeyText(this.settings.toggleSearchHotkey);
    this.settings.moveNoteUpHotkey = normalizeHotkeyText(
      this.settings.moveNoteUpHotkey,
      DEFAULT_MOVE_NOTE_UP_HOTKEY
    );
    this.settings.moveNoteDownHotkey = normalizeHotkeyText(
      this.settings.moveNoteDownHotkey,
      DEFAULT_MOVE_NOTE_DOWN_HOTKEY
    );
    if (!this.settings.tagSidebarPreferredFiles || typeof this.settings.tagSidebarPreferredFiles !== 'object') {
      this.settings.tagSidebarPreferredFiles = {};
    }
    this.settings.newNotePosition = normalizeNewNotePosition(this.settings.newNotePosition);
    this.settings.noteOrderByTag = this.normalizeNoteOrderByTag(this.settings.noteOrderByTag);
    this.settings.noteDisplayNameByTag = this.normalizeNoteDisplayNameByTag(
      this.settings.noteDisplayNameByTag
    );
    this.settings.tagBoundNoteByTag = this.normalizeTagBoundNoteByTag(
      this.settings.tagBoundNoteByTag
    );
    this.settings.backupIntervalMinutes = normalizeBackupInterval(this.settings.backupIntervalMinutes);
    this.settings.backupFolderPath = normalizeBackupFolderPath(this.settings.backupFolderPath);
    if (savedSettings.backupFileName) {
      const legacyFileName = normalizeBackupFileName(savedSettings.backupFileName);
      const backupPathParts = getBackupPathParts(this.settings.backupFolderPath);
      if (legacyFileName !== BACKUP_FILE_NAME && backupPathParts.fileName === BACKUP_FILE_NAME) {
        this.settings.backupFolderPath = normalizePath(
          backupPathParts.folderPath ? `${backupPathParts.folderPath}/${legacyFileName}` : legacyFileName
        );
      }
    }
    this.settings.scrollTopButtonThreshold = normalizeScrollTopButtonThreshold(
      this.settings.scrollTopButtonThreshold
    );
    this.settings.noteHierarchySearchKeyword = normalizeHierarchySearchKeyword(
      this.settings.noteHierarchySearchKeyword
    );
    this.settings.sidebarToolbarButtons = normalizeSidebarToolbarButtons(
      this.settings.sidebarToolbarButtons
    );
    this.settings.pinnedTag = normalizeTag(this.settings.pinnedTag);
    if (this.settings.pinnedTag && isNestedTag(this.settings.pinnedTag)) {
      this.settings.pinnedTag = null;
    }
    this.normalizeRelationSettings(this.settings.relations);
    delete this.settings.listModeEnabled;
    delete this.settings.tagOrder;
    delete this.settings.backupFileName;
    if (shouldPersistFixedHierarchyKeyword) await this.saveSettings();
  }

  async saveSettings() {
    this.settingsSavePromise = this.settingsSavePromise
      .catch(() => {})
      .then(() => this.saveData(this.settings));
    await this.settingsSavePromise;
  }

  async updateSettings(newSettings) {
    this.settings = Object.assign({}, this.settings, newSettings);
    this.settings.freezeSearchWhileComposing = this.settings.freezeSearchWhileComposing !== false;
    this.settings.toggleSearchHotkey = normalizeHotkeyText(this.settings.toggleSearchHotkey);
    this.settings.moveNoteUpHotkey = normalizeHotkeyText(
      this.settings.moveNoteUpHotkey,
      DEFAULT_MOVE_NOTE_UP_HOTKEY
    );
    this.settings.moveNoteDownHotkey = normalizeHotkeyText(
      this.settings.moveNoteDownHotkey,
      DEFAULT_MOVE_NOTE_DOWN_HOTKEY
    );
    if (!this.settings.tagSidebarPreferredFiles || typeof this.settings.tagSidebarPreferredFiles !== 'object') {
      this.settings.tagSidebarPreferredFiles = {};
    }
    this.settings.newNotePosition = normalizeNewNotePosition(this.settings.newNotePosition);
    this.settings.noteOrderByTag = this.normalizeNoteOrderByTag(this.settings.noteOrderByTag);
    this.settings.noteDisplayNameByTag = this.normalizeNoteDisplayNameByTag(
      this.settings.noteDisplayNameByTag
    );
    this.settings.tagBoundNoteByTag = this.normalizeTagBoundNoteByTag(
      this.settings.tagBoundNoteByTag
    );
    this.settings.backupIntervalMinutes = normalizeBackupInterval(this.settings.backupIntervalMinutes);
    this.settings.backupFolderPath = normalizeBackupFolderPath(this.settings.backupFolderPath);
    this.settings.scrollTopButtonThreshold = normalizeScrollTopButtonThreshold(
      this.settings.scrollTopButtonThreshold
    );
    this.settings.noteHierarchySearchKeyword = normalizeHierarchySearchKeyword(
      this.settings.noteHierarchySearchKeyword
    );
    this.settings.sidebarToolbarButtons = normalizeSidebarToolbarButtons(
      this.settings.sidebarToolbarButtons
    );
    this.settings.pinnedTag = normalizeTag(this.settings.pinnedTag);
    if (this.settings.pinnedTag && isNestedTag(this.settings.pinnedTag)) {
      this.settings.pinnedTag = null;
    }
    this.normalizeRelationSettings(this.settings.relations);
    delete this.settings.tagOrder;
    delete this.settings.backupFileName;
    await this.saveSettings();
    if (
      newSettings &&
      (
        Object.prototype.hasOwnProperty.call(newSettings, 'backupIntervalMinutes') ||
        Object.prototype.hasOwnProperty.call(newSettings, 'backupFolderPath')
      )
    ) {
      this.restartBackupTimer();
    }
    this.refreshTagViewHotkeys();
    if (
      newSettings &&
      (
        Object.prototype.hasOwnProperty.call(newSettings, 'moveNoteUpHotkey') ||
        Object.prototype.hasOwnProperty.call(newSettings, 'moveNoteDownHotkey')
      )
    ) {
      this.refreshNoteOrderHotkeyScope();
    }

    if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, 'autoSwitchToOutlineEnabled')) {
      this.applySidebarPreferenceForCurrentFile();
    }
    if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, 'scrollTopButtonThreshold')) {
      this.refreshTagViews();
      this.refreshTagShelfViews();
    }
    if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, 'sidebarToolbarButtons')) {
      this.refreshTagViews();
    }
    if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, 'noteHierarchySearchKeyword')) {
      this.refreshTagViews();
      this.refreshTagShelfViews();
    }
  }

  clearBackupTimer() {
    if (this.backupTimer === null) return;
    window.clearInterval(this.backupTimer);
    this.backupTimer = null;
  }

  restartBackupTimer() {
    this.clearBackupTimer();
    const intervalMinutes = normalizeBackupInterval(this.settings.backupIntervalMinutes);
    if (intervalMinutes <= 0) return;

    this.backupTimer = window.setInterval(() => {
      this.writeDataBackup().catch((error) => {
        console.error('[Puffs Tag Enhance] 备份插件数据失败:', error);
      });
    }, intervalMinutes * 60 * 1000);
  }

  async ensureBackupFolder(folderPath) {
    if (!folderPath) return;

    const adapter = this.app.vault.adapter;
    let currentPath = '';
    for (const segment of folderPath.split('/')) {
      currentPath = normalizePath(currentPath ? `${currentPath}/${segment}` : segment);
      if (!(await adapter.exists(currentPath))) {
        await adapter.mkdir(currentPath);
      }
    }
  }

  async writeDataBackup() {
    await this.settingsSavePromise.catch(() => {});

    const { folderPath, fileName } = getBackupPathParts(this.settings.backupFolderPath);
    await this.ensureBackupFolder(folderPath);
    const backupPath = normalizePath(
      folderPath ? `${folderPath}/${fileName}` : fileName
    );
    const data = (await this.loadData()) || this.settings;
    await this.app.vault.adapter.write(backupPath, `${JSON.stringify(data, null, 2)}\n`);
    return backupPath;
  }

  normalizeNoteOrderByTag(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    const result = {};
    for (const [rawTag, rawPaths] of Object.entries(value)) {
      const tag = normalizeTag(rawTag);
      if (!tag || !Array.isArray(rawPaths)) continue;

      const seen = new Set();
      const paths = [];
      for (const rawPath of rawPaths) {
        const path = typeof rawPath === 'string' ? rawPath.trim() : '';
        if (!path || seen.has(path)) continue;
        seen.add(path);
        paths.push(path);
      }

      if (paths.length > 0) result[tag] = paths;
    }

    return result;
  }

  normalizeNoteDisplayNameByTag(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    const result = {};
    for (const [rawTag, rawEntries] of Object.entries(value)) {
      const tag = normalizeTag(rawTag);
      if (
        !tag ||
        isNestedTag(tag) ||
        !rawEntries ||
        typeof rawEntries !== 'object' ||
        Array.isArray(rawEntries)
      ) {
        continue;
      }

      const entries = {};
      for (const [rawPath, rawDisplayName] of Object.entries(rawEntries)) {
        const path = typeof rawPath === 'string' ? rawPath.trim() : '';
        const displayName = typeof rawDisplayName === 'string' ? rawDisplayName.trim() : '';
        if (!path || !displayName) continue;
        entries[path] = displayName;
      }

      if (Object.keys(entries).length > 0) result[tag] = entries;
    }

    return result;
  }

  normalizeTagBoundNoteByTag(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    const result = {};
    for (const [rawTag, rawPath] of Object.entries(value)) {
      const tag = normalizeTag(rawTag);
      const path = typeof rawPath === 'string' ? rawPath.trim() : '';
      if (!tag || !path || Object.prototype.hasOwnProperty.call(result, tag)) continue;

      const file = this.app?.vault?.getAbstractFileByPath?.(path);
      if (!file || file.extension !== 'md') continue;
      result[tag] = path;
    }

    return result;
  }

}
