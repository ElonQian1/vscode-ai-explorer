没错：**未命中（词表/学习词典/规则都失败）→ 走 AI 兜底 → 成功则写回“学习词典”+ 路径缓存**。
下面给你一套“可直接粘贴”的最小实现，包含三部分：

1. **AI 调用层**（OpenAI/Hunyuan 二选一或主备切换）；
2. **学习词典存储**（把 AI 结果写进 `/.ai/.ai-glossary.learned.json`）；
3. **在用例里接上兜底**（回退前最后尝试 AI，并把结果写回）。

> 说明：代码都带**中文注释**和**文件名注释**；如果你项目里已有同名文件，就对照“关键改动”把核心逻辑并进去即可。

---

## 1) AI 调用层（OpenAI 兼容，支持腾讯混元）

```ts
// 文件名: src/core/ai/OpenAICompatibleClient.ts
/**
 * OpenAI 兼容客户端：换 baseUrl/apiKey 即可在 OpenAI / 腾讯混元之间切换。
 * - 接口: /v1/chat/completions
 * - 超时/并发控制/简单限流（防止 429）
 */
export class OpenAICompatibleClient {
  private active = 0;
  private q: Array<() => void> = [];
  constructor(
    private opt: {
      baseUrl: string;
      timeoutMs: number;
      getApiKey: () => Promise<string>;
      maxConcurrency: number;
      acquireToken: () => Promise<void>; // 限流器（令牌桶）
      log: (m: string) => void;
    }
  ) {}

  async chat(model: string, messages: any, temperature = 0.2) {
    return this.enqueue(async () => {
      await this.opt.acquireToken();
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), this.opt.timeoutMs);
      const url = `${this.opt.baseUrl.replace(/\/+$/, "")}/chat/completions`;
      this.opt.log(`[openai-compatible] POST ${url} model=${model}`);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await this.opt.getApiKey()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model, temperature, messages }),
          signal: ctl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        this.opt.log(`[openai-compatible] ✅ ok (${res.status})`);
        return await res.json();
      } catch (e: any) {
        this.opt.log(`[openai-compatible] ❌ ${e?.message ?? e}`);
        throw e;
      }
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this.active++;
        try {
          resolve(await task());
        } catch (e) {
          reject(e);
        } finally {
          this.active--;
          this.pump();
        }
      };
      this.q.push(run);
      this.pump();
    });
  }
  private pump() {
    while (this.active < this.opt.maxConcurrency && this.q.length)
      this.q.shift()!();
  }
}
```

```ts
// 文件名: src/core/ai/ProviderRegistry.ts
/**
 * ProviderRegistry：按配置选择 openai/hunyuan，失败可回退。
 * 你只需要调用 chatWithProfile(names,'alias')，其余交给路由器。
 */
import * as vscode from "vscode";
import { OpenAICompatibleClient } from "./OpenAICompatibleClient";

class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(private maxRPM: number) {
    this.tokens = maxRPM;
    setInterval(() => this.refill(), 1000);
  }
  private refill() {
    const now = Date.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.maxRPM, this.tokens + (this.maxRPM / 60) * dt);
  }
  async acquire() {
    while (this.tokens < 1) await new Promise((r) => setTimeout(r, 120));
    this.tokens -= 1;
  }
}

export class ProviderRegistry {
  constructor(
    private ctx: vscode.ExtensionContext,
    private log: (m: string) => void
  ) {}

  private mkClient(provider: "openai" | "hunyuan") {
    const cfg = vscode.workspace.getConfiguration("aiSuite");
    const baseUrl = cfg.get<string>(`aiSuite.${provider}.baseUrl`)!;
    const timeoutMs = cfg.get<number>(`aiSuite.${provider}.timeoutMs`, 10000);
    const maxConcurrency = cfg.get<number>("aiSuite.maxConcurrency", 3);
    const maxRPM = cfg.get<number>("aiSuite.maxRPM", 60);
    const keyName =
      provider === "openai" ? "aiSuite.key.openai" : "aiSuite.key.hunyuan";
    const limiter = new TokenBucket(maxRPM);
    return new OpenAICompatibleClient({
      baseUrl,
      timeoutMs,
      maxConcurrency,
      getApiKey: async () => (await this.ctx.secrets.get(keyName)) || "",
      acquireToken: () => limiter.acquire(),
      log: this.log,
    });
  }

  async chatWithProfile(
    names: string[],
    profile: "alias",
    prefer: "primary" | "fallback" = "primary"
  ) {
    const cfg = vscode.workspace.getConfiguration("aiSuite");
    const primary = cfg.get<"openai" | "hunyuan">(
      "aiSuite.provider.primary",
      "openai"
    );
    const fallback = cfg.get<"none" | "openai" | "hunyuan">(
      "aiSuite.provider.fallback",
      "hunyuan"
    );
    const run = async (p: "openai" | "hunyuan") => {
      const model = cfg.get<string>(`aiSuite.${p}.model`)!;
      const cli = this.mkClient(p);
      const messages = [
        {
          role: "system",
          content:
            "你是文件名本地化助手。仅输出 JSON 对象，键是原英文短名，值是不超过16个汉字的中文短别名。",
        },
        { role: "user", content: JSON.stringify(names) },
      ];
      this.log(`[provider] try=${p} model=${model} items=${names.length}`);
      return cli.chat(model, messages, 0.2);
    };
    try {
      return await run(primary);
    } catch (e) {
      if (fallback === "none") throw e;
      return run(fallback as any);
    }
  }
}
```

```ts
// 文件名: src/features/explorer-alias/infra/translators/AITranslatorRouter.ts
/**
 * AITranslatorRouter：批量调用模型，期望返回 JSON 映射 { name: alias }
 */
import { ProviderRegistry } from "@core/ai/ProviderRegistry";

export class AITranslatorRouter {
  constructor(private providers: ProviderRegistry) {}
  async translateAliasBatch(names: string[]): Promise<Record<string, string>> {
    const list = Array.from(new Set(names)).filter(Boolean);
    if (!list.length) return {};
    const res = await this.providers.chatWithProfile(list, "alias", "primary");
    const raw = (res?.choices?.[0]?.message?.content ?? "").toString().trim();
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  }
}
```

---

## 2) 学习词典（把 AI 结果写进项目字典）

```ts
// 文件名: src/features/explorer-alias/infra/cache/ProjectGlossaryStore.ts
/**
 * 项目学习词典：把 AI 产出的“英文短名→中文别名”写到 /.ai/.ai-glossary.learned.json
 * - 键：去扩展名的小写短名
 * - 值：{ alias, source:'ai', at, model?, profile? }
 */
import * as vscode from "vscode";
import * as path from "path";

type Term = {
  alias: string;
  source: "ai" | "user";
  at: string;
  model?: string;
  profile?: string;
};

export class ProjectGlossaryStore {
  private map = new Map<string, Term>();
  private loaded = false;
  constructor(private fileRel = ".ai/.ai-glossary.learned.json") {}
  private norm(name: string) {
    return name.replace(/\.[^.]+$/, "").toLowerCase();
  }
  private root() {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
  }

  private async ensureLoad() {
    if (this.loaded) return;
    const r = this.root();
    if (!r) return;
    const uri = vscode.Uri.joinPath(r, this.fileRel);
    try {
      const buf = await vscode.workspace.fs.readFile(uri);
      const json = JSON.parse(Buffer.from(buf).toString("utf8")) as
        | { terms?: Record<string, Term> }
        | Record<string, Term>;
      const terms = (json as any).terms ?? json;
      for (const [k, v] of Object.entries(terms)) this.map.set(k, v as Term);
    } catch {}
    this.loaded = true;
  }

  async get(name: string) {
    await this.ensureLoad();
    return this.map.get(this.norm(name));
  }

  async set(name: string, term: Term) {
    await this.ensureLoad();
    this.map.set(this.norm(name), term);
    const r = this.root();
    if (!r) return;
    const dir = vscode.Uri.joinPath(r, path.dirname(this.fileRel));
    await vscode.workspace.fs.createDirectory(dir);
    const uri = vscode.Uri.joinPath(r, this.fileRel);
    const json = {
      version: 1,
      locale: "zh-CN",
      terms: Object.fromEntries(this.map),
    };
    await vscode.workspace.fs.writeFile(
      uri,
      Buffer.from(JSON.stringify(json, null, 2), "utf8")
    );
  }
}
```

---

## 3) 用例里接上“AI 兜底 + 写回词典”

> 假设你已有：`GlossaryPolicy`（内置词表）、`SmartRuleEngine`（规则）、`PathCache`（路径缓存）。
> 现在只需要在**回退前**尝试 AI，一旦成功：**写路径缓存 + 写学习词典**。

```ts
// 文件名: src/features/explorer-alias/app/TranslateNodeUseCase.ts
/**
 * 翻译链路：词表 → 学习词典 → 规则 → （AI 兜底）→ 回退
 * - 命中任何一层，都会写“路径缓存”
 * - AI 成功时，同时写“项目学习词典”，以后同名直接命中，零请求
 */
import { ProjectGlossaryStore } from "../infra/cache/ProjectGlossaryStore";
import { AITranslatorRouter } from "../infra/translators/AITranslatorRouter";

type AliasResult = {
  alias: string;
  source: "dict" | "rule" | "ai" | "unknown";
  confidence: number;
};

export class TranslateNodeUseCase {
  constructor(
    private glossary: { lookup(n: string): AliasResult | undefined },
    private learned: ProjectGlossaryStore,
    private rules: { translate(n: string): AliasResult | undefined }, // 你的 SmartRuleEngine
    private cache: {
      get(p: string): AliasResult | undefined;
      set(p: string, r: AliasResult): void;
    },
    private ai?: AITranslatorRouter, // ← 注入后才会走 AI
    private profileVersion = "alias@1"
  ) {}

  async exec(
    fsPath: string,
    name: string,
    kind: "file" | "folder"
  ): Promise<AliasResult> {
    const c = this.cache.get(fsPath);
    if (c) return c;

    const d = this.glossary.lookup(name);
    if (d) {
      this.cache.set(fsPath, d);
      return d;
    }

    const l = await this.learned.get(name);
    if (l) {
      const r: AliasResult = { alias: l.alias, source: "ai", confidence: 0.9 };
      this.cache.set(fsPath, r);
      return r;
    }

    const r = this.rules.translate(name);
    if (r) {
      this.cache.set(fsPath, r);
      return r;
    }

    // ✅ AI 兜底（仅当上述都未命中）
    if (this.ai) {
      try {
        const map = await this.ai.translateAliasBatch([name]);
        const alias = sanitize(map[name] || "");
        if (alias && alias !== name) {
          const now = new Date().toISOString();
          const ar: AliasResult = { alias, source: "ai", confidence: 0.9 };
          this.cache.set(fsPath, ar);
          await this.learned.set(name, {
            alias,
            source: "ai",
            at: now,
            model: "auto",
            profile: this.profileVersion,
          });
          return ar;
        }
      } catch {
        /* 网络/限流/代理失败 → 忽略，走回退 */
      }
    }

    // 仍然不行 → 回退原名（显示英文）
    const fb: AliasResult = { alias: name, source: "unknown", confidence: 0.5 };
    this.cache.set(fsPath, fb);
    return fb;
  }
}

function sanitize(s: string) {
  return (s || "")
    .split(/\r?\n/)[0]
    .replace(/[\\/:*?"<>|]/g, "·")
    .slice(0, 32);
}
```

---

## package.json 所需的最小配置（如果你还没加）

```json
// 文件名: package.json（片段）
{
  "contributes": {
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
        "aiSuite.hunyuan.baseUrl": {
          "type": "string",
          "default": "https://api.hunyuan.cloud.tencent.com/v1"
        },
        "aiSuite.hunyuan.model": {
          "type": "string",
          "default": "hunyuan-lite"
        },
        "aiSuite.openai.timeoutMs": { "type": "number", "default": 10000 },
        "aiSuite.hunyuan.timeoutMs": { "type": "number", "default": 10000 },
        "aiSuite.maxConcurrency": {
          "type": "number",
          "default": 3,
          "minimum": 1,
          "maximum": 10
        },
        "aiSuite.maxRPM": {
          "type": "number",
          "default": 60,
          "minimum": 10,
          "maximum": 600
        }
      }
    },
    "commands": [
      {
        "command": "aiSuite.setOpenAIKey",
        "title": "AI Suite：设置 OpenAI API Key"
      },
      {
        "command": "aiSuite.setHunyuanKey",
        "title": "AI Suite：设置腾讯混元 API Key"
      }
    ]
  }
}
```

> Key 存 `SecretStorage`：执行“AI Suite：设置 OpenAI/混元 API Key”；**未设置 Key** 时，链路只会命中 词表/学习词典/规则，**不会**调用 AI。

---

## 自测方法（确认“AI 兜底 + 写回词典”在工作）

1. 在命令面板设置 API Key，并选择 Provider（OpenAI 或腾讯混元）。
2. 右键选一个**很难命中本地规则**的文件：`analyze_hierarchy_simple.cjs` → 运行“**翻译此文件**”。
3. 预期结果：

   - 左侧中文别名从英文变为类似“**层级分析（简版）脚本**”；
   - 项目根目录出现/更新 `/.ai/.ai-glossary.learned.json`，新增一条 `"analyze_hierarchy_simple": { "alias": "层级分析（简版）", ... }`；
   - 下次**同名**出现在任何目录（或新项目里），**不再打 API**，直接命中学习词典。

4. 打开“输出 → **AI Suite**”，能看到 `POST .../chat/completions` 与 `✅ ok` 日志；如果失败会有错误原因（401/超时/429）。

---

## 常见问题

- **还是显示英文 / 说“文件无需翻译”？**
  说明：AI 没被调用成功（未注入路由器 / 未设置 Key / 代理失败）。按上面的自测步骤看“AI Suite”日志；或临时用“**强制用 AI 翻译此文件**”命令做排查。
- **学到的别名不满意？**
  直接编辑 `/.ai/.ai-glossary.learned.json` 或把条目提升到 `/.ai-glossary.json`（固定词表优先级更高，团队共享）。

---

照着以上三步接线，你的“**AI 兜底**”就完整了：**未命中 → 请求 AI → 写回“学习词典 + 路径缓存”**。
如果你愿意，我可以对着你现在仓库，给你一份“**逐行改动清单**”，你复制粘贴就能跑。
