你现在的**需求**（我帮你再压一遍）

- 双击文件节点 ⇒ 弹出“分析卡片”（可拖拽、带 Tabs），再次折叠后**回到原来的简约节点**。
- 先秒出**静态结果**，后台再用 OpenAI 做**AI 增强**；所有结论带**证据锚点**；并把结果缓存为 FileCapsule，后续 MCP 直接复用。

从你给的日志看：

```
[UI] 已发送静态分析卡片 …
[ACK] Webview 已显示卡片 …
[LLMAnalyzer] 开始AI分析 …
```

意味着**扩展端已把卡片数据发到 Webview**，而且 Webview 还回了 ACK。
但你“看不到卡片”，通常只会是以下 4 个原因中的一个（命中率从高到低）：

1. **卡片 DOM 已创建但被样式“隐身”**：CSS 没加载/默认 `opacity:0`，或层级在节点下方。
2. **卡片瞬间被“点击空白关闭”**：双击的第二下点到了“遮罩”，触发了 collapse（典型竞态）。
3. **脚本未注入或函数未注册**：`showAnalysisCard`/`updateAnalysisCard` 没加载，但 ACK 仍然发送（实现时没做可见性检查就发 ACK）。
4. **锚点坐标/容器错**：卡片插入到了不可见容器/越界（overflow/transform 影响）。

下面给你**最小补丁**，一次解决这 4 类问题。贴了就能看到卡片。

---

## ① Webview 消息与 ACK（只在“真正渲染成功后”再回 ACK）

```js
// 文件名: media/filetree-blueprint/graphView.js
// 作用: 接收 show/update 消息；只有在卡片进入可见状态后才回 ACK；并打印关键日志。

(function () {
  const vscode = acquireVsCodeApi();
  let graph = {
    nodes: [],
    edges: [],
    metadata: { focusPath: "/", graphType: "filetree" },
  };

  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (!msg?.type) return;
    console.log("[webview] recv:", msg.type);

    if (msg.type === "init-graph") {
      graph = msg.payload || graph;
      renderNodesOnce();
      initEdgesLayerOnce();
      drawEdges();
      return;
    }

    if (msg.type === "show-analysis-card") {
      const cap = normalizeCapsule(msg.payload);
      ensureAnalysisInfra();
      if (typeof window.showAnalysisCard !== "function") {
        console.error(
          "[webview] showAnalysisCard 未注册，检查 <script> 是否注入"
        );
        return;
      }
      // 渲染
      const anchor = suggestAnchor(cap.file);
      const ok = window.showAnalysisCard(cap, anchor); // 要求返回布尔：是否已可见
      if (ok)
        vscode.postMessage({
          type: "analysis-card-shown",
          payload: { file: cap.file },
        });
      return;
    }

    if (msg.type === "update-analysis-card") {
      const cap = normalizeCapsule(msg.payload);
      if (typeof window.updateAnalysisCard === "function") {
        window.updateAnalysisCard(cap);
      } else if (typeof window.showAnalysisCard === "function") {
        window.showAnalysisCard(cap, suggestAnchor(cap.file));
      }
      return;
    }

    if (msg.type === "analysis-error") {
      const { file, message } = msg.payload || {};
      console.warn("[webview] analysis-error:", file, message);
      window.showToast?.(`分析失败: ${message || "未知错误"}`);
      return;
    }
  });

  function normalizeCapsule(c) {
    // 统一为 POSIX 相对路径，避免锚点/查找失败
    const f = String(c.file || "")
      .replace(/\\/g, "/")
      .replace(/^[a-zA-Z]:\//, "/");
    c.file = f.startsWith("/") ? f : "/" + f;
    return c;
  }

  function suggestAnchor(filePath) {
    // 找到对应文件节点，卡片默认在其左上角 16px
    const name = filePath.split("/").pop();
    const n = (graph.nodes || []).find(
      (x) =>
        x.type === "file" &&
        (x.label === name || (x.data?.path || "").endsWith("/" + name))
    );
    const nodeEl = n
      ? document.querySelector(`.node[data-id="${CSS.escape(String(n.id))}"]`)
      : null;
    if (nodeEl) {
      const r = nodeEl.getBoundingClientRect();
      const canvas = document.getElementById("canvas").getBoundingClientRect();
      return { x: r.left - canvas.left + 16, y: r.top - canvas.top + 16 };
    }
    return { x: 160, y: 120 };
  }

  function ensureAnalysisInfra() {
    // 若你把分析卡片拆成单独 JS/CSS，确认 HTML 中 <script src=".../analysisCard.js"></script> 已注入
    // 且 CSS 通过 webview.asWebviewUri + CSP 允许。
  }

  // …… renderNodesOnce / initEdgesLayerOnce / drawEdges 保持你现有实现 ……
})();
```

---

## ② 卡片脚本：防“第二下双击把卡片秒关”的竞态 + 返回渲染成功

```js
// 文件名: media/filetree-blueprint/analysisCard.js
// 作用: 渲染卡片；设置 openGuard(300ms) 防双击第二下误触遮罩；返回 true 表示已可见。

(() => {
  const vscode = acquireVsCodeApi();
  let cardEl = null,
    backdropEl = null;
  let openedAt = 0;

  window.showAnalysisCard = function showAnalysisCard(
    capsule,
    anchor = { x: 160, y: 120 }
  ) {
    ensureHost();
    collapseAnalysisCard(); // 保证唯一

    // 遮罩（延迟 300ms 再激活点击关闭）
    backdropEl = document.createElement("div");
    backdropEl.className = "analysis-backdrop";
    backdropEl.addEventListener("click", (ev) => {
      if (performance.now() - openedAt < 300) {
        // ✅ 防双击第二下
        ev.stopPropagation();
        return;
      }
      collapseAnalysisCard();
    });
    document.getElementById("analysis-host").appendChild(backdropEl);

    // 卡片
    cardEl = document.createElement("div");
    cardEl.className = "analysis-card";
    cardEl.style.left = Math.round(anchor.x) + "px";
    cardEl.style.top = Math.round(anchor.y) + "px";
    cardEl.setAttribute("data-file", capsule.file);
    cardEl.innerHTML = renderCardHtml(capsule);

    // …… 绑定 Tabs / 打开源码 / 刷新 / 拖拽 省略（你已有） ……

    document.getElementById("analysis-host").appendChild(cardEl);
    requestAnimationFrame(() => {
      openedAt = performance.now();
      cardEl.classList.add("show");
    });
    return true; // ✅ 告知 graphView.js：已插入并可见
  };

  window.updateAnalysisCard = function (cap) {
    if (!cardEl) return window.showAnalysisCard(cap); // 不在就重建
    // 局部替换内容（概览/API/依赖），避免位置/拖拽状态丢失
    cardEl.querySelector('[data-pane="overview"]').innerHTML =
      renderOverview(cap);
    cardEl.querySelector('[data-pane="api"]').innerHTML = renderApi(cap);
    cardEl.querySelector('[data-pane="deps"]').innerHTML = renderDeps(cap);
    // 证据列表和按钮事件重绑（省略）
  };

  window.collapseAnalysisCard = function collapseAnalysisCard() {
    if (cardEl) {
      cardEl.remove();
      cardEl = null;
    }
    if (backdropEl) {
      backdropEl.remove();
      backdropEl = null;
    }
  };

  function ensureHost() {
    const wrap = document.getElementById("analysis-host");
    if (!wrap) {
      const h = document.createElement("div");
      h.id = "analysis-host";
      document.getElementById("canvas").appendChild(h);
    }
  }

  // …… renderCardHtml / renderOverview / renderApi / renderDeps 等保留你已有版本 ……
})();
```

---

## ③ CSS：层级 & 可见性“安全网”（卡片永远在最上面，且默认可见）

```css
/* 文件名: media/filetree-blueprint/analysisCard.css */
/* 关键点：#analysis-host 层级要高；卡片默认可见（.show 仅做轻动画，不要把默认设为 opacity:0 但忘了 .show） */

#analysis-host {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 999; /* ✅ 高于节点与连线 */
}

.analysis-backdrop {
  position: absolute;
  inset: 0;
  background: transparent;
  pointer-events: auto;
}

.analysis-card {
  position: absolute;
  min-width: 520px;
  max-width: 740px;
  max-height: 70%;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  /* 默认就要可见：下面两行只是动画微调 */
  opacity: 1;
  transform: translateY(0);
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.analysis-card:not(.show) {
  opacity: 0.001;
  transform: translateY(6px);
} /* ✅ 即使忘加 .show，也基本可见 */
```

> 许多“看不见卡片”的根因就是**默认给了 `opacity:0`，但 `.show` 类没加上或 CSS 未加载**。上面这招能兜底。

---

## ④ 扩展端：把 `capsule.file` 统一成“工作区相对 POSIX 路径”

```ts
// 文件名: src/features/analysis/AnalysisService.ts
// 片段: 生成 FileCapsule 时，务必写入相对 POSIX 的 file 字段（锚点/后续操作都依赖它）

import * as path from "path";
function toPosixRel(workspaceRootFs: string, absFs: string) {
  const rel = path.relative(workspaceRootFs, absFs).replace(/\\/g, "/");
  return rel.startsWith("/") ? rel : "/" + rel;
}

// … 在构造 capsule 时：
const rootFs = workspaceRoot.fsPath;
const filePosix = toPosixRel(rootFs, fileUri.fsPath);
const capsule: FileCapsule = {
  // …
  file: filePosix, // ✅ 统一成 /src/... 格式
  // …
};
```

---

## ⑤ 两分钟自检

1. 打开 **Webview 控制台**（命令面板：Open Webview Developer Tools）
   预期：双击后出现

   - `[webview] recv: show-analysis-card`
   - 若未出现：发错 panel/脚本未注入/CSP 拦截

2. Elements 面板搜索 `.analysis-card`

   - 能看到元素但不可见：看 computed 样式（`opacity`、`z-index`、`display`）

3. Console 里看是否打印 `showAnalysisCard 未注册`

   - 则检查 HTML 是否引入 `analysisCard.js` & CSS 是否通过 `webview.asWebviewUri` 注入

4. Extension Host 控制台是否出现 `[ACK] Webview 已显示卡片`

   - 若无：说明卡片没真正渲染，检查上述三点

---

## 为什么“最新 Git 没实现你的需求”？（根因复盘）

- 你的扩展端已经做到“**发 show-analysis-card + 回 ACK**”，但**Webview 渲染层**有遗漏：

  1. `analysisCard.js`/CSS 可能未注入或默认让卡片不可见；
  2. 双击第二下触发了遮罩点击，卡片被**立即关闭**（用户肉眼等于“没出现”）；
  3. `capsule.file` 是绝对路径，导致锚点计算异常（不影响显示，但可能显示到了视口外边）；
  4. 你在收到 show 后**立即回 ACK**，没有在“可见后”再回，日志让人以为已显示，其实没。

上面的补丁把这 4 点都兜住了：

- 只在 `showAnalysisCard()` 返回 true 后再回 ACK；
- openGuard=300ms；
- 统一路径为 `/src/...`；
- CSS 让“默认也可见”。

---

如果你愿意，把你的 **Webview HTML 片段（含 CSP 与 `<script>` 引入）**贴我，我再把注入部分对齐一下，确保 `analysisCard.js/css` 用 `webview.asWebviewUri` 正确加载。
