export const SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS = [
  { id: 'expand-collapse', label: '全部展开/收起', visible: true },
  { id: 'scroll-bottom', label: '回底', visible: true },
  { id: 'scroll-top', label: '回顶', visible: true },
  { id: 'filter', label: '筛选', visible: true },
] as const;

export type SidebarToolbarButtonId = typeof SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS[number]['id'];
export type SidebarToolbarButtonSetting = { id: SidebarToolbarButtonId; visible: boolean };

const definitionById = new Map(SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS.map((item) => [item.id, item]));

export function createDefaultSidebarToolbarButtons(): SidebarToolbarButtonSetting[] {
  return SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS.map((item) => ({ id: item.id, visible: item.visible }));
}

export function normalizeSidebarToolbarButtons(value: unknown): SidebarToolbarButtonSetting[] {
  if (!Array.isArray(value)) return createDefaultSidebarToolbarButtons();
  const result: SidebarToolbarButtonSetting[] = [];
  const seen = new Set<SidebarToolbarButtonId>();
  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;
    const id = (rawItem as { id?: unknown }).id;
    if (typeof id !== 'string' || !definitionById.has(id as SidebarToolbarButtonId)) continue;
    const buttonId = id as SidebarToolbarButtonId;
    if (seen.has(buttonId)) continue;
    seen.add(buttonId);
    const definition = definitionById.get(buttonId)!;
    const rawVisible = (rawItem as { visible?: unknown }).visible;
    result.push({
      id: buttonId,
      visible: typeof rawVisible === 'boolean' ? rawVisible : definition.visible,
    });
  }

  for (const definition of SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS) {
    if (seen.has(definition.id)) continue;
    const nextDefaultIds = SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS
      .slice(SIDEBAR_TOOLBAR_BUTTON_DEFINITIONS.indexOf(definition) + 1)
      .map((item) => item.id);
    const insertIndex = result.findIndex((item) => nextDefaultIds.includes(item.id));
    const setting = { id: definition.id, visible: definition.visible };
    if (insertIndex >= 0) result.splice(insertIndex, 0, setting);
    else result.push(setting);
  }
  return result;
}

export function moveSidebarToolbarButton(
  value: unknown,
  id: SidebarToolbarButtonId,
  direction: -1 | 1
): SidebarToolbarButtonSetting[] {
  const result = normalizeSidebarToolbarButtons(value);
  const index = result.findIndex((item) => item.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= result.length) return result;
  [result[index], result[nextIndex]] = [result[nextIndex], result[index]];
  return result;
}

export function getAvailableSidebarToolbarButtons(
  value: unknown,
  availableIds: Iterable<string>
): SidebarToolbarButtonSetting[] {
  const available = new Set(availableIds);
  return normalizeSidebarToolbarButtons(value).filter((item) => available.has(item.id));
}

export function getSidebarToolbarButtonLabel(id: SidebarToolbarButtonId): string {
  return definitionById.get(id)?.label || id;
}

/**
 * 标签行、继承分组行、交集组行是否显示回顶/回底这一对按钮。
 *
 * 单一判据供三处渲染共用 —— 此前回底按钮只看「展开且有笔记」、回顶按钮才看阈值，
 * 两处口径不一致，同一个标签会出现「有回底没回顶」。
 *
 * 阈值 0（以及负数、NaN 等非法值）表示关闭，与设置面板的说明一致。
 */
export function shouldShowScrollButtons(noteCount: number, threshold: unknown): boolean {
  const limit = Math.floor(Number(threshold));
  if (!Number.isFinite(limit) || limit <= 0) return false;
  return noteCount >= limit;
}
