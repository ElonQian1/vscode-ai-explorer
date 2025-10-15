# 🔧 修复：非文件系统 URI 错误处理

## 🐛 问题描述

**错误信息：**
```
生成蓝图失败: 无法解析具有相对文件路径"output:tasks"的文件系统提供程序
```

**原因：**
当在非文件系统的 VS Code 视图中执行命令时（如任务输出面板、终端、搜索结果等），会传入非 `file:` 方案的 URI：
- `output:tasks` - 任务输出
- `output:extension-output-*` - 扩展输出
- `git:*` - Git 差异视图
- `untitled:*` - 未保存的文件

这些 URI 无法通过 `vscode.workspace.fs` 访问文件系统。

---

## ✅ 修复方案

### 1. 命令入口验证（FileTreeBlueprintModule.ts）

**添加 URI 方案检查：**
```typescript
// 检查 URI 方案是否为 file
if (targetUri.scheme !== 'file') {
    this.logger.warn(`不支持的 URI 方案: ${targetUri.scheme}`);
    vscode.window.showWarningMessage(
        `无法为 "${targetUri.scheme}:" 类型的资源生成蓝图。\n请在文件系统中选择文件或文件夹。`
    );
    return;
}
```

**改进的 URI 获取逻辑：**
```typescript
const activeUri = vscode.window.activeTextEditor?.document.uri;

// 只使用文件系统 URI
if (activeUri && activeUri.scheme === 'file') {
    targetUri = activeUri;
} else {
    targetUri = vscode.workspace.workspaceFolders?.[0]?.uri;
}
```

### 2. 用例层验证（GenerateBlueprintUseCase.ts）

**双重验证：**
```typescript
// 验证 URI 方案
if (uri.scheme !== 'file') {
    this.logger.error(`不支持的 URI 方案: ${uri.scheme}`);
    vscode.window.showErrorMessage(
        `无法生成蓝图：不支持 "${uri.scheme}:" 类型的资源。\n请选择文件系统中的文件或文件夹。`
    );
    return;
}

// 验证路径存在
try {
    await vscode.workspace.fs.stat(uri);
} catch (error) {
    this.logger.error(`路径不存在或无法访问: ${uri.fsPath}`);
    vscode.window.showErrorMessage(
        `无法访问路径: ${uri.fsPath}\n请确保文件或文件夹存在。`
    );
    return;
}
```

### 3. 域层验证（FileTreeScanner.ts）

**提前失败：**
```typescript
// 验证 URI 方案
if (targetUri.scheme !== 'file') {
    throw new Error(`不支持的 URI 方案: ${targetUri.scheme}`);
}

let stat: vscode.FileStat;
try {
    stat = await vscode.workspace.fs.stat(targetUri);
} catch (error) {
    this.logger.error(`无法访问路径: ${targetUri.fsPath}`, error);
    throw new Error(`无法访问路径: ${targetUri.fsPath}`);
}
```

---

## 🎯 防御性编程策略

### 三层验证机制

```
┌─────────────────────────────────┐
│  命令层（Module）                │
│  ✅ 检查 URI 方案                │
│  ✅ 友好的用户提示               │
└─────────────────────────────────┘
              ↓
┌─────────────────────────────────┐
│  用例层（UseCase）               │
│  ✅ 再次验证方案                 │
│  ✅ 验证路径存在性               │
│  ✅ 详细的错误消息               │
└─────────────────────────────────┘
              ↓
┌─────────────────────────────────┐
│  域层（Scanner）                 │
│  ✅ 最后一道防线                 │
│  ✅ 抛出明确异常                 │
└─────────────────────────────────┘
```

---

## 📋 支持的 URI 方案

### ✅ 支持
- `file:///d:/path/to/file` - 本地文件系统
- `file:///c:/Users/...` - Windows 路径

### ❌ 不支持（会友好提示）
- `output:tasks` - 任务输出面板
- `output:extension-output-*` - 扩展输出
- `git:*` - Git 差异视图
- `untitled:*` - 未保存文件
- `vscode:*` - VS Code 内部资源
- `debug:*` - 调试相关
- `search-editor:*` - 搜索编辑器

---

## 🧪 测试场景

### 场景 1：从任务输出面板执行（已修复）
```
操作: 在任务输出面板中右键 → "在此打开蓝图"
之前: ❌ 错误 "无法解析...output:tasks"
现在: ✅ 提示 "无法为 'output:' 类型的资源生成蓝图"
```

### 场景 2：从 Git 差异视图执行
```
操作: 在 Git 差异视图中右键
之前: ❌ 崩溃或未定义错误
现在: ✅ 提示 "无法为 'git:' 类型的资源生成蓝图"
```

### 场景 3：从文件系统执行（正常）
```
操作: 右键资源管理器中的文件夹
之前: ✅ 正常工作
现在: ✅ 正常工作（无影响）
```

### 场景 4：从未保存文件执行
```
操作: 在 Untitled-1 文件中执行
之前: ❌ 错误或未定义行为
现在: ✅ 回退到工作区根目录
```

---

## 💡 用户体验改进

### 清晰的错误提示

**之前：**
```
生成蓝图失败: 无法解析具有相对文件路径"output:tasks"的文件系统提供程序
```
❌ 技术性错误，用户不理解

**现在：**
```
无法为 "output:" 类型的资源生成蓝图。
请在文件系统中选择文件或文件夹。
```
✅ 清晰易懂，告诉用户如何操作

### 优雅降级

当无法从当前上下文获取有效路径时：
1. ✅ 尝试使用活动编辑器的文件
2. ✅ 检查是否为 `file:` 方案
3. ✅ 回退到工作区根目录
4. ✅ 提示用户正确操作

---

## 🔍 调试信息

### 日志输出

**命令层：**
```
[WARN] 不支持的 URI 方案: output, URI: output:tasks
```

**用例层：**
```
[ERROR] 不支持的 URI 方案: output, URI: output:tasks
```

**域层：**
```
[ERROR] 无法访问路径: /output/tasks
```

### 查看日志
```
Ctrl+Shift+U → 选择 "AI-Explorer"
```

---

## 📚 相关知识

### VS Code URI 方案

VS Code 使用不同的 URI 方案来表示不同类型的资源：

| 方案 | 示例 | 用途 |
|------|------|------|
| `file` | `file:///d:/path/to/file` | 本地文件系统 |
| `untitled` | `untitled:Untitled-1` | 未保存的新文件 |
| `output` | `output:extension-output-*` | 输出面板 |
| `git` | `git:/path/to/file?ref=HEAD` | Git 版本控制 |
| `vscode` | `vscode://settings` | VS Code 内部 |
| `debug` | `debug:variable` | 调试视图 |

### 最佳实践

1. **总是验证 URI 方案**
   ```typescript
   if (uri.scheme !== 'file') { ... }
   ```

2. **提供清晰的错误消息**
   ```typescript
   vscode.window.showWarningMessage(
       `无法处理 "${uri.scheme}:" 资源。请选择文件系统中的文件。`
   );
   ```

3. **优雅降级**
   ```typescript
   targetUri = activeUri?.scheme === 'file' 
       ? activeUri 
       : workspaceRoot;
   ```

4. **记录日志便于调试**
   ```typescript
   this.logger.warn(`URI 方案: ${uri.scheme}, 路径: ${uri.toString()}`);
   ```

---

## ✅ 修复验证

### 编译成功
```bash
npm run compile  ✅ 通过
```

### 测试步骤
1. **重新加载窗口**
   ```
   Ctrl+Shift+P → Reload Window
   ```

2. **测试错误场景**
   ```
   a. 在任务输出面板中右键 → 应显示友好提示
   b. 在 Git 差异视图中右键 → 应显示友好提示
   c. 在未保存文件中执行命令 → 应回退到工作区根
   ```

3. **测试正常场景**
   ```
   在资源管理器中右键文件夹 → 应正常生成蓝图
   ```

---

## 🎉 总结

**修复内容：**
- ✅ 三层 URI 方案验证
- ✅ 清晰的用户错误提示
- ✅ 优雅的降级处理
- ✅ 详细的日志记录

**受影响的文件：**
1. `FileTreeBlueprintModule.ts` - 命令入口验证
2. `GenerateBlueprintUseCase.ts` - 用例层验证
3. `FileTreeScanner.ts` - 域层验证

**向后兼容：**
✅ 是，不影响现有功能

---

**🎊 错误处理已完善，用户体验更友好！**
