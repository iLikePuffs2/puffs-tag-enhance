'use strict';

const obsidian = require('obsidian');

const {
  Plugin,
  PluginSettingTab,
  Setting,
  Modal,
  TFile,
  Notice,
  getAllTags,
  setIcon,
} = obsidian;

const STYLE_ID = 'puffs-tag-enhance-style';
const TAG_VIEW_TYPE = 'tag';
const OUTLINE_VIEW_TYPE = 'outline';
const MARKDOWN_VIEW_TYPE = 'markdown';
const VIEW_SYNC_DELAY_MS = 30;
const DEFAULT_QUICK_SEARCH_HOTKEY = 'Ctrl + F';
const LIST_MODE_ICON = 'list-tree';
const INITIAL_TAG_INDEX_REFRESH_DELAYS_MS = [0, 500, 1500, 3000, 6000];

const DEFAULT_SETTINGS = {
  listModeEnabled: false,
  autoSwitchToOutlineEnabled: true,
  tagSidebarPreferredFiles: {},
  toggleSearchHotkey: DEFAULT_QUICK_SEARCH_HOTKEY,
};

function normalizeTag(rawTag) {
  if (!rawTag) return null;

  const tag = String(rawTag).trim();
  if (!tag) return null;

  return tag.startsWith('#') ? tag : `#${tag}`;
}

function isNestedTag(tag) {
  return String(tag || '').includes('/');
}

function getTagDisplayName(tag) {
  return String(tag || '').replace(/^#/, '');
}

function normalizeSearchTerm(value) {
  return String(value || '').trim().replace(/^#/, '').toLowerCase();
}

function splitUnionSearchTerms(value) {
  const text = String(value || '');
  if (!text.includes('|') || text.includes('&')) return null;

  const terms = text
    .split('|')
    .map(normalizeSearchTerm)
    .filter(Boolean);

  return terms.length > 0 ? Array.from(new Set(terms)) : null;
}

function splitIntersectionSearchTerms(value) {
  const text = String(value || '');
  if (!text.includes('&') || text.includes('|')) return null;

  const terms = text
    .split('&')
    .map(normalizeSearchTerm)
    .filter(Boolean);

  return terms.length >= 2 ? terms : null;
}

function tagMatchesAnySearchTerm(tag, terms) {
  if (!terms) return true;

  const tagName = getTagDisplayName(tag).toLowerCase();
  const tagText = String(tag || '').toLowerCase();
  return terms.some((term) => tagName.includes(term) || tagText.includes(term));
}

function tagMatchesSearchText(tag, value) {
  const term = String(value || '').trim().replace(/^#/, '').toLowerCase();
  if (!term) return true;

  const tagName = getTagDisplayName(tag).toLowerCase();
  const tagText = String(tag || '').toLowerCase();
  return tagName.includes(term) || tagText.includes(term);
}

function createMultiTagSearchQuery(query, terms) {
  return {
    query,
    matcher: true,
    matchContent: (content) => tagMatchesAnySearchTerm(content, terms),
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceInlineTagsByCache(content, cache, oldTag, newTag) {
  const inlineTags = Array.isArray(cache && cache.tags) ? cache.tags : [];
  const replacements = [];

  for (const tagEntry of inlineTags) {
    if (normalizeTag(tagEntry && tagEntry.tag) !== oldTag) continue;

    const start = tagEntry.position && tagEntry.position.start && tagEntry.position.start.offset;
    const end = tagEntry.position && tagEntry.position.end && tagEntry.position.end.offset;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) continue;
    if (normalizeTag(content.slice(start, end)) !== oldTag) continue;

    replacements.push({ start, end });
  }

  if (replacements.length === 0) return content;

  let nextContent = content;
  replacements.sort((a, b) => b.start - a.start);

  for (const replacement of replacements) {
    nextContent =
      nextContent.slice(0, replacement.start) +
      newTag +
      nextContent.slice(replacement.end);
  }

  return nextContent;
}

function replaceInlineTagsByText(content, oldTag, newTag) {
  const oldName = escapeRegExp(getTagDisplayName(oldTag));
  const tagPattern = new RegExp(`(^|[^\\p{L}\\p{N}_/#-])#${oldName}(?![\\p{L}\\p{N}_/-])`, 'gu');
  return content.replace(tagPattern, (match, prefix) => `${prefix}${newTag}`);
}

function getFrontmatterTagReplacement(originalValue, newTag) {
  const text = String(originalValue);
  return text.trim().startsWith('#') ? newTag : getTagDisplayName(newTag);
}

function replaceFrontmatterTagString(value, oldTag, newTag) {
  const parts = String(value).split(/([,\s]+)/);
  let changed = false;

  const nextParts = parts.map((part) => {
    if (!part || /^[,\s]+$/.test(part)) return part;
    if (normalizeTag(part) !== oldTag) return part;

    changed = true;
    return getFrontmatterTagReplacement(part, newTag);
  });

  return changed ? nextParts.join('') : value;
}

function replaceFrontmatterTagValue(value, oldTag, newTag) {
  if (Array.isArray(value)) {
    return value.map((item) => replaceFrontmatterTagValue(item, oldTag, newTag));
  }

  if (typeof value === 'string') {
    return replaceFrontmatterTagString(value, oldTag, newTag);
  }

  if (value != null && normalizeTag(value) === oldTag) {
    return getTagDisplayName(newTag);
  }

  return value;
}

function getLeafFilePath(leaf) {
  if (!leaf) return null;

  const viewFile = leaf.view && leaf.view.file;
  if (viewFile && viewFile.path) return viewFile.path;

  const viewState = leaf.getViewState ? leaf.getViewState() : null;
  const stateFile = viewState && viewState.state && viewState.state.file;
  return typeof stateFile === 'string' ? stateFile : null;
}

function flattenFrontmatterTags(value, output = []) {
  if (!value) return output;

  if (Array.isArray(value)) {
    for (const item of value) {
      flattenFrontmatterTags(item, output);
    }
    return output;
  }

  if (typeof value === 'string') {
    for (const tag of value.split(/[\s,]+/)) {
      if (tag) output.push(tag);
    }
    return output;
  }

  output.push(String(value));
  return output;
}

function parseHotkeyText(value) {
  const text = String(value || DEFAULT_QUICK_SEARCH_HOTKEY).trim();
  const parts = text.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return parseHotkeyText(DEFAULT_QUICK_SEARCH_HOTKEY);

  const key = parts.pop();
  const modifiers = [];

  for (const part of parts) {
    const normalized = part.toLowerCase();

    if (normalized === 'ctrl' || normalized === 'control') {
      modifiers.push('Ctrl');
    } else if (normalized === 'cmd' || normalized === 'command' || normalized === 'meta') {
      modifiers.push('Meta');
    } else if (normalized === 'mod') {
      modifiers.push('Mod');
    } else if (normalized === 'shift') {
      modifiers.push('Shift');
    } else if (normalized === 'alt' || normalized === 'option') {
      modifiers.push('Alt');
    }
  }

  if (!key) return parseHotkeyText(DEFAULT_QUICK_SEARCH_HOTKEY);

  const normalizedKey = key.length === 1 ? key.toUpperCase() : key;
  return {
    modifiers: Array.from(new Set(modifiers)),
    key: normalizedKey,
  };
}

function formatHotkey(parsedHotkey) {
  return [...parsedHotkey.modifiers, parsedHotkey.key].join(' + ');
}

function normalizeHotkeyText(value) {
  return formatHotkey(parseHotkeyText(value));
}

class PuffsTagEnhancePlugin extends Plugin {
  constructor(app, manifest) {
    super(app, manifest);

    this.settings = { ...DEFAULT_SETTINGS };
    this.tagFileIndex = new Map();
    this.expandedTags = new Set();
    this.viewPatches = new WeakMap();
    this.lastMainLeaf = null;
    this.currentMainFilePath = null;
    this.selectedSidebarViewType = null;
    this.sidebarSwitchGuardUntil = 0;
    this.initialTagIndexRefreshTimers = [];
    this.isUnloaded = false;
  }

  async onload() {
    await this.loadSettings();

    this.isUnloaded = false;
    this.injectStyle();
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
    this.clearInitialTagIndexRefreshTimers();
    this.restoreAllTagViews();
    this.removeStyle();
    console.log('Puffs 标签增强: 已卸载');
  }

  async loadSettings() {
    const savedSettings = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);
    this.settings.toggleSearchHotkey = normalizeHotkeyText(this.settings.toggleSearchHotkey);
    if (!this.settings.tagSidebarPreferredFiles || typeof this.settings.tagSidebarPreferredFiles !== 'object') {
      this.settings.tagSidebarPreferredFiles = {};
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async updateSettings(newSettings) {
    this.settings = Object.assign({}, this.settings, newSettings);
    this.settings.toggleSearchHotkey = normalizeHotkeyText(this.settings.toggleSearchHotkey);
    if (!this.settings.tagSidebarPreferredFiles || typeof this.settings.tagSidebarPreferredFiles !== 'object') {
      this.settings.tagSidebarPreferredFiles = {};
    }
    await this.saveSettings();
    this.refreshTagViewHotkeys();

    if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, 'autoSwitchToOutlineEnabled')) {
      this.applySidebarPreferenceForCurrentFile();
    }
  }

  injectStyle() {
    this.removeStyle();

    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = `
.puffs-tag-note-list {
  min-height: unset !important;
  overflow: visible !important;
}

.workspace-leaf-content.puffs-tag-list-mode-enabled .tag-container > :not(.puffs-tag-list-container) {
  display: none !important;
}

.puffs-tag-list-container {
  min-height: 100%;
  padding-bottom: 8px;
}

.puffs-tag-note-card {
  cursor: pointer;
}

.puffs-tag-note-card .tree-item-inner-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.puffs-tag-hidden {
  display: none !important;
}

.clickable-icon.nav-action-button.puffs-tag-mode-button {
}

.modal-container .puffs-tag-rename-modal {
  width: 560px;
  max-width: calc(100vw - 32px);
}

.puffs-tag-rename-modal .modal-close-button,
.puffs-tag-rename-modal .modal-header {
  display: none !important;
}

.puffs-tag-rename-modal .modal-content {
  padding-top: 0 !important;
  margin-top: 0 !important;
}

.puffs-tag-rename-title {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-normal);
}

.puffs-tag-rename-input {
  width: 100%;
  height: 32px;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--text-muted) 24%, transparent);
  border-radius: 4px;
  outline: none;
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 14px;
}

.puffs-tag-rename-input:focus {
  border-color: var(--interactive-accent);
}
`;
    document.head.appendChild(styleEl);
  }

  removeStyle() {
    const styleEl = document.getElementById(STYLE_ID);
    if (styleEl) styleEl.remove();
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
    this.register(() => {
      document.removeEventListener('keydown', this.keydownHandler, true);
      this.keydownHandler = null;
    });
  }

  isQuickSearchHotkey(evt) {
    const hotkey = this.getQuickSearchHotkey();
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

  getQuickSearchHotkey() {
    return parseHotkeyText(this.settings.toggleSearchHotkey);
  }

  getQuickSearchHotkeyDisplay() {
    return formatHotkey(this.getQuickSearchHotkey());
  }

  handleActiveLeafChange(leaf) {
    if (this.isMarkdownMainLeaf(leaf)) {
      const filePath = getLeafFilePath(leaf);
      const filePathChanged = filePath !== this.currentMainFilePath;
      this.rememberMainLeaf(leaf);
      this.currentMainFilePath = filePath;
      if (filePathChanged && !this.isSidebarAutoSwitchGuarded()) {
        this.applySidebarPreferenceForCurrentFile();
      }
      return;
    }

    if (this.isManagedSidebarLeaf(leaf)) {
      this.handleSidebarSelection(leaf.view.getViewType());
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

    this.handleSidebarSelection(leaf.view.getViewType());
  }

  handleSidebarSelection(viewType) {
    if (!viewType || viewType === this.selectedSidebarViewType) return;

    const previousViewType = this.selectedSidebarViewType;
    this.selectedSidebarViewType = viewType;

    if (!this.settings.autoSwitchToOutlineEnabled || this.isSidebarAutoSwitchGuarded()) return;

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
    if (!this.settings.autoSwitchToOutlineEnabled || !this.currentMainFilePath) return;

    const targetViewType = this.hasTagSidebarPreference(this.currentMainFilePath)
      ? TAG_VIEW_TYPE
      : OUTLINE_VIEW_TYPE;
    this.switchManagedSidebarTo(targetViewType);
  }

  async switchManagedSidebarTo(viewType) {
    const mainLeaf = this.lastMainLeaf;
    const leaf = await this.getOrCreateManagedSidebarLeaf(viewType);
    if (!leaf || !leaf.parent || typeof leaf.parent.selectTab !== 'function') return;

    this.withSidebarAutoSwitchGuard(() => {
      leaf.parent.selectTab(leaf);
      this.selectedSidebarViewType = viewType;

      if (this.isUsableMainLeaf(mainLeaf)) {
        this.app.workspace.setActiveLeaf(mainLeaf, { focus: true });
      }
    });
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

  withSidebarAutoSwitchGuard(callback) {
    this.sidebarSwitchGuardUntil = Date.now() + 300;
    try {
      callback();
    } finally {
      window.setTimeout(() => {
        if (Date.now() >= this.sidebarSwitchGuardUntil) {
          this.sidebarSwitchGuardUntil = 0;
        }
      }, 320);
    }
  }

  isSidebarAutoSwitchGuarded() {
    return Date.now() < this.sidebarSwitchGuardUntil;
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

  registerWorkspaceHandlers() {
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        this.handleActiveLeafChange(leaf);
        if (leaf && leaf.view && leaf.view.getViewType() === TAG_VIEW_TYPE) {
          this.scheduleFocusTagSearch(leaf.view);
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.syncSelectedSidebarState();
        this.refreshTagViews();
      })
    );
  }

  registerMetadataHandlers() {
    const scheduleRefresh = () => this.scheduleMetadataRefresh();

    this.registerEvent(this.app.metadataCache.on('changed', scheduleRefresh));
    this.registerEvent(this.app.metadataCache.on('deleted', scheduleRefresh));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.handlePreferredFileRename(file, oldPath);
      scheduleRefresh();
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      this.handlePreferredFileDelete(file);
      scheduleRefresh();
    }));
  }

  registerInitialMetadataRefresh() {
    const metadataCache = this.app.metadataCache;
    if (!metadataCache || typeof metadataCache.onCleanCache !== 'function') return;

    metadataCache.onCleanCache(() => {
      if (this.isUnloaded) return;

      this.refreshTagIndexAndViews();
      this.queueInitialTagIndexRefreshes();
    });
  }

  scheduleMetadataRefresh() {
    this.refreshTagIndexAndViews();
  }

  refreshTagIndexAndViews() {
    if (this.isUnloaded) return;

    this.rebuildTagFileIndex();
    this.refreshTagViews();
  }

  queueInitialTagIndexRefreshes() {
    this.clearInitialTagIndexRefreshTimers();

    for (const delay of INITIAL_TAG_INDEX_REFRESH_DELAYS_MS) {
      const timer = window.setTimeout(() => {
        this.initialTagIndexRefreshTimers = this.initialTagIndexRefreshTimers.filter((item) => item !== timer);
        this.refreshTagIndexAndViews();
      }, delay);

      this.initialTagIndexRefreshTimers.push(timer);
    }
  }

  clearInitialTagIndexRefreshTimers() {
    for (const timer of this.initialTagIndexRefreshTimers) {
      window.clearTimeout(timer);
    }

    this.initialTagIndexRefreshTimers = [];
  }

  rebuildTagFileIndex() {
    const nextIndex = new Map();

    for (const file of this.app.vault.getMarkdownFiles()) {
      const tags = this.getExactTagsForFile(file);

      for (const tag of tags) {
        if (!nextIndex.has(tag)) nextIndex.set(tag, []);
        nextIndex.get(tag).push(file);
      }
    }

    for (const files of nextIndex.values()) {
      files.sort((a, b) => {
        const byName = a.basename.localeCompare(b.basename, 'zh-Hans-CN');
        return byName || a.path.localeCompare(b.path, 'zh-Hans-CN');
      });
    }

    this.tagFileIndex = nextIndex;
    this.reconcileExpandedTags();
  }

  getExactTagsForFile(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return new Set();

    const tags = new Set();
    const allTags = typeof getAllTags === 'function' ? getAllTags(cache) : null;

    if (Array.isArray(allTags)) {
      for (const rawTag of allTags) {
        const tag = normalizeTag(rawTag);
        if (tag) tags.add(tag);
      }
    } else {
      if (Array.isArray(cache.tags)) {
        for (const rawTag of cache.tags) {
          const tag = normalizeTag(rawTag && rawTag.tag);
          if (tag) tags.add(tag);
        }
      }

      const frontmatterTags = flattenFrontmatterTags(cache.frontmatter && cache.frontmatter.tags);
      for (const rawTag of frontmatterTags) {
        const tag = normalizeTag(rawTag);
        if (tag) tags.add(tag);
      }
    }

    return tags;
  }

  reconcileExpandedTags() {
    for (const tag of Array.from(this.expandedTags)) {
      if (!String(tag).startsWith('intersection:') && !this.tagFileIndex.has(tag)) {
        this.expandedTags.delete(tag);
      }
    }
  }

  getFocusedTagView() {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf && activeLeaf.view && activeLeaf.view.getViewType() === TAG_VIEW_TYPE) {
      return activeLeaf.view;
    }

    const activeEl = document.activeElement;
    const focusedTagContent =
      activeEl instanceof Element
        ? activeEl.closest('.workspace-leaf-content[data-type="tag"]')
        : null;

    if (!focusedTagContent) return null;

    for (const leaf of this.app.workspace.getLeavesOfType(TAG_VIEW_TYPE)) {
      if (leaf.view && leaf.view.containerEl === focusedTagContent) {
        return leaf.view;
      }
    }

    return null;
  }

  toggleTagSearch(view) {
    const isShowingSearch = !!view.isShowingSearch;

    if (isShowingSearch) {
      this.clearTagSearch(view);
      if (typeof view.setShowSearch === 'function') view.setShowSearch(false);
      this.scheduleSyncView(view);
      return;
    }

    if (typeof view.setShowSearch === 'function') {
      view.setShowSearch(true);
    } else if (view.showSearchButtonEl) {
      view.showSearchButtonEl.click();
    }

    window.setTimeout(() => {
      const inputEl = view.searchComponent && view.searchComponent.inputEl;
      if (inputEl) inputEl.focus();
      this.scheduleSyncView(view);
    }, 0);
  }

  clearTagSearch(view) {
    const searchComponent = view.searchComponent;
    const inputEl = searchComponent && searchComponent.inputEl;

    if (searchComponent && typeof searchComponent.setValue === 'function') {
      searchComponent.setValue('');
    }

    if (inputEl && inputEl.value !== '') {
      inputEl.value = '';
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  scheduleFocusTagSearch(view) {
    window.setTimeout(() => this.focusTagSearch(view), 0);
    window.setTimeout(() => this.focusTagSearch(view), 80);
  }

  focusTagSearch(view) {
    if (!view || !view.containerEl || !view.containerEl.isConnected) return;

    if (!view.isShowingSearch && typeof view.setShowSearch === 'function') {
      view.setShowSearch(true);
    }

    const inputEl = view.searchComponent && view.searchComponent.inputEl;
    if (!inputEl || !inputEl.isConnected) return;

    try {
      inputEl.focus({ preventScroll: true });
    } catch (error) {
      inputEl.focus();
    }
  }

  refreshTagViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_VIEW_TYPE)) {
      if (leaf.view) {
        this.patchTagView(leaf.view);
        this.scheduleSyncView(leaf.view);
      }
    }
  }

  patchTagView(view) {
    const existingPatch = this.viewPatches.get(view);
    if (existingPatch) return existingPatch;

    const patch = {
      observer: null,
      syncTimer: null,
      cleanup: [],
      hotkeyRegistration: null,
      hotkeySignature: '',
      originalUpdateSearch: null,
      autoExpandedTag: null,
      autoExpandedWasAlreadyExpanded: false,
    };

    const buttonEl = view.useHierarchyEl;
    if (buttonEl) {
      const onModeButtonClick = (evt) => {
        if (evt.button !== 0) return;

        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.setListModeEnabled(!this.settings.listModeEnabled);
      };

      buttonEl.addEventListener('click', onModeButtonClick, true);
      patch.cleanup.push(() => buttonEl.removeEventListener('click', onModeButtonClick, true));
    }

    const expandAllEl = view.collapseOrExpandAllEl;
    if (expandAllEl) {
      const onExpandAllClick = (evt) => {
        if (!this.shouldRenderCustomTagList(view) || evt.button !== 0) return;

        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.toggleAllListModeTags(view);
      };

      expandAllEl.addEventListener('click', onExpandAllClick, true);
      patch.cleanup.push(() => expandAllEl.removeEventListener('click', onExpandAllClick, true));
    }

    this.patchMultiTagSearch(view, patch);

    const onTagPaneClick = (evt) => {
      if (!this.shouldRenderCustomTagList(view)) return;

      const target = evt.target instanceof Element ? evt.target : null;
      if (!target || !view.containerEl.contains(target)) return;

      const noteCardEl = target.closest('.puffs-tag-note-card');
      if (noteCardEl) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.openNoteCard(noteCardEl);
        return;
      }

      const tagEl = target.closest('.tag-pane-tag[data-puffs-tag]');
      if (!tagEl) return;

      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      this.toggleTagExpansion(tagEl.dataset.puffsTag, view);
    };

    view.containerEl.addEventListener('click', onTagPaneClick, true);
    patch.cleanup.push(() => view.containerEl.removeEventListener('click', onTagPaneClick, true));

    const onTagPaneContextMenu = (evt) => {
      const target = evt.target instanceof Element ? evt.target : null;
      if (!target || !view.containerEl.contains(target)) return;
      if (target.closest('.puffs-tag-note-card')) return;

      const tagEl = target.closest('.tag-pane-tag');
      if (!tagEl) return;
      if (tagEl.dataset.puffsVirtualTag === 'true') return;

      const tag = this.findTagForElement(view, tagEl);
      if (!tag) return;

      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      this.openRenameTagModal(tag);
    };

    view.containerEl.addEventListener('contextmenu', onTagPaneContextMenu, true);
    patch.cleanup.push(() => view.containerEl.removeEventListener('contextmenu', onTagPaneContextMenu, true));
    this.registerTagViewHotkey(view, patch);

    const observerTarget = view.tagPaneEl || view.containerEl;
    if (observerTarget) {
      patch.observer = new MutationObserver(() => this.scheduleSyncView(view));
      patch.observer.observe(observerTarget, { childList: true, subtree: true });
      patch.cleanup.push(() => patch.observer.disconnect());
    }

    this.viewPatches.set(view, patch);
    this.register(() => this.cleanupViewPatch(view));
    return patch;
  }

  patchMultiTagSearch(view, patch) {
    if (typeof view.updateSearch !== 'function' || patch.originalUpdateSearch) return;

    patch.originalUpdateSearch = view.updateSearch;
    view.updateSearch = () => {
      const query = this.getTagSearchValue(view);
      const unionTerms = splitUnionSearchTerms(query);
      const intersectionTerms = splitIntersectionSearchTerms(query);

      if (!unionTerms && !intersectionTerms) {
        patch.originalUpdateSearch.call(view);
        this.scheduleSyncView(view);
        return;
      }

      view.searchQuery = createMultiTagSearchQuery(query, unionTerms || intersectionTerms);
      if (typeof view.updateTags === 'function') view.updateTags();
      this.scheduleSyncView(view, 0);
    };
  }

  cleanupViewPatch(view) {
    const patch = this.viewPatches.get(view);
    if (!patch) return;

    if (patch.syncTimer) {
      window.clearTimeout(patch.syncTimer);
      patch.syncTimer = null;
    }

    this.unregisterTagViewHotkey(view, patch);

    if (patch.originalUpdateSearch && view.updateSearch !== patch.originalUpdateSearch) {
      view.updateSearch = patch.originalUpdateSearch;
      patch.originalUpdateSearch = null;
    }

    for (const cleanup of patch.cleanup) {
      cleanup();
    }

    this.viewPatches.delete(view);
  }

  registerTagViewHotkey(view, patch) {
    if (!view.scope || typeof view.scope.register !== 'function') return;

    const hotkey = this.getQuickSearchHotkey();
    const signature = `${hotkey.modifiers.join('+')}+${hotkey.key}`;
    if (patch.hotkeySignature === signature && patch.hotkeyRegistration) return;

    this.unregisterTagViewHotkey(view, patch);

    patch.hotkeyRegistration = view.scope.register(hotkey.modifiers, hotkey.key, (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      this.toggleTagSearch(view);
      return false;
    });
    patch.hotkeySignature = signature;
  }

  unregisterTagViewHotkey(view, patch) {
    if (!patch.hotkeyRegistration) return;

    if (view.scope && typeof view.scope.unregister === 'function') {
      view.scope.unregister(patch.hotkeyRegistration);
    }

    patch.hotkeyRegistration = null;
    patch.hotkeySignature = '';
  }

  refreshTagViewHotkeys() {
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_VIEW_TYPE)) {
      const view = leaf.view;
      if (!view) continue;

      const patch = this.viewPatches.get(view) || this.patchTagView(view);
      this.registerTagViewHotkey(view, patch);
    }
  }

  scheduleSyncView(view, delay = VIEW_SYNC_DELAY_MS) {
    const patch = this.viewPatches.get(view);
    if (!patch) return;

    if (patch.syncTimer) {
      window.clearTimeout(patch.syncTimer);
    }

    patch.syncTimer = window.setTimeout(() => {
      patch.syncTimer = null;
      this.syncTagView(view);
    }, delay);
  }

  syncTagView(view) {
    const patch = this.viewPatches.get(view);
    if (!patch || !view.containerEl || !view.containerEl.isConnected) return;

    if (patch.observer) patch.observer.disconnect();

    try {
      this.repairHiddenSearchValue(view);
      this.updateModeButton(view);
      this.registerTagViewHotkey(view, patch);

      if (!this.shouldRenderCustomTagList(view)) {
        this.clearAutoExpandedTag(patch);
        this.clearListEnhancements(view);
        this.renderUnionSearchInNativeMode(view);

        if (view.useHierarchy !== true && typeof view.setUseHierarchy === 'function') {
          view.setUseHierarchy(true);
          this.scheduleSyncView(view);
        }

        return;
      }

      if (view.useHierarchy !== false && typeof view.setUseHierarchy === 'function') {
        view.setUseHierarchy(false);
        this.scheduleSyncView(view);
        return;
      }

      this.renderListMode(view);
      this.updateListModeExpandAllButton(view);
    } finally {
      const observerTarget = view.tagPaneEl || view.containerEl;
      if (patch.observer && observerTarget && observerTarget.isConnected) {
        patch.observer.observe(observerTarget, { childList: true, subtree: true });
      }
    }
  }

  repairHiddenSearchValue(view) {
    const inputEl = view.searchComponent && view.searchComponent.inputEl;
    if (!inputEl || view.isShowingSearch || inputEl.value === '') return;

    const searchContainerEl = inputEl.closest('.search-input-container');
    const searchContainerStyle = searchContainerEl ? getComputedStyle(searchContainerEl) : null;
    const isSearchActuallyVisible =
      searchContainerStyle &&
      searchContainerStyle.display !== 'none' &&
      searchContainerStyle.visibility !== 'hidden';
    if (isSearchActuallyVisible) return;

    this.clearTagSearch(view);
  }

  getTagSearchValue(view) {
    const inputEl = view.searchComponent && view.searchComponent.inputEl;
    if (inputEl && typeof inputEl.value === 'string') return inputEl.value;

    if (view.searchComponent && typeof view.searchComponent.getValue === 'function') {
      return view.searchComponent.getValue();
    }

    return '';
  }

  getUnionSearchTerms(view) {
    return splitUnionSearchTerms(this.getTagSearchValue(view));
  }

  getIntersectionSearchTerms(view) {
    return splitIntersectionSearchTerms(this.getTagSearchValue(view));
  }

  shouldRenderCustomTagList(view) {
    return this.settings.listModeEnabled || !!this.getIntersectionSearchTerms(view);
  }

  updateModeButton(view) {
    const buttonEl = view.useHierarchyEl;
    if (!buttonEl) return;

    buttonEl.classList.add('puffs-tag-mode-button');
    buttonEl.classList.add('is-active');

    if (this.settings.listModeEnabled) {
      setIcon(buttonEl, LIST_MODE_ICON);
      buttonEl.setAttribute('aria-label', '当前：列表模式');
      return;
    }

    setIcon(buttonEl, 'folder-tree');
    buttonEl.setAttribute('aria-label', '当前：嵌套模式');
  }

  async setListModeEnabled(enabled) {
    if (this.settings.listModeEnabled === enabled) return;

    this.settings.listModeEnabled = enabled;
    await this.saveSettings();

    if (!enabled) {
      this.expandedTags.clear();
    } else {
      this.rebuildTagFileIndex();
    }

    this.refreshTagViews();
  }

  renderListMode(view) {
    const listEl = this.ensureListModeContainer(view);
    if (!listEl) return;

    const items = this.getListModeItems(view);
    const patch = this.viewPatches.get(view);
    if (patch) this.syncAutoSingleSearchResult(view, patch, items);
    this.clearStaleVirtualExpandedTags(new Set(items.map((item) => item.tag)));

    const signature = JSON.stringify(
      items.map((item) => [
        item.tag,
        item.displayName,
        item.isVirtual,
        item.files.length,
        this.expandedTags.has(item.tag),
        this.expandedTags.has(item.tag) ? item.files.map((file) => file.path).join('\n') : '',
      ])
    );

    if (listEl.dataset.puffsSignature === signature) return;

    listEl.dataset.puffsSignature = signature;
    listEl.empty();

    for (const item of items) {
      this.renderListModeTagItem(listEl, item);
    }
  }

  syncAutoSingleSearchResult(view, patch, items) {
    const query = this.getTagSearchValue(view).trim();
    if (!query || items.length !== 1) {
      this.clearAutoExpandedTag(patch);
      return;
    }

    const tag = items[0].tag;
    if (patch.autoExpandedTag === tag) return;

    this.clearAutoExpandedTag(patch);
    patch.autoExpandedTag = tag;
    patch.autoExpandedWasAlreadyExpanded = this.expandedTags.has(tag);
    this.expandedTags.add(tag);
  }

  clearAutoExpandedTag(patch) {
    if (!patch.autoExpandedTag) return;

    if (!patch.autoExpandedWasAlreadyExpanded) {
      this.expandedTags.delete(patch.autoExpandedTag);
    }

    patch.autoExpandedTag = null;
    patch.autoExpandedWasAlreadyExpanded = false;
  }

  clearStaleVirtualExpandedTags(validTags = new Set()) {
    for (const tag of Array.from(this.expandedTags)) {
      if (String(tag).startsWith('intersection:') && !validTags.has(tag)) {
        this.expandedTags.delete(tag);
      }
    }
  }

  ensureListModeContainer(view) {
    const tagPaneEl = view.tagPaneEl || (view.containerEl && view.containerEl.querySelector('.tag-container'));
    if (!tagPaneEl) return null;

    view.containerEl.classList.add('puffs-tag-list-mode-enabled');

    let listEl = tagPaneEl.querySelector(':scope > .puffs-tag-list-container');
    if (!listEl) {
      listEl = document.createElement('div');
      listEl.className = 'puffs-tag-list-container';
      tagPaneEl.appendChild(listEl);
    }

    return listEl;
  }

  getListModeItems(view) {
    const query = this.getTagSearchValue(view);
    const intersectionTerms = splitIntersectionSearchTerms(query);
    if (intersectionTerms) return this.getIntersectionSearchItems(intersectionTerms);

    const unionTerms = splitUnionSearchTerms(query);
    const items = [];
    const seen = new Set();

    const shouldShowTag = (tag) => {
      const files = this.tagFileIndex.get(tag) || [];
      if (isNestedTag(tag) || files.length === 0) return false;
      return unionTerms
        ? tagMatchesAnySearchTerm(tag, unionTerms)
        : tagMatchesSearchText(tag, query);
    };

    const pushTag = (tag) => {
      const normalizedTag = normalizeTag(tag);
      if (!normalizedTag || seen.has(normalizedTag) || !shouldShowTag(normalizedTag)) return;

      seen.add(normalizedTag);
      items.push({
        tag: normalizedTag,
        displayName: getTagDisplayName(normalizedTag),
        isVirtual: false,
        files: this.tagFileIndex.get(normalizedTag) || [],
      });
    };

    for (const [tag, tagDom] of this.getTagDomEntries(view)) {
      pushTag((tagDom && tagDom.tag) || tag);
    }

    const fallbackTags = Array.from(this.tagFileIndex.keys())
      .filter((tag) => !seen.has(tag))
      .sort((a, b) => {
        const countDiff = (this.tagFileIndex.get(b) || []).length - (this.tagFileIndex.get(a) || []).length;
        return countDiff || getTagDisplayName(a).localeCompare(getTagDisplayName(b), 'zh-Hans-CN');
      });

    for (const tag of fallbackTags) {
      pushTag(tag);
    }

    items.sort((a, b) => {
      const countDiff = b.files.length - a.files.length;
      return countDiff || a.displayName.localeCompare(b.displayName, 'zh-Hans-CN');
    });

    return items;
  }

  getIntersectionSearchItems(terms) {
    const tags = Array.from(this.tagFileIndex.keys())
      .filter((tag) => !isNestedTag(tag) && (this.tagFileIndex.get(tag) || []).length > 0)
      .sort((a, b) => getTagDisplayName(a).localeCompare(getTagDisplayName(b), 'zh-Hans-CN'));
    const candidateGroups = terms.map((term) =>
      tags.filter((tag) => tagMatchesAnySearchTerm(tag, [term]))
    );
    if (candidateGroups.some((candidates) => candidates.length === 0)) return [];

    const items = [];
    const seenCombinations = new Set();
    const visitCombinations = (groupIndex, selectedTags) => {
      if (groupIndex < candidateGroups.length) {
        for (const tag of candidateGroups[groupIndex]) {
          if (selectedTags.includes(tag)) continue;
          visitCombinations(groupIndex + 1, [...selectedTags, tag]);
        }
        return;
      }

      const canonicalTags = [...selectedTags].sort();
      const combinationId = canonicalTags.join('&');
      if (seenCombinations.has(combinationId)) return;
      seenCombinations.add(combinationId);

      const files = this.getFilesWithAllTags(selectedTags);
      if (files.length === 0) return;

      items.push({
        tag: `intersection:${combinationId}`,
        displayName: selectedTags.map(getTagDisplayName).join(' & '),
        isVirtual: true,
        sourceTags: selectedTags,
        files,
      });
    };

    visitCombinations(0, []);
    items.sort((a, b) => {
      const countDiff = b.files.length - a.files.length;
      return countDiff || a.displayName.localeCompare(b.displayName, 'zh-Hans-CN');
    });
    return items;
  }

  getFilesWithAllTags(tags) {
    if (tags.length === 0) return [];

    const remainingPaths = tags.slice(1).map((tag) =>
      new Set((this.tagFileIndex.get(tag) || []).map((file) => file.path))
    );
    return (this.tagFileIndex.get(tags[0]) || []).filter((file) =>
      remainingPaths.every((paths) => paths.has(file.path))
    );
  }

  renderListModeTagItem(listEl, item) {
    const { tag, displayName, files, isVirtual } = item;
    const isExpanded = this.expandedTags.has(tag);
    const treeItemEl = document.createElement('div');
    treeItemEl.className = 'tree-item puffs-tag-list-item';
    treeItemEl.classList.toggle('puffs-tag-expanded', isExpanded);

    const tagEl = document.createElement('div');
    tagEl.className = 'tree-item-self tag-pane-tag is-clickable mod-collapsible puffs-tag-list-row';
    tagEl.dataset.puffsTag = tag;
    if (isVirtual) tagEl.dataset.puffsVirtualTag = 'true';
    tagEl.style.marginInlineStart = '0px';
    tagEl.style.setProperty('margin-inline-start', '0px', 'important');
    tagEl.style.paddingInlineStart = '24px';
    tagEl.style.setProperty('padding-inline-start', '24px', 'important');

    const toggleEl = document.createElement('div');
    toggleEl.className = 'tree-item-icon collapse-icon puffs-tag-list-toggle';
    toggleEl.classList.toggle('is-collapsed', !isExpanded);
    toggleEl.setAttribute('aria-hidden', 'true');
    setIcon(toggleEl, 'right-triangle');

    const innerEl = document.createElement('div');
    innerEl.className = 'tree-item-inner';

    const textEl = document.createElement('div');
    textEl.className = 'tree-item-inner-text';
    textEl.textContent = displayName;

    const flairOuterEl = document.createElement('div');
    flairOuterEl.className = 'tree-item-flair-outer';

    const countEl = document.createElement('span');
    countEl.className = 'tag-pane-tag-count tree-item-flair';
    countEl.textContent = String(files.length);

    innerEl.appendChild(textEl);
    flairOuterEl.appendChild(countEl);
    tagEl.appendChild(toggleEl);
    tagEl.appendChild(innerEl);
    tagEl.appendChild(flairOuterEl);
    treeItemEl.appendChild(tagEl);

    if (isExpanded) {
      this.renderNoteList(treeItemEl, files);
    }

    listEl.appendChild(treeItemEl);
  }

  renderUnionSearchInNativeMode(view) {
    const unionTerms = this.getUnionSearchTerms(view);
    if (!unionTerms) return;

    for (const [tag, tagDom] of this.getTagDomEntries(view)) {
      if (!tagDom || !tagDom.el) continue;

      const normalizedTag = normalizeTag(tagDom.tag || tag);
      tagDom.el.classList.toggle(
        'puffs-tag-hidden',
        !normalizedTag || !tagMatchesAnySearchTerm(normalizedTag, unionTerms)
      );
    }
  }

  updateListModeExpandAllButton(view) {
    const buttonEl = view.collapseOrExpandAllEl;
    if (!buttonEl) return;

    const items = this.getListModeItems(view);
    const shouldExpand = this.shouldExpandAllListModeTags(view, items);

    setIcon(buttonEl, shouldExpand ? 'chevrons-up-down' : 'chevrons-down-up');
    buttonEl.setAttribute('aria-label', shouldExpand ? '全部展开' : '全部收起');
    buttonEl.removeAttribute('aria-disabled');
    buttonEl.classList.remove('puffs-tag-hidden');
  }

  getTagDomEntries(view) {
    const tagDoms = view.tagDoms;
    if (!tagDoms) return [];

    if (typeof tagDoms.entries === 'function') {
      return Array.from(tagDoms.entries());
    }

    return Object.entries(tagDoms);
  }

  hideTagRow(tagDom) {
    tagDom.el.classList.add('puffs-tag-hidden');
    this.removeNoteList(tagDom.el);
  }

  renderTagRow(tagDom, tag, files) {
    const tagEl = tagDom.selfEl;
    const treeItemEl = tagDom.el;
    const isExpanded = this.expandedTags.has(tag);

    treeItemEl.classList.remove('puffs-tag-hidden');
    tagEl.dataset.puffsTag = tag;
    tagEl.classList.add('puffs-tag-list-row');
    tagEl.classList.add('mod-collapsible');
    treeItemEl.classList.toggle('puffs-tag-expanded', isExpanded);
    this.setTagCount(tagDom, files.length);

    let toggleEl = Array.from(tagEl.children).find((el) =>
      el.classList.contains('puffs-tag-list-toggle')
    );

    if (!toggleEl) {
      toggleEl = document.createElement('div');
      const innerEl = tagEl.querySelector('.tree-item-inner');
      tagEl.insertBefore(toggleEl, innerEl || tagEl.firstChild);
    }

    toggleEl.className = 'tree-item-icon collapse-icon puffs-tag-list-toggle';
    toggleEl.classList.toggle('is-collapsed', !isExpanded);
    setIcon(toggleEl, 'right-triangle');
    toggleEl.setAttribute('aria-hidden', 'true');

    if (isExpanded) {
      this.renderNoteList(treeItemEl, files);
    } else {
      this.removeNoteList(treeItemEl);
    }
  }

  setTagCount(tagDom, count) {
    if (typeof tagDom.setCount === 'function') {
      tagDom.setCount(count);
      return;
    }

    if (tagDom.tagCountEl) {
      tagDom.tagCountEl.textContent = String(count);
    }
  }

  renderNoteList(treeItemEl, files) {
    let listEl = Array.from(treeItemEl.children).find((el) =>
      el.classList.contains('puffs-tag-note-list')
    );

    if (!listEl) {
      listEl = document.createElement('div');
      listEl.className = 'tree-item-children puffs-tag-note-list';
      treeItemEl.appendChild(listEl);
    }

    listEl.className = 'tree-item-children puffs-tag-note-list';
    listEl.empty();

    for (const file of files) {
      const itemEl = document.createElement('div');
      itemEl.className = 'tree-item puffs-tag-note-item';

      const cardEl = document.createElement('div');
      cardEl.className = 'tree-item-self puffs-tag-note-card is-clickable';
      cardEl.dataset.path = file.path;
      cardEl.title = file.path;
      cardEl.style.marginInlineStart = '-17px';
      cardEl.style.setProperty('margin-inline-start', '-17px', 'important');
      cardEl.style.paddingInlineStart = '41px';
      cardEl.style.setProperty('padding-inline-start', '41px', 'important');

      const innerEl = document.createElement('div');
      innerEl.className = 'tree-item-inner';

      const textEl = document.createElement('div');
      textEl.className = 'tree-item-inner-text';
      textEl.textContent = file.basename;

      innerEl.appendChild(textEl);
      cardEl.appendChild(innerEl);
      itemEl.appendChild(cardEl);
      listEl.appendChild(itemEl);
    }
  }

  removeNoteList(treeItemEl) {
    const listEl = Array.from(treeItemEl.children).find((el) =>
      el.classList.contains('puffs-tag-note-list')
    );
    if (listEl) listEl.remove();
  }

  clearListEnhancements(view) {
    this.clearStaleVirtualExpandedTags();
    view.containerEl.classList.remove('puffs-tag-list-mode-enabled');

    const expandAllEl = view.collapseOrExpandAllEl;
    if (expandAllEl) {
      expandAllEl.classList.remove('puffs-tag-hidden');
      expandAllEl.removeAttribute('aria-disabled');
    }

    view.containerEl.querySelectorAll('.puffs-tag-list-container').forEach((el) => el.remove());
    view.containerEl.querySelectorAll('.puffs-tag-note-list').forEach((el) => el.remove());
    view.containerEl.querySelectorAll('.puffs-tag-list-toggle').forEach((el) => el.remove());
    view.containerEl.querySelectorAll('.tag-pane-tag[data-puffs-tag]').forEach((el) => {
      el.removeAttribute('data-puffs-tag');
      el.classList.remove('puffs-tag-list-row');
    });
    view.containerEl.querySelectorAll('.puffs-tag-hidden').forEach((el) => {
      el.classList.remove('puffs-tag-hidden');
    });
    view.containerEl.querySelectorAll('.puffs-tag-expanded').forEach((el) => {
      el.classList.remove('puffs-tag-expanded');
    });
  }

  toggleTagExpansion(tag, view) {
    if (!tag) return;

    if (this.expandedTags.has(tag)) {
      this.expandedTags.delete(tag);
    } else {
      this.expandedTags.add(tag);
    }

    this.scheduleSyncView(view, 0);
  }

  toggleAllListModeTags(view) {
    const items = this.getListModeItems(view);
    if (items.length === 0) return;

    const shouldExpand = this.shouldExpandAllListModeTags(view, items);
    for (const item of items) {
      if (shouldExpand) {
        this.expandedTags.add(item.tag);
      } else {
        this.expandedTags.delete(item.tag);
      }
    }

    this.scheduleSyncView(view, 0);
  }

  shouldExpandAllListModeTags(view, items = this.getListModeItems(view)) {
    if (items.length === 0) return true;

    const query = this.getTagSearchValue(view).trim();
    if (!query) {
      return !items.some((item) => this.expandedTags.has(item.tag));
    }

    return items.some((item) => !this.expandedTags.has(item.tag));
  }

  findTagForElement(view, tagEl) {
    const datasetTag = normalizeTag(tagEl.dataset && tagEl.dataset.puffsTag);
    if (datasetTag) return datasetTag;

    for (const [tag, tagDom] of this.getTagDomEntries(view)) {
      if (!tagDom || !tagDom.selfEl) continue;
      if (tagDom.selfEl !== tagEl && !tagDom.selfEl.contains(tagEl)) continue;

      return normalizeTag(tagDom.tag || tag);
    }

    return null;
  }

  openRenameTagModal(tag) {
    new PuffsTagRenameModal(this.app, this, tag).open();
  }

  async renameTag(oldTagValue, newTagValue) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);

    if (!oldTag) throw new Error('原标签无效');
    if (!newTag) throw new Error('标签名称不能为空');
    if (/\s/.test(getTagDisplayName(newTag))) throw new Error('标签名称不能包含空格');
    if (oldTag === newTag) return;

    this.rebuildTagFileIndex();
    const files = Array.from(new Set(this.tagFileIndex.get(oldTag) || []));

    for (const file of files) {
      await this.renameTagInFile(file, oldTag, newTag);
    }

    if (this.expandedTags.delete(oldTag)) {
      this.expandedTags.add(newTag);
    }

    this.refreshTagIndexAndViews();
  }

  async renameTagInFile(file, oldTag, newTag) {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return;

    const hasInlineTag = Array.isArray(cache.tags) && cache.tags.some((tagEntry) => {
      return normalizeTag(tagEntry && tagEntry.tag) === oldTag;
    });

    if (hasInlineTag) {
      await this.app.vault.process(file, (content) => {
        const nextContent = replaceInlineTagsByCache(content, cache, oldTag, newTag);
        return nextContent === content ? replaceInlineTagsByText(content, oldTag, newTag) : nextContent;
      });
    }

    const frontmatter = cache.frontmatter;
    if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, 'tags')) return;

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (!Object.prototype.hasOwnProperty.call(fm, 'tags')) return;
      fm.tags = replaceFrontmatterTagValue(fm.tags, oldTag, newTag);
    });
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
    return this.isMainWorkspaceLeaf(leaf);
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

  restoreAllTagViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_VIEW_TYPE)) {
      if (!leaf.view) continue;

      this.clearListEnhancements(leaf.view);
      if (leaf.view.useHierarchy !== true && typeof leaf.view.setUseHierarchy === 'function') {
        leaf.view.setUseHierarchy(true);
      }

      const buttonEl = leaf.view.useHierarchyEl;
      if (buttonEl) {
        buttonEl.classList.remove('puffs-tag-mode-button');
        setIcon(buttonEl, 'folder-tree');
        buttonEl.setAttribute('aria-label', '显示嵌套情况');
      }
    }
  }
}

class PuffsTagRenameModal extends Modal {
  constructor(app, plugin, tag) {
    super(app);
    this.plugin = plugin;
    this.tag = normalizeTag(tag);
    this.isSubmitting = false;
  }

  onOpen() {
    this.modalEl.classList.add('puffs-tag-rename-modal');
    this.contentEl.empty();

    const titleEl = document.createElement('div');
    titleEl.className = 'puffs-tag-rename-title';
    titleEl.textContent = '修改标签';

    const inputEl = document.createElement('input');
    inputEl.className = 'puffs-tag-rename-input';
    inputEl.type = 'text';
    inputEl.value = getTagDisplayName(this.tag);

    this.contentEl.appendChild(titleEl);
    this.contentEl.appendChild(inputEl);

    inputEl.addEventListener('keydown', async (evt) => {
      if (evt.key !== 'Enter' || this.isSubmitting) return;

      evt.preventDefault();
      evt.stopPropagation();

      this.isSubmitting = true;
      try {
        await this.plugin.renameTag(this.tag, inputEl.value);
        this.close();
      } catch (error) {
        this.isSubmitting = false;
        new Notice(error && error.message ? error.message : '修改标签失败');
        inputEl.focus();
        inputEl.select();
      }
    });

    inputEl.addEventListener('blur', () => {
      if (!this.isSubmitting) this.close();
    });

    window.setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 0);
  }
}

class PuffsTagEnhanceSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('弹出/收起搜索栏快捷键')
      .addText((text) => {
        text
          .setValue(this.plugin.getQuickSearchHotkeyDisplay())
          .setPlaceholder(DEFAULT_QUICK_SEARCH_HOTKEY)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ toggleSearchHotkey: value });
          });
      });

    new Setting(containerEl)
      .setName('自动切到大纲标签页')
      .setDesc('开启后，插件会按当前笔记的侧边栏偏好在标签列表和大纲之间自动切换')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoSwitchToOutlineEnabled)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ autoSwitchToOutlineEnabled: value });
          });
      });
  }
}

module.exports = PuffsTagEnhancePlugin;
