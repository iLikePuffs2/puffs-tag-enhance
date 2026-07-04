'use strict';

const obsidian = require('obsidian');

const {
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  Notice,
  getAllTags,
  setIcon,
} = obsidian;

const STYLE_ID = 'puffs-tag-enhance-style';
const TAG_VIEW_TYPE = 'tag';
const VIEW_SYNC_DELAY_MS = 30;
const DEFAULT_QUICK_SEARCH_HOTKEY = 'Ctrl + F';
const LIST_MODE_ICON = 'list-tree';
const INITIAL_TAG_INDEX_REFRESH_DELAYS_MS = [0, 500, 1500, 3000, 6000];

const DEFAULT_SETTINGS = {
  listModeEnabled: false,
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
      this.refreshTagIndexAndViews();
      this.refreshTagViews();
      this.queueInitialTagIndexRefreshes();
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
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async updateSettings(newSettings) {
    this.settings = Object.assign({}, this.settings, newSettings);
    this.settings.toggleSearchHotkey = normalizeHotkeyText(this.settings.toggleSearchHotkey);
    await this.saveSettings();
    this.refreshTagViewHotkeys();
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

  registerWorkspaceHandlers() {
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        this.rememberMainLeaf(leaf);
      })
    );

    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.refreshTagViews();
      })
    );
  }

  registerMetadataHandlers() {
    const scheduleRefresh = () => this.scheduleMetadataRefresh();

    this.registerEvent(this.app.metadataCache.on('changed', scheduleRefresh));
    this.registerEvent(this.app.metadataCache.on('deleted', scheduleRefresh));
    this.registerEvent(this.app.vault.on('rename', scheduleRefresh));
    this.registerEvent(this.app.vault.on('delete', scheduleRefresh));
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
      if (!this.tagFileIndex.has(tag)) {
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
        if (!this.settings.listModeEnabled || evt.button !== 0) return;

        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
      };

      expandAllEl.addEventListener('click', onExpandAllClick, true);
      patch.cleanup.push(() => expandAllEl.removeEventListener('click', onExpandAllClick, true));
    }

    const onTagPaneClick = (evt) => {
      if (!this.settings.listModeEnabled) return;

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

  cleanupViewPatch(view) {
    const patch = this.viewPatches.get(view);
    if (!patch) return;

    if (patch.syncTimer) {
      window.clearTimeout(patch.syncTimer);
      patch.syncTimer = null;
    }

    this.unregisterTagViewHotkey(view, patch);

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

      if (!this.settings.listModeEnabled) {
        this.clearListEnhancements(view);

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
      this.disableListModeExpandAllButton(view);
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

    this.clearTagSearch(view);
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
    for (const [tag, tagDom] of this.getTagDomEntries(view)) {
      if (!tagDom || !tagDom.el || !tagDom.selfEl) continue;

      const normalizedTag = normalizeTag(tagDom.tag || tag);
      if (!normalizedTag) continue;

      const files = this.tagFileIndex.get(normalizedTag) || [];
      if (isNestedTag(normalizedTag) || files.length === 0) {
        this.hideTagRow(tagDom);
        continue;
      }

      this.renderTagRow(tagDom, normalizedTag, files);
    }
  }

  disableListModeExpandAllButton(view) {
    const buttonEl = view.collapseOrExpandAllEl;
    if (!buttonEl) return;

    buttonEl.setAttribute('aria-label', '全部展开');
    buttonEl.setAttribute('aria-disabled', 'true');
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
    this.rememberMainLeaf(this.app.workspace.activeLeaf);
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
  }
}

module.exports = PuffsTagEnhancePlugin;
