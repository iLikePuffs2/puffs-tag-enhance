'use strict';

const obsidian = require('obsidian');

const {
  Plugin,
  PluginSettingTab,
  Setting,
  ItemView,
  SearchComponent,
  Scope,
  Modal,
  TFile,
  Notice,
  getAllTags,
  setIcon,
} = obsidian;

const STYLE_ID = 'puffs-tag-enhance-style';
const TAG_VIEW_TYPE = 'tag';
const TAG_SHELF_VIEW_TYPE = 'puffs-tag-shelf-view';
const OUTLINE_VIEW_TYPE = 'outline';
const MARKDOWN_VIEW_TYPE = 'markdown';
const VIEW_SYNC_DELAY_MS = 30;
const DEFAULT_QUICK_SEARCH_HOTKEY = 'Ctrl + F';
const DEFAULT_MOVE_NOTE_UP_HOTKEY = 'Alt + Shift + ↑';
const DEFAULT_MOVE_NOTE_DOWN_HOTKEY = 'Alt + Shift + ↓';
const LIST_MODE_ICON = 'list-tree';
const TAG_SYSTEM_ICON = LIST_MODE_ICON;
const INITIAL_TAG_INDEX_REFRESH_DELAYS_MS = [0, 500, 1500, 3000, 6000];

const DEFAULT_SETTINGS = {
  autoSwitchToOutlineEnabled: true,
  tagSidebarPreferredFiles: {},
  noteOrderByTag: {},
  newNotePosition: 'end',
  toggleSearchHotkey: DEFAULT_QUICK_SEARCH_HOTKEY,
  moveNoteUpHotkey: DEFAULT_MOVE_NOTE_UP_HOTKEY,
  moveNoteDownHotkey: DEFAULT_MOVE_NOTE_DOWN_HOTKEY,
};

function normalizeTag(rawTag) {
  if (!rawTag) return null;

  const tag = String(rawTag).trim();
  if (!tag) return null;

  return tag.startsWith('#') ? tag : `#${tag}`;
}

function normalizeNewNotePosition(value) {
  return value === 'start' ? 'start' : 'end';
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

  const parts = text.split('&').map(normalizeSearchTerm);
  const isTrailingSuggestionSearch = parts.length === 2 && parts[0] && !parts[1];
  if (isTrailingSuggestionSearch) return [parts[0]];

  const terms = parts.filter(Boolean);
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

function normalizeHotkeyKey(value) {
  const key = String(value || '').trim();
  const normalized = key.toLowerCase();
  if (key === '↑' || normalized === 'arrowup' || normalized === 'up') return 'ArrowUp';
  if (key === '↓' || normalized === 'arrowdown' || normalized === 'down') return 'ArrowDown';
  return key.length === 1 ? key.toUpperCase() : key;
}

function formatHotkeyKey(key) {
  if (key === 'ArrowUp') return '↑';
  if (key === 'ArrowDown') return '↓';
  return key;
}

function parseHotkeyText(value, fallback = DEFAULT_QUICK_SEARCH_HOTKEY) {
  const text = String(value || fallback).trim();
  const parts = text.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return parseHotkeyText(fallback, fallback);

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

  if (!key) return parseHotkeyText(fallback, fallback);

  return {
    modifiers: Array.from(new Set(modifiers)),
    key: normalizeHotkeyKey(key),
  };
}

function formatHotkey(parsedHotkey) {
  return [...parsedHotkey.modifiers, formatHotkeyKey(parsedHotkey.key)].join(' + ');
}

function normalizeHotkeyText(value, fallback = DEFAULT_QUICK_SEARCH_HOTKEY) {
  return formatHotkey(parseHotkeyText(value, fallback));
}

class PuffsTagShelfView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.searchQuery = '';
    this.expandedTags = new Set();
    this.autoExpandedTag = null;
    this.autoExpandedWasAlreadyExpanded = false;
    this.searchComponent = null;
    this.isShowingSearch = true;
    this.searchHotkeyHandler = null;
    this.listEl = null;
    this.summaryTagCountEl = null;
    this.summaryNoteCountEl = null;
  }

  getViewType() {
    return TAG_SHELF_VIEW_TYPE;
  }

  getDisplayText() {
    return '标签系统';
  }

  getIcon() {
    return TAG_SYSTEM_ICON;
  }

  async onOpen() {
    this.searchHotkeyHandler = (event) => this.handleSearchHotkey(event);
    window.addEventListener('keydown', this.searchHotkeyHandler, true);
    document.addEventListener('keydown', this.searchHotkeyHandler, true);
    this.render();
  }

  async onClose() {
    if (this.searchHotkeyHandler) {
      window.removeEventListener('keydown', this.searchHotkeyHandler, true);
      document.removeEventListener('keydown', this.searchHotkeyHandler, true);
      this.searchHotkeyHandler = null;
    }
    this.searchComponent = null;
  }

  refresh() {
    const scrollTop = this.contentEl.scrollTop;
    this.render();
    window.requestAnimationFrame(() => {
      this.contentEl.scrollTop = scrollTop;
    });
  }

  toggleSearch() {
    const inputEl = this.searchComponent && this.searchComponent.inputEl;
    if (!inputEl) return;

    if (this.isShowingSearch) {
      this.searchComponent.setValue('');
      if (inputEl.value !== '') {
        inputEl.value = '';
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (this.searchQuery !== '') {
        this.searchQuery = '';
        this.renderTagList();
      }
      this.isShowingSearch = false;
    } else {
      this.isShowingSearch = true;
    }

    window.setTimeout(() => inputEl.focus(), 0);
  }

  handleSearchHotkey(event) {
    if (!this.plugin.isQuickSearchHotkey(event) || !this.isActiveView()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.toggleSearch();
  }

  isActiveView() {
    return (
      this.app.workspace.activeLeaf === this.leaf ||
      !!this.contentEl.closest('.workspace-leaf.mod-active') ||
      this.contentEl.contains(document.activeElement)
    );
  }

  render() {
    this.contentEl.empty();
    this.contentEl.classList.add('puffs-tag-shelf-view');

    const pageEl = document.createElement('div');
    pageEl.className = 'puffs-tag-shelf-page';
    this.syncSidebarTreeStyles(pageEl);

    const headerEl = document.createElement('div');
    headerEl.className = 'puffs-tag-shelf-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'puffs-tag-shelf-title';
    titleEl.textContent = '标签系统';

    headerEl.appendChild(titleEl);
    pageEl.appendChild(headerEl);

    const summaryEl = document.createElement('div');
    summaryEl.className = 'puffs-tag-shelf-summary';
    const tagSummary = this.createSummaryCard('标签数量', '0 个');
    const noteSummary = this.createSummaryCard('笔记数量', '0 篇');
    this.summaryTagCountEl = tagSummary.valueEl;
    this.summaryNoteCountEl = noteSummary.valueEl;
    summaryEl.appendChild(tagSummary.cardEl);
    summaryEl.appendChild(noteSummary.cardEl);
    pageEl.appendChild(summaryEl);

    const sectionHeaderEl = document.createElement('div');
    sectionHeaderEl.className = 'puffs-tag-shelf-section-header';

    const sectionTitleEl = document.createElement('h3');
    sectionTitleEl.className = 'puffs-tag-shelf-section-title';
    sectionTitleEl.textContent = '标签列表';

    const searchHostEl = document.createElement('div');
    searchHostEl.className = 'puffs-tag-shelf-search-host';
    this.searchComponent = new SearchComponent(searchHostEl);
    this.searchComponent.containerEl.classList.add('puffs-tag-shelf-search-container');
    this.searchComponent.inputEl.classList.add('puffs-tag-shelf-search-input');
    this.searchComponent.setPlaceholder('搜索标签');
    this.searchComponent.setValue(this.searchQuery);
    this.searchComponent.onChange((value) => {
      this.searchQuery = value;
      this.renderTagList();
    });

    sectionHeaderEl.appendChild(sectionTitleEl);
    sectionHeaderEl.appendChild(searchHostEl);
    pageEl.appendChild(sectionHeaderEl);

    this.listEl = document.createElement('div');
    this.listEl.className = 'puffs-tag-shelf-list';
    pageEl.appendChild(this.listEl);

    this.contentEl.appendChild(pageEl);
    this.renderTagList();
  }

  syncSidebarTreeStyles(pageEl) {
    const sidebarRowEl = document.querySelector(
      '.workspace-leaf-content[data-type="tag"] .tag-pane-tag'
    );
    if (!sidebarRowEl) return;

    const innerEl = sidebarRowEl.querySelector('.tree-item-inner');
    const flairEl = sidebarRowEl.querySelector('.tree-item-flair');
    const rowStyle = window.getComputedStyle(sidebarRowEl);
    pageEl.style.setProperty('--puffs-tag-shelf-row-align-items', rowStyle.alignItems);

    if (innerEl) {
      const innerStyle = window.getComputedStyle(innerEl);
      pageEl.style.setProperty('--puffs-tag-shelf-tree-font-size', innerStyle.fontSize);
      pageEl.style.setProperty('--puffs-tag-shelf-tree-line-height', innerStyle.lineHeight);
      pageEl.style.setProperty('--puffs-tag-shelf-tree-font-weight', innerStyle.fontWeight);
      pageEl.style.setProperty('--puffs-tag-shelf-tree-letter-spacing', innerStyle.letterSpacing);
    }

    if (flairEl) {
      const flairStyle = window.getComputedStyle(flairEl);
      pageEl.style.setProperty('--puffs-tag-shelf-flair-display', flairStyle.display);
      pageEl.style.setProperty('--puffs-tag-shelf-flair-align-items', flairStyle.alignItems);
      pageEl.style.setProperty('--puffs-tag-shelf-flair-font-size', flairStyle.fontSize);
      pageEl.style.setProperty('--puffs-tag-shelf-flair-line-height', flairStyle.lineHeight);
    }
  }

  createSummaryCard(label, value) {
    const cardEl = document.createElement('div');
    cardEl.className = 'puffs-tag-shelf-summary-card';

    const labelEl = document.createElement('div');
    labelEl.className = 'puffs-tag-shelf-summary-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('div');
    valueEl.className = 'puffs-tag-shelf-summary-value';
    valueEl.textContent = value;

    cardEl.appendChild(labelEl);
    cardEl.appendChild(valueEl);
    return { cardEl, valueEl };
  }

  renderTagList() {
    if (!this.listEl || !this.summaryTagCountEl || !this.summaryNoteCountEl) return;

    const query = this.searchQuery.trim();
    const items = this.plugin.getTagShelfItems(query);
    this.syncAutoSingleSearchResult(query, items);
    this.updateSummary(items);
    this.listEl.empty();

    if (items.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'puffs-tag-shelf-empty';
      emptyEl.textContent = query ? '没有匹配的标签。' : '暂无可展示的标签。';
      this.listEl.appendChild(emptyEl);
      return;
    }

    for (const item of items) {
      this.renderTagCard(item);
    }
  }

  updateSummary(items) {
    const uniqueNotePaths = new Set();
    for (const item of items) {
      for (const file of item.files) uniqueNotePaths.add(file.path);
    }

    this.summaryTagCountEl.textContent = `${items.length} 个`;
    this.summaryNoteCountEl.textContent = `${uniqueNotePaths.size} 篇`;
  }

  syncAutoSingleSearchResult(query, items) {
    if (!query || items.length !== 1) {
      this.clearAutoExpandedTag();
      return;
    }

    const tag = items[0].tag;
    if (this.autoExpandedTag === tag) return;

    this.clearAutoExpandedTag();
    this.autoExpandedTag = tag;
    this.autoExpandedWasAlreadyExpanded = this.expandedTags.has(tag);
    this.expandedTags.add(tag);
  }

  clearAutoExpandedTag() {
    if (!this.autoExpandedTag) return;

    if (!this.autoExpandedWasAlreadyExpanded) {
      this.expandedTags.delete(this.autoExpandedTag);
    }

    this.autoExpandedTag = null;
    this.autoExpandedWasAlreadyExpanded = false;
  }

  renderTagCard(item) {
    const { tag, displayName, files, isVirtual } = item;
    const isExpanded = this.expandedTags.has(tag);
    const treeItemEl = document.createElement('div');
    treeItemEl.className = 'tree-item puffs-tag-list-item puffs-tag-shelf-card';
    treeItemEl.classList.toggle('puffs-tag-expanded', isExpanded);
    treeItemEl.classList.toggle('puffs-tag-shelf-virtual', !!isVirtual);

    const tagEl = document.createElement('div');
    tagEl.className =
      'tree-item-self tag-pane-tag is-clickable mod-collapsible puffs-tag-list-row puffs-tag-shelf-tag-row';
    tagEl.dataset.puffsTag = tag;
    if (isVirtual) tagEl.dataset.puffsVirtualTag = 'true';

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

    tagEl.addEventListener('click', () => {
      if (this.expandedTags.has(tag)) this.expandedTags.delete(tag);
      else this.expandedTags.add(tag);
      this.renderTagList();
    });

    tagEl.addEventListener('contextmenu', (event) => {
      if (isVirtual) return;
      event.preventDefault();
      this.plugin.openRenameTagModal(tag);
    });

    if (isExpanded) {
      const notesEl = document.createElement('div');
      notesEl.className = 'tree-item-children puffs-tag-note-list puffs-tag-shelf-notes';

      for (const file of files) {
        const noteItemEl = document.createElement('div');
        noteItemEl.className = 'tree-item puffs-tag-note-item puffs-tag-shelf-note-item';
        noteItemEl.dataset.path = file.path;
        noteItemEl.classList.toggle(
          'is-order-selected',
          this.plugin.isNoteOrderTargetSelected(tag, file.path)
        );

        const noteCardEl = document.createElement('div');
        noteCardEl.className = 'tree-item-self puffs-tag-note-card is-clickable puffs-tag-shelf-note-card';
        noteCardEl.dataset.path = file.path;

        if (!isVirtual) {
          const orderButtonEl = document.createElement('button');
          orderButtonEl.type = 'button';
          orderButtonEl.className = 'clickable-icon puffs-tag-note-order-button';
          orderButtonEl.dataset.puffsTag = tag;
          orderButtonEl.dataset.path = file.path;
          orderButtonEl.dataset.puffsSurface = 'shelf';
          orderButtonEl.setAttribute('aria-label', '选中笔记并使用快捷键调整顺序');
          setIcon(orderButtonEl, 'list-todo');
          this.plugin.syncNoteOrderButtonSelection(orderButtonEl);
          orderButtonEl.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.plugin.toggleNoteOrderTarget(tag, file.path, 'shelf');
          });
          noteCardEl.appendChild(orderButtonEl);
        }

        const noteInnerEl = document.createElement('div');
        noteInnerEl.className = 'tree-item-inner';

        const noteTextEl = document.createElement('div');
        noteTextEl.className = 'tree-item-inner-text';
        noteTextEl.textContent = file.basename;

        noteInnerEl.appendChild(noteTextEl);
        noteCardEl.appendChild(noteInnerEl);
        noteCardEl.addEventListener('click', () => {
          this.plugin.openNoteCard(noteCardEl).catch((error) => {
            console.error('[Puffs Tag Enhance] Failed to open note:', error);
            new Notice('打开笔记失败');
          });
        });
        noteItemEl.appendChild(noteCardEl);
        notesEl.appendChild(noteItemEl);
      }

      treeItemEl.appendChild(notesEl);
    }

    this.listEl.appendChild(treeItemEl);
  }
}

class PuffsTagEnhancePlugin extends Plugin {
  constructor(app, manifest) {
    super(app, manifest);

    this.settings = { ...DEFAULT_SETTINGS };
    this.tagFileIndex = new Map();
    this.expandedTags = new Set();
    this.selectedNoteOrderTarget = null;
    this.noteOrderHotkeyScope = null;
    this.viewPatches = new WeakMap();
    this.lastMainLeaf = null;
    this.currentMainFilePath = null;
    this.selectedSidebarViewType = null;
    this.sidebarSwitchGuardUntil = 0;
    this.initialTagIndexRefreshTimers = [];
    this.noteOrderTrackingReady = false;
    this.settingsSavePromise = Promise.resolve();
    this.activeTagRename = null;
    this.tagRenameProtectionTimer = null;
    this.isUnloaded = false;
  }

  async onload() {
    await this.loadSettings();

    this.isUnloaded = false;
    this.registerView(TAG_SHELF_VIEW_TYPE, (leaf) => new PuffsTagShelfView(leaf, this));
    this.addCommand({
      id: 'open-tag-shelf',
      name: '打开标签系统',
      callback: () => this.openTagShelf(),
    });
    this.addRibbonIcon(TAG_SYSTEM_ICON, '打开标签系统', () => this.openTagShelf());
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
      this.refreshTagIndexAndViews(null, true);
      this.refreshTagViews();
      this.queueInitialTagIndexRefreshes();
      this.applySidebarPreferenceForCurrentFile();
    });

    console.log('Puffs 标签增强: 已加载');
  }

  onunload() {
    this.isUnloaded = true;
    this.deactivateNoteOrderHotkeyScope();
    this.clearInitialTagIndexRefreshTimers();
    this.clearTagRenameProtectionTimer();
    this.restoreAllTagViews();
    this.removeStyle();
    console.log('Puffs 标签增强: 已卸载');
  }

  async loadSettings() {
    const savedSettings = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);
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
    delete this.settings.listModeEnabled;
    delete this.settings.tagOrder;
  }

  async saveSettings() {
    this.settingsSavePromise = this.settingsSavePromise
      .catch(() => {})
      .then(() => this.saveData(this.settings));
    await this.settingsSavePromise;
  }

  async updateSettings(newSettings) {
    this.settings = Object.assign({}, this.settings, newSettings);
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
    delete this.settings.tagOrder;
    await this.saveSettings();
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

  getOrderedFilesForTag(tagValue, files) {
    const tag = normalizeTag(tagValue);
    const savedOrder = tag && this.settings.noteOrderByTag[tag];
    if (!Array.isArray(savedOrder) || savedOrder.length === 0) return files;

    const rank = new Map(savedOrder.map((path, index) => [path, index]));
    return files
      .map((file, index) => ({ file, index }))
      .sort((a, b) => {
        const aRank = rank.get(a.file.path);
        const bRank = rank.get(b.file.path);
        const aIsRanked = Number.isInteger(aRank);
        const bIsRanked = Number.isInteger(bRank);

        if (aIsRanked && bIsRanked) return aRank - bRank;
        if (aIsRanked) return -1;
        if (bIsRanked) return 1;
        return a.index - b.index;
      })
      .map(({ file }) => file);
  }

  getTagShelfItems(query = '') {
    const intersectionTerms = splitIntersectionSearchTerms(query);
    if (intersectionTerms) return this.getIntersectionSearchItems(intersectionTerms);

    const unionTerms = splitUnionSearchTerms(query);
    const items = Array.from(this.tagFileIndex.entries())
      .filter(([tag, files]) => !isNestedTag(tag) && files.length > 0)
      .map(([tag, files]) => ({
        tag,
        displayName: getTagDisplayName(tag),
        isVirtual: false,
        files: this.getOrderedFilesForTag(tag, files),
      }))
      .sort((a, b) => {
        const countDiff = b.files.length - a.files.length;
        return countDiff || a.displayName.localeCompare(b.displayName, 'zh-Hans-CN');
      });

    if (unionTerms) return items.filter((item) => tagMatchesAnySearchTerm(item.tag, unionTerms));
    return items.filter((item) => tagMatchesSearchText(item.tag, query));
  }

  isNoteOrderTargetSelected(tag, path) {
    return !!(
      this.selectedNoteOrderTarget &&
      this.selectedNoteOrderTarget.tag === tag &&
      this.selectedNoteOrderTarget.path === path
    );
  }

  syncNoteOrderButtonSelection(buttonEl) {
    if (!buttonEl) return;
    const isSelected = this.isNoteOrderTargetSelected(
      buttonEl.dataset.puffsTag,
      buttonEl.dataset.path
    );
    buttonEl.classList.toggle('is-selected', isSelected);
    buttonEl.setAttribute('aria-pressed', String(isSelected));
    const noteItemEl = buttonEl.closest('.puffs-tag-note-item');
    if (noteItemEl) noteItemEl.classList.toggle('is-order-selected', isSelected);
  }

  refreshNoteOrderSelectionState() {
    document.querySelectorAll('.puffs-tag-note-order-button').forEach((buttonEl) => {
      this.syncNoteOrderButtonSelection(buttonEl);
    });
  }

  activateNoteOrderHotkeyScope() {
    if (this.noteOrderHotkeyScope || !this.selectedNoteOrderTarget) return;

    const scope = new Scope();
    const registerMoveHotkey = (settingValue, fallback, direction) => {
      const hotkey = parseHotkeyText(settingValue, fallback);
      scope.register(hotkey.modifiers, hotkey.key, (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        this.moveSelectedNote(direction).catch((error) => {
          console.error('[Puffs Tag Enhance] Failed to move selected note:', error);
          new Notice('调整笔记顺序失败');
        });
        return false;
      });
    };

    registerMoveHotkey(
      this.settings.moveNoteUpHotkey,
      DEFAULT_MOVE_NOTE_UP_HOTKEY,
      -1
    );
    registerMoveHotkey(
      this.settings.moveNoteDownHotkey,
      DEFAULT_MOVE_NOTE_DOWN_HOTKEY,
      1
    );
    this.app.keymap.pushScope(scope);
    this.noteOrderHotkeyScope = scope;
  }

  deactivateNoteOrderHotkeyScope() {
    if (!this.noteOrderHotkeyScope) return;
    this.app.keymap.popScope(this.noteOrderHotkeyScope);
    this.noteOrderHotkeyScope = null;
  }

  refreshNoteOrderHotkeyScope() {
    const shouldReactivate = !!this.selectedNoteOrderTarget;
    this.deactivateNoteOrderHotkeyScope();
    if (shouldReactivate) this.activateNoteOrderHotkeyScope();
  }

  toggleNoteOrderTarget(tagValue, path, surface = '') {
    const tag = normalizeTag(tagValue);
    if (!tag || !path) return;

    if (this.isNoteOrderTargetSelected(tag, path)) {
      this.selectedNoteOrderTarget = null;
      this.deactivateNoteOrderHotkeyScope();
    } else {
      this.selectedNoteOrderTarget = { tag, path, surface };
      this.refreshNoteOrderHotkeyScope();
    }
    this.refreshNoteOrderSelectionState();
  }

  clearNoteOrderTarget() {
    if (!this.selectedNoteOrderTarget) return;
    this.selectedNoteOrderTarget = null;
    this.deactivateNoteOrderHotkeyScope();
    this.refreshNoteOrderSelectionState();
  }

  focusSelectedNoteOrderButton() {
    if (!this.selectedNoteOrderTarget) return;
    const { tag, path, surface } = this.selectedNoteOrderTarget;
    const buttons = Array.from(document.querySelectorAll('.puffs-tag-note-order-button'));
    const buttonEl =
      buttons.find((button) =>
        button.dataset.puffsTag === tag &&
        button.dataset.path === path &&
        button.dataset.puffsSurface === surface &&
        button.offsetParent !== null
      ) ||
      buttons.find((button) =>
        button.dataset.puffsTag === tag &&
        button.dataset.path === path &&
        button.offsetParent !== null
      );
    if (buttonEl) buttonEl.focus({ preventScroll: true });
  }

  async moveSelectedNote(direction) {
    const target = this.selectedNoteOrderTarget;
    if (!target || (direction !== -1 && direction !== 1)) return false;

    const files = this.getOrderedFilesForTag(target.tag, this.tagFileIndex.get(target.tag) || []);
    const currentIndex = files.findIndex((file) => file.path === target.path);
    if (currentIndex < 0) {
      this.clearNoteOrderTarget();
      return false;
    }

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= files.length) return false;

    const neighborPath = files[nextIndex].path;
    await this.reorderNote(
      target.tag,
      target.path,
      neighborPath,
      direction < 0 ? 'before' : 'after'
    );
    window.setTimeout(() => {
      this.refreshNoteOrderSelectionState();
      this.focusSelectedNoteOrderButton();
    }, 0);
    return true;
  }

  async reorderNote(tagValue, movingPath, targetPath, placement) {
    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag) || !movingPath || !targetPath || movingPath === targetPath) return;

    const order = this.getOrderedFilesForTag(tag, this.tagFileIndex.get(tag) || []).map((file) => file.path);
    const movingIndex = order.indexOf(movingPath);
    const targetIndex = order.indexOf(targetPath);
    if (movingIndex < 0 || targetIndex < 0) return;

    order.splice(movingIndex, 1);
    const nextTargetIndex = order.indexOf(targetPath);
    const insertIndex = placement === 'after' ? nextTargetIndex + 1 : nextTargetIndex;
    order.splice(insertIndex, 0, movingPath);

    this.settings.noteOrderByTag[tag] = order;
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }

  refreshTagShelfViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_SHELF_VIEW_TYPE)) {
      if (leaf.view && typeof leaf.view.refresh === 'function') {
        leaf.view.refresh();
      }
    }
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
  display: flex;
  align-items: center;
  cursor: pointer;
}

.puffs-tag-note-card .tree-item-inner {
  flex: 1 1 auto;
  min-width: 0;
}

.puffs-tag-note-card .tree-item-inner-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.puffs-tag-hidden {
  display: none !important;
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

.puffs-tag-shelf-view {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 0 !important;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  background: var(--background-primary);
}

.puffs-tag-shelf-page {
  box-sizing: border-box;
  width: min(100%, 1120px);
  margin: 0 auto;
  padding: 18px 20px 28px;
}

.puffs-tag-shelf-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  margin-bottom: 14px;
}

.puffs-tag-shelf-title {
  margin: 0;
  color: var(--text-normal);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.25;
}

.puffs-tag-shelf-summary {
  display: grid;
  grid-template-columns: repeat(2, 20%);
  gap: 10px;
  margin-bottom: 16px;
}

.puffs-tag-shelf-summary-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--text-muted) 16%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--text-muted) 5%, transparent);
}

.puffs-tag-shelf-summary-label {
  color: var(--text-muted);
  font-size: 12px;
}

.puffs-tag-shelf-summary-value {
  margin-top: 4px;
  color: var(--text-normal);
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.puffs-tag-shelf-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
  margin: 18px 0;
}

.puffs-tag-shelf-section-title {
  margin: 0;
  color: var(--text-normal);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.25;
}

.puffs-tag-shelf-search-host,
.puffs-tag-shelf-search-container {
  width: min(210px, 26vw);
  min-width: 110px;
}

.puffs-tag-shelf-search-container input {
  width: 100%;
}

.puffs-tag-shelf-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
}

.puffs-tag-shelf-card {
  position: relative;
  width: 100%;
}

.puffs-tag-shelf-card .tree-item-self.is-clickable .tree-item-inner {
  font-size: var(--puffs-tag-shelf-tree-font-size) !important;
  line-height: var(--puffs-tag-shelf-tree-line-height) !important;
  font-weight: var(--puffs-tag-shelf-tree-font-weight) !important;
  letter-spacing: var(--puffs-tag-shelf-tree-letter-spacing) !important;
}

.puffs-tag-shelf-tag-row {
  align-items: var(--puffs-tag-shelf-row-align-items, center) !important;
  min-height: 30px;
  margin-inline-start: 0 !important;
  padding-inline-start: 24px !important;
}

.puffs-tag-shelf-tag-row .tree-item-flair {
  display: var(--puffs-tag-shelf-flair-display, flex) !important;
  align-items: var(--puffs-tag-shelf-flair-align-items, center) !important;
  font-size: var(--puffs-tag-shelf-flair-font-size, 16px) !important;
  line-height: var(--puffs-tag-shelf-flair-line-height, 1) !important;
}

.puffs-tag-shelf-notes {
  display: block;
}

.puffs-tag-note-list,
.puffs-tag-note-item {
  position: relative;
}

.puffs-tag-shelf-note-card {
  width: auto;
  min-height: 28px;
  margin-inline-start: -17px !important;
  padding-inline-start: 17px !important;
}

.puffs-tag-shelf-virtual .puffs-tag-shelf-note-card {
  padding-inline-start: 41px !important;
}

.puffs-tag-note-order-button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  padding: 4px;
  border: 0;
  border-radius: var(--radius-s);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
}

.puffs-tag-note-order-button:hover {
  background: var(--background-modifier-hover);
  color: var(--text-muted);
}

.puffs-tag-note-order-button.is-selected {
  background: color-mix(in srgb, var(--interactive-accent) 16%, transparent);
  color: var(--interactive-accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 45%, transparent);
}

.puffs-tag-note-order-button svg {
  width: 14px;
  height: 14px;
}

.puffs-tag-note-item.is-order-selected > .puffs-tag-note-card {
  background: color-mix(in srgb, var(--interactive-accent) 8%, transparent);
}

.puffs-tag-shelf-empty {
  padding: 30px 18px;
  border: 1px dashed color-mix(in srgb, var(--text-muted) 20%, transparent);
  border-radius: 8px;
  color: var(--text-muted);
  text-align: center;
}

@media (max-width: 600px) {
  .puffs-tag-shelf-page {
    padding: 16px 14px 24px;
  }

  .puffs-tag-shelf-summary {
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  }

  .puffs-tag-shelf-section-header {
    align-items: stretch;
    flex-direction: column;
  }

  .puffs-tag-shelf-search-host,
  .puffs-tag-shelf-search-container {
    width: 100%;
    min-width: 0;
  }
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
    this.pointerdownHandler = (evt) => {
      if (!this.selectedNoteOrderTarget) return;
      const target = evt.target instanceof Element ? evt.target : null;
      if (target && target.closest('.puffs-tag-note-order-button')) return;
      this.clearNoteOrderTarget();
    };
    document.addEventListener('pointerdown', this.pointerdownHandler, true);
    this.register(() => {
      document.removeEventListener('keydown', this.keydownHandler, true);
      document.removeEventListener('pointerdown', this.pointerdownHandler, true);
      this.keydownHandler = null;
      this.pointerdownHandler = null;
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
    const scheduleRefresh = (file) => this.scheduleMetadataRefresh(file);

    this.registerEvent(this.app.metadataCache.on('changed', scheduleRefresh));
    this.registerEvent(this.app.metadataCache.on('deleted', scheduleRefresh));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.handlePreferredFileRename(file, oldPath);
      this.handleNoteOrderFileRename(file, oldPath);
      this.refreshTagViews();
      this.refreshTagShelfViews();
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      this.handlePreferredFileDelete(file);
      this.handleNoteOrderFileDelete(file);
      scheduleRefresh(file);
    }));
  }

  registerInitialMetadataRefresh() {
    const metadataCache = this.app.metadataCache;
    if (!metadataCache || typeof metadataCache.onCleanCache !== 'function') return;

    metadataCache.onCleanCache(() => {
      if (this.isUnloaded) return;

      this.refreshTagIndexAndViews(null, true);
      this.queueInitialTagIndexRefreshes();
    });
  }

  scheduleMetadataRefresh(file) {
    const changedPath = file instanceof TFile && file.extension === 'md' ? file.path : null;
    this.refreshTagIndexAndViews(changedPath);
    this.finishTagRenameProtectionIfSettled();
  }

  refreshTagIndexAndViews(changedPath = null, initializeNoteOrders = false) {
    if (this.isUnloaded) return;

    const noteOrderChanged = this.rebuildTagFileIndex(changedPath, initializeNoteOrders);
    if (noteOrderChanged) {
      this.saveSettings().catch((error) => {
        console.error('[Puffs Tag Enhance] Failed to persist note order:', error);
      });
    }
    this.refreshTagViews();
    this.refreshTagShelfViews();
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

  clearTagRenameProtectionTimer() {
    if (!this.tagRenameProtectionTimer) return;
    window.clearTimeout(this.tagRenameProtectionTimer);
    this.tagRenameProtectionTimer = null;
  }

  isTagRenameMetadataSettled(migration = this.activeTagRename) {
    if (!migration || !migration.committed) return false;

    const oldPaths = new Set((this.tagFileIndex.get(migration.oldTag) || []).map((file) => file.path));
    const newPaths = new Set((this.tagFileIndex.get(migration.newTag) || []).map((file) => file.path));
    return Array.from(migration.affectedPaths).every((path) => !oldPaths.has(path) && newPaths.has(path));
  }

  finishTagRenameProtectionIfSettled() {
    const migration = this.activeTagRename;
    if (!this.isTagRenameMetadataSettled(migration)) return false;

    this.clearTagRenameProtectionTimer();
    this.activeTagRename = null;
    this.refreshTagIndexAndViews();
    return true;
  }

  scheduleTagRenameProtectionFallback(migration) {
    this.clearTagRenameProtectionTimer();
    this.tagRenameProtectionTimer = window.setTimeout(() => {
      this.tagRenameProtectionTimer = null;
      if (this.activeTagRename !== migration) return;

      this.activeTagRename = null;
      this.refreshTagIndexAndViews();
    }, 5000);
  }

  rebuildTagFileIndex(changedPath = null, initializeNoteOrders = false) {
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

    let noteOrderChanged = false;
    if (initializeNoteOrders && !this.noteOrderTrackingReady) {
      noteOrderChanged = this.initializeNoteOrders(nextIndex);
      this.noteOrderTrackingReady = true;
    } else if (this.noteOrderTrackingReady && !this.activeTagRename) {
      noteOrderChanged = this.reconcileNoteOrders(nextIndex, changedPath);
    }

    this.tagFileIndex = nextIndex;
    this.reconcileExpandedTags();
    return noteOrderChanged;
  }

  initializeNoteOrders(nextIndex) {
    const nextOrders = {};

    for (const [tag, files] of nextIndex.entries()) {
      const currentPaths = files.map((file) => file.path);
      const currentPathSet = new Set(currentPaths);
      const savedOrder = Array.isArray(this.settings.noteOrderByTag[tag])
        ? this.settings.noteOrderByTag[tag]
        : [];
      const retainedPaths = savedOrder.filter((path) => currentPathSet.has(path));
      const retainedPathSet = new Set(retainedPaths);
      const remainingPaths = currentPaths.filter((path) => !retainedPathSet.has(path));
      const order = retainedPaths.concat(remainingPaths);
      if (order.length > 0) nextOrders[tag] = order;
    }

    const changed = JSON.stringify(nextOrders) !== JSON.stringify(this.settings.noteOrderByTag);
    if (changed) this.settings.noteOrderByTag = nextOrders;
    return changed;
  }

  reconcileNoteOrders(nextIndex, changedPath = null) {
    const nextOrders = {};

    for (const [tag, files] of nextIndex.entries()) {
      const currentPaths = files.map((file) => file.path);
      const currentPathSet = new Set(currentPaths);
      const savedOrder = Array.isArray(this.settings.noteOrderByTag[tag])
        ? this.settings.noteOrderByTag[tag]
        : [];
      const retainedPaths = savedOrder.filter((path) => currentPathSet.has(path));
      const savedPathSet = new Set(savedOrder);
      const addedPaths = currentPaths.filter((path) => !savedPathSet.has(path));

      if (changedPath && addedPaths.includes(changedPath)) {
        addedPaths.splice(addedPaths.indexOf(changedPath), 1);
        addedPaths.push(changedPath);
      }

      const order = this.settings.newNotePosition === 'start'
        ? addedPaths.reverse().concat(retainedPaths)
        : retainedPaths.concat(addedPaths);
      if (order.length > 0) nextOrders[tag] = order;
    }

    const changed = JSON.stringify(nextOrders) !== JSON.stringify(this.settings.noteOrderByTag);
    if (changed) this.settings.noteOrderByTag = nextOrders;
    return changed;
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

    const expandAllEl = view.collapseOrExpandAllEl;
    if (expandAllEl) {
      const onExpandAllClick = (evt) => {
        if (evt.button !== 0) return;

        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.toggleAllListModeTags(view);
      };

      expandAllEl.addEventListener('click', onExpandAllClick, true);
      patch.cleanup.push(() => expandAllEl.removeEventListener('click', onExpandAllClick, true));

      const tagSystemButtonEl = document.createElement('div');
      tagSystemButtonEl.className = 'clickable-icon nav-action-button puffs-tag-system-button';
      tagSystemButtonEl.setAttribute('aria-label', '打开标签系统');
      setIcon(tagSystemButtonEl, TAG_SYSTEM_ICON);
      expandAllEl.insertAdjacentElement('afterend', tagSystemButtonEl);

      const onTagSystemButtonClick = (evt) => {
        if (evt.button !== 0) return;
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.openTagShelf().catch((error) => {
          console.error('[Puffs Tag Enhance] Failed to open tag system:', error);
          new Notice('打开标签系统失败');
        });
      };

      tagSystemButtonEl.addEventListener('click', onTagSystemButtonClick, true);
      patch.cleanup.push(() => {
        tagSystemButtonEl.removeEventListener('click', onTagSystemButtonClick, true);
        tagSystemButtonEl.remove();
      });
    }

    this.patchMultiTagSearch(view, patch);

    const onTagPaneClick = (evt) => {
      const target = evt.target instanceof Element ? evt.target : null;
      if (!target || !view.containerEl.contains(target)) return;

      const orderButtonEl = target.closest('.puffs-tag-note-order-button');
      if (orderButtonEl) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.toggleNoteOrderTarget(
          orderButtonEl.dataset.puffsTag,
          orderButtonEl.dataset.path,
          'sidebar'
        );
        return;
      }

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
      this.hideHierarchyButton(view);
      this.registerTagViewHotkey(view, patch);

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

  hideHierarchyButton(view) {
    const buttonEl = view.useHierarchyEl;
    if (!buttonEl) return;

    buttonEl.classList.add('puffs-tag-hidden');
    buttonEl.setAttribute('aria-hidden', 'true');
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
        files: this.getOrderedFilesForTag(normalizedTag, this.tagFileIndex.get(normalizedTag) || []),
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
    const items = [];
    const seenCombinations = new Set();
    const pushCombination = (selectedTags) => {
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

    if (terms.length === 1) {
      const baseTags = tags.filter((tag) => tagMatchesAnySearchTerm(tag, terms));
      for (const baseTag of baseTags) {
        for (const relatedTag of tags) {
          if (relatedTag === baseTag) continue;
          pushCombination([baseTag, relatedTag]);
        }
      }
    } else {
      const candidateGroups = terms.map((term) =>
        tags.filter((tag) => tagMatchesAnySearchTerm(tag, [term]))
      );
      if (candidateGroups.some((candidates) => candidates.length === 0)) return [];

      const visitCombinations = (groupIndex, selectedTags) => {
        if (groupIndex < candidateGroups.length) {
          for (const tag of candidateGroups[groupIndex]) {
            if (selectedTags.includes(tag)) continue;
            visitCombinations(groupIndex + 1, [...selectedTags, tag]);
          }
          return;
        }

        pushCombination(selectedTags);
      };

      visitCombinations(0, []);
    }

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
      this.renderNoteList(treeItemEl, files, tag, isVirtual);
    }

    listEl.appendChild(treeItemEl);
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
      this.renderNoteList(treeItemEl, files, tag, false);
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

  renderNoteList(treeItemEl, files, tagValue, isVirtual = false) {
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

    const tag = normalizeTag(tagValue);
    const canReorder = !!tag && !isVirtual && !isNestedTag(tag);
    for (const file of files) {
      const itemEl = document.createElement('div');
      itemEl.className = 'tree-item puffs-tag-note-item';
      itemEl.dataset.path = file.path;
      itemEl.classList.toggle(
        'is-order-selected',
        this.isNoteOrderTargetSelected(tag, file.path)
      );

      const cardEl = document.createElement('div');
      cardEl.className = 'tree-item-self puffs-tag-note-card is-clickable';
      cardEl.dataset.path = file.path;
      cardEl.style.marginInlineStart = '-17px';
      cardEl.style.setProperty('margin-inline-start', '-17px', 'important');
      cardEl.style.paddingInlineStart = canReorder ? '17px' : '41px';
      cardEl.style.setProperty('padding-inline-start', canReorder ? '17px' : '41px', 'important');

      if (canReorder) {
        const orderButtonEl = document.createElement('button');
        orderButtonEl.type = 'button';
        orderButtonEl.className = 'clickable-icon puffs-tag-note-order-button';
        orderButtonEl.dataset.puffsTag = tag;
        orderButtonEl.dataset.path = file.path;
        orderButtonEl.dataset.puffsSurface = 'sidebar';
        orderButtonEl.setAttribute('aria-label', '选中笔记并使用快捷键调整顺序');
        setIcon(orderButtonEl, 'list-todo');
        this.syncNoteOrderButtonSelection(orderButtonEl);
        cardEl.appendChild(orderButtonEl);
      }

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
    if (this.activeTagRename) throw new Error('上一次标签修改仍在同步，请稍后再试');

    this.rebuildTagFileIndex();
    const files = Array.from(new Set(this.tagFileIndex.get(oldTag) || []));
    const oldNoteOrder = this.getOrderedFilesForTag(oldTag, files).map((file) => file.path);
    const existingNewFiles = Array.from(new Set(this.tagFileIndex.get(newTag) || []));
    const existingNewOrder = this.getOrderedFilesForTag(newTag, existingNewFiles).map((file) => file.path);
    const migratedOrder = Array.from(new Set([...oldNoteOrder, ...existingNewOrder]));
    const migration = {
      oldTag,
      newTag,
      affectedPaths: new Set(files.map((file) => file.path)),
      committed: false,
    };

    this.activeTagRename = migration;

    try {
      for (const file of files) {
        await this.renameTagInFile(file, oldTag, newTag);
      }

      if (this.expandedTags.delete(oldTag)) {
        this.expandedTags.add(newTag);
      }

      if (migratedOrder.length > 0) {
        this.settings.noteOrderByTag[newTag] = migratedOrder;
      } else {
        delete this.settings.noteOrderByTag[newTag];
      }
      delete this.settings.noteOrderByTag[oldTag];
      this.settings.noteOrderByTag = this.normalizeNoteOrderByTag(this.settings.noteOrderByTag);
      await this.saveSettings();

      migration.committed = true;
      this.refreshTagIndexAndViews();
      if (!this.finishTagRenameProtectionIfSettled()) {
        this.scheduleTagRenameProtectionFallback(migration);
      }
    } catch (error) {
      if (this.activeTagRename === migration) {
        this.activeTagRename = null;
        this.clearTagRenameProtectionTimer();
        this.refreshTagIndexAndViews();
      }
      throw error;
    }
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

  restoreAllTagViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_VIEW_TYPE)) {
      if (!leaf.view) continue;

      this.clearListEnhancements(leaf.view);
      if (leaf.view.useHierarchy !== true && typeof leaf.view.setUseHierarchy === 'function') {
        leaf.view.setUseHierarchy(true);
      }

      const buttonEl = leaf.view.useHierarchyEl;
      if (buttonEl) {
        buttonEl.classList.remove('puffs-tag-hidden');
        buttonEl.removeAttribute('aria-hidden');
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
      .setName('选中笔记上移快捷键')
      .setDesc('点击笔记左侧的任务列表按钮后，使用该快捷键将笔记上移一格')
      .addText((text) => {
        text
          .setValue(this.plugin.getMoveNoteUpHotkeyDisplay())
          .setPlaceholder(DEFAULT_MOVE_NOTE_UP_HOTKEY)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ moveNoteUpHotkey: value });
          });
      });

    new Setting(containerEl)
      .setName('选中笔记下移快捷键')
      .setDesc('点击笔记左侧的任务列表按钮后，使用该快捷键将笔记下移一格')
      .addText((text) => {
        text
          .setValue(this.plugin.getMoveNoteDownHotkeyDisplay())
          .setPlaceholder(DEFAULT_MOVE_NOTE_DOWN_HOTKEY)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ moveNoteDownHotkey: value });
          });
      });

    new Setting(containerEl)
      .setName('新笔记卡片位置')
      .setDesc('只决定之后新加入标签的笔记卡片位置，不会重排现有卡片')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('end', '放在最后')
          .addOption('start', '放在最前')
          .setValue(this.plugin.settings.newNotePosition)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ newNotePosition: value });
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
