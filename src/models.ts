// @ts-nocheck
import { normalizePath } from "obsidian";
import { createDefaultSidebarToolbarButtons } from "./sidebar-toolbar";

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
const BACKUP_FILE_NAME = 'tag-data.md';
const MAX_BACKUP_INTERVAL_MINUTES = Math.floor(0x7fffffff / 60000);
const DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD = 10;

const DEFAULT_SETTINGS = {
  autoSwitchToOutlineEnabled: true,
  freezeSearchWhileComposing: true,
  tagSidebarPreferredFiles: {},
  noteOrderByTag: {},
  noteDisplayNameByTag: {},
  newNotePosition: 'end',
  toggleSearchHotkey: DEFAULT_QUICK_SEARCH_HOTKEY,
  moveNoteUpHotkey: DEFAULT_MOVE_NOTE_UP_HOTKEY,
  moveNoteDownHotkey: DEFAULT_MOVE_NOTE_DOWN_HOTKEY,
  backupIntervalMinutes: 0,
  backupFolderPath: '',
  pinnedTag: null,
  scrollTopButtonThreshold: DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD,
  sidebarToolbarButtons: createDefaultSidebarToolbarButtons(),
  relations: {
    version: 1,
    tagInheritance: {
      childrenByParent: {},
      enabledParents: [],
      excludedPathsByParent: {},
    },
    noteHierarchy: {
      childrenByParentPath: {},
      displayNamesByParentPath: {},
    },
  },
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
  const text = String(value || '').trim().replace(/\\/g, '/');
  if (!text) return '';

  const segments = text
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.');
  if (segments.some((segment) => segment === '..' || segment.includes(':'))) return '';
  return normalizePath(segments.join('/'));
}

function normalizeBackupFileName(value) {
  const text = String(value || '').trim();
  if (!text) return BACKUP_FILE_NAME;
  if (/[\\/:*?"<>|]/.test(text) || text === '.' || text === '..') return BACKUP_FILE_NAME;
  return text;
}

function getBackupPathParts(value) {
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

function isNestedTag(tag) {
  return String(tag || '').includes('/');
}

function getTagDisplayName(tag) {
  return String(tag || '').replace(/^#/, '');
}

function normalizeSearchTerm(value) {
  return String(value || '').trim().replace(/^#/, '').toLowerCase();
}

function parseNoteCardSearch(value) {
  const text = String(value || '');
  const firstDelimiter = text.indexOf('*');
  if (firstDelimiter < 0) return null;

  const tagQuery = text.slice(0, firstDelimiter).trim();
  const noteQuery = text.slice(firstDelimiter + 1).trim();
  const hasSingleDelimiter = firstDelimiter === text.lastIndexOf('*');
  const mixesTagOperators = tagQuery.includes('|') && tagQuery.includes('&');

  return {
    tagQuery,
    noteQuery,
    isValid: !!tagQuery && !!noteQuery && hasSingleDelimiter && !mixesTagOperators,
    isTagOnly: !!tagQuery && !noteQuery && hasSingleDelimiter && !mixesTagOperators,
  };
}

function getTagFilterQuery(value) {
  const noteCardSearch = parseNoteCardSearch(value);
  return noteCardSearch ? noteCardSearch.tagQuery : String(value || '');
}

function fileMatchesNoteSearch(file, value, displayName = '') {
  const term = String(value || '').trim().toLowerCase();
  if (!term) return false;

  const fileName = String((file && file.basename) || '').toLowerCase();
  const visibleName = String(displayName || '').toLowerCase();
  return fileName.includes(term) || (!!visibleName && visibleName.includes(term));
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

function createTagFilterSearchQuery(query, tagQuery) {
  const unionTerms = splitUnionSearchTerms(tagQuery);
  const intersectionTerms = splitIntersectionSearchTerms(tagQuery);
  const mixesTagOperators = tagQuery.includes('|') && tagQuery.includes('&');

  return {
    query,
    matcher: true,
    matchContent: (content) => {
      if (mixesTagOperators) return false;
      if (unionTerms || intersectionTerms) {
        return tagMatchesAnySearchTerm(content, unionTerms || intersectionTerms);
      }
      return tagMatchesSearchText(content, tagQuery);
    },
  };
}

function createNoteCardSearchState() {
  return {
    query: '',
    matches: [],
    activeIndex: -1,
    target: null,
    autoExpandedTag: null,
    autoExpandedWasAlreadyExpanded: false,
    lastScrolledKey: '',
    pendingScrollKey: '',
    effectTimer: null,
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

function frontmatterTagValueHasTag(value, tagValue) {
  const tag = normalizeTag(tagValue);
  if (!tag) return false;
  return flattenFrontmatterTags(value).some((item) => normalizeTag(item) === tag);
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

export {
  TAG_VIEW_TYPE,
  TAG_SHELF_VIEW_TYPE,
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
  DEFAULT_SETTINGS,
  normalizeTag,
  normalizeNewNotePosition,
  normalizeBackupInterval,
  normalizeScrollTopButtonThreshold,
  normalizeBackupFolderPath,
  normalizeBackupFileName,
  getBackupPathParts,
  isNestedTag,
  getTagDisplayName,
  normalizeSearchTerm,
  parseNoteCardSearch,
  getTagFilterQuery,
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
