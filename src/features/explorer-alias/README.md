# 模块：AI 资源管理器（中文别名）

**搜索标签**：`别名` `资源管理器` `TreeView` `translate` `cache`

## 📋 功能概述

在 Explorer 侧边栏中增加一个自定义视图："AI 资源管理器"，镜像工作区目录结构，为每个文件和文件夹生成中文别名，不改动真实文件名。

## 🎯 核心功能

- **双栏镜像**：在侧边栏显示与原资源管理器相同的目录结构
- **AI 翻译**：使用 AI 自动将英文文件名翻译为中文别名
- **智能缓存**：缓存翻译结果，避免重复调用 AI 服务
- **可选回写**：支持将中文别名写回真实文件名（默认关闭）
- **批量操作**：支持批量翻译和刷新

## 📁 目录结构

```
src/features/explorer-alias/
├── ExplorerAliasModule.ts          # 模块入口
├── ui/                             # UI 层
│   ├── AIExplorerProvider.ts       # 树视图数据提供者
│   ├── ExplorerTreeItem.ts         # 树节点定义
│   └── commands/                   # 命令处理器
├── app/                            # 应用层（用例）
│   ├── usecases/                   
│   │   ├── TranslateBatchUseCase.ts    # 批量翻译用例
│   │   ├── RefreshTreeUseCase.ts       # 刷新树用例
│   │   └── ToggleAliasUseCase.ts       # 切换显示用例
│   └── services/                   # 应用服务
├── domain/                         # 领域层
│   ├── entities/                   # 实体
│   │   ├── FileTreeNode.ts         # 文件树节点实体
│   │   └── AliasMapping.ts         # 别名映射实体
│   └── ports/                      # 端口（接口）
│       ├── ITranslationService.ts  # 翻译服务接口
│       └── IAliasRepository.ts     # 别名存储接口
└── infra/                          # 基础设施层
    ├── translators/                # 翻译器实现
    │   ├── OpenAITranslator.ts     # OpenAI 翻译器
    │   └── CachedTranslator.ts     # 带缓存的翻译器
    └── repositories/               # 存储实现
        └── VSCodeAliasRepository.ts # VS Code 存储实现
```

## 🚀 主要入口文件

- **模块激活**：`ExplorerAliasModule.ts`
- **UI 提供者**：`ui/AIExplorerProvider.ts`
- **翻译用例**：`app/usecases/TranslateBatchUseCase.ts`

## 🔧 变更入口（常改文件）

- `app/usecases/TranslateBatchUseCase.ts` - 翻译逻辑
- `infra/translators/OpenAITranslator.ts` - AI 调用实现
- `ui/AIExplorerProvider.ts` - 树视图逻辑
- `@core/ai/PromptProfiles.ts` - 翻译提示模板

## 🚫 模块边界约束

- **禁止**直接 import `uml-canvas/*`（跨模块访问请通过 `@core` 或 `@shared`）
- **禁止**直接操作文件系统（请通过 VS Code API）
- **禁止**直接调用 OpenAI API（请通过 `@core/ai/OpenAIClient`）

## 📝 开发注意事项

1. 所有 AI 调用都必须通过 Core 层的 `OpenAIClient`
2. 使用 `file-translation` 提示配置进行翻译
3. 缓存键必须包含模块 ID：`explorer-alias`
4. UI 层只负责展示，业务逻辑放在 app 层
5. 遵循洋葱架构，依赖方向：UI → App → Domain ← Infra