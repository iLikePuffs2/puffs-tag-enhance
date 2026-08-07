// 数据层：data.json 的结构版本与迁移链。
//
// 此前只有 relations.version，顶层没有版本号，迁移逻辑散在 loadSettings 里
// （delete listModeEnabled / tagOrder / backupFileName），是「每次启动都跑一遍的清理」
// 而非版本化迁移。这里给顶层加 schemaVersion，迁移按版本推进、跑过即不再跑。
//
// 分层约束：纯计算，不引用 DOM、不 import core/ 或 view/。

/** 当前结构版本。新增迁移时 +1，并在 MIGRATIONS 里补一条。 */
export const CURRENT_SCHEMA_VERSION = 1;

export type MigrationContext = {
  /** 记录迁移过程中的变化，交由调用方打日志 */
  log: (message: string) => void;
};

export type Migration = {
  /** 从该版本升到 version + 1 */
  version: number;
  description: string;
  migrate: (data: any, context: MigrationContext) => void;
};

/**
 * 版本 0 -> 1
 *
 * tagSidebarPreferredFiles 由 { 路径: true } 改为路径数组。值恒为 true，
 * 对象形态白白多存一份 `:true`。
 *
 * 这条迁移原本还负责清理继承名单里的死数据（白名单/黑名单各只在一种模式下被读取，
 * 另一侧是残留）。白名单在 relations v7 整张表退场后，那段清理已无对象 ——
 * v7 迁移会按可见集合精确重算排除名单，完全覆盖了它，故一并删除。
 */
const migrateToV1: Migration = {
  version: 0,
  description: '侧边栏偏好改数组',
  migrate(data, { log }) {
    const preferred = data?.tagSidebarPreferredFiles;
    if (preferred && !Array.isArray(preferred) && typeof preferred === 'object') {
      const paths = Object.entries(preferred)
        .filter(([, enabled]) => enabled === true)
        .map(([path]) => path);
      data.tagSidebarPreferredFiles = paths;
      log(`侧边栏偏好改为数组：${paths.length} 条`);
    }
  },
};

const MIGRATIONS: Migration[] = [migrateToV1];

/**
 * 把数据推进到当前版本。返回是否发生过改动（调用方据此决定要不要落盘）。
 *
 * 没有 schemaVersion 的旧数据视为版本 0，会从头跑一遍迁移链。
 */
export function migrateSchema(data: any, log: (message: string) => void = () => {}): boolean {
  if (!data || typeof data !== 'object') return false;

  const from = Number.isInteger(data.schemaVersion) ? data.schemaVersion : 0;
  if (from >= CURRENT_SCHEMA_VERSION) return false;

  for (const migration of MIGRATIONS) {
    if (migration.version < from) continue;
    migration.migrate(data, { log });
    log(`结构迁移 v${migration.version} -> v${migration.version + 1}：${migration.description}`);
  }

  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  return true;
}

/** 侧边栏偏好读取：兼容数组（新）与对象（旧，迁移前的存量）两种形态。 */
export function readPreferredFiles(value: unknown): Set<string> {
  if (Array.isArray(value)) return new Set(value.filter((path) => typeof path === 'string' && path));
  if (value && typeof value === 'object') {
    return new Set(
      Object.entries(value as Record<string, unknown>)
        .filter(([path, enabled]) => path && enabled === true)
        .map(([path]) => path)
    );
  }
  return new Set();
}

/**
 * 判断某标签的笔记顺序是否就是默认顺序。
 *
 * 默认顺序＝按文件名中文拼音序、同名再按路径（与索引重建时的排序一致）。
 * 完全一致的记录「存了等于不存」—— 读取时缺失的标签本来就回落到默认顺序，
 * 因此省略它们是无损的。实测能省掉约四分之一的顺序记录。
 *
 * 注意不要据此推断「用户没排过序」：新笔记按配置追加到末尾同样会偏离默认序，
 * 那种顺序带有加入先后的信息，必须保留。
 */
export function isDefaultNoteOrder(
  paths: string[],
  files: Array<{ path: string; basename: string }>
): boolean {
  if (paths.length !== files.length) return false;

  const sorted = [...files].sort((a, b) => {
    const byName = a.basename.localeCompare(b.basename, 'zh-Hans-CN');
    return byName || a.path.localeCompare(b.path, 'zh-Hans-CN');
  });

  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index].path !== paths[index]) return false;
  }
  return true;
}
