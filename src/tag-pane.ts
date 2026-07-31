// @ts-nocheck
import { Notice, setIcon } from "obsidian";
import {
  LIST_MODE_ICON,
  TAG_SYSTEM_ICON,
  TAG_VIEW_TYPE,
  VIEW_SYNC_DELAY_MS,
  createMultiTagSearchQuery,
  createNoteCardSearchState,
  createTagFilterSearchQuery,
  getTagDisplayName,
  getTagFilterQuery,
  isNestedTag,
  normalizeTag,
  parseNoteCardSearch,
  splitIntersectionSearchTerms,
  splitUnionSearchTerms,
  tagMatchesAnySearchTerm,
  tagMatchesSearchText
} from "./models";
import { PuffsTagRenameModal } from "./modals";

export class TagPaneBehavior {
  [key: string]: any;

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
      isSearchComposing: false,
      autoExpandedTag: null,
      autoExpandedWasAlreadyExpanded: false,
      noteCardSearchState: createNoteCardSearchState(),
      lastRenderedSearchQuery: this.getTagSearchValue(view),
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
        if (event.key !== 'Enter' || event.isComposing) return;
        if (!this.advanceNoteCardSearchState(patch.noteCardSearchState)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.scheduleSyncView(view, 0);
      };
      searchInputEl.addEventListener('compositionstart', onSearchCompositionStart);
      searchInputEl.addEventListener('compositionend', onSearchCompositionEnd);
      searchInputEl.addEventListener('keydown', onNoteSearchEnter, true);
      patch.cleanup.push(() => {
        searchInputEl.removeEventListener('compositionstart', onSearchCompositionStart);
        searchInputEl.removeEventListener('compositionend', onSearchCompositionEnd);
        searchInputEl.removeEventListener('keydown', onNoteSearchEnter, true);
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

      const pinButtonEl = target.closest('.puffs-tag-pin-button');
      if (pinButtonEl) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        this.togglePinnedTag(pinButtonEl.dataset.puffsTag).catch((error) => {
          console.error('[Puffs Tag Enhance] Failed to toggle pinned tag:', error);
        });
        return;
      }

      const scrollBottomButtonEl = target.closest('.puffs-tag-scroll-bottom-button');
      if (scrollBottomButtonEl) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        const tag = scrollBottomButtonEl.dataset.puffsTag;
        const listEl = view.containerEl.querySelector('.puffs-tag-list-container');
        this.scheduleLastNoteCardScroll(listEl, tag);
        return;
      }

      const scrollTopButtonEl = target.closest('.puffs-tag-scroll-top-button');
      if (scrollTopButtonEl) {
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        const tag = scrollTopButtonEl.dataset.puffsTag;
        const listEl = view.containerEl.querySelector('.puffs-tag-list-container');
        this.scheduleTagTopScroll(listEl, tag);
        return;
      }

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
      const noteCardEl = target.closest('.puffs-tag-note-card');
      if (noteCardEl) {
        if (!this.showNoteDisplayNameMenuForCard(evt, noteCardEl)) return;
        evt.preventDefault();
        evt.stopPropagation();
        evt.stopImmediatePropagation();
        return;
      }

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

      view.searchQuery = noteCardSearch
        ? createTagFilterSearchQuery(rawQuery, tagQuery)
        : createMultiTagSearchQuery(rawQuery, unionTerms || intersectionTerms);
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

    this.clearNoteCardSearchState(patch.noteCardSearchState);
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

    const rawQuery = this.getTagSearchValue(view);
    const patch = this.viewPatches.get(view);
    const shouldResetSearchScroll = !!(
      patch &&
      rawQuery !== patch.lastRenderedSearchQuery &&
      rawQuery.trim() &&
      !rawQuery.includes('*')
    );
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
        this.expandedTags.has(item.tag) ? item.files.map((file) => file.path).join('\n') : '',
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

  getListModeItems(
    view,
    queryValue = this.resolvePinnedSearchQuery(this.getTagSearchValue(view)),
    includePinned = true
  ) {
    const query = getTagFilterQuery(queryValue);
    const intersectionTerms = splitIntersectionSearchTerms(query);
    if (intersectionTerms) {
      const intersectionItems = this.getIntersectionSearchItems(intersectionTerms);
      return includePinned ? this.prependPinnedTagItem(intersectionItems, queryValue) : intersectionItems;
    }

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

    return includePinned ? this.prependPinnedTagItem(items, queryValue) : items;
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

    let scrollBottomButtonEl = null;
    let pinButtonEl = null;
    if (isExpanded) {
      scrollBottomButtonEl = document.createElement('button');
      scrollBottomButtonEl.type = 'button';
      scrollBottomButtonEl.className = 'clickable-icon puffs-tag-scroll-bottom-button';
      scrollBottomButtonEl.dataset.puffsTag = tag;
      setIcon(scrollBottomButtonEl, 'arrow-down-to-line');

      if (!isVirtual) {
        pinButtonEl = document.createElement('button');
        pinButtonEl.type = 'button';
        pinButtonEl.className = 'clickable-icon puffs-tag-pin-button';
        pinButtonEl.dataset.puffsTag = tag;
        pinButtonEl.classList.toggle('is-active', this.settings.pinnedTag === tag);
        setIcon(pinButtonEl, 'pin');
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
    for (const [fileIndex, file] of files.entries()) {
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
        cardEl.dataset.puffsTag = tag;
        cardEl.dataset.puffsSurface = 'sidebar';

        const orderButtonEl = document.createElement('button');
        orderButtonEl.type = 'button';
        orderButtonEl.className = 'clickable-icon puffs-tag-note-order-button';
        orderButtonEl.dataset.puffsTag = tag;
        orderButtonEl.dataset.path = file.path;
        orderButtonEl.dataset.puffsSurface = 'sidebar';
        setIcon(orderButtonEl, 'grip-vertical');
        this.syncNoteOrderButtonSelection(orderButtonEl);
        cardEl.appendChild(orderButtonEl);
      }

      const innerEl = document.createElement('div');
      innerEl.className = 'tree-item-inner';

      const textEl = document.createElement('div');
      textEl.className = 'tree-item-inner-text';
      textEl.textContent = this.getNoteDisplayName(tag, file, isVirtual);

      innerEl.appendChild(textEl);
      cardEl.appendChild(innerEl);
      const scrollTopButtonThreshold = this.settings.scrollTopButtonThreshold;
      if (
        scrollTopButtonThreshold > 0 &&
        files.length >= scrollTopButtonThreshold &&
        fileIndex === files.length - 1
      ) {
        const scrollTopButtonEl = document.createElement('button');
        scrollTopButtonEl.type = 'button';
        scrollTopButtonEl.className = 'clickable-icon puffs-tag-scroll-top-button';
        scrollTopButtonEl.dataset.puffsTag = tagValue;
        setIcon(scrollTopButtonEl, 'arrow-up-to-line');
        cardEl.appendChild(scrollTopButtonEl);
      }
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
