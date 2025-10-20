# 架构整合任务清单（Integration Roadmap）

## 📊 当前状态评估

### ✅ 已完成（新架构模块）
- [x] `core/runtimeStyle.js` (176 行) - CSP-safe 动态样式管理
- [x] `core/messageHub.js` (283 行) - 统一消息桥接
- [x] `core/layoutEngine.js` (422 行) - ELK 布局引擎（ES6）
- [x] `core/renderer.js` (317 行) - 批量 DOM 操作
- [x] `components/Breadcrumb.js` (82 行) - 面包屑导航
- [x] `components/CardLayer.js` (254 行) - 卡片层管理
- [x] `interactions/DragManager.js` (196 行) - 拖拽交互
- [x] `interactions/ZoomPan.js` (308 行) - 缩放平移
- [x] `graphView-slim.js` (350 行) - 编排层（瘦身版）

### ⚠️ 待整合（旧代码）
- [ ] `graphView.js` (1886 行) - **当前运行版本**（被 BlueprintPanel.ts 引用）
- [ ] `modules/blueprintCard.js` - 旧卡片系统（有 inline style）
- [ ] `modules/analysisCard.js` - AI 分析卡片
- [ ] `SmokeProbe.js` - 冒烟测试（有 inline style）
- [ ] `DebugBanner.js` - 调试横幅（有 inline style）
- [ ] `modules/layoutEngine.js` - 旧布局引擎（UMD 格式）

---

## 🎯 整合策略（分阶段执行）

### **Phase 1: 后端持久化实现** ⚡ (M4 优先)
**目标**: 实现位置和备注的持久化存储，这是用户最关心的功能。

#### 1.1 创建位置存储服务
- [ ] `src/features/filetree-blueprint/storage/PositionsStore.ts`
  - 存储路径: `<workspace>/.ai-explorer-cache/ui/positions.json`
  - 方法: `getAll()`, `set(file, x, y, posClass)`, `clear()`

#### 1.2 创建备注存储服务
- [ ] `src/features/filetree-blueprint/storage/NotesStore.ts`
  - 存储路径: `<workspace>/.ai-explorer-cache/notes/<featureId>/<relpath>.md`
  - 方法: `read(file)`, `write(file, content)`, `delete(file)`

#### 1.3 扩展端消息处理
- [ ] 在 `BlueprintPanel.ts` 添加消息处理:
  ```typescript
  case 'card-moved':
    await positionsStore.set(msg.payload);
    break;
  case 'save-notes':
    await notesStore.write(msg.payload.path, msg.payload.notes);
    break;
  case 'load-notes':
    const notes = await notesStore.read(msg.payload.path);
    panel.postMessage({ type: 'notes-loaded', payload: { path, notes }});
    break;
  ```

#### 1.4 初始化时回传位置
- [ ] 在 `sendGraphData()` 后发送位置数据:
  ```typescript
  const positions = await positionsStore.getAll();
  panel.postMessage({ type: 'ui/positions', payload: positions });
  ```

**验收标准**:
- ✅ 拖拽卡片后 `positions.json` 文件更新
- ✅ 关闭面板重开后位置恢复
- ✅ 备注编辑后保存到 `.md` 文件

---

### **Phase 2: 切换到新架构** 🔄 (逐步迁移)

#### 2.1 更新 HTML 引用（BlueprintPanel.ts）
- [ ] 将 `graphView.js` 替换为 `graphView-slim.js`
- [ ] 添加新模块的 `<script type="module">` 引用:
  ```html
  <script type="module" nonce="${nonce}" src="${graphViewSlimUri}"></script>
  ```
- [ ] 移除旧模块引用（暂时保留，作为回退方案）

#### 2.2 创建迁移开关（Feature Flag）
- [ ] 添加配置项 `ai-explorer.useNewArchitecture` (默认 false)
- [ ] 根据配置选择加载 `graphView.js` 或 `graphView-slim.js`
- [ ] 便于快速回退

#### 2.3 验证新架构功能
- [ ] 测试图渲染
- [ ] 测试节点点击/双击
- [ ] 测试布局计算
- [ ] 测试拖拽/缩放

**验收标准**:
- ✅ 新架构能正常渲染图
- ✅ 所有交互功能正常
- ✅ 无 CSP 报错
- ✅ 可以通过配置项回退到旧版本

---

### **Phase 3: 清理旧代码 CSP 违规** 🧹 (M2)

#### 3.1 清理 blueprintCard.js
- [ ] `renderTabContent()` - 移除 inline style，改用 class
- [ ] `renderOverview()` - 移除 inline style，改用 class
- [ ] `renderAIAnalysis()` - 移除 inline style，改用 class
- [ ] 将样式移到 `styles/bp.css`

#### 3.2 清理 SmokeProbe.js
- [ ] 移除所有 `el.style.xxx` 写法
- [ ] 改用预定义 class（如 `.smoke-probe`, `.smoke-ok`, `.smoke-fail`）
- [ ] 更新 `index.css` 添加样式

#### 3.3 清理 DebugBanner.js
- [ ] 移除 inline style
- [ ] 改用 class 控制显示/隐藏
- [ ] 更新 `index.css` 添加样式

#### 3.4 更新 HTML nonce
- [ ] 确保所有 `<link>` 和 `<script>` 都有 `nonce="${nonce}"`
- [ ] 移除任何 inline `style=""` 属性

**验收标准**:
- ✅ 控制台无 `Refused to apply inline style` 错误
- ✅ 卡片、冒烟测试、调试横幅样式正常

---

### **Phase 4: 增强功能** 🚀 (M7 Feature 过滤)

#### 4.1 支持 Feature 模式渲染
- [ ] 添加 `featureSpec` 参数到 `renderGraph()`
- [ ] 实现子图过滤逻辑:
  ```typescript
  function filterGraphByFeature(graph, featureSpec) {
    const relevantFiles = new Set(featureSpec.files);
    return {
      nodes: graph.nodes.filter(n => relevantFiles.has(n.id)),
      edges: graph.edges.filter(e => 
        relevantFiles.has(e.from) && relevantFiles.has(e.to)
      )
    };
  }
  ```
- [ ] 面包屑显示 "Feature: xxx (N files)"

#### 4.2 添加 Feature 选择 UI
- [ ] 在侧边栏添加 Feature 选择器
- [ ] 支持从文件清单导入
- [ ] 支持保存 Feature 配置

**验收标准**:
- ✅ 传入文件清单只渲染相关文件
- ✅ 面包屑显示 Feature 信息
- ✅ 可以切换不同 Feature 视图

---

### **Phase 5: 性能优化** ⚡ (M8 打包)

#### 5.1 打包 Webview 代码
- [ ] 创建 `scripts/bundle-webview.js`
- [ ] 使用 esbuild 打包所有模块到 `bundle.js`
- [ ] 包含本地 elk.js
- [ ] 生成 source map

#### 5.2 更新加载方式
- [ ] HTML 只引用一个 `bundle.js`
- [ ] 添加 `nonce` 到打包脚本
- [ ] 移除 CDN 依赖

#### 5.3 性能监控
- [ ] 添加首帧时间埋点
- [ ] 添加布局计算时间埋点
- [ ] 优化大图渲染（虚拟滚动）

**验收标准**:
- ✅ 首帧时间 < 1s
- ✅ 无 CDN 请求
- ✅ Bundle 大小 < 500KB

---

## 📋 执行顺序（按优先级）

1. **Phase 1** (M4 持久化) - 2-3 小时
2. **Phase 2** (切换新架构) - 1-2 小时
3. **Phase 3** (清理 CSP) - 2-3 小时
4. **Phase 4** (Feature 过滤) - 3-4 小时
5. **Phase 5** (打包优化) - 2-3 小时

**总计**: 10-15 小时（可分多天完成）

---

## 🔧 技术债清单

- [ ] 删除旧的 `graphView.js`（1886 行）
- [ ] 删除旧的 `modules/layoutEngine.js`（UMD 版本）
- [ ] 统一日志格式（所有模块使用 `[ModuleName]` 前缀）
- [ ] 添加 TypeScript 类型定义（`.d.ts` 文件）
- [ ] 编写单元测试（至少覆盖核心模块）

---

## 📚 参考资料

- 朋友建议: M2→M3→M4→M5→M6→M7→M8
- 已完成架构: 8 个模块（2,038 行）
- 瘦身效果: 1,886 行 → 350 行（-81%）
- CSP 政策: [VSCode Webview CSP](https://code.visualstudio.com/api/extension-guides/webview#content-security-policy)
