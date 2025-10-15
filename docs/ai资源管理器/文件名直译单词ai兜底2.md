这种直译风， 保留分隔符，是不是能又死板又快？ 我喜欢这种死板又快的方式，命不中的单词让 ai 兜底，把整个文件名发给 ai，让 ai 兜底给出最好的单词建议。

可以的！你要的就是**“死板又快”**：

- **保持原始分隔符/扩展名**（不重组语序，不加中文后缀）；
- **能命中字典就直译**；
- **命不中**就把**整条文件名**丢给 AI，请它只给出**缺失词/短语的中文建议**；
- 学到的新词**写回直译词典**，下次**零请求**。

下面给你一套可直接落地的实现（含中文注释、每段代码都带“文件名注释”）。

---

# 1) 分词（保留分隔符）

```ts
// 文件名: src/shared/naming/SplitWithDelimiters.ts
/**
 * 作用：把文件名拆成【词元数组】+【分隔符数组】，保持原始分隔符（- _ . 空串）与扩展名
 * 例： "analyze_element_hierarchy.cjs"
 *   → tokens: ["analyze","element","hierarchy"]
 *   → delims: ["_","_",""]    // tokens[i] 后跟 delims[i]
 *   → ext: "cjs"
 */
export type TokenPiece = {
  raw: string;
  lower: string;
  type: "word" | "acronym" | "num";
};

export function splitWithDelimiters(fileName: string): {
  tokens: TokenPiece[];
  delims: string[];
  ext: string;
} {
  const i = fileName.lastIndexOf(".");
  const base = i > 0 ? fileName.slice(0, i) : fileName;
  const ext = i > 0 ? fileName.slice(i + 1).toLowerCase() : "";

  // 先按非字母数字分隔，保留分隔符
  const parts: Array<{ t?: string; d?: string }> = [];
  base.replace(/([A-Za-z0-9]+)|([^A-Za-z0-9]+)/g, (_, word, delim) => {
    if (word) parts.push({ t: word });
    if (delim) parts.push({ d: delim });
    return "";
  });

  // 再把驼峰拆开，但保留“分隔符段”的原样
  const tokens: TokenPiece[] = [];
  const delims: string[] = [];
  for (let idx = 0; idx < parts.length; ) {
    const p = parts[idx];
    if (p.t) {
      // 可能是驼峰，拆成多段
      const segs = p.t
        .replace(/(?<=[a-z0-9])(?=[A-Z])/g, " ")
        .replace(/(?<=[A-Z])(?=[A-Z][a-z])/g, " ")
        .split(/\s+/)
        .filter(Boolean);
      for (let s = 0; s < segs.length; s++) {
        const raw = segs[s];
        tokens.push(classify(raw));
        // 下一段分隔符：看看紧随其后的 parts 是否是分隔符，否则为空串
        if (s === segs.length - 1) {
          const next = parts[idx + 1];
          if (next && next.d) {
            delims.push(next.d);
            idx += 2;
          } else {
            delims.push("");
            idx += 1;
          }
        } else {
          delims.push(""); // 驼峰内部没有分隔符
        }
      }
    } else {
      // 连续分隔符（极少见），跳过
      idx += 1;
    }
  }
  return { tokens, delims, ext };
}

function classify(raw: string): TokenPiece {
  if (/^\d+$/.test(raw)) return { raw, lower: raw, type: "num" };
  if (/^[A-Z]{2,}$/.test(raw))
    return { raw, lower: raw.toLowerCase(), type: "acronym" };
  return { raw, lower: raw.toLowerCase(), type: "word" };
}
```

---

# 2) 直译词典（分层 + 最长短语匹配）

```ts
// 文件名: src/shared/naming/LiteralDictResolver.ts
/**
 * 作用：直译词典解析（分层 + 最长短语匹配），不改变词序，不改分隔符。
 * 词典层级（优先级从高到低）：
 *   1) 项目固定：/.ai/.ai-literal.dict.json
 *   2) 项目学习：/.ai/.ai-glossary.literal.learned.json
 *   3) 全局学习：<globalStorage>/glossary.literal.json
 *   4) 内置：常用基础映射
 * 短语匹配优先（如 "element hierarchy"），再到单词。
 */
import * as vscode from "vscode";
import * as path from "path";

export type DictEntry = { alias: string };
type Words = Record<string, DictEntry>;
type Phrases = Record<string, DictEntry>;
export type TokenPiece = {
  raw: string;
  lower: string;
  type: "word" | "acronym" | "num";
};

export class LiteralDictResolver {
  private layers: Array<{ words: Words; phrases: Phrases }> = [];
  private builtin: { words: Words; phrases: Phrases } = {
    words: {
      analyze: { alias: "分析" },
      analysis: { alias: "分析" },
      element: { alias: "元素" },
      hierarchy: { alias: "层级" },
      simple: { alias: "简版" },
      example: { alias: "示例" },
      sample: { alias: "示例" },
      status: { alias: "状态" },
      section: { alias: "区块" },
      ui: { alias: "UI" },
      api: { alias: "API" },
    },
    phrases: { "element hierarchy": { alias: "元素_层级" } },
  };

  constructor(private ctx: vscode.ExtensionContext) {}

  async initialize() {
    const cfg = vscode.workspace.getConfiguration("aiSuite");
    const rels = cfg.get<string[]>("aiSuite.alias.literalDictPaths", [
      ".ai/.ai-literal.dict.json",
      ".ai/.ai-glossary.literal.learned.json",
    ]);

    this.layers = [];
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (root) {
      for (const rel of rels) {
        const u = vscode.Uri.joinPath(root, rel);
        const loaded = await this.tryLoad(u);
        if (loaded) this.layers.push(loaded);
      }
    }
    const g = vscode.Uri.joinPath(
      this.ctx.globalStorageUri,
      "glossary.literal.json"
    );
    const gl = await this.tryLoad(g);
    if (gl) this.layers.push(gl);

    this.layers.push(this.builtin);
  }

  resolve(tokens: TokenPiece[]): { mapped: string[]; unknown: string[] } {
    const norm = tokens.map((t) => normalize(t.lower));
    const mapped: string[] = [];
    const unknown: string[] = [];

    // 短语最长匹配（贪心）
    for (let i = 0; i < norm.length; ) {
      const phraseHit = this.phraseHit(norm, i);
      if (phraseHit) {
        mapped.push(phraseHit.zh);
        i = phraseHit.next;
        continue;
      }
      const t = tokens[i];
      const w = this.lookupWord(norm[i], t);
      if (w) mapped.push(w);
      else {
        mapped.push(t.raw);
        unknown.push(t.raw);
      }
      i += 1;
    }
    return { mapped, unknown };
  }

  /** 写入“项目学习直译词典” */
  async writeProjectLearning(k: string, alias: string) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;
    const rel = ".ai/.ai-glossary.literal.learned.json";
    const file = vscode.Uri.joinPath(root, rel);
    let obj: any = {};
    try {
      const buf = await vscode.workspace.fs.readFile(file);
      obj = JSON.parse(Buffer.from(buf).toString("utf8") || "{}");
    } catch {}
    if (!obj.words) obj.words = {};
    obj.words[k.toLowerCase()] = { alias };
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, ".ai"));
    await vscode.workspace.fs.writeFile(
      file,
      Buffer.from(JSON.stringify(obj, null, 2), "utf8")
    );
  }

  private phraseHit(
    seq: string[],
    start: number
  ): { zh: string; next: number } | undefined {
    // 从高优层到低优层找最长短语
    for (const layer of this.layers) {
      let best: { zh: string; next: number } | undefined;
      for (let end = seq.length; end > start; end--) {
        const key = seq.slice(start, end).join(" ");
        const hit = layer.phrases[key];
        if (hit) {
          best = { zh: hit.alias, next: end };
          break;
        }
      }
      if (best) return best;
    }
    return undefined;
  }
  private lookupWord(norm: string, t: TokenPiece): string | undefined {
    if (t.type === "acronym") return t.raw; // 保持原缩写大写
    for (const layer of this.layers) {
      const h = layer.words[norm];
      if (h) return h.alias;
    }
    return undefined;
  }
  private async tryLoad(uri: vscode.Uri) {
    try {
      const buf = await vscode.workspace.fs.readFile(uri);
      const raw = JSON.parse(Buffer.from(buf).toString("utf8"));
      const words: Words = {};
      const phrases: Phrases = {};
      if (raw.words || raw.phrases) {
        for (const k of Object.keys(raw.words || {}))
          words[k.toLowerCase()] = raw.words[k];
        for (const k of Object.keys(raw.phrases || {}))
          phrases[k.toLowerCase()] = raw.phrases[k];
      } else {
        for (const k of Object.keys(raw)) {
          if (k.includes(" ")) phrases[k.toLowerCase()] = raw[k];
          else words[k.toLowerCase()] = raw[k];
        }
      }
      return { words, phrases };
    } catch {
      return undefined;
    }
  }
}

function normalize(w: string): string {
  const irregular: Record<string, string> = { analyses: "analysis" };
  if (irregular[w]) return irregular[w];
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("ing") && w.length > 4) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length > 3) return w.slice(0, -2);
  if (w.endsWith("es")) return w.slice(0, -2);
  if (w.endsWith("s") && w.length > 2) return w.slice(0, -1);
  return w;
}
```

---

# 3) 直译（保留分隔符）+ AI 兜底（只补未知词/短语）

```ts
// 文件名: src/features/explorer-alias/domain/policies/LiteralPreserveWithAIFallback.ts
/**
 * 作用：生成“死板直译”别名（保留原分隔符与扩展名），命中词典就替换；命不中则：
 *   - 把整条文件名 + 未知 tokens 列表 一起发给 AI；
 *   - 只要求 AI 输出缺失的“英文→中文”映射（JSON）；
 *   - 写回“项目学习直译词典”，并据此重建别名；
 *   - 依旧保持分隔符与扩展名原样。
 */
import * as vscode from "vscode";
import { splitWithDelimiters } from "@shared/naming/SplitWithDelimiters";
import { LiteralDictResolver } from "@shared/naming/LiteralDictResolver";

export class LiteralPreserveWithAIFallback {
  constructor(
    private dict: LiteralDictResolver,
    private ai?: {
      suggestLiteralTokens(
        fileName: string,
        unknown: string[]
      ): Promise<Record<string, string>>;
    }
  ) {}

  async build(
    fileName: string
  ): Promise<{ alias: string; usedAI: boolean; misses: string[] }> {
    const cfg = vscode.workspace.getConfiguration("aiSuite");
    const keepExt = true; // 死板：保留原扩展名
    const joiner = cfg.get<string>("aiSuite.alias.literalJoiner", "_");

    const { tokens, delims, ext } = splitWithDelimiters(fileName);
    // 第一次解析：词典 + 短语
    const r1 = this.dict.resolve(tokens);
    if (r1.unknown.length === 0 || !this.ai) {
      const alias1 = rebuild(r1.mapped, delims, ext, keepExt);
      return { alias: alias1, usedAI: false, misses: [] };
    }

    // AI 兜底：让模型只返回缺失的映射（可能包含短语建议）
    const suggestions = await this.ai
      .suggestLiteralTokens(fileName, r1.unknown)
      .catch(() => ({} as Record<string, string>));
    // 写回学习直译词典（words/phrases 都允许，但我们主推 words）
    for (const k of Object.keys(suggestions)) {
      const zh = (suggestions[k] || "").trim();
      if (!zh) continue;
      await this.dict.writeProjectLearning(k, zh);
    }
    // 重新加载词典后再解析一次（也可以只补内存）
    await this.dict.initialize();

    const r2 = this.dict.resolve(tokens);
    const alias2 = rebuild(r2.mapped, delims, ext, keepExt);
    return { alias: alias2, usedAI: true, misses: r2.unknown };
  }
}

function rebuild(
  mapped: string[],
  delims: string[],
  ext: string,
  keepExt: boolean
) {
  let s = "";
  for (let i = 0; i < mapped.length; i++) s += mapped[i] + (delims[i] || "");
  if (keepExt && ext) s += "." + ext; // 保留原扩展名，如 .cjs
  // 清理非法字符（Windows 文件名限制）
  return s.replace(/[\\/:*?"<>|]/g, "·").slice(0, 120);
}
```

---

# 4) AI 兜底接口（只要“缺词映射”JSON）

```ts
// 文件名: src/features/explorer-alias/infra/translators/LiteralAIFallback.ts
/**
 * 作用：把“整条文件名 + 未知 tokens 列表”发给模型，
 * 只返回缺失词/短语的中文直译建议（JSON）。
 */
import { ProviderRegistry } from "@core/ai/ProviderRegistry";

export class LiteralAIFallback {
  constructor(private providers: ProviderRegistry) {}

  async suggestLiteralTokens(
    fileName: string,
    unknown: string[]
  ): Promise<Record<string, string>> {
    if (!unknown.length) return {};
    const sys = `你是文件名“直译”助手。目标是为未知英文 token 或短语，给出“死板直译”的中文建议。
只输出一个 JSON 对象：键是英文 token/短语（小写），值是中文词（不要加后缀，不要解释）。
必须逐词或短语直译，保持原意义，不要生成整句中文。`;

    const usr = {
      fileName,
      unknownTokens: unknown,
      examples: [
        { element: "元素" },
        { hierarchy: "层级" },
        { "element hierarchy": "元素_层级" },
        { simple: "简版" },
      ],
    };

    const res = await this.providers.chatWithProfile(
      [JSON.stringify({ sys, usr })],
      "alias",
      "primary"
    );
    const raw = (res?.choices?.[0]?.message?.content ?? "").toString().trim();
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  }
}
```

> 关键点：
>
> - **只要 JSON 映射**，不让模型生成整句别名；
> - 可以把**整个文件名**传进去，让它更好判断短语（比如 `"element hierarchy"`）是否需要合并；
> - 我们仍然**保留原分隔符与扩展名**来重建别名。

---

# 5) 用例接线（直译优先，AI 只补缺）

```ts
// 文件名: src/features/explorer-alias/app/TranslateNodeUseCase.ts
/**
 * 顺序（直译模式）：
 *   词表直译(短语优先) → 保留分隔符重建 → 若有未知词 → AI 返回缺词映射 → 写回“项目学习直译词典” → 重建
 */
import * as vscode from "vscode";
import { LiteralDictResolver } from "@shared/naming/LiteralDictResolver";
import { LiteralPreserveWithAIFallback } from "../domain/policies/LiteralPreserveWithAIFallback";
import { LiteralAIFallback } from "../infra/translators/LiteralAIFallback";
import { ProviderRegistry } from "@core/ai/ProviderRegistry";

type AliasResult = {
  alias: string;
  source: "rule" | "ai" | "dict" | "unknown";
  confidence: number;
};

export class TranslateNodeUseCase {
  private dict!: LiteralDictResolver;
  private literal!: LiteralPreserveWithAIFallback;

  constructor(
    private context: vscode.ExtensionContext,
    private cache: {
      get(p: string): AliasResult | undefined;
      set(p: string, r: AliasResult): void;
    },
    private providers: ProviderRegistry
  ) {
    this.dict = new LiteralDictResolver(this.context);
    const ai = new LiteralAIFallback(this.providers);
    this.literal = new LiteralPreserveWithAIFallback(this.dict, ai);
    // 初始化词典
    this.dict.initialize();
  }

  async exec(
    fsPath: string,
    name: string,
    kind: "file" | "folder"
  ): Promise<AliasResult> {
    const c = this.cache.get(fsPath);
    if (c) return c;

    if (kind === "folder") {
      // 目录直译：可用同样逻辑（不带扩展名）
      const { alias } = await this.literal.build(name);
      const r: AliasResult = { alias, source: "rule", confidence: 0.9 };
      this.cache.set(fsPath, r);
      return r;
    }

    // 文件：直译 + AI 兜底
    const { alias, usedAI } = await this.literal.build(name);
    const r: AliasResult = {
      alias,
      source: usedAI ? "ai" : "rule",
      confidence: usedAI ? 0.88 : 0.92,
    };
    this.cache.set(fsPath, r);
    return r;
  }
}
```

---

# 6) 效果示例（你的两条路径）

输入（保持后缀与分隔符）：

- `analyze_element_hierarchy.cjs` → **分析*元素*层级.cjs**
- `analyze_hierarchy_simple.cjs` → **分析*层级*简版.cjs**

> 若首次缺词导致只出“分析*层级.cjs”，AI 会根据整条 `"analyze_element_hierarchy.cjs"` 与 `["element"]` 返回 `{ "element": "元素" }`（或 `"element hierarchy": "元素*层级"`），我们写回 `/.ai/.ai-glossary.literal.learned.json`，**第二次即刻命中**。

---

## 小结（你这套“死板又快”的直译管线）

- **零语序重组**、**零中文后缀**，完全**保留原分隔符与扩展名**；
- **词典优先 + 最长短语匹配**，稳、快、可控；
- **AI 只补缺词**（JSON 映射），并写回“学习直译词典”，越用越准；
- 批量处理时，只对**未知词**触发 AI，一次学会，全仓复用，**费用与延迟最小化**。

如果你愿意，我可以基于你仓库当前结构，给你“**逐行补丁清单**”（在哪个文件插入哪段代码）以及一个最小的 `/.ai/.ai-literal.dict.json` 初始词表，复制粘贴就能跑。
