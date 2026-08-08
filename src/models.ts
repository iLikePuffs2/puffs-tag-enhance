import { normalizePath } from "obsidian";
import { createDefaultSidebarToolbarButtons } from "./sidebar-toolbar";
import { CURRENT_SCHEMA_VERSION } from "./data/schema";
import {
  DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD,
  normalizeHierarchySearchKeyword,
} from "./relation-utils";
// 搜索语法与标签名工具已迁入 core/，这里转发以保持既有 import 可用（阶段 5 清理）
import { getTagDisplayName, isNestedTag, normalizeTag } from "./core/tag-name";
import {
  createMultiTagSearchQuery,
  createNoteCardSearchState,
  createTagFilterSearchQuery,
  fileMatchesNoteSearch,
  getTagFilterQuery,
  normalizeSearchTerm,
  parseCurrentNoteTagSearch,
  parseNoteCardSearch,
  parseNoteTagLocateSearch,
  parseSimilarTagSearch,
  splitIntersectionSearchTerms,
  splitUnionSearchTerms,
  tagMatchesAnySearchTerm,
  tagMatchesSearchText,
} from "./core/syntax";

const TAG_VIEW_TYPE = 'tag';
const TAG_SHELF_VIEW_TYPE = 'puffs-tag-shelf-view';
/** 自绘的标签侧边栏。取代寄生在核心插件 tag-pane 上的旧实现。 */
const TAG_SIDEBAR_VIEW_TYPE = 'puffs-tag-sidebar';
const OUTLINE_VIEW_TYPE = 'outline';
const MARKDOWN_VIEW_TYPE = 'markdown';
const VIEW_SYNC_DELAY_MS = 30;
const DEFAULT_QUICK_SEARCH_HOTKEY = 'Ctrl + F';
const DEFAULT_MOVE_NOTE_UP_HOTKEY = 'Alt + Shift + ↑';
const DEFAULT_MOVE_NOTE_DOWN_HOTKEY = 'Alt + Shift + ↓';
const LIST_MODE_ICON = 'list-tree';
const TAG_SYSTEM_ICON = LIST_MODE_ICON;
const INITIAL_TAG_INDEX_REFRESH_DELAYS_MS = [0, 500, 1500, 3000, 6000];
const BACKUP_FILE_NAME = 'tag-data.md';
const MAX_BACKUP_INTERVAL_MINUTES = Math.floor(0x7fffffff / 60000);
const DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD = 10;
/** 长按父级按钮进入排序模式的判定时长。 */
const NOTE_ORDER_LONG_PRESS_MS = 500;

const DEFAULT_SETTINGS = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  autoSwitchToOutlineEnabled: true,
  freezeSearchWhileComposing: true,
  tagSidebarPreferredFiles: [],
  // 这些文件夹（含子文件夹）里的笔记默认开标签面板
  tagSidebarDefaultFolders: [],
  // 上述文件夹里被手动切走的例外笔记 —— 只记例外，不逐篇记录整个文件夹
  tagSidebarExcludedFiles: [],
  noteOrderByTag: {},
  noteDisplayNameByTag: {},
  tagBoundNoteByTag: {},
  newNotePosition: 'end',
  toggleSearchHotkey: DEFAULT_QUICK_SEARCH_HOTKEY,
  moveNoteUpHotkey: DEFAULT_MOVE_NOTE_UP_HOTKEY,
  moveNoteDownHotkey: DEFAULT_MOVE_NOTE_DOWN_HOTKEY,
  backupIntervalMinutes: 0,
  backupFolderPath: '',
  pinnedTag: null,
  scrollTopButtonThreshold: DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD,
  noteHierarchySearchKeyword: DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD,
  sidebarToolbarButtons: createDefaultSidebarToolbarButtons(),
  // 一次性布局迁移标记：把核心插件的标签页换成自绘视图后置位
  sidebarLayoutMigrated: false,
  relations: {
    // 与 relations.ts 的 RELATIONS_VERSION 保持一致
    version: 7,
    tagInheritance: {
      childrenByParent: {},
      excludedPathsByParentChild: {},
      modeByParentChild: {},
      fixedParentByChild: {},
    },
    noteHierarchy: {
      childrenByParentPath: {},
      displayNamesByParentPath: {},
    },
  },
};

function normalizeNewNotePosition(value: any) {
  return value === 'start' ? 'start' : 'end';
}

function normalizeBackupInterval(value: any) {
  const minutes = Math.floor(Number(value));
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.min(minutes, MAX_BACKUP_INTERVAL_MINUTES);
}

function normalizeScrollTopButtonThreshold(value: any) {
  const threshold = Math.floor(Number(value));
  if (!Number.isFinite(threshold)) return DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD;
  return Math.max(0, threshold);
}

function normalizeBackupFolderPath(value: any) {
  const text = String(value || '').trim().replace(/\\/g, '/');
  if (!text) return '';

  const segments = text
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.');
  if (segments.some((segment) => segment === '..' || segment.includes(':'))) return '';
  return normalizePath(segments.join('/'));
}

function normalizeBackupFileName(value: any) {
  const text = String(value || '').trim();
  if (!text) return BACKUP_FILE_NAME;
  if (/[\\/:*?"<>|]/.test(text) || text === '.' || text === '..') return BACKUP_FILE_NAME;
  return text;
}

function getBackupPathParts(value: any) {
  const normalizedPath = normalizeBackupFolderPath(value);
  if (!normalizedPath) {
    return {
      folderPath: '',
      fileName: BACKUP_FILE_NAME,
    };
  }

  const segments = normalizedPath.split('/');
  const lastSegment = segments[segments.length - 1];
  if (lastSegment.includes('.')) {
    return {
      folderPath: normalizeBackupFolderPath(segments.slice(0, -1).join('/')),
      fileName: normalizeBackupFileName(lastSegment),
    };
  }

  return {
    folderPath: normalizedPath,
    fileName: BACKUP_FILE_NAME,
  };
}

function escapeRegExp(value: any) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceInlineTagsByCache(content: any, cache: any, oldTag: any, newTag: any) {
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

function replaceInlineTagsByText(content: any, oldTag: any, newTag: any) {
  const oldName = escapeRegExp(getTagDisplayName(oldTag));
  const tagPattern = new RegExp(`(^|[^\\p{L}\\p{N}_/#-])#${oldName}(?![\\p{L}\\p{N}_/-])`, 'gu');
  return content.replace(tagPattern, (match: any, prefix: any) => `${prefix}${newTag}`);
}

function getFrontmatterTagReplacement(originalValue: any, newTag: any) {
  const text = String(originalValue);
  return text.trim().startsWith('#') ? newTag : getTagDisplayName(newTag);
}

function replaceFrontmatterTagString(value: any, oldTag: any, newTag: any) {
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

function dedupeFrontmatterTagValue(value: any) {
  const tags = flattenFrontmatterTags(value);
  const uniqueTags: any[] = [];
  const seenTags = new Set();
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

function replaceFrontmatterTagValue(value: any, oldTag: any, newTag: any) {
  let nextValue = value;

  if (Array.isArray(value)) {
    nextValue = value.map((item) => replaceFrontmatterTagValue(item, oldTag, newTag));
  } else if (typeof value === 'string') {
    nextValue = replaceFrontmatterTagString(value, oldTag, newTag);
  } else if (value != null && normalizeTag(value) === oldTag) {
    nextValue = getTagDisplayName(newTag);
  }

  return dedupeFrontmatterTagValue(nextValue);
}

function getLeafFilePath(leaf: any) {
  if (!leaf) return null;

  const viewFile = leaf.view && leaf.view.file;
  if (viewFile && viewFile.path) return viewFile.path;

  const viewState = leaf.getViewState ? leaf.getViewState() : null;
  const stateFile = viewState && viewState.state && viewState.state.file;
  return typeof stateFile === 'string' ? stateFile : null;
}

function flattenFrontmatterTags(value: any, output: any[] = []) {
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

function frontmatterTagValueHasTag(value: any, tagValue: any) {
  const tag = normalizeTag(tagValue);
  if (!tag) return false;
  return flattenFrontmatterTags(value).some((item) => normalizeTag(item) === tag);
}

function normalizeHotkeyKey(value: any) {
  const key = String(value || '').trim();
  const normalized = key.toLowerCase();
  if (key === '↑' || normalized === 'arrowup' || normalized === 'up') return 'ArrowUp';
  if (key === '↓' || normalized === 'arrowdown' || normalized === 'down') return 'ArrowDown';
  return key.length === 1 ? key.toUpperCase() : key;
}

function formatHotkeyKey(key: any) {
  if (key === 'ArrowUp') return '↑';
  if (key === 'ArrowDown') return '↓';
  return key;
}

function parseHotkeyText(value: any, fallback = DEFAULT_QUICK_SEARCH_HOTKEY) {
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

function formatHotkey(parsedHotkey: any) {
  return [...parsedHotkey.modifiers, formatHotkeyKey(parsedHotkey.key)].join(' + ');
}

function normalizeHotkeyText(value: any, fallback = DEFAULT_QUICK_SEARCH_HOTKEY) {
  return formatHotkey(parseHotkeyText(value, fallback));
}

export {
  TAG_VIEW_TYPE,
  TAG_SHELF_VIEW_TYPE,
  TAG_SIDEBAR_VIEW_TYPE,
  OUTLINE_VIEW_TYPE,
  MARKDOWN_VIEW_TYPE,
  VIEW_SYNC_DELAY_MS,
  DEFAULT_QUICK_SEARCH_HOTKEY,
  DEFAULT_MOVE_NOTE_UP_HOTKEY,
  DEFAULT_MOVE_NOTE_DOWN_HOTKEY,
  LIST_MODE_ICON,
  TAG_SYSTEM_ICON,
  INITIAL_TAG_INDEX_REFRESH_DELAYS_MS,
  BACKUP_FILE_NAME,
  MAX_BACKUP_INTERVAL_MINUTES,
  DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD,
  NOTE_ORDER_LONG_PRESS_MS,
  DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD,
  DEFAULT_SETTINGS,
  normalizeTag,
  normalizeNewNotePosition,
  normalizeBackupInterval,
  normalizeScrollTopButtonThreshold,
  normalizeHierarchySearchKeyword,
  normalizeBackupFolderPath,
  normalizeBackupFileName,
  getBackupPathParts,
  isNestedTag,
  getTagDisplayName,
  normalizeSearchTerm,
  parseNoteCardSearch,
  getTagFilterQuery,
  parseCurrentNoteTagSearch,
  parseNoteTagLocateSearch,
  parseSimilarTagSearch,
  fileMatchesNoteSearch,
  splitUnionSearchTerms,
  splitIntersectionSearchTerms,
  tagMatchesAnySearchTerm,
  tagMatchesSearchText,
  createMultiTagSearchQuery,
  createTagFilterSearchQuery,
  createNoteCardSearchState,
  escapeRegExp,
  replaceInlineTagsByCache,
  replaceInlineTagsByText,
  getFrontmatterTagReplacement,
  replaceFrontmatterTagString,
  replaceFrontmatterTagValue,
  getLeafFilePath,
  flattenFrontmatterTags,
  frontmatterTagValueHasTag,
  normalizeHotkeyKey,
  formatHotkeyKey,
  parseHotkeyText,
  formatHotkey,
  normalizeHotkeyText
};
