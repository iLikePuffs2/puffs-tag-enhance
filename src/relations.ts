// @ts-nocheck
import { Menu, Notice, TFile, setIcon } from "obsidian";
import { TAG_SHELF_VIEW_TYPE, getTagDisplayName, isNestedTag, normalizeTag } from "./models";
import { AddParentTagModal, NoteRelationModal, TagInheritanceModal } from "./relation-modals";
import {
  collectDirectedDescendants,
  compareHierarchyParentItems,
  mergeInheritedPaths,
  parseHierarchySearch,
  sanitizeAcyclicAdjacency,
  wouldCreateDirectedCycle,
} from "./relation-utils";

const createEmptyRelations = () => ({
  version: 1,
  tagInheritance: {
    childrenByParent: {},
    enabledParents: [],
    excludedPathsByParent: {},
  },
  noteHierarchy: {
    childrenByParentPath: {},
    displayNamesByParentPath: {},
  },
});

export class RelationsBehavior {
  [key: string]: any;

  normalizeRelationSettings(value = this.settings.relations) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const result = createEmptyRelations();
    const inheritance = source.tagInheritance && typeof source.tagInheritance === 'object'
      ? source.tagInheritance
      : {};
    const rawChildren = inheritance.childrenByParent;
    if (rawChildren && typeof rawChildren === 'object' && !Array.isArray(rawChildren)) {
      for (const [rawParent, rawValues] of Object.entries(rawChildren)) {
        const parent = normalizeTag(rawParent);
        if (!parent || isNestedTag(parent) || !Array.isArray(rawValues)) continue;
        const children = [];
        const seen = new Set();
        for (const rawChild of rawValues) {
          const child = normalizeTag(rawChild);
          if (!child || child === parent || isNestedTag(child) || seen.has(child)) continue;
          seen.add(child);
          children.push(child);
        }
        if (children.length > 0) result.tagInheritance.childrenByParent[parent] = children;
      }
    }

    const enabledParents = Array.isArray(inheritance.enabledParents) ? inheritance.enabledParents : [];
    result.tagInheritance.enabledParents = Array.from(new Set(
      enabledParents.map(normalizeTag).filter((tag) => tag && !isNestedTag(tag))
    ));

    const rawExclusions = inheritance.excludedPathsByParent;
    if (rawExclusions && typeof rawExclusions === 'object' && !Array.isArray(rawExclusions)) {
      for (const [rawParent, rawPaths] of Object.entries(rawExclusions)) {
        const parent = normalizeTag(rawParent);
        if (!parent || !Array.isArray(rawPaths)) continue;
        const paths = Array.from(new Set(rawPaths
          .map((path) => typeof path === 'string' ? path.trim() : '')
          .filter(Boolean)));
        if (paths.length > 0) result.tagInheritance.excludedPathsByParent[parent] = paths;
      }
    }

    const hierarchy = source.noteHierarchy && typeof source.noteHierarchy === 'object'
      ? source.noteHierarchy
      : {};
    for (const key of ['childrenByParentPath', 'displayNamesByParentPath']) {
      const rawObject = hierarchy[key];
      if (!rawObject || typeof rawObject !== 'object' || Array.isArray(rawObject)) continue;
      result.noteHierarchy[key] = {};
      for (const [rawParentPath, rawEntries] of Object.entries(rawObject)) {
        const parentPath = typeof rawParentPath === 'string' ? rawParentPath.trim() : '';
        if (!parentPath || !rawEntries || typeof rawEntries !== 'object') continue;
        if (key === 'childrenByParentPath') {
          if (!Array.isArray(rawEntries)) continue;
          const children = Array.from(new Set(rawEntries
            .map((path) => typeof path === 'string' ? path.trim() : '')
            .filter((path) => path && path !== parentPath)));
          if (children.length > 0) result.noteHierarchy[key][parentPath] = children;
        } else if (!Array.isArray(rawEntries)) {
          const entries = {};
          for (const [rawPath, rawDisplayName] of Object.entries(rawEntries)) {
            const path = typeof rawPath === 'string' ? rawPath.trim() : '';
            const displayName = typeof rawDisplayName === 'string' ? rawDisplayName.trim() : '';
            if (path && displayName) entries[path] = displayName;
          }
          if (Object.keys(entries).length > 0) result.noteHierarchy[key][parentPath] = entries;
        }
      }
    }

    this.settings.relations = result;
    this.reconcileRelationCycles();
    return result;
  }

  getTagInheritanceSettings() {
    if (!this.settings.relations) this.normalizeRelationSettings();
    return this.settings.relations.tagInheritance;
  }

  getNoteHierarchySettings() {
    if (!this.settings.relations) this.normalizeRelationSettings();
    return this.settings.relations.noteHierarchy;
  }

  getHierarchyChildren(parentPath) {
    return [...(this.getNoteHierarchySettings().childrenByParentPath[parentPath] || [])];
  }

  getHierarchyParents(childPath) {
    return Object.entries(this.getNoteHierarchySettings().childrenByParentPath)
      .filter(([, children]) => Array.isArray(children) && children.includes(childPath))
      .map(([parentPath]) => parentPath);
  }

  getHierarchyDescendants(parentPath) {
    return collectDirectedDescendants(this.getNoteHierarchySettings().childrenByParentPath, parentPath);
  }

  wouldCreateNoteHierarchyCycle(parentPath, childPath) {
    return wouldCreateDirectedCycle(
      this.getNoteHierarchySettings().childrenByParentPath,
      parentPath,
      childPath
    );
  }

  async addNoteHierarchyEdge(parentPath, childPath) {
    const parent = this.app.vault.getAbstractFileByPath(parentPath);
    const child = this.app.vault.getAbstractFileByPath(childPath);
    if (!(parent instanceof TFile) || parent.extension !== 'md') throw new Error('父笔记无效');
    if (!(child instanceof TFile) || child.extension !== 'md') throw new Error('子笔记无效');
    if (this.wouldCreateNoteHierarchyCycle(parentPath, childPath)) throw new Error('不能建立循环父子关系');
    const hierarchy = this.getNoteHierarchySettings();
    const children = this.getHierarchyChildren(parentPath);
    if (!children.includes(childPath)) children.push(childPath);
    hierarchy.childrenByParentPath[parentPath] = children;
    await this.saveSettings();
    this.refreshHierarchyViews();
  }

  async removeNoteHierarchyEdge(parentPath, childPath) {
    const hierarchy = this.getNoteHierarchySettings();
    const children = this.getHierarchyChildren(parentPath).filter((path) => path !== childPath);
    if (children.length) hierarchy.childrenByParentPath[parentPath] = children;
    else delete hierarchy.childrenByParentPath[parentPath];
    if (hierarchy.displayNamesByParentPath[parentPath]) {
      delete hierarchy.displayNamesByParentPath[parentPath][childPath];
      if (!Object.keys(hierarchy.displayNamesByParentPath[parentPath]).length) {
        delete hierarchy.displayNamesByParentPath[parentPath];
      }
    }
    await this.saveSettings();
    this.refreshHierarchyViews();
  }

  async moveHierarchyChild(parentPath, childPath, direction) {
    const hierarchy = this.getNoteHierarchySettings();
    const children = this.getHierarchyChildren(parentPath);
    const index = children.indexOf(childPath);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= children.length) return;
    [children[index], children[nextIndex]] = [children[nextIndex], children[index]];
    hierarchy.childrenByParentPath[parentPath] = children;
    await this.saveSettings();
    this.refreshHierarchyViews();
  }

  getHierarchyDisplayName(parentPath, file) {
    if (!(file instanceof TFile)) return '';
    const selected = this.getNoteHierarchySettings().displayNamesByParentPath[parentPath] &&
      this.getNoteHierarchySettings().displayNamesByParentPath[parentPath][file.path];
    return selected && this.getNoteAliases(file).includes(selected) ? selected : file.basename;
  }

  async setHierarchyDisplayName(parentPath, file, displayName) {
    if (!(file instanceof TFile) || !this.getHierarchyChildren(parentPath).includes(file.path)) return;
    const hierarchy = this.getNoteHierarchySettings();
    const selected = typeof displayName === 'string' ? displayName.trim() : '';
    if (selected && !this.getNoteAliases(file).includes(selected)) return;
    if (selected) {
      if (!hierarchy.displayNamesByParentPath[parentPath]) hierarchy.displayNamesByParentPath[parentPath] = {};
      hierarchy.displayNamesByParentPath[parentPath][file.path] = selected;
    } else if (hierarchy.displayNamesByParentPath[parentPath]) {
      delete hierarchy.displayNamesByParentPath[parentPath][file.path];
      if (!Object.keys(hierarchy.displayNamesByParentPath[parentPath]).length) {
        delete hierarchy.displayNamesByParentPath[parentPath];
      }
    }
    await this.saveSettings();
    this.refreshHierarchyViews();
  }

  getHierarchyParentItems(query = '') {
    const parsed = parseHierarchySearch(query);
    if (!parsed.valid) return [];
    const { parentQuery, childQuery } = parsed;
    const hierarchy = this.getNoteHierarchySettings();
    const items = [];
    for (const [parentPath, childPaths] of Object.entries(hierarchy.childrenByParentPath)) {
      const parentFile = this.app.vault.getAbstractFileByPath(parentPath);
      if (!(parentFile instanceof TFile) || parentFile.extension !== 'md' || !Array.isArray(childPaths) || !childPaths.length) continue;
      const parentNames = [parentFile.basename, ...this.getNoteAliases(parentFile)].map((name) => name.toLowerCase());
      if (parentQuery && !parentNames.some((name) => name.includes(parentQuery))) continue;
      const descendants = this.getHierarchyDescendants(parentPath);
      const matchingPaths = childQuery ? descendants.filter((path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return false;
        const directParents = this.getHierarchyParents(path);
        const names = [file.basename, ...this.getNoteAliases(file)];
        for (const directParent of directParents) {
          names.push(this.getHierarchyDisplayName(directParent, file));
        }
        return names.some((name) => String(name).toLowerCase().includes(childQuery));
      }) : [];
      if (childQuery && !matchingPaths.length) continue;
      const directCount = this.getHierarchyChildren(parentPath).filter((path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile && file.extension === 'md';
      }).length;
      const descendantCount = new Set(descendants.filter((path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile && file.extension === 'md';
      })).size;
      items.push({
        parentPath,
        parentFile,
        directCount,
        additionalCount: Math.max(0, descendantCount - directCount),
        matchingPaths: new Set(matchingPaths),
        forceExpand: !!childQuery,
      });
    }
    items.sort((a, b) => compareHierarchyParentItems(
      { directCount: a.directCount, name: a.parentFile.basename },
      { directCount: b.directCount, name: b.parentFile.basename }
    ));
    return items;
  }

  createHierarchySurfaceState() {
    return {
      query: '',
      expandedParents: new Set(),
      expandedBranches: new Set(),
      activeMatchIndex: -1,
    };
  }

  renderNoteHierarchyPage(hostEl, state, options = {}) {
    hostEl.empty();
    hostEl.classList.add('puffs-note-hierarchy-page');
    const headerEl = hostEl.createDiv({ cls: 'puffs-note-hierarchy-header' });
    headerEl.createEl('h3', { text: '父子笔记', cls: 'puffs-note-hierarchy-title' });
    if (options.onBack) {
      const backButton = headerEl.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': '返回标签系统' } });
      setIcon(backButton, 'tags');
      backButton.addEventListener('click', options.onBack);
    }
    const searchEl = hostEl.createEl('input', {
      type: 'search',
      cls: 'puffs-note-hierarchy-search',
      attr: { placeholder: '搜索父笔记；父*子；*子' },
    });
    searchEl.value = state.query || '';
    const listEl = hostEl.createDiv({ cls: 'puffs-note-hierarchy-list' });
    const renderList = () => {
      listEl.empty();
      const items = this.getHierarchyParentItems(state.query);
      if (!items.length) {
        listEl.createDiv({ text: state.query ? '没有匹配的父子关系。' : '暂无父子笔记关系。', cls: 'puffs-relation-empty' });
        return;
      }
      for (const item of items) this.renderHierarchyParentItem(listEl, item, state, renderList, options.surface || 'sidebar');
    };
    searchEl.addEventListener('input', () => {
      state.query = searchEl.value;
      state.activeMatchIndex = -1;
      renderList();
    });
    searchEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      const matches = Array.from(listEl.querySelectorAll('.is-hierarchy-search-match'));
      if (!matches.length) return;
      state.activeMatchIndex = (state.activeMatchIndex + 1) % matches.length;
      matches.forEach((el, index) => el.classList.toggle('is-active-match', index === state.activeMatchIndex));
      matches[state.activeMatchIndex].scrollIntoView({ block: 'nearest' });
      event.preventDefault();
    });
    renderList();
    state.inputEl = searchEl;
  }

  renderHierarchyParentItem(listEl, item, state, rerender, surface) {
    const expanded = item.forceExpand || state.expandedParents.has(item.parentPath);
    const treeEl = listEl.createDiv({ cls: 'tree-item puffs-note-hierarchy-parent' });
    const rowEl = treeEl.createDiv({ cls: 'tree-item-self is-clickable mod-collapsible puffs-note-hierarchy-parent-row' });
    const toggleEl = rowEl.createDiv({ cls: 'tree-item-icon collapse-icon' });
    toggleEl.classList.toggle('is-collapsed', !expanded);
    setIcon(toggleEl, 'right-triangle');
    rowEl.createDiv({ text: item.parentFile.basename, cls: 'tree-item-inner' });
    rowEl.createSpan({
      text: item.additionalCount > 0 ? `${item.directCount}+${item.additionalCount}` : String(item.directCount),
      cls: 'tree-item-flair tag-pane-tag-count',
    });
    rowEl.addEventListener('click', () => {
      if (state.expandedParents.has(item.parentPath)) state.expandedParents.delete(item.parentPath);
      else state.expandedParents.add(item.parentPath);
      rerender();
    });
    rowEl.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.showHierarchyParentMenu(event, item.parentFile);
    });
    if (expanded) {
      const childrenEl = treeEl.createDiv({ cls: 'tree-item-children puffs-note-hierarchy-children' });
      this.renderHierarchyChildren(childrenEl, item.parentPath, item.parentPath, state, item.matchingPaths, new Set([item.parentPath]), rerender, surface, 0);
    }
  }

  renderHierarchyChildren(containerEl, rootPath, parentPath, state, matchingPaths, branch, rerender, surface, depth) {
    for (const childPath of this.getHierarchyChildren(parentPath)) {
      if (branch.has(childPath)) continue;
      const file = this.app.vault.getAbstractFileByPath(childPath);
      if (!(file instanceof TFile) || file.extension !== 'md') continue;
      const nextBranch = new Set(branch);
      nextBranch.add(childPath);
      const branchKey = `${rootPath}\u0000${parentPath}\u0000${childPath}`;
      const hasChildren = this.getHierarchyChildren(childPath).length > 0;
      const forceOpen = Array.from(matchingPaths).some((path) => path === childPath || this.getHierarchyDescendants(childPath).includes(path));
      const expanded = forceOpen || state.expandedBranches.has(branchKey);
      const itemEl = containerEl.createDiv({ cls: 'tree-item puffs-tag-note-item puffs-note-hierarchy-child-item' });
      const cardEl = itemEl.createDiv({ cls: 'tree-item-self puffs-tag-note-card is-clickable puffs-note-hierarchy-child-card' });
      cardEl.dataset.path = file.path;
      cardEl.dataset.puffsHierarchyParent = parentPath;
      cardEl.dataset.puffsSurface = surface;
      if (matchingPaths.has(childPath)) cardEl.classList.add('is-hierarchy-search-match');
      if (hasChildren) {
        const toggleEl = cardEl.createDiv({ cls: 'tree-item-icon collapse-icon' });
        toggleEl.classList.toggle('is-collapsed', !expanded);
        setIcon(toggleEl, 'right-triangle');
        toggleEl.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (state.expandedBranches.has(branchKey)) state.expandedBranches.delete(branchKey);
          else state.expandedBranches.add(branchKey);
          rerender();
        });
      }
      cardEl.createDiv({ text: this.getHierarchyDisplayName(parentPath, file), cls: 'tree-item-inner' });
      cardEl.addEventListener('click', () => this.openFileInMainWorkspace(file));
      cardEl.addEventListener('contextmenu', (event) => {
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

  showHierarchyParentMenu(event, file) {
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('打开笔记').setIcon('file-text').onClick(() => this.openFileInMainWorkspace(file)));
    menu.addItem((item) => item.setTitle('添加子笔记').setIcon('user-round-plus').onClick(() => {
      new NoteRelationModal(this.app, this, file.path, 'child').open();
    }));
    menu.addItem((item) => item.setTitle('添加父笔记').setIcon('corner-left-up').onClick(() => {
      new NoteRelationModal(this.app, this, file.path, 'parent').open();
    }));
    menu.showAtMouseEvent(event);
  }

  showHierarchyChildMenu(event, parentPath, file) {
    const menu = new Menu();
    const children = this.getHierarchyChildren(parentPath);
    const index = children.indexOf(file.path);
    menu.addItem((item) => item.setTitle('上移').setIcon('arrow-up').setDisabled(index <= 0).onClick(() => this.moveHierarchyChild(parentPath, file.path, -1)));
    menu.addItem((item) => item.setTitle('下移').setIcon('arrow-down').setDisabled(index < 0 || index >= children.length - 1).onClick(() => this.moveHierarchyChild(parentPath, file.path, 1)));
    const aliases = this.getNoteAliases(file);
    if (aliases.length) {
      menu.addItem((item) => item.setTitle('更换显示名称').setIcon('text-cursor-input').onClick(() => {
        const position = { x: event.clientX, y: event.clientY };
        window.setTimeout(() => this.showHierarchyDisplayNameOptions(position, parentPath, file, aliases), 0);
      }));
    }
    menu.addItem((item) => item.setTitle('添加子笔记').setIcon('user-round-plus').onClick(() => new NoteRelationModal(this.app, this, file.path, 'child').open()));
    menu.addItem((item) => item.setTitle('添加父笔记').setIcon('corner-left-up').onClick(() => new NoteRelationModal(this.app, this, file.path, 'parent').open()));
    menu.addItem((item) => item.setTitle('从当前父笔记移除').setIcon('unlink').onClick(() => this.removeNoteHierarchyEdge(parentPath, file.path)));
    menu.showAtMouseEvent(event);
  }

  showHierarchyDisplayNameOptions(position, parentPath, file, aliases) {
    const current = this.getHierarchyDisplayName(parentPath, file);
    const menu = new Menu();
    menu.addItem((item) => item.setTitle(file.basename).setChecked(current === file.basename).onClick(() => this.setHierarchyDisplayName(parentPath, file, '')));
    for (const alias of aliases) {
      menu.addItem((item) => item.setTitle(alias).setChecked(current === alias).onClick(() => this.setHierarchyDisplayName(parentPath, file, alias)));
    }
    menu.showAtPosition(position);
  }

  refreshHierarchyViews() {
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }

  openHierarchyForNote(path, sourceEl) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== 'md') return;
    const query = this.getHierarchyParents(path).length > 0 ? `*${file.basename}` : file.basename;
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_SHELF_VIEW_TYPE)) {
      const view = leaf.view;
      if (!view || !view.contentEl || !view.contentEl.contains(sourceEl)) continue;
      view.hierarchyMode = true;
      view.hierarchyState.query = query;
      view.hierarchyState.activeMatchIndex = -1;
      view.render();
      window.setTimeout(() => view.hierarchyState.inputEl && view.hierarchyState.inputEl.focus(), 0);
      return;
    }
    for (const leaf of this.app.workspace.getLeavesOfType('tag')) {
      const view = leaf.view;
      if (!view || !view.containerEl || !view.containerEl.contains(sourceEl)) continue;
      const patch = this.viewPatches.get(view) || this.patchTagView(view);
      patch.hierarchyMode = true;
      patch.hierarchyState.query = query;
      patch.hierarchyState.activeMatchIndex = -1;
      this.scheduleSyncView(view, 0);
      window.setTimeout(() => patch.hierarchyState.inputEl && patch.hierarchyState.inputEl.focus(), 50);
      return;
    }
  }

  showNoteCardContextMenu(event, cardEl) {
    const path = cardEl && cardEl.dataset.path;
    const file = path && this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== 'md') return false;
    const hierarchyParent = cardEl.dataset.puffsHierarchyParent;
    if (hierarchyParent) {
      this.showHierarchyChildMenu(event, hierarchyParent, file);
      return true;
    }

    const tag = normalizeTag(cardEl.dataset.puffsTag);
    const menu = new Menu();
    const inherited = tag && this.isInheritedFileForTag(tag, path);
    if (inherited) {
      menu.addItem((item) => item
        .setTitle(`不在 ${tag} 中继承显示`)
        .setIcon('eye-off')
        .onClick(() => this.excludeInheritedFile(tag, path).catch((error) => {
          console.error('[Puffs Tag Enhance] Failed to exclude inherited note:', error);
          new Notice('排除继承笔记失败');
        })));
    }
    const aliases = tag && !isNestedTag(tag) ? this.getNoteAliases(file) : [];
    if (aliases.length > 0) {
      menu.addItem((item) => item.setTitle('更换显示名称').setIcon('text-cursor-input').onClick(() => {
        const position = { x: event.clientX, y: event.clientY };
        window.setTimeout(() => this.showNoteDisplayNameOptions(position, tag, file, aliases), 0);
      }));
    }
    if (inherited || aliases.length > 0) menu.addSeparator();
    menu.addItem((item) => item.setTitle('添加父笔记').setIcon('corner-left-up').onClick(() => {
      new NoteRelationModal(this.app, this, path, 'parent').open();
    }));
    menu.addItem((item) => item.setTitle('添加子笔记').setIcon('user-round-plus').onClick(() => {
      new NoteRelationModal(this.app, this, path, 'child').open();
    }));
    if (this.getHierarchyParents(path).length > 0 || this.getHierarchyChildren(path).length > 0) {
      menu.addItem((item) => item.setTitle('定位父子关系').setIcon('locate-fixed').onClick(() => {
        this.openHierarchyForNote(path, cardEl);
      }));
    }
    menu.showAtMouseEvent(event);
    return true;
  }

  getInheritanceChildren(tagValue) {
    const tag = normalizeTag(tagValue);
    return tag ? [...(this.getTagInheritanceSettings().childrenByParent[tag] || [])] : [];
  }

  getInheritanceParents(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return [];
    return Object.entries(this.getTagInheritanceSettings().childrenByParent)
      .filter(([, children]) => Array.isArray(children) && children.includes(tag))
      .map(([parent]) => parent);
  }

  getLogicalTagSet() {
    const result = new Set(this.tagFileIndex.keys());
    for (const [parent, children] of Object.entries(this.getTagInheritanceSettings().childrenByParent)) {
      result.add(parent);
      for (const child of children) result.add(child);
    }
    return result;
  }

  hasInheritanceChildren(tagValue) {
    return this.getInheritanceChildren(tagValue).length > 0;
  }

  isTagInheritanceEnabled(tagValue) {
    const tag = normalizeTag(tagValue);
    return !!tag && this.getTagInheritanceSettings().enabledParents.includes(tag);
  }

  getTagDescendants(tagValue) {
    const root = normalizeTag(tagValue);
    if (!root) return [];
    return collectDirectedDescendants(this.getTagInheritanceSettings().childrenByParent, root);
  }

  wouldCreateTagInheritanceCycle(parentValue, childValue) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child) return true;
    return wouldCreateDirectedCycle(this.getTagInheritanceSettings().childrenByParent, parent, child);
  }

  reconcileRelationCycles() {
    const inheritance = this.settings.relations && this.settings.relations.tagInheritance;
    if (!inheritance) return;
    inheritance.childrenByParent = sanitizeAcyclicAdjacency(inheritance.childrenByParent);
    const hierarchy = this.settings.relations.noteHierarchy;
    hierarchy.childrenByParentPath = sanitizeAcyclicAdjacency(hierarchy.childrenByParentPath);
    for (const parentPath of Object.keys(hierarchy.displayNamesByParentPath)) {
      const validChildren = new Set(hierarchy.childrenByParentPath[parentPath] || []);
      for (const childPath of Object.keys(hierarchy.displayNamesByParentPath[parentPath])) {
        if (!validChildren.has(childPath)) delete hierarchy.displayNamesByParentPath[parentPath][childPath];
      }
      if (!Object.keys(hierarchy.displayNamesByParentPath[parentPath]).length) {
        delete hierarchy.displayNamesByParentPath[parentPath];
      }
    }
  }

  async setInheritanceChildren(parentValue, childValues) {
    const parent = normalizeTag(parentValue);
    if (!parent || isNestedTag(parent)) throw new Error('父标签无效');
    const children = [];
    const seen = new Set();
    for (const rawChild of childValues || []) {
      const child = normalizeTag(rawChild);
      if (!child || isNestedTag(child) || seen.has(child)) continue;
      if (this.wouldCreateTagInheritanceCycle(parent, child)) {
        throw new Error(`不能建立循环继承：${getTagDisplayName(parent)} → ${getTagDisplayName(child)}`);
      }
      seen.add(child);
      children.push(child);
    }
    const inheritance = this.getTagInheritanceSettings();
    if (children.length > 0) inheritance.childrenByParent[parent] = children;
    else {
      delete inheritance.childrenByParent[parent];
      inheritance.enabledParents = inheritance.enabledParents.filter((tag) => tag !== parent);
      delete inheritance.excludedPathsByParent[parent];
    }
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }

  async addInheritanceParent(childValue, parentValue) {
    const child = normalizeTag(childValue);
    const parent = normalizeTag(parentValue);
    if (!child || !parent || isNestedTag(child) || isNestedTag(parent)) throw new Error('标签无效');
    const children = this.getInheritanceChildren(parent);
    if (!children.includes(child)) children.push(child);
    await this.setInheritanceChildren(parent, children);
  }

  async toggleTagInheritance(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag || !this.hasInheritanceChildren(tag)) return;
    const inheritance = this.getTagInheritanceSettings();
    inheritance.enabledParents = inheritance.enabledParents.includes(tag)
      ? inheritance.enabledParents.filter((item) => item !== tag)
      : [...inheritance.enabledParents, tag];
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }

  getTagBrowseData(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return { tag: null, files: [], exactFiles: [], inheritedFiles: [], sourcesByPath: new Map() };
    const exactFiles = this.getOrderedFilesForTag(tag, this.tagFileIndex.get(tag) || []);
    const exactPaths = exactFiles.map((file) => file.path);
    const orderedBranches = [];
    const visit = (sourceTag, branch = new Set([tag])) => {
      if (branch.has(sourceTag)) return;
      const nextBranch = new Set(branch);
      nextBranch.add(sourceTag);
      orderedBranches.push({
        source: sourceTag,
        paths: this.getOrderedFilesForTag(sourceTag, this.tagFileIndex.get(sourceTag) || []).map((file) => file.path),
      });
      for (const child of this.getInheritanceChildren(sourceTag)) visit(child, nextBranch);
    };
    if (this.isTagInheritanceEnabled(tag)) {
      for (const child of this.getInheritanceChildren(tag)) visit(child);
    }
    const { inheritedPaths, sourcesByPath } = mergeInheritedPaths(
      exactPaths,
      orderedBranches,
      this.getTagInheritanceSettings().excludedPathsByParent[tag] || []
    );
    const inheritedFiles = inheritedPaths
      .map((path) => this.app.vault.getAbstractFileByPath(path))
      .filter((file) => file instanceof TFile && file.extension === 'md');
    return {
      tag,
      exactFiles,
      inheritedFiles,
      files: exactFiles.concat(inheritedFiles),
      sourcesByPath,
      exactCount: exactFiles.length,
      inheritedCount: inheritedFiles.length,
      inheritanceEnabled: this.isTagInheritanceEnabled(tag),
      hasInheritance: this.hasInheritanceChildren(tag),
    };
  }

  isInheritedFileForTag(tagValue, path) {
    return this.getTagBrowseData(tagValue).inheritedFiles.some((file) => file.path === path);
  }

  getInheritedFileSources(tagValue, path) {
    return this.getTagBrowseData(tagValue).sourcesByPath.get(path) || [];
  }

  async excludeInheritedFile(parentValue, path) {
    const parent = normalizeTag(parentValue);
    if (!parent || !path || !this.isInheritedFileForTag(parent, path)) return;
    const inheritance = this.getTagInheritanceSettings();
    const paths = new Set(inheritance.excludedPathsByParent[parent] || []);
    paths.add(path);
    inheritance.excludedPathsByParent[parent] = Array.from(paths);
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }

  async restoreInheritedFile(parentValue, path) {
    const parent = normalizeTag(parentValue);
    if (!parent || !path) return;
    const inheritance = this.getTagInheritanceSettings();
    const nextPaths = (inheritance.excludedPathsByParent[parent] || []).filter((item) => item !== path);
    if (nextPaths.length > 0) inheritance.excludedPathsByParent[parent] = nextPaths;
    else delete inheritance.excludedPathsByParent[parent];
    await this.saveSettings();
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }

  migrateTagRelations(oldTagValue, newTagValue) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);
    if (!oldTag || !newTag || oldTag === newTag) return;
    const inheritance = this.getTagInheritanceSettings();
    const oldChildren = inheritance.childrenByParent[oldTag] || [];
    const newChildren = inheritance.childrenByParent[newTag] || [];
    if (oldChildren.length || newChildren.length) {
      inheritance.childrenByParent[newTag] = Array.from(new Set([...oldChildren, ...newChildren]))
        .filter((child) => child !== newTag);
    }
    delete inheritance.childrenByParent[oldTag];
    for (const [parent, children] of Object.entries(inheritance.childrenByParent)) {
      inheritance.childrenByParent[parent] = Array.from(new Set(children.map((child) => child === oldTag ? newTag : child)))
        .filter((child) => child !== parent);
    }
    if (inheritance.enabledParents.includes(oldTag)) inheritance.enabledParents.push(newTag);
    inheritance.enabledParents = Array.from(new Set(inheritance.enabledParents.filter((tag) => tag !== oldTag)));
    const exclusions = Array.from(new Set([
      ...(inheritance.excludedPathsByParent[oldTag] || []),
      ...(inheritance.excludedPathsByParent[newTag] || []),
    ]));
    if (exclusions.length > 0) inheritance.excludedPathsByParent[newTag] = exclusions;
    delete inheritance.excludedPathsByParent[oldTag];
    this.reconcileRelationCycles();
  }

  handleRelationFileRename(file, oldPath) {
    if (!(file instanceof TFile) || file.extension !== 'md' || !oldPath || !file.path) return;
    const inheritance = this.getTagInheritanceSettings();
    let changed = false;
    for (const [parent, paths] of Object.entries(inheritance.excludedPathsByParent)) {
      if (!paths.includes(oldPath)) continue;
      inheritance.excludedPathsByParent[parent] = Array.from(new Set(paths.map((path) => path === oldPath ? file.path : path)));
      changed = true;
    }
    const hierarchy = this.getNoteHierarchySettings();
    if (hierarchy.childrenByParentPath[oldPath]) {
      hierarchy.childrenByParentPath[file.path] = Array.from(new Set([
        ...(hierarchy.childrenByParentPath[file.path] || []),
        ...hierarchy.childrenByParentPath[oldPath],
      ])).filter((path) => path !== file.path);
      delete hierarchy.childrenByParentPath[oldPath];
      changed = true;
    }
    for (const [parentPath, paths] of Object.entries(hierarchy.childrenByParentPath)) {
      if (!paths.includes(oldPath)) continue;
      hierarchy.childrenByParentPath[parentPath] = Array.from(new Set(paths.map((path) => path === oldPath ? file.path : path)))
        .filter((path) => path !== parentPath);
      changed = true;
    }
    if (hierarchy.displayNamesByParentPath[oldPath]) {
      hierarchy.displayNamesByParentPath[file.path] = {
        ...(hierarchy.displayNamesByParentPath[oldPath] || {}),
        ...(hierarchy.displayNamesByParentPath[file.path] || {}),
      };
      delete hierarchy.displayNamesByParentPath[oldPath];
      changed = true;
    }
    for (const [parentPath, entries] of Object.entries(hierarchy.displayNamesByParentPath)) {
      if (!entries[oldPath]) continue;
      if (!entries[file.path]) entries[file.path] = entries[oldPath];
      delete entries[oldPath];
      changed = true;
    }
    if (changed) this.saveSettings();
  }

  handleRelationFileDelete(file) {
    if (!(file instanceof TFile) || file.extension !== 'md' || !file.path) return;
    const inheritance = this.getTagInheritanceSettings();
    let changed = false;
    for (const [parent, paths] of Object.entries(inheritance.excludedPathsByParent)) {
      const nextPaths = paths.filter((path) => path !== file.path);
      if (nextPaths.length === paths.length) continue;
      if (nextPaths.length) inheritance.excludedPathsByParent[parent] = nextPaths;
      else delete inheritance.excludedPathsByParent[parent];
      changed = true;
    }
    const hierarchy = this.getNoteHierarchySettings();
    if (hierarchy.childrenByParentPath[file.path]) {
      delete hierarchy.childrenByParentPath[file.path];
      delete hierarchy.displayNamesByParentPath[file.path];
      changed = true;
    }
    for (const [parentPath, paths] of Object.entries(hierarchy.childrenByParentPath)) {
      const nextPaths = paths.filter((path) => path !== file.path);
      if (nextPaths.length === paths.length) continue;
      if (nextPaths.length) hierarchy.childrenByParentPath[parentPath] = nextPaths;
      else {
        delete hierarchy.childrenByParentPath[parentPath];
        delete hierarchy.displayNamesByParentPath[parentPath];
      }
      if (hierarchy.displayNamesByParentPath[parentPath]) {
        delete hierarchy.displayNamesByParentPath[parentPath][file.path];
      }
      changed = true;
    }
    if (changed) this.saveSettings();
  }

  showTagContextMenu(event, tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return false;
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('修改标签').setIcon('pencil').onClick(() => this.openRenameTagModal(tag)));
    menu.addItem((item) => item.setTitle('添加父标签').setIcon('corner-left-up').onClick(() => {
      new AddParentTagModal(this.app, this, tag).open();
    }));
    menu.addItem((item) => item.setTitle('管理子标签').setIcon('git-fork').onClick(() => {
      new TagInheritanceModal(this.app, this, tag).open();
    }));
    menu.showAtMouseEvent(event);
    return true;
  }

  showInheritedNoteMenu(event, tagValue, path) {
    const tag = normalizeTag(tagValue);
    if (!tag || !path || !this.isInheritedFileForTag(tag, path)) return false;
    const menu = new Menu();
    menu.addItem((item) => item
      .setTitle(`不在 ${tag} 中继承显示`)
      .setIcon('eye-off')
      .onClick(() => this.excludeInheritedFile(tag, path).catch((error) => {
        console.error('[Puffs Tag Enhance] Failed to exclude inherited note:', error);
        new Notice('排除继承笔记失败');
      })));
    menu.showAtMouseEvent(event);
    return true;
  }
}
