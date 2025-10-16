结论先说：**做成 MCP Server，让 Copilot（Chat & Coding Agent）来调用，是更省力、也更“平台友好”的方案**；你的 VS Code 插件继续负责**可视化蓝图**与本地 UI。这样你既能复用 Copilot 的编辑/多文件改动能力，又把你最独特的“项目理解 + 架构蓝图 + 中文/英文命名联动”沉淀成标准化能力，任何支持 MCP 的客户端都能用。

# 为什么选 MCP + Copilot（而不是自己造“像 Copilot 一样直接改文件”的轮子）

- **Copilot 原生支持 MCP**：官方文档明确支持用 MCP 扩展 Copilot Chat 与 Copilot Coding Agent 的工具集（也就是让 Copilot 通过 MCP 调你的“工具/资源/提示模板”）。([GitHub Docs][1])
- **VS Code 里直接配置 MCP server**：开发者无需安装你的 VS Code 插件就能用你的工具；而你仍可保留插件做重 UI 的蓝图视图。([Visual Studio Code][2])
- **比“Copilot Extensions”门槛低**：Extensions 是 GitHub App 级别的集成，适合上 Marketplace 分发；你当前阶段更适合 **先用 MCP 做“私有/团队内工具”**，后面再考虑产品化。([GitHub Docs][3])
- **协议中立、可复用**：MCP 是开放标准，后续也能被 ChatGPT/Claude 等客户端复用，不被某一家绑定。([模型上下文协议][4])

# 推荐架构（Hybrid）

- **MCP Server（你新增）**：封装“项目理解与重构”的**无头能力**（读/析/计划/补丁）。
- **VS Code 插件（继续保留）**：只做**蓝图可视化 + 交互**（下钻、布局、标注、命名工作台）。
- **Copilot**：作为“前台智能体”，在 Chat 或 Coding Agent 里**调用你的 MCP 工具**，并负责把补丁应用到工作区。

## 你该暴露的 MCP 工具（建议首批 10 个）

1. `scan_workspace(root, ignore_globs, depth)` → 返回文件树（浅/深）
2. `build_blueprint(focus, shallow)` → 返回你的**文件树蓝图 JSON**
3. `summarize_file(path, locale)` → 生成**中/英文功能摘要**
4. `classify_files(paths[])` → 归类到“模块/子系统/层级”
5. `suggest_names(path, cn_name?)` → **中文 ⇄ 英文命名建议**（带风格/规范）
6. `find_duplicates(module)` → 可能的**重复实现/放错位置**
7. `propose_refactor(goal, scope[])` → 产出**结构化改动计划**（多文件）
8. `generate_edits(plan)` → 产出 **JSON-edits / diff**（不直接写盘）
9. `fix_imports(language, changed_files[])` → 计算导入/模块修复建议
10. `run_checks(kind)` → `tsc --noEmit` / `cargo check` 等静态检查结果

> **写盘由谁做？**
> 推荐让 **Copilot Coding Agent** 根据你返回的 JSON-edits/diff 去改文件（它有自己的编辑能力与安全确认流）；你的 MCP server 保持“建议生成 + 校验”的定位，更安全。([GitHub Docs][5])

## 资源/提示（MCP 的 resources/prompts）

- 把最近生成的蓝图 JSON、命名映射表（CN⇄EN）、模块准则作为 **resources** 提供给 Copilot，便于它在对话中**随取随用**（长上下文也能复用）。([GitHub Docs][1])

# 和“直接做插件内改码”/“直接用 Copilot”怎么取舍

- 只用 Copilot：适合**小范围补全/修 bug**，但**不了解你的蓝图语义**、难以“项目级一致性重构”。
- 纯插件内改码：你要自行实现**多文件编辑/确认流/撤销**等，**成本高**。
- **MCP + Copilot（推荐）**：你提供“**知道项目怎么改**”的脑子，Copilot 负责“**怎么在编辑器里改**”。两者叠加=1+1>2。

# 上手步骤（一天起飞）

1. **起一个最小 MCP Server**（Node/TS 最快；Rust 也可）：实现 `build_blueprint` 与 `summarize_file` 两个工具，schema 明确、输出稳定。
2. **在 VS Code 配置 MCP**：按官方文档在设置里注册你的本地 server（启动命令/端口/env）。([Visual Studio Code][2])
3. **在 Copilot Chat 测试**：

   - “使用工具 build_blueprint 分析 /src”
   - “对 src/xx.ts 调用 summarize_file 并给我英文命名建议”

4. **加“改动计划 → JSON-edits”闭环**：让 Copilot 根据你的 edits 询问用户并应用。
5. **回到插件**：蓝图面板增加“来自 MCP 的标注层”（例如“疑似放错模块”的红点/Badge）。

# 关键对比：MCP vs Copilot Extensions

- **MCP**：协议层，任何支持 MCP 的客户端都能用；本地/团队先行，**迭代快**。([GitHub Docs][1])
- **Extensions（GitHub App）**：用于把外部 SaaS 正式接入 Copilot Chat 并上架市场，**分发与权限精细**，但开发/上架链路更重。([GitHub Docs][3])
  → 你的阶段：**先 MCP，后续再考虑做成 Extension**。

# 最小返回格式（建议）

让工具 `generate_edits` 输出结构化补丁，Copilot 来应用：

```json
{
  "edits": [
    {
      "file": "src/foo.ts",
      "range": { "start": [12, 0], "end": [20, 0] },
      "replacement": "// 新实现…",
      "reason": "消除重复 + 对齐模块边界"
    }
  ],
  "renames": [{ "from": "src/old.ts", "to": "src/new.ts" }],
  "moves": [{ "from": "src/x.ts", "to": "src/module/x.ts" }]
}
```

> 这样既便于你做**可视化审核**，也方便 Copilot 编排“批量编辑 + 导入修复 + 编译检查”。

---

## 结论

- **是，做成 MCP 让 Copilot 调用会更好**：你把“项目级理解/重构能力”产品化；Copilot 负责在编辑器里落地改动。
- **保留你的 VS Code 插件做蓝图 UI**，两者互补。
- 先从 2–3 个工具起步（蓝图/摘要/命名），一周内形成可用闭环；之后再扩到“改动计划/补丁/检查”。

需要的话，我可以按你现有代码给一份**最小 MCP Server（TS 版）骨架**，直接输出 `build_blueprint` 和 `summarize_file` 两个工具，并附 VS Code 里的 MCP 配置示例。

[1]: https://docs.github.com/copilot/customizing-copilot/using-model-context-protocol/extending-copilot-chat-with-mcp?utm_source=chatgpt.com "Extending GitHub Copilot Chat with the Model Context ..."
[2]: https://code.visualstudio.com/docs/copilot/customization/mcp-servers?utm_source=chatgpt.com "Use MCP servers in VS Code"
[3]: https://docs.github.com/copilot/using-github-copilot/using-extensions-to-integrate-external-tools-with-copilot-chat?utm_source=chatgpt.com "You can use Copilot Extensions to interact with external ..."
[4]: https://modelcontextprotocol.io/?utm_source=chatgpt.com "Model Context Protocol"
[5]: https://docs.github.com/copilot/how-tos/agents/copilot-coding-agent/extending-copilot-coding-agent-with-mcp?utm_source=chatgpt.com "Extending GitHub Copilot coding agent with the Model ..."
