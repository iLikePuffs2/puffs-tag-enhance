var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => main_default
});
module.exports = __toCommonJS(main_exports);
var import_obsidian10 = require("obsidian");

// src/models.ts
var import_obsidian = require("obsidian");
var TAG_VIEW_TYPE = "tag";
var TAG_SHELF_VIEW_TYPE = "puffs-tag-shelf-view";
var OUTLINE_VIEW_TYPE = "outline";
var MARKDOWN_VIEW_TYPE = "markdown";
var VIEW_SYNC_DELAY_MS = 30;
var DEFAULT_QUICK_SEARCH_HOTKEY = "Ctrl + F";
var DEFAULT_MOVE_NOTE_UP_HOTKEY = "Alt + Shift + \u2191";
var DEFAULT_MOVE_NOTE_DOWN_HOTKEY = "Alt + Shift + \u2193";
var LIST_MODE_ICON = "list-tree";
var TAG_SYSTEM_ICON = LIST_MODE_ICON;
var INITIAL_TAG_INDEX_REFRESH_DELAYS_MS = [0, 500, 1500, 3e3, 6e3];
var BACKUP_FILE_NAME = "tag-data.md";
var MAX_BACKUP_INTERVAL_MINUTES = Math.floor(2147483647 / 6e4);
var DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD = 10;
var DEFAULT_SETTINGS = {
  autoSwitchToOutlineEnabled: true,
  freezeSearchWhileComposing: true,
  tagSidebarPreferredFiles: {},
  noteOrderByTag: {},
  newNotePosition: "end",
  toggleSearchHotkey: DEFAULT_QUICK_SEARCH_HOTKEY,
  moveNoteUpHotkey: DEFAULT_MOVE_NOTE_UP_HOTKEY,
  moveNoteDownHotkey: DEFAULT_MOVE_NOTE_DOWN_HOTKEY,
  backupIntervalMinutes: 0,
  backupFolderPath: "",
  pinnedTag: null,
  scrollTopButtonThreshold: DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD
};
function normalizeTag(rawTag) {
  if (!rawTag) return null;
  const tag = String(rawTag).trim();
  if (!tag) return null;
  return tag.startsWith("#") ? tag : `#${tag}`;
}
function normalizeNewNotePosition(value) {
  return value === "start" ? "start" : "end";
}
function normalizeBackupInterval(value) {
  const minutes = Math.floor(Number(value));
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.min(minutes, MAX_BACKUP_INTERVAL_MINUTES);
}
function normalizeScrollTopButtonThreshold(value) {
  const threshold = Math.floor(Number(value));
  if (!Number.isFinite(threshold)) return DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD;
  return Math.max(0, threshold);
}
function normalizeBackupFolderPath(value) {
  const text = String(value || "").trim().replace(/\\/g, "/");
  if (!text) return "";
  const segments = text.split("/").map((segment) => segment.trim()).filter((segment) => segment && segment !== ".");
  if (segments.some((segment) => segment === ".." || segment.includes(":"))) return "";
  return (0, import_obsidian.normalizePath)(segments.join("/"));
}
function isNestedTag(tag) {
  return String(tag || "").includes("/");
}
function getTagDisplayName(tag) {
  return String(tag || "").replace(/^#/, "");
}
function normalizeSearchTerm(value) {
  return String(value || "").trim().replace(/^#/, "").toLowerCase();
}
function parseNoteCardSearch(value) {
  const text = String(value || "");
  const firstDelimiter = text.indexOf("*");
  if (firstDelimiter < 0) return null;
  const tagQuery = text.slice(0, firstDelimiter).trim();
  const noteQuery = text.slice(firstDelimiter + 1).trim();
  const hasSingleDelimiter = firstDelimiter === text.lastIndexOf("*");
  const mixesTagOperators = tagQuery.includes("|") && tagQuery.includes("&");
  return {
    tagQuery,
    noteQuery,
    isValid: !!tagQuery && !!noteQuery && hasSingleDelimiter && !mixesTagOperators,
    isTagOnly: !!tagQuery && !noteQuery && hasSingleDelimiter && !mixesTagOperators
  };
}
function getTagFilterQuery(value) {
  const noteCardSearch = parseNoteCardSearch(value);
  return noteCardSearch ? noteCardSearch.tagQuery : String(value || "");
}
function fileMatchesNoteSearch(file, value) {
  const term = String(value || "").trim().toLowerCase();
  return !!term && String(file && file.basename || "").toLowerCase().includes(term);
}
function splitUnionSearchTerms(value) {
  const text = String(value || "");
  if (!text.includes("|") || text.includes("&")) return null;
  const terms = text.split("|").map(normalizeSearchTerm).filter(Boolean);
  return terms.length > 0 ? Array.from(new Set(terms)) : null;
}
function splitIntersectionSearchTerms(value) {
  const text = String(value || "");
  if (!text.includes("&") || text.includes("|")) return null;
  const parts = text.split("&").map(normalizeSearchTerm);
  const isTrailingSuggestionSearch = parts.length === 2 && parts[0] && !parts[1];
  if (isTrailingSuggestionSearch) return [parts[0]];
  const terms = parts.filter(Boolean);
  return terms.length >= 2 ? terms : null;
}
function tagMatchesAnySearchTerm(tag, terms) {
  if (!terms) return true;
  const tagName = getTagDisplayName(tag).toLowerCase();
  const tagText = String(tag || "").toLowerCase();
  return terms.some((term) => tagName.includes(term) || tagText.includes(term));
}
function tagMatchesSearchText(tag, value) {
  const term = String(value || "").trim().replace(/^#/, "").toLowerCase();
  if (!term) return true;
  const tagName = getTagDisplayName(tag).toLowerCase();
  const tagText = String(tag || "").toLowerCase();
  return tagName.includes(term) || tagText.includes(term);
}
function createMultiTagSearchQuery(query, terms) {
  return {
    query,
    matcher: true,
    matchContent: (content) => tagMatchesAnySearchTerm(content, terms)
  };
}
function createTagFilterSearchQuery(query, tagQuery) {
  const unionTerms = splitUnionSearchTerms(tagQuery);
  const intersectionTerms = splitIntersectionSearchTerms(tagQuery);
  const mixesTagOperators = tagQuery.includes("|") && tagQuery.includes("&");
  return {
    query,
    matcher: true,
    matchContent: (content) => {
      if (mixesTagOperators) return false;
      if (unionTerms || intersectionTerms) {
        return tagMatchesAnySearchTerm(content, unionTerms || intersectionTerms);
      }
      return tagMatchesSearchText(content, tagQuery);
    }
  };
}
function createNoteCardSearchState() {
  return {
    query: "",
    matches: [],
    activeIndex: -1,
    target: null,
    autoExpandedTag: null,
    autoExpandedWasAlreadyExpanded: false,
    lastScrolledKey: "",
    pendingScrollKey: "",
    effectTimer: null
  };
}
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    nextContent = nextContent.slice(0, replacement.start) + newTag + nextContent.slice(replacement.end);
  }
  return nextContent;
}
function replaceInlineTagsByText(content, oldTag, newTag) {
  const oldName = escapeRegExp(getTagDisplayName(oldTag));
  const tagPattern = new RegExp(`(^|[^\\p{L}\\p{N}_/#-])#${oldName}(?![\\p{L}\\p{N}_/-])`, "gu");
  return content.replace(tagPattern, (match, prefix) => `${prefix}${newTag}`);
}
function getFrontmatterTagReplacement(originalValue, newTag) {
  const text = String(originalValue);
  return text.trim().startsWith("#") ? newTag : getTagDisplayName(newTag);
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
  return changed ? nextParts.join("") : value;
}
function replaceFrontmatterTagValue(value, oldTag, newTag) {
  if (Array.isArray(value)) {
    return value.map((item) => replaceFrontmatterTagValue(item, oldTag, newTag));
  }
  if (typeof value === "string") {
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
  return typeof stateFile === "string" ? stateFile : null;
}
function flattenFrontmatterTags(value, output = []) {
  if (!value) return output;
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenFrontmatterTags(item, output);
    }
    return output;
  }
  if (typeof value === "string") {
    for (const tag of value.split(/[\s,]+/)) {
      if (tag) output.push(tag);
    }
    return output;
  }
  output.push(String(value));
  return output;
}
function frontmatterTagValueHasTag(value, tagValue) {
  const tag = normalizeTag(tagValue);
  if (!tag) return false;
  return flattenFrontmatterTags(value).some((item) => normalizeTag(item) === tag);
}
function normalizeHotkeyKey(value) {
  const key = String(value || "").trim();
  const normalized = key.toLowerCase();
  if (key === "\u2191" || normalized === "arrowup" || normalized === "up") return "ArrowUp";
  if (key === "\u2193" || normalized === "arrowdown" || normalized === "down") return "ArrowDown";
  return key.length === 1 ? key.toUpperCase() : key;
}
function formatHotkeyKey(key) {
  if (key === "ArrowUp") return "\u2191";
  if (key === "ArrowDown") return "\u2193";
  return key;
}
function parseHotkeyText(value, fallback = DEFAULT_QUICK_SEARCH_HOTKEY) {
  const text = String(value || fallback).trim();
  const parts = text.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return parseHotkeyText(fallback, fallback);
  const key = parts.pop();
  const modifiers = [];
  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (normalized === "ctrl" || normalized === "control") {
      modifiers.push("Ctrl");
    } else if (normalized === "cmd" || normalized === "command" || normalized === "meta") {
      modifiers.push("Meta");
    } else if (normalized === "mod") {
      modifiers.push("Mod");
    } else if (normalized === "shift") {
      modifiers.push("Shift");
    } else if (normalized === "alt" || normalized === "option") {
      modifiers.push("Alt");
    }
  }
  if (!key) return parseHotkeyText(fallback, fallback);
  return {
    modifiers: Array.from(new Set(modifiers)),
    key: normalizeHotkeyKey(key)
  };
}
function formatHotkey(parsedHotkey) {
  return [...parsedHotkey.modifiers, formatHotkeyKey(parsedHotkey.key)].join(" + ");
}
function normalizeHotkeyText(value, fallback = DEFAULT_QUICK_SEARCH_HOTKEY) {
  return formatHotkey(parseHotkeyText(value, fallback));
}

// src/views.ts
var import_obsidian2 = require("obsidian");
var PuffsTagShelfView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.searchQuery = "";
    this.expandedTags = /* @__PURE__ */ new Set();
    this.autoExpandedTag = null;
    this.autoExpandedWasAlreadyExpanded = false;
    this.searchComponent = null;
    this.isShowingSearch = true;
    this.searchHotkeyHandler = null;
    this.searchCompositionCleanup = null;
    this.isSearchComposing = false;
    this.noteCardSearchState = createNoteCardSearchState();
    this.listEl = null;
    this.summaryTagCountEl = null;
    this.summaryNoteCountEl = null;
  }
  getViewType() {
    return TAG_SHELF_VIEW_TYPE;
  }
  getDisplayText() {
    return "\u6807\u7B7E\u7CFB\u7EDF";
  }
  getIcon() {
    return TAG_SYSTEM_ICON;
  }
  async onOpen() {
    this.searchHotkeyHandler = (event) => this.handleSearchHotkey(event);
    window.addEventListener("keydown", this.searchHotkeyHandler, true);
    document.addEventListener("keydown", this.searchHotkeyHandler, true);
    this.render();
  }
  async onClose() {
    this.clearSearchCompositionHandlers();
    if (this.searchHotkeyHandler) {
      window.removeEventListener("keydown", this.searchHotkeyHandler, true);
      document.removeEventListener("keydown", this.searchHotkeyHandler, true);
      this.searchHotkeyHandler = null;
    }
    this.plugin.clearNoteCardSearchState(this.noteCardSearchState, this.expandedTags);
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
      this.searchComponent.setValue("");
      if (inputEl.value !== "") {
        inputEl.value = "";
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (this.searchQuery !== "") {
        this.searchQuery = "";
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
    return this.app.workspace.activeLeaf === this.leaf || !!this.contentEl.closest(".workspace-leaf.mod-active") || this.contentEl.contains(document.activeElement);
  }
  render() {
    this.clearSearchCompositionHandlers();
    this.contentEl.empty();
    this.contentEl.classList.add("puffs-tag-shelf-view");
    const pageEl = document.createElement("div");
    pageEl.className = "puffs-tag-shelf-page";
    this.syncSidebarTreeStyles(pageEl);
    const headerEl = document.createElement("div");
    headerEl.className = "puffs-tag-shelf-header";
    const titleEl = document.createElement("h3");
    titleEl.className = "puffs-tag-shelf-title";
    titleEl.textContent = "\u6807\u7B7E\u7CFB\u7EDF";
    headerEl.appendChild(titleEl);
    pageEl.appendChild(headerEl);
    const summaryEl = document.createElement("div");
    summaryEl.className = "puffs-tag-shelf-summary";
    const tagSummary = this.createSummaryCard("\u6807\u7B7E\u6570\u91CF", "0 \u4E2A");
    const noteSummary = this.createSummaryCard("\u7B14\u8BB0\u6570\u91CF", "0 \u7BC7");
    this.summaryTagCountEl = tagSummary.valueEl;
    this.summaryNoteCountEl = noteSummary.valueEl;
    summaryEl.appendChild(tagSummary.cardEl);
    summaryEl.appendChild(noteSummary.cardEl);
    pageEl.appendChild(summaryEl);
    const sectionHeaderEl = document.createElement("div");
    sectionHeaderEl.className = "puffs-tag-shelf-section-header";
    const sectionTitleEl = document.createElement("h3");
    sectionTitleEl.className = "puffs-tag-shelf-section-title";
    sectionTitleEl.textContent = "\u6807\u7B7E\u5217\u8868";
    const searchHostEl = document.createElement("div");
    searchHostEl.className = "puffs-tag-shelf-search-host";
    this.searchComponent = new import_obsidian2.SearchComponent(searchHostEl);
    this.searchComponent.containerEl.classList.add("puffs-tag-shelf-search-container");
    this.searchComponent.inputEl.classList.add("puffs-tag-shelf-search-input");
    this.searchComponent.setPlaceholder("\u641C\u7D22\u6807\u7B7E");
    this.searchComponent.setValue(this.searchQuery);
    const searchInputEl = this.searchComponent.inputEl;
    const applySearchValue = (value) => {
      if (value === this.searchQuery) return;
      this.searchQuery = value;
      this.renderTagList();
      if (value.trim() && !value.includes("*")) {
        window.requestAnimationFrame(() => {
          if (this.contentEl && this.contentEl.isConnected) this.contentEl.scrollTop = 0;
        });
      }
    };
    const onCompositionStart = () => {
      this.isSearchComposing = this.plugin.settings.freezeSearchWhileComposing;
    };
    const onCompositionEnd = () => {
      this.isSearchComposing = false;
      applySearchValue(searchInputEl.value);
    };
    searchInputEl.addEventListener("compositionstart", onCompositionStart);
    searchInputEl.addEventListener("compositionend", onCompositionEnd);
    this.searchCompositionCleanup = () => {
      searchInputEl.removeEventListener("compositionstart", onCompositionStart);
      searchInputEl.removeEventListener("compositionend", onCompositionEnd);
      this.isSearchComposing = false;
      this.searchCompositionCleanup = null;
    };
    this.searchComponent.onChange((value) => {
      if (this.isSearchComposing) return;
      applySearchValue(value);
    });
    this.searchComponent.inputEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      if (!this.plugin.advanceNoteCardSearchState(this.noteCardSearchState, this.expandedTags)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.renderTagList();
    });
    sectionHeaderEl.appendChild(sectionTitleEl);
    sectionHeaderEl.appendChild(searchHostEl);
    pageEl.appendChild(sectionHeaderEl);
    this.listEl = document.createElement("div");
    this.listEl.className = "puffs-tag-shelf-list";
    pageEl.appendChild(this.listEl);
    this.contentEl.appendChild(pageEl);
    this.renderTagList();
  }
  clearSearchCompositionHandlers() {
    if (this.searchCompositionCleanup) {
      this.searchCompositionCleanup();
    } else {
      this.isSearchComposing = false;
    }
  }
  syncSidebarTreeStyles(pageEl) {
    const sidebarRowEl = document.querySelector(
      '.workspace-leaf-content[data-type="tag"] .tag-pane-tag'
    );
    if (!sidebarRowEl) return;
    const innerEl = sidebarRowEl.querySelector(".tree-item-inner");
    const flairEl = sidebarRowEl.querySelector(".tree-item-flair");
    const rowStyle = window.getComputedStyle(sidebarRowEl);
    pageEl.style.setProperty("--puffs-tag-shelf-row-align-items", rowStyle.alignItems);
    if (innerEl) {
      const innerStyle = window.getComputedStyle(innerEl);
      pageEl.style.setProperty("--puffs-tag-shelf-tree-font-size", innerStyle.fontSize);
      pageEl.style.setProperty("--puffs-tag-shelf-tree-line-height", innerStyle.lineHeight);
      pageEl.style.setProperty("--puffs-tag-shelf-tree-font-weight", innerStyle.fontWeight);
      pageEl.style.setProperty("--puffs-tag-shelf-tree-letter-spacing", innerStyle.letterSpacing);
    }
    if (flairEl) {
      const flairStyle = window.getComputedStyle(flairEl);
      pageEl.style.setProperty("--puffs-tag-shelf-flair-display", flairStyle.display);
      pageEl.style.setProperty("--puffs-tag-shelf-flair-align-items", flairStyle.alignItems);
      pageEl.style.setProperty("--puffs-tag-shelf-flair-font-size", flairStyle.fontSize);
      pageEl.style.setProperty("--puffs-tag-shelf-flair-line-height", flairStyle.lineHeight);
    }
  }
  createSummaryCard(label, value) {
    const cardEl = document.createElement("div");
    cardEl.className = "puffs-tag-shelf-summary-card";
    const labelEl = document.createElement("div");
    labelEl.className = "puffs-tag-shelf-summary-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("div");
    valueEl.className = "puffs-tag-shelf-summary-value";
    valueEl.textContent = value;
    cardEl.appendChild(labelEl);
    cardEl.appendChild(valueEl);
    return { cardEl, valueEl };
  }
  renderTagList() {
    if (!this.listEl || !this.summaryTagCountEl || !this.summaryNoteCountEl) return;
    const query = this.searchQuery.trim();
    const effectiveQuery = this.plugin.resolvePinnedSearchQuery(query);
    const matchingItems = this.plugin.getTagShelfItems(effectiveQuery, false);
    const items = this.plugin.prependPinnedTagItem(matchingItems, query);
    const noteCardSearch = parseNoteCardSearch(effectiveQuery);
    if (noteCardSearch && noteCardSearch.isValid) {
      this.clearAutoExpandedTag();
      this.plugin.syncNoteCardSearchState(
        this.noteCardSearchState,
        effectiveQuery,
        matchingItems,
        this.expandedTags
      );
    } else {
      this.plugin.clearNoteCardSearchState(this.noteCardSearchState, this.expandedTags);
      if (!noteCardSearch || noteCardSearch.isTagOnly) {
        this.syncAutoSingleSearchResult(
          noteCardSearch ? noteCardSearch.tagQuery : effectiveQuery,
          matchingItems
        );
      } else {
        this.clearAutoExpandedTag();
      }
    }
    this.updateSummary(items);
    this.listEl.empty();
    if (items.length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.className = "puffs-tag-shelf-empty";
      emptyEl.textContent = query ? "\u6CA1\u6709\u5339\u914D\u7684\u6807\u7B7E\u3002" : "\u6682\u65E0\u53EF\u5C55\u793A\u7684\u6807\u7B7E\u3002";
      this.listEl.appendChild(emptyEl);
      this.plugin.scheduleNoteCardSearchEffect(
        this.listEl,
        this.searchComponent && this.searchComponent.inputEl,
        this.noteCardSearchState
      );
      return;
    }
    for (const item of items) {
      this.renderTagCard(item);
    }
    this.plugin.scheduleNoteCardSearchEffect(
      this.listEl,
      this.searchComponent && this.searchComponent.inputEl,
      this.noteCardSearchState
    );
  }
  updateSummary(items) {
    const uniqueNotePaths = /* @__PURE__ */ new Set();
    for (const item of items) {
      for (const file of item.files) uniqueNotePaths.add(file.path);
    }
    this.summaryTagCountEl.textContent = `${items.length} \u4E2A`;
    this.summaryNoteCountEl.textContent = `${uniqueNotePaths.size} \u7BC7`;
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
    const treeItemEl = document.createElement("div");
    treeItemEl.className = "tree-item puffs-tag-list-item puffs-tag-shelf-card";
    treeItemEl.classList.toggle("puffs-tag-expanded", isExpanded);
    treeItemEl.classList.toggle("puffs-tag-shelf-virtual", !!isVirtual);
    const tagEl = document.createElement("div");
    tagEl.className = "tree-item-self tag-pane-tag is-clickable mod-collapsible puffs-tag-list-row puffs-tag-shelf-tag-row";
    tagEl.dataset.puffsTag = tag;
    if (isVirtual) tagEl.dataset.puffsVirtualTag = "true";
    const toggleEl = document.createElement("div");
    toggleEl.className = "tree-item-icon collapse-icon puffs-tag-list-toggle";
    toggleEl.classList.toggle("is-collapsed", !isExpanded);
    toggleEl.setAttribute("aria-hidden", "true");
    (0, import_obsidian2.setIcon)(toggleEl, "right-triangle");
    const innerEl = document.createElement("div");
    innerEl.className = "tree-item-inner";
    const textEl = document.createElement("div");
    textEl.className = "tree-item-inner-text";
    textEl.textContent = displayName;
    const flairOuterEl = document.createElement("div");
    flairOuterEl.className = "tree-item-flair-outer";
    const countEl = document.createElement("span");
    countEl.className = "tag-pane-tag-count tree-item-flair";
    countEl.textContent = String(files.length);
    let scrollBottomButtonEl = null;
    let pinButtonEl = null;
    if (isExpanded) {
      scrollBottomButtonEl = document.createElement("button");
      scrollBottomButtonEl.type = "button";
      scrollBottomButtonEl.className = "clickable-icon puffs-tag-scroll-bottom-button";
      scrollBottomButtonEl.dataset.puffsTag = tag;
      (0, import_obsidian2.setIcon)(scrollBottomButtonEl, "arrow-down-to-line");
      scrollBottomButtonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.plugin.scheduleLastNoteCardScroll(this.listEl, tag);
      });
      if (!isVirtual) {
        pinButtonEl = document.createElement("button");
        pinButtonEl.type = "button";
        pinButtonEl.className = "clickable-icon puffs-tag-pin-button";
        pinButtonEl.dataset.puffsTag = tag;
        pinButtonEl.classList.toggle("is-active", this.plugin.settings.pinnedTag === tag);
        (0, import_obsidian2.setIcon)(pinButtonEl, "pin");
        pinButtonEl.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.plugin.togglePinnedTag(tag).catch((error) => {
            console.error("[Puffs Tag Enhance] Failed to toggle pinned tag:", error);
          });
        });
      }
    }
    innerEl.appendChild(textEl);
    flairOuterEl.appendChild(countEl);
    tagEl.appendChild(toggleEl);
    tagEl.appendChild(innerEl);
    if (scrollBottomButtonEl) tagEl.appendChild(scrollBottomButtonEl);
    if (pinButtonEl) tagEl.appendChild(pinButtonEl);
    tagEl.appendChild(flairOuterEl);
    treeItemEl.appendChild(tagEl);
    tagEl.addEventListener("click", () => {
      if (this.expandedTags.has(tag)) this.expandedTags.delete(tag);
      else this.expandedTags.add(tag);
      this.renderTagList();
    });
    tagEl.addEventListener("contextmenu", (event) => {
      if (isVirtual) return;
      event.preventDefault();
      this.plugin.openRenameTagModal(tag);
    });
    if (isExpanded) {
      const notesEl = document.createElement("div");
      notesEl.className = "tree-item-children puffs-tag-note-list puffs-tag-shelf-notes";
      for (const [fileIndex, file] of files.entries()) {
        const noteItemEl = document.createElement("div");
        noteItemEl.className = "tree-item puffs-tag-note-item puffs-tag-shelf-note-item";
        noteItemEl.dataset.path = file.path;
        noteItemEl.classList.toggle(
          "is-order-selected",
          this.plugin.isNoteOrderTargetSelected(tag, file.path)
        );
        const noteCardEl = document.createElement("div");
        noteCardEl.className = "tree-item-self puffs-tag-note-card is-clickable puffs-tag-shelf-note-card";
        noteCardEl.dataset.path = file.path;
        if (!isVirtual) {
          noteCardEl.dataset.puffsTag = tag;
          noteCardEl.dataset.puffsSurface = "shelf";
          const orderButtonEl = document.createElement("button");
          orderButtonEl.type = "button";
          orderButtonEl.className = "clickable-icon puffs-tag-note-order-button";
          orderButtonEl.dataset.puffsTag = tag;
          orderButtonEl.dataset.path = file.path;
          orderButtonEl.dataset.puffsSurface = "shelf";
          (0, import_obsidian2.setIcon)(orderButtonEl, "grip-vertical");
          this.plugin.syncNoteOrderButtonSelection(orderButtonEl);
          orderButtonEl.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.plugin.toggleNoteOrderTarget(tag, file.path, "shelf");
          });
          noteCardEl.appendChild(orderButtonEl);
        }
        const noteInnerEl = document.createElement("div");
        noteInnerEl.className = "tree-item-inner";
        const noteTextEl = document.createElement("div");
        noteTextEl.className = "tree-item-inner-text";
        noteTextEl.textContent = file.basename;
        noteInnerEl.appendChild(noteTextEl);
        noteCardEl.appendChild(noteInnerEl);
        const scrollTopButtonThreshold = this.plugin.settings.scrollTopButtonThreshold;
        if (scrollTopButtonThreshold > 0 && files.length >= scrollTopButtonThreshold && fileIndex === files.length - 1) {
          const scrollTopButtonEl = document.createElement("button");
          scrollTopButtonEl.type = "button";
          scrollTopButtonEl.className = "clickable-icon puffs-tag-scroll-top-button";
          scrollTopButtonEl.dataset.puffsTag = tag;
          (0, import_obsidian2.setIcon)(scrollTopButtonEl, "arrow-up-to-line");
          scrollTopButtonEl.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.plugin.scheduleTagTopScroll(this.listEl, tag);
          });
          noteCardEl.appendChild(scrollTopButtonEl);
        }
        noteCardEl.addEventListener("click", () => {
          this.plugin.openNoteCard(noteCardEl).catch((error) => {
            console.error("[Puffs Tag Enhance] Failed to open note:", error);
            new import_obsidian2.Notice("\u6253\u5F00\u7B14\u8BB0\u5931\u8D25");
          });
        });
        noteItemEl.appendChild(noteCardEl);
        notesEl.appendChild(noteItemEl);
      }
      treeItemEl.appendChild(notesEl);
    }
    this.listEl.appendChild(treeItemEl);
  }
};

// src/settings.ts
var import_obsidian3 = require("obsidian");
var PuffsTagEnhanceSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian3.Setting(containerEl).setName("\u81EA\u52A8\u5207\u5230\u5927\u7EB2\u6807\u7B7E\u9875").setDesc("\u5F00\u542F\u540E\uFF0C\u63D2\u4EF6\u4F1A\u6309\u5F53\u524D\u7B14\u8BB0\u7684\u4FA7\u8FB9\u680F\u504F\u597D\u5728\u6807\u7B7E\u5217\u8868\u548C\u5927\u7EB2\u4E4B\u95F4\u81EA\u52A8\u5207\u6362").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.autoSwitchToOutlineEnabled).onChange(async (value) => {
        await this.plugin.updateSettings({ autoSwitchToOutlineEnabled: value });
      });
    });
    new import_obsidian3.Setting(containerEl).setName("\u8F93\u5165\u6CD5\u7EC4\u5408\u671F\u95F4\u4FDD\u6301\u641C\u7D22\u7ED3\u679C").setDesc("\u5F00\u542F\u540E\uFF0C\u4F7F\u7528\u4E2D\u6587\u8F93\u5165\u6CD5\u8F93\u5165\u62FC\u97F3\u65F6\u4FDD\u6301\u4E0A\u4E00\u6B21\u641C\u7D22\u7ED3\u679C\uFF0C\u786E\u8BA4\u5019\u9009\u5B57\u540E\u518D\u5237\u65B0").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.freezeSearchWhileComposing).onChange(async (value) => {
        await this.plugin.updateSettings({ freezeSearchWhileComposing: value });
      });
    });
    new import_obsidian3.Setting(containerEl).setName("\u5F39\u51FA/\u6536\u8D77\u641C\u7D22\u680F\u5FEB\u6377\u952E").addText((text) => {
      text.setValue(this.plugin.getQuickSearchHotkeyDisplay()).setPlaceholder(DEFAULT_QUICK_SEARCH_HOTKEY).onChange(async (value) => {
        await this.plugin.updateSettings({ toggleSearchHotkey: value });
      });
    });
    new import_obsidian3.Setting(containerEl).setName("\u9009\u4E2D\u7B14\u8BB0\u4E0A\u79FB\u5FEB\u6377\u952E").setDesc("\u70B9\u51FB\u7B14\u8BB0\u5DE6\u4FA7\u7684\u4EFB\u52A1\u5217\u8868\u6309\u94AE\u540E\uFF0C\u4F7F\u7528\u8BE5\u5FEB\u6377\u952E\u5C06\u7B14\u8BB0\u4E0A\u79FB\u4E00\u683C").addText((text) => {
      text.setValue(this.plugin.getMoveNoteUpHotkeyDisplay()).setPlaceholder(DEFAULT_MOVE_NOTE_UP_HOTKEY).onChange(async (value) => {
        await this.plugin.updateSettings({ moveNoteUpHotkey: value });
      });
    });
    new import_obsidian3.Setting(containerEl).setName("\u9009\u4E2D\u7B14\u8BB0\u4E0B\u79FB\u5FEB\u6377\u952E").setDesc("\u70B9\u51FB\u7B14\u8BB0\u5DE6\u4FA7\u7684\u4EFB\u52A1\u5217\u8868\u6309\u94AE\u540E\uFF0C\u4F7F\u7528\u8BE5\u5FEB\u6377\u952E\u5C06\u7B14\u8BB0\u4E0B\u79FB\u4E00\u683C").addText((text) => {
      text.setValue(this.plugin.getMoveNoteDownHotkeyDisplay()).setPlaceholder(DEFAULT_MOVE_NOTE_DOWN_HOTKEY).onChange(async (value) => {
        await this.plugin.updateSettings({ moveNoteDownHotkey: value });
      });
    });
    new import_obsidian3.Setting(containerEl).setName("\u65B0\u7B14\u8BB0\u5361\u7247\u4F4D\u7F6E").setDesc("\u53EA\u51B3\u5B9A\u4E4B\u540E\u65B0\u52A0\u5165\u6807\u7B7E\u7684\u7B14\u8BB0\u5361\u7247\u4F4D\u7F6E\uFF0C\u4E0D\u4F1A\u91CD\u6392\u73B0\u6709\u5361\u7247").addDropdown((dropdown) => {
      dropdown.addOption("end", "\u653E\u5728\u6700\u540E").addOption("start", "\u653E\u5728\u6700\u524D").setValue(this.plugin.settings.newNotePosition).onChange(async (value) => {
        await this.plugin.updateSettings({ newNotePosition: value });
      });
    });
    new import_obsidian3.Setting(containerEl).setName("\u5907\u4EFD\u95F4\u9694").setDesc("\u6309\u5206\u949F\u5B9A\u65F6\u5907\u4EFD\u63D2\u4EF6\u6570\u636E\uFF1B\u8F93\u5165 0 \u505C\u6B62\u5907\u4EFD").addText((text) => {
      text.setValue(String(this.plugin.settings.backupIntervalMinutes)).setPlaceholder("0").onChange(async (value) => {
        await this.plugin.updateSettings({ backupIntervalMinutes: value });
      });
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.step = "1";
    });
    new import_obsidian3.Setting(containerEl).setName("\u5907\u4EFD\u8DEF\u5F84").setDesc("Vault \u5185\u7684\u76F8\u5BF9\u6587\u4EF6\u5939\u8DEF\u5F84\uFF1B\u7559\u7A7A\u8868\u793A Vault \u6839\u76EE\u5F55\uFF0C\u652F\u6301 \\ \u6216 /").addText((text) => {
      text.setValue(this.plugin.settings.backupFolderPath).setPlaceholder("\u5176\u4ED6\\\u5907\u4EFD").onChange(async (value) => {
        await this.plugin.updateSettings({ backupFolderPath: value });
      });
    });
    new import_obsidian3.Setting(containerEl).setName("\u56DE\u9876\u6309\u94AE\u663E\u793A\u9608\u503C").setDesc("\u6807\u7B7E\u7684\u7B14\u8BB0\u5361\u7247\u6570\u91CF\u8FBE\u5230\u8BE5\u503C\u65F6\u663E\u793A\u56DE\u9876\u6309\u94AE\uFF1B\u8F93\u5165 0 \u4E0D\u663E\u793A").addText((text) => {
      text.setValue(String(this.plugin.settings.scrollTopButtonThreshold)).setPlaceholder(String(DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD)).onChange(async (value) => {
        await this.plugin.updateSettings({ scrollTopButtonThreshold: value });
      });
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.step = "1";
    });
  }
};

// src/persistence.ts
var import_obsidian4 = require("obsidian");
var PersistenceBehavior = class {
  async loadSettings() {
    const savedSettings = await this.loadData() || {};
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
    if (!this.settings.tagSidebarPreferredFiles || typeof this.settings.tagSidebarPreferredFiles !== "object") {
      this.settings.tagSidebarPreferredFiles = {};
    }
    this.settings.newNotePosition = normalizeNewNotePosition(this.settings.newNotePosition);
    this.settings.noteOrderByTag = this.normalizeNoteOrderByTag(this.settings.noteOrderByTag);
    this.settings.backupIntervalMinutes = normalizeBackupInterval(this.settings.backupIntervalMinutes);
    this.settings.backupFolderPath = normalizeBackupFolderPath(this.settings.backupFolderPath);
    this.settings.scrollTopButtonThreshold = normalizeScrollTopButtonThreshold(
      this.settings.scrollTopButtonThreshold
    );
    this.settings.pinnedTag = normalizeTag(this.settings.pinnedTag);
    if (this.settings.pinnedTag && isNestedTag(this.settings.pinnedTag)) {
      this.settings.pinnedTag = null;
    }
    delete this.settings.listModeEnabled;
    delete this.settings.tagOrder;
  }
  async saveSettings() {
    this.settingsSavePromise = this.settingsSavePromise.catch(() => {
    }).then(() => this.saveData(this.settings));
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
    if (!this.settings.tagSidebarPreferredFiles || typeof this.settings.tagSidebarPreferredFiles !== "object") {
      this.settings.tagSidebarPreferredFiles = {};
    }
    this.settings.newNotePosition = normalizeNewNotePosition(this.settings.newNotePosition);
    this.settings.noteOrderByTag = this.normalizeNoteOrderByTag(this.settings.noteOrderByTag);
    this.settings.backupIntervalMinutes = normalizeBackupInterval(this.settings.backupIntervalMinutes);
    this.settings.backupFolderPath = normalizeBackupFolderPath(this.settings.backupFolderPath);
    this.settings.scrollTopButtonThreshold = normalizeScrollTopButtonThreshold(
      this.settings.scrollTopButtonThreshold
    );
    this.settings.pinnedTag = normalizeTag(this.settings.pinnedTag);
    if (this.settings.pinnedTag && isNestedTag(this.settings.pinnedTag)) {
      this.settings.pinnedTag = null;
    }
    delete this.settings.tagOrder;
    await this.saveSettings();
    if (newSettings && (Object.prototype.hasOwnProperty.call(newSettings, "backupIntervalMinutes") || Object.prototype.hasOwnProperty.call(newSettings, "backupFolderPath"))) {
      this.restartBackupTimer();
    }
    this.refreshTagViewHotkeys();
    if (newSettings && (Object.prototype.hasOwnProperty.call(newSettings, "moveNoteUpHotkey") || Object.prototype.hasOwnProperty.call(newSettings, "moveNoteDownHotkey"))) {
      this.refreshNoteOrderHotkeyScope();
    }
    if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "autoSwitchToOutlineEnabled")) {
      this.applySidebarPreferenceForCurrentFile();
    }
    if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "scrollTopButtonThreshold")) {
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
        console.error("[Puffs Tag Enhance] \u5907\u4EFD\u63D2\u4EF6\u6570\u636E\u5931\u8D25:", error);
      });
    }, intervalMinutes * 60 * 1e3);
  }
  async ensureBackupFolder(folderPath) {
    if (!folderPath) return;
    const adapter = this.app.vault.adapter;
    let currentPath = "";
    for (const segment of folderPath.split("/")) {
      currentPath = (0, import_obsidian4.normalizePath)(currentPath ? `${currentPath}/${segment}` : segment);
      if (!await adapter.exists(currentPath)) {
        await adapter.mkdir(currentPath);
      }
    }
  }
  async writeDataBackup() {
    await this.settingsSavePromise.catch(() => {
    });
    const folderPath = normalizeBackupFolderPath(this.settings.backupFolderPath);
    await this.ensureBackupFolder(folderPath);
    const backupPath = (0, import_obsidian4.normalizePath)(
      folderPath ? `${folderPath}/${BACKUP_FILE_NAME}` : BACKUP_FILE_NAME
    );
    const data = await this.loadData() || this.settings;
    await this.app.vault.adapter.write(backupPath, `${JSON.stringify(data, null, 2)}
`);
    return backupPath;
  }
  normalizeNoteOrderByTag(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    for (const [rawTag, rawPaths] of Object.entries(value)) {
      const tag = normalizeTag(rawTag);
      if (!tag || !Array.isArray(rawPaths)) continue;
      const seen = /* @__PURE__ */ new Set();
      const paths = [];
      for (const rawPath of rawPaths) {
        const path = typeof rawPath === "string" ? rawPath.trim() : "";
        if (!path || seen.has(path)) continue;
        seen.add(path);
        paths.push(path);
      }
      if (paths.length > 0) result[tag] = paths;
    }
    return result;
  }
};

// src/interactions.ts
var import_obsidian5 = require("obsidian");
var InteractionsBehavior = class {
  getOrderedFilesForTag(tagValue, files) {
    const tag = normalizeTag(tagValue);
    const savedOrder = tag && this.settings.noteOrderByTag[tag];
    if (!Array.isArray(savedOrder) || savedOrder.length === 0) return files;
    const rank = new Map(savedOrder.map((path, index) => [path, index]));
    return files.map((file, index) => ({ file, index })).sort((a, b) => {
      const aRank = rank.get(a.file.path);
      const bRank = rank.get(b.file.path);
      const aIsRanked = Number.isInteger(aRank);
      const bIsRanked = Number.isInteger(bRank);
      if (aIsRanked && bIsRanked) return aRank - bRank;
      if (aIsRanked) return -1;
      if (bIsRanked) return 1;
      return a.index - b.index;
    }).map(({ file }) => file);
  }
  resolvePinnedSearchQuery(value) {
    const query = String(value || "").trimStart();
    const pinnedTag = normalizeTag(this.settings.pinnedTag);
    if (!pinnedTag || !["*", "&", "|"].includes(query.charAt(0))) return query;
    return `${getTagDisplayName(pinnedTag)}${query}`;
  }
  getPinnedTagItem() {
    const tag = normalizeTag(this.settings.pinnedTag);
    const files = tag && !isNestedTag(tag) ? this.tagFileIndex.get(tag) || [] : [];
    if (!tag || files.length === 0) return null;
    return {
      tag,
      displayName: getTagDisplayName(tag),
      isVirtual: false,
      isPinnedExtra: true,
      files: this.getOrderedFilesForTag(tag, files)
    };
  }
  prependPinnedTagItem(items, query = "") {
    const pinnedItem = this.getPinnedTagItem();
    if (!pinnedItem) return items;
    const remainingItems = items.filter((item) => item.tag !== pinnedItem.tag);
    const matchingItem = items.find((item) => item.tag === pinnedItem.tag);
    const positionedPinnedItem = {
      ...matchingItem || pinnedItem,
      isPinnedExtra: !matchingItem
    };
    const isNonNoteSearch = String(query || "").trim() && !String(query || "").includes("*");
    return isNonNoteSearch ? [...remainingItems, positionedPinnedItem] : [positionedPinnedItem, ...remainingItems];
  }
  async togglePinnedTag(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag) || !(this.tagFileIndex.get(tag) || []).length) return;
    this.settings.pinnedTag = this.settings.pinnedTag === tag ? null : tag;
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }
  getTagShelfItems(query = "", includePinned = true) {
    const tagQuery = getTagFilterQuery(query);
    const intersectionTerms = splitIntersectionSearchTerms(tagQuery);
    if (intersectionTerms) {
      const intersectionItems = this.getIntersectionSearchItems(intersectionTerms);
      return includePinned ? this.prependPinnedTagItem(intersectionItems, query) : intersectionItems;
    }
    const unionTerms = splitUnionSearchTerms(tagQuery);
    const items = Array.from(this.tagFileIndex.entries()).filter(([tag, files]) => !isNestedTag(tag) && files.length > 0).map(([tag, files]) => ({
      tag,
      displayName: getTagDisplayName(tag),
      isVirtual: false,
      files: this.getOrderedFilesForTag(tag, files)
    })).sort((a, b) => {
      const countDiff = b.files.length - a.files.length;
      return countDiff || a.displayName.localeCompare(b.displayName, "zh-Hans-CN");
    });
    const matchingItems = unionTerms ? items.filter((item) => tagMatchesAnySearchTerm(item.tag, unionTerms)) : items.filter((item) => tagMatchesSearchText(item.tag, tagQuery));
    return includePinned ? this.prependPinnedTagItem(matchingItems, query) : matchingItems;
  }
  getNoteCardSearchMatches(query, items) {
    const noteCardSearch = parseNoteCardSearch(query);
    if (!noteCardSearch || !noteCardSearch.isValid) return [];
    const matches = [];
    for (const item of items) {
      for (const file of item.files) {
        if (!fileMatchesNoteSearch(file, noteCardSearch.noteQuery)) continue;
        matches.push({
          tag: item.tag,
          path: file.path,
          key: `${String(query)}\0${item.tag}\0${file.path}`
        });
      }
    }
    return matches;
  }
  syncNoteCardSearchState(state, query, items, expandedTags = this.expandedTags) {
    const matches = this.getNoteCardSearchMatches(query, items);
    if (matches.length === 0) {
      this.clearNoteCardSearchState(state, expandedTags);
      return null;
    }
    const queryChanged = state.query !== String(query);
    let activeIndex = queryChanged ? 0 : matches.findIndex(
      (match) => state.target && match.tag === state.target.tag && match.path === state.target.path
    );
    if (activeIndex < 0) activeIndex = 0;
    state.query = String(query);
    state.matches = matches;
    state.activeIndex = activeIndex;
    return this.activateNoteCardSearchTarget(state, matches[activeIndex], expandedTags);
  }
  activateNoteCardSearchTarget(state, target, expandedTags = this.expandedTags) {
    if (!state || !target) return null;
    if (state.autoExpandedTag && state.autoExpandedTag !== target.tag) {
      this.clearNoteCardSearchAutoExpansion(state, expandedTags);
    }
    if (!state.autoExpandedTag) {
      state.autoExpandedTag = target.tag;
      state.autoExpandedWasAlreadyExpanded = expandedTags.has(target.tag);
    }
    expandedTags.add(target.tag);
    state.target = target;
    if (state.lastScrolledKey !== target.key) {
      state.pendingScrollKey = target.key;
    }
    return target;
  }
  advanceNoteCardSearchState(state, expandedTags = this.expandedTags) {
    if (!state || state.matches.length <= 1 || state.activeIndex < 0) return false;
    state.activeIndex = (state.activeIndex + 1) % state.matches.length;
    this.activateNoteCardSearchTarget(state, state.matches[state.activeIndex], expandedTags);
    return true;
  }
  clearNoteCardSearchAutoExpansion(state, expandedTags = this.expandedTags) {
    if (!state || !state.autoExpandedTag) return;
    if (!state.autoExpandedWasAlreadyExpanded) {
      expandedTags.delete(state.autoExpandedTag);
    }
    state.autoExpandedTag = null;
    state.autoExpandedWasAlreadyExpanded = false;
  }
  clearNoteCardSearchState(state, expandedTags = this.expandedTags) {
    if (!state) return;
    this.clearNoteCardSearchAutoExpansion(state, expandedTags);
    if (state.effectTimer !== null) {
      window.clearTimeout(state.effectTimer);
      state.effectTimer = null;
    }
    state.query = "";
    state.matches = [];
    state.activeIndex = -1;
    state.target = null;
    state.lastScrolledKey = "";
    state.pendingScrollKey = "";
  }
  scheduleNoteCardSearchEffect(containerEl, inputEl, state) {
    if (!containerEl || !state) return;
    containerEl.querySelectorAll(".puffs-tag-note-card.is-note-search-match").forEach((cardEl) => {
      cardEl.classList.remove("is-note-search-match");
    });
    if (state.effectTimer !== null) {
      window.clearTimeout(state.effectTimer);
      state.effectTimer = null;
    }
    if (!state.target) return;
    const shouldRestoreInputFocus = document.activeElement === inputEl;
    state.effectTimer = window.setTimeout(() => {
      state.effectTimer = null;
      if (!state.target) return;
      const tagRowEl = Array.from(
        containerEl.querySelectorAll(".tag-pane-tag[data-puffs-tag]")
      ).find((rowEl) => rowEl.dataset.puffsTag === state.target.tag);
      const tagItemEl = tagRowEl && tagRowEl.closest(".puffs-tag-list-item");
      const cardEl = tagItemEl && Array.from(tagItemEl.querySelectorAll(".puffs-tag-note-card[data-path]")).find(
        (candidate) => candidate.dataset.path === state.target.path
      );
      if (!cardEl) return;
      cardEl.classList.add("is-note-search-match");
      if (state.pendingScrollKey === state.target.key) {
        cardEl.scrollIntoView({ block: "center", inline: "nearest" });
        state.lastScrolledKey = state.target.key;
        state.pendingScrollKey = "";
        if (shouldRestoreInputFocus && inputEl && inputEl.isConnected) {
          try {
            inputEl.focus({ preventScroll: true });
          } catch (_) {
            inputEl.focus();
          }
        }
      }
    }, 0);
  }
  scheduleLastNoteCardScroll(containerEl, tag) {
    if (!containerEl || !tag) return;
    window.setTimeout(() => {
      if (!containerEl.isConnected) return;
      const tagRowEl = Array.from(
        containerEl.querySelectorAll(".tag-pane-tag[data-puffs-tag]")
      ).find((rowEl) => rowEl.dataset.puffsTag === tag);
      const tagItemEl = tagRowEl && tagRowEl.closest(".puffs-tag-list-item");
      const noteCards = tagItemEl ? Array.from(tagItemEl.querySelectorAll(".puffs-tag-note-card[data-path]")) : [];
      const lastCardEl = noteCards[noteCards.length - 1];
      if (!lastCardEl) return;
      lastCardEl.scrollIntoView({ block: "center", inline: "nearest" });
    }, 0);
  }
  scheduleTagTopScroll(containerEl, tag) {
    if (!containerEl || !tag) return;
    window.setTimeout(() => {
      if (!containerEl.isConnected) return;
      const tagRowEl = Array.from(
        containerEl.querySelectorAll(".tag-pane-tag[data-puffs-tag]")
      ).find((rowEl) => rowEl.dataset.puffsTag === tag);
      if (!tagRowEl) return;
      tagRowEl.scrollIntoView({ block: "start", inline: "nearest" });
    }, 0);
  }
  isNoteOrderTargetSelected(tag, path) {
    return !!(this.selectedNoteOrderTarget && this.selectedNoteOrderTarget.tag === tag && this.selectedNoteOrderTarget.path === path);
  }
  syncNoteOrderButtonSelection(buttonEl) {
    if (!buttonEl) return;
    const isSelected = this.isNoteOrderTargetSelected(
      buttonEl.dataset.puffsTag,
      buttonEl.dataset.path
    );
    buttonEl.classList.toggle("is-selected", isSelected);
    buttonEl.setAttribute("aria-pressed", String(isSelected));
    const noteItemEl = buttonEl.closest(".puffs-tag-note-item");
    if (noteItemEl) noteItemEl.classList.toggle("is-order-selected", isSelected);
  }
  refreshNoteOrderSelectionState() {
    document.querySelectorAll(".puffs-tag-note-order-button").forEach((buttonEl) => {
      this.syncNoteOrderButtonSelection(buttonEl);
    });
  }
  activateNoteOrderHotkeyScope() {
    if (this.noteOrderHotkeyScope || !this.selectedNoteOrderTarget) return;
    const scope = new import_obsidian5.Scope();
    const registerMoveHotkey = (settingValue, fallback, direction) => {
      const hotkey = parseHotkeyText(settingValue, fallback);
      scope.register(hotkey.modifiers, hotkey.key, (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        this.moveSelectedNote(direction).catch((error) => {
          console.error("[Puffs Tag Enhance] Failed to move selected note:", error);
          new import_obsidian5.Notice("\u8C03\u6574\u7B14\u8BB0\u987A\u5E8F\u5931\u8D25");
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
  toggleNoteOrderTarget(tagValue, path, surface = "") {
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
    const buttons = Array.from(document.querySelectorAll(".puffs-tag-note-order-button"));
    const buttonEl = buttons.find(
      (button) => button.dataset.puffsTag === tag && button.dataset.path === path && button.dataset.puffsSurface === surface && button.offsetParent !== null
    ) || buttons.find(
      (button) => button.dataset.puffsTag === tag && button.dataset.path === path && button.offsetParent !== null
    );
    if (buttonEl) buttonEl.focus({ preventScroll: true });
  }
  async moveSelectedNote(direction) {
    const target = this.selectedNoteOrderTarget;
    if (!target || direction !== -1 && direction !== 1) return false;
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
      direction < 0 ? "before" : "after"
    );
    window.setTimeout(() => {
      this.refreshNoteOrderSelectionState();
      this.focusSelectedNoteOrderButton();
    }, 0);
    return true;
  }
  async moveSelectedNoteAfter(targetTagValue, targetPath) {
    const selected = this.selectedNoteOrderTarget;
    const targetTag = normalizeTag(targetTagValue);
    if (!selected || !targetTag || selected.tag !== targetTag || !targetPath || selected.path === targetPath) {
      return false;
    }
    const order = this.getOrderedFilesForTag(
      selected.tag,
      this.tagFileIndex.get(selected.tag) || []
    ).map((file) => file.path);
    const movingIndex = order.indexOf(selected.path);
    const targetIndex = order.indexOf(targetPath);
    if (movingIndex < 0) {
      this.clearNoteOrderTarget();
      return false;
    }
    if (targetIndex < 0 || movingIndex === targetIndex + 1) return false;
    await this.reorderNote(selected.tag, selected.path, targetPath, "after");
    window.setTimeout(() => {
      this.refreshNoteOrderSelectionState();
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
    const insertIndex = placement === "after" ? nextTargetIndex + 1 : nextTargetIndex;
    order.splice(insertIndex, 0, movingPath);
    this.settings.noteOrderByTag[tag] = order;
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }
};

// src/workspace.ts
var obsidian = __toESM(require("obsidian"));
var import_obsidian6 = require("obsidian");
var WorkspaceBehavior = class {
  refreshTagShelfViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_SHELF_VIEW_TYPE)) {
      if (leaf.view && typeof leaf.view.refresh === "function") {
        leaf.view.refresh();
      }
    }
  }
  async openTagShelf() {
    this.rememberCurrentMainLeaf();
    const existing = this.app.workspace.getLeavesOfType(TAG_SHELF_VIEW_TYPE)[0];
    const leaf = existing || this.app.workspace.getLeaf("tab");
    if (!existing) {
      await leaf.setViewState({ type: TAG_SHELF_VIEW_TYPE, state: {} });
    }
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    if (leaf.view && typeof leaf.view.refresh === "function") {
      leaf.view.refresh();
    }
  }
  isNoteOrderSearchControl(target) {
    if (!(target instanceof Element)) return false;
    if (target.closest(".puffs-tag-shelf-search-host")) return true;
    return this.app.workspace.getLeavesOfType(TAG_VIEW_TYPE).some((leaf) => {
      const view = leaf && leaf.view;
      const inputEl = view && view.searchComponent && view.searchComponent.inputEl;
      if (!inputEl || !inputEl.isConnected) return false;
      const searchContainerEl = inputEl.closest(".search-input-container") || inputEl;
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
    return evt.clientX >= rect.right - scrollbarWidth && evt.clientX <= rect.right && evt.clientY >= rect.top && evt.clientY <= rect.bottom;
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
    document.addEventListener("keydown", this.keydownHandler, true);
    this.pointerdownHandler = (evt) => {
      if (!this.selectedNoteOrderTarget) return;
      const target = evt.target instanceof Element ? evt.target : null;
      if (target && target.closest(".puffs-tag-note-order-button")) return;
      if (target && target.closest(".puffs-tag-scroll-top-button")) return;
      if (target && target.closest(".puffs-tag-scroll-bottom-button")) return;
      if (this.isNoteOrderSearchControl(target)) return;
      if (this.isTagSidebarScrollbarPointer(evt, target)) return;
      if (evt.button === 2 && target && target.closest(".puffs-tag-note-card")) return;
      this.clearNoteOrderTarget();
    };
    document.addEventListener("pointerdown", this.pointerdownHandler, true);
    this.noteOrderContextMenuHandler = (evt) => {
      const selected = this.selectedNoteOrderTarget;
      if (!selected) return;
      const target = evt.target instanceof Element ? evt.target : null;
      if (!target) return;
      if (target.closest(".puffs-tag-note-order-button")) return;
      const cardEl = target.closest(".puffs-tag-note-card");
      if (!cardEl) return;
      const targetTag = normalizeTag(cardEl.dataset.puffsTag);
      const targetPath = cardEl.dataset.path;
      if (targetTag === selected.tag && targetPath === selected.path) return;
      if (!targetTag || targetTag !== selected.tag || !targetPath) {
        this.clearNoteOrderTarget();
        return;
      }
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      this.moveSelectedNoteAfter(targetTag, targetPath).catch((error) => {
        console.error("[Puffs Tag Enhance] Failed to move selected note after target:", error);
        new import_obsidian6.Notice("\u8C03\u6574\u7B14\u8BB0\u987A\u5E8F\u5931\u8D25");
      });
    };
    document.addEventListener("contextmenu", this.noteOrderContextMenuHandler, true);
    this.register(() => {
      document.removeEventListener("keydown", this.keydownHandler, true);
      document.removeEventListener("pointerdown", this.pointerdownHandler, true);
      document.removeEventListener("contextmenu", this.noteOrderContextMenuHandler, true);
      this.keydownHandler = null;
      this.pointerdownHandler = null;
      this.noteOrderContextMenuHandler = null;
    });
  }
  eventMatchesHotkey(evt, hotkey) {
    var _a, _b;
    const keyMatches = evt.key && evt.key.toLowerCase() === hotkey.key.toLowerCase();
    if (!keyMatches) return false;
    const wantsCtrl = hotkey.modifiers.includes("Ctrl");
    const wantsMeta = hotkey.modifiers.includes("Meta");
    const wantsMod = hotkey.modifiers.includes("Mod");
    const wantsAlt = hotkey.modifiers.includes("Alt");
    const wantsShift = hotkey.modifiers.includes("Shift");
    const modCtrl = wantsMod && !((_a = obsidian.Platform) == null ? void 0 : _a.isMacOS);
    const modMeta = wantsMod && ((_b = obsidian.Platform) == null ? void 0 : _b.isMacOS);
    return evt.ctrlKey === (wantsCtrl || modCtrl) && evt.metaKey === (wantsMeta || modMeta) && evt.altKey === wantsAlt && evt.shiftKey === wantsShift;
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
    return !!(leaf && leaf.view && !this.isMainWorkspaceLeaf(leaf) && leaf.parent && leaf.parent.type === "tabs");
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
    const targetViewType = this.hasTagSidebarPreference(filePath) ? TAG_VIEW_TYPE : OUTLINE_VIEW_TYPE;
    this.switchManagedSidebarTo(requestId, filePath, targetViewType).catch((error) => {
      console.error("[Puffs Tag Enhance] Failed to switch sidebar for current file:", error);
    });
  }
  async switchManagedSidebarTo(requestId, filePath, viewType) {
    const leaf = await this.getOrCreateManagedSidebarLeaf(viewType);
    if (this.isUnloaded) return;
    if (requestId !== this.sidebarSwitchRequestId) return;
    if (filePath !== this.currentMainFilePath) return;
    if (!this.settings.autoSwitchToOutlineEnabled) return;
    const currentTargetViewType = this.hasTagSidebarPreference(filePath) ? TAG_VIEW_TYPE : OUTLINE_VIEW_TYPE;
    if (currentTargetViewType !== viewType) return;
    if (!leaf || !leaf.parent || typeof leaf.parent.selectTab !== "function") return;
    const group = leaf.parent;
    const operation = {
      requestId,
      filePath,
      targetLeaf: leaf,
      targetViewType: viewType,
      group
    };
    this.activeSidebarSelectionOperation = operation;
    try {
      leaf.parent.selectTab(leaf);
    } finally {
      if (this.activeSidebarSelectionOperation === operation) {
        this.activeSidebarSelectionOperation = null;
      }
      const selectedLeaf = Array.isArray(group.children) && Number.isInteger(group.currentTab) ? group.children[group.currentTab] : null;
      this.selectedSidebarViewType = this.isManagedSidebarLeaf(selectedLeaf) ? selectedLeaf.view.getViewType() : null;
    }
    const mainLeaf = this.lastMainLeaf;
    if (this.selectedSidebarViewType === viewType && this.isUsableMainLeaf(mainLeaf) && getLeafFilePath(mainLeaf) === filePath) {
      this.app.workspace.setActiveLeaf(mainLeaf, { focus: true });
    }
  }
  async getOrCreateManagedSidebarLeaf(viewType) {
    const existingLeaf = this.findManagedSidebarLeaf(viewType);
    if (existingLeaf) return existingLeaf;
    const targetGroup = this.findManagedSidebarTabGroup();
    let leaf = null;
    if (targetGroup && typeof this.app.workspace.createLeafInTabGroup === "function") {
      leaf = this.app.workspace.createLeafInTabGroup(targetGroup);
    } else if (typeof this.app.workspace.getRightLeaf === "function") {
      leaf = this.app.workspace.getRightLeaf(false);
    } else if (typeof this.app.workspace.getLeaf === "function") {
      leaf = this.app.workspace.getLeaf(false);
    }
    if (!leaf || typeof leaf.setViewState !== "function") return null;
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
    if (!(file instanceof import_obsidian6.TFile) || file.extension !== "md" || !oldPath || !file.path) return;
    let changed = false;
    for (const [tag, paths] of Object.entries(this.settings.noteOrderByTag)) {
      if (!Array.isArray(paths) || !paths.includes(oldPath)) continue;
      this.settings.noteOrderByTag[tag] = Array.from(
        new Set(paths.map((path) => path === oldPath ? file.path : path))
      );
      changed = true;
    }
    if (changed) {
      this.saveSettings().catch((error) => {
        console.error("[Puffs Tag Enhance] Failed to update note order after rename:", error);
      });
    }
  }
  handleNoteOrderFileDelete(file) {
    if (!(file instanceof import_obsidian6.TFile) || file.extension !== "md" || !file.path) return;
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
        console.error("[Puffs Tag Enhance] Failed to update note order after delete:", error);
      });
    }
  }
  async openNoteCard(cardEl) {
    const path = cardEl.dataset.path;
    if (!path) return;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian6.TFile)) {
      new import_obsidian6.Notice(`\u672A\u627E\u5230\u7B14\u8BB0\uFF1A${path}`);
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
      new import_obsidian6.Notice("\u672A\u627E\u5230\u53EF\u7528\u7684\u4E3B\u7F16\u8F91\u533A\u6807\u7B7E\u9875");
      return;
    }
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    this.rememberMainLeaf(leaf);
    await this.app.workspace.openLinkText(file.path, "", false);
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
    var _a;
    const workspace = this.app.workspace;
    const tabGroup = this.findMainWorkspaceTabGroup();
    if (tabGroup && typeof workspace.createLeafInTabGroup === "function") {
      return workspace.createLeafInTabGroup(tabGroup);
    }
    if (workspace.rootSplit && typeof workspace.createLeafInParent === "function") {
      return workspace.createLeafInParent(workspace.rootSplit, ((_a = workspace.rootSplit.children) == null ? void 0 : _a.length) || 0);
    }
    return workspace.getLeaf("tab");
  }
  findMainWorkspaceTabGroup() {
    var _a;
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
    const rootChildren = ((_a = workspace.rootSplit) == null ? void 0 : _a.children) || [];
    return rootChildren.find((child) => Array.isArray(child.children) && Number.isInteger(child.currentTab)) || null;
  }
  rememberCurrentMainLeaf() {
    var _a;
    const activeLeaf = this.app.workspace.activeLeaf;
    const editorLeaf = (_a = this.app.workspace.activeEditor) == null ? void 0 : _a.leaf;
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
};

// src/tag-index.ts
var import_obsidian7 = require("obsidian");
var TagIndexBehavior = class {
  registerWorkspaceHandlers() {
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.handleActiveLeafChange(leaf);
        if (leaf && leaf.view && leaf.view.getViewType() === TAG_VIEW_TYPE) {
          this.scheduleFocusTagSearch(leaf.view);
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.syncSelectedSidebarState();
        this.refreshTagViews();
      })
    );
  }
  registerMetadataHandlers() {
    const scheduleRefresh = (file) => this.scheduleMetadataRefresh(file);
    this.registerEvent(this.app.metadataCache.on("changed", scheduleRefresh));
    this.registerEvent(this.app.metadataCache.on("deleted", scheduleRefresh));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.handlePreferredFileRename(file, oldPath);
      this.handleNoteOrderFileRename(file, oldPath);
      this.refreshTagViews();
      this.refreshTagShelfViews();
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      this.handlePreferredFileDelete(file);
      this.handleNoteOrderFileDelete(file);
      scheduleRefresh(file);
    }));
  }
  registerInitialMetadataRefresh() {
    const metadataCache = this.app.metadataCache;
    if (!metadataCache || typeof metadataCache.onCleanCache !== "function") return;
    metadataCache.onCleanCache(() => {
      if (this.isUnloaded) return;
      this.refreshTagIndexAndViews();
      this.queueInitialTagIndexRefreshes();
    });
  }
  scheduleMetadataRefresh(file) {
    const changedPath = file instanceof import_obsidian7.TFile && file.extension === "md" ? file.path : null;
    this.refreshTagIndexAndViews(changedPath);
    this.finishTagRenameProtectionIfSettled();
  }
  refreshTagIndexAndViews(changedPath = null) {
    if (this.isUnloaded) return;
    const noteOrderChanged = this.rebuildTagFileIndex(changedPath);
    if (noteOrderChanged) {
      this.saveSettings().catch((error) => {
        console.error("[Puffs Tag Enhance] Failed to persist note order:", error);
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
    if (migration.mode === "add" || migration.mode === "delete") {
      const shouldHaveTag = migration.mode === "add";
      return Array.from(migration.affectedPaths).every((path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof import_obsidian7.TFile)) return false;
        const cache = this.app.metadataCache.getFileCache(file);
        const hasTag = frontmatterTagValueHasTag(
          cache && cache.frontmatter && cache.frontmatter.tags,
          migration.targetTag
        );
        return hasTag === shouldHaveTag;
      });
    }
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
    }, 5e3);
  }
  isMetadataCacheReadyForNoteOrderTracking() {
    const metadataCache = this.app.metadataCache;
    if (!metadataCache || metadataCache.initialized !== true) return false;
    if (metadataCache.inProgressTaskCount !== 0) return false;
    return this.app.vault.getMarkdownFiles().every((file) => {
      return metadataCache.getFileCache(file) != null;
    });
  }
  getStableNoteOrderTags(nextIndex) {
    const existingTags = Object.keys(this.settings.noteOrderByTag).filter((tag) => nextIndex.has(tag));
    const existingTagSet = new Set(existingTags);
    const addedTags = Array.from(nextIndex.keys()).filter((tag) => !existingTagSet.has(tag)).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
    return existingTags.concat(addedTags);
  }
  rebuildTagFileIndex(changedPath = null) {
    const nextIndex = /* @__PURE__ */ new Map();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const tags = this.getExactTagsForFile(file);
      for (const tag of tags) {
        if (!nextIndex.has(tag)) nextIndex.set(tag, []);
        nextIndex.get(tag).push(file);
      }
    }
    for (const files of nextIndex.values()) {
      files.sort((a, b) => {
        const byName = a.basename.localeCompare(b.basename, "zh-Hans-CN");
        return byName || a.path.localeCompare(b.path, "zh-Hans-CN");
      });
    }
    let noteOrderChanged = false;
    if (!this.noteOrderTrackingReady) {
      if (this.isMetadataCacheReadyForNoteOrderTracking()) {
        noteOrderChanged = this.initializeNoteOrders(nextIndex);
        this.noteOrderTrackingReady = true;
      }
    } else if (this.noteOrderTrackingReady && !this.activeTagRename) {
      noteOrderChanged = this.reconcileNoteOrders(nextIndex, changedPath);
    }
    this.tagFileIndex = nextIndex;
    this.reconcileExpandedTags();
    const pinnedTagChanged = this.reconcilePinnedTag();
    return noteOrderChanged || pinnedTagChanged;
  }
  initializeNoteOrders(nextIndex) {
    const nextOrders = {};
    for (const tag of this.getStableNoteOrderTags(nextIndex)) {
      const files = nextIndex.get(tag) || [];
      const currentPaths = files.map((file) => file.path);
      const currentPathSet = new Set(currentPaths);
      const savedOrder = Array.isArray(this.settings.noteOrderByTag[tag]) ? this.settings.noteOrderByTag[tag] : [];
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
    for (const tag of this.getStableNoteOrderTags(nextIndex)) {
      const files = nextIndex.get(tag) || [];
      const currentPaths = files.map((file) => file.path);
      const currentPathSet = new Set(currentPaths);
      const savedOrder = Array.isArray(this.settings.noteOrderByTag[tag]) ? this.settings.noteOrderByTag[tag] : [];
      const retainedPaths = savedOrder.filter((path) => currentPathSet.has(path));
      const savedPathSet = new Set(savedOrder);
      const addedPaths = currentPaths.filter((path) => !savedPathSet.has(path));
      if (changedPath && addedPaths.includes(changedPath)) {
        addedPaths.splice(addedPaths.indexOf(changedPath), 1);
        addedPaths.push(changedPath);
      }
      const order = this.settings.newNotePosition === "start" ? addedPaths.reverse().concat(retainedPaths) : retainedPaths.concat(addedPaths);
      if (order.length > 0) nextOrders[tag] = order;
    }
    const changed = JSON.stringify(nextOrders) !== JSON.stringify(this.settings.noteOrderByTag);
    if (changed) this.settings.noteOrderByTag = nextOrders;
    return changed;
  }
  getExactTagsForFile(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return /* @__PURE__ */ new Set();
    const tags = /* @__PURE__ */ new Set();
    const allTags = typeof import_obsidian7.getAllTags === "function" ? (0, import_obsidian7.getAllTags)(cache) : null;
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
      if (!String(tag).startsWith("intersection:") && !this.tagFileIndex.has(tag)) {
        this.expandedTags.delete(tag);
      }
    }
  }
  reconcilePinnedTag() {
    const pinnedTag = normalizeTag(this.settings.pinnedTag);
    if (!pinnedTag || this.activeTagRename || !this.noteOrderTrackingReady) return false;
    if (!isNestedTag(pinnedTag) && (this.tagFileIndex.get(pinnedTag) || []).length > 0) return false;
    this.settings.pinnedTag = null;
    return true;
  }
  async renameTag(oldTagValue, newTagValue) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);
    if (!oldTag) throw new Error("\u539F\u6807\u7B7E\u65E0\u6548");
    if (!newTag) throw new Error("\u6807\u7B7E\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
    if (/\s/.test(getTagDisplayName(newTag))) throw new Error("\u6807\u7B7E\u540D\u79F0\u4E0D\u80FD\u5305\u542B\u7A7A\u683C");
    if (oldTag === newTag) return;
    if (this.activeTagRename) throw new Error("\u4E0A\u4E00\u6B21\u6807\u7B7E\u4FEE\u6539\u4ECD\u5728\u540C\u6B65\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
    this.rebuildTagFileIndex();
    const files = Array.from(new Set(this.tagFileIndex.get(oldTag) || []));
    const oldNoteOrder = this.getOrderedFilesForTag(oldTag, files).map((file) => file.path);
    const existingNewFiles = Array.from(new Set(this.tagFileIndex.get(newTag) || []));
    const existingNewOrder = this.getOrderedFilesForTag(newTag, existingNewFiles).map((file) => file.path);
    const migratedOrder = Array.from(/* @__PURE__ */ new Set([...oldNoteOrder, ...existingNewOrder]));
    const migration = {
      mode: "rename",
      oldTag,
      newTag,
      affectedPaths: new Set(files.map((file) => file.path)),
      committed: false
    };
    this.activeTagRename = migration;
    try {
      for (const file of files) {
        await this.renameTagInFile(file, oldTag, newTag);
      }
      if (this.expandedTags.delete(oldTag)) {
        this.expandedTags.add(newTag);
      }
      if (this.settings.pinnedTag === oldTag) {
        this.settings.pinnedTag = newTag;
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
  fileHasFrontmatterTag(file, tagValue) {
    const cache = this.app.metadataCache.getFileCache(file);
    return frontmatterTagValueHasTag(
      cache && cache.frontmatter && cache.frontmatter.tags,
      tagValue
    );
  }
  fileHasInlineTag(file, tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return false;
    const cache = this.app.metadataCache.getFileCache(file);
    return Array.isArray(cache && cache.tags) && cache.tags.some((tagEntry) => {
      return normalizeTag(tagEntry && tagEntry.tag) === tag;
    });
  }
  async addTagToTaggedNotes(sourceTagValue, newTagValue) {
    await this.updateTagPropertiesForTaggedNotes("add", sourceTagValue, newTagValue);
  }
  async deleteTagFromTaggedNotes(sourceTagValue, targetTagValue) {
    await this.updateTagPropertiesForTaggedNotes("delete", sourceTagValue, targetTagValue);
  }
  async updateTagPropertiesForTaggedNotes(mode, sourceTagValue, targetTagValue) {
    const sourceTag = normalizeTag(sourceTagValue);
    const targetTag = normalizeTag(targetTagValue);
    if (!sourceTag) throw new Error("\u539F\u6807\u7B7E\u65E0\u6548");
    if (!targetTag) throw new Error("\u6807\u7B7E\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
    if (/\s/.test(getTagDisplayName(targetTag))) throw new Error("\u6807\u7B7E\u540D\u79F0\u4E0D\u80FD\u5305\u542B\u7A7A\u683C");
    if (mode !== "add" && mode !== "delete") throw new Error("\u4E0D\u652F\u6301\u7684\u6807\u7B7E\u64CD\u4F5C");
    if (this.activeTagRename) throw new Error("\u4E0A\u4E00\u6B21\u6807\u7B7E\u4FEE\u6539\u4ECD\u5728\u540C\u6B65\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
    this.rebuildTagFileIndex();
    const sourceFiles = Array.from(new Set(this.tagFileIndex.get(sourceTag) || []));
    const orderedSourceFiles = this.getOrderedFilesForTag(sourceTag, sourceFiles);
    const files = orderedSourceFiles.filter((file) => {
      const hasTag = this.fileHasFrontmatterTag(file, targetTag);
      return mode === "add" ? !hasTag : hasTag;
    });
    if (files.length === 0) return;
    const existingTargetFiles = Array.from(new Set(this.tagFileIndex.get(targetTag) || []));
    const existingTargetOrder = this.getOrderedFilesForTag(targetTag, existingTargetFiles).map((file) => file.path);
    const existingTargetPaths = new Set(existingTargetFiles.map((file) => file.path));
    const affectedPaths = new Set(files.map((file) => file.path));
    const migration = {
      mode,
      targetTag,
      affectedPaths,
      committed: false
    };
    this.activeTagRename = migration;
    try {
      for (const file of files) {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          const tags = flattenFrontmatterTags(fm.tags);
          if (mode === "add") {
            if (tags.some((item) => normalizeTag(item) === targetTag)) return;
            fm.tags = tags.concat(getTagDisplayName(targetTag));
            return;
          }
          const remainingTags = tags.filter((item) => normalizeTag(item) !== targetTag);
          if (remainingTags.length > 0) fm.tags = remainingTags;
          else delete fm.tags;
        });
      }
      if (mode === "add") {
        const newlyAddedPaths = files.map((file) => file.path).filter((path) => !existingTargetPaths.has(path));
        const nextOrder = this.settings.newNotePosition === "start" ? newlyAddedPaths.concat(existingTargetOrder) : existingTargetOrder.concat(newlyAddedPaths);
        if (nextOrder.length > 0) this.settings.noteOrderByTag[targetTag] = Array.from(new Set(nextOrder));
      } else {
        const removedPaths = new Set(
          files.filter((file) => !this.fileHasInlineTag(file, targetTag)).map((file) => file.path)
        );
        const nextOrder = existingTargetOrder.filter((path) => !removedPaths.has(path));
        if (nextOrder.length > 0) this.settings.noteOrderByTag[targetTag] = nextOrder;
        else delete this.settings.noteOrderByTag[targetTag];
      }
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
    if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, "tags")) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (!Object.prototype.hasOwnProperty.call(fm, "tags")) return;
      fm.tags = replaceFrontmatterTagValue(fm.tags, oldTag, newTag);
    });
  }
};

// src/tag-pane.ts
var import_obsidian9 = require("obsidian");

// src/modals.ts
var import_obsidian8 = require("obsidian");
var PuffsTagRenameModal = class extends import_obsidian8.Modal {
  constructor(app, plugin, tag) {
    super(app);
    this.plugin = plugin;
    this.tag = normalizeTag(tag);
    this.mode = "rename";
    this.isSubmitting = false;
  }
  onOpen() {
    this.modalEl.classList.add("puffs-tag-rename-modal");
    this.contentEl.empty();
    const headingEl = document.createElement("div");
    headingEl.className = "puffs-tag-rename-heading";
    const titleEl = document.createElement("div");
    titleEl.className = "puffs-tag-rename-title";
    const addButtonEl = document.createElement("button");
    addButtonEl.className = "puffs-tag-rename-mode-button";
    addButtonEl.type = "button";
    const deleteButtonEl = document.createElement("button");
    deleteButtonEl.className = "puffs-tag-rename-mode-button";
    deleteButtonEl.type = "button";
    const inputEl = document.createElement("input");
    inputEl.className = "puffs-tag-rename-input";
    inputEl.type = "text";
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
    const renderMode = (mode) => {
      this.mode = mode;
      titleEl.textContent = mode === "add" ? "\u6279\u91CF\u65B0\u589E\u6807\u7B7E" : mode === "delete" ? "\u6279\u91CF\u5220\u9664\u6807\u7B7E" : "\u4FEE\u6539\u6807\u7B7E\u540D\u79F0";
      (0, import_obsidian8.setIcon)(addButtonEl, mode === "add" ? "pencil" : "plus");
      (0, import_obsidian8.setIcon)(deleteButtonEl, mode === "delete" ? "pencil" : "minus");
      inputEl.value = mode === "rename" ? getTagDisplayName(this.tag) : "";
      focusInput(mode === "rename");
    };
    const keepInputFocused = (evt) => {
      evt.preventDefault();
    };
    addButtonEl.addEventListener("mousedown", keepInputFocused);
    deleteButtonEl.addEventListener("mousedown", keepInputFocused);
    addButtonEl.addEventListener("click", () => {
      renderMode(this.mode === "add" ? "rename" : "add");
    });
    deleteButtonEl.addEventListener("click", () => {
      renderMode(this.mode === "delete" ? "rename" : "delete");
    });
    inputEl.addEventListener("keydown", async (evt) => {
      if (evt.key !== "Enter" || this.isSubmitting) return;
      evt.preventDefault();
      evt.stopPropagation();
      this.isSubmitting = true;
      try {
        if (this.mode === "add") {
          await this.plugin.addTagToTaggedNotes(this.tag, inputEl.value);
        } else if (this.mode === "delete") {
          await this.plugin.deleteTagFromTaggedNotes(this.tag, inputEl.value);
        } else {
          await this.plugin.renameTag(this.tag, inputEl.value);
        }
        this.close();
      } catch (error) {
        this.isSubmitting = false;
        const fallbackMessage = this.mode === "add" ? "\u6279\u91CF\u65B0\u589E\u6807\u7B7E\u5931\u8D25" : this.mode === "delete" ? "\u6279\u91CF\u5220\u9664\u6807\u7B7E\u5931\u8D25" : "\u4FEE\u6539\u6807\u7B7E\u540D\u79F0\u5931\u8D25";
        new import_obsidian8.Notice(error && error.message ? error.message : fallbackMessage);
        inputEl.focus();
        inputEl.select();
      }
    });
    inputEl.addEventListener("blur", () => {
      if (!this.isSubmitting) this.close();
    });
    renderMode("rename");
  }
};

// src/tag-pane.ts
var TagPaneBehavior = class {
  getFocusedTagView() {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf && activeLeaf.view && activeLeaf.view.getViewType() === TAG_VIEW_TYPE) {
      return activeLeaf.view;
    }
    const activeEl = document.activeElement;
    const focusedTagContent = activeEl instanceof Element ? activeEl.closest('.workspace-leaf-content[data-type="tag"]') : null;
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
      if (typeof view.setShowSearch === "function") view.setShowSearch(false);
      this.scheduleSyncView(view);
      return;
    }
    if (typeof view.setShowSearch === "function") {
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
    if (searchComponent && typeof searchComponent.setValue === "function") {
      searchComponent.setValue("");
    }
    if (inputEl && inputEl.value !== "") {
      inputEl.value = "";
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  scheduleFocusTagSearch(view) {
    window.setTimeout(() => this.focusTagSearch(view), 0);
    window.setTimeout(() => this.focusTagSearch(view), 80);
  }
  focusTagSearch(view) {
    if (!view || !view.containerEl || !view.containerEl.isConnected) return;
    if (!view.isShowingSearch && typeof view.setShowSearch === "function") {
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
      hotkeySignature: "",
      originalUpdateSearch: null,
      isSearchComposing: false,
      autoExpandedTag: null,
      autoExpandedWasAlreadyExpanded: false,
      noteCardSearchState: createNoteCardSearchState(),
      lastRenderedSearchQuery: this.getTagSearchValue(view)
    };
    const searchInputEl = view.searchComponent && view.searchComponent.inputEl;
    if (searchInputEl) {
      const onSearchCompositionStart = () => {
        patch.isSearchComposing = this.settings.freezeSearchWhileComposing;
      };
      const onSearchCompositionEnd = () => {
        patch.isSearchComposing = false;
        view.updateSearch();
      };
      const onNoteSearchEnter = (event) => {
        if (event.key !== "Enter" || event.isComposing) return;
        if (!this.advanceNoteCardSearchState(patch.noteCardSearchState)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.scheduleSyncView(view, 0);
      };
      searchInputEl.addEventListener("compositionstart", onSearchCompositionStart);
      searchInputEl.addEventListener("compositionend", onSearchCompositionEnd);
      searchInputEl.addEventListener("keydown", onNoteSearchEnter, true);
      patch.cleanup.push(() => {
        searchInputEl.removeEventListener("compositionstart", onSearchCompositionStart);
        searchInputEl.removeEventListener("compositionend", onSearchCompositionEnd);
        searchInputEl.removeEventListener("keydown", onNoteSearchEnter, true);
        patch.isSearchComposing = false;
      });
    }
    const expandAllEl = view.collapseOrExpandAllEl;
    if (expandAllEl) {
      const onExpandAllClick = (evt) => {
        if (evt.button !== 0) return;
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.toggleAllListModeTags(view);
      };
      expandAllEl.addEventListener("click", onExpandAllClick, true);
      patch.cleanup.push(() => expandAllEl.removeEventListener("click", onExpandAllClick, true));
      const tagSystemButtonEl = document.createElement("div");
      tagSystemButtonEl.className = "clickable-icon nav-action-button puffs-tag-system-button";
      tagSystemButtonEl.setAttribute("aria-label", "\u6253\u5F00\u6807\u7B7E\u7CFB\u7EDF");
      (0, import_obsidian9.setIcon)(tagSystemButtonEl, TAG_SYSTEM_ICON);
      expandAllEl.insertAdjacentElement("afterend", tagSystemButtonEl);
      const onTagSystemButtonClick = (evt) => {
        if (evt.button !== 0) return;
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.openTagShelf().catch((error) => {
          console.error("[Puffs Tag Enhance] Failed to open tag system:", error);
          new import_obsidian9.Notice("\u6253\u5F00\u6807\u7B7E\u7CFB\u7EDF\u5931\u8D25");
        });
      };
      tagSystemButtonEl.addEventListener("click", onTagSystemButtonClick, true);
      patch.cleanup.push(() => {
        tagSystemButtonEl.removeEventListener("click", onTagSystemButtonClick, true);
        tagSystemButtonEl.remove();
      });
    }
    this.patchMultiTagSearch(view, patch);
    const onTagPaneClick = (evt) => {
      const target = evt.target instanceof Element ? evt.target : null;
      if (!target || !view.containerEl.contains(target)) return;
      const pinButtonEl = target.closest(".puffs-tag-pin-button");
      if (pinButtonEl) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.togglePinnedTag(pinButtonEl.dataset.puffsTag).catch((error) => {
          console.error("[Puffs Tag Enhance] Failed to toggle pinned tag:", error);
        });
        return;
      }
      const scrollBottomButtonEl = target.closest(".puffs-tag-scroll-bottom-button");
      if (scrollBottomButtonEl) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        const tag = scrollBottomButtonEl.dataset.puffsTag;
        const listEl = view.containerEl.querySelector(".puffs-tag-list-container");
        this.scheduleLastNoteCardScroll(listEl, tag);
        return;
      }
      const scrollTopButtonEl = target.closest(".puffs-tag-scroll-top-button");
      if (scrollTopButtonEl) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        const tag = scrollTopButtonEl.dataset.puffsTag;
        const listEl = view.containerEl.querySelector(".puffs-tag-list-container");
        this.scheduleTagTopScroll(listEl, tag);
        return;
      }
      const orderButtonEl = target.closest(".puffs-tag-note-order-button");
      if (orderButtonEl) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.toggleNoteOrderTarget(
          orderButtonEl.dataset.puffsTag,
          orderButtonEl.dataset.path,
          "sidebar"
        );
        return;
      }
      const noteCardEl = target.closest(".puffs-tag-note-card");
      if (noteCardEl) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.openNoteCard(noteCardEl);
        return;
      }
      const tagEl = target.closest(".tag-pane-tag[data-puffs-tag]");
      if (!tagEl) return;
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      this.toggleTagExpansion(tagEl.dataset.puffsTag, view);
    };
    view.containerEl.addEventListener("click", onTagPaneClick, true);
    patch.cleanup.push(() => view.containerEl.removeEventListener("click", onTagPaneClick, true));
    const onTagPaneContextMenu = (evt) => {
      const target = evt.target instanceof Element ? evt.target : null;
      if (!target || !view.containerEl.contains(target)) return;
      if (target.closest(".puffs-tag-note-card")) return;
      const tagEl = target.closest(".tag-pane-tag");
      if (!tagEl) return;
      if (tagEl.dataset.puffsVirtualTag === "true") return;
      const tag = this.findTagForElement(view, tagEl);
      if (!tag) return;
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      this.openRenameTagModal(tag);
    };
    view.containerEl.addEventListener("contextmenu", onTagPaneContextMenu, true);
    patch.cleanup.push(() => view.containerEl.removeEventListener("contextmenu", onTagPaneContextMenu, true));
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
    if (typeof view.updateSearch !== "function" || patch.originalUpdateSearch) return;
    patch.originalUpdateSearch = view.updateSearch;
    view.updateSearch = () => {
      if (patch.isSearchComposing) return;
      const rawQuery = this.getTagSearchValue(view);
      const query = this.resolvePinnedSearchQuery(rawQuery);
      const noteCardSearch = parseNoteCardSearch(query);
      const tagQuery = noteCardSearch ? noteCardSearch.tagQuery : query;
      const unionTerms = splitUnionSearchTerms(tagQuery);
      const intersectionTerms = splitIntersectionSearchTerms(tagQuery);
      if (!noteCardSearch && !unionTerms && !intersectionTerms) {
        patch.originalUpdateSearch.call(view);
        this.scheduleSyncView(view);
        return;
      }
      view.searchQuery = noteCardSearch ? createTagFilterSearchQuery(rawQuery, tagQuery) : createMultiTagSearchQuery(rawQuery, unionTerms || intersectionTerms);
      if (typeof view.updateTags === "function") view.updateTags();
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
    this.clearNoteCardSearchState(patch.noteCardSearchState);
    for (const cleanup of patch.cleanup) {
      cleanup();
    }
    this.viewPatches.delete(view);
  }
  registerTagViewHotkey(view, patch) {
    if (!view.scope || typeof view.scope.register !== "function") return;
    const hotkey = this.getQuickSearchHotkey();
    const signature = `${hotkey.modifiers.join("+")}+${hotkey.key}`;
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
    if (view.scope && typeof view.scope.unregister === "function") {
      view.scope.unregister(patch.hotkeyRegistration);
    }
    patch.hotkeyRegistration = null;
    patch.hotkeySignature = "";
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
      if (view.useHierarchy !== false && typeof view.setUseHierarchy === "function") {
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
    if (!inputEl || view.isShowingSearch || inputEl.value === "") return;
    const searchContainerEl = inputEl.closest(".search-input-container");
    const searchContainerStyle = searchContainerEl ? getComputedStyle(searchContainerEl) : null;
    const isSearchActuallyVisible = searchContainerStyle && searchContainerStyle.display !== "none" && searchContainerStyle.visibility !== "hidden";
    if (isSearchActuallyVisible) return;
    this.clearTagSearch(view);
  }
  getTagSearchValue(view) {
    const inputEl = view.searchComponent && view.searchComponent.inputEl;
    if (inputEl && typeof inputEl.value === "string") return inputEl.value;
    if (view.searchComponent && typeof view.searchComponent.getValue === "function") {
      return view.searchComponent.getValue();
    }
    return "";
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
    buttonEl.classList.add("puffs-tag-hidden");
    buttonEl.setAttribute("aria-hidden", "true");
  }
  renderListMode(view) {
    const listEl = this.ensureListModeContainer(view);
    if (!listEl) return;
    const rawQuery = this.getTagSearchValue(view);
    const patch = this.viewPatches.get(view);
    const shouldResetSearchScroll = !!(patch && rawQuery !== patch.lastRenderedSearchQuery && rawQuery.trim() && !rawQuery.includes("*"));
    if (patch) patch.lastRenderedSearchQuery = rawQuery;
    const effectiveQuery = this.resolvePinnedSearchQuery(rawQuery);
    const matchingItems = this.getListModeItems(view, effectiveQuery, false);
    const items = this.prependPinnedTagItem(matchingItems, rawQuery);
    const noteCardSearch = parseNoteCardSearch(effectiveQuery);
    if (patch) {
      if (noteCardSearch && noteCardSearch.isValid) {
        this.clearAutoExpandedTag(patch);
        this.syncNoteCardSearchState(patch.noteCardSearchState, effectiveQuery, matchingItems);
      } else {
        this.clearNoteCardSearchState(patch.noteCardSearchState);
        if (!noteCardSearch || noteCardSearch.isTagOnly) {
          this.syncAutoSingleSearchResult(view, patch, matchingItems, effectiveQuery);
        } else {
          this.clearAutoExpandedTag(patch);
        }
      }
    }
    this.clearStaleVirtualExpandedTags(new Set(items.map((item) => item.tag)));
    const signature = JSON.stringify(
      items.map((item) => [
        item.tag,
        item.displayName,
        item.isVirtual,
        item.files.length,
        this.settings.pinnedTag === item.tag,
        this.expandedTags.has(item.tag),
        this.expandedTags.has(item.tag) ? item.files.map((file) => file.path).join("\n") : ""
      ])
    );
    if (listEl.dataset.puffsSignature !== signature) {
      listEl.dataset.puffsSignature = signature;
      listEl.empty();
      for (const item of items) {
        this.renderListModeTagItem(listEl, item);
      }
    }
    if (patch) {
      this.scheduleNoteCardSearchEffect(
        listEl,
        view.searchComponent && view.searchComponent.inputEl,
        patch.noteCardSearchState
      );
    }
    if (shouldResetSearchScroll) {
      window.requestAnimationFrame(() => {
        const scrollEl = view.tagPaneEl || listEl.parentElement;
        if (scrollEl && scrollEl.isConnected) scrollEl.scrollTop = 0;
      });
    }
  }
  syncAutoSingleSearchResult(view, patch, items, queryValue = this.resolvePinnedSearchQuery(
    this.getTagSearchValue(view)
  )) {
    const query = getTagFilterQuery(queryValue).trim();
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
  clearStaleVirtualExpandedTags(validTags = /* @__PURE__ */ new Set()) {
    for (const tag of Array.from(this.expandedTags)) {
      if (String(tag).startsWith("intersection:") && !validTags.has(tag)) {
        this.expandedTags.delete(tag);
      }
    }
  }
  ensureListModeContainer(view) {
    const tagPaneEl = view.tagPaneEl || view.containerEl && view.containerEl.querySelector(".tag-container");
    if (!tagPaneEl) return null;
    view.containerEl.classList.add("puffs-tag-list-mode-enabled");
    let listEl = tagPaneEl.querySelector(":scope > .puffs-tag-list-container");
    if (!listEl) {
      listEl = document.createElement("div");
      listEl.className = "puffs-tag-list-container";
      tagPaneEl.appendChild(listEl);
    }
    return listEl;
  }
  getListModeItems(view, queryValue = this.resolvePinnedSearchQuery(this.getTagSearchValue(view)), includePinned = true) {
    const query = getTagFilterQuery(queryValue);
    const intersectionTerms = splitIntersectionSearchTerms(query);
    if (intersectionTerms) {
      const intersectionItems = this.getIntersectionSearchItems(intersectionTerms);
      return includePinned ? this.prependPinnedTagItem(intersectionItems, queryValue) : intersectionItems;
    }
    const unionTerms = splitUnionSearchTerms(query);
    const items = [];
    const seen = /* @__PURE__ */ new Set();
    const shouldShowTag = (tag) => {
      const files = this.tagFileIndex.get(tag) || [];
      if (isNestedTag(tag) || files.length === 0) return false;
      return unionTerms ? tagMatchesAnySearchTerm(tag, unionTerms) : tagMatchesSearchText(tag, query);
    };
    const pushTag = (tag) => {
      const normalizedTag = normalizeTag(tag);
      if (!normalizedTag || seen.has(normalizedTag) || !shouldShowTag(normalizedTag)) return;
      seen.add(normalizedTag);
      items.push({
        tag: normalizedTag,
        displayName: getTagDisplayName(normalizedTag),
        isVirtual: false,
        files: this.getOrderedFilesForTag(normalizedTag, this.tagFileIndex.get(normalizedTag) || [])
      });
    };
    for (const [tag, tagDom] of this.getTagDomEntries(view)) {
      pushTag(tagDom && tagDom.tag || tag);
    }
    const fallbackTags = Array.from(this.tagFileIndex.keys()).filter((tag) => !seen.has(tag)).sort((a, b) => {
      const countDiff = (this.tagFileIndex.get(b) || []).length - (this.tagFileIndex.get(a) || []).length;
      return countDiff || getTagDisplayName(a).localeCompare(getTagDisplayName(b), "zh-Hans-CN");
    });
    for (const tag of fallbackTags) {
      pushTag(tag);
    }
    items.sort((a, b) => {
      const countDiff = b.files.length - a.files.length;
      return countDiff || a.displayName.localeCompare(b.displayName, "zh-Hans-CN");
    });
    return includePinned ? this.prependPinnedTagItem(items, queryValue) : items;
  }
  getIntersectionSearchItems(terms) {
    const tags = Array.from(this.tagFileIndex.keys()).filter((tag) => !isNestedTag(tag) && (this.tagFileIndex.get(tag) || []).length > 0).sort((a, b) => getTagDisplayName(a).localeCompare(getTagDisplayName(b), "zh-Hans-CN"));
    const items = [];
    const seenCombinations = /* @__PURE__ */ new Set();
    const pushCombination = (selectedTags) => {
      const canonicalTags = [...selectedTags].sort();
      const combinationId = canonicalTags.join("&");
      if (seenCombinations.has(combinationId)) return;
      seenCombinations.add(combinationId);
      const files = this.getFilesWithAllTags(selectedTags);
      if (files.length === 0) return;
      items.push({
        tag: `intersection:${combinationId}`,
        displayName: selectedTags.map(getTagDisplayName).join(" & "),
        isVirtual: true,
        sourceTags: selectedTags,
        files
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
      const candidateGroups = terms.map(
        (term) => tags.filter((tag) => tagMatchesAnySearchTerm(tag, [term]))
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
      return countDiff || a.displayName.localeCompare(b.displayName, "zh-Hans-CN");
    });
    return items;
  }
  getFilesWithAllTags(tags) {
    if (tags.length === 0) return [];
    const remainingPaths = tags.slice(1).map(
      (tag) => new Set((this.tagFileIndex.get(tag) || []).map((file) => file.path))
    );
    return (this.tagFileIndex.get(tags[0]) || []).filter(
      (file) => remainingPaths.every((paths) => paths.has(file.path))
    );
  }
  renderListModeTagItem(listEl, item) {
    const { tag, displayName, files, isVirtual } = item;
    const isExpanded = this.expandedTags.has(tag);
    const treeItemEl = document.createElement("div");
    treeItemEl.className = "tree-item puffs-tag-list-item";
    treeItemEl.classList.toggle("puffs-tag-expanded", isExpanded);
    const tagEl = document.createElement("div");
    tagEl.className = "tree-item-self tag-pane-tag is-clickable mod-collapsible puffs-tag-list-row";
    tagEl.dataset.puffsTag = tag;
    if (isVirtual) tagEl.dataset.puffsVirtualTag = "true";
    tagEl.style.marginInlineStart = "0px";
    tagEl.style.setProperty("margin-inline-start", "0px", "important");
    tagEl.style.paddingInlineStart = "24px";
    tagEl.style.setProperty("padding-inline-start", "24px", "important");
    const toggleEl = document.createElement("div");
    toggleEl.className = "tree-item-icon collapse-icon puffs-tag-list-toggle";
    toggleEl.classList.toggle("is-collapsed", !isExpanded);
    toggleEl.setAttribute("aria-hidden", "true");
    (0, import_obsidian9.setIcon)(toggleEl, "right-triangle");
    const innerEl = document.createElement("div");
    innerEl.className = "tree-item-inner";
    const textEl = document.createElement("div");
    textEl.className = "tree-item-inner-text";
    textEl.textContent = displayName;
    const flairOuterEl = document.createElement("div");
    flairOuterEl.className = "tree-item-flair-outer";
    const countEl = document.createElement("span");
    countEl.className = "tag-pane-tag-count tree-item-flair";
    countEl.textContent = String(files.length);
    let scrollBottomButtonEl = null;
    let pinButtonEl = null;
    if (isExpanded) {
      scrollBottomButtonEl = document.createElement("button");
      scrollBottomButtonEl.type = "button";
      scrollBottomButtonEl.className = "clickable-icon puffs-tag-scroll-bottom-button";
      scrollBottomButtonEl.dataset.puffsTag = tag;
      (0, import_obsidian9.setIcon)(scrollBottomButtonEl, "arrow-down-to-line");
      if (!isVirtual) {
        pinButtonEl = document.createElement("button");
        pinButtonEl.type = "button";
        pinButtonEl.className = "clickable-icon puffs-tag-pin-button";
        pinButtonEl.dataset.puffsTag = tag;
        pinButtonEl.classList.toggle("is-active", this.settings.pinnedTag === tag);
        (0, import_obsidian9.setIcon)(pinButtonEl, "pin");
      }
    }
    innerEl.appendChild(textEl);
    flairOuterEl.appendChild(countEl);
    tagEl.appendChild(toggleEl);
    tagEl.appendChild(innerEl);
    if (scrollBottomButtonEl) tagEl.appendChild(scrollBottomButtonEl);
    if (pinButtonEl) tagEl.appendChild(pinButtonEl);
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
    (0, import_obsidian9.setIcon)(buttonEl, shouldExpand ? "chevrons-up-down" : "chevrons-down-up");
    buttonEl.setAttribute("aria-label", shouldExpand ? "\u5168\u90E8\u5C55\u5F00" : "\u5168\u90E8\u6536\u8D77");
    buttonEl.removeAttribute("aria-disabled");
    buttonEl.classList.remove("puffs-tag-hidden");
  }
  getTagDomEntries(view) {
    const tagDoms = view.tagDoms;
    if (!tagDoms) return [];
    if (typeof tagDoms.entries === "function") {
      return Array.from(tagDoms.entries());
    }
    return Object.entries(tagDoms);
  }
  hideTagRow(tagDom) {
    tagDom.el.classList.add("puffs-tag-hidden");
    this.removeNoteList(tagDom.el);
  }
  renderTagRow(tagDom, tag, files) {
    const tagEl = tagDom.selfEl;
    const treeItemEl = tagDom.el;
    const isExpanded = this.expandedTags.has(tag);
    treeItemEl.classList.remove("puffs-tag-hidden");
    tagEl.dataset.puffsTag = tag;
    tagEl.classList.add("puffs-tag-list-row");
    tagEl.classList.add("mod-collapsible");
    treeItemEl.classList.toggle("puffs-tag-expanded", isExpanded);
    this.setTagCount(tagDom, files.length);
    let toggleEl = Array.from(tagEl.children).find(
      (el) => el.classList.contains("puffs-tag-list-toggle")
    );
    if (!toggleEl) {
      toggleEl = document.createElement("div");
      const innerEl = tagEl.querySelector(".tree-item-inner");
      tagEl.insertBefore(toggleEl, innerEl || tagEl.firstChild);
    }
    toggleEl.className = "tree-item-icon collapse-icon puffs-tag-list-toggle";
    toggleEl.classList.toggle("is-collapsed", !isExpanded);
    (0, import_obsidian9.setIcon)(toggleEl, "right-triangle");
    toggleEl.setAttribute("aria-hidden", "true");
    if (isExpanded) {
      this.renderNoteList(treeItemEl, files, tag, false);
    } else {
      this.removeNoteList(treeItemEl);
    }
  }
  setTagCount(tagDom, count) {
    if (typeof tagDom.setCount === "function") {
      tagDom.setCount(count);
      return;
    }
    if (tagDom.tagCountEl) {
      tagDom.tagCountEl.textContent = String(count);
    }
  }
  renderNoteList(treeItemEl, files, tagValue, isVirtual = false) {
    let listEl = Array.from(treeItemEl.children).find(
      (el) => el.classList.contains("puffs-tag-note-list")
    );
    if (!listEl) {
      listEl = document.createElement("div");
      listEl.className = "tree-item-children puffs-tag-note-list";
      treeItemEl.appendChild(listEl);
    }
    listEl.className = "tree-item-children puffs-tag-note-list";
    listEl.empty();
    const tag = normalizeTag(tagValue);
    const canReorder = !!tag && !isVirtual && !isNestedTag(tag);
    for (const [fileIndex, file] of files.entries()) {
      const itemEl = document.createElement("div");
      itemEl.className = "tree-item puffs-tag-note-item";
      itemEl.dataset.path = file.path;
      itemEl.classList.toggle(
        "is-order-selected",
        this.isNoteOrderTargetSelected(tag, file.path)
      );
      const cardEl = document.createElement("div");
      cardEl.className = "tree-item-self puffs-tag-note-card is-clickable";
      cardEl.dataset.path = file.path;
      cardEl.style.marginInlineStart = "-17px";
      cardEl.style.setProperty("margin-inline-start", "-17px", "important");
      cardEl.style.paddingInlineStart = canReorder ? "17px" : "41px";
      cardEl.style.setProperty("padding-inline-start", canReorder ? "17px" : "41px", "important");
      if (canReorder) {
        cardEl.dataset.puffsTag = tag;
        cardEl.dataset.puffsSurface = "sidebar";
        const orderButtonEl = document.createElement("button");
        orderButtonEl.type = "button";
        orderButtonEl.className = "clickable-icon puffs-tag-note-order-button";
        orderButtonEl.dataset.puffsTag = tag;
        orderButtonEl.dataset.path = file.path;
        orderButtonEl.dataset.puffsSurface = "sidebar";
        (0, import_obsidian9.setIcon)(orderButtonEl, "grip-vertical");
        this.syncNoteOrderButtonSelection(orderButtonEl);
        cardEl.appendChild(orderButtonEl);
      }
      const innerEl = document.createElement("div");
      innerEl.className = "tree-item-inner";
      const textEl = document.createElement("div");
      textEl.className = "tree-item-inner-text";
      textEl.textContent = file.basename;
      innerEl.appendChild(textEl);
      cardEl.appendChild(innerEl);
      const scrollTopButtonThreshold = this.settings.scrollTopButtonThreshold;
      if (scrollTopButtonThreshold > 0 && files.length >= scrollTopButtonThreshold && fileIndex === files.length - 1) {
        const scrollTopButtonEl = document.createElement("button");
        scrollTopButtonEl.type = "button";
        scrollTopButtonEl.className = "clickable-icon puffs-tag-scroll-top-button";
        scrollTopButtonEl.dataset.puffsTag = tagValue;
        (0, import_obsidian9.setIcon)(scrollTopButtonEl, "arrow-up-to-line");
        cardEl.appendChild(scrollTopButtonEl);
      }
      itemEl.appendChild(cardEl);
      listEl.appendChild(itemEl);
    }
  }
  removeNoteList(treeItemEl) {
    const listEl = Array.from(treeItemEl.children).find(
      (el) => el.classList.contains("puffs-tag-note-list")
    );
    if (listEl) listEl.remove();
  }
  clearListEnhancements(view) {
    this.clearStaleVirtualExpandedTags();
    view.containerEl.classList.remove("puffs-tag-list-mode-enabled");
    const expandAllEl = view.collapseOrExpandAllEl;
    if (expandAllEl) {
      expandAllEl.classList.remove("puffs-tag-hidden");
      expandAllEl.removeAttribute("aria-disabled");
    }
    view.containerEl.querySelectorAll(".puffs-tag-list-container").forEach((el) => el.remove());
    view.containerEl.querySelectorAll(".puffs-tag-note-list").forEach((el) => el.remove());
    view.containerEl.querySelectorAll(".puffs-tag-list-toggle").forEach((el) => el.remove());
    view.containerEl.querySelectorAll(".tag-pane-tag[data-puffs-tag]").forEach((el) => {
      el.removeAttribute("data-puffs-tag");
      el.classList.remove("puffs-tag-list-row");
    });
    view.containerEl.querySelectorAll(".puffs-tag-hidden").forEach((el) => {
      el.classList.remove("puffs-tag-hidden");
    });
    view.containerEl.querySelectorAll(".puffs-tag-expanded").forEach((el) => {
      el.classList.remove("puffs-tag-expanded");
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
  restoreAllTagViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_VIEW_TYPE)) {
      if (!leaf.view) continue;
      this.clearListEnhancements(leaf.view);
      if (leaf.view.useHierarchy !== true && typeof leaf.view.setUseHierarchy === "function") {
        leaf.view.setUseHierarchy(true);
      }
      const buttonEl = leaf.view.useHierarchyEl;
      if (buttonEl) {
        buttonEl.classList.remove("puffs-tag-hidden");
        buttonEl.removeAttribute("aria-hidden");
        (0, import_obsidian9.setIcon)(buttonEl, "folder-tree");
        buttonEl.setAttribute("aria-label", "\u663E\u793A\u5D4C\u5957\u60C5\u51B5");
      }
    }
  }
};

// src/main.ts
var PuffsTagEnhancePlugin = class extends import_obsidian10.Plugin {
  constructor(app, manifest) {
    super(app, manifest);
    this.settings = { ...DEFAULT_SETTINGS };
    this.tagFileIndex = /* @__PURE__ */ new Map();
    this.expandedTags = /* @__PURE__ */ new Set();
    this.selectedNoteOrderTarget = null;
    this.noteOrderHotkeyScope = null;
    this.viewPatches = /* @__PURE__ */ new WeakMap();
    this.lastMainLeaf = null;
    this.currentMainFilePath = null;
    this.selectedSidebarViewType = null;
    this.sidebarSwitchRequestId = 0;
    this.activeSidebarSelectionOperation = null;
    this.initialTagIndexRefreshTimers = [];
    this.noteOrderTrackingReady = false;
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
      id: "open-tag-shelf",
      name: "\u6253\u5F00\u6807\u7B7E\u7CFB\u7EDF",
      callback: () => this.openTagShelf()
    });
    this.addRibbonIcon(TAG_SYSTEM_ICON, "\u6253\u5F00\u6807\u7B7E\u7CFB\u7EDF", () => this.openTagShelf());
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
    console.log("Puffs \u6807\u7B7E\u589E\u5F3A: \u5DF2\u52A0\u8F7D");
  }
  onunload() {
    this.isUnloaded = true;
    this.deactivateNoteOrderHotkeyScope();
    this.clearBackupTimer();
    this.clearInitialTagIndexRefreshTimers();
    this.clearTagRenameProtectionTimer();
    this.restoreAllTagViews();
    console.log("Puffs \u6807\u7B7E\u589E\u5F3A: \u5DF2\u5378\u8F7D");
  }
};
var applyBehavior = (behavior) => {
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
  TagPaneBehavior
].forEach(applyBehavior);
var main_default = PuffsTagEnhancePlugin;
