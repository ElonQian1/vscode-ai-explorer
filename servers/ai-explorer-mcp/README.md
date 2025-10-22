# AI Explorer MCP 服务器

## 🎯 概述

AI Explorer MCP 服务器为 GitHub Copilot 和其他 AI 助手提供项目分析工具。通过 Model Context Protocol (MCP)，AI 助手可以智能理解您的代码库结构、文件用途和依赖关系。

## ✨ 特性

### 🔍 核心分析能力

- **智能文件分析**：三段流水线（启发式 → AST → LLM）分析文件用途
- **项目结构理解**：深度扫描项目结构，识别关键文件和目录
- **依赖关系映射**：分析文件间的导入/依赖关系
- **缓存优化**：JSONL 格式缓存，避免重复分析

### 🤖 AI 模型支持

- **双路由架构**：OpenAI ↔ 腾讯混元智能切换
- **成本优化**：长文件自动使用混元（更便宜）
- **容错机制**：主模型失败时自动回退

### 🛠️ MCP 工具集

#### `analyze_path`

分析指定文件或文件夹，返回详细的结构化信息：

- 一句话功能摘要
- 文件角色分类
- 编程语言识别
- 导出内容列表
- 依赖关系分析

#### `get_summary`

快速从缓存获取文件摘要，不触发新分析。

#### `list_related`

查找与指定文件相关的其他文件：

- 基于导入/依赖关系
- 同目录相关文件
- 同名不同扩展名文件

#### `get_project_overview`

生成项目整体概览：

- 项目结构树
- 关键文件识别
- 技术栈分析
- 统计信息

#### `clear_cache`

缓存管理工具，支持清除特定路径或全部缓存。

## 🚀 快速开始

### 1. 安装依赖

```bash
# 安装主项目依赖
npm install

# 安装 MCP 服务器依赖
npm run install:mcp
```

### 2. 构建项目

```bash
# 构建 VS Code 扩展和 MCP 服务器
npm run vscode:prepublish
```

### 3. 配置环境变量

```bash
# OpenAI API Key
export OPENAI_API_KEY="your-openai-key"

# 腾讯混元 API Key（可选）
export HUNYUAN_SECRET_ID="your-hunyuan-secret-id"
export HUNYUAN_SECRET_KEY="your-hunyuan-secret-key"
```

### 4. 启动 MCP 服务器

```bash
# 开发模式
npm run dev:mcp

# 生产模式
npm run start:mcp
```

## 🔧 VS Code 集成

### 自动配置

项目已包含 `.vscode/mcp.jsonc` 配置文件，VS Code 会自动发现 MCP 服务器。

### 手动配置

如需自定义配置，编辑 `.vscode/mcp.jsonc`：

```jsonc
{
  "servers": {
    "ai-explorer": {
      "type": "stdio",
      "command": "node",
      "args": ["./servers/ai-explorer-mcp/index.js"],
      "cwd": "${workspaceFolder}",
      "env": {
        "OPENAI_API_KEY": "${env:OPENAI_API_KEY}",
        "HUNYUAN_SECRET_ID": "${env:HUNYUAN_SECRET_ID}",
        "HUNYUAN_SECRET_KEY": "${env:HUNYUAN_SECRET_KEY}"
      }
    }
  }
}
```

## 💡 使用 GitHub Copilot

### 在 Copilot Chat 中使用

```
@ai-explorer analyze this project structure
@ai-explorer find files related to auth.ts
@ai-explorer what does src/utils/helper.js do?
```

### 在 Coding Agent 中使用

GitHub Copilot Coding Agent 会自动使用 MCP 工具来：

- 理解项目结构
- 分析文件用途
- 查找相关文件
- 提供更准确的代码建议

## 📊 缓存机制

### 缓存位置

- 文件位置：`analysis/.ai/cache.jsonl`
- 格式：每行一个 JSON 对象（便于查看和调试）

### 缓存策略

- **TTL**：默认 7 天过期
- **版本控制**：分析器版本升级时自动失效
- **文件监听**：文件修改时自动失效
- **智能合并**：同一文件的并发分析请求会被合并

### 缓存管理

```bash
# 清除所有缓存
curl -X POST http://localhost:3000/clear_cache

# 清除特定文件缓存
curl -X POST http://localhost:3000/clear_cache \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/file.ts"}'
```

## 🎨 悬停工具提示

在 VS Code 的 AI 资源管理器侧边栏中，鼠标悬停文件时会显示智能分析结果：

```
📝 TypeScript 配置文件
⚙️ 类型: 配置
💻 语言: json
📤 导出: compilerOptions, include, exclude
⚡ 快速推测
📁 /project/tsconfig.json
```

## 🔍 分析流水线

### 第一阶段：启发式分析（毫秒级）

- 基于文件名、扩展名、路径的快速推测
- 识别常见配置文件、测试文件、组件文件等
- 即时显示，用户感受为"秒回"

### 第二阶段：AST 结构分析（秒级）

- 解析 JavaScript/TypeScript 导出和依赖
- 提取函数签名、类定义
- 分析 package.json、tsconfig.json 等配置文件
- 生成相关文件列表

### 第三阶段：LLM 智能总结（10 秒内）

- 仅在必要时触发（避免 API 费用）
- 生成面向人类的自然语言描述
- 理解业务逻辑和代码意图
- 提供最准确的分析结果

## 🛡️ 错误处理

### 优雅降级

- LLM 不可用 → 使用 AST 分析结果
- AST 失败 → 使用启发式分析结果
- 网络错误 → 显示基础文件信息

### 重试机制

- API 限流：指数退避重试
- 网络超时：3 次重试后降级
- 解析错误：记录日志并继续

## 📈 性能优化

### 并发控制

- 最大并发数：2-3 个请求（避免 API 限流）
- 请求去重：同一路径的并发请求会被合并
- 队列管理：使用优先级队列处理分析请求

### 内存管理

- LRU 缓存：限制内存中的缓存条目数量
- 延迟加载：仅在需要时初始化 AI 客户端
- 垃圾回收：定期清理过期的分析结果

## 🐛 故障排除

### 常见问题

#### MCP 服务器启动失败

```bash
# 检查 Node.js 版本（需要 ≥18.0.0）
node --version

# 重新安装依赖
npm run install:mcp

# 查看详细错误日志
DEBUG=* npm run dev:mcp
```

#### API 密钥配置问题

```bash
# 验证环境变量
echo $OPENAI_API_KEY
echo $HUNYUAN_SECRET_ID

# 或者在 VS Code 设置中配置
```

#### 缓存问题

```bash
# 清除所有缓存
rm -rf analysis/.ai/cache.jsonl

# 或使用 MCP 工具
npm run start:mcp
# 然后调用 clear_cache 工具
```

### 日志查看

- **VS Code 输出**：查看"AI Explorer"通道
- **MCP 服务器日志**：stderr 输出到终端
- **缓存统计**：使用 `getStats()` API

## 🔮 未来计划

- [ ] **代码图谱**：生成项目的可视化依赖关系图
- [ ] **智能重构建议**：基于分析结果提供代码优化建议
- [ ] **多语言支持**：扩展支持 Python、Java、Go 等语言
- [ ] **团队协作**：共享分析结果和词典
- [ ] **IDE 扩展**：支持 IntelliJ IDEA、Cursor 等编辑器

## 📄 许可证

MIT License - 查看 [LICENSE](../LICENSE) 文件了解详情。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**享受智能代码分析的乐趣！** 🎉
