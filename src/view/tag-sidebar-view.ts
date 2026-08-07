// 渲染层：自绘的标签侧边栏视图。
//
// 这是解耦的核心。原先整个侧边栏寄生在核心插件 tag-pane 的 view 实例上：猴子补丁
// updateSearch、读写 tagDoms / searchComponent / collapseOrExpandAllEl 等私有字段，
// 再用 MutationObserver 监视原生 DOM 反复重注入。本视图自己提供外壳（顶栏、搜索框、
// 滚动容器），标签行与笔记卡片则复用既有渲染方法 —— 那些方法本来就是自绘的，
// 只是过去被塞进了原生容器。
//
// 沿用 .nav-header / .nav-buttons-container / .tag-container / .tag-pane-tag 等类名是
// 有意的：它们都是 app.css 里的全局规则（已核实），与 tag-pane 核心插件是否启用无关，
// 因此关掉那个核心插件后视觉完全一致。

import { ItemView, SearchComponent, setIcon } from "obsidian";
import { TAG_SIDEBAR_VIEW_TYPE, createNoteCardSearchState } from "../models";
import { createHierarchyNavigationHistory } from "../relation-utils";
import { resolveSearch } from "../core/search-modes";
import {
  capturePreservedState,
  collectKeyedChildren,
  markRenderKey,
  reconcileOrder,
  restorePreservedState,
  tagRowSignature,
} from "./reconcile";
import {
  getAvailableSidebarToolbarButtons,
  normalizeSidebarToolbarButtons,
} from "../sidebar-toolbar";

/** 顶栏按钮定义。排序与显隐由设置驱动，与原先寄生在原生顶栏时保持一致。 */
const TOOLBAR_BUTTONS = [
  { id: 'expand-collapse', icon: 'chevrons-up-down', label: '全部展开' },
  { id: 'scroll-bottom', icon: 'arrow-down-to-line', label: '回底' },
  { id: 'scroll-top', icon: 'arrow-up-to-line', label: '回顶' },
  { id: 'filter', icon: 'search', label: '筛选' },
];

class PuffsTagSidebarView extends ItemView {
  [key: string]: any;

  constructor(leaf: any, plugin: any) {
    super(leaf);
    this.plugin = plugin;

    // 会话状态。原先分散在 viewPatches 的 patch 对象里，现在归视图自己所有。
    // 展开态仍用 plugin 级的 expandedTags —— 与改造前的侧边栏一致，保持体感。
    this.searchQuery = '';
    this.isShowingSearch = false;
    this.isSearchComposing = false;
    this.noteCardSearchState = createNoteCardSearchState();
    this.hierarchyState = plugin.createHierarchySurfaceState();
    this.hierarchyNavigationHistory = createHierarchyNavigationHistory();
    this.hierarchySearchActive = false;
    this.autoExpandedTag = null;
    this.autoExpandedWasAlreadyExpanded = false;
    this.lastRenderedSearchQuery = '';

    this.searchComponent = null;
    this.listEl = null;
    this.hierarchyPageEl = null;
    this.tagContainerEl = null;
    this.toolbarButtonEls = new Map();
    this.renderHandle = null;
    // 上一轮各标签行的签名，用于判断哪些行可以整棵复用
    this.lastRowSignatures = new Map();
    this.openRenderFallbackTimer = null;
  }

  getViewType() {
    return TAG_SIDEBAR_VIEW_TYPE;
  }

  getDisplayText() {
    return '标签';
  }

  getIcon() {
    // 与原生标签列表同一个图标，标签页外观不变
    return 'tags';
  }

  async onOpen() {
    this.buildLayout();
    this.render();
    // 兜底重绘：视图刚打开时 Obsidian 尚未把 contentEl 接入文档，此刻渲染出的内容
    // 有可能不被应用采纳（实测首次打开会看到空列表）。用一个宏任务再渲染一次，
    // 此时布局已稳定。重复渲染的代价很低 —— 内容没变时所有行都命中复用。
    this.openRenderFallbackTimer = globalThis.setTimeout(() => {
      this.openRenderFallbackTimer = null;
      this.render();
    }, 0);
  }

  async onClose() {
    this.cancelPendingRender();
    if (this.openRenderFallbackTimer !== null) {
      globalThis.clearTimeout(this.openRenderFallbackTimer);
      this.openRenderFallbackTimer = null;
    }
    this.plugin.clearNoteCardSearchState(this.noteCardSearchState);
    this.hierarchyNavigationHistory = createHierarchyNavigationHistory();
    this.searchComponent = null;
    this.listEl = null;
    this.lastRowSignatures = new Map();
  }

  // --- 外壳 ---------------------------------------------------------------

  buildLayout() {
    // 复刻原生标签面板的骨架，让既有 styles.css 直接生效
    this.containerEl.classList.add('puffs-tag-list-mode-enabled');
    this.contentEl.empty();
    this.contentEl.classList.add('puffs-tag-sidebar-content');

    const navHeaderEl = this.contentEl.createDiv({ cls: 'nav-header' });
    const navButtonsEl = navHeaderEl.createDiv({ cls: 'nav-buttons-container' });
    this.navButtonsEl = navButtonsEl;
    this.buildToolbar(navButtonsEl);

    // 搜索框放在 nav-header 内、与按钮容器并列 —— 与原生标签面板的结构一致。
    // 用户的外观定制（把顶栏做成「按钮 + 常驻搜索框」同一行）依赖这个层级，
    // 放到 nav-header 之外会让搜索框换行。
    const searchHostEl = navHeaderEl.createDiv({ cls: 'puffs-tag-sidebar-search-host' });
    this.buildSearch(searchHostEl);

    this.tagContainerEl = this.contentEl.createDiv({ cls: 'tag-container node-insert-event' });
    this.listEl = this.tagContainerEl.createDiv({ cls: 'puffs-tag-list-container' });

    this.registerDomEvents();
    this.syncSearchVisibility();
  }

  buildToolbar(hostEl: any) {
    this.toolbarButtonEls.clear();
    const settings = normalizeSidebarToolbarButtons(this.plugin.settings.sidebarToolbarButtons);
    const available = getAvailableSidebarToolbarButtons(
      settings,
      TOOLBAR_BUTTONS.map((item) => item.id as any)
    );

    for (const setting of available) {
      const definition = TOOLBAR_BUTTONS.find((item) => item.id === setting.id);
      if (!definition) continue;

      const buttonEl = hostEl.createDiv({
        cls: 'clickable-icon nav-action-button',
        attr: { 'aria-label': definition.label, 'data-puffs-toolbar-button': definition.id },
      });
      setIcon(buttonEl, definition.icon);
      buttonEl.classList.toggle('puffs-toolbar-config-hidden', setting.visible === false);
      if (setting.visible === false) buttonEl.setAttribute('aria-hidden', 'true');

      buttonEl.addEventListener('click', (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        this.handleToolbarClick(definition.id);
      });
      this.toolbarButtonEls.set(definition.id, buttonEl);
    }
  }

  buildSearch(hostEl: any) {
    this.searchComponent = new SearchComponent(hostEl);
    this.searchComponent.containerEl.classList.add('puffs-tag-sidebar-search-container');
    this.searchComponent.setPlaceholder('搜索标签');
    this.searchComponent.setValue(this.searchQuery);

    const inputEl = this.searchComponent.inputEl;

    // 中文输入法组词期间不刷新结果，确认落字后再更新（与设置项 freezeSearchWhileComposing 一致）
    inputEl.addEventListener('compositionstart', () => {
      this.isSearchComposing = this.plugin.settings.freezeSearchWhileComposing;
    });
    inputEl.addEventListener('compositionend', () => {
      this.isSearchComposing = false;
      this.applySearchValue(inputEl.value);
    });
    this.searchComponent.onChange((value: any) => {
      if (this.isSearchComposing) return;
      this.applySearchValue(value);
    });

    inputEl.addEventListener('keydown', (event: any) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.toggleSearch();
        return;
      }
      if (event.key !== 'Enter' || event.isComposing) return;
      if (this.hierarchySearchActive) {
        this.hierarchyState.handleSearchEnter?.(event);
        return;
      }
      if (!this.plugin.advanceNoteCardSearchState(this.noteCardSearchState)) return;
      event.preventDefault();
      event.stopPropagation();
      this.render();
    });
  }

  /**
   * 快捷键（默认 Ctrl+F）是聚焦优先，不是开关。
   *
   * 搜索框在样式上常驻可见（styles.css 里特异性高于 .puffs-tag-hidden），
   * 原先绑 toggleSearch 会让「焦点在列表里按一下」变成清空内容却不聚焦。
   * 收起搜索框仍由 Esc 和工具栏按钮负责。
   */
  handleQuickSearchHotkey() {
    const inputEl = this.searchComponent?.inputEl;
    if (inputEl && inputEl.isConnected && inputEl.ownerDocument?.activeElement === inputEl) {
      // 焦点已在框内：再按一次清空条件，焦点留在原地
      this.searchComponent?.setValue('');
      this.applySearchValue('');
      return;
    }
    this.focusSearch();
  }

  registerDomEvents() {
    // 单一委托入口。旧实现把点击、右键分散在 patchTagView 里绑定，这里集中处理。
    this.contentEl.addEventListener('click', (event: any) => this.handleClick(event), true);
    this.contentEl.addEventListener('contextmenu', (event: any) => this.handleContextMenu(event), true);
  }

  // --- 搜索 ---------------------------------------------------------------

  applySearchValue(value: any) {
    if (value === this.searchQuery) return;
    this.searchQuery = value;
    this.render();
    // 输入新条件时回到顶部；带 * 的笔记定位不重置，避免打断定位滚动
    if (value.trim() && !value.includes('*')) {
      window.requestAnimationFrame(() => {
        if (this.tagContainerEl?.isConnected) this.tagContainerEl.scrollTop = 0;
      });
    }
  }

  toggleSearch() {
    if (this.isShowingSearch) {
      // 收起时清空条件，与原先 Ctrl+F 再按一次的行为一致
      this.searchComponent?.setValue('');
      if (this.searchQuery !== '') {
        this.searchQuery = '';
        this.render();
      }
      this.isShowingSearch = false;
      this.syncSearchVisibility();
      return;
    }

    this.isShowingSearch = true;
    this.syncSearchVisibility();
    window.setTimeout(() => this.searchComponent?.inputEl?.focus(), 0);
  }

  focusSearch() {
    if (!this.isShowingSearch) {
      this.isShowingSearch = true;
      this.syncSearchVisibility();
    }
    const inputEl = this.searchComponent?.inputEl;
    if (!inputEl?.isConnected) return;
    try {
      inputEl.focus({ preventScroll: true });
    } catch (error) {
      inputEl.focus();
    }
  }

  syncSearchVisibility() {
    const containerEl = this.searchComponent?.containerEl;
    if (!containerEl) return;
    containerEl.classList.toggle('puffs-tag-hidden', !this.isShowingSearch && !this.hierarchySearchActive);
  }

  /** 当前搜索框里的内容，供 plugin 侧的通用逻辑取用。 */
  getSearchValue() {
    return this.searchQuery;
  }

  isActiveView() {
    return (
      this.app.workspace.activeLeaf === this.leaf ||
      !!this.containerEl.closest('.workspace-leaf.mod-active') ||
      this.contentEl.contains(document.activeElement)
    );
  }

  // --- 重绘 ---------------------------------------------------------------

  /** 供既有渲染方法的 rerender 回调调用（见 tag-pane.ts 的 scheduleSyncView）。 */
  requestRender() {
    if (this.renderHandle !== null) return;
    this.renderHandle = window.requestAnimationFrame(() => {
      this.renderHandle = null;
      this.render();
    });
  }

  cancelPendingRender() {
    if (this.renderHandle === null) return;
    window.cancelAnimationFrame(this.renderHandle);
    this.renderHandle = null;
  }

  refresh() {
    this.render();
  }

  render() {
    // 只挡视图已关闭的情况（onClose 会把 listEl 置空）。
    // 不能用 isConnected 挡：onOpen 时 contentEl 还没接入文档，那样首次渲染会被跳过、
    // 打开侧边栏看到空列表。在游离的 DOM 树上渲染同样有效，挂载后自然显示。
    if (!this.listEl) return;

    const plugin = this.plugin;
    const resolved = resolveSearch(this.searchQuery, (query) => plugin.resolvePinnedSearchQuery(query));

    // 父子层级搜索走独立页面
    if (resolved.id === 'hierarchy') {
      this.renderHierarchyPage();
      return;
    }
    this.hideHierarchyPage();

    const items = this.collectItems(resolved);
    this.syncSearchState(resolved, items);
    plugin.clearStaleVirtualExpandedTags(new Set(items.matching.map((item: any) => item.tag)));

    const preserved = capturePreservedState(this.tagContainerEl, this.listEl);
    this.renderTagRows(items.display, resolved);

    plugin.scheduleNoteCardSearchEffect(
      this.listEl,
      this.searchComponent?.inputEl,
      this.noteCardSearchState
    );
    this.updateToolbarState(items.display, items.matching);
    plugin.scheduleTagOrderModeVisibilityReconcile();

    // 换了搜索条件时回到顶部；否则保持用户原来的滚动位置与焦点
    const shouldResetScroll = this.searchQuery !== this.lastRenderedSearchQuery
      && this.searchQuery.trim()
      && !this.searchQuery.includes('*');
    this.lastRenderedSearchQuery = this.searchQuery;
    restorePreservedState(this.tagContainerEl, this.listEl, preserved);
    if (shouldResetScroll) this.tagContainerEl.scrollTop = 0;
  }

  /**
   * 增量重绘标签列表。
   *
   * 逐行比对签名：未变的整棵子树直接复用（连 next 节点都不构建），变了的才重新渲染，
   * 最后按顺序对账。150 个标签里通常只有 1–2 个展开，绝大多数行每次都命中复用，
   * 因此展开态、焦点、文本选区都不会被刷新打断。
   */
  renderTagRows(displayItems: any[], resolved: any) {
    const plugin = this.plugin;

    if (displayItems.length === 0) {
      this.listEl.empty();
      this.lastRowSignatures = new Map();
      this.listEl.createDiv({
        cls: 'puffs-tag-list-empty',
        text: this.emptyMessageFor(resolved),
      });
      return;
    }

    const existingRows = collectKeyedChildren(this.listEl);
    const nextSignatures = new Map();
    const targetPath = this.noteCardSearchState?.target?.path || '';
    // 只用来承接新建的行；复用的行留在原位不动，避免脱离文档丢焦点
    const stagingEl = this.listEl.ownerDocument.createElement('div');
    const orderedNodes: Node[] = [];

    for (const item of displayItems) {
      const key = String(item.tag);
      const signature = tagRowSignature(item, {
        expanded: plugin.expandedTags.has(item.tag),
        pinned: plugin.settings.pinnedTag === item.tag,
        targetPath: this.noteCardSearchState?.target?.tag === item.tag ? targetPath : '',
        inlineHierarchyVersion: plugin.inlineHierarchyExpansionVersion || 0,
        relationVersion: plugin.relationStructureVersion || 0,
      });
      nextSignatures.set(key, signature);

      const reusable = existingRows.get(key);
      if (reusable && this.lastRowSignatures.get(key) === signature) {
        orderedNodes.push(reusable);
        continue;
      }
      // 复用既有的标签行渲染：DOM 结构、按钮出现条件、计数文案都由 27 个契约测试守着
      plugin.renderListModeTagItem(stagingEl, item, this, this);
      const rendered = stagingEl.lastElementChild;
      if (rendered) {
        markRenderKey(rendered, key);
        orderedNodes.push(rendered);
      }
    }

    reconcileOrder(this.listEl, orderedNodes);
    this.lastRowSignatures = nextSignatures;
  }

  collectItems(resolved: any) {
    const plugin = this.plugin;

    if (resolved.id === 'current-note-tags') {
      const matching = plugin.getCurrentNoteTagItems();
      return { matching, display: matching };
    }

    const matching = plugin.getListModeItems(this, resolved.effectiveQuery, false);
    return { matching, display: plugin.prependPinnedTagItem(matching, resolved.rawQuery) };
  }

  syncSearchState(resolved: any, items: any) {
    const plugin = this.plugin;

    if (resolved.id === 'current-note-tags') {
      this.clearAutoExpandedTag();
      plugin.syncCurrentNoteTagSearchState(this.noteCardSearchState, items.matching);
      return;
    }
    if (resolved.id === 'note-card') {
      this.clearAutoExpandedTag();
      plugin.syncNoteCardSearchState(this.noteCardSearchState, resolved.effectiveQuery, items.matching);
      return;
    }

    plugin.clearNoteCardSearchState(this.noteCardSearchState);
    if (resolved.id === 'note-card') return;

    // 唯一命中结果自动展开（置顶标签的空搜索也走这条路）
    const autoExpandItems = plugin.settings.pinnedTag && !resolved.effectiveQuery.trim()
      ? items.display
      : items.matching;
    this.syncAutoSingleSearchResult(resolved.tagQuery, autoExpandItems);
  }

  syncAutoSingleSearchResult(query: any, items: any) {
    const plugin = this.plugin;
    const trimmed = String(query || '').trim();
    if ((!trimmed && !plugin.isPinnedOnlyTagResult(query, items)) || items.length !== 1) {
      this.clearAutoExpandedTag();
      return;
    }

    const tag = items[0].tag;
    if (this.autoExpandedTag === tag) return;

    this.clearAutoExpandedTag();
    this.autoExpandedTag = tag;
    this.autoExpandedWasAlreadyExpanded = plugin.expandedTags.has(tag);
    plugin.expandedTags.add(tag);
  }

  clearAutoExpandedTag() {
    if (!this.autoExpandedTag) return;
    if (!this.autoExpandedWasAlreadyExpanded) {
      this.plugin.expandedTags.delete(this.autoExpandedTag);
      this.plugin.clearInlineHierarchyBranchState(this.autoExpandedTag);
    }
    this.autoExpandedTag = null;
    this.autoExpandedWasAlreadyExpanded = false;
  }

  emptyMessageFor(resolved: any) {
    if (resolved.id === 'current-note-tags') return this.plugin.getCurrentNoteTagEmptyMessage();
    return this.searchQuery.trim() ? '没有匹配的标签。' : '暂无可展示的标签。';
  }

  // --- 父子层级页面 -------------------------------------------------------

  renderHierarchyPage() {
    const plugin = this.plugin;
    const context = plugin.getHierarchySearchContext(this.searchQuery);
    if (!this.hierarchySearchActive) this.hierarchyState.groupExpanded = true;
    this.hierarchySearchActive = true;
    this.hierarchyState.query = context.query;
    this.hierarchyState.currentNotePath = context.currentNotePath;

    this.containerEl.classList.add('puffs-note-hierarchy-mode');
    this.listEl.classList.add('puffs-tag-hidden');
    if (!this.hierarchyPageEl?.isConnected) {
      this.hierarchyPageEl = this.tagContainerEl.createDiv({
        cls: 'puffs-tag-list-container puffs-note-hierarchy-sidebar',
      });
    }
    this.hierarchyPageEl.classList.remove('puffs-tag-hidden');

    plugin.renderHierarchySearchItem(this.hierarchyPageEl, this.hierarchyState, { surface: 'sidebar' });
    this.hierarchyState.inputEl = this.searchComponent?.inputEl;
    this.updateHierarchyToolbarState();
    this.syncSearchVisibility();
  }

  hideHierarchyPage() {
    if (!this.hierarchySearchActive && !this.hierarchyPageEl) return;
    this.hierarchySearchActive = false;
    this.containerEl.classList.remove('puffs-note-hierarchy-mode');
    this.hierarchyPageEl?.classList.add('puffs-tag-hidden');
    this.listEl?.classList.remove('puffs-tag-hidden');
    this.syncSearchVisibility();
  }

  exitHierarchySearch() {
    if (!this.hierarchySearchActive) return false;
    this.searchComponent?.setValue('');
    this.searchQuery = '';
    this.render();
    return true;
  }

  // --- 顶栏 ---------------------------------------------------------------

  handleToolbarClick(id: any) {
    if (id === 'expand-collapse') {
      if (this.hierarchySearchActive) {
        this.plugin.toggleAllHierarchyItems(this.hierarchyState);
        this.updateHierarchyToolbarState();
      } else {
        this.toggleAllTags();
      }
      return;
    }
    if (id === 'scroll-bottom') {
      this.tagContainerEl.scrollTop = this.tagContainerEl.scrollHeight;
      return;
    }
    if (id === 'scroll-top') {
      this.tagContainerEl.scrollTop = 0;
      return;
    }
    if (id === 'filter') this.toggleSearch();
  }

  toggleAllTags() {
    const plugin = this.plugin;
    const resolved = resolveSearch(this.searchQuery, (query) => plugin.resolvePinnedSearchQuery(query));
    const matching = resolved.id === 'current-note-tags'
      ? plugin.getCurrentNoteTagItems()
      : plugin.getListModeItems(this, resolved.effectiveQuery, false);
    const display = resolved.id === 'current-note-tags'
      ? matching
      : plugin.prependPinnedTagItem(matching, resolved.rawQuery);
    if (display.length === 0) return;

    // 唯一命中标签自动展开时，顶栏按钮改为递归控制它内部的继承分组
    const inheritanceControl = plugin.getUniqueSearchInheritanceControl(
      display,
      this.searchQuery,
      plugin.expandedTags,
      matching
    );
    if (inheritanceControl) {
      for (const tag of inheritanceControl.tags) plugin.expandedTags.add(tag);
      plugin.setAllTagInheritanceGroupsExpanded(inheritanceControl.keys, inheritanceControl.shouldExpand);
      plugin.refreshAllTagViews();
      return;
    }

    const shouldExpand = this.searchQuery.trim()
      ? display.some((item: any) => !plugin.expandedTags.has(item.tag))
      : !display.some((item: any) => plugin.expandedTags.has(item.tag));
    for (const item of display) {
      if (shouldExpand) plugin.expandedTags.add(item.tag);
      else {
        plugin.expandedTags.delete(item.tag);
        plugin.clearInlineHierarchyBranchState(item.tag);
      }
    }
    this.render();
  }

  updateToolbarState(display: any, matching: any) {
    const buttonEl = this.toolbarButtonEls.get('expand-collapse');
    if (!buttonEl) return;

    const plugin = this.plugin;
    const inheritanceControl = plugin.getUniqueSearchInheritanceControl(
      display,
      this.searchQuery,
      plugin.expandedTags,
      matching
    );
    const shouldExpand = inheritanceControl
      ? inheritanceControl.shouldExpand
      : (this.searchQuery.trim()
        ? display.some((item: any) => !plugin.expandedTags.has(item.tag))
        : !display.some((item: any) => plugin.expandedTags.has(item.tag)));

    setIcon(buttonEl, shouldExpand ? 'chevrons-up-down' : 'chevrons-down-up');
    buttonEl.setAttribute('aria-label', shouldExpand ? '全部展开' : '全部收起');
    this.setToolbarContextHidden(false);
  }

  updateHierarchyToolbarState() {
    const buttonEl = this.toolbarButtonEls.get('expand-collapse');
    if (buttonEl) {
      const allExpanded = this.hierarchyState.allExpanded;
      setIcon(buttonEl, allExpanded ? 'chevrons-down-up' : 'chevrons-up-down');
      buttonEl.setAttribute('aria-label', allExpanded ? '全部收起' : '全部展开');
    }
    this.setToolbarContextHidden(true);
  }

  /** 父子层级页面只保留展开收起与回顶回底，其余按钮临时隐藏。 */
  setToolbarContextHidden(hierarchyMode: any) {
    const keepIds = ['expand-collapse', 'scroll-bottom', 'scroll-top'];
    for (const [id, buttonEl] of this.toolbarButtonEls) {
      const hidden = hierarchyMode && !keepIds.includes(id);
      buttonEl.classList.toggle('puffs-toolbar-context-hidden', hidden);
      if (hidden) buttonEl.setAttribute('aria-hidden', 'true');
      else if (!buttonEl.classList.contains('puffs-toolbar-config-hidden')) {
        buttonEl.removeAttribute('aria-hidden');
      }
    }
  }

  /** 设置里调整了顶栏按钮的顺序或显隐后重建顶栏。 */
  rebuildToolbar() {
    if (!this.navButtonsEl) return;
    this.navButtonsEl.empty();
    this.buildToolbar(this.navButtonsEl);
    this.render();
  }

  // --- 事件委托 -----------------------------------------------------------

  handleClick(event: any) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !this.listEl) return;
    if (target.closest('.nav-buttons-container') || target.closest('.puffs-tag-sidebar-search-host')) return;

    const plugin = this.plugin;
    const stop = () => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const inlineToggleEl = target.closest('.puffs-inline-hierarchy-toggle');
    if (inlineToggleEl) {
      stop();
      plugin.toggleInlineHierarchyBranch(inlineToggleEl.dataset.puffsInlineHierarchyBranchKey);
      plugin.refreshAllTagViews();
      return;
    }

    if (target.closest('.puffs-note-hierarchy-child-card .collapse-icon')) return;

    const pinButtonEl = target.closest('.puffs-tag-pin-button');
    if (pinButtonEl) {
      stop();
      plugin.togglePinnedTag(pinButtonEl.dataset.puffsTag).catch((error: any) => {
        console.error('[Puffs Tag Enhance] Failed to toggle pinned tag:', error);
      });
      return;
    }

    const inheritanceButtonEl = target.closest('.puffs-tag-inheritance-button');
    if (inheritanceButtonEl) {
      stop();
      plugin.toggleTagInheritance(inheritanceButtonEl.dataset.puffsTag).catch((error: any) => {
        console.error('[Puffs Tag Enhance] Failed to toggle tag inheritance:', error);
      });
      return;
    }

    const scrollBottomEl = target.closest('.puffs-tag-scroll-bottom-button');
    if (scrollBottomEl) {
      stop();
      plugin.scheduleLastNoteCardScroll(this.listEl, scrollBottomEl.dataset.puffsTag);
      return;
    }

    const scrollTopEl = target.closest('.puffs-tag-scroll-top-button');
    if (scrollTopEl) {
      stop();
      plugin.scheduleTagTopScroll(this.listEl, scrollTopEl.dataset.puffsTag);
      return;
    }

    const orderButtonEl = target.closest('.puffs-tag-note-order-button');
    if (orderButtonEl) {
      if (orderButtonEl.classList.contains('puffs-note-parent-control-button')) return;
      stop();
      if (orderButtonEl.dataset.puffsHierarchyParent) {
        plugin.toggleHierarchyNoteOrderTarget(
          orderButtonEl.dataset.puffsHierarchyParent,
          orderButtonEl.dataset.path,
          'sidebar'
        );
      } else {
        plugin.toggleNoteOrderTarget(orderButtonEl.dataset.puffsTag, orderButtonEl.dataset.path, 'sidebar');
      }
      return;
    }

    if (target.closest('.puffs-tag-order-parent-button')) return;

    const noteCardEl = target.closest('.puffs-tag-note-card');
    if (noteCardEl) {
      stop();
      plugin.openNoteCard(noteCardEl);
      return;
    }

    const tagEl = target.closest('.tag-pane-tag[data-puffs-tag]');
    if (!tagEl) return;
    stop();
    if (plugin.isTagOrderModeActive(tagEl.dataset.puffsTag)) plugin.exitTagOrderMode(false);
    plugin.toggleTagExpansion(tagEl.dataset.puffsTag, this);
  }

  handleContextMenu(event: any) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const noteCardEl = target.closest('.puffs-tag-note-card');
    if (noteCardEl) {
      if (!this.plugin.showNoteCardContextMenu(event, noteCardEl)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    const tagEl = target.closest('.tag-pane-tag');
    if (!tagEl || tagEl.dataset.puffsVirtualTag === 'true') return;

    const tag = this.plugin.findTagForElement(this, tagEl);
    if (!tag) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.plugin.showTagContextMenu(event, tag);
  }
}

export { PuffsTagSidebarView, TOOLBAR_BUTTONS };
