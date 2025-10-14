# 模块索引 - AI Explorer

> 📖 **给 AI 和开发者的快速导航指南**

## 🏗️ 架构概览

```
src/
├── extension.ts          # 🚀 主入口
├── core/                 # ⚙️ 核心服务层
├── features/             # 🎯 功能模块层
│   ├── explorer-alias/   # 📁 文件别名管理
│   └── uml-canvas/       # 🎨 UML 图表生成
└── shared/               # 📚 共享组件层
```

## 📋 模块快速定位表

### 🌟 Explorer-Alias（文件别名管理）

| 功能 | 关键文件 | 搜索标签 |
|------|----------|----------|
| **模块入口** | `ExplorerAliasModule.ts` | `explorer-alias` `activation` |
| **树视图** | `ui/AIExplorerProvider.ts` | `TreeView` `Provider` |
| **翻译逻辑** | `app/usecases/TranslateBatchUseCase.ts` | `translation` `batch` |
| **命令处理** | `ExplorerAliasModule.ts` (registerCommands) | `commands` `refresh` |

**常见任务映射**：
- 🔄 修改翻译逻辑 → `TranslateBatchUseCase.ts`
- 🌳 更改树显示 → `AIExplorerProvider.ts`
- ⚡ 添加新命令 → `ExplorerAliasModule.ts`
- 💾 修改缓存策略 → `@core/cache/KVCache.ts`

### 🎨 UML-Canvas（图表生成）

| 功能 | 关键文件 | 搜索标签 |
|------|----------|----------|
| **模块入口** | `UMLCanvasModule.ts` | `uml-canvas` `activation` |
| **代码分析** | `app/usecases/GenerateUMLUseCase.ts` | `AST` `parsing` |
| **面板管理** | `panel/UMLCanvasPanel.ts` | `Webview` `panel` |
| **前端界面** | `webview/src/` | `canvas` `d3` `visualization` |

**常见任务映射**：
- 🔍 修改代码解析 → `GenerateUMLUseCase.ts`
- 🖥️ 更改 UI 界面 → `panel/UMLCanvasPanel.ts`
- 🎯 调整前端渲染 → `webview/src/`
- 📊 修改布局算法 → `infra/layout/`

### ⚙️ Core（核心服务）

| 服务 | 关键文件 | 搜索标签 |
|------|----------|----------|
| **AI 接入** | `ai/OpenAIClient.ts` | `OpenAI` `API` `rate-limit` |
| **缓存管理** | `cache/KVCache.ts` | `cache` `TTL` `storage` |
| **日志服务** | `logging/Logger.ts` | `logging` `debug` `output` |
| **提示模板** | `ai/PromptProfiles.ts` | `prompt` `template` `profile` |

## 🔍 AI 搜索优化指南

### 按功能搜索

```bash
# 🔄 翻译相关
npm run grep:alias
# 搜索: "translation|translate|别名|中文"

# 🎨 UML 相关  
npm run grep:uml
# 搜索: "uml|diagram|AST|canvas|图表"

# ⚙️ 核心服务
rg "OpenAI|cache|logger" src/core/

# 🐛 错误处理
rg "error|Error|exception" src/
```

### 按模块边界搜索

```bash
# 只在 Explorer-Alias 模块内搜索
rg "pattern" src/features/explorer-alias/

# 只在 UML-Canvas 模块内搜索  
rg "pattern" src/features/uml-canvas/

# 核心服务搜索
rg "pattern" src/core/
```

## 📝 修改指南

### ✅ 安全修改区域

| 模块 | 安全修改的文件类型 | 说明 |
|------|-------------------|------|
| **Explorer-Alias** | `app/usecases/*`, `ui/*` | 业务逻辑和UI层 |
| **UML-Canvas** | `app/usecases/*`, `panel/*`, `webview/src/*` | 用例、面板和前端 |
| **Core** | `ai/PromptProfiles.ts` | 提示模板配置 |

### ⚠️ 谨慎修改区域

| 文件 | 风险 | 建议 |
|------|------|------|
| `extension.ts` | 🔴 高 | 只改模块注册，不改 DI 逻辑 |
| `core/di/Container.ts` | 🔴 高 | 影响整个插件启动 |
| `BaseModule.ts` | 🟡 中 | 影响所有模块基础功能 |

### 🚫 跨模块访问规则

```typescript
// ❌ 错误：跨模块深度依赖
import { TranslateBatchUseCase } from '@feat/explorer/app/usecases/TranslateBatchUseCase';

// ✅ 正确：通过 Core 或 Shared 访问
import { OpenAIClient } from '@core/ai/OpenAIClient';
import { FileNode } from '@shared/types';
```

## 🎯 开发工作流

### 1️⃣ 新增功能

1. 确定所属模块（Explorer-Alias / UML-Canvas / 新模块）
2. 在对应 `app/usecases/` 创建用例
3. 在 `ui/` 或 `panel/` 创建界面
4. 在模块入口注册服务和命令
5. 更新模块 README.md

### 2️⃣ 修改现有功能

1. 通过搜索标签定位文件
2. 查看模块 README 的"变更入口"
3. 按分层架构修改：UI → App → Domain ← Infra
4. 测试模块边界未被破坏

### 3️⃣ 调试技巧

```bash
# 按模块启动调试
F5 → "🌟 调试 Explorer-Alias 模块"
F5 → "🎨 调试 UML-Canvas 模块" 

# 查看输出日志
Ctrl+Shift+P → "AI Explorer - Core"
```

## 📚 扩展资源

- 📖 [架构设计文档](./ARCHITECTURE.md) 
- 🔧 [开发配置说明](../.vscode/README.md)
- 🧪 [测试指南](../test/README.md)
- 🚀 [部署流程](./DEPLOYMENT.md)

---

> 💡 **提示**：使用多根工作区（`ai-explorer.code-workspace`）可以让搜索自动限制在当前模块范围内！