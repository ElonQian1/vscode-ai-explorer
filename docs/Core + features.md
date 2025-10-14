当然可以在**同一个插件**里长期扩展模块，而且你现在的“Core + features 分区”的思路本身就是为了“可加模块”。下面给你一整套**如何开始项目 & 让 AI（和人）快速、精准地定位到对应功能模块**的落地方案：目录、命名、工作区、搜索与静态规则、提示词与注释规范、以及可直接复制的配置文件。

---

# 一、整体架构（保持可扩展/可拆分）

```
src/
  extension.ts            ← 只做轻启动与路由
  core/                   ← OpenAI 接入、限流、缓存、日志、DI 容器
  features/
    explorer-alias/       ← 模块A：中文别名镜像树
      domain/ app/ infra/ ui/
      module.json         ← 模块元数据（见下）
      README.md           ← 给人/AI看的模块说明与搜素标签
    uml-canvas/           ← 模块B：UML 世界画布（Webview）
      domain/ app/ infra/ panel/ webview/
      module.json
      README.md
    <future-module>/      ← 后续新增模块，按同样骨架放这里
  shared/                 ← 轻量通用类型/工具（不放业务）
docs/
  MODULES.md              ← 全局模块索引（模块→关键词→主要入口文件）
  ARCHITECTURE.md         ← 分层与约定
.vscode/
  settings.json           ← 搜索/排除/AI提示
  launch.json             ← 按模块启动/调试
ai-suite.code-workspace   ← 多根工作区（把每个模块当独立“根”）
```

> 关键点：**每个模块自带 `module.json` 和 `README.md`**，配合工作区与 ESLint 边界规则，让 AI/人类一眼就到位。

---

# 二、从零开始：一步到位的“起步清单”

1. **初始化工程**

* `npm init -y` / `pnpm init -y`
* 安装：`typescript`, `@types/node`, `eslint`, `prettier`, `eslint-plugin-import`, `eslint-plugin-boundaries`, `vsce`
* 生成 `tsconfig.json`、`package.json` 基本 `contributes`，并用你已有的入口/骨架代码

2. **建立目录与“模块自描述”**

* 在每个 `features/<module>/` 下放 `module.json`（元数据+搜索标签），`README.md`（职责、边界、入口）
* 在**每个 TS 文件第一行**保留**文件路径注释**并加上**模块标签**（便于 AI/人类快速定位）

3. **创建多根工作区**（非常关键）

* 用一个 `.code-workspace` 把 `src/features/*` 作为**独立根文件夹**加入；
  这样你在某个模块工作时，**全局搜索/跳转/重构**都默认局限在该模块范围内（除非你切换根）。

4. **VS Code 层面的搜索隔离**

* 在 `.vscode/settings.json` 中为每个“根”定义 `search.exclude` 与 `files.exclude`，**屏蔽其它大模块**；
* 配合 `search.useIgnoreFiles: true`，让 `.gitignore` 与 `**/module.json` 中的提示真正生效。

5. **TypeScript 路径与项目引用**

* `baseUrl: "src"`，并用 `paths` 显式声明：`@feat/explorer/*`、`@feat/uml/*`、`@core/*`；
* 大模块可以做 **TS Project References**（`composite: true`）→ 单独增量编译、单独 watch。

6. **ESLint “模块边界”规则**

* 用 `eslint-plugin-boundaries` 或 `import/no-restricted-imports`：

  * 禁止跨模块的**深层相对导入**（只能通过各模块“公开出口”导入）
  * 最小化耦合，AI 自动改代码时也被“拦”在边界以免串改

7. **给 AI 的“导航/索引文件”**

* `docs/MODULES.md`：列出**模块→关键词→主要入口/命令/视图**
* `AGENTS.md`（可选）：告诉 AI/代理“修改 A 功能时优先看哪几个文件”，并附**搜索标签**
* 每个模块 `README.md` 顶部加**“搜索标签”**与**“变更入口”**（代码见下）

8. **按模块调试与任务**

* `launch.json`：每个模块一个 **Extension Host** 启动配置（带 `--extensionDevelopmentPath` 与预编译任务）
* `tasks.json`：每个模块一个 `tsc -b` watch 任务，互不干扰

9. **Git 与 PR 自动化（可选但非常有用）**

* `CODEOWNERS`：按 `features/<module>/**` 指定责任人
* `labeler.yml`（GitHub Action）：按路径给 PR 自动加 `area:explorer-alias`、`area:uml-canvas` 标签
* 要求提交信息前缀 `[explorer-alias] fix: …`，利于回溯与 AI 语境绑定

---

# 三、可直接复制的配置示例

### 1) 多根工作区（让搜索只命中当前模块）

```json
// ai-suite.code-workspace
{
  "folders": [
    { "name": "explorer-alias", "path": "src/features/explorer-alias" },
    { "name": "uml-canvas", "path": "src/features/uml-canvas" },
    { "name": "core", "path": "src/core" }
  ],
  "settings": {
    // 默认启用忽略
    "search.useIgnoreFiles": true,
    "search.followSymlinks": false
  }
}
```

### 2) 每个模块自带元数据与标签

```json
// src/features/explorer-alias/module.json
{
  "moduleId": "explorer-alias",
  "name": "AI 资源管理器（中文别名）",
  "scope": ["treeview", "translation", "cache"],
  "entry": ["ui/AIExplorerProvider.ts", "app/TranslateBatchUseCase.ts"],
  "searchTags": ["别名", "资源管理器", "中文", "TreeView", "translate", "cache"]
}
```

```md
<!-- src/features/explorer-alias/README.md -->
# 模块：AI 资源管理器（中文别名）
**搜索标签**：`别名` `资源管理器` `TreeView` `translate` `cache`

- **入口**：`ui/AIExplorerProvider.ts`
- **对外命令**：`aiExplorer.translateAll`、`aiExplorer.toggleShowAlias`
- **边界**：严禁直接 import `uml-canvas/*`（请通过 `core` 或 `shared`）
- **变更入口**（常改清单）：`app/TranslateBatchUseCase.ts`、`infra/translators/*`、`core/ai/PromptProfiles.ts`
```

### 3) VS Code 设置（全局与按模块搜索排除）

```json
// .vscode/settings.json
{
  "files.exclude": {
    "**/out": true,
    "**/.git": true,
    "**/node_modules": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "src/features/uml-canvas/**": true,      // 当在 explorer-alias 根里工作时屏蔽它
    "src/features/explorer-alias/**": true   // 在 uml-canvas 根里工作时改为屏蔽另一个（用工作区根覆盖）
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.codeActionsOnSave": { "source.fixAll.eslint": true }
}
```

> 多根工作区允许你在“explorer-alias”根的 `settings.json` 里覆盖 `search.exclude`，实现**按根隔离搜索**。

### 4) TypeScript 路径与项目引用

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "baseUrl": "src",
    "paths": {
      "@core/*": ["core/*"],
      "@feat/explorer/*": ["features/explorer-alias/*"],
      "@feat/uml/*": ["features/uml-canvas/*"],
      "@shared/*": ["shared/*"]
    },
    "composite": true,
    "rootDir": "src",
    "outDir": "out",
    "strict": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "references": [
    { "path": "./src/core" },
    { "path": "./src/features/explorer-alias" },
    { "path": "./src/features/uml-canvas" }
  ],
  "include": ["src"]
}
```

> 每个大模块也可有自己的 `tsconfig.json`（`"composite": true`），用 `tsc -b` 做**增量编译**。

### 5) ESLint 边界（禁止跨模块“深引用”）

```js
// .eslintrc.cjs
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['import', 'boundaries'],
  extends: ['eslint:recommended', 'plugin:import/recommended'],
  settings: {
    'boundaries/elements': [
      { type: 'core', pattern: 'src/core/**' },
      { type: 'feature', pattern: 'src/features/*/**' },
      { type: 'shared', pattern: 'src/shared/**' }
    ]
  },
  rules: {
    // 只能通过“公开出口”互相访问，不允许深层相对路径跨模块
    'import/no-restricted-paths': ['error', {
      zones: [
        { target: 'src/features/explorer-alias', from: 'src/features/uml-canvas', message: '请勿跨模块深引用（改走 @shared 或 @core）' },
        { target: 'src/features/uml-canvas', from: 'src/features/explorer-alias', message: '请勿跨模块深引用（改走 @shared 或 @core）' }
      ]
    }],
    'import/no-relative-packages': 'error'
  }
};
```

### 6) 启动与任务（按模块调试）

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run: Explorer Alias",
      "type": "extensionHost",
      "request": "launch",
      "runtimeExecutable": "${execPath}",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "preLaunchTask": "build:explorer"
    },
    {
      "name": "Run: UML Canvas",
      "type": "extensionHost",
      "request": "launch",
      "runtimeExecutable": "${execPath}",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "preLaunchTask": "build:uml"
    }
  ]
}
```

```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    { "label": "build:explorer", "type": "shell", "command": "npx tsc -b src/features/explorer-alias tsconfig.json" },
    { "label": "build:uml", "type": "shell", "command": "npx tsc -b src/features/uml-canvas tsconfig.json" }
  ]
}
```

---

# 四、代码注释/文件头与“AI 搜索标签”规范

> 你要求“文件第一行写文件名”，我们再加**模块标签**与**搜索标签**，AI 就更稳了。

```ts
// src/features/explorer-alias/ui/AIExplorerProvider.ts
// [module: explorer-alias] [tags: TreeView, Alias, Translate, Cache]
/**
 * 中文注释：本文件为“AI 资源管理器”树视图的 UI 层入口。
 * 关注点：仅负责展示与命令调用；不放业务逻辑（用例在 app 层）。
 */
```

```ts
// src/features/uml-canvas/app/usecases/buildGraph.ts
// [module: uml-canvas] [tags: AST, IR, Layout, Webview, Canvas]
/**
 * 中文注释：把代码解析为 IR，再做布局，供前端世界画布渲染。
 * AI说明：不要上传源码正文，上传 IR 摘要（类/方法签名/关系）。
 */
```

---

# 五、OpenAI 接入（统一 Core，避免串扰）

* `src/core/ai/OpenAIClient.ts`：**唯一**对接点（限流、并发、超时、重试、日志），features 只能通过它调用
* `src/core/ai/PromptProfiles.ts`：把**别名**与**UML 注解**的 prompt 拆成**两个 profile**，各自独立演进
* `src/core/cache/KVCache.ts`：Key 里包含 `moduleId`，避免 A/B 模块的缓存互相污染

> 这样“接入 AI 的需求”都落在 **Core**，你新增模块只要定义自己的 **profile 与调用入口** 即可。

---

# 六、额外优化建议（让 AI 更听话）

1. **模块标签贯穿**：`module.json`、文件头、README、提交信息、PR 标签一致使用 `explorer-alias` / `uml-canvas`
2. **明确“变更入口”**：每个模块 README 顶部列“常改文件清单”（让 AI 先去这些文件）
3. **写“负向约束”**：在 README/AGENTS.md 里写清楚“**本模块禁止做什么**”（例如不要直接访问另一个模块内部）
4. **分层严格**：UI 只调用 usecase；usecase 只调用 ports；infra 只实现 ports。AI 改代码时更不容易乱跳层
5. **PR 模板**：让开发者/AI 必填“涉及模块”“入口文件”“跳过的模块”，减少串改
6. **路径别名**：统一通过 `@feat/<id>` 导入，避免 `../../..` 式相对路径让 AI 迷路
7. **Large-file 警戒**：超过 500 行强制拆子模块；README 里维护“子模块地图”
8. **搜索命令脚本**：`npm run grep:alias` / `grep:uml` 用 ripgrep 快速检索模块标签
9. **文档即索引**：`docs/MODULES.md` 要简短但**结构化**（模块→关键词→入口→常见任务），是给 AI 的“路标”

---

# 七、最后：你现在就可以这样开始

* 把**现有代码**整理到上述目录；在两个现有模块根下补 `module.json` 与 `README.md`
* 建好 **`.code-workspace`**，平时就用这个文件打开工程（按根隔离搜索）
* 落地 **ESLint 边界**与**TS 路径映射**（这两样对“防串改/稳定位”最关键）
* 把 `OpenAIClient`、`PromptProfiles`、`KVCache` 放入 `core/`，features 统一走 Core 调 AI
* 在每个文件**第一行**加**路径注释 + 模块标签**，让 AI 和你都不再迷路

如果你愿意，我可以把**模块元数据 `module.json`、模块 README 模板**、以及**MODULES.md 的模板**也给你一份可直接粘贴的版本。
