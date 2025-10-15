除了上面的做法， 应该可以利用 ai 轻松克服这种 纯大写的问题。 对吗？
利用 ai 可以增加容错率

对的。除了“白名单 + 分词修正”的本地方案，**用 AI 做“上限兜底”**可以把纯大写场景（DEBUG / WARNING / ATTRIBUTION / USEFORM …）处理得更稳、更省心。做法不是“让 AI 直接产出整句别名”，而是：**让 AI 只补“缺失词/短语的直译词条”**，我们继续按“直译 + 保留分隔符 + 保留扩展名”重建。这样既“死板又快”，又更**容错**。

下面给你一套可以直接粘贴的“小升级”，专门提升**纯大写**与**不规则大小写**的容错率：

---

# 方案总览（AI 如何提高容错）

1. **大写感知的 AI 旁路**：把未知 token 的**原文 + 小写 + 上下文**一次性发给 AI，只要 JSON 词条映射（绝不让它改分隔符/后缀/语序）。
2. **类型标注 + 置信度**：让 AI 对每个词给出 `kind`（`acronym|word|phrase`）与 `confidence`，我们用阈值决定是否采用。
3. **短语建议**：AI 可以建议把相邻词合成短语（如 `"use form"`），但我们**仍然按原分隔符**重建（短语里内部可用 `_`）。
4. **只写学习“词/短语”**：把返回映射写进**直译学习词典**（小写 key），**禁止**整名写入，避免覆盖重建逻辑。
5. **一致性守卫**：如果 AI 漏了任何未知 token，就**回退**到“保留英文原词”，并记录日志，避免产出“缺字”的别名。

---

# 代码补丁（两处）

## ① 改造 AI 兜底：给 AI 结构化任务（纯返回词条 JSON）

```ts
// 文件名: src/features/explorer-alias/infra/translators/LiteralAIFallback.ts
/**
 * 目的：让 AI 只返回“缺词映射”，增强纯大写/不规则大小写的容错。
 * - 输入：整条文件名 + 未知 tokens（含 raw/lower/isAllCaps/左右邻居）
 * - 输出：JSON { items: [{ key, alias, kind, confidence }] }
 * - key 一律用 lower 作为词典键；alias 是中文或保留英文（如 useForm）
 */

import { ProviderRegistry } from "@core/ai/ProviderRegistry";

export type AILiteralItem = {
  key: string; // 英文小写键（用于词典）
  alias: string; // 中文直译；或保留英文(如 useForm)
  kind: "word" | "acronym" | "phrase";
  confidence: number; // 0~1
};

export class LiteralAIFallback {
  constructor(private providers: ProviderRegistry) {}

  async suggestLiteralTokens(payload: {
    fileName: string;
    tokens: Array<{
      raw: string;
      lower: string;
      isAllCaps: boolean;
      left?: string;
      right?: string;
    }>;
    unknownKeys: string[]; // 小写
  }): Promise<AILiteralItem[]> {
    if (!payload.unknownKeys.length) return [];

    const system = [
      "你是“文件名直译词库助手”。",
      "只输出 JSON，不要任何说明文字。",
      "任务：为给定的未知英文 token/短语，返回中文直译(或必要时保留英文)，用于构建词典。",
      "保持逐词直译风格，不重组语序，不添加后缀，不改分隔符。",
      'JSON 结构：{"items":[{"key":"debug","alias":"调试","kind":"word","confidence":0.95}, ...]}',
      "要求：key 用英文小写；不得遗漏输入的任何 unknownKeys；confidence 0~1。",
    ].join("\n");

    const user = JSON.stringify({
      fileName: payload.fileName,
      unknownKeys: payload.unknownKeys, // 全小写键
      tokens: payload.tokens.slice(0, 64), // 给点上下文，限制长度
      examples: [
        { key: "debug", alias: "调试", kind: "word" },
        { key: "warning", alias: "警告", kind: "word" },
        { key: "attribution", alias: "归因", kind: "word" },
        { key: "xml", alias: "XML", kind: "acronym" },
        { key: "useform", alias: "useForm", kind: "word" }, // 案例：保留技术名
      ],
    });

    const res = await this.providers
      .chatWithProfile(
        [
          { role: "system", content: system } as any,
          { role: "user", content: user },
        ],
        "alias",
        "primary"
      )
      .catch(() => undefined);

    const raw =
      (res as any)?.choices?.[0]?.message?.content?.toString?.() || "";
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.items)
        ? (parsed.items as AILiteralItem[])
        : [];
    } catch {
      return [];
    }
  }
}
```

## ② 在“保留分隔符的直译 builder”里使用上面结果，并**只写词/短语**

```ts
// 文件名: src/features/explorer-alias/domain/policies/LiteralPreserveWithAIFallback.ts
/**
 * 差异点：
 * - 收集 unknown 的小写 key（去重）
 * - 调用上面的 LiteralAIFallback.suggestLiteralTokens
 * - 将返回 items 按 confidence 过滤后，逐条写入“直译学习词典”（words/phrases），禁止整名写入
 * - 重新解析并按原分隔符重建
 */

import * as vscode from "vscode";
import { splitWithDelimiters } from "@shared/naming/SplitWithDelimiters";
import { LiteralDictResolver } from "@shared/naming/LiteralDictResolver";
import {
  LiteralAIFallback,
  AILiteralItem,
} from "../../infra/translators/LiteralAIFallback";

export class LiteralPreserveWithAIFallback {
  constructor(
    private dict: LiteralDictResolver,
    private ai: LiteralAIFallback
  ) {}

  async build(
    fileName: string
  ): Promise<{ alias: string; usedAI: boolean; misses: string[] }> {
    const { tokens, delims, ext } = splitWithDelimiters(fileName);
    const r1 = this.dict.resolve(tokens);

    if (r1.unknown.length === 0) {
      return {
        alias: rebuild(r1.mapped, delims, ext),
        usedAI: false,
        misses: [],
      };
    }

    // 组织 AI 输入：把未知 token 统一转为 lower 作为 key
    const unknownKeys = Array.from(
      new Set(r1.unknown.map((s) => s.toLowerCase()))
    );
    const tokenCtx = tokens.map((t, i) => ({
      raw: t.raw,
      lower: t.lower,
      isAllCaps: /^[A-Z]{2,}$/.test(t.raw),
      left: i > 0 ? tokens[i - 1].raw : undefined,
      right: i < tokens.length - 1 ? tokens[i + 1].raw : undefined,
    }));

    const items = await this.ai.suggestLiteralTokens({
      fileName,
      tokens: tokenCtx,
      unknownKeys,
    });

    // 过滤与落库（只写 word/phrase；key 必须是 a-z0-9 和空格，不含 -_.）
    const minConf = vscode.workspace
      .getConfiguration("aiSuite")
      .get<number>("aiSuite.alias.minConfidence", 0.6);
    for (const it of items as AILiteralItem[]) {
      const key = (it.key || "")
        .toLowerCase()
        .replace(/[_\-\.]+/g, " ")
        .trim();
      if (!/^[a-z0-9]+( [a-z0-9]+)*$/.test(key)) continue; // 禁整名
      if (!it.alias || it.confidence < minConf) continue;
      await this.dict.writeProjectLearning(key, it.alias);
    }

    // 重新加载或局部刷新内存字典
    await this.dict.initialize();

    // 第二次解析 + 重建
    const r2 = this.dict.resolve(tokens);
    return {
      alias: rebuild(r2.mapped, delims, ext),
      usedAI: items.length > 0,
      misses: r2.unknown,
    };
  }
}

// 保留原分隔符 + 保留扩展名
function rebuild(mapped: string[], delims: string[], ext: string) {
  let s = "";
  for (let i = 0; i < mapped.length; i++) s += mapped[i] + (delims[i] || "");
  if (ext) s += "." + ext;
  return s.replace(/[\\/:*?"<>|]/g, "·").slice(0, 120);
}
```

---

## 使用效果（以你刚才的例子）

- `DEBUG_USEFORM_WARNING_ATTRIBUTION.md`

  1. 本地词典命中：`debug→调试`，其余（`useform/warning/attribution`）作为 unknown；
  2. 传给 AI（含上下文与小写 key），AI 返回：

     ```json
     {
       "items": [
         {
           "key": "useform",
           "alias": "useForm",
           "kind": "word",
           "confidence": 0.86
         },
         {
           "key": "warning",
           "alias": "警告",
           "kind": "word",
           "confidence": 0.98
         },
         {
           "key": "attribution",
           "alias": "归因",
           "kind": "word",
           "confidence": 0.95
         }
       ]
     }
     ```

  3. 我们把这三条写入“直译学习词典”，再重建为：
     **调试*useForm*警告\_归因.md**（分隔符 `_` 与 `.md` 完整保留）

> 如果你希望 `USEFORM` 直译成中文（如“使用表单”），只需把 AI few-shot 或项目直译词典里把 `useform → 使用表单` 即可。下次就不走 AI 了。

---

## 小提示（把容错再提高一点点）

- **Few-shot 强化**：在 `examples` 里多给些纯大写样例（DEBUG/WARNING/NOTICE/ERROR/ATTRIBUTION），AI 很快就学会“不是所有大写都是缩写”。
- **最小调用**：把一次批量里**所有未知 token 的并集**传给 AI，一次学会、全局复用。
- **回退策略**：AI 返回缺失时，保留对应英文原词，不要产出“不完整”的中文。
- **审计日志**：输出“写入直译学习词典”的变更（key/alias/confidence），方便回滚。

---

**总结**：
是的，AI 绝对能把“纯大写”这种长尾问题轻松兜住。关键是在你的“直译 V2 管线”里把 AI 的职责限制为**“补词条（JSON）”**，其余（分割、分隔符、重建、后缀）仍由你掌控。这样既保留了你要的“死板又快”，又把容错率拉满。需要我把这两段补丁按你仓库路径做成“逐行替换清单”，我可以直接给到你照贴即用。
