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
var import_obsidian16 = require("obsidian");

// src/models.ts
var import_obsidian = require("obsidian");

// src/sidebar-toolbar.ts
var SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS = [
  { id: "expand-collapse", label: "\u5168\u90E8\u5C55\u5F00/\u6536\u8D77", visible: true },
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

// src/data/schema.ts
var CURRENT_SCHEMA_VERSION = 1;
var migrateToV1 = {
  version: 0,
  description: "\u6E05\u7406\u7EE7\u627F\u540D\u5355\u6B7B\u6570\u636E\u3001\u4FA7\u8FB9\u680F\u504F\u597D\u6539\u6570\u7EC4",
  migrate(data, { log }) {
    var _a;
    const inheritance = (_a = data == null ? void 0 : data.relations) == null ? void 0 : _a.tagInheritance;
    if (inheritance) {
      let removedEdges = 0;
      let removedPaths = 0;
      const isSelected = (parent, child) => {
        var _a2, _b;
        return ((_b = (_a2 = inheritance.modeByParentChild) == null ? void 0 : _a2[parent]) == null ? void 0 : _b[child]) === "selected";
      };
      const isFixed = (child) => {
        var _a2;
        return !!((_a2 = inheritance.fixedParentByChild) == null ? void 0 : _a2[child]);
      };
      for (const [key, keepWhenSelected] of [
        ["includedPathsByParentChild", true],
        ["excludedPathsByParentChild", false]
      ]) {
        const table = inheritance[key];
        if (!table || typeof table !== "object") continue;
        for (const [parent, children] of Object.entries(table)) {
          if (!children || typeof children !== "object") continue;
          for (const child of Object.keys(children)) {
            const useful = !isFixed(child) && isSelected(parent, child) === keepWhenSelected;
            if (useful) continue;
            const paths = children[child];
            removedPaths += Array.isArray(paths) ? paths.length : 0;
            removedEdges += 1;
            delete children[child];
          }
          if (Object.keys(children).length === 0) delete table[parent];
        }
      }
      if (removedEdges > 0) {
        log(`\u6E05\u7406\u7EE7\u627F\u540D\u5355\u6B7B\u6570\u636E\uFF1A${removedEdges} \u6761\u8FB9\u3001${removedPaths} \u6761\u8DEF\u5F84`);
      }
    }
    const preferred = data == null ? void 0 : data.tagSidebarPreferredFiles;
    if (preferred && !Array.isArray(preferred) && typeof preferred === "object") {
      const paths = Object.entries(preferred).filter(([, enabled]) => enabled === true).map(([path]) => path);
      data.tagSidebarPreferredFiles = paths;
      log(`\u4FA7\u8FB9\u680F\u504F\u597D\u6539\u4E3A\u6570\u7EC4\uFF1A${paths.length} \u6761`);
    }
  }
};
var MIGRATIONS = [migrateToV1];
function migrateSchema(data, log = () => {
}) {
  if (!data || typeof data !== "object") return false;
  const from = Number.isInteger(data.schemaVersion) ? data.schemaVersion : 0;
  if (from >= CURRENT_SCHEMA_VERSION) return false;
  for (const migration of MIGRATIONS) {
    if (migration.version < from) continue;
    migration.migrate(data, { log });
    log(`\u7ED3\u6784\u8FC1\u79FB v${migration.version} -> v${migration.version + 1}\uFF1A${migration.description}`);
  }
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  return true;
}
function readPreferredFiles(value) {
  if (Array.isArray(value)) return new Set(value.filter((path) => typeof path === "string" && path));
  if (value && typeof value === "object") {
    return new Set(
      Object.entries(value).filter(([path, enabled]) => path && enabled === true).map(([path]) => path)
    );
  }
  return /* @__PURE__ */ new Set();
}
function isDefaultNoteOrder(paths, files) {
  if (paths.length !== files.length) return false;
  const sorted = [...files].sort((a, b) => {
    const byName = a.basename.localeCompare(b.basename, "zh-Hans-CN");
    return byName || a.path.localeCompare(b.path, "zh-Hans-CN");
  });
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index].path !== paths[index]) return false;
  }
  return true;
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
function buildTagInheritanceGroupTree(rootTag, childrenByParent, orderedPathsByTag, excludedPaths = [], fixedTags = /* @__PURE__ */ new Set(), includedPaths = null, isPathVisible) {
  if (!rootTag) return null;
  const excluded = new Set(excludedPaths || []);
  const included = includedPaths === null ? null : new Set(includedPaths);
  const visit = (tag, branch, lineage, isRoot = false) => {
    if (!tag || branch.has(tag)) return null;
    const nextBranch = new Set(branch);
    nextBranch.add(tag);
    const paths = Array.from(new Set(orderedPathsByTag[tag] || [])).filter((path) => path && (isRoot || (isPathVisible ? isPathVisible(tag, path, lineage) : fixedTags.has(tag) || (included ? included.has(path) : !excluded.has(path)))));
    const children = (childrenByParent[tag] || []).map((child) => visit(child, nextBranch, [...lineage, child], false)).filter((child) => !!child && child.subtreePaths.length > 0);
    const subtreePaths = Array.from(/* @__PURE__ */ new Set([
      ...paths,
      ...children.flatMap((child) => child.subtreePaths)
    ]));
    return { tag, paths, children, subtreePaths };
  };
  return visit(rootTag, /* @__PURE__ */ new Set(), [rootTag], true);
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

// src/core/tag-name.ts
function normalizeTag(rawTag) {
  if (!rawTag) return null;
  const tag = String(rawTag).trim();
  if (!tag) return null;
  return tag.startsWith("#") ? tag : `#${tag}`;
}
function getTagDisplayName(tag) {
  return String(tag || "").replace(/^#/, "");
}
function isNestedTag(tag) {
  return String(tag || "").includes("/");
}

// src/core/syntax.ts
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
function parseCurrentNoteTagSearch(value) {
  const text = String(value || "").trim();
  return { matched: text === "\uFF1A\uFF1A" || text === "::" };
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

// src/models.ts
var TAG_VIEW_TYPE = "tag";
var TAG_SHELF_VIEW_TYPE = "puffs-tag-shelf-view";
var TAG_SIDEBAR_VIEW_TYPE = "puffs-tag-sidebar";
var OUTLINE_VIEW_TYPE = "outline";
var MARKDOWN_VIEW_TYPE = "markdown";
var DEFAULT_QUICK_SEARCH_HOTKEY = "Ctrl + F";
var DEFAULT_MOVE_NOTE_UP_HOTKEY = "Alt + Shift + \u2191";
var DEFAULT_MOVE_NOTE_DOWN_HOTKEY = "Alt + Shift + \u2193";
var INITIAL_TAG_INDEX_REFRESH_DELAYS_MS = [0, 500, 1500, 3e3, 6e3];
var BACKUP_FILE_NAME = "tag-data.md";
var MAX_BACKUP_INTERVAL_MINUTES = Math.floor(2147483647 / 6e4);
var DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD = 10;
var NOTE_ORDER_LONG_PRESS_MS = 500;
var DEFAULT_SETTINGS = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  autoSwitchToOutlineEnabled: true,
  freezeSearchWhileComposing: true,
  tagSidebarPreferredFiles: [],
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
  // 一次性布局迁移标记：把核心插件的标签页换成自绘视图后置位
  sidebarLayoutMigrated: false,
  relations: {
    version: 6,
    tagInheritance: {
      childrenByParent: {},
      enabledParents: [],
      excludedPathsByParentChild: {},
      modeByParentChild: {},
      includedPathsByParentChild: {},
      fixedParentByChild: {}
    },
    noteHierarchy: {
      childrenByParentPath: {},
      displayNamesByParentPath: {}
    }
  }
};
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

// src/data/tag-store.ts
var TagBrowseCache = class {
  constructor() {
    this.entries = /* @__PURE__ */ new Map();
    this.hitCount = 0;
    this.missCount = 0;
  }
  /** 命中则直接返回，未命中才调用 compute 并记入缓存。 */
  resolve(tag, compute) {
    if (this.entries.has(tag)) {
      this.hitCount += 1;
      return this.entries.get(tag);
    }
    this.missCount += 1;
    const value = compute();
    this.entries.set(tag, value);
    return value;
  }
  invalidate() {
    this.entries.clear();
  }
  /** 单个标签失效，用于关系仅影响局部时的精确失效。 */
  invalidateTag(tag) {
    this.entries.delete(tag);
  }
  get stats() {
    return { hits: this.hitCount, misses: this.missCount, size: this.entries.size };
  }
  resetStats() {
    this.hitCount = 0;
    this.missCount = 0;
  }
};
var MetadataRefreshScheduler = class {
  constructor(run, delayMs = 150) {
    this.run = run;
    this.delayMs = delayMs;
    this.timer = null;
    this.pendingPaths = /* @__PURE__ */ new Set();
  }
  schedule(changedPath) {
    if (changedPath) this.pendingPaths.add(changedPath);
    if (this.timer !== null) return;
    this.timer = globalThis.setTimeout(() => {
      this.timer = null;
      const paths = Array.from(this.pendingPaths);
      this.pendingPaths.clear();
      this.run(paths);
    }, this.delayMs);
  }
  /** 立即执行挂起的刷新，用于需要同步结果的场合（如标签改名后）。 */
  flush() {
    if (this.timer === null) return;
    globalThis.clearTimeout(this.timer);
    this.timer = null;
    const paths = Array.from(this.pendingPaths);
    this.pendingPaths.clear();
    this.run(paths);
  }
  cancel() {
    if (this.timer !== null) globalThis.clearTimeout(this.timer);
    this.timer = null;
    this.pendingPaths.clear();
  }
  get hasPending() {
    return this.timer !== null;
  }
};
var RECONCILE_REMOVAL_LIMIT = 0.3;
var RECONCILE_GUARD_MIN_SAMPLE = 20;
function evaluateReconcileSafety(previousPathCount, nextPathCount, limit = RECONCILE_REMOVAL_LIMIT, minSample = RECONCILE_GUARD_MIN_SAMPLE) {
  const removedCount = Math.max(0, previousPathCount - nextPathCount);
  const removedRatio = previousPathCount > 0 ? removedCount / previousPathCount : 0;
  if (previousPathCount === 0) {
    return { safe: true, removedRatio: 0, removedCount, totalCount: previousPathCount, reason: "\u65E0\u65E2\u6709\u8BB0\u5F55" };
  }
  if (removedCount === 0) {
    return { safe: true, removedRatio, removedCount, totalCount: previousPathCount, reason: "\u6CA1\u6709\u8BB0\u5F55\u88AB\u6E05\u7406" };
  }
  if (previousPathCount < minSample) {
    return {
      safe: true,
      removedRatio,
      removedCount,
      totalCount: previousPathCount,
      reason: `\u8BB0\u5F55\u4EC5 ${previousPathCount} \u6761\uFF0C\u4F4E\u4E8E ${minSample} \u6761\u6837\u672C\u4E0B\u9650\uFF0C\u4E0D\u505A\u6BD4\u4F8B\u5224\u65AD`
    };
  }
  if (removedRatio > limit) {
    return {
      safe: false,
      removedRatio,
      removedCount,
      totalCount: previousPathCount,
      reason: `\u672C\u6B21\u5C06\u6E05\u7406 ${removedCount}/${previousPathCount} \u6761\u987A\u5E8F\u8BB0\u5F55\uFF08${(removedRatio * 100).toFixed(1)}%\uFF09\uFF0C\u8D85\u8FC7 ${(limit * 100).toFixed(0)}% \u9608\u503C\uFF0C\u5224\u5B9A\u4E3A\u5143\u6570\u636E\u7F13\u5B58\u672A\u5C31\u7EEA`
    };
  }
  return { safe: true, removedRatio, removedCount, totalCount: previousPathCount, reason: "\u6E05\u7406\u6BD4\u4F8B\u5728\u9608\u503C\u5185" };
}
function countOrderedPaths(orderByTag) {
  if (!orderByTag) return 0;
  let total = 0;
  for (const paths of Object.values(orderByTag)) {
    if (Array.isArray(paths)) total += paths.length;
  }
  return total;
}
function resolveMovedPaths(missingPaths, candidatePaths) {
  const result = /* @__PURE__ */ new Map();
  if (missingPaths.length === 0 || candidatePaths.length === 0) return result;
  const basename = (path) => {
    const file = path.split("/").pop() || path;
    return file.replace(/\.[^.]+$/, "");
  };
  const candidatesByName = /* @__PURE__ */ new Map();
  for (const path of candidatePaths) {
    const name = basename(path);
    const list = candidatesByName.get(name);
    if (list) list.push(path);
    else candidatesByName.set(name, [path]);
  }
  const claimed = /* @__PURE__ */ new Set();
  for (const missing of missingPaths) {
    const matches = candidatesByName.get(basename(missing));
    if (!matches || matches.length !== 1) continue;
    const target = matches[0];
    if (claimed.has(target)) continue;
    claimed.add(target);
    result.set(missing, target);
  }
  return result;
}

// src/view/tag-sidebar-view.ts
var import_obsidian2 = require("obsidian");

// src/core/search-modes.ts
var SEARCH_MODE_SPECS = [
  {
    id: "hierarchy",
    usesRawQuery: true,
    match: (query) => parseUnifiedHierarchySearch(query).matched
  },
  {
    id: "current-note-tags",
    usesRawQuery: true,
    match: (query) => parseCurrentNoteTagSearch(query).matched
  },
  {
    id: "note-card",
    usesRawQuery: false,
    match: (query) => {
      var _a;
      return ((_a = parseNoteCardSearch(query)) == null ? void 0 : _a.isValid) === true;
    }
  },
  {
    id: "tag-filter",
    usesRawQuery: false,
    match: (query) => {
      var _a;
      return ((_a = parseNoteCardSearch(query)) == null ? void 0 : _a.isTagOnly) === true;
    }
  },
  {
    id: "intersection",
    usesRawQuery: false,
    match: (query) => splitIntersectionSearchTerms(getTagFilterQuery(query)) !== null
  },
  {
    id: "union",
    usesRawQuery: false,
    match: (query) => splitUnionSearchTerms(getTagFilterQuery(query)) !== null
  }
];
function resolveSearch(rawQuery, resolvePinnedQuery = (query) => query) {
  const raw = String(rawQuery || "");
  for (const spec of SEARCH_MODE_SPECS) {
    if (!spec.usesRawQuery) continue;
    if (!spec.match(raw)) continue;
    return buildResult(spec.id, raw, raw);
  }
  const effective = resolvePinnedQuery(raw);
  for (const spec of SEARCH_MODE_SPECS) {
    if (spec.usesRawQuery) continue;
    if (!spec.match(effective)) continue;
    return buildResult(spec.id, raw, effective);
  }
  return buildResult("plain", raw, effective);
}
function buildResult(id, rawQuery, effectiveQuery) {
  var _a;
  const noteCard = parseNoteCardSearch(effectiveQuery);
  const tagQuery = id === "hierarchy" || id === "current-note-tags" ? effectiveQuery : getTagFilterQuery(effectiveQuery);
  const unionTerms = splitUnionSearchTerms(tagQuery);
  const intersectionTerms = splitIntersectionSearchTerms(tagQuery);
  return {
    id,
    rawQuery,
    effectiveQuery,
    tagQuery,
    noteQuery: id === "note-card" ? (_a = noteCard == null ? void 0 : noteCard.noteQuery) != null ? _a : "" : "",
    unionTerms,
    intersectionTerms,
    isMultiTag: id === "union" || id === "intersection"
  };
}

// src/view/reconcile.ts
function collectKeyedChildren(container) {
  var _a;
  const result = /* @__PURE__ */ new Map();
  for (const child of Array.from(container.children)) {
    const key = (_a = child.dataset) == null ? void 0 : _a.puffsRenderKey;
    if (key && !result.has(key)) result.set(key, child);
  }
  return result;
}
function markRenderKey(element, key) {
  element.dataset.puffsRenderKey = key;
  return element;
}
function reconcileOrder(current, orderedNodes) {
  const used = new Set(orderedNodes);
  let cursor = current.firstChild;
  for (const node of orderedNodes) {
    if (node === cursor) {
      cursor = cursor.nextSibling;
      continue;
    }
    current.insertBefore(node, cursor);
  }
  for (const child of Array.from(current.childNodes)) {
    if (!used.has(child)) child.remove();
  }
}
function supportsTextSelection(el) {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && ["text", "search", "tel", "url", "password"].includes(el.type);
}
function computeFocusPath(root, target) {
  const path = [];
  let node = target;
  while (node && node !== root) {
    const parent = node.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  return node === root ? path : null;
}
function resolveFocusPath(root, path) {
  let node = root;
  for (const index of path) {
    const child = node.children[index];
    if (!child) return null;
    node = child;
  }
  return node instanceof HTMLElement ? node : null;
}
function capturePreservedState(scrollEl, root) {
  const active = root.ownerDocument.activeElement;
  const owned = active instanceof HTMLElement && root.contains(active) ? active : null;
  return {
    scrollTop: scrollEl.scrollTop,
    scrollLeft: scrollEl.scrollLeft,
    focusPath: owned ? computeFocusPath(root, owned) : null,
    selection: owned && supportsTextSelection(owned) ? { start: owned.selectionStart, end: owned.selectionEnd } : null
  };
}
function restorePreservedState(scrollEl, root, state) {
  scrollEl.scrollTop = state.scrollTop;
  scrollEl.scrollLeft = state.scrollLeft;
  if (!state.focusPath) return;
  const active = root.ownerDocument.activeElement;
  if (active instanceof HTMLElement && root.contains(active)) return;
  const target = resolveFocusPath(root, state.focusPath);
  if (!target) return;
  target.focus({ preventScroll: true });
  if (state.selection && supportsTextSelection(target)) {
    target.setSelectionRange(state.selection.start, state.selection.end);
  }
}
function tagRowSignature(item, context) {
  var _a, _b, _c, _d;
  const files = item.files || [];
  const parts = [
    String((_a = item.tag) != null ? _a : ""),
    String((_b = item.displayName) != null ? _b : ""),
    item.isVirtual ? "1" : "0",
    String(files.length),
    String((_c = item.exactCount) != null ? _c : ""),
    String((_d = item.inheritedCount) != null ? _d : ""),
    item.inheritanceEnabled ? "1" : "0",
    item.hasInheritance ? "1" : "0",
    item.hasFreeInheritance ? "1" : "0",
    item.hasActiveInheritance ? "1" : "0",
    (item.fixedSearchTags || []).join(","),
    context.pinned ? "1" : "0",
    context.expanded ? "1" : "0",
    context.targetPath,
    String(context.inlineHierarchyVersion),
    String(context.relationVersion),
    // 展开时笔记列表参与签名；折叠时不关心，省去大量字符串拼接
    context.expanded ? files.map((file) => file.path).join("\n") : ""
  ];
  return parts.join("");
}

// src/view/tag-sidebar-view.ts
var TOOLBAR_BUTTONS = [
  { id: "expand-collapse", icon: "chevrons-up-down", label: "\u5168\u90E8\u5C55\u5F00" },
  { id: "scroll-bottom", icon: "arrow-down-to-line", label: "\u56DE\u5E95" },
  { id: "scroll-top", icon: "arrow-up-to-line", label: "\u56DE\u9876" },
  { id: "filter", icon: "search", label: "\u7B5B\u9009" }
];
var PuffsTagSidebarView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.searchQuery = "";
    this.isShowingSearch = false;
    this.isSearchComposing = false;
    this.noteCardSearchState = createNoteCardSearchState();
    this.hierarchyState = plugin.createHierarchySurfaceState();
    this.hierarchyNavigationHistory = createHierarchyNavigationHistory();
    this.hierarchySearchActive = false;
    this.autoExpandedTag = null;
    this.autoExpandedWasAlreadyExpanded = false;
    this.lastRenderedSearchQuery = "";
    this.searchComponent = null;
    this.listEl = null;
    this.hierarchyPageEl = null;
    this.tagContainerEl = null;
    this.toolbarButtonEls = /* @__PURE__ */ new Map();
    this.renderHandle = null;
    this.searchHotkeyRegistration = null;
    this.lastRowSignatures = /* @__PURE__ */ new Map();
    this.openRenderFallbackTimer = null;
  }
  getViewType() {
    return TAG_SIDEBAR_VIEW_TYPE;
  }
  getDisplayText() {
    return "\u6807\u7B7E";
  }
  getIcon() {
    return "tags";
  }
  async onOpen() {
    this.buildLayout();
    this.render();
    this.openRenderFallbackTimer = globalThis.setTimeout(() => {
      this.openRenderFallbackTimer = null;
      this.render();
    }, 0);
  }
  async onClose() {
    this.cancelPendingRender();
    if (this.openRenderFallbackTimer !== null) {
      globalThis.clearTimeout(this.openRenderFallbackTimer);
      this.openRenderFallbackTimer = null;
    }
    this.plugin.clearNoteCardSearchState(this.noteCardSearchState);
    this.hierarchyNavigationHistory = createHierarchyNavigationHistory();
    this.searchComponent = null;
    this.listEl = null;
    this.lastRowSignatures = /* @__PURE__ */ new Map();
  }
  // --- 外壳 ---------------------------------------------------------------
  buildLayout() {
    this.containerEl.classList.add("puffs-tag-list-mode-enabled");
    this.contentEl.empty();
    this.contentEl.classList.add("puffs-tag-sidebar-content");
    const navHeaderEl = this.contentEl.createDiv({ cls: "nav-header" });
    const navButtonsEl = navHeaderEl.createDiv({ cls: "nav-buttons-container" });
    this.navButtonsEl = navButtonsEl;
    this.buildToolbar(navButtonsEl);
    const searchHostEl = navHeaderEl.createDiv({ cls: "puffs-tag-sidebar-search-host" });
    this.buildSearch(searchHostEl);
    this.tagContainerEl = this.contentEl.createDiv({ cls: "tag-container node-insert-event" });
    this.listEl = this.tagContainerEl.createDiv({ cls: "puffs-tag-list-container" });
    this.registerDomEvents();
    this.registerSearchHotkey();
    this.syncSearchVisibility();
  }
  buildToolbar(hostEl) {
    this.toolbarButtonEls.clear();
    const settings = normalizeSidebarToolbarButtons(this.plugin.settings.sidebarToolbarButtons);
    const available = getAvailableSidebarToolbarButtons(
      settings,
      TOOLBAR_BUTTONS.map((item) => item.id)
    );
    for (const setting of available) {
      const definition = TOOLBAR_BUTTONS.find((item) => item.id === setting.id);
      if (!definition) continue;
      const buttonEl = hostEl.createDiv({
        cls: "clickable-icon nav-action-button",
        attr: { "aria-label": definition.label, "data-puffs-toolbar-button": definition.id }
      });
      (0, import_obsidian2.setIcon)(buttonEl, definition.icon);
      buttonEl.classList.toggle("puffs-toolbar-config-hidden", setting.visible === false);
      if (setting.visible === false) buttonEl.setAttribute("aria-hidden", "true");
      buttonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.handleToolbarClick(definition.id);
      });
      this.toolbarButtonEls.set(definition.id, buttonEl);
    }
  }
  buildSearch(hostEl) {
    this.searchComponent = new import_obsidian2.SearchComponent(hostEl);
    this.searchComponent.containerEl.classList.add("puffs-tag-sidebar-search-container");
    this.searchComponent.setPlaceholder("\u641C\u7D22\u6807\u7B7E");
    this.searchComponent.setValue(this.searchQuery);
    const inputEl = this.searchComponent.inputEl;
    inputEl.addEventListener("compositionstart", () => {
      this.isSearchComposing = this.plugin.settings.freezeSearchWhileComposing;
    });
    inputEl.addEventListener("compositionend", () => {
      this.isSearchComposing = false;
      this.applySearchValue(inputEl.value);
    });
    this.searchComponent.onChange((value) => {
      if (this.isSearchComposing) return;
      this.applySearchValue(value);
    });
    inputEl.addEventListener("keydown", (event) => {
      var _a, _b;
      if (event.key === "Escape") {
        event.preventDefault();
        this.toggleSearch();
        return;
      }
      if (event.key !== "Enter" || event.isComposing) return;
      if (this.hierarchySearchActive) {
        (_b = (_a = this.hierarchyState).handleSearchEnter) == null ? void 0 : _b.call(_a, event);
        return;
      }
      if (!this.plugin.advanceNoteCardSearchState(this.noteCardSearchState)) return;
      event.preventDefault();
      event.stopPropagation();
      this.render();
    });
  }
  registerSearchHotkey() {
    if (this.searchHotkeyRegistration) {
      this.scope.unregister(this.searchHotkeyRegistration);
      this.searchHotkeyRegistration = null;
    }
    const hotkey = this.plugin.getQuickSearchHotkey();
    this.searchHotkeyRegistration = this.scope.register(hotkey.modifiers, hotkey.key, (event) => {
      event.preventDefault();
      this.handleQuickSearchHotkey();
      return false;
    });
  }
  /**
   * 快捷键（默认 Ctrl+F）是聚焦优先，不是开关。
   *
   * 搜索框在样式上常驻可见（styles.css 里特异性高于 .puffs-tag-hidden），
   * 原先绑 toggleSearch 会让「焦点在列表里按一下」变成清空内容却不聚焦。
   * 收起搜索框仍由 Esc 和工具栏按钮负责。
   */
  handleQuickSearchHotkey() {
    var _a, _b, _c;
    const inputEl = (_a = this.searchComponent) == null ? void 0 : _a.inputEl;
    if (inputEl && inputEl.isConnected && ((_b = inputEl.ownerDocument) == null ? void 0 : _b.activeElement) === inputEl) {
      (_c = this.searchComponent) == null ? void 0 : _c.setValue("");
      this.applySearchValue("");
      return;
    }
    this.focusSearch();
  }
  registerDomEvents() {
    this.contentEl.addEventListener("click", (event) => this.handleClick(event), true);
    this.contentEl.addEventListener("contextmenu", (event) => this.handleContextMenu(event), true);
  }
  // --- 搜索 ---------------------------------------------------------------
  applySearchValue(value) {
    if (value === this.searchQuery) return;
    this.searchQuery = value;
    this.render();
    if (value.trim() && !value.includes("*")) {
      window.requestAnimationFrame(() => {
        var _a;
        if ((_a = this.tagContainerEl) == null ? void 0 : _a.isConnected) this.tagContainerEl.scrollTop = 0;
      });
    }
  }
  toggleSearch() {
    var _a;
    if (this.isShowingSearch) {
      (_a = this.searchComponent) == null ? void 0 : _a.setValue("");
      if (this.searchQuery !== "") {
        this.searchQuery = "";
        this.render();
      }
      this.isShowingSearch = false;
      this.syncSearchVisibility();
      return;
    }
    this.isShowingSearch = true;
    this.syncSearchVisibility();
    window.setTimeout(() => {
      var _a2, _b;
      return (_b = (_a2 = this.searchComponent) == null ? void 0 : _a2.inputEl) == null ? void 0 : _b.focus();
    }, 0);
  }
  focusSearch() {
    var _a;
    if (!this.isShowingSearch) {
      this.isShowingSearch = true;
      this.syncSearchVisibility();
    }
    const inputEl = (_a = this.searchComponent) == null ? void 0 : _a.inputEl;
    if (!(inputEl == null ? void 0 : inputEl.isConnected)) return;
    try {
      inputEl.focus({ preventScroll: true });
    } catch (error) {
      inputEl.focus();
    }
  }
  syncSearchVisibility() {
    var _a;
    const containerEl = (_a = this.searchComponent) == null ? void 0 : _a.containerEl;
    if (!containerEl) return;
    containerEl.classList.toggle("puffs-tag-hidden", !this.isShowingSearch && !this.hierarchySearchActive);
  }
  /** 当前搜索框里的内容，供 plugin 侧的通用逻辑取用。 */
  getSearchValue() {
    return this.searchQuery;
  }
  isActiveView() {
    return this.app.workspace.activeLeaf === this.leaf || !!this.containerEl.closest(".workspace-leaf.mod-active") || this.contentEl.contains(document.activeElement);
  }
  // --- 重绘 ---------------------------------------------------------------
  /** 供既有渲染方法的 rerender 回调调用（见 tag-pane.ts 的 scheduleSyncView）。 */
  requestRender() {
    if (this.renderHandle !== null) return;
    this.renderHandle = window.requestAnimationFrame(() => {
      this.renderHandle = null;
      this.render();
    });
  }
  cancelPendingRender() {
    if (this.renderHandle === null) return;
    window.cancelAnimationFrame(this.renderHandle);
    this.renderHandle = null;
  }
  refresh() {
    this.render();
  }
  render() {
    var _a;
    if (!this.listEl) return;
    const plugin = this.plugin;
    const resolved = resolveSearch(this.searchQuery, (query) => plugin.resolvePinnedSearchQuery(query));
    if (resolved.id === "hierarchy") {
      this.renderHierarchyPage();
      return;
    }
    this.hideHierarchyPage();
    const items = this.collectItems(resolved);
    this.syncSearchState(resolved, items);
    plugin.clearStaleVirtualExpandedTags(new Set(items.matching.map((item) => item.tag)));
    const preserved = capturePreservedState(this.tagContainerEl, this.listEl);
    this.renderTagRows(items.display, resolved);
    plugin.scheduleNoteCardSearchEffect(
      this.listEl,
      (_a = this.searchComponent) == null ? void 0 : _a.inputEl,
      this.noteCardSearchState
    );
    this.updateToolbarState(items.display, items.matching);
    plugin.scheduleTagOrderModeVisibilityReconcile();
    const shouldResetScroll = this.searchQuery !== this.lastRenderedSearchQuery && this.searchQuery.trim() && !this.searchQuery.includes("*");
    this.lastRenderedSearchQuery = this.searchQuery;
    restorePreservedState(this.tagContainerEl, this.listEl, preserved);
    if (shouldResetScroll) this.tagContainerEl.scrollTop = 0;
  }
  /**
   * 增量重绘标签列表。
   *
   * 逐行比对签名：未变的整棵子树直接复用（连 next 节点都不构建），变了的才重新渲染，
   * 最后按顺序对账。150 个标签里通常只有 1–2 个展开，绝大多数行每次都命中复用，
   * 因此展开态、焦点、文本选区都不会被刷新打断。
   */
  renderTagRows(displayItems, resolved) {
    var _a, _b, _c, _d;
    const plugin = this.plugin;
    if (displayItems.length === 0) {
      this.listEl.empty();
      this.lastRowSignatures = /* @__PURE__ */ new Map();
      this.listEl.createDiv({
        cls: "puffs-tag-list-empty",
        text: this.emptyMessageFor(resolved)
      });
      return;
    }
    const existingRows = collectKeyedChildren(this.listEl);
    const nextSignatures = /* @__PURE__ */ new Map();
    const targetPath = ((_b = (_a = this.noteCardSearchState) == null ? void 0 : _a.target) == null ? void 0 : _b.path) || "";
    const stagingEl = this.listEl.ownerDocument.createElement("div");
    const orderedNodes = [];
    for (const item of displayItems) {
      const key = String(item.tag);
      const signature = tagRowSignature(item, {
        expanded: plugin.expandedTags.has(item.tag),
        pinned: plugin.settings.pinnedTag === item.tag,
        targetPath: ((_d = (_c = this.noteCardSearchState) == null ? void 0 : _c.target) == null ? void 0 : _d.tag) === item.tag ? targetPath : "",
        inlineHierarchyVersion: plugin.inlineHierarchyExpansionVersion || 0,
        relationVersion: plugin.relationStructureVersion || 0
      });
      nextSignatures.set(key, signature);
      const reusable = existingRows.get(key);
      if (reusable && this.lastRowSignatures.get(key) === signature) {
        orderedNodes.push(reusable);
        continue;
      }
      plugin.renderListModeTagItem(stagingEl, item, this, this);
      const rendered = stagingEl.lastElementChild;
      if (rendered) {
        markRenderKey(rendered, key);
        orderedNodes.push(rendered);
      }
    }
    reconcileOrder(this.listEl, orderedNodes);
    this.lastRowSignatures = nextSignatures;
  }
  collectItems(resolved) {
    const plugin = this.plugin;
    if (resolved.id === "current-note-tags") {
      const matching2 = plugin.getCurrentNoteTagItems();
      return { matching: matching2, display: matching2 };
    }
    const matching = plugin.getListModeItems(this, resolved.effectiveQuery, false);
    return { matching, display: plugin.prependPinnedTagItem(matching, resolved.rawQuery) };
  }
  syncSearchState(resolved, items) {
    const plugin = this.plugin;
    if (resolved.id === "current-note-tags") {
      this.clearAutoExpandedTag();
      plugin.syncCurrentNoteTagSearchState(this.noteCardSearchState, items.matching);
      return;
    }
    if (resolved.id === "note-card") {
      this.clearAutoExpandedTag();
      plugin.syncNoteCardSearchState(this.noteCardSearchState, resolved.effectiveQuery, items.matching);
      return;
    }
    plugin.clearNoteCardSearchState(this.noteCardSearchState);
    if (resolved.id === "note-card") return;
    const autoExpandItems = plugin.settings.pinnedTag && !resolved.effectiveQuery.trim() ? items.display : items.matching;
    this.syncAutoSingleSearchResult(resolved.tagQuery, autoExpandItems);
  }
  syncAutoSingleSearchResult(query, items) {
    const plugin = this.plugin;
    const trimmed = String(query || "").trim();
    if (!trimmed && !plugin.isPinnedOnlyTagResult(query, items) || items.length !== 1) {
      this.clearAutoExpandedTag();
      return;
    }
    const tag = items[0].tag;
    if (this.autoExpandedTag === tag) return;
    this.clearAutoExpandedTag();
    this.autoExpandedTag = tag;
    this.autoExpandedWasAlreadyExpanded = plugin.expandedTags.has(tag);
    plugin.expandedTags.add(tag);
  }
  clearAutoExpandedTag() {
    if (!this.autoExpandedTag) return;
    if (!this.autoExpandedWasAlreadyExpanded) {
      this.plugin.expandedTags.delete(this.autoExpandedTag);
      this.plugin.clearInlineHierarchyBranchState(this.autoExpandedTag);
    }
    this.autoExpandedTag = null;
    this.autoExpandedWasAlreadyExpanded = false;
  }
  emptyMessageFor(resolved) {
    if (resolved.id === "current-note-tags") return this.plugin.getCurrentNoteTagEmptyMessage();
    return this.searchQuery.trim() ? "\u6CA1\u6709\u5339\u914D\u7684\u6807\u7B7E\u3002" : "\u6682\u65E0\u53EF\u5C55\u793A\u7684\u6807\u7B7E\u3002";
  }
  // --- 父子层级页面 -------------------------------------------------------
  renderHierarchyPage() {
    var _a, _b;
    const plugin = this.plugin;
    const context = plugin.getHierarchySearchContext(this.searchQuery);
    if (!this.hierarchySearchActive) this.hierarchyState.groupExpanded = true;
    this.hierarchySearchActive = true;
    this.hierarchyState.query = context.query;
    this.hierarchyState.currentNotePath = context.currentNotePath;
    this.containerEl.classList.add("puffs-note-hierarchy-mode");
    this.listEl.classList.add("puffs-tag-hidden");
    if (!((_a = this.hierarchyPageEl) == null ? void 0 : _a.isConnected)) {
      this.hierarchyPageEl = this.tagContainerEl.createDiv({
        cls: "puffs-tag-list-container puffs-note-hierarchy-sidebar"
      });
    }
    this.hierarchyPageEl.classList.remove("puffs-tag-hidden");
    plugin.renderHierarchySearchItem(this.hierarchyPageEl, this.hierarchyState, { surface: "sidebar" });
    this.hierarchyState.inputEl = (_b = this.searchComponent) == null ? void 0 : _b.inputEl;
    this.updateHierarchyToolbarState();
    this.syncSearchVisibility();
  }
  hideHierarchyPage() {
    var _a, _b;
    if (!this.hierarchySearchActive && !this.hierarchyPageEl) return;
    this.hierarchySearchActive = false;
    this.containerEl.classList.remove("puffs-note-hierarchy-mode");
    (_a = this.hierarchyPageEl) == null ? void 0 : _a.classList.add("puffs-tag-hidden");
    (_b = this.listEl) == null ? void 0 : _b.classList.remove("puffs-tag-hidden");
    this.syncSearchVisibility();
  }
  exitHierarchySearch() {
    var _a;
    if (!this.hierarchySearchActive) return false;
    (_a = this.searchComponent) == null ? void 0 : _a.setValue("");
    this.searchQuery = "";
    this.render();
    return true;
  }
  // --- 顶栏 ---------------------------------------------------------------
  handleToolbarClick(id) {
    if (id === "expand-collapse") {
      if (this.hierarchySearchActive) {
        this.plugin.toggleAllHierarchyItems(this.hierarchyState);
        this.updateHierarchyToolbarState();
      } else {
        this.toggleAllTags();
      }
      return;
    }
    if (id === "scroll-bottom") {
      this.tagContainerEl.scrollTop = this.tagContainerEl.scrollHeight;
      return;
    }
    if (id === "scroll-top") {
      this.tagContainerEl.scrollTop = 0;
      return;
    }
    if (id === "filter") this.toggleSearch();
  }
  toggleAllTags() {
    const plugin = this.plugin;
    const resolved = resolveSearch(this.searchQuery, (query) => plugin.resolvePinnedSearchQuery(query));
    const matching = resolved.id === "current-note-tags" ? plugin.getCurrentNoteTagItems() : plugin.getListModeItems(this, resolved.effectiveQuery, false);
    const display = resolved.id === "current-note-tags" ? matching : plugin.prependPinnedTagItem(matching, resolved.rawQuery);
    if (display.length === 0) return;
    const inheritanceControl = plugin.getUniqueSearchInheritanceControl(
      display,
      this.searchQuery,
      plugin.expandedTags,
      matching
    );
    if (inheritanceControl) {
      for (const tag of inheritanceControl.tags) plugin.expandedTags.add(tag);
      plugin.setAllTagInheritanceGroupsExpanded(inheritanceControl.keys, inheritanceControl.shouldExpand);
      plugin.refreshAllTagViews();
      return;
    }
    const shouldExpand = this.searchQuery.trim() ? display.some((item) => !plugin.expandedTags.has(item.tag)) : !display.some((item) => plugin.expandedTags.has(item.tag));
    for (const item of display) {
      if (shouldExpand) plugin.expandedTags.add(item.tag);
      else {
        plugin.expandedTags.delete(item.tag);
        plugin.clearInlineHierarchyBranchState(item.tag);
      }
    }
    this.render();
  }
  updateToolbarState(display, matching) {
    const buttonEl = this.toolbarButtonEls.get("expand-collapse");
    if (!buttonEl) return;
    const plugin = this.plugin;
    const inheritanceControl = plugin.getUniqueSearchInheritanceControl(
      display,
      this.searchQuery,
      plugin.expandedTags,
      matching
    );
    const shouldExpand = inheritanceControl ? inheritanceControl.shouldExpand : this.searchQuery.trim() ? display.some((item) => !plugin.expandedTags.has(item.tag)) : !display.some((item) => plugin.expandedTags.has(item.tag));
    (0, import_obsidian2.setIcon)(buttonEl, shouldExpand ? "chevrons-up-down" : "chevrons-down-up");
    buttonEl.setAttribute("aria-label", shouldExpand ? "\u5168\u90E8\u5C55\u5F00" : "\u5168\u90E8\u6536\u8D77");
    this.setToolbarContextHidden(false);
  }
  updateHierarchyToolbarState() {
    const buttonEl = this.toolbarButtonEls.get("expand-collapse");
    if (buttonEl) {
      const allExpanded = this.hierarchyState.allExpanded;
      (0, import_obsidian2.setIcon)(buttonEl, allExpanded ? "chevrons-down-up" : "chevrons-up-down");
      buttonEl.setAttribute("aria-label", allExpanded ? "\u5168\u90E8\u6536\u8D77" : "\u5168\u90E8\u5C55\u5F00");
    }
    this.setToolbarContextHidden(true);
  }
  /** 父子层级页面只保留展开收起与回顶回底，其余按钮临时隐藏。 */
  setToolbarContextHidden(hierarchyMode) {
    const keepIds = ["expand-collapse", "scroll-bottom", "scroll-top"];
    for (const [id, buttonEl] of this.toolbarButtonEls) {
      const hidden = hierarchyMode && !keepIds.includes(id);
      buttonEl.classList.toggle("puffs-toolbar-context-hidden", hidden);
      if (hidden) buttonEl.setAttribute("aria-hidden", "true");
      else if (!buttonEl.classList.contains("puffs-toolbar-config-hidden")) {
        buttonEl.removeAttribute("aria-hidden");
      }
    }
  }
  /** 设置里调整了顶栏按钮的顺序或显隐后重建顶栏。 */
  rebuildToolbar() {
    if (!this.navButtonsEl) return;
    this.navButtonsEl.empty();
    this.buildToolbar(this.navButtonsEl);
    this.render();
  }
  // --- 事件委托 -----------------------------------------------------------
  handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !this.listEl) return;
    if (target.closest(".nav-buttons-container") || target.closest(".puffs-tag-sidebar-search-host")) return;
    const plugin = this.plugin;
    const stop = () => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const inlineToggleEl = target.closest(".puffs-inline-hierarchy-toggle");
    if (inlineToggleEl) {
      stop();
      plugin.toggleInlineHierarchyBranch(inlineToggleEl.dataset.puffsInlineHierarchyBranchKey);
      plugin.refreshAllTagViews();
      return;
    }
    if (target.closest(".puffs-note-hierarchy-child-card .collapse-icon")) return;
    const pinButtonEl = target.closest(".puffs-tag-pin-button");
    if (pinButtonEl) {
      stop();
      plugin.togglePinnedTag(pinButtonEl.dataset.puffsTag).catch((error) => {
        console.error("[Puffs Tag Enhance] Failed to toggle pinned tag:", error);
      });
      return;
    }
    const inheritanceButtonEl = target.closest(".puffs-tag-inheritance-button");
    if (inheritanceButtonEl) {
      stop();
      plugin.toggleTagInheritance(inheritanceButtonEl.dataset.puffsTag).catch((error) => {
        console.error("[Puffs Tag Enhance] Failed to toggle tag inheritance:", error);
      });
      return;
    }
    const scrollBottomEl = target.closest(".puffs-tag-scroll-bottom-button");
    if (scrollBottomEl) {
      stop();
      plugin.scheduleLastNoteCardScroll(this.listEl, scrollBottomEl.dataset.puffsTag);
      return;
    }
    const scrollTopEl = target.closest(".puffs-tag-scroll-top-button");
    if (scrollTopEl) {
      stop();
      plugin.scheduleTagTopScroll(this.listEl, scrollTopEl.dataset.puffsTag);
      return;
    }
    const orderButtonEl = target.closest(".puffs-tag-note-order-button");
    if (orderButtonEl) {
      if (orderButtonEl.classList.contains("puffs-note-parent-control-button")) return;
      stop();
      if (orderButtonEl.dataset.puffsHierarchyParent) {
        plugin.toggleHierarchyNoteOrderTarget(
          orderButtonEl.dataset.puffsHierarchyParent,
          orderButtonEl.dataset.path,
          "sidebar"
        );
      } else {
        plugin.toggleNoteOrderTarget(orderButtonEl.dataset.puffsTag, orderButtonEl.dataset.path, "sidebar");
      }
      return;
    }
    if (target.closest(".puffs-tag-order-parent-button")) return;
    const noteCardEl = target.closest(".puffs-tag-note-card");
    if (noteCardEl) {
      stop();
      plugin.openNoteCard(noteCardEl);
      return;
    }
    const tagEl = target.closest(".tag-pane-tag[data-puffs-tag]");
    if (!tagEl) return;
    stop();
    if (plugin.isTagOrderModeActive(tagEl.dataset.puffsTag)) plugin.exitTagOrderMode(false);
    plugin.toggleTagExpansion(tagEl.dataset.puffsTag, this);
  }
  handleContextMenu(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const noteCardEl = target.closest(".puffs-tag-note-card");
    if (noteCardEl) {
      if (!this.plugin.showNoteCardContextMenu(event, noteCardEl)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    const tagEl = target.closest(".tag-pane-tag");
    if (!tagEl || tagEl.dataset.puffsVirtualTag === "true") return;
    const tag = this.plugin.findTagForElement(this, tagEl);
    if (!tag) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.plugin.showTagContextMenu(event, tag);
  }
};

// src/view/sidebar-registry.ts
var import_obsidian3 = require("obsidian");
var TOGGLE_RIGHT_SIDEBAR_COMMAND_ID = "app:toggle-right-sidebar";
var SidebarRegistryBehavior = class {
  /**
   * 所有在场的自绘侧边栏视图。
   *
   * 直接向 workspace 查询而不维护注册表：视图实例的生命周期由 Obsidian 管理，
   * 插件重载时旧实例会把自己注册到已失效的 plugin 对象上，注册表随即失准
   * （实测重载后注册表为空、刷新广播找不到视图）。查询没有这个时序问题。
   */
  getSidebarViews() {
    return (this.app.workspace.getLeavesOfType(TAG_SIDEBAR_VIEW_TYPE) || []).map((leaf) => leaf.view).filter((view) => view && typeof view.requestRender === "function");
  }
  /** 统一的刷新入口，取代原先 refreshTagViews + refreshTagShelfViews 的双份广播。 */
  refreshAllTagViews() {
    for (const view of this.getSidebarViews()) {
      view.requestRender();
    }
  }
  /** 设置里改了快捷键或顶栏按钮后，让在场的视图重新装配。 */
  refreshSidebarHotkeys() {
    for (const view of this.getSidebarViews()) {
      view.registerSearchHotkey();
      view.rebuildToolbar();
    }
  }
  /** 取当前可见的自绘侧边栏，找不到则返回 null。 */
  getVisibleSidebarView() {
    return this.getSidebarViews().find((view) => {
      var _a, _b;
      const leaf = view.leaf;
      if (leaf && typeof leaf.isVisible === "function") return leaf.isVisible();
      return !!((_b = (_a = view.containerEl) == null ? void 0 : _a.isShown) == null ? void 0 : _b.call(_a));
    }) || null;
  }
  getFocusedSidebarView() {
    return this.getSidebarViews().find((view) => view.isActiveView()) || null;
  }
  /**
   * 打开、聚焦或收起标签侧边栏。
   *
   * 原实现依赖核心插件的 `tag-pane:open` 命令，并在核心插件未启用时弹提示。
   * 现在完全走自有视图，与核心插件无关。
   */
  async toggleTagSidebar() {
    const view = this.getVisibleSidebarView();
    if (view) {
      if (view.exitHierarchySearch()) {
        await this.focusSidebarView(view);
        return;
      }
      if (!view.isActiveView()) {
        await this.focusSidebarView(view);
        return;
      }
      await this.app.commands.executeCommandById(TOGGLE_RIGHT_SIDEBAR_COMMAND_ID);
      return;
    }
    await this.openTagSidebar();
  }
  async openTagSidebar(reveal = true) {
    let leaf = this.app.workspace.getLeavesOfType(TAG_SIDEBAR_VIEW_TYPE)[0] || null;
    if (!leaf) {
      leaf = this.findManagedSidebarTabGroup() && typeof this.app.workspace.createLeafInTabGroup === "function" ? this.app.workspace.createLeafInTabGroup(this.findManagedSidebarTabGroup()) : this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        new import_obsidian3.Notice("\u65E0\u6CD5\u6253\u5F00\u6807\u7B7E\u4FA7\u8FB9\u680F");
        return null;
      }
      await leaf.setViewState({ type: TAG_SIDEBAR_VIEW_TYPE, active: false });
    }
    if (reveal) await this.focusSidebarView(null, leaf);
    return leaf;
  }
  /**
   * 显示并聚焦侧边栏。
   *
   * 必须先 loadIfDeferred：Obsidian 1.7 起侧边栏视图默认是延迟视图，
   * leaf.view 只是占位对象、onOpen 不会执行。不显式加载就会打开一个空面板
   * （实测新建 leaf 后 render 一次都没被调用）。
   */
  async focusSidebarView(view, leaf = view == null ? void 0 : view.leaf) {
    var _a, _b;
    if (!leaf) return;
    if (typeof leaf.loadIfDeferred === "function") await leaf.loadIfDeferred();
    if (this.app.workspace.revealLeaf) await this.app.workspace.revealLeaf(leaf);
    if (this.app.workspace.setActiveLeaf) this.app.workspace.setActiveLeaf(leaf, { focus: true });
    (_b = (_a = view || leaf.view) == null ? void 0 : _a.focusSearch) == null ? void 0 : _b.call(_a);
  }
  /**
   * 一次性布局迁移：把右侧栏里核心插件的标签页换成自绘视图。
   *
   * 就地替换而非新建，这样侧边栏位置、与大纲相邻的标签页顺序都保持原样。
   */
  async migrateSidebarLayout() {
    this.app.workspace.detachLeavesOfType(TAG_SHELF_VIEW_TYPE);
    if (this.settings.sidebarLayoutMigrated) return false;
    const legacyLeaves = (this.app.workspace.getLeavesOfType(TAG_VIEW_TYPE) || []).filter((leaf) => this.isManagedSidebarLeaf(leaf));
    for (const leaf of legacyLeaves) {
      await leaf.setViewState({ type: TAG_SIDEBAR_VIEW_TYPE, active: false });
    }
    await this.updateSettings({ sidebarLayoutMigrated: true });
    if (legacyLeaves.length > 0) {
      console.log(`[Puffs Tag Enhance] \u5DF2\u5C06 ${legacyLeaves.length} \u4E2A\u6807\u7B7E\u4FA7\u8FB9\u680F\u8FC1\u79FB\u4E3A\u81EA\u7ED8\u89C6\u56FE`);
    }
    return legacyLeaves.length > 0;
  }
  /** 自绘侧边栏所在的标签页组，供自动切换与新建时定位。 */
  findSidebarLeaf() {
    return this.app.workspace.getLeavesOfType(TAG_SIDEBAR_VIEW_TYPE).find((leaf) => this.isManagedSidebarLeaf(leaf)) || null;
  }
  /** 大纲核心插件可能被禁用，此时优雅降级、不报错。 */
  hasOutlineView() {
    var _a, _b, _c;
    return (this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE) || []).length > 0 || !!((_c = (_b = (_a = this.app.internalPlugins) == null ? void 0 : _a.getPluginById) == null ? void 0 : _b.call(_a, "outline")) == null ? void 0 : _c.enabled);
  }
};

// src/view/tag-tree-renderer.ts
var import_obsidian5 = require("obsidian");

// src/relation-modals.ts
var import_obsidian4 = require("obsidian");
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
    if (!(file instanceof import_obsidian4.TFile) || file.extension !== "md") return null;
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
function filterInheritanceCandidates(candidates, query, getAliases = () => []) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return [...candidates || []];
  return (candidates || []).filter((candidate) => {
    const file = candidate.file;
    return String(candidate.path || "").toLowerCase().includes(term) || String((file == null ? void 0 : file.basename) || "").toLowerCase().includes(term) || file instanceof import_obsidian4.TFile && (getAliases(file) || []).some((alias) => String(alias).toLowerCase().includes(term));
  });
}
function groupInheritanceCandidates(candidates) {
  const groups = [];
  const groupsBySource = /* @__PURE__ */ new Map();
  for (const candidate of candidates || []) {
    const source = normalizeTag(candidate.source) || null;
    let group = groupsBySource.get(source);
    if (!group) {
      group = { source, candidates: [] };
      groupsBySource.set(source, group);
      groups.push(group);
    }
    group.candidates.push(candidate);
  }
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
var RemoveTagRelationConfirmModal = class extends import_obsidian4.Modal {
  constructor(app, subjectTag, relatedTag, relationMode, onConfirm) {
    super(app);
    this.subjectTag = subjectTag;
    this.relatedTag = relatedTag;
    this.relationMode = relationMode;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    this.modalEl.classList.add("puffs-relation-confirm-modal");
    this.contentEl.empty();
    const relationName = this.relationMode === "parents" ? "\u7236\u6807\u7B7E" : "\u5B50\u6807\u7B7E";
    this.contentEl.createDiv({ text: `\u79FB\u9664${relationName}`, cls: "puffs-relation-modal-title" });
    this.contentEl.createDiv({
      text: this.relationMode === "parents" ? `\u786E\u5B9A\u8981\u4ECE\u300C${getTagDisplayName(this.subjectTag)}\u300D\u7684\u7236\u6807\u7B7E\u4E2D\u79FB\u9664\u300C${getTagDisplayName(this.relatedTag)}\u300D\u5417\uFF1F\u6B64\u64CD\u4F5C\u53EA\u89E3\u9664\u7EE7\u627F\u5173\u7CFB\uFF0C\u4E0D\u4F1A\u5220\u9664\u6807\u7B7E\u6216\u7B14\u8BB0\u3002` : `\u786E\u5B9A\u8981\u4ECE\u300C${getTagDisplayName(this.subjectTag)}\u300D\u7684\u5B50\u6807\u7B7E\u4E2D\u79FB\u9664\u300C${getTagDisplayName(this.relatedTag)}\u300D\u5417\uFF1F\u6B64\u64CD\u4F5C\u53EA\u89E3\u9664\u7EE7\u627F\u5173\u7CFB\uFF0C\u4E0D\u4F1A\u5220\u9664\u6807\u7B7E\u6216\u7B14\u8BB0\u3002`,
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
var TagInheritanceModal = class extends import_obsidian4.Modal {
  constructor(app, plugin, subjectTag, relationMode = "children") {
    super(app);
    this.plugin = plugin;
    this.relationMode = relationMode;
    this.parentTag = normalizeTag(subjectTag);
    const related = relationMode === "parents" ? plugin.getInheritanceParents(subjectTag) : plugin.getInheritanceChildren(subjectTag);
    this.children = relationMode === "parents" ? plugin.sortTagsByVisibleCount(related) : [...related];
    this.activeChild = this.children[0] || null;
    this.query = "";
    this.isComposing = false;
    this.isSubmitting = false;
    this.searchHostEl = null;
    this.inputEl = null;
    this.picker = null;
    this.childrenListEl = null;
    this.exclusionsSectionEl = null;
    this.exclusionGroupsEl = null;
    this.selectionSectionEl = null;
    this.selectionTitleEl = null;
    this.selectionSummaryEl = null;
    this.selectionInputEl = null;
    this.selectionGroupsEl = null;
    this.selectionQuery = "";
  }
  onOpen() {
    this.modalEl.classList.add("puffs-relation-modal", "puffs-tag-relation-modal");
    this.buildLayout();
  }
  buildLayout() {
    this.contentEl.empty();
    const relationName = this.relationMode === "parents" ? "\u7236\u6807\u7B7E" : "\u5B50\u6807\u7B7E";
    this.contentEl.createDiv({
      text: `\u7BA1\u7406 ${getTagDisplayName(this.parentTag)} \u7684${relationName}`,
      cls: "puffs-relation-modal-title puffs-tag-rename-title"
    });
    this.searchHostEl = this.contentEl.createDiv({ cls: "puffs-relation-tag-search" });
    this.inputEl = this.searchHostEl.createEl("input", { type: "search", cls: "puffs-relation-input" });
    this.inputEl.value = this.query;
    this.picker = createTagCandidatePicker({
      hostEl: this.searchHostEl,
      inputEl: this.inputEl,
      getCandidates: (query) => getTagRelationCandidates(this.plugin.getLogicalTagSet(), query, (tag) => tag !== this.parentTag && !this.children.includes(tag) && !(this.relationMode === "parents" && this.plugin.isFixedChild(this.parentTag)) && !(this.relationMode === "children" && this.plugin.isFixedChild(tag)) && !this.plugin.wouldCreateTagInheritanceCycle(
        this.relationMode === "parents" ? tag : this.parentTag,
        this.relationMode === "parents" ? this.parentTag : tag
      )),
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
    this.buildInheritanceSelectionSection();
    this.renderChildren();
    this.renderExclusionGroups();
    this.renderInheritanceSelection();
    this.modalEl.addEventListener("keydown", (event) => {
      var _a;
      const { parent, child } = this.getActiveEdge();
      if (!this.activeChild || this.plugin.getTagInheritanceMode(parent, child) !== "selected" || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      event.stopPropagation();
      if (document.activeElement === this.selectionInputEl && this.selectionInputEl.value) {
        this.selectionInputEl.value = "";
        this.selectionQuery = "";
        this.renderInheritanceSelection();
      }
      (_a = this.selectionInputEl) == null ? void 0 : _a.focus();
    }, true);
    window.setTimeout(() => {
      if (this.inputEl) {
        this.inputEl.focus();
        return;
      }
      this.modalEl.tabIndex = -1;
      this.modalEl.focus();
    }, 0);
  }
  getEdge(relatedTag) {
    return this.relationMode === "parents" ? { parent: relatedTag, child: this.parentTag } : { parent: this.parentTag, child: relatedTag };
  }
  getActiveEdge() {
    return this.getEdge(this.activeChild);
  }
  async changeInheritanceMode(relatedTag, mode) {
    const { parent, child } = this.getEdge(relatedTag);
    if (!relatedTag || this.isSubmitting || this.plugin.isFixedTagEdge(parent, child) || this.plugin.getTagInheritanceMode(parent, child) === mode) return;
    this.activeChild = relatedTag;
    this.isSubmitting = true;
    this.syncMutationState();
    try {
      await this.plugin.setTagInheritanceMode(parent, child, mode);
      this.renderChildren();
      this.renderExclusionGroups();
      this.renderInheritanceSelection();
    } catch (error) {
      new import_obsidian4.Notice(error && error.message ? error.message : "\u5207\u6362\u7EE7\u627F\u6A21\u5F0F\u5931\u8D25");
    } finally {
      this.isSubmitting = false;
      this.syncMutationState();
    }
  }
  selectActiveChild(child) {
    if (!child || !this.children.includes(child)) return;
    this.activeChild = child;
    this.renderChildren();
    this.renderExclusionGroups();
    this.renderInheritanceSelection();
  }
  buildInheritanceSelectionSection() {
    this.selectionSectionEl = this.contentEl.createDiv({ cls: "puffs-inheritance-selection" });
    const headingEl = this.selectionSectionEl.createDiv({ cls: "puffs-inheritance-selection-heading" });
    this.selectionTitleEl = headingEl.createEl("h4", { text: "\u7EE7\u627F\u7B14\u8BB0" });
    this.selectionSummaryEl = headingEl.createSpan({ cls: "puffs-inheritance-selection-summary" });
    const toolbarEl = this.selectionSectionEl.createDiv({ cls: "puffs-inheritance-selection-toolbar" });
    this.selectionInputEl = toolbarEl.createEl("input", { type: "search", cls: "puffs-relation-input" });
    this.selectionInputEl.addEventListener("input", () => {
      this.selectionQuery = this.selectionInputEl.value;
      this.renderInheritanceSelection();
    });
    const selectAllButton = toolbarEl.createEl("button", { text: "\u5168\u9009\u7ED3\u679C" });
    selectAllButton.dataset.puffsSelectionAction = "select";
    selectAllButton.addEventListener("click", () => {
      void this.applyInheritanceSelectionBatch(true);
    });
    const clearButton = toolbarEl.createEl("button", { text: "\u6E05\u7A7A\u7ED3\u679C" });
    clearButton.dataset.puffsSelectionAction = "clear";
    clearButton.addEventListener("click", () => {
      void this.applyInheritanceSelectionBatch(false);
    });
    this.selectionGroupsEl = this.selectionSectionEl.createDiv({ cls: "puffs-inheritance-selection-groups" });
  }
  renderChildren() {
    var _a;
    if (!this.childrenListEl) return;
    if (this.relationMode === "parents") {
      this.children = this.plugin.sortTagsByVisibleCount(this.children);
    }
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
        (0, import_obsidian4.setIcon)(iconEl, "tag");
        rowEl.createSpan({ cls: "puffs-relation-manage-name" });
        rowEl.createSpan({ cls: "puffs-relation-child-count" });
        const modeButton = rowEl.createEl("button", {
          cls: "clickable-icon puffs-inheritance-edge-mode"
        });
        modeButton.addEventListener("click", (event) => {
          event.stopPropagation();
          const relatedTag = modeButton.dataset.puffsRelatedTag;
          this.activeChild = relatedTag;
          const edge = this.getEdge(relatedTag);
          if (this.plugin.isFixedTagEdge(edge.parent, edge.child)) {
            this.renderChildren();
            this.renderExclusionGroups();
            this.renderInheritanceSelection();
            return;
          }
          const nextMode = this.plugin.getTagInheritanceMode(edge.parent, edge.child) === "selected" ? "all" : "selected";
          void this.changeInheritanceMode(relatedTag, nextMode);
        });
        rowEl.addEventListener("click", (event) => {
          if (event.target.closest("button")) return;
          this.selectActiveChild(rowEl.dataset.puffsTag);
        });
        const removeButton = rowEl.createEl("button", {
          cls: "clickable-icon puffs-relation-child-remove",
          attr: { "aria-label": `\u79FB\u9664 ${getTagDisplayName(child)}` }
        });
        (0, import_obsidian4.setIcon)(removeButton, "x");
        removeButton.addEventListener("click", (event) => {
          event.stopPropagation();
          new RemoveTagRelationConfirmModal(this.app, this.parentTag, child, this.relationMode, () => {
            void this.removeChild(child);
          }).open();
        });
      }
      rowEl.querySelector(".puffs-relation-manage-name").textContent = getTagDisplayName(child);
      rowEl.querySelector(".puffs-relation-child-count").textContent = String(this.plugin.getTagVisibleNoteCount(child));
      rowEl.classList.toggle("is-active", child === this.activeChild);
      rowEl.setAttribute("role", "button");
      rowEl.setAttribute("aria-pressed", String(child === this.activeChild));
      this.syncInheritanceModeButton(rowEl, child);
      this.syncFixedRelationButton(rowEl, child);
      this.childrenListEl.appendChild(rowEl);
      existingRows.delete(child);
    }
    for (const rowEl of existingRows.values()) rowEl.remove();
    if (!this.children.length) {
      this.childrenListEl.createDiv({
        text: this.relationMode === "parents" ? "\u6682\u65E0\u7236\u6807\u7B7E" : "\u6682\u65E0\u5B50\u6807\u7B7E",
        cls: "puffs-relation-empty"
      });
    }
    this.syncMutationState();
  }
  syncInheritanceModeButton(rowEl, relatedTag) {
    const button = rowEl.querySelector(".puffs-inheritance-edge-mode");
    if (!button) return;
    const { parent, child } = this.getEdge(relatedTag);
    const fixed = this.plugin.isFixedTagEdge(parent, child);
    button.classList.toggle("is-hidden", fixed);
    button.dataset.puffsRelatedTag = relatedTag;
    button.dataset.puffsInheritanceMode = fixed ? "fixed" : this.plugin.getTagInheritanceMode(parent, child);
    if (fixed) {
      button.disabled = true;
      return;
    }
    const mode = this.plugin.getTagInheritanceMode(parent, child);
    button.empty();
    (0, import_obsidian4.setIcon)(button, mode === "selected" ? "list-checks" : "layers");
    button.setAttribute("aria-label", `\u5F53\u524D\u4E3A${mode === "selected" ? "\u9009\u62E9" : "\u5168\u90E8"}\u7EE7\u627F`);
    button.disabled = this.isSubmitting;
  }
  syncMutationState() {
    var _a, _b;
    if (this.inputEl) this.inputEl.disabled = this.isSubmitting;
    for (const button of ((_a = this.childrenListEl) == null ? void 0 : _a.querySelectorAll(
      ".puffs-relation-child-remove, .puffs-relation-fixed-toggle, .puffs-inheritance-edge-mode"
    )) || []) {
      button.disabled = this.isSubmitting || button.dataset.puffsInheritanceMode === "fixed";
    }
    if (this.selectionInputEl) this.selectionInputEl.disabled = this.isSubmitting;
    for (const control of ((_b = this.selectionSectionEl) == null ? void 0 : _b.querySelectorAll('button, input[type="checkbox"]')) || []) {
      if (control.dataset.puffsFixed === "true") continue;
      control.disabled = this.isSubmitting;
    }
  }
  syncFixedRelationButton(rowEl, relatedTag) {
    const { parent, child } = this.getEdge(relatedTag);
    const eligible = this.plugin.isFixedTagRelationEligible(parent, child);
    let button = rowEl.querySelector(".puffs-relation-fixed-toggle");
    if (!eligible) {
      button == null ? void 0 : button.remove();
      return;
    }
    if (!button) {
      button = rowEl.createEl("button", { cls: "clickable-icon puffs-relation-fixed-toggle" });
      const removeButton = rowEl.querySelector(".puffs-relation-child-remove");
      if (removeButton) rowEl.insertBefore(button, removeButton);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        void this.toggleFixedRelation(button);
      });
    }
    button.dataset.puffsParentTag = parent;
    button.dataset.puffsChildTag = child;
    const fixed = this.plugin.isFixedTagEdge(parent, child);
    button.empty();
    (0, import_obsidian4.setIcon)(button, fixed ? "lock" : "unlock");
    button.setAttribute("aria-label", `\u5F53\u524D\u4E3A${fixed ? "\u56FA\u5B9A" : "\u81EA\u7531"}\u5B50\u6807\u7B7E`);
    button.disabled = this.isSubmitting;
  }
  async toggleFixedRelation(button) {
    var _a;
    if (this.isSubmitting) return;
    const parent = button.dataset.puffsParentTag;
    const child = button.dataset.puffsChildTag;
    const nextFixed = !this.plugin.isFixedTagEdge(parent, child);
    this.isSubmitting = true;
    this.syncMutationState();
    try {
      await this.plugin.setFixedTagRelation(parent, child, nextFixed);
      this.renderChildren();
      this.renderExclusionGroups();
      this.renderInheritanceSelection();
      (_a = this.picker) == null ? void 0 : _a.render();
    } catch (error) {
      new import_obsidian4.Notice(error && error.message ? error.message : "\u4FDD\u5B58\u56FA\u5B9A\u5B50\u6807\u7B7E\u5931\u8D25");
    } finally {
      this.isSubmitting = false;
      this.syncMutationState();
    }
  }
  updateChildren(nextChildren) {
    var _a;
    this.children = this.relationMode === "parents" ? this.plugin.sortTagsByVisibleCount(nextChildren) : [...nextChildren];
    if (!this.children.includes(this.activeChild)) {
      this.activeChild = this.children[0] || null;
    }
    this.renderChildren();
    (_a = this.picker) == null ? void 0 : _a.render();
  }
  async persistChildren(nextChildren) {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    this.syncMutationState();
    try {
      const orderedChildren = this.relationMode === "parents" ? this.plugin.sortTagsByVisibleCount(nextChildren) : [...nextChildren];
      if (this.relationMode === "parents") {
        await this.plugin.setInheritanceParents(this.parentTag, orderedChildren);
      } else {
        await this.plugin.setInheritanceChildren(this.parentTag, orderedChildren);
      }
      this.updateChildren(orderedChildren);
      this.renderExclusionGroups();
      this.renderInheritanceSelection();
      return true;
    } catch (error) {
      new import_obsidian4.Notice(error && error.message ? error.message : "\u4FDD\u5B58\u7EE7\u627F\u5173\u7CFB\u5931\u8D25");
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
    if (this.relationMode === "children") this.selectActiveChild(tag);
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
  getFilteredInheritanceCandidates() {
    if (!this.activeChild) return [];
    const { parent, child } = this.getActiveEdge();
    return filterInheritanceCandidates(
      this.plugin.getInheritanceCandidates(parent, child),
      this.selectionQuery,
      (file) => this.plugin.getNoteAliases(file)
    );
  }
  async persistInheritanceSelection(entries) {
    if (this.isSubmitting || !this.activeChild) return false;
    this.isSubmitting = true;
    this.syncMutationState();
    try {
      const { parent, child } = this.getActiveEdge();
      await this.plugin.setEdgePathsVisible(parent, child, entries);
      this.renderInheritanceSelection();
      return true;
    } catch (error) {
      new import_obsidian4.Notice(error && error.message ? error.message : "\u4FDD\u5B58\u7EE7\u627F\u7B14\u8BB0\u5931\u8D25");
      this.renderInheritanceSelection();
      return false;
    } finally {
      this.isSubmitting = false;
      this.syncMutationState();
    }
  }
  // 复选框的含义统一为「这篇笔记在这条边上可见吗」，至于落到白名单还是黑名单由存储层分流
  async toggleInheritanceCandidate(path, visible) {
    await this.persistInheritanceSelection([{ path, visible: !!visible }]);
  }
  async applyInheritanceSelectionBatch(visible) {
    if (this.isSubmitting) return;
    const entries = this.getFilteredInheritanceCandidates().filter((candidate) => !candidate.fixed).map((candidate) => ({ path: candidate.path, visible: !!visible }));
    await this.persistInheritanceSelection(entries);
  }
  renderInheritanceSelection() {
    var _a, _b;
    if (!this.selectionSectionEl || !this.selectionGroupsEl || !this.selectionSummaryEl) return;
    const { parent, child } = this.getActiveEdge();
    const selectedMode = !!this.activeChild && this.plugin.getTagInheritanceMode(parent, child) === "selected";
    this.selectionSectionEl.classList.toggle("is-hidden", !selectedMode);
    if (!selectedMode) return;
    if (this.selectionTitleEl) {
      this.selectionTitleEl.textContent = `\u7EE7\u627F\u7B14\u8BB0\uFF08${getTagDisplayName(parent)} \u2190 ${getTagDisplayName(child)}\uFF09`;
    }
    const candidates = this.plugin.getInheritanceCandidates(parent, child);
    const freeCandidates = candidates.filter((candidate) => !candidate.fixed);
    const selectedPaths = this.plugin.collectVisiblePathsForEdge(parent, child);
    const selectedCount = freeCandidates.filter((candidate) => selectedPaths.has(candidate.path)).length;
    this.selectionSummaryEl.textContent = `\u5DF2\u9009 ${selectedCount} / ${freeCandidates.length}`;
    const filtered = filterInheritanceCandidates(
      candidates,
      this.selectionQuery,
      (file) => this.plugin.getNoteAliases(file)
    );
    const scrollTop = this.selectionGroupsEl.scrollTop;
    const existingGroups = new Map(
      Array.from(this.selectionGroupsEl.querySelectorAll(".puffs-inheritance-selection-group")).map((groupEl) => [groupEl.dataset.puffsSource || "", groupEl])
    );
    if (!filtered.length) {
      for (const groupEl of existingGroups.values()) groupEl.remove();
      let emptyEl = this.selectionGroupsEl.querySelector(".puffs-relation-empty");
      if (!emptyEl) emptyEl = this.selectionGroupsEl.createDiv({ cls: "puffs-relation-empty" });
      emptyEl.textContent = candidates.length ? "\u6CA1\u6709\u5339\u914D\u7684\u7EE7\u627F\u7B14\u8BB0" : "\u6682\u65E0\u53EF\u9009\u62E9\u7684\u7EE7\u627F\u7B14\u8BB0";
      return;
    }
    (_a = this.selectionGroupsEl.querySelector(".puffs-relation-empty")) == null ? void 0 : _a.remove();
    for (const group of groupInheritanceCandidates(filtered)) {
      const sourceKey = group.source || "";
      let groupEl = existingGroups.get(sourceKey);
      if (!groupEl) {
        groupEl = this.selectionGroupsEl.createDiv({ cls: "puffs-inheritance-selection-group" });
        groupEl.dataset.puffsSource = sourceKey;
        const headingEl = groupEl.createDiv({ cls: "puffs-relation-exclusion-heading" });
        const iconEl = headingEl.createSpan({ cls: "puffs-relation-exclusion-icon" });
        (0, import_obsidian4.setIcon)(iconEl, "tag");
        headingEl.createSpan({ cls: "puffs-inheritance-selection-group-name" });
        groupEl.createDiv({ cls: "puffs-inheritance-selection-list" });
      }
      groupEl.querySelector(".puffs-inheritance-selection-group-name").textContent = group.source ? getTagDisplayName(group.source) : "\u6765\u6E90\u672A\u77E5";
      const listEl = groupEl.querySelector(".puffs-inheritance-selection-list");
      const existingRows = new Map(
        Array.from(listEl.querySelectorAll(".puffs-inheritance-selection-row")).map((rowEl) => [rowEl.dataset.puffsPath || "", rowEl])
      );
      for (const candidate of group.candidates) {
        let rowEl = existingRows.get(candidate.path);
        if (!rowEl) {
          rowEl = listEl.createEl("label", { cls: "puffs-inheritance-selection-row" });
          const checkbox2 = rowEl.createEl("input", { type: "checkbox" });
          checkbox2.addEventListener("change", () => {
            void this.toggleInheritanceCandidate(rowEl.dataset.puffsPath, checkbox2.checked);
          });
          rowEl.createSpan({ cls: "puffs-inheritance-selection-name" });
          rowEl.createSpan({ cls: "puffs-inheritance-selection-sources" });
        }
        rowEl.dataset.puffsPath = candidate.path;
        const checkbox = rowEl.querySelector('input[type="checkbox"]');
        checkbox.checked = candidate.fixed || selectedPaths.has(candidate.path);
        checkbox.disabled = candidate.fixed || this.isSubmitting;
        if (candidate.fixed) checkbox.dataset.puffsFixed = "true";
        else delete checkbox.dataset.puffsFixed;
        const nameEl = rowEl.querySelector(".puffs-inheritance-selection-name");
        nameEl.textContent = ((_b = candidate.file) == null ? void 0 : _b.basename) || candidate.path;
        nameEl.setAttribute("title", candidate.path);
        const sourcesEl = rowEl.querySelector(".puffs-inheritance-selection-sources");
        const existingSources = new Map(
          Array.from(sourcesEl.querySelectorAll(".puffs-inheritance-source-chip")).map((chipEl) => [chipEl.dataset.puffsSource || "", chipEl])
        );
        for (const source of candidate.sources || []) {
          let chipEl = existingSources.get(source);
          if (!chipEl) {
            chipEl = sourcesEl.createSpan({ cls: "puffs-inheritance-source-chip" });
            chipEl.dataset.puffsSource = source;
          }
          chipEl.textContent = getTagDisplayName(source);
          sourcesEl.appendChild(chipEl);
          existingSources.delete(source);
        }
        for (const chipEl of existingSources.values()) chipEl.remove();
        let lockEl = rowEl.querySelector(".puffs-inheritance-selection-lock");
        if (candidate.fixed) {
          if (!lockEl) {
            lockEl = rowEl.createSpan({ cls: "puffs-inheritance-selection-lock", attr: { "aria-label": "\u56FA\u5B9A\u7EE7\u627F\u7B14\u8BB0" } });
            (0, import_obsidian4.setIcon)(lockEl, "lock");
          }
        } else {
          lockEl == null ? void 0 : lockEl.remove();
        }
        listEl.appendChild(rowEl);
        existingRows.delete(candidate.path);
      }
      for (const rowEl of existingRows.values()) rowEl.remove();
      this.selectionGroupsEl.appendChild(groupEl);
      existingGroups.delete(sourceKey);
    }
    for (const groupEl of existingGroups.values()) groupEl.remove();
    this.selectionGroupsEl.scrollTop = scrollTop;
  }
  renderExclusionGroups() {
    if (!this.exclusionsSectionEl || !this.exclusionGroupsEl) return;
    const { parent, child } = this.getActiveEdge();
    if (!this.activeChild || this.plugin.getTagInheritanceMode(parent, child) !== "all") {
      this.exclusionsSectionEl.classList.add("is-hidden");
      return;
    }
    const exclusions = this.plugin.getExcludedInheritedPaths(parent, child);
    this.exclusionsSectionEl.classList.toggle("is-hidden", exclusions.length === 0);
    this.exclusionGroupsEl.empty();
    if (!exclusions.length) return;
    const candidatesByPath = new Map(this.plugin.getInheritanceCandidates(parent, child).map((candidate) => [candidate.path, candidate]));
    const sourcesByPath = new Map(exclusions.map((path) => {
      var _a;
      return [path, ((_a = candidatesByPath.get(path)) == null ? void 0 : _a.sources) || []];
    }));
    const groups = groupExcludedPathsBySource(
      exclusions,
      sourcesByPath,
      [child, ...this.plugin.getTagDescendants(child)]
    );
    for (const group of groups) {
      const groupEl = this.exclusionGroupsEl.createDiv({ cls: "puffs-relation-exclusion-group" });
      groupEl.dataset.puffsSource = group.source || "";
      const headingEl = groupEl.createDiv({ cls: "puffs-relation-exclusion-heading" });
      if (group.source) {
        const iconEl = headingEl.createSpan({ cls: "puffs-relation-exclusion-icon" });
        (0, import_obsidian4.setIcon)(iconEl, "tag");
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
            await this.plugin.restoreInheritedFile(parent, path, child);
            this.removeExcludedPath(path);
          } catch (error) {
            console.error("[Puffs Tag Enhance] Failed to restore inherited note:", error);
            new import_obsidian4.Notice("\u6062\u590D\u7EE7\u627F\u7B14\u8BB0\u5931\u8D25");
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
var ManageParentTagModal = class extends TagInheritanceModal {
  constructor(app, plugin, childTag) {
    super(app, plugin, childTag, "parents");
  }
};
var TagNoteBindingModal = class extends import_obsidian4.Modal {
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
      if (!(file instanceof import_obsidian4.TFile) || file.extension !== "md") {
        this.selectedPath = null;
        return;
      }
      const chipEl = selectedEl.createDiv({ cls: "puffs-relation-selected-chip" });
      chipEl.createSpan({ text: file.basename, attr: { title: file.path } });
      const removeButton = chipEl.createEl("button", {
        cls: "clickable-icon",
        attr: { "aria-label": "\u89E3\u9664\u7ED1\u5B9A" }
      });
      (0, import_obsidian4.setIcon)(removeButton, "x");
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
      new import_obsidian4.Notice(error && error.message ? error.message : "\u4FDD\u5B58\u7ED1\u5B9A\u7B14\u8BB0\u5931\u8D25");
    } finally {
      this.isSubmitting = false;
    }
  }
  onClose() {
    this.contentEl.empty();
    void this.persistSelection().catch((error) => {
      console.error("[Puffs Tag Enhance] Failed to persist tag note binding:", error);
      new import_obsidian4.Notice(error && error.message ? error.message : "\u4FDD\u5B58\u7ED1\u5B9A\u7B14\u8BB0\u5931\u8D25");
    });
  }
};
var NoteRelationModal = class extends import_obsidian4.Modal {
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
    if (this.sourcePath) this.renderManagement();
    else this.render();
  }
  renderManagement() {
    this.modalEl.classList.add("puffs-note-relation-management-modal");
    this.contentEl.empty();
    const sourceFile = this.app.vault.getAbstractFileByPath(this.sourcePath);
    const sourceName = sourceFile instanceof import_obsidian4.TFile ? sourceFile.basename : this.sourcePath;
    const relationName = this.mode === "parent" ? "\u7236\u7B14\u8BB0" : "\u5B50\u7B14\u8BB0";
    this.contentEl.createDiv({
      text: `\u7BA1\u7406 ${sourceName} \u7684${relationName}`,
      cls: "puffs-relation-modal-title puffs-tag-rename-title"
    });
    const searchHostEl = this.contentEl.createDiv({ cls: "puffs-relation-tag-search" });
    const inputEl = searchHostEl.createEl("input", { type: "search", cls: "puffs-relation-input" });
    const resultsEl = searchHostEl.createDiv({ cls: "puffs-relation-note-results is-empty-query" });
    const relationsEl = this.contentEl.createDiv({ cls: "puffs-relation-child-list" });
    const getRelatedPaths = () => this.mode === "parent" ? this.plugin.getHierarchyParents(this.sourcePath) : this.plugin.getHierarchyChildren(this.sourcePath);
    const getEdge = (relatedPath) => this.mode === "parent" ? { parentPath: relatedPath, childPath: this.sourcePath } : { parentPath: this.sourcePath, childPath: relatedPath };
    const findMatch = (file, term) => {
      if (file.basename.toLowerCase().includes(term)) return { displayName: file.basename, alias: "" };
      const alias = this.plugin.getNoteAliases(file).find((value) => value.toLowerCase().includes(term));
      return alias ? { displayName: alias, alias } : null;
    };
    const renderRelations = () => {
      relationsEl.empty();
      const relatedPaths = getRelatedPaths();
      for (const path of relatedPaths) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof import_obsidian4.TFile)) continue;
        const rowEl = relationsEl.createDiv({ cls: "puffs-relation-child-row" });
        const iconEl = rowEl.createSpan({ cls: "puffs-relation-child-icon" });
        (0, import_obsidian4.setIcon)(iconEl, "file-text");
        rowEl.createSpan({ text: file.basename, cls: "puffs-relation-manage-name" });
        const removeButton = rowEl.createEl("button", {
          cls: "clickable-icon puffs-relation-child-remove",
          attr: { "aria-label": `\u79FB\u9664 ${file.basename}` }
        });
        (0, import_obsidian4.setIcon)(removeButton, "x");
        removeButton.addEventListener("click", async () => {
          if (this.isSubmitting) return;
          this.isSubmitting = true;
          const { parentPath, childPath } = getEdge(path);
          try {
            await this.plugin.removeNoteHierarchyEdge(parentPath, childPath);
            renderRelations();
            renderResults();
          } catch (error) {
            new import_obsidian4.Notice(error && error.message ? error.message : "\u79FB\u9664\u7236\u5B50\u7B14\u8BB0\u5173\u7CFB\u5931\u8D25");
          } finally {
            this.isSubmitting = false;
          }
        });
      }
      if (!relationsEl.childElementCount) {
        relationsEl.createDiv({ text: `\u6682\u65E0${relationName}`, cls: "puffs-relation-empty" });
      }
    };
    const renderResults = () => {
      resultsEl.empty();
      const term = inputEl.value.trim().toLowerCase();
      if (!term) {
        resultsEl.classList.add("is-empty-query");
        return;
      }
      resultsEl.classList.remove("is-empty-query");
      const related = new Set(getRelatedPaths());
      const candidates = this.app.vault.getMarkdownFiles().map((file) => ({ file, match: findMatch(file, term) })).filter(({ file, match }) => {
        if (!match || file.path === this.sourcePath || related.has(file.path)) return false;
        const { parentPath, childPath } = getEdge(file.path);
        return !this.plugin.wouldCreateNoteHierarchyCycle(parentPath, childPath);
      }).sort((a, b) => a.match.displayName.localeCompare(b.match.displayName, "zh-Hans-CN"));
      if (!candidates.length) {
        resultsEl.createDiv({ text: "\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u7B14\u8BB0\u3002", cls: "puffs-relation-empty" });
        return;
      }
      candidates.forEach(({ file, match }, index) => {
        const rowEl = resultsEl.createDiv({ cls: "puffs-relation-note-result is-clickable" });
        rowEl.classList.toggle("is-active", index === 0);
        rowEl.createDiv({ text: match.displayName, cls: "puffs-relation-note-result-name" });
        rowEl.createDiv({ text: file.path, cls: "puffs-relation-note-result-path" });
        rowEl.addEventListener("click", async () => {
          if (this.isSubmitting) return;
          this.isSubmitting = true;
          const { parentPath, childPath } = getEdge(file.path);
          try {
            const childSelection = { path: childPath, displayName: this.mode === "child" ? match.alias : "" };
            await this.plugin.addNoteHierarchyEdges(
              [{ path: parentPath, displayName: "" }],
              [childSelection]
            );
            inputEl.value = "";
            renderRelations();
            renderResults();
            inputEl.focus();
          } catch (error) {
            new import_obsidian4.Notice(error && error.message ? error.message : "\u6DFB\u52A0\u7236\u5B50\u7B14\u8BB0\u5173\u7CFB\u5931\u8D25");
          } finally {
            this.isSubmitting = false;
          }
        });
      });
    };
    inputEl.addEventListener("compositionstart", () => {
      this.isComposing = true;
    });
    inputEl.addEventListener("compositionend", () => {
      this.isComposing = false;
      renderResults();
    });
    inputEl.addEventListener("input", () => {
      if (!this.isComposing) renderResults();
    });
    inputEl.addEventListener("keydown", (event) => {
      const firstCandidate = resultsEl.querySelector(".puffs-relation-note-result");
      if (getNoteRelationEnterAction(event, this.isComposing, !!firstCandidate) !== "select-candidate") return;
      event.preventDefault();
      event.stopPropagation();
      firstCandidate.click();
    });
    renderRelations();
    globalThis.setTimeout(() => inputEl.focus(), 0);
  }
  render() {
    this.contentEl.empty();
    const sourceFile = this.sourcePath && this.app.vault.getAbstractFileByPath(this.sourcePath);
    const sourceName = sourceFile instanceof import_obsidian4.TFile ? sourceFile.basename : this.sourcePath;
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
          chipEl.createSpan({ text: selection.displayName || (file instanceof import_obsidian4.TFile ? file.basename : selection.path) });
          if (!locked.has(selection.path)) {
            const removeButton = chipEl.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "\u79FB\u9664" } });
            (0, import_obsidian4.setIcon)(removeButton, "x");
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
        new import_obsidian4.Notice("\u53EA\u80FD\u9009\u62E9\u4E00\u7BC7\u7236\u7B14\u8BB0\u6216\u4E00\u7BC7\u5B50\u7B14\u8BB0\u4F5C\u4E3A\u6279\u91CF\u5173\u7CFB\u7684\u4E00\u4FA7");
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
        new import_obsidian4.Notice(errorMessage);
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
        new import_obsidian4.Notice(error && error.message ? error.message : "\u6DFB\u52A0\u7236\u5B50\u5173\u7CFB\u5931\u8D25");
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

// src/view/tag-tree-renderer.ts
var TagTreeRendererBehavior = class {
  /** 层级导航要恢复的滚动容器。属于渲染层职责，自 relations.ts 迁入。 */
  getHierarchyNavigationScrollEl(view) {
    var _a;
    return view.tagContainerEl || ((_a = view.containerEl) == null ? void 0 : _a.querySelector(".tag-container")) || null;
  }
  renderTagInheritanceBrowseTree(hostEl, tree, options = {}) {
    hostEl.empty();
    if (!tree) return;
    const rootTag = normalizeTag(tree.tag);
    const collapsed = this.collapsedInlineHierarchyBranches || /* @__PURE__ */ new Set();
    this.collapsedInlineHierarchyBranches = collapsed;
    const targetPath = options.targetPath || "";
    const renderNotes = (containerEl, node, isInheritedGroup) => {
      const files = node.paths.map((path) => this.app.vault.getAbstractFileByPath(path)).filter((file) => file instanceof import_obsidian5.TFile && file.extension === "md");
      this.renderInlineTagNoteTree(containerEl, files, node.tag, false, {
        ...options,
        inheritanceRootTag: rootTag,
        isInheritedGroup,
        allowInheritedReorder: true
      });
    };
    const renderGroup = (containerEl, label, count, key, containsTarget, renderContent, tagValue = null, parentTagValue = null, hasTagChildren = false) => {
      if (!count) return;
      const expanded = !!targetPath && containsTarget || !collapsed.has(key);
      const itemEl = containerEl.createDiv({ cls: "tree-item puffs-tag-list-item puffs-inheritance-tag-group" });
      const rowEl = itemEl.createDiv({
        cls: "tree-item-self tag-pane-tag is-clickable mod-collapsible puffs-tag-list-row puffs-inheritance-tag-group-row"
      });
      rowEl.dataset.puffsInheritanceGroup = key;
      if (tagValue) rowEl.dataset.puffsInheritanceTag = tagValue;
      if (tagValue && parentTagValue) {
        rowEl.dataset.puffsTagOrderParent = parentTagValue;
        rowEl.dataset.puffsTagOrderTag = tagValue;
      }
      rowEl.setAttribute("aria-expanded", String(expanded));
      const toggleEl = rowEl.createDiv({ cls: "tree-item-icon collapse-icon puffs-tag-list-toggle" });
      toggleEl.classList.toggle("is-collapsed", !expanded);
      (0, import_obsidian5.setIcon)(toggleEl, "right-triangle");
      if (tagValue && parentTagValue) {
        toggleEl.classList.add("puffs-tag-order-button");
        toggleEl.dataset.puffsTagOrderParent = parentTagValue;
        toggleEl.dataset.puffsTagOrderTag = tagValue;
        toggleEl.dataset.puffsSurface = options.surface || "";
        toggleEl.dataset.puffsExpanded = String(expanded);
        toggleEl.dataset.puffsHasChildren = String(hasTagChildren);
        if (hasTagChildren) toggleEl.classList.add("puffs-tag-order-parent-button");
        toggleEl.tabIndex = 0;
        toggleEl.setAttribute("role", "button");
        this.bindTagHierarchyControlButton(
          toggleEl,
          () => {
            var _a;
            this.toggleInlineHierarchyBranch(key);
            (_a = options.rerender) == null ? void 0 : _a.call(options);
          }
        );
        this.syncTagOrderButtonSelection(toggleEl);
      }
      rowEl.createDiv({ text: label, cls: "tree-item-inner" });
      const flairOuterEl = rowEl.createDiv({ cls: "tree-item-flair-outer" });
      flairOuterEl.createSpan({ text: String(count), cls: "tree-item-flair tag-pane-tag-count" });
      rowEl.addEventListener("click", () => {
        var _a;
        if (tagValue && this.isTagOrderModeActive(tagValue)) this.exitTagOrderMode(false);
        this.toggleInlineHierarchyBranch(key);
        (_a = options.rerender) == null ? void 0 : _a.call(options);
      });
      if (tagValue) {
        rowEl.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.showTagContextMenu(event, tagValue);
        });
      }
      if (expanded) {
        const contentEl = itemEl.createDiv({ cls: "tree-item-children puffs-inheritance-tag-group-content" });
        renderContent(contentEl);
      }
    };
    const renderNode = (containerEl, node, lineage, directParentTag) => {
      const key = `${rootTag}\0tag-group\0${lineage.join("")}`;
      const renderNodeContent = (contentEl) => {
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
        for (const child of node.children) {
          renderNode(contentEl, child, [...lineage, child.tag], node.tag);
        }
      };
      const label = this.isFixedTagEdge(directParentTag, node.tag) ? this.getFixedChildDisplayName(node.tag) : getTagDisplayName(node.tag);
      renderGroup(
        containerEl,
        label,
        node.subtreePaths.length,
        key,
        node.subtreePaths.includes(targetPath),
        renderNodeContent,
        node.tag,
        directParentTag,
        node.children.length > 0
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
    for (const child of tree.children) renderNode(hostEl, child, [child.tag], tree.tag);
    this.scheduleTagOrderModeVisibilityReconcile();
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
      if (!(file instanceof import_obsidian5.TFile)) return;
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
        }, toggleOrder);
      } else if (hasOrderButton) {
        (0, import_obsidian5.setIcon)(orderButtonEl, "grip-vertical");
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
        (0, import_obsidian5.setIcon)(toggleEl, "right-triangle");
        toggleEl.addEventListener("click", (event) => {
          var _a;
          event.preventDefault();
          event.stopPropagation();
          this.toggleInlineHierarchyBranch(branchKey);
          (_a = options.rerender) == null ? void 0 : _a.call(options);
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
      (0, import_obsidian5.setIcon)(scrollTopButtonEl, "arrow-up-to-line");
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
    (0, import_obsidian5.setIcon)(toggleEl, "right-triangle");
    rowEl.createDiv({ text: "\u7236\u5B50", cls: "tree-item-inner" });
    const addButtonEl = rowEl.createEl("button", {
      cls: "clickable-icon puffs-hierarchy-add-button",
      attr: { "aria-label": "\u65B0\u589E\u7236\u5B50\u7B14\u8BB0" }
    });
    (0, import_obsidian5.setIcon)(addButtonEl, "plus");
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
  renderNoteHierarchyPage(hostEl, state, options = {}) {
    hostEl.empty();
    hostEl.classList.add("puffs-note-hierarchy-page");
    if (options.showHeader !== false) {
      const headerEl = hostEl.createDiv({ cls: "puffs-note-hierarchy-header" });
      headerEl.createEl("h3", { text: "\u7236\u5B50\u7B14\u8BB0", cls: "puffs-note-hierarchy-title" });
      if (options.onBack) {
        const backButton = headerEl.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "\u8FD4\u56DE\u6807\u7B7E\u7CFB\u7EDF" } });
        (0, import_obsidian5.setIcon)(backButton, "tags");
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
    (0, import_obsidian5.setIcon)(toggleEl, "right-triangle");
    rowEl.createDiv({ text: item.parentFile.basename, cls: "tree-item-inner" });
    const addChildButton = rowEl.createEl("button", { cls: "clickable-icon puffs-hierarchy-add-child-button", attr: { "aria-label": "\u7BA1\u7406\u5B50\u7B14\u8BB0" } });
    (0, import_obsidian5.setIcon)(addChildButton, "user-round-plus");
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
      if (!(file instanceof import_obsidian5.TFile) || file.extension !== "md") continue;
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
      (0, import_obsidian5.setIcon)(orderButtonEl, "grip-vertical");
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
        (0, import_obsidian5.setIcon)(toggleEl, "right-triangle");
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
  captureHierarchyNavigationSnapshot(view, surface) {
    const query = this.getTagSearchValue(view);
    const scrollEl = this.getHierarchyNavigationScrollEl(view);
    return { query: String(query || ""), scrollTop: (scrollEl == null ? void 0 : scrollEl.scrollTop) || 0 };
  }
  applyHierarchyNavigationSnapshot(view, surface, snapshot) {
    var _a, _b;
    const history = this.getHierarchyNavigationHistory(view, surface);
    const restoreRequestId = history.restoreRequestId;
    view.searchQuery = snapshot.query;
    view.hierarchyState.activeMatchIndex = -1;
    view.isShowingSearch = true;
    (_a = view.searchComponent) == null ? void 0 : _a.setValue(snapshot.query);
    (_b = view.syncSearchVisibility) == null ? void 0 : _b.call(view);
    view.render();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      var _a2;
      if (history.restoreRequestId !== restoreRequestId) return;
      const scrollEl = this.getHierarchyNavigationScrollEl(view);
      if (scrollEl == null ? void 0 : scrollEl.isConnected) scrollEl.scrollTop = snapshot.scrollTop;
      const inputEl = (_a2 = view.searchComponent) == null ? void 0 : _a2.inputEl;
      if (inputEl == null ? void 0 : inputEl.isConnected) inputEl.focus({ preventScroll: true });
    }));
  }
};

// src/view/context-menus.ts
var import_obsidian6 = require("obsidian");
var ContextMenusBehavior = class {
  showHierarchyParentMenu(event, file) {
    const menu = new import_obsidian6.Menu();
    menu.addItem((item) => item.setTitle("\u6253\u5F00\u7B14\u8BB0").setIcon("file-text").onClick(() => this.openFileInMainWorkspace(file)));
    menu.addItem((item) => item.setTitle("\u7BA1\u7406\u5B50\u7B14\u8BB0").setIcon("user-round-plus").onClick(() => {
      new NoteRelationModal(this.app, this, file.path, "child").open();
    }));
    menu.addItem((item) => item.setTitle("\u7BA1\u7406\u7236\u7B14\u8BB0").setIcon("corner-left-up").onClick(() => {
      new NoteRelationModal(this.app, this, file.path, "parent").open();
    }));
    menu.showAtMouseEvent(event);
  }
  showHierarchyChildMenu(event, parentPath, file) {
    const menu = new import_obsidian6.Menu();
    const aliases = this.getNoteAliases(file);
    if (aliases.length) {
      menu.addItem((item) => item.setTitle("\u66F4\u6362\u663E\u793A\u540D\u79F0").setIcon("text-cursor-input").onClick(() => {
        const position = { x: event.clientX, y: event.clientY };
        window.setTimeout(() => this.showHierarchyDisplayNameOptions(position, parentPath, file, aliases), 0);
      }));
    }
    menu.addItem((item) => item.setTitle("\u7BA1\u7406\u5B50\u7B14\u8BB0").setIcon("user-round-plus").onClick(() => new NoteRelationModal(this.app, this, file.path, "child").open()));
    menu.addItem((item) => item.setTitle("\u7BA1\u7406\u7236\u7B14\u8BB0").setIcon("corner-left-up").onClick(() => new NoteRelationModal(this.app, this, file.path, "parent").open()));
    menu.addItem((item) => item.setTitle("\u4ECE\u5F53\u524D\u79FB\u9664").setIcon("unlink").onClick(() => this.removeNoteHierarchyEdge(parentPath, file.path)));
    menu.showAtMouseEvent(event);
  }
  showHierarchyDisplayNameOptions(position, parentPath, file, aliases) {
    const current = this.getHierarchyDisplayName(parentPath, file);
    const menu = new import_obsidian6.Menu();
    menu.addItem((item) => item.setTitle(file.basename).setChecked(current === file.basename).onClick(() => this.setHierarchyDisplayName(parentPath, file, "")));
    for (const alias of aliases) {
      menu.addItem((item) => item.setTitle(alias).setChecked(current === alias).onClick(() => this.setHierarchyDisplayName(parentPath, file, alias)));
    }
    menu.showAtPosition(position);
  }
  showNoteCardContextMenu(event, cardEl) {
    const path = cardEl && cardEl.dataset.path;
    const file = path && this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian6.TFile) || file.extension !== "md") return false;
    const hierarchyParent = cardEl.dataset.puffsHierarchyParent;
    if (hierarchyParent) {
      this.showHierarchyChildMenu(event, hierarchyParent, file);
      return true;
    }
    const tag = normalizeTag(cardEl.dataset.puffsTag);
    const inheritanceRootTag = normalizeTag(cardEl.dataset.puffsInheritanceRootTag || tag);
    const menu = new import_obsidian6.Menu();
    const inherited = cardEl.dataset.puffsInherited === "true" || tag && this.isInheritedFileForTag(tag, path);
    const fixedInherited = inheritanceRootTag && this.isFixedInheritedFileForTag(inheritanceRootTag, path);
    if (inherited && !fixedInherited) {
      menu.addItem((item) => item.setTitle(this.getInheritedFileRemovalTitle(inheritanceRootTag)).setIcon("eye-off").onClick(() => this.setInheritedFileVisible(inheritanceRootTag, path, false).catch((error) => {
        console.error("[Puffs Tag Enhance] Failed to exclude inherited note:", error);
        new import_obsidian6.Notice("\u6392\u9664\u7EE7\u627F\u7B14\u8BB0\u5931\u8D25");
      })));
    }
    const aliases = tag && !isNestedTag(tag) ? this.getNoteAliases(file) : [];
    if (aliases.length > 0) {
      menu.addItem((item) => item.setTitle("\u66F4\u6362\u663E\u793A\u540D\u79F0").setIcon("text-cursor-input").onClick(() => {
        const position = { x: event.clientX, y: event.clientY };
        window.setTimeout(() => this.showNoteDisplayNameOptions(position, tag, file, aliases), 0);
      }));
    }
    if (inherited && !fixedInherited || aliases.length > 0) menu.addSeparator();
    menu.addItem((item) => item.setTitle("\u7BA1\u7406\u7236\u7B14\u8BB0").setIcon("corner-left-up").onClick(() => {
      new NoteRelationModal(this.app, this, path, "parent").open();
    }));
    menu.addItem((item) => item.setTitle("\u7BA1\u7406\u5B50\u7B14\u8BB0").setIcon("user-round-plus").onClick(() => {
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
  showTagContextMenu(event, tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return false;
    const menu = new import_obsidian6.Menu();
    menu.addItem((item) => item.setTitle("\u4FEE\u6539\u6807\u7B7E").setIcon("pencil").onClick(() => this.openRenameTagModal(tag)));
    menu.addItem((item) => item.setTitle("\u7BA1\u7406\u7236\u6807\u7B7E").setIcon("corner-left-up").onClick(() => {
      new ManageParentTagModal(this.app, this, tag).open();
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
    if (!tag || !path || !this.isInheritedFileForTag(tag, path) || this.isFixedInheritedFileForTag(tag, path)) return false;
    const menu = new import_obsidian6.Menu();
    menu.addItem((item) => item.setTitle(this.getInheritedFileRemovalTitle(tag)).setIcon("eye-off").onClick(() => this.setInheritedFileVisible(tag, path, false).catch((error) => {
      console.error("[Puffs Tag Enhance] Failed to exclude inherited note:", error);
      new import_obsidian6.Notice("\u6392\u9664\u7EE7\u627F\u7B14\u8BB0\u5931\u8D25");
    })));
    menu.showAtMouseEvent(event);
    return true;
  }
};

// src/view/order-controller.ts
var import_obsidian7 = require("obsidian");
var OrderControllerBehavior = class {
  refreshNoteDisplayNameCards(tagValue, file) {
    const tag = normalizeTag(tagValue);
    if (!tag || !(file instanceof import_obsidian7.TFile)) return;
    const displayName = this.getNoteDisplayName(tag, file);
    document.querySelectorAll(".puffs-tag-note-card[data-puffs-tag][data-path]").forEach((cardEl) => {
      if (cardEl.dataset.puffsTag !== tag || cardEl.dataset.path !== file.path) return;
      const textEl = cardEl.querySelector(".tree-item-inner-text");
      if (textEl) textEl.textContent = displayName;
    });
  }
  showNoteDisplayNameMenuForCard(event, cardEl) {
    const tag = normalizeTag(cardEl && cardEl.dataset.puffsTag);
    const path = cardEl && cardEl.dataset.path;
    if (!tag || isNestedTag(tag) || !path) return false;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian7.TFile)) return false;
    const aliases = this.getNoteAliases(file);
    if (aliases.length === 0) return false;
    const menu = new import_obsidian7.Menu();
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
    const menu = new import_obsidian7.Menu();
    menu.addItem((item) => {
      item.setTitle(file.basename).setChecked(currentName === file.basename).onClick(() => this.setNoteDisplayName(tag, file, "").catch((error) => {
        console.error("[Puffs Tag Enhance] Failed to restore note display name:", error);
        new import_obsidian7.Notice("\u6062\u590D\u6587\u4EF6\u540D\u5931\u8D25");
      }));
    });
    for (const alias of aliases) {
      menu.addItem((item) => {
        item.setTitle(alias).setChecked(currentName === alias).onClick(() => this.setNoteDisplayName(tag, file, alias).catch((error) => {
          console.error("[Puffs Tag Enhance] Failed to change note display name:", error);
          new import_obsidian7.Notice("\u66F4\u6362\u5C55\u793A\u540D\u79F0\u5931\u8D25");
        }));
      });
    }
    menu.showAtPosition(position);
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
        (0, import_obsidian7.setIcon)(buttonEl, "grip-vertical");
        buttonEl.classList.remove("is-collapsed");
      } else {
        (0, import_obsidian7.setIcon)(buttonEl, "right-triangle");
        buttonEl.classList.toggle("is-collapsed", !isExpanded);
      }
      buttonEl.removeAttribute("aria-label");
      buttonEl.removeAttribute("data-tooltip-position");
      buttonEl.setAttribute("aria-expanded", String(isExpanded));
    }
    const noteItemEl = buttonEl.closest(".puffs-tag-note-item");
    if (noteItemEl) noteItemEl.classList.toggle("is-order-selected", isSelected);
  }
  syncTagOrderButtonSelection(buttonEl) {
    if (!buttonEl) return;
    const parentTag = normalizeTag(buttonEl.dataset.puffsTagOrderParent);
    const tag = normalizeTag(buttonEl.dataset.puffsTagOrderTag);
    const hasChildren = buttonEl.dataset.puffsHasChildren === "true";
    const isSortMode = !!parentTag && this.isTagOrderModeActive(parentTag);
    const isSelected = this.isTagOrderTargetSelected(
      parentTag,
      tag
    );
    const isModeParent = hasChildren && this.isTagOrderModeActive(tag);
    const isExpanded = buttonEl.dataset.puffsExpanded === "true";
    buttonEl.classList.toggle("is-sort-mode", isSortMode);
    buttonEl.classList.toggle("is-selected", isSelected);
    buttonEl.classList.toggle("is-order-mode-parent", isModeParent);
    buttonEl.setAttribute("aria-pressed", String(isSelected || isModeParent));
    if (isSortMode) {
      (0, import_obsidian7.setIcon)(buttonEl, "grip-vertical");
      buttonEl.classList.remove("is-collapsed");
    } else {
      (0, import_obsidian7.setIcon)(buttonEl, "right-triangle");
      buttonEl.classList.toggle("is-collapsed", !isExpanded);
    }
    buttonEl.setAttribute("aria-expanded", String(isExpanded));
    const rowEl = buttonEl.closest(".puffs-inheritance-tag-group-row");
    if (rowEl) {
      rowEl.classList.toggle("is-order-selected", isSelected);
      rowEl.classList.toggle("is-order-mode-parent", isModeParent);
    }
  }
  bindOrderControlButton(buttonEl, isSelected, toggleExpansion, toggleOrder) {
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
      if (event.button !== 0 || isSelected()) return;
      clearLongPressTimer();
      suppressNextClick = false;
      longPressTimer = globalThis.setTimeout(() => {
        longPressTimer = null;
        suppressNextClick = true;
        toggleOrder();
      }, NOTE_ORDER_LONG_PRESS_MS);
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
      if (isSelected()) {
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
  bindNoteParentControlButton(buttonEl, toggleExpansion, toggleOrder) {
    return this.bindOrderControlButton(
      buttonEl,
      () => this.isNoteOrderTargetSelected(
        buttonEl.dataset.puffsTag,
        buttonEl.dataset.path,
        buttonEl.dataset.puffsHierarchyParent
      ),
      toggleExpansion,
      toggleOrder
    );
  }
  bindTagHierarchyControlButton(buttonEl, toggleExpansion) {
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
      const parentTag = buttonEl.dataset.puffsTagOrderParent;
      const tag = buttonEl.dataset.puffsTagOrderTag;
      const isSortMode = !!parentTag && this.isTagOrderModeActive(parentTag);
      if (event.button !== 0 || isSortMode || buttonEl.dataset.puffsHasChildren !== "true") return;
      clearLongPressTimer();
      suppressNextClick = false;
      longPressTimer = globalThis.setTimeout(() => {
        longPressTimer = null;
        suppressNextClick = true;
        const wasActive = this.isTagOrderModeActive(tag);
        this.toggleTagOrderMode(tag, buttonEl.dataset.puffsSurface || "");
        if (!wasActive && this.isTagOrderModeActive(tag) && buttonEl.dataset.puffsExpanded !== "true") {
          toggleExpansion();
        }
      }, NOTE_ORDER_LONG_PRESS_MS);
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
      const parentTag = buttonEl.dataset.puffsTagOrderParent;
      const tag = buttonEl.dataset.puffsTagOrderTag;
      if (parentTag && this.isTagOrderModeActive(parentTag)) {
        this.toggleTagOrderTarget(parentTag, tag, buttonEl.dataset.puffsSurface || "");
        return;
      }
      if (this.isTagOrderModeActive(tag)) this.exitTagOrderMode(false);
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
  refreshTagOrderSelectionState() {
    document.querySelectorAll(".puffs-tag-order-button, .puffs-tag-order-parent-button").forEach((buttonEl) => {
      this.syncTagOrderButtonSelection(buttonEl);
    });
  }
  scheduleTagOrderModeVisibilityReconcile() {
    if (!this.activeTagOrderParent || this.tagOrderModeVisibilityTimer) return;
    this.tagOrderModeVisibilityTimer = globalThis.setTimeout(() => {
      this.tagOrderModeVisibilityTimer = null;
      if (!this.activeTagOrderParent) return;
      const isVisible = Array.from(document.querySelectorAll(".puffs-tag-order-parent-button")).some(
        (buttonEl) => normalizeTag(buttonEl.dataset.puffsTagOrderTag) === this.activeTagOrderParent && buttonEl.dataset.puffsExpanded === "true" && buttonEl.offsetParent !== null
      );
      if (!isVisible) this.exitTagOrderMode();
    }, 0);
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
  focusSelectedTagOrderButton() {
    if (!this.selectedTagOrderTarget) return;
    const { parentTag, tag, surface } = this.selectedTagOrderTarget;
    const buttons = Array.from(document.querySelectorAll(".puffs-tag-order-button"));
    const buttonEl = buttons.find(
      (button) => button.dataset.puffsTagOrderParent === parentTag && button.dataset.puffsTagOrderTag === tag && button.dataset.puffsSurface === surface && button.offsetParent !== null
    ) || buttons.find(
      (button) => button.dataset.puffsTagOrderParent === parentTag && button.dataset.puffsTagOrderTag === tag && button.offsetParent !== null
    );
    if (buttonEl) buttonEl.focus({ preventScroll: true });
  }
};

// src/settings.ts
var import_obsidian8 = require("obsidian");
var PuffsTagEnhanceSettingTab = class extends import_obsidian8.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian8.Setting(containerEl).setName("\u81EA\u52A8\u5207\u5230\u5927\u7EB2\u6807\u7B7E\u9875").setDesc("\u5F00\u542F\u540E\uFF0C\u63D2\u4EF6\u4F1A\u6309\u5F53\u524D\u7B14\u8BB0\u7684\u4FA7\u8FB9\u680F\u504F\u597D\u5728\u6807\u7B7E\u5217\u8868\u548C\u5927\u7EB2\u4E4B\u95F4\u81EA\u52A8\u5207\u6362").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.autoSwitchToOutlineEnabled).onChange(async (value) => {
        await this.plugin.updateSettings({ autoSwitchToOutlineEnabled: value });
      });
    });
    new import_obsidian8.Setting(containerEl).setName("\u8F93\u5165\u6CD5\u7EC4\u5408\u671F\u95F4\u4FDD\u6301\u641C\u7D22\u7ED3\u679C").setDesc("\u5F00\u542F\u540E\uFF0C\u4F7F\u7528\u4E2D\u6587\u8F93\u5165\u6CD5\u8F93\u5165\u62FC\u97F3\u65F6\u4FDD\u6301\u4E0A\u4E00\u6B21\u641C\u7D22\u7ED3\u679C\uFF0C\u786E\u8BA4\u5019\u9009\u5B57\u540E\u518D\u5237\u65B0").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.freezeSearchWhileComposing).onChange(async (value) => {
        await this.plugin.updateSettings({ freezeSearchWhileComposing: value });
      });
    });
    const keywordDescription = "\u56FA\u5B9A\u8BED\u6CD5\uFF1A=\uFF1B==\uFF08\u5F53\u524D\u7B14\u8BB0\u5173\u7CFB\uFF09\uFF1B=\u7236\u7B14\u8BB0\uFF1B==\u5B50\u7B14\u8BB0\uFF1B=\u7236\u7B14\u8BB0*\u5B50\u7B14\u8BB0";
    new import_obsidian8.Setting(containerEl).setName("\u7236\u5B50\u7B14\u8BB0\u641C\u7D22\u5173\u952E\u5B57").setDesc(keywordDescription).addText((text) => {
      text.setValue(DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD).setPlaceholder(DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD).setDisabled(true);
    });
    new import_obsidian8.Setting(containerEl).setName("\u5F39\u51FA/\u6536\u8D77\u641C\u7D22\u680F\u5FEB\u6377\u952E").addText((text) => {
      text.setValue(this.plugin.getQuickSearchHotkeyDisplay()).setPlaceholder(DEFAULT_QUICK_SEARCH_HOTKEY).onChange(async (value) => {
        await this.plugin.updateSettings({ toggleSearchHotkey: value });
      });
    });
    new import_obsidian8.Setting(containerEl).setName("\u9009\u4E2D\u9879\u4E0A\u79FB\u5FEB\u6377\u952E").setDesc("\u9009\u4E2D\u7B14\u8BB0\u6216\u5B50\u6807\u7B7E\u7684\u6392\u5E8F\u6309\u94AE\u540E\uFF0C\u4F7F\u7528\u8BE5\u5FEB\u6377\u952E\u5C06\u5F53\u524D\u9879\u4E0A\u79FB\u4E00\u683C").addText((text) => {
      text.setValue(this.plugin.getMoveNoteUpHotkeyDisplay()).setPlaceholder(DEFAULT_MOVE_NOTE_UP_HOTKEY).onChange(async (value) => {
        await this.plugin.updateSettings({ moveNoteUpHotkey: value });
      });
    });
    new import_obsidian8.Setting(containerEl).setName("\u9009\u4E2D\u9879\u4E0B\u79FB\u5FEB\u6377\u952E").setDesc("\u9009\u4E2D\u7B14\u8BB0\u6216\u5B50\u6807\u7B7E\u7684\u6392\u5E8F\u6309\u94AE\u540E\uFF0C\u4F7F\u7528\u8BE5\u5FEB\u6377\u952E\u5C06\u5F53\u524D\u9879\u4E0B\u79FB\u4E00\u683C").addText((text) => {
      text.setValue(this.plugin.getMoveNoteDownHotkeyDisplay()).setPlaceholder(DEFAULT_MOVE_NOTE_DOWN_HOTKEY).onChange(async (value) => {
        await this.plugin.updateSettings({ moveNoteDownHotkey: value });
      });
    });
    new import_obsidian8.Setting(containerEl).setName("\u65B0\u7B14\u8BB0\u5361\u7247\u4F4D\u7F6E").setDesc("\u53EA\u51B3\u5B9A\u4E4B\u540E\u65B0\u52A0\u5165\u6807\u7B7E\u7684\u7B14\u8BB0\u5361\u7247\u4F4D\u7F6E\uFF0C\u4E0D\u4F1A\u91CD\u6392\u73B0\u6709\u5361\u7247").addDropdown((dropdown) => {
      dropdown.addOption("end", "\u653E\u5728\u6700\u540E").addOption("start", "\u653E\u5728\u6700\u524D").setValue(this.plugin.settings.newNotePosition).onChange(async (value) => {
        await this.plugin.updateSettings({ newNotePosition: value });
      });
    });
    new import_obsidian8.Setting(containerEl).setName("\u5907\u4EFD\u95F4\u9694").setDesc("\u6309\u5206\u949F\u5B9A\u65F6\u5907\u4EFD\u63D2\u4EF6\u6570\u636E\uFF1B\u8F93\u5165 0 \u505C\u6B62\u5907\u4EFD").addText((text) => {
      text.setValue(String(this.plugin.settings.backupIntervalMinutes)).setPlaceholder("0").onChange(async (value) => {
        await this.plugin.updateSettings({ backupIntervalMinutes: value });
      });
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.step = "1";
    });
    new import_obsidian8.Setting(containerEl).setName("\u5907\u4EFD\u8DEF\u5F84").setDesc("Vault \u5185\u7684\u76F8\u5BF9\u8DEF\u5F84\uFF1B\u53EF\u8F93\u5165\u6587\u4EF6\u5939\uFF0C\u4E5F\u53EF\u8F93\u5165\u5305\u542B\u6587\u4EF6\u540D\u7684\u5B8C\u6574\u8DEF\u5F84\uFF0C\u652F\u6301 \\ \u6216 /").addText((text) => {
      text.setValue(this.plugin.settings.backupFolderPath).setPlaceholder("\u5176\u4ED6\\\u5907\u4EFD\\tag-data.md").onChange(async (value) => {
        await this.plugin.updateSettings({ backupFolderPath: value });
      });
    });
    new import_obsidian8.Setting(containerEl).setName("\u56DE\u9876\u6309\u94AE\u663E\u793A\u9608\u503C").setDesc("\u6807\u7B7E\u7684\u7B14\u8BB0\u5361\u7247\u6570\u91CF\u8FBE\u5230\u8BE5\u503C\u65F6\u663E\u793A\u56DE\u9876\u6309\u94AE\uFF1B\u8F93\u5165 0 \u4E0D\u663E\u793A").addText((text) => {
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
      const setting = new import_obsidian8.Setting(containerEl).setName(getSidebarToolbarButtonLabel(buttonSetting.id)).addToggle((toggle) => {
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
var import_obsidian9 = require("obsidian");
var PersistenceBehavior = class {
  async loadSettings() {
    const savedSettings = await this.loadData() || {};
    const schemaChanged = migrateSchema(savedSettings, (message) => {
      console.log("[Puffs Tag Enhance] " + message);
    });
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
    this.settings.tagSidebarPreferredFiles = Array.from(readPreferredFiles(this.settings.tagSidebarPreferredFiles));
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
        this.settings.backupFolderPath = (0, import_obsidian9.normalizePath)(
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
    if (shouldPersistFixedHierarchyKeyword || schemaChanged) await this.saveSettings();
  }
  async saveSettings() {
    var _a;
    (_a = this.tagBrowseCache) == null ? void 0 : _a.invalidate();
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
    this.settings.tagSidebarPreferredFiles = Array.from(readPreferredFiles(this.settings.tagSidebarPreferredFiles));
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
    this.refreshSidebarHotkeys();
    if (newSettings && (Object.prototype.hasOwnProperty.call(newSettings, "moveNoteUpHotkey") || Object.prototype.hasOwnProperty.call(newSettings, "moveNoteDownHotkey"))) {
      this.refreshNoteOrderHotkeyScope();
    }
    if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "autoSwitchToOutlineEnabled")) {
      this.applySidebarPreferenceForCurrentFile();
    }
    if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "scrollTopButtonThreshold")) {
      this.refreshAllTagViews();
    }
    if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "sidebarToolbarButtons")) {
      this.refreshAllTagViews();
    }
    if (newSettings && Object.prototype.hasOwnProperty.call(newSettings, "noteHierarchySearchKeyword")) {
      this.refreshAllTagViews();
    }
  }
  clearBackupTimer() {
    if (this.backupTimer === null) return;
    globalThis.clearInterval(this.backupTimer);
    this.backupTimer = null;
  }
  restartBackupTimer() {
    this.clearBackupTimer();
    const intervalMinutes = normalizeBackupInterval(this.settings.backupIntervalMinutes);
    if (intervalMinutes <= 0) return;
    this.backupTimer = globalThis.setInterval(() => {
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
      currentPath = (0, import_obsidian9.normalizePath)(currentPath ? `${currentPath}/${segment}` : segment);
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
    const backupPath = (0, import_obsidian9.normalizePath)(
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
var import_obsidian10 = require("obsidian");
var CURRENT_NOTE_TAG_SEARCH_STATE_QUERY = "\0current-note-tags";
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
  getOrderedRootFilesForTag(tagValue, files) {
    const orderedFiles = this.getOrderedFilesForTag(tagValue, files);
    const visiblePaths = new Set(orderedFiles.map((file) => file.path));
    return orderedFiles.filter(
      (file) => !this.getHierarchyParents(file.path).some((parentPath) => visiblePaths.has(parentPath))
    );
  }
  getNoteAliases(file) {
    if (!(file instanceof import_obsidian10.TFile) || file.extension !== "md") return [];
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
    if (!(file instanceof import_obsidian10.TFile) || isVirtual) return file && file.basename ? file.basename : "";
    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag)) return file.basename;
    const selected = this.settings.noteDisplayNameByTag && this.settings.noteDisplayNameByTag[tag] && this.settings.noteDisplayNameByTag[tag][file.path];
    return selected && this.getNoteAliases(file).includes(selected) ? selected : file.basename;
  }
  async setNoteDisplayName(tagValue, file, displayName) {
    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag) || !(file instanceof import_obsidian10.TFile) || file.extension !== "md" || !(this.tagFileIndex.get(tag) || []).some((candidate) => candidate.path === file.path)) {
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
    this.refreshAllTagViews();
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
    this.refreshAllTagViews();
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
  getCurrentNoteTagItems() {
    const path = this.currentMainFilePath;
    const file = path && this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian10.TFile) || file.extension !== "md") return [];
    return Array.from(this.getLogicalTagSet()).filter((tag) => !isNestedTag(tag)).map((tag) => ({ tag, browseData: this.getTagBrowseData(tag) })).filter(({ browseData }) => browseData.exactFiles.some((exactFile) => exactFile.path === path)).map(({ tag, browseData }) => ({
      tag,
      displayName: getTagDisplayName(tag),
      isVirtual: false,
      files: browseData.files,
      exactCount: browseData.exactCount,
      inheritedCount: browseData.inheritedCount,
      inheritanceEnabled: browseData.inheritanceEnabled,
      hasInheritance: browseData.hasInheritance,
      sourcesByPath: browseData.sourcesByPath
    })).sort((a, b) => compareTagItemsByCount(
      { count: a.files.length, name: a.displayName },
      { count: b.files.length, name: b.displayName }
    ));
  }
  getCurrentNoteTagEmptyMessage() {
    const path = this.currentMainFilePath;
    const file = path && this.app.vault.getAbstractFileByPath(path);
    return file instanceof import_obsidian10.TFile && file.extension === "md" ? "\u5F53\u524D\u7B14\u8BB0\u6CA1\u6709\u6807\u7B7E\u3002" : "\u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7B14\u8BB0\u3002";
  }
  getCurrentNoteTagMatches(items) {
    const path = this.currentMainFilePath;
    if (!path) return [];
    return items.map((item) => ({
      tag: item.tag,
      path,
      key: `${item.tag}\0${path}`
    }));
  }
  syncCurrentNoteTagSearchState(state, items, expandedTags = this.expandedTags) {
    const matches = this.getCurrentNoteTagMatches(items);
    if (matches.length === 0) {
      this.clearNoteCardSearchState(state, expandedTags);
      return null;
    }
    const query = `${CURRENT_NOTE_TAG_SEARCH_STATE_QUERY}\0${this.currentMainFilePath || ""}`;
    const queryChanged = state.query !== query;
    let activeIndex = queryChanged ? 0 : matches.findIndex(
      (match) => state.target && match.tag === state.target.tag && match.path === state.target.path
    );
    if (activeIndex < 0) activeIndex = 0;
    state.query = query;
    state.matches = matches;
    state.activeIndex = activeIndex;
    return this.activateNoteCardSearchTarget(state, matches[activeIndex], expandedTags);
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
      globalThis.clearTimeout(state.effectTimer);
      state.effectTimer = null;
    }
    state.query = "";
    state.matches = [];
    state.activeIndex = -1;
    state.target = null;
    state.lastScrolledKey = "";
    state.pendingScrollKey = "";
  }
  isNoteOrderTargetSelected(tag, path, hierarchyParent = "") {
    return !!(this.selectedNoteOrderTarget && (hierarchyParent ? this.selectedNoteOrderTarget.hierarchyParent === hierarchyParent : this.selectedNoteOrderTarget.tag === tag) && this.selectedNoteOrderTarget.path === path);
  }
  isTagOrderTargetSelected(parentTagValue, tagValue) {
    const parentTag = normalizeTag(parentTagValue);
    const tag = normalizeTag(tagValue);
    return !!(this.selectedTagOrderTarget && this.selectedTagOrderTarget.parentTag === parentTag && this.selectedTagOrderTarget.tag === tag);
  }
  isTagOrderModeActive(parentTagValue) {
    const parentTag = normalizeTag(parentTagValue);
    return !!parentTag && this.activeTagOrderParent === parentTag;
  }
  refreshOrderSelectionState() {
    this.refreshNoteOrderSelectionState();
    this.refreshTagOrderSelectionState();
  }
  activateNoteOrderHotkeyScope() {
    if (this.noteOrderHotkeyScope || !this.selectedNoteOrderTarget && !this.selectedTagOrderTarget) return;
    const scope = new import_obsidian10.Scope();
    const registerMoveHotkey = (settingValue, fallback, direction) => {
      const hotkey = parseHotkeyText(settingValue, fallback);
      scope.register(hotkey.modifiers, hotkey.key, (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        this.moveSelectedOrderTarget(direction).catch((error) => {
          console.error("[Puffs Tag Enhance] Failed to move selected item:", error);
          new import_obsidian10.Notice("\u8C03\u6574\u987A\u5E8F\u5931\u8D25");
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
    const shouldReactivate = !!(this.selectedNoteOrderTarget || this.selectedTagOrderTarget);
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
      this.exitTagOrderMode(false);
      this.selectedNoteOrderTarget = { tag, path, surface };
      this.refreshNoteOrderHotkeyScope();
    }
    this.refreshOrderSelectionState();
  }
  toggleHierarchyNoteOrderTarget(parentPath, path, surface = "") {
    if (!parentPath || !path) return;
    if (this.isNoteOrderTargetSelected("", path, parentPath)) {
      this.selectedNoteOrderTarget = null;
      this.deactivateNoteOrderHotkeyScope();
    } else {
      this.exitTagOrderMode(false);
      this.selectedNoteOrderTarget = { hierarchyParent: parentPath, path, surface };
      this.refreshNoteOrderHotkeyScope();
    }
    this.refreshOrderSelectionState();
  }
  toggleTagOrderTarget(parentTagValue, tagValue, surface = "") {
    const parentTag = normalizeTag(parentTagValue);
    const tag = normalizeTag(tagValue);
    if (!parentTag || !tag || !this.isTagOrderModeActive(parentTag)) return;
    if (this.isTagOrderTargetSelected(parentTag, tag)) {
      this.selectedTagOrderTarget = null;
      this.deactivateNoteOrderHotkeyScope();
    } else {
      this.selectedNoteOrderTarget = null;
      this.selectedTagOrderTarget = { parentTag, tag, surface };
      this.refreshNoteOrderHotkeyScope();
    }
    this.refreshOrderSelectionState();
  }
  toggleTagOrderMode(parentTagValue, surface = "") {
    const parentTag = normalizeTag(parentTagValue);
    if (!parentTag || !this.hasInheritanceChildren(parentTag)) return;
    if (this.isTagOrderModeActive(parentTag)) {
      this.exitTagOrderMode();
      return;
    }
    this.selectedNoteOrderTarget = null;
    this.selectedTagOrderTarget = null;
    this.activeTagOrderParent = parentTag;
    this.activeTagOrderSurface = surface;
    this.deactivateNoteOrderHotkeyScope();
    this.refreshOrderSelectionState();
  }
  exitTagOrderMode(refresh = true) {
    if (!this.activeTagOrderParent && !this.selectedTagOrderTarget) return;
    this.activeTagOrderParent = null;
    this.activeTagOrderSurface = "";
    this.selectedTagOrderTarget = null;
    this.deactivateNoteOrderHotkeyScope();
    if (refresh) this.refreshOrderSelectionState();
  }
  clearNoteOrderTarget() {
    if (!this.selectedNoteOrderTarget) return;
    this.selectedNoteOrderTarget = null;
    this.deactivateNoteOrderHotkeyScope();
    this.refreshOrderSelectionState();
  }
  clearTagOrderTarget() {
    if (!this.selectedTagOrderTarget) return;
    this.selectedTagOrderTarget = null;
    this.deactivateNoteOrderHotkeyScope();
    this.refreshOrderSelectionState();
  }
  clearOrderTarget() {
    if (!this.selectedNoteOrderTarget && !this.selectedTagOrderTarget) return;
    if (this.selectedNoteOrderTarget) {
      this.selectedNoteOrderTarget = null;
      this.deactivateNoteOrderHotkeyScope();
      this.refreshOrderSelectionState();
      return;
    }
    this.clearTagOrderTarget();
  }
  async moveSelectedOrderTarget(direction) {
    if (this.selectedTagOrderTarget) return this.moveSelectedTag(direction);
    return this.moveSelectedNote(direction);
  }
  async moveSelectedTag(direction) {
    const target = this.selectedTagOrderTarget;
    if (!target || direction !== -1 && direction !== 1) return false;
    const children = this.getInheritanceChildren(target.parentTag);
    const currentIndex = children.indexOf(target.tag);
    if (currentIndex < 0) {
      this.clearTagOrderTarget();
      return false;
    }
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= children.length) return false;
    await this.reorderChildTag(
      target.parentTag,
      target.tag,
      children[nextIndex],
      direction < 0 ? "before" : "after"
    );
    globalThis.setTimeout(() => {
      this.refreshTagOrderSelectionState();
      this.focusSelectedTagOrderButton();
    }, 0);
    return true;
  }
  async moveSelectedTagAfter(parentTagValue, targetTagValue) {
    const selected = this.selectedTagOrderTarget;
    const parentTag = normalizeTag(parentTagValue);
    const targetTag = normalizeTag(targetTagValue);
    if (!selected || !parentTag || selected.parentTag !== parentTag || !targetTag || selected.tag === targetTag) {
      return false;
    }
    const children = this.getInheritanceChildren(parentTag);
    const movingIndex = children.indexOf(selected.tag);
    const targetIndex = children.indexOf(targetTag);
    if (movingIndex < 0) {
      this.clearTagOrderTarget();
      return false;
    }
    if (targetIndex < 0 || movingIndex === targetIndex + 1) return false;
    await this.reorderChildTag(parentTag, selected.tag, targetTag, "after");
    globalThis.setTimeout(() => this.refreshTagOrderSelectionState(), 0);
    return true;
  }
  async reorderChildTag(parentTagValue, movingTagValue, targetTagValue, placement) {
    const parentTag = normalizeTag(parentTagValue);
    const movingTag = normalizeTag(movingTagValue);
    const targetTag = normalizeTag(targetTagValue);
    if (!parentTag || !movingTag || !targetTag || movingTag === targetTag) return false;
    const children = this.getInheritanceChildren(parentTag);
    const movingIndex = children.indexOf(movingTag);
    const targetIndex = children.indexOf(targetTag);
    if (movingIndex < 0 || targetIndex < 0) return false;
    children.splice(movingIndex, 1);
    const nextTargetIndex = children.indexOf(targetTag);
    const insertIndex = placement === "after" ? nextTargetIndex + 1 : nextTargetIndex;
    children.splice(insertIndex, 0, movingTag);
    await this.setInheritanceChildren(parentTag, children);
    return true;
  }
  async moveSelectedNote(direction) {
    const target = this.selectedNoteOrderTarget;
    if (!target || direction !== -1 && direction !== 1) return false;
    if (target.hierarchyParent) {
      await this.moveHierarchyChild(target.hierarchyParent, target.path, direction);
      globalThis.setTimeout(() => {
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
    globalThis.setTimeout(() => {
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
    globalThis.setTimeout(() => {
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
    this.refreshAllTagViews();
  }
};
InteractionsBehavior.NOTE_ORDER_LONG_PRESS_MS = NOTE_ORDER_LONG_PRESS_MS;

// src/workspace.ts
var obsidian = __toESM(require("obsidian"));
var import_obsidian11 = require("obsidian");
var LEGACY_TAG_SIDEBAR_COMMAND_ID = "puffs-immersive-mode:toggle-tag-sidebar";
var WorkspaceBehavior = class {
  followsCurrentNote(searchValue) {
    return this.getHierarchySearchContext(searchValue).mode === "current-note" || parseCurrentNoteTagSearch(searchValue).matched;
  }
  refreshCurrentNoteSearchViews() {
    for (const view of this.getSidebarViews()) {
      if (!this.followsCurrentNote(this.getTagSearchValue(view))) continue;
      view.requestRender();
    }
  }
  updateCurrentMainFilePath(filePath) {
    const nextPath = filePath || null;
    if (nextPath === this.currentMainFilePath) return false;
    this.currentMainFilePath = nextPath;
    this.refreshCurrentNoteSearchViews();
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
  isNoteOrderSearchControl(target) {
    if (!(target instanceof Element)) return false;
    return !!target.closest(".puffs-tag-sidebar-search-host");
  }
  isTagSidebarScrollbarPointer(evt, target) {
    if (!(target instanceof Element)) return false;
    const scrollEl = target.closest(
      '.workspace-leaf-content[data-type="puffs-tag-sidebar"] .tag-container'
    );
    if (!scrollEl || scrollEl.scrollHeight <= scrollEl.clientHeight) return false;
    const scrollbarWidth = scrollEl.offsetWidth - scrollEl.clientWidth;
    if (scrollbarWidth <= 0) return false;
    const rect = scrollEl.getBoundingClientRect();
    return evt.clientX >= rect.right - scrollbarWidth && evt.clientX <= rect.right && evt.clientY >= rect.top && evt.clientY <= rect.bottom;
  }
  registerKeyboardHandler() {
    this.keydownHandler = (evt) => {
      this.handleHierarchyNavigationHotkey(evt);
    };
    document.addEventListener("keydown", this.keydownHandler, true);
    this.pointerdownHandler = (evt) => {
      if (!this.selectedNoteOrderTarget && !this.selectedTagOrderTarget) return;
      const target = evt.target instanceof Element ? evt.target : null;
      if (target && target.closest(".puffs-tag-note-order-button")) return;
      if (target && target.closest(".puffs-tag-order-button")) return;
      if (target && target.closest(".puffs-tag-scroll-top-button")) return;
      if (target && target.closest(".puffs-tag-scroll-bottom-button")) return;
      if (this.isNoteOrderSearchControl(target)) return;
      if (this.isTagSidebarScrollbarPointer(evt, target)) return;
      if (evt.button === 2 && target) {
        if (this.selectedNoteOrderTarget && target.closest(".puffs-tag-note-card")) return;
        if (this.selectedTagOrderTarget && target.closest(".puffs-inheritance-tag-group-row")) return;
      }
      this.clearOrderTarget();
    };
    document.addEventListener("pointerdown", this.pointerdownHandler, true);
    this.noteOrderContextMenuHandler = (evt) => {
      const selectedTag = this.selectedTagOrderTarget;
      if (selectedTag) {
        const target2 = evt.target instanceof Element ? evt.target : null;
        if (!target2 || target2.closest(".puffs-tag-order-button")) return;
        const rowEl = target2.closest(".puffs-inheritance-tag-group-row");
        if (!rowEl) return;
        const parentTag = normalizeTag(rowEl.dataset.puffsTagOrderParent);
        const tag = normalizeTag(rowEl.dataset.puffsTagOrderTag);
        if (parentTag === selectedTag.parentTag && tag === selectedTag.tag) return;
        if (!parentTag || parentTag !== selectedTag.parentTag || !tag) {
          this.clearTagOrderTarget();
          return;
        }
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.moveSelectedTagAfter(parentTag, tag).catch((error) => {
          console.error("[Puffs Tag Enhance] Failed to move selected tag after target:", error);
          new import_obsidian11.Notice("\u8C03\u6574\u5B50\u6807\u7B7E\u987A\u5E8F\u5931\u8D25");
        });
        return;
      }
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
          new import_obsidian11.Notice("\u8C03\u6574\u5B50\u7B14\u8BB0\u987A\u5E8F\u5931\u8D25");
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
        new import_obsidian11.Notice("\u8C03\u6574\u7B14\u8BB0\u987A\u5E8F\u5931\u8D25");
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
  getActiveHierarchyNavigationSurface() {
    const sidebarView = this.getFocusedSidebarView();
    if (sidebarView) return { view: sidebarView, surface: "sidebar" };
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
  async setTagSidebarPreference(filePath, enabled) {
    if (!filePath) return;
    const preferred = this.getPreferredFileSet();
    if (enabled === preferred.has(filePath)) return;
    if (enabled) preferred.add(filePath);
    else preferred.delete(filePath);
    this.settings.tagSidebarPreferredFiles = Array.from(preferred);
    await this.saveSettings();
  }
  hasTagSidebarPreference(filePath) {
    return !!filePath && this.getPreferredFileSet().has(filePath);
  }
  applySidebarPreferenceForCurrentFile() {
    const requestId = ++this.sidebarSwitchRequestId;
    const filePath = this.currentMainFilePath;
    if (!this.settings.autoSwitchToOutlineEnabled || !filePath) return;
    const targetViewType = this.hasTagSidebarPreference(filePath) ? TAG_SIDEBAR_VIEW_TYPE : OUTLINE_VIEW_TYPE;
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
    const currentTargetViewType = this.hasTagSidebarPreference(filePath) ? TAG_SIDEBAR_VIEW_TYPE : OUTLINE_VIEW_TYPE;
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
    const tagLeaf = this.findManagedSidebarLeaf(TAG_SIDEBAR_VIEW_TYPE);
    if (tagLeaf && tagLeaf.parent) return tagLeaf.parent;
    const outlineLeaf = this.findManagedSidebarLeaf(OUTLINE_VIEW_TYPE);
    if (outlineLeaf && outlineLeaf.parent) return outlineLeaf.parent;
    return null;
  }
  handlePreferredFileRename(file, oldPath) {
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
  handlePreferredFileDelete(file) {
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
  handleNoteOrderFileRename(file, oldPath) {
    if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md" || !oldPath || !file.path) return;
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
    if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md" || !file.path) return;
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
    if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md" || !oldPath || !file.path || !this.settings.noteDisplayNameByTag) {
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
    if (!(file instanceof import_obsidian11.TFile) || file.extension !== "md" || !file.path || !this.settings.noteDisplayNameByTag) {
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
    if (!(file instanceof import_obsidian11.TFile)) {
      new import_obsidian11.Notice(`\u672A\u627E\u5230\u7B14\u8BB0\uFF1A${path}`);
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
      new import_obsidian11.Notice("\u672A\u627E\u5230\u53EF\u7528\u7684\u4E3B\u7F16\u8F91\u533A\u6807\u7B7E\u9875");
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
    return true;
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
var import_obsidian12 = require("obsidian");
var TagIndexBehavior = class {
  registerWorkspaceHandlers() {
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.handleActiveLeafChange(leaf);
      })
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.syncSelectedSidebarState();
        this.refreshAllTagViews();
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
      this.refreshAllTagViews();
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
  /**
   * 元数据变更入口。原实现每收到一个 changed 事件就全量重建索引（遍历 2191 个文件），
   * 批量保存或仓库同步时会连续触发数十次。现在交给调度器按 150ms 窗口合并，
   * 窗口内累积的路径一并交给顺序对账。
   */
  scheduleMetadataRefresh(file) {
    const changedPath = file instanceof import_obsidian12.TFile && file.extension === "md" ? file.path : null;
    this.metadataRefreshScheduler.schedule(changedPath);
  }
  runScheduledMetadataRefresh(changedPaths = []) {
    if (this.isUnloaded) return;
    this.refreshTagIndexAndViews(changedPaths);
    this.finishTagRenameProtectionIfSettled();
  }
  refreshTagIndexAndViews(changedPath = null) {
    var _a;
    if (this.isUnloaded) return;
    (_a = this.tagBrowseCache) == null ? void 0 : _a.invalidate();
    const noteOrderChanged = this.rebuildTagFileIndex(changedPath);
    if (noteOrderChanged) {
      this.saveSettings().catch((error) => {
        console.error("[Puffs Tag Enhance] Failed to persist note order:", error);
      });
    }
    this.refreshAllTagViews();
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
        if (!(file instanceof import_obsidian12.TFile)) return false;
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
    this.tagFileIndex = nextIndex;
    const tagInheritanceOrderChanged = metadataCacheReady ? this.initializeTagInheritanceOrder() : false;
    if (!this.tagBindingTrackingReady && metadataCacheReady) this.tagBindingTrackingReady = true;
    this.reconcileExpandedTags();
    const pinnedTagChanged = this.reconcilePinnedTag();
    const noteDisplayNamesChanged = !this.activeTagRename ? this.reconcileNoteDisplayNames(nextIndex) : false;
    const tagBoundNotesChanged = this.tagBindingTrackingReady && !this.activeTagRename ? this.reconcileTagBoundNotes(nextIndex) : false;
    return noteOrderChanged || tagInheritanceOrderChanged || pinnedTagChanged || noteDisplayNamesChanged || tagBoundNotesChanged;
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
      if (order.length > 0 && !isDefaultNoteOrder(order, files)) nextOrders[tag] = order;
    }
    const changed = JSON.stringify(nextOrders) !== JSON.stringify(this.settings.noteOrderByTag);
    if (changed) this.settings.noteOrderByTag = nextOrders;
    return changed;
  }
  reconcileNoteOrders(nextIndex, changedPath = null) {
    const nextOrders = {};
    const changedPaths = Array.isArray(changedPath) ? changedPath.filter(Boolean) : changedPath ? [changedPath] : [];
    for (const tag of this.getStableNoteOrderTags(nextIndex)) {
      const files = nextIndex.get(tag) || [];
      const currentPaths = files.map((file) => file.path);
      const currentPathSet = new Set(currentPaths);
      const savedOrder = Array.isArray(this.settings.noteOrderByTag[tag]) ? this.settings.noteOrderByTag[tag] : [];
      const savedPathSet = new Set(savedOrder);
      const rawAddedPaths = currentPaths.filter((path) => !savedPathSet.has(path));
      const missingPaths = savedOrder.filter((path) => !currentPathSet.has(path));
      const movedPaths = resolveMovedPaths(missingPaths, rawAddedPaths);
      const retainedPaths = savedOrder.map((path) => currentPathSet.has(path) ? path : movedPaths.get(path)).filter(Boolean);
      const movedTargets = new Set(movedPaths.values());
      const addedPaths = rawAddedPaths.filter((path) => !movedTargets.has(path));
      for (const path of changedPaths) {
        const index = addedPaths.indexOf(path);
        if (index < 0) continue;
        addedPaths.splice(index, 1);
        addedPaths.push(path);
      }
      const order = this.settings.newNotePosition === "start" ? addedPaths.reverse().concat(retainedPaths) : retainedPaths.concat(addedPaths);
      if (order.length > 0 && !isDefaultNoteOrder(order, files)) nextOrders[tag] = order;
    }
    const changed = JSON.stringify(nextOrders) !== JSON.stringify(this.settings.noteOrderByTag);
    if (!changed) {
      this.blockedReconcileSignature = null;
      return false;
    }
    const verdict = evaluateReconcileSafety(
      countOrderedPaths(this.settings.noteOrderByTag),
      countOrderedPaths(nextOrders)
    );
    if (!verdict.safe) {
      const signature = JSON.stringify(nextOrders);
      if (this.blockedReconcileSignature !== signature) {
        this.blockedReconcileSignature = signature;
        console.warn(`[Puffs Tag Enhance] \u987A\u5E8F\u5BF9\u8D26\u5B89\u5168\u9600\u5DF2\u62E6\u4E0B\u672C\u6B21\u5199\u5165\uFF1A${verdict.reason}`);
        return false;
      }
      console.warn(`[Puffs Tag Enhance] \u987A\u5E8F\u5BF9\u8D26\u5B89\u5168\u9600\u4E8C\u6B21\u786E\u8BA4\uFF0C\u653E\u884C\u672C\u6B21\u6E05\u7406\uFF1A${verdict.reason}`);
    }
    this.blockedReconcileSignature = null;
    this.settings.noteOrderByTag = nextOrders;
    return true;
  }
  getExactTagsForFile(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return /* @__PURE__ */ new Set();
    const tags = /* @__PURE__ */ new Set();
    const allTags = typeof import_obsidian12.getAllTags === "function" ? (0, import_obsidian12.getAllTags)(cache) : null;
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
    if (!this.isFixedChild(pinnedTag) && !isNestedTag(pinnedTag) && (this.tagFileIndex.get(pinnedTag) || []).length > 0) return false;
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
var import_obsidian14 = require("obsidian");

// src/modals.ts
var import_obsidian13 = require("obsidian");
var PuffsTagRenameModal = class extends import_obsidian13.Modal {
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
      (0, import_obsidian13.setIcon)(addButtonEl, mode === "add" ? "pencil" : "plus");
      (0, import_obsidian13.setIcon)(deleteButtonEl, mode === "delete" ? "pencil" : "minus");
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
        new import_obsidian13.Notice(error && error.message ? error.message : fallbackMessage);
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
  getTagSearchValue(view) {
    if (view && typeof view.getSearchValue === "function") return view.getSearchValue();
    const inputEl = view.searchComponent && view.searchComponent.inputEl;
    if (inputEl && typeof inputEl.value === "string") return inputEl.value;
    if (view.searchComponent && typeof view.searchComponent.getValue === "function") {
      return view.searchComponent.getValue();
    }
    return "";
  }
  clearStaleVirtualExpandedTags(validTags = /* @__PURE__ */ new Set()) {
    for (const tag of Array.from(this.expandedTags)) {
      if (String(tag).startsWith("intersection:") && !validTags.has(tag)) {
        this.expandedTags.delete(tag);
        this.clearInlineHierarchyBranchState(tag);
      }
    }
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
    const processedTags = /* @__PURE__ */ new Set();
    const browseDataByTag = /* @__PURE__ */ new Map();
    const tagMatchesQuery = (tag) => unionTerms ? tagMatchesAnySearchTerm(tag, unionTerms) : tagMatchesSearchText(tag, query);
    const fixedMatchesByRoot = /* @__PURE__ */ new Map();
    if (query.trim()) {
      for (const child of Object.keys(this.getTagInheritanceSettings().fixedParentByChild || {})) {
        if (!tagMatchesQuery(child)) continue;
        const root = this.getTopLevelFixedParent(child);
        if (!root) continue;
        const matches = fixedMatchesByRoot.get(root) || [];
        matches.push(child);
        fixedMatchesByRoot.set(root, matches);
      }
    }
    const shouldShowTag = (tag) => {
      if (this.isFixedChild(tag)) return false;
      if (!tagMatchesQuery(tag) && !fixedMatchesByRoot.has(tag)) return false;
      const browseData = browseDataByTag.get(tag) || this.getTagBrowseData(tag);
      browseDataByTag.set(tag, browseData);
      if (isNestedTag(tag) || browseData.files.length === 0 && !browseData.hasInheritance) return false;
      return true;
    };
    const pushTag = (tag) => {
      const normalizedTag = normalizeTag(tag);
      if (!normalizedTag || processedTags.has(normalizedTag)) return;
      processedTags.add(normalizedTag);
      if (!shouldShowTag(normalizedTag)) return;
      const parentMatches = tagMatchesQuery(normalizedTag);
      const fixedSearchTags = !parentMatches ? fixedMatchesByRoot.get(normalizedTag) || [] : [];
      const browseData = fixedSearchTags.length ? this.createFixedSearchBrowseData(normalizedTag, fixedSearchTags) : browseDataByTag.get(normalizedTag);
      items.push({
        tag: normalizedTag,
        displayName: getTagDisplayName(normalizedTag),
        isVirtual: false,
        files: browseData.files,
        exactCount: browseData.exactCount,
        inheritedCount: browseData.inheritedCount,
        inheritanceEnabled: browseData.inheritanceEnabled,
        hasInheritance: browseData.hasInheritance,
        hasFreeInheritance: browseData.hasFreeInheritance,
        hasActiveInheritance: browseData.hasActiveInheritance,
        sourcesByPath: browseData.sourcesByPath,
        inheritanceTree: browseData.inheritanceTree,
        fixedSearchTags,
        browseData
      });
    };
    for (const [tag, tagDom] of this.getTagDomEntries(view)) {
      pushTag(tagDom && tagDom.tag || tag);
    }
    const fallbackTags = Array.from(this.getLogicalTagSet()).filter((tag) => !processedTags.has(tag));
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
    (0, import_obsidian14.setIcon)(toggleEl, "right-triangle");
    const canOrderChildren = !isVirtual && item.hasInheritance && item.inheritanceEnabled;
    if (canOrderChildren) {
      toggleEl.classList.add("puffs-tag-order-parent-button");
      toggleEl.dataset.puffsTagOrderTag = tag;
      toggleEl.dataset.puffsSurface = "sidebar";
      toggleEl.dataset.puffsExpanded = String(isExpanded);
      toggleEl.dataset.puffsHasChildren = "true";
      toggleEl.removeAttribute("aria-hidden");
      toggleEl.tabIndex = 0;
      toggleEl.setAttribute("role", "button");
      this.bindTagHierarchyControlButton(
        toggleEl,
        () => this.toggleTagExpansion(tag, view)
      );
      this.syncTagOrderButtonSelection(toggleEl);
    }
    const innerEl = document.createElement("div");
    innerEl.className = "tree-item-inner";
    const textEl = document.createElement("div");
    textEl.className = "tree-item-inner-text";
    textEl.textContent = displayName;
    const flairOuterEl = document.createElement("div");
    flairOuterEl.className = "tree-item-flair-outer";
    const countEl = document.createElement("span");
    countEl.className = "tag-pane-tag-count tree-item-flair";
    countEl.textContent = item.inheritedCount > 0 ? `${item.exactCount}+${item.inheritedCount}` : String(files.length);
    let scrollBottomButtonEl = null;
    let pinButtonEl = null;
    let inheritanceButtonEl = null;
    if (!isVirtual && item.hasFreeInheritance) {
      inheritanceButtonEl = document.createElement("button");
      inheritanceButtonEl.type = "button";
      inheritanceButtonEl.className = "clickable-icon puffs-tag-inheritance-button";
      inheritanceButtonEl.dataset.puffsTag = tag;
      inheritanceButtonEl.classList.toggle("is-active", !!item.inheritanceEnabled);
      inheritanceButtonEl.setAttribute("aria-label", item.inheritanceEnabled ? "\u9690\u85CF\u540E\u4EE3\u6807\u7B7E\u7B14\u8BB0" : "\u663E\u793A\u540E\u4EE3\u6807\u7B7E\u7B14\u8BB0");
      (0, import_obsidian14.setIcon)(inheritanceButtonEl, "git-merge");
    }
    if (isExpanded && files.length > 0) {
      scrollBottomButtonEl = document.createElement("button");
      scrollBottomButtonEl.type = "button";
      scrollBottomButtonEl.className = "clickable-icon puffs-tag-scroll-bottom-button";
      scrollBottomButtonEl.dataset.puffsTag = tag;
      (0, import_obsidian14.setIcon)(scrollBottomButtonEl, "arrow-down-to-line");
      if (!isVirtual) {
        pinButtonEl = document.createElement("button");
        pinButtonEl.type = "button";
        pinButtonEl.className = "clickable-icon puffs-tag-pin-button";
        pinButtonEl.dataset.puffsTag = tag;
        pinButtonEl.classList.toggle("is-active", this.settings.pinnedTag === tag);
        (0, import_obsidian14.setIcon)(pinButtonEl, "pin");
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
        scrollContainer: listEl,
        browseData: item.browseData
      });
    }
    listEl.appendChild(treeItemEl);
  }
  getTagDomEntries(view) {
    const tagDoms = view.tagDoms;
    if (!tagDoms) return [];
    if (typeof tagDoms.entries === "function") {
      return Array.from(tagDoms.entries());
    }
    return Object.entries(tagDoms);
  }
  renderNoteList(treeItemEl, files, tagValue, isVirtual = false, options = {}) {
    var _a, _b, _c;
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
      rerender: () => {
        var _a2, _b2, _c2;
        return (_c2 = (_b2 = (_a2 = options.view) == null ? void 0 : _a2.requestRender) == null ? void 0 : _b2.call(_a2)) != null ? _c2 : this.refreshAllTagViews();
      }
    };
    const browseData = !isVirtual && (options.browseData || this.getTagBrowseData(tagValue));
    if (((_c = browseData == null ? void 0 : browseData.hasActiveInheritance) != null ? _c : browseData == null ? void 0 : browseData.inheritanceEnabled) && browseData.inheritanceTree) {
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
  toggleTagExpansion(tag, view) {
    var _a;
    if (!tag) return;
    if (this.expandedTags.has(tag)) {
      this.expandedTags.delete(tag);
      this.clearInlineHierarchyBranchState(tag);
    } else {
      this.expandedTags.add(tag);
    }
    (_a = view == null ? void 0 : view.requestRender) == null ? void 0 : _a.call(view);
  }
  findTagForElement(view, tagEl) {
    const inheritanceTag = normalizeTag(tagEl.dataset && tagEl.dataset.puffsInheritanceTag);
    if (inheritanceTag) return inheritanceTag;
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
};

// src/relations.ts
var import_obsidian15 = require("obsidian");

// src/core/inheritance.ts
function parseFixedChildTag(tagValue) {
  const tag = normalizeTag(tagValue);
  if (!tag || isNestedTag(tag)) return null;
  const parts = getTagDisplayName(tag).split("-");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { parent: normalizeTag(parts[0]), displayName: parts[1] };
}
function getFixedChildDisplayName(tagValue) {
  var _a;
  return ((_a = parseFixedChildTag(tagValue)) == null ? void 0 : _a.displayName) || getTagDisplayName(tagValue);
}
function getFixedParent(inheritance, childValue) {
  const child = normalizeTag(childValue);
  if (!child) return null;
  return normalizeTag(inheritance.fixedParentByChild[child]);
}
function isFixedChild(inheritance, tagValue) {
  return !!getFixedParent(inheritance, tagValue);
}
function isFixedTagEdge(inheritance, parentValue, childValue) {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  return !!parent && !!child && getFixedParent(inheritance, child) === parent;
}
function isFixedTagRelationEligible(inheritance, parentValue, childValue) {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  const parsed = parseFixedChildTag(child);
  if (!parent || !child || !parsed || parsed.parent !== parent) return false;
  const parents = getInheritanceParents(inheritance, child);
  return parents.length === 1 && parents[0] === parent;
}
function getTopLevelFixedParent(inheritance, tagValue) {
  let tag = normalizeTag(tagValue);
  if (!tag) return null;
  const visited = /* @__PURE__ */ new Set();
  let parent = getFixedParent(inheritance, tag);
  while (parent && !visited.has(tag)) {
    visited.add(tag);
    tag = parent;
    parent = getFixedParent(inheritance, tag);
  }
  return tag;
}
function getInheritanceChildren(inheritance, tagValue) {
  const tag = normalizeTag(tagValue);
  if (!tag) return [];
  return [...inheritance.childrenByParent[tag] || []];
}
function hasInheritanceChildren(inheritance, tagValue) {
  return getInheritanceChildren(inheritance, tagValue).length > 0;
}
function getInheritanceParents(inheritance, tagValue) {
  const tag = normalizeTag(tagValue);
  if (!tag) return [];
  return Object.entries(inheritance.childrenByParent).filter(([, children]) => Array.isArray(children) && children.includes(tag)).map(([parent]) => parent);
}
function isTagInheritanceEnabled(inheritance, tagValue) {
  const tag = normalizeTag(tagValue);
  return !!tag && inheritance.enabledParents.includes(tag);
}
function getSortedTagInheritanceAdjacency(inheritance) {
  const result = {};
  for (const parent of Object.keys(inheritance.childrenByParent)) {
    const children = getInheritanceChildren(inheritance, parent);
    if (children.length) result[parent] = children;
  }
  return result;
}
function getFixedTagInheritanceAdjacency(inheritance) {
  const result = {};
  for (const [parent, children] of Object.entries(inheritance.childrenByParent)) {
    const fixedChildren = children.filter((child) => isFixedTagEdge(inheritance, parent, child));
    if (fixedChildren.length) result[parent] = fixedChildren;
  }
  return result;
}
function getTagDescendants(inheritance, tagValue) {
  const root = normalizeTag(tagValue);
  if (!root) return [];
  return collectDirectedDescendants(getSortedTagInheritanceAdjacency(inheritance), root);
}
function wouldCreateTagInheritanceCycle(inheritance, parentValue, childValue) {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  if (!parent || !child) return true;
  return wouldCreateDirectedCycle(inheritance.childrenByParent, parent, child);
}
function getTagInheritanceMode(inheritance, parentValue, childValue) {
  var _a;
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  if (!parent || !child) return "all";
  return ((_a = inheritance.modeByParentChild[parent]) == null ? void 0 : _a[child]) === "selected" ? "selected" : "all";
}
function getIncludedInheritedPaths(inheritance, parentValue, childValue) {
  var _a;
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  if (!parent || !child) return [];
  return [...((_a = inheritance.includedPathsByParentChild[parent]) == null ? void 0 : _a[child]) || []];
}
function getExcludedInheritedPaths(inheritance, parentValue, childValue) {
  var _a;
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  if (!parent || !child) return [];
  return [...((_a = inheritance.excludedPathsByParentChild[parent]) == null ? void 0 : _a[child]) || []];
}
function isInheritanceEdgePathVisible(inheritance, parentValue, childValue, path, isDirect = true) {
  const parent = normalizeTag(parentValue);
  const child = normalizeTag(childValue);
  if (!parent || !child || !path) return false;
  if (isFixedTagEdge(inheritance, parent, child)) return true;
  if (!isDirect) return !getExcludedInheritedPaths(inheritance, parent, child).includes(path);
  return getTagInheritanceMode(inheritance, parent, child) === "selected" ? getIncludedInheritedPaths(inheritance, parent, child).includes(path) : !getExcludedInheritedPaths(inheritance, parent, child).includes(path);
}
function isInheritancePathVisible(inheritance, edges, path, ignoredEdge = null) {
  const list = edges || [];
  return list.every((edge, index) => ignoredEdge && edge.parent === ignoredEdge.parent && edge.child === ignoredEdge.child ? true : isInheritanceEdgePathVisible(inheritance, edge.parent, edge.child, path, index === list.length - 1));
}
function createInheritanceEdgesFromLineage(inheritance, lineage) {
  const edges = [];
  for (let index = 1; index < (lineage || []).length; index += 1) {
    const parent = lineage[index - 1];
    const child = lineage[index];
    edges.push({ parent, child, fixed: isFixedTagEdge(inheritance, parent, child) });
  }
  return edges;
}
function setParentChildValue(target, parent, child, value) {
  if (value === void 0 || Array.isArray(value) && !value.length) {
    if (target[parent]) {
      delete target[parent][child];
      if (!Object.keys(target[parent]).length) delete target[parent];
    }
    return;
  }
  if (!target[parent]) target[parent] = {};
  target[parent][child] = value;
}
function cloneParentChildSettings(source) {
  return Object.fromEntries(Object.entries(source || {}).map(([parent, children]) => [
    parent,
    Object.fromEntries(Object.entries(children || {}).map(([child, value]) => [
      child,
      Array.isArray(value) ? [...value] : value
    ]))
  ]));
}

// src/relations.ts
var createEmptyRelations = () => ({
  version: 6,
  tagInheritance: {
    childrenByParent: {},
    enabledParents: [],
    excludedPathsByParentChild: {},
    modeByParentChild: {},
    includedPathsByParentChild: {},
    fixedParentByChild: {}
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
    const sourceVersion = Number(source.version);
    result.version = sourceVersion >= 6 ? 6 : sourceVersion >= 5 ? 5 : sourceVersion >= 4 ? 4 : sourceVersion >= 3 ? 3 : sourceVersion >= 2 ? 2 : 1;
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
    const normalizePaths = (rawPaths) => Array.from(new Set((Array.isArray(rawPaths) ? rawPaths : []).map((path) => typeof path === "string" ? path.trim() : "").filter(Boolean)));
    const copyParentChildPaths = (targetKey, sourceKey) => {
      const rawParents = inheritance[sourceKey];
      if (!rawParents || typeof rawParents !== "object" || Array.isArray(rawParents)) return;
      for (const [rawParent, rawChildren2] of Object.entries(rawParents)) {
        const parent = normalizeTag(rawParent);
        if (!parent || isNestedTag(parent) || !rawChildren2 || typeof rawChildren2 !== "object" || Array.isArray(rawChildren2)) continue;
        for (const [rawChild, rawPaths] of Object.entries(rawChildren2)) {
          const child = normalizeTag(rawChild);
          if (!child || isNestedTag(child) || !(result.tagInheritance.childrenByParent[parent] || []).includes(child)) continue;
          const paths = normalizePaths(rawPaths);
          if (!paths.length) continue;
          if (!result.tagInheritance[targetKey][parent]) result.tagInheritance[targetKey][parent] = {};
          result.tagInheritance[targetKey][parent][child] = paths;
        }
      }
    };
    if (sourceVersion >= 5) {
      copyParentChildPaths("excludedPathsByParentChild", "excludedPathsByParentChild");
      copyParentChildPaths("includedPathsByParentChild", "includedPathsByParentChild");
      const rawModes = inheritance.modeByParentChild;
      if (rawModes && typeof rawModes === "object" && !Array.isArray(rawModes)) {
        for (const [rawParent, rawChildren2] of Object.entries(rawModes)) {
          const parent = normalizeTag(rawParent);
          if (!parent || !rawChildren2 || typeof rawChildren2 !== "object" || Array.isArray(rawChildren2)) continue;
          for (const [rawChild, rawMode] of Object.entries(rawChildren2)) {
            const child = normalizeTag(rawChild);
            if (rawMode !== "selected" || !(result.tagInheritance.childrenByParent[parent] || []).includes(child)) continue;
            if (!result.tagInheritance.modeByParentChild[parent]) result.tagInheritance.modeByParentChild[parent] = {};
            result.tagInheritance.modeByParentChild[parent][child] = "selected";
          }
        }
      }
    } else {
      const rawExclusions = inheritance.excludedPathsByParent || {};
      const rawIncluded = inheritance.includedPathsByParent || {};
      const rawModes = inheritance.modeByParent || {};
      for (const [parent, children] of Object.entries(result.tagInheritance.childrenByParent)) {
        const excluded = normalizePaths(rawExclusions[parent]);
        const included = normalizePaths(rawIncluded[parent]);
        for (const child of children) {
          if (excluded.length) {
            if (!result.tagInheritance.excludedPathsByParentChild[parent]) result.tagInheritance.excludedPathsByParentChild[parent] = {};
            result.tagInheritance.excludedPathsByParentChild[parent][child] = [...excluded];
          }
          if (included.length) {
            if (!result.tagInheritance.includedPathsByParentChild[parent]) result.tagInheritance.includedPathsByParentChild[parent] = {};
            result.tagInheritance.includedPathsByParentChild[parent][child] = [...included];
          }
          if (rawModes[parent] === "selected") {
            if (!result.tagInheritance.modeByParentChild[parent]) result.tagInheritance.modeByParentChild[parent] = {};
            result.tagInheritance.modeByParentChild[parent][child] = "selected";
          }
        }
      }
    }
    const rawFixedParents = inheritance.fixedParentByChild;
    if (rawFixedParents && typeof rawFixedParents === "object" && !Array.isArray(rawFixedParents)) {
      for (const [rawChild, rawParent] of Object.entries(rawFixedParents)) {
        const child = normalizeTag(rawChild);
        const parent = normalizeTag(rawParent);
        if (child && parent && !isNestedTag(child) && !isNestedTag(parent)) {
          result.tagInheritance.fixedParentByChild[child] = parent;
        }
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
    this.reconcileFixedTagRelations();
    return result;
  }
  getTagInheritanceSettings() {
    if (!this.settings.relations) this.normalizeRelationSettings();
    const inheritance = this.settings.relations.tagInheritance;
    if (!inheritance.fixedParentByChild || typeof inheritance.fixedParentByChild !== "object") {
      inheritance.fixedParentByChild = {};
    }
    if (!inheritance.modeByParentChild || typeof inheritance.modeByParentChild !== "object") {
      inheritance.modeByParentChild = {};
    }
    if (!inheritance.excludedPathsByParentChild || typeof inheritance.excludedPathsByParentChild !== "object") {
      inheritance.excludedPathsByParentChild = {};
    }
    if (!inheritance.includedPathsByParentChild || typeof inheritance.includedPathsByParentChild !== "object") {
      inheritance.includedPathsByParentChild = {};
    }
    return inheritance;
  }
  parseFixedChildTag(tagValue) {
    return parseFixedChildTag(tagValue);
  }
  isFixedTagRelationEligible(parentValue, childValue) {
    return isFixedTagRelationEligible(this.getTagInheritanceSettings(), parentValue, childValue);
  }
  getFixedParent(childValue) {
    return getFixedParent(this.getTagInheritanceSettings(), childValue);
  }
  isFixedChild(tagValue) {
    return isFixedChild(this.getTagInheritanceSettings(), tagValue);
  }
  isFixedTagEdge(parentValue, childValue) {
    return isFixedTagEdge(this.getTagInheritanceSettings(), parentValue, childValue);
  }
  getFixedChildDisplayName(tagValue) {
    return getFixedChildDisplayName(tagValue);
  }
  getTopLevelFixedParent(tagValue) {
    return getTopLevelFixedParent(this.getTagInheritanceSettings(), tagValue);
  }
  filterInheritanceTreeByTags(tree, includedTags) {
    if (!tree) return null;
    const allowed = new Set(Array.from(includedTags || []).map(normalizeTag).filter(Boolean));
    const visit = (node, isRoot = false) => {
      const children = (node.children || []).map((child) => visit(child)).filter(Boolean);
      if (!isRoot && !allowed.has(node.tag) && children.length === 0) return null;
      const paths = isRoot || !allowed.has(node.tag) ? [] : [...node.paths];
      const subtreePaths = Array.from(/* @__PURE__ */ new Set([
        ...paths,
        ...children.flatMap((child) => child.subtreePaths)
      ]));
      return { ...node, paths, children, subtreePaths };
    };
    return visit(tree, true);
  }
  createFixedSearchBrowseData(tagValue, includedTags) {
    const browseData = this.getTagBrowseData(tagValue);
    const inheritanceTree = this.filterInheritanceTreeByTags(browseData.inheritanceTree, includedTags);
    const paths = (inheritanceTree == null ? void 0 : inheritanceTree.subtreePaths) || [];
    const files = paths.map((path) => this.app.vault.getAbstractFileByPath(path)).filter((file) => file instanceof import_obsidian15.TFile && file.extension === "md");
    return {
      ...browseData,
      exactFiles: [],
      inheritedFiles: files,
      files,
      inheritanceTree,
      exactCount: 0,
      inheritedCount: files.length,
      hasActiveInheritance: !!(inheritanceTree == null ? void 0 : inheritanceTree.children.length)
    };
  }
  reconcileFixedTagRelations() {
    var _a;
    const inheritance = (_a = this.settings.relations) == null ? void 0 : _a.tagInheritance;
    if (!inheritance) return false;
    const previous = inheritance.fixedParentByChild || {};
    const next = {};
    for (const [rawChild, rawParent] of Object.entries(previous)) {
      const child = normalizeTag(rawChild);
      const parent = normalizeTag(rawParent);
      if (!child || !parent || !this.isFixedTagRelationEligible(parent, child)) continue;
      next[child] = parent;
    }
    const changed = JSON.stringify(previous) !== JSON.stringify(next);
    inheritance.fixedParentByChild = next;
    return changed;
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
      if (!(file instanceof import_obsidian15.TFile) || file.extension !== "md") throw new Error("\u7236\u7B14\u8BB0\u65E0\u6548");
    }
    for (const item of children) {
      const file = this.app.vault.getAbstractFileByPath(item.path);
      if (!(file instanceof import_obsidian15.TFile) || file.extension !== "md") throw new Error("\u5B50\u7B14\u8BB0\u65E0\u6548");
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
      if (!alias || !(childFile instanceof import_obsidian15.TFile) || !this.getNoteAliases(childFile).includes(alias)) continue;
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
    if (!(file instanceof import_obsidian15.TFile)) return "";
    const selected = this.getNoteHierarchySettings().displayNamesByParentPath[parentPath] && this.getNoteHierarchySettings().displayNamesByParentPath[parentPath][file.path];
    return selected && this.getNoteAliases(file).includes(selected) ? selected : file.basename;
  }
  async setHierarchyDisplayName(parentPath, file, displayName) {
    if (!(file instanceof import_obsidian15.TFile) || !this.getHierarchyChildren(parentPath).includes(file.path)) return;
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
    if (!(parentFile instanceof import_obsidian15.TFile) || parentFile.extension !== "md" || !Array.isArray(childPaths) || !childPaths.length) return null;
    const descendants = this.getHierarchyDescendants(parentPath);
    const directCount = this.getHierarchyChildren(parentPath).filter((path) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      return file instanceof import_obsidian15.TFile && file.extension === "md";
    }).length;
    const descendantCount = new Set(descendants.filter((path) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      return file instanceof import_obsidian15.TFile && file.extension === "md";
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
    if (!(currentFile instanceof import_obsidian15.TFile) || currentFile.extension !== "md") currentNotePath = "";
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
        if (!(parentFile instanceof import_obsidian15.TFile) || parentFile.extension !== "md" || !Array.isArray(childPaths) || !childPaths.length) continue;
        const parentNames = [parentFile.basename, ...this.getNoteAliases(parentFile)].map((name) => name.toLowerCase());
        if (parentQuery && !parentNames.some((name) => name.includes(parentQuery))) continue;
        const descendants = this.getHierarchyDescendants(parentPath);
        const matchingPaths = childQuery ? descendants.filter((path) => {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (!(file instanceof import_obsidian15.TFile)) return false;
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
      currentNotePath: file instanceof import_obsidian15.TFile && file.extension === "md" ? file.path : ""
    };
  }
  getHierarchyEdgeCount() {
    let count = 0;
    for (const [parentPath, children] of Object.entries(this.getNoteHierarchySettings().childrenByParentPath)) {
      const parentFile = this.app.vault.getAbstractFileByPath(parentPath);
      if (!(parentFile instanceof import_obsidian15.TFile) || parentFile.extension !== "md") continue;
      for (const childPath of Array.isArray(children) ? children : []) {
        const childFile = this.app.vault.getAbstractFileByPath(childPath);
        if (childFile instanceof import_obsidian15.TFile && childFile.extension === "md") count += 1;
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
  migrateInlineTagBranchState(oldTagValue, newTagValue) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);
    const collapsed = this.collapsedInlineHierarchyBranches;
    if (!oldTag || !newTag || oldTag === newTag || !(collapsed == null ? void 0 : collapsed.size)) return false;
    let changed = false;
    const migrated = /* @__PURE__ */ new Set();
    for (const rawKey of collapsed) {
      const parts = String(rawKey).split("\0");
      if (parts[0] === oldTag) {
        parts[0] = newTag;
        changed = true;
      }
      if (parts[1] === "tag-group" && parts[2]) {
        const lineage = parts[2].split("");
        const nextLineage = lineage.map((tag) => tag === oldTag ? newTag : tag);
        if (nextLineage.some((tag, index) => tag !== lineage[index])) {
          parts[2] = nextLineage.join("");
          changed = true;
        }
      }
      migrated.add(parts.join("\0"));
    }
    if (!changed) return false;
    this.collapsedInlineHierarchyBranches = migrated;
    this.inlineHierarchyExpansionVersion = (this.inlineHierarchyExpansionVersion || 0) + 1;
    return true;
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
  refreshHierarchyViews() {
    this.relationStructureVersion = (this.relationStructureVersion || 0) + 1;
    this.refreshAllTagViews();
  }
  getHierarchyNavigationHistory(view, surface) {
    if (!view.hierarchyNavigationHistory) {
      view.hierarchyNavigationHistory = createHierarchyNavigationHistory();
    }
    return view.hierarchyNavigationHistory;
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
    if (!(file instanceof import_obsidian15.TFile) || file.extension !== "md") return;
    const keyword = DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD;
    const relationParentPath = sourceEl && sourceEl.dataset && sourceEl.dataset.puffsHierarchyParent;
    const relationParent = relationParentPath && this.app.vault.getAbstractFileByPath(relationParentPath);
    const query = relationParent instanceof import_obsidian15.TFile && relationParent.extension === "md" ? `${keyword}${relationParent.basename}*${file.basename}` : this.getHierarchyParents(path).length > 0 ? `${keyword}${keyword}${file.basename}` : `${keyword}${file.basename}`;
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_SIDEBAR_VIEW_TYPE)) {
      const view = leaf.view;
      if (!view || !view.containerEl || !view.containerEl.contains(sourceEl)) continue;
      this.pushHierarchyNavigationForView(view, "sidebar", query);
      return;
    }
    new import_obsidian15.Notice("\u672A\u627E\u5230\u6807\u7B7E\u4FA7\u8FB9\u680F\uFF0C\u65E0\u6CD5\u5B9A\u4F4D\u7236\u5B50\u5173\u7CFB");
  }
  getInheritanceChildren(tagValue) {
    return getInheritanceChildren(this.getTagInheritanceSettings(), tagValue);
  }
  initializeTagInheritanceOrder() {
    const relations = this.settings.relations;
    if (!relations || Number(relations.version) >= 6) return false;
    const inheritance = this.getTagInheritanceSettings();
    if (Number(relations.version) < 2) {
      const nextChildrenByParent = {};
      for (const [parent, children] of Object.entries(inheritance.childrenByParent)) {
        const orderedChildren = this.sortTagsByVisibleCount(children);
        if (orderedChildren.length > 0) nextChildrenByParent[parent] = orderedChildren;
      }
      inheritance.childrenByParent = nextChildrenByParent;
    }
    if (!inheritance.fixedParentByChild || typeof inheritance.fixedParentByChild !== "object") {
      inheritance.fixedParentByChild = {};
    }
    this.reconcileFixedTagRelations();
    this.reconcileInheritancePathLists();
    relations.version = 6;
    return true;
  }
  getTagVisibleNoteCount(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return 0;
    return this.getTagBrowseData(tag).files.length;
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
    return getSortedTagInheritanceAdjacency(this.getTagInheritanceSettings());
  }
  getFixedTagInheritanceAdjacency() {
    return getFixedTagInheritanceAdjacency(this.getTagInheritanceSettings());
  }
  getActiveTagInheritanceAdjacency(tagValue) {
    return this.isTagInheritanceEnabled(tagValue) ? this.getSortedTagInheritanceAdjacency() : this.getFixedTagInheritanceAdjacency();
  }
  hasFreeInheritanceBranch(tagValue) {
    const root = normalizeTag(tagValue);
    if (!root) return false;
    const adjacency = this.getSortedTagInheritanceAdjacency();
    const visit = (parent, branch) => {
      if (branch.has(parent)) return false;
      const nextBranch = new Set(branch);
      nextBranch.add(parent);
      for (const child of adjacency[parent] || []) {
        if (!this.isFixedTagEdge(parent, child)) return true;
        if (visit(child, nextBranch)) return true;
      }
      return false;
    };
    return visit(root, /* @__PURE__ */ new Set());
  }
  getInheritanceParents(tagValue) {
    return getInheritanceParents(this.getTagInheritanceSettings(), tagValue);
  }
  getTagInheritanceGroupKeys(tagValue) {
    var _a;
    const tag = normalizeTag(tagValue);
    const browseData = tag && this.getTagBrowseData(tag);
    const tree = ((_a = browseData == null ? void 0 : browseData.hasActiveInheritance) != null ? _a : browseData == null ? void 0 : browseData.inheritanceEnabled) ? browseData.inheritanceTree : null;
    if (!tree || !tree.children.length) return [];
    const keys = [];
    const prefix = `${tag}\0tag-group\0`;
    if (tree.paths.length) keys.push(`${prefix}original`);
    const visit = (node, lineage) => {
      const key = `${prefix}${lineage.join("")}`;
      keys.push(key);
      if (node.children.length && node.paths.length) keys.push(`${key}\0original`);
      for (const child of node.children) visit(child, [...lineage, child.tag]);
    };
    for (const child of tree.children) visit(child, [child.tag]);
    return keys;
  }
  getUniqueSearchInheritanceControl(items, queryValue, expandedTags = this.expandedTags, matchingItems = items) {
    const query = String(queryValue || "").trim();
    if (query ? matchingItems.length !== 1 : !this.isPinnedOnlyTagResult(queryValue, items)) return null;
    const tags = Array.from(new Set(items.map((item) => item.tag)));
    const keys = [];
    for (const tag of tags) {
      const tagKeys = this.getTagInheritanceGroupKeys(tag);
      if (!tagKeys.length) return null;
      keys.push(...tagKeys);
    }
    const collapsed = this.collapsedInlineHierarchyBranches || /* @__PURE__ */ new Set();
    return {
      tags,
      keys,
      shouldExpand: tags.some((tag) => !(expandedTags == null ? void 0 : expandedTags.has(tag))) || keys.every((key) => collapsed.has(key))
    };
  }
  setAllTagInheritanceGroupsExpanded(keys, expanded) {
    const collapsed = this.collapsedInlineHierarchyBranches || /* @__PURE__ */ new Set();
    this.collapsedInlineHierarchyBranches = collapsed;
    let changed = false;
    for (const key of keys || []) {
      if (expanded) changed = collapsed.delete(key) || changed;
      else if (!collapsed.has(key)) {
        collapsed.add(key);
        changed = true;
      }
    }
    if (changed) this.inlineHierarchyExpansionVersion = (this.inlineHierarchyExpansionVersion || 0) + 1;
    return changed;
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
    return hasInheritanceChildren(this.getTagInheritanceSettings(), tagValue);
  }
  isTagInheritanceEnabled(tagValue) {
    return isTagInheritanceEnabled(this.getTagInheritanceSettings(), tagValue);
  }
  getTagInheritanceMode(parentValue, childValue) {
    return getTagInheritanceMode(this.getTagInheritanceSettings(), parentValue, childValue);
  }
  getIncludedInheritedPaths(parentValue, childValue) {
    return getIncludedInheritedPaths(this.getTagInheritanceSettings(), parentValue, childValue);
  }
  getExcludedInheritedPaths(parentValue, childValue) {
    return getExcludedInheritedPaths(this.getTagInheritanceSettings(), parentValue, childValue);
  }
  setParentChildValue(target, parent, child, value) {
    return setParentChildValue(target, parent, child, value);
  }
  cloneParentChildSettings(source) {
    return cloneParentChildSettings(source);
  }
  isInheritanceEdgePathVisible(parentValue, childValue, path) {
    return isInheritanceEdgePathVisible(this.getTagInheritanceSettings(), parentValue, childValue, path);
  }
  isInheritancePathVisible(edges, path, ignoredEdge = null) {
    return isInheritancePathVisible(this.getTagInheritanceSettings(), edges, path, ignoredEdge);
  }
  createInheritanceEdgesFromLineage(lineage) {
    return createInheritanceEdgesFromLineage(this.getTagInheritanceSettings(), lineage);
  }
  getInheritanceBranchData(tagValue, childValue = null, includeInactive = false) {
    const tag = normalizeTag(tagValue);
    const requestedChild = normalizeTag(childValue);
    if (!tag) return null;
    const tagFileIndex = this.tagFileIndex || /* @__PURE__ */ new Map();
    const directFiles = tagFileIndex.get(tag) || [];
    const exactFiles = typeof this.getOrderedFilesForTag === "function" ? this.getOrderedFilesForTag(tag, directFiles) : directFiles;
    const exactPaths = exactFiles.map((file) => file.path);
    const orderedBranches = [];
    const orderedPathsByTag = { [tag]: exactPaths };
    const fixedTags = /* @__PURE__ */ new Set();
    const adjacency = includeInactive ? this.getSortedTagInheritanceAdjacency() : this.getActiveTagInheritanceAdjacency(tag);
    const visit = (sourceTag, edges, branch = /* @__PURE__ */ new Set([tag])) => {
      if (branch.has(sourceTag)) return;
      const nextBranch = new Set(branch);
      nextBranch.add(sourceTag);
      const paths = (typeof this.getOrderedFilesForTag === "function" ? this.getOrderedFilesForTag(sourceTag, tagFileIndex.get(sourceTag) || []) : tagFileIndex.get(sourceTag) || []).map((file) => file.path);
      const fixed = edges.length > 0 && edges.every((edge) => edge.fixed);
      orderedBranches.push({ source: sourceTag, paths, fixed, edges });
      if (fixed) fixedTags.add(sourceTag);
      orderedPathsByTag[sourceTag] = paths;
      for (const child of adjacency[sourceTag] || []) {
        visit(child, [
          ...edges,
          { parent: sourceTag, child, fixed: this.isFixedTagEdge(sourceTag, child) }
        ], nextBranch);
      }
    };
    const rootChildren = requestedChild ? (adjacency[tag] || []).filter((child) => child === requestedChild) : adjacency[tag] || [];
    for (const child of rootChildren) {
      visit(child, [{ parent: tag, child, fixed: this.isFixedTagEdge(tag, child) }], /* @__PURE__ */ new Set([tag]));
    }
    return { tag, exactFiles, exactPaths, orderedBranches, orderedPathsByTag, fixedTags, adjacency };
  }
  getInheritanceCandidates(parentValue, childValue) {
    var _a, _b;
    const branchData = this.getInheritanceBranchData(parentValue, childValue, true);
    if (!branchData) return [];
    const exactPaths = new Set(branchData.exactPaths);
    const candidatesByPath = /* @__PURE__ */ new Map();
    for (const branch of branchData.orderedBranches) {
      for (const path of branch.paths || []) {
        if (!path || exactPaths.has(path) || !this.isInheritancePathVisible(branch.edges.slice(1), path)) continue;
        let candidate = candidatesByPath.get(path);
        if (!candidate) {
          const file = ((_b = (_a = this.app) == null ? void 0 : _a.vault) == null ? void 0 : _b.getAbstractFileByPath(path)) || Array.from((this.tagFileIndex || /* @__PURE__ */ new Map()).values()).flat().find((item) => item.path === path) || null;
          candidate = { path, file, source: branch.source, sources: [], fixed: false };
          candidatesByPath.set(path, candidate);
        }
        if (!candidate.sources.includes(branch.source)) candidate.sources.push(branch.source);
        candidate.fixed = candidate.fixed || !!branch.fixed;
      }
    }
    return Array.from(candidatesByPath.values());
  }
  reconcileInheritancePathLists(parentValues = null) {
    const inheritance = this.getTagInheritanceSettings();
    const requestedParents = parentValues ? Array.from(new Set(parentValues.map(normalizeTag).filter(Boolean))) : Array.from(/* @__PURE__ */ new Set([
      ...Object.keys(inheritance.childrenByParent),
      ...Object.keys(inheritance.excludedPathsByParentChild),
      ...Object.keys(inheritance.includedPathsByParentChild)
    ]));
    const parents = new Set(requestedParents);
    if (parentValues) {
      const queue = [...requestedParents];
      while (queue.length) {
        const child = queue.shift();
        for (const parent of this.getInheritanceParents(child)) {
          if (parents.has(parent)) continue;
          parents.add(parent);
          queue.push(parent);
        }
      }
    }
    const beforeIncluded = JSON.stringify(inheritance.includedPathsByParentChild);
    const beforeExcluded = JSON.stringify(inheritance.excludedPathsByParentChild);
    const visited = /* @__PURE__ */ new Set();
    const reconcileParent = (parent) => {
      var _a;
      if (!parent || visited.has(parent) || !parents.has(parent)) return;
      visited.add(parent);
      for (const child of inheritance.childrenByParent[parent] || []) reconcileParent(child);
      const children = new Set(inheritance.childrenByParent[parent] || []);
      for (const key of ["modeByParentChild", "excludedPathsByParentChild", "includedPathsByParentChild"]) {
        for (const child of Object.keys(inheritance[key][parent] || {})) {
          if (!children.has(child)) this.setParentChildValue(inheritance[key], parent, child, void 0);
        }
      }
      for (const child of children) {
        const freePaths = new Set(this.getInheritanceCandidates(parent, child).filter((candidate) => !candidate.fixed).map((candidate) => candidate.path));
        for (const key of ["excludedPathsByParentChild", "includedPathsByParentChild"]) {
          const nextPaths = (((_a = inheritance[key][parent]) == null ? void 0 : _a[child]) || []).filter((path) => freePaths.has(path) && // 白名单额外收窄到直接笔记：跨层条目在新规则下不再被读取，留着就是死数据
          (key === "excludedPathsByParentChild" || this.isDirectInheritedPath(child, path)));
          this.setParentChildValue(inheritance[key], parent, child, nextPaths.length ? nextPaths : void 0);
        }
      }
    };
    for (const parent of parents) reconcileParent(parent);
    return beforeIncluded !== JSON.stringify(inheritance.includedPathsByParentChild) || beforeExcluded !== JSON.stringify(inheritance.excludedPathsByParentChild);
  }
  /**
   * 这篇笔记是不是直接挂在该子标签上的。
   *
   * 「选择继承」的白名单只管直接笔记；更深层冒上来的笔记由更深的边决定，本边只能排除
   * （见 core/inheritance.ts 的 isInheritanceEdgePathVisible）。写入侧要按同一口径分流，
   * 否则勾选面板会把深层笔记写进永远不被读取的白名单里。
   */
  isDirectInheritedPath(childValue, path) {
    var _a;
    const child = normalizeTag(childValue);
    if (!child || !path) return false;
    return (((_a = this.tagFileIndex) == null ? void 0 : _a.get(child)) || []).some((file) => file.path === path);
  }
  collectVisiblePathsForEdge(parent, child) {
    const selectedMode = this.getTagInheritanceMode(parent, child) === "selected";
    const included = new Set(this.getIncludedInheritedPaths(parent, child));
    const excluded = new Set(this.getExcludedInheritedPaths(parent, child));
    const freeCandidates = this.getInheritanceCandidates(parent, child).filter((candidate) => !candidate.fixed);
    return new Set(freeCandidates.filter((candidate) => selectedMode && this.isDirectInheritedPath(child, candidate.path) ? included.has(candidate.path) : !excluded.has(candidate.path)).map((candidate) => candidate.path));
  }
  propagateNewlyAllowedPathsToAncestors(childTagValue, newlyAllowedPaths) {
    const startTag = normalizeTag(childTagValue);
    const paths = Array.from(new Set((newlyAllowedPaths || []).map((path) => typeof path === "string" ? path.trim() : "").filter(Boolean)));
    if (!startTag || !paths.length) return;
    const visited = /* @__PURE__ */ new Set([startTag]);
    const queue = [startTag];
    while (queue.length) {
      const child = queue.shift();
      for (const parent of this.getInheritanceParents(child)) {
        if (!this.isFixedTagEdge(parent, child)) {
          for (const path of paths) this.applyInheritedFileVisibilityToEdge(parent, child, path, true);
        }
        if (visited.has(parent)) continue;
        visited.add(parent);
        queue.push(parent);
      }
    }
  }
  async setTagInheritanceMode(parentValue, childValue, modeValue) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    const mode = modeValue === "selected" ? "selected" : "all";
    if (!parent || !child || !this.getInheritanceChildren(parent).includes(child)) throw new Error("\u7EE7\u627F\u5173\u7CFB\u65E0\u6548");
    if (this.isFixedTagEdge(parent, child)) throw new Error("\u56FA\u5B9A\u5B50\u6807\u7B7E\u4E0D\u80FD\u5207\u6362\u7EE7\u627F\u6A21\u5F0F");
    const inheritance = this.getTagInheritanceSettings();
    const previousModes = inheritance.modeByParentChild;
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousExcluded = inheritance.excludedPathsByParentChild;
    const currentMode = this.getTagInheritanceMode(parent, child);
    if (currentMode === mode) return;
    const freeCandidates = this.getInheritanceCandidates(parent, child).filter((candidate) => !candidate.fixed);
    const currentVisible = this.collectVisiblePathsForEdge(parent, child);
    inheritance.modeByParentChild = this.cloneParentChildSettings(previousModes);
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    if (mode === "selected") {
      this.setParentChildValue(inheritance.modeByParentChild, parent, child, "selected");
      const paths = freeCandidates.filter((candidate) => this.isDirectInheritedPath(child, candidate.path) && currentVisible.has(candidate.path)).map((candidate) => candidate.path);
      const hiddenDeepPaths = freeCandidates.filter((candidate) => !this.isDirectInheritedPath(child, candidate.path) && !currentVisible.has(candidate.path)).map((candidate) => candidate.path);
      this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, paths.length ? paths : void 0);
      this.setParentChildValue(
        inheritance.excludedPathsByParentChild,
        parent,
        child,
        hiddenDeepPaths.length ? hiddenDeepPaths : void 0
      );
    } else {
      this.setParentChildValue(inheritance.modeByParentChild, parent, child, void 0);
      const paths = freeCandidates.filter((candidate) => !currentVisible.has(candidate.path)).map((candidate) => candidate.path);
      this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, paths.length ? paths : void 0);
      this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, void 0);
    }
    this.propagateNewlyAllowedPathsToAncestors(
      parent,
      Array.from(this.collectVisiblePathsForEdge(parent, child)).filter((path) => !currentVisible.has(path))
    );
    this.reconcileInheritancePathLists([parent]);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.modeByParentChild = previousModes;
      inheritance.includedPathsByParentChild = previousIncluded;
      inheritance.excludedPathsByParentChild = previousExcluded;
      throw error;
    }
    this.refreshHierarchyViews();
  }
  async setIncludedInheritedPaths(parentValue, childValue, pathValues) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child || !this.getInheritanceChildren(parent).includes(child)) throw new Error("\u7EE7\u627F\u5173\u7CFB\u65E0\u6548");
    const inheritance = this.getTagInheritanceSettings();
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousExcluded = inheritance.excludedPathsByParentChild;
    const allowed = new Set(this.getInheritanceCandidates(parent, child).filter((candidate) => !candidate.fixed && this.isDirectInheritedPath(child, candidate.path)).map((candidate) => candidate.path));
    const paths = Array.from(new Set((pathValues || []).map((path) => typeof path === "string" ? path.trim() : "").filter((path) => path && allowed.has(path))));
    const previouslyVisible = this.collectVisiblePathsForEdge(parent, child);
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, paths.length ? paths : void 0);
    this.propagateNewlyAllowedPathsToAncestors(parent, paths.filter((path) => !previouslyVisible.has(path)));
    this.reconcileInheritancePathLists([parent]);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.includedPathsByParentChild = previousIncluded;
      inheritance.excludedPathsByParentChild = previousExcluded;
      throw error;
    }
    this.refreshHierarchyViews();
  }
  applyInheritedFileVisibilityToEdge(parent, child, path, visible) {
    const inheritance = this.getTagInheritanceSettings();
    if (this.getTagInheritanceMode(parent, child) === "selected" && this.isDirectInheritedPath(child, path)) {
      const paths = new Set(this.getIncludedInheritedPaths(parent, child));
      if (visible) paths.add(path);
      else paths.delete(path);
      this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, paths.size ? Array.from(paths) : void 0);
    } else {
      const paths = new Set(this.getExcludedInheritedPaths(parent, child));
      if (visible) paths.delete(path);
      else paths.add(path);
      this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, paths.size ? Array.from(paths) : void 0);
    }
  }
  /**
   * 批量设置一条边上若干笔记的可见性。
   *
   * 勾选面板的「全选/全不选」一次能改几十行，逐条走单篇版本会重复落盘、重复刷视图，
   * 这里合成一次保存。每条写进白名单还是黑名单由 applyInheritedFileVisibilityToEdge 分流。
   */
  async setEdgePathsVisible(parentValue, childValue, entries) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child) return;
    const candidates = new Map(this.getInheritanceCandidates(parent, child).map((item) => [item.path, item]));
    const changes = Array.from(entries || []).map((entry) => ({ path: entry && entry.path, visible: !!(entry && entry.visible) })).filter((entry) => entry.path && candidates.has(entry.path) && !candidates.get(entry.path).fixed);
    if (!changes.length) return;
    const inheritance = this.getTagInheritanceSettings();
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousExcluded = inheritance.excludedPathsByParentChild;
    const previouslyVisible = this.collectVisiblePathsForEdge(parent, child);
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    for (const { path, visible } of changes) this.applyInheritedFileVisibilityToEdge(parent, child, path, visible);
    this.propagateNewlyAllowedPathsToAncestors(
      parent,
      changes.filter((entry) => entry.visible && !previouslyVisible.has(entry.path)).map((entry) => entry.path)
    );
    this.reconcileInheritancePathLists([parent]);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.includedPathsByParentChild = previousIncluded;
      inheritance.excludedPathsByParentChild = previousExcluded;
      throw error;
    }
    this.refreshHierarchyViews();
  }
  async setInheritedFileVisibleForEdge(parentValue, childValue, path, visible) {
    await this.setEdgePathsVisible(parentValue, childValue, [{ path, visible }]);
  }
  async setInheritedFileVisible(parentValue, path, visible) {
    const parent = normalizeTag(parentValue);
    if (!parent || !path) return;
    const edges = this.getInheritanceChildren(parent).filter((child) => {
      const candidate = this.getInheritanceCandidates(parent, child).find((item) => item.path === path);
      return candidate && !candidate.fixed;
    });
    if (!edges.length) return;
    const inheritance = this.getTagInheritanceSettings();
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousExcluded = inheritance.excludedPathsByParentChild;
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    for (const child of edges) this.applyInheritedFileVisibilityToEdge(parent, child, path, visible);
    this.reconcileInheritancePathLists([parent]);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.includedPathsByParentChild = previousIncluded;
      inheritance.excludedPathsByParentChild = previousExcluded;
      throw error;
    }
    this.refreshHierarchyViews();
  }
  getInheritedFileRemovalTitle(tagValue) {
    return `\u4ECE ${getTagDisplayName(normalizeTag(tagValue))} \u4E2D\u6392\u9664`;
  }
  getTagDescendants(tagValue) {
    return getTagDescendants(this.getTagInheritanceSettings(), tagValue);
  }
  wouldCreateTagInheritanceCycle(parentValue, childValue) {
    return wouldCreateTagInheritanceCycle(this.getTagInheritanceSettings(), parentValue, childValue);
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
    this.reconcileFixedTagRelations();
  }
  async setInheritanceChildren(parentValue, childValues) {
    const parent = normalizeTag(parentValue);
    if (!parent || isNestedTag(parent)) throw new Error("\u7236\u6807\u7B7E\u65E0\u6548");
    const children = [];
    const seen = /* @__PURE__ */ new Set();
    for (const rawChild of childValues || []) {
      const child = normalizeTag(rawChild);
      if (!child || isNestedTag(child) || seen.has(child)) continue;
      const fixedParent = this.getFixedParent(child);
      if (fixedParent && fixedParent !== parent) {
        throw new Error(`${getTagDisplayName(child)} \u662F\u56FA\u5B9A\u5B50\u6807\u7B7E\uFF0C\u8BF7\u5148\u89E3\u9664\u56FA\u5B9A`);
      }
      if (this.wouldCreateTagInheritanceCycle(parent, child)) {
        throw new Error(`\u4E0D\u80FD\u5EFA\u7ACB\u5FAA\u73AF\u7EE7\u627F\uFF1A${getTagDisplayName(parent)} \u2192 ${getTagDisplayName(child)}`);
      }
      seen.add(child);
      children.push(child);
    }
    const inheritance = this.getTagInheritanceSettings();
    const previousChildren = inheritance.childrenByParent;
    const previousEnabled = inheritance.enabledParents;
    const previousModes = inheritance.modeByParentChild;
    const previousExclusions = inheritance.excludedPathsByParentChild;
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousFixedParents = inheritance.fixedParentByChild;
    const wasParent = Array.isArray(previousChildren[parent]) && previousChildren[parent].length > 0;
    const stagedChildren = { ...previousChildren };
    const stagedModes = this.cloneParentChildSettings(previousModes);
    const stagedExclusions = this.cloneParentChildSettings(previousExclusions);
    const stagedIncluded = this.cloneParentChildSettings(previousIncluded);
    let stagedEnabled = [...previousEnabled];
    if (children.length > 0) {
      stagedChildren[parent] = children;
      if (!wasParent && !stagedEnabled.includes(parent)) stagedEnabled.push(parent);
    } else {
      delete stagedChildren[parent];
      stagedEnabled = stagedEnabled.filter((tag) => tag !== parent);
      delete stagedModes[parent];
      delete stagedExclusions[parent];
      delete stagedIncluded[parent];
    }
    inheritance.childrenByParent = stagedChildren;
    inheritance.enabledParents = stagedEnabled;
    inheritance.modeByParentChild = stagedModes;
    inheritance.excludedPathsByParentChild = stagedExclusions;
    inheritance.includedPathsByParentChild = stagedIncluded;
    inheritance.fixedParentByChild = Object.fromEntries(
      Object.entries(previousFixedParents).filter(([child, fixedParent]) => fixedParent !== parent || children.includes(child))
    );
    this.reconcileInheritancePathLists([parent]);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.childrenByParent = previousChildren;
      inheritance.enabledParents = previousEnabled;
      inheritance.modeByParentChild = previousModes;
      inheritance.excludedPathsByParentChild = previousExclusions;
      inheritance.includedPathsByParentChild = previousIncluded;
      inheritance.fixedParentByChild = previousFixedParents;
      throw error;
    }
    this.refreshHierarchyViews();
  }
  async setInheritanceParents(childValue, parentValues) {
    const child = normalizeTag(childValue);
    if (!child || isNestedTag(child)) throw new Error("\u5B50\u6807\u7B7E\u65E0\u6548");
    const parents = Array.from(new Set((parentValues || []).map(normalizeTag).filter(Boolean)));
    if (parents.some((parent) => isNestedTag(parent) || parent === child)) throw new Error("\u7236\u6807\u7B7E\u65E0\u6548");
    const fixedParent = this.getFixedParent(child);
    if (fixedParent && parents.length > 0 && (parents.length !== 1 || parents[0] !== fixedParent)) {
      throw new Error(`${getTagDisplayName(child)} \u662F\u56FA\u5B9A\u5B50\u6807\u7B7E\uFF0C\u8BF7\u5148\u89E3\u9664\u56FA\u5B9A`);
    }
    const inheritance = this.getTagInheritanceSettings();
    const previousChildren = inheritance.childrenByParent;
    const previousEnabled = inheritance.enabledParents;
    const previousModes = inheritance.modeByParentChild;
    const previousExclusions = inheritance.excludedPathsByParentChild;
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousFixedParents = inheritance.fixedParentByChild;
    const affectedParents = Array.from(/* @__PURE__ */ new Set([
      ...Object.entries(previousChildren).filter(([, children]) => children.includes(child)).map(([parent]) => parent),
      ...parents
    ]));
    const stagedChildren = Object.fromEntries(Object.entries(previousChildren).map(([parent, children]) => [
      parent,
      children.filter((tag) => tag !== child)
    ]).filter(([, children]) => children.length));
    for (const parent of parents) {
      if (wouldCreateDirectedCycle(stagedChildren, parent, child)) {
        throw new Error(`\u4E0D\u80FD\u5EFA\u7ACB\u5FAA\u73AF\u7EE7\u627F\uFF1A${getTagDisplayName(parent)} \u2192 ${getTagDisplayName(child)}`);
      }
      stagedChildren[parent] = this.sortTagsByVisibleCount([...stagedChildren[parent] || [], child]);
    }
    inheritance.childrenByParent = stagedChildren;
    const validParents = new Set(Object.keys(stagedChildren));
    const newlyPromotedParents = parents.filter((parent) => {
      var _a;
      return !((_a = previousChildren[parent]) == null ? void 0 : _a.length);
    });
    inheritance.enabledParents = Array.from(/* @__PURE__ */ new Set([
      ...previousEnabled.filter((tag) => validParents.has(tag)),
      ...newlyPromotedParents
    ]));
    inheritance.modeByParentChild = this.cloneParentChildSettings(previousModes);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExclusions);
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.fixedParentByChild = { ...previousFixedParents };
    if (parents.length === 0) delete inheritance.fixedParentByChild[child];
    this.reconcileInheritancePathLists(affectedParents);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.childrenByParent = previousChildren;
      inheritance.enabledParents = previousEnabled;
      inheritance.modeByParentChild = previousModes;
      inheritance.excludedPathsByParentChild = previousExclusions;
      inheritance.includedPathsByParentChild = previousIncluded;
      inheritance.fixedParentByChild = previousFixedParents;
      throw error;
    }
    this.refreshHierarchyViews();
  }
  async setFixedTagRelation(parentValue, childValue, fixed) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child) throw new Error("\u6807\u7B7E\u65E0\u6548");
    if (fixed && !this.isFixedTagRelationEligible(parent, child)) {
      throw new Error("\u56FA\u5B9A\u5B50\u6807\u7B7E\u5FC5\u987B\u7B26\u5408\u201C\u7236\u6807\u7B7E-\u5B50\u540D\u79F0\u201D\u683C\u5F0F\uFF0C\u5E76\u4E14\u53EA\u80FD\u6709\u4E00\u4E2A\u7236\u6807\u7B7E");
    }
    const inheritance = this.getTagInheritanceSettings();
    const previousFixedParents = inheritance.fixedParentByChild;
    const previousModes = inheritance.modeByParentChild;
    const previousExclusions = inheritance.excludedPathsByParentChild;
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousPinnedTag = this.settings.pinnedTag;
    const nextFixedParents = { ...previousFixedParents };
    if (fixed) nextFixedParents[child] = parent;
    else delete nextFixedParents[child];
    inheritance.fixedParentByChild = nextFixedParents;
    inheritance.modeByParentChild = this.cloneParentChildSettings(previousModes);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExclusions);
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    if (fixed) {
      this.setParentChildValue(inheritance.modeByParentChild, parent, child, void 0);
      this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, void 0);
      this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, void 0);
    }
    this.reconcileInheritancePathLists([parent]);
    if (fixed && this.settings.pinnedTag === child) this.settings.pinnedTag = null;
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.fixedParentByChild = previousFixedParents;
      inheritance.modeByParentChild = previousModes;
      inheritance.excludedPathsByParentChild = previousExclusions;
      inheritance.includedPathsByParentChild = previousIncluded;
      this.settings.pinnedTag = previousPinnedTag;
      throw error;
    }
    this.refreshHierarchyViews();
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
    this.refreshAllTagViews();
  }
  /**
   * 标签浏览数据。计算涉及继承分支遍历与继承树构建，开销不小，而一次渲染中
   * 同一标签会被 renderListMode、updateListModeExpandAllButton、toggleAllListModeTags
   * 各自问一遍（150 标签实测 450–600 次）。这里走批次缓存，失效点见 data/tag-store.ts。
   */
  getTagBrowseData(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return this.computeTagBrowseData(tagValue);
    if (!this.tagBrowseCache) return this.computeTagBrowseData(tagValue);
    return this.tagBrowseCache.resolve(tag, () => this.computeTagBrowseData(tagValue));
  }
  computeTagBrowseData(tagValue) {
    var _a;
    const tag = normalizeTag(tagValue);
    if (!tag) return { tag: null, files: [], exactFiles: [], inheritedFiles: [], sourcesByPath: /* @__PURE__ */ new Map(), inheritanceTree: null };
    const branchData = this.getInheritanceBranchData(tag);
    const { exactFiles, exactPaths, orderedBranches, orderedPathsByTag, fixedTags, adjacency } = branchData;
    const seen = new Set(exactPaths);
    const inheritedPaths = [];
    const sourcesByPath = /* @__PURE__ */ new Map();
    const fixedPaths = /* @__PURE__ */ new Set();
    for (const branch of orderedBranches) {
      for (const path of branch.paths || []) {
        if (!path) continue;
        const sources = sourcesByPath.get(path) || [];
        if (!sources.includes(branch.source)) sources.push(branch.source);
        sourcesByPath.set(path, sources);
        if (branch.fixed) fixedPaths.add(path);
        if (!this.isInheritancePathVisible(branch.edges, path)) continue;
        if (seen.has(path)) continue;
        seen.add(path);
        inheritedPaths.push(path);
      }
    }
    const indexedFilesByPath = ((_a = this.app) == null ? void 0 : _a.vault) ? null : new Map(
      Array.from(this.tagFileIndex.values()).flat().map((file) => [file.path, file])
    );
    const inheritedFiles = inheritedPaths.map((path) => {
      var _a2, _b;
      return ((_b = (_a2 = this.app) == null ? void 0 : _a2.vault) == null ? void 0 : _b.getAbstractFileByPath(path)) || (indexedFilesByPath == null ? void 0 : indexedFilesByPath.get(path));
    }).filter((file) => file instanceof import_obsidian15.TFile && file.extension === "md");
    const hasActiveInheritance = !!(adjacency[tag] || []).length;
    const inheritanceTree = hasActiveInheritance ? buildTagInheritanceGroupTree(
      tag,
      adjacency,
      orderedPathsByTag,
      [],
      fixedTags,
      null,
      (_sourceTag, path, lineage) => this.isInheritancePathVisible(
        this.createInheritanceEdgesFromLineage(lineage),
        path
      )
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
      hasInheritance: this.hasInheritanceChildren(tag),
      hasFreeInheritance: this.hasFreeInheritanceBranch(tag),
      hasActiveInheritance,
      fixedTags,
      fixedPaths
    };
  }
  isInheritedFileForTag(tagValue, path) {
    return this.getTagBrowseData(tagValue).inheritedFiles.some((file) => file.path === path);
  }
  getInheritedFileSources(tagValue, path) {
    return this.getTagBrowseData(tagValue).sourcesByPath.get(path) || [];
  }
  isFixedInheritedFileForTag(tagValue, path) {
    var _a;
    const browseData = this.getTagBrowseData(tagValue);
    return ((_a = browseData.fixedPaths) == null ? void 0 : _a.has(path)) || false;
  }
  async excludeInheritedFile(parentValue, path, allowGroupedInheritance = false) {
    const parent = normalizeTag(parentValue);
    if (!parent || !path || !allowGroupedInheritance && !this.isInheritedFileForTag(parent, path)) return;
    if (this.isFixedInheritedFileForTag(parent, path)) return;
    await this.setInheritedFileVisible(parent, path, false);
  }
  async restoreInheritedFile(parentValue, path, childValue = null) {
    const parent = normalizeTag(parentValue);
    if (!parent || !path) return;
    if (childValue) await this.setInheritedFileVisibleForEdge(parent, childValue, path, true);
    else await this.setInheritedFileVisible(parent, path, true);
  }
  migrateTagRelations(oldTagValue, newTagValue) {
    var _a;
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);
    if (!oldTag || !newTag || oldTag === newTag) return;
    const inheritance = this.getTagInheritanceSettings();
    const oldChildren = inheritance.childrenByParent[oldTag] || [];
    const newChildren = inheritance.childrenByParent[newTag] || [];
    const participatesInInheritance = !!(oldChildren.length || Object.values(inheritance.childrenByParent).some((children) => children.includes(oldTag)) || inheritance.enabledParents.includes(oldTag) || inheritance.excludedPathsByParentChild[oldTag] || inheritance.modeByParentChild[oldTag] || inheritance.includedPathsByParentChild[oldTag] || [inheritance.excludedPathsByParentChild, inheritance.modeByParentChild, inheritance.includedPathsByParentChild].some((parents) => Object.values(parents).some((children) => Object.prototype.hasOwnProperty.call(children, oldTag))) || inheritance.fixedParentByChild[oldTag] || Object.values(inheritance.fixedParentByChild).includes(oldTag));
    if (oldChildren.length || newChildren.length) {
      inheritance.childrenByParent[newTag] = Array.from(/* @__PURE__ */ new Set([...oldChildren, ...newChildren])).filter((child) => child !== newTag);
    }
    delete inheritance.childrenByParent[oldTag];
    for (const [parent, children] of Object.entries(inheritance.childrenByParent)) {
      inheritance.childrenByParent[parent] = Array.from(new Set(children.map((child) => child === oldTag ? newTag : child))).filter((child) => child !== parent);
    }
    if (inheritance.enabledParents.includes(oldTag)) inheritance.enabledParents.push(newTag);
    inheritance.enabledParents = Array.from(new Set(inheritance.enabledParents.filter((tag) => tag !== oldTag)));
    for (const key of ["modeByParentChild", "excludedPathsByParentChild", "includedPathsByParentChild"]) {
      const migrated = {};
      for (const [storedParent, children] of Object.entries(inheritance[key] || {})) {
        const parent = storedParent === oldTag ? newTag : storedParent;
        for (const [storedChild, value] of Object.entries(children || {})) {
          const child = storedChild === oldTag ? newTag : storedChild;
          if (parent === child) continue;
          const existing = (_a = migrated[parent]) == null ? void 0 : _a[child];
          const merged = Array.isArray(value) ? Array.from(/* @__PURE__ */ new Set([...Array.isArray(existing) ? existing : [], ...value])) : existing === "selected" || value === "selected" ? "selected" : value;
          this.setParentChildValue(migrated, parent, child, merged);
        }
      }
      inheritance[key] = migrated;
    }
    const migratedFixedParents = {};
    for (const [child, parent] of Object.entries(inheritance.fixedParentByChild || {})) {
      const migratedChild = child === oldTag ? newTag : child;
      const migratedParent = parent === oldTag ? newTag : parent;
      migratedFixedParents[migratedChild] = migratedParent;
    }
    inheritance.fixedParentByChild = migratedFixedParents;
    this.reconcileRelationCycles();
    this.migrateInlineTagBranchState(oldTag, newTag);
    if (participatesInInheritance) {
      this.relationStructureVersion = (this.relationStructureVersion || 0) + 1;
    }
    return participatesInInheritance;
  }
  handleRelationFileRename(file, oldPath) {
    if (!(file instanceof import_obsidian15.TFile) || file.extension !== "md" || !oldPath || !file.path) return;
    const inheritance = this.getTagInheritanceSettings();
    let changed = false;
    for (const key of ["excludedPathsByParentChild", "includedPathsByParentChild"]) {
      for (const children of Object.values(inheritance[key])) {
        for (const [child, paths] of Object.entries(children)) {
          if (!paths.includes(oldPath)) continue;
          children[child] = Array.from(new Set(paths.map((path) => path === oldPath ? file.path : path)));
          changed = true;
        }
      }
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
    if (!(file instanceof import_obsidian15.TFile) || file.extension !== "md" || !file.path) return;
    const inheritance = this.getTagInheritanceSettings();
    let changed = false;
    for (const key of ["excludedPathsByParentChild", "includedPathsByParentChild"]) {
      for (const [parent, children] of Object.entries(inheritance[key])) {
        for (const [child, paths] of Object.entries(children)) {
          const nextPaths = paths.filter((path) => path !== file.path);
          if (nextPaths.length === paths.length) continue;
          this.setParentChildValue(inheritance[key], parent, child, nextPaths.length ? nextPaths : void 0);
          changed = true;
        }
      }
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
    return file instanceof import_obsidian15.TFile && file.extension === "md" ? path : null;
  }
  getTagBoundNoteFile(tagValue) {
    const path = this.getTagBoundNotePath(tagValue);
    if (!path) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof import_obsidian15.TFile && file.extension === "md" ? file : null;
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
    if (!(file instanceof import_obsidian15.TFile) || file.extension !== "md") throw new Error("\u6240\u9009\u7B14\u8BB0\u5DF2\u4E0D\u5B58\u5728");
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
      if (!(file instanceof import_obsidian15.TFile) || file.extension !== "md") continue;
      next[tag] = file.path;
    }
    const changed = JSON.stringify(next) !== JSON.stringify(current);
    if (changed) this.settings.tagBoundNoteByTag = next;
    return changed;
  }
  handleTagBoundNoteFileRename(file, oldPath) {
    if (!(file instanceof import_obsidian15.TFile) || file.extension !== "md" || !oldPath || !file.path) return;
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
    if (!(file instanceof import_obsidian15.TFile) || file.extension !== "md" || !file.path) return;
    const bindings = this.settings.tagBoundNoteByTag || {};
    let changed = false;
    for (const [tag, path] of Object.entries(bindings)) {
      if (path !== file.path) continue;
      delete bindings[tag];
      changed = true;
    }
    if (changed) this.saveSettings();
  }
};

// src/main.ts
var PuffsTagEnhancePlugin = class extends import_obsidian16.Plugin {
  constructor(app, manifest) {
    super(app, manifest);
    this.settings = { ...DEFAULT_SETTINGS };
    this.tagFileIndex = /* @__PURE__ */ new Map();
    this.tagBrowseCache = new TagBrowseCache();
    this.metadataRefreshScheduler = new MetadataRefreshScheduler(
      (changedPaths) => this.runScheduledMetadataRefresh(changedPaths)
    );
    this.expandedTags = /* @__PURE__ */ new Set();
    this.collapsedInlineHierarchyBranches = /* @__PURE__ */ new Set();
    this.inlineHierarchyExpansionVersion = 0;
    this.relationStructureVersion = 0;
    this.selectedNoteOrderTarget = null;
    this.activeTagOrderParent = null;
    this.activeTagOrderSurface = "";
    this.selectedTagOrderTarget = null;
    this.tagOrderModeVisibilityTimer = null;
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
      id: "toggle-tag-sidebar",
      name: "\u6253\u5F00\u6216\u6536\u8D77\u6807\u7B7E\u4FA7\u8FB9\u680F",
      callback: () => this.toggleTagSidebar()
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
      await this.migrateSidebarLayout();
      if (this.isUnloaded) return;
      this.rememberCurrentMainLeaf();
      this.captureSelectedSidebarState();
      this.refreshTagIndexAndViews();
      this.queueInitialTagIndexRefreshes();
      this.applySidebarPreferenceForCurrentFile();
    });
    console.log("Puffs \u6807\u7B7E\u589E\u5F3A: \u5DF2\u52A0\u8F7D");
  }
  onunload() {
    this.isUnloaded = true;
    this.metadataRefreshScheduler.cancel();
    this.tagBrowseCache.invalidate();
    this.deactivateNoteOrderHotkeyScope();
    if (this.tagOrderModeVisibilityTimer) {
      globalThis.clearTimeout(this.tagOrderModeVisibilityTimer);
      this.tagOrderModeVisibilityTimer = null;
    }
    this.clearBackupTimer();
    this.clearInitialTagIndexRefreshTimers();
    this.clearTagRenameProtectionTimer();
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
  RelationsBehavior,
  SidebarRegistryBehavior,
  TagTreeRendererBehavior,
  ContextMenusBehavior,
  OrderControllerBehavior
].forEach(applyBehavior);
var main_default = PuffsTagEnhancePlugin;
