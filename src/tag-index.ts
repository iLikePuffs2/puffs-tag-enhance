// @ts-nocheck
import { TFile, getAllTags } from "obsidian";
import {
  INITIAL_TAG_INDEX_REFRESH_DELAYS_MS,
  TAG_VIEW_TYPE,
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

export class TagIndexBehavior {
  [key: string]: any;

  registerWorkspaceHandlers() {
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        this.handleActiveLeafChange(leaf);
        if (leaf && leaf.view && leaf.view.getViewType() === TAG_VIEW_TYPE) {
          this.scheduleFocusTagSearch(leaf.view);
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.syncSelectedSidebarState();
        this.refreshTagViews();
      })
    );

    this.registerEvent(
      this.app.workspace.on('file-open', (file) => this.handleWorkspaceFileOpen(file))
    );
  }

  registerMetadataHandlers() {
    const scheduleRefresh = (file) => this.scheduleMetadataRefresh(file);

    this.registerEvent(this.app.metadataCache.on('changed', scheduleRefresh));
    this.registerEvent(this.app.metadataCache.on('deleted', scheduleRefresh));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.handlePreferredFileRename(file, oldPath);
      this.handleNoteOrderFileRename(file, oldPath);
      this.handleNoteDisplayNameFileRename(file, oldPath);
      this.handleTagBoundNoteFileRename(file, oldPath);
      this.handleRelationFileRename(file, oldPath);
      this.refreshTagViews();
      this.refreshTagShelfViews();
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
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
  scheduleMetadataRefresh(file) {
    const changedPath = file instanceof TFile && file.extension === 'md' ? file.path : null;
    this.metadataRefreshScheduler.schedule(changedPath);
  }

  runScheduledMetadataRefresh(changedPaths = []) {
    if (this.isUnloaded) return;
    this.refreshTagIndexAndViews(changedPaths);
    this.finishTagRenameProtectionIfSettled();
  }

  refreshTagIndexAndViews(changedPath = null) {
    if (this.isUnloaded) return;

    // 索引即将变化，标签浏览数据的缓存全部作废
    this.tagBrowseCache?.invalidate();
    const noteOrderChanged = this.rebuildTagFileIndex(changedPath);
    if (noteOrderChanged) {
      this.saveSettings().catch((error) => {
        console.error('[Puffs Tag Enhance] Failed to persist note order:', error);
      });
    }
    this.refreshTagViews();
    this.refreshTagShelfViews();
  }

  queueInitialTagIndexRefreshes() {
    this.clearInitialTagIndexRefreshTimers();

    for (const delay of INITIAL_TAG_INDEX_REFRESH_DELAYS_MS) {
      const timer = window.setTimeout(() => {
        this.initialTagIndexRefreshTimers = this.initialTagIndexRefreshTimers.filter((item) => item !== timer);
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

    const oldPaths = new Set((this.tagFileIndex.get(migration.oldTag) || []).map((file) => file.path));
    const newPaths = new Set((this.tagFileIndex.get(migration.newTag) || []).map((file) => file.path));
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

  scheduleTagRenameProtectionFallback(migration) {
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

    return this.app.vault.getMarkdownFiles().every((file) => {
      return metadataCache.getFileCache(file) != null;
    });
  }

  getStableNoteOrderTags(nextIndex) {
    const existingTags = Object.keys(this.settings.noteOrderByTag)
      .filter((tag) => nextIndex.has(tag));
    const existingTagSet = new Set(existingTags);
    const addedTags = Array.from(nextIndex.keys())
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
      files.sort((a, b) => {
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

  reconcileNoteDisplayNames(nextIndex) {
    const nextDisplayNames = {};
    const savedDisplayNames = this.settings.noteDisplayNameByTag || {};

    for (const [tag, entries] of Object.entries(savedDisplayNames)) {
      if (!nextIndex.has(tag) || !entries || typeof entries !== 'object' || Array.isArray(entries)) {
        continue;
      }

      const filesByPath = new Map((nextIndex.get(tag) || []).map((file) => [file.path, file]));
      const retainedEntries = {};
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

  initializeNoteOrders(nextIndex) {
    const nextOrders = {};

    for (const tag of this.getStableNoteOrderTags(nextIndex)) {
      const files = nextIndex.get(tag) || [];
      const currentPaths = files.map((file) => file.path);
      const currentPathSet = new Set(currentPaths);
      const savedOrder = Array.isArray(this.settings.noteOrderByTag[tag])
        ? this.settings.noteOrderByTag[tag]
        : [];
      const retainedPaths = savedOrder.filter((path) => currentPathSet.has(path));
      const retainedPathSet = new Set(retainedPaths);
      const remainingPaths = currentPaths.filter((path) => !retainedPathSet.has(path));
      const order = retainedPaths.concat(remainingPaths);
      if (order.length > 0) nextOrders[tag] = order;
    }

    const changed = JSON.stringify(nextOrders) !== JSON.stringify(this.settings.noteOrderByTag);
    if (changed) this.settings.noteOrderByTag = nextOrders;
    return changed;
  }

  reconcileNoteOrders(nextIndex, changedPath = null) {
    const nextOrders = {};
    // 防抖后一个窗口内可能有多个文件变更，统一按数组处理（仍兼容单个字符串）
    const changedPaths = Array.isArray(changedPath)
      ? changedPath.filter(Boolean)
      : (changedPath ? [changedPath] : []);

    for (const tag of this.getStableNoteOrderTags(nextIndex)) {
      const files = nextIndex.get(tag) || [];
      const currentPaths = files.map((file) => file.path);
      const currentPathSet = new Set(currentPaths);
      const savedOrder = Array.isArray(this.settings.noteOrderByTag[tag])
        ? this.settings.noteOrderByTag[tag]
        : [];
      const savedPathSet = new Set(savedOrder);
      const rawAddedPaths = currentPaths.filter((path) => !savedPathSet.has(path));

      // 插件关闭期间移动过的笔记，旧路径已失效、新路径看起来像新增。
      // 按文件名唯一匹配把顺序迁移过去，保住原有排序位置。
      const missingPaths = savedOrder.filter((path) => !currentPathSet.has(path));
      const movedPaths = resolveMovedPaths(missingPaths, rawAddedPaths);
      const retainedPaths = savedOrder
        .map((path) => (currentPathSet.has(path) ? path : movedPaths.get(path)))
        .filter(Boolean);
      const movedTargets = new Set(movedPaths.values());
      const addedPaths = rawAddedPaths.filter((path) => !movedTargets.has(path));

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
      if (order.length > 0) nextOrders[tag] = order;
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

  getExactTagsForFile(file) {
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


  async renameTag(oldTagValue, newTagValue) {
    const oldTag = normalizeTag(oldTagValue);
    const newTag = normalizeTag(newTagValue);

    if (!oldTag) throw new Error('原标签无效');
    if (!newTag) throw new Error('标签名称不能为空');
    if (/\s/.test(getTagDisplayName(newTag))) throw new Error('标签名称不能包含空格');
    if (oldTag === newTag) return;
    if (this.activeTagRename) throw new Error('上一次标签修改仍在同步，请稍后再试');

    this.rebuildTagFileIndex();
    const files = Array.from(new Set(this.tagFileIndex.get(oldTag) || []));
    const oldNoteOrder = this.getOrderedFilesForTag(oldTag, files).map((file) => file.path);
    const existingNewFiles = Array.from(new Set(this.tagFileIndex.get(newTag) || []));
    const existingNewOrder = this.getOrderedFilesForTag(newTag, existingNewFiles).map((file) => file.path);
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
      affectedPaths: new Set(files.map((file) => file.path)),
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

  fileHasFrontmatterTag(file, tagValue) {
    const cache = this.app.metadataCache.getFileCache(file);
    return frontmatterTagValueHasTag(
      cache && cache.frontmatter && cache.frontmatter.tags,
      tagValue
    );
  }

  fileHasInlineTag(file, tagValue) {
    const tag = normalizeTag(tagValue);
    if (!tag) return false;

    const cache = this.app.metadataCache.getFileCache(file);
    return Array.isArray(cache && cache.tags) && cache.tags.some((tagEntry) => {
      return normalizeTag(tagEntry && tagEntry.tag) === tag;
    });
  }

  async addTagToTaggedNotes(sourceTagValue, newTagValue) {
    await this.updateTagPropertiesForTaggedNotes('add', sourceTagValue, newTagValue);
  }

  async deleteTagFromTaggedNotes(sourceTagValue, targetTagValue) {
    await this.updateTagPropertiesForTaggedNotes('delete', sourceTagValue, targetTagValue);
  }

  async updateTagPropertiesForTaggedNotes(mode, sourceTagValue, targetTagValue) {
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
    const files = orderedSourceFiles.filter((file) => {
      const hasTag = this.fileHasFrontmatterTag(file, targetTag);
      return mode === 'add' ? !hasTag : hasTag;
    });
    if (files.length === 0) return;

    const existingTargetFiles = Array.from(new Set(this.tagFileIndex.get(targetTag) || []));
    const existingTargetOrder = this.getOrderedFilesForTag(targetTag, existingTargetFiles)
      .map((file) => file.path);
    const existingTargetPaths = new Set(existingTargetFiles.map((file) => file.path));
    const affectedPaths = new Set(files.map((file) => file.path));
    const migration = {
      mode,
      targetTag,
      affectedPaths,
      committed: false,
    };

    this.activeTagRename = migration;

    try {
      for (const file of files) {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
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
          .map((file) => file.path)
          .filter((path) => !existingTargetPaths.has(path));
        const nextOrder = this.settings.newNotePosition === 'start'
          ? newlyAddedPaths.concat(existingTargetOrder)
          : existingTargetOrder.concat(newlyAddedPaths);
        if (nextOrder.length > 0) this.settings.noteOrderByTag[targetTag] = Array.from(new Set(nextOrder));
      } else {
        const removedPaths = new Set(
          files
            .filter((file) => !this.fileHasInlineTag(file, targetTag))
            .map((file) => file.path)
        );
        const nextOrder = existingTargetOrder.filter((path) => !removedPaths.has(path));
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

  async renameTagInFile(file, oldTag, newTag) {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return;

    const hasInlineTag = Array.isArray(cache.tags) && cache.tags.some((tagEntry) => {
      return normalizeTag(tagEntry && tagEntry.tag) === oldTag;
    });

    if (hasInlineTag) {
      await this.app.vault.process(file, (content) => {
        const nextContent = replaceInlineTagsByCache(content, cache, oldTag, newTag);
        return nextContent === content ? replaceInlineTagsByText(content, oldTag, newTag) : nextContent;
      });
    }

    const frontmatter = cache.frontmatter;
    if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, 'tags')) return;

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (!Object.prototype.hasOwnProperty.call(fm, 'tags')) return;
      fm.tags = replaceFrontmatterTagValue(fm.tags, oldTag, newTag);
    });
  }

}
