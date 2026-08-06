// 渲染层：标签继承树、标签内父子笔记树、父子层级页面。
//
// 这些方法原先住在 relations.ts 里，与继承关系的数据计算混在同一个 2466 行的文件中
// （该文件曾有 145 处 DOM 操作）。搬到 view/ 后 relations.ts 只剩数据与规则，
// 得以纳入 architecture.test.ts 的分层守卫。
//
// 它们仍以 Behavior 的形式 mixin 到 plugin 上，调用关系与搬迁前完全一致。

import { Menu, Notice, TFile, setIcon } from "obsidian";
import { getTagDisplayName, isNestedTag, normalizeTag } from "../models";
import {
  buildVisibleHierarchyForest,
  compareHierarchyParentItems,
} from "../relation-utils";
import { NoteRelationModal } from "../relation-modals";

export class TagTreeRendererBehavior {
  [key: string]: any;

  /** 层级导航要恢复的滚动容器。属于渲染层职责，自 relations.ts 迁入。 */
  getHierarchyNavigationScrollEl(view: any) {
    return view.tagContainerEl || view.containerEl?.querySelector('.tag-container') || null;
  }

  renderTagInheritanceBrowseTree(hostEl: any, tree: any, options: any = {}) {
    hostEl.empty();
    if (!tree) return;
    const rootTag = normalizeTag(tree.tag);
    const collapsed = this.collapsedInlineHierarchyBranches || new Set();
    this.collapsedInlineHierarchyBranches = collapsed;
    const targetPath: any = options.targetPath || '';
    const renderNotes = (containerEl: any, node: any, isInheritedGroup: any) => {
      const files = node.paths
        .map((path: any) => this.app.vault.getAbstractFileByPath(path))
        .filter((file: any) => file instanceof TFile && file.extension === 'md');
      this.renderInlineTagNoteTree(containerEl, files, node.tag, false, {
        ...options,
        inheritanceRootTag: rootTag,
        isInheritedGroup,
        allowInheritedReorder: true,
      });
    };
    const renderGroup = (
      containerEl: any,
      label: any,
      count: any,
      key: any,
      containsTarget: any,
      renderContent: any,
      tagValue = null,
      parentTagValue = null,
      hasTagChildren = false
    ) => {
      if (!count) return;
      const expanded = (!!targetPath && containsTarget) || !collapsed.has(key);
      const itemEl = containerEl.createDiv({ cls: 'tree-item puffs-tag-list-item puffs-inheritance-tag-group' });
      const rowEl = itemEl.createDiv({
        cls: 'tree-item-self tag-pane-tag is-clickable mod-collapsible puffs-tag-list-row puffs-inheritance-tag-group-row',
      });
      rowEl.dataset.puffsInheritanceGroup = key;
      if (tagValue) rowEl.dataset.puffsInheritanceTag = tagValue;
      if (tagValue && parentTagValue) {
        rowEl.dataset.puffsTagOrderParent = parentTagValue;
        rowEl.dataset.puffsTagOrderTag = tagValue;
      }
      rowEl.setAttribute('aria-expanded', String(expanded));
      const toggleEl = rowEl.createDiv({ cls: 'tree-item-icon collapse-icon puffs-tag-list-toggle' });
      toggleEl.classList.toggle('is-collapsed', !expanded);
      setIcon(toggleEl, 'right-triangle');
      if (tagValue && parentTagValue) {
        toggleEl.classList.add('puffs-tag-order-button');
        toggleEl.dataset.puffsTagOrderParent = parentTagValue;
        toggleEl.dataset.puffsTagOrderTag = tagValue;
        toggleEl.dataset.puffsSurface = options.surface || '';
        toggleEl.dataset.puffsExpanded = String(expanded);
        toggleEl.dataset.puffsHasChildren = String(hasTagChildren);
        if (hasTagChildren) toggleEl.classList.add('puffs-tag-order-parent-button');
        toggleEl.tabIndex = 0;
        toggleEl.setAttribute('role', 'button');
        this.bindTagHierarchyControlButton(
          toggleEl,
          () => {
            this.toggleInlineHierarchyBranch(key);
            options.rerender?.();
          }
        );
        this.syncTagOrderButtonSelection(toggleEl);
      }
      rowEl.createDiv({ text: label, cls: 'tree-item-inner' });
      const flairOuterEl = rowEl.createDiv({ cls: 'tree-item-flair-outer' });
      flairOuterEl.createSpan({ text: String(count), cls: 'tree-item-flair tag-pane-tag-count' });
      rowEl.addEventListener('click', () => {
        if (tagValue && this.isTagOrderModeActive(tagValue)) this.exitTagOrderMode(false);
        this.toggleInlineHierarchyBranch(key);
        options.rerender?.();
      });
      if (tagValue) {
        rowEl.addEventListener('contextmenu', (event: any) => {
          event.preventDefault();
          event.stopPropagation();
          this.showTagContextMenu(event, tagValue);
        });
      }
      if (expanded) {
        const contentEl = itemEl.createDiv({ cls: 'tree-item-children puffs-inheritance-tag-group-content' });
        renderContent(contentEl);
      }
    };
    const renderNode = (containerEl: any, node: any, lineage: any, directParentTag: any) => {
      const key = `${rootTag}\u0000tag-group\u0000${lineage.join('\u0001')}`;
      const renderNodeContent = (contentEl: any) => {
          if (!node.children.length) {
            renderNotes(contentEl, node, true);
            return;
          }
          if (node.paths.length) {
            renderGroup(contentEl, '原生', node.paths.length, `${key}\u0000original`,
              node.paths.includes(targetPath), (originalEl: any) => renderNotes(originalEl, node, true));
          }
          for (const child of node.children) {
            renderNode(contentEl, child, [...lineage, child.tag], node.tag);
          }
        };
      const label = this.isFixedTagEdge(directParentTag, node.tag)
        ? this.getFixedChildDisplayName(node.tag)
        : getTagDisplayName(node.tag);
      renderGroup(containerEl, label, node.subtreePaths.length, key,
        node.subtreePaths.includes(targetPath), renderNodeContent, node.tag, directParentTag, node.children.length > 0);
    };

    if (!tree.children.length) {
      renderNotes(hostEl, tree, false);
      return;
    }
    if (tree.paths.length) {
      renderGroup(hostEl, '原生', tree.paths.length, `${rootTag}\u0000tag-group\u0000original`,
        tree.paths.includes(targetPath), (contentEl: any) => renderNotes(contentEl, tree, false));
    }
    for (const child of tree.children) renderNode(hostEl, child, [child.tag], tree.tag);
    this.scheduleTagOrderModeVisibilityReconcile();
  }

  renderInlineTagNoteTree(hostEl: any, files: any, tagValue: any, isVirtual = false, options: any = {}) {
    hostEl.empty();
    const tag = normalizeTag(tagValue);
    const orderedFiles: any[] = Array.from(new Map((files || []).map((file: any) => [file.path, file])).values());
    const fileByPath = new Map(orderedFiles.map((file: any) => [file.path, file]));
    const forest = buildVisibleHierarchyForest(
      orderedFiles.map((file: any) => file.path),
      this.getNoteHierarchySettings().childrenByParentPath
    );
    const collapsedBranches = this.collapsedInlineHierarchyBranches || new Set();
    this.collapsedInlineHierarchyBranches = collapsedBranches;
    const surface: any = options.surface || 'sidebar';
    const inheritanceRootTag: any = normalizeTag(options.inheritanceRootTag || tag);
    const targetPath: any = options.targetPath || '';
    const renderedCards: any = [];

    const renderNode = (containerEl: any, path: any, parentPath = '', branch = new Set()) => {
      if (branch.has(path)) return;
      const file = fileByPath.get(path);
      if (!(file instanceof TFile)) return;
      const nextBranch = new Set(branch);
      nextBranch.add(path);
      const children = forest.childrenByParent[path] || [];
      const branchKey = this.getInlineHierarchyBranchKey(tagValue, path);
      const forceExpanded = !!targetPath && this.hierarchyBranchContains(
        forest.childrenByParent,
        path,
        targetPath,
        new Set()
      );
      const expanded = forceExpanded || !collapsedBranches.has(branchKey);
      const inherited = !!options.isInheritedGroup || (!!tag && !isVirtual && this.isInheritedFileForTag(tag, file.path));
      const canTagReorder = !parentPath && !!tag && !isVirtual && !isNestedTag(tag) && (!inherited || options.allowInheritedReorder);
      const itemEl = containerEl.createDiv({
        cls: `tree-item puffs-tag-note-item${parentPath ? ' puffs-inline-hierarchy-child-item' : ''}`,
      });
      itemEl.dataset.path = file.path;
      itemEl.classList.toggle(
        'is-order-selected',
        this.isNoteOrderTargetSelected(tag, file.path, parentPath)
      );
      const cardEl = itemEl.createDiv({
        cls: `tree-item-self puffs-tag-note-card is-clickable${surface === 'shelf' ? ' puffs-tag-shelf-note-card' : ' puffs-tag-sidebar-note-card'}${!parentPath && !canTagReorder ? ' puffs-tag-note-card-no-order' : ''}${parentPath ? ' puffs-inline-hierarchy-child-card' : ''}`,
      });
      cardEl.dataset.path = file.path;
      cardEl.dataset.puffsSurface = surface;
      if (tag && !isVirtual) cardEl.dataset.puffsTag = tag;
      if (inheritanceRootTag && inheritanceRootTag !== tag) cardEl.dataset.puffsInheritanceRootTag = inheritanceRootTag;
      if (parentPath) cardEl.dataset.puffsHierarchyParent = parentPath;
      if (inherited) {
        cardEl.dataset.puffsInherited = 'true';
      }

      const orderButtonEl = cardEl.createEl('button', { cls: 'clickable-icon puffs-tag-note-order-button' });
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
        orderButtonEl.classList.add('puffs-note-parent-control-button', 'collapse-icon');
        orderButtonEl.dataset.puffsInlineHierarchyBranchKey = branchKey;
        orderButtonEl.dataset.puffsExpanded = String(expanded);
        this.syncNoteOrderButtonSelection(orderButtonEl);
        this.bindNoteParentControlButton(orderButtonEl, () => {
          this.toggleInlineHierarchyBranch(branchKey);
          options.rerender?.();
        }, toggleOrder);
      } else if (hasOrderButton) {
        setIcon(orderButtonEl, 'grip-vertical');
        this.syncNoteOrderButtonSelection(orderButtonEl);
        orderButtonEl.addEventListener('click', (event: any) => {
          event.preventDefault();
          event.stopPropagation();
          toggleOrder();
        });
      }

      if (children.length && !usesCombinedParentControl) {
        const toggleEl = cardEl.createDiv({ cls: 'tree-item-icon collapse-icon puffs-inline-hierarchy-toggle' });
        toggleEl.dataset.puffsInlineHierarchyBranchKey = branchKey;
        toggleEl.classList.toggle('is-collapsed', !expanded);
        setIcon(toggleEl, 'right-triangle');
        toggleEl.addEventListener('click', (event: any) => {
          event.preventDefault();
          event.stopPropagation();
          this.toggleInlineHierarchyBranch(branchKey);
          options.rerender?.();
        });
      }

      const innerEl = cardEl.createDiv({ cls: 'tree-item-inner' });
      innerEl.createDiv({
        text: this.getInlineHierarchyDisplayName(tag, parentPath, file, isVirtual),
        cls: 'tree-item-inner-text',
      });
      if (children.length) {
        const flairOuterEl = cardEl.createDiv({ cls: 'tree-item-flair-outer' });
        flairOuterEl.createSpan({ text: String(children.length), cls: 'tree-item-flair tag-pane-tag-count' });
      }
      cardEl.addEventListener('click', () => this.openFileInMainWorkspace(file));
      cardEl.addEventListener('contextmenu', (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        if (parentPath) this.showHierarchyChildMenu(event, parentPath, file);
        else this.showNoteCardContextMenu(event, cardEl);
      });
      renderedCards.push(cardEl);

      if (children.length && expanded) {
        const childHostEl = itemEl.createDiv({ cls: 'tree-item-children puffs-inline-hierarchy-children' });
        for (const childPath of children) renderNode(childHostEl, childPath, path, nextBranch);
      }
    };

    const roots = forest.roots.length ? forest.roots : orderedFiles.map((file) => file.path);
    for (const rootPath of roots) renderNode(hostEl, rootPath);

    if (
      this.settings.scrollTopButtonThreshold > 0 &&
      orderedFiles.length >= this.settings.scrollTopButtonThreshold &&
      renderedCards.length
    ) {
      const scrollTopButtonEl = renderedCards[renderedCards.length - 1].createEl('button', {
        cls: 'clickable-icon puffs-tag-scroll-top-button',
      });
      scrollTopButtonEl.dataset.puffsTag = tagValue;
      setIcon(scrollTopButtonEl, 'arrow-up-to-line');
      scrollTopButtonEl.addEventListener('click', (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        this.scheduleTagTopScroll(options.scrollContainer || hostEl, tagValue);
      });
    }
  }

  renderHierarchySearchItem(hostEl: any, state: any, options: any = {}) {
    hostEl.empty();
    const surface: any = options.surface || 'sidebar';
    const groupExpanded = state.groupExpanded !== false;
    const treeItemEl = hostEl.createDiv({
      cls: `tree-item puffs-tag-list-item puffs-hierarchy-search-item${surface === 'shelf' ? ' puffs-tag-shelf-card' : ''}${groupExpanded ? ' puffs-tag-expanded' : ''}`,
    });
    const rowEl = treeItemEl.createDiv({
      cls: `tree-item-self tag-pane-tag is-clickable mod-collapsible puffs-tag-list-row puffs-hierarchy-search-row${surface === 'shelf' ? ' puffs-tag-shelf-tag-row' : ''}`,
    });
    rowEl.dataset.puffsHierarchyGroup = 'true';
    rowEl.dataset.puffsVirtualTag = 'true';
    rowEl.setAttribute('aria-expanded', String(groupExpanded));
    const toggleEl = rowEl.createDiv({ cls: 'tree-item-icon collapse-icon puffs-tag-list-toggle' });
    toggleEl.classList.toggle('is-collapsed', !groupExpanded);
    setIcon(toggleEl, 'right-triangle');
    rowEl.createDiv({ text: '父子', cls: 'tree-item-inner' });
    const addButtonEl = rowEl.createEl('button', {
      cls: 'clickable-icon puffs-hierarchy-add-button',
      attr: { 'aria-label': '新增父子笔记' },
    });
    setIcon(addButtonEl, 'plus');
    addButtonEl.addEventListener('click', (event: any) => {
      event.preventDefault();
      event.stopPropagation();
      new NoteRelationModal(this.app, this).open();
    });
    const flairOuterEl = rowEl.createDiv({ cls: 'tree-item-flair-outer' });
    flairOuterEl.createSpan({ text: String(this.getHierarchyEdgeCount()), cls: 'tree-item-flair tag-pane-tag-count' });
    rowEl.addEventListener('click', () => {
      this.toggleHierarchyGroup(state);
      this.renderHierarchySearchItem(hostEl, state, options);
    });
    if (groupExpanded) {
      const contentEl = treeItemEl.createDiv({ cls: 'tree-item-children puffs-hierarchy-search-content' });
      this.renderNoteHierarchyPage(contentEl, state, {
        surface,
        showHeader: false,
        showSearch: false,
      });
    }
  }

  renderNoteHierarchyPage(hostEl: any, state: any, options: any = {}) {
    hostEl.empty();
    hostEl.classList.add('puffs-note-hierarchy-page');
    if (options.showHeader !== false) {
      const headerEl = hostEl.createDiv({ cls: 'puffs-note-hierarchy-header' });
      headerEl.createEl('h3', { text: '父子笔记', cls: 'puffs-note-hierarchy-title' });
      if (options.onBack) {
        const backButton = headerEl.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': '返回标签系统' } });
        setIcon(backButton, 'tags');
        backButton.addEventListener('click', options.onBack);
      }
    }
    const searchEl = options.showSearch === false ? null : hostEl.createEl('input', {
      type: 'search', cls: 'puffs-note-hierarchy-search', attr: { placeholder: '搜索父笔记；父*子；*子' },
    });
    if (searchEl) searchEl.value = state.query || '';
    const listEl = hostEl.createDiv({ cls: 'puffs-note-hierarchy-list' });
    const renderList = () => {
      listEl.empty();
      const items = this.getHierarchyParentItems(state.query, state.currentNotePath);
      if (!items.length) {
        listEl.createDiv({ text: state.query ? '没有匹配的父子关系。' : '暂无父子笔记关系。', cls: 'puffs-relation-empty' });
        return;
      }
      for (const item of items) this.renderHierarchyParentItem(listEl, item, state, renderList, options.surface || 'sidebar');
    };
    const handleSearchEnter = (event: any) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      const matches: any = Array.from(listEl.querySelectorAll('.is-hierarchy-search-match'));
      if (!matches.length) return;
      state.activeMatchIndex = (state.activeMatchIndex + 1) % matches.length;
      matches.forEach((el: any, index: any) => el.classList.toggle('is-active-match', index === state.activeMatchIndex));
      matches[state.activeMatchIndex].scrollIntoView({ block: 'nearest' });
      event.preventDefault();
    };
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        state.query = searchEl.value;
        state.activeMatchIndex = -1;
        renderList();
      });
      searchEl.addEventListener('keydown', handleSearchEnter);
    }
    renderList();
    state.inputEl = searchEl || state.inputEl;
    state.renderList = renderList;
    state.handleSearchEnter = handleSearchEnter;
  }

  renderHierarchyParentItem(listEl: any, item: any, state: any, rerender: any, surface: any) {
    const expanded = this.isHierarchyItemExpanded(state, item.parentPath, 'parent', item.forceExpand);
    const treeEl = listEl.createDiv({ cls: 'tree-item puffs-note-hierarchy-parent' });
    const rowEl = treeEl.createDiv({ cls: 'tree-item-self is-clickable mod-collapsible puffs-note-hierarchy-parent-row' });
    const toggleEl = rowEl.createDiv({ cls: 'tree-item-icon collapse-icon' });
    toggleEl.classList.toggle('is-collapsed', !expanded);
    setIcon(toggleEl, 'right-triangle');
    rowEl.createDiv({ text: item.parentFile.basename, cls: 'tree-item-inner' });
    const addChildButton = rowEl.createEl('button', { cls: 'clickable-icon puffs-hierarchy-add-child-button', attr: { 'aria-label': '添加子笔记' } });
    setIcon(addChildButton, 'user-round-plus');
    addChildButton.addEventListener('click', (event: any) => {
      event.preventDefault();
      event.stopPropagation();
      new NoteRelationModal(this.app, this, item.parentPath, 'child').open();
    });
    const flairOuterEl = rowEl.createDiv({ cls: 'tree-item-flair-outer' });
    flairOuterEl.createSpan({
      text: String(item.descendantCount),
      cls: 'tree-item-flair tag-pane-tag-count',
    });
    rowEl.addEventListener('click', () => {
      this.toggleHierarchyItemExpansion(state, item.parentPath, 'parent');
      rerender();
    });
    rowEl.addEventListener('contextmenu', (event: any) => {
      event.preventDefault();
      this.showHierarchyParentMenu(event, item.parentFile);
    });
    if (expanded) {
      const childrenEl = treeEl.createDiv({ cls: 'tree-item-children puffs-note-hierarchy-children' });
      this.renderHierarchyChildren(childrenEl, item.parentPath, item.parentPath, state, item.matchingPaths, new Set([item.parentPath]), rerender, surface, 0);
    }
  }

  renderHierarchyChildren(containerEl: any, rootPath: any, parentPath: any, state: any, matchingPaths: any, branch: any, rerender: any, surface: any, depth: any) {
    for (const childPath of this.getHierarchyChildren(parentPath)) {
      if (branch.has(childPath)) continue;
      const file = this.app.vault.getAbstractFileByPath(childPath);
      if (!(file instanceof TFile) || file.extension !== 'md') continue;
      const nextBranch = new Set(branch);
      nextBranch.add(childPath);
      const branchKey = `${rootPath}\u0000${parentPath}\u0000${childPath}`;
      const hasChildren = this.getHierarchyChildren(childPath).length > 0;
      const forceOpen = Array.from(matchingPaths).some((path) => path === childPath || this.getHierarchyDescendants(childPath).includes(path));
      const expanded = this.isHierarchyItemExpanded(state, branchKey, 'branch', forceOpen);
      const itemEl = containerEl.createDiv({ cls: 'tree-item puffs-tag-note-item puffs-note-hierarchy-child-item' });
      const cardEl = itemEl.createDiv({ cls: 'tree-item-self puffs-tag-note-card is-clickable puffs-note-hierarchy-child-card' });
      cardEl.dataset.path = file.path;
      cardEl.dataset.puffsHierarchyParent = parentPath;
      cardEl.dataset.puffsSurface = surface;
      const orderButtonEl = cardEl.createEl('button', { cls: 'clickable-icon puffs-tag-note-order-button' });
      orderButtonEl.dataset.path = file.path;
      orderButtonEl.dataset.puffsHierarchyParent = parentPath;
      orderButtonEl.dataset.puffsSurface = surface;
      setIcon(orderButtonEl, 'grip-vertical');
      this.syncNoteOrderButtonSelection(orderButtonEl);
      orderButtonEl.addEventListener('click', (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleHierarchyNoteOrderTarget(parentPath, file.path, surface);
      });
      if (matchingPaths.has(childPath)) cardEl.classList.add('is-hierarchy-search-match');
      if (hasChildren) {
        const toggleEl = cardEl.createDiv({ cls: 'tree-item-icon collapse-icon' });
        toggleEl.classList.toggle('is-collapsed', !expanded);
        setIcon(toggleEl, 'right-triangle');
        toggleEl.addEventListener('click', (event: any) => {
          event.preventDefault();
          event.stopPropagation();
          this.toggleHierarchyItemExpansion(state, branchKey, 'branch');
          rerender();
        });
      }
      cardEl.createDiv({ text: this.getHierarchyDisplayName(parentPath, file), cls: 'tree-item-inner' });
      cardEl.addEventListener('click', () => this.openFileInMainWorkspace(file));
      cardEl.addEventListener('contextmenu', (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        this.showHierarchyChildMenu(event, parentPath, file);
      });
      if (hasChildren && expanded) {
        const nestedEl = itemEl.createDiv({ cls: 'tree-item-children puffs-note-hierarchy-children' });
        this.renderHierarchyChildren(nestedEl, rootPath, childPath, state, matchingPaths, nextBranch, rerender, surface, depth + 1);
      }
    }
  }

  captureHierarchyNavigationSnapshot(view: any, surface: any) {
    const query = this.getTagSearchValue(view);
    const scrollEl = this.getHierarchyNavigationScrollEl(view);
    return { query: String(query || ''), scrollTop: scrollEl?.scrollTop || 0 };
  }

  applyHierarchyNavigationSnapshot(view: any, surface: any, snapshot: any) {
    const history = this.getHierarchyNavigationHistory(view, surface);
    const restoreRequestId = history.restoreRequestId;
    view.searchQuery = snapshot.query;
    view.hierarchyState.activeMatchIndex = -1;
    view.isShowingSearch = true;
    view.searchComponent?.setValue(snapshot.query);
    view.syncSearchVisibility?.();
    view.render();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (history.restoreRequestId !== restoreRequestId) return;
      const scrollEl = this.getHierarchyNavigationScrollEl(view);
      if (scrollEl?.isConnected) scrollEl.scrollTop = snapshot.scrollTop;
      const inputEl = view.searchComponent?.inputEl;
      if (inputEl?.isConnected) inputEl.focus({ preventScroll: true });
    }));
  }
}
