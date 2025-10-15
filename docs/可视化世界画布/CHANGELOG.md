# 🔖 蓝图视图更新日志

## [0.1.0] - 2025-10-16

### ✨ 新增功能

#### 🎯 完整的用户引导系统
1. **帮助浮层** - 首次打开自动显示，包含所有快捷键说明
   - ? 键或 Shift+/ 快速打开/关闭
   - Esc 键关闭
   - "不再显示"选项，localStorage 记忆偏好
   - 工具栏 ❓ 按钮随时可访问

2. **状态栏 15 秒提示** - 简洁的操作速查
   - 显示文案：`空格+拖拽=平移 · 滚轮=缩放 · 双击文件夹=下钻 · ?=帮助`
   - 鼠标悬停显示详细 tooltip（包含防抖动说明）
   - 点击可打开完整帮助
   - 15 秒后自动隐藏，不打扰用户
   - 可通过配置关闭

3. **命令面板集成**
   - `蓝图：打开帮助与快捷键` - 在任何时候访问帮助
   - `蓝图：开关状态栏提示` - 快速切换提示显示

4. **配置项**
   - `filetreeBlueprint.showStatusBarHint` - 控制状态栏提示（默认：true）
   - `filetreeBlueprint.autoShowHelpFirstTime` - 控制首次自动显示帮助（默认：true）

5. **版本更新通知** - What's New 提示
   - 版本升级后自动显示更新摘要
   - 可查看详细更新文档
   - 首次安装不显示（避免打扰新用户）

#### 🛡️ 防抖动优化（技术改进）

**问题现象**：鼠标悬停在节点上时，节点不断抖动位移

**根本原因**：
- 渲染循环中的浮点坐标累积误差
- SVG transform + scale 导致的子像素渲染
- 缺少 GPU 合成层隔离

**解决方案**：
1. **坐标取整** - `Math.round()` 处理所有 x/y 坐标
2. **rAF 节流** - `requestAnimationFrame` 限制边线重绘频率（60fps）
3. **GPU 加速** - `will-change: left, top` + `transform: translateZ(0)`
4. **禁用过渡** - `transition: none !important` 避免意外动画
5. **悬停优化** - 仅改变颜色，不改变尺寸

**技术细节**：
```javascript
// 渲染一次性创建节点（不在每次更新中重建）
function renderNodesOnce(nodes) {
    nodes.forEach(node => {
        const div = document.createElement('div');
        div.style.left = Math.round(node.x) + 'px';  // ← 取整
        div.style.top = Math.round(node.y) + 'px';   // ← 取整
        // ...
    });
}

// rAF 节流的边线重绘
let rafId = null;
function scheduleDrawEdges() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
        drawEdges();
        rafId = null;
    });
}
```

```css
/* GPU 合成层提升 */
.node {
    will-change: left, top;
    transform: translateZ(0);
    transition: none !important;
}

/* 悬停仅改变颜色 */
.node:hover {
    background: #e0e7ff;
    border-color: #818cf8;
    /* 不改变 width/height/transform */
}
```

#### 🎨 视觉优化
- 恢复渐变背景：`linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)`
- 拖拽光标反馈：
  - 普通模式：`cursor: default`
  - 空格按下：`cursor: grab`
  - 拖拽中：`cursor: grabbing`

### 📊 完整功能对比

| 功能点 | 第一阶段 | 第二阶段 | 第三阶段 |
|-------|---------|---------|---------|
| 防抖动优化 | ✅ | ✅ | ✅ |
| 帮助浮层 | ✅ | ✅ | ✅ |
| ? 键快捷键 | ✅ | ✅ | ✅ |
| ❓ 工具栏按钮 | ✅ | ✅ | ✅ |
| localStorage 记忆 | ✅ | ✅ | ✅ |
| 状态栏 15 秒提示 | - | ✅ | ✅ |
| 配置项 | - | ✅ | ✅ |
| 命令面板命令 | - | ✅ | ✅ |
| **版本更新通知** | - | - | ✅ 新增 |
| 背景渐变 | ✅ | ✅ | ✅ |
| 光标反馈 | ✅ | ✅ | ✅ |

### 🎓 用户学习曲线设计

遵循**渐进式提示**原则，从强到弱：

```
首次使用
  ↓
[帮助浮层自动弹出] 
  ← 最明显，但可关闭
  ↓
[状态栏 15 秒提示] 
  ← 简洁速查，自动消失
  ↓
[工具栏 ❓ 按钮] 
  ← 随时可见，主动访问
  ↓
[命令面板命令] 
  ← 功能发现，高级用户
  ↓
[配置项自定义] 
  ← 企业定制，完全控制
```

### 🔧 技术实施

**文件变更统计**：
- 新增文件：2 个
  - `docs/可视化世界画布/第二阶段完成-配置化增强.md`
  - `docs/可视化世界画布/CHANGELOG.md`
- 修改文件：5 个
  - `package.json` - 新增 2 个命令、2 个配置项
  - `FileTreeBlueprintModule.ts` - 新增版本检查逻辑
  - `BlueprintPanel.ts` - 新增状态栏提示、openHelp 方法
  - `graphView.js` - 完整重写渲染逻辑、新增帮助浮层
  - `index.css` - 完整重写样式、新增防抖动优化

**代码行数变化**：
- `graphView.js`: 463 → 525 行 (+62)
- `index.css`: 225 → 233 行 (+8)
- `BlueprintPanel.ts`: 376 → 416 行 (+40)
- `FileTreeBlueprintModule.ts`: 132 → 210 行 (+78)

### 📚 参考文档

- [防抖动技术分析](./鼠标指向抖动问题.md)
- [用户提示方案设计](./缩放方法改变的提示.md)
- [第二阶段完成报告](./第二阶段完成-配置化增强.md)

---

## [未来计划]

### 🚀 第四阶段（可选增强）

- [ ] **右键菜单增强**
  - 空白处右键 → "返回上一层"
  - 空白处右键 → "帮助"
  - 节点右键 → "在文件管理器中打开"

- [ ] **键盘导航**
  - Tab 键在帮助浮层中切换焦点
  - Enter 键确认/关闭
  - 方向键移动选中节点

- [ ] **工具提示增强**
  - 节点悬停显示完整路径
  - 工具栏按钮详细 tooltip

- [ ] **状态信息显示**
  - 状态栏显示当前缩放比例
  - 状态栏显示节点数量统计

- [ ] **国际化支持**
  - 英文/中文语言切换
  - 基于 VS Code 语言设置

- [ ] **交互式教程**
  - 新手引导模式
  - 分步操作演示

---

## 版本号规范

遵循语义化版本 (Semantic Versioning)：`主版本.次版本.修订号`

- **主版本**：不兼容的 API 修改
- **次版本**：向下兼容的功能新增
- **修订号**：向下兼容的问题修正

当前版本：**0.1.0**（初始发布）
