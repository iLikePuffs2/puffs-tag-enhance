import { Notice, TFile } from "obsidian";
// 继承规则的纯计算已迁入 core/inheritance.ts，这里保留同名方法作为薄委托
import * as core from "./core/inheritance";
import {
  DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD,
  TAG_SIDEBAR_VIEW_TYPE,
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

const createEmptyRelations = (): any => ({
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
      for (const [rawParent, rawValues] of Object.entries<any>(rawChildren)) {
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
      enabledParents.map(normalizeTag).filter((tag: any) => tag && !isNestedTag(tag))
    ));

    const normalizePaths = (rawPaths: any) => Array.from(new Set((Array.isArray(rawPaths) ? rawPaths : [])
      .map((path: any) => typeof path === 'string' ? path.trim() : '')
      .filter(Boolean)));
    const copyParentChildPaths = (targetKey: any, sourceKey: any) => {
      const rawParents = inheritance[sourceKey];
      if (!rawParents || typeof rawParents !== 'object' || Array.isArray(rawParents)) return;
      for (const [rawParent, rawChildren] of Object.entries<any>(rawParents)) {
        const parent = normalizeTag(rawParent);
        if (!parent || isNestedTag(parent) || !rawChildren || typeof rawChildren !== 'object' || Array.isArray(rawChildren)) continue;
        for (const [rawChild, rawPaths] of Object.entries<any>(rawChildren)) {
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
        for (const [rawParent, rawChildren] of Object.entries<any>(rawModes)) {
          const parent = normalizeTag(rawParent);
          if (!parent || !rawChildren || typeof rawChildren !== 'object' || Array.isArray(rawChildren)) continue;
          for (const [rawChild, rawMode] of Object.entries<any>(rawChildren)) {
            const child = normalizeTag(rawChild);
            if (rawMode !== 'selected' || !(result.tagInheritance.childrenByParent[parent] || []).includes(child)) continue;
            if (!result.tagInheritance.modeByParentChild[parent]) result.tagInheritance.modeByParentChild[parent] = {};
            result.tagInheritance.modeByParentChild[parent][child as any] = 'selected';
          }
        }
      }
    } else {
      const rawExclusions = inheritance.excludedPathsByParent || {};
      const rawIncluded = inheritance.includedPathsByParent || {};
      const rawModes = inheritance.modeByParent || {};
      for (const [parent, children] of Object.entries<any>(result.tagInheritance.childrenByParent)) {
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
            result.tagInheritance.modeByParentChild[parent][child as any] = 'selected';
          }
        }
      }
    }

    const rawFixedParents = inheritance.fixedParentByChild;
    if (rawFixedParents && typeof rawFixedParents === 'object' && !Array.isArray(rawFixedParents)) {
      for (const [rawChild, rawParent] of Object.entries<any>(rawFixedParents)) {
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
      const rawObject: any = hierarchy[key];
      if (!rawObject || typeof rawObject !== 'object' || Array.isArray(rawObject)) continue;
      result.noteHierarchy[key] = {};
      for (const [rawParentPath, rawEntries] of Object.entries<any>(rawObject)) {
        const parentPath = typeof rawParentPath === 'string' ? rawParentPath.trim() : '';
        if (!parentPath || !rawEntries || typeof rawEntries !== 'object') continue;
        if (key === 'childrenByParentPath') {
          if (!Array.isArray(rawEntries)) continue;
          const children = Array.from(new Set(rawEntries
            .map((path: any) => typeof path === 'string' ? path.trim() : '')
            .filter((path: any) => path && path !== parentPath)));
          if (children.length > 0) result.noteHierarchy[key][parentPath] = children;
        } else if (!Array.isArray(rawEntries)) {
          const entries: any = {};
          for (const [rawPath, rawDisplayName] of Object.entries<any>(rawEntries)) {
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

  parseFixedChildTag(tagValue: any) {
    return core.parseFixedChildTag(tagValue);
  }

  isFixedTagRelationEligible(parentValue: any, childValue: any) {
    return core.isFixedTagRelationEligible(this.getTagInheritanceSettings(), parentValue, childValue);
  }

  getFixedParent(childValue: any) {
    return core.getFixedParent(this.getTagInheritanceSettings(), childValue);
  }

  isFixedChild(tagValue: any) {
    return core.isFixedChild(this.getTagInheritanceSettings(), tagValue);
  }

  isFixedTagEdge(parentValue: any, childValue: any) {
    return core.isFixedTagEdge(this.getTagInheritanceSettings(), parentValue, childValue);
  }

  getFixedChildDisplayName(tagValue: any) {
    return core.getFixedChildDisplayName(tagValue);
  }

  getTopLevelFixedParent(tagValue: any) {
    return core.getTopLevelFixedParent(this.getTagInheritanceSettings(), tagValue);
  }

  filterInheritanceTreeByTags(tree: any, includedTags: any) {
    if (!tree) return null;
    const allowed = new Set(Array.from(includedTags || []).map(normalizeTag).filter(Boolean));
    const visit = (node: any, isRoot = false) => {
      const children = (node.children || []).map((child: any) => visit(child)).filter(Boolean);
      if (!isRoot && !allowed.has(node.tag) && children.length === 0) return null;
      const paths = isRoot || !allowed.has(node.tag) ? [] : [...node.paths];
      const subtreePaths = Array.from(new Set([
        ...paths,
        ...children.flatMap((child: any) => child.subtreePaths),
      ]));
      return { ...node, paths, children, subtreePaths };
    };
    return visit(tree, true);
  }

  createFixedSearchBrowseData(tagValue: any, includedTags: any) {
    const browseData = this.getTagBrowseData(tagValue);
    const inheritanceTree = this.filterInheritanceTreeByTags(browseData.inheritanceTree, includedTags);
    const paths = inheritanceTree?.subtreePaths || [];
    const files = paths
      .map((path: any) => this.app.vault.getAbstractFileByPath(path))
      .filter((file: any) => file instanceof TFile && file.extension === 'md');
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
    const next: any = {};
    for (const [rawChild, rawParent] of Object.entries<any>(previous)) {
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

  getHierarchyChildren(parentPath: any) {
    return [...(this.getNoteHierarchySettings().childrenByParentPath[parentPath] || [])];
  }

  getHierarchyParents(childPath: any) {
    return Object.entries<any>(this.getNoteHierarchySettings().childrenByParentPath)
      .filter(([, children]) => Array.isArray(children) && children.includes(childPath))
      .map(([parentPath]) => parentPath);
  }

  getHierarchyDescendants(parentPath: any) {
    return collectDirectedDescendants(this.getNoteHierarchySettings().childrenByParentPath, parentPath);
  }

  wouldCreateNoteHierarchyCycle(parentPath: any, childPath: any) {
    return wouldCreateDirectedCycle(
      this.getNoteHierarchySettings().childrenByParentPath,
      parentPath,
      childPath
    );
  }

  async addNoteHierarchyEdge(parentPath: any, childPath: any) {
    return this.addNoteHierarchyEdges(
      [{ path: parentPath, displayName: '' }],
      [{ path: childPath, displayName: '' }]
    );
  }

  async addNoteHierarchyEdges(parentSelections: any, childSelections: any) {
    const parents = Array.from<any>(new Map((parentSelections || []).map((item: any) => [item.path, item])).values());
    const children = Array.from<any>(new Map((childSelections || []).map((item: any) => [item.path, item])).values());
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
    const stagedChildren: any = Object.fromEntries(Object.entries<any>(hierarchy.childrenByParentPath)
      .map(([path, values]) => [path, [...values]]));
    const stagedDisplayNames: any = Object.fromEntries(Object.entries<any>(hierarchy.displayNamesByParentPath)
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

  async removeNoteHierarchyEdge(parentPath: any, childPath: any) {
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

  async moveHierarchyChild(parentPath: any, childPath: any, direction: any) {
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

  async moveSelectedHierarchyNoteAfter(parentPath: any, targetPath: any) {
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

  getHierarchyDisplayName(parentPath: any, file: any) {
    if (!(file instanceof TFile)) return '';
    const selected = this.getNoteHierarchySettings().displayNamesByParentPath[parentPath] &&
      this.getNoteHierarchySettings().displayNamesByParentPath[parentPath][file.path];
    return selected && this.getNoteAliases(file).includes(selected) ? selected : file.basename;
  }

  async setHierarchyDisplayName(parentPath: any, file: any, displayName: any) {
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

  createHierarchyParentItem(parentPath: any, matchingPaths: any[] = [], forceExpand = false) {
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
      for (const [parentPath, childPaths] of Object.entries<any>(hierarchy.childrenByParentPath)) {
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

  getHierarchySearchContext(value: any) {
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
    for (const [parentPath, children] of Object.entries<any>(this.getNoteHierarchySettings().childrenByParentPath)) {
      const parentFile = this.app.vault.getAbstractFileByPath(parentPath);
      if (!(parentFile instanceof TFile) || parentFile.extension !== 'md') continue;
      for (const childPath of Array.isArray(children) ? children : []) {
        const childFile = this.app.vault.getAbstractFileByPath(childPath);
        if (childFile instanceof TFile && childFile.extension === 'md') count += 1;
      }
    }
    return count;
  }

  getInlineHierarchyBranchKey(tagValue: any, path: any) {
    return `${String(tagValue || '')}\u0000${path}`;
  }

  toggleInlineHierarchyBranch(branchKey: any) {
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

  clearInlineHierarchyBranchState(tagValue: any) {
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

  migrateInlineTagBranchState(oldTagValue: any, newTagValue: any) {
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

  getInlineHierarchyDisplayName(tag: any, parentPath: any, file: any, isVirtual = false) {
    if (tag && !isVirtual && !isNestedTag(tag)) {
      const selected = this.settings.noteDisplayNameByTag?.[tag]?.[file.path];
      if (selected && this.getNoteAliases(file).includes(selected)) return selected;
    }
    if (parentPath) return this.getHierarchyDisplayName(parentPath, file);
    return this.getNoteDisplayName(tag, file, isVirtual);
  }

  hierarchyBranchContains(childrenByParent: any, parentPath: any, targetPath: any, seen = new Set()) {
    if (!parentPath || seen.has(parentPath)) return false;
    seen.add(parentPath);
    for (const childPath of childrenByParent[parentPath] || []) {
      if (childPath === targetPath) return true;
      if (this.hierarchyBranchContains(childrenByParent, childPath, targetPath, seen)) return true;
    }
    return false;
  }




  resetHierarchyExpansionState(state: any) {
    if (!state) return;
    state.allExpanded = true;
    state.expandedParents.clear();
    state.expandedBranches.clear();
    state.collapsedParents?.clear();
    state.collapsedBranches?.clear();
  }

  toggleHierarchyGroup(state: any) {
    if (!state) return false;
    state.groupExpanded = state.groupExpanded === false;
    this.resetHierarchyExpansionState(state);
    return state.groupExpanded;
  }

  toggleAllHierarchyItems(state: any) {
    state.allExpanded = !state.allExpanded;
    state.expandedParents.clear();
    state.expandedBranches.clear();
    state.collapsedParents?.clear();
    state.collapsedBranches?.clear();
    if (typeof state.renderList === 'function') state.renderList();
    return state.allExpanded;
  }

  isHierarchyItemExpanded(state: any, key: any, kind: any, forceExpanded = false) {
    if (forceExpanded) return true;
    const expandedSet = kind === 'parent' ? state.expandedParents : state.expandedBranches;
    const collapsedSet = kind === 'parent'
      ? (state.collapsedParents ||= new Set())
      : (state.collapsedBranches ||= new Set());
    return state.allExpanded ? !collapsedSet.has(key) : expandedSet.has(key);
  }

  toggleHierarchyItemExpansion(state: any, key: any, kind: any) {
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

  getHierarchyNavigationHistory(view: any, surface: any) {
    // 现在只有自绘侧边栏一种界面，历史直接挂在视图上
    if (!view.hierarchyNavigationHistory) {
      view.hierarchyNavigationHistory = createHierarchyNavigationHistory();
    }
    return view.hierarchyNavigationHistory;
  }



  navigateHierarchyHistory(view: any, surface: any, direction: any) {
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

  pushHierarchyNavigationForView(view: any, surface: any, query: any) {
    const history = this.getHierarchyNavigationHistory(view, surface);
    const target = pushHierarchyNavigation(
      history,
      this.captureHierarchyNavigationSnapshot(view, surface),
      { query, scrollTop: 0 }
    );
    this.applyHierarchyNavigationSnapshot(view, surface, target);
  }

  openHierarchyForNote(path: any, sourceEl: any) {
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
    // 自绘侧边栏解耦后视图类型已不是核心标签面板的 'tag'，用 'tag' 找永远匹配不到、静默失败
    for (const leaf of this.app.workspace.getLeavesOfType(TAG_SIDEBAR_VIEW_TYPE)) {
      const view = leaf.view;
      if (!view || !view.containerEl || !view.containerEl.contains(sourceEl)) continue;
      this.pushHierarchyNavigationForView(view, 'sidebar', query);
      return;
    }
    new Notice('未找到标签侧边栏，无法定位父子关系');
  }


  getInheritanceChildren(tagValue: any) {
    return core.getInheritanceChildren(this.getTagInheritanceSettings(), tagValue);
  }

  initializeTagInheritanceOrder() {
    const relations = this.settings.relations;
    if (!relations || Number(relations.version) >= 6) return false;

    const inheritance = this.getTagInheritanceSettings();
    if (Number(relations.version) < 2) {
      const nextChildrenByParent: any = {};
      for (const [parent, children] of Object.entries<any>(inheritance.childrenByParent)) {
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

  getTagVisibleNoteCount(tagValue: any) {
    const tag = normalizeTag(tagValue);
    if (!tag) return 0;
    return this.getTagBrowseData(tag).files.length;
  }

  compareTagsByVisibleCount(leftValue: any, rightValue: any) {
    const left = normalizeTag(leftValue) || '';
    const right = normalizeTag(rightValue) || '';
    return compareTagItemsByCount(
      { count: this.getTagVisibleNoteCount(left), name: getTagDisplayName(left) },
      { count: this.getTagVisibleNoteCount(right), name: getTagDisplayName(right) }
    );
  }

  sortTagsByVisibleCount(tagValues: any) {
    return Array.from(new Set((tagValues || []).map(normalizeTag).filter(Boolean)))
      .sort((left, right) => this.compareTagsByVisibleCount(left, right));
  }

  getSortedTagInheritanceAdjacency() {
    return core.getSortedTagInheritanceAdjacency(this.getTagInheritanceSettings());
  }

  getFixedTagInheritanceAdjacency() {
    return core.getFixedTagInheritanceAdjacency(this.getTagInheritanceSettings());
  }

  getActiveTagInheritanceAdjacency(tagValue: any) {
    return this.isTagInheritanceEnabled(tagValue)
      ? this.getSortedTagInheritanceAdjacency()
      : this.getFixedTagInheritanceAdjacency();
  }

  hasFreeInheritanceBranch(tagValue: any) {
    const root = normalizeTag(tagValue);
    if (!root) return false;
    const adjacency = this.getSortedTagInheritanceAdjacency();
    const visit = (parent: any, branch: any) => {
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

  getInheritanceParents(tagValue: any) {
    return core.getInheritanceParents(this.getTagInheritanceSettings(), tagValue);
  }

  getTagInheritanceGroupKeys(tagValue: any) {
    const tag = normalizeTag(tagValue);
    const browseData = tag && this.getTagBrowseData(tag);
    const tree = (browseData?.hasActiveInheritance ?? browseData?.inheritanceEnabled)
      ? browseData.inheritanceTree
      : null;
    if (!tree || !tree.children.length) return [];
    const keys = [];
    const prefix = `${tag}\u0000tag-group\u0000`;
    if (tree.paths.length) keys.push(`${prefix}original`);
    const visit = (node: any, lineage: any) => {
      const key = `${prefix}${lineage.join('\u0001')}`;
      keys.push(key);
      if (node.children.length && node.paths.length) keys.push(`${key}\u0000original`);
      for (const child of node.children) visit(child, [...lineage, child.tag]);
    };
    for (const child of tree.children) visit(child, [child.tag]);
    return keys;
  }

  getUniqueSearchInheritanceControl(
    items: any,
    queryValue: any,
    expandedTags = this.expandedTags,
    matchingItems = items
  ) {
    const query = String(queryValue || '').trim();
    if (query ? matchingItems.length !== 1 : !this.isPinnedOnlyTagResult(queryValue, items)) return null;
    const tags = Array.from(new Set(items.map((item: any) => item.tag)));
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

  setAllTagInheritanceGroupsExpanded(keys: any, expanded: any) {
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
    for (const [parent, children] of Object.entries<any>(this.getTagInheritanceSettings().childrenByParent)) {
      result.add(parent);
      for (const child of children) result.add(child);
    }
    return result;
  }

  hasInheritanceChildren(tagValue: any) {
    return core.hasInheritanceChildren(this.getTagInheritanceSettings(), tagValue);
  }

  isTagInheritanceEnabled(tagValue: any) {
    return core.isTagInheritanceEnabled(this.getTagInheritanceSettings(), tagValue);
  }

  getTagInheritanceMode(parentValue: any, childValue: any) {
    return core.getTagInheritanceMode(this.getTagInheritanceSettings(), parentValue, childValue);
  }

  getIncludedInheritedPaths(parentValue: any, childValue: any) {
    return core.getIncludedInheritedPaths(this.getTagInheritanceSettings(), parentValue, childValue);
  }

  getExcludedInheritedPaths(parentValue: any, childValue: any) {
    return core.getExcludedInheritedPaths(this.getTagInheritanceSettings(), parentValue, childValue);
  }

  setParentChildValue(target: any, parent: any, child: any, value: any) {
    return core.setParentChildValue(target, parent, child, value);
  }

  cloneParentChildSettings(source: any) {
    return core.cloneParentChildSettings(source);
  }

  isInheritanceEdgePathVisible(parentValue: any, childValue: any, path: any) {
    return core.isInheritanceEdgePathVisible(this.getTagInheritanceSettings(), parentValue, childValue, path);
  }

  isInheritancePathVisible(edges: any, path: any, ignoredEdge = null) {
    return core.isInheritancePathVisible(this.getTagInheritanceSettings(), edges, path, ignoredEdge);
  }

  createInheritanceEdgesFromLineage(lineage: any) {
    return core.createInheritanceEdgesFromLineage(this.getTagInheritanceSettings(), lineage);
  }

  getInheritanceBranchData(tagValue: any, childValue = null, includeInactive = false) {
    const tag = normalizeTag(tagValue);
    const requestedChild = normalizeTag(childValue);
    if (!tag) return null;
    const tagFileIndex = this.tagFileIndex || new Map();
    const directFiles = tagFileIndex.get(tag) || [];
    const exactFiles = typeof this.getOrderedFilesForTag === 'function'
      ? this.getOrderedFilesForTag(tag, directFiles)
      : directFiles;
    const exactPaths = exactFiles.map((file: any) => file.path);
    const orderedBranches: any[] = [];
    const orderedPathsByTag = { [tag]: exactPaths };
    const fixedTags = new Set();
    const adjacency = includeInactive
      ? this.getSortedTagInheritanceAdjacency()
      : this.getActiveTagInheritanceAdjacency(tag);
    const visit = (sourceTag: any, edges: any, branch = new Set([tag])) => {
      if (branch.has(sourceTag)) return;
      const nextBranch = new Set(branch);
      nextBranch.add(sourceTag);
      const paths = (typeof this.getOrderedFilesForTag === 'function'
        ? this.getOrderedFilesForTag(sourceTag, tagFileIndex.get(sourceTag) || [])
        : tagFileIndex.get(sourceTag) || []).map((file: any) => file.path);
      const fixed = edges.length > 0 && edges.every((edge: any) => edge.fixed);
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

  getInheritanceCandidates(parentValue: any, childValue: any) {
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
            Array.from<any>((this.tagFileIndex || new Map()).values()).flat().find((item: any) => item.path === path) || null;
          candidate = { path, file, source: branch.source, sources: [], fixed: false };
          candidatesByPath.set(path, candidate);
        }
        if (!candidate.sources.includes(branch.source)) candidate.sources.push(branch.source);
        candidate.fixed = candidate.fixed || !!branch.fixed;
      }
    }
    return Array.from(candidatesByPath.values());
  }

  reconcileInheritancePathLists(parentValues: any = null) {
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
    const reconcileParent = (parent: any) => {
      if (!parent || visited.has(parent) || !parents.has(parent)) return;
      visited.add(parent);
      for (const child of inheritance.childrenByParent[parent] || []) reconcileParent(child);
      const children = new Set<any>(inheritance.childrenByParent[parent] || []);
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
          const nextPaths = (inheritance[key][parent]?.[child] || []).filter((path: any) => (
            freePaths.has(path) &&
            // 白名单额外收窄到直接笔记：跨层条目在新规则下不再被读取，留着就是死数据
            (key === 'excludedPathsByParentChild' || this.isDirectInheritedPath(child, path))
          ));
          this.setParentChildValue(inheritance[key], parent, child, nextPaths.length ? nextPaths : undefined);
        }
      }
    };
    for (const parent of parents) reconcileParent(parent);
    return beforeIncluded !== JSON.stringify(inheritance.includedPathsByParentChild) ||
      beforeExcluded !== JSON.stringify(inheritance.excludedPathsByParentChild);
  }

  /**
   * 这篇笔记是不是直接挂在该子标签上的。
   *
   * 「选择继承」的白名单只管直接笔记；更深层冒上来的笔记由更深的边决定，本边只能排除
   * （见 core/inheritance.ts 的 isInheritanceEdgePathVisible）。写入侧要按同一口径分流，
   * 否则勾选面板会把深层笔记写进永远不被读取的白名单里。
   */
  isDirectInheritedPath(childValue: any, path: any) {
    const child = normalizeTag(childValue);
    if (!child || !path) return false;
    return (this.tagFileIndex?.get(child) || []).some((file: any) => file.path === path);
  }

  collectVisiblePathsForEdge(parent: any, child: any) {
    const selectedMode = this.getTagInheritanceMode(parent, child) === 'selected';
    const included = new Set(this.getIncludedInheritedPaths(parent, child));
    const excluded = new Set(this.getExcludedInheritedPaths(parent, child));
    const freeCandidates = this.getInheritanceCandidates(parent, child).filter((candidate) => !candidate.fixed);
    return new Set(freeCandidates
      .filter((candidate) => (selectedMode && this.isDirectInheritedPath(child, candidate.path)
        ? included.has(candidate.path)
        : !excluded.has(candidate.path)))
      .map((candidate) => candidate.path));
  }

  propagateNewlyAllowedPathsToAncestors(childTagValue: any, newlyAllowedPaths: any) {
    const startTag = normalizeTag(childTagValue);
    const paths = Array.from<any>(new Set((newlyAllowedPaths || [])
      .map((path: any) => typeof path === 'string' ? path.trim() : '')
      .filter(Boolean)));
    if (!startTag || !paths.length) return;
    const visited = new Set([startTag]);
    const queue = [startTag];
    while (queue.length) {
      const child = queue.shift();
      for (const parent of this.getInheritanceParents(child)) {
        // 走同一个分流器：直接笔记进白名单，深层笔记则是把它从黑名单里摘掉
        if (!this.isFixedTagEdge(parent, child)) {
          for (const path of paths) this.applyInheritedFileVisibilityToEdge(parent, child, path, true);
        }
        if (visited.has(parent)) continue;
        visited.add(parent);
        queue.push(parent);
      }
    }
  }

  async setTagInheritanceMode(parentValue: any, childValue: any, modeValue: any) {
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
    const currentVisible = this.collectVisiblePathsForEdge(parent, child);
    inheritance.modeByParentChild = this.cloneParentChildSettings(previousModes);
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    // 切换模式时按"保持当前可见集合"重算名单。
    // 「选择继承」下白名单只管直接笔记，深层笔记仍由黑名单承接，所以这里两侧都要写；
    // 「全部继承」下白名单不再被读取（见 isInheritanceEdgePathVisible），留着就是死数据，直接清掉。
    if (mode === 'selected') {
      this.setParentChildValue(inheritance.modeByParentChild, parent, child, 'selected');
      const paths = freeCandidates
        .filter((candidate) => this.isDirectInheritedPath(child, candidate.path) && currentVisible.has(candidate.path))
        .map((candidate) => candidate.path);
      const hiddenDeepPaths = freeCandidates
        .filter((candidate) => !this.isDirectInheritedPath(child, candidate.path) && !currentVisible.has(candidate.path))
        .map((candidate) => candidate.path);
      this.setParentChildValue(inheritance.includedPathsByParentChild, parent, child, paths.length ? paths : undefined);
      this.setParentChildValue(
        inheritance.excludedPathsByParentChild,
        parent,
        child,
        hiddenDeepPaths.length ? hiddenDeepPaths : undefined
      );
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

  async setIncludedInheritedPaths(parentValue: any, childValue: any, pathValues: any) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child || !this.getInheritanceChildren(parent).includes(child)) throw new Error('继承关系无效');
    const inheritance = this.getTagInheritanceSettings();
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousExcluded = inheritance.excludedPathsByParentChild;
    // 白名单只收直接笔记；深层笔记要在这条边上藏起来得走黑名单
    const allowed = new Set(this.getInheritanceCandidates(parent, child)
      .filter((candidate) => !candidate.fixed && this.isDirectInheritedPath(child, candidate.path))
      .map((candidate) => candidate.path));
    const paths = Array.from(new Set((pathValues || [])
      .map((path: any) => typeof path === 'string' ? path.trim() : '')
      .filter((path: any) => path && allowed.has(path))));
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

  applyInheritedFileVisibilityToEdge(parent: any, child: any, path: any, visible: any) {
    const inheritance = this.getTagInheritanceSettings();
    // 深层笔记即使在「选择继承」模式下也只写黑名单 —— 白名单对它们不生效
    if (this.getTagInheritanceMode(parent, child) === 'selected' && this.isDirectInheritedPath(child, path)) {
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

  /**
   * 批量设置一条边上若干笔记的可见性。
   *
   * 勾选面板的「全选/全不选」一次能改几十行，逐条走单篇版本会重复落盘、重复刷视图，
   * 这里合成一次保存。每条写进白名单还是黑名单由 applyInheritedFileVisibilityToEdge 分流。
   */
  async setEdgePathsVisible(parentValue: any, childValue: any, entries: any) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    if (!parent || !child) return;
    const candidates = new Map(this.getInheritanceCandidates(parent, child).map((item) => [item.path, item]));
    const changes = Array.from<any>(entries || [])
      .map((entry: any) => ({ path: entry && entry.path, visible: !!(entry && entry.visible) }))
      .filter((entry) => entry.path && candidates.has(entry.path) && !candidates.get(entry.path).fixed);
    if (!changes.length) return;
    const inheritance = this.getTagInheritanceSettings();
    const previousIncluded = inheritance.includedPathsByParentChild;
    const previousExcluded = inheritance.excludedPathsByParentChild;
    const previouslyVisible = this.collectVisiblePathsForEdge(parent, child);
    inheritance.includedPathsByParentChild = this.cloneParentChildSettings(previousIncluded);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    for (const { path, visible } of changes) this.applyInheritedFileVisibilityToEdge(parent, child, path, visible);
    this.propagateNewlyAllowedPathsToAncestors(
      parent,
      changes.filter((entry) => entry.visible && !previouslyVisible.has(entry.path)).map((entry) => entry.path)
    );
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

  async setInheritedFileVisibleForEdge(parentValue: any, childValue: any, path: any, visible: any) {
    await this.setEdgePathsVisible(parentValue, childValue, [{ path, visible }]);
  }

  async setInheritedFileVisible(parentValue: any, path: any, visible: any) {
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

  getInheritedFileRemovalTitle(tagValue: any) {
    return `从 ${getTagDisplayName(normalizeTag(tagValue))} 中排除`;
  }

  getTagDescendants(tagValue: any) {
    return core.getTagDescendants(this.getTagInheritanceSettings(), tagValue);
  }

  wouldCreateTagInheritanceCycle(parentValue: any, childValue: any) {
    return core.wouldCreateTagInheritanceCycle(this.getTagInheritanceSettings(), parentValue, childValue);
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

  async setInheritanceChildren(parentValue: any, childValues: any) {
    const parent = normalizeTag(parentValue);
    if (!parent || isNestedTag(parent)) throw new Error('父标签无效');
    const children: any[] = [];
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
      Object.entries<any>(previousFixedParents).filter(([child, fixedParent]) => (
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

  async setInheritanceParents(childValue: any, parentValues: any) {
    const child = normalizeTag(childValue);
    if (!child || isNestedTag(child)) throw new Error('子标签无效');
    const parents = Array.from<any>(new Set((parentValues || []).map(normalizeTag).filter(Boolean)));
    if (parents.some((parent: any) => isNestedTag(parent) || parent === child)) throw new Error('父标签无效');
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
    const affectedParents = Array.from(new Set<any>([
      ...Object.entries<any>(previousChildren)
        .filter(([, children]) => children.includes(child))
        .map(([parent]) => parent),
      ...parents,
    ]));
    const stagedChildren: any = Object.fromEntries(Object.entries<any>(previousChildren).map(([parent, children]: [any, any]) => [
      parent,
      children.filter((tag: any) => tag !== child),
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
      ...previousEnabled.filter((tag: any) => validParents.has(tag)),
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

  async setFixedTagRelation(parentValue: any, childValue: any, fixed: any) {
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

  async addInheritanceParent(childValue: any, parentValue: any) {
    const child = normalizeTag(childValue);
    const parent = normalizeTag(parentValue);
    if (!child || !parent || isNestedTag(child) || isNestedTag(parent)) throw new Error('标签无效');
    const children = this.getInheritanceChildren(parent);
    if (!children.includes(child)) children.push(child);
    await this.setInheritanceChildren(parent, children);
  }

  async toggleTagInheritance(tagValue: any) {
    const tag = normalizeTag(tagValue);
    if (!tag || !this.hasInheritanceChildren(tag)) return;
    const inheritance = this.getTagInheritanceSettings();
    inheritance.enabledParents = inheritance.enabledParents.includes(tag)
      ? inheritance.enabledParents.filter((item: any) => item !== tag)
      : [...inheritance.enabledParents, tag];
    await this.saveSettings();
    this.refreshAllTagViews();
  }

  /**
   * 标签浏览数据。计算涉及继承分支遍历与继承树构建，开销不小，而一次渲染中
   * 同一标签会被 renderListMode、updateListModeExpandAllButton、toggleAllListModeTags
   * 各自问一遍（150 标签实测 450–600 次）。这里走批次缓存，失效点见 data/tag-store.ts。
   */
  getTagBrowseData(tagValue: any) {
    const tag = normalizeTag(tagValue);
    if (!tag) return this.computeTagBrowseData(tagValue);
    if (!this.tagBrowseCache) return this.computeTagBrowseData(tagValue);
    return this.tagBrowseCache.resolve(tag, () => this.computeTagBrowseData(tagValue));
  }

  computeTagBrowseData(tagValue: any) {
    const tag = normalizeTag(tagValue);
    if (!tag) return { tag: null, files: [], exactFiles: [], inheritedFiles: [], sourcesByPath: new Map(), inheritanceTree: null };
    const branchData: any = this.getInheritanceBranchData(tag);
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
      Array.from<any>(this.tagFileIndex.values()).flat().map((file: any) => [file.path, file])
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

  isInheritedFileForTag(tagValue: any, path: any) {
    return this.getTagBrowseData(tagValue).inheritedFiles.some((file: any) => file.path === path);
  }

  getInheritedFileSources(tagValue: any, path: any) {
    return this.getTagBrowseData(tagValue).sourcesByPath.get(path) || [];
  }

  isFixedInheritedFileForTag(tagValue: any, path: any) {
    const browseData = this.getTagBrowseData(tagValue);
    return browseData.fixedPaths?.has(path) || false;
  }

  async excludeInheritedFile(parentValue: any, path: any, allowGroupedInheritance = false) {
    const parent = normalizeTag(parentValue);
    if (!parent || !path || (!allowGroupedInheritance && !this.isInheritedFileForTag(parent, path))) return;
    if (this.isFixedInheritedFileForTag(parent, path)) return;
    await this.setInheritedFileVisible(parent, path, false);
  }

  async restoreInheritedFile(parentValue: any, path: any, childValue = null) {
    const parent = normalizeTag(parentValue);
    if (!parent || !path) return;
    if (childValue) await this.setInheritedFileVisibleForEdge(parent, childValue, path, true);
    else await this.setInheritedFileVisible(parent, path, true);
  }

  migrateTagRelations(oldTagValue: any, newTagValue: any) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);
    if (!oldTag || !newTag || oldTag === newTag) return;
    const inheritance = this.getTagInheritanceSettings();
    const oldChildren = inheritance.childrenByParent[oldTag] || [];
    const newChildren = inheritance.childrenByParent[newTag] || [];
    const participatesInInheritance = !!(
      oldChildren.length ||
      Object.values<any>(inheritance.childrenByParent).some((children: any) => children.includes(oldTag)) ||
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
    for (const [parent, children] of Object.entries<any>(inheritance.childrenByParent)) {
      inheritance.childrenByParent[parent] = Array.from(new Set(children.map((child: any) => child === oldTag ? newTag : child)))
        .filter((child) => child !== parent);
    }
    if (inheritance.enabledParents.includes(oldTag)) inheritance.enabledParents.push(newTag);
    inheritance.enabledParents = Array.from(new Set(inheritance.enabledParents.filter((tag: any) => tag !== oldTag)));
    for (const key of ['modeByParentChild', 'excludedPathsByParentChild', 'includedPathsByParentChild']) {
      const migrated: any = {};
      for (const [storedParent, children] of Object.entries<any>(inheritance[key] || {})) {
        const parent = storedParent === oldTag ? newTag : storedParent;
        for (const [storedChild, value] of Object.entries<any>(children || {})) {
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
    const migratedFixedParents: any = {};
    for (const [child, parent] of Object.entries<any>(inheritance.fixedParentByChild || {})) {
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

  handleRelationFileRename(file: any, oldPath: any) {
    if (!(file instanceof TFile) || file.extension !== 'md' || !oldPath || !file.path) return;
    const inheritance = this.getTagInheritanceSettings();
    let changed = false;
    for (const key of ['excludedPathsByParentChild', 'includedPathsByParentChild']) {
      for (const children of Object.values(inheritance[key])) {
        for (const [child, paths] of Object.entries<any>(children as any)) {
          if (!paths.includes(oldPath)) continue;
          (children as any)[child] = Array.from(new Set(paths.map((path: any) => path === oldPath ? file.path : path)));
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
    for (const [parentPath, paths] of Object.entries<any>(hierarchy.childrenByParentPath)) {
      if (!paths.includes(oldPath)) continue;
      hierarchy.childrenByParentPath[parentPath] = Array.from(new Set(paths.map((path: any) => path === oldPath ? file.path : path)))
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
    for (const [parentPath, entries] of Object.entries<any>(hierarchy.displayNamesByParentPath)) {
      if (!entries[oldPath]) continue;
      if (!entries[file.path]) entries[file.path] = entries[oldPath];
      delete entries[oldPath];
      changed = true;
    }
    if (changed) this.saveSettings();
  }

  handleRelationFileDelete(file: any) {
    if (!(file instanceof TFile) || file.extension !== 'md' || !file.path) return;
    const inheritance = this.getTagInheritanceSettings();
    let changed = false;
    for (const key of ['excludedPathsByParentChild', 'includedPathsByParentChild']) {
      for (const [parent, children] of Object.entries<any>(inheritance[key])) {
        for (const [child, paths] of Object.entries<any>(children as any)) {
          const nextPaths = paths.filter((path: any) => path !== file.path);
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
    for (const [parentPath, paths] of Object.entries<any>(hierarchy.childrenByParentPath)) {
      const nextPaths = paths.filter((path: any) => path !== file.path);
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

  getTagBoundNotePath(tagValue: any) {
    const tag = normalizeTag(tagValue);
    if (!tag || !this.settings.tagBoundNoteByTag) return null;
    const path = this.settings.tagBoundNoteByTag[tag];
    if (typeof path !== 'string' || !path) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile && file.extension === 'md' ? path : null;
  }

  getTagBoundNoteFile(tagValue: any) {
    const path = this.getTagBoundNotePath(tagValue);
    if (!path) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile && file.extension === 'md' ? file : null;
  }

  async setTagBoundNote(tagValue: any, pathValue: any) {
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

  migrateTagBoundNote(oldTagValue: any, newTagValue: any) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);
    const bindings = this.settings.tagBoundNoteByTag;
    if (!oldTag || !newTag || oldTag === newTag || !bindings || !bindings[oldTag]) return false;
    if (!bindings[newTag]) bindings[newTag] = bindings[oldTag];
    delete bindings[oldTag];
    return true;
  }

  reconcileTagBoundNotes(nextIndex: any) {
    const current = this.settings.tagBoundNoteByTag || {};
    const next: any = {};
    for (const [tag, path] of Object.entries<any>(current)) {
      if (!nextIndex.has(tag)) continue;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || file.extension !== 'md') continue;
      next[tag] = file.path;
    }
    const changed = JSON.stringify(next) !== JSON.stringify(current);
    if (changed) this.settings.tagBoundNoteByTag = next;
    return changed;
  }

  handleTagBoundNoteFileRename(file: any, oldPath: any) {
    if (!(file instanceof TFile) || file.extension !== 'md' || !oldPath || !file.path) return;
    const bindings = this.settings.tagBoundNoteByTag || {};
    let changed = false;
    for (const [tag, path] of Object.entries<any>(bindings)) {
      if (path !== oldPath) continue;
      bindings[tag] = file.path;
      changed = true;
    }
    if (changed) this.saveSettings();
  }

  handleTagBoundNoteFileDelete(file: any) {
    if (!(file instanceof TFile) || file.extension !== 'md' || !file.path) return;
    const bindings = this.settings.tagBoundNoteByTag || {};
    let changed = false;
    for (const [tag, path] of Object.entries<any>(bindings)) {
      if (path !== file.path) continue;
      delete bindings[tag];
      changed = true;
    }
    if (changed) this.saveSettings();
  }


}
