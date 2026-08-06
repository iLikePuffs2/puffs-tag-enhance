// 渲染层：侧边栏视图注册表与工作区编排。
//
// 取代原先 refreshTagViews() + refreshTagShelfViews() 的双份广播 —— 两处都得记着调用，
// 漏一个就出现"一边刷新了、另一边还是旧数据"。现在统一走 refreshAllTagViews()。

import { Notice } from "obsidian";
import {
  OUTLINE_VIEW_TYPE,
  TAG_SHELF_VIEW_TYPE,
  TAG_SIDEBAR_VIEW_TYPE,
  TAG_VIEW_TYPE,
} from "../models";

const TOGGLE_RIGHT_SIDEBAR_COMMAND_ID = 'app:toggle-right-sidebar';

export class SidebarRegistryBehavior {
  [key: string]: any;

  /**
   * 所有在场的自绘侧边栏视图。
   *
   * 直接向 workspace 查询而不维护注册表：视图实例的生命周期由 Obsidian 管理，
   * 插件重载时旧实例会把自己注册到已失效的 plugin 对象上，注册表随即失准
   * （实测重载后注册表为空、刷新广播找不到视图）。查询没有这个时序问题。
   */
  getSidebarViews() {
    return (this.app.workspace.getLeavesOfType(TAG_SIDEBAR_VIEW_TYPE) || [])
      .map((leaf: any) => leaf.view)
      .filter((view: any) => view && typeof view.requestRender === 'function');
  }

  /** 统一的刷新入口，取代原先 refreshTagViews + refreshTagShelfViews 的双份广播。 */
  refreshAllTagViews() {
    for (const view of this.getSidebarViews()) {
      view.requestRender();
    }
  }

  /** 设置里改了快捷键或顶栏按钮后，让在场的视图重新装配。 */
  refreshSidebarHotkeys() {
    for (const view of this.getSidebarViews()) {
      view.registerSearchHotkey();
      view.rebuildToolbar();
    }
  }

  /** 取当前可见的自绘侧边栏，找不到则返回 null。 */
  getVisibleSidebarView() {
    return this.getSidebarViews().find((view: any) => {
      const leaf = view.leaf;
      if (leaf && typeof leaf.isVisible === 'function') return leaf.isVisible();
      return !!view.containerEl?.isShown?.();
    }) || null;
  }

  getFocusedSidebarView() {
    return this.getSidebarViews().find((view: any) => view.isActiveView()) || null;
  }

  /**
   * 打开、聚焦或收起标签侧边栏。
   *
   * 原实现依赖核心插件的 `tag-pane:open` 命令，并在核心插件未启用时弹提示。
   * 现在完全走自有视图，与核心插件无关。
   */
  async toggleTagSidebar() {
    const view = this.getVisibleSidebarView();
    if (view) {
      // 父子层级页里先退回标签列表，与改造前一致
      if (view.exitHierarchySearch()) {
        await this.focusSidebarView(view);
        return;
      }
      if (!view.isActiveView()) {
        await this.focusSidebarView(view);
        return;
      }
      await this.app.commands.executeCommandById(TOGGLE_RIGHT_SIDEBAR_COMMAND_ID);
      return;
    }

    await this.openTagSidebar();
  }

  async openTagSidebar(reveal = true) {
    let leaf = this.app.workspace.getLeavesOfType(TAG_SIDEBAR_VIEW_TYPE)[0] || null;
    if (!leaf) {
      leaf = this.findManagedSidebarTabGroup() && typeof this.app.workspace.createLeafInTabGroup === 'function'
        ? this.app.workspace.createLeafInTabGroup(this.findManagedSidebarTabGroup())
        : this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        new Notice('无法打开标签侧边栏');
        return null;
      }
      await leaf.setViewState({ type: TAG_SIDEBAR_VIEW_TYPE, active: false });
    }
    if (reveal) await this.focusSidebarView(leaf.view, leaf);
    return leaf;
  }

  async focusSidebarView(view: any, leaf: any = view?.leaf) {
    if (!leaf) return;
    if (this.app.workspace.revealLeaf) await this.app.workspace.revealLeaf(leaf);
    if (this.app.workspace.setActiveLeaf) this.app.workspace.setActiveLeaf(leaf, { focus: true });
    view?.focusSearch?.();
  }

  /**
   * 一次性布局迁移：把右侧栏里核心插件的标签页换成自绘视图。
   *
   * 就地替换而非新建，这样侧边栏位置、与大纲相邻的标签页顺序都保持原样。
   */
  async migrateSidebarLayout() {
    // 已移除的「标签系统」页若残留在布局里会报"没有该类型的视图"，一并摘掉
    this.app.workspace.detachLeavesOfType(TAG_SHELF_VIEW_TYPE);

    if (this.settings.sidebarLayoutMigrated) return false;

    const legacyLeaves = (this.app.workspace.getLeavesOfType(TAG_VIEW_TYPE) || [])
      .filter((leaf: any) => this.isManagedSidebarLeaf(leaf));

    for (const leaf of legacyLeaves) {
      await leaf.setViewState({ type: TAG_SIDEBAR_VIEW_TYPE, active: false });
    }

    await this.updateSettings({ sidebarLayoutMigrated: true });
    if (legacyLeaves.length > 0) {
      console.log(`[Puffs Tag Enhance] 已将 ${legacyLeaves.length} 个标签侧边栏迁移为自绘视图`);
    }
    return legacyLeaves.length > 0;
  }

  /** 自绘侧边栏所在的标签页组，供自动切换与新建时定位。 */
  findSidebarLeaf() {
    return this.app.workspace.getLeavesOfType(TAG_SIDEBAR_VIEW_TYPE)
      .find((leaf: any) => this.isManagedSidebarLeaf(leaf)) || null;
  }

  /** 大纲核心插件可能被禁用，此时优雅降级、不报错。 */
  hasOutlineView() {
    return (this.app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE) || []).length > 0
      || !!this.app.internalPlugins?.getPluginById?.('outline')?.enabled;
  }
}
