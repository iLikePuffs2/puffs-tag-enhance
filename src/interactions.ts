// @ts-nocheck
import { Menu, Notice, Scope, TFile } from "obsidian";
import {
  DEFAULT_MOVE_NOTE_DOWN_HOTKEY,
  DEFAULT_MOVE_NOTE_UP_HOTKEY,
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

export class InteractionsBehavior {
  [key: string]: any;

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

  getNoteAliases(file) {
    if (!(file instanceof TFile) || file.extension !== 'md') return [];

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
    if (!(file instanceof TFile) || isVirtual) return file && file.basename ? file.basename : '';

    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag)) return file.basename;

    const selected =
      this.settings.noteDisplayNameByTag &&
      this.settings.noteDisplayNameByTag[tag] &&
      this.settings.noteDisplayNameByTag[tag][file.path];
    return selected && this.getNoteAliases(file).includes(selected) ? selected : file.basename;
  }

  refreshNoteDisplayNameCards(tagValue, file) {
    const tag = normalizeTag(tagValue);
    if (!tag || !(file instanceof TFile)) return;

    const displayName = this.getNoteDisplayName(tag, file);
    document.querySelectorAll('.puffs-tag-note-card[data-puffs-tag][data-path]').forEach((cardEl) => {
      if (cardEl.dataset.puffsTag !== tag || cardEl.dataset.path !== file.path) return;
      const textEl = cardEl.querySelector('.tree-item-inner-text');
      if (textEl) textEl.textContent = displayName;
    });
  }

  async setNoteDisplayName(tagValue, file, displayName) {
    const tag = normalizeTag(tagValue);
    if (
      !tag ||
      isNestedTag(tag) ||
      !(file instanceof TFile) ||
      file.extension !== 'md' ||
      !(this.tagFileIndex.get(tag) || []).some((candidate) => candidate.path === file.path)
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
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }

  showNoteDisplayNameMenuForCard(event, cardEl) {
    const tag = normalizeTag(cardEl && cardEl.dataset.puffsTag);
    const path = cardEl && cardEl.dataset.path;
    if (!tag || isNestedTag(tag) || !path) return false;

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return false;

    const aliases = this.getNoteAliases(file);
    if (aliases.length === 0) return false;

    const menu = new Menu();
    menu.addItem((item) => {
      item
        .setTitle('更换显示名称')
        .setIcon('text-cursor-input')
        .onClick(() => {
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
    const menu = new Menu();
    menu.addItem((item) => {
      item
        .setTitle(file.basename)
        .setChecked(currentName === file.basename)
        .onClick(() => this.setNoteDisplayName(tag, file, '').catch((error) => {
          console.error('[Puffs Tag Enhance] Failed to restore note display name:', error);
          new Notice('恢复文件名失败');
        }));
    });
    for (const alias of aliases) {
      menu.addItem((item) => {
        item
          .setTitle(alias)
          .setChecked(currentName === alias)
          .onClick(() => this.setNoteDisplayName(tag, file, alias).catch((error) => {
            console.error('[Puffs Tag Enhance] Failed to change note display name:', error);
            new Notice('更换展示名称失败');
          }));
      });
    }
    menu.showAtPosition(position);
  }

  resolvePinnedSearchQuery(value) {
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
      inheritanceEnabled: browseData.inheritanceEnabled,
      hasInheritance: browseData.hasInheritance,
    };
  }

  prependPinnedTagItem(items, query = '') {
    const pinnedItem = this.getPinnedTagItem();
    if (!pinnedItem) return items;

    const remainingItems = items.filter((item) => item.tag !== pinnedItem.tag);
    const matchingItem = items.find((item) => item.tag === pinnedItem.tag);
    const positionedPinnedItem = {
      ...(matchingItem || pinnedItem),
      isPinnedExtra: !matchingItem,
    };
    const isNonNoteSearch = String(query || '').trim() && !String(query || '').includes('*');
    return isNonNoteSearch
      ? [...remainingItems, positionedPinnedItem]
      : [positionedPinnedItem, ...remainingItems];
  }

  async togglePinnedTag(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag) || this.getTagBrowseData(tag).files.length === 0) return;

    this.settings.pinnedTag = this.settings.pinnedTag === tag ? null : tag;
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
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
        inheritanceEnabled: browseData.inheritanceEnabled,
        hasInheritance: browseData.hasInheritance,
        sourcesByPath: browseData.sourcesByPath,
      };
      })
      .filter((item) => item.files.length > 0 || item.hasInheritance)
      .sort((a, b) => {
        const countDiff = b.files.length - a.files.length;
        return countDiff || a.displayName.localeCompare(b.displayName, 'zh-Hans-CN');
      });

    const matchingItems = unionTerms
      ? items.filter((item) => tagMatchesAnySearchTerm(item.tag, unionTerms))
      : items.filter((item) => tagMatchesSearchText(item.tag, tagQuery));
    return includePinned ? this.prependPinnedTagItem(matchingItems, query) : matchingItems;
  }

  getNoteCardSearchMatches(query, items) {
    const noteCardSearch = parseNoteCardSearch(query);
    if (!noteCardSearch || !noteCardSearch.isValid) return [];

    const matches = [];
    for (const item of items) {
      for (const file of item.files) {
        const displayName = this.getNoteDisplayName(item.tag, file, item.isVirtual);
        if (!fileMatchesNoteSearch(file, noteCardSearch.noteQuery, displayName)) continue;
        matches.push({
          tag: item.tag,
          path: file.path,
          key: `${item.tag}\u0000${file.path}`,
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
    state.query = '';
    state.matches = [];
    state.activeIndex = -1;
    state.target = null;
    state.lastScrolledKey = '';
    state.pendingScrollKey = '';
  }

  scheduleNoteCardSearchEffect(containerEl, inputEl, state) {
    if (!containerEl || !state) return;
    if (state.effectTimer !== null) {
      window.clearTimeout(state.effectTimer);
      state.effectTimer = null;
    }

    const findTargetCard = (target) => {
      if (!target) return null;
      const tagRowEl = Array.from(
        containerEl.querySelectorAll('.tag-pane-tag[data-puffs-tag]')
      ).find((rowEl) => rowEl.dataset.puffsTag === target.tag);
      const tagItemEl = tagRowEl && tagRowEl.closest('.puffs-tag-list-item');
      return (
        tagItemEl &&
        Array.from(tagItemEl.querySelectorAll('.puffs-tag-note-card[data-path]')).find(
          (candidate) => candidate.dataset.path === target.path
        )
      );
    };

    const target = state.target;
    const targetCardEl = findTargetCard(target);
    containerEl.querySelectorAll('.puffs-tag-note-card.is-note-search-match').forEach((cardEl) => {
      if (cardEl !== targetCardEl) cardEl.classList.remove('is-note-search-match');
    });
    if (!target || !targetCardEl) return;

    targetCardEl.classList.add('is-note-search-match');
    if (state.pendingScrollKey !== target.key) return;

    const scheduledTargetKey = target.key;
    const shouldRestoreInputFocus = document.activeElement === inputEl;
    state.effectTimer = window.setTimeout(() => {
      state.effectTimer = null;
      const currentTarget = state.target;
      if (
        !currentTarget ||
        currentTarget.key !== scheduledTargetKey ||
        state.pendingScrollKey !== scheduledTargetKey
      ) {
        return;
      }

      const currentCardEl = findTargetCard(currentTarget);
      if (!currentCardEl) return;

      currentCardEl.scrollIntoView({ block: 'center', inline: 'nearest' });
      state.lastScrolledKey = scheduledTargetKey;
      state.pendingScrollKey = '';
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
        containerEl.querySelectorAll('.tag-pane-tag[data-puffs-tag]')
      ).find((rowEl) => rowEl.dataset.puffsTag === tag);
      const tagItemEl = tagRowEl && tagRowEl.closest('.puffs-tag-list-item');
      const noteCards = tagItemEl
        ? Array.from(tagItemEl.querySelectorAll('.puffs-tag-note-card[data-path]'))
        : [];
      const lastCardEl = noteCards[noteCards.length - 1];
      if (!lastCardEl) return;

      lastCardEl.scrollIntoView({ block: 'center', inline: 'nearest' });
    }, 0);
  }

  scheduleTagTopScroll(containerEl, tag) {
    if (!containerEl || !tag) return;

    window.setTimeout(() => {
      if (!containerEl.isConnected) return;

      const tagRowEl = Array.from(
        containerEl.querySelectorAll('.tag-pane-tag[data-puffs-tag]')
      ).find((rowEl) => rowEl.dataset.puffsTag === tag);
      if (!tagRowEl) return;

      tagRowEl.scrollIntoView({ block: 'start', inline: 'nearest' });
    }, 0);
  }

  isNoteOrderTargetSelected(tag, path, hierarchyParent = '') {
    return !!(
      this.selectedNoteOrderTarget &&
      (hierarchyParent
        ? this.selectedNoteOrderTarget.hierarchyParent === hierarchyParent
        : this.selectedNoteOrderTarget.tag === tag) &&
      this.selectedNoteOrderTarget.path === path
    );
  }

  syncNoteOrderButtonSelection(buttonEl) {
    if (!buttonEl) return;
    const isSelected = this.isNoteOrderTargetSelected(
      buttonEl.dataset.puffsTag,
      buttonEl.dataset.path,
      buttonEl.dataset.puffsHierarchyParent
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

  toggleHierarchyNoteOrderTarget(parentPath, path, surface = '') {
    if (!parentPath || !path) return;
    if (this.isNoteOrderTargetSelected('', path, parentPath)) {
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
    const buttons = Array.from(document.querySelectorAll('.puffs-tag-note-order-button'));
    const buttonEl =
      buttons.find((button) =>
        (hierarchyParent
          ? button.dataset.puffsHierarchyParent === hierarchyParent
          : button.dataset.puffsTag === tag) &&
        button.dataset.path === path &&
        button.dataset.puffsSurface === surface &&
        button.offsetParent !== null
      ) ||
      buttons.find((button) =>
        (hierarchyParent
          ? button.dataset.puffsHierarchyParent === hierarchyParent
          : button.dataset.puffsTag === tag) &&
        button.dataset.path === path &&
        button.offsetParent !== null
      );
    if (buttonEl) buttonEl.focus({ preventScroll: true });
  }

  async moveSelectedNote(direction) {
    const target = this.selectedNoteOrderTarget;
    if (!target || (direction !== -1 && direction !== 1)) return false;

    if (target.hierarchyParent) {
      await this.moveHierarchyChild(target.hierarchyParent, target.path, direction);
      window.setTimeout(() => {
        this.refreshNoteOrderSelectionState();
        this.focusSelectedNoteOrderButton();
      }, 0);
      return true;
    }

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

  async moveSelectedNoteAfter(targetTagValue, targetPath) {
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
    ).map((file) => file.path);
    const movingIndex = order.indexOf(selected.path);
    const targetIndex = order.indexOf(targetPath);

    if (movingIndex < 0) {
      this.clearNoteOrderTarget();
      return false;
    }
    if (targetIndex < 0 || movingIndex === targetIndex + 1) return false;

    await this.reorderNote(selected.tag, selected.path, targetPath, 'after');
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
    const insertIndex = placement === 'after' ? nextTargetIndex + 1 : nextTargetIndex;
    order.splice(insertIndex, 0, movingPath);

    this.settings.noteOrderByTag[tag] = order;
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }

}
