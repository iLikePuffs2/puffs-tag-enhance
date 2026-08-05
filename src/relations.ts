// @ts-nocheck
import { Menu, Notice, TFile, setIcon } from "obsidian";
import {
  DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD,
  TAG_SHELF_VIEW_TYPE,
  getTagDisplayName,
  isNestedTag,
  normalizeTag,
} from "./models";
import {
  ManageParentTagModal,
  NoteRelationModal,
  TagInheritanceModal,
  TagNoteBindingModal,
} from "./relation-modals";
import {
  collectDirectedDescendants,
  compareHierarchyParentItems,
  compareTagItemsByCount,
  createHierarchyNavigationHistory,
  buildVisibleHierarchyForest,
  buildTagInheritanceGroupTree,
  moveHierarchyNavigation,
  parseHierarchySearch,
  parseUnifiedHierarchySearch,
  pushHierarchyNavigation,
  sanitizeAcyclicAdjacency,
  wouldCreateDirectedCycle,
} from "./relation-utils";

const createEmptyRelations = () => ({
  version: 6,
  tagInheritance: {
    childrenByParent: {},
    enabledParents: [],
    excludedPathsByParentChild: {},
    modeByParentChild: {},
    includedPathsByParentChild: {},
    fixedParentByChild: {},
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
    const sourceVersion = Number(source.version);
    result.version = sourceVersion >= 6 ? 6 : sourceVersion >= 5 ? 5 : sourceVersion >= 4 ? 4 : sourceVersion >= 3 ? 3 : sourceVersion >= 2 ? 2 : 1;
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

    const normalizePaths = (rawPaths) => Array.from(new Set((Array.isArray(rawPaths) ? rawPaths : [])
      .map((path) => typeof path === 'string' ? path.trim() : '')
      .filter(Boolean)));
    const copyParentChildPaths = (targetKey, sourceKey) => {
      const rawParents = inheritance[sourceKey];
      if (!rawParents || typeof rawParents !== 'object' || Array.isArray(rawParents)) return;
      for (const [rawParent, rawChildren] of Object.entries(rawParents)) {
        const parent = normalizeTag(rawParent);
        if (!parent || isNestedTag(parent) || !rawChildren || typeof rawChildren !== 'object' || Array.isArray(rawChildren)) continue;
        for (const [rawChild, rawPaths] of Object.entries(rawChildren)) {
          const child = normalizeTag(rawChild);
          if (!child || isNestedTag(child) || !(result.tagInheritance.childrenByParent[parent] || []).includes(child)) continue;
          const paths = normalizePaths(rawPaths);
          if (!paths.length) continue;
          if (!result.tagInheritance[targetKey][parent]) result.tagInheritance[targetKey][parent] = {};
          result.tagInheritance[targetKey][parent][child] = paths;
        }
      }
    };
    if (sourceVersion >= 5) {
      copyParentChildPaths('excludedPathsByParentChild', 'excludedPathsByParentChild');
      copyParentChildPaths('includedPathsByParentChild', 'includedPathsByParentChild');
      const rawModes = inheritance.modeByParentChild;
      if (rawModes && typeof rawModes === 'object' && !Array.isArray(rawModes)) {
        for (const [rawParent, rawChildren] of Object.entries(rawModes)) {
          const parent = normalizeTag(rawParent);
          if (!parent || !rawChildren || typeof rawChildren !== 'object' || Array.isArray(rawChildren)) continue;
          for (const [rawChild, rawMode] of Object.entries(rawChildren)) {
            const child = normalizeTag(rawChild);
            if (rawMode !== 'selected' || !(result.tagInheritance.childrenByParent[parent] || []).includes(child)) continue;
            if (!result.tagInheritance.modeByParentChild[parent]) result.tagInheritance.modeByParentChild[parent] = {};
            result.tagInheritance.modeByParentChild[parent][child] = 'selected';
          }
        }
      }
    } else {
      const rawExclusions = inheritance.excludedPathsByParent || {};
      const rawIncluded = inheritance.includedPathsByParent || {};
      const rawModes = inheritance.modeByParent || {};
      for (const [parent, children] of Object.entries(result.tagInheritance.childrenByParent)) {
        const excluded = normalizePaths(rawExclusions[parent]);
        const included = normalizePaths(rawIncluded[parent]);
        for (const child of children) {
          if (excluded.length) {
            if (!result.tagInheritance.excludedPathsByParentChild[parent]) result.tagInheritance.excludedPathsByParentChild[parent] = {};
            result.tagInheritance.excludedPathsByParentChild[parent][child] = [...excluded];
          }
          if (included.length) {
            if (!result.tagInheritance.includedPathsByParentChild[parent]) result.tagInheritance.includedPathsByParentChild[parent] = {};
            result.tagInheritance.includedPathsByParentChild[parent][child] = [...included];
          }
          if (rawModes[parent] === 'selected') {
            if (!result.tagInheritance.modeByParentChild[parent]) result.tagInheritance.modeByParentChild[parent] = {};
            result.tagInheritance.modeByParentChild[parent][child] = 'selected';
          }
        }
      }
    }

    const rawFixedParents = inheritance.fixedParentByChild;
    if (rawFixedParents && typeof rawFixedParents === 'object' && !Array.isArray(rawFixedParents)) {
      for (const [rawChild, rawParent] of Object.entries(rawFixedParents)) {
        const child = normalizeTag(rawChild);
        const parent = normalizeTag(rawParent);
        if (child && parent && !isNestedTag(child) && !isNestedTag(parent)) {
          result.tagInheritance.fixedParentByChild[child] = parent;
        }
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
    this.reconcileFixedTagRelations();
    return result;
  }

  getTagInheritanceSettings() {
    if (!this.settings.relations) this.normalizeRelationSettings();
    const inheritance = this.settings.relations.tagInheritance;
    if (!inheritance.fixedParentByChild || typeof inheritance.fixedParentByChild !== 'object') {
      inheritance.fixedParentByChild = {};
    }
    if (!inheritance.modeByParentChild || typeof inheritance.modeByParentChild !== 'object') {
      inheritance.modeByParentChild = {};
    }
    if (!inheritance.excludedPathsByParentChild || typeof inheritance.excludedPathsByParentChild !== 'object') {
      inheritance.excludedPathsByParentChild = {};
    }
    if (!inheritance.includedPathsByParentChild || typeof inheritance.includedPathsByParentChild !== 'object') {
      inheritance.includedPathsByParentChild = {};
    }
    return inheritance;
  }

  parseFixedChildTag(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag || isNestedTag(tag)) return null;
    const name = getTagDisplayName(tag);
    const parts = name.split('-');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return { parent: normalizeTag(parts[0]), displayName: parts[1] };
  }

  isFixedTagRelationEligible(parentValue, childValue) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    const parsed = this.parseFixedChildTag(child);
    if (!parent || !child || !parsed || parsed.parent !== parent) return false;
    const parents = this.getInheritanceParents(child);
    return parents.length === 1 && parents[0] === parent;
  }

  getFixedParent(childValue) {
    const child = normalizeTag(childValue);
    if (!child) return null;
    return normalizeTag(this.getTagInheritanceSettings().fixedParentByChild[child]);
  }

  isFixedChild(tagValue) {
    return !!this.getFixedParent(tagValue);
  }

  isFixedTagEdge(parentValue, childValue) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    return !!parent && !!child && this.getFixedParent(child) === parent;
  }

  getFixedChildDisplayName(tagValue) {
    return this.parseFixedChildTag(tagValue)?.displayName || getTagDisplayName(tagValue);
  }

  getTopLevelFixedParent(tagValue) {
    let tag = normalizeTag(tagValue);
    if (!tag) return null;
    const visited = new Set();
    let parent = this.getFixedParent(tag);
    while (parent && !visited.has(tag)) {
      visited.add(tag);
      tag = parent;
      parent = this.getFixedParent(tag);
    }
    return tag;
  }

  filterInheritanceTreeByTags(tree, includedTags) {
    if (!tree) return null;
    const allowed = new Set(Array.from(includedTags || []).map(normalizeTag).filter(Boolean));
    const visit = (node, isRoot = false) => {
      const children = (node.children || []).map((child) => visit(child)).filter(Boolean);
      if (!isRoot && !allowed.has(node.tag) && children.length === 0) return null;
      const paths = isRoot || !allowed.has(node.tag) ? [] : [...node.paths];
      const subtreePaths = Array.from(new Set([
        ...paths,
        ...children.flatMap((child) => child.subtreePaths),
      ]));
      return { ...node, paths, children, subtreePaths };
    };
    return visit(tree, true);
  }

  createFixedSearchBrowseData(tagValue, includedTags) {
    const browseData = this.getTagBrowseData(tagValue);
    const inheritanceTree = this.filterInheritanceTreeByTags(browseData.inheritanceTree, includedTags);
    const paths = inheritanceTree?.subtreePaths || [];
    const files = paths
      .map((path) => this.app.vault.getAbstractFileByPath(path))
      .filter((file) => file instanceof TFile && file.extension === 'md');
    return {
      ...browseData,
      exactFiles: [],
      inheritedFiles: files,
      files,
      inheritanceTree,
      exactCount: 0,
      inheritedCount: files.length,
      hasActiveInheritance: !!inheritanceTree?.children.length,
    };
  }

  reconcileFixedTagRelations() {
    const inheritance = this.settings.relations?.tagInheritance;
    if (!inheritance) return false;
    const previous = inheritance.fixedParentByChild || {};
    const next = {};
    for (const [rawChild, rawParent] of Object.entries(previous)) {
      const child = normalizeTag(rawChild);
      const parent = normalizeTag(rawParent);
      if (!child || !parent || !this.isFixedTagRelationEligible(parent, child)) continue;
      next[child] = parent;
    }
    const changed = JSON.stringify(previous) !== JSON.stringify(next);
    inheritance.fixedParentByChild = next;
    return changed;
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
    return this.addNoteHierarchyEdges(
      [{ path: parentPath, displayName: '' }],
      [{ path: childPath, displayName: '' }]
    );
  }

  async addNoteHierarchyEdges(parentSelections, childSelections) {
    const parents = Array.from(new Map((parentSelections || []).map((item) => [item.path, item])).values());
    const children = Array.from(new Map((childSelections || []).map((item) => [item.path, item])).values());
    if (!parents.length) throw new Error('请选择父笔记');
    if (!children.length) throw new Error('请选择子笔记');
    if (parents.length > 1 && children.length > 1) throw new Error('不能同时选择多篇父笔记和多篇子笔记');

    for (const item of parents) {
      const file = this.app.vault.getAbstractFileByPath(item.path);
      if (!(file instanceof TFile) || file.extension !== 'md') throw new Error('父笔记无效');
    }
    for (const item of children) {
      const file = this.app.vault.getAbstractFileByPath(item.path);
      if (!(file instanceof TFile) || file.extension !== 'md') throw new Error('子笔记无效');
    }

    const hierarchy = this.getNoteHierarchySettings();
    const previousChildren = hierarchy.childrenByParentPath;
    const previousDisplayNames = hierarchy.displayNamesByParentPath;
    const stagedChildren = Object.fromEntries(Object.entries(hierarchy.childrenByParentPath)
      .map(([path, values]) => [path, [...values]]));
    const stagedDisplayNames = Object.fromEntries(Object.entries(hierarchy.displayNamesByParentPath)
      .map(([path, values]) => [path, { ...values }]));
    const pending = [];
    for (const parent of parents) {
      for (const child of children) {
        if (parent.path === child.path) throw new Error('父笔记和子笔记不能相同');
        if ((stagedChildren[parent.path] || []).includes(child.path)) continue;
        if (wouldCreateDirectedCycle(stagedChildren, parent.path, child.path)) {
          throw new Error('不能建立循环父子关系');
        }
        if (!stagedChildren[parent.path]) stagedChildren[parent.path] = [];
        stagedChildren[parent.path].push(child.path);
        pending.push({ parent, child });
      }
    }
    if (!pending.length) throw new Error('所选父子关系已经存在');

    for (const { parent, child } of pending) {
      const childFile = this.app.vault.getAbstractFileByPath(child.path);
      const alias = typeof child.displayName === 'string' ? child.displayName.trim() : '';
      if (!alias || !(childFile instanceof TFile) || !this.getNoteAliases(childFile).includes(alias)) continue;
      if (!stagedDisplayNames[parent.path]) stagedDisplayNames[parent.path] = {};
      stagedDisplayNames[parent.path][child.path] = alias;
    }
    hierarchy.childrenByParentPath = stagedChildren;
    hierarchy.displayNamesByParentPath = stagedDisplayNames;
    try {
      await this.saveSettings();
    } catch (error) {
      hierarchy.childrenByParentPath = previousChildren;
      hierarchy.displayNamesByParentPath = previousDisplayNames;
      throw error;
    }
    this.refreshHierarchyViews();
    return pending.length;
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

  async moveSelectedHierarchyNoteAfter(parentPath, targetPath) {
    const selected = this.selectedNoteOrderTarget;
    if (!selected || selected.hierarchyParent !== parentPath || !targetPath || selected.path === targetPath) return false;
    const children = this.getHierarchyChildren(parentPath);
    const movingIndex = children.indexOf(selected.path);
    const targetIndex = children.indexOf(targetPath);
    if (movingIndex < 0 || targetIndex < 0 || movingIndex === targetIndex + 1) return false;
    children.splice(movingIndex, 1);
    children.splice(children.indexOf(targetPath) + 1, 0, selected.path);
    this.getNoteHierarchySettings().childrenByParentPath[parentPath] = children;
    await this.saveSettings();
    this.refreshHierarchyViews();
    globalThis.setTimeout(() => this.refreshNoteOrderSelectionState(), 0);
    return true;
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

  createHierarchyParentItem(parentPath, matchingPaths = [], forceExpand = false) {
    const parentFile = this.app.vault.getAbstractFileByPath(parentPath);
    const childPaths = this.getNoteHierarchySettings().childrenByParentPath[parentPath];
    if (!(parentFile instanceof TFile) || parentFile.extension !== 'md' || !Array.isArray(childPaths) || !childPaths.length) return null;
    const descendants = this.getHierarchyDescendants(parentPath);
    const directCount = this.getHierarchyChildren(parentPath).filter((path) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      return file instanceof TFile && file.extension === 'md';
    }).length;
    const descendantCount = new Set(descendants.filter((path) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      return file instanceof TFile && file.extension === 'md';
    })).size;
    return {
      parentPath,
      parentFile,
      directCount,
      descendantCount,
      additionalCount: Math.max(0, descendantCount - directCount),
      matchingPaths: new Set(matchingPaths),
      forceExpand,
    };
  }

  getHierarchyParentItems(query = '', currentNotePath = '') {
    const parsed = parseHierarchySearch(query);
    if (!parsed.valid) return [];
    const hierarchy = this.getNoteHierarchySettings();
    const items = [];
    const currentFile = currentNotePath && this.app.vault.getAbstractFileByPath(currentNotePath);
    if (!(currentFile instanceof TFile) || currentFile.extension !== 'md') currentNotePath = '';

    if (currentNotePath) {
      const parentPaths = new Set();
      if (this.getHierarchyChildren(currentNotePath).length) parentPaths.add(currentNotePath);
      for (const parentPath of this.getHierarchyParents(currentNotePath)) parentPaths.add(parentPath);
      for (const parentPath of parentPaths) {
        const isCurrentChild = parentPath !== currentNotePath && this.getHierarchyChildren(parentPath).includes(currentNotePath);
        const item = this.createHierarchyParentItem(
          parentPath,
          isCurrentChild ? [currentNotePath] : [],
          isCurrentChild
        );
        if (item) items.push(item);
      }
    } else {
      const { parentQuery, childQuery } = parsed;
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
        const item = this.createHierarchyParentItem(parentPath, matchingPaths, !!childQuery);
        if (item) items.push(item);
      }
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
      currentNotePath: '',
      allExpanded: true,
      expandedParents: new Set(),
      expandedBranches: new Set(),
      collapsedParents: new Set(),
      collapsedBranches: new Set(),
      activeMatchIndex: -1,
      groupExpanded: true,
    };
  }

  getHierarchySearchContext(value) {
    const context = parseUnifiedHierarchySearch(value);
    if (context.mode !== 'current-note') return { ...context, currentNotePath: '' };
    const file = this.currentMainFilePath && this.app.vault.getAbstractFileByPath(this.currentMainFilePath);
    return {
      ...context,
      currentNotePath: file instanceof TFile && file.extension === 'md' ? file.path : '',
    };
  }

  getHierarchyEdgeCount() {
    let count = 0;
    for (const [parentPath, children] of Object.entries(this.getNoteHierarchySettings().childrenByParentPath)) {
      const parentFile = this.app.vault.getAbstractFileByPath(parentPath);
      if (!(parentFile instanceof TFile) || parentFile.extension !== 'md') continue;
      for (const childPath of Array.isArray(children) ? children : []) {
        const childFile = this.app.vault.getAbstractFileByPath(childPath);
        if (childFile instanceof TFile && childFile.extension === 'md') count += 1;
      }
    }
    return count;
  }

  getInlineHierarchyBranchKey(tagValue, path) {
    return `${String(tagValue || '')}\u0000${path}`;
  }

  toggleInlineHierarchyBranch(branchKey) {
    if (!branchKey) return false;
    const collapsedBranches = this.collapsedInlineHierarchyBranches || new Set();
    this.collapsedInlineHierarchyBranches = collapsedBranches;
    if (collapsedBranches.has(branchKey)) {
      collapsedBranches.delete(branchKey);
    } else {
      collapsedBranches.add(branchKey);
    }
    this.inlineHierarchyExpansionVersion = (this.inlineHierarchyExpansionVersion || 0) + 1;
    return !collapsedBranches.has(branchKey);
  }

  clearInlineHierarchyBranchState(tagValue) {
    const prefix = `${String(tagValue || '')}\u0000`;
    if (!prefix || !this.collapsedInlineHierarchyBranches) return false;
    let changed = false;
    for (const branchKey of Array.from(this.collapsedInlineHierarchyBranches)) {
      if (!String(branchKey).startsWith(prefix)) continue;
      this.collapsedInlineHierarchyBranches.delete(branchKey);
      changed = true;
    }
    if (changed) {
      this.inlineHierarchyExpansionVersion = (this.inlineHierarchyExpansionVersion || 0) + 1;
    }
    return changed;
  }

  migrateInlineTagBranchState(oldTagValue, newTagValue) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);
    const collapsed = this.collapsedInlineHierarchyBranches;
    if (!oldTag || !newTag || oldTag === newTag || !collapsed?.size) return false;
    let changed = false;
    const migrated = new Set();
    for (const rawKey of collapsed) {
      const parts = String(rawKey).split('\u0000');
      if (parts[0] === oldTag) {
        parts[0] = newTag;
        changed = true;
      }
      if (parts[1] === 'tag-group' && parts[2]) {
        const lineage = parts[2].split('\u0001');
        const nextLineage = lineage.map((tag) => tag === oldTag ? newTag : tag);
        if (nextLineage.some((tag, index) => tag !== lineage[index])) {
          parts[2] = nextLineage.join('\u0001');
          changed = true;
        }
      }
      migrated.add(parts.join('\u0000'));
    }
    if (!changed) return false;
    this.collapsedInlineHierarchyBranches = migrated;
    this.inlineHierarchyExpansionVersion = (this.inlineHierarchyExpansionVersion || 0) + 1;
    return true;
  }

  getInlineHierarchyDisplayName(tag, parentPath, file, isVirtual = false) {
    if (tag && !isVirtual && !isNestedTag(tag)) {
      const selected = this.settings.noteDisplayNameByTag?.[tag]?.[file.path];
      if (selected && this.getNoteAliases(file).includes(selected)) return selected;
    }
    if (parentPath) return this.getHierarchyDisplayName(parentPath, file);
    return this.getNoteDisplayName(tag, file, isVirtual);
  }

  hierarchyBranchContains(childrenByParent, parentPath, targetPath, seen = new Set()) {
    if (!parentPath || seen.has(parentPath)) return false;
    seen.add(parentPath);
    for (const childPath of childrenByParent[parentPath] || []) {
      if (childPath === targetPath) return true;
      if (this.hierarchyBranchContains(childrenByParent, childPath, targetPath, seen)) return true;
    }
    return false;
  }

  renderTagInheritanceBrowseTree(hostEl, tree, options = {}) {
    hostEl.empty();
    if (!tree) return;
    const rootTag = normalizeTag(tree.tag);
    const collapsed = this.collapsedInlineHierarchyBranches || new Set();
    this.collapsedInlineHierarchyBranches = collapsed;
    const targetPath = options.targetPath || '';
    const renderNotes = (containerEl, node, isInheritedGroup) => {
      const files = node.paths
        .map((path) => this.app.vault.getAbstractFileByPath(path))
        .filter((file) => file instanceof TFile && file.extension === 'md');
      this.renderInlineTagNoteTree(containerEl, files, node.tag, false, {
        ...options,
        inheritanceRootTag: rootTag,
        isInheritedGroup,
        allowInheritedReorder: true,
      });
    };
    const renderGroup = (
      containerEl,
      label,
      count,
      key,
      containsTarget,
      renderContent,
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
            if (options.surface === 'shelf') this.refreshTagViews();
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
        if (options.surface === 'shelf') this.refreshTagViews();
      });
      if (tagValue) {
        rowEl.addEventListener('contextmenu', (event) => {
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
    const renderNode = (containerEl, node, lineage, directParentTag) => {
      const key = `${rootTag}\u0000tag-group\u0000${lineage.join('\u0001')}`;
      const renderNodeContent = (contentEl) => {
          if (!node.children.length) {
            renderNotes(contentEl, node, true);
            return;
          }
          if (node.paths.length) {
            renderGroup(contentEl, '原生', node.paths.length, `${key}\u0000original`,
              node.paths.includes(targetPath), (originalEl) => renderNotes(originalEl, node, true));
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
        tree.paths.includes(targetPath), (contentEl) => renderNotes(contentEl, tree, false));
    }
    for (const child of tree.children) renderNode(hostEl, child, [child.tag], tree.tag);
    this.scheduleTagOrderModeVisibilityReconcile();
  }

  renderInlineTagNoteTree(hostEl, files, tagValue, isVirtual = false, options = {}) {
    hostEl.empty();
    const tag = normalizeTag(tagValue);
    const orderedFiles = Array.from(new Map((files || []).map((file) => [file.path, file])).values());
    const fileByPath = new Map(orderedFiles.map((file) => [file.path, file]));
    const forest = buildVisibleHierarchyForest(
      orderedFiles.map((file) => file.path),
      this.getNoteHierarchySettings().childrenByParentPath
    );
    const collapsedBranches = this.collapsedInlineHierarchyBranches || new Set();
    this.collapsedInlineHierarchyBranches = collapsedBranches;
    const surface = options.surface || 'sidebar';
    const inheritanceRootTag = normalizeTag(options.inheritanceRootTag || tag);
    const targetPath = options.targetPath || '';
    const renderedCards = [];

    const renderNode = (containerEl, path, parentPath = '', branch = new Set()) => {
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
          if (surface === 'shelf') this.refreshTagViews();
        }, toggleOrder);
      } else if (hasOrderButton) {
        setIcon(orderButtonEl, 'grip-vertical');
        this.syncNoteOrderButtonSelection(orderButtonEl);
        orderButtonEl.addEventListener('click', (event) => {
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
        toggleEl.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.toggleInlineHierarchyBranch(branchKey);
          options.rerender?.();
          if (surface === 'shelf') this.refreshTagViews();
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
      cardEl.addEventListener('contextmenu', (event) => {
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
      scrollTopButtonEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.scheduleTagTopScroll(options.scrollContainer || hostEl, tagValue);
      });
    }
  }

  renderHierarchySearchItem(hostEl, state, options = {}) {
    hostEl.empty();
    const surface = options.surface || 'sidebar';
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
    addButtonEl.addEventListener('click', (event) => {
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

  resetHierarchyExpansionState(state) {
    if (!state) return;
    state.allExpanded = true;
    state.expandedParents.clear();
    state.expandedBranches.clear();
    state.collapsedParents?.clear();
    state.collapsedBranches?.clear();
  }

  toggleHierarchyGroup(state) {
    if (!state) return false;
    state.groupExpanded = state.groupExpanded === false;
    this.resetHierarchyExpansionState(state);
    return state.groupExpanded;
  }

  toggleAllHierarchyItems(state) {
    state.allExpanded = !state.allExpanded;
    state.expandedParents.clear();
    state.expandedBranches.clear();
    state.collapsedParents?.clear();
    state.collapsedBranches?.clear();
    if (typeof state.renderList === 'function') state.renderList();
    return state.allExpanded;
  }

  isHierarchyItemExpanded(state, key, kind, forceExpanded = false) {
    if (forceExpanded) return true;
    const expandedSet = kind === 'parent' ? state.expandedParents : state.expandedBranches;
    const collapsedSet = kind === 'parent'
      ? (state.collapsedParents ||= new Set())
      : (state.collapsedBranches ||= new Set());
    return state.allExpanded ? !collapsedSet.has(key) : expandedSet.has(key);
  }

  toggleHierarchyItemExpansion(state, key, kind) {
    const expandedSet = kind === 'parent' ? state.expandedParents : state.expandedBranches;
    const collapsedSet = kind === 'parent'
      ? (state.collapsedParents ||= new Set())
      : (state.collapsedBranches ||= new Set());
    if (state.allExpanded) {
      if (collapsedSet.has(key)) collapsedSet.delete(key);
      else collapsedSet.add(key);
      return !collapsedSet.has(key);
    }
    if (expandedSet.has(key)) expandedSet.delete(key);
    else expandedSet.add(key);
    return expandedSet.has(key);
  }

  renderNoteHierarchyPage(hostEl, state, options = {}) {
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
    const handleSearchEnter = (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      const matches = Array.from(listEl.querySelectorAll('.is-hierarchy-search-match'));
      if (!matches.length) return;
      state.activeMatchIndex = (state.activeMatchIndex + 1) % matches.length;
      matches.forEach((el, index) => el.classList.toggle('is-active-match', index === state.activeMatchIndex));
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

  renderHierarchyParentItem(listEl, item, state, rerender, surface) {
    const expanded = this.isHierarchyItemExpanded(state, item.parentPath, 'parent', item.forceExpand);
    const treeEl = listEl.createDiv({ cls: 'tree-item puffs-note-hierarchy-parent' });
    const rowEl = treeEl.createDiv({ cls: 'tree-item-self is-clickable mod-collapsible puffs-note-hierarchy-parent-row' });
    const toggleEl = rowEl.createDiv({ cls: 'tree-item-icon collapse-icon' });
    toggleEl.classList.toggle('is-collapsed', !expanded);
    setIcon(toggleEl, 'right-triangle');
    rowEl.createDiv({ text: item.parentFile.basename, cls: 'tree-item-inner' });
    const addChildButton = rowEl.createEl('button', { cls: 'clickable-icon puffs-hierarchy-add-child-button', attr: { 'aria-label': '添加子笔记' } });
    setIcon(addChildButton, 'user-round-plus');
    addChildButton.addEventListener('click', (event) => {
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
      orderButtonEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleHierarchyNoteOrderTarget(parentPath, file.path, surface);
      });
      if (matchingPaths.has(childPath)) cardEl.classList.add('is-hierarchy-search-match');
      if (hasChildren) {
        const toggleEl = cardEl.createDiv({ cls: 'tree-item-icon collapse-icon' });
        toggleEl.classList.toggle('is-collapsed', !expanded);
        setIcon(toggleEl, 'right-triangle');
        toggleEl.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.toggleHierarchyItemExpansion(state, branchKey, 'branch');
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
    const aliases = this.getNoteAliases(file);
    if (aliases.length) {
      menu.addItem((item) => item.setTitle('更换显示名称').setIcon('text-cursor-input').onClick(() => {
        const position = { x: event.clientX, y: event.clientY };
        window.setTimeout(() => this.showHierarchyDisplayNameOptions(position, parentPath, file, aliases), 0);
      }));
    }
    menu.addItem((item) => item.setTitle('添加子笔记').setIcon('user-round-plus').onClick(() => new NoteRelationModal(this.app, this, file.path, 'child').open()));
    menu.addItem((item) => item.setTitle('添加父笔记').setIcon('corner-left-up').onClick(() => new NoteRelationModal(this.app, this, file.path, 'parent').open()));
    menu.addItem((item) => item.setTitle('从当前移除').setIcon('unlink').onClick(() => this.removeNoteHierarchyEdge(parentPath, file.path)));
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
    this.relationStructureVersion = (this.relationStructureVersion || 0) + 1;
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }

  getHierarchyNavigationHistory(view, surface) {
    if (surface === 'shelf') {
      if (!view.hierarchyNavigationHistory) {
        view.hierarchyNavigationHistory = createHierarchyNavigationHistory();
      }
      return view.hierarchyNavigationHistory;
    }
    const patch = this.viewPatches.get(view) || this.patchTagView(view);
    if (!patch.hierarchyNavigationHistory) {
      patch.hierarchyNavigationHistory = createHierarchyNavigationHistory();
    }
    return patch.hierarchyNavigationHistory;
  }

  getHierarchyNavigationScrollEl(view, surface) {
    if (surface === 'shelf') return view.contentEl || null;
    return view.containerEl?.querySelector('.tag-container') || view.tagPaneEl || null;
  }

  captureHierarchyNavigationSnapshot(view, surface) {
    const query = surface === 'shelf' ? view.searchQuery : this.getTagSearchValue(view);
    const scrollEl = this.getHierarchyNavigationScrollEl(view, surface);
    return { query: String(query || ''), scrollTop: scrollEl?.scrollTop || 0 };
  }

  applyHierarchyNavigationSnapshot(view, surface, snapshot) {
    const history = this.getHierarchyNavigationHistory(view, surface);
    const restoreRequestId = history.restoreRequestId;
    if (surface === 'shelf') {
      view.searchQuery = snapshot.query;
      view.hierarchyState.activeMatchIndex = -1;
      view.searchComponent?.setValue(snapshot.query);
      view.renderTagList();
    } else {
      const patch = this.viewPatches.get(view) || this.patchTagView(view);
      patch.hierarchyState.activeMatchIndex = -1;
      if (!view.isShowingSearch && typeof view.setShowSearch === 'function') view.setShowSearch(true);
      const searchComponent = view.searchComponent;
      if (searchComponent && typeof searchComponent.setValue === 'function') searchComponent.setValue(snapshot.query);
      const inputEl = searchComponent && searchComponent.inputEl;
      if (inputEl) inputEl.value = snapshot.query;
      if (typeof view.updateSearch === 'function') view.updateSearch();
      this.scheduleSyncView(view, 0);
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (history.restoreRequestId !== restoreRequestId) return;
      const scrollEl = this.getHierarchyNavigationScrollEl(view, surface);
      if (scrollEl?.isConnected) scrollEl.scrollTop = snapshot.scrollTop;
      const inputEl = view.searchComponent?.inputEl;
      if (inputEl?.isConnected) inputEl.focus({ preventScroll: true });
    }));
  }

  navigateHierarchyHistory(view, surface, direction) {
    const history = this.getHierarchyNavigationHistory(view, surface);
    if (history.entries.length < 2) return false;
    const snapshot = moveHierarchyNavigation(
      history,
      direction,
      this.captureHierarchyNavigationSnapshot(view, surface)
    );
    if (snapshot) this.applyHierarchyNavigationSnapshot(view, surface, snapshot);
    return true;
  }

  pushHierarchyNavigationForView(view, surface, query) {
    const history = this.getHierarchyNavigationHistory(view, surface);
    const target = pushHierarchyNavigation(
      history,
      this.captureHierarchyNavigationSnapshot(view, surface),
      { query, scrollTop: 0 }
    );
    this.applyHierarchyNavigationSnapshot(view, surface, target);
  }

  openHierarchyForNote(path, sourceEl) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== 'md') return;
    const keyword = DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD;
    const relationParentPath = sourceEl && sourceEl.dataset && sourceEl.dataset.puffsHierarchyParent;
    const relationParent = relationParentPath && this.app.vault.getAbstractFileByPath(relationParentPath);
    const query = relationParent instanceof TFile && relationParent.extension === 'md'
      ? `${keyword}${relationParent.basename}*${file.basename}`
      : this.getHierarchyParents(path).length > 0
        ? `${keyword}${keyword}${file.basename}`
        : `${keyword}${file.basename}`;
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_SHELF_VIEW_TYPE)) {
      const view = leaf.view;
      if (!view || !view.contentEl || !view.contentEl.contains(sourceEl)) continue;
      this.pushHierarchyNavigationForView(view, 'shelf', query);
      return;
    }
    for (const leaf of this.app.workspace.getLeavesOfType('tag')) {
      const view = leaf.view;
      if (!view || !view.containerEl || !view.containerEl.contains(sourceEl)) continue;
      this.pushHierarchyNavigationForView(view, 'sidebar', query);
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
    const inheritanceRootTag = normalizeTag(cardEl.dataset.puffsInheritanceRootTag || tag);
    const menu = new Menu();
    const inherited = cardEl.dataset.puffsInherited === 'true' || (tag && this.isInheritedFileForTag(tag, path));
    const fixedInherited = inheritanceRootTag && this.isFixedInheritedFileForTag(inheritanceRootTag, path);
    if (inherited && !fixedInherited) {
      menu.addItem((item) => item
        .setTitle(this.getInheritedFileRemovalTitle(inheritanceRootTag))
        .setIcon('eye-off')
        .onClick(() => this.setInheritedFileVisible(inheritanceRootTag, path, false).catch((error) => {
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
    if ((inherited && !fixedInherited) || aliases.length > 0) menu.addSeparator();
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
    if (!tag) return [];
    return [...(this.getTagInheritanceSettings().childrenByParent[tag] || [])];
  }

  initializeTagInheritanceOrder() {
    const relations = this.settings.relations;
    if (!relations || Number(relations.version) >= 6) return false;

    const inheritance = this.getTagInheritanceSettings();
    if (Number(relations.version) < 2) {
      const nextChildrenByParent = {};
      for (const [parent, children] of Object.entries(inheritance.childrenByParent)) {
        const orderedChildren = this.sortTagsByVisibleCount(children);
        if (orderedChildren.length > 0) nextChildrenByParent[parent] = orderedChildren;
      }
      inheritance.childrenByParent = nextChildrenByParent;
    }
    if (!inheritance.fixedParentByChild || typeof inheritance.fixedParentByChild !== 'object') {
      inheritance.fixedParentByChild = {};
    }
    this.reconcileFixedTagRelations();
    this.reconcileInheritancePathLists();
    relations.version = 6;
    return true;
  }

  getTagVisibleNoteCount(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return 0;
    return this.getTagBrowseData(tag).files.length;
  }

  compareTagsByVisibleCount(leftValue, rightValue) {
    const left = normalizeTag(leftValue) || '';
    const right = normalizeTag(rightValue) || '';
    return compareTagItemsByCount(
      { count: this.getTagVisibleNoteCount(left), name: getTagDisplayName(left) },
      { count: this.getTagVisibleNoteCount(right), name: getTagDisplayName(right) }
    );
  }

  sortTagsByVisibleCount(tagValues) {
    return Array.from(new Set((tagValues || []).map(normalizeTag).filter(Boolean)))
      .sort((left, right) => this.compareTagsByVisibleCount(left, right));
  }

  getSortedTagInheritanceAdjacency() {
    const result = {};
    for (const parent of Object.keys(this.getTagInheritanceSettings().childrenByParent)) {
      const children = this.getInheritanceChildren(parent);
      if (children.length) result[parent] = children;
    }
    return result;
  }

  getFixedTagInheritanceAdjacency() {
    const result = {};
    for (const [parent, children] of Object.entries(this.getTagInheritanceSettings().childrenByParent)) {
      const fixedChildren = children.filter((child) => this.isFixedTagEdge(parent, child));
      if (fixedChildren.length) result[parent] = fixedChildren;
    }
    return result;
  }

  getActiveTagInheritanceAdjacency(tagValue) {
    return this.isTagInheritanceEnabled(tagValue)
      ? this.getSortedTagInheritanceAdjacency()
      : this.getFixedTagInheritanceAdjacency();
  }

  hasFreeInheritanceBranch(tagValue) {
    const root = normalizeTag(tagValue);
    if (!root) return false;
    const adjacency = this.getSortedTagInheritanceAdjacency();
    const visit = (parent, branch) => {
      if (branch.has(parent)) return false;
      const nextBranch = new Set(branch);
      nextBranch.add(parent);
      for (const child of adjacency[parent] || []) {
        if (!this.isFixedTagEdge(parent, child)) return true;
        if (visit(child, nextBranch)) return true;
      }
      return false;
    };
    return visit(root, new Set());
  }

  getInheritanceParents(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return [];
    return Object.entries(this.getTagInheritanceSettings().childrenByParent)
      .filter(([, children]) => Array.isArray(children) && children.includes(tag))
      .map(([parent]) => parent);
  }

  getTagInheritanceGroupKeys(tagValue) {
    const tag = normalizeTag(tagValue);
    const browseData = tag && this.getTagBrowseData(tag);
    const tree = (browseData?.hasActiveInheritance ?? browseData?.inheritanceEnabled)
      ? browseData.inheritanceTree
      : null;
    if (!tree || !tree.children.length) return [];
    const keys = [];
    const prefix = `${tag}\u0000tag-group\u0000`;
    if (tree.paths.length) keys.push(`${prefix}original`);
    const visit = (node, lineage) => {
      const key = `${prefix}${lineage.join('\u0001')}`;
      keys.push(key);
      if (node.children.length && node.paths.length) keys.push(`${key}\u0000original`);
      for (const child of node.children) visit(child, [...lineage, child.tag]);
    };
    for (const child of tree.children) visit(child, [child.tag]);
    return keys;
  }

  getUniqueSearchInheritanceControl(
    items,
    queryValue,
    expandedTags = this.expandedTags,
    matchingItems = items
  ) {
    const query = String(queryValue || '').trim();
    if (query ? matchingItems.length !== 1 : !this.isPinnedOnlyTagResult(queryValue, items)) return null;
    const tags = Array.from(new Set(items.map((item) => item.tag)));
    const keys = [];
    for (const tag of tags) {
      const tagKeys = this.getTagInheritanceGroupKeys(tag);
      if (!tagKeys.length) return null;
      keys.push(...tagKeys);
    }
    const collapsed = this.collapsedInlineHierarchyBranches || new Set();
    return {
      tags,
      keys,
      shouldExpand: tags.some((tag) => !expandedTags?.has(tag)) || keys.every((key) => collapsed.has(key)),
    };
  }

  setAllTagInheritanceGroupsExpanded(keys, expanded) {
    const collapsed = this.collapsedInlineHierarchyBranches || new Set();
    this.collapsedInlineHierarchyBranches = collapsed;
    let changed = false;
    for (const key of keys || []) {
      if (expanded) changed = collapsed.delete(key) || changed;
      else if (!collapsed.has(key)) {
        collapsed.add(key);
        changed = true;
      }
    }
    if (changed) this.inlineHierarchyExpansionVersion = (this.inlineHierarchyExpansionVersion || 0) + 1;
    return changed;
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

  getTagInheritanceMode(parentValue, childValue) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child) return 'all';
    return this.getTagInheritanceSettings().modeByParentChild[parent]?.[child] === 'selected' ? 'selected' : 'all';
  }

  getIncludedInheritedPaths(parentValue, childValue) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child) return [];
    return [...(this.getTagInheritanceSettings().includedPathsByParentChild[parent]?.[child] || [])];
  }

  getExcludedInheritedPaths(parentValue, childValue) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child) return [];
    return [...(this.getTagInheritanceSettings().excludedPathsByParentChild[parent]?.[child] || [])];
  }

  setParentChildValue(target, parent, child, value) {
    if (value === undefined || (Array.isArray(value) && !value.length)) {
      if (target[parent]) {
        delete target[parent][child];
        if (!Object.keys(target[parent]).length) delete target[parent];
      }
      return;
    }
    if (!target[parent]) target[parent] = {};
    target[parent][child] = value;
  }

  cloneParentChildSettings(source) {
    return Object.fromEntries(Object.entries(source || {}).map(([parent, children]) => [
      parent,
      Object.fromEntries(Object.entries(children || {}).map(([child, value]) => [
        child,
        Array.isArray(value) ? [...value] : value,
      ])),
    ]));
  }

  isInheritanceEdgePathVisible(parentValue, childValue, path) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child || !path) return false;
    if (this.isFixedTagEdge(parent, child)) return true;
    return this.getTagInheritanceMode(parent, child) === 'selected'
      ? this.getIncludedInheritedPaths(parent, child).includes(path)
      : !this.getExcludedInheritedPaths(parent, child).includes(path);
  }

  isInheritancePathVisible(edges, path, ignoredEdge = null) {
    return (edges || []).every((edge) => (
      ignoredEdge && edge.parent === ignoredEdge.parent && edge.child === ignoredEdge.child
        ? true
        : this.isInheritanceEdgePathVisible(edge.parent, edge.child, path)
    ));
  }

  createInheritanceEdgesFromLineage(lineage) {
    const edges = [];
    for (let index = 1; index < (lineage || []).length; index += 1) {
      const parent = lineage[index - 1];
      const child = lineage[index];
      edges.push({ parent, child, fixed: this.isFixedTagEdge(parent, child) });
    }
    return edges;
  }

  getInheritanceBranchData(tagValue, childValue = null, includeInactive = false) {
    const tag = normalizeTag(tagValue);
    const requestedChild = normalizeTag(childValue);
    if (!tag) return null;
    const tagFileIndex = this.tagFileIndex || new Map();
    const directFiles = tagFileIndex.get(tag) || [];
    const exactFiles = typeof this.getOrderedFilesForTag === 'function'
      ? this.getOrderedFilesForTag(tag, directFiles)
      : directFiles;
    const exactPaths = exactFiles.map((file) => file.path);
    const orderedBranches = [];
    const orderedPathsByTag = { [tag]: exactPaths };
    const fixedTags = new Set();
    const adjacency = includeInactive
      ? this.getSortedTagInheritanceAdjacency()
      : this.getActiveTagInheritanceAdjacency(tag);
    const visit = (sourceTag, edges, branch = new Set([tag])) => {
      if (branch.has(sourceTag)) return;
      const nextBranch = new Set(branch);
      nextBranch.add(sourceTag);
      const paths = (typeof this.getOrderedFilesForTag === 'function'
        ? this.getOrderedFilesForTag(sourceTag, tagFileIndex.get(sourceTag) || [])
        : tagFileIndex.get(sourceTag) || []).map((file) => file.path);
      const fixed = edges.length > 0 && edges.every((edge) => edge.fixed);
      orderedBranches.push({ source: sourceTag, paths, fixed, edges });
      if (fixed) fixedTags.add(sourceTag);
      orderedPathsByTag[sourceTag] = paths;
      for (const child of adjacency[sourceTag] || []) {
        visit(child, [
          ...edges,
          { parent: sourceTag, child, fixed: this.isFixedTagEdge(sourceTag, child) },
        ], nextBranch);
      }
    };
    const rootChildren = requestedChild
      ? (adjacency[tag] || []).filter((child) => child === requestedChild)
      : adjacency[tag] || [];
    for (const child of rootChildren) {
      visit(child, [{ parent: tag, child, fixed: this.isFixedTagEdge(tag, child) }], new Set([tag]));
    }
    return { tag, exactFiles, exactPaths, orderedBranches, orderedPathsByTag, fixedTags, adjacency };
  }

  getInheritanceCandidates(parentValue, childValue) {
    const branchData = this.getInheritanceBranchData(parentValue, childValue, true);
    if (!branchData) return [];
    const exactPaths = new Set(branchData.exactPaths);
    const candidatesByPath = new Map();
    for (const branch of branchData.orderedBranches) {
      for (const path of branch.paths || []) {
        if (!path || exactPaths.has(path) || !this.isInheritancePathVisible(branch.edges.slice(1), path)) continue;
        let candidate = candidatesByPath.get(path);
        if (!candidate) {
          const file = this.app?.vault?.getAbstractFileByPath(path) ||
            Array.from((this.tagFileIndex || new Map()).values()).flat().find((item) => item.path === path) || null;
          candidate = { path, file, source: branch.source, sources: [], fixed: false };
          candidatesByPath.set(path, candidate);
        }
        if (!candidate.sources.includes(branch.source)) candidate.sources.push(branch.source);
        candidate.fixed = candidate.fixed || !!branch.fixed;
      }
    }
    return Array.from(candidatesByPath.values());
  }

  reconcileInheritancePathLists(parentValues = null) {
    const inheritance = this.getTagInheritanceSettings();
    const requestedParents = parentValues
      ? Array.from(new Set(parentValues.map(normalizeTag).filter(Boolean)))
      : Array.from(new Set([
        ...Object.keys(inheritance.childrenByParent),
        ...Object.keys(inheritance.excludedPathsByParentChild),
        ...Object.keys(inheritance.includedPathsByParentChild),
      ]));
    const parents = new Set(requestedParents);
    if (parentValues) {
      const queue = [...requestedParents];
      while (queue.length) {
        const child = queue.shift();
        for (const parent of this.getInheritanceParents(child)) {
          if (parents.has(parent)) continue;
          parents.add(parent);
          queue.push(parent);
        }
      }
    }
    const beforeIncluded = JSON.stringify(inheritance.includedPathsByParentChild);
    const beforeExcluded = JSON.stringify(inheritance.excludedPathsByParentChild);
    const visited = new Set();
    const reconcileParent = (parent) => {
      if (!parent || visited.has(parent) || !parents.has(parent)) return;
      visited.add(parent);
      for (const child of inheritance.childrenByParent[parent] || []) reconcileParent(child);
      const children = new Set(inheritance.childrenByParent[parent] || []);
      for (const key of ['modeByParentChild', 'excludedPathsByParentChild', 'includedPathsByParentChild']) {
        for (const child of Object.keys(inheritance[key][parent] || {})) {
          if (!children.has(child)) this.setParentChildValue(inheritance[key], parent, child, undefined);
        }
      }
      for (const child of children) {
        const freePaths = new Set(this.getInheritanceCandidates(parent, child)
          .filter((candidate) => !candidate.fixed)
          .map((candidate) => candidate.path));
        for (const key of ['excludedPathsByParentChild', 'includedPathsByParentChild']) {
          const nextPaths = (inheritance[key][parent]?.[child] || []).filter((path) => freePaths.has(path));
          this.setParentChildValue(inheritance[key], parent, child, nextPaths.length ? nextPaths : undefined);
        }
      }
    };
    for (const parent of parents) reconcileParent(parent);
    return beforeIncluded !== JSON.stringify(inheritance.includedPathsByParentChild) ||
      beforeExcluded !== JSON.stringify(inheritance.excludedPathsByParentChild);
  }

  async setTagInheritanceMode(parentValue, childValue, modeValue) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    const mode = modeValue === 'selected' ? 'selected' : 'all';
    if (!parent || !child || !this.getInheritanceChildren(parent).includes(child)) throw new Error('继承关系无效');
    if (this.isFixedTagEdge(parent, child)) throw new Error('固定子标签不能切换继承模式');
    const inheritance = this.getTagInheritanceSettings();
    const previousModes = inheritance.modeByParentChild;
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousExcluded = inheritance.excludedPathsByParentChild;
    const currentMode = this.getTagInheritanceMode(parent, child);
    if (currentMode === mode) return;
    const freeCandidates = this.getInheritanceCandidates(parent, child).filter((candidate) => !candidate.fixed);
    const currentVisible = new Set(currentMode === 'selected'
      ? this.getIncludedInheritedPaths(parent, child)
      : freeCandidates
        .filter((candidate) => !this.getExcludedInheritedPaths(parent, child).includes(candidate.path))
        .map((candidate) => candidate.path));
    inheritance.modeByParentChild = this.cloneParentChildSettings(previousModes);
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    if (mode === 'selected') {
      this.setParentChildValue(inheritance.modeByParentChild, parent, child, 'selected');
      const paths = freeCandidates.filter((candidate) => currentVisible.has(candidate.path)).map((candidate) => candidate.path);
      this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, paths.length ? paths : undefined);
    } else {
      this.setParentChildValue(inheritance.modeByParentChild, parent, child, undefined);
      const paths = freeCandidates.filter((candidate) => !currentVisible.has(candidate.path)).map((candidate) => candidate.path);
      this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, paths.length ? paths : undefined);
    }
    this.reconcileInheritancePathLists([parent]);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.modeByParentChild = previousModes;
      inheritance.includedPathsByParentChild = previousIncluded;
      inheritance.excludedPathsByParentChild = previousExcluded;
      throw error;
    }
    this.refreshHierarchyViews();
  }

  async setIncludedInheritedPaths(parentValue, childValue, pathValues) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child || !this.getInheritanceChildren(parent).includes(child)) throw new Error('继承关系无效');
    const inheritance = this.getTagInheritanceSettings();
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousExcluded = inheritance.excludedPathsByParentChild;
    const allowed = new Set(this.getInheritanceCandidates(parent, child)
      .filter((candidate) => !candidate.fixed)
      .map((candidate) => candidate.path));
    const paths = Array.from(new Set((pathValues || [])
      .map((path) => typeof path === 'string' ? path.trim() : '')
      .filter((path) => path && allowed.has(path))));
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, paths.length ? paths : undefined);
    this.reconcileInheritancePathLists([parent]);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.includedPathsByParentChild = previousIncluded;
      inheritance.excludedPathsByParentChild = previousExcluded;
      throw error;
    }
    this.refreshHierarchyViews();
  }

  applyInheritedFileVisibilityToEdge(parent, child, path, visible) {
    const inheritance = this.getTagInheritanceSettings();
    if (this.getTagInheritanceMode(parent, child) === 'selected') {
      const paths = new Set(this.getIncludedInheritedPaths(parent, child));
      if (visible) paths.add(path);
      else paths.delete(path);
      this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, paths.size ? Array.from(paths) : undefined);
    } else {
      const paths = new Set(this.getExcludedInheritedPaths(parent, child));
      if (visible) paths.delete(path);
      else paths.add(path);
      this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, paths.size ? Array.from(paths) : undefined);
    }
  }

  async setInheritedFileVisibleForEdge(parentValue, childValue, path, visible) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child || !path) return;
    const candidate = this.getInheritanceCandidates(parent, child).find((item) => item.path === path);
    if (!candidate || candidate.fixed) return;
    const inheritance = this.getTagInheritanceSettings();
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousExcluded = inheritance.excludedPathsByParentChild;
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    this.applyInheritedFileVisibilityToEdge(parent, child, path, visible);
    this.reconcileInheritancePathLists([parent]);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.includedPathsByParentChild = previousIncluded;
      inheritance.excludedPathsByParentChild = previousExcluded;
      throw error;
    }
    this.refreshHierarchyViews();
  }

  async setInheritedFileVisible(parentValue, path, visible) {
    const parent = normalizeTag(parentValue);
    if (!parent || !path) return;
    const edges = this.getInheritanceChildren(parent).filter((child) => {
      const candidate = this.getInheritanceCandidates(parent, child).find((item) => item.path === path);
      return candidate && !candidate.fixed;
    });
    if (!edges.length) return;
    const inheritance = this.getTagInheritanceSettings();
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousExcluded = inheritance.excludedPathsByParentChild;
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    for (const child of edges) this.applyInheritedFileVisibilityToEdge(parent, child, path, visible);
    this.reconcileInheritancePathLists([parent]);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.includedPathsByParentChild = previousIncluded;
      inheritance.excludedPathsByParentChild = previousExcluded;
      throw error;
    }
    this.refreshHierarchyViews();
  }

  getInheritedFileRemovalTitle(tagValue) {
    return `从 ${getTagDisplayName(normalizeTag(tagValue))} 中排除`;
  }

  getTagDescendants(tagValue) {
    const root = normalizeTag(tagValue);
    if (!root) return [];
    return collectDirectedDescendants(this.getSortedTagInheritanceAdjacency(), root);
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
    this.reconcileFixedTagRelations();
  }

  async setInheritanceChildren(parentValue, childValues) {
    const parent = normalizeTag(parentValue);
    if (!parent || isNestedTag(parent)) throw new Error('父标签无效');
    const children = [];
    const seen = new Set();
    for (const rawChild of childValues || []) {
      const child = normalizeTag(rawChild);
      if (!child || isNestedTag(child) || seen.has(child)) continue;
      const fixedParent = this.getFixedParent(child);
      if (fixedParent && fixedParent !== parent) {
        throw new Error(`${getTagDisplayName(child)} 是固定子标签，请先解除固定`);
      }
      if (this.wouldCreateTagInheritanceCycle(parent, child)) {
        throw new Error(`不能建立循环继承：${getTagDisplayName(parent)} → ${getTagDisplayName(child)}`);
      }
      seen.add(child);
      children.push(child);
    }
    const inheritance = this.getTagInheritanceSettings();
    const previousChildren = inheritance.childrenByParent;
    const previousEnabled = inheritance.enabledParents;
    const previousModes = inheritance.modeByParentChild;
    const previousExclusions = inheritance.excludedPathsByParentChild;
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousFixedParents = inheritance.fixedParentByChild;
    const wasParent = Array.isArray(previousChildren[parent]) && previousChildren[parent].length > 0;
    const stagedChildren = { ...previousChildren };
    const stagedModes = this.cloneParentChildSettings(previousModes);
    const stagedExclusions = this.cloneParentChildSettings(previousExclusions);
    const stagedIncluded = this.cloneParentChildSettings(previousIncluded);
    let stagedEnabled = [...previousEnabled];
    if (children.length > 0) {
      stagedChildren[parent] = children;
      if (!wasParent && !stagedEnabled.includes(parent)) stagedEnabled.push(parent);
    } else {
      delete stagedChildren[parent];
      stagedEnabled = stagedEnabled.filter((tag) => tag !== parent);
      delete stagedModes[parent];
      delete stagedExclusions[parent];
      delete stagedIncluded[parent];
    }
    inheritance.childrenByParent = stagedChildren;
    inheritance.enabledParents = stagedEnabled;
    inheritance.modeByParentChild = stagedModes;
    inheritance.excludedPathsByParentChild = stagedExclusions;
    inheritance.includedPathsByParentChild = stagedIncluded;
    inheritance.fixedParentByChild = Object.fromEntries(
      Object.entries(previousFixedParents).filter(([child, fixedParent]) => (
        fixedParent !== parent || children.includes(child)
      ))
    );
    this.reconcileInheritancePathLists([parent]);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.childrenByParent = previousChildren;
      inheritance.enabledParents = previousEnabled;
      inheritance.modeByParentChild = previousModes;
      inheritance.excludedPathsByParentChild = previousExclusions;
      inheritance.includedPathsByParentChild = previousIncluded;
      inheritance.fixedParentByChild = previousFixedParents;
      throw error;
    }
    this.refreshHierarchyViews();
  }

  async setInheritanceParents(childValue, parentValues) {
    const child = normalizeTag(childValue);
    if (!child || isNestedTag(child)) throw new Error('子标签无效');
    const parents = Array.from(new Set((parentValues || []).map(normalizeTag).filter(Boolean)));
    if (parents.some((parent) => isNestedTag(parent) || parent === child)) throw new Error('父标签无效');
    const fixedParent = this.getFixedParent(child);
    if (fixedParent && parents.length > 0 && (parents.length !== 1 || parents[0] !== fixedParent)) {
      throw new Error(`${getTagDisplayName(child)} 是固定子标签，请先解除固定`);
    }

    const inheritance = this.getTagInheritanceSettings();
    const previousChildren = inheritance.childrenByParent;
    const previousEnabled = inheritance.enabledParents;
    const previousModes = inheritance.modeByParentChild;
    const previousExclusions = inheritance.excludedPathsByParentChild;
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousFixedParents = inheritance.fixedParentByChild;
    const affectedParents = Array.from(new Set([
      ...Object.entries(previousChildren)
        .filter(([, children]) => children.includes(child))
        .map(([parent]) => parent),
      ...parents,
    ]));
    const stagedChildren = Object.fromEntries(Object.entries(previousChildren).map(([parent, children]) => [
      parent,
      children.filter((tag) => tag !== child),
    ]).filter(([, children]) => children.length));

    for (const parent of parents) {
      if (wouldCreateDirectedCycle(stagedChildren, parent, child)) {
        throw new Error(`不能建立循环继承：${getTagDisplayName(parent)} → ${getTagDisplayName(child)}`);
      }
      stagedChildren[parent] = this.sortTagsByVisibleCount([...(stagedChildren[parent] || []), child]);
    }

    inheritance.childrenByParent = stagedChildren;
    const validParents = new Set(Object.keys(stagedChildren));
    const newlyPromotedParents = parents.filter((parent) => !previousChildren[parent]?.length);
    inheritance.enabledParents = Array.from(new Set([
      ...previousEnabled.filter((tag) => validParents.has(tag)),
      ...newlyPromotedParents,
    ]));
    inheritance.modeByParentChild = this.cloneParentChildSettings(previousModes);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExclusions);
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.fixedParentByChild = { ...previousFixedParents };
    if (parents.length === 0) delete inheritance.fixedParentByChild[child];
    this.reconcileInheritancePathLists(affectedParents);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.childrenByParent = previousChildren;
      inheritance.enabledParents = previousEnabled;
      inheritance.modeByParentChild = previousModes;
      inheritance.excludedPathsByParentChild = previousExclusions;
      inheritance.includedPathsByParentChild = previousIncluded;
      inheritance.fixedParentByChild = previousFixedParents;
      throw error;
    }
    this.refreshHierarchyViews();
  }

  async setFixedTagRelation(parentValue, childValue, fixed) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child) throw new Error('标签无效');
    if (fixed && !this.isFixedTagRelationEligible(parent, child)) {
      throw new Error('固定子标签必须符合“父标签-子名称”格式，并且只能有一个父标签');
    }
    const inheritance = this.getTagInheritanceSettings();
    const previousFixedParents = inheritance.fixedParentByChild;
    const previousModes = inheritance.modeByParentChild;
    const previousExclusions = inheritance.excludedPathsByParentChild;
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousPinnedTag = this.settings.pinnedTag;
    const nextFixedParents = { ...previousFixedParents };
    if (fixed) nextFixedParents[child] = parent;
    else delete nextFixedParents[child];
    inheritance.fixedParentByChild = nextFixedParents;
    inheritance.modeByParentChild = this.cloneParentChildSettings(previousModes);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExclusions);
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    if (fixed) {
      this.setParentChildValue(inheritance.modeByParentChild, parent, child, undefined);
      this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, undefined);
      this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, undefined);
    }
    this.reconcileInheritancePathLists([parent]);
    if (fixed && this.settings.pinnedTag === child) this.settings.pinnedTag = null;
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.fixedParentByChild = previousFixedParents;
      inheritance.modeByParentChild = previousModes;
      inheritance.excludedPathsByParentChild = previousExclusions;
      inheritance.includedPathsByParentChild = previousIncluded;
      this.settings.pinnedTag = previousPinnedTag;
      throw error;
    }
    this.refreshHierarchyViews();
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
    if (!tag) return { tag: null, files: [], exactFiles: [], inheritedFiles: [], sourcesByPath: new Map(), inheritanceTree: null };
    const branchData = this.getInheritanceBranchData(tag);
    const { exactFiles, exactPaths, orderedBranches, orderedPathsByTag, fixedTags, adjacency } = branchData;
    const seen = new Set(exactPaths);
    const inheritedPaths = [];
    const sourcesByPath = new Map();
    const fixedPaths = new Set();
    for (const branch of orderedBranches) {
      for (const path of branch.paths || []) {
        if (!path) continue;
        const sources = sourcesByPath.get(path) || [];
        if (!sources.includes(branch.source)) sources.push(branch.source);
        sourcesByPath.set(path, sources);
        if (branch.fixed) fixedPaths.add(path);
        if (!this.isInheritancePathVisible(branch.edges, path)) continue;
        if (seen.has(path)) continue;
        seen.add(path);
        inheritedPaths.push(path);
      }
    }
    const indexedFilesByPath = this.app?.vault ? null : new Map(
      Array.from(this.tagFileIndex.values()).flat().map((file) => [file.path, file])
    );
    const inheritedFiles = inheritedPaths
      .map((path) => this.app?.vault?.getAbstractFileByPath(path) || indexedFilesByPath?.get(path))
      .filter((file) => file instanceof TFile && file.extension === 'md');
    const hasActiveInheritance = !!(adjacency[tag] || []).length;
    const inheritanceTree = hasActiveInheritance
      ? buildTagInheritanceGroupTree(
        tag,
        adjacency,
        orderedPathsByTag,
        [],
        fixedTags,
        null,
        (_sourceTag, path, lineage) => this.isInheritancePathVisible(
          this.createInheritanceEdgesFromLineage(lineage),
          path
        )
      )
      : null;
    return {
      tag,
      exactFiles,
      inheritedFiles,
      files: exactFiles.concat(inheritedFiles),
      sourcesByPath,
      inheritanceTree,
      exactCount: exactFiles.length,
      inheritedCount: inheritedFiles.length,
      inheritanceEnabled: this.isTagInheritanceEnabled(tag),
      hasInheritance: this.hasInheritanceChildren(tag),
      hasFreeInheritance: this.hasFreeInheritanceBranch(tag),
      hasActiveInheritance,
      fixedTags,
      fixedPaths,
    };
  }

  isInheritedFileForTag(tagValue, path) {
    return this.getTagBrowseData(tagValue).inheritedFiles.some((file) => file.path === path);
  }

  getInheritedFileSources(tagValue, path) {
    return this.getTagBrowseData(tagValue).sourcesByPath.get(path) || [];
  }

  isFixedInheritedFileForTag(tagValue, path) {
    const browseData = this.getTagBrowseData(tagValue);
    return browseData.fixedPaths?.has(path) || false;
  }

  async excludeInheritedFile(parentValue, path, allowGroupedInheritance = false) {
    const parent = normalizeTag(parentValue);
    if (!parent || !path || (!allowGroupedInheritance && !this.isInheritedFileForTag(parent, path))) return;
    if (this.isFixedInheritedFileForTag(parent, path)) return;
    await this.setInheritedFileVisible(parent, path, false);
  }

  async restoreInheritedFile(parentValue, path, childValue = null) {
    const parent = normalizeTag(parentValue);
    if (!parent || !path) return;
    if (childValue) await this.setInheritedFileVisibleForEdge(parent, childValue, path, true);
    else await this.setInheritedFileVisible(parent, path, true);
  }

  migrateTagRelations(oldTagValue, newTagValue) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);
    if (!oldTag || !newTag || oldTag === newTag) return;
    const inheritance = this.getTagInheritanceSettings();
    const oldChildren = inheritance.childrenByParent[oldTag] || [];
    const newChildren = inheritance.childrenByParent[newTag] || [];
    const participatesInInheritance = !!(
      oldChildren.length ||
      Object.values(inheritance.childrenByParent).some((children) => children.includes(oldTag)) ||
      inheritance.enabledParents.includes(oldTag) ||
      inheritance.excludedPathsByParentChild[oldTag] ||
      inheritance.modeByParentChild[oldTag] ||
      inheritance.includedPathsByParentChild[oldTag] ||
      [inheritance.excludedPathsByParentChild, inheritance.modeByParentChild, inheritance.includedPathsByParentChild]
        .some((parents) => Object.values(parents).some((children) => Object.prototype.hasOwnProperty.call(children, oldTag))) ||
      inheritance.fixedParentByChild[oldTag] ||
      Object.values(inheritance.fixedParentByChild).includes(oldTag)
    );
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
    for (const key of ['modeByParentChild', 'excludedPathsByParentChild', 'includedPathsByParentChild']) {
      const migrated = {};
      for (const [storedParent, children] of Object.entries(inheritance[key] || {})) {
        const parent = storedParent === oldTag ? newTag : storedParent;
        for (const [storedChild, value] of Object.entries(children || {})) {
          const child = storedChild === oldTag ? newTag : storedChild;
          if (parent === child) continue;
          const existing = migrated[parent]?.[child];
          const merged = Array.isArray(value)
            ? Array.from(new Set([...(Array.isArray(existing) ? existing : []), ...value]))
            : (existing === 'selected' || value === 'selected' ? 'selected' : value);
          this.setParentChildValue(migrated, parent, child, merged);
        }
      }
      inheritance[key] = migrated;
    }
    const migratedFixedParents = {};
    for (const [child, parent] of Object.entries(inheritance.fixedParentByChild || {})) {
      const migratedChild = child === oldTag ? newTag : child;
      const migratedParent = parent === oldTag ? newTag : parent;
      migratedFixedParents[migratedChild] = migratedParent;
    }
    inheritance.fixedParentByChild = migratedFixedParents;
    this.reconcileRelationCycles();
    this.migrateInlineTagBranchState(oldTag, newTag);
    if (participatesInInheritance) {
      this.relationStructureVersion = (this.relationStructureVersion || 0) + 1;
    }
    return participatesInInheritance;
  }

  handleRelationFileRename(file, oldPath) {
    if (!(file instanceof TFile) || file.extension !== 'md' || !oldPath || !file.path) return;
    const inheritance = this.getTagInheritanceSettings();
    let changed = false;
    for (const key of ['excludedPathsByParentChild', 'includedPathsByParentChild']) {
      for (const children of Object.values(inheritance[key])) {
        for (const [child, paths] of Object.entries(children)) {
          if (!paths.includes(oldPath)) continue;
          children[child] = Array.from(new Set(paths.map((path) => path === oldPath ? file.path : path)));
          changed = true;
        }
      }
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
    for (const key of ['excludedPathsByParentChild', 'includedPathsByParentChild']) {
      for (const [parent, children] of Object.entries(inheritance[key])) {
        for (const [child, paths] of Object.entries(children)) {
          const nextPaths = paths.filter((path) => path !== file.path);
          if (nextPaths.length === paths.length) continue;
          this.setParentChildValue(inheritance[key], parent, child, nextPaths.length ? nextPaths : undefined);
          changed = true;
        }
      }
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

  getTagBoundNotePath(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag || !this.settings.tagBoundNoteByTag) return null;
    const path = this.settings.tagBoundNoteByTag[tag];
    if (typeof path !== 'string' || !path) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile && file.extension === 'md' ? path : null;
  }

  getTagBoundNoteFile(tagValue) {
    const path = this.getTagBoundNotePath(tagValue);
    if (!path) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile && file.extension === 'md' ? file : null;
  }

  async setTagBoundNote(tagValue, pathValue) {
    const tag = normalizeTag(tagValue);
    if (!tag || !this.tagFileIndex.has(tag)) throw new Error('标签已不存在');
    const path = typeof pathValue === 'string' ? pathValue.trim() : '';
    if (!this.settings.tagBoundNoteByTag || typeof this.settings.tagBoundNoteByTag !== 'object') {
      this.settings.tagBoundNoteByTag = {};
    }
    if (!path) {
      delete this.settings.tagBoundNoteByTag[tag];
      await this.saveSettings();
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== 'md') throw new Error('所选笔记已不存在');
    this.settings.tagBoundNoteByTag[tag] = file.path;
    await this.saveSettings();
  }

  migrateTagBoundNote(oldTagValue, newTagValue) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);
    const bindings = this.settings.tagBoundNoteByTag;
    if (!oldTag || !newTag || oldTag === newTag || !bindings || !bindings[oldTag]) return false;
    if (!bindings[newTag]) bindings[newTag] = bindings[oldTag];
    delete bindings[oldTag];
    return true;
  }

  reconcileTagBoundNotes(nextIndex) {
    const current = this.settings.tagBoundNoteByTag || {};
    const next = {};
    for (const [tag, path] of Object.entries(current)) {
      if (!nextIndex.has(tag)) continue;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || file.extension !== 'md') continue;
      next[tag] = file.path;
    }
    const changed = JSON.stringify(next) !== JSON.stringify(current);
    if (changed) this.settings.tagBoundNoteByTag = next;
    return changed;
  }

  handleTagBoundNoteFileRename(file, oldPath) {
    if (!(file instanceof TFile) || file.extension !== 'md' || !oldPath || !file.path) return;
    const bindings = this.settings.tagBoundNoteByTag || {};
    let changed = false;
    for (const [tag, path] of Object.entries(bindings)) {
      if (path !== oldPath) continue;
      bindings[tag] = file.path;
      changed = true;
    }
    if (changed) this.saveSettings();
  }

  handleTagBoundNoteFileDelete(file) {
    if (!(file instanceof TFile) || file.extension !== 'md' || !file.path) return;
    const bindings = this.settings.tagBoundNoteByTag || {};
    let changed = false;
    for (const [tag, path] of Object.entries(bindings)) {
      if (path !== file.path) continue;
      delete bindings[tag];
      changed = true;
    }
    if (changed) this.saveSettings();
  }

  showTagContextMenu(event, tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return false;
    const menu = new Menu();
    menu.addItem((item) => item.setTitle('修改标签').setIcon('pencil').onClick(() => this.openRenameTagModal(tag)));
    menu.addItem((item) => item.setTitle('管理父标签').setIcon('corner-left-up').onClick(() => {
      new ManageParentTagModal(this.app, this, tag).open();
    }));
    menu.addItem((item) => item.setTitle('管理子标签').setIcon('git-fork').onClick(() => {
      new TagInheritanceModal(this.app, this, tag).open();
    }));
    menu.addSeparator();
    const boundFile = this.getTagBoundNoteFile(tag);
    if (boundFile) {
      menu.addItem((item) => item.setTitle('打开笔记').setIcon('file-text').onClick(() => {
        this.openFileInMainWorkspace(boundFile);
      }));
      menu.addItem((item) => item.setTitle('换绑笔记').setIcon('replace').onClick(() => {
        new TagNoteBindingModal(this.app, this, tag).open();
      }));
    } else {
      menu.addItem((item) => item.setTitle('绑定笔记').setIcon('link').onClick(() => {
        new TagNoteBindingModal(this.app, this, tag).open();
      }));
    }
    menu.showAtMouseEvent(event);
    return true;
  }

  showInheritedNoteMenu(event, tagValue, path) {
    const tag = normalizeTag(tagValue);
    if (!tag || !path || !this.isInheritedFileForTag(tag, path) || this.isFixedInheritedFileForTag(tag, path)) return false;
    const menu = new Menu();
    menu.addItem((item) => item
      .setTitle(this.getInheritedFileRemovalTitle(tag))
      .setIcon('eye-off')
      .onClick(() => this.setInheritedFileVisible(tag, path, false).catch((error) => {
        console.error('[Puffs Tag Enhance] Failed to exclude inherited note:', error);
        new Notice('排除继承笔记失败');
      })));
    menu.showAtMouseEvent(event);
    return true;
  }
}
