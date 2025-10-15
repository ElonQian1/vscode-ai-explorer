# 📁 FileTree Blueprint - 文件树蓝图模块

## 功能概述

将 VS Code 工作区的文件树自动转换为可交互的可视化蓝图。

## 核心特性

- ✅ **一键扫描工作区**：自动生成完整的文件树结构
- 🎨 **可视化画布**：支持拖拽、缩放、平移
- 📂 **双击下钻**：双击文件夹可进入子层级视图
- 🔙 **层级导航**：随时返回上一层或根目录
- 🎯 **右键入口**：从资源管理器右键任意文件/文件夹打开蓝图
- 📊 **JSON 导入**：支持打开自定义架构 JSON 文件

## 使用方式

### 1. 从资源管理器右键打开
右键点击任意文件或文件夹 → **"在此打开蓝图"**

### 2. 从命令面板
- `Ctrl+Shift+P` → `生成文件树蓝图`
- `Ctrl+Shift+P` → `打开工作流图`（从 JSON/MD 文件）

### 3. 从 AI 资源管理器
点击树视图中的任意节点即可打开对应的蓝图视图

## 技术架构

```
filetree-blueprint/
├── FileTreeBlueprintModule.ts    # 模块入口
├── app/
│   └── usecases/
│       └── GenerateBlueprintUseCase.ts  # 生成蓝图用例
├── domain/
│   └── FileTreeScanner.ts        # 文件树扫描器
└── panel/
    └── BlueprintPanel.ts         # Webview 面板管理
```

## 数据格式

### Graph 结构
```typescript
type Graph = {
  id: string;
  title: string;
  nodes: Node[];
  edges: Edge[];
  metadata?: any;
};
```

### Node 结构
```typescript
type Node = {
  id: string;
  label: string;
  type?: 'folder' | 'file' | 'module';
  position: { x: number; y: number };
  data?: Record<string, any>;
};
```

## 依赖

- `@core/logging` - 日志服务
- VS Code Webview API
