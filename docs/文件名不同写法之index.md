绝对可以把一大堆 `index.ts` 翻得**有语义又不混淆**。思路是：
**把 `index` 视为“当前目录的入口”** → 用“父级（或祖先）目录的中文名 + 入口 + 扩展后缀”来生成别名；只有在无法识别父级语义时才退回通用“入口模块”。

---

## 推荐约定（TypeScript/JavaScript 项）

- `.ts` → “**…入口模块**”
- `.tsx/.jsx` → “**…入口组件**”
- `.js/.mjs/.cjs` → “**…入口脚本**”

例子（都不需要 AI，也不会重名）：

- `src/api/index.ts` → **API 入口模块**
- `src/api/universal-ui/index.ts` → **通用 UI 入口模块**
- `src/features/user/index.ts` → **用户功能 入口模块**（可按你项目词表把 `features→功能`）
- `packages/web/index.tsx` → **Web 入口组件**

> 如果父级是**无语义目录**（如 `src/`, `lib/`），就**向上找一层**直到遇到有意义的父名；还是找不到，就叫 **入口模块**。

---

## 规则落地（算法）

1. 判断是否匹配入口文件：`basename ∈ {index, main, default}`（可配）。
2. 取父级目录中文名：

   - 先查**路径缓存**（如果之前已经翻译过该文件夹），
   - 再查**项目词表** / **内置词表**（例如 `api→API`, `components→组件`, `utils→工具`, `pages→页面`…），
   - 仍无 → 用**规则引擎**把父目录英文拆词后生成中文（不调用 AI）。
   - 如果父级是 `src/lib/dist/build` 等“弱语义目录”，**向上找祖先**。

3. 组装：`<父/祖先中文> + 入口 + <扩展后缀>`，例如“API 入口模块”。
4. 清洗非法符号、限长（如 32 字）。

---

## 直接可用的代码（两处增量）

### A) 新增“入口感知”的规则封装（优先于普通规则）

```ts
// 文件名: src/features/explorer-alias/domain/policies/IndexAwareRule.ts
/**
 * IndexAwareRule：让 index.ts/main.ts 这类“入口文件”翻译为
 *   <父级中文> + 入口 + <扩展后缀>（找不到父级语义则回退为“入口模块/组件/脚本”）
 * - 不调用 AI（纯本地策略）
 * - 会自动跳过弱语义目录：src/lib/dist/build
 */
import * as path from "path";
import * as vscode from "vscode";
import { tokenizeFileName, stripExt } from "@shared/naming/NameTokenizer";
import { SmartRuleEngine } from "./SmartRuleEngine";

const WEAK_DIRS = new Set(["src", "lib", "dist", "build", "out"]);
const EXT_SUFFIX: Record<string, string> = {
  tsx: "组件",
  jsx: "组件",
  ts: "模块",
  js: "脚本",
  mjs: "脚本",
  cjs: "脚本",
};

export class IndexAwareRule {
  constructor(
    private deps: {
      cache: { get(p: string): { alias: string } | undefined };
      // 纯本地，不要走 AI：
      glossary: { lookup(n: string): { alias: string } | undefined };
      projectDict?: { get(n: string): Promise<{ alias: string } | undefined> };
      smartRule: SmartRuleEngine;
    }
  ) {}

  translate(
    fsPath: string,
    name: string,
    kind: "file" | "folder"
  ): { alias: string; source: "rule"; confidence: number } | undefined {
    // 仅处理文件，且文件名为 index/main/default
    const base = path.basename(name, path.extname(name)).toLowerCase();
    if (kind !== "file") return;
    if (!["index", "main", "default"].includes(base)) return;

    const ext = stripExt(name).ext;
    const suffix = EXT_SUFFIX[ext] ? ` ${EXT_SUFFIX[ext]}` : " 模块"; // 没匹配到扩展名时默认“模块”

    // 逐层向上寻找有语义的父级中文名
    let dir = path.dirname(fsPath);
    let tries = 0;
    while (tries < 3 && dir && dir !== path.dirname(dir)) {
      const parentName = path.basename(dir);
      if (!WEAK_DIRS.has(parentName.toLowerCase())) {
        // 1) 路径缓存命中（最优）
        const cached = this.deps.cache.get(dir);
        const parentAlias =
          cached?.alias ||
          this.lookupLocal(parentName) || // 2) 本地词典
          this.deps.smartRule.translate(parentName)?.alias || // 3) 规则引擎
          parentName; // 4) 回退英文
        const alias = sanitize(`${parentAlias}入口${suffix}`);
        return { alias, source: "rule", confidence: 0.92 };
      }
      dir = path.dirname(dir);
      tries++;
    }

    // 实在找不到有语义的父级
    return { alias: `入口${suffix}`.trim(), source: "rule", confidence: 0.85 };
  }

  private lookupLocal(n: string): string | undefined {
    const g = this.deps.glossary.lookup(n)?.alias;
    if (g) return g;
    // 项目词表（可选）
    // 注意：这里不 await，以免阻塞；你也可以在构造时把项目词表预加载进内存
    return undefined;
  }
}

function sanitize(s: string) {
  return (s || "")
    .replace(/[\\/:*?"<>|]/g, "·")
    .trim()
    .slice(0, 32);
}
```

> 要点：
>
> - 只在 `index/main/default` 且 `kind==='file'` 时生效；
> - **先**看缓存（如果父目录之前已翻过名），**再**看词表，最后用 `SmartRuleEngine` 纯规则生成；
> - 遇到 `src/lib/dist/build/out` 这类弱语义目录会**往祖先攀升**，避免“源码入口模块”这种尴尬。

---

### B) 在用例里接上（插在“规则”分支之前）

```ts
// 文件名: src/features/explorer-alias/app/TranslateNodeUseCase.ts
/**
 * 顺序：词表 → 学习词典 → IndexAwareRule（入口感知） → SmartRuleEngine → AI 兜底 → 回退
 */
import { IndexAwareRule } from "../domain/policies/IndexAwareRule";
import { SmartRuleEngine } from "../domain/policies/SmartRuleEngine";

export class TranslateNodeUseCase {
  private smart = new SmartRuleEngine();
  private indexAware: IndexAwareRule;

  constructor(
    private glossary: { lookup(n: string): any },
    private learned: any,
    private cache: { get(p: string): any; set(p: string, r: any): void },
    private ai?: {
      translateAliasBatch(names: string[]): Promise<Record<string, string>>;
    }
  ) {
    this.indexAware = new IndexAwareRule({
      cache: this.cache as any,
      glossary: this.glossary as any,
      smartRule: this.smart,
    });
  }

  async exec(fsPath: string, name: string, kind: "file" | "folder") {
    const c = this.cache.get(fsPath);
    if (c) return c;

    // 1) 词表
    const d = this.glossary.lookup(name);
    if (d) {
      this.cache.set(fsPath, d);
      return d;
    }

    // 2) 学习词典
    const l = await this.learned.get?.(name);
    if (l) {
      const r = { alias: l.alias, source: "ai", confidence: 0.9 };
      this.cache.set(fsPath, r);
      return r;
    }

    // 3) 入口感知（index/main/default）
    const idx = this.indexAware.translate(fsPath, name, kind);
    if (idx) {
      this.cache.set(fsPath, idx);
      return idx;
    }

    // 4) 普通规则
    const byRule = this.smart.translate(name);
    if (byRule) {
      this.cache.set(fsPath, byRule);
      return byRule;
    }

    // 5) AI 兜底（保持你现有实现）
    if (this.ai) {
      try {
        const map = await this.ai.translateAliasBatch([name]);
        const alias = (map[name] || "").trim();
        if (alias) {
          const r = { alias, source: "ai", confidence: 0.9 };
          this.cache.set(fsPath, r);
          await this.learned.set?.(name, {
            alias,
            source: "ai",
            at: new Date().toISOString(),
          });
          return r;
        }
      } catch {}
    }

    // 6) 回退
    const fb = { alias: name, source: "unknown", confidence: 0.5 };
    this.cache.set(fsPath, fb);
    return fb;
  }
}
```

---

## 词表建议（提升命中与口径一致性）

在 `GlossaryPolicy` 或 `/.ai-glossary.json` 里固定常见目录中文：
`api→API`，`components→组件`，`pages→页面`，`utils→工具`，`hooks→钩子`，`services→服务`，`models→模型`，`controllers→控制器`，`store→状态`，`styles→样式`，`tests→测试`，`universal→通用` …
这样 `…/index.ts` 的父级语义一出来，入口别名就稳定了。

---

## QA：我的代码能不能很好翻“一堆 index.ts”？

**能。**有了 `IndexAwareRule`：

- 它会把 **每个 index.ts** 翻成“**父级中文 + 入口 + 后缀**”，不会都叫“入口模块”。
- 当父级是弱语义目录时，会自动**向上找祖先**避免无意义别名。
- 整套逻辑**不依赖 AI**；真遇到怪词再走**学习词典/AI 兜底**，学一次后全局命中。

---

如果你愿意，我可以对照你仓库的路径，把这两个文件放到恰当位置，并把 `TranslateNodeUseCase` 的改动精确到行号发给你，照贴就能跑。
