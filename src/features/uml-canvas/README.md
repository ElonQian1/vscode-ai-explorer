# 模块：UML 图表生成器（世界画布）

**搜索标签**：`UML` `图表` `画布` `AST` `代码分析` `可视化`

## 📋 功能概述

右键代码文件弹出菜单，在世界画布上绘制 UML 图表，支持缩放和交互，通过 AI 将代码内容转换为中文 UML 标签。

## 🎯 核心功能

- **代码解析**：分析 TypeScript、JavaScript、Python 等代码结构
- **UML 生成**：生成类图、时序图、依赖图
- **世界画布**：支持无限缩放、拖拽的交互式画布
- **AI 标注**：使用 AI 将英文标识符转换为中文标签
- **多格式导出**：支持导出为 PNG、SVG、PDF

## 📁 目录结构

```
src/features/uml-canvas/
├── UMLCanvasModule.ts              # 模块入口
├── app/                            # 应用层
│   ├── usecases/
│   │   ├── GenerateUMLUseCase.ts   # UML 生成用例
│   │   ├── ParseCodeUseCase.ts     # 代码解析用例
│   │   └── ExportDiagramUseCase.ts # 导出用例
│   └── services/                   # 应用服务
├── domain/                         # 领域层
│   ├── entities/
│   │   ├── UMLGraph.ts             # UML 图实体
│   │   ├── CodeElement.ts          # 代码元素实体
│   │   └── DiagramLayout.ts        # 布局实体
│   └── ports/                      # 端口接口
│       ├── ICodeParser.ts          # 代码解析器接口
│       ├── ILayoutEngine.ts        # 布局引擎接口
│       └── IDiagramRenderer.ts     # 渲染器接口
├── infra/                          # 基础设施层
│   ├── parsers/                    # 解析器实现
│   │   ├── TypeScriptParser.ts     # TS 解析器
│   │   ├── PythonParser.ts         # Python 解析器
│   │   └── JavaScriptParser.ts     # JS 解析器
│   ├── layout/                     # 布局算法
│   │   ├── HierarchicalLayout.ts   # 层次布局
│   │   ├── ForceLayout.ts          # 力导向布局
│   │   └── GridLayout.ts           # 网格布局
│   └── renderers/                  # 渲染实现
├── panel/                          # Webview 面板
│   ├── UMLCanvasPanel.ts           # 面板管理器
│   └── messaging/                  # 前后端通信
└── webview/                        # 前端资源
    ├── src/                        # 前端源码
    │   ├── canvas/                 # 画布组件
    │   ├── diagrams/               # 图表组件
    │   └── utils/                  # 工具函数
    ├── dist/                       # 构建输出
    └── package.json                # 前端依赖
```

## 🚀 主要入口文件

- **模块激活**：`UMLCanvasModule.ts`
- **UML 生成**：`app/usecases/GenerateUMLUseCase.ts`
- **面板管理**：`panel/UMLCanvasPanel.ts`
- **代码解析**：`infra/parsers/TypeScriptParser.ts`

## 🔧 变更入口（常改文件）

- `app/usecases/GenerateUMLUseCase.ts` - UML 生成逻辑
- `infra/parsers/*.ts` - 代码解析实现
- `panel/UMLCanvasPanel.ts` - Webview 通信
- `webview/src/canvas/` - 前端画布实现
- `@core/ai/PromptProfiles.ts` - UML 生成提示模板

## 🚫 模块边界约束

- **禁止**直接 import `explorer-alias/*`（跨模块访问请通过 `@core` 或 `@shared`）
- **禁止**直接操作 DOM（在 Webview 中进行）
- **禁止**直接调用 OpenAI API（请通过 `@core/ai/OpenAIClient`）
- **禁止**在后端进行图形渲染（渲染在 Webview 前端完成）

## 📝 开发注意事项

1. 代码解析结果要转换为统一的 IR（中间表示）
2. 使用 `uml-generation` 和 `code-comment-translation` 提示配置
3. 缓存键必须包含模块 ID：`uml-canvas`
4. Webview 与扩展后端通过消息通信
5. 前端使用 D3.js 或 vis.js 进行图表渲染
6. 支持增量更新和实时预览