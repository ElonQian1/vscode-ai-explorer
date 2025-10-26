# 🚨 修复AI请求泛滥问题

## 问题描述

用户报告插件产生大量不必要的AI请求，导致：
- OpenAI API返回 429 Too Many Requests 错误
- 消耗大量API配额和费用
- 用户体验差

## 根本原因

1. **文件hover触发AI分析** - `HoverInfoService.getTooltip()` 每次都会触发AI分析
2. **文件变更自动分析** - 文件变更监听器会自动调用AI分析刷新
3. **缺乏节流机制** - 没有防止频繁请求的保护

## 修复方案

### 1. 🛡️ HoverInfoService 防护机制

**文件**: `src/features/explorer-alias/ui/HoverInfoService.ts`

- ✅ 添加 `AI_ANALYSIS_COOLDOWN` (5分钟冷却时间)
- ✅ 添加 `shouldTriggerAIAnalysis()` 判断逻辑
- ✅ 添加 `recentAnalyzes` 记录避免重复分析
- ✅ 仅在没有LLM结果时才触发AI分析

### 2. 📝 文件变更智能处理

**文件**: `src/features/explorer-alias/ExplorerAliasModule.ts`

**之前**: 文件变更 → 自动AI分析
**现在**: 文件变更 → 标记过期 → 用户选择刷新

核心改进：
- ✅ `markAnalysisAsStale()` - 标记分析过期而不删除
- ✅ `showFileChangedNotification()` - 显示用户友好的提示
- ✅ `handleRefreshAnalysis()` - 用户主动刷新命令

### 3. 🎯 用户控制机制

**新增配置项** (`package.json`):
```json
{
  "aiExplorer.showFileChangeNotifications": {
    "default": false,
    "description": "文件修改后是否显示提示通知"
  },
  "aiExplorer.autoRefreshOnFileChange": {
    "default": false, 
    "description": "文件修改后是否自动刷新分析（不推荐）"
  }
}
```

**新增右键菜单**:
- ♻️ "刷新AI分析（文件已修改）"

### 4. 🎨 用户体验改进

**工具提示改进**:
- 文件过期时显示 "⚠️ 文件已修改，分析结果可能过期"
- 提示用户使用右键菜单刷新分析

**通知选项**:
- 🔄 立即刷新
- ⚙️ 设置 
- ❌ 忽略

## 工作流程对比

### 修复前 ❌
```
用户hover文件 → 总是触发AI分析
文件保存 → 自动AI分析  
用户快速移动鼠标 → 大量AI请求 → 429错误
```

### 修复后 ✅
```
用户hover文件 → 检查冷却时间 → 仅必要时分析
文件保存 → 标记过期 → 显示提示 → 用户选择
提供手动刷新命令 → 用户完全控制
```

## 测试验证

1. **Hover测试**:
   - 快速hover多个文件，观察是否有大量AI请求
   - 检查5分钟冷却是否生效

2. **文件变更测试**:
   - 编辑并保存文件
   - 检查是否只显示提示而不自动分析
   - 使用右键菜单手动刷新

3. **配置测试**:
   - 测试通知开关
   - 测试自动刷新开关（谨慎启用）

## 配置建议

**推荐设置**:
```json
{
  "aiExplorer.showFileChangeNotifications": false,  // 避免干扰
  "aiExplorer.autoRefreshOnFileChange": false       // 防止API泛滥
}
```

**进阶用户**:
```json
{
  "aiExplorer.showFileChangeNotifications": true   // 接收提示
}
```

## 安全措施

1. ✅ **冷却时间** - 5分钟内同一文件不重复分析
2. ✅ **用户控制** - 所有AI请求都需要用户确认或主动触发  
3. ✅ **智能判断** - 已有LLM结果时不触发新分析
4. ✅ **配置灵活** - 用户可自定义行为
5. ✅ **渐进体验** - 先显示静态分析，AI完成后更新

## 注意事项

- 默认配置非常保守，避免意外的AI请求
- 用户可以通过配置启用自动功能（自担风险）
- 保持了原有功能，只是改为用户主动触发
- 过期提示不会丢失数据，只是标记需要更新

这个修复确保了用户对AI请求的完全控制权，同时保持了良好的用户体验。