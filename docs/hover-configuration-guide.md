# AI Explorer - 智能Hover配置指南

## 🎯 hover模式配置

AI Explorer现在支持三种hover模式，让您完全控制AI分析的触发时机。

### 📋 配置选项

在VS Code设置中搜索`aiExplorer.hoverMode`，或直接在`settings.json`中配置：

```json
{
    "aiExplorer.hoverMode": "manual"  // 推荐设置
}
```

### 🎛️ 三种模式详解

#### 1. 手动模式 (manual) - 推荐 ⭐
```json
"aiExplorer.hoverMode": "manual"
```
- **行为**: hover文件时仅检查已缓存的分析结果
- **优点**: 
  - 完全避免意外的AI请求
  - 保护您的API配额
  - 用户主动控制分析时机
- **操作**: 
  - 如果有缓存结果，立即显示完整分析
  - 如果无缓存，显示"🎯 点击进行智能分析"按钮
  - 点击按钮或右键选择"刷新AI分析"触发分析

#### 2. 自动模式 (auto) - 兼容旧版本
```json
"aiExplorer.hoverMode": "auto"
```
- **行为**: hover文件时自动触发AI分析（原有行为）
- **适用**: 希望保持旧版本自动分析行为的用户
- **注意**: 可能产生较多AI请求，请注意API使用量

#### 3. 禁用模式 (disabled) - 纯净模式
```json
"aiExplorer.hoverMode": "disabled"
```
- **行为**: hover时不显示任何AI分析相关内容
- **适用**: 只需要基础文件信息的用户

### 🛠️ 手动触发分析的方法

当使用手动模式时，您有多种方式触发AI分析：

1. **Hover按钮**: hover文件时点击"🎯 点击进行智能分析"
2. **右键菜单**: 右键文件选择"刷新AI分析"
3. **命令面板**: `Ctrl+Shift+P` → 搜索"AI Explorer: 刷新分析"

### ⚡ 智能缓存机制

无论使用哪种模式，AI Explorer都会：
- ✅ 优先显示已缓存的分析结果
- ✅ 避免5分钟内重复分析同一文件
- ✅ 文件变更时智能标记缓存为过期状态

### 🔧 其他相关配置

```json
{
    // Hover模式 - 核心配置
    "aiExplorer.hoverMode": "manual",
    
    // 文件变更通知
    "aiExplorer.showFileChangeNotifications": true,
    
    // 自动刷新（建议关闭）
    "aiExplorer.autoRefreshOnFileChange": false
}
```

### 💡 最佳实践建议

1. **推荐配置**: 使用`manual`模式 + 禁用自动刷新
2. **工作流程**: 
   - 开发时正常hover查看缓存结果
   - 需要新分析时主动点击按钮
   - 文件修改后根据提示选择是否刷新

3. **API配额保护**: 
   - 手动模式可完全避免意外消耗
   - 5分钟冷却机制防止频繁请求
   - 缓存优先策略减少重复分析

### 🎉 升级效果

升级到新的hover机制后，您将享受：
- 🛡️ **完全控制**: 决定何时使用AI分析
- ⚡ **更快响应**: 缓存结果立即显示
- 💰 **配额保护**: 避免意外的API消耗
- 🎯 **精准分析**: 仅在需要时才触发AI

---

**提示**: 如果您之前遇到429错误或API请求过多的问题，建议立即切换到`manual`模式，享受更好的使用体验！