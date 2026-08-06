// 业务层底座：标签名的归一化与展示。无任何依赖，供 core/ 内部与 models.ts 复用。
//
// 单独成文是为了避免 core/syntax.ts 与 models.ts 互相 import 造成循环依赖。

/** 补上 # 前缀并裁掉空白；空值返回 null。 */
export function normalizeTag(rawTag: unknown): string | null {
  if (!rawTag) return null;

  const tag = String(rawTag).trim();
  if (!tag) return null;

  return tag.startsWith('#') ? tag : `#${tag}`;
}

/** 去掉 # 前缀，用于界面展示。 */
export function getTagDisplayName(tag: unknown): string {
  return String(tag || '').replace(/^#/, '');
}

/** 含斜杠的嵌套标签。本插件固定使用扁平标签，嵌套标签不占顶层入口。 */
export function isNestedTag(tag: unknown): boolean {
  return String(tag || '').includes('/');
}
