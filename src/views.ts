// @ts-nocheck
import { ItemView, Notice, SearchComponent, setIcon } from "obsidian";
import {
  TAG_SHELF_VIEW_TYPE,
  TAG_SYSTEM_ICON,
  createNoteCardSearchState,
  parseNoteCardSearch
} from "./models";

class PuffsTagShelfView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.searchQuery = '';
    this.expandedTags = new Set();
    this.autoExpandedTag = null;
    this.autoExpandedWasAlreadyExpanded = false;
    this.searchComponent = null;
    this.isShowingSearch = true;
    this.searchHotkeyHandler = null;
    this.searchCompositionCleanup = null;
    this.isSearchComposing = false;
    this.noteCardSearchState = createNoteCardSearchState();
    this.listEl = null;
    this.summaryTagCountEl = null;
    this.summaryNoteCountEl = null;
    this.hierarchyMode = false;
    this.hierarchyState = this.plugin.createHierarchySurfaceState();
  }

  getViewType() {
    return TAG_SHELF_VIEW_TYPE;
  }

  getDisplayText() {
    return '标签系统';
  }

  getIcon() {
    return TAG_SYSTEM_ICON;
  }

  async onOpen() {
    this.searchHotkeyHandler = (event) => this.handleSearchHotkey(event);
    window.addEventListener('keydown', this.searchHotkeyHandler, true);
    document.addEventListener('keydown', this.searchHotkeyHandler, true);
    this.render();
  }

  async onClose() {
    this.clearSearchCompositionHandlers();
    if (this.searchHotkeyHandler) {
      window.removeEventListener('keydown', this.searchHotkeyHandler, true);
      document.removeEventListener('keydown', this.searchHotkeyHandler, true);
      this.searchHotkeyHandler = null;
    }
    this.plugin.clearNoteCardSearchState(this.noteCardSearchState, this.expandedTags);
    this.searchComponent = null;
  }

  refresh() {
    const scrollTop = this.contentEl.scrollTop;
    this.render();
    window.requestAnimationFrame(() => {
      this.contentEl.scrollTop = scrollTop;
    });
  }

  toggleSearch() {
    if (this.hierarchyMode) {
      if (this.hierarchyState.inputEl) this.hierarchyState.inputEl.focus();
      return;
    }

    const inputEl = this.searchComponent && this.searchComponent.inputEl;
    if (!inputEl) return;

    if (this.isShowingSearch) {
      this.searchComponent.setValue('');
      if (inputEl.value !== '') {
        inputEl.value = '';
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (this.searchQuery !== '') {
        this.searchQuery = '';
        this.renderTagList();
      }
      this.isShowingSearch = false;
    } else {
      this.isShowingSearch = true;
    }

    window.setTimeout(() => inputEl.focus(), 0);
  }

  handleSearchHotkey(event) {
    if (!this.plugin.isQuickSearchHotkey(event) || !this.isActiveView()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.toggleSearch();
  }

  isActiveView() {
    return (
      this.app.workspace.activeLeaf === this.leaf ||
      !!this.contentEl.closest('.workspace-leaf.mod-active') ||
      this.contentEl.contains(document.activeElement)
    );
  }

  render() {
    this.clearSearchCompositionHandlers();
    this.contentEl.empty();
    this.contentEl.classList.add('puffs-tag-shelf-view');

    if (this.hierarchyMode) {
      this.renderHierarchyPage();
      return;
    }

    const pageEl = document.createElement('div');
    pageEl.className = 'puffs-tag-shelf-page';
    this.syncSidebarTreeStyles(pageEl);

    const headerEl = document.createElement('div');
    headerEl.className = 'puffs-tag-shelf-header';

    const titleEl = document.createElement('h3');
    titleEl.className = 'puffs-tag-shelf-title';
    titleEl.textContent = '标签系统';

    const hierarchyButtonEl = document.createElement('button');
    hierarchyButtonEl.type = 'button';
    hierarchyButtonEl.className = 'clickable-icon puffs-note-hierarchy-button';
    hierarchyButtonEl.setAttribute('aria-label', '打开父子笔记');
    setIcon(hierarchyButtonEl, 'git-fork');
    hierarchyButtonEl.addEventListener('click', () => {
      this.hierarchyMode = true;
      this.render();
    });

    headerEl.appendChild(titleEl);
    headerEl.appendChild(hierarchyButtonEl);
    pageEl.appendChild(headerEl);

    const summaryEl = document.createElement('div');
    summaryEl.className = 'puffs-tag-shelf-summary';
    const tagSummary = this.createSummaryCard('标签数量', '0 个');
    const noteSummary = this.createSummaryCard('笔记数量', '0 篇');
    this.summaryTagCountEl = tagSummary.valueEl;
    this.summaryNoteCountEl = noteSummary.valueEl;
    summaryEl.appendChild(tagSummary.cardEl);
    summaryEl.appendChild(noteSummary.cardEl);
    pageEl.appendChild(summaryEl);

    const sectionHeaderEl = document.createElement('div');
    sectionHeaderEl.className = 'puffs-tag-shelf-section-header';

    const sectionTitleEl = document.createElement('h3');
    sectionTitleEl.className = 'puffs-tag-shelf-section-title';
    sectionTitleEl.textContent = '标签列表';

    const searchHostEl = document.createElement('div');
    searchHostEl.className = 'puffs-tag-shelf-search-host';
    this.searchComponent = new SearchComponent(searchHostEl);
    this.searchComponent.containerEl.classList.add('puffs-tag-shelf-search-container');
    this.searchComponent.inputEl.classList.add('puffs-tag-shelf-search-input');
    this.searchComponent.setPlaceholder('搜索标签');
    this.searchComponent.setValue(this.searchQuery);
    const searchInputEl = this.searchComponent.inputEl;
    const applySearchValue = (value) => {
      if (value === this.searchQuery) return;
      this.searchQuery = value;
      this.renderTagList();
      if (value.trim() && !value.includes('*')) {
        window.requestAnimationFrame(() => {
          if (this.contentEl && this.contentEl.isConnected) this.contentEl.scrollTop = 0;
        });
      }
    };
    const onCompositionStart = () => {
      this.isSearchComposing = this.plugin.settings.freezeSearchWhileComposing;
    };
    const onCompositionEnd = () => {
      this.isSearchComposing = false;
      applySearchValue(searchInputEl.value);
    };
    searchInputEl.addEventListener('compositionstart', onCompositionStart);
    searchInputEl.addEventListener('compositionend', onCompositionEnd);
    this.searchCompositionCleanup = () => {
      searchInputEl.removeEventListener('compositionstart', onCompositionStart);
      searchInputEl.removeEventListener('compositionend', onCompositionEnd);
      this.isSearchComposing = false;
      this.searchCompositionCleanup = null;
    };
    this.searchComponent.onChange((value) => {
      if (this.isSearchComposing) return;
      applySearchValue(value);
    });
    this.searchComponent.inputEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      if (!this.plugin.advanceNoteCardSearchState(this.noteCardSearchState, this.expandedTags)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.renderTagList();
    });

    sectionHeaderEl.appendChild(sectionTitleEl);
    sectionHeaderEl.appendChild(searchHostEl);
    pageEl.appendChild(sectionHeaderEl);

    this.listEl = document.createElement('div');
    this.listEl.className = 'puffs-tag-shelf-list';
    pageEl.appendChild(this.listEl);

    this.contentEl.appendChild(pageEl);
    this.renderTagList();
  }

  renderHierarchyPage() {
    this.listEl = null;
    this.summaryTagCountEl = null;
    this.summaryNoteCountEl = null;
    const pageEl = document.createElement('div');
    pageEl.className = 'puffs-tag-shelf-page puffs-note-hierarchy-shelf';
    this.syncSidebarTreeStyles(pageEl);
    const headerEl = pageEl.createDiv({ cls: 'puffs-tag-shelf-header' });
    headerEl.createEl('h3', { text: '标签系统', cls: 'puffs-tag-shelf-title' });
    const backButton = headerEl.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': '打开标签列表' } });
    setIcon(backButton, 'tags');
    backButton.addEventListener('click', () => {
      this.hierarchyMode = false;
      this.render();
    });

    const sectionHeaderEl = pageEl.createDiv({ cls: 'puffs-tag-shelf-section-header' });
    sectionHeaderEl.createEl('h3', { text: '父子笔记', cls: 'puffs-tag-shelf-section-title' });
    const searchHostEl = sectionHeaderEl.createDiv({ cls: 'puffs-tag-shelf-search-host' });
    this.searchComponent = new SearchComponent(searchHostEl);
    this.searchComponent.containerEl.classList.add('puffs-tag-shelf-search-container');
    this.searchComponent.setPlaceholder('搜索父笔记；父*子；*子');
    this.searchComponent.setValue(this.hierarchyState.query || '');

    const listEl = pageEl.createDiv({ cls: 'puffs-note-hierarchy-shelf-list' });
    this.contentEl.appendChild(pageEl);
    this.plugin.renderNoteHierarchyPage(listEl, this.hierarchyState, {
      surface: 'shelf', showHeader: false, showSearch: false,
    });
    this.hierarchyState.inputEl = this.searchComponent.inputEl;
    const applySearch = (value) => {
      if (this.isSearchComposing) return;
      this.hierarchyState.query = value;
      this.hierarchyState.activeMatchIndex = -1;
      if (this.hierarchyState.renderList) this.hierarchyState.renderList();
    };
    const inputEl = this.searchComponent.inputEl;
    const onCompositionStart = () => { this.isSearchComposing = this.plugin.settings.freezeSearchWhileComposing; };
    const onCompositionEnd = () => { this.isSearchComposing = false; applySearch(inputEl.value); };
    inputEl.addEventListener('compositionstart', onCompositionStart);
    inputEl.addEventListener('compositionend', onCompositionEnd);
    inputEl.addEventListener('keydown', (event) => this.hierarchyState.handleSearchEnter?.(event));
    this.searchCompositionCleanup = () => {
      inputEl.removeEventListener('compositionstart', onCompositionStart);
      inputEl.removeEventListener('compositionend', onCompositionEnd);
      this.isSearchComposing = false;
      this.searchCompositionCleanup = null;
    };
    this.searchComponent.onChange(applySearch);
  }

  clearSearchCompositionHandlers() {
    if (this.searchCompositionCleanup) {
      this.searchCompositionCleanup();
    } else {
      this.isSearchComposing = false;
    }
  }

  syncSidebarTreeStyles(pageEl) {
    const sidebarRowEl = document.querySelector(
      '.workspace-leaf-content[data-type="tag"] .tag-pane-tag'
    );
    if (!sidebarRowEl) return;

    const innerEl = sidebarRowEl.querySelector('.tree-item-inner');
    const flairEl = sidebarRowEl.querySelector('.tree-item-flair');
    const rowStyle = window.getComputedStyle(sidebarRowEl);
    pageEl.style.setProperty('--puffs-tag-shelf-row-align-items', rowStyle.alignItems);

    if (innerEl) {
      const innerStyle = window.getComputedStyle(innerEl);
      pageEl.style.setProperty('--puffs-tag-shelf-tree-font-size', innerStyle.fontSize);
      pageEl.style.setProperty('--puffs-tag-shelf-tree-line-height', innerStyle.lineHeight);
      pageEl.style.setProperty('--puffs-tag-shelf-tree-font-weight', innerStyle.fontWeight);
      pageEl.style.setProperty('--puffs-tag-shelf-tree-letter-spacing', innerStyle.letterSpacing);
    }

    if (flairEl) {
      const flairStyle = window.getComputedStyle(flairEl);
      pageEl.style.setProperty('--puffs-tag-shelf-flair-display', flairStyle.display);
      pageEl.style.setProperty('--puffs-tag-shelf-flair-align-items', flairStyle.alignItems);
      pageEl.style.setProperty('--puffs-tag-shelf-flair-font-size', flairStyle.fontSize);
      pageEl.style.setProperty('--puffs-tag-shelf-flair-line-height', flairStyle.lineHeight);
    }
  }

  createSummaryCard(label, value) {
    const cardEl = document.createElement('div');
    cardEl.className = 'puffs-tag-shelf-summary-card';

    const labelEl = document.createElement('div');
    labelEl.className = 'puffs-tag-shelf-summary-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('div');
    valueEl.className = 'puffs-tag-shelf-summary-value';
    valueEl.textContent = value;

    cardEl.appendChild(labelEl);
    cardEl.appendChild(valueEl);
    return { cardEl, valueEl };
  }

  renderTagList() {
    if (!this.listEl || !this.summaryTagCountEl || !this.summaryNoteCountEl) return;

    const query = this.searchQuery.trim();
    const effectiveQuery = this.plugin.resolvePinnedSearchQuery(query);
    const matchingItems = this.plugin.getTagShelfItems(effectiveQuery, false);
    const items = this.plugin.prependPinnedTagItem(matchingItems, query);
    const noteCardSearch = parseNoteCardSearch(effectiveQuery);
    if (noteCardSearch && noteCardSearch.isValid) {
      this.clearAutoExpandedTag();
      this.plugin.syncNoteCardSearchState(
        this.noteCardSearchState,
        effectiveQuery,
        matchingItems,
        this.expandedTags
      );
    } else {
      this.plugin.clearNoteCardSearchState(this.noteCardSearchState, this.expandedTags);
      if (!noteCardSearch || noteCardSearch.isTagOnly) {
        this.syncAutoSingleSearchResult(
          noteCardSearch ? noteCardSearch.tagQuery : effectiveQuery,
          matchingItems
        );
      } else {
        this.clearAutoExpandedTag();
      }
    }
    this.updateSummary(items);
    this.listEl.empty();

    if (items.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'puffs-tag-shelf-empty';
      emptyEl.textContent = query ? '没有匹配的标签。' : '暂无可展示的标签。';
      this.listEl.appendChild(emptyEl);
      this.plugin.scheduleNoteCardSearchEffect(
        this.listEl,
        this.searchComponent && this.searchComponent.inputEl,
        this.noteCardSearchState
      );
      return;
    }

    for (const item of items) {
      this.renderTagCard(item);
    }
    this.plugin.scheduleNoteCardSearchEffect(
      this.listEl,
      this.searchComponent && this.searchComponent.inputEl,
      this.noteCardSearchState
    );
  }

  updateSummary(items) {
    const uniqueNotePaths = new Set();
    for (const item of items) {
      for (const file of item.files) uniqueNotePaths.add(file.path);
    }

    this.summaryTagCountEl.textContent = `${items.length} 个`;
    this.summaryNoteCountEl.textContent = `${uniqueNotePaths.size} 篇`;
  }

  syncAutoSingleSearchResult(query, items) {
    if (!query || items.length !== 1) {
      this.clearAutoExpandedTag();
      return;
    }

    const tag = items[0].tag;
    if (this.autoExpandedTag === tag) return;

    this.clearAutoExpandedTag();
    this.autoExpandedTag = tag;
    this.autoExpandedWasAlreadyExpanded = this.expandedTags.has(tag);
    this.expandedTags.add(tag);
  }

  clearAutoExpandedTag() {
    if (!this.autoExpandedTag) return;

    if (!this.autoExpandedWasAlreadyExpanded) {
      this.expandedTags.delete(this.autoExpandedTag);
    }

    this.autoExpandedTag = null;
    this.autoExpandedWasAlreadyExpanded = false;
  }

  renderTagCard(item) {
    const { tag, displayName, files, isVirtual } = item;
    const isExpanded = this.expandedTags.has(tag);
    const treeItemEl = document.createElement('div');
    treeItemEl.className = 'tree-item puffs-tag-list-item puffs-tag-shelf-card';
    treeItemEl.classList.toggle('puffs-tag-expanded', isExpanded);
    treeItemEl.classList.toggle('puffs-tag-shelf-virtual', !!isVirtual);

    const tagEl = document.createElement('div');
    tagEl.className =
      'tree-item-self tag-pane-tag is-clickable mod-collapsible puffs-tag-list-row puffs-tag-shelf-tag-row';
    tagEl.dataset.puffsTag = tag;
    if (isVirtual) tagEl.dataset.puffsVirtualTag = 'true';

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
    countEl.textContent = item.inheritanceEnabled && item.inheritedCount > 0
      ? `${item.exactCount}+${item.inheritedCount}`
      : String(files.length);

    let scrollBottomButtonEl = null;
    let pinButtonEl = null;
    let inheritanceButtonEl = null;
    if (!isVirtual && item.hasInheritance) {
      inheritanceButtonEl = document.createElement('button');
      inheritanceButtonEl.type = 'button';
      inheritanceButtonEl.className = 'clickable-icon puffs-tag-inheritance-button';
      inheritanceButtonEl.classList.toggle('is-active', !!item.inheritanceEnabled);
      inheritanceButtonEl.setAttribute('aria-label', item.inheritanceEnabled ? '隐藏后代标签笔记' : '显示后代标签笔记');
      setIcon(inheritanceButtonEl, 'git-merge');
      inheritanceButtonEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.plugin.toggleTagInheritance(tag).catch((error) => {
          console.error('[Puffs Tag Enhance] Failed to toggle inheritance:', error);
          new Notice('切换标签继承失败');
        });
      });
    }
    if (isExpanded && files.length > 0) {
      scrollBottomButtonEl = document.createElement('button');
      scrollBottomButtonEl.type = 'button';
      scrollBottomButtonEl.className = 'clickable-icon puffs-tag-scroll-bottom-button';
      scrollBottomButtonEl.dataset.puffsTag = tag;
      setIcon(scrollBottomButtonEl, 'arrow-down-to-line');
      scrollBottomButtonEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.plugin.scheduleLastNoteCardScroll(this.listEl, tag);
      });

      if (!isVirtual) {
        pinButtonEl = document.createElement('button');
        pinButtonEl.type = 'button';
        pinButtonEl.className = 'clickable-icon puffs-tag-pin-button';
        pinButtonEl.dataset.puffsTag = tag;
        pinButtonEl.classList.toggle('is-active', this.plugin.settings.pinnedTag === tag);
        setIcon(pinButtonEl, 'pin');
        pinButtonEl.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.plugin.togglePinnedTag(tag).catch((error) => {
            console.error('[Puffs Tag Enhance] Failed to toggle pinned tag:', error);
          });
        });
      }
    }

    innerEl.appendChild(textEl);
    flairOuterEl.appendChild(countEl);
    tagEl.appendChild(toggleEl);
    tagEl.appendChild(innerEl);
    if (inheritanceButtonEl) tagEl.appendChild(inheritanceButtonEl);
    if (scrollBottomButtonEl) tagEl.appendChild(scrollBottomButtonEl);
    if (pinButtonEl) tagEl.appendChild(pinButtonEl);
    tagEl.appendChild(flairOuterEl);
    treeItemEl.appendChild(tagEl);

    tagEl.addEventListener('click', () => {
      if (this.expandedTags.has(tag)) this.expandedTags.delete(tag);
      else this.expandedTags.add(tag);
      this.renderTagList();
    });

    tagEl.addEventListener('contextmenu', (event) => {
      if (isVirtual) return;
      event.preventDefault();
      this.plugin.showTagContextMenu(event, tag);
    });

    if (isExpanded) {
      const notesEl = document.createElement('div');
      notesEl.className = 'tree-item-children puffs-tag-note-list puffs-tag-shelf-notes';

      for (const [fileIndex, file] of files.entries()) {
        const inherited = !isVirtual && this.plugin.isInheritedFileForTag(tag, file.path);
        const noteItemEl = document.createElement('div');
        noteItemEl.className = 'tree-item puffs-tag-note-item puffs-tag-shelf-note-item';
        noteItemEl.dataset.path = file.path;
        noteItemEl.classList.toggle(
          'is-order-selected',
          this.plugin.isNoteOrderTargetSelected(tag, file.path)
        );

        const noteCardEl = document.createElement('div');
        noteCardEl.className = 'tree-item-self puffs-tag-note-card is-clickable puffs-tag-shelf-note-card';
        noteCardEl.dataset.path = file.path;

        if (!isVirtual) {
          noteCardEl.dataset.puffsTag = tag;
          noteCardEl.dataset.puffsSurface = 'shelf';
          if (inherited) {
            noteCardEl.dataset.puffsInherited = 'true';
            noteCardEl.title = `继承自：${this.plugin.getInheritedFileSources(tag, file.path).join('、')}`;
          }

          if (!inherited) {
            const orderButtonEl = document.createElement('button');
            orderButtonEl.type = 'button';
            orderButtonEl.className = 'clickable-icon puffs-tag-note-order-button';
            orderButtonEl.dataset.puffsTag = tag;
            orderButtonEl.dataset.path = file.path;
            orderButtonEl.dataset.puffsSurface = 'shelf';
            setIcon(orderButtonEl, 'grip-vertical');
            this.plugin.syncNoteOrderButtonSelection(orderButtonEl);
            orderButtonEl.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              this.plugin.toggleNoteOrderTarget(tag, file.path, 'shelf');
            });
            noteCardEl.appendChild(orderButtonEl);
          }
        }

        const noteInnerEl = document.createElement('div');
        noteInnerEl.className = 'tree-item-inner';

        const noteTextEl = document.createElement('div');
        noteTextEl.className = 'tree-item-inner-text';
        noteTextEl.textContent = this.plugin.getNoteDisplayName(tag, file, isVirtual);

        noteInnerEl.appendChild(noteTextEl);
        noteCardEl.appendChild(noteInnerEl);
        const scrollTopButtonThreshold = this.plugin.settings.scrollTopButtonThreshold;
        if (
          scrollTopButtonThreshold > 0 &&
          files.length >= scrollTopButtonThreshold &&
          fileIndex === files.length - 1
        ) {
          const scrollTopButtonEl = document.createElement('button');
          scrollTopButtonEl.type = 'button';
          scrollTopButtonEl.className = 'clickable-icon puffs-tag-scroll-top-button';
          scrollTopButtonEl.dataset.puffsTag = tag;
          setIcon(scrollTopButtonEl, 'arrow-up-to-line');
          scrollTopButtonEl.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.plugin.scheduleTagTopScroll(this.listEl, tag);
          });
          noteCardEl.appendChild(scrollTopButtonEl);
        }
        noteCardEl.addEventListener('click', () => {
          this.plugin.openNoteCard(noteCardEl).catch((error) => {
            console.error('[Puffs Tag Enhance] Failed to open note:', error);
            new Notice('打开笔记失败');
          });
        });
        noteCardEl.addEventListener('contextmenu', (event) => {
          const handled = this.plugin.showNoteCardContextMenu(event, noteCardEl);
          if (!handled) return;
          event.preventDefault();
          event.stopPropagation();
        });
        noteItemEl.appendChild(noteCardEl);
        notesEl.appendChild(noteItemEl);
      }

      treeItemEl.appendChild(notesEl);
    }

    this.listEl.appendChild(treeItemEl);
  }
}


export { PuffsTagShelfView };
