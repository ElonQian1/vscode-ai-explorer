可以！下面给你两种路径：

- ✅ **你已经合入我之前给的“设置 Key/选择 Provider”命令** → 直接看“#1 操作步骤”。
- 🔧 **你的仓库里还没有这些命令** → 按“#2 一次性补齐代码”，3 个小改动就能用。

---

# 1) 直接使用（已经合入命令时）

1. 打开 VS Code 的命令面板：`Ctrl/⌘ + Shift + P`
2. 依次执行：

   - **AI Suite：设置 OpenAI API Key**（或 **AI Suite：设置腾讯混元 API Key**）
   - **AI Suite：选择主用模型提供方**（OpenAI / 腾讯混元）

3. 到左侧 **AI 资源管理器（中文别名）** 视图，运行：

   - **AI 资源管理器：翻译整个工作区**（或右键节点 → 翻译所选）

4. 成功后，项目根目录会出现/更新：`.ai-glossary.learned.json`（学习型词典），以后同名**不再重复请求**。

> Key 会安全地存到 VS Code 的 SecretStorage（本机层面，不会进 Git）。
> 如遇 401/权限问题：确认 key 正确、`baseUrl` 正确（OpenAI 默认 `https://api.openai.com/v1`；混元默认 `https://api.hunyuan.cloud.tencent.com/v1`）。

---

# 2) 还没合入命令？按下面 3 个改动即可

## (A) `package.json`：加命令 + 配置

```json
// package.json（片段）
{
  "contributes": {
    "commands": [
      {
        "command": "aiSuite.setOpenAIKey",
        "title": "AI Suite：设置 OpenAI API Key"
      },
      {
        "command": "aiSuite.setHunyuanKey",
        "title": "AI Suite：设置腾讯混元 API Key"
      },
      {
        "command": "aiSuite.chooseProvider",
        "title": "AI Suite：选择主用模型提供方"
      }
    ],
    "configuration": {
      "title": "AI Suite",
      "properties": {
        "aiSuite.provider.primary": {
          "type": "string",
          "enum": ["openai", "hunyuan"],
          "default": "openai"
        },
        "aiSuite.provider.fallback": {
          "type": "string",
          "enum": ["none", "openai", "hunyuan"],
          "default": "hunyuan"
        },

        "aiSuite.openai.baseUrl": {
          "type": "string",
          "default": "https://api.openai.com/v1"
        },
        "aiSuite.openai.model": { "type": "string", "default": "gpt-4o-mini" },
        "aiSuite.openai.timeoutMs": { "type": "number", "default": 10000 },

        "aiSuite.hunyuan.baseUrl": {
          "type": "string",
          "default": "https://api.hunyuan.cloud.tencent.com/v1"
        },
        "aiSuite.hunyuan.model": {
          "type": "string",
          "default": "hunyuan-lite"
        },
        "aiSuite.hunyuan.timeoutMs": { "type": "number", "default": 10000 }
      }
    }
  }
}
```

> 若你用了 `@core/*` 这类 **TS 路径别名**，请确保 `scripts.build` 有 `tsc-alias`：
> `"build": "tsc -p . && tsc-alias -p tsconfig.json"`

## (B) `src/extension.ts`：实现 3 个命令（保存 Key & 选择 Provider）

```ts
// src/extension.ts
// src/extension.ts
/** 插件入口：设置 Key / 选择 Provider；然后注册 AI 资源管理器视图 */
import * as vscode from "vscode";
import { registerExplorerAlias } from "./features/explorer-alias";

export async function activate(context: vscode.ExtensionContext) {
  // 设置 OpenAI Key
  context.subscriptions.push(
    vscode.commands.registerCommand("aiSuite.setOpenAIKey", async () => {
      const v = await vscode.window.showInputBox({
        title: "输入 OpenAI API Key",
        password: true,
        ignoreFocusOut: true,
      });
      if (v) {
        await context.secrets.store("aiSuite.key.openai", v);
        vscode.window.showInformationMessage("OpenAI Key 已保存");
      }
    })
  );

  // 设置腾讯混元 Key
  context.subscriptions.push(
    vscode.commands.registerCommand("aiSuite.setHunyuanKey", async () => {
      const v = await vscode.window.showInputBox({
        title: "输入腾讯混元 API Key",
        password: true,
        ignoreFocusOut: true,
      });
      if (v) {
        await context.secrets.store("aiSuite.key.hunyuan", v);
        vscode.window.showInformationMessage("混元 Key 已保存");
      }
    })
  );

  // 选择主用 Provider
  context.subscriptions.push(
    vscode.commands.registerCommand("aiSuite.chooseProvider", async () => {
      const pick = await vscode.window.showQuickPick(
        [
          { label: "OpenAI", value: "openai" },
          { label: "腾讯混元", value: "hunyuan" },
        ],
        { title: "选择主用模型提供方" }
      );
      if (pick) {
        await vscode.workspace
          .getConfiguration("aiSuite")
          .update(
            "aiSuite.provider.primary",
            pick.value,
            vscode.ConfigurationTarget.Global
          );
        vscode.window.showInformationMessage(`已选择主用提供方：${pick.label}`);
      }
    })
  );

  // 注册“AI 资源管理器”视图（你已实现）
  const provider = registerExplorerAlias(context);

  // 文件系统监听（可保留你的实现）
  const watcher = vscode.workspace.createFileSystemWatcher("**/*");
  watcher.onDidCreate(() => provider.refresh());
  watcher.onDidDelete(() => provider.refresh());
  watcher.onDidChange(() => provider.softRefresh());
  context.subscriptions.push(watcher);
}

export function deactivate() {}
```

## (C) 确保“翻译用例”确实会走 AI

你的 `TranslateNodeUseCase` 里应该是**链路末端**调用 AI（找不到时才请求），例如：

```ts
// src/features/explorer-alias/app/TranslateNodeUseCase.ts
// src/features/explorer-alias/app/TranslateNodeUseCase.ts
/** 词表 → 学习词典 → 规则 → AI → 回写缓存/词典 */
import { LearnedGlossaryStore } from "../infra/cache/LearnedGlossaryStore";
import { AITranslatorRouter } from "../infra/translators/AITranslatorRouter";

export class TranslateNodeUseCase {
  constructor(
    private glossary: { lookup(n: string): any },
    private learned: LearnedGlossaryStore,
    private rules: { apply(n: string, k: "file" | "folder"): any },
    private cache: { get(p: string): any; set(p: string, r: any): void },
    private ai?: AITranslatorRouter // ← 有注入才会走 AI
  ) {}

  async exec(fsPath: string, name: string, kind: "file" | "folder") {
    const c = this.cache.get(fsPath);
    if (c) return c;
    const d = this.glossary.lookup(name);
    if (d) {
      this.cache.set(fsPath, d);
      return d;
    }
    const l = await this.learned.get(name);
    if (l) {
      const r = { alias: l, source: "ai", confidence: 0.9 };
      this.cache.set(fsPath, r);
      return r;
    }
    const r = this.rules.apply(name, kind);
    if (r) {
      this.cache.set(fsPath, r);
      return r;
    }

    // —— 只有前面都未命中，才会真正请求 AI ——
    if (this.ai) {
      try {
        const map = await this.ai.translateAliasBatch([name]);
        const alias = (map[name] || "").trim();
        if (alias) {
          const ar = { alias, source: "ai", confidence: 0.9 };
          this.cache.set(fsPath, ar);
          await this.learned.set(name, alias);
          return ar;
        }
      } catch {}
    }
    const fb = { alias: name, source: "unknown", confidence: 0.5 };
    this.cache.set(fsPath, fb);
    return fb;
  }
}
```

> 如果 `AITranslatorRouter` / `ProviderRegistry` 你还没放进来，我之前给过完整文件；照着加到 `core/` 与 `infra/translators/` 并在 `features/explorer-alias/index.ts` 里**注入**即可。

---

## 使用与验证

- 先运行：**AI Suite：设置 OpenAI/混元 API Key** → **AI Suite：选择主用模型提供方**
- 打开 **AI 资源管理器** → 执行 **翻译整个工作区**。
- 看项目根是否生成/更新 `.ai-glossary.learned.json`；再次翻译**同名**时将不再打 API。
- 若遇 429/限速：把设置里的 `aiSuite.maxConcurrency` 或 `aiSuite.maxRPM` 调小。

需要的话，我可以按你仓库的实际文件路径，列出“**精确到行**”的补丁清单，照贴就能跑。
