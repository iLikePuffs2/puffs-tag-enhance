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
  parseSimilarTagSearch,
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
  shouldShowScrollButtons,
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
    const rawQuery = getTagFilterQuery(queryValue);
    const intersectionTerms = splitIntersectionSearchTerms(rawQuery);
    if (intersectionTerms) {
      const intersectionItems = this.getIntersectionSearchItems(intersectionTerms);
      return includePinned ? this.prependPinnedTagItem(intersectionItems, queryValue) : intersectionItems;
    }

    // `比赛，`：先按「比赛」筛出命中的标签，再把它们各自的相似组并进来。
    // 交集与并集优先级更高，因此走到这里时不会与操作符混用。
    const similarSearch = parseSimilarTagSearch(rawQuery);
    const query = similarSearch.matched ? similarSearch.baseQuery : rawQuery;
    const similarTagSet = similarSearch.matched
      ? this.collectSimilarSearchTags(query)
      : null;

    const unionTerms = splitUnionSearchTerms(query);
    const items: any[] = [];
    const processedTags = new Set();
    const browseDataByTag = new Map();

    const tagMatchesQuery = (tag: any) => {
      // 相似组内的标签直接放行，不必自己也匹配搜索词
      const normalizedTag = normalizeTag(tag);
      if (normalizedTag && similarTagSet?.has(normalizedTag)) return true;
      return unionTerms
        ? tagMatchesAnySearchTerm(tag, unionTerms)
        : tagMatchesSearchText(tag, query);
    };
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
        browseSignature: browseData.browseSignature,
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

  /**
   * `比赛，` 要额外展示的标签集合。
   *
   * 先按基础条件找出命中的标签，再把每个命中标签所在的相似组整组并进来。
   * 于是「比赛」命中后，与它同组的「秘境」「试炼」即便自己不匹配搜索词也会出现。
   */
  collectSimilarSearchTags(baseQuery: any) {
    const result = new Set<string>();
    for (const tag of this.getLogicalTagSet()) {
      if (isNestedTag(tag) || !tagMatchesSearchText(tag, baseQuery)) continue;
      for (const similarTag of this.getSimilarTags(tag)) result.add(similarTag);
    }
    return result;
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
        // 虚拟标签没有 browseData，指纹直接取交集结果本身，
        // 使「成员换了人但数量不变」同样触发重建
        browseSignature: `${combinationId}:${files.map((file: any) => file.path).join('|')}`,
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
    tagEl.setAttribute('aria-expanded', String(isExpanded));
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
    // 回底按钮受阈值控制（与行内笔记卡片上的回顶按钮同一判据）；
    // 置顶按钮与滚动无关，仍是「展开且有笔记」就出现
    if (isExpanded && shouldShowScrollButtons(files.length, this.settings.scrollTopButtonThreshold)) {
      scrollBottomButtonEl = document.createElement('button');
      scrollBottomButtonEl.type = 'button';
      scrollBottomButtonEl.className = 'clickable-icon puffs-tag-scroll-bottom-button';
      scrollBottomButtonEl.dataset.puffsTag = tag;
      scrollBottomButtonEl.dataset.puffsScrollAnchor = 'true';
      setIcon(scrollBottomButtonEl, 'arrow-down-to-line');
    }
    if (isExpanded && files.length > 0 && !isVirtual) {
      pinButtonEl = document.createElement('button');
      pinButtonEl.type = 'button';
      pinButtonEl.className = 'clickable-icon puffs-tag-pin-button';
      pinButtonEl.dataset.puffsTag = tag;
      pinButtonEl.classList.toggle('is-active', this.settings.pinnedTag === tag);
      setIcon(pinButtonEl, 'pin');
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
        scrollContainer: view?.tagContainerEl || listEl,
        browseData: item.browseData,
      });
    }

    listEl.appendChild(treeItemEl);
  }


  /**
   * 只同步标签行的展开部分，保留标签行本身以及它的 hover / focus 状态。
   * 数据内容变化仍由侧边栏的签名对账走整行重建；这里仅服务于展开态切换。
   */
  syncListModeTagExpansion(treeItemEl: any, item: any, view: any, patch: any) {
    if (!treeItemEl || !item) return;
    const { tag, files = [], isVirtual } = item;
    const isExpanded = this.expandedTags.has(tag);
    const tagEl = treeItemEl.querySelector('.tag-pane-tag[data-puffs-tag]');
    if (!tagEl) return;

    treeItemEl.classList.toggle('puffs-tag-expanded', isExpanded);
    tagEl.setAttribute('aria-expanded', String(isExpanded));
    tagEl.querySelector('.puffs-tag-list-toggle')?.classList.toggle('is-collapsed', !isExpanded);

    const flairOuterEl = tagEl.querySelector('.tree-item-flair-outer');
    const syncActionButton = (selector: any, icon: any, enabled: any, isScrollAnchor = false) => {
      let buttonEl = tagEl.querySelector(selector);
      if (!enabled) {
        buttonEl?.remove();
        return;
      }
      if (!buttonEl) {
        buttonEl = document.createElement('button');
        buttonEl.type = 'button';
        buttonEl.className = `clickable-icon ${selector.slice(1)}`;
        buttonEl.dataset.puffsTag = tag;
        if (isScrollAnchor) buttonEl.dataset.puffsScrollAnchor = 'true';
        setIcon(buttonEl, icon);
        tagEl.insertBefore(buttonEl, flairOuterEl);
      }
    };

    // 判据必须与 renderListModeTagItem 完全一致 —— 同一按钮的两条渲染路径，
    // 漏改一处就会出现「展开态切换后按钮凭空出现或消失」
    const hasNotes = isExpanded && files.length > 0;
    syncActionButton(
      '.puffs-tag-scroll-bottom-button',
      'arrow-down-to-line',
      isExpanded && shouldShowScrollButtons(files.length, this.settings.scrollTopButtonThreshold),
      true
    );
    syncActionButton('.puffs-tag-pin-button', 'pin', hasNotes && !isVirtual);
    tagEl.querySelector('.puffs-tag-pin-button')
      ?.classList.toggle('is-active', this.settings.pinnedTag === tag);

    if (isExpanded) {
      this.renderNoteList(treeItemEl, files, tag, isVirtual, {
        view,
        patch,
        surface: 'sidebar',
        scrollContainer: view?.tagContainerEl || treeItemEl.parentElement,
        browseData: item.browseData,
      });
    } else {
      this.removeNoteList(treeItemEl);
    }
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
      onExpansionChange: () => options.view?.refreshExpandCollapseToolbarState?.(),
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

  /**
   * 虚拟交集标签的批量操作弹窗。
   *
   * 复用同一个弹窗，只是候选池由交集结果直接给出（虚拟标签不在 tagFileIndex 里），
   * 增删的作用域标签取交集的第一个成员 —— 勾选路径已经把范围收窄到这批笔记。
   */
  openVirtualTagRenameModal(item: any) {
    if (!item || !(item.files || []).length || !(item.sourceTags || []).length) return;
    new PuffsTagRenameModal(this.app, this, item.tag, {
      candidateFiles: item.files,
      sourceTag: item.sourceTags[0],
    }).open();
  }


}
