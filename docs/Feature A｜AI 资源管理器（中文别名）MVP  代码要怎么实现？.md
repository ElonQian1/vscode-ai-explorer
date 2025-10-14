太好了！下面给你一份**可直接运行的 MVP 代码**（“Feature A｜AI 资源管理器（中文别名）”），已经按我们前面定下的“分层 & 可扩展”结构实现。
特点：

* **同一插件内**，但 Feature A 独立在 `features/explorer-alias/` 下，便于未来继续扩展/拆分
* 先实现 **无 AI** 的 MVP（词表 + 规则 + 缓存），**接口已预留**，以后把 OpenAI Translator 接上即可
* 支持：镜像目录树、中文别名/原名切换、单节点/全工作区翻译、增量刷新、可选安全重命名

> 使用方法：把以下文件按路径新建，`npm i` → `npm run build` → VS Code F5 启动扩展宿主 → 在侧边栏找到“AI 资源管理器（中文别名）”。

---

## 1) package.json

```json
// package.json
{
  "name": "ai-suite",
  "displayName": "AI Suite：中文别名 &（预留）UML 世界画布",
  "description": "Feature A：AI 资源管理器（中文别名）— 先词表/规则命中，后续可无缝接入 OpenAI。",
  "version": "0.1.0",
  "publisher": "your-name",
  "engines": { "vscode": "^1.86.0" },
  "categories": ["Other"],
  "activationEvents": [
    "onView:aiExplorer",
    "onCommand:aiExplorer.refresh",
    "onCommand:aiExplorer.translateNode",
    "onCommand:aiExplorer.translateAll",
    "onCommand:aiExplorer.toggleShowAlias",
    "onCommand:aiExplorer.renameToAlias"
  ],
  "contributes": {
    "views": {
      "explorer": [
        { "id": "aiExplorer", "name": "AI 资源管理器（中文别名）" }
      ]
    },
    "commands": [
      { "command": "aiExplorer.refresh", "title": "AI 资源管理器：刷新" },
      { "command": "aiExplorer.translateNode", "title": "AI 资源管理器：翻译所选节点" },
      { "command": "aiExplorer.translateAll", "title": "AI 资源管理器：翻译整个工作区（缓存优先）" },
      { "command": "aiExplorer.toggleShowAlias", "title": "AI 资源管理器：切换显示 中文别名/原名" },
      { "command": "aiExplorer.renameToAlias", "title": "AI 资源管理器：用别名重命名真实文件（谨慎）" }
    ],
    "configuration": {
      "title": "AI Suite",
      "properties": {
        "aiSuite.showAlias": {
          "type": "boolean",
          "default": true,
          "description": "树视图主标签显示中文别名（true）或原名（false）。"
        },
        "aiSuite.cacheFile": {
          "type": "string",
          "default": ".ai-name-cache.json",
          "description": "工作区根目录下的可选缓存文件（相对路径）。留空仅用 workspaceState。"
        },
        "aiSuite.maxConcurrency": {
          "type": "number",
          "default": 3,
          "minimum": 1,
          "maximum": 10,
          "description": "批量翻译并发上限。"
        },
        "aiSuite.rename.safeMode": {
          "type": "boolean",
          "default": true,
          "description": "重命名安全模式（逐项确认、冲突检查）。"
        }
      }
    }
  },
  "main": "./out/extension.js",
  "scripts": {
    "vscode:prepublish": "npm run build",
    "build": "tsc -p .",
    "watch": "tsc -w -p ."
  },
  "devDependencies": {
    "@types/node": "^20.12.12",
    "typescript": "^5.4.0"
  }
}
```

---

## 2) tsconfig.json

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "rootDir": "src",
    "outDir": "out",
    "strict": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": "src",
    "paths": {
      "@core/*": ["core/*"],
      "@feat/explorer/*": ["features/explorer-alias/*"],
      "@shared/*": ["shared/*"]
    }
  },
  "include": ["src"]
}
```

---

## 3) 插件入口

```ts
// src/extension.ts
// src/extension.ts
/**
 * 插件入口：注册“AI 资源管理器（中文别名）”视图与命令。
 * 本文件只做“轻启动与路由”，具体业务在 features/explorer-alias 下。
 */
import * as vscode from 'vscode';
import { registerExplorerAlias } from './features/explorer-alias';

export async function activate(context: vscode.ExtensionContext) {
  // 注册 Feature A：AI 资源管理器（中文别名）
  const provider = registerExplorerAlias(context);
  // 文件系统变化监听（新建/删除/修改触发刷新）
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  watcher.onDidCreate(() => provider.refresh());
  watcher.onDidDelete(() => provider.refresh());
  watcher.onDidChange(() => provider.softRefresh());
  context.subscriptions.push(watcher);
}

export function deactivate() {}
```

---

## 4) Feature A 入口与命令注册

```ts
// src/features/explorer-alias/index.ts
// src/features/explorer-alias/index.ts
/**
 * Feature A：AI 资源管理器（中文别名）— 注册视图与命令
 */
import * as vscode from 'vscode';
import { AIExplorerProvider } from './ui/AIExplorerProvider';
import { NameCacheStore } from './infra/cache/NameCacheStore';
import { GlossaryPolicy } from './domain/policies/GlossaryPolicy';
import { RuleEngine } from './domain/policies/RuleEngine';
import { TranslateNodeUseCase } from './app/TranslateNodeUseCase';
import { TranslateBatchUseCase } from './app/TranslateBatchUseCase';

export function registerExplorerAlias(context: vscode.ExtensionContext) {
  // 读取配置
  const config = vscode.workspace.getConfiguration('aiSuite');
  const showAlias = config.get<boolean>('aiSuite.showAlias', true);
  const cacheFile = config.get<string>('aiSuite.cacheFile', '.ai-name-cache.json');
  const maxConcurrency = Math.max(1, Math.min(10, config.get<number>('aiSuite.maxConcurrency', 3)));

  // 缓存
  const cache = new NameCacheStore(context, cacheFile);
  // 词表 & 规则（MVP 仅用本地策略，后续可插入 OpenAITranslator）
  const glossary = new GlossaryPolicy();
  const rules = new RuleEngine();

  // 用例
  const translateNode = new TranslateNodeUseCase(glossary, rules, cache);
  const translateBatch = new TranslateBatchUseCase(translateNode, cache, maxConcurrency);

  // Provider
  const provider = new AIExplorerProvider({ cache, translateNode, translateBatch, showAlias });

  // 视图注册
  const tree = vscode.window.createTreeView('aiExplorer', { treeDataProvider: provider, showCollapseAll: true });
  context.subscriptions.push(tree);

  // 命令注册
  context.subscriptions.push(
    vscode.commands.registerCommand('aiExplorer.refresh', () => provider.refresh()),
    vscode.commands.registerCommand('aiExplorer.toggleShowAlias', async () => {
      provider.toggleShowAlias();
      await vscode.workspace.getConfiguration('aiSuite').update('aiSuite.showAlias', provider.getShowAlias(), true);
    }),
    vscode.commands.registerCommand('aiExplorer.translateNode', async (item?: any) => {
      await provider.translateNode(item);
    }),
    vscode.commands.registerCommand('aiExplorer.translateAll', async () => {
      await provider.translateAllInWorkspace();
    }),
    vscode.commands.registerCommand('aiExplorer.renameToAlias', async (item?: any) => {
      await provider.renameToAlias(item);
    })
  );

  return provider;
}
```

---

## 5) 领域接口（Ports）

```ts
// src/features/explorer-alias/domain/ports.ts
// src/features/explorer-alias/domain/ports.ts
/**
 * 领域接口：上层（UI/UseCase）只依赖这些接口，便于后续插入 OpenAI Translator。
 */
export type NodeKind = 'folder' | 'file';
export type AliasSource = 'dict' | 'rule' | 'ai' | 'manual' | 'unknown';

export interface AliasResult {
  alias: string;
  source: AliasSource;
  confidence: number; // 0~1
}

export interface Glossary {
  lookup(name: string): AliasResult | undefined;
}

export interface RuleApplier {
  apply(name: string, kind: NodeKind): AliasResult | undefined;
}

export interface CacheStore {
  has(fsPath: string): boolean;
  get(fsPath: string): AliasResult | undefined;
  set(fsPath: string, res: AliasResult): void;
  move(oldFsPath: string, newFsPath: string): void;
  loadFromDiskIfPossible(): Promise<void>;
  flushToDiskIfPossible(): Promise<void>;
}
```

---

## 6) 词表与规则（MVP 可高命中）

```ts
// src/features/explorer-alias/domain/policies/GlossaryPolicy.ts
// src/features/explorer-alias/domain/policies/GlossaryPolicy.ts
/**
 * 词表策略：高频目录/文件名的固定中文映射（命中即 1.0）
 */
import { AliasResult, Glossary } from '../ports';

export class GlossaryPolicy implements Glossary {
  private map: Record<string, string> = {
    'README': '自述',
    'readme': '自述',
    'CHANGELOG': '更新日志',
    'LICENSE': '许可证',
    'src': '源码',
    'dist': '构建产物',
    'build': '构建产物',
    'out': '产出',
    'node_modules': '依赖模块',
    'public': '公开资源',
    'assets': '资源',
    'static': '静态资源',
    'components': '组件',
    'pages': '页面',
    'views': '视图',
    'hooks': '钩子',
    'utils': '工具',
    'lib': '库',
    'types': '类型',
    'models': '模型',
    'services': '服务',
    'controllers': '控制器',
    'routes': '路由',
    'config': '配置',
    'scripts': '脚本',
    'tests': '测试',
    'test': '测试',
    'doc': '文档',
    'docs': '文档',
    'example': '示例',
    'examples': '示例'
  };

  lookup(name: string): AliasResult | undefined {
    const base = name.replace(/\.(md|txt|json|ts|tsx|js|jsx|mjs|cjs)$/i, '');
    const hit = this.map[base];
    if (hit) return { alias: hit, source: 'dict', confidence: 1.0 };
    return undefined;
  }
}
```

```ts
// src/features/explorer-alias/domain/policies/RuleEngine.ts
// src/features/explorer-alias/domain/policies/RuleEngine.ts
/**
 * 规则策略：常见命名模式 → 中文短名（置信度 0.8~0.95）
 * 仅处理“短名可读性增强”，不做复杂 NLP。
 */
import { AliasResult, NodeKind, RuleApplier } from '../ports';

export class RuleEngine implements RuleApplier {
  apply(name: string, kind: NodeKind): AliasResult | undefined {
    const base = name;

    // 1) index / main / app
    if (/^index\.[^.]+$/i.test(base)) return { alias: '索引', source: 'rule', confidence: 0.9 };
    if (/^main\.[^.]+$/i.test(base)) return { alias: '主程序', source: 'rule', confidence: 0.9 };
    if (/^app\.[^.]+$/i.test(base)) return { alias: '应用', source: 'rule', confidence: 0.85 };

    // 2) i18n / locales
    if (/^i18n$/i.test(base) || /^locales?$/i.test(base)) return { alias: '多语言', source: 'rule', confidence: 0.95 };

    // 3) 驼峰/短横线/下划线 -> 拆词再“直译式中文”
    const englishWords = base.replace(/\.[^.]+$/, '').split(/[-_.]/g);
    if (englishWords.length >= 2 && englishWords.every(w => w.length <= 12)) {
      const map: Record<string, string> = {
        'user': '用户', 'account':'账号', 'profile':'资料', 'auth':'认证', 'login':'登录', 'logout':'登出',
        'order':'订单', 'payment':'支付', 'cart':'购物车',
        'setting':'设置', 'config':'配置', 'common':'通用',
        'helper':'助手', 'helper(s)':'助手', 'util(s)':'工具',
        'service(s)':'服务', 'controller(s)':'控制器',
        'test(s)':'测试', 'spec':'测试',
        'widget(s)':'部件', 'hook(s)':'钩子'
      };
      const zh = englishWords.map(w => map[w.toLowerCase()] ?? w).join('');
      if (/[^\u4e00-\u9fa5]/.test(zh) === false) {
        return { alias: zh.slice(0, 16), source: 'rule', confidence: 0.8 };
      }
    }

    // 4) 文件夹 kind 的通用规则
    if (kind === 'folder') {
      if (/^\d{2,}[-_.]/.test(base)) return { alias: '序号分组', source: 'rule', confidence: 0.7 };
    }

    return undefined;
  }
}
```

---

## 7) 缓存实现（workspaceState + 可选 JSON 落盘）

```ts
// src/features/explorer-alias/infra/cache/NameCacheStore.ts
// src/features/explorer-alias/infra/cache/NameCacheStore.ts
/**
 * 名称缓存：优先 workspaceState，支持落盘 `.ai-name-cache.json` 便于团队共享。
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { AliasResult, CacheStore } from '../../domain/ports';

export class NameCacheStore implements CacheStore {
  private key = 'aiSuite.explorerAlias.cache';
  private map = new Map<string, AliasResult>();
  private cacheFileRel?: string;

  constructor(private ctx: vscode.ExtensionContext, cacheFileRel?: string) {
    this.cacheFileRel = cacheFileRel && cacheFileRel.trim() ? cacheFileRel.trim() : undefined;
    const obj = this.ctx.workspaceState.get<Record<string, AliasResult>>(this.key, {});
    for (const [k, v] of Object.entries(obj)) this.map.set(k, v);
  }

  has(fsPath: string) { return this.map.has(fsPath); }
  get(fsPath: string) { return this.map.get(fsPath); }
  set(fsPath: string, res: AliasResult) {
    this.map.set(fsPath, res);
    this.persist();
  }
  move(oldFsPath: string, newFsPath: string) {
    const v = this.map.get(oldFsPath);
    if (v) { this.map.delete(oldFsPath); this.map.set(newFsPath, v); this.persist(); }
  }

  private persist() {
    const obj = Object.fromEntries(this.map.entries());
    this.ctx.workspaceState.update(this.key, obj);
  }

  async loadFromDiskIfPossible() {
    if (!this.cacheFileRel) return;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;
    const file = vscode.Uri.joinPath(root, this.cacheFileRel);
    try {
      const stat = await vscode.workspace.fs.stat(file);
      if (stat) {
        const buf = await vscode.workspace.fs.readFile(file);
        const text = Buffer.from(buf).toString('utf8');
        const json = JSON.parse(text) as Record<string, AliasResult>;
        for (const [k, v] of Object.entries(json)) this.map.set(k, v);
        this.persist();
      }
    } catch { /* 文件可能不存在，忽略 */ }
  }

  async flushToDiskIfPossible() {
    if (!this.cacheFileRel) return;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;
    const file = vscode.Uri.joinPath(root, this.cacheFileRel);
    const obj = Object.fromEntries(this.map.entries());
    const text = JSON.stringify(obj, null, 2);
    await vscode.workspace.fs.writeFile(file, Buffer.from(text, 'utf8'));
  }
}
```

---

## 8) 用例（单节点翻译 & 批量翻译）

```ts
// src/features/explorer-alias/app/TranslateNodeUseCase.ts
// src/features/explorer-alias/app/TranslateNodeUseCase.ts
/**
 * TranslateNode 用例：先词表→再规则→最后回退原名。
 * 以后接入 OpenAITranslator 时，只需在这里串上“AI 分支”即可。
 */
import { AliasResult, CacheStore, Glossary, NodeKind, RuleApplier } from '../domain/ports';

export class TranslateNodeUseCase {
  constructor(
    private glossary: Glossary,
    private rules: RuleApplier,
    private cache: CacheStore
  ) {}

  async exec(fsPath: string, name: string, kind: NodeKind): Promise<AliasResult> {
    const hitCache = this.cache.get(fsPath);
    if (hitCache) return hitCache;

    const byDict = this.glossary.lookup(name);
    if (byDict) { this.cache.set(fsPath, byDict); return byDict; }

    const byRule = this.rules.apply(name, kind);
    if (byRule) { this.cache.set(fsPath, byRule); return byRule; }

    // TODO: 未来这里插入 OpenAI Translator 分支
    const fallback: AliasResult = { alias: name, source: 'unknown', confidence: 0.5 };
    this.cache.set(fsPath, fallback);
    return fallback;
  }
}
```

```ts
// src/features/explorer-alias/app/TranslateBatchUseCase.ts
// src/features/explorer-alias/app/TranslateBatchUseCase.ts
/**
 * 批量翻译：并发小队列（MVP 简化版），完成后落盘缓存。
 */
import { CacheStore, NodeKind } from '../domain/ports';
import { TranslateNodeUseCase } from './TranslateNodeUseCase';

type Item = { fsPath: string; name: string; kind: NodeKind };

export class TranslateBatchUseCase {
  constructor(
    private translateNode: TranslateNodeUseCase,
    private cache: CacheStore,
    private concurrency: number
  ) {}

  async exec(items: Item[], onProgress?: (done: number, total: number) => void) {
    const queue = items.slice();
    let done = 0;

    const worker = async () => {
      while (queue.length) {
        const it = queue.shift()!;
        await this.translateNode.exec(it.fsPath, it.name, it.kind);
        done++; onProgress?.(done, items.length);
      }
    };

    const workers = Array.from({ length: this.concurrency }, () => worker());
    await Promise.all(workers);
    await this.cache.flushToDiskIfPossible();
  }
}
```

---

## 9) TreeDataProvider（核心 UI）

```ts
// src/features/explorer-alias/ui/AIExplorerProvider.ts
// src/features/explorer-alias/ui/AIExplorerProvider.ts
/**
 * TreeDataProvider：镜像文件树，主/副标题显示中文别名/原名可切换。
 * 右键/命令：翻译单个/全局、刷新、重命名为别名（谨慎）。
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { CacheStore, NodeKind } from '../domain/ports';
import { TranslateNodeUseCase } from '../app/TranslateNodeUseCase';
import { TranslateBatchUseCase } from '../app/TranslateBatchUseCase';

type AINode = { uri: vscode.Uri; kind: NodeKind };

export class AIExplorerProvider implements vscode.TreeDataProvider<AINode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AINode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private showAlias: boolean;

  constructor(
    private deps: {
      cache: CacheStore;
      translateNode: TranslateNodeUseCase;
      translateBatch: TranslateBatchUseCase;
      showAlias: boolean;
    }
  ) { this.showAlias = deps.showAlias; }

  refresh(): void { this._onDidChangeTreeData.fire(); }
  softRefresh(): void { this._onDidChangeTreeData.fire(undefined); }
  toggleShowAlias() { this.showAlias = !this.showAlias; this.refresh(); }
  getShowAlias() { return this.showAlias; }

  getTreeItem(element: AINode): vscode.TreeItem {
    const base = path.basename(element.uri.fsPath);
    const cached = this.deps.cache.get(element.uri.fsPath);
    const alias = cached?.alias;

    const label = this.showAlias ? (alias ?? base) : base;
    const description = this.showAlias ? base : (alias ?? '');

    const item = new vscode.TreeItem(
      label,
      element.kind === 'folder' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    item.description = description || undefined;
    item.resourceUri = element.uri; // 让 VS Code 自动应用图标/装饰
    item.iconPath = element.kind === 'folder' ? new vscode.ThemeIcon('folder') : new vscode.ThemeIcon('file');
    item.tooltip = alias ? `${base}\n中文别名：${alias}` : base;

    // 双击/回车打开文件
    if (element.kind === 'file') {
      item.command = { command: 'vscode.open', title: '打开', arguments: [element.uri] };
    }
    return item;
  }

  async getChildren(element?: AINode): Promise<AINode[]> {
    if (!vscode.workspace.workspaceFolders?.length) return [];
    if (!element) return this.getRoots();

    const entries = await vscode.workspace.fs.readDirectory(element.uri);
    const children: AINode[] = entries
      .filter(([name, type]) => !shouldIgnore(name))
      .map(([name, fileType]) => ({
        uri: vscode.Uri.joinPath(element.uri, name),
        kind: fileType === vscode.FileType.Directory ? 'folder' : 'file'
      }));

    // 排序：文件夹在前，按原名升序
    children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return path.basename(a.uri.fsPath).localeCompare(path.basename(b.uri.fsPath));
    });
    return children;
  }

  private async getRoots(): Promise<AINode[]> {
    const roots = vscode.workspace.workspaceFolders ?? [];
    return roots.map(f => ({ uri: f.uri, kind: 'folder' as const }));
  }

  /** 翻译单节点（递归） */
  async translateNode(item?: AINode) {
    const targets = item ? [item] : await this.getRoots();
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: '生成中文别名…' },
      async () => {
        for (const node of targets) await this.ensureAliasRecursive(node);
        await this.deps.cache.flushToDiskIfPossible();
        this.refresh();
      }
    );
  }

  /** 翻译整个工作区（可见 + 递归） */
  async translateAllInWorkspace() {
    const roots = await this.getRoots();
    const list: { fsPath: string; name: string; kind: NodeKind }[] = [];
    for (const r of roots) await this.collectRecursively(r, list);
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: '批量生成中文别名…' },
      async (progress) => {
        let last = 0;
        await this.deps.translateBatch.exec(list, (done, total) => {
          const inc = Math.max(0, Math.min(100, (done / total) * 100)) - last;
          last += inc; progress.report({ increment: inc });
        });
        this.refresh();
      }
    );
  }

  /** 用别名重命名真实文件（谨慎） */
  async renameToAlias(item?: AINode) {
    const config = vscode.workspace.getConfiguration('aiSuite');
    const safeMode = config.get<boolean>('aiSuite.rename.safeMode', true);
    const targets = item ? [item] : await this.getRoots();
    for (const node of targets) await this.renameRecursive(node, safeMode);
    this.refresh();
  }

  // === 内部：递归工具 ===
  private async ensureAliasRecursive(node: AINode) {
    const fsPath = node.uri.fsPath;
    const name = path.basename(fsPath);
    await this.deps.translateNode.exec(fsPath, name, node.kind);
    if (node.kind === 'folder') {
      const children = await this.getChildren(node);
      for (const c of children) await this.ensureAliasRecursive(c);
    }
  }

  private async collectRecursively(node: AINode, out: { fsPath: string; name: string; kind: NodeKind }[]) {
    const fsPath = node.uri.fsPath;
    const name = path.basename(fsPath);
    out.push({ fsPath, name, kind: node.kind });
    if (node.kind === 'folder') {
      const children = await this.getChildren(node);
      for (const c of children) await this.collectRecursively(c, out);
    }
  }

  private async renameRecursive(node: AINode, safeMode: boolean) {
    const fsPath = node.uri.fsPath;
    const alias = this.deps.cache.get(fsPath)?.alias;
    if (alias && alias !== path.basename(fsPath)) {
      const safeAlias = sanitizeFileName(alias);
      if (safeMode) {
        const ok = await vscode.window.showWarningMessage(
          `重命名：\n${path.basename(fsPath)}  →  ${safeAlias}\n是否确认对真实文件进行重命名？`,
          { modal: true }, '确认', '跳过'
        );
        if (ok !== '确认') return;
      }
      try {
        const newUri = vscode.Uri.joinPath(vscode.Uri.file(path.dirname(fsPath)), safeAlias);
        await vscode.workspace.fs.rename(node.uri, newUri, { overwrite: false });
        this.deps.cache.move(fsPath, newUri.fsPath);
      } catch (e: any) {
        vscode.window.showErrorMessage(`重命名失败：${e?.message ?? e}`);
      }
    }
    if (node.kind === 'folder') {
      const children = await this.getChildren(node);
      for (const c of children) await this.renameRecursive(c, safeMode);
    }
  }
}

function shouldIgnore(name: string): boolean {
  // 常见忽略：可按需扩展或读取 files.exclude
  return [
    '.git', '.hg', '.svn', 'node_modules', 'dist', 'build', 'out', 'coverage', '.vscode', '.idea'
  ].includes(name);
}

function sanitizeFileName(input: string): string {
  return input
    .replace(/[\\/:*?"<>|]/g, '·')  // Windows 不允许的字符替换
    .replace(/\s+$/g, '')           // 去尾空
    .replace(/^\s+/g, '')           // 去首空
    .slice(0, 180);                 // 避免路径过长
}
```

---

# 运行与下一步

**运行：**

1. 把以上文件按路径新建；根目录 `npm i` → `npm run build`。
2. 用 VS Code 打开工程，按 **F5** 启动“扩展开发宿主”。
3. 在宿主窗口打开你的实际项目工作区 → 侧边栏点开 **AI 资源管理器（中文别名）**。
4. 命令面板/右键使用：

   * **AI 资源管理器：翻译整个工作区**（先词表/规则，结果会缓存到 `workspaceState` + 可选 `.ai-name-cache.json`）
   * **切换显示 中文别名/原名**
   * **用别名重命名真实文件（谨慎）**

**下一步接 OpenAI：**

* 新建 `infra/translators/OpenAITranslator.ts` 实现 `translate(name) → AliasResult`，在 `TranslateNodeUseCase` 里把它接到“词表 → 规则 → AI → 回退”的链路末端即可。
* 限流/重试/超时建议统一放到 `core/`（我们已为 MVP 预留了插口，未来按你需要补上即可）。

> 如果你想，我可以**把 OpenAITranslator 版本也一起补上**（含 API Key 存 SecretStorage、并发与速率限制、指数退避），直接替换到 `TranslateNodeUseCase` 的“TODO”位置，无缝升级为“真·AI 资源管理器”。
