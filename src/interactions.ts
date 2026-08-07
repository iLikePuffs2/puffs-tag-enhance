import { Notice, Scope, TFile } from "obsidian";
import {
  DEFAULT_MOVE_NOTE_DOWN_HOTKEY,
  DEFAULT_MOVE_NOTE_UP_HOTKEY,
  NOTE_ORDER_LONG_PRESS_MS,
  fileMatchesNoteSearch,
  formatHotkey,
  getTagDisplayName,
  getTagFilterQuery,
  isNestedTag,
  normalizeTag,
  parseHotkeyText,
  parseNoteCardSearch,
  splitIntersectionSearchTerms,
  splitUnionSearchTerms,
  tagMatchesAnySearchTerm,
  tagMatchesSearchText
} from "./models";
import { compareTagItemsByCount } from "./relation-utils";

// 当前笔记标签定位的状态标记，拼上笔记路径后作为 noteCardSearchState.query，
// 使切换笔记时被识别为新查询，从而把定位重置到第一个标签
const CURRENT_NOTE_TAG_SEARCH_STATE_QUERY = '\u0000current-note-tags';

export class InteractionsBehavior {
  [key: string]: any;

  static readonly NOTE_ORDER_LONG_PRESS_MS = NOTE_ORDER_LONG_PRESS_MS;

  getOrderedFilesForTag(tagValue: any, files: any) {
    const tag = normalizeTag(tagValue);
    const savedOrder = tag && this.settings.noteOrderByTag[tag];
    if (!Array.isArray(savedOrder) || savedOrder.length === 0) return files;

    const rank: Map<any, any> = new Map(savedOrder.map((path: any, index: any) => [path, index]));
    return files
      .map((file: any, index: any) => ({ file, index }))
      .sort((a: any, b: any) => {
        const aRank = rank.get(a.file.path);
        const bRank = rank.get(b.file.path);
        const aIsRanked = Number.isInteger(aRank);
        const bIsRanked = Number.isInteger(bRank);

        if (aIsRanked && bIsRanked) return aRank - bRank;
        if (aIsRanked) return -1;
        if (bIsRanked) return 1;
        return a.index - b.index;
      })
      .map(({ file }: any) => file);
  }

  getOrderedRootFilesForTag(tagValue: any, files: any) {
    const orderedFiles = this.getOrderedFilesForTag(tagValue, files);
    const visiblePaths = new Set(orderedFiles.map((file: any) => file.path));
    return orderedFiles.filter((file: any) =>
      !this.getHierarchyParents(file.path).some((parentPath: any) => visiblePaths.has(parentPath))
    );
  }

  getNoteAliases(file: any) {
    if (!(file instanceof TFile) || file.extension !== 'md') return [];

    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache && cache.frontmatter;
    if (!frontmatter) return [];

    const aliases: any[] = [];
    const collectAliases = (value: any) => {
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

  getNoteDisplayName(tagValue: any, file: any, isVirtual = false) {
    if (!(file instanceof TFile) || isVirtual) return file && file.basename ? file.basename : '';

    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag)) return file.basename;

    const selected =
      this.settings.noteDisplayNameByTag &&
      this.settings.noteDisplayNameByTag[tag] &&
      this.settings.noteDisplayNameByTag[tag][file.path];
    return selected && this.getNoteAliases(file).includes(selected) ? selected : file.basename;
  }


  async setNoteDisplayName(tagValue: any, file: any, displayName: any) {
    const tag = normalizeTag(tagValue);
    if (
      !tag ||
      isNestedTag(tag) ||
      !(file instanceof TFile) ||
      file.extension !== 'md' ||
      !(this.tagFileIndex.get(tag) || []).some((candidate: any) => candidate.path === file.path)
    ) {
      return;
    }

    const aliases = this.getNoteAliases(file);
    const selected = typeof displayName === 'string' ? displayName.trim() : '';
    if (selected && !aliases.includes(selected)) return;

    if (!this.settings.noteDisplayNameByTag || typeof this.settings.noteDisplayNameByTag !== 'object') {
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



  resolvePinnedSearchQuery(value: any) {
    const query = String(value || '').trimStart();
    const pinnedTag = normalizeTag(this.settings.pinnedTag);
    if (!pinnedTag || !['*', '&', '|'].includes(query.charAt(0))) return query;

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
      hasInheritance: browseData.hasInheritance,
    };
  }

  prependPinnedTagItem(items: any, query = '') {
    const pinnedItem = this.getPinnedTagItem();
    if (!pinnedItem) return items;

    const remainingItems = items.filter((item: any) => item.tag !== pinnedItem.tag);
    const matchingItem = items.find((item: any) => item.tag === pinnedItem.tag);
    const positionedPinnedItem = {
      ...(matchingItem || pinnedItem),
      isPinnedExtra: !matchingItem,
    };
    if (!String(query || '').trim()) return [positionedPinnedItem];
    const isNonNoteSearch = String(query || '').trim() && !String(query || '').includes('*');
    return isNonNoteSearch
      ? [...remainingItems, positionedPinnedItem]
      : [positionedPinnedItem, ...remainingItems];
  }

  isPinnedOnlyTagResult(query: any, items: any) {
    const pinnedTag = normalizeTag(this.settings.pinnedTag);
    return !!(
      pinnedTag &&
      !String(query || '').trim() &&
      items.length === 1 &&
      items[0].tag === pinnedTag
    );
  }

  async togglePinnedTag(tagValue: any) {
    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag) || this.getTagBrowseData(tag).files.length === 0) return;

    this.settings.pinnedTag = this.settings.pinnedTag === tag ? null : tag;
    await this.saveSettings();
    this.refreshAllTagViews();
  }

  getTagShelfItems(query = '', includePinned = true) {
    const tagQuery = getTagFilterQuery(query);
    const intersectionTerms = splitIntersectionSearchTerms(tagQuery);
    if (intersectionTerms) {
      const intersectionItems = this.getIntersectionSearchItems(intersectionTerms);
      return includePinned ? this.prependPinnedTagItem(intersectionItems, query) : intersectionItems;
    }

    const unionTerms = splitUnionSearchTerms(tagQuery);
    const items = Array.from(this.getLogicalTagSet())
      .filter((tag) => !isNestedTag(tag))
      .map((tag) => {
        const browseData = this.getTagBrowseData(tag);
        return {
        tag,
        displayName: getTagDisplayName(tag),
        isVirtual: false,
        files: browseData.files,
        exactCount: browseData.exactCount,
        inheritedCount: browseData.inheritedCount,
        hasInheritance: browseData.hasInheritance,
        sourcesByPath: browseData.sourcesByPath,
      };
      })
      .filter((item) => item.files.length > 0 || item.hasInheritance)
      .sort((a, b) => compareTagItemsByCount(
        { count: a.files.length, name: a.displayName },
        { count: b.files.length, name: b.displayName }
      ));

    const matchingItems = unionTerms
      ? items.filter((item) => tagMatchesAnySearchTerm(item.tag, unionTerms))
      : items.filter((item) => tagMatchesSearchText(item.tag, tagQuery));
    return includePinned ? this.prependPinnedTagItem(matchingItems, query) : matchingItems;
  }

  getCurrentNoteTagItems() {
    const path = this.currentMainFilePath;
    const file = path && this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== 'md') return [];

    return Array.from(this.getLogicalTagSet())
      .filter((tag) => !isNestedTag(tag))
      .map((tag) => ({ tag, browseData: this.getTagBrowseData(tag) }))
      .filter(({ browseData }) => browseData.exactFiles.some((exactFile: any) => exactFile.path === path))
      .map(({ tag, browseData }) => ({
        tag,
        displayName: getTagDisplayName(tag),
        isVirtual: false,
        files: browseData.files,
        exactCount: browseData.exactCount,
        inheritedCount: browseData.inheritedCount,
        hasInheritance: browseData.hasInheritance,
        sourcesByPath: browseData.sourcesByPath,
      }))
      .sort((a, b) => compareTagItemsByCount(
        { count: a.files.length, name: a.displayName },
        { count: b.files.length, name: b.displayName }
      ));
  }

  getCurrentNoteTagEmptyMessage() {
    const path = this.currentMainFilePath;
    const file = path && this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile && file.extension === 'md'
      ? '当前笔记没有标签。'
      : '当前没有打开笔记。';
  }

  getCurrentNoteTagMatches(items: any) {
    const path = this.currentMainFilePath;
    if (!path) return [];

    return items.map((item: any) => ({
      tag: item.tag,
      path,
      key: `${item.tag}\u0000${path}`,
    }));
  }

  syncCurrentNoteTagSearchState(state: any, items: any, expandedTags = this.expandedTags) {
    const matches = this.getCurrentNoteTagMatches(items);
    if (matches.length === 0) {
      this.clearNoteCardSearchState(state, expandedTags);
      return null;
    }

    const query = `${CURRENT_NOTE_TAG_SEARCH_STATE_QUERY}\u0000${this.currentMainFilePath || ''}`;
    const queryChanged = state.query !== query;
    let activeIndex = queryChanged
      ? 0
      : matches.findIndex(
          (match: any) =>
            state.target &&
            match.tag === state.target.tag &&
            match.path === state.target.path
        );
    if (activeIndex < 0) activeIndex = 0;

    state.query = query;
    state.matches = matches;
    state.activeIndex = activeIndex;
    return this.activateNoteCardSearchTarget(state, matches[activeIndex], expandedTags);
  }

  getNoteCardSearchMatches(query: any, items: any) {
    const noteCardSearch = parseNoteCardSearch(query);
    if (!noteCardSearch || !noteCardSearch.isValid) return [];

    const matches = [];
    for (const item of items) {
      const visiblePaths = new Set(item.files.map((file: any) => file.path));
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
          key: `${item.tag}\u0000${file.path}`,
        });
      }
    }

    return matches;
  }

  syncNoteCardSearchState(state: any, query: any, items: any, expandedTags = this.expandedTags) {
    const matches = this.getNoteCardSearchMatches(query, items);
    if (matches.length === 0) {
      this.clearNoteCardSearchState(state, expandedTags);
      return null;
    }

    const queryChanged = state.query !== String(query);
    let activeIndex = queryChanged
      ? 0
      : matches.findIndex(
          (match) =>
            state.target &&
            match.tag === state.target.tag &&
            match.path === state.target.path
        );
    if (activeIndex < 0) activeIndex = 0;

    state.query = String(query);
    state.matches = matches;
    state.activeIndex = activeIndex;
    return this.activateNoteCardSearchTarget(state, matches[activeIndex], expandedTags);
  }

  activateNoteCardSearchTarget(state: any, target: any, expandedTags = this.expandedTags) {
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

  advanceNoteCardSearchState(state: any, expandedTags = this.expandedTags) {
    if (!state || state.matches.length <= 1 || state.activeIndex < 0) return false;
    state.activeIndex = (state.activeIndex + 1) % state.matches.length;
    this.activateNoteCardSearchTarget(state, state.matches[state.activeIndex], expandedTags);
    return true;
  }

  clearNoteCardSearchAutoExpansion(state: any, expandedTags = this.expandedTags) {
    if (!state || !state.autoExpandedTag) return;
    if (!state.autoExpandedWasAlreadyExpanded) {
      expandedTags.delete(state.autoExpandedTag);
      this.clearInlineHierarchyBranchState(state.autoExpandedTag);
    }
    state.autoExpandedTag = null;
    state.autoExpandedWasAlreadyExpanded = false;
  }

  clearNoteCardSearchState(state: any, expandedTags = this.expandedTags) {
    if (!state) return;
    this.clearNoteCardSearchAutoExpansion(state, expandedTags);
    if (state.effectTimer !== null) {
      globalThis.clearTimeout(state.effectTimer);
      state.effectTimer = null;
    }
    state.query = '';
    state.matches = [];
    state.activeIndex = -1;
    state.target = null;
    state.lastScrolledKey = '';
    state.pendingScrollKey = '';
  }




  isNoteOrderTargetSelected(tag: any, path: any, hierarchyParent = '') {
    return !!(
      this.selectedNoteOrderTarget &&
      (hierarchyParent
        ? this.selectedNoteOrderTarget.hierarchyParent === hierarchyParent
        : this.selectedNoteOrderTarget.tag === tag) &&
      this.selectedNoteOrderTarget.path === path
    );
  }


  refreshOrderSelectionState() {
    this.refreshNoteOrderSelectionState();
  }

  activateNoteOrderHotkeyScope() {
    if (this.noteOrderHotkeyScope || !this.selectedNoteOrderTarget) return;

    const scope = new Scope();
    const registerMoveHotkey = (settingValue: any, fallback: any, direction: any) => {
      const hotkey = parseHotkeyText(settingValue, fallback);
      scope.register(hotkey.modifiers as any, hotkey.key, (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        this.moveSelectedNote(direction).catch((error) => {
          console.error('[Puffs Tag Enhance] Failed to move selected item:', error);
          new Notice('调整顺序失败');
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

  toggleNoteOrderTarget(tagValue: any, path: any, surface = '') {
    const tag = normalizeTag(tagValue);
    if (!tag || !path) return;

    if (this.isNoteOrderTargetSelected(tag, path)) {
      this.selectedNoteOrderTarget = null;
      this.deactivateNoteOrderHotkeyScope();
    } else {
      this.selectedNoteOrderTarget ={ tag, path, surface };
      this.refreshNoteOrderHotkeyScope();
    }
    this.refreshOrderSelectionState();
  }

  toggleHierarchyNoteOrderTarget(parentPath: any, path: any, surface = '') {
    if (!parentPath || !path) return;
    if (this.isNoteOrderTargetSelected('', path, parentPath)) {
      this.selectedNoteOrderTarget = null;
      this.deactivateNoteOrderHotkeyScope();
    } else {
      this.selectedNoteOrderTarget ={ hierarchyParent: parentPath, path, surface };
      this.refreshNoteOrderHotkeyScope();
    }
    this.refreshOrderSelectionState();
  }

  clearNoteOrderTarget() {
    if (!this.selectedNoteOrderTarget) return;
    this.selectedNoteOrderTarget = null;
    this.deactivateNoteOrderHotkeyScope();
    this.refreshOrderSelectionState();
  }

  clearOrderTarget() {
    this.clearNoteOrderTarget();
  }

  /** 子标签排序的写回口。交互入口在管理子标签弹窗内，这里只负责改数组并落盘。 */
  async reorderChildTag(parentTagValue: any, movingTagValue: any, targetTagValue: any, placement: any) {
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
    const insertIndex = placement === 'after' ? nextTargetIndex + 1 : nextTargetIndex;
    children.splice(insertIndex, 0, movingTag);
    await this.setInheritanceChildren(parentTag, children);
    return true;
  }

  async moveSelectedNote(direction: any) {
    const target = this.selectedNoteOrderTarget;
    if (!target || (direction !== -1 && direction !== 1)) return false;

    if (target.hierarchyParent) {
      await this.moveHierarchyChild(target.hierarchyParent, target.path, direction);
      globalThis.setTimeout(() => {
        this.refreshNoteOrderSelectionState();
        this.focusSelectedNoteOrderButton();
      }, 0);
      return true;
    }

    const files = this.getOrderedRootFilesForTag(target.tag, this.tagFileIndex.get(target.tag) || []);
    const currentIndex = files.findIndex((file: any) => file.path === target.path);
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
    globalThis.setTimeout(() => {
      this.refreshNoteOrderSelectionState();
      this.focusSelectedNoteOrderButton();
    }, 0);
    return true;
  }

  async moveSelectedNoteAfter(targetTagValue: any, targetPath: any) {
    const selected = this.selectedNoteOrderTarget;
    if (selected && selected.hierarchyParent) {
      return this.moveSelectedHierarchyNoteAfter(selected.hierarchyParent, targetPath);
    }
    const targetTag = normalizeTag(targetTagValue);
    if (
      !selected ||
      !targetTag ||
      selected.tag !== targetTag ||
      !targetPath ||
      selected.path === targetPath
    ) {
      return false;
    }

    const order = this.getOrderedFilesForTag(
      selected.tag,
      this.tagFileIndex.get(selected.tag) || []
    ).map((file: any) => file.path);
    const movingIndex = order.indexOf(selected.path);
    const targetIndex = order.indexOf(targetPath);

    if (movingIndex < 0) {
      this.clearNoteOrderTarget();
      return false;
    }
    if (targetIndex < 0 || movingIndex === targetIndex + 1) return false;

    await this.reorderNote(selected.tag, selected.path, targetPath, 'after');
    globalThis.setTimeout(() => {
      this.refreshNoteOrderSelectionState();
    }, 0);
    return true;
  }

  async reorderNote(tagValue: any, movingPath: any, targetPath: any, placement: any) {
    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag) || !movingPath || !targetPath || movingPath === targetPath) return;

    const order = this.getOrderedFilesForTag(tag, this.tagFileIndex.get(tag) || []).map((file: any) => file.path);
    const movingIndex = order.indexOf(movingPath);
    const targetIndex = order.indexOf(targetPath);
    if (movingIndex < 0 || targetIndex < 0) return;

    order.splice(movingIndex, 1);
    const nextTargetIndex = order.indexOf(targetPath);
    const insertIndex = placement === 'after' ? nextTargetIndex + 1 : nextTargetIndex;
    order.splice(insertIndex, 0, movingPath);

    this.settings.noteOrderByTag[tag] = order;
    await this.saveSettings();
    this.refreshAllTagViews();
  }

}
