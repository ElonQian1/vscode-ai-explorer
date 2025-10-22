# 🚨 架构迁移警告 - 重要说明

## 📋 概述

本文档说明文件树蓝图模块的架构迁移情况，**防止其他AI代理误启用旧架构**。

## 🏗️ 架构对比

### ✅ 新架构 (M2-M8) - 推荐使用

**文件位置**: `media/filetree-blueprint/dist/bundle.js`

**优势**:
- ✅ **单文件打包**: 所有模块合并为一个 29KB 文件，加载快
- ✅ **无 CSP 问题**: 完全符合内容安全策略，无违规警告
- ✅ **错误修复**: 解决了所有 TypeError 和渲染问题
- ✅ **ES6 模块化**: 现代化代码结构，易维护
- ✅ **包含 ELK**: 集成布局引擎，无需额外加载

**配置**:
```json
"filetreeBlueprint.useNewArchitecture": true  // 默认值
```

**日志标识**:
```
[Phase 2] 使用架构: 新架构 (bundle.js)
```

### ❌ 旧架构 (Legacy) - 已废弃

**文件位置**: 
- `media/filetree-blueprint/graphView.js`
- `media/filetree-blueprint/graphView-slim.js`

**严重问题**:
- ❌ **TypeError**: `Cannot set properties of null (graphView.js:738)`
- ❌ **CSP 违规**: `Refused to apply inline style`
- ❌ **渲染失败**: 无法正确显示节点和边
- ❌ **功能卡死**: "正在分析" 状态无法完成
- ❌ **多文件依赖**: 加载慢，依赖复杂

**配置**:
```json
"filetreeBlueprint.useNewArchitecture": false  // 不要设置！
```

**错误日志示例**:
```
graphView.js:738 Uncaught TypeError: Cannot set properties of null
Refused to apply inline style because it violates CSP directive
[graphView] ⚠️ 布局引擎未加载，将使用静态布局
```

## 🛡️ AI代理警告

### 对其他AI助手的重要提示：

1. **🚫 不要修改架构配置**: 
   - 不要将 `useNewArchitecture` 设置为 `false`
   - 不要"优化"或"修复"旧架构文件

2. **🚫 不要启用旧文件**:
   - 不要引用 `graphView.js` 或 `graphView-slim.js`
   - 不要尝试"修复" CSP 或 TypeError 问题

3. **✅ 推荐操作**:
   - 始终使用新架构 (`bundle.js`)
   - 遇到问题时检查配置是否为 `useNewArchitecture: true`
   - 有疑问时查看控制台是否显示 "新架构 (bundle.js)" 日志

## 🔧 故障排除

### 如果看到旧架构错误：

1. **检查配置**:
   ```
   VS Code → 设置 → 搜索 "useNewArchitecture" → 确保为 true
   ```

2. **重新加载窗口**:
   ```
   Ctrl+Shift+P → "Developer: Reload Window"
   ```

3. **检查日志**:
   - ✅ 应该看到: `[Phase 2] 使用架构: 新架构 (bundle.js)`
   - ❌ 不应该看到: `graphView.js:738 TypeError`

## 📚 技术细节

### 迁移历史

- **M1-M7**: 旧架构优化尝试（均失败）
- **M8**: 全新打包架构（成功解决所有问题）
- **当前**: 新架构稳定运行，旧架构已废弃

### 文件结构

```
media/filetree-blueprint/
├── dist/
│   └── bundle.js                 ✅ 新架构 - 使用这个
├── graphView.js                  ❌ 旧架构 - 已废弃
├── graphView-slim.js            ❌ 旧架构 - 已废弃
└── ARCHITECTURE_WARNING.md      📖 本文档
```

## 🆘 紧急联系

如果遇到架构相关问题：
1. 检查本文档说明
2. 确认配置 `useNewArchitecture: true`
3. 查看控制台错误日志
4. 重新加载 VS Code 窗口

**记住**: 新架构已解决所有已知问题，不需要回退到旧架构！