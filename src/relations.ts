import { Notice, TFile } from "obsidian";
// 继承规则的纯计算已迁入 core/inheritance.ts，这里保留同名方法作为薄委托
import * as core from "./core/inheritance";
import {
  linkSimilarTags,
  normalizeSimilarTagSettings,
  resolveSimilarTagGroup,
  unlinkSimilarTags,
} from "./core/similar-tags";
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
  collectBrowseSignature,
  collectIntersectionSignature,
  moveHierarchyNavigation,
  parseHierarchySearch,
  parseUnifiedHierarchySearch,
  pushHierarchyNavigation,
  sanitizeAcyclicAdjacency,
  wouldCreateDirectedCycle,
} from "./relation-utils";

/**
 * 关系数据结构版本。
 * 7：移除「选择继承」白名单，模式的另一端换成「交集」。
 * 8：新增 similarTags（相似标签组）。旧数据没有该节时补空对象即可，无需数据搬迁。
 */
export const RELATIONS_VERSION = 8;

/**
 * 「选择继承」白名单退场的那一版。
 *
 * 与白名单迁移相关的判断必须钉在这个常量上，而不是跟着 RELATIONS_VERSION 走 ——
 * 后者每加一个新特性就 +1，写成 `< RELATIONS_VERSION` 会让已经迁移完的 v7 数据
 * 在升到 v8 时再次被当作「待迁移」，把早已清掉的白名单结构重新造出来。
 */
const SELECTED_INHERITANCE_RETIRED_VERSION = 7;

const createEmptyRelations = (): any => ({
  version: RELATIONS_VERSION,
  tagInheritance: {
    childrenByParent: {},
    excludedPathsByParentChild: {},
    modeByParentChild: {},
    fixedParentByChild: {},
  },
  noteHierarchy: {
    childrenByParentPath: {},
    displayNamesByParentPath: {},
  },
  similarTags: {
    groupsByTag: {},
  },
});

export class RelationsBehavior {
  [key: string]: any;

  normalizeRelationSettings(value = this.settings.relations) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const result = createEmptyRelations();
    const sourceVersion = Number(source.version);
    result.version = Number.isFinite(sourceVersion) && sourceVersion >= 1
      ? Math.min(Math.floor(sourceVersion), RELATIONS_VERSION)
      : 1;
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
    copyParentChildPaths('excludedPathsByParentChild', 'excludedPathsByParentChild');
    // 白名单是 v7 之前「选择继承」的遗留结构。这里必须原样透传到迁移执行为止 ——
    // 本函数跑在 loadSettings 里、早于 tagFileIndex 建立，而等价转换要等索引就绪，
    // 提前丢弃会让那些边退化成「继承 + 空排除名单」= 全部笔记都冒上来。
    if (result.version < SELECTED_INHERITANCE_RETIRED_VERSION) {
      result.tagInheritance.includedPathsByParentChild = {};
      copyParentChildPaths('includedPathsByParentChild', 'includedPathsByParentChild');
    }
    const rawModes = inheritance.modeByParentChild;
    if (rawModes && typeof rawModes === 'object' && !Array.isArray(rawModes)) {
      for (const [rawParent, rawChildren] of Object.entries<any>(rawModes)) {
        const parent = normalizeTag(rawParent);
        if (!parent || !rawChildren || typeof rawChildren !== 'object' || Array.isArray(rawChildren)) continue;
        for (const [rawChild, rawMode] of Object.entries<any>(rawChildren)) {
          const child = normalizeTag(rawChild);
          // 'selected' 是待迁移的旧值，迁移跑完就不会再出现
          const keep = rawMode === 'intersection' ||
            (rawMode === 'selected' && result.version < SELECTED_INHERITANCE_RETIRED_VERSION);
          if (!keep || !(result.tagInheritance.childrenByParent[parent] || []).includes(child)) continue;
          if (!result.tagInheritance.modeByParentChild[parent]) result.tagInheritance.modeByParentChild[parent] = {};
          result.tagInheritance.modeByParentChild[parent][child as any] = rawMode;
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

    const similar = source.similarTags && typeof source.similarTags === 'object'
      ? source.similarTags
      : {};
    // 相似组是对称无向的，normalizeSimilarTagSettings 会把半条边补齐成两条
    result.similarTags.groupsByTag = normalizeSimilarTagSettings(similar.groupsByTag);

    this.settings.relations = result;
    // 先把半条交集边降级/清理，再做环检测；否则残缺的交集标记会被误当成普通继承边。
    this.reconcileIntersectionPairs();
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

  getRelativeChildDisplayName(parentValue: any, childValue: any) {
    return core.getRelativeChildDisplayName(parentValue, childValue);
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
      // 固定子标签搜索的结果里不该混进交集组
      if (node.isIntersection) return null;
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
      // tag-group 与 tag-intersection 的第三段都是 \u0001 分隔的血缘，逐段替换
      if ((parts[1] === 'tag-group' || parts[1] === 'tag-intersection') && parts[2]) {
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

  /** 相似标签的邻接表。缺失时补齐，让旧数据无需迁移即可使用。 */
  getSimilarTagSettings() {
    if (!this.settings.relations) this.normalizeRelationSettings();
    const relations = this.settings.relations;
    if (!relations.similarTags || typeof relations.similarTags !== 'object') {
      relations.similarTags = { groupsByTag: {} };
    }
    if (!relations.similarTags.groupsByTag || typeof relations.similarTags.groupsByTag !== 'object') {
      relations.similarTags.groupsByTag = {};
    }
    return relations.similarTags;
  }

  /** tag 所在的完整相似组（含自身）。没有任何关系时只有它自己。 */
  getSimilarTags(tagValue: any) {
    return resolveSimilarTagGroup(this.getSimilarTagSettings().groupsByTag, tagValue);
  }

  /** 相似组里除自己以外的成员，供弹窗列表使用。 */
  getSimilarTagPartners(tagValue: any) {
    const tag = normalizeTag(tagValue);
    return this.getSimilarTags(tag).filter((similarTag: any) => similarTag !== tag);
  }

  async addSimilarTag(tagValue: any, relatedValue: any) {
    if (!linkSimilarTags(this.getSimilarTagSettings().groupsByTag, tagValue, relatedValue)) return false;
    await this.saveSettings();
    this.refreshAllTagViews();
    return true;
  }

  async removeSimilarTag(tagValue: any, relatedValue: any) {
    if (!unlinkSimilarTags(this.getSimilarTagSettings().groupsByTag, tagValue, relatedValue)) return false;
    await this.saveSettings();
    this.refreshAllTagViews();
    return true;
  }

  /** 标签改名时把相似关系一并迁移，避免留下指向旧名的死边。 */
  migrateSimilarTags(oldTagValue: any, newTagValue: any) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);
    if (!oldTag || !newTag || oldTag === newTag) return false;

    const groups = this.getSimilarTagSettings().groupsByTag;
    const partners = (groups[oldTag] || []).slice();
    if (partners.length === 0) return false;

    for (const partner of partners) {
      unlinkSimilarTags(groups, oldTag, partner);
      // 改名后的标签接手全部伙伴；伙伴恰好是新标签时 linkSimilarTags 会自行忽略
      linkSimilarTags(groups, newTag, partner);
    }
    return true;
  }

  /**
   * 关系数据的版本化迁移。
   *
   * 挂在这里而不是 data/schema.ts：v7 的等价转换要算「自由候选」和「这篇笔记是不是
   * 直接挂在子标签上」，两者都依赖 tagFileIndex，而 schema 迁移跑在 loadSettings 里、
   * 那时索引还没建。本方法由 tag-index.ts 在索引就绪且元数据缓存可用时调用。
   */
  initializeTagInheritanceOrder() {
    const relations = this.settings.relations;
    if (!relations || Number(relations.version) >= RELATIONS_VERSION) return false;

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
    if (Number(relations.version) < 7) this.migrateSelectedInheritanceToExclusion();
    this.reconcileInheritancePathLists();
    relations.version = RELATIONS_VERSION;
    return true;
  }

  /**
   * v6 -> v7：把「选择继承」等价改写成「继承 + 排除名单」，白名单整张表退场。
   *
   * 白名单是「默认拒绝」、排除名单是「默认放行」，两者的可见集合可以互相表达：
   * 把当前不可见的自由候选全部写进排除名单，显示结果完全一致。
   *
   * 例外是白名单为空的边 —— 那意味着「一篇都不继承」，留着这条关系没有意义，
   * 视为误设，直接转成普通继承而不是把整棵子树写进排除名单。
   */
  migrateSelectedInheritanceToExclusion() {
    const inheritance = this.getTagInheritanceSettings();
    const legacyIncluded = inheritance.includedPathsByParentChild || {};
    const selectedEdges: Array<[string, string]> = [];
    for (const [parent, children] of Object.entries<any>(inheritance.modeByParentChild || {})) {
      for (const [child, mode] of Object.entries<any>(children || {})) {
        if (mode === 'selected') selectedEdges.push([parent, child]);
      }
    }

    // 迁移期专用：白名单当年只管直接挂在子标签上的笔记，深层笔记由排除名单承接
    const isDirectPath = (child: string, path: string) =>
      (this.tagFileIndex?.get(child) || []).some((file: any) => file.path === path);

    for (const [parent, child] of selectedEdges) {
      this.setParentChildValue(inheritance.modeByParentChild, parent, child, undefined);
      if (this.isFixedTagEdge(parent, child)) {
        this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, undefined);
        continue;
      }

      const included: string[] = legacyIncluded[parent]?.[child] || [];
      if (!included.length) continue;

      const excluded = new Set<string>(this.getExcludedInheritedPaths(parent, child));
      const free = this.getInheritanceCandidates(parent, child).filter((candidate: any) => !candidate.fixed);
      const hidden = free
        .filter((candidate: any) => (isDirectPath(child, candidate.path)
          ? !included.includes(candidate.path)
          : excluded.has(candidate.path)))
        .map((candidate: any) => candidate.path);
      this.setParentChildValue(
        inheritance.excludedPathsByParentChild,
        parent,
        child,
        hidden.length ? hidden : undefined
      );
    }

    delete inheritance.includedPathsByParentChild;
    return selectedEdges.length > 0;
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

  getInheritanceParents(tagValue: any) {
    return core.getInheritanceParents(this.getTagInheritanceSettings(), tagValue);
  }

  isIntersectionEdge(parentValue: any, childValue: any) {
    return core.isIntersectionEdge(this.getTagInheritanceSettings(), parentValue, childValue);
  }

  getIntersectionPartners(tagValue: any) {
    return core.getIntersectionPartners(this.getTagInheritanceSettings(), tagValue);
  }

  getInheritanceOnlyChildren(tagValue: any) {
    return core.getInheritanceOnlyChildren(this.getTagInheritanceSettings(), tagValue);
  }

  areTagsRelated(leftValue: any, rightValue: any) {
    return core.areTagsRelated(this.getTagInheritanceSettings(), leftValue, rightValue);
  }

  /**
   * 一个交集分组的成员：root 的原生笔记 ∩ partner 的笔记。
   *
   * 只吃原生笔记 —— 从子标签继承上来的笔记仍留在自己的血缘分组里，不进交集组。
   * 顺序取自 root 的 exactPaths（已过 noteOrderByTag），这样同一批笔记在
   * 「原生」与交集组之间挪动时排序不会错乱。
   */
  getIntersectionGroupPaths(rootTagValue: any, partnerTagValue: any) {
    const root = normalizeTag(rootTagValue);
    const partner = normalizeTag(partnerTagValue);
    if (!root || !partner) return [];
    const partnerPaths = new Set((this.tagFileIndex?.get(partner) || []).map((file: any) => file.path));
    if (!partnerPaths.size) return [];
    const branchData: any = this.getInheritanceBranchData(root);
    return (branchData?.exactPaths || []).filter((path: any) => partnerPaths.has(path));
  }

  /**
   * 交集边的一致性对账：清除半条边。
   *
   * 交集必须成对存在。任一侧缺失（写入中断、标签改名、另一侧被单独移除）时，
   * 把剩下那条边降级成普通继承边 —— 保留关系本身，只是不再是交集。
   * 返回是否发生过改动。
   */
  reconcileIntersectionPairs() {
    const inheritance = this.getTagInheritanceSettings();
    const modes = inheritance.modeByParentChild || {};
    let changed = false;
    for (const [parent, children] of Object.entries<any>(modes)) {
      for (const child of Object.keys(children || {})) {
        if (children[child] !== 'intersection') continue;
        const hasForwardEdge = (inheritance.childrenByParent[parent] || []).includes(child);
        const paired = modes[child]?.[parent] === 'intersection' &&
          hasForwardEdge &&
          (inheritance.childrenByParent[child] || []).includes(parent) &&
          parent !== child;
        if (paired) continue;
        if (parent === child) {
          inheritance.childrenByParent[parent] = (inheritance.childrenByParent[parent] || [])
            .filter((tag: any) => tag !== child);
          if (!inheritance.childrenByParent[parent].length) delete inheritance.childrenByParent[parent];
        }
        this.setParentChildValue(inheritance.modeByParentChild, parent, child, undefined);
        // 没有实体边时连同名单死数据一起清掉；实体边仍在时则降级为普通继承并保留其排除设置。
        if (!hasForwardEdge || parent === child) {
          this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, undefined);
        }
        changed = true;
      }
    }
    return changed;
  }

  /**
   * 绑定/解绑交集。成对写两条边，失败整体回滚。
   *
   * 交集与继承互斥，因此绑定时若两标签之间已有继承边会先被这条边覆盖为交集；
   * 解绑时两条边都删掉 —— 交集是对称的，没有「只保留一个方向」的说法。
   */
  async setIntersectionRelation(leftValue: any, rightValue: any, bound: any) {
    const left = normalizeTag(leftValue);
    const right = normalizeTag(rightValue);
    if (!left || !right || left === right) throw new Error('标签无效');
    if (isNestedTag(left) || isNestedTag(right)) throw new Error('嵌套标签不支持交集');
    if (bound && (this.isFixedChild(left) || this.isFixedChild(right))) {
      throw new Error('固定子标签不能绑定交集');
    }

    const inheritance = this.getTagInheritanceSettings();
    const previousChildren = inheritance.childrenByParent;
    const previousModes = inheritance.modeByParentChild;
    const previousExcluded = inheritance.excludedPathsByParentChild;
    const previousFixedParents = inheritance.fixedParentByChild;

    const stagedChildren: any = Object.fromEntries(
      Object.entries<any>(previousChildren).map(([parent, children]) => [parent, [...children]])
    );
    inheritance.childrenByParent = stagedChildren;
    inheritance.modeByParentChild = this.cloneParentChildSettings(previousModes);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    inheritance.fixedParentByChild = { ...previousFixedParents };

    const writeEdge = (parent: string, child: string) => {
      if (!stagedChildren[parent]) stagedChildren[parent] = [];
      if (!stagedChildren[parent].includes(child)) stagedChildren[parent].push(child);
      this.setParentChildValue(inheritance.modeByParentChild, parent, child, 'intersection');
      // 交集成员实时算出，没有可维护的排除名单
      this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, undefined);
    };
    const dropEdge = (parent: string, child: string) => {
      stagedChildren[parent] = (stagedChildren[parent] || []).filter((tag: any) => tag !== child);
      if (!stagedChildren[parent].length) delete stagedChildren[parent];
      this.setParentChildValue(inheritance.modeByParentChild, parent, child, undefined);
      this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, undefined);
    };

    if (bound) {
      writeEdge(left, right);
      writeEdge(right, left);
    } else {
      dropEdge(left, right);
      dropEdge(right, left);
    }
    this.reconcileIntersectionPairs();
    this.reconcileInheritancePathLists([left, right]);

    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.childrenByParent = previousChildren;
      inheritance.modeByParentChild = previousModes;
      inheritance.excludedPathsByParentChild = previousExcluded;
      inheritance.fixedParentByChild = previousFixedParents;
      throw error;
    }
    this.refreshHierarchyViews();
  }

  /** 该标签下全部非空的交集分组，顺序即它们在 childrenByParent 里的位置。 */
  getIntersectionGroups(tagValue: any) {
    return this.getIntersectionPartners(tagValue)
      .map((partner: any) => ({ tag: partner, paths: this.getIntersectionGroupPaths(tagValue, partner) }))
      .filter((group: any) => group.paths.length > 0);
  }

  getTagInheritanceGroupKeys(tagValue: any) {
    const tag = normalizeTag(tagValue);
    const browseData = tag && this.getTagBrowseData(tag);
    const tree = browseData?.hasActiveInheritance ? browseData.inheritanceTree : null;
    if (!tree || !tree.children.length) return [];
    const keys = [];
    const prefix = `${tag}\u0000tag-group\u0000`;
    // 交集组另起命名空间，避免与同名子标签分组的 key 撞车
    const intersectionPrefix = `${tag}\u0000tag-intersection\u0000`;
    if (tree.paths.length) keys.push(`${prefix}original`);
    // 交集组可能挂在任意深度的节点上，key 必须带完整血缘 ——
    // 只写伙伴标签的话，`#爱情 > 升温 > 欣赏` 会与假想的 `#爱情 > 欣赏` 撞车
    const visitChildren = (children: any, lineage: any) => {
      for (const child of children) {
        const childLineage = [...lineage, child.tag];
        if (child.isIntersection) {
          keys.push(`${intersectionPrefix}${childLineage.join('\u0001')}`);
          continue;
        }
        const key = `${prefix}${childLineage.join('\u0001')}`;
        keys.push(key);
        if (child.children.length && child.paths.length) keys.push(`${key}\u0000original`);
        visitChildren(child.children, childLineage);
      }
    };
    visitChildren(tree.children, []);
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

  getTagInheritanceMode(parentValue: any, childValue: any) {
    return core.getTagInheritanceMode(this.getTagInheritanceSettings(), parentValue, childValue);
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

  getInheritanceBranchData(tagValue: any, childValue = null) {
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
    const adjacency = this.getSortedTagInheritanceAdjacency();
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
    const branchData = this.getInheritanceBranchData(parentValue, childValue);
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
    const beforeExcluded = JSON.stringify(inheritance.excludedPathsByParentChild);
    const visited = new Set();
    const reconcileParent = (parent: any) => {
      if (!parent || visited.has(parent) || !parents.has(parent)) return;
      visited.add(parent);
      for (const child of inheritance.childrenByParent[parent] || []) reconcileParent(child);
      const children = new Set<any>(inheritance.childrenByParent[parent] || []);
      for (const key of ['modeByParentChild', 'excludedPathsByParentChild']) {
        for (const child of Object.keys(inheritance[key][parent] || {})) {
          if (!children.has(child)) this.setParentChildValue(inheritance[key], parent, child, undefined);
        }
      }
      for (const child of children) {
        // 只保留仍是自由候选的路径：标签或笔记被删掉后，名单里的残留条目就是死数据
        const freePaths = new Set(this.getInheritanceCandidates(parent, child)
          .filter((candidate) => !candidate.fixed)
          .map((candidate) => candidate.path));
        const nextPaths = (inheritance.excludedPathsByParentChild[parent]?.[child] || [])
          .filter((path: any) => freePaths.has(path));
        this.setParentChildValue(
          inheritance.excludedPathsByParentChild,
          parent,
          child,
          nextPaths.length ? nextPaths : undefined
        );
      }
    };
    for (const parent of parents) reconcileParent(parent);
    return beforeExcluded !== JSON.stringify(inheritance.excludedPathsByParentChild);
  }

  /** 这条边上当前可见的笔记：自由候选减去排除名单。 */
  collectVisiblePathsForEdge(parent: any, child: any) {
    const excluded = new Set(this.getExcludedInheritedPaths(parent, child));
    return new Set(this.getInheritanceCandidates(parent, child)
      .filter((candidate) => !candidate.fixed && !excluded.has(candidate.path))
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
        // 恢复一篇笔记要把它从整条路径上每条边的排除名单里摘掉，少一条就还是冒不上去
        if (!this.isFixedTagEdge(parent, child)) {
          for (const path of paths) this.applyInheritedFileVisibilityToEdge(parent, child, path, true);
        }
        if (visited.has(parent)) continue;
        visited.add(parent);
        queue.push(parent);
      }
    }
  }

  /**
   * 切换一条边的模式：继承 <-> 交集。
   *
   * 交集是对称的，两个方向要一起改：切到交集时补上反向边，切回继承时把反向边删掉、
   * 只保留当前方向。所以整条路都走 setIntersectionRelation。
   */
  async setTagInheritanceMode(parentValue: any, childValue: any, modeValue: any) {
    const parent = normalizeTag(parentValue);
    const child = normalizeTag(childValue);
    const mode = modeValue === 'intersection' ? 'intersection' : 'all';
    if (!parent || !child || !this.getInheritanceChildren(parent).includes(child)) throw new Error('继承关系无效');
    if (this.isFixedTagEdge(parent, child)) throw new Error('固定子标签不能切换模式');
    if (this.getTagInheritanceMode(parent, child) === mode) return;

    if (mode === 'intersection') {
      await this.setIntersectionRelation(parent, child, true);
      return;
    }
    // 交集 -> 继承：原子地删掉反向边、保留当前方向及其排序位置，且只落盘一次。
    const inheritance = this.getTagInheritanceSettings();
    const previousChildren = inheritance.childrenByParent;
    const previousModes = inheritance.modeByParentChild;
    const previousExcluded = inheritance.excludedPathsByParentChild;
    const previousFixedParents = inheritance.fixedParentByChild;
    inheritance.childrenByParent = Object.fromEntries(
      Object.entries<any>(previousChildren).map(([storedParent, children]) => [storedParent, [...children]])
    );
    inheritance.modeByParentChild = this.cloneParentChildSettings(previousModes);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    inheritance.fixedParentByChild = { ...previousFixedParents };
    inheritance.childrenByParent[child] = (inheritance.childrenByParent[child] || [])
      .filter((tag: any) => tag !== parent);
    if (!inheritance.childrenByParent[child].length) delete inheritance.childrenByParent[child];
    this.setParentChildValue(inheritance.modeByParentChild, parent, child, undefined);
    this.setParentChildValue(inheritance.modeByParentChild, child, parent, undefined);
    this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, undefined);
    this.setParentChildValue(inheritance.excludedPathsByParentChild, child, parent, undefined);
    this.reconcileIntersectionPairs();
    this.reconcileInheritancePathLists([parent, child]);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.childrenByParent = previousChildren;
      inheritance.modeByParentChild = previousModes;
      inheritance.excludedPathsByParentChild = previousExcluded;
      inheritance.fixedParentByChild = previousFixedParents;
      throw error;
    }
    this.refreshHierarchyViews();
  }

  applyInheritedFileVisibilityToEdge(parent: any, child: any, path: any, visible: any) {
    const inheritance = this.getTagInheritanceSettings();
    const paths = new Set(this.getExcludedInheritedPaths(parent, child));
    if (visible) paths.delete(path);
    else paths.add(path);
    this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, paths.size ? Array.from(paths) : undefined);
  }

  /**
   * 批量设置一条边上若干笔记的可见性。
   *
   * 勾选面板的「全选/全不选」一次能改几十行，逐条走单篇版本会重复落盘、重复刷视图，
   * 这里合成一次保存；取消勾选写入排除名单，重新勾选则从排除名单移除。
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
    const previousExcluded = inheritance.excludedPathsByParentChild;
    const previouslyVisible = this.collectVisiblePathsForEdge(parent, child);
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
    // 交集边没有排除名单可写，直接跳过 —— 也省掉一次全量的候选遍历
    const edges = this.getInheritanceOnlyChildren(parent).filter((child) => {
      const candidate = this.getInheritanceCandidates(parent, child).find((item) => item.path === path);
      return candidate && !candidate.fixed;
    });
    if (!edges.length) return;
    const inheritance = this.getTagInheritanceSettings();
    const previousExcluded = inheritance.excludedPathsByParentChild;
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExcluded);
    for (const child of edges) this.applyInheritedFileVisibilityToEdge(parent, child, path, visible);
    this.reconcileInheritancePathLists([parent]);
    try {
      await this.saveSettings();
    } catch (error) {
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
    // 交集边成对存在、天然构成环，豁免环检测
    inheritance.childrenByParent = sanitizeAcyclicAdjacency(
      inheritance.childrenByParent,
      (parent, child) => core.isIntersectionEdge(inheritance, parent, child)
    );
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
    const inheritance = this.getTagInheritanceSettings();
    const previousChildren = inheritance.childrenByParent;
    const existingChildren = new Set(previousChildren[parent] || []);
    const existingIntersectionPartners = new Set(core.getIntersectionPartners(inheritance, parent));
    const children: any[] = [];
    const seen = new Set();
    for (const rawChild of childValues || []) {
      const child = normalizeTag(rawChild);
      if (!child || isNestedTag(child) || seen.has(child)) continue;
      const fixedParent = this.getFixedParent(child);
      if (fixedParent && fixedParent !== parent) {
        throw new Error(`${getTagDisplayName(child)} 是固定子标签，请先解除固定`);
      }
      if (!existingChildren.has(child) && this.areTagsRelated(parent, child)) {
        throw new Error(`${getTagDisplayName(parent)} 与 ${getTagDisplayName(child)} 已有关联`);
      }
      // 已存在的交集伙伴参与同一序列排序，但不属于继承图，不能拿去做继承环检测。
      if (!existingIntersectionPartners.has(child) && this.wouldCreateTagInheritanceCycle(parent, child)) {
        throw new Error(`不能建立循环继承：${getTagDisplayName(parent)} → ${getTagDisplayName(child)}`);
      }
      seen.add(child);
      children.push(child);
    }
    const previousModes = inheritance.modeByParentChild;
    const previousExclusions = inheritance.excludedPathsByParentChild;
    const previousFixedParents = inheritance.fixedParentByChild;
    const stagedChildren = { ...previousChildren };
    const stagedModes = this.cloneParentChildSettings(previousModes);
    const stagedExclusions = this.cloneParentChildSettings(previousExclusions);
    if (children.length > 0) {
      stagedChildren[parent] = children;
    } else {
      delete stagedChildren[parent];
      delete stagedModes[parent];
      delete stagedExclusions[parent];
    }
    inheritance.childrenByParent = stagedChildren;
    inheritance.modeByParentChild = stagedModes;
    inheritance.excludedPathsByParentChild = stagedExclusions;
    inheritance.fixedParentByChild = Object.fromEntries(
      Object.entries<any>(previousFixedParents).filter(([child, fixedParent]) => (
        fixedParent !== parent || children.includes(child)
      ))
    );
    // 从任一子标签列表移除交集伙伴时，两侧边必须一起删除，避免留下半条关系。
    const removedIntersectionPartners = Array.from(existingIntersectionPartners)
      .filter((partner) => !children.includes(partner));
    for (const partner of removedIntersectionPartners) {
      stagedChildren[partner] = (stagedChildren[partner] || []).filter((tag: any) => tag !== parent);
      if (!stagedChildren[partner].length) delete stagedChildren[partner];
      this.setParentChildValue(stagedModes, parent, partner, undefined);
      this.setParentChildValue(stagedModes, partner, parent, undefined);
      this.setParentChildValue(stagedExclusions, parent, partner, undefined);
      this.setParentChildValue(stagedExclusions, partner, parent, undefined);
    }
    this.reconcileIntersectionPairs();
    this.reconcileInheritancePathLists([parent, ...removedIntersectionPartners]);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.childrenByParent = previousChildren;
      inheritance.modeByParentChild = previousModes;
      inheritance.excludedPathsByParentChild = previousExclusions;
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
    const previousModes = inheritance.modeByParentChild;
    const previousExclusions = inheritance.excludedPathsByParentChild;
    const previousFixedParents = inheritance.fixedParentByChild;
    // 父标签管理只读写继承边；交集伙伴不是父级，必须原样保留。
    const currentInheritanceParents = this.getInheritanceParents(child);
    const affectedParents = Array.from(new Set<any>([
      ...currentInheritanceParents,
      ...parents,
    ]));
    const stagedChildren: any = Object.fromEntries(Object.entries<any>(previousChildren)
      .map(([parent, children]: [any, any]) => [parent, [...children]]));
    for (const parent of currentInheritanceParents) {
      stagedChildren[parent] = (stagedChildren[parent] || []).filter((tag: any) => tag !== child);
      if (!stagedChildren[parent].length) delete stagedChildren[parent];
    }
    const stagedInheritanceAdjacency: any = Object.fromEntries(
      Object.entries<any>(this.getSortedTagInheritanceAdjacency())
        .map(([parent, children]) => [parent, children.filter((tag: any) => tag !== child)])
        .filter(([, children]) => children.length)
    );

    for (const parent of parents) {
      if (!currentInheritanceParents.includes(parent) && this.areTagsRelated(parent, child)) {
        throw new Error(`${getTagDisplayName(parent)} 与 ${getTagDisplayName(child)} 已有关联`);
      }
      if (wouldCreateDirectedCycle(stagedInheritanceAdjacency, parent, child)) {
        throw new Error(`不能建立循环继承：${getTagDisplayName(parent)} → ${getTagDisplayName(child)}`);
      }
      stagedChildren[parent] = this.sortTagsByVisibleCount([...(stagedChildren[parent] || []), child]);
      stagedInheritanceAdjacency[parent] = [
        ...(stagedInheritanceAdjacency[parent] || []).filter((tag: any) => tag !== child),
        child,
      ];
    }

    inheritance.childrenByParent = stagedChildren;
    inheritance.modeByParentChild = this.cloneParentChildSettings(previousModes);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExclusions);
    inheritance.fixedParentByChild = { ...previousFixedParents };
    if (parents.length === 0) delete inheritance.fixedParentByChild[child];
    this.reconcileIntersectionPairs();
    this.reconcileInheritancePathLists(affectedParents);
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.childrenByParent = previousChildren;
      inheritance.modeByParentChild = previousModes;
      inheritance.excludedPathsByParentChild = previousExclusions;
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
    const previousPinnedTag = this.settings.pinnedTag;
    const nextFixedParents = { ...previousFixedParents };
    if (fixed) nextFixedParents[child] = parent;
    else delete nextFixedParents[child];
    inheritance.fixedParentByChild = nextFixedParents;
    inheritance.modeByParentChild = this.cloneParentChildSettings(previousModes);
    inheritance.excludedPathsByParentChild = this.cloneParentChildSettings(previousExclusions);
    if (fixed) {
      this.setParentChildValue(inheritance.modeByParentChild, parent, child, undefined);
      this.setParentChildValue(inheritance.excludedPathsByParentChild, parent, child, undefined);
    }
    this.reconcileInheritancePathLists([parent]);
    if (fixed && this.settings.pinnedTag === child) this.settings.pinnedTag = null;
    try {
      await this.saveSettings();
    } catch (error) {
      inheritance.fixedParentByChild = previousFixedParents;
      inheritance.modeByParentChild = previousModes;
      inheritance.excludedPathsByParentChild = previousExclusions;
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
    // 交集分组：成员是 root 的原生笔记，对 inheritedFiles 与计数零贡献，只影响分组展示
    const intersectionGroups = this.getIntersectionGroups(tag);
    const hasActiveInheritance = !!(adjacency[tag] || []).length || intersectionGroups.length > 0;
    const inheritanceTree = hasActiveInheritance
      ? buildTagInheritanceGroupTree(
        tag,
        adjacency,
        orderedPathsByTag,
        [],
        fixedTags,
        (_sourceTag, path, lineage) => this.isInheritancePathVisible(
          this.createInheritanceEdgesFromLineage(lineage),
          path
        ),
        // 交集组按标签实时取，任意深度的节点都能挂出自己的交集分组
        (nodeTag: string) => this.getIntersectionGroups(nodeTag),
        (nodeTag: string) => this.getInheritanceChildren(nodeTag)
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
      hasInheritance: this.hasInheritanceChildren(tag),
      hasActiveInheritance,
      intersectionGroups,
      // 交集组的内容取决于**对方标签**的笔记集合，而那不会改变本标签的 files 或计数。
      // 不进签名的话，「某篇笔记新加了对方标签」时旧 DOM 会被原样复用、交集组显示陈旧内容。
      // 必须扫全树而不只是根标签 —— 深层节点（如 #爱情 > 升温）的交集组同样会变
      intersectionSignature: collectIntersectionSignature(inheritanceTree),
      // 整棵展开树的内容指纹。标签行签名靠它察觉「笔记数没变但成员换了人」以及
      // 「变化发生在子标签分组内部」两类情况 —— 这正是移除标签后不实时刷新的根因。
      // 没有继承树时退回本标签自己的可见路径，同样能覆盖成员替换。
      browseSignature: inheritanceTree
        ? collectBrowseSignature(inheritanceTree)
        : `${tag}:${exactPaths.join('|')}!${inheritedPaths.join('|')}`,
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
      inheritance.excludedPathsByParentChild[oldTag] ||
      inheritance.modeByParentChild[oldTag] ||
      [inheritance.excludedPathsByParentChild, inheritance.modeByParentChild]
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
    for (const key of ['modeByParentChild', 'excludedPathsByParentChild']) {
      const migrated: any = {};
      for (const [storedParent, children] of Object.entries<any>(inheritance[key] || {})) {
        const parent = storedParent === oldTag ? newTag : storedParent;
        for (const [storedChild, value] of Object.entries<any>(children || {})) {
          const child = storedChild === oldTag ? newTag : storedChild;
          if (parent === child) continue;
          const existing = migrated[parent]?.[child];
          const merged = Array.isArray(value)
            ? Array.from(new Set([...(Array.isArray(existing) ? existing : []), ...value]))
            // 两条边合并成一条时，交集模式优先保留（它比普通继承更强的约束）
            : (existing === 'intersection' || value === 'intersection' ? 'intersection' : value);
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
    this.reconcileIntersectionPairs();
    this.reconcileRelationCycles();
    // 相似组与继承是两套独立的关系，改名时同样要迁移，否则会留下指向旧名的死边
    this.migrateSimilarTags(oldTag, newTag);
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
    for (const key of ['excludedPathsByParentChild']) {
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
    for (const key of ['excludedPathsByParentChild']) {
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
