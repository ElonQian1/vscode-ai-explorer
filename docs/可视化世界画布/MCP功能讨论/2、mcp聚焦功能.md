你的方向是对的，而且很有价值：**把“庞大项目的结构化认知”做成可被 Copilot/代理随取随用的“低成本上下文”**，等于给它一套“索引+证据”的大纲，而不是把整仓库原文塞进上下文里。

下面给你一份可落地的实现蓝图，重点是：**如何让信息“准确、可追溯、不误导代理”**。

---

# 目标

- **减压**：把仓库变成一组“可检索的小胶囊（capsules）”，每次只喂给代理最相关的 2–5 个胶囊，而不是整段源码。
- **可追溯**：每条结论都附**证据锚点**（文件/行号/哈希），代理和人都能点回原文验证。
- **抗漂移**：内容基于**静态分析/构建系统**和**事实模板**生成；AI 的“推断”与“事实”分栏、分级。

---

# 一、你应该生成并维护的“知识胶囊”

建议最少维护 4 类 capsule（全部是小 JSON，对应 MCP `resources` 或通过 `tools` 动态返回）：

1. **ModuleCapsule**（模块概览）

- `module_id`（内容哈希派生，路径无关）
- `purpose`（一句话用途；**来自 LLM，但必须有证据引用**）
- `public_api`（导出的类型、函数、接口；来自语言服务/编译器）
- `deps_in` / `deps_out`（入/出依赖计数和列举；来自静态分析）
- `evidence[]`（`{file, lines:[s,e], sha256}`）
- `confidence`（0–1；越多证据越高）
- `last_verified_at`（验证时间）

2. **FileCapsule**（文件速览）

- `content_hash`, `lang`
- `roles[]`（如 Controller/Repo/Service；**若由 LLM 推断，要标记 `inferred:true`**）
- `exports[]`、`symbols[]`（函数/类型/常量；来自语言服务）
- `owners?`（可选：从 CODEOWNERS/注释提取）
- `evidence[]`

3. **InterfaceCapsule**（接口/类型契约）

- `name`, `kind`（interface/trait/type）
- `methods/signature`（解析抽象语法树获取）
- `implementations[]`（谁实现/在哪里用）
- `evidence[]`

4. **GraphCapsule**（局部依赖子图）

- `focus`（模块/目录）
- `nodes/edges`（轻量化，最多 200 节点；更大用分页）
- `hotspots`（高扇入/扇出）
- `evidence[]`（边缘来源依据，如 import/use 的行号）

> 共同规范：
>
> - **每条 facts 都要能指回 `evidence`**；
> - **把 LLM 生成的信息与“可证事实”分离**：`facts[]`（可证）、`notes[]`（LLM 解释，带 `inferred:true`）；
> - **所有 capsule 带 `content_hashes[]`**（参与事实的文件哈希列表），便于失效与增量更新。

---

# 二、MCP 工具与资源设计（给 Copilot/代理调用）

最小化工具集（易实现、立刻有用）：

- `list_capsules(query, type?, limit=5)`
  语义搜索 + 关键字过滤，返回命中的 capsules 索引（不含正文）。
- `get_capsule(id)`
  返回单个 capsule 全量 JSON。
- `get_graph(focus, depth=1)`
  返回一个小图（nodes/edges），用于“我要看 X 的邻居”。
- `find_evidence(locators[])`
  把 `{file,lines}` 列表转成源码切片（**只在被请求时返回小片段**）。
- `verify_facts(capsule_id)`
  重新跑静态分析（或构建系统），更新 `confidence/last_verified_at`。
- `propose_edits(goal, scope[])`（可选）
  返回**结构化改动计划**（不落盘）：JSON-edits/diff + 受影响文件 + 置信度。

把**最新 N 份高价值 capsules**注册为 MCP `resources`（例如根模块、平台层、入口层），让代理随时可读；其余通过 `tools` 按需取。

---

# 三、生成流程（如何让数据“准、稳、不误导”）

## 1) 事实优先，推断靠后

- **先跑静态分析**：

  - TS：TypeScript Compiler API / `tsserver` / `ts-morph` 提取 exports/依赖/符号；
  - Rust：`cargo metadata`、`rust-analyzer` 的 symbol/refs、`use/mod` 解析；
  - 通用：`tree-sitter` 兜底提取 import/调用大致关系。

- **再用 LLM 写摘要**：模板化、槽位化（少自由文本），必须引用证据锚点：

  - 模板字段示例：`purpose_zh`, `purpose_en`, `key_responsibilities[]`（每项后附 `(file:line)`）。

## 2) 标注来源与置信

- 对每一条 `notes[]`（LLM 推断）打 `inferred:true` 与 `sources:[...]`；
- 设置**最低置信度阈值**（如 <0.6 不放入 resources，仅按需返回给代理）。

## 3) 变更感知与失效

- **内容哈希驱动**：capsule 里保存相关文件 `sha256`；
- 文件变动 → 对应 capsule **标记 `stale:true`**，仅返回“速览 + 警告”，并提示代理先 `verify_facts()`；
- 后台（或按需）重新生成，更新 `confidence/last_verified_at`。

## 4) 人在回路

- 在你的 VS Code 蓝图视图里提供“**更正**/标注错误”的入口：

  - 记录为 `human_notes[]`，权重大于 LLM 推断；
  - 作为训练下一轮摘要的硬约束（提示词里注入“已更正事实”）。

---

# 四、避免误导代理的“硬规矩”

1. **区分事实/推断/建议**

   - `facts[]`（由代码或构建系统直接得出）
   - `inferences[]`（LLM 推断，必须附证据与置信度）
   - `recommendations[]`（改动建议，不当作事实）

2. **永远返回证据坐标**

   - `file`, `lines:[start,end]`, `sha256`；代理若需要正文，再调 `find_evidence()` 精取 20–60 行。

3. **提供“未知/不适用”**

   - 模板字段允许 `unknown`，**不要让 LLM“编满格”**。

4. **与构建/语言服务对齐**

   - 任何“导出/依赖/接口”类事实，必须以语言服务/编译产物为准；分析与编译结果冲突 → 标红并降置信。

5. **时间戳与版本号**

   - capsule 返回 `last_verified_at` 和 `tooling_versions`（tsc/rustc/rust-analyzer 版本），便于代理判断陈旧。

---

# 五、检索与上下文配给（真正“减压”的关键）

- **两阶段检索**：

  1. 关键字/路径过滤（O(1)）
  2. 小向量/稀疏向量检索（对 `purpose/exports/roles` 字段做 embedding）

- **返回“胶囊标题卡”**（≤ 200 tokens/个）：只含 `purpose`、`public_api` 概要、`deps_out_top3`、`confidence`、`last_verified_at`；
- 代理若需要细节，再 `get_capsule(id)` 或 `find_evidence()`；**千万别一次性把全文丢进去**。

---

# 六、给 Copilot/代理的“使用准则”（提示词/协议）

让代理在系统提示或工具描述里遵守以下流程（核心要点）：

> - 当你需要了解项目结构/模块用途时：
>
>   1. 调 `list_capsules(query)` 获取前 3–5 个相关模块；
>   2. 仅把这些 capsules 的**标题卡**放入上下文；
>   3. 需要细节时，再按 id 调 `get_capsule` 或 `find_evidence` 获取局部源码；
>   4. **不要**编造未在 `facts` 或 `evidence` 中出现的信息；
>   5. `confidence < 0.6` 或 `stale:true` → 先调 `verify_facts()` 再回答。

---

# 七、示例：ModuleCapsule（精简版）

```json
{
  "type": "ModuleCapsule",
  "module_id": "mod:users@a1b2c3",
  "paths": ["services/users", "apis/users"],
  "public_api": ["getUser(id)", "listUsers()", "UserDto"],
  "deps_in": ["controllers/auth"],
  "deps_out": ["db/repo", "libs/validator"],
  "purpose": {
    "zh": "提供用户查询与列表，封装数据访问与校验",
    "en": "User read-only services; wraps repo and validation"
  },
  "facts": [
    {
      "text": "exports getUser, listUsers",
      "evidence": {
        "file": "services/users/index.ts",
        "lines": [1, 60],
        "sha256": "..."
      }
    },
    {
      "text": "depends on libs/validator",
      "evidence": {
        "file": "services/users/index.ts",
        "lines": [3, 10],
        "sha256": "..."
      }
    }
  ],
  "inferences": [
    {
      "text": "模块角色=Service",
      "confidence": 0.78,
      "evidence": {
        "file": "services/users/index.ts",
        "lines": [1, 40],
        "sha256": "..."
      }
    }
  ],
  "stale": false,
  "last_verified_at": "2025-10-16T06:52:00Z",
  "content_hashes": ["sha256:...", "sha256:..."]
}
```

---

# 八、工程落地顺序（建议 3 步走）

**Step 1：基础事实管道（1–3 天）**

- 扫描 → 提取 `exports/refs/imports`（TS + Rust，tree-sitter 兜底）
- 生成 FileCapsule/ModuleCapsule（**无 LLM**或 LLM 仅补一行 purpose）
- 做好 `evidence/sha256/last_verified_at`

**Step 2：MCP 接口（1–2 天）**

- `list_capsules/get_capsule/get_graph/find_evidence/verify_facts`
- 把根模块/平台层做成 MCP `resources`（热知识）

**Step 3：质量与防漂移（1–2 天）**

- `stale` 标记与增量更新
- LLM 输出模板化 + “unknown” 占位
- VS Code 蓝图“纠错入口”→ `human_notes` 写回

（之后再考虑 `propose_edits/generate_edits` 等重构建议类工具。）

---

# 九、常见风险与对策

- **风险：LLM 夸张/硬编** → 用**模板槽位** + `unknown` 占位 + 必附证据；`confidence` 低就不入资源。
- **风险：与实际代码漂移** → 内容哈希驱动失效 + `verify_facts()` 快速重算。
- **风险：检索错配** → 两阶段检索（关键词 + 小向量），并把“路径/语言/标签”作为强过滤。
- **风险：上下文仍然超标** → 只返回“标题卡”，细节按需二跳获取。
- **风险：跨语言/多包** → 以 **内容哈希 ID** 做主键，路径只做显示；移动不丢关联。

---

**一句话**：
你的产品价值不是“替代 Copilot”，而是给它一套**“可信、轻量、可验证的项目地图”**。把事实做硬、证据带全、更新可追，Copilot/任意代理就能在**极低上下文成本**下理解庞大项目而不被误导。
