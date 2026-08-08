// 渲染层：标签继承树、标签内父子笔记树、父子层级页面。
//
// 这些方法原先住在 relations.ts 里，与继承关系的数据计算混在同一个 2466 行的文件中
// （该文件曾有 145 处 DOM 操作）。搬到 view/ 后 relations.ts 只剩数据与规则，
// 得以纳入 architecture.test.ts 的分层守卫。
//
// 它们仍以 Behavior 的形式 mixin 到 plugin 上，调用关系与搬迁前完全一致。

import { Menu, Notice, TFile, setIcon } from "obsidian";
import { isNestedTag, normalizeTag } from "../models";
import {
  buildVisibleHierarchyForest,
  compareHierarchyParentItems,
} from "../relation-utils";
import { NoteRelationModal } from "../relation-modals";
import { shouldShowScrollButtons } from "../sidebar-toolbar";

export class TagTreeRendererBehavior {
  [key: string]: any;

  /** 把运行时折叠集合批量同步到已经存在的分支节点，不重建它们的父级或兄弟节点。 */
  syncInlineHierarchyExpansion(rootEl: any) {
    if (!rootEl) return;
    const hosts = Array.from<any>(rootEl.querySelectorAll('[data-puffs-inline-expansion-host="true"]'));
    for (const hostEl of hosts) {
      if (!rootEl.contains(hostEl)) continue;
      hostEl.puffsSyncExpansion?.();
    }
  }

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
      // 交集组里的笔记归属**持有这条交集边的那个标签**（node.noteTag），卡片的
      // dataset.puffsTag 必须跟着它 —— 写成对方标签的话，右键「从 X 中排除」、显示名、
      // 笔记排序会全部串到对方标签上；写成当前展开的根标签则会与顶层入口分裂成两套存档。
      this.renderInlineTagNoteTree(containerEl, files, node.noteTag || node.tag, false, {
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
      tagValue = null
    ) => {
      if (!count) return;
      const itemEl = containerEl.createDiv({ cls: 'tree-item puffs-tag-list-item puffs-inheritance-tag-group' });
      itemEl.dataset.puffsInlineExpansionHost = 'true';
      const rowEl = itemEl.createDiv({
        cls: 'tree-item-self tag-pane-tag is-clickable mod-collapsible puffs-tag-list-row puffs-inheritance-tag-group-row',
      });
      rowEl.dataset.puffsInheritanceGroup = key;
      if (tagValue) rowEl.dataset.puffsInheritanceTag = tagValue;
      // 子标签排序已搬进管理子标签弹窗，这里只剩纯展开箭头
      const toggleEl = rowEl.createDiv({ cls: 'tree-item-icon collapse-icon puffs-tag-list-toggle' });
      setIcon(toggleEl, 'right-triangle');
      rowEl.createDiv({ text: label, cls: 'tree-item-inner' });
      const flairOuterEl = rowEl.createDiv({ cls: 'tree-item-flair-outer' });
      flairOuterEl.createSpan({ text: String(count), cls: 'tree-item-flair tag-pane-tag-count' });
      // 回底按钮只在展开且笔记数达阈值时存在，与顶层标签行一致 ——
      // 折叠的行没有可滚动的内容，留着按钮既无意义又与顶层行为不一致。
      // 因此建/删都放进 syncExpansion，随展开态增删。
      const syncScrollBottomButton = (expanded: any) => {
        const existingEl = rowEl.querySelector('.puffs-tag-scroll-bottom-button');
        const shouldShow = expanded &&
          shouldShowScrollButtons(count, this.settings?.scrollTopButtonThreshold);
        if (!shouldShow) {
          existingEl?.remove();
          return;
        }
        if (existingEl) return;
        const scrollBottomButtonEl = rowEl.createEl('button', {
          cls: 'clickable-icon puffs-tag-scroll-bottom-button',
          attr: { type: 'button', 'aria-label': '回底' },
        });
        if (tagValue) scrollBottomButtonEl.dataset.puffsTag = tagValue;
        // 锚点让点击时就近在本子树内定位，避免同名标签出现在多棵继承树时跳错位置
        scrollBottomButtonEl.dataset.puffsScrollAnchor = 'true';
        setIcon(scrollBottomButtonEl, 'arrow-down-to-line');
        // 计数容器先建，按钮要插到它前面才与顶层标签行的元素顺序一致
        rowEl.insertBefore(scrollBottomButtonEl, flairOuterEl);
      };
      const syncExpansion = () => {
        const expanded = (!!targetPath && containsTarget) || !collapsed.has(key);
        rowEl.setAttribute('aria-expanded', String(expanded));
        toggleEl.classList.toggle('is-collapsed', !expanded);
        syncScrollBottomButton(expanded);
        let contentEl = Array.from<any>(itemEl.children).find((el: any) =>
          el.classList.contains('puffs-inheritance-tag-group-content')
        );
        if (!expanded) {
          contentEl?.remove();
          return;
        }
        if (!contentEl) {
          contentEl = itemEl.createDiv({ cls: 'tree-item-children puffs-inheritance-tag-group-content' });
          renderContent(contentEl);
        }
      };
      itemEl.puffsSyncExpansion = syncExpansion;
      rowEl.addEventListener('click', () => {
        this.toggleInlineHierarchyBranch(key);
        syncExpansion();
        options.onExpansionChange?.();
      });
      if (tagValue) {
        rowEl.addEventListener('contextmenu', (event: any) => {
          event.preventDefault();
          event.stopPropagation();
          this.showTagContextMenu(event, tagValue);
        });
      }
      syncExpansion();
    };
    const renderNode = (containerEl: any, node: any, lineage: any, directParentTag: any) => {
      // 交集组是叶子：不再往下递归对方的子标签，笔记也不算继承来的
      if (node.isIntersection) {
        renderGroup(
          containerEl,
          this.getRelativeChildDisplayName(directParentTag, node.tag),
          node.paths.length,
          // key 带完整血缘，与 getTagInheritanceGroupKeys 一致 ——
          // 交集组可能挂在任意深度，只写伙伴标签会让不同层级的同名组撞车
          `${rootTag}\u0000tag-intersection\u0000${lineage.join('\u0001')}`,
          node.paths.includes(targetPath),
          (contentEl: any) => renderNotes(contentEl, node, false),
          node.tag
        );
        return;
      }
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
      // 名字符合「父标签-子名称」就只显示后缀，与是否锁定为固定子标签无关
      const label = this.getRelativeChildDisplayName(directParentTag, node.tag);
      renderGroup(containerEl, label, node.subtreePaths.length, key,
        node.subtreePaths.includes(targetPath), renderNodeContent, node.tag);
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
      if (children.length) itemEl.dataset.puffsInlineExpansionHost = 'true';
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
      let inlineToggleEl: any = null;
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
          itemEl.puffsSyncExpansion?.();
          options.onExpansionChange?.();
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
        inlineToggleEl = cardEl.createDiv({ cls: 'tree-item-icon collapse-icon puffs-inline-hierarchy-toggle' });
        inlineToggleEl.dataset.puffsInlineHierarchyBranchKey = branchKey;
        inlineToggleEl.classList.toggle('is-collapsed', !expanded);
        setIcon(inlineToggleEl, 'right-triangle');
        inlineToggleEl.addEventListener('click', (event: any) => {
          event.preventDefault();
          event.stopPropagation();
          this.toggleInlineHierarchyBranch(branchKey);
          itemEl.puffsSyncExpansion?.();
          options.onExpansionChange?.();
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

      if (children.length) {
        const syncExpansion = () => {
          const nextExpanded = forceExpanded || !collapsedBranches.has(branchKey);
          if (usesCombinedParentControl) {
            orderButtonEl.dataset.puffsExpanded = String(nextExpanded);
            this.syncNoteOrderButtonSelection(orderButtonEl);
          } else {
            inlineToggleEl?.classList.toggle('is-collapsed', !nextExpanded);
            inlineToggleEl?.setAttribute('aria-expanded', String(nextExpanded));
          }
          let childHostEl = Array.from<any>(itemEl.children).find((el: any) =>
            el.classList.contains('puffs-inline-hierarchy-children')
          );
          if (!nextExpanded) {
            childHostEl?.remove();
            return;
          }
          if (!childHostEl) {
            childHostEl = itemEl.createDiv({ cls: 'tree-item-children puffs-inline-hierarchy-children' });
            for (const childPath of children) renderNode(childHostEl, childPath, path, nextBranch);
          }
        };
        itemEl.puffsSyncExpansion = syncExpansion;
        syncExpansion();
      }
    };

    const roots = forest.roots.length ? forest.roots : orderedFiles.map((file) => file.path);
    for (const rootPath of roots) renderNode(hostEl, rootPath);

    if (
      shouldShowScrollButtons(orderedFiles.length, this.settings?.scrollTopButtonThreshold) &&
      renderedCards.length
    ) {
      const scrollTopButtonEl = renderedCards[renderedCards.length - 1].createEl('button', {
        cls: 'clickable-icon puffs-tag-scroll-top-button',
      });
      if (tagValue) scrollTopButtonEl.dataset.puffsTag = tagValue;
      scrollTopButtonEl.dataset.puffsScrollAnchor = 'true';
      setIcon(scrollTopButtonEl, 'arrow-up-to-line');
      scrollTopButtonEl.addEventListener('click', (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        this.scheduleTagTopScroll(options.scrollContainer || hostEl, tagValue, scrollTopButtonEl);
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
    const addChildButton = rowEl.createEl('button', { cls: 'clickable-icon puffs-hierarchy-add-child-button', attr: { 'aria-label': '管理子笔记' } });
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

    const restoreViewState = () => {
      if (history.restoreRequestId !== restoreRequestId) return;
      const scrollEl = this.getHierarchyNavigationScrollEl(view);
      if (scrollEl?.isConnected) scrollEl.scrollTop = snapshot.scrollTop;
      const inputEl = view.searchComponent?.inputEl;
      if (inputEl?.isConnected) inputEl.focus({ preventScroll: true });
    };

    // render() 已同步完成 DOM 对账，先立即恢复，避免窗口失焦时 requestAnimationFrame
    // 被 Chromium 暂停；再用一个宏任务覆盖 Obsidian 同轮事件中可能发生的布局回写。
    restoreViewState();
    globalThis.setTimeout(restoreViewState, 0);
  }
}
