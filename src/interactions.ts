// @ts-nocheck
import { Notice, Scope } from "obsidian";
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

  resolvePinnedSearchQuery(value) {
    const query = String(value || '').trimStart();
    const pinnedTag = normalizeTag(this.settings.pinnedTag);
    if (!pinnedTag || !['*', '&', '|'].includes(query.charAt(0))) return query;

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
      files: this.getOrderedFilesForTag(tag, files),
    };
  }

  prependPinnedTagItem(items) {
    const pinnedItem = this.getPinnedTagItem();
    if (!pinnedItem) return items;

    const remainingItems = items.filter((item) => item.tag !== pinnedItem.tag);
    const matchingItem = items.find((item) => item.tag === pinnedItem.tag);
    return [{ ...(matchingItem || pinnedItem), isPinnedExtra: !matchingItem }, ...remainingItems];
  }

  async togglePinnedTag(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag) || !(this.tagFileIndex.get(tag) || []).length) return;

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
      return includePinned ? this.prependPinnedTagItem(intersectionItems) : intersectionItems;
    }

    const unionTerms = splitUnionSearchTerms(tagQuery);
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

    const matchingItems = unionTerms
      ? items.filter((item) => tagMatchesAnySearchTerm(item.tag, unionTerms))
      : items.filter((item) => tagMatchesSearchText(item.tag, tagQuery));
    return includePinned ? this.prependPinnedTagItem(matchingItems) : matchingItems;
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
          key: `${String(query)}\u0000${item.tag}\u0000${file.path}`,
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
    containerEl.querySelectorAll('.puffs-tag-note-card.is-note-search-match').forEach((cardEl) => {
      cardEl.classList.remove('is-note-search-match');
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
        containerEl.querySelectorAll('.tag-pane-tag[data-puffs-tag]')
      ).find((rowEl) => rowEl.dataset.puffsTag === state.target.tag);
      const tagItemEl = tagRowEl && tagRowEl.closest('.puffs-tag-list-item');
      const cardEl =
        tagItemEl &&
        Array.from(tagItemEl.querySelectorAll('.puffs-tag-note-card[data-path]')).find(
          (candidate) => candidate.dataset.path === state.target.path
        );
      if (!cardEl) return;

      cardEl.classList.add('is-note-search-match');
      if (state.pendingScrollKey === state.target.key) {
        cardEl.scrollIntoView({ block: 'center', inline: 'nearest' });
        state.lastScrolledKey = state.target.key;
        state.pendingScrollKey = '';
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

  async moveSelectedNoteAfter(targetTagValue, targetPath) {
    const selected = this.selectedNoteOrderTarget;
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
