# 交接说明：补完 view/ 三个文件的类型标注

> 这是一份自包含的任务说明，不需要读之前的对话。
> 任务性质：**机械、重复、低风险**，不需要架构判断。

## 背景

插件刚完成一次大重构（v3.0.0，与核心插件"标签列表"彻底解耦）。重构中把渲染代码
从数据层搬进了 `src/view/`，这三个文件是搬迁来的旧 JS 风格代码：

- `src/view/tag-tree-renderer.ts`
- `src/view/context-menus.ts`
- `src/view/order-controller.ts`

它们目前顶部带 `// @ts-nocheck`，也就是 TypeScript 完全不检查。这已经害过一次：
`context-menus.ts` 缺了 `isNestedTag` 的 import，编译器查不出来，直到运行时右键
笔记卡片才报 `isNestedTag is not defined`。

**任务目标：去掉这三个文件的 `@ts-nocheck`，让 `npm run build` 依然通过。**

## 当前状态（干净可用，不要担心弄坏）

- 分支 `master`，工作区干净，最新提交 `271b1cf`
- `npm test` → 351 个用例全绿
- `npm run build` → 通过
- 插件在 Obsidian 中运行正常

## 要做的事

### 第 1 步：看看要修多少

把三个文件顶部的 `// @ts-nocheck` 那一行删掉（连同下面两行 TODO 注释一起删），然后：

```bash
npx tsc --noEmit
```

会看到约 52 个错误，集中在这几类：

| 错误码 | 含义 | 典型原因 |
|---|---|---|
| `TS2339` | 属性不存在 | `querySelector`/`closest` 返回 `Element`，代码却当 `HTMLElement` 用了 `.dataset` / `.offsetParent` / `.scrollIntoView` |
| `TS18046` | 变量是 `unknown` | `Array.from(...).find(...)` 的结果没有类型 |
| `TS2345` | 参数类型不匹配 | 传 `'child'` / `'parent'` 字符串，但形参被推断成 `null \| undefined` |
| `TS7034` / `TS7005` | 变量隐式 any | `let longPressTimer = null;` 这类先声明后赋值 |

### 第 2 步：逐个消除

**统一原则：这些代码本来就是按 `any` 在用的，目标不是补出精确类型，而是让编译器能
继续守护「未定义符号」这类真错误。所以放宽成 `any` 即可，不要试图推导真实类型，
也不要改动任何运行时逻辑。**

具体手法（按出现频率）：

1. **局部变量声明加 `: any`** —— 最常用
   ```ts
   const rowEl = target.closest('.x');        // 改成
   const rowEl: any = target.closest('.x');
   ```

2. **回调参数加 `: any`**
   ```ts
   .forEach((cardEl) => { ... })              // 改成
   .forEach((cardEl: any) => { ... })
   ```

3. **`let x = null` 声明加类型**
   ```ts
   let longPressTimer = null;                 // 改成
   let longPressTimer: any = null;
   ```

4. **链式调用结果加断言** —— 前三种搞不定时才用
   ```ts
   Array.from(el.querySelectorAll('.x')).find((c) => c.dataset.path === p)
   // 改成
   Array.from(el.querySelectorAll<any>('.x')).find((c: any) => c.dataset.path === p)
   ```

5. **`TS2345` 那 6 处**在 `context-menus.ts`，是调用 `new NoteRelationModal(app, plugin, path, 'child')`
   时形参类型太窄。去 `src/relation-modals.ts` 找 `NoteRelationModal` 的 constructor，
   把第 4 个参数 `mode = null` 改成 `mode: any = null` 即可。

反复跑 `npx tsc --noEmit`，直到零错误。

### 第 3 步：验证（三项都必须通过）

```bash
npm test
```

```bash
npm run build
```

期望：351 个用例全绿、build 无输出（无输出即成功）。

然后确认插件在 Obsidian 里没坏。Obsidian 需要开着：

```bash
obsidian eval code="(async()=>{await app.plugins.disablePlugin('puffs-tag-enhance');await app.plugins.enablePlugin('puffs-tag-enhance');return 'reloaded';})()"
```

```bash
obsidian eval code="app.commands.executeCommandById('puffs-tag-enhance:toggle-tag-sidebar')"
```

```bash
obsidian dev:errors
```

`dev:errors` 里**不应出现** `puffs-tag-enhance` 相关的新报错。
（会看到一条 `puffs-todo-data.json` 的 ENOENT，那是另一个插件的旧记录，无关。）

### 第 4 步：提交

```bash
git add -A && git commit -m "refactor: view 层三个文件恢复类型检查"
```

## 注意事项

- **只改类型标注，不要改任何运行时逻辑**。如果发现某处"看起来是 bug"，不要顺手修，
  记下来告诉用户即可 —— 这三个文件的行为由 351 个测试和真机验证守着，擅自改会破坏
  "重构前后体感不变"这条最高约束。
- `main.js` 是构建产物，会被 `npm run build` 覆盖，不用手动改。
- 如果某个错误实在难消除，可以在那一行上方加 `// @ts-expect-error 说明原因`，
  但尽量少用，用了要在提交信息里说明。

## 做完之后

回到原对话告诉一声即可，那边还有两项在排队：
`core/inheritance.ts`（继承纯函数搬迁）和存储优化，以及最后的项目文档更新。
