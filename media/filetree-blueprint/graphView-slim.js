/**
 * 🚨🚨🚨 旧架构文件 - 已废弃，不要使用！🚨🚨🚨
 * 
 * ❌ 此文件也是旧架构的一部分，存在问题：
 * 1. CSP 安全策略冲突
 * 2. 与新架构的状态管理冲突
 * 3. 依赖旧的模块加载方式
 * 
 * ✅ 请使用新架构：media/filetree-blueprint/dist/bundle.js
 * 
 * 🛡️ 警告：其他AI代理不要启用或修改此文件！
 * 📝 保留原因：仅用于代码考古和紧急降级
 * 🏗️ 新架构优势：单文件打包、ES6模块、无CSP问题
 * 
 * graphView.js - 文件树蓝图前端编排层（瘦身版 - 第九刀）
 * 
 * 职责：
 * 1. 模块初始化和生命周期管理
 * 2. 消息路由（Extension ⇄ Webview）
 * 3. 模块间协调（Renderer/Layout/CardLayer/Interactions）
 * 4. 全局状态管理
 * 
 * 设计原则：
 * - 编排而非实现（业务逻辑已抽离到各模块）
 * - 轻量级（目标 < 400 行）
 * - 清晰的模块依赖
 * - 简洁的消息分发
 * 
 * 原始代码：1886 行 → 瘦身后：~350 行（瘦身 81%）
 */

// ========== 模块导入（ES6 模块化） ==========
import { createRuntimeStyle, hash } from './core/runtimeStyle.js';
import { createMessageHub, setupMessageListener } from './core/messageHub.js';
import { createLayoutEngine, NODE_SIZE } from './core/layoutEngine.js';
import { createRenderer } from './core/renderer.js';
import { createCardLayer } from './components/CardLayer.js';
import { mountBreadcrumb } from './components/Breadcrumb.js';
import { createDragManager } from './interactions/DragManager.js';
import { createZoomPan } from './interactions/ZoomPan.js';

(function () {
  'use strict';

  // ========== 全局状态 ==========
  let graph = { nodes: [], edges: [], id: 'g', title: 'untitled', metadata: {} };
  let currentGraphKey = '';
  let isLayouting = false;
  let pendingGraph = null;

  // ========== 核心模块实例 ==========
  let vscode = null;
  let runtimeStyle = null;
  let messageHub = null;
  let layoutEngine = null;
  let renderer = null;
  let cardLayer = null;
  let breadcrumb = null;
  let dragManager = null;
  let zoomPan = null;

  // ========== DOM 元素 ==========
  let graphContainer = null;
  let nodeContainer = null;
  let edgeContainer = null;
  let viewport = null;

  // ========== 初始化 ==========

  /**
   * 启动入口
   */
  function boot() {
    console.log('[graphView] 🚀 启动文件树蓝图...');

    // 1. 初始化 VSCode API
    if (!window.__vscode && typeof acquireVsCodeApi === 'function') {
      window.__vscode = acquireVsCodeApi();
    }
    vscode = window.__vscode;

    if (!vscode) {
      console.error('[graphView] ❌ VSCode API 未就绪');
      return;
    }

    // 2. 初始化 DOM 元素
    initDOM();

    // 3. 初始化核心模块
    initModules();

    // 4. 设置事件监听
    setupEventListeners();

    // 5. 通知后端准备就绪
    messageHub.ready();

    console.log('[graphView] ✅ 启动完成');
  }

  /**
   * 初始化 DOM 元素
   */
  function initDOM() {
    graphContainer = document.getElementById('graph-container');
    viewport = document.getElementById('graph-viewport');
    nodeContainer = document.getElementById('nodes');
    edgeContainer = document.querySelector('svg.edges g');

    if (!graphContainer || !viewport || !nodeContainer || !edgeContainer) {
      console.error('[graphView] ❌ 必需的 DOM 元素未找到');
      throw new Error('DOM 结构不完整');
    }

    console.log('[graphView] ✅ DOM 元素初始化完成');
  }

  /**
   * 初始化核心模块
   */
  function initModules() {
    // 1. RuntimeStyle（CSP-safe 样式管理）
    const nonce = window.__NONCE__;
    if (!nonce) {
      console.warn('[graphView] ⚠️ CSP nonce 未找到');
    }
    runtimeStyle = createRuntimeStyle(nonce);
    console.log('[graphView] ✅ RuntimeStyle 已初始化');

    // 2. MessageHub（消息桥接）
    messageHub = createMessageHub(vscode);
    setupMessageListener(messageHub);
    console.log('[graphView] ✅ MessageHub 已初始化');

    // 3. LayoutEngine（布局引擎）
    layoutEngine = createLayoutEngine();
    layoutEngine.onLayoutComplete = handleLayoutComplete;
    layoutEngine.onLayoutStart = handleLayoutStart;
    console.log('[graphView] ✅ LayoutEngine 已初始化');

    // 4. Renderer（渲染层）
    renderer = createRenderer({
      nodeContainer,
      edgeContainer,
      runtimeStyle
    });
    console.log('[graphView] ✅ Renderer 已初始化');

    // 5. CardLayer（卡片层）
    cardLayer = createCardLayer({
      container: graphContainer,
      runtimeStyle,
      onCardMoved: handleCardMoved
    });
    console.log('[graphView] ✅ CardLayer 已初始化');

    // 6. Breadcrumb（面包屑）
    const breadcrumbContainer = document.getElementById('breadcrumb');
    if (breadcrumbContainer) {
      breadcrumb = mountBreadcrumb(breadcrumbContainer);
      console.log('[graphView] ✅ Breadcrumb 已初始化');
    }

    // 7. DragManager（拖拽交互）
    dragManager = createDragManager({
      container: graphContainer,
      runtimeStyle,
      onDragEnd: handleCardMoved
    });
    dragManager.enable();
    console.log('[graphView] ✅ DragManager 已初始化');

    // 8. ZoomPan（缩放平移）
    zoomPan = createZoomPan({
      container: graphContainer,
      viewport,
      runtimeStyle,
      minZoom: 0.1,
      maxZoom: 3,
      onZoomChange: handleZoomChange,
      onPanChange: handlePanChange
    });
    zoomPan.enable();
    console.log('[graphView] ✅ ZoomPan 已初始化');
  }

  /**
   * 设置事件监听
   */
  function setupEventListeners() {
    // 监听图数据更新
    messageHub.onGraphUpdated(handleGraphUpdated);

    // 监听布局完成
    messageHub.onLayoutReady(handleLayoutReady);

    // 监听错误消息
    messageHub.onError(handleError);

    // ✨ M4: 监听位置恢复（消息类型与 BlueprintPanel 保持一致）
    messageHub.on('ui/positions', handlePositionsLoaded);

    // 节点点击事件（事件委托）
    nodeContainer.addEventListener('click', handleNodeClick);

    // 节点双击事件（打开文件）
    nodeContainer.addEventListener('dblclick', handleNodeDoubleClick);

    console.log('[graphView] ✅ 事件监听已设置');
  }

  // ========== 消息处理 ==========

  /**
   * 处理图数据更新
   * @param {Object} newGraph - 新图数据
   */
  function handleGraphUpdated(newGraph) {
    console.log('[graphView] 📊 收到图数据更新', newGraph);

    if (isLayouting) {
      console.log('[graphView] ⏳ 布局进行中，缓存图数据');
      pendingGraph = newGraph;
      return;
    }

    graph = newGraph;
    currentGraphKey = newGraph.id || '';

    // 更新面包屑
    if (breadcrumb && newGraph.metadata) {
      const parts = newGraph.metadata.path
        ? [newGraph.metadata.mode || 'tree', ...newGraph.metadata.path.split('/')]
        : [newGraph.metadata.mode || 'tree'];
      breadcrumb.update(parts);
    }

    // 执行布局
    executeLayout();
  }

  /**
   * 处理布局完成消息
   * @param {Object} layoutData - 布局数据
   */
  function handleLayoutReady(layoutData) {
    console.log('[graphView] 📐 收到预计算布局数据', layoutData);
    applyLayoutToDOM(layoutData);
  }

  /**
   * 处理错误消息
   * @param {string} error - 错误信息
   */
  function handleError(error) {
    console.error('[graphView] ❌ 后端错误:', error);
    // 可以添加 Toast 提示
  }

  /**
   * ✨ M4: 处理位置恢复
   * @param {Object} positionsMap - {path: {x, y, posClass}}
   */
  function handlePositionsLoaded(positionsMap) {
    console.log('[graphView] 📍 收到保存的位置', positionsMap);
    
    if (!positionsMap || typeof positionsMap !== 'object') {
      console.warn('[graphView] 无效的位置数据');
      return;
    }

    // 应用所有保存的位置到 runtimeStyle
    Object.entries(positionsMap).forEach(([path, data]) => {
      if (data && typeof data.x === 'number' && typeof data.y === 'number') {
        const posClassName = data.posClass || `card-pos-${hash(path)}`;
        runtimeStyle.setPos(posClassName, data.x, data.y);
        console.log(`[graphView] 恢复位置: ${path} → (${data.x}, ${data.y})`);
      }
    });

    console.log(`[graphView] ✅ 已恢复 ${Object.keys(positionsMap).length} 个位置`);
  }

  // ========== 布局管理 ==========

  /**
   * 执行布局计算
   */
  async function executeLayout() {
    isLayouting = true;
    console.log('[graphView] 🔄 开始布局计算...');

    // 设置图数据到布局引擎
    layoutEngine.setGraph(graph.nodes, graph.edges);

    // 恢复已保存的位置
    if (graph.savedPositions) {
      Object.entries(graph.savedPositions).forEach(([nodeId, position]) => {
        // 标记已有位置的节点（防止重新布局）
        const node = graph.nodes.find(n => n.id === nodeId);
        if (node) {
          node.x = position.x;
          node.y = position.y;
        }
      });
    }

    // 执行布局
    const layoutResult = await layoutEngine.reflow('graph-updated', []);

    if (layoutResult) {
      applyLayoutToDOM(layoutResult);
    }
  }

  /**
   * 应用布局结果到 DOM
   * @param {Object} layoutResult - 布局结果 {nodes, edges, bounds}
   */
  function applyLayoutToDOM(layoutResult) {
    if (!layoutResult) return;

    console.log('[graphView] 🎨 应用布局结果到 DOM');

    // 更新节点位置
    if (layoutResult.nodes) {
      renderer.updateNodePositions(layoutResult.nodes);
    }

    // 渲染节点
    const nodesWithPositions = graph.nodes.map(node => {
      const position = layoutResult.nodes?.[node.id];
      return position ? { ...node, ...position } : node;
    });
    renderer.renderNodes(nodesWithPositions);

    // 渲染边
    renderer.renderEdges(graph.edges, layoutResult.edges);

    // 更新 SVG 视口
    if (layoutResult.bounds) {
      renderer.updateSVGViewBox(layoutResult.bounds);
      
      // 自动适应内容
      zoomPan.fitToContent(layoutResult.bounds);
    }

    isLayouting = false;

    // 处理待定图数据
    if (pendingGraph) {
      const cached = pendingGraph;
      pendingGraph = null;
      handleGraphUpdated(cached);
    }

    console.log('[graphView] ✅ 布局应用完成');
  }

  /**
   * 布局开始回调
   * @param {string} reason - 触发原因
   * @param {Array} changedNodes - 变更的节点
   */
  function handleLayoutStart(reason, changedNodes) {
    console.log(`[graphView] 🔄 布局开始: ${reason}`, changedNodes);
  }

  /**
   * 布局完成回调
   * @param {Object} layoutResult - 布局结果
   * @param {string} reason - 触发原因
   */
  function handleLayoutComplete(layoutResult, reason) {
    console.log(`[graphView] ✅ 布局完成: ${reason}`, layoutResult);
  }

  // ========== 交互处理 ==========

  /**
   * 处理节点点击
   * @param {MouseEvent} event
   */
  function handleNodeClick(event) {
    const nodeEl = event.target.closest('.graph-node');
    if (!nodeEl) return;

    const nodeId = nodeEl.dataset.id;
    console.log(`[graphView] 🖱️ 节点点击: ${nodeId}`);

    // 高亮节点
    renderer.clearHighlights();
    renderer.highlightNode(nodeId);

    // 可以添加选中逻辑
  }

  /**
   * 处理节点双击（打开文件）
   * @param {MouseEvent} event
   */
  function handleNodeDoubleClick(event) {
    const nodeEl = event.target.closest('.graph-node');
    if (!nodeEl) return;

    const nodeId = nodeEl.dataset.id;
    const node = graph.nodes.find(n => n.id === nodeId);

    if (node && node.fsPath) {
      console.log(`[graphView] 📂 打开文件: ${node.fsPath}`);
      messageHub.openFile(node.fsPath);
    }
  }

  /**
   * 处理卡片移动（持久化位置）
   * @param {HTMLElement} element - 卡片元素
   * @param {{x, y}} position - 新位置
   */
  function handleCardMoved(element, position) {
    const path = element.dataset.path;
    if (!path) return;

    console.log(`[graphView] 💾 保存卡片位置: ${path}`, position);

    // 通知后端持久化
    messageHub.uiMoved(path, position);

    // 更新本地缓存
    if (!graph.savedPositions) {
      graph.savedPositions = {};
    }
    graph.savedPositions[path] = position;
  }

  /**
   * 处理缩放变化
   * @param {number} scale - 新缩放比例
   */
  function handleZoomChange(scale) {
    console.log(`[graphView] 🔍 缩放变化: ${scale.toFixed(2)}x`);
  }

  /**
   * 处理平移变化
   * @param {{x, y}} position - 新平移位置
   */
  function handlePanChange(position) {
    console.log(`[graphView] 🖐️ 平移变化: (${position.x}, ${position.y})`);
  }

  // ========== 导出全局 API（用于调试） ==========
  window.__graphView = {
    getGraph: () => graph,
    getModules: () => ({
      runtimeStyle,
      messageHub,
      layoutEngine,
      renderer,
      cardLayer,
      breadcrumb,
      dragManager,
      zoomPan
    }),
    executeLayout,
    // 便捷方法
    resetView: () => zoomPan.reset(),
    fitContent: () => {
      const state = layoutEngine.getState();
      if (state.nodeCount > 0) {
        const bounds = { x: 0, y: 0, width: 800, height: 600 }; // 简化
        zoomPan.fitToContent(bounds);
      }
    }
  };

  // ========== 启动 ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
