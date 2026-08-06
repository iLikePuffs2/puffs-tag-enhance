// 渲染层：keyed 增量重绘。
//
// 落实开发规范里的重绘条款 —— 刷新数据不重建页面，只改真正变化的节点，
// 让用户正在进行的操作（输入、选中、滚动、展开）不被打断。
//
// 与 puffs-todo 那份实现同源，但按本插件的规模做了两处改造：
//
// 1. 签名不用 JSON.stringify。本插件此前正是因为用它序列化全部 items 及 1806 条
//    路径而慢，这里改成手写紧凑字符串拼接。
// 2. 增加"标签行级子树短路"。150 个标签里通常只有 1–2 个处于展开态，其余是单行；
//    签名未变的标签行整棵直接复用，连 next 节点都不构建 —— 比通用 diff 更省。

/** 记录每个 key 对应节点上一次渲染时的签名。 */
export type RenderSignatures = Map<string, string>;

/** 收集容器直接子节点中带 key 的元素，供下一轮复用。 */
export function collectKeyedChildren(container: HTMLElement): Map<string, HTMLElement> {
  const result = new Map<string, HTMLElement>();
  for (const child of Array.from(container.children)) {
    const key = (child as HTMLElement).dataset?.puffsRenderKey;
    if (key && !result.has(key)) result.set(key, child as HTMLElement);
  }
  return result;
}

/** 给节点打上 key，使其能在下一轮被识别与复用。 */
export function markRenderKey<T extends HTMLElement>(element: T, key: string): T {
  element.dataset.puffsRenderKey = key;
  return element;
}

/**
 * 把 current 容器的子节点就地对账成 orderedNodes 给出的顺序。
 *
 * orderedNodes 里既有「current 中已存在、本轮复用」的节点，也有「新建」的节点。
 *
 * 关键在于复用节点**全程不脱离文档**：只用 insertBefore 在同一父节点内移动位置。
 * 早先的实现是先把复用节点 appendChild 到一个游离容器再放回，看似等价，实际上
 * 元素一旦脱离文档，浏览器就会把焦点退回 body —— 正好毁掉增量重绘要保住的东西
 * （已由 reconcile.test.ts 的焦点用例钉住）。
 */
export function reconcileOrder(current: HTMLElement, orderedNodes: Node[]): void {
  const used = new Set<Node>(orderedNodes);
  let cursor: ChildNode | null = current.firstChild;

  for (const node of orderedNodes) {
    if (node === cursor) {
      cursor = cursor.nextSibling;
      continue;
    }
    // node 已在 current 内时，insertBefore 是移动而非重新插入，不会脱离文档
    current.insertBefore(node, cursor);
  }

  for (const child of Array.from(current.childNodes)) {
    if (!used.has(child)) child.remove();
  }
}

/** 一次重绘中需要保留的用户状态。 */
export type PreservedState = {
  scrollTop: number;
  scrollLeft: number;
  focusPath: number[] | null;
  selection: { start: number | null; end: number | null } | null;
};

function supportsTextSelection(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement
    && ['text', 'search', 'tel', 'url', 'password'].includes(el.type);
}

/** 记录焦点元素在容器内的子节点索引路径，供节点被替换后近似还原。 */
function computeFocusPath(root: HTMLElement, target: Element): number[] | null {
  const path: number[] = [];
  let node: Element | null = target;
  while (node && node !== root) {
    const parent: Element | null = node.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  return node === root ? path : null;
}

function resolveFocusPath(root: HTMLElement, path: number[]): HTMLElement | null {
  let node: Element = root;
  for (const index of path) {
    const child = node.children[index];
    if (!child) return null;
    node = child;
  }
  return node instanceof HTMLElement ? node : null;
}

/** 重绘前抓取滚动位置与焦点状态。 */
export function capturePreservedState(scrollEl: HTMLElement, root: HTMLElement): PreservedState {
  const active = root.ownerDocument.activeElement;
  const owned = active instanceof HTMLElement && root.contains(active) ? active : null;
  return {
    scrollTop: scrollEl.scrollTop,
    scrollLeft: scrollEl.scrollLeft,
    focusPath: owned ? computeFocusPath(root, owned) : null,
    selection: owned && supportsTextSelection(owned)
      ? { start: owned.selectionStart, end: owned.selectionEnd }
      : null,
  };
}

/** 重绘后还原。焦点若仍在页面上则无需处理，只有它被删掉时才按路径找回。 */
export function restorePreservedState(
  scrollEl: HTMLElement,
  root: HTMLElement,
  state: PreservedState
): void {
  scrollEl.scrollTop = state.scrollTop;
  scrollEl.scrollLeft = state.scrollLeft;

  if (!state.focusPath) return;
  const active = root.ownerDocument.activeElement;
  if (active instanceof HTMLElement && root.contains(active)) return; // 焦点没丢

  const target = resolveFocusPath(root, state.focusPath);
  if (!target) return;
  target.focus({ preventScroll: true });
  if (state.selection && supportsTextSelection(target)) {
    target.setSelectionRange(state.selection.start, state.selection.end);
  }
}

/**
 * 标签行签名。
 *
 * 覆盖所有会影响该行渲染结果的输入：显示名、计数、按钮出现条件、展开态，
 * 以及展开时的笔记路径列表。任一变化都会导致该行重建，其余行原样复用。
 *
 * 用 \x1f（单元分隔符）拼接而非 JSON.stringify —— 后者在 150 标签 × 每行上千字符
 * 的规模下本身就是开销来源。
 */
export function tagRowSignature(
  item: Record<string, unknown>,
  context: {
    expanded: boolean;
    pinned: boolean;
    targetPath: string;
    inlineHierarchyVersion: number;
    relationVersion: number;
  }
): string {
  const files = (item.files as Array<{ path: string }> | undefined) || [];
  const parts = [
    String(item.tag ?? ''),
    String(item.displayName ?? ''),
    item.isVirtual ? '1' : '0',
    String(files.length),
    String(item.exactCount ?? ''),
    String(item.inheritedCount ?? ''),
    item.inheritanceEnabled ? '1' : '0',
    item.hasInheritance ? '1' : '0',
    item.hasFreeInheritance ? '1' : '0',
    item.hasActiveInheritance ? '1' : '0',
    ((item.fixedSearchTags as string[] | undefined) || []).join(','),
    context.pinned ? '1' : '0',
    context.expanded ? '1' : '0',
    context.targetPath,
    String(context.inlineHierarchyVersion),
    String(context.relationVersion),
    // 展开时笔记列表参与签名；折叠时不关心，省去大量字符串拼接
    context.expanded ? files.map((file) => file.path).join('\n') : '',
  ];
  return parts.join('\x1f');
}
