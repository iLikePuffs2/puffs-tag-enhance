// 渲染层：排序模式的交互与笔记卡片的 DOM 效果。
//
// 自 interactions.ts 迁出（该文件曾有 84 处 DOM 操作，与笔记顺序、别名等
// 纯数据查询混在一起）。这里管的是按钮选中态、长按进入排序、滚动定位与高亮，
// 顺序本身的计算规则留在 interactions.ts。

import { Menu, Notice, TFile, setIcon } from "obsidian";
import { NOTE_ORDER_LONG_PRESS_MS, getTagDisplayName, isNestedTag, normalizeTag } from "../models";

export class OrderControllerBehavior {
  [key: string]: any;

  refreshNoteDisplayNameCards(tagValue: any, file: any) {
    const tag = normalizeTag(tagValue);
    if (!tag || !(file instanceof TFile)) return;

    const displayName = this.getNoteDisplayName(tag, file);
    document.querySelectorAll('.puffs-tag-note-card[data-puffs-tag][data-path]').forEach((cardEl: any) => {
      if (cardEl.dataset.puffsTag !== tag || cardEl.dataset.path !== file.path) return;
      const textEl = cardEl.querySelector('.tree-item-inner-text');
      if (textEl) textEl.textContent = displayName;
    });
  }

  showNoteDisplayNameMenuForCard(event: any, cardEl: any) {
    const tag = normalizeTag(cardEl && cardEl.dataset.puffsTag);
    const path = cardEl && cardEl.dataset.path;
    if (!tag || isNestedTag(tag) || !path) return false;

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return false;

    const aliases = this.getNoteAliases(file);
    if (aliases.length === 0) return false;

    const menu = new Menu();
    menu.addItem((item) => {
      item
        .setTitle('更换显示名称')
        .setIcon('text-cursor-input')
        .onClick(() => {
          const position = { x: event.clientX, y: event.clientY };
          window.setTimeout(() => {
            this.showNoteDisplayNameOptions(position, tag, file, aliases);
          }, 0);
        });
    });
    menu.showAtMouseEvent(event);
    return true;
  }

  showNoteDisplayNameOptions(position: any, tag: any, file: any, aliases = this.getNoteAliases(file)) {
    const currentName = this.getNoteDisplayName(tag, file);
    const menu = new Menu();
    menu.addItem((item) => {
      item
        .setTitle(file.basename)
        .setChecked(currentName === file.basename)
        .onClick(() => this.setNoteDisplayName(tag, file, '').catch((error: any) => {
          console.error('[Puffs Tag Enhance] Failed to restore note display name:', error);
          new Notice('恢复文件名失败');
        }));
    });
    for (const alias of aliases) {
      menu.addItem((item) => {
        item
          .setTitle(alias)
          .setChecked(currentName === alias)
          .onClick(() => this.setNoteDisplayName(tag, file, alias).catch((error: any) => {
            console.error('[Puffs Tag Enhance] Failed to change note display name:', error);
            new Notice('更换展示名称失败');
          }));
      });
    }
    menu.showAtPosition(position);
  }

  scheduleNoteCardSearchEffect(containerEl: any, inputEl: any, state: any) {
    if (!containerEl || !state) return;
    if (state.effectTimer !== null) {
      window.clearTimeout(state.effectTimer);
      state.effectTimer = null;
    }

    const findTargetCard = (target: any) => {
      if (!target) return null;
      const tagRowEl: any = Array.from(
        containerEl.querySelectorAll('.tag-pane-tag[data-puffs-tag]')
      ).find((rowEl: any) => rowEl.dataset.puffsTag === target.tag);
      const tagItemEl: any = tagRowEl && tagRowEl.closest('.puffs-tag-list-item');
      return (
        tagItemEl &&
        Array.from(tagItemEl.querySelectorAll('.puffs-tag-note-card[data-path]')).find(
          (candidate: any) => candidate.dataset.path === target.path
        )
      );
    };

    const target = state.target;
    const targetCardEl = findTargetCard(target);
    containerEl.querySelectorAll('.puffs-tag-note-card.is-note-search-match').forEach((cardEl: any) => {
      if (cardEl !== targetCardEl) cardEl.classList.remove('is-note-search-match');
    });
    if (!target || !targetCardEl) return;

    targetCardEl.classList.add('is-note-search-match');
    if (state.pendingScrollKey !== target.key) return;

    const scheduledTargetKey = target.key;
    const shouldRestoreInputFocus = document.activeElement === inputEl;
    state.effectTimer = window.setTimeout(() => {
      state.effectTimer = null;
      const currentTarget = state.target;
      if (
        !currentTarget ||
        currentTarget.key !== scheduledTargetKey ||
        state.pendingScrollKey !== scheduledTargetKey
      ) {
        return;
      }

      const currentCardEl = findTargetCard(currentTarget);
      if (!currentCardEl) return;

      currentCardEl.scrollIntoView({ block: 'center', inline: 'nearest' });
      state.lastScrolledKey = scheduledTargetKey;
      state.pendingScrollKey = '';
      if (shouldRestoreInputFocus && inputEl && inputEl.isConnected) {
        try {
          inputEl.focus({ preventScroll: true });
        } catch (_) {
          inputEl.focus();
        }
      }
    }, 0);
  }

  scheduleLastNoteCardScroll(containerEl: any, tag: any) {
    if (!containerEl || !tag) return;

    window.setTimeout(() => {
      if (!containerEl.isConnected) return;

      const tagRowEl: any = Array.from(
        containerEl.querySelectorAll('.tag-pane-tag[data-puffs-tag]')
      ).find((rowEl: any) => rowEl.dataset.puffsTag === tag);
      const tagItemEl: any = tagRowEl && tagRowEl.closest('.puffs-tag-list-item');
      const noteCards: any[] = tagItemEl
        ? Array.from(tagItemEl.querySelectorAll('.puffs-tag-note-card[data-path]'))
        : [];
      const lastCardEl = noteCards[noteCards.length - 1];
      if (!lastCardEl) return;

      lastCardEl.scrollIntoView({ block: 'center', inline: 'nearest' });
    }, 0);
  }

  scheduleTagTopScroll(containerEl: any, tag: any) {
    if (!containerEl || !tag) return;

    window.setTimeout(() => {
      if (!containerEl.isConnected) return;

      const tagRowEl: any = Array.from(
        containerEl.querySelectorAll('.tag-pane-tag[data-puffs-tag]')
      ).find((rowEl: any) => rowEl.dataset.puffsTag === tag);
      if (!tagRowEl) return;

      tagRowEl.scrollIntoView({ block: 'start', inline: 'nearest' });
    }, 0);
  }

  syncNoteOrderButtonSelection(buttonEl: any) {
    if (!buttonEl) return;
    const isSelected = this.isNoteOrderTargetSelected(
      buttonEl.dataset.puffsTag,
      buttonEl.dataset.path,
      buttonEl.dataset.puffsHierarchyParent
    );
    buttonEl.classList.toggle('is-selected', isSelected);
    buttonEl.setAttribute('aria-pressed', String(isSelected));
    if (buttonEl.classList.contains('puffs-note-parent-control-button')) {
      const isExpanded = buttonEl.dataset.puffsExpanded === 'true';
      if (isSelected) {
        setIcon(buttonEl, 'grip-vertical');
        buttonEl.classList.remove('is-collapsed');
      } else {
        setIcon(buttonEl, 'right-triangle');
        buttonEl.classList.toggle('is-collapsed', !isExpanded);
      }
      buttonEl.removeAttribute('aria-label');
      buttonEl.removeAttribute('data-tooltip-position');
      buttonEl.setAttribute('aria-expanded', String(isExpanded));
    }
    const noteItemEl = buttonEl.closest('.puffs-tag-note-item');
    if (noteItemEl) noteItemEl.classList.toggle('is-order-selected', isSelected);
  }

  bindOrderControlButton(buttonEl: any, isSelected: any, toggleExpansion: any, toggleOrder: any) {
    if (!buttonEl) return () => {};
    let longPressTimer: any = null;
    let suppressNextClick = false;

    const clearLongPressTimer = () => {
      if (!longPressTimer) return;
      globalThis.clearTimeout(longPressTimer);
      longPressTimer = null;
    };
    const onPointerDown = (event: any) => {
      if (event.button !== 0 || isSelected()) return;
      clearLongPressTimer();
      suppressNextClick = false;
      longPressTimer = globalThis.setTimeout(() => {
        longPressTimer = null;
        suppressNextClick = true;
        toggleOrder();
      }, NOTE_ORDER_LONG_PRESS_MS);
    };
    const onPointerUp = () => clearLongPressTimer();
    const onPointerAbort = () => {
      clearLongPressTimer();
      suppressNextClick = false;
    };
    const onClick = (event: any) => {
      event.preventDefault();
      event.stopPropagation();
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (isSelected()) {
        toggleOrder();
        return;
      }
      toggleExpansion();
    };

    buttonEl.addEventListener('pointerdown', onPointerDown);
    buttonEl.addEventListener('pointerup', onPointerUp);
    buttonEl.addEventListener('pointerleave', onPointerAbort);
    buttonEl.addEventListener('pointercancel', onPointerAbort);
    buttonEl.addEventListener('click', onClick);
    return () => {
      clearLongPressTimer();
      buttonEl.removeEventListener('pointerdown', onPointerDown);
      buttonEl.removeEventListener('pointerup', onPointerUp);
      buttonEl.removeEventListener('pointerleave', onPointerAbort);
      buttonEl.removeEventListener('pointercancel', onPointerAbort);
      buttonEl.removeEventListener('click', onClick);
    };
  }

  bindNoteParentControlButton(buttonEl: any, toggleExpansion: any, toggleOrder: any) {
    return this.bindOrderControlButton(
      buttonEl,
      () => this.isNoteOrderTargetSelected(
        buttonEl.dataset.puffsTag,
        buttonEl.dataset.path,
        buttonEl.dataset.puffsHierarchyParent
      ),
      toggleExpansion,
      toggleOrder
    );
  }

  refreshNoteOrderSelectionState() {
    document.querySelectorAll('.puffs-tag-note-order-button').forEach((buttonEl) => {
      this.syncNoteOrderButtonSelection(buttonEl);
    });
  }

  focusSelectedNoteOrderButton() {
    if (!this.selectedNoteOrderTarget) return;
    const { tag, hierarchyParent, path, surface } = this.selectedNoteOrderTarget;
    const buttons: any[] = Array.from(document.querySelectorAll('.puffs-tag-note-order-button'));
    const buttonEl =
      buttons.find((button: any) =>
        (hierarchyParent
          ? button.dataset.puffsHierarchyParent === hierarchyParent
          : button.dataset.puffsTag === tag) &&
        button.dataset.path === path &&
        button.dataset.puffsSurface === surface &&
        button.offsetParent !== null
      ) ||
      buttons.find((button: any) =>
        (hierarchyParent
          ? button.dataset.puffsHierarchyParent === hierarchyParent
          : button.dataset.puffsTag === tag) &&
        button.dataset.path === path &&
        button.offsetParent !== null
      );
    if (buttonEl) buttonEl.focus({ preventScroll: true });
  }

}
