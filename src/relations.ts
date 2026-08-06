// @ts-nocheck
import { TFile } from "obsidian";
import {
  DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD,
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







  refreshHierarchyViews() {
    this.relationStructureVersion = (this.relationStructureVersion || 0) + 1;
    this.refreshAllTagViews();
  }

  getHierarchyNavigationHistory(view, surface) {
    // 现在只有自绘侧边栏一种界面，历史直接挂在视图上
    if (!view.hierarchyNavigationHistory) {
      view.hierarchyNavigationHistory = createHierarchyNavigationHistory();
    }
    return view.hierarchyNavigationHistory;
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
    for (const leaf of this.app.workspace.getLeavesOfType('tag')) {
      const view = leaf.view;
      if (!view || !view.containerEl || !view.containerEl.contains(sourceEl)) continue;
      this.pushHierarchyNavigationForView(view, 'sidebar', query);
      return;
    }
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
        // 这里只按"路径是否仍是自由候选"过滤，不按当前模式丢弃另一侧名单：
        // v4 数据迁移会有意同时搬迁两侧（见 relations-behavior.test.ts 的 v4 迁移用例），
        // 按模式清理会破坏那条契约。真正的死数据来源已在 setTagInheritanceMode 处堵住。
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

  collectVisiblePathsForEdge(parent, child) {
    const mode = this.getTagInheritanceMode(parent, child);
    const freeCandidates = this.getInheritanceCandidates(parent, child).filter((candidate) => !candidate.fixed);
    if (mode === 'selected') {
      const included = new Set(this.getIncludedInheritedPaths(parent, child));
      return new Set(freeCandidates.filter((candidate) => included.has(candidate.path)).map((candidate) => candidate.path));
    }
    const excluded = new Set(this.getExcludedInheritedPaths(parent, child));
    return new Set(freeCandidates.filter((candidate) => !excluded.has(candidate.path)).map((candidate) => candidate.path));
  }

  propagateNewlyAllowedPathsToAncestors(childTagValue, newlyAllowedPaths) {
    const startTag = normalizeTag(childTagValue);
    const paths = Array.from(new Set((newlyAllowedPaths || [])
      .map((path) => typeof path === 'string' ? path.trim() : '')
      .filter(Boolean)));
    if (!startTag || !paths.length) return;
    const inheritance = this.getTagInheritanceSettings();
    const visited = new Set([startTag]);
    const queue = [startTag];
    while (queue.length) {
      const child = queue.shift();
      for (const parent of this.getInheritanceParents(child)) {
        if (!this.isFixedTagEdge(parent, child)) {
          if (this.getTagInheritanceMode(parent, child) === 'selected') {
            const included = new Set(this.getIncludedInheritedPaths(parent, child));
            for (const path of paths) included.add(path);
            this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, Array.from(included));
          } else {
            const excluded = new Set(this.getExcludedInheritedPaths(parent, child));
            for (const path of paths) excluded.delete(path);
            this.setParentChildValue(
              inheritance.excludedPathsByParentChild,
              parent,
              child,
              excluded.size ? Array.from(excluded) : undefined
            );
          }
        }
        if (visited.has(parent)) continue;
        visited.add(parent);
        queue.push(parent);
      }
    }
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
    // 切换模式时按"保持当前可见集合"重算目标侧名单，并清掉另一侧 ——
    // 另一侧在新模式下不再被读取（见 isInheritanceEdgePathVisible），留着就是死数据，
    // 且会在日后切回时冒出陈旧的放行/排除记录。
    if (mode === 'selected') {
      this.setParentChildValue(inheritance.modeByParentChild, parent, child, 'selected');
      const paths = freeCandidates.filter((candidate) => currentVisible.has(candidate.path)).map((candidate) => candidate.path);
      this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, paths.length ? paths : undefined);
      this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, undefined);
    } else {
      this.setParentChildValue(inheritance.modeByParentChild, parent, child, undefined);
      const paths = freeCandidates.filter((candidate) => !currentVisible.has(candidate.path)).map((candidate) => candidate.path);
      this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, paths.length ? paths : undefined);
      this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, undefined);
    }
    this.propagateNewlyAllowedPathsToAncestors(
      parent,
      Array.from(this.collectVisiblePathsForEdge(parent, child)).filter((path) => !currentVisible.has(path))
    );
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
    const previouslyVisible = this.collectVisiblePathsForEdge(parent, child);
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, paths.length ? paths : undefined);
    this.propagateNewlyAllowedPathsToAncestors(parent, paths.filter((path) => !previouslyVisible.has(path)));
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
    const wasVisible = this.collectVisiblePathsForEdge(parent, child).has(path);
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    this.applyInheritedFileVisibilityToEdge(parent, child, path, visible);
    if (visible && !wasVisible) this.propagateNewlyAllowedPathsToAncestors(parent, [path]);
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
    this.refreshAllTagViews();
  }

  /**
   * 标签浏览数据。计算涉及继承分支遍历与继承树构建，开销不小，而一次渲染中
   * 同一标签会被 renderListMode、updateListModeExpandAllButton、toggleAllListModeTags
   * 各自问一遍（150 标签实测 450–600 次）。这里走批次缓存，失效点见 data/tag-store.ts。
   */
  getTagBrowseData(tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return this.computeTagBrowseData(tagValue);
    if (!this.tagBrowseCache) return this.computeTagBrowseData(tagValue);
    return this.tagBrowseCache.resolve(tag, () => this.computeTagBrowseData(tagValue));
  }

  computeTagBrowseData(tagValue) {
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


}
