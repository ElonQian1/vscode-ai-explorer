现在我还是先做好的 我的下钻功能， 现在我下钻功能， 看到了列出了 代码文件，

是不是应该双击代码文件，可以让它变成 一张带 tab 分页的卡片， 然后用 openai api 的 自然语言解释这个代码是干嘛的。

对于一般代码而言， 需要展示哪些信息呢？ 以及 生成可追溯：每条结论都附证据锚点
既然都要 做前面的说的 MCP 功能， 现在就要 可视化视图的时候， 手动双击分析 代码文件，为前面讨论的 MCP 功能 做 服务，缓存起来，减少重复分析。

让它变成可以展开的 分析卡片，也能速回原来现在的文件简约样式，
这样的整体设计你觉得好吗？
你有什么更好的建议吗？

你的思路非常好！先把“**双击文件 → 弹出可折叠的分析卡片（带 Tab）**”做好，同时把结果**缓存成可追溯的 FileCapsule**，后面 MCP 直接复用这些数据，等于一石二鸟：可视化体验更好、也给 Copilot/代理准备好了“低成本上下文”。

下面给你一套落地方案（交互 → 展示哪些信息 → 可追溯设计 → 缓存/失效 → 与 MCP 的对接），再送上最小可用代码骨架（前端+扩展端+分析服务），都带中文注释。

---

## 交互流（建议）

1. **双击文件节点 ⇒ 弹出“分析卡片”**（覆盖在该节点附近，可拖动/可折叠）

   - Tab：`概览 | API | 依赖 | 证据 | 风险 | 历史`（先做 3–4 个，其他按需上线）
   - 右上角操作：**折叠/展开**、**打开源文件**、**复制摘要**、**刷新分析**、**保存为胶囊**

2. **再次双击卡片标题或按 Esc ⇒ 折叠回“简约文件样式”**
3. **点击证据锚点 [1][2] ⇒ 打开源码并高亮行号**
4. **缓存命中 ⇒ 秒开**；缓存未命中或过期 ⇒ 静态分析先行 + LLM 生成摘要（进度提示）

---

## 一般代码应展示的“必选信息”（按优先级）

**必选（首批上线）**

- **概览（TL;DR）**：一句话说明；3–6 条“该文件负责/不负责什么”。
- **API（对外接口）**：导出符号（函数/类/类型/trait），带签名。
- **依赖**：

  - **出依赖**（它 import/ use 了谁，按模块分组，Top N）
  - **入依赖（可选）**：谁引用了它（样本 5 条 +“更多…”）

- **证据**：每条结论后的 `[n]` 锚点（点击展开源码片段 / 跳转行号）。

**可选（第二批）**

- **风险/异味**：TODO/FIXME、未使用导出、高扇出、循环依赖、复杂度大致计分。
- **历史**：git 简要（最近更改时间、Top 贡献者、改动次数）。
- **示例/用法**：典型调用样例（从引用处抽取 1–2 段）。

---

## “可追溯”的设计要点

**每条结论都要附“证据锚点”**（文件、行号、哈希），把“事实/推断/建议”三类信息分开：

```json
{
  "fileCapsuleVersion": "1",
  "file": "src/services/user.ts",
  "lang": "ts",
  "contentHash": "sha256:...",
  "summary": {
    "zh": "提供用户读取接口，封装仓储与校验",
    "en": "User read-only services; wraps repo and validation"
  },
  "api": [
    {
      "name": "getUser",
      "signature": "(id: string) => Promise<User>",
      "evidence": ["e1"]
    },
    {
      "name": "listUsers",
      "signature": "() => Promise<User[]>",
      "evidence": ["e2"]
    }
  ],
  "deps": {
    "out": [{ "module": "libs/validator", "count": 2, "evidence": ["e3"] }],
    "inSample": [
      { "file": "controllers/auth.ts", "line": 42, "evidence": ["e4"] }
    ]
  },
  "facts": [
    {
      "id": "f1",
      "text": "exports getUser, listUsers",
      "evidence": ["e1", "e2"]
    }
  ],
  "inferences": [
    {
      "id": "i1",
      "text": "模块角色=Service",
      "confidence": 0.78,
      "evidence": ["e1", "e3"]
    }
  ],
  "recommendations": [
    {
      "id": "r1",
      "text": "将校验抽到单独模块",
      "reason": "依赖扇出较高",
      "evidence": ["e3"]
    }
  ],
  "evidence": {
    "e1": { "file": "src/services/user.ts", "lines": [1, 60], "sha256": "..." },
    "e2": {
      "file": "src/services/user.ts",
      "lines": [62, 110],
      "sha256": "..."
    },
    "e3": { "file": "src/services/user.ts", "lines": [3, 10], "sha256": "..." },
    "e4": {
      "file": "src/controllers/auth.ts",
      "lines": [40, 48],
      "sha256": "..."
    }
  },
  "stale": false,
  "lastVerifiedAt": "2025-10-16T06:52:00Z",
  "tooling": { "tsc": "5.5.4", "tsserver": "…" }
}
```

- **facts**：由静态分析直接得出（可证）。
- **inferences**：LLM 的推断，必须有 `confidence`，并附 `evidence`。
- **recommendations**：建议（不是事实）。
- **evidence**：最小片段（20–60 行）＋ `sha256`，点击可跳转。

---

## 缓存与失效（为 MCP 预热）

- **缓存键**：`contentHash + lang + promptVersion`（和平台/规则绑定）。
- **存储**：`.ai-explorer-cache/filecapsules/<sha>.json`（或 SQLite，更易检索）。
- **命中**：直接渲染；**若文件改动**（contentHash 变），标记旧 capsule `stale:true`。
- **增量**：先静态分析（快）填“必选信息”，再 LLM 异步补“概览/推断/建议”。
- **回收**：LRU + TTL（例如 7 天），避免无限膨胀。

> 这样你**现在的手动双击分析**＝“把昂贵的 LLM 结果预先固化”；未来 MCP 直接 `get_capsule(id)` 就能复用，省钱省时。

---

## 与 MCP 的衔接（以后几乎零改）

- 把以上 FileCapsule 作为 `get_capsule(file)` 的返回；
- 把“证据片段”做成 `find_evidence({file, lines})`；
- `list_capsules(query)` 从缓存/索引里检索标题卡（少 token）；
- 需要更新时，Copilot 调 `verify_facts(file)` 触发静态分析刷新。

---

## 最小可用代码骨架（3 段）

> 说明：都是“骨架级”，方便你对齐现有项目。**每段代码首行附文件名注释，带中文注释**。你按需融入仓库结构即可。

### 1) 前端：双击文件 ⇒ 请求分析，接收并渲染卡片

```js
// 文件名: media/filetree-blueprint/graphView.js
// 作用: 给“文件节点”绑定双击 -> 请求扩展端分析；接收 FileCapsule -> 渲染 Tab 卡片；证据锚点可跳转。

(function () {
  const vscode = acquireVsCodeApi();
  let graph = {
    nodes: [],
    edges: [],
    metadata: { focusPath: "/", graphType: "filetree" },
  };

  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg?.type === "init-graph") {
      graph = msg.payload || graph;
      renderNodesOnce();
      initEdgesLayerOnce();
      drawEdges();
    }
    if (msg?.type === "show-analysis-card") {
      renderAnalysisCard(msg.payload); // payload = FileCapsule
    }
  });

  function renderNodesOnce() {
    const box = document.getElementById("nodes");
    box.innerHTML = "";
    for (const n of graph.nodes) {
      const el = document.createElement("div");
      el.className = "node";
      el.dataset.id = n.id;
      el.style.left = Math.round(n.position.x) + "px";
      el.style.top = Math.round(n.position.y) + "px";
      el.innerHTML = `<div class="title">${escapeHtml(n.label || n.id)}</div>`;

      // ✅ 文件节点双击：请求分析
      if (n.type === "file" && n.data?.path) {
        el.addEventListener("dblclick", () => {
          const rel = normalizeRel(
            n.data.path,
            graph?.metadata?.focusPath || "/"
          );
          vscode.postMessage({ type: "analyze-file", payload: { path: rel } });
        });
      }
      box.appendChild(el);
    }
  }

  function renderAnalysisCard(capsule) {
    // 简化版卡片：概览/API/依赖/证据
    let host = document.getElementById("analysis-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "analysis-host";
      document.getElementById("canvas").appendChild(host);
    }
    host.innerHTML = `
      <div class="analysis-card">
        <div class="hdr">
          <div class="ttl">${escapeHtml(capsule.file)}</div>
          <div class="ops">
            <button data-act="open">打开源码</button>
            <button data-act="collapse">折叠</button>
            <button data-act="refresh">刷新</button>
          </div>
        </div>
        <div class="tabs">
          <button data-tab="overview" class="on">概览</button>
          <button data-tab="api">API</button>
          <button data-tab="deps">依赖</button>
          <button data-tab="evidence">证据</button>
        </div>
        <div class="tab-body" data-pane="overview">${renderOverview(
          capsule
        )}</div>
        <div class="tab-body hide" data-pane="api">${renderApi(capsule)}</div>
        <div class="tab-body hide" data-pane="deps">${renderDeps(capsule)}</div>
        <div class="tab-body hide" data-pane="evidence">${renderEvidence(
          capsule
        )}</div>
      </div>
    `;
    host.querySelectorAll(".tabs [data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        host
          .querySelectorAll(".tabs [data-tab]")
          .forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
        host
          .querySelectorAll(".tab-body")
          .forEach((p) => p.classList.add("hide"));
        host
          .querySelector(`.tab-body[data-pane="${btn.dataset.tab}"]`)
          ?.classList.remove("hide");
      });
    });
    host.querySelector('[data-act="open"]').onclick = () =>
      vscode.postMessage({
        type: "open-source",
        payload: {
          file: capsule.file,
          line: capsule.evidence?.e1?.lines?.[0] || 1,
        },
      });
    host.querySelector('[data-act="collapse"]').onclick = () =>
      (host.innerHTML = "");
    host.querySelector('[data-act="refresh"]').onclick = () =>
      vscode.postMessage({
        type: "analyze-file",
        payload: { path: capsule.file },
      });
    // 证据锚点跳转
    host.querySelectorAll("[data-ev]").forEach((a) => {
      a.addEventListener("click", () => {
        const id = a.getAttribute("data-ev");
        const ev = capsule.evidence?.[id];
        if (ev)
          vscode.postMessage({
            type: "open-source",
            payload: {
              file: ev.file,
              line: ev.lines?.[0] || 1,
              endLine: ev.lines?.[1],
            },
          });
      });
    });
  }

  function renderOverview(c) {
    const sum = c.summary?.zh || c.summary?.en || "暂无摘要";
    const inf =
      (c.inferences || [])
        .map(
          (i) =>
            `<li>${escapeHtml(i.text)} <sup><a data-ev="${
              (i.evidence || [])[0] || ""
            }">[证据]</a></sup></li>`
        )
        .join("") || "<li>—</li>";
    return `<div class="sec">
      <p>${escapeHtml(sum)}</p>
      <h4>推断</h4><ul>${inf}</ul>
    </div>`;
  }
  function renderApi(c) {
    const items =
      (c.api || [])
        .map(
          (x) =>
            `<li><code>${escapeHtml(x.name)}</code> <span>${escapeHtml(
              x.signature || ""
            )}</span> <sup>${(x.evidence || [])
              .map((e) => `<a data-ev="${e}">[${e}]</a>`)
              .join(" ")}</sup></li>`
        )
        .join("") || "<li>—</li>";
    return `<ul>${items}</ul>`;
  }
  function renderDeps(c) {
    const out =
      (c.deps?.out || [])
        .map(
          (d) =>
            `<li>${escapeHtml(d.module)} (${d.count}) <sup>${(d.evidence || [])
              .map((e) => `<a data-ev="${e}">[${e}]</a>`)
              .join(" ")}</sup></li>`
        )
        .join("") || "<li>—</li>";
    const inc =
      (c.deps?.inSample || [])
        .map(
          (d) =>
            `<li>${escapeHtml(d.file)}:${d.line} <sup>${
              d.evidence ? `<a data-ev="${d.evidence[0]}">[证据]</a>` : ""
            }</sup></li>`
        )
        .join("") || "<li>—</li>";
    return `<div class="cols"><div><h4>出依赖</h4><ul>${out}</ul></div><div><h4>入依赖(样本)</h4><ul>${inc}</ul></div></div>`;
  }
  function renderEvidence(c) {
    const evs =
      Object.entries(c.evidence || {})
        .map(
          ([k, v]) =>
            `<li><b>${k}</b> <code>${escapeHtml(v.file)}:${v.lines?.[0]}-${
              v.lines?.[1]
            }</code> <button data-ev="${k}">查看</button></li>`
        )
        .join("") || "<li>—</li>";
    return `<ul>${evs}</ul>`;
  }

  function normalizeRel(p, base) {
    p = String(p).replace(/\\/g, "/").replace(/\/+/g, "/");
    if (p.startsWith("/")) return p;
    return (base && base !== "/" ? `${base}/${p}` : `/${p}`).replace(
      /\/+/g,
      "/"
    );
  }
  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m])
    );
  }
})();
```

**对应 CSS**：在你现有 `index.css` 里加一个简洁卡片样式（略，重点是 z-index > 节点层、pointer-events:auto）。

---

### 2) 扩展端：处理 `analyze-file` / `open-source`，并把 FileCapsule 回传给 Webview

```ts
// 文件名: src/features/filetree-blueprint/panel/BlueprintPanel.ts
// 作用: 接收 analyze-file 消息 -> 调用分析服务(带缓存) -> 回发 show-analysis-card；open-source 跳转到行。

import * as vscode from "vscode";
import {
  analyzeFileWithCache,
  FileCapsule,
} from "../../analysis/AnalysisService";

export function wireBlueprintPanel(
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
  workspaceRoot: vscode.Uri
) {
  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg?.type === "analyze-file") {
      try {
        const rel = String(msg.payload?.path || "/")
          .replace(/\\/g, "/")
          .replace(/\/+/g, "/");
        const fileUri = rel.startsWith("/")
          ? vscode.Uri.joinPath(workspaceRoot, rel)
          : vscode.Uri.joinPath(workspaceRoot, `/${rel}`);
        const capsule: FileCapsule = await analyzeFileWithCache(
          context,
          fileUri
        );
        panel.webview.postMessage({
          type: "show-analysis-card",
          payload: capsule,
        });
      } catch (e: any) {
        vscode.window.showErrorMessage(`分析失败: ${e?.message || e}`);
      }
      return;
    }
    if (msg?.type === "open-source") {
      const { file, line, endLine } = msg.payload || {};
      const target = file?.startsWith("/")
        ? vscode.Uri.joinPath(workspaceRoot, file)
        : vscode.Uri.file(file);
      const doc = await vscode.workspace.openTextDocument(target);
      const editor = await vscode.window.showTextDocument(doc, {
        preview: true,
      });
      const l = Math.max(0, (line || 1) - 1),
        r = Math.max(l, (endLine || line || 1) - 1);
      editor.selection = new vscode.Selection(l, 0, r, 0);
      editor.revealRange(
        new vscode.Range(l, 0, r, 0),
        vscode.TextEditorRevealType.InCenter
      );
      return;
    }
  });
}
```

> 把 `wireBlueprintPanel` 在你创建 WebviewPanel 时调用即可（你现有面板应已做了 `init-graph` 的 postMessage，直接并入上面的消息处理）。

---

### 3) 分析服务：缓存优先 → 静态分析 → LLM 摘要（结构化+证据）

```ts
// 文件名: src/features/analysis/AnalysisService.ts
// 作用: 读取缓存 -> 失效则重算；先静态分析形成事实，再调用 OpenAI 生成“概览/推断/建议”，并绑定证据锚点。

import * as vscode from "vscode";
import * as crypto from "crypto";
import * as path from "path";
import * as fs from "fs/promises";

export interface FileCapsule {
  fileCapsuleVersion: string;
  file: string;
  lang: string;
  contentHash: string;
  summary?: { zh?: string; en?: string };
  api?: Array<{ name: string; signature?: string; evidence?: string[] }>;
  deps?: {
    out?: Array<{ module: string; count: number; evidence?: string[] }>;
    inSample?: Array<{ file: string; line: number; evidence?: string[] }>;
  };
  facts?: Array<{ id: string; text: string; evidence?: string[] }>;
  inferences?: Array<{
    id: string;
    text: string;
    confidence: number;
    evidence?: string[];
  }>;
  recommendations?: Array<{
    id: string;
    text: string;
    reason?: string;
    evidence?: string[];
  }>;
  evidence?: Record<
    string,
    { file: string; lines: [number, number]; sha256: string }
  >;
  stale?: boolean;
  lastVerifiedAt?: string;
  tooling?: Record<string, string>;
}

export async function analyzeFileWithCache(
  context: vscode.ExtensionContext,
  fileUri: vscode.Uri
): Promise<FileCapsule> {
  const root =
    vscode.workspace.getWorkspaceFolder(fileUri)?.uri ??
    vscode.Uri.file(path.dirname(fileUri.fsPath));
  const text = (await vscode.workspace.fs.readFile(fileUri)).toString();
  const lang = detectLang(fileUri.fsPath);
  const contentHash =
    "sha256:" + crypto.createHash("sha256").update(text).digest("hex");

  const cacheDir = vscode.Uri.joinPath(
    root,
    ".ai-explorer-cache",
    "filecapsules"
  );
  await vscode.workspace.fs.createDirectory(cacheDir);
  const cachePath = vscode.Uri.joinPath(
    cacheDir,
    contentHash.replace(":", "_") + ".json"
  );

  // 命中缓存
  try {
    const buf = await vscode.workspace.fs.readFile(cachePath);
    const json = JSON.parse(buf.toString()) as FileCapsule;
    if (json?.contentHash === contentHash) return json;
  } catch {}

  // —— 静态分析（极简示例，你可接入 tsserver/rust-analyzer/ts-morph/tree-sitter）——
  const { api, depsOut, evi } = await quickStaticAnalyze(fileUri, text, lang);

  // —— 调用 LLM（结构化输出；约束只填规定字段；不要长篇大论）——
  const { summary, inferences, recommendations } = await callOpenAIForSummary({
    lang,
    text,
    api,
    depsOut,
  });

  const capsule: FileCapsule = {
    fileCapsuleVersion: "1",
    file:
      "/" +
      path.posix
        .relative(
          root.fsPath.replace(/\\/g, "/"),
          fileUri.fsPath.replace(/\\/g, "/")
        )
        .replace(/^\/*/, ""),
    lang,
    contentHash,
    summary,
    api: api.map((x, i) => ({ ...x, evidence: [`e_api_${i}`] })),
    deps: {
      out: depsOut.map((d, i) => ({ ...d, evidence: [`e_dep_${i}`] })),
      inSample: [],
    },
    facts: [
      {
        id: "f_exports",
        text: `exports: ${api.map((x) => x.name).join(", ")}`,
        evidence: api.map((_, i) => `e_api_${i}`),
      },
    ],
    inferences,
    recommendations,
    evidence: evi,
    stale: false,
    lastVerifiedAt: new Date().toISOString(),
    tooling: { node: process.version },
  };

  await vscode.workspace.fs.writeFile(
    cachePath,
    Buffer.from(JSON.stringify(capsule, null, 2), "utf8")
  );
  return capsule;
}

function detectLang(fp: string): string {
  const ext = path.extname(fp).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") return "ts";
  if (ext === ".rs") return "rust";
  if (ext === ".js") return "js";
  if (ext === ".py") return "py";
  return ext.slice(1) || "txt";
}

// —— 极简静态分析（示例）：正则/简单扫描，产出最小事实与证据 —— //
async function quickStaticAnalyze(uri: vscode.Uri, text: string, lang: string) {
  const api: Array<{ name: string; signature?: string }> = [];
  const depsOut: Array<{ module: string; count: number }> = [];
  const evidence: Record<
    string,
    { file: string; lines: [number, number]; sha256: string }
  > = {};

  const lines = text.split(/\r?\n/);

  // 假装找 exports / pub fn（示例）
  lines.forEach((ln, idx) => {
    if (
      lang === "ts" &&
      /\bexport\s+(?:function|const|class)\s+([A-Za-z0-9_]+)/.test(ln)
    ) {
      const name = RegExp.$1;
      api.push({ name, signature: ln.trim() });
      evidence[`e_api_${api.length - 1}`] = {
        file: uri.fsPath,
        lines: [Math.max(1, idx + 1), Math.min(lines.length, idx + 3)],
        sha256: hashLines(lines, idx, idx + 2),
      };
    }
    if (lang === "rust" && /\bpub\s+fn\s+([A-Za-z0-9_]+)/.test(ln)) {
      const name = RegExp.$1;
      api.push({ name, signature: ln.trim() });
      evidence[`e_api_${api.length - 1}`] = {
        file: uri.fsPath,
        lines: [Math.max(1, idx + 1), Math.min(lines.length, idx + 3)],
        sha256: hashLines(lines, idx, idx + 2),
      };
    }
    // 依赖（ts import / rust use）
    if (lang === "ts" && /\bfrom\s+['"]([^'"]+)['"]/.test(ln)) {
      const mod = RegExp.$1;
      const x = depsOut.find((d) => d.module === mod);
      x ? x.count++ : depsOut.push({ module: mod, count: 1 });
      evidence[`e_dep_${depsOut.length - 1}`] = {
        file: uri.fsPath,
        lines: [idx + 1, idx + 1],
        sha256: hashLines(lines, idx, idx),
      };
    }
    if (lang === "rust" && /\buse\s+([A-Za-z0-9_:]+)/.test(ln)) {
      const mod = RegExp.$1;
      const x = depsOut.find((d) => d.module === mod);
      x ? x.count++ : depsOut.push({ module: mod, count: 1 });
      evidence[`e_dep_${depsOut.length - 1}`] = {
        file: uri.fsPath,
        lines: [idx + 1, idx + 1],
        sha256: hashLines(lines, idx, idx),
      };
    }
  });

  return { api, depsOut, evi: evidence };
}

function hashLines(lines: string[], s: number, e: number) {
  const h = crypto.createHash("sha256");
  for (let i = s; i <= e && i < lines.length; i++) h.update(lines[i] + "\n");
  return h.digest("hex");
}

// —— OpenAI 结构化摘要（伪代码）：实际请接你现有 OpenAI 客户端 —— //
async function callOpenAIForSummary(input: {
  lang: string;
  text: string;
  api: any[];
  depsOut: any[];
}) {
  // 提示要点：
  // 1) 只按 schema 输出，不长篇
  // 2) 每个“推断/建议”要引用可证据的“行号索引”；如果无证据，填 empty，并降低 confidence
  // 3) 中文优先（你需求里强调）
  const summary = { zh: `该文件负责 ...（示例）` };
  const inferences = [
    {
      id: "i_role",
      text: "模块角色=Service（示例）",
      confidence: 0.7,
      evidence: ["e_api_0"],
    },
  ];
  const recommendations = [];
  return { summary, inferences, recommendations };
}
```

> 说明：静态分析我给了“极简占位”，你可以逐步替换为：TS 用 `ts-morph/tsserver`，Rust 用 `rust-analyzer`（或简单 `ripgrep` + 语法树）；证据锚点要能回放到**真实行号**即可。

---

## 设计评审 & 优化建议

- ✅ **你的整体设计是好的**：可视化里手动触发分析 → 缓存 FileCapsule → UI 可折叠；前期先保证“好用+可靠”。
- ✅ **先做必选信息**（概览/API/依赖/证据），足以帮人和 Copilot 迅速建立上下文；
- ✅ **证据优先，推断靠后**：UI 上把“事实（可证）”与“推断（置信度）”分区展示，避免误导；
- ✅ **缓存键＝内容哈希**：文件移动/重命名不重复分析；
- ✅ **一切都为 MCP 做准备**：现在的 FileCapsule 就是未来 `get_capsule` 的返回；“证据锚点”就是未来 `find_evidence` 的输入。

**可以更进一步的点**（下一步）：

- 入依赖（谁引用它）做一个**样本查询**（ripgrep/语言服务），卡片只放 3–5 条 + “更多…”
- 卡片上做一个**“命名建议（中 ⇄ 英）”**按钮（调用 LLM），勾选后可一键生成 `rename` 计划（暂不落盘）
- “刷新分析”时先秒回**静态事实**，LLM 结果稍后覆盖（降低等待感）

---

如果你愿意，我可以把这三段骨架进一步**对齐你仓库的真实路径/命名**（比如把 `wireBlueprintPanel` 合到你现有 `BlueprintPanel.ts`），并补上简洁的卡片 CSS。你也可以先按上面思路落一版，遇到具体问题我再按行帮你调。
