import { TFile, getAllTags } from "obsidian";
import {
  INITIAL_TAG_INDEX_REFRESH_DELAYS_MS,
  flattenFrontmatterTags,
  frontmatterTagValueHasTag,
  getTagDisplayName,
  isNestedTag,
  normalizeTag,
  replaceFrontmatterTagValue,
  replaceInlineTagsByCache,
  replaceInlineTagsByText
} from "./models";
import { countOrderedPaths, evaluateReconcileSafety, resolveMovedPaths } from "./data/tag-store";
import { isDefaultNoteOrder } from "./data/schema";

export class TagIndexBehavior {
  [key: string]: any;

  registerWorkspaceHandlers() {
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf: any) => {
        this.handleActiveLeafChange(leaf);
      })
    );

    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.syncSelectedSidebarState();
        this.refreshAllTagViews();
      })
    );

    this.registerEvent(
      this.app.workspace.on('file-open', (file: any) => this.handleWorkspaceFileOpen(file))
    );
  }

  registerMetadataHandlers() {
    const scheduleRefresh = (file: any) => this.scheduleMetadataRefresh(file);

    this.registerEvent(this.app.metadataCache.on('changed', scheduleRefresh));
    this.registerEvent(this.app.metadataCache.on('deleted', scheduleRefresh));
    this.registerEvent(this.app.vault.on('rename', (file: any, oldPath: any) => {
      this.handlePreferredFileRename(file, oldPath);
      this.handleNoteOrderFileRename(file, oldPath);
      this.handleNoteDisplayNameFileRename(file, oldPath);
      this.handleTagBoundNoteFileRename(file, oldPath);
      this.handleRelationFileRename(file, oldPath);
      this.refreshAllTagViews();
    }));
    this.registerEvent(this.app.vault.on('delete', (file: any) => {
      this.handlePreferredFileDelete(file);
      this.handleNoteOrderFileDelete(file);
      this.handleNoteDisplayNameFileDelete(file);
      this.handleTagBoundNoteFileDelete(file);
      this.handleRelationFileDelete(file);
      scheduleRefresh(file);
    }));
  }

  registerInitialMetadataRefresh() {
    const metadataCache = this.app.metadataCache;
    if (!metadataCache || typeof metadataCache.onCleanCache !== 'function') return;

    metadataCache.onCleanCache(() => {
      if (this.isUnloaded) return;

      this.refreshTagIndexAndViews();
      this.queueInitialTagIndexRefreshes();
    });
  }

  /**
   * 元数据变更入口。原实现每收到一个 changed 事件就全量重建索引（遍历 2191 个文件），
   * 批量保存或仓库同步时会连续触发数十次。现在交给调度器按 150ms 窗口合并，
   * 窗口内累积的路径一并交给顺序对账。
   */
  scheduleMetadataRefresh(file: any) {
    const changedPath = file instanceof TFile && file.extension === 'md' ? file.path : null;
    this.metadataRefreshScheduler.schedule(changedPath);
  }

  runScheduledMetadataRefresh(changedPaths: any = []) {
    if (this.isUnloaded) return;
    this.refreshTagIndexAndViews(changedPaths);
    this.finishTagRenameProtectionIfSettled();
  }

  refreshTagIndexAndViews(changedPath: any = null) {
    if (this.isUnloaded) return;

    // 索引即将变化，标签浏览数据的缓存全部作废
    this.tagBrowseCache?.invalidate();
    const noteOrderChanged = this.rebuildTagFileIndex(changedPath);
    if (noteOrderChanged) {
      this.saveSettings().catch((error: any) => {
        console.error('[Puffs Tag Enhance] Failed to persist note order:', error);
      });
    }
    this.refreshAllTagViews();
  }

  queueInitialTagIndexRefreshes() {
    this.clearInitialTagIndexRefreshTimers();

    for (const delay of INITIAL_TAG_INDEX_REFRESH_DELAYS_MS) {
      const timer = window.setTimeout(() => {
        this.initialTagIndexRefreshTimers = this.initialTagIndexRefreshTimers.filter((item: any) => item !== timer);
        this.refreshTagIndexAndViews();
      }, delay);

      this.initialTagIndexRefreshTimers.push(timer);
    }
  }

  clearInitialTagIndexRefreshTimers() {
    for (const timer of this.initialTagIndexRefreshTimers) {
      window.clearTimeout(timer);
    }

    this.initialTagIndexRefreshTimers = [];
  }

  clearTagRenameProtectionTimer() {
    if (!this.tagRenameProtectionTimer) return;
    window.clearTimeout(this.tagRenameProtectionTimer);
    this.tagRenameProtectionTimer = null;
  }

  isTagRenameMetadataSettled(migration = this.activeTagRename) {
    if (!migration || !migration.committed) return false;

    if (migration.mode === 'add' || migration.mode === 'delete') {
      const shouldHaveTag = migration.mode === 'add';
      return Array.from(migration.affectedPaths).every((path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return false;

        const cache = this.app.metadataCache.getFileCache(file);
        const hasTag = frontmatterTagValueHasTag(
          cache && cache.frontmatter && cache.frontmatter.tags,
          migration.targetTag
        );
        return hasTag === shouldHaveTag;
      });
    }

    const oldPaths = new Set((this.tagFileIndex.get(migration.oldTag) || []).map((file: any) => file.path));
    const newPaths = new Set((this.tagFileIndex.get(migration.newTag) || []).map((file: any) => file.path));
    return Array.from(migration.affectedPaths).every((path) => !oldPaths.has(path) && newPaths.has(path));
  }

  finishTagRenameProtectionIfSettled() {
    const migration = this.activeTagRename;
    if (!this.isTagRenameMetadataSettled(migration)) return false;

    this.clearTagRenameProtectionTimer();
    this.activeTagRename = null;
    this.refreshTagIndexAndViews();
    return true;
  }

  scheduleTagRenameProtectionFallback(migration: any) {
    this.clearTagRenameProtectionTimer();
    this.tagRenameProtectionTimer = window.setTimeout(() => {
      this.tagRenameProtectionTimer = null;
      if (this.activeTagRename !== migration) return;

      this.activeTagRename = null;
      this.refreshTagIndexAndViews();
    }, 5000);
  }

  isMetadataCacheReadyForNoteOrderTracking() {
    const metadataCache = this.app.metadataCache;
    if (!metadataCache || metadataCache.initialized !== true) return false;
    if (metadataCache.inProgressTaskCount !== 0) return false;

    return this.app.vault.getMarkdownFiles().every((file: any) => {
      return metadataCache.getFileCache(file) != null;
    });
  }

  getStableNoteOrderTags(nextIndex: any) {
    const existingTags = Object.keys(this.settings.noteOrderByTag)
      .filter((tag) => nextIndex.has(tag));
    const existingTagSet = new Set(existingTags);
    const addedTags: any[] = Array.from<any>(nextIndex.keys())
      .filter((tag) => !existingTagSet.has(tag))
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    return existingTags.concat(addedTags);
  }

  rebuildTagFileIndex(changedPath = null) {
    const nextIndex = new Map();

    for (const file of this.app.vault.getMarkdownFiles()) {
      const tags = this.getExactTagsForFile(file);

      for (const tag of tags) {
        if (!nextIndex.has(tag)) nextIndex.set(tag, []);
        nextIndex.get(tag).push(file);
      }
    }

    for (const files of nextIndex.values()) {
      files.sort((a: any, b: any) => {
        const byName = a.basename.localeCompare(b.basename, 'zh-Hans-CN');
        return byName || a.path.localeCompare(b.path, 'zh-Hans-CN');
      });
    }

    const metadataCacheReady = this.isMetadataCacheReadyForNoteOrderTracking();
    let noteOrderChanged = false;
    if (!this.noteOrderTrackingReady) {
      if (metadataCacheReady) {
        noteOrderChanged = this.initializeNoteOrders(nextIndex);
        this.noteOrderTrackingReady = true;
      }
    } else if (this.noteOrderTrackingReady && !this.activeTagRename) {
      noteOrderChanged = this.reconcileNoteOrders(nextIndex, changedPath);
    }

    this.tagFileIndex = nextIndex;
    const tagInheritanceOrderChanged = metadataCacheReady
      ? this.initializeTagInheritanceOrder()
      : false;
    if (!this.tagBindingTrackingReady && metadataCacheReady) this.tagBindingTrackingReady = true;
    this.reconcileExpandedTags();
    const pinnedTagChanged = this.reconcilePinnedTag();
    const noteDisplayNamesChanged = !this.activeTagRename
      ? this.reconcileNoteDisplayNames(nextIndex)
      : false;
    const tagBoundNotesChanged = this.tagBindingTrackingReady && !this.activeTagRename
      ? this.reconcileTagBoundNotes(nextIndex)
      : false;
    return noteOrderChanged || tagInheritanceOrderChanged || pinnedTagChanged || noteDisplayNamesChanged || tagBoundNotesChanged;
  }

  reconcileNoteDisplayNames(nextIndex: any) {
    const nextDisplayNames: any = {};
    const savedDisplayNames = this.settings.noteDisplayNameByTag || {};

    for (const [tag, entries] of Object.entries(savedDisplayNames)) {
      if (!nextIndex.has(tag) || !entries || typeof entries !== 'object' || Array.isArray(entries)) {
        continue;
      }

      const filesByPath = new Map((nextIndex.get(tag) || []).map((file: any) => [file.path, file]));
      const retainedEntries: any = {};
      for (const [path, displayName] of Object.entries(entries)) {
        const file = filesByPath.get(path);
        if (!file || !this.getNoteAliases(file).includes(displayName)) continue;
        retainedEntries[path] = displayName;
      }

      if (Object.keys(retainedEntries).length > 0) nextDisplayNames[tag] = retainedEntries;
    }

    const changed =
      JSON.stringify(nextDisplayNames) !== JSON.stringify(this.settings.noteDisplayNameByTag || {});
    if (changed) this.settings.noteDisplayNameByTag = nextDisplayNames;
    return changed;
  }

  initializeNoteOrders(nextIndex: any) {
    const nextOrders: any = {};

    for (const tag of this.getStableNoteOrderTags(nextIndex)) {
      const files = nextIndex.get(tag) || [];
      const currentPaths = files.map((file: any) => file.path);
      const currentPathSet = new Set(currentPaths);
      const savedOrder = Array.isArray(this.settings.noteOrderByTag[tag])
        ? this.settings.noteOrderByTag[tag]
        : [];
      const retainedPaths = savedOrder.filter((path) => currentPathSet.has(path));
      const retainedPathSet = new Set(retainedPaths);
      const remainingPaths = currentPaths.filter((path: any) => !retainedPathSet.has(path));
      const order = retainedPaths.concat(remainingPaths);
      // 顺序与默认序完全一致时不落盘：读取时缺失的标签本就回落到默认序，
      // 存了等于不存。实测能省掉约四分之一的顺序记录。
      if (order.length > 0 && !isDefaultNoteOrder(order, files)) nextOrders[tag] = order;
    }

    const changed = JSON.stringify(nextOrders) !== JSON.stringify(this.settings.noteOrderByTag);
    if (changed) this.settings.noteOrderByTag = nextOrders;
    return changed;
  }

  reconcileNoteOrders(nextIndex: any, changedPath: any = null) {
    const nextOrders: any = {};
    // 防抖后一个窗口内可能有多个文件变更，统一按数组处理（仍兼容单个字符串）
    const changedPaths = Array.isArray(changedPath)
      ? changedPath.filter(Boolean)
      : (changedPath ? [changedPath] : []);

    for (const tag of this.getStableNoteOrderTags(nextIndex)) {
      const files = nextIndex.get(tag) || [];
      const currentPaths = files.map((file: any) => file.path);
      const currentPathSet = new Set(currentPaths);
      const savedOrder = Array.isArray(this.settings.noteOrderByTag[tag])
        ? this.settings.noteOrderByTag[tag]
        : [];
      const savedPathSet = new Set(savedOrder);
      const rawAddedPaths = currentPaths.filter((path: any) => !savedPathSet.has(path));

      // 插件关闭期间移动过的笔记，旧路径已失效、新路径看起来像新增。
      // 按文件名唯一匹配把顺序迁移过去，保住原有排序位置。
      const missingPaths = savedOrder.filter((path) => !currentPathSet.has(path));
      const movedPaths = resolveMovedPaths(missingPaths, rawAddedPaths);
      const retainedPaths = savedOrder
        .map((path) => (currentPathSet.has(path) ? path : movedPaths.get(path)))
        .filter(Boolean);
      const movedTargets = new Set(movedPaths.values());
      const addedPaths = rawAddedPaths.filter((path: any) => !movedTargets.has(path));

      // 刚变更的笔记排在其他新增之后
      for (const path of changedPaths) {
        const index = addedPaths.indexOf(path);
        if (index < 0) continue;
        addedPaths.splice(index, 1);
        addedPaths.push(path);
      }

      const order = this.settings.newNotePosition === 'start'
        ? addedPaths.reverse().concat(retainedPaths)
        : retainedPaths.concat(addedPaths);
      // 顺序与默认序完全一致时不落盘：读取时缺失的标签本就回落到默认序，
      // 存了等于不存。实测能省掉约四分之一的顺序记录。
      if (order.length > 0 && !isDefaultNoteOrder(order, files)) nextOrders[tag] = order;
    }

    const changed = JSON.stringify(nextOrders) !== JSON.stringify(this.settings.noteOrderByTag);
    if (!changed) {
      this.blockedReconcileSignature = null;
      return false;
    }

    // 安全阀：元数据缓存未就绪时会短暂查不到大量文件，照常对账会把它们当作已删除、
    // 连带丢弃手工排序。清理比例过高就先拦下，等下一轮再看。
    const verdict = evaluateReconcileSafety(
      countOrderedPaths(this.settings.noteOrderByTag),
      countOrderedPaths(nextOrders)
    );
    if (!verdict.safe) {
      const signature = JSON.stringify(nextOrders);
      if (this.blockedReconcileSignature !== signature) {
        // 首次拦下并记住结果；若下一轮得到完全相同的结果，说明不是瞬时异常而是
        // 用户真的批量删除了笔记，那时再放行，避免安全阀永久阻塞对账。
        this.blockedReconcileSignature = signature;
        console.warn(`[Puffs Tag Enhance] 顺序对账安全阀已拦下本次写入：${verdict.reason}`);
        return false;
      }
      console.warn(`[Puffs Tag Enhance] 顺序对账安全阀二次确认，放行本次清理：${verdict.reason}`);
    }

    this.blockedReconcileSignature = null;
    this.settings.noteOrderByTag = nextOrders;
    return true;
  }

  getExactTagsForFile(file: any) {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return new Set();

    const tags = new Set();
    const allTags = typeof getAllTags === 'function' ? getAllTags(cache) : null;

    if (Array.isArray(allTags)) {
      for (const rawTag of allTags) {
        const tag = normalizeTag(rawTag);
        if (tag) tags.add(tag);
      }
    } else {
      if (Array.isArray(cache.tags)) {
        for (const rawTag of cache.tags) {
          const tag = normalizeTag(rawTag && rawTag.tag);
          if (tag) tags.add(tag);
        }
      }

      const frontmatterTags = flattenFrontmatterTags(cache.frontmatter && cache.frontmatter.tags);
      for (const rawTag of frontmatterTags) {
        const tag = normalizeTag(rawTag);
        if (tag) tags.add(tag);
      }
    }

    return tags;
  }

  reconcileExpandedTags() {
    for (const tag of Array.from(this.expandedTags)) {
      if (!String(tag).startsWith('intersection:') && !this.tagFileIndex.has(tag)) {
        this.expandedTags.delete(tag);
        this.clearInlineHierarchyBranchState(tag);
      }
    }
  }

  reconcilePinnedTag() {
    const pinnedTag = normalizeTag(this.settings.pinnedTag);
    if (!pinnedTag || this.activeTagRename || !this.noteOrderTrackingReady) return false;
    if (!this.isFixedChild(pinnedTag) && !isNestedTag(pinnedTag) && (this.tagFileIndex.get(pinnedTag) || []).length > 0) return false;

    this.settings.pinnedTag = null;
    return true;
  }


  async renameTag(oldTagValue: any, newTagValue: any) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);

    if (!oldTag) throw new Error('原标签无效');
    if (!newTag) throw new Error('标签名称不能为空');
    if (/\s/.test(getTagDisplayName(newTag))) throw new Error('标签名称不能包含空格');
    if (oldTag === newTag) return;
    if (this.activeTagRename) throw new Error('上一次标签修改仍在同步，请稍后再试');

    this.rebuildTagFileIndex();
    const files = Array.from(new Set(this.tagFileIndex.get(oldTag) || []));
    const oldNoteOrder = this.getOrderedFilesForTag(oldTag, files).map((file: any) => file.path);
    const existingNewFiles = Array.from(new Set(this.tagFileIndex.get(newTag) || []));
    const existingNewOrder = this.getOrderedFilesForTag(newTag, existingNewFiles).map((file: any) => file.path);
    const migratedOrder = Array.from(new Set([...oldNoteOrder, ...existingNewOrder]));
    const oldDisplayNames = {
      ...((this.settings.noteDisplayNameByTag && this.settings.noteDisplayNameByTag[oldTag]) || {}),
    };
    const existingNewDisplayNames = {
      ...((this.settings.noteDisplayNameByTag && this.settings.noteDisplayNameByTag[newTag]) || {}),
    };
    const migration = {
      mode: 'rename',
      oldTag,
      newTag,
      affectedPaths: new Set(files.map((file: any) => file.path)),
      committed: false,
    };

    this.activeTagRename = migration;

    try {
      for (const file of files) {
        await this.renameTagInFile(file, oldTag, newTag);
      }

      if (this.expandedTags.delete(oldTag)) {
        this.expandedTags.add(newTag);
      }
      if (this.settings.pinnedTag === oldTag) {
        this.settings.pinnedTag = newTag;
      }
      this.migrateTagRelations(oldTag, newTag);
      this.migrateTagBoundNote(oldTag, newTag);

      if (migratedOrder.length > 0) {
        this.settings.noteOrderByTag[newTag] = migratedOrder;
      } else {
        delete this.settings.noteOrderByTag[newTag];
      }
      delete this.settings.noteOrderByTag[oldTag];
      this.settings.noteOrderByTag = this.normalizeNoteOrderByTag(this.settings.noteOrderByTag);
      const migratedDisplayNames = { ...oldDisplayNames, ...existingNewDisplayNames };
      if (Object.keys(migratedDisplayNames).length > 0) {
        this.settings.noteDisplayNameByTag[newTag] = migratedDisplayNames;
      } else {
        delete this.settings.noteDisplayNameByTag[newTag];
      }
      delete this.settings.noteDisplayNameByTag[oldTag];
      this.settings.noteDisplayNameByTag = this.normalizeNoteDisplayNameByTag(
        this.settings.noteDisplayNameByTag
      );
      await this.saveSettings();

      migration.committed = true;
      this.refreshTagIndexAndViews();
      if (!this.finishTagRenameProtectionIfSettled()) {
        this.scheduleTagRenameProtectionFallback(migration);
      }
    } catch (error) {
      if (this.activeTagRename === migration) {
        this.activeTagRename = null;
        this.clearTagRenameProtectionTimer();
        this.refreshTagIndexAndViews();
      }
      throw error;
    }
  }

  fileHasFrontmatterTag(file: any, tagValue: any) {
    const cache = this.app.metadataCache.getFileCache(file);
    return frontmatterTagValueHasTag(
      cache && cache.frontmatter && cache.frontmatter.tags,
      tagValue
    );
  }

  fileHasInlineTag(file: any, tagValue: any) {
    const tag = normalizeTag(tagValue);
    if (!tag) return false;

    const cache = this.app.metadataCache.getFileCache(file);
    return Array.isArray(cache && cache.tags) && cache.tags.some((tagEntry: any) => {
      return normalizeTag(tagEntry && tagEntry.tag) === tag;
    });
  }

  async addTagToTaggedNotes(sourceTagValue: any, newTagValue: any, selectedPaths: any = null) {
    await this.updateTagPropertiesForTaggedNotes('add', sourceTagValue, newTagValue, selectedPaths);
  }

  async deleteTagFromTaggedNotes(sourceTagValue: any, targetTagValue: any, selectedPaths: any = null) {
    await this.updateTagPropertiesForTaggedNotes('delete', sourceTagValue, targetTagValue, selectedPaths);
  }

  /**
   * selectedPaths 为批量操作弹窗勾选的笔记路径白名单。
   * 传 null/undefined 时保持历史的「标签下全部笔记」行为，供旧入口继续使用。
   */
  async updateTagPropertiesForTaggedNotes(
    mode: any,
    sourceTagValue: any,
    targetTagValue: any,
    selectedPaths: any = null
  ) {
    const sourceTag = normalizeTag(sourceTagValue);
    const targetTag = normalizeTag(targetTagValue);

    if (!sourceTag) throw new Error('原标签无效');
    if (!targetTag) throw new Error('标签名称不能为空');
    if (/\s/.test(getTagDisplayName(targetTag))) throw new Error('标签名称不能包含空格');
    if (mode !== 'add' && mode !== 'delete') throw new Error('不支持的标签操作');
    if (this.activeTagRename) throw new Error('上一次标签修改仍在同步，请稍后再试');

    this.rebuildTagFileIndex();
    const sourceFiles = Array.from(new Set(this.tagFileIndex.get(sourceTag) || []));
    const orderedSourceFiles = this.getOrderedFilesForTag(sourceTag, sourceFiles);
    const files = orderedSourceFiles.filter((file: any) => {
      if (selectedPaths && !selectedPaths.has(file.path)) return false;
      const hasTag = this.fileHasFrontmatterTag(file, targetTag);
      return mode === 'add' ? !hasTag : hasTag;
    });
    if (files.length === 0) return;

    const existingTargetFiles = Array.from(new Set(this.tagFileIndex.get(targetTag) || []));
    const existingTargetOrder = this.getOrderedFilesForTag(targetTag, existingTargetFiles)
      .map((file: any) => file.path);
    const existingTargetPaths = new Set(existingTargetFiles.map((file: any) => file.path));
    const affectedPaths = new Set(files.map((file: any) => file.path));
    const migration = {
      mode,
      targetTag,
      affectedPaths,
      committed: false,
    };

    this.activeTagRename = migration;

    try {
      for (const file of files) {
        await this.app.fileManager.processFrontMatter(file, (fm: any) => {
          const tags = flattenFrontmatterTags(fm.tags);

          if (mode === 'add') {
            if (tags.some((item) => normalizeTag(item) === targetTag)) return;
            fm.tags = tags.concat(getTagDisplayName(targetTag));
            return;
          }

          const remainingTags = tags.filter((item) => normalizeTag(item) !== targetTag);
          if (remainingTags.length > 0) fm.tags = remainingTags;
          else delete fm.tags;
        });
      }

      if (mode === 'add') {
        const newlyAddedPaths = files
          .map((file: any) => file.path)
          .filter((path: any) => !existingTargetPaths.has(path));
        const nextOrder = this.settings.newNotePosition === 'start'
          ? newlyAddedPaths.concat(existingTargetOrder)
          : existingTargetOrder.concat(newlyAddedPaths);
        if (nextOrder.length > 0) this.settings.noteOrderByTag[targetTag] = Array.from(new Set(nextOrder));
      } else {
        const removedPaths = new Set(
          files
            .filter((file: any) => !this.fileHasInlineTag(file, targetTag))
            .map((file: any) => file.path)
        );
        const nextOrder = existingTargetOrder.filter((path: any) => !removedPaths.has(path));
        if (nextOrder.length > 0) this.settings.noteOrderByTag[targetTag] = nextOrder;
        else delete this.settings.noteOrderByTag[targetTag];
      }

      this.settings.noteOrderByTag = this.normalizeNoteOrderByTag(this.settings.noteOrderByTag);
      await this.saveSettings();

      migration.committed = true;
      this.refreshTagIndexAndViews();
      if (!this.finishTagRenameProtectionIfSettled()) {
        this.scheduleTagRenameProtectionFallback(migration);
      }
    } catch (error) {
      if (this.activeTagRename === migration) {
        this.activeTagRename = null;
        this.clearTagRenameProtectionTimer();
        this.refreshTagIndexAndViews();
      }
      throw error;
    }
  }

  /**
   * 只把选中笔记里的 sourceTag 换成 targetTag。
   *
   * 与全局的 renameTag 有意分开：这里改完之后源标签通常仍然存在（还有别的笔记挂着它），
   * 所以绝不能迁移 expandedTags / pinnedTag / 标签关系 / 绑定笔记——那些是「标签本身改名」
   * 才成立的动作，在部分改名场景下迁移会直接破坏数据。这里只做两件事：逐文件改写标签文本、
   * 维护两个标签的笔记顺序记录。
   *
   * 选中但不持有 sourceTag 的笔记会被静默跳过。
   */
  async renameTagInSelectedNotes(sourceTagValue: any, targetTagValue: any, selectedPaths: any = null) {
    const sourceTag = normalizeTag(sourceTagValue);
    const targetTag = normalizeTag(targetTagValue);

    if (!sourceTag) throw new Error('原标签无效');
    if (!targetTag) throw new Error('标签名称不能为空');
    if (/\s/.test(getTagDisplayName(targetTag))) throw new Error('标签名称不能包含空格');
    if (sourceTag === targetTag) return;
    if (this.activeTagRename) throw new Error('上一次标签修改仍在同步，请稍后再试');

    this.rebuildTagFileIndex();
    const sourceFiles = Array.from(new Set(this.tagFileIndex.get(sourceTag) || []));
    const files = this.getOrderedFilesForTag(sourceTag, sourceFiles)
      .filter((file: any) => !selectedPaths || selectedPaths.has(file.path));
    if (files.length === 0) return;

    const existingTargetFiles = Array.from(new Set(this.tagFileIndex.get(targetTag) || []));
    const existingTargetOrder = this.getOrderedFilesForTag(targetTag, existingTargetFiles)
      .map((file: any) => file.path);
    const existingTargetPaths = new Set(existingTargetFiles.map((file: any) => file.path));
    const affectedPaths = new Set(files.map((file: any) => file.path));
    const migration = {
      mode: 'rename',
      oldTag: sourceTag,
      newTag: targetTag,
      affectedPaths,
      committed: false,
    };

    this.activeTagRename = migration;

    try {
      for (const file of files) {
        await this.renameTagInFile(file, sourceTag, targetTag);
      }

      // 改动的笔记并入目标标签顺序；已在目标标签下的不重复插入
      const newlyAddedPaths = files
        .map((file: any) => file.path)
        .filter((path: any) => !existingTargetPaths.has(path));
      const nextTargetOrder = this.settings.newNotePosition === 'start'
        ? newlyAddedPaths.concat(existingTargetOrder)
        : existingTargetOrder.concat(newlyAddedPaths);
      if (nextTargetOrder.length > 0) {
        this.settings.noteOrderByTag[targetTag] = Array.from(new Set(nextTargetOrder));
      }

      // 源标签顺序里移除那些已经不再持有它的笔记（行内标签可能仍在，判据与增删路径一致）
      const sourceOrder = this.settings.noteOrderByTag[sourceTag];
      if (Array.isArray(sourceOrder)) {
        const nextSourceOrder = sourceOrder.filter((path: any) => !affectedPaths.has(path));
        if (nextSourceOrder.length > 0) this.settings.noteOrderByTag[sourceTag] = nextSourceOrder;
        else delete this.settings.noteOrderByTag[sourceTag];
      }

      this.settings.noteOrderByTag = this.normalizeNoteOrderByTag(this.settings.noteOrderByTag);
      await this.saveSettings();

      migration.committed = true;
      this.refreshTagIndexAndViews();
      if (!this.finishTagRenameProtectionIfSettled()) {
        this.scheduleTagRenameProtectionFallback(migration);
      }
    } catch (error) {
      if (this.activeTagRename === migration) {
        this.activeTagRename = null;
        this.clearTagRenameProtectionTimer();
        this.refreshTagIndexAndViews();
      }
      throw error;
    }
  }

  async renameTagInFile(file: any, oldTag: any, newTag: any) {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return;

    const hasInlineTag = Array.isArray(cache.tags) && cache.tags.some((tagEntry: any) => {
      return normalizeTag(tagEntry && tagEntry.tag) === oldTag;
    });

    if (hasInlineTag) {
      await this.app.vault.process(file, (content: any) => {
        const nextContent = replaceInlineTagsByCache(content, cache, oldTag, newTag);
        return nextContent === content ? replaceInlineTagsByText(content, oldTag, newTag) : nextContent;
      });
    }

    const frontmatter = cache.frontmatter;
    if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, 'tags')) return;

    await this.app.fileManager.processFrontMatter(file, (fm: any) => {
      if (!Object.prototype.hasOwnProperty.call(fm, 'tags')) return;
      fm.tags = replaceFrontmatterTagValue(fm.tags, oldTag, newTag);
    });
  }

}
