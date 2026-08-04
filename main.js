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
var import_obsidian12 = require("obsidian");

// src/models.ts
var import_obsidian = require("obsidian");

// src/sidebar-toolbar.ts
var SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS = [
  { id: "sort", label: "\u6392\u5E8F", visible: true },
  { id: "expand-collapse", label: "\u5168\u90E8\u5C55\u5F00/\u6536\u8D77", visible: true },
  { id: "open-tag-system", label: "\u6253\u5F00\u6807\u7B7E\u7CFB\u7EDF", visible: false },
  { id: "scroll-bottom", label: "\u56DE\u5E95", visible: true },
  { id: "scroll-top", label: "\u56DE\u9876", visible: true },
  { id: "filter", label: "\u7B5B\u9009", visible: true }
];
var definitionById = new Map(SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS.map((item) => [item.id, item]));
function createDefaultSidebarToolbarButtons() {
  return SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS.map((item) => ({ id: item.id, visible: item.visible }));
}
function normalizeSidebarToolbarButtons(value) {
  if (!Array.isArray(value)) return createDefaultSidebarToolbarButtons();
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) continue;
    const id = rawItem.id;
    if (typeof id !== "string" || !definitionById.has(id)) continue;
    const buttonId = id;
    if (seen.has(buttonId)) continue;
    seen.add(buttonId);
    const definition = definitionById.get(buttonId);
    const rawVisible = rawItem.visible;
    result.push({
      id: buttonId,
      visible: typeof rawVisible === "boolean" ? rawVisible : definition.visible
    });
  }
  for (const definition of SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS) {
    if (seen.has(definition.id)) continue;
    const nextDefaultIds = SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS.slice(SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS.indexOf(definition) + 1).map((item) => item.id);
    const insertIndex = result.findIndex((item) => nextDefaultIds.includes(item.id));
    const setting = { id: definition.id, visible: definition.visible };
    if (insertIndex >= 0) result.splice(insertIndex, 0, setting);
    else result.push(setting);
  }
  return result;
}
function moveSidebarToolbarButton(value, id, direction) {
  const result = normalizeSidebarToolbarButtons(value);
  const index = result.findIndex((item) => item.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= result.length) return result;
  [result[index], result[nextIndex]] = [result[nextIndex], result[index]];
  return result;
}
function getAvailableSidebarToolbarButtons(value, availableIds) {
  const available = new Set(availableIds);
  return normalizeSidebarToolbarButtons(value).filter((item) => available.has(item.id));
}
function getSidebarToolbarButtonLabel(id) {
  var _a;
  return ((_a = definitionById.get(id)) == null ? void 0 : _a.label) || id;
}

// src/relation-utils.ts
function collectDirectedDescendants(adjacency, root) {
  const output = [];
  const seen = /* @__PURE__ */ new Set([root]);
  const visit = (node) => {
    for (const child of adjacency[node] || []) {
      if (!child || seen.has(child)) continue;
      seen.add(child);
      output.push(child);
      visit(child);
    }
  };
  visit(root);
  return output;
}
function wouldCreateDirectedCycle(adjacency, parent, child) {
  return !parent || !child || parent === child || collectDirectedDescendants(adjacency, child).includes(parent);
}
function sanitizeAcyclicAdjacency(value) {
  const result = {};
  for (const [parent, children] of Object.entries(value || {})) {
    for (const child of Array.isArray(children) ? children : []) {
      if (!child || wouldCreateDirectedCycle(result, parent, child)) continue;
      if (!result[parent]) result[parent] = [];
      if (!result[parent].includes(child)) result[parent].push(child);
    }
  }
  return result;
}
function parseHierarchySearch(value) {
  const text = String(value || "").trim();
  const delimiter = text.indexOf("*");
  if (delimiter >= 0 && delimiter !== text.lastIndexOf("*")) {
    return { valid: false, parentQuery: "", childQuery: "", hasChildQuery: false };
  }
  return {
    valid: true,
    parentQuery: (delimiter < 0 ? text : text.slice(0, delimiter)).trim().toLowerCase(),
    childQuery: (delimiter < 0 ? "" : text.slice(delimiter + 1)).trim().toLowerCase(),
    hasChildQuery: delimiter >= 0
  };
}
var DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD = "=";
function normalizeHierarchySearchKeyword(_value, _fallback = DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD) {
  return DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD;
}
function parseUnifiedHierarchySearch(value, _keywordValue) {
  const text = String(value != null ? value : "").trim();
  if (text === "=") return { matched: true, query: "", mode: "query" };
  if (text === "==") return { matched: true, query: "", mode: "current-note" };
  if (!text.startsWith("=")) return { matched: false, query: "", mode: "query" };
  if (text.startsWith("==")) {
    const childQuery = text.slice(2).trim();
    if (childQuery.includes("=") || childQuery.includes("*")) {
      return { matched: false, query: "", mode: "query" };
    }
    return { matched: true, query: `*${childQuery}`, mode: "query" };
  }
  const query = text.slice(1).trim();
  const delimiter = query.indexOf("*");
  if (!query || query.includes("=") || delimiter === 0 || delimiter >= 0 && (delimiter !== query.lastIndexOf("*") || !query.slice(delimiter + 1).trim())) {
    return { matched: false, query: "", mode: "query" };
  }
  return { matched: true, query, mode: "query" };
}
function buildVisibleHierarchyForest(orderedPaths, adjacency) {
  const paths = Array.from(new Set((orderedPaths || []).filter(Boolean)));
  const visible = new Set(paths);
  const childrenByParent = {};
  const parentsByChild = {};
  for (const parent of paths) {
    const children = Array.from(new Set((adjacency[parent] || []).filter((child) => visible.has(child))));
    if (!children.length) continue;
    childrenByParent[parent] = children;
    for (const child of children) {
      if (!parentsByChild[child]) parentsByChild[child] = [];
      parentsByChild[child].push(parent);
    }
  }
  return {
    roots: paths.filter((path) => {
      var _a;
      return !((_a = parentsByChild[path]) == null ? void 0 : _a.length);
    }),
    childrenByParent,
    parentsByChild
  };
}
function mergeInheritedPaths(exactPaths, orderedBranches, excludedPaths = []) {
  const seen = new Set(exactPaths);
  const excluded = new Set(excludedPaths);
  const inheritedPaths = [];
  const sourcesByPath = /* @__PURE__ */ new Map();
  for (const branch of orderedBranches) {
    for (const path of branch.paths || []) {
      const sources = sourcesByPath.get(path) || [];
      if (!sources.includes(branch.source)) sources.push(branch.source);
      sourcesByPath.set(path, sources);
      if (!path || seen.has(path) || excluded.has(path)) continue;
      seen.add(path);
      inheritedPaths.push(path);
    }
  }
  return { inheritedPaths, sourcesByPath };
}
function buildTagInheritanceGroupTree(rootTag, childrenByParent, orderedPathsByTag, excludedPaths = []) {
  if (!rootTag) return null;
  const excluded = new Set(excludedPaths || []);
  const visit = (tag, branch, isRoot = false) => {
    if (!tag || branch.has(tag)) return null;
    const nextBranch = new Set(branch);
    nextBranch.add(tag);
    const paths = Array.from(new Set(orderedPathsByTag[tag] || [])).filter((path) => path && (isRoot || !excluded.has(path)));
    const children = (childrenByParent[tag] || []).map((child) => visit(child, nextBranch)).filter((child) => !!child && child.subtreePaths.length > 0);
    const subtreePaths = Array.from(/* @__PURE__ */ new Set([
      ...paths,
      ...children.flatMap((child) => child.subtreePaths)
    ]));
    return { tag, paths, children, subtreePaths };
  };
  return visit(rootTag, /* @__PURE__ */ new Set(), true);
}
function compareHierarchyParentItems(left, right) {
  return compareTagItemsByCount(
    { count: left.directCount, name: left.name },
    { count: right.directCount, name: right.name }
  );
}
function compareTagItemsByCount(left, right) {
  return right.count - left.count || left.name.localeCompare(right.name, "zh-Hans-CN");
}
function createHierarchyNavigationHistory() {
  return { entries: [], index: -1, restoreRequestId: 0 };
}
var copyHierarchyNavigationSnapshot = (snapshot) => {
  var _a;
  return {
    query: String((_a = snapshot == null ? void 0 : snapshot.query) != null ? _a : ""),
    scrollTop: Number.isFinite(snapshot == null ? void 0 : snapshot.scrollTop) ? Math.max(0, snapshot.scrollTop) : 0
  };
};
function pushHierarchyNavigation(history, current, target) {
  const currentSnapshot = copyHierarchyNavigationSnapshot(current);
  const targetSnapshot = copyHierarchyNavigationSnapshot(target);
  if (history.index < 0 || history.index >= history.entries.length) {
    history.entries = [currentSnapshot];
    history.index = 0;
  } else {
    history.entries[history.index] = currentSnapshot;
    history.entries = history.entries.slice(0, history.index + 1);
  }
  history.entries.push(targetSnapshot);
  history.index = history.entries.length - 1;
  history.restoreRequestId += 1;
  return { ...targetSnapshot };
}
function moveHierarchyNavigation(history, direction, current) {
  if (history.index < 0 || history.index >= history.entries.length) return null;
  history.entries[history.index] = copyHierarchyNavigationSnapshot(current);
  const nextIndex = history.index + direction;
  if (nextIndex < 0 || nextIndex >= history.entries.length) return null;
  history.index = nextIndex;
  history.restoreRequestId += 1;
  return { ...history.entries[nextIndex] };
}

// src/models.ts
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
  noteDisplayNameByTag: {},
  tagBoundNoteByTag: {},
  newNotePosition: "end",
  toggleSearchHotkey: DEFAULT_QUICK_SEARCH_HOTKEY,
  moveNoteUpHotkey: DEFAULT_MOVE_NOTE_UP_HOTKEY,
  moveNoteDownHotkey: DEFAULT_MOVE_NOTE_DOWN_HOTKEY,
  backupIntervalMinutes: 0,
  backupFolderPath: "",
  pinnedTag: null,
  scrollTopButtonThreshold: DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD,
  noteHierarchySearchKeyword: DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD,
  sidebarToolbarButtons: createDefaultSidebarToolbarButtons(),
  relations: {
    version: 1,
    tagInheritance: {
      childrenByParent: {},
      enabledParents: [],
      excludedPathsByParent: {}
    },
    noteHierarchy: {
      childrenByParentPath: {},
      displayNamesByParentPath: {}
    }
  }
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
function normalizeBackupFileName(value) {
  const text = String(value || "").trim();
  if (!text) return BACKUP_FILE_NAME;
  if (/[\\/:*?"<>|]/.test(text) || text === "." || text === "..") return BACKUP_FILE_NAME;
  return text;
}
function getBackupPathParts(value) {
  const normalizedPath = normalizeBackupFolderPath(value);
  if (!normalizedPath) {
    return {
      folderPath: "",
      fileName: BACKUP_FILE_NAME
    };
  }
  const segments = normalizedPath.split("/");
  const lastSegment = segments[segments.length - 1];
  if (lastSegment.includes(".")) {
    return {
      folderPath: normalizeBackupFolderPath(segments.slice(0, -1).join("/")),
      fileName: normalizeBackupFileName(lastSegment)
    };
  }
  return {
    folderPath: normalizedPath,
    fileName: BACKUP_FILE_NAME
  };
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
function fileMatchesNoteSearch(file, value, displayName = "") {
  const term = String(value || "").trim().toLowerCase();
  if (!term) return false;
  const fileName = String(file && file.basename || "").toLowerCase();
  const visibleName = String(displayName || "").toLowerCase();
  return fileName.includes(term) || !!visibleName && visibleName.includes(term);
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
function dedupeFrontmatterTagValue(value) {
  const tags = flattenFrontmatterTags(value);
  const uniqueTags = [];
  const seenTags = /* @__PURE__ */ new Set();
  let hasDuplicate = false;
  for (const tag of tags) {
    const normalizedTag = normalizeTag(tag);
    if (!normalizedTag || seenTags.has(normalizedTag)) {
      if (normalizedTag) hasDuplicate = true;
      continue;
    }
    seenTags.add(normalizedTag);
    uniqueTags.push(tag);
  }
  return hasDuplicate ? uniqueTags : value;
}
function replaceFrontmatterTagValue(value, oldTag, newTag) {
  let nextValue = value;
  if (Array.isArray(value)) {
    nextValue = value.map((item) => replaceFrontmatterTagValue(item, oldTag, newTag));
  } else if (typeof value === "string") {
    nextValue = replaceFrontmatterTagString(value, oldTag, newTag);
  } else if (value != null && normalizeTag(value) === oldTag) {
    nextValue = getTagDisplayName(newTag);
  }
  return dedupeFrontmatterTagValue(nextValue);
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
    this.hierarchyState = this.plugin.createHierarchySurfaceState();
    this.hierarchySearchActive = false;
    this.hierarchyNavigationHistory = createHierarchyNavigationHistory();
    this.expandAllButtonEl = null;
    this.scrollBottomButtonEl = null;
    this.scrollTopButtonEl = null;
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
    this.hierarchyNavigationHistory = createHierarchyNavigationHistory();
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
    const toolbarEl = headerEl.createDiv({ cls: "puffs-tag-shelf-toolbar" });
    this.expandAllButtonEl = this.createToolbarButton(toolbarEl, "chevrons-up-down", "\u5168\u90E8\u5C55\u5F00", () => {
      const hierarchySearch = this.plugin.getHierarchySearchContext(this.searchQuery);
      if (hierarchySearch.matched) {
        this.plugin.toggleAllHierarchyItems(this.hierarchyState);
      } else {
        const items = this.plugin.prependPinnedTagItem(
          this.plugin.getTagShelfItems(this.plugin.resolvePinnedSearchQuery(this.searchQuery), false),
          this.searchQuery
        );
        const shouldExpand = items.some((item) => !this.expandedTags.has(item.tag));
        for (const item of items) {
          if (shouldExpand) this.expandedTags.add(item.tag);
          else {
            this.expandedTags.delete(item.tag);
            this.plugin.clearInlineHierarchyBranchState(item.tag);
          }
        }
        this.renderTagList();
      }
      this.updateToolbarState();
    });
    this.scrollBottomButtonEl = this.createToolbarButton(toolbarEl, "arrow-down-to-line", "\u56DE\u5E95", () => {
      this.contentEl.scrollTop = this.contentEl.scrollHeight;
    });
    this.scrollTopButtonEl = this.createToolbarButton(toolbarEl, "arrow-up-to-line", "\u56DE\u9876", () => {
      this.contentEl.scrollTop = 0;
    });
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
      var _a, _b;
      if (event.key !== "Enter" || event.isComposing) return;
      if (this.plugin.getHierarchySearchContext(this.searchQuery).matched) {
        (_b = (_a = this.hierarchyState).handleSearchEnter) == null ? void 0 : _b.call(_a, event);
        return;
      }
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
  createToolbarButton(hostEl, icon, label, callback) {
    const buttonEl = hostEl.createEl("button", { cls: "clickable-icon", attr: { "aria-label": label } });
    (0, import_obsidian2.setIcon)(buttonEl, icon);
    buttonEl.addEventListener("click", callback);
    return buttonEl;
  }
  updateToolbarState() {
    if (!this.expandAllButtonEl) return;
    const hierarchySearch = this.plugin.getHierarchySearchContext(this.searchQuery);
    if (hierarchySearch.matched) {
      (0, import_obsidian2.setIcon)(this.expandAllButtonEl, this.hierarchyState.allExpanded ? "chevrons-down-up" : "chevrons-up-down");
      this.expandAllButtonEl.setAttribute("aria-label", this.hierarchyState.allExpanded ? "\u5168\u90E8\u6536\u8D77" : "\u5168\u90E8\u5C55\u5F00");
      return;
    }
    const items = this.plugin.prependPinnedTagItem(
      this.plugin.getTagShelfItems(this.plugin.resolvePinnedSearchQuery(this.searchQuery), false),
      this.searchQuery
    );
    const shouldExpand = items.some((item) => !this.expandedTags.has(item.tag));
    (0, import_obsidian2.setIcon)(this.expandAllButtonEl, shouldExpand ? "chevrons-up-down" : "chevrons-down-up");
    this.expandAllButtonEl.setAttribute("aria-label", shouldExpand ? "\u5168\u90E8\u5C55\u5F00" : "\u5168\u90E8\u6536\u8D77");
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
    const hierarchySearch = this.plugin.getHierarchySearchContext(query);
    if (hierarchySearch.matched) {
      if (!this.hierarchySearchActive) this.hierarchyState.groupExpanded = true;
      this.hierarchySearchActive = true;
      this.clearAutoExpandedTag();
      this.plugin.clearNoteCardSearchState(this.noteCardSearchState, this.expandedTags);
      this.hierarchyState.query = hierarchySearch.query;
      this.hierarchyState.currentNotePath = hierarchySearch.currentNotePath;
      this.hierarchyState.activeMatchIndex = -1;
      this.summaryTagCountEl.textContent = "0 \u4E2A";
      this.summaryNoteCountEl.textContent = "0 \u7BC7";
      this.plugin.renderHierarchySearchItem(this.listEl, this.hierarchyState, { surface: "shelf" });
      this.hierarchyState.inputEl = this.searchComponent && this.searchComponent.inputEl;
      this.updateToolbarState();
      return;
    }
    this.hierarchySearchActive = false;
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
        const autoExpandItems = this.plugin.settings.pinnedTag && !effectiveQuery.trim() ? items : matchingItems;
        this.syncAutoSingleSearchResult(
          noteCardSearch ? noteCardSearch.tagQuery : effectiveQuery,
          autoExpandItems
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
      this.updateToolbarState();
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
    this.updateToolbarState();
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
    if (!query && !this.plugin.isPinnedOnlyTagResult(query, items) || items.length !== 1) {
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
      this.plugin.clearInlineHierarchyBranchState(this.autoExpandedTag);
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
    countEl.textContent = item.inheritanceEnabled && item.inheritedCount > 0 ? `${item.exactCount}+${item.inheritedCount}` : String(files.length);
    let scrollBottomButtonEl = null;
    let pinButtonEl = null;
    let inheritanceButtonEl = null;
    if (!isVirtual && item.hasInheritance) {
      inheritanceButtonEl = document.createElement("button");
      inheritanceButtonEl.type = "button";
      inheritanceButtonEl.className = "clickable-icon puffs-tag-inheritance-button";
      inheritanceButtonEl.classList.toggle("is-active", !!item.inheritanceEnabled);
      inheritanceButtonEl.setAttribute("aria-label", item.inheritanceEnabled ? "\u9690\u85CF\u540E\u4EE3\u6807\u7B7E\u7B14\u8BB0" : "\u663E\u793A\u540E\u4EE3\u6807\u7B7E\u7B14\u8BB0");
      (0, import_obsidian2.setIcon)(inheritanceButtonEl, "git-merge");
      inheritanceButtonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.plugin.toggleTagInheritance(tag).catch((error) => {
          console.error("[Puffs Tag Enhance] Failed to toggle inheritance:", error);
          new import_obsidian2.Notice("\u5207\u6362\u6807\u7B7E\u7EE7\u627F\u5931\u8D25");
        });
      });
    }
    if (isExpanded && files.length > 0) {
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
    if (inheritanceButtonEl) tagEl.appendChild(inheritanceButtonEl);
    if (scrollBottomButtonEl) tagEl.appendChild(scrollBottomButtonEl);
    if (pinButtonEl) tagEl.appendChild(pinButtonEl);
    tagEl.appendChild(flairOuterEl);
    treeItemEl.appendChild(tagEl);
    tagEl.addEventListener("click", () => {
      if (this.expandedTags.has(tag)) {
        this.expandedTags.delete(tag);
        this.plugin.clearInlineHierarchyBranchState(tag);
      } else {
        this.expandedTags.add(tag);
      }
      this.renderTagList();
    });
    tagEl.addEventListener("contextmenu", (event) => {
      if (isVirtual) return;
      event.preventDefault();
      this.plugin.showTagContextMenu(event, tag);
    });
    if (isExpanded) {
      const notesEl = document.createElement("div");
      notesEl.className = "tree-item-children puffs-tag-note-list puffs-tag-shelf-notes";
      const target = this.noteCardSearchState.target;
      const renderOptions = {
        surface: "shelf",
        targetPath: (target == null ? void 0 : target.tag) === tag ? target.path : "",
        scrollContainer: this.listEl,
        rerender: () => this.renderTagList()
      };
      const browseData = !isVirtual && this.plugin.getTagBrowseData(tag);
      if ((browseData == null ? void 0 : browseData.inheritanceEnabled) && browseData.inheritanceTree) {
        this.plugin.renderTagInheritanceBrowseTree(notesEl, browseData.inheritanceTree, renderOptions);
      } else {
        this.plugin.renderInlineTagNoteTree(notesEl, files, tag, isVirtual, renderOptions);
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
    const keywordDescription = "\u56FA\u5B9A\u8BED\u6CD5\uFF1A=\uFF1B==\uFF08\u5F53\u524D\u7B14\u8BB0\u5173\u7CFB\uFF09\uFF1B=\u7236\u7B14\u8BB0\uFF1B==\u5B50\u7B14\u8BB0\uFF1B=\u7236\u7B14\u8BB0*\u5B50\u7B14\u8BB0";
    new import_obsidian3.Setting(containerEl).setName("\u7236\u5B50\u7B14\u8BB0\u641C\u7D22\u5173\u952E\u5B57").setDesc(keywordDescription).addText((text) => {
      text.setValue(DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD).setPlaceholder(DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD).setDisabled(true);
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
    new import_obsidian3.Setting(containerEl).setName("\u5907\u4EFD\u8DEF\u5F84").setDesc("Vault \u5185\u7684\u76F8\u5BF9\u8DEF\u5F84\uFF1B\u53EF\u8F93\u5165\u6587\u4EF6\u5939\uFF0C\u4E5F\u53EF\u8F93\u5165\u5305\u542B\u6587\u4EF6\u540D\u7684\u5B8C\u6574\u8DEF\u5F84\uFF0C\u652F\u6301 \\ \u6216 /").addText((text) => {
      text.setValue(this.plugin.settings.backupFolderPath).setPlaceholder("\u5176\u4ED6\\\u5907\u4EFD\\tag-data.md").onChange(async (value) => {
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
    containerEl.createEl("h3", { text: "\u4FA7\u8FB9\u680F\u9876\u680F\u6309\u94AE" });
    const toolbarButtons = normalizeSidebarToolbarButtons(this.plugin.settings.sidebarToolbarButtons);
    toolbarButtons.forEach((buttonSetting, index) => {
      const setting = new import_obsidian3.Setting(containerEl).setName(getSidebarToolbarButtonLabel(buttonSetting.id)).addToggle((toggle) => {
        toggle.setValue(buttonSetting.visible).onChange(async (visible) => {
          const nextButtons = normalizeSidebarToolbarButtons(this.plugin.settings.sidebarToolbarButtons).map((item) => item.id === buttonSetting.id ? { ...item, visible } : item);
          await this.plugin.updateSettings({ sidebarToolbarButtons: nextButtons });
        });
      });
      setting.addExtraButton((button) => {
        button.setIcon("arrow-up").setTooltip("\u4E0A\u79FB").setDisabled(index === 0).onClick(async () => {
          await this.plugin.updateSettings({
            sidebarToolbarButtons: moveSidebarToolbarButton(
              this.plugin.settings.sidebarToolbarButtons,
              buttonSetting.id,
              -1
            )
          });
          this.display();
        });
      });
      setting.addExtraButton((button) => {
        button.setIcon("arrow-down").setTooltip("\u4E0B\u79FB").setDisabled(index === toolbarButtons.length - 1).onClick(async () => {
          await this.plugin.updateSettings({
            sidebarToolbarButtons: moveSidebarToolbarButton(
              this.plugin.settings.sidebarToolbarButtons,
              buttonSetting.id,
              1
            )
          });
          this.display();
        });
      });
    });
  }
};

// src/persistence.ts
var import_obsidian4 = require("obsidian");
var PersistenceBehavior = class {
  async loadSettings() {
    const savedSettings = await this.loadData() || {};
    const shouldPersistFixedHierarchyKeyword = Object.prototype.hasOwnProperty.call(savedSettings, "noteHierarchySearchKeyword") && savedSettings.noteHierarchySearchKeyword !== DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD;
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
        this.settings.backupFolderPath = (0, import_obsidian4.normalizePath)(
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
    if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "sidebarToolbarButtons")) {
      this.refreshTagViews();
    }
    if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "noteHierarchySearchKeyword")) {
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
    const { folderPath, fileName } = getBackupPathParts(this.settings.backupFolderPath);
    await this.ensureBackupFolder(folderPath);
    const backupPath = (0, import_obsidian4.normalizePath)(
      folderPath ? `${folderPath}/${fileName}` : fileName
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
  normalizeNoteDisplayNameByTag(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    for (const [rawTag, rawEntries] of Object.entries(value)) {
      const tag = normalizeTag(rawTag);
      if (!tag || isNestedTag(tag) || !rawEntries || typeof rawEntries !== "object" || Array.isArray(rawEntries)) {
        continue;
      }
      const entries = {};
      for (const [rawPath, rawDisplayName] of Object.entries(rawEntries)) {
        const path = typeof rawPath === "string" ? rawPath.trim() : "";
        const displayName = typeof rawDisplayName === "string" ? rawDisplayName.trim() : "";
        if (!path || !displayName) continue;
        entries[path] = displayName;
      }
      if (Object.keys(entries).length > 0) result[tag] = entries;
    }
    return result;
  }
  normalizeTagBoundNoteByTag(value) {
    var _a, _b, _c;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result = {};
    for (const [rawTag, rawPath] of Object.entries(value)) {
      const tag = normalizeTag(rawTag);
      const path = typeof rawPath === "string" ? rawPath.trim() : "";
      if (!tag || !path || Object.prototype.hasOwnProperty.call(result, tag)) continue;
      const file = (_c = (_b = (_a = this.app) == null ? void 0 : _a.vault) == null ? void 0 : _b.getAbstractFileByPath) == null ? void 0 : _c.call(_b, path);
      if (!file || file.extension !== "md") continue;
      result[tag] = path;
    }
    return result;
  }
};

// src/interactions.ts
var import_obsidian5 = require("obsidian");
var _InteractionsBehavior = class _InteractionsBehavior {
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
  getOrderedRootFilesForTag(tagValue, files) {
    const orderedFiles = this.getOrderedFilesForTag(tagValue, files);
    const visiblePaths = new Set(orderedFiles.map((file) => file.path));
    return orderedFiles.filter(
      (file) => !this.getHierarchyParents(file.path).some((parentPath) => visiblePaths.has(parentPath))
    );
  }
  getNoteAliases(file) {
    if (!(file instanceof import_obsidian5.TFile) || file.extension !== "md") return [];
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache && cache.frontmatter;
    if (!frontmatter) return [];
    const aliases = [];
    const collectAliases = (value) => {
      if (Array.isArray(value)) {
        value.forEach(collectAliases);
        return;
      }
      if (value == null) return;
      const alias = String(value).trim();
      if (alias) aliases.push(alias);
    };
    collectAliases(frontmatter.aliases);
    collectAliases(frontmatter.alias);
    return Array.from(new Set(aliases)).filter((alias) => alias !== file.basename);
  }
  getNoteDisplayName(tagValue, file, isVirtual = false) {
    if (!(file instanceof import_obsidian5.TFile) || isVirtual) return file && file.basename ? file.basename : "";
    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag)) return file.basename;
    const selected = this.settings.noteDisplayNameByTag && this.settings.noteDisplayNameByTag[tag] && this.settings.noteDisplayNameByTag[tag][file.path];
    return selected && this.getNoteAliases(file).includes(selected) ? selected : file.basename;
  }
  refreshNoteDisplayNameCards(tagValue, file) {
    const tag = normalizeTag(tagValue);
    if (!tag || !(file instanceof import_obsidian5.TFile)) return;
    const displayName = this.getNoteDisplayName(tag, file);
    document.querySelectorAll(".puffs-tag-note-card[data-puffs-tag][data-path]").forEach((cardEl) => {
      if (cardEl.dataset.puffsTag !== tag || cardEl.dataset.path !== file.path) return;
      const textEl = cardEl.querySelector(".tree-item-inner-text");
      if (textEl) textEl.textContent = displayName;
    });
  }
  async setNoteDisplayName(tagValue, file, displayName) {
    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag) || !(file instanceof import_obsidian5.TFile) || file.extension !== "md" || !(this.tagFileIndex.get(tag) || []).some((candidate) => candidate.path === file.path)) {
      return;
    }
    const aliases = this.getNoteAliases(file);
    const selected = typeof displayName === "string" ? displayName.trim() : "";
    if (selected && !aliases.includes(selected)) return;
    if (!this.settings.noteDisplayNameByTag || typeof this.settings.noteDisplayNameByTag !== "object") {
      this.settings.noteDisplayNameByTag = {};
    }
    if (selected) {
      if (!this.settings.noteDisplayNameByTag[tag]) this.settings.noteDisplayNameByTag[tag] = {};
      this.settings.noteDisplayNameByTag[tag][file.path] = selected;
    } else if (this.settings.noteDisplayNameByTag[tag]) {
      delete this.settings.noteDisplayNameByTag[tag][file.path];
      if (Object.keys(this.settings.noteDisplayNameByTag[tag]).length === 0) {
        delete this.settings.noteDisplayNameByTag[tag];
      }
    }
    this.refreshNoteDisplayNameCards(tag, file);
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }
  showNoteDisplayNameMenuForCard(event, cardEl) {
    const tag = normalizeTag(cardEl && cardEl.dataset.puffsTag);
    const path = cardEl && cardEl.dataset.path;
    if (!tag || isNestedTag(tag) || !path) return false;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian5.TFile)) return false;
    const aliases = this.getNoteAliases(file);
    if (aliases.length === 0) return false;
    const menu = new import_obsidian5.Menu();
    menu.addItem((item) => {
      item.setTitle("\u66F4\u6362\u663E\u793A\u540D\u79F0").setIcon("text-cursor-input").onClick(() => {
        const position = { x: event.clientX, y: event.clientY };
        window.setTimeout(() => {
          this.showNoteDisplayNameOptions(position, tag, file, aliases);
        }, 0);
      });
    });
    menu.showAtMouseEvent(event);
    return true;
  }
  showNoteDisplayNameOptions(position, tag, file, aliases = this.getNoteAliases(file)) {
    const currentName = this.getNoteDisplayName(tag, file);
    const menu = new import_obsidian5.Menu();
    menu.addItem((item) => {
      item.setTitle(file.basename).setChecked(currentName === file.basename).onClick(() => this.setNoteDisplayName(tag, file, "").catch((error) => {
        console.error("[Puffs Tag Enhance] Failed to restore note display name:", error);
        new import_obsidian5.Notice("\u6062\u590D\u6587\u4EF6\u540D\u5931\u8D25");
      }));
    });
    for (const alias of aliases) {
      menu.addItem((item) => {
        item.setTitle(alias).setChecked(currentName === alias).onClick(() => this.setNoteDisplayName(tag, file, alias).catch((error) => {
          console.error("[Puffs Tag Enhance] Failed to change note display name:", error);
          new import_obsidian5.Notice("\u66F4\u6362\u5C55\u793A\u540D\u79F0\u5931\u8D25");
        }));
      });
    }
    menu.showAtPosition(position);
  }
  resolvePinnedSearchQuery(value) {
    const query = String(value || "").trimStart();
    const pinnedTag = normalizeTag(this.settings.pinnedTag);
    if (!pinnedTag || !["*", "&", "|"].includes(query.charAt(0))) return query;
    return `${getTagDisplayName(pinnedTag)}${query}`;
  }
  getPinnedTagItem() {
    const tag = normalizeTag(this.settings.pinnedTag);
    const browseData = tag && !isNestedTag(tag) ? this.getTagBrowseData(tag) : null;
    const files = browseData ? browseData.files : [];
    if (!tag || files.length === 0) return null;
    return {
      tag,
      displayName: getTagDisplayName(tag),
      isVirtual: false,
      isPinnedExtra: true,
      files,
      exactCount: browseData.exactCount,
      inheritedCount: browseData.inheritedCount,
      inheritanceEnabled: browseData.inheritanceEnabled,
      hasInheritance: browseData.hasInheritance
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
    if (!String(query || "").trim()) return [positionedPinnedItem];
    const isNonNoteSearch = String(query || "").trim() && !String(query || "").includes("*");
    return isNonNoteSearch ? [...remainingItems, positionedPinnedItem] : [positionedPinnedItem, ...remainingItems];
  }
  isPinnedOnlyTagResult(query, items) {
    const pinnedTag = normalizeTag(this.settings.pinnedTag);
    return !!(pinnedTag && !String(query || "").trim() && items.length === 1 && items[0].tag === pinnedTag);
  }
  async togglePinnedTag(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag) || this.getTagBrowseData(tag).files.length === 0) return;
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
    const items = Array.from(this.getLogicalTagSet()).filter((tag) => !isNestedTag(tag)).map((tag) => {
      const browseData = this.getTagBrowseData(tag);
      return {
        tag,
        displayName: getTagDisplayName(tag),
        isVirtual: false,
        files: browseData.files,
        exactCount: browseData.exactCount,
        inheritedCount: browseData.inheritedCount,
        inheritanceEnabled: browseData.inheritanceEnabled,
        hasInheritance: browseData.hasInheritance,
        sourcesByPath: browseData.sourcesByPath
      };
    }).filter((item) => item.files.length > 0 || item.hasInheritance).sort((a, b) => compareTagItemsByCount(
      { count: a.files.length, name: a.displayName },
      { count: b.files.length, name: b.displayName }
    ));
    const matchingItems = unionTerms ? items.filter((item) => tagMatchesAnySearchTerm(item.tag, unionTerms)) : items.filter((item) => tagMatchesSearchText(item.tag, tagQuery));
    return includePinned ? this.prependPinnedTagItem(matchingItems, query) : matchingItems;
  }
  getNoteCardSearchMatches(query, items) {
    const noteCardSearch = parseNoteCardSearch(query);
    if (!noteCardSearch || !noteCardSearch.isValid) return [];
    const matches = [];
    for (const item of items) {
      const visiblePaths = new Set(item.files.map((file) => file.path));
      for (const file of item.files) {
        const displayNames = [this.getNoteDisplayName(item.tag, file, item.isVirtual)];
        if (!item.isVirtual) {
          for (const parentPath of this.getHierarchyParents(file.path)) {
            if (!visiblePaths.has(parentPath)) continue;
            displayNames.push(this.getInlineHierarchyDisplayName(item.tag, parentPath, file, false));
          }
        }
        if (!displayNames.some((displayName) => fileMatchesNoteSearch(file, noteCardSearch.noteQuery, displayName))) continue;
        matches.push({
          tag: item.tag,
          path: file.path,
          key: `${item.tag}\0${file.path}`
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
      this.clearInlineHierarchyBranchState(state.autoExpandedTag);
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
    if (state.effectTimer !== null) {
      window.clearTimeout(state.effectTimer);
      state.effectTimer = null;
    }
    const findTargetCard = (target2) => {
      if (!target2) return null;
      const tagRowEl = Array.from(
        containerEl.querySelectorAll(".tag-pane-tag[data-puffs-tag]")
      ).find((rowEl) => rowEl.dataset.puffsTag === target2.tag);
      const tagItemEl = tagRowEl && tagRowEl.closest(".puffs-tag-list-item");
      return tagItemEl && Array.from(tagItemEl.querySelectorAll(".puffs-tag-note-card[data-path]")).find(
        (candidate) => candidate.dataset.path === target2.path
      );
    };
    const target = state.target;
    const targetCardEl = findTargetCard(target);
    containerEl.querySelectorAll(".puffs-tag-note-card.is-note-search-match").forEach((cardEl) => {
      if (cardEl !== targetCardEl) cardEl.classList.remove("is-note-search-match");
    });
    if (!target || !targetCardEl) return;
    targetCardEl.classList.add("is-note-search-match");
    if (state.pendingScrollKey !== target.key) return;
    const scheduledTargetKey = target.key;
    const shouldRestoreInputFocus = document.activeElement === inputEl;
    state.effectTimer = window.setTimeout(() => {
      state.effectTimer = null;
      const currentTarget = state.target;
      if (!currentTarget || currentTarget.key !== scheduledTargetKey || state.pendingScrollKey !== scheduledTargetKey) {
        return;
      }
      const currentCardEl = findTargetCard(currentTarget);
      if (!currentCardEl) return;
      currentCardEl.scrollIntoView({ block: "center", inline: "nearest" });
      state.lastScrolledKey = scheduledTargetKey;
      state.pendingScrollKey = "";
      if (shouldRestoreInputFocus && inputEl && inputEl.isConnected) {
        try {
          inputEl.focus({ preventScroll: true });
        } catch (_) {
          inputEl.focus();
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
  isNoteOrderTargetSelected(tag, path, hierarchyParent = "") {
    return !!(this.selectedNoteOrderTarget && (hierarchyParent ? this.selectedNoteOrderTarget.hierarchyParent === hierarchyParent : this.selectedNoteOrderTarget.tag === tag) && this.selectedNoteOrderTarget.path === path);
  }
  syncNoteOrderButtonSelection(buttonEl) {
    if (!buttonEl) return;
    const isSelected = this.isNoteOrderTargetSelected(
      buttonEl.dataset.puffsTag,
      buttonEl.dataset.path,
      buttonEl.dataset.puffsHierarchyParent
    );
    buttonEl.classList.toggle("is-selected", isSelected);
    buttonEl.setAttribute("aria-pressed", String(isSelected));
    if (buttonEl.classList.contains("puffs-note-parent-control-button")) {
      const isExpanded = buttonEl.dataset.puffsExpanded === "true";
      if (isSelected) {
        (0, import_obsidian5.setIcon)(buttonEl, "grip-vertical");
        buttonEl.classList.remove("is-collapsed");
      } else {
        (0, import_obsidian5.setIcon)(buttonEl, "right-triangle");
        buttonEl.classList.toggle("is-collapsed", !isExpanded);
      }
      buttonEl.removeAttribute("aria-label");
      buttonEl.removeAttribute("data-tooltip-position");
      buttonEl.setAttribute("aria-expanded", String(isExpanded));
    }
    const noteItemEl = buttonEl.closest(".puffs-tag-note-item");
    if (noteItemEl) noteItemEl.classList.toggle("is-order-selected", isSelected);
  }
  bindNoteParentControlButton(buttonEl, toggleExpansion, toggleOrder) {
    if (!buttonEl) return () => {
    };
    let longPressTimer = null;
    let suppressNextClick = false;
    const clearLongPressTimer = () => {
      if (!longPressTimer) return;
      globalThis.clearTimeout(longPressTimer);
      longPressTimer = null;
    };
    const onPointerDown = (event) => {
      if (event.button !== 0 || this.isNoteOrderTargetSelected(
        buttonEl.dataset.puffsTag,
        buttonEl.dataset.path,
        buttonEl.dataset.puffsHierarchyParent
      )) return;
      clearLongPressTimer();
      suppressNextClick = false;
      longPressTimer = globalThis.setTimeout(() => {
        longPressTimer = null;
        suppressNextClick = true;
        toggleOrder();
      }, _InteractionsBehavior.NOTE_ORDER_LONG_PRESS_MS);
    };
    const onPointerUp = () => clearLongPressTimer();
    const onPointerAbort = () => {
      clearLongPressTimer();
      suppressNextClick = false;
    };
    const onClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (this.isNoteOrderTargetSelected(
        buttonEl.dataset.puffsTag,
        buttonEl.dataset.path,
        buttonEl.dataset.puffsHierarchyParent
      )) {
        toggleOrder();
        return;
      }
      toggleExpansion();
    };
    buttonEl.addEventListener("pointerdown", onPointerDown);
    buttonEl.addEventListener("pointerup", onPointerUp);
    buttonEl.addEventListener("pointerleave", onPointerAbort);
    buttonEl.addEventListener("pointercancel", onPointerAbort);
    buttonEl.addEventListener("click", onClick);
    return () => {
      clearLongPressTimer();
      buttonEl.removeEventListener("pointerdown", onPointerDown);
      buttonEl.removeEventListener("pointerup", onPointerUp);
      buttonEl.removeEventListener("pointerleave", onPointerAbort);
      buttonEl.removeEventListener("pointercancel", onPointerAbort);
      buttonEl.removeEventListener("click", onClick);
    };
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
  toggleHierarchyNoteOrderTarget(parentPath, path, surface = "") {
    if (!parentPath || !path) return;
    if (this.isNoteOrderTargetSelected("", path, parentPath)) {
      this.selectedNoteOrderTarget = null;
      this.deactivateNoteOrderHotkeyScope();
    } else {
      this.selectedNoteOrderTarget = { hierarchyParent: parentPath, path, surface };
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
    const { tag, hierarchyParent, path, surface } = this.selectedNoteOrderTarget;
    const buttons = Array.from(document.querySelectorAll(".puffs-tag-note-order-button"));
    const buttonEl = buttons.find(
      (button) => (hierarchyParent ? button.dataset.puffsHierarchyParent === hierarchyParent : button.dataset.puffsTag === tag) && button.dataset.path === path && button.dataset.puffsSurface === surface && button.offsetParent !== null
    ) || buttons.find(
      (button) => (hierarchyParent ? button.dataset.puffsHierarchyParent === hierarchyParent : button.dataset.puffsTag === tag) && button.dataset.path === path && button.offsetParent !== null
    );
    if (buttonEl) buttonEl.focus({ preventScroll: true });
  }
  async moveSelectedNote(direction) {
    const target = this.selectedNoteOrderTarget;
    if (!target || direction !== -1 && direction !== 1) return false;
    if (target.hierarchyParent) {
      await this.moveHierarchyChild(target.hierarchyParent, target.path, direction);
      window.setTimeout(() => {
        this.refreshNoteOrderSelectionState();
        this.focusSelectedNoteOrderButton();
      }, 0);
      return true;
    }
    const files = this.getOrderedRootFilesForTag(target.tag, this.tagFileIndex.get(target.tag) || []);
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
    if (selected && selected.hierarchyParent) {
      return this.moveSelectedHierarchyNoteAfter(selected.hierarchyParent, targetPath);
    }
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
_InteractionsBehavior.NOTE_ORDER_LONG_PRESS_MS = 500;
var InteractionsBehavior = _InteractionsBehavior;

// src/workspace.ts
var obsidian = __toESM(require("obsidian"));
var import_obsidian6 = require("obsidian");
var TAG_PLUGIN_ID = "tag-pane";
var OPEN_TAG_COMMAND_ID = "tag-pane:open";
var TOGGLE_RIGHT_SIDEBAR_COMMAND_ID = "app:toggle-right-sidebar";
var LEGACY_TAG_SIDEBAR_COMMAND_ID = "puffs-immersive-mode:toggle-tag-sidebar";
var WorkspaceBehavior = class {
  refreshTagShelfViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_SHELF_VIEW_TYPE)) {
      if (leaf.view && typeof leaf.view.refresh === "function") {
        leaf.view.refresh();
      }
    }
  }
  refreshCurrentNoteHierarchySearchViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_VIEW_TYPE) || []) {
      const view = leaf.view;
      if (!view || this.getHierarchySearchContext(this.getTagSearchValue(view)).mode !== "current-note") continue;
      this.scheduleSyncView(view, 0);
    }
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_SHELF_VIEW_TYPE) || []) {
      const view = leaf.view;
      if (!view || this.getHierarchySearchContext(view.searchQuery).mode !== "current-note") continue;
      if (typeof view.renderTagList === "function") view.renderTagList();
      else if (typeof view.refresh === "function") view.refresh();
    }
  }
  updateCurrentMainFilePath(filePath) {
    const nextPath = filePath || null;
    if (nextPath === this.currentMainFilePath) return false;
    this.currentMainFilePath = nextPath;
    this.refreshCurrentNoteHierarchySearchViews();
    return true;
  }
  handleWorkspaceFileOpen(_file) {
    var _a;
    const editorLeaf = (_a = this.app.workspace.activeEditor) == null ? void 0 : _a.leaf;
    if (!this.isMarkdownMainLeaf(editorLeaf)) return;
    this.rememberMainLeaf(editorLeaf);
    const filePath = getLeafFilePath(editorLeaf);
    if (!filePath) return;
    if (this.updateCurrentMainFilePath(filePath)) this.applySidebarPreferenceForCurrentFile();
  }
  getVisibleTagLeaf() {
    return (this.app.workspace.getLeavesOfType(TAG_VIEW_TYPE) || []).find((leaf) => {
      if (typeof leaf.isVisible === "function") return leaf.isVisible();
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
    const tagPlugin = this.app.internalPlugins && this.app.internalPlugins.getPluginById && this.app.internalPlugins.getPluginById(TAG_PLUGIN_ID);
    if (tagPlugin && !tagPlugin.enabled) {
      new import_obsidian6.Notice("\u8BF7\u5148\u542F\u7528 Obsidian \u6838\u5FC3\u63D2\u4EF6 \u6807\u7B7E\u5217\u8868\u3002");
      return;
    }
    const leaf = this.getVisibleTagLeaf();
    if (leaf) {
      const patch = this.viewPatches.get(leaf.view);
      if (patch && patch.hierarchySearchActive) {
        this.exitSidebarHierarchySearch(leaf.view, patch);
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
    if (opened === false) new import_obsidian6.Notice("\u65E0\u6CD5\u6253\u5F00\u6807\u7B7E\u5217\u8868\uFF0C\u8BF7\u786E\u8BA4\u6838\u5FC3\u63D2\u4EF6 \u6807\u7B7E\u5217\u8868 \u5DF2\u542F\u7528\u3002");
  }
  async migrateTagSidebarHotkeys() {
    const manager = this.app.hotkeyManager;
    if (!manager || !manager.getHotkeys || !manager.setHotkeys || !manager.removeHotkeys) return;
    const nextId = `${this.manifest.id}:toggle-tag-sidebar`;
    const legacy = manager.getHotkeys(LEGACY_TAG_SIDEBAR_COMMAND_ID) || [];
    if (!legacy.length) return;
    const current = manager.getHotkeys(nextId) || [];
    const merged = Array.from(new Map([...current, ...legacy].map((hotkey) => [JSON.stringify(hotkey), hotkey])).values());
    manager.setHotkeys(nextId, merged);
    manager.removeHotkeys(LEGACY_TAG_SIDEBAR_COMMAND_ID);
    if (manager.save) await manager.save();
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
      if (this.handleHierarchyNavigationHotkey(evt)) return;
      if (!this.isQuickSearchHotkey(evt)) return;
      const view = this.getFocusedTagView();
      if (!view) return;
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      this.toggleTagSearch(view);
    };
    window.addEventListener("keydown", this.keydownHandler, true);
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
          console.error("[Puffs Tag Enhance] Failed to move hierarchy note:", error);
          new import_obsidian6.Notice("\u8C03\u6574\u5B50\u7B14\u8BB0\u987A\u5E8F\u5931\u8D25");
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
        console.error("[Puffs Tag Enhance] Failed to move selected note after target:", error);
        new import_obsidian6.Notice("\u8C03\u6574\u7B14\u8BB0\u987A\u5E8F\u5931\u8D25");
      });
    };
    document.addEventListener("contextmenu", this.noteOrderContextMenuHandler, true);
    this.register(() => {
      window.removeEventListener("keydown", this.keydownHandler, true);
      document.removeEventListener("keydown", this.keydownHandler, true);
      document.removeEventListener("pointerdown", this.pointerdownHandler, true);
      document.removeEventListener("contextmenu", this.noteOrderContextMenuHandler, true);
      this.keydownHandler = null;
      this.pointerdownHandler = null;
      this.noteOrderContextMenuHandler = null;
    });
  }
  getActiveHierarchyNavigationSurface() {
    const tagView = this.getFocusedTagView();
    if (tagView) return { view: tagView, surface: "sidebar" };
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_SHELF_VIEW_TYPE) || []) {
      const view = leaf.view;
      if (view && typeof view.isActiveView === "function" && view.isActiveView()) {
        return { view, surface: "shelf" };
      }
    }
    return null;
  }
  handleHierarchyNavigationHotkey(evt) {
    if (!evt.altKey || evt.ctrlKey || evt.metaKey || evt.shiftKey || evt.key !== "ArrowLeft" && evt.key !== "ArrowRight") return false;
    const target = this.getActiveHierarchyNavigationSurface();
    if (!target) return false;
    const history = this.getHierarchyNavigationHistory(target.view, target.surface);
    if (history.entries.length < 2) return false;
    evt.preventDefault();
    evt.stopPropagation();
    evt.stopImmediatePropagation();
    this.navigateHierarchyHistory(target.view, target.surface, evt.key === "ArrowLeft" ? -1 : 1);
    return true;
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
      this.updateCurrentMainFilePath(file.path);
    }
    this.saveSettings();
  }
  handlePreferredFileDelete(file) {
    if (!file || !file.path || !this.settings.tagSidebarPreferredFiles) return;
    if (!this.settings.tagSidebarPreferredFiles[file.path]) return;
    delete this.settings.tagSidebarPreferredFiles[file.path];
    if (this.currentMainFilePath === file.path) {
      this.updateCurrentMainFilePath(null);
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
  handleNoteDisplayNameFileRename(file, oldPath) {
    if (!(file instanceof import_obsidian6.TFile) || file.extension !== "md" || !oldPath || !file.path || !this.settings.noteDisplayNameByTag) {
      return;
    }
    let changed = false;
    for (const [tag, entries] of Object.entries(this.settings.noteDisplayNameByTag)) {
      if (!entries || typeof entries !== "object" || !entries[oldPath]) continue;
      if (!entries[file.path]) entries[file.path] = entries[oldPath];
      delete entries[oldPath];
      if (Object.keys(entries).length === 0) delete this.settings.noteDisplayNameByTag[tag];
      changed = true;
    }
    if (changed) {
      this.saveSettings().catch((error) => {
        console.error("[Puffs Tag Enhance] Failed to update note display name after rename:", error);
      });
    }
  }
  handleNoteDisplayNameFileDelete(file) {
    if (!(file instanceof import_obsidian6.TFile) || file.extension !== "md" || !file.path || !this.settings.noteDisplayNameByTag) {
      return;
    }
    let changed = false;
    for (const [tag, entries] of Object.entries(this.settings.noteDisplayNameByTag)) {
      if (!entries || typeof entries !== "object" || !entries[file.path]) continue;
      delete entries[file.path];
      if (Object.keys(entries).length === 0) delete this.settings.noteDisplayNameByTag[tag];
      changed = true;
    }
    if (changed) {
      this.saveSettings().catch((error) => {
        console.error("[Puffs Tag Enhance] Failed to remove note display name after delete:", error);
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
    let leaf = this.isMarkdownMainLeaf(activeLeaf) ? activeLeaf : editorLeaf;
    if (!this.isMarkdownMainLeaf(leaf)) {
      this.app.workspace.iterateAllLeaves((candidate) => {
        if (!this.isMarkdownMainLeaf(candidate)) return;
        if (!leaf || (leaf.activeTime || 0) < (candidate.activeTime || 0)) leaf = candidate;
      });
    }
    this.rememberMainLeaf(leaf);
    if (this.isMarkdownMainLeaf(leaf)) {
      this.updateCurrentMainFilePath(getLeafFilePath(leaf));
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
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => this.handleWorkspaceFileOpen(file))
    );
  }
  registerMetadataHandlers() {
    const scheduleRefresh = (file) => this.scheduleMetadataRefresh(file);
    this.registerEvent(this.app.metadataCache.on("changed", scheduleRefresh));
    this.registerEvent(this.app.metadataCache.on("deleted", scheduleRefresh));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.handlePreferredFileRename(file, oldPath);
      this.handleNoteOrderFileRename(file, oldPath);
      this.handleNoteDisplayNameFileRename(file, oldPath);
      this.handleTagBoundNoteFileRename(file, oldPath);
      this.handleRelationFileRename(file, oldPath);
      this.refreshTagViews();
      this.refreshTagShelfViews();
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      this.handlePreferredFileDelete(file);
      this.handleNoteOrderFileDelete(file);
      this.handleNoteDisplayNameFileDelete(file);
      this.handleTagBoundNoteFileDelete(file);
      this.handleRelationFileDelete(file);
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
    const metadataCacheReady = this.isMetadataCacheReadyForNoteOrderTracking();
    let noteOrderChanged = false;
    if (!this.noteOrderTrackingReady) {
      if (metadataCacheReady) {
        noteOrderChanged = this.initializeNoteOrders(nextIndex);
        this.noteOrderTrackingReady = true;
      }
    } else if (this.noteOrderTrackingReady && !this.activeTagRename) {
      noteOrderChanged = this.reconcileNoteOrders(nextIndex, changedPath);
    }
    if (!this.tagBindingTrackingReady && metadataCacheReady) this.tagBindingTrackingReady = true;
    this.tagFileIndex = nextIndex;
    this.reconcileExpandedTags();
    const pinnedTagChanged = this.reconcilePinnedTag();
    const noteDisplayNamesChanged = !this.activeTagRename ? this.reconcileNoteDisplayNames(nextIndex) : false;
    const tagBoundNotesChanged = this.tagBindingTrackingReady && !this.activeTagRename ? this.reconcileTagBoundNotes(nextIndex) : false;
    return noteOrderChanged || pinnedTagChanged || noteDisplayNamesChanged || tagBoundNotesChanged;
  }
  reconcileNoteDisplayNames(nextIndex) {
    const nextDisplayNames = {};
    const savedDisplayNames = this.settings.noteDisplayNameByTag || {};
    for (const [tag, entries] of Object.entries(savedDisplayNames)) {
      if (!nextIndex.has(tag) || !entries || typeof entries !== "object" || Array.isArray(entries)) {
        continue;
      }
      const filesByPath = new Map((nextIndex.get(tag) || []).map((file) => [file.path, file]));
      const retainedEntries = {};
      for (const [path, displayName] of Object.entries(entries)) {
        const file = filesByPath.get(path);
        if (!file || !this.getNoteAliases(file).includes(displayName)) continue;
        retainedEntries[path] = displayName;
      }
      if (Object.keys(retainedEntries).length > 0) nextDisplayNames[tag] = retainedEntries;
    }
    const changed = JSON.stringify(nextDisplayNames) !== JSON.stringify(this.settings.noteDisplayNameByTag || {});
    if (changed) this.settings.noteDisplayNameByTag = nextDisplayNames;
    return changed;
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
        this.clearInlineHierarchyBranchState(tag);
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
    const oldDisplayNames = {
      ...this.settings.noteDisplayNameByTag && this.settings.noteDisplayNameByTag[oldTag] || {}
    };
    const existingNewDisplayNames = {
      ...this.settings.noteDisplayNameByTag && this.settings.noteDisplayNameByTag[newTag] || {}
    };
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
        this.clearInlineHierarchyBranchState(oldTag);
        this.clearInlineHierarchyBranchState(newTag);
        this.expandedTags.add(newTag);
      }
      if (this.settings.pinnedTag === oldTag) {
        this.settings.pinnedTag = newTag;
      }
      this.migrateTagRelations(oldTag, newTag);
      this.migrateTagBoundNote(oldTag, newTag);
      if (migratedOrder.length > 0) {
        this.settings.noteOrderByTag[newTag] = migratedOrder;
      } else {
        delete this.settings.noteOrderByTag[newTag];
      }
      delete this.settings.noteOrderByTag[oldTag];
      this.settings.noteOrderByTag = this.normalizeNoteOrderByTag(this.settings.noteOrderByTag);
      const migratedDisplayNames = { ...oldDisplayNames, ...existingNewDisplayNames };
      if (Object.keys(migratedDisplayNames).length > 0) {
        this.settings.noteDisplayNameByTag[newTag] = migratedDisplayNames;
      } else {
        delete this.settings.noteDisplayNameByTag[newTag];
      }
      delete this.settings.noteDisplayNameByTag[oldTag];
      this.settings.noteDisplayNameByTag = this.normalizeNoteDisplayNameByTag(
        this.settings.noteDisplayNameByTag
      );
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
      lastRenderedSearchQuery: this.getTagSearchValue(view),
      hierarchySearchActive: false,
      hierarchyState: this.createHierarchySurfaceState(),
      hierarchyNavigationHistory: createHierarchyNavigationHistory(),
      hierarchyPageEl: null,
      scrollBottomButtonEl: null,
      scrollTopButtonEl: null,
      tagSystemButtonEl: null,
      toolbarButtonEls: /* @__PURE__ */ new Map()
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
        if (patch.hierarchySearchActive && patch.hierarchyState.handleSearchEnter) {
          patch.hierarchyState.handleSearchEnter(event);
          return;
        }
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
        if (patch.hierarchySearchActive) {
          this.toggleAllHierarchyItems(patch.hierarchyState);
          this.updateHierarchyExpandAllButton(view, patch);
        } else {
          this.toggleAllListModeTags(view);
        }
      };
      expandAllEl.addEventListener("click", onExpandAllClick, true);
      patch.cleanup.push(() => expandAllEl.removeEventListener("click", onExpandAllClick, true));
      const tagSystemButtonEl = document.createElement("div");
      tagSystemButtonEl.className = "clickable-icon nav-action-button puffs-tag-system-button";
      tagSystemButtonEl.setAttribute("aria-label", "\u6253\u5F00\u6807\u7B7E\u7CFB\u7EDF");
      (0, import_obsidian9.setIcon)(tagSystemButtonEl, TAG_SYSTEM_ICON);
      expandAllEl.insertAdjacentElement("afterend", tagSystemButtonEl);
      const scrollBottomButtonEl = document.createElement("div");
      scrollBottomButtonEl.className = "clickable-icon nav-action-button puffs-tag-pane-scroll-bottom-button";
      scrollBottomButtonEl.setAttribute("aria-label", "\u56DE\u5E95");
      (0, import_obsidian9.setIcon)(scrollBottomButtonEl, "arrow-down-to-line");
      tagSystemButtonEl.insertAdjacentElement("afterend", scrollBottomButtonEl);
      const scrollTopButtonEl = document.createElement("div");
      scrollTopButtonEl.className = "clickable-icon nav-action-button puffs-tag-pane-scroll-top-button";
      scrollTopButtonEl.setAttribute("aria-label", "\u56DE\u9876");
      (0, import_obsidian9.setIcon)(scrollTopButtonEl, "arrow-up-to-line");
      scrollBottomButtonEl.insertAdjacentElement("afterend", scrollTopButtonEl);
      patch.scrollBottomButtonEl = scrollBottomButtonEl;
      patch.scrollTopButtonEl = scrollTopButtonEl;
      patch.tagSystemButtonEl = tagSystemButtonEl;
      patch.toolbarButtonEls.set("open-tag-system", tagSystemButtonEl);
      patch.toolbarButtonEls.set("scroll-bottom", scrollBottomButtonEl);
      patch.toolbarButtonEls.set("scroll-top", scrollTopButtonEl);
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
      const scrollTagPaneTo = (position) => {
        const tagContainerEl = view.containerEl.querySelector(".tag-container");
        if (!tagContainerEl) return;
        tagContainerEl.scrollTop = position === "bottom" ? tagContainerEl.scrollHeight : 0;
      };
      const onScrollBottomButtonClick = (evt) => {
        if (evt.button !== 0) return;
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        scrollTagPaneTo("bottom");
      };
      const onScrollTopButtonClick = (evt) => {
        if (evt.button !== 0) return;
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        scrollTagPaneTo("top");
      };
      tagSystemButtonEl.addEventListener("click", onTagSystemButtonClick, true);
      scrollBottomButtonEl.addEventListener("click", onScrollBottomButtonClick, true);
      scrollTopButtonEl.addEventListener("click", onScrollTopButtonClick, true);
      patch.cleanup.push(() => {
        tagSystemButtonEl.removeEventListener("click", onTagSystemButtonClick, true);
        scrollBottomButtonEl.removeEventListener("click", onScrollBottomButtonClick, true);
        scrollTopButtonEl.removeEventListener("click", onScrollTopButtonClick, true);
        tagSystemButtonEl.remove();
        scrollBottomButtonEl.remove();
        scrollTopButtonEl.remove();
      });
    }
    this.patchMultiTagSearch(view, patch);
    const onTagPaneClick = (evt) => {
      const target = evt.target instanceof Element ? evt.target : null;
      if (!target || !view.containerEl.contains(target)) return;
      const inlineHierarchyToggleEl = target.closest(".puffs-inline-hierarchy-toggle");
      if (inlineHierarchyToggleEl) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        const branchKey = inlineHierarchyToggleEl.dataset.puffsInlineHierarchyBranchKey;
        this.toggleInlineHierarchyBranch(branchKey);
        this.scheduleSyncView(view, 0);
        this.refreshTagShelfViews();
        return;
      }
      if (target.closest(".puffs-note-hierarchy-child-card .collapse-icon")) {
        return;
      }
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
      const inheritanceButtonEl = target.closest(".puffs-tag-inheritance-button");
      if (inheritanceButtonEl) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.toggleTagInheritance(inheritanceButtonEl.dataset.puffsTag).catch((error) => {
          console.error("[Puffs Tag Enhance] Failed to toggle tag inheritance:", error);
          new import_obsidian9.Notice("\u5207\u6362\u6807\u7B7E\u7EE7\u627F\u5931\u8D25");
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
        if (orderButtonEl.classList.contains("puffs-note-parent-control-button")) return;
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        if (orderButtonEl.dataset.puffsHierarchyParent) {
          this.toggleHierarchyNoteOrderTarget(
            orderButtonEl.dataset.puffsHierarchyParent,
            orderButtonEl.dataset.path,
            "sidebar"
          );
        } else {
          this.toggleNoteOrderTarget(
            orderButtonEl.dataset.puffsTag,
            orderButtonEl.dataset.path,
            "sidebar"
          );
        }
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
      const noteCardEl = target.closest(".puffs-tag-note-card");
      if (noteCardEl) {
        const handled = this.showNoteCardContextMenu(evt, noteCardEl);
        if (!handled) return;
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        return;
      }
      const tagEl = target.closest(".tag-pane-tag");
      if (!tagEl) return;
      if (tagEl.dataset.puffsVirtualTag === "true") return;
      const tag = this.findTagForElement(view, tagEl);
      if (!tag) return;
      evt.preventDefault();
      evt.stopPropagation();
      evt.stopImmediatePropagation();
      this.showTagContextMenu(evt, tag);
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
      const hierarchySearch = this.getHierarchySearchContext(rawQuery);
      const hierarchyWasActive = patch.hierarchySearchActive;
      patch.hierarchySearchActive = hierarchySearch.matched;
      if (hierarchySearch.matched) {
        if (!hierarchyWasActive) patch.hierarchyState.groupExpanded = true;
        patch.hierarchyState.query = hierarchySearch.query;
        patch.hierarchyState.currentNotePath = hierarchySearch.currentNotePath;
        patch.hierarchyState.activeMatchIndex = -1;
        view.searchQuery = createMultiTagSearchQuery(rawQuery, []);
        if (typeof view.updateTags === "function") view.updateTags();
        if (typeof patch.hierarchyState.renderList === "function") patch.hierarchyState.renderList();
        this.scheduleSyncView(view, 0);
        return;
      }
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
    for (const buttonEl of patch.toolbarButtonEls.values()) {
      if (!buttonEl || !buttonEl.classList) continue;
      buttonEl.classList.remove("puffs-toolbar-config-hidden", "puffs-toolbar-context-hidden");
      buttonEl.removeAttribute("data-puffs-toolbar-button");
    }
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
      this.syncSidebarToolbarButtons(view, patch);
      if (view.useHierarchy !== false && typeof view.setUseHierarchy === "function") {
        view.setUseHierarchy(false);
        this.scheduleSyncView(view);
        return;
      }
      const hierarchySearch = this.getHierarchySearchContext(this.getTagSearchValue(view));
      const hierarchyWasActive = patch.hierarchySearchActive;
      patch.hierarchySearchActive = hierarchySearch.matched;
      if (patch.hierarchySearchActive && !hierarchyWasActive) patch.hierarchyState.groupExpanded = true;
      patch.hierarchyState.query = hierarchySearch.query;
      patch.hierarchyState.currentNotePath = hierarchySearch.currentNotePath;
      if (patch.hierarchySearchActive) {
        this.renderSidebarHierarchyPage(view, patch);
        return;
      }
      this.hideSidebarHierarchyPage(view, patch);
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
  refreshSidebarToolbarButtonRegistry(view, patch) {
    const buttons = patch.toolbarButtonEls || /* @__PURE__ */ new Map();
    patch.toolbarButtonEls = buttons;
    if (view.collapseOrExpandAllEl) buttons.set("expand-collapse", view.collapseOrExpandAllEl);
    else buttons.delete("expand-collapse");
    if (view.showSearchButtonEl) buttons.set("filter", view.showSearchButtonEl);
    else buttons.delete("filter");
    const existingSortEl = buttons.get("sort");
    if (!existingSortEl || !existingSortEl.isConnected) {
      const navButtonsEl = view.collapseOrExpandAllEl && view.collapseOrExpandAllEl.parentElement || view.containerEl.querySelector(".nav-buttons-container");
      const sortEl = navButtonsEl && Array.from(navButtonsEl.children).find((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const label = element.getAttribute("aria-label") || "";
        return label === "\u6392\u5E8F" || label.startsWith("\u6392\u5E8F");
      });
      if (sortEl) buttons.set("sort", sortEl);
      else buttons.delete("sort");
    }
    return buttons;
  }
  syncSidebarToolbarButtons(view, patch) {
    var _a;
    const buttons = this.refreshSidebarToolbarButtonRegistry(view, patch);
    const settings = normalizeSidebarToolbarButtons(this.settings.sidebarToolbarButtons);
    const settingsById = new Map(settings.map((item) => [item.id, item]));
    const availableSettings = getAvailableSidebarToolbarButtons(settings, buttons.keys());
    const navButtonsEl = view.collapseOrExpandAllEl && view.collapseOrExpandAllEl.parentElement || view.containerEl.querySelector(".nav-buttons-container");
    if (navButtonsEl) {
      for (const item of availableSettings) {
        const buttonEl = buttons.get(item.id);
        if (buttonEl && buttonEl.parentElement === navButtonsEl) navButtonsEl.appendChild(buttonEl);
      }
    }
    for (const [id, buttonEl] of buttons) {
      if (!buttonEl || !buttonEl.classList) continue;
      const visible = ((_a = settingsById.get(id)) == null ? void 0 : _a.visible) !== false;
      buttonEl.dataset.puffsToolbarButton = id;
      buttonEl.classList.toggle("puffs-toolbar-config-hidden", !visible);
      if (!visible) buttonEl.setAttribute("aria-hidden", "true");
      else if (!buttonEl.classList.contains("puffs-toolbar-context-hidden")) buttonEl.removeAttribute("aria-hidden");
    }
  }
  setSidebarToolbarContextHidden(patch, hierarchyMode) {
    var _a;
    const hierarchyIds = ["expand-collapse", "scroll-bottom", "scroll-top"];
    for (const [id, buttonEl] of patch.toolbarButtonEls || []) {
      if (!buttonEl || !buttonEl.classList) continue;
      const hidden = hierarchyMode && !hierarchyIds.includes(id);
      buttonEl.classList.toggle("puffs-toolbar-context-hidden", hidden);
      if (hidden) buttonEl.setAttribute("aria-hidden", "true");
      else if (!buttonEl.classList.contains("puffs-toolbar-config-hidden")) buttonEl.removeAttribute("aria-hidden");
    }
    if (hierarchyMode) {
      const navButtonsEl = (_a = patch.toolbarButtonEls.get("expand-collapse")) == null ? void 0 : _a.parentElement;
      if (navButtonsEl) {
        for (const id of hierarchyIds) {
          const buttonEl = patch.toolbarButtonEls.get(id);
          if (buttonEl && buttonEl.parentElement === navButtonsEl) navButtonsEl.appendChild(buttonEl);
        }
      }
    }
  }
  updateHierarchyExpandAllButton(view, patch) {
    const buttonEl = view.collapseOrExpandAllEl;
    if (!buttonEl) return;
    (0, import_obsidian9.setIcon)(buttonEl, patch.hierarchyState.allExpanded ? "chevrons-down-up" : "chevrons-up-down");
    buttonEl.setAttribute("aria-label", patch.hierarchyState.allExpanded ? "\u5168\u90E8\u6536\u8D77" : "\u5168\u90E8\u5C55\u5F00");
    buttonEl.removeAttribute("aria-disabled");
  }
  renderSidebarHierarchyPage(view, patch) {
    const tagPaneEl = view.tagPaneEl || view.containerEl.querySelector(".tag-container");
    if (!tagPaneEl) return;
    view.containerEl.classList.add("puffs-tag-list-mode-enabled", "puffs-note-hierarchy-mode");
    const listEl = tagPaneEl.querySelector(":scope > .puffs-tag-list-container:not(.puffs-note-hierarchy-sidebar)");
    if (listEl) listEl.classList.add("puffs-tag-hidden");
    if (!patch.hierarchyPageEl || !patch.hierarchyPageEl.isConnected) {
      patch.hierarchyPageEl = document.createElement("div");
      patch.hierarchyPageEl.className = "puffs-tag-list-container puffs-note-hierarchy-sidebar";
      tagPaneEl.appendChild(patch.hierarchyPageEl);
    }
    patch.hierarchyPageEl.classList.remove("puffs-tag-hidden");
    this.renderHierarchySearchItem(patch.hierarchyPageEl, patch.hierarchyState, { surface: "sidebar" });
    patch.hierarchyState.inputEl = view.searchComponent && view.searchComponent.inputEl;
    this.updateHierarchyExpandAllButton(view, patch);
    this.setSidebarToolbarContextHidden(patch, true);
    if (view.searchComponent && view.searchComponent.containerEl) {
      view.searchComponent.containerEl.classList.add("puffs-hierarchy-search-visible");
      view.searchComponent.containerEl.classList.remove("puffs-tag-hidden");
    }
  }
  hideSidebarHierarchyPage(view, patch) {
    view.containerEl.classList.remove("puffs-note-hierarchy-mode");
    if (patch.hierarchyPageEl) patch.hierarchyPageEl.classList.add("puffs-tag-hidden");
    const tagPaneEl = view.tagPaneEl || view.containerEl.querySelector(".tag-container");
    const listEl = tagPaneEl && tagPaneEl.querySelector(":scope > .puffs-tag-list-container:not(.puffs-note-hierarchy-sidebar)");
    if (listEl) listEl.classList.remove("puffs-tag-hidden");
    this.setSidebarToolbarContextHidden(patch, false);
    if (view.searchComponent && view.searchComponent.containerEl) {
      view.searchComponent.containerEl.classList.remove("puffs-hierarchy-search-visible");
      view.searchComponent.containerEl.classList.remove("puffs-tag-hidden");
    }
  }
  exitSidebarHierarchySearch(view, patch = this.viewPatches.get(view)) {
    if (!patch || !patch.hierarchySearchActive) return false;
    this.clearTagSearch(view);
    patch.hierarchySearchActive = false;
    this.scheduleSyncView(view, 0);
    return true;
  }
  renderListMode(view) {
    var _a, _b;
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
          const autoExpandItems = this.settings.pinnedTag && !effectiveQuery.trim() ? items : matchingItems;
          this.syncAutoSingleSearchResult(view, patch, autoExpandItems, effectiveQuery);
        } else {
          this.clearAutoExpandedTag(patch);
        }
      }
    }
    this.clearStaleVirtualExpandedTags(new Set(items.map((item) => item.tag)));
    const signature = JSON.stringify([
      this.inlineHierarchyExpansionVersion || 0,
      ((_b = (_a = patch == null ? void 0 : patch.noteCardSearchState) == null ? void 0 : _a.target) == null ? void 0 : _b.key) || "",
      items.map((item) => [
        item.tag,
        item.displayName,
        item.isVirtual,
        item.files.length,
        item.exactCount,
        item.inheritedCount,
        item.inheritanceEnabled,
        this.settings.pinnedTag === item.tag,
        this.expandedTags.has(item.tag),
        this.expandedTags.has(item.tag) ? item.files.map((file) => file.path).join("\n") : ""
      ])
    ]);
    if (listEl.dataset.puffsSignature !== signature) {
      listEl.dataset.puffsSignature = signature;
      listEl.empty();
      for (const item of items) {
        this.renderListModeTagItem(listEl, item, view, patch);
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
    if (!query && !this.isPinnedOnlyTagResult(queryValue, items) || items.length !== 1) {
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
      this.clearInlineHierarchyBranchState(patch.autoExpandedTag);
    }
    patch.autoExpandedTag = null;
    patch.autoExpandedWasAlreadyExpanded = false;
  }
  clearStaleVirtualExpandedTags(validTags = /* @__PURE__ */ new Set()) {
    for (const tag of Array.from(this.expandedTags)) {
      if (String(tag).startsWith("intersection:") && !validTags.has(tag)) {
        this.expandedTags.delete(tag);
        this.clearInlineHierarchyBranchState(tag);
      }
    }
  }
  ensureListModeContainer(view) {
    const tagPaneEl = view.tagPaneEl || view.containerEl && view.containerEl.querySelector(".tag-container");
    if (!tagPaneEl) return null;
    view.containerEl.classList.add("puffs-tag-list-mode-enabled");
    let listEl = tagPaneEl.querySelector(":scope > .puffs-tag-list-container:not(.puffs-note-hierarchy-sidebar)");
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
      const browseData = this.getTagBrowseData(tag);
      if (isNestedTag(tag) || browseData.files.length === 0 && !browseData.hasInheritance) return false;
      return unionTerms ? tagMatchesAnySearchTerm(tag, unionTerms) : tagMatchesSearchText(tag, query);
    };
    const pushTag = (tag) => {
      const normalizedTag = normalizeTag(tag);
      if (!normalizedTag || seen.has(normalizedTag) || !shouldShowTag(normalizedTag)) return;
      seen.add(normalizedTag);
      const browseData = this.getTagBrowseData(normalizedTag);
      items.push({
        tag: normalizedTag,
        displayName: getTagDisplayName(normalizedTag),
        isVirtual: false,
        files: browseData.files,
        exactCount: browseData.exactCount,
        inheritedCount: browseData.inheritedCount,
        inheritanceEnabled: browseData.inheritanceEnabled,
        hasInheritance: browseData.hasInheritance,
        sourcesByPath: browseData.sourcesByPath
      });
    };
    for (const [tag, tagDom] of this.getTagDomEntries(view)) {
      pushTag(tagDom && tagDom.tag || tag);
    }
    const fallbackTags = Array.from(this.getLogicalTagSet()).filter((tag) => !seen.has(tag)).sort((a, b) => compareTagItemsByCount(
      { count: this.getTagBrowseData(a).files.length, name: getTagDisplayName(a) },
      { count: this.getTagBrowseData(b).files.length, name: getTagDisplayName(b) }
    ));
    for (const tag of fallbackTags) {
      pushTag(tag);
    }
    items.sort((a, b) => compareTagItemsByCount(
      { count: a.files.length, name: a.displayName },
      { count: b.files.length, name: b.displayName }
    ));
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
    items.sort((a, b) => compareTagItemsByCount(
      { count: a.files.length, name: a.displayName },
      { count: b.files.length, name: b.displayName }
    ));
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
  renderListModeTagItem(listEl, item, view, patch) {
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
    countEl.textContent = item.inheritanceEnabled && item.inheritedCount > 0 ? `${item.exactCount}+${item.inheritedCount}` : String(files.length);
    let scrollBottomButtonEl = null;
    let pinButtonEl = null;
    let inheritanceButtonEl = null;
    if (!isVirtual && item.hasInheritance) {
      inheritanceButtonEl = document.createElement("button");
      inheritanceButtonEl.type = "button";
      inheritanceButtonEl.className = "clickable-icon puffs-tag-inheritance-button";
      inheritanceButtonEl.dataset.puffsTag = tag;
      inheritanceButtonEl.classList.toggle("is-active", !!item.inheritanceEnabled);
      inheritanceButtonEl.setAttribute("aria-label", item.inheritanceEnabled ? "\u9690\u85CF\u540E\u4EE3\u6807\u7B7E\u7B14\u8BB0" : "\u663E\u793A\u540E\u4EE3\u6807\u7B7E\u7B14\u8BB0");
      (0, import_obsidian9.setIcon)(inheritanceButtonEl, "git-merge");
    }
    if (isExpanded && files.length > 0) {
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
    if (inheritanceButtonEl) tagEl.appendChild(inheritanceButtonEl);
    if (scrollBottomButtonEl) tagEl.appendChild(scrollBottomButtonEl);
    if (pinButtonEl) tagEl.appendChild(pinButtonEl);
    tagEl.appendChild(flairOuterEl);
    treeItemEl.appendChild(tagEl);
    if (isExpanded) {
      this.renderNoteList(treeItemEl, files, tag, isVirtual, {
        view,
        patch,
        surface: "sidebar",
        scrollContainer: listEl
      });
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
  renderNoteList(treeItemEl, files, tagValue, isVirtual = false, options = {}) {
    var _a, _b;
    let listEl = Array.from(treeItemEl.children).find(
      (el) => el.classList.contains("puffs-tag-note-list")
    );
    if (!listEl) {
      listEl = document.createElement("div");
      listEl.className = "tree-item-children puffs-tag-note-list";
      treeItemEl.appendChild(listEl);
    }
    listEl.className = "tree-item-children puffs-tag-note-list";
    const target = (_b = (_a = options.patch) == null ? void 0 : _a.noteCardSearchState) == null ? void 0 : _b.target;
    const renderOptions = {
      surface: options.surface || "sidebar",
      targetPath: (target == null ? void 0 : target.tag) === tagValue ? target.path : "",
      scrollContainer: options.scrollContainer || listEl,
      rerender: () => options.view ? this.scheduleSyncView(options.view, 0) : this.refreshTagViews()
    };
    const browseData = !isVirtual && this.getTagBrowseData(tagValue);
    if ((browseData == null ? void 0 : browseData.inheritanceEnabled) && browseData.inheritanceTree) {
      this.renderTagInheritanceBrowseTree(listEl, browseData.inheritanceTree, renderOptions);
    } else {
      this.renderInlineTagNoteTree(listEl, files, tagValue, isVirtual, renderOptions);
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
    view.containerEl.querySelectorAll(".puffs-toolbar-config-hidden, .puffs-toolbar-context-hidden").forEach((el) => {
      el.classList.remove("puffs-toolbar-config-hidden", "puffs-toolbar-context-hidden");
      el.removeAttribute("data-puffs-toolbar-button");
    });
    view.containerEl.querySelectorAll(".puffs-tag-expanded").forEach((el) => {
      el.classList.remove("puffs-tag-expanded");
    });
  }
  toggleTagExpansion(tag, view) {
    if (!tag) return;
    if (this.expandedTags.has(tag)) {
      this.expandedTags.delete(tag);
      this.clearInlineHierarchyBranchState(tag);
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
        this.clearInlineHierarchyBranchState(item.tag);
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

// src/relations.ts
var import_obsidian11 = require("obsidian");

// src/relation-modals.ts
var import_obsidian10 = require("obsidian");
function getDirectionalInputSide(activeSide, key, visibleSides) {
  if (!Array.isArray(visibleSides) || visibleSides.length < 2) return null;
  if (key === "ArrowDown" && activeSide === "parent" && visibleSides.includes("child")) return "child";
  if (key === "ArrowUp" && activeSide === "child" && visibleSides.includes("parent")) return "parent";
  return null;
}
function getNoteRelationSubmitError(parentCount, childCount) {
  if (!parentCount || !childCount) return "\u8BF7\u5206\u522B\u9009\u62E9\u7236\u7B14\u8BB0\u548C\u5B50\u7B14\u8BB0";
  if (parentCount > 1 && childCount > 1) return "\u6279\u91CF\u5173\u7CFB\u4EC5\u652F\u6301\u4E00\u7236\u591A\u5B50\u6216\u591A\u7236\u4E00\u5B50";
  return "";
}
function getNoteRelationEnterAction(event, isComposing, hasCandidate = false) {
  if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || isComposing || event.isComposing || event.keyCode === 229) return null;
  return hasCandidate ? "select-candidate" : "submit";
}
function getNoteBindingCandidates(files, query, getAliases = () => []) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return [];
  return Array.from(files || []).map((file) => {
    if (!(file instanceof import_obsidian10.TFile) || file.extension !== "md") return null;
    if (file.basename.toLowerCase().includes(term)) {
      return { file, displayName: file.basename, alias: "" };
    }
    const alias = Array.from(new Set(getAliases(file) || [])).find((value) => String(value).toLowerCase().includes(term));
    return alias ? { file, displayName: alias, alias } : null;
  }).filter(Boolean).sort((left, right) => left.displayName.localeCompare(right.displayName, "zh-Hans-CN") || left.file.path.localeCompare(right.file.path, "zh-Hans-CN"));
}
function getTagRelationCandidates(tagValues, query, canUse = () => true) {
  const term = String(query || "").trim().replace(/^#/, "").toLowerCase();
  if (!term) return [];
  return Array.from(new Set(Array.from(tagValues || []).map(normalizeTag).filter(Boolean))).filter((tag) => !isNestedTag(tag) && canUse(tag)).filter((tag) => getTagDisplayName(tag).toLowerCase().includes(term)).sort((a, b) => getTagDisplayName(a).localeCompare(getTagDisplayName(b), "zh-Hans-CN"));
}
function groupExcludedPathsBySource(paths, sourcesByPath, orderedSources = []) {
  const normalizedPaths = Array.from(new Set((paths || []).filter(Boolean)));
  const discoveredSources = [];
  const seenSources = /* @__PURE__ */ new Set();
  for (const source of orderedSources || []) {
    const tag = normalizeTag(source);
    if (!tag || seenSources.has(tag)) continue;
    seenSources.add(tag);
    discoveredSources.push(tag);
  }
  for (const path of normalizedPaths) {
    for (const source of sourcesByPath.get(path) || []) {
      const tag = normalizeTag(source);
      if (!tag || seenSources.has(tag)) continue;
      seenSources.add(tag);
      discoveredSources.push(tag);
    }
  }
  const groups = discoveredSources.map((source) => ({
    source,
    paths: normalizedPaths.filter((path) => (sourcesByPath.get(path) || []).includes(source))
  })).filter((group) => group.paths.length > 0);
  const unknownPaths = normalizedPaths.filter((path) => !(sourcesByPath.get(path) || []).length);
  if (unknownPaths.length) groups.push({ source: null, paths: unknownPaths });
  return groups;
}
function createTagCandidatePicker(options) {
  const { hostEl, inputEl, getCandidates, onInput, onSelect, setComposing } = options;
  const resultsEl = hostEl.createDiv({ cls: "puffs-relation-tag-results" });
  let activeIndex = 0;
  let candidates = [];
  let isComposing = false;
  const render = () => {
    var _a;
    resultsEl.empty();
    candidates = getCandidates(inputEl.value);
    resultsEl.classList.toggle("is-hidden", candidates.length === 0);
    if (!candidates.length) {
      activeIndex = 0;
      return;
    }
    activeIndex = Math.max(0, Math.min(candidates.length - 1, activeIndex));
    candidates.forEach((tag, index) => {
      const rowEl = resultsEl.createDiv({ cls: "puffs-relation-tag-result is-clickable" });
      rowEl.classList.toggle("is-active", index === activeIndex);
      rowEl.createDiv({ text: getTagDisplayName(tag), cls: "puffs-relation-tag-result-name" });
      rowEl.addEventListener("mouseenter", () => {
        activeIndex = index;
        resultsEl.querySelectorAll(".puffs-relation-tag-result").forEach((el, rowIndex) => {
          el.classList.toggle("is-active", rowIndex === index);
        });
      });
      rowEl.addEventListener("click", () => {
        onSelect(tag);
        activeIndex = 0;
        render();
      });
    });
    (_a = resultsEl.querySelector(".is-active")) == null ? void 0 : _a.scrollIntoView({ block: "nearest" });
  };
  inputEl.addEventListener("compositionstart", () => {
    isComposing = true;
    setComposing(true);
  });
  inputEl.addEventListener("compositionend", () => {
    isComposing = false;
    setComposing(false);
    onInput(inputEl.value);
    activeIndex = 0;
    render();
  });
  inputEl.addEventListener("input", () => {
    if (isComposing) return;
    onInput(inputEl.value);
    activeIndex = 0;
    render();
  });
  inputEl.addEventListener("keydown", (event) => {
    if (isComposing || event.isComposing) return;
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && candidates.length) {
      const delta = event.key === "ArrowDown" ? 1 : -1;
      activeIndex = Math.max(0, Math.min(candidates.length - 1, activeIndex + delta));
      event.preventDefault();
      event.stopPropagation();
      render();
      return;
    }
    if (getNoteRelationEnterAction(event, isComposing, candidates.length > 0) !== "select-candidate") return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(candidates[activeIndex]);
    activeIndex = 0;
    render();
  });
  render();
  return { render, resultsEl };
}
var AddParentTagModal = class extends import_obsidian10.Modal {
  constructor(app, plugin, childTag) {
    super(app);
    this.plugin = plugin;
    this.childTag = normalizeTag(childTag);
    this.selectedParent = null;
    this.isComposing = false;
    this.isSubmitting = false;
  }
  onOpen() {
    this.modalEl.classList.add("puffs-relation-modal", "puffs-tag-relation-modal");
    this.contentEl.empty();
    this.contentEl.createDiv({
      text: `\u4E3A ${getTagDisplayName(this.childTag)} \u6DFB\u52A0\u7236\u6807\u7B7E`,
      cls: "puffs-relation-modal-title puffs-tag-rename-title"
    });
    const inputEl = this.contentEl.createEl("input", { type: "search" });
    inputEl.className = "puffs-relation-input";
    const submit = async () => {
      if (!this.selectedParent || this.isSubmitting) return;
      this.isSubmitting = true;
      try {
        await this.plugin.addInheritanceParent(this.childTag, this.selectedParent);
        this.close();
      } catch (error) {
        new import_obsidian10.Notice(error && error.message ? error.message : "\u6DFB\u52A0\u7236\u6807\u7B7E\u5931\u8D25");
      } finally {
        this.isSubmitting = false;
      }
    };
    const existingParents = new Set(this.plugin.getInheritanceParents(this.childTag));
    createTagCandidatePicker({
      hostEl: this.contentEl,
      inputEl,
      getCandidates: (query) => getTagRelationCandidates(this.plugin.getLogicalTagSet(), query, (tag) => tag !== this.childTag && !existingParents.has(tag) && !this.plugin.wouldCreateTagInheritanceCycle(tag, this.childTag) && tag !== this.selectedParent),
      onInput: () => {
        this.selectedParent = null;
      },
      onSelect: (tag) => {
        this.selectedParent = tag;
        inputEl.value = getTagDisplayName(tag);
      },
      setComposing: (value) => {
        this.isComposing = value;
      }
    });
    this.modalEl.addEventListener("keydown", (event) => {
      if (getNoteRelationEnterAction(event, this.isComposing) !== "submit") return;
      event.preventDefault();
      event.stopPropagation();
      void submit();
    });
    window.setTimeout(() => inputEl.focus(), 0);
  }
};
var RemoveChildTagConfirmModal = class extends import_obsidian10.Modal {
  constructor(app, parentTag, childTag, onConfirm) {
    super(app);
    this.parentTag = parentTag;
    this.childTag = childTag;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    this.modalEl.classList.add("puffs-relation-confirm-modal");
    this.contentEl.empty();
    this.contentEl.createDiv({ text: "\u79FB\u9664\u5B50\u6807\u7B7E", cls: "puffs-relation-modal-title" });
    this.contentEl.createDiv({
      text: `\u786E\u5B9A\u8981\u4ECE\u300C${getTagDisplayName(this.parentTag)}\u300D\u7684\u5B50\u6807\u7B7E\u4E2D\u79FB\u9664\u300C${getTagDisplayName(this.childTag)}\u300D\u5417\uFF1F\u6B64\u64CD\u4F5C\u53EA\u89E3\u9664\u7EE7\u627F\u5173\u7CFB\uFF0C\u4E0D\u4F1A\u5220\u9664\u6807\u7B7E\u6216\u7B14\u8BB0\u3002`,
      cls: "puffs-relation-confirm-message"
    });
    const footerEl = this.contentEl.createDiv({ cls: "puffs-relation-modal-footer" });
    const removeButton = footerEl.createEl("button", { text: "\u79FB\u9664", cls: "mod-warning" });
    removeButton.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
    this.modalEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }
};
var TagInheritanceModal = class extends import_obsidian10.Modal {
  constructor(app, plugin, parentTag) {
    super(app);
    this.plugin = plugin;
    this.parentTag = normalizeTag(parentTag);
    this.children = plugin.sortTagsByVisibleCount(plugin.getInheritanceChildren(parentTag));
    this.query = "";
    this.isComposing = false;
    this.isSubmitting = false;
    this.searchHostEl = null;
    this.inputEl = null;
    this.picker = null;
    this.childrenListEl = null;
    this.exclusionsSectionEl = null;
    this.exclusionGroupsEl = null;
  }
  onOpen() {
    this.modalEl.classList.add("puffs-relation-modal", "puffs-tag-relation-modal");
    this.buildLayout();
  }
  buildLayout() {
    this.contentEl.empty();
    this.contentEl.createDiv({
      text: `\u7BA1\u7406 ${getTagDisplayName(this.parentTag)} \u7684\u5B50\u6807\u7B7E`,
      cls: "puffs-relation-modal-title puffs-tag-rename-title"
    });
    this.searchHostEl = this.contentEl.createDiv({ cls: "puffs-relation-tag-search" });
    this.inputEl = this.searchHostEl.createEl("input", { type: "search", cls: "puffs-relation-input" });
    this.inputEl.value = this.query;
    this.picker = createTagCandidatePicker({
      hostEl: this.searchHostEl,
      inputEl: this.inputEl,
      getCandidates: (query) => getTagRelationCandidates(this.plugin.getLogicalTagSet(), query, (tag) => tag !== this.parentTag && !this.children.includes(tag) && !this.plugin.wouldCreateTagInheritanceCycle(this.parentTag, tag)),
      onInput: (value) => {
        this.query = value;
      },
      onSelect: (tag) => {
        void this.addChild(tag);
      },
      setComposing: (value) => {
        this.isComposing = value;
      }
    });
    this.childrenListEl = this.contentEl.createDiv({ cls: "puffs-relation-child-list" });
    this.exclusionsSectionEl = this.contentEl.createDiv({ cls: "puffs-relation-exclusions" });
    this.exclusionsSectionEl.createEl("h4", { text: "\u5DF2\u6392\u9664\u7B14\u8BB0" });
    this.exclusionGroupsEl = this.exclusionsSectionEl.createDiv({ cls: "puffs-relation-exclusion-groups" });
    this.renderChildren();
    this.renderExclusionGroups();
    window.setTimeout(() => {
      if (this.inputEl) {
        this.inputEl.focus();
        return;
      }
      this.modalEl.tabIndex = -1;
      this.modalEl.focus();
    }, 0);
  }
  renderChildren() {
    var _a;
    if (!this.childrenListEl) return;
    this.children = this.plugin.sortTagsByVisibleCount(this.children);
    const existingRows = new Map(
      Array.from(this.childrenListEl.querySelectorAll(".puffs-relation-child-row")).map((row) => [row.dataset.puffsTag, row])
    );
    (_a = this.childrenListEl.querySelector(".puffs-relation-empty")) == null ? void 0 : _a.remove();
    for (const child of this.children) {
      let rowEl = existingRows.get(child);
      if (!rowEl) {
        rowEl = this.childrenListEl.createDiv({ cls: "puffs-relation-child-row" });
        rowEl.dataset.puffsTag = child;
        const iconEl = rowEl.createSpan({ cls: "puffs-relation-child-icon" });
        (0, import_obsidian10.setIcon)(iconEl, "tag");
        rowEl.createSpan({ cls: "puffs-relation-manage-name" });
        rowEl.createSpan({ cls: "puffs-relation-child-count" });
        const removeButton = rowEl.createEl("button", {
          cls: "clickable-icon puffs-relation-child-remove",
          attr: { "aria-label": `\u79FB\u9664 ${getTagDisplayName(child)}` }
        });
        (0, import_obsidian10.setIcon)(removeButton, "x");
        removeButton.addEventListener("click", () => {
          new RemoveChildTagConfirmModal(this.app, this.parentTag, child, () => {
            void this.removeChild(child);
          }).open();
        });
      }
      rowEl.querySelector(".puffs-relation-manage-name").textContent = getTagDisplayName(child);
      rowEl.querySelector(".puffs-relation-child-count").textContent = String(this.plugin.getTagVisibleNoteCount(child));
      this.childrenListEl.appendChild(rowEl);
      existingRows.delete(child);
    }
    for (const rowEl of existingRows.values()) rowEl.remove();
    if (!this.children.length) {
      this.childrenListEl.createDiv({ text: "\u6682\u65E0\u5B50\u6807\u7B7E", cls: "puffs-relation-empty" });
    }
    this.syncMutationState();
  }
  syncMutationState() {
    var _a;
    if (this.inputEl) this.inputEl.disabled = this.isSubmitting;
    for (const button of ((_a = this.childrenListEl) == null ? void 0 : _a.querySelectorAll(".puffs-relation-child-remove")) || []) {
      button.disabled = this.isSubmitting;
    }
  }
  updateChildren(nextChildren) {
    var _a;
    this.children = this.plugin.sortTagsByVisibleCount(nextChildren);
    this.renderChildren();
    (_a = this.picker) == null ? void 0 : _a.render();
  }
  async persistChildren(nextChildren) {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.syncMutationState();
    try {
      const sortedChildren = this.plugin.sortTagsByVisibleCount(nextChildren);
      await this.plugin.setInheritanceChildren(this.parentTag, sortedChildren);
      this.updateChildren(sortedChildren);
      this.renderExclusionGroups();
      return true;
    } catch (error) {
      new import_obsidian10.Notice(error && error.message ? error.message : "\u4FDD\u5B58\u7EE7\u627F\u5173\u7CFB\u5931\u8D25");
      return false;
    } finally {
      this.isSubmitting = false;
      this.syncMutationState();
    }
  }
  async addChild(tag) {
    var _a;
    if (!tag || this.children.includes(tag) || this.isSubmitting) return;
    if (!await this.persistChildren([...this.children, tag])) return;
    this.query = "";
    if (this.inputEl) this.inputEl.value = "";
    (_a = this.picker) == null ? void 0 : _a.render();
    globalThis.setTimeout(() => {
      var _a2;
      return (_a2 = this.inputEl) == null ? void 0 : _a2.focus();
    }, 0);
  }
  async removeChild(child) {
    if (!child || !this.children.includes(child) || this.isSubmitting) return;
    if (!await this.persistChildren(this.children.filter((tag) => tag !== child))) return;
    globalThis.setTimeout(() => {
      var _a;
      return (_a = this.inputEl) == null ? void 0 : _a.focus();
    }, 0);
  }
  renderExclusionGroups() {
    if (!this.exclusionsSectionEl || !this.exclusionGroupsEl) return;
    const exclusions = this.plugin.getTagInheritanceSettings().excludedPathsByParent[this.parentTag] || [];
    this.exclusionsSectionEl.classList.toggle("is-hidden", exclusions.length === 0);
    this.exclusionGroupsEl.empty();
    if (!exclusions.length) return;
    const sourcesByPath = new Map(exclusions.map((path) => [
      path,
      this.plugin.getInheritedFileSources(this.parentTag, path)
    ]));
    const groups = groupExcludedPathsBySource(
      exclusions,
      sourcesByPath,
      this.plugin.getTagDescendants(this.parentTag)
    );
    for (const group of groups) {
      const groupEl = this.exclusionGroupsEl.createDiv({ cls: "puffs-relation-exclusion-group" });
      groupEl.dataset.puffsSource = group.source || "";
      const headingEl = groupEl.createDiv({ cls: "puffs-relation-exclusion-heading" });
      if (group.source) {
        const iconEl = headingEl.createSpan({ cls: "puffs-relation-exclusion-icon" });
        (0, import_obsidian10.setIcon)(iconEl, "tag");
      }
      headingEl.createSpan({ text: group.source ? getTagDisplayName(group.source) : "\u6765\u6E90\u672A\u77E5" });
      const listEl = groupEl.createDiv({ cls: "puffs-relation-exclusion-list" });
      for (const path of group.paths) {
        const rowEl = listEl.createDiv({ cls: "puffs-relation-manage-row" });
        rowEl.dataset.puffsPath = path;
        const file = this.app.vault.getAbstractFileByPath(path);
        rowEl.createSpan({ text: file && file.basename ? file.basename : path, cls: "puffs-relation-manage-name" });
        const restoreButton = rowEl.createEl("button", { text: "\u6062\u590D" });
        restoreButton.addEventListener("click", async () => {
          if (restoreButton.disabled) return;
          restoreButton.disabled = true;
          try {
            await this.plugin.restoreInheritedFile(this.parentTag, path);
            this.removeExcludedPath(path);
          } catch (error) {
            console.error("[Puffs Tag Enhance] Failed to restore inherited note:", error);
            new import_obsidian10.Notice("\u6062\u590D\u7EE7\u627F\u7B14\u8BB0\u5931\u8D25");
            restoreButton.disabled = false;
          }
        });
      }
    }
  }
  removeExcludedPath(path) {
    if (!this.exclusionGroupsEl || !this.exclusionsSectionEl) return;
    for (const rowEl of Array.from(this.exclusionGroupsEl.querySelectorAll(".puffs-relation-manage-row"))) {
      if (rowEl.dataset.puffsPath === path) rowEl.remove();
    }
    for (const groupEl of Array.from(this.exclusionGroupsEl.querySelectorAll(".puffs-relation-exclusion-group"))) {
      if (!groupEl.querySelector(".puffs-relation-manage-row")) groupEl.remove();
    }
    this.exclusionsSectionEl.classList.toggle(
      "is-hidden",
      !this.exclusionGroupsEl.querySelector(".puffs-relation-manage-row")
    );
  }
};
var TagNoteBindingModal = class extends import_obsidian10.Modal {
  constructor(app, plugin, tagValue) {
    super(app);
    this.plugin = plugin;
    this.tag = normalizeTag(tagValue);
    this.originalPath = this.plugin.getTagBoundNotePath(this.tag);
    this.selectedPath = this.originalPath;
    this.query = "";
    this.activeIndex = 0;
    this.candidates = [];
    this.isComposing = false;
    this.isSubmitting = false;
    this.hasPersisted = false;
  }
  onOpen() {
    this.modalEl.classList.add(
      "puffs-relation-modal",
      "puffs-note-relation-modal",
      "puffs-tag-note-binding-modal"
    );
    this.contentEl.empty();
    this.contentEl.createDiv({
      text: `${this.originalPath ? "\u6362\u7ED1" : "\u7ED1\u5B9A"} ${getTagDisplayName(this.tag)} \u7684\u7B14\u8BB0`,
      cls: "puffs-relation-modal-title puffs-tag-rename-title"
    });
    const selectedEl = this.contentEl.createDiv({ cls: "puffs-relation-selected-list" });
    const inputEl = this.contentEl.createEl("input", {
      type: "search",
      cls: "puffs-relation-input"
    });
    const resultsEl = this.contentEl.createDiv({ cls: "puffs-relation-note-results" });
    const renderSelection = () => {
      selectedEl.empty();
      if (!this.selectedPath) return;
      const file = this.app.vault.getAbstractFileByPath(this.selectedPath);
      if (!(file instanceof import_obsidian10.TFile) || file.extension !== "md") {
        this.selectedPath = null;
        return;
      }
      const chipEl = selectedEl.createDiv({ cls: "puffs-relation-selected-chip" });
      chipEl.createSpan({ text: file.basename, attr: { title: file.path } });
      const removeButton = chipEl.createEl("button", {
        cls: "clickable-icon",
        attr: { "aria-label": "\u89E3\u9664\u7ED1\u5B9A" }
      });
      (0, import_obsidian10.setIcon)(removeButton, "x");
      removeButton.addEventListener("click", () => {
        this.selectedPath = null;
        renderSelection();
        renderResults();
        inputEl.focus();
      });
    };
    const selectCandidate = (candidate) => {
      if (!candidate) return;
      this.selectedPath = candidate.file.path;
      this.query = "";
      inputEl.value = "";
      this.activeIndex = 0;
      renderSelection();
      renderResults();
      inputEl.focus();
    };
    const renderResults = () => {
      var _a;
      resultsEl.empty();
      this.candidates = getNoteBindingCandidates(
        this.app.vault.getMarkdownFiles(),
        this.query,
        (file) => this.plugin.getNoteAliases(file)
      ).filter((candidate) => candidate.file.path !== this.selectedPath);
      resultsEl.classList.toggle("is-empty-query", !this.query.trim());
      if (!this.query.trim()) return;
      if (!this.candidates.length) {
        resultsEl.createDiv({ text: "\u6CA1\u6709\u53EF\u7ED1\u5B9A\u7684\u7B14\u8BB0\u3002", cls: "puffs-relation-empty" });
        return;
      }
      this.activeIndex = Math.max(0, Math.min(this.activeIndex, this.candidates.length - 1));
      this.candidates.forEach((candidate, index) => {
        const rowEl = resultsEl.createDiv({ cls: "puffs-relation-note-result is-clickable" });
        rowEl.classList.toggle("is-active", index === this.activeIndex);
        rowEl.createDiv({ text: candidate.displayName, cls: "puffs-relation-note-result-name" });
        rowEl.createDiv({ text: candidate.file.path, cls: "puffs-relation-note-result-path" });
        rowEl.addEventListener("mouseenter", () => {
          this.activeIndex = index;
          resultsEl.querySelectorAll(".puffs-relation-note-result").forEach((el, rowIndex) => {
            el.classList.toggle("is-active", rowIndex === index);
          });
        });
        rowEl.addEventListener("click", () => selectCandidate(candidate));
      });
      (_a = resultsEl.querySelector(".is-active")) == null ? void 0 : _a.scrollIntoView({ block: "nearest" });
    };
    inputEl.addEventListener("compositionstart", () => {
      this.isComposing = true;
    });
    inputEl.addEventListener("compositionend", () => {
      this.isComposing = false;
      this.query = inputEl.value;
      this.activeIndex = 0;
      renderResults();
    });
    inputEl.addEventListener("input", () => {
      if (this.isComposing) return;
      this.query = inputEl.value;
      this.activeIndex = 0;
      renderResults();
    });
    inputEl.addEventListener("keydown", (event) => {
      if (this.isComposing || event.isComposing || !this.candidates.length) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      this.activeIndex = Math.max(0, Math.min(this.candidates.length - 1, this.activeIndex + delta));
      event.preventDefault();
      event.stopPropagation();
      renderResults();
    });
    this.modalEl.addEventListener("keydown", (event) => {
      const action = getNoteRelationEnterAction(event, this.isComposing, this.candidates.length > 0);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === "select-candidate") {
        selectCandidate(this.candidates[this.activeIndex]);
        return;
      }
      void this.submit();
    });
    renderSelection();
    renderResults();
    globalThis.setTimeout(() => inputEl.focus(), 0);
  }
  async persistSelection() {
    if (this.hasPersisted) return;
    this.hasPersisted = true;
    try {
      if (this.selectedPath !== this.originalPath) {
        await this.plugin.setTagBoundNote(this.tag, this.selectedPath);
      }
    } catch (error) {
      this.hasPersisted = false;
      throw error;
    }
  }
  async submit() {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    try {
      await this.persistSelection();
      this.close();
    } catch (error) {
      new import_obsidian10.Notice(error && error.message ? error.message : "\u4FDD\u5B58\u7ED1\u5B9A\u7B14\u8BB0\u5931\u8D25");
    } finally {
      this.isSubmitting = false;
    }
  }
  onClose() {
    this.contentEl.empty();
    void this.persistSelection().catch((error) => {
      console.error("[Puffs Tag Enhance] Failed to persist tag note binding:", error);
      new import_obsidian10.Notice(error && error.message ? error.message : "\u4FDD\u5B58\u7ED1\u5B9A\u7B14\u8BB0\u5931\u8D25");
    });
  }
};
var NoteRelationModal = class extends import_obsidian10.Modal {
  constructor(app, plugin, sourcePath = null, mode = null) {
    super(app);
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.mode = mode;
    this.selectedParents = /* @__PURE__ */ new Map();
    this.selectedChildren = /* @__PURE__ */ new Map();
    this.lockedParents = /* @__PURE__ */ new Set();
    this.lockedChildren = /* @__PURE__ */ new Set();
    this.queries = { parent: "", child: "" };
    this.activeSide = "parent";
    this.activeIndex = 0;
    this.isComposing = false;
    this.isSubmitting = false;
    if (sourcePath) {
      const selection = { path: sourcePath, displayName: "" };
      if (mode === "parent") {
        this.selectedChildren.set(sourcePath, selection);
        this.lockedChildren.add(sourcePath);
        this.activeSide = "parent";
      } else {
        this.selectedParents.set(sourcePath, selection);
        this.lockedParents.add(sourcePath);
        this.activeSide = "child";
      }
    }
  }
  onOpen() {
    this.modalEl.classList.add("puffs-relation-modal", "puffs-note-relation-modal");
    this.render();
  }
  render() {
    this.contentEl.empty();
    const sourceFile = this.sourcePath && this.app.vault.getAbstractFileByPath(this.sourcePath);
    const sourceName = sourceFile instanceof import_obsidian10.TFile ? sourceFile.basename : this.sourcePath;
    const title = this.sourcePath ? `\u4E3A ${sourceName} \u6DFB\u52A0${this.mode === "parent" ? "\u7236\u7B14\u8BB0" : "\u5B50\u7B14\u8BB0"}` : "\u65B0\u589E\u7236\u5B50\u7B14\u8BB0";
    this.contentEl.createDiv({ text: title, cls: "puffs-relation-modal-title puffs-tag-rename-title" });
    const inputBySide = {};
    const selectedBySide = {};
    const visibleSides = this.sourcePath ? [this.mode === "parent" ? "parent" : "child"] : ["parent", "child"];
    const createSelector = (side, label) => {
      const sectionEl = this.contentEl.createDiv({ cls: "puffs-relation-selector" });
      const locked = side === "parent" ? this.lockedParents : this.lockedChildren;
      sectionEl.createDiv({ text: label, cls: "puffs-relation-selector-label" });
      selectedBySide[side] = sectionEl.createDiv({ cls: "puffs-relation-selected-list" });
      const inputEl = sectionEl.createEl("input", {
        type: "search",
        cls: "puffs-relation-input"
      });
      if (locked.size) {
        sectionEl.classList.add("is-locked");
        inputEl.disabled = true;
      }
      inputEl.value = this.queries[side];
      inputBySide[side] = inputEl;
      inputEl.addEventListener("focus", () => {
        this.activeSide = side;
        this.activeIndex = 0;
        renderResults();
      });
      inputEl.addEventListener("compositionstart", () => {
        this.isComposing = true;
      });
      inputEl.addEventListener("compositionend", () => {
        this.isComposing = false;
        this.queries[side] = inputEl.value;
        this.activeIndex = 0;
        renderResults();
      });
      inputEl.addEventListener("input", () => {
        if (this.isComposing) return;
        this.queries[side] = inputEl.value;
        this.activeIndex = 0;
        renderResults();
      });
      return inputEl;
    };
    if (visibleSides.includes("parent")) createSelector("parent", "\u7236\u7B14\u8BB0");
    if (visibleSides.includes("child")) createSelector("child", "\u5B50\u7B14\u8BB0");
    const resultsEl = this.contentEl.createDiv({ cls: "puffs-relation-note-results" });
    const renderSelections = () => {
      for (const side of ["parent", "child"]) {
        const map = side === "parent" ? this.selectedParents : this.selectedChildren;
        const locked = side === "parent" ? this.lockedParents : this.lockedChildren;
        const hostEl = selectedBySide[side];
        if (!hostEl) continue;
        hostEl.empty();
        for (const selection of map.values()) {
          const file = this.app.vault.getAbstractFileByPath(selection.path);
          const chipEl = hostEl.createDiv({ cls: "puffs-relation-selected-chip" });
          chipEl.createSpan({ text: selection.displayName || (file instanceof import_obsidian10.TFile ? file.basename : selection.path) });
          if (!locked.has(selection.path)) {
            const removeButton = chipEl.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "\u79FB\u9664" } });
            (0, import_obsidian10.setIcon)(removeButton, "x");
            removeButton.addEventListener("click", () => {
              map.delete(selection.path);
              renderSelections();
              renderResults();
            });
          }
        }
      }
    };
    const findMatch = (file, term) => {
      const basename = file.basename.toLowerCase();
      if (basename.includes(term)) return { displayName: file.basename, alias: "" };
      const alias = this.plugin.getNoteAliases(file).find((value) => value.toLowerCase().includes(term));
      return alias ? { displayName: alias, alias } : null;
    };
    const canSelect = (side, path) => {
      if (side === "parent" && this.selectedChildren.size > 1 && this.selectedParents.size >= 1) return false;
      if (side === "child" && this.selectedParents.size > 1 && this.selectedChildren.size >= 1) return false;
      const opposite = side === "parent" ? this.selectedChildren : this.selectedParents;
      let hasNewRelation = opposite.size === 0;
      for (const selection of opposite.values()) {
        const parentPath = side === "parent" ? path : selection.path;
        const childPath = side === "child" ? path : selection.path;
        if (parentPath === childPath || this.plugin.wouldCreateNoteHierarchyCycle(parentPath, childPath)) return false;
        if (!this.plugin.getHierarchyChildren(parentPath).includes(childPath)) hasNewRelation = true;
      }
      return hasNewRelation;
    };
    const selectCandidate = (candidate) => {
      const map = this.activeSide === "parent" ? this.selectedParents : this.selectedChildren;
      if (map.has(candidate.file.path)) map.delete(candidate.file.path);
      else if (canSelect(this.activeSide, candidate.file.path)) {
        map.set(candidate.file.path, {
          path: candidate.file.path,
          displayName: this.activeSide === "child" ? candidate.alias : ""
        });
        this.queries[this.activeSide] = "";
        inputBySide[this.activeSide].value = "";
        this.activeIndex = 0;
      } else {
        new import_obsidian10.Notice("\u53EA\u80FD\u9009\u62E9\u4E00\u7BC7\u7236\u7B14\u8BB0\u6216\u4E00\u7BC7\u5B50\u7B14\u8BB0\u4F5C\u4E3A\u6279\u91CF\u5173\u7CFB\u7684\u4E00\u4FA7");
      }
      renderSelections();
      renderResults();
      globalThis.setTimeout(() => inputBySide[this.activeSide].focus(), 0);
    };
    const renderResults = () => {
      var _a;
      resultsEl.empty();
      const term = this.queries[this.activeSide].trim().toLowerCase();
      if (!term) {
        resultsEl.classList.add("is-empty-query");
        return;
      }
      resultsEl.classList.remove("is-empty-query");
      const currentMap = this.activeSide === "parent" ? this.selectedParents : this.selectedChildren;
      const candidates = this.app.vault.getMarkdownFiles().map((file) => ({ file, match: findMatch(file, term) })).filter(({ match }) => !!match).map(({ file, match }) => ({ file, ...match })).filter(({ file }) => !currentMap.has(file.path) && canSelect(this.activeSide, file.path)).sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-Hans-CN"));
      if (!candidates.length) {
        resultsEl.createDiv({ text: "\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u7B14\u8BB0\u3002", cls: "puffs-relation-empty" });
        return;
      }
      this.activeIndex = Math.min(this.activeIndex, candidates.length - 1);
      candidates.forEach((candidate, index) => {
        const file = candidate.file;
        const rowEl = resultsEl.createDiv({ cls: "puffs-relation-note-result is-clickable" });
        rowEl.classList.toggle("is-active", index === this.activeIndex);
        rowEl.createDiv({ text: candidate.displayName, cls: "puffs-relation-note-result-name" });
        rowEl.createDiv({ text: file.path, cls: "puffs-relation-note-result-path" });
        rowEl.addEventListener("mouseenter", () => {
          this.activeIndex = index;
          resultsEl.querySelectorAll(".puffs-relation-note-result").forEach((el, rowIndex) => {
            el.classList.toggle("is-active", rowIndex === index);
          });
        });
        rowEl.addEventListener("click", () => selectCandidate(candidate));
      });
      (_a = resultsEl.querySelector(".is-active")) == null ? void 0 : _a.scrollIntoView({ block: "nearest" });
    };
    for (const side of visibleSides) {
      inputBySide[side].addEventListener("keydown", (event) => {
        if (this.isComposing || event.isComposing) return;
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && visibleSides.length > 1) {
          const focusSide = getDirectionalInputSide(this.activeSide, event.key, visibleSides);
          event.preventDefault();
          event.stopPropagation();
          if (focusSide) {
            this.activeSide = focusSide;
            this.activeIndex = 0;
            inputBySide[focusSide].focus();
          }
          return;
        }
        const rows = Array.from(resultsEl.querySelectorAll(".puffs-relation-note-result"));
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && rows.length) {
          const delta = event.key === "ArrowDown" ? 1 : -1;
          this.activeIndex = Math.max(0, Math.min(rows.length - 1, this.activeIndex + delta));
          event.preventDefault();
          renderResults();
        } else if (getNoteRelationEnterAction(event, this.isComposing, !!rows[this.activeIndex]) === "select-candidate") {
          event.preventDefault();
          event.stopPropagation();
          rows[this.activeIndex].click();
        }
      });
    }
    const submit = async () => {
      if (this.isSubmitting) return;
      const errorMessage = getNoteRelationSubmitError(this.selectedParents.size, this.selectedChildren.size);
      if (errorMessage) {
        new import_obsidian10.Notice(errorMessage);
        return;
      }
      this.isSubmitting = true;
      try {
        await this.plugin.addNoteHierarchyEdges(
          Array.from(this.selectedParents.values()),
          Array.from(this.selectedChildren.values())
        );
        this.close();
      } catch (error) {
        new import_obsidian10.Notice(error && error.message ? error.message : "\u6DFB\u52A0\u7236\u5B50\u5173\u7CFB\u5931\u8D25");
      } finally {
        this.isSubmitting = false;
      }
    };
    this.modalEl.addEventListener("keydown", (event) => {
      if (getNoteRelationEnterAction(event, this.isComposing) !== "submit") return;
      event.preventDefault();
      event.stopPropagation();
      void submit();
    });
    renderSelections();
    renderResults();
    globalThis.setTimeout(() => inputBySide[this.activeSide].focus(), 0);
  }
};

// src/relations.ts
var createEmptyRelations = () => ({
  version: 1,
  tagInheritance: {
    childrenByParent: {},
    enabledParents: [],
    excludedPathsByParent: {}
  },
  noteHierarchy: {
    childrenByParentPath: {},
    displayNamesByParentPath: {}
  }
});
var RelationsBehavior = class {
  normalizeRelationSettings(value = this.settings.relations) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const result = createEmptyRelations();
    const inheritance = source.tagInheritance && typeof source.tagInheritance === "object" ? source.tagInheritance : {};
    const rawChildren = inheritance.childrenByParent;
    if (rawChildren && typeof rawChildren === "object" && !Array.isArray(rawChildren)) {
      for (const [rawParent, rawValues] of Object.entries(rawChildren)) {
        const parent = normalizeTag(rawParent);
        if (!parent || isNestedTag(parent) || !Array.isArray(rawValues)) continue;
        const children = [];
        const seen = /* @__PURE__ */ new Set();
        for (const rawChild of rawValues) {
          const child = normalizeTag(rawChild);
          if (!child || child === parent || isNestedTag(child) || seen.has(child)) continue;
          seen.add(child);
          children.push(child);
        }
        if (children.length > 0) result.tagInheritance.childrenByParent[parent] = children;
      }
    }
    const enabledParents = Array.isArray(inheritance.enabledParents) ? inheritance.enabledParents : [];
    result.tagInheritance.enabledParents = Array.from(new Set(
      enabledParents.map(normalizeTag).filter((tag) => tag && !isNestedTag(tag))
    ));
    const rawExclusions = inheritance.excludedPathsByParent;
    if (rawExclusions && typeof rawExclusions === "object" && !Array.isArray(rawExclusions)) {
      for (const [rawParent, rawPaths] of Object.entries(rawExclusions)) {
        const parent = normalizeTag(rawParent);
        if (!parent || !Array.isArray(rawPaths)) continue;
        const paths = Array.from(new Set(rawPaths.map((path) => typeof path === "string" ? path.trim() : "").filter(Boolean)));
        if (paths.length > 0) result.tagInheritance.excludedPathsByParent[parent] = paths;
      }
    }
    const hierarchy = source.noteHierarchy && typeof source.noteHierarchy === "object" ? source.noteHierarchy : {};
    for (const key of ["childrenByParentPath", "displayNamesByParentPath"]) {
      const rawObject = hierarchy[key];
      if (!rawObject || typeof rawObject !== "object" || Array.isArray(rawObject)) continue;
      result.noteHierarchy[key] = {};
      for (const [rawParentPath, rawEntries] of Object.entries(rawObject)) {
        const parentPath = typeof rawParentPath === "string" ? rawParentPath.trim() : "";
        if (!parentPath || !rawEntries || typeof rawEntries !== "object") continue;
        if (key === "childrenByParentPath") {
          if (!Array.isArray(rawEntries)) continue;
          const children = Array.from(new Set(rawEntries.map((path) => typeof path === "string" ? path.trim() : "").filter((path) => path && path !== parentPath)));
          if (children.length > 0) result.noteHierarchy[key][parentPath] = children;
        } else if (!Array.isArray(rawEntries)) {
          const entries = {};
          for (const [rawPath, rawDisplayName] of Object.entries(rawEntries)) {
            const path = typeof rawPath === "string" ? rawPath.trim() : "";
            const displayName = typeof rawDisplayName === "string" ? rawDisplayName.trim() : "";
            if (path && displayName) entries[path] = displayName;
          }
          if (Object.keys(entries).length > 0) result.noteHierarchy[key][parentPath] = entries;
        }
      }
    }
    this.settings.relations = result;
    this.reconcileRelationCycles();
    return result;
  }
  getTagInheritanceSettings() {
    if (!this.settings.relations) this.normalizeRelationSettings();
    return this.settings.relations.tagInheritance;
  }
  getNoteHierarchySettings() {
    if (!this.settings.relations) this.normalizeRelationSettings();
    return this.settings.relations.noteHierarchy;
  }
  getHierarchyChildren(parentPath) {
    return [...this.getNoteHierarchySettings().childrenByParentPath[parentPath] || []];
  }
  getHierarchyParents(childPath) {
    return Object.entries(this.getNoteHierarchySettings().childrenByParentPath).filter(([, children]) => Array.isArray(children) && children.includes(childPath)).map(([parentPath]) => parentPath);
  }
  getHierarchyDescendants(parentPath) {
    return collectDirectedDescendants(this.getNoteHierarchySettings().childrenByParentPath, parentPath);
  }
  wouldCreateNoteHierarchyCycle(parentPath, childPath) {
    return wouldCreateDirectedCycle(
      this.getNoteHierarchySettings().childrenByParentPath,
      parentPath,
      childPath
    );
  }
  async addNoteHierarchyEdge(parentPath, childPath) {
    return this.addNoteHierarchyEdges(
      [{ path: parentPath, displayName: "" }],
      [{ path: childPath, displayName: "" }]
    );
  }
  async addNoteHierarchyEdges(parentSelections, childSelections) {
    const parents = Array.from(new Map((parentSelections || []).map((item) => [item.path, item])).values());
    const children = Array.from(new Map((childSelections || []).map((item) => [item.path, item])).values());
    if (!parents.length) throw new Error("\u8BF7\u9009\u62E9\u7236\u7B14\u8BB0");
    if (!children.length) throw new Error("\u8BF7\u9009\u62E9\u5B50\u7B14\u8BB0");
    if (parents.length > 1 && children.length > 1) throw new Error("\u4E0D\u80FD\u540C\u65F6\u9009\u62E9\u591A\u7BC7\u7236\u7B14\u8BB0\u548C\u591A\u7BC7\u5B50\u7B14\u8BB0");
    for (const item of parents) {
      const file = this.app.vault.getAbstractFileByPath(item.path);
      if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md") throw new Error("\u7236\u7B14\u8BB0\u65E0\u6548");
    }
    for (const item of children) {
      const file = this.app.vault.getAbstractFileByPath(item.path);
      if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md") throw new Error("\u5B50\u7B14\u8BB0\u65E0\u6548");
    }
    const hierarchy = this.getNoteHierarchySettings();
    const previousChildren = hierarchy.childrenByParentPath;
    const previousDisplayNames = hierarchy.displayNamesByParentPath;
    const stagedChildren = Object.fromEntries(Object.entries(hierarchy.childrenByParentPath).map(([path, values]) => [path, [...values]]));
    const stagedDisplayNames = Object.fromEntries(Object.entries(hierarchy.displayNamesByParentPath).map(([path, values]) => [path, { ...values }]));
    const pending = [];
    for (const parent of parents) {
      for (const child of children) {
        if (parent.path === child.path) throw new Error("\u7236\u7B14\u8BB0\u548C\u5B50\u7B14\u8BB0\u4E0D\u80FD\u76F8\u540C");
        if ((stagedChildren[parent.path] || []).includes(child.path)) continue;
        if (wouldCreateDirectedCycle(stagedChildren, parent.path, child.path)) {
          throw new Error("\u4E0D\u80FD\u5EFA\u7ACB\u5FAA\u73AF\u7236\u5B50\u5173\u7CFB");
        }
        if (!stagedChildren[parent.path]) stagedChildren[parent.path] = [];
        stagedChildren[parent.path].push(child.path);
        pending.push({ parent, child });
      }
    }
    if (!pending.length) throw new Error("\u6240\u9009\u7236\u5B50\u5173\u7CFB\u5DF2\u7ECF\u5B58\u5728");
    for (const { parent, child } of pending) {
      const childFile = this.app.vault.getAbstractFileByPath(child.path);
      const alias = typeof child.displayName === "string" ? child.displayName.trim() : "";
      if (!alias || !(childFile instanceof import_obsidian11.TFile) || !this.getNoteAliases(childFile).includes(alias)) continue;
      if (!stagedDisplayNames[parent.path]) stagedDisplayNames[parent.path] = {};
      stagedDisplayNames[parent.path][child.path] = alias;
    }
    hierarchy.childrenByParentPath = stagedChildren;
    hierarchy.displayNamesByParentPath = stagedDisplayNames;
    try {
      await this.saveSettings();
    } catch (error) {
      hierarchy.childrenByParentPath = previousChildren;
      hierarchy.displayNamesByParentPath = previousDisplayNames;
      throw error;
    }
    this.refreshHierarchyViews();
    return pending.length;
  }
  async removeNoteHierarchyEdge(parentPath, childPath) {
    const hierarchy = this.getNoteHierarchySettings();
    const children = this.getHierarchyChildren(parentPath).filter((path) => path !== childPath);
    if (children.length) hierarchy.childrenByParentPath[parentPath] = children;
    else delete hierarchy.childrenByParentPath[parentPath];
    if (hierarchy.displayNamesByParentPath[parentPath]) {
      delete hierarchy.displayNamesByParentPath[parentPath][childPath];
      if (!Object.keys(hierarchy.displayNamesByParentPath[parentPath]).length) {
        delete hierarchy.displayNamesByParentPath[parentPath];
      }
    }
    await this.saveSettings();
    this.refreshHierarchyViews();
  }
  async moveHierarchyChild(parentPath, childPath, direction) {
    const hierarchy = this.getNoteHierarchySettings();
    const children = this.getHierarchyChildren(parentPath);
    const index = children.indexOf(childPath);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= children.length) return;
    [children[index], children[nextIndex]] = [children[nextIndex], children[index]];
    hierarchy.childrenByParentPath[parentPath] = children;
    await this.saveSettings();
    this.refreshHierarchyViews();
  }
  async moveSelectedHierarchyNoteAfter(parentPath, targetPath) {
    const selected = this.selectedNoteOrderTarget;
    if (!selected || selected.hierarchyParent !== parentPath || !targetPath || selected.path === targetPath) return false;
    const children = this.getHierarchyChildren(parentPath);
    const movingIndex = children.indexOf(selected.path);
    const targetIndex = children.indexOf(targetPath);
    if (movingIndex < 0 || targetIndex < 0 || movingIndex === targetIndex + 1) return false;
    children.splice(movingIndex, 1);
    children.splice(children.indexOf(targetPath) + 1, 0, selected.path);
    this.getNoteHierarchySettings().childrenByParentPath[parentPath] = children;
    await this.saveSettings();
    this.refreshHierarchyViews();
    globalThis.setTimeout(() => this.refreshNoteOrderSelectionState(), 0);
    return true;
  }
  getHierarchyDisplayName(parentPath, file) {
    if (!(file instanceof import_obsidian11.TFile)) return "";
    const selected = this.getNoteHierarchySettings().displayNamesByParentPath[parentPath] && this.getNoteHierarchySettings().displayNamesByParentPath[parentPath][file.path];
    return selected && this.getNoteAliases(file).includes(selected) ? selected : file.basename;
  }
  async setHierarchyDisplayName(parentPath, file, displayName) {
    if (!(file instanceof import_obsidian11.TFile) || !this.getHierarchyChildren(parentPath).includes(file.path)) return;
    const hierarchy = this.getNoteHierarchySettings();
    const selected = typeof displayName === "string" ? displayName.trim() : "";
    if (selected && !this.getNoteAliases(file).includes(selected)) return;
    if (selected) {
      if (!hierarchy.displayNamesByParentPath[parentPath]) hierarchy.displayNamesByParentPath[parentPath] = {};
      hierarchy.displayNamesByParentPath[parentPath][file.path] = selected;
    } else if (hierarchy.displayNamesByParentPath[parentPath]) {
      delete hierarchy.displayNamesByParentPath[parentPath][file.path];
      if (!Object.keys(hierarchy.displayNamesByParentPath[parentPath]).length) {
        delete hierarchy.displayNamesByParentPath[parentPath];
      }
    }
    await this.saveSettings();
    this.refreshHierarchyViews();
  }
  createHierarchyParentItem(parentPath, matchingPaths = [], forceExpand = false) {
    const parentFile = this.app.vault.getAbstractFileByPath(parentPath);
    const childPaths = this.getNoteHierarchySettings().childrenByParentPath[parentPath];
    if (!(parentFile instanceof import_obsidian11.TFile) || parentFile.extension !== "md" || !Array.isArray(childPaths) || !childPaths.length) return null;
    const descendants = this.getHierarchyDescendants(parentPath);
    const directCount = this.getHierarchyChildren(parentPath).filter((path) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      return file instanceof import_obsidian11.TFile && file.extension === "md";
    }).length;
    const descendantCount = new Set(descendants.filter((path) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      return file instanceof import_obsidian11.TFile && file.extension === "md";
    })).size;
    return {
      parentPath,
      parentFile,
      directCount,
      descendantCount,
      additionalCount: Math.max(0, descendantCount - directCount),
      matchingPaths: new Set(matchingPaths),
      forceExpand
    };
  }
  getHierarchyParentItems(query = "", currentNotePath = "") {
    const parsed = parseHierarchySearch(query);
    if (!parsed.valid) return [];
    const hierarchy = this.getNoteHierarchySettings();
    const items = [];
    const currentFile = currentNotePath && this.app.vault.getAbstractFileByPath(currentNotePath);
    if (!(currentFile instanceof import_obsidian11.TFile) || currentFile.extension !== "md") currentNotePath = "";
    if (currentNotePath) {
      const parentPaths = /* @__PURE__ */ new Set();
      if (this.getHierarchyChildren(currentNotePath).length) parentPaths.add(currentNotePath);
      for (const parentPath of this.getHierarchyParents(currentNotePath)) parentPaths.add(parentPath);
      for (const parentPath of parentPaths) {
        const isCurrentChild = parentPath !== currentNotePath && this.getHierarchyChildren(parentPath).includes(currentNotePath);
        const item = this.createHierarchyParentItem(
          parentPath,
          isCurrentChild ? [currentNotePath] : [],
          isCurrentChild
        );
        if (item) items.push(item);
      }
    } else {
      const { parentQuery, childQuery } = parsed;
      for (const [parentPath, childPaths] of Object.entries(hierarchy.childrenByParentPath)) {
        const parentFile = this.app.vault.getAbstractFileByPath(parentPath);
        if (!(parentFile instanceof import_obsidian11.TFile) || parentFile.extension !== "md" || !Array.isArray(childPaths) || !childPaths.length) continue;
        const parentNames = [parentFile.basename, ...this.getNoteAliases(parentFile)].map((name) => name.toLowerCase());
        if (parentQuery && !parentNames.some((name) => name.includes(parentQuery))) continue;
        const descendants = this.getHierarchyDescendants(parentPath);
        const matchingPaths = childQuery ? descendants.filter((path) => {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (!(file instanceof import_obsidian11.TFile)) return false;
          const directParents = this.getHierarchyParents(path);
          const names = [file.basename, ...this.getNoteAliases(file)];
          for (const directParent of directParents) {
            names.push(this.getHierarchyDisplayName(directParent, file));
          }
          return names.some((name) => String(name).toLowerCase().includes(childQuery));
        }) : [];
        if (childQuery && !matchingPaths.length) continue;
        const item = this.createHierarchyParentItem(parentPath, matchingPaths, !!childQuery);
        if (item) items.push(item);
      }
    }
    items.sort((a, b) => compareHierarchyParentItems(
      { directCount: a.directCount, name: a.parentFile.basename },
      { directCount: b.directCount, name: b.parentFile.basename }
    ));
    return items;
  }
  createHierarchySurfaceState() {
    return {
      query: "",
      currentNotePath: "",
      allExpanded: true,
      expandedParents: /* @__PURE__ */ new Set(),
      expandedBranches: /* @__PURE__ */ new Set(),
      collapsedParents: /* @__PURE__ */ new Set(),
      collapsedBranches: /* @__PURE__ */ new Set(),
      activeMatchIndex: -1,
      groupExpanded: true
    };
  }
  getHierarchySearchContext(value) {
    const context = parseUnifiedHierarchySearch(value);
    if (context.mode !== "current-note") return { ...context, currentNotePath: "" };
    const file = this.currentMainFilePath && this.app.vault.getAbstractFileByPath(this.currentMainFilePath);
    return {
      ...context,
      currentNotePath: file instanceof import_obsidian11.TFile && file.extension === "md" ? file.path : ""
    };
  }
  getHierarchyEdgeCount() {
    let count = 0;
    for (const [parentPath, children] of Object.entries(this.getNoteHierarchySettings().childrenByParentPath)) {
      const parentFile = this.app.vault.getAbstractFileByPath(parentPath);
      if (!(parentFile instanceof import_obsidian11.TFile) || parentFile.extension !== "md") continue;
      for (const childPath of Array.isArray(children) ? children : []) {
        const childFile = this.app.vault.getAbstractFileByPath(childPath);
        if (childFile instanceof import_obsidian11.TFile && childFile.extension === "md") count += 1;
      }
    }
    return count;
  }
  getInlineHierarchyBranchKey(tagValue, path) {
    return `${String(tagValue || "")}\0${path}`;
  }
  toggleInlineHierarchyBranch(branchKey) {
    if (!branchKey) return false;
    const collapsedBranches = this.collapsedInlineHierarchyBranches || /* @__PURE__ */ new Set();
    this.collapsedInlineHierarchyBranches = collapsedBranches;
    if (collapsedBranches.has(branchKey)) {
      collapsedBranches.delete(branchKey);
    } else {
      collapsedBranches.add(branchKey);
    }
    this.inlineHierarchyExpansionVersion = (this.inlineHierarchyExpansionVersion || 0) + 1;
    return !collapsedBranches.has(branchKey);
  }
  clearInlineHierarchyBranchState(tagValue) {
    const prefix = `${String(tagValue || "")}\0`;
    if (!prefix || !this.collapsedInlineHierarchyBranches) return false;
    let changed = false;
    for (const branchKey of Array.from(this.collapsedInlineHierarchyBranches)) {
      if (!String(branchKey).startsWith(prefix)) continue;
      this.collapsedInlineHierarchyBranches.delete(branchKey);
      changed = true;
    }
    if (changed) {
      this.inlineHierarchyExpansionVersion = (this.inlineHierarchyExpansionVersion || 0) + 1;
    }
    return changed;
  }
  getInlineHierarchyDisplayName(tag, parentPath, file, isVirtual = false) {
    var _a, _b;
    if (tag && !isVirtual && !isNestedTag(tag)) {
      const selected = (_b = (_a = this.settings.noteDisplayNameByTag) == null ? void 0 : _a[tag]) == null ? void 0 : _b[file.path];
      if (selected && this.getNoteAliases(file).includes(selected)) return selected;
    }
    if (parentPath) return this.getHierarchyDisplayName(parentPath, file);
    return this.getNoteDisplayName(tag, file, isVirtual);
  }
  hierarchyBranchContains(childrenByParent, parentPath, targetPath, seen = /* @__PURE__ */ new Set()) {
    if (!parentPath || seen.has(parentPath)) return false;
    seen.add(parentPath);
    for (const childPath of childrenByParent[parentPath] || []) {
      if (childPath === targetPath) return true;
      if (this.hierarchyBranchContains(childrenByParent, childPath, targetPath, seen)) return true;
    }
    return false;
  }
  renderTagInheritanceBrowseTree(hostEl, tree, options = {}) {
    hostEl.empty();
    if (!tree) return;
    const rootTag = normalizeTag(tree.tag);
    const collapsed = this.collapsedInlineHierarchyBranches || /* @__PURE__ */ new Set();
    this.collapsedInlineHierarchyBranches = collapsed;
    const targetPath = options.targetPath || "";
    const renderNotes = (containerEl, node, isInheritedGroup) => {
      const files = node.paths.map((path) => this.app.vault.getAbstractFileByPath(path)).filter((file) => file instanceof import_obsidian11.TFile && file.extension === "md");
      this.renderInlineTagNoteTree(containerEl, files, node.tag, false, {
        ...options,
        inheritanceRootTag: rootTag,
        isInheritedGroup,
        allowInheritedReorder: true
      });
    };
    const renderGroup = (containerEl, label, count, key, containsTarget, renderContent) => {
      if (!count) return;
      const expanded = !!targetPath && containsTarget || !collapsed.has(key);
      const itemEl = containerEl.createDiv({ cls: "tree-item puffs-tag-list-item puffs-inheritance-tag-group" });
      const rowEl = itemEl.createDiv({
        cls: "tree-item-self tag-pane-tag is-clickable mod-collapsible puffs-tag-list-row puffs-inheritance-tag-group-row"
      });
      rowEl.dataset.puffsInheritanceGroup = key;
      rowEl.setAttribute("aria-expanded", String(expanded));
      const toggleEl = rowEl.createDiv({ cls: "tree-item-icon collapse-icon puffs-tag-list-toggle" });
      toggleEl.classList.toggle("is-collapsed", !expanded);
      (0, import_obsidian11.setIcon)(toggleEl, "right-triangle");
      rowEl.createDiv({ text: label, cls: "tree-item-inner" });
      const flairOuterEl = rowEl.createDiv({ cls: "tree-item-flair-outer" });
      flairOuterEl.createSpan({ text: String(count), cls: "tree-item-flair tag-pane-tag-count" });
      rowEl.addEventListener("click", () => {
        var _a;
        this.toggleInlineHierarchyBranch(key);
        (_a = options.rerender) == null ? void 0 : _a.call(options);
        if (options.surface === "shelf") this.refreshTagViews();
      });
      if (expanded) {
        const contentEl = itemEl.createDiv({ cls: "tree-item-children puffs-inheritance-tag-group-content" });
        renderContent(contentEl);
      }
    };
    const renderNode = (containerEl, node, lineage) => {
      const key = `${rootTag}\0tag-group\0${lineage.join("")}`;
      renderGroup(
        containerEl,
        getTagDisplayName(node.tag),
        node.subtreePaths.length,
        key,
        node.subtreePaths.includes(targetPath),
        (contentEl) => {
          if (!node.children.length) {
            renderNotes(contentEl, node, true);
            return;
          }
          if (node.paths.length) {
            renderGroup(
              contentEl,
              "\u539F\u751F",
              node.paths.length,
              `${key}\0original`,
              node.paths.includes(targetPath),
              (originalEl) => renderNotes(originalEl, node, true)
            );
          }
          for (const child of node.children) renderNode(contentEl, child, [...lineage, child.tag]);
        }
      );
    };
    if (!tree.children.length) {
      renderNotes(hostEl, tree, false);
      return;
    }
    if (tree.paths.length) {
      renderGroup(
        hostEl,
        "\u539F\u751F",
        tree.paths.length,
        `${rootTag}\0tag-group\0original`,
        tree.paths.includes(targetPath),
        (contentEl) => renderNotes(contentEl, tree, false)
      );
    }
    for (const child of tree.children) renderNode(hostEl, child, [child.tag]);
  }
  renderInlineTagNoteTree(hostEl, files, tagValue, isVirtual = false, options = {}) {
    hostEl.empty();
    const tag = normalizeTag(tagValue);
    const orderedFiles = Array.from(new Map((files || []).map((file) => [file.path, file])).values());
    const fileByPath = new Map(orderedFiles.map((file) => [file.path, file]));
    const forest = buildVisibleHierarchyForest(
      orderedFiles.map((file) => file.path),
      this.getNoteHierarchySettings().childrenByParentPath
    );
    const collapsedBranches = this.collapsedInlineHierarchyBranches || /* @__PURE__ */ new Set();
    this.collapsedInlineHierarchyBranches = collapsedBranches;
    const surface = options.surface || "sidebar";
    const inheritanceRootTag = normalizeTag(options.inheritanceRootTag || tag);
    const targetPath = options.targetPath || "";
    const renderedCards = [];
    const renderNode = (containerEl, path, parentPath = "", branch = /* @__PURE__ */ new Set()) => {
      if (branch.has(path)) return;
      const file = fileByPath.get(path);
      if (!(file instanceof import_obsidian11.TFile)) return;
      const nextBranch = new Set(branch);
      nextBranch.add(path);
      const children = forest.childrenByParent[path] || [];
      const branchKey = this.getInlineHierarchyBranchKey(tagValue, path);
      const forceExpanded = !!targetPath && this.hierarchyBranchContains(
        forest.childrenByParent,
        path,
        targetPath,
        /* @__PURE__ */ new Set()
      );
      const expanded = forceExpanded || !collapsedBranches.has(branchKey);
      const inherited = !!options.isInheritedGroup || !!tag && !isVirtual && this.isInheritedFileForTag(tag, file.path);
      const canTagReorder = !parentPath && !!tag && !isVirtual && !isNestedTag(tag) && (!inherited || options.allowInheritedReorder);
      const itemEl = containerEl.createDiv({
        cls: `tree-item puffs-tag-note-item${parentPath ? " puffs-inline-hierarchy-child-item" : ""}`
      });
      itemEl.dataset.path = file.path;
      itemEl.classList.toggle(
        "is-order-selected",
        this.isNoteOrderTargetSelected(tag, file.path, parentPath)
      );
      const cardEl = itemEl.createDiv({
        cls: `tree-item-self puffs-tag-note-card is-clickable${surface === "shelf" ? " puffs-tag-shelf-note-card" : " puffs-tag-sidebar-note-card"}${!parentPath && !canTagReorder ? " puffs-tag-note-card-no-order" : ""}${parentPath ? " puffs-inline-hierarchy-child-card" : ""}`
      });
      cardEl.dataset.path = file.path;
      cardEl.dataset.puffsSurface = surface;
      if (tag && !isVirtual) cardEl.dataset.puffsTag = tag;
      if (inheritanceRootTag && inheritanceRootTag !== tag) cardEl.dataset.puffsInheritanceRootTag = inheritanceRootTag;
      if (parentPath) cardEl.dataset.puffsHierarchyParent = parentPath;
      if (inherited) {
        cardEl.dataset.puffsInherited = "true";
      }
      const orderButtonEl = cardEl.createEl("button", { cls: "clickable-icon puffs-tag-note-order-button" });
      orderButtonEl.dataset.path = file.path;
      orderButtonEl.dataset.puffsSurface = surface;
      if (parentPath) {
        orderButtonEl.dataset.puffsHierarchyParent = parentPath;
      } else if (canTagReorder) {
        orderButtonEl.dataset.puffsTag = tag;
      } else {
        orderButtonEl.remove();
      }
      const hasOrderButton = orderButtonEl.isConnected || !!orderButtonEl.parentElement;
      const usesCombinedParentControl = hasOrderButton && children.length > 0 && !isVirtual;
      const toggleOrder = () => {
        if (parentPath) this.toggleHierarchyNoteOrderTarget(parentPath, file.path, surface);
        else this.toggleNoteOrderTarget(tag, file.path, surface);
      };
      if (usesCombinedParentControl) {
        orderButtonEl.classList.add("puffs-note-parent-control-button", "collapse-icon");
        orderButtonEl.dataset.puffsInlineHierarchyBranchKey = branchKey;
        orderButtonEl.dataset.puffsExpanded = String(expanded);
        this.syncNoteOrderButtonSelection(orderButtonEl);
        this.bindNoteParentControlButton(orderButtonEl, () => {
          var _a;
          this.toggleInlineHierarchyBranch(branchKey);
          (_a = options.rerender) == null ? void 0 : _a.call(options);
          if (surface === "shelf") this.refreshTagViews();
        }, toggleOrder);
      } else if (hasOrderButton) {
        (0, import_obsidian11.setIcon)(orderButtonEl, "grip-vertical");
        this.syncNoteOrderButtonSelection(orderButtonEl);
        orderButtonEl.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleOrder();
        });
      }
      if (children.length && !usesCombinedParentControl) {
        const toggleEl = cardEl.createDiv({ cls: "tree-item-icon collapse-icon puffs-inline-hierarchy-toggle" });
        toggleEl.dataset.puffsInlineHierarchyBranchKey = branchKey;
        toggleEl.classList.toggle("is-collapsed", !expanded);
        (0, import_obsidian11.setIcon)(toggleEl, "right-triangle");
        toggleEl.addEventListener("click", (event) => {
          var _a;
          event.preventDefault();
          event.stopPropagation();
          this.toggleInlineHierarchyBranch(branchKey);
          (_a = options.rerender) == null ? void 0 : _a.call(options);
          if (surface === "shelf") this.refreshTagViews();
        });
      }
      const innerEl = cardEl.createDiv({ cls: "tree-item-inner" });
      innerEl.createDiv({
        text: this.getInlineHierarchyDisplayName(tag, parentPath, file, isVirtual),
        cls: "tree-item-inner-text"
      });
      if (children.length) {
        const flairOuterEl = cardEl.createDiv({ cls: "tree-item-flair-outer" });
        flairOuterEl.createSpan({ text: String(children.length), cls: "tree-item-flair tag-pane-tag-count" });
      }
      cardEl.addEventListener("click", () => this.openFileInMainWorkspace(file));
      cardEl.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (parentPath) this.showHierarchyChildMenu(event, parentPath, file);
        else this.showNoteCardContextMenu(event, cardEl);
      });
      renderedCards.push(cardEl);
      if (children.length && expanded) {
        const childHostEl = itemEl.createDiv({ cls: "tree-item-children puffs-inline-hierarchy-children" });
        for (const childPath of children) renderNode(childHostEl, childPath, path, nextBranch);
      }
    };
    const roots = forest.roots.length ? forest.roots : orderedFiles.map((file) => file.path);
    for (const rootPath of roots) renderNode(hostEl, rootPath);
    if (this.settings.scrollTopButtonThreshold > 0 && orderedFiles.length >= this.settings.scrollTopButtonThreshold && renderedCards.length) {
      const scrollTopButtonEl = renderedCards[renderedCards.length - 1].createEl("button", {
        cls: "clickable-icon puffs-tag-scroll-top-button"
      });
      scrollTopButtonEl.dataset.puffsTag = tagValue;
      (0, import_obsidian11.setIcon)(scrollTopButtonEl, "arrow-up-to-line");
      scrollTopButtonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.scheduleTagTopScroll(options.scrollContainer || hostEl, tagValue);
      });
    }
  }
  renderHierarchySearchItem(hostEl, state, options = {}) {
    hostEl.empty();
    const surface = options.surface || "sidebar";
    const groupExpanded = state.groupExpanded !== false;
    const treeItemEl = hostEl.createDiv({
      cls: `tree-item puffs-tag-list-item puffs-hierarchy-search-item${surface === "shelf" ? " puffs-tag-shelf-card" : ""}${groupExpanded ? " puffs-tag-expanded" : ""}`
    });
    const rowEl = treeItemEl.createDiv({
      cls: `tree-item-self tag-pane-tag is-clickable mod-collapsible puffs-tag-list-row puffs-hierarchy-search-row${surface === "shelf" ? " puffs-tag-shelf-tag-row" : ""}`
    });
    rowEl.dataset.puffsHierarchyGroup = "true";
    rowEl.dataset.puffsVirtualTag = "true";
    rowEl.setAttribute("aria-expanded", String(groupExpanded));
    const toggleEl = rowEl.createDiv({ cls: "tree-item-icon collapse-icon puffs-tag-list-toggle" });
    toggleEl.classList.toggle("is-collapsed", !groupExpanded);
    (0, import_obsidian11.setIcon)(toggleEl, "right-triangle");
    rowEl.createDiv({ text: "\u7236\u5B50", cls: "tree-item-inner" });
    const addButtonEl = rowEl.createEl("button", {
      cls: "clickable-icon puffs-hierarchy-add-button",
      attr: { "aria-label": "\u65B0\u589E\u7236\u5B50\u7B14\u8BB0" }
    });
    (0, import_obsidian11.setIcon)(addButtonEl, "plus");
    addButtonEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      new NoteRelationModal(this.app, this).open();
    });
    const flairOuterEl = rowEl.createDiv({ cls: "tree-item-flair-outer" });
    flairOuterEl.createSpan({ text: String(this.getHierarchyEdgeCount()), cls: "tree-item-flair tag-pane-tag-count" });
    rowEl.addEventListener("click", () => {
      this.toggleHierarchyGroup(state);
      this.renderHierarchySearchItem(hostEl, state, options);
    });
    if (groupExpanded) {
      const contentEl = treeItemEl.createDiv({ cls: "tree-item-children puffs-hierarchy-search-content" });
      this.renderNoteHierarchyPage(contentEl, state, {
        surface,
        showHeader: false,
        showSearch: false
      });
    }
  }
  resetHierarchyExpansionState(state) {
    var _a, _b;
    if (!state) return;
    state.allExpanded = true;
    state.expandedParents.clear();
    state.expandedBranches.clear();
    (_a = state.collapsedParents) == null ? void 0 : _a.clear();
    (_b = state.collapsedBranches) == null ? void 0 : _b.clear();
  }
  toggleHierarchyGroup(state) {
    if (!state) return false;
    state.groupExpanded = state.groupExpanded === false;
    this.resetHierarchyExpansionState(state);
    return state.groupExpanded;
  }
  toggleAllHierarchyItems(state) {
    var _a, _b;
    state.allExpanded = !state.allExpanded;
    state.expandedParents.clear();
    state.expandedBranches.clear();
    (_a = state.collapsedParents) == null ? void 0 : _a.clear();
    (_b = state.collapsedBranches) == null ? void 0 : _b.clear();
    if (typeof state.renderList === "function") state.renderList();
    return state.allExpanded;
  }
  isHierarchyItemExpanded(state, key, kind, forceExpanded = false) {
    if (forceExpanded) return true;
    const expandedSet = kind === "parent" ? state.expandedParents : state.expandedBranches;
    const collapsedSet = kind === "parent" ? state.collapsedParents || (state.collapsedParents = /* @__PURE__ */ new Set()) : state.collapsedBranches || (state.collapsedBranches = /* @__PURE__ */ new Set());
    return state.allExpanded ? !collapsedSet.has(key) : expandedSet.has(key);
  }
  toggleHierarchyItemExpansion(state, key, kind) {
    const expandedSet = kind === "parent" ? state.expandedParents : state.expandedBranches;
    const collapsedSet = kind === "parent" ? state.collapsedParents || (state.collapsedParents = /* @__PURE__ */ new Set()) : state.collapsedBranches || (state.collapsedBranches = /* @__PURE__ */ new Set());
    if (state.allExpanded) {
      if (collapsedSet.has(key)) collapsedSet.delete(key);
      else collapsedSet.add(key);
      return !collapsedSet.has(key);
    }
    if (expandedSet.has(key)) expandedSet.delete(key);
    else expandedSet.add(key);
    return expandedSet.has(key);
  }
  renderNoteHierarchyPage(hostEl, state, options = {}) {
    hostEl.empty();
    hostEl.classList.add("puffs-note-hierarchy-page");
    if (options.showHeader !== false) {
      const headerEl = hostEl.createDiv({ cls: "puffs-note-hierarchy-header" });
      headerEl.createEl("h3", { text: "\u7236\u5B50\u7B14\u8BB0", cls: "puffs-note-hierarchy-title" });
      if (options.onBack) {
        const backButton = headerEl.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "\u8FD4\u56DE\u6807\u7B7E\u7CFB\u7EDF" } });
        (0, import_obsidian11.setIcon)(backButton, "tags");
        backButton.addEventListener("click", options.onBack);
      }
    }
    const searchEl = options.showSearch === false ? null : hostEl.createEl("input", {
      type: "search",
      cls: "puffs-note-hierarchy-search",
      attr: { placeholder: "\u641C\u7D22\u7236\u7B14\u8BB0\uFF1B\u7236*\u5B50\uFF1B*\u5B50" }
    });
    if (searchEl) searchEl.value = state.query || "";
    const listEl = hostEl.createDiv({ cls: "puffs-note-hierarchy-list" });
    const renderList = () => {
      listEl.empty();
      const items = this.getHierarchyParentItems(state.query, state.currentNotePath);
      if (!items.length) {
        listEl.createDiv({ text: state.query ? "\u6CA1\u6709\u5339\u914D\u7684\u7236\u5B50\u5173\u7CFB\u3002" : "\u6682\u65E0\u7236\u5B50\u7B14\u8BB0\u5173\u7CFB\u3002", cls: "puffs-relation-empty" });
        return;
      }
      for (const item of items) this.renderHierarchyParentItem(listEl, item, state, renderList, options.surface || "sidebar");
    };
    const handleSearchEnter = (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      const matches = Array.from(listEl.querySelectorAll(".is-hierarchy-search-match"));
      if (!matches.length) return;
      state.activeMatchIndex = (state.activeMatchIndex + 1) % matches.length;
      matches.forEach((el, index) => el.classList.toggle("is-active-match", index === state.activeMatchIndex));
      matches[state.activeMatchIndex].scrollIntoView({ block: "nearest" });
      event.preventDefault();
    };
    if (searchEl) {
      searchEl.addEventListener("input", () => {
        state.query = searchEl.value;
        state.activeMatchIndex = -1;
        renderList();
      });
      searchEl.addEventListener("keydown", handleSearchEnter);
    }
    renderList();
    state.inputEl = searchEl || state.inputEl;
    state.renderList = renderList;
    state.handleSearchEnter = handleSearchEnter;
  }
  renderHierarchyParentItem(listEl, item, state, rerender, surface) {
    const expanded = this.isHierarchyItemExpanded(state, item.parentPath, "parent", item.forceExpand);
    const treeEl = listEl.createDiv({ cls: "tree-item puffs-note-hierarchy-parent" });
    const rowEl = treeEl.createDiv({ cls: "tree-item-self is-clickable mod-collapsible puffs-note-hierarchy-parent-row" });
    const toggleEl = rowEl.createDiv({ cls: "tree-item-icon collapse-icon" });
    toggleEl.classList.toggle("is-collapsed", !expanded);
    (0, import_obsidian11.setIcon)(toggleEl, "right-triangle");
    rowEl.createDiv({ text: item.parentFile.basename, cls: "tree-item-inner" });
    const addChildButton = rowEl.createEl("button", { cls: "clickable-icon puffs-hierarchy-add-child-button", attr: { "aria-label": "\u6DFB\u52A0\u5B50\u7B14\u8BB0" } });
    (0, import_obsidian11.setIcon)(addChildButton, "user-round-plus");
    addChildButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      new NoteRelationModal(this.app, this, item.parentPath, "child").open();
    });
    const flairOuterEl = rowEl.createDiv({ cls: "tree-item-flair-outer" });
    flairOuterEl.createSpan({
      text: String(item.descendantCount),
      cls: "tree-item-flair tag-pane-tag-count"
    });
    rowEl.addEventListener("click", () => {
      this.toggleHierarchyItemExpansion(state, item.parentPath, "parent");
      rerender();
    });
    rowEl.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.showHierarchyParentMenu(event, item.parentFile);
    });
    if (expanded) {
      const childrenEl = treeEl.createDiv({ cls: "tree-item-children puffs-note-hierarchy-children" });
      this.renderHierarchyChildren(childrenEl, item.parentPath, item.parentPath, state, item.matchingPaths, /* @__PURE__ */ new Set([item.parentPath]), rerender, surface, 0);
    }
  }
  renderHierarchyChildren(containerEl, rootPath, parentPath, state, matchingPaths, branch, rerender, surface, depth) {
    for (const childPath of this.getHierarchyChildren(parentPath)) {
      if (branch.has(childPath)) continue;
      const file = this.app.vault.getAbstractFileByPath(childPath);
      if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md") continue;
      const nextBranch = new Set(branch);
      nextBranch.add(childPath);
      const branchKey = `${rootPath}\0${parentPath}\0${childPath}`;
      const hasChildren = this.getHierarchyChildren(childPath).length > 0;
      const forceOpen = Array.from(matchingPaths).some((path) => path === childPath || this.getHierarchyDescendants(childPath).includes(path));
      const expanded = this.isHierarchyItemExpanded(state, branchKey, "branch", forceOpen);
      const itemEl = containerEl.createDiv({ cls: "tree-item puffs-tag-note-item puffs-note-hierarchy-child-item" });
      const cardEl = itemEl.createDiv({ cls: "tree-item-self puffs-tag-note-card is-clickable puffs-note-hierarchy-child-card" });
      cardEl.dataset.path = file.path;
      cardEl.dataset.puffsHierarchyParent = parentPath;
      cardEl.dataset.puffsSurface = surface;
      const orderButtonEl = cardEl.createEl("button", { cls: "clickable-icon puffs-tag-note-order-button" });
      orderButtonEl.dataset.path = file.path;
      orderButtonEl.dataset.puffsHierarchyParent = parentPath;
      orderButtonEl.dataset.puffsSurface = surface;
      (0, import_obsidian11.setIcon)(orderButtonEl, "grip-vertical");
      this.syncNoteOrderButtonSelection(orderButtonEl);
      orderButtonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleHierarchyNoteOrderTarget(parentPath, file.path, surface);
      });
      if (matchingPaths.has(childPath)) cardEl.classList.add("is-hierarchy-search-match");
      if (hasChildren) {
        const toggleEl = cardEl.createDiv({ cls: "tree-item-icon collapse-icon" });
        toggleEl.classList.toggle("is-collapsed", !expanded);
        (0, import_obsidian11.setIcon)(toggleEl, "right-triangle");
        toggleEl.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.toggleHierarchyItemExpansion(state, branchKey, "branch");
          rerender();
        });
      }
      cardEl.createDiv({ text: this.getHierarchyDisplayName(parentPath, file), cls: "tree-item-inner" });
      cardEl.addEventListener("click", () => this.openFileInMainWorkspace(file));
      cardEl.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.showHierarchyChildMenu(event, parentPath, file);
      });
      if (hasChildren && expanded) {
        const nestedEl = itemEl.createDiv({ cls: "tree-item-children puffs-note-hierarchy-children" });
        this.renderHierarchyChildren(nestedEl, rootPath, childPath, state, matchingPaths, nextBranch, rerender, surface, depth + 1);
      }
    }
  }
  showHierarchyParentMenu(event, file) {
    const menu = new import_obsidian11.Menu();
    menu.addItem((item) => item.setTitle("\u6253\u5F00\u7B14\u8BB0").setIcon("file-text").onClick(() => this.openFileInMainWorkspace(file)));
    menu.addItem((item) => item.setTitle("\u6DFB\u52A0\u5B50\u7B14\u8BB0").setIcon("user-round-plus").onClick(() => {
      new NoteRelationModal(this.app, this, file.path, "child").open();
    }));
    menu.addItem((item) => item.setTitle("\u6DFB\u52A0\u7236\u7B14\u8BB0").setIcon("corner-left-up").onClick(() => {
      new NoteRelationModal(this.app, this, file.path, "parent").open();
    }));
    menu.showAtMouseEvent(event);
  }
  showHierarchyChildMenu(event, parentPath, file) {
    const menu = new import_obsidian11.Menu();
    const aliases = this.getNoteAliases(file);
    if (aliases.length) {
      menu.addItem((item) => item.setTitle("\u66F4\u6362\u663E\u793A\u540D\u79F0").setIcon("text-cursor-input").onClick(() => {
        const position = { x: event.clientX, y: event.clientY };
        window.setTimeout(() => this.showHierarchyDisplayNameOptions(position, parentPath, file, aliases), 0);
      }));
    }
    menu.addItem((item) => item.setTitle("\u6DFB\u52A0\u5B50\u7B14\u8BB0").setIcon("user-round-plus").onClick(() => new NoteRelationModal(this.app, this, file.path, "child").open()));
    menu.addItem((item) => item.setTitle("\u6DFB\u52A0\u7236\u7B14\u8BB0").setIcon("corner-left-up").onClick(() => new NoteRelationModal(this.app, this, file.path, "parent").open()));
    menu.addItem((item) => item.setTitle("\u4ECE\u5F53\u524D\u79FB\u9664").setIcon("unlink").onClick(() => this.removeNoteHierarchyEdge(parentPath, file.path)));
    menu.showAtMouseEvent(event);
  }
  showHierarchyDisplayNameOptions(position, parentPath, file, aliases) {
    const current = this.getHierarchyDisplayName(parentPath, file);
    const menu = new import_obsidian11.Menu();
    menu.addItem((item) => item.setTitle(file.basename).setChecked(current === file.basename).onClick(() => this.setHierarchyDisplayName(parentPath, file, "")));
    for (const alias of aliases) {
      menu.addItem((item) => item.setTitle(alias).setChecked(current === alias).onClick(() => this.setHierarchyDisplayName(parentPath, file, alias)));
    }
    menu.showAtPosition(position);
  }
  refreshHierarchyViews() {
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }
  getHierarchyNavigationHistory(view, surface) {
    if (surface === "shelf") {
      if (!view.hierarchyNavigationHistory) {
        view.hierarchyNavigationHistory = createHierarchyNavigationHistory();
      }
      return view.hierarchyNavigationHistory;
    }
    const patch = this.viewPatches.get(view) || this.patchTagView(view);
    if (!patch.hierarchyNavigationHistory) {
      patch.hierarchyNavigationHistory = createHierarchyNavigationHistory();
    }
    return patch.hierarchyNavigationHistory;
  }
  getHierarchyNavigationScrollEl(view, surface) {
    var _a;
    if (surface === "shelf") return view.contentEl || null;
    return ((_a = view.containerEl) == null ? void 0 : _a.querySelector(".tag-container")) || view.tagPaneEl || null;
  }
  captureHierarchyNavigationSnapshot(view, surface) {
    const query = surface === "shelf" ? view.searchQuery : this.getTagSearchValue(view);
    const scrollEl = this.getHierarchyNavigationScrollEl(view, surface);
    return { query: String(query || ""), scrollTop: (scrollEl == null ? void 0 : scrollEl.scrollTop) || 0 };
  }
  applyHierarchyNavigationSnapshot(view, surface, snapshot) {
    var _a;
    const history = this.getHierarchyNavigationHistory(view, surface);
    const restoreRequestId = history.restoreRequestId;
    if (surface === "shelf") {
      view.searchQuery = snapshot.query;
      view.hierarchyState.activeMatchIndex = -1;
      (_a = view.searchComponent) == null ? void 0 : _a.setValue(snapshot.query);
      view.renderTagList();
    } else {
      const patch = this.viewPatches.get(view) || this.patchTagView(view);
      patch.hierarchyState.activeMatchIndex = -1;
      if (!view.isShowingSearch && typeof view.setShowSearch === "function") view.setShowSearch(true);
      const searchComponent = view.searchComponent;
      if (searchComponent && typeof searchComponent.setValue === "function") searchComponent.setValue(snapshot.query);
      const inputEl = searchComponent && searchComponent.inputEl;
      if (inputEl) inputEl.value = snapshot.query;
      if (typeof view.updateSearch === "function") view.updateSearch();
      this.scheduleSyncView(view, 0);
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      var _a2;
      if (history.restoreRequestId !== restoreRequestId) return;
      const scrollEl = this.getHierarchyNavigationScrollEl(view, surface);
      if (scrollEl == null ? void 0 : scrollEl.isConnected) scrollEl.scrollTop = snapshot.scrollTop;
      const inputEl = (_a2 = view.searchComponent) == null ? void 0 : _a2.inputEl;
      if (inputEl == null ? void 0 : inputEl.isConnected) inputEl.focus({ preventScroll: true });
    }));
  }
  navigateHierarchyHistory(view, surface, direction) {
    const history = this.getHierarchyNavigationHistory(view, surface);
    if (history.entries.length < 2) return false;
    const snapshot = moveHierarchyNavigation(
      history,
      direction,
      this.captureHierarchyNavigationSnapshot(view, surface)
    );
    if (snapshot) this.applyHierarchyNavigationSnapshot(view, surface, snapshot);
    return true;
  }
  pushHierarchyNavigationForView(view, surface, query) {
    const history = this.getHierarchyNavigationHistory(view, surface);
    const target = pushHierarchyNavigation(
      history,
      this.captureHierarchyNavigationSnapshot(view, surface),
      { query, scrollTop: 0 }
    );
    this.applyHierarchyNavigationSnapshot(view, surface, target);
  }
  openHierarchyForNote(path, sourceEl) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md") return;
    const keyword = DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD;
    const relationParentPath = sourceEl && sourceEl.dataset && sourceEl.dataset.puffsHierarchyParent;
    const relationParent = relationParentPath && this.app.vault.getAbstractFileByPath(relationParentPath);
    const query = relationParent instanceof import_obsidian11.TFile && relationParent.extension === "md" ? `${keyword}${relationParent.basename}*${file.basename}` : this.getHierarchyParents(path).length > 0 ? `${keyword}${keyword}${file.basename}` : `${keyword}${file.basename}`;
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_SHELF_VIEW_TYPE)) {
      const view = leaf.view;
      if (!view || !view.contentEl || !view.contentEl.contains(sourceEl)) continue;
      this.pushHierarchyNavigationForView(view, "shelf", query);
      return;
    }
    for (const leaf of this.app.workspace.getLeavesOfType("tag")) {
      const view = leaf.view;
      if (!view || !view.containerEl || !view.containerEl.contains(sourceEl)) continue;
      this.pushHierarchyNavigationForView(view, "sidebar", query);
      return;
    }
  }
  showNoteCardContextMenu(event, cardEl) {
    const path = cardEl && cardEl.dataset.path;
    const file = path && this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md") return false;
    const hierarchyParent = cardEl.dataset.puffsHierarchyParent;
    if (hierarchyParent) {
      this.showHierarchyChildMenu(event, hierarchyParent, file);
      return true;
    }
    const tag = normalizeTag(cardEl.dataset.puffsTag);
    const inheritanceRootTag = normalizeTag(cardEl.dataset.puffsInheritanceRootTag || tag);
    const menu = new import_obsidian11.Menu();
    const inherited = cardEl.dataset.puffsInherited === "true" || tag && this.isInheritedFileForTag(tag, path);
    if (inherited) {
      menu.addItem((item) => item.setTitle(`\u4E0D\u5728 ${getTagDisplayName(inheritanceRootTag)} \u4E2D\u7EE7\u627F\u663E\u793A`).setIcon("eye-off").onClick(() => this.excludeInheritedFile(inheritanceRootTag, path, true).catch((error) => {
        console.error("[Puffs Tag Enhance] Failed to exclude inherited note:", error);
        new import_obsidian11.Notice("\u6392\u9664\u7EE7\u627F\u7B14\u8BB0\u5931\u8D25");
      })));
    }
    const aliases = tag && !isNestedTag(tag) ? this.getNoteAliases(file) : [];
    if (aliases.length > 0) {
      menu.addItem((item) => item.setTitle("\u66F4\u6362\u663E\u793A\u540D\u79F0").setIcon("text-cursor-input").onClick(() => {
        const position = { x: event.clientX, y: event.clientY };
        window.setTimeout(() => this.showNoteDisplayNameOptions(position, tag, file, aliases), 0);
      }));
    }
    if (inherited || aliases.length > 0) menu.addSeparator();
    menu.addItem((item) => item.setTitle("\u6DFB\u52A0\u7236\u7B14\u8BB0").setIcon("corner-left-up").onClick(() => {
      new NoteRelationModal(this.app, this, path, "parent").open();
    }));
    menu.addItem((item) => item.setTitle("\u6DFB\u52A0\u5B50\u7B14\u8BB0").setIcon("user-round-plus").onClick(() => {
      new NoteRelationModal(this.app, this, path, "child").open();
    }));
    if (this.getHierarchyParents(path).length > 0 || this.getHierarchyChildren(path).length > 0) {
      menu.addItem((item) => item.setTitle("\u5B9A\u4F4D\u7236\u5B50\u5173\u7CFB").setIcon("locate-fixed").onClick(() => {
        this.openHierarchyForNote(path, cardEl);
      }));
    }
    menu.showAtMouseEvent(event);
    return true;
  }
  getInheritanceChildren(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return [];
    return [...this.getTagInheritanceSettings().childrenByParent[tag] || []].sort((left, right) => this.compareTagsByVisibleCount(left, right));
  }
  getTagVisibleNoteCount(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return 0;
    const paths = new Set((this.tagFileIndex.get(tag) || []).map((file) => file.path));
    if (!this.isTagInheritanceEnabled(tag)) return paths.size;
    const excluded = new Set(this.getTagInheritanceSettings().excludedPathsByParent[tag] || []);
    const adjacency = this.getTagInheritanceSettings().childrenByParent;
    for (const descendant of collectDirectedDescendants(adjacency, tag)) {
      for (const file of this.tagFileIndex.get(descendant) || []) {
        if (!excluded.has(file.path)) paths.add(file.path);
      }
    }
    return paths.size;
  }
  compareTagsByVisibleCount(leftValue, rightValue) {
    const left = normalizeTag(leftValue) || "";
    const right = normalizeTag(rightValue) || "";
    return compareTagItemsByCount(
      { count: this.getTagVisibleNoteCount(left), name: getTagDisplayName(left) },
      { count: this.getTagVisibleNoteCount(right), name: getTagDisplayName(right) }
    );
  }
  sortTagsByVisibleCount(tagValues) {
    return Array.from(new Set((tagValues || []).map(normalizeTag).filter(Boolean))).sort((left, right) => this.compareTagsByVisibleCount(left, right));
  }
  getSortedTagInheritanceAdjacency() {
    const result = {};
    for (const parent of Object.keys(this.getTagInheritanceSettings().childrenByParent)) {
      const children = this.getInheritanceChildren(parent);
      if (children.length) result[parent] = children;
    }
    return result;
  }
  getInheritanceParents(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return [];
    return Object.entries(this.getTagInheritanceSettings().childrenByParent).filter(([, children]) => Array.isArray(children) && children.includes(tag)).map(([parent]) => parent);
  }
  getLogicalTagSet() {
    const result = new Set(this.tagFileIndex.keys());
    for (const [parent, children] of Object.entries(this.getTagInheritanceSettings().childrenByParent)) {
      result.add(parent);
      for (const child of children) result.add(child);
    }
    return result;
  }
  hasInheritanceChildren(tagValue) {
    return this.getInheritanceChildren(tagValue).length > 0;
  }
  isTagInheritanceEnabled(tagValue) {
    const tag = normalizeTag(tagValue);
    return !!tag && this.getTagInheritanceSettings().enabledParents.includes(tag);
  }
  getTagDescendants(tagValue) {
    const root = normalizeTag(tagValue);
    if (!root) return [];
    return collectDirectedDescendants(this.getSortedTagInheritanceAdjacency(), root);
  }
  wouldCreateTagInheritanceCycle(parentValue, childValue) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child) return true;
    return wouldCreateDirectedCycle(this.getTagInheritanceSettings().childrenByParent, parent, child);
  }
  reconcileRelationCycles() {
    const inheritance = this.settings.relations && this.settings.relations.tagInheritance;
    if (!inheritance) return;
    inheritance.childrenByParent = sanitizeAcyclicAdjacency(inheritance.childrenByParent);
    const hierarchy = this.settings.relations.noteHierarchy;
    hierarchy.childrenByParentPath = sanitizeAcyclicAdjacency(hierarchy.childrenByParentPath);
    for (const parentPath of Object.keys(hierarchy.displayNamesByParentPath)) {
      const validChildren = new Set(hierarchy.childrenByParentPath[parentPath] || []);
      for (const childPath of Object.keys(hierarchy.displayNamesByParentPath[parentPath])) {
        if (!validChildren.has(childPath)) delete hierarchy.displayNamesByParentPath[parentPath][childPath];
      }
      if (!Object.keys(hierarchy.displayNamesByParentPath[parentPath]).length) {
        delete hierarchy.displayNamesByParentPath[parentPath];
      }
    }
  }
  async setInheritanceChildren(parentValue, childValues) {
    const parent = normalizeTag(parentValue);
    if (!parent || isNestedTag(parent)) throw new Error("\u7236\u6807\u7B7E\u65E0\u6548");
    const children = [];
    const seen = /* @__PURE__ */ new Set();
    for (const rawChild of childValues || []) {
      const child = normalizeTag(rawChild);
      if (!child || isNestedTag(child) || seen.has(child)) continue;
      if (this.wouldCreateTagInheritanceCycle(parent, child)) {
        throw new Error(`\u4E0D\u80FD\u5EFA\u7ACB\u5FAA\u73AF\u7EE7\u627F\uFF1A${getTagDisplayName(parent)} \u2192 ${getTagDisplayName(child)}`);
      }
      seen.add(child);
      children.push(child);
    }
    const inheritance = this.getTagInheritanceSettings();
    if (children.length > 0) inheritance.childrenByParent[parent] = children;
    else {
      delete inheritance.childrenByParent[parent];
      inheritance.enabledParents = inheritance.enabledParents.filter((tag) => tag !== parent);
      delete inheritance.excludedPathsByParent[parent];
    }
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }
  async addInheritanceParent(childValue, parentValue) {
    const child = normalizeTag(childValue);
    const parent = normalizeTag(parentValue);
    if (!child || !parent || isNestedTag(child) || isNestedTag(parent)) throw new Error("\u6807\u7B7E\u65E0\u6548");
    const children = this.getInheritanceChildren(parent);
    if (!children.includes(child)) children.push(child);
    await this.setInheritanceChildren(parent, children);
  }
  async toggleTagInheritance(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag || !this.hasInheritanceChildren(tag)) return;
    const inheritance = this.getTagInheritanceSettings();
    inheritance.enabledParents = inheritance.enabledParents.includes(tag) ? inheritance.enabledParents.filter((item) => item !== tag) : [...inheritance.enabledParents, tag];
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }
  getTagBrowseData(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return { tag: null, files: [], exactFiles: [], inheritedFiles: [], sourcesByPath: /* @__PURE__ */ new Map(), inheritanceTree: null };
    const exactFiles = this.getOrderedFilesForTag(tag, this.tagFileIndex.get(tag) || []);
    const exactPaths = exactFiles.map((file) => file.path);
    const orderedBranches = [];
    const orderedPathsByTag = { [tag]: exactPaths };
    const visit = (sourceTag, branch = /* @__PURE__ */ new Set([tag])) => {
      if (branch.has(sourceTag)) return;
      const nextBranch = new Set(branch);
      nextBranch.add(sourceTag);
      orderedBranches.push({
        source: sourceTag,
        paths: this.getOrderedFilesForTag(sourceTag, this.tagFileIndex.get(sourceTag) || []).map((file) => file.path)
      });
      orderedPathsByTag[sourceTag] = orderedBranches[orderedBranches.length - 1].paths;
      for (const child of this.getInheritanceChildren(sourceTag)) visit(child, nextBranch);
    };
    if (this.isTagInheritanceEnabled(tag)) {
      for (const child of this.getInheritanceChildren(tag)) visit(child);
    }
    const { inheritedPaths, sourcesByPath } = mergeInheritedPaths(
      exactPaths,
      orderedBranches,
      this.getTagInheritanceSettings().excludedPathsByParent[tag] || []
    );
    const inheritedFiles = inheritedPaths.map((path) => this.app.vault.getAbstractFileByPath(path)).filter((file) => file instanceof import_obsidian11.TFile && file.extension === "md");
    const inheritanceTree = this.isTagInheritanceEnabled(tag) ? buildTagInheritanceGroupTree(
      tag,
      this.getSortedTagInheritanceAdjacency(),
      orderedPathsByTag,
      this.getTagInheritanceSettings().excludedPathsByParent[tag] || []
    ) : null;
    return {
      tag,
      exactFiles,
      inheritedFiles,
      files: exactFiles.concat(inheritedFiles),
      sourcesByPath,
      inheritanceTree,
      exactCount: exactFiles.length,
      inheritedCount: inheritedFiles.length,
      inheritanceEnabled: this.isTagInheritanceEnabled(tag),
      hasInheritance: this.hasInheritanceChildren(tag)
    };
  }
  isInheritedFileForTag(tagValue, path) {
    return this.getTagBrowseData(tagValue).inheritedFiles.some((file) => file.path === path);
  }
  getInheritedFileSources(tagValue, path) {
    return this.getTagBrowseData(tagValue).sourcesByPath.get(path) || [];
  }
  async excludeInheritedFile(parentValue, path, allowGroupedInheritance = false) {
    const parent = normalizeTag(parentValue);
    if (!parent || !path || !allowGroupedInheritance && !this.isInheritedFileForTag(parent, path)) return;
    const inheritance = this.getTagInheritanceSettings();
    const paths = new Set(inheritance.excludedPathsByParent[parent] || []);
    paths.add(path);
    inheritance.excludedPathsByParent[parent] = Array.from(paths);
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }
  async restoreInheritedFile(parentValue, path) {
    const parent = normalizeTag(parentValue);
    if (!parent || !path) return;
    const inheritance = this.getTagInheritanceSettings();
    const nextPaths = (inheritance.excludedPathsByParent[parent] || []).filter((item) => item !== path);
    if (nextPaths.length > 0) inheritance.excludedPathsByParent[parent] = nextPaths;
    else delete inheritance.excludedPathsByParent[parent];
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }
  migrateTagRelations(oldTagValue, newTagValue) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);
    if (!oldTag || !newTag || oldTag === newTag) return;
    const inheritance = this.getTagInheritanceSettings();
    const oldChildren = inheritance.childrenByParent[oldTag] || [];
    const newChildren = inheritance.childrenByParent[newTag] || [];
    if (oldChildren.length || newChildren.length) {
      inheritance.childrenByParent[newTag] = Array.from(/* @__PURE__ */ new Set([...oldChildren, ...newChildren])).filter((child) => child !== newTag);
    }
    delete inheritance.childrenByParent[oldTag];
    for (const [parent, children] of Object.entries(inheritance.childrenByParent)) {
      inheritance.childrenByParent[parent] = Array.from(new Set(children.map((child) => child === oldTag ? newTag : child))).filter((child) => child !== parent);
    }
    if (inheritance.enabledParents.includes(oldTag)) inheritance.enabledParents.push(newTag);
    inheritance.enabledParents = Array.from(new Set(inheritance.enabledParents.filter((tag) => tag !== oldTag)));
    const exclusions = Array.from(/* @__PURE__ */ new Set([
      ...inheritance.excludedPathsByParent[oldTag] || [],
      ...inheritance.excludedPathsByParent[newTag] || []
    ]));
    if (exclusions.length > 0) inheritance.excludedPathsByParent[newTag] = exclusions;
    delete inheritance.excludedPathsByParent[oldTag];
    this.reconcileRelationCycles();
  }
  handleRelationFileRename(file, oldPath) {
    if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md" || !oldPath || !file.path) return;
    const inheritance = this.getTagInheritanceSettings();
    let changed = false;
    for (const [parent, paths] of Object.entries(inheritance.excludedPathsByParent)) {
      if (!paths.includes(oldPath)) continue;
      inheritance.excludedPathsByParent[parent] = Array.from(new Set(paths.map((path) => path === oldPath ? file.path : path)));
      changed = true;
    }
    const hierarchy = this.getNoteHierarchySettings();
    if (hierarchy.childrenByParentPath[oldPath]) {
      hierarchy.childrenByParentPath[file.path] = Array.from(/* @__PURE__ */ new Set([
        ...hierarchy.childrenByParentPath[file.path] || [],
        ...hierarchy.childrenByParentPath[oldPath]
      ])).filter((path) => path !== file.path);
      delete hierarchy.childrenByParentPath[oldPath];
      changed = true;
    }
    for (const [parentPath, paths] of Object.entries(hierarchy.childrenByParentPath)) {
      if (!paths.includes(oldPath)) continue;
      hierarchy.childrenByParentPath[parentPath] = Array.from(new Set(paths.map((path) => path === oldPath ? file.path : path))).filter((path) => path !== parentPath);
      changed = true;
    }
    if (hierarchy.displayNamesByParentPath[oldPath]) {
      hierarchy.displayNamesByParentPath[file.path] = {
        ...hierarchy.displayNamesByParentPath[oldPath] || {},
        ...hierarchy.displayNamesByParentPath[file.path] || {}
      };
      delete hierarchy.displayNamesByParentPath[oldPath];
      changed = true;
    }
    for (const [parentPath, entries] of Object.entries(hierarchy.displayNamesByParentPath)) {
      if (!entries[oldPath]) continue;
      if (!entries[file.path]) entries[file.path] = entries[oldPath];
      delete entries[oldPath];
      changed = true;
    }
    if (changed) this.saveSettings();
  }
  handleRelationFileDelete(file) {
    if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md" || !file.path) return;
    const inheritance = this.getTagInheritanceSettings();
    let changed = false;
    for (const [parent, paths] of Object.entries(inheritance.excludedPathsByParent)) {
      const nextPaths = paths.filter((path) => path !== file.path);
      if (nextPaths.length === paths.length) continue;
      if (nextPaths.length) inheritance.excludedPathsByParent[parent] = nextPaths;
      else delete inheritance.excludedPathsByParent[parent];
      changed = true;
    }
    const hierarchy = this.getNoteHierarchySettings();
    if (hierarchy.childrenByParentPath[file.path]) {
      delete hierarchy.childrenByParentPath[file.path];
      delete hierarchy.displayNamesByParentPath[file.path];
      changed = true;
    }
    for (const [parentPath, paths] of Object.entries(hierarchy.childrenByParentPath)) {
      const nextPaths = paths.filter((path) => path !== file.path);
      if (nextPaths.length === paths.length) continue;
      if (nextPaths.length) hierarchy.childrenByParentPath[parentPath] = nextPaths;
      else {
        delete hierarchy.childrenByParentPath[parentPath];
        delete hierarchy.displayNamesByParentPath[parentPath];
      }
      if (hierarchy.displayNamesByParentPath[parentPath]) {
        delete hierarchy.displayNamesByParentPath[parentPath][file.path];
      }
      changed = true;
    }
    if (changed) this.saveSettings();
  }
  getTagBoundNotePath(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag || !this.settings.tagBoundNoteByTag) return null;
    const path = this.settings.tagBoundNoteByTag[tag];
    if (typeof path !== "string" || !path) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof import_obsidian11.TFile && file.extension === "md" ? path : null;
  }
  getTagBoundNoteFile(tagValue) {
    const path = this.getTagBoundNotePath(tagValue);
    if (!path) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof import_obsidian11.TFile && file.extension === "md" ? file : null;
  }
  async setTagBoundNote(tagValue, pathValue) {
    const tag = normalizeTag(tagValue);
    if (!tag || !this.tagFileIndex.has(tag)) throw new Error("\u6807\u7B7E\u5DF2\u4E0D\u5B58\u5728");
    const path = typeof pathValue === "string" ? pathValue.trim() : "";
    if (!this.settings.tagBoundNoteByTag || typeof this.settings.tagBoundNoteByTag !== "object") {
      this.settings.tagBoundNoteByTag = {};
    }
    if (!path) {
      delete this.settings.tagBoundNoteByTag[tag];
      await this.saveSettings();
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md") throw new Error("\u6240\u9009\u7B14\u8BB0\u5DF2\u4E0D\u5B58\u5728");
    this.settings.tagBoundNoteByTag[tag] = file.path;
    await this.saveSettings();
  }
  migrateTagBoundNote(oldTagValue, newTagValue) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);
    const bindings = this.settings.tagBoundNoteByTag;
    if (!oldTag || !newTag || oldTag === newTag || !bindings || !bindings[oldTag]) return false;
    if (!bindings[newTag]) bindings[newTag] = bindings[oldTag];
    delete bindings[oldTag];
    return true;
  }
  reconcileTagBoundNotes(nextIndex) {
    const current = this.settings.tagBoundNoteByTag || {};
    const next = {};
    for (const [tag, path] of Object.entries(current)) {
      if (!nextIndex.has(tag)) continue;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md") continue;
      next[tag] = file.path;
    }
    const changed = JSON.stringify(next) !== JSON.stringify(current);
    if (changed) this.settings.tagBoundNoteByTag = next;
    return changed;
  }
  handleTagBoundNoteFileRename(file, oldPath) {
    if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md" || !oldPath || !file.path) return;
    const bindings = this.settings.tagBoundNoteByTag || {};
    let changed = false;
    for (const [tag, path] of Object.entries(bindings)) {
      if (path !== oldPath) continue;
      bindings[tag] = file.path;
      changed = true;
    }
    if (changed) this.saveSettings();
  }
  handleTagBoundNoteFileDelete(file) {
    if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md" || !file.path) return;
    const bindings = this.settings.tagBoundNoteByTag || {};
    let changed = false;
    for (const [tag, path] of Object.entries(bindings)) {
      if (path !== file.path) continue;
      delete bindings[tag];
      changed = true;
    }
    if (changed) this.saveSettings();
  }
  showTagContextMenu(event, tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return false;
    const menu = new import_obsidian11.Menu();
    menu.addItem((item) => item.setTitle("\u4FEE\u6539\u6807\u7B7E").setIcon("pencil").onClick(() => this.openRenameTagModal(tag)));
    menu.addItem((item) => item.setTitle("\u6DFB\u52A0\u7236\u6807\u7B7E").setIcon("corner-left-up").onClick(() => {
      new AddParentTagModal(this.app, this, tag).open();
    }));
    menu.addItem((item) => item.setTitle("\u7BA1\u7406\u5B50\u6807\u7B7E").setIcon("git-fork").onClick(() => {
      new TagInheritanceModal(this.app, this, tag).open();
    }));
    menu.addSeparator();
    const boundFile = this.getTagBoundNoteFile(tag);
    if (boundFile) {
      menu.addItem((item) => item.setTitle("\u6253\u5F00\u7B14\u8BB0").setIcon("file-text").onClick(() => {
        this.openFileInMainWorkspace(boundFile);
      }));
      menu.addItem((item) => item.setTitle("\u6362\u7ED1\u7B14\u8BB0").setIcon("replace").onClick(() => {
        new TagNoteBindingModal(this.app, this, tag).open();
      }));
    } else {
      menu.addItem((item) => item.setTitle("\u7ED1\u5B9A\u7B14\u8BB0").setIcon("link").onClick(() => {
        new TagNoteBindingModal(this.app, this, tag).open();
      }));
    }
    menu.showAtMouseEvent(event);
    return true;
  }
  showInheritedNoteMenu(event, tagValue, path) {
    const tag = normalizeTag(tagValue);
    if (!tag || !path || !this.isInheritedFileForTag(tag, path)) return false;
    const menu = new import_obsidian11.Menu();
    menu.addItem((item) => item.setTitle(`\u4E0D\u5728 ${getTagDisplayName(tag)} \u4E2D\u7EE7\u627F\u663E\u793A`).setIcon("eye-off").onClick(() => this.excludeInheritedFile(tag, path).catch((error) => {
      console.error("[Puffs Tag Enhance] Failed to exclude inherited note:", error);
      new import_obsidian11.Notice("\u6392\u9664\u7EE7\u627F\u7B14\u8BB0\u5931\u8D25");
    })));
    menu.showAtMouseEvent(event);
    return true;
  }
};

// src/main.ts
var PuffsTagEnhancePlugin = class extends import_obsidian12.Plugin {
  constructor(app, manifest) {
    super(app, manifest);
    this.settings = { ...DEFAULT_SETTINGS };
    this.tagFileIndex = /* @__PURE__ */ new Map();
    this.expandedTags = /* @__PURE__ */ new Set();
    this.collapsedInlineHierarchyBranches = /* @__PURE__ */ new Set();
    this.inlineHierarchyExpansionVersion = 0;
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
      id: "open-tag-shelf",
      name: "\u6253\u5F00\u6807\u7B7E\u7CFB\u7EDF",
      callback: () => this.openTagShelf()
    });
    this.addCommand({
      id: "toggle-tag-sidebar",
      name: "\u6253\u5F00\u6216\u6536\u8D77\u6807\u7B7E\u4FA7\u8FB9\u680F",
      callback: () => this.toggleTagSidebar()
    });
    await this.migrateTagSidebarHotkeys();
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
  TagPaneBehavior,
  RelationsBehavior
].forEach(applyBehavior);
var main_default = PuffsTagEnhancePlugin;
