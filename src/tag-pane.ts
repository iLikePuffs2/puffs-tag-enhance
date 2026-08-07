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
  parseCurrentNoteTagSearch,
  parseNoteCardSearch,
  splitIntersectionSearchTerms,
  splitUnionSearchTerms,
  tagMatchesAnySearchTerm,
  tagMatchesSearchText
} from "./models";
import { compareTagItemsByCount, createHierarchyNavigationHistory } from "./relation-utils";
import { PuffsTagRenameModal } from "./modals";
import {
  getAvailableSidebarToolbarButtons,
  normalizeSidebarToolbarButtons,
} from "./sidebar-toolbar";

export class TagPaneBehavior {
  [key: string]: any;
















  getTagSearchValue(view: any) {
    // 自绘视图以 searchQuery 为准（输入框可能处于收起状态）
    if (view && typeof view.getSearchValue === 'function') return view.getSearchValue();

    const inputEl = view.searchComponent && view.searchComponent.inputEl;
    if (inputEl && typeof inputEl.value === 'string') return inputEl.value;

    if (view.searchComponent && typeof view.searchComponent.getValue === 'function') {
      return view.searchComponent.getValue();
    }

    return '';
  }














  clearStaleVirtualExpandedTags(validTags = new Set()) {
    for (const tag of Array.from(this.expandedTags)) {
      if (String(tag).startsWith('intersection:') && !validTags.has(tag)) {
        this.expandedTags.delete(tag);
        this.clearInlineHierarchyBranchState(tag);
      }
    }
  }


  getListModeItems(
    view: any,
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
    const items: any[] = [];
    const processedTags = new Set();
    const browseDataByTag = new Map();

    const tagMatchesQuery = (tag: any) => unionTerms
      ? tagMatchesAnySearchTerm(tag, unionTerms)
      : tagMatchesSearchText(tag, query);
    const fixedMatchesByRoot = new Map();
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

    const shouldShowTag = (tag: any) => {
      if (this.isFixedChild(tag)) return false;
      if (!tagMatchesQuery(tag) && !fixedMatchesByRoot.has(tag)) return false;
      const browseData = browseDataByTag.get(tag) || this.getTagBrowseData(tag);
      browseDataByTag.set(tag, browseData);
      if (isNestedTag(tag) || (browseData.files.length === 0 && !browseData.hasInheritance)) return false;
      return true;
    };

    const pushTag = (tag: any) => {
      const normalizedTag = normalizeTag(tag);
      if (!normalizedTag || processedTags.has(normalizedTag)) return;
      processedTags.add(normalizedTag);
      if (!shouldShowTag(normalizedTag)) return;

      const parentMatches = tagMatchesQuery(normalizedTag);
      const fixedSearchTags = !parentMatches ? fixedMatchesByRoot.get(normalizedTag) || [] : [];
      const browseData = fixedSearchTags.length
        ? this.createFixedSearchBrowseData(normalizedTag, fixedSearchTags)
        : browseDataByTag.get(normalizedTag);
      items.push({
        tag: normalizedTag,
        displayName: getTagDisplayName(normalizedTag),
        isVirtual: false,
        files: browseData.files,
        exactCount: browseData.exactCount,
        inheritedCount: browseData.inheritedCount,
        hasInheritance: browseData.hasInheritance,
        hasActiveInheritance: browseData.hasActiveInheritance,
        intersectionSignature: browseData.intersectionSignature,
        sourcesByPath: browseData.sourcesByPath,
        inheritanceTree: browseData.inheritanceTree,
        fixedSearchTags,
        browseData,
      });
    };

    for (const [tag, tagDom] of this.getTagDomEntries(view)) {
      pushTag((tagDom && tagDom.tag) || tag);
    }

    const fallbackTags = Array.from(this.getLogicalTagSet())
      .filter((tag) => !processedTags.has(tag));

    for (const tag of fallbackTags) {
      pushTag(tag);
    }

    items.sort((a, b) => compareTagItemsByCount(
      { count: a.files.length, name: a.displayName },
      { count: b.files.length, name: b.displayName }
    ));

    return includePinned ? this.prependPinnedTagItem(items, queryValue) : items;
  }

  getIntersectionSearchItems(terms: any) {
    const tags = Array.from(this.tagFileIndex.keys())
      .filter((tag) => !isNestedTag(tag) && (this.tagFileIndex.get(tag) || []).length > 0)
      .sort((a, b) => getTagDisplayName(a).localeCompare(getTagDisplayName(b), 'zh-Hans-CN'));
    const items: any[] = [];
    const seenCombinations = new Set();
    const pushCombination = (selectedTags: any) => {
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
      const candidateGroups = terms.map((term: any) =>
        tags.filter((tag) => tagMatchesAnySearchTerm(tag, [term]))
      );
      if (candidateGroups.some((candidates: any) => candidates.length === 0)) return [];

      const visitCombinations = (groupIndex: any, selectedTags: any) => {
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

  getFilesWithAllTags(tags: any) {
    if (tags.length === 0) return [];

    const remainingPaths = tags.slice(1).map((tag: any) =>
      new Set((this.tagFileIndex.get(tag) || []).map((file: any) => file.path))
    );
    return (this.tagFileIndex.get(tags[0]) || []).filter((file: any) =>
      remainingPaths.every((paths: any) => paths.has(file.path))
    );
  }

  renderListModeTagItem(listEl: any, item: any, view: any, patch: any) {
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
    countEl.textContent = item.inheritedCount > 0
      ? `${item.exactCount}+${item.inheritedCount}`
      : String(files.length);

    let scrollBottomButtonEl = null;
    let pinButtonEl = null;
    if (isExpanded && files.length > 0) {
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
      this.renderNoteList(treeItemEl, files, tag, isVirtual, {
        view,
        patch,
        surface: 'sidebar',
        scrollContainer: listEl,
        browseData: item.browseData,
      });
    }

    listEl.appendChild(treeItemEl);
  }


  getTagDomEntries(view: any): any[] {
    const tagDoms = view.tagDoms;
    if (!tagDoms) return [];

    if (typeof tagDoms.entries === 'function') {
      return Array.from(tagDoms.entries());
    }

    return Object.entries(tagDoms);
  }




  renderNoteList(treeItemEl: any, files: any, tagValue: any, isVirtual = false, options: any = {}) {
    let listEl: any = Array.from<any>(treeItemEl.children).find((el: any) =>
      el.classList.contains('puffs-tag-note-list')
    );

    if (!listEl) {
      listEl = document.createElement('div');
      listEl.className = 'tree-item-children puffs-tag-note-list';
      treeItemEl.appendChild(listEl);
    }

    listEl.className = 'tree-item-children puffs-tag-note-list';
    const target = options.patch?.noteCardSearchState?.target;
    const renderOptions = {
      surface: options.surface || 'sidebar',
      targetPath: target?.tag === tagValue ? target.path : '',
      scrollContainer: options.scrollContainer || listEl,
      rerender: () => options.view?.requestRender?.() ?? this.refreshAllTagViews(),
    };
    const browseData = !isVirtual && (options.browseData || this.getTagBrowseData(tagValue));
    if (browseData?.hasActiveInheritance && browseData.inheritanceTree) {
      this.renderTagInheritanceBrowseTree(listEl, browseData.inheritanceTree, renderOptions);
    } else {
      this.renderInlineTagNoteTree(listEl, files, tagValue, isVirtual, renderOptions);
    }
  }

  removeNoteList(treeItemEl: any) {
    const listEl: any = Array.from<any>(treeItemEl.children).find((el: any) =>
      el.classList.contains('puffs-tag-note-list')
    );
    if (listEl) listEl.remove();
  }


  toggleTagExpansion(tag: any, view: any) {
    if (!tag) return;

    if (this.expandedTags.has(tag)) {
      this.expandedTags.delete(tag);
      this.clearInlineHierarchyBranchState(tag);
    } else {
      this.expandedTags.add(tag);
    }

    view?.requestRender?.();
  }



  findTagForElement(view: any, tagEl: any) {
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

  openRenameTagModal(tag: any) {
    new PuffsTagRenameModal(this.app, this, tag).open();
  }


}
