// media/filetree-blueprint/graphView.js
// 文件树蓝图前端交互逻辑（防抖动优化版 + 模块化卡片管理）
// 修复要点：拖拽/悬停不全量重渲染，只重画边；用 rAF 节流；坐标取整；CSS 抖动处理配合 index.css。

/**
 * 类型定义参考（用于 IDE 智能提示）：
 * @see {import('../../src/shared/messages').ExtensionToWebview} ExtensionToWebview - 后端发给前端的消息
 * @see {import('../../src/shared/messages').WebviewToExtension} WebviewToExtension - 前端发给后端的消息
 * @see {import('../../src/features/file-analysis/types').FileCapsule} FileCapsule - 文件分析数据结构
 */

(function () {
    // 🚨 修复：使用统一的VS Code API，避免重复获取
    if (!window.__vscode && typeof acquireVsCodeApi === 'function') {
        window.__vscode = acquireVsCodeApi();
    }
    const vscode = window.__vscode;

    // ✅ 卡片管理器（蓝图卡片系统）
    // window.blueprintCard 和 window.messageContracts 在模块脚本中初始化
    
    // 图表数据
    let graph = {
        nodes: [],
        edges: [],
        id: "g",
        title: "untitled",
        metadata: {},
    };

    // DOM 元素（适配简化HTML结构）
    let wrap = document.getElementById("canvasWrap");
    let canvas = document.getElementById("canvas");
    let nodeContainer = document.getElementById("nodes");
    let edgeSvg = document.querySelector("svg.edges");
    
    // 🚨 如果是简化HTML结构，创建必要的容器
    if (!wrap || !canvas || !nodeContainer || !edgeSvg) {
        const graphRoot = document.getElementById("graph-root");
        if (graphRoot) {
            console.log('[graphView] 检测到简化HTML，创建画布容器');
            
            // 清空原有内容
            graphRoot.innerHTML = '';
            
            // 创建画布结构
            wrap = document.createElement('div');
            wrap.id = 'canvasWrap';
            wrap.style.width = '100%';
            wrap.style.height = '100%';
            wrap.style.position = 'relative';
            
            canvas = document.createElement('div');
            canvas.id = 'canvas';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.position = 'relative';
            
            // 创建边的SVG层
            edgeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            edgeSvg.classList.add('edges');
            edgeSvg.style.position = 'absolute';
            edgeSvg.style.top = '0';
            edgeSvg.style.left = '0';
            edgeSvg.style.width = '100%';
            edgeSvg.style.height = '100%';
            edgeSvg.style.pointerEvents = 'none';
            edgeSvg.style.zIndex = '1';
            
            // 创建节点容器
            nodeContainer = document.createElement('div');
            nodeContainer.id = 'nodes';
            nodeContainer.style.position = 'absolute';
            nodeContainer.style.top = '0';
            nodeContainer.style.left = '0';
            nodeContainer.style.width = '100%';
            nodeContainer.style.height = '100%';
            nodeContainer.style.zIndex = '2';
            
            // 组装结构
            canvas.appendChild(edgeSvg);
            canvas.appendChild(nodeContainer);
            wrap.appendChild(canvas);
            graphRoot.appendChild(wrap);
        }
    }
    const nodeCountEl = document.getElementById("node-count");
    const edgeCountEl = document.getElementById("edge-count");
    const helpOverlay = document.getElementById("helpOverlay");
    const helpCloseBtn = document.getElementById("helpClose");
    const noShowAgainCheckbox = document.getElementById("noShowAgain");

    // 帮助浮层相关
    const HELP_STORAGE_KEY = "filetree_blueprint_help_seen_v1";

    // 画布变换
    let scale = 1;
    let offset = { x: 0, y: 0 };
    let panning = false;
    let panStart = { x: 0, y: 0 };
    let originAtPanStart = { x: 0, y: 0 };
    let spacePressed = false;

    // rAF 节流：只在帧末重画边
    let rafId = 0;
    function scheduleDrawEdges() {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            drawEdges();
        });
    }

    // ✅ 辅助函数：路径规范化（转换为 POSIX 格式）
    function toPosix(p) {
        return String(p || '').replace(/\\/g, '/');
    }

    // ✅ 辅助函数：规范化相对路径（确保以 / 开头）
    function normalizeRel(p, base) {
        p = toPosix(p);
        // 如果已经以 / 开头，直接返回
        if (p.startsWith('/')) {
            return p;
        }
        // 如果有 base 且不是根，拼接 base
        if (base && base !== '/') {
            return `${base}/${p}`;
        }
        // 否则，添加 / 前缀
        return `/${p}`;
    }

    // ✅ 辅助函数：HTML 转义
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, m => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m]));
    }

    // ✅ 初始化启动（按照对症下药方案）
    function boot() {
        // 1) mount card layer
        const layer = document.getElementById('card-layer') || (() => {
            const d = document.createElement('div'); 
            d.id = 'card-layer'; 
            d.className = 'card-layer';
            document.body.appendChild(d); 
            console.log('[graphView] 📦 创建了缺失的 card-layer');
            return d;
        })();
        
        if (window.cardManager && typeof window.cardManager.mount === 'function') {
            window.cardManager.mount('#card-layer');
            console.log('[graphView] ✅ cardManager 已挂载到 card-layer');
        } else {
            console.log('[graphView] ⏳ cardManager 暂未就绪，稍后自动挂载');
        }

        // 2) breadcrumb 兜底
        const breadcrumb = document.getElementById('breadcrumb');
        if (!breadcrumb) {
            const bc = document.createElement('div');
            bc.id = 'breadcrumb';
            bc.className = 'breadcrumb';
            bc.style.cssText = 'position: fixed; top: 50px; left: 10px; z-index: 1000; background: rgba(0,0,0,0.7); padding: 6px; border-radius: 4px; color: white; font-size: 11px; max-width: 80%;';
            document.body.prepend(bc);
            console.log('[graphView] 📍 创建了缺失的 breadcrumb');
        }
        
        // 3) 原有初始化
        setupEventListeners();
        notifyReady();
    }

    // 初始化（保留兼容性）
    function init() {
        boot();
    }

    // 设置事件监听（防御性编程：检查元素存在）
    function setupEventListeners() {
        // 工具栏按钮（可选，如果不存在则跳过）
        const btnResetView = document.getElementById('btn-reset-view');
        const btnFitView = document.getElementById('btn-fit-view');
        const btnZoomIn = document.getElementById('btn-zoom-in');
        const btnZoomOut = document.getElementById('btn-zoom-out');
        const btnHelp = document.getElementById('btn-help');
        
        if (btnResetView) btnResetView.addEventListener('click', resetView);
        if (btnFitView) btnFitView.addEventListener('click', fitView);
        if (btnZoomIn) btnZoomIn.addEventListener('click', () => zoom(1.2));
        if (btnZoomOut) btnZoomOut.addEventListener('click', () => zoom(0.8));
        if (btnHelp) btnHelp.addEventListener('click', toggleHelp);

        // 帮助浮层
        if (helpCloseBtn) {
            helpCloseBtn.addEventListener('click', closeHelp);
        }
        if (helpOverlay) {
            helpOverlay.addEventListener('click', (e) => {
                if (e.target === helpOverlay) {
                    closeHelp();
                }
            });
        }

        // 接收来自扩展的消息
        window.addEventListener('message', handleMessage);

        // 画布平移/缩放
        wrap.addEventListener('wheel', onWheel, { passive: false });

        // 键盘事件
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !isInputFocused()) {
                spacePressed = true;
                wrap.classList.add('panning-mode');
                e.preventDefault();
            }
            if (e.key === 'Backspace' || (e.key === 'ArrowUp' && e.altKey)) {
                goUpDirectory();
                e.preventDefault();
            }
            // ? 键或 Shift+/ 打开帮助
            if ((e.key === '?' || (e.shiftKey && e.key === '/')) && !isInputFocused()) {
                toggleHelp();
                e.preventDefault();
            }
            // Esc 关闭帮助
            if (e.key === 'Escape' && helpOverlay && helpOverlay.classList.contains('show')) {
                closeHelp();
                e.preventDefault();
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                spacePressed = false;
                wrap.classList.remove('panning-mode');
                wrap.classList.remove('panning-active');
            }
        });

        // 画布平移（空格+拖拽）
        wrap.addEventListener('pointerdown', (ev) => {
            if (!spacePressed) return;
            panning = true;
            wrap.classList.add('panning-active');
            panStart = { x: ev.clientX, y: ev.clientY };
            originAtPanStart = { ...offset };
            wrap.setPointerCapture(ev.pointerId);
        });
        wrap.addEventListener('pointermove', (ev) => {
            if (!panning) return;
            const dx = ev.clientX - panStart.x;
            const dy = ev.clientY - panStart.y;
            offset = { x: originAtPanStart.x + dx, y: originAtPanStart.y + dy };
            applyTransform();
        });
        wrap.addEventListener('pointerup', () => {
            if (panning) {
                panning = false;
                wrap.classList.remove('panning-active');
            }
        });
    }

    // ✅ Phase 7: 通知扩展 Webview 已就绪（可以发送消息了）
    function notifyReady() {
        console.log('[graphView] 🎉 Webview 已就绪，发送 ready 信号');
        vscode.postMessage({ type: 'webview-ready' });
        vscode.postMessage({ type: 'ready' }); // 保留旧消息以兼容
    }

    // 暴露给调试横幅的全局状态
    window.__graphState = { nodes: [], edges: [], metadata: { graphType: 'filetree' } };

    // 统一渲染入口 - 按朋友建议添加
    function renderGraph(g) {
        window.__graphState = g;
        graph = g;
        
        console.log('[graphView] 🎨 统一渲染入口:', `${g.nodes.length} nodes, ${g.edges.length} edges`);
        
        // 初始化节点与边的可视化
        renderNodesOnce();
        initEdgesLayerOnce();
        drawEdges();
        updateStats();
        updateBreadcrumb(g);
        
        // 更新 DebugBanner
        if (window.debugBanner?.setGraphMeta) {
            window.debugBanner.setGraphMeta(g);
        }

        // 自动适应视图
        setTimeout(() => fitView(), 100);
    }

    // 处理来自扩展的消息 - 按朋友建议修改
    function handleMessage(event) {
        const msg = event.data;
        const { type, payload } = msg || {};

        // 兼容两种消息名：'init-graph'（新）与 'INIT_RESULT'（旧）
        if (type === 'init-graph' || type === 'INIT_RESULT') {
            // 旧消息可能是 { graph, ... }，新的是 payload=graph
            const g = (type === 'INIT_RESULT' && payload?.graph) ? payload.graph : payload;
            
            if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) {
                console.warn('[graphView] init payload invalid:', g);
                return;
            }
            
            // graphType 兜底
            g.metadata = g.metadata || {};
            g.metadata.graphType = g.metadata.graphType || 'filetree';

            renderGraph(g);
            
            // 发送确认消息
            try { 
                vscode?.postMessage({ 
                    type: 'ack:init-graph', 
                    payload: { nodes: g.nodes.length, edges: g.edges.length } 
                }); 
            } catch (e) {
                console.warn('[graphView] 发送确认消息失败:', e);
            }
        } else if (msg?.type === 'open-help') {
            // 响应来自扩展的打开帮助命令
            openHelp();
        } else if (msg?.type === 'show-analysis-card') {
            // 🎯 蓝图卡片流：显示文件分析卡片
            const { path, file } = msg.payload || {};
            const filePath = file || path; // 兼容不同字段名
            
            console.log('[graphView] 📨 收到 show-analysis-card:', filePath, {
                hasStatic: !!msg.payload?.static,
                hasAI: !!msg.payload?.ai,
                loading: msg.payload?.loading,
                hasBlueprintCard: !!window.blueprintCard
            });
            
            // 智能等待并挂载蓝图卡片
            function tryShowBlueprintCard(attempts = 0) {
                if (window.blueprintCard && window.messageContracts) {
                    try {
                        // 使用新的蓝图卡片API
                        const cardData = window.messageContracts.validateCardData(msg.payload);
                        window.blueprintCard.showCard(filePath, cardData);
                        
                        console.log('[graphView] ✅ 蓝图卡片显示成功，发送 ACK');
                        
                        // 发送标准ACK
                        const ackMsg = window.messageContracts.createAckMessage('show-analysis-card', { 
                            path: filePath,
                            success: true
                        });
                        vscode?.postMessage(ackMsg);
                        
                    } catch (error) {
                        console.error('[graphView] ❌ 显示蓝图卡片异常:', error);
                        
                        // 降级到旧卡片系统
                        if (window.cardManager) {
                            console.log('[graphView] 🔄 降级到旧卡片系统');
                            window.cardManager.showCard(filePath, msg.payload);
                        }
                    }
                } else if (attempts < 15) {
                    console.log(`[graphView] ⏳ 蓝图卡片系统未就绪，等待... (${attempts + 1}/15)`);
                    setTimeout(() => tryShowBlueprintCard(attempts + 1), 100);
                } else {
                    console.error('[graphView] ❌ 蓝图卡片系统初始化超时！降级到旧系统');
                    // 降级处理
                    if (window.cardManager) {
                        window.cardManager.showCard(filePath, msg.payload);
                    }
                }
            }
            tryShowBlueprintCard();
        } else if (msg?.type === 'update-analysis-card') {
            // 🎯 蓝图卡片流：更新文件分析卡片
            const { path, file } = msg.payload || {};
            const filePath = file || path; // 兼容不同字段名
            
            console.log('[graphView] 📨 收到 update-analysis-card:', filePath, {
                hasInferences: !!(msg.payload?.ai?.inferences?.length),
                hasRecommendations: !!(msg.payload?.ai?.suggestions?.length),
                hasStatic: !!msg.payload?.static,
                loading: msg.payload?.loading
            });
            
            // 智能等待并更新蓝图卡片
            function tryUpdateBlueprintCard(attempts = 0) {
                if (window.blueprintCard && window.messageContracts) {
                    try {
                        // 使用增量更新API
                        const updates = window.messageContracts.validateCardUpdates(msg.payload);
                        const success = window.blueprintCard.updateCard(filePath, updates);
                        
                        if (success) {
                            console.log('[graphView] ✅ 蓝图卡片更新成功');
                            
                            // 发送标准ACK
                            const ackMsg = window.messageContracts.createAckMessage('update-analysis-card', { 
                                path: filePath,
                                success: true
                            });
                            vscode?.postMessage(ackMsg);
                        } else {
                            console.warn('[graphView] ⚠️ 卡片不存在，尝试创建新卡片');
                            // 如果卡片不存在，创建一个新的
                            const cardData = window.messageContracts.validateCardData(msg.payload);
                            window.blueprintCard.showCard(filePath, cardData);
                        }
                        
                    } catch (error) {
                        console.error('[graphView] ❌ 更新蓝图卡片异常:', error);
                        
                        // 降级到旧卡片系统
                        if (window.cardManager) {
                            console.log('[graphView] 🔄 降级更新到旧卡片系统');
                            window.cardManager.updateCard(filePath, msg.payload);
                        }
                    }
                } else if (attempts < 15) {
                    console.log(`[graphView] ⏳ 蓝图卡片系统未就绪，等待更新... (${attempts + 1}/15)`);
                    setTimeout(() => tryUpdateBlueprintCard(attempts + 1), 100);
                } else {
                    console.error('[graphView] ❌ 蓝图卡片系统初始化超时！降级更新');
                    // 降级处理
                    if (window.cardManager) {
                        window.cardManager.updateCard(filePath, msg.payload);
                    }
                }
            }
            tryUpdateBlueprintCard();
        } else if (msg?.type === 'analysis-error') {
            // ✅ Phase 7: 显示分析错误
            console.error('[graphView] ❌ 分析错误:', msg.payload);
            const { file, message } = msg.payload || {};
            // TODO: 实现 toast 提示
            console.error(`分析失败: ${file}\n${message || '未知错误'}`);
        }
    }

    // Edge 层尺寸只设一次避免反复回流
    function initEdgesLayerOnce() {
        edgeSvg.setAttribute("width", 5000);
        edgeSvg.setAttribute("height", 5000);
    }

    // 渲染节点（只在图表初始化时调用一次）
    function renderNodesOnce() {
        nodeContainer.innerHTML = "";
        for (const n of graph.nodes) {
            const el = document.createElement("div");
            el.className = "node";

            // --- 位置整数化，避免 sub-pixel 抖动 ---
            const ix = Math.round(n.position?.x || 0);
            const iy = Math.round(n.position?.y || 0);
            n.position = { x: ix, y: iy };
            el.style.left = ix + "px";
            el.style.top = iy + "px";
            el.dataset.id = n.id;

            // 节点类型样式
            el.classList.add(`node-${n.type || 'file'}`);

            const subtitle =
                n.type === "folder" && n.data?.childrenCount != null
                    ? `子项：${n.data.childrenCount}`
                    : n.type === "file" && n.data?.ext
                    ? `类型: ${n.data.ext}`
                    : "";

            // 图标
            const icon = n.type === 'folder' ? '📁' : 
                        n.type === 'module' ? '📦' : '📄';

            el.innerHTML = `
                <div class="node-icon">${icon}</div>
                <div class="node-content">
                    <div class="title">${escapeHtml(n.label || n.id)}</div>
                    <div class="desc">${escapeHtml(subtitle || "")}</div>
                </div>
            `;

            // ✅ 双击文件夹：下钻（发送 drill 消息在同一面板刷新）
            if (
                n.type === "folder" &&
                n.data?.path &&
                graph?.metadata?.graphType === "filetree"
            ) {
                // 判断是否是根节点
                if (n.data?.isRoot) {
                    // 双击根节点：返回上一级
                    el.addEventListener("dblclick", () => {
                        console.log('[双击] 根节点，发送 drill-up:', n.data.path);
                        vscode.postMessage({ 
                            type: "drill-up", 
                            payload: { path: n.data.path } 
                        });
                    });
                } else {
                    // 双击子文件夹：下钻
                    el.addEventListener("dblclick", () => {
                        console.log('[双击] 子文件夹，发送 drill:', n.data.path);
                        vscode.postMessage({ 
                            type: "drill", 
                            payload: { path: n.data.path } 
                        });
                    });
                }
            }

            // 📊 诊断日志:双击文件绑定条件检查
            if (n.type === "file") {
                const graphType = graph?.metadata?.graphType;
                const hasPath = !!n.data?.path;
                const shouldBind = n.type === "file" && hasPath && graphType === "filetree";
                
                console.log(`[诊断] 文件节点 "${n.label}":`, {
                    nodeType: n.type,
                    hasPath,
                    graphType,
                    expectedGraphType: 'filetree',
                    graphTypeMatch: graphType === 'filetree',
                    willBindDoubleClick: shouldBind
                });
            }

            // 🎯 双击文件：展开蓝图分析卡片
            if (
                n.type === "file" &&
                n.data?.path &&
                graph?.metadata?.graphType === "filetree"
            ) {
                console.log(`[绑定] 为文件 "${n.label}" 绑定蓝图卡片双击事件`);
                el.addEventListener("dblclick", (e) => {
                    e.stopPropagation(); // 防止事件冒泡
                    
                    // 优先使用 absPath，如果没有则回退到 path
                    const filePath = n.data.absPath || n.data.path;
                    console.log('[双击] 文件，请求蓝图分析:', filePath);
                    
                    // 使用标准消息契约
                    if (window.messageContracts) {
                        const message = window.messageContracts.createNodeDoubleClickMessage(n.id, {
                            path: filePath,
                            position: n.position,
                            type: 'file',
                            nodeData: n.data
                        });
                        vscode.postMessage(message);
                    } else {
                        // 降级到旧消息格式
                        vscode.postMessage({
                            type: "analyze-file",
                            payload: {
                                path: filePath,
                                nodeId: n.id,
                                position: n.position
                            }
                        });
                    }
                    
                    // 立即在本地预显示卡片（加载状态）
                    if (window.blueprintCard) {
                        setTimeout(() => {
                            const loadingData = {
                                path: filePath,
                                meta: {
                                    size: n.data?.size || 0,
                                    extension: filePath.split('.').pop() || '',
                                    lastModified: n.data?.lastModified || new Date().toISOString()
                                },
                                static: null,
                                ai: null,
                                loading: true
                            };
                            
                            try {
                                window.blueprintCard.showCard(filePath, loadingData, {
                                    x: (n.position?.x || 120) + 50,
                                    y: (n.position?.y || 120) + 30
                                });
                                console.log('[双击] ✅ 预显示蓝图卡片（加载态）');
                            } catch (error) {
                                console.warn('[双击] ⚠️ 预显示卡片失败:', error);
                            }
                        }, 50); // 短暂延迟确保消息已发送
                    }
                });
            }

            // 使节点可拖拽
            makeDraggable(el, n);
            nodeContainer.appendChild(el);
        }
    }

    // 绘制边（可重复调用）
    function drawEdges() {
        edgeSvg.innerHTML = "";
        
        for (const e of graph.edges) {
            const from = graph.nodes.find((n) => n.id === e.from?.node);
            const to = graph.nodes.find((n) => n.id === e.to?.node);
            if (!from || !to) continue;

            // 从节点右侧到目标节点左侧
            const fromPt = {
                x: Math.round(from.position.x + 160),
                y: Math.round(from.position.y + 32),
            };
            const toPt = {
                x: Math.round(to.position.x),
                y: Math.round(to.position.y + 32),
            };

            const path = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "path"
            );
            path.setAttribute("class", "edge");
            const dx = Math.max(40, (toPt.x - fromPt.x) * 0.5);
            path.setAttribute(
                "d",
                `M ${fromPt.x} ${fromPt.y} C ${fromPt.x + dx} ${fromPt.y}, ${
                    toPt.x - dx
                } ${toPt.y}, ${toPt.x} ${toPt.y}`
            );
            edgeSvg.appendChild(path);

            if (e.label) {
                const midx = Math.round((fromPt.x + toPt.x) / 2);
                const midy = Math.round((fromPt.y + toPt.y) / 2);
                const text = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "text"
                );
                text.setAttribute("class", "edge-label");
                text.setAttribute("x", midx);
                text.setAttribute("y", midy - 6);
                text.textContent = e.label;
                edgeSvg.appendChild(text);
            }
        }
    }

    // 使节点可拖拽
    function makeDraggable(el, node) {
        let dragging = false;
        let hasMoved = false; // ✅ 新增：跟踪是否实际移动过
        let start = { x: 0, y: 0 };
        let nodeStart = { x: 0, y: 0 };
        const DRAG_THRESHOLD = 5; // ✅ 移动阈值（像素）

        el.addEventListener("pointerdown", (ev) => {
            if (ev.button !== 0) return;
            if (spacePressed) return; // 空格为平移模式
            dragging = true;
            hasMoved = false; // ✅ 重置移动标记
            el.setPointerCapture(ev.pointerId);
            start = { x: ev.clientX, y: ev.clientY };
            nodeStart = { x: node.position.x, y: node.position.y };
            // ✅ 不要立即添加 dragging 类，等真正移动时再添加
        });

        el.addEventListener("pointermove", (ev) => {
            if (!dragging) return;
            const dx = ev.clientX - start.x;
            const dy = ev.clientY - start.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // ✅ 只有移动超过阈值才算真正的拖拽
            if (!hasMoved && distance < DRAG_THRESHOLD) {
                return; // 移动太小，忽略（可能是点击/双击）
            }
            
            if (!hasMoved) {
                hasMoved = true;
                el.classList.add("dragging"); // ✅ 确认拖拽后才添加样式
                console.log('[拖拽] 开始拖拽节点:', node.label || node.id);
            }
            
            const scaledDx = dx / scale;
            const scaledDy = dy / scale;
            // --- 位置取整消抖 ---
            node.position.x = Math.round(nodeStart.x + scaledDx);
            node.position.y = Math.round(nodeStart.y + scaledDy);
            el.style.left = node.position.x + "px";
            el.style.top = node.position.y + "px";
            // 仅重画边，不重建节点
            scheduleDrawEdges();
        });

        el.addEventListener("pointerup", (ev) => {
            if (!dragging) return;
            dragging = false;
            el.releasePointerCapture(ev.pointerId);
            el.classList.remove("dragging");
            
            // ✅ 只有真正拖拽过才发送 node-moved 消息
            if (hasMoved) {
                console.log('[拖拽] 结束拖拽节点:', node.label || node.id);
                // 如果是"手写图"，把新坐标写回
                if (graph?.metadata?.graphType !== "filetree") {
                    vscode.postMessage({
                        type: "node-moved",
                        payload: { nodeId: node.id, position: node.position },
                    });
                }
            }
            hasMoved = false; // ✅ 重置标记
        });
    }

    // 鼠标滚轮缩放
    function onWheel(ev) {
        ev.preventDefault();
        const prev = scale;
        const delta = Math.sign(ev.deltaY) * -0.1;
        scale = Math.min(2.5, Math.max(0.3, scale + delta));
        const rect = wrap.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;
        offset.x = mx - (mx - offset.x) * (scale / prev);
        offset.y = my - (my - offset.y) * (scale / prev);
        applyTransform();
        // 缩放不需要重算边（节点和边在同一 transform 容器下同步缩放）
    }

    // 应用变换
    function applyTransform() {
        canvas.style.transform = `translate(${Math.round(offset.x)}px, ${Math.round(
            offset.y
        )}px) scale(${scale})`;
    }

    // 重置视图
    function resetView() {
        scale = 1;
        offset = { x: 0, y: 0 };
        applyTransform();
    }

    // 适应窗口
    function fitView() {
        if (!graph || graph.nodes.length === 0) {
            return;
        }

        // 计算所有节点的边界框
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        graph.nodes.forEach(node => {
            minX = Math.min(minX, node.position.x);
            minY = Math.min(minY, node.position.y);
            maxX = Math.max(maxX, node.position.x + 160);
            maxY = Math.max(maxY, node.position.y + 64);
        });

        const width = maxX - minX + 100;
        const height = maxY - minY + 100;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const rect = wrap.getBoundingClientRect();
        const scaleX = rect.width / width;
        const scaleY = rect.height / height;
        const newScale = Math.min(scaleX, scaleY, 1.5) * 0.9;

        scale = newScale;
        offset.x = rect.width / 2 - centerX * scale;
        offset.y = rect.height / 2 - centerY * scale;

        applyTransform();
    }

    // 缩放
    function zoom(factor) {
        const prev = scale;
        scale *= factor;
        scale = Math.max(0.3, Math.min(scale, 2.5));

        const rect = wrap.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        offset.x = centerX - (centerX - offset.x) * (scale / prev);
        offset.y = centerY - (centerY - offset.y) * (scale / prev);

        applyTransform();
    }

    // 更新统计信息
    function updateStats() {
        // 🚨 防御性编程：兼容不同的DOM结构
        const nEl = document.getElementById('stat-total-nodes') || nodeCountEl;
        const eEl = document.getElementById('stat-total-edges') || edgeCountEl;
        
        if (nEl) {
            nEl.textContent = `${graph.nodes.length} nodes`;
        }
        if (eEl) {
            eEl.textContent = `${graph.edges.length} edges`;
        }
        
        // 在控制台显示统计信息
        console.log(`[统计] 📊 ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
    }

    // 更新面包屑
    function updateBreadcrumb(graph) {
        // B. 防御性编程：检查面包屑容器是否存在
        const el = document.getElementById('breadcrumb');
        if (!el) { 
            console.warn('[breadcrumb] container not found, skip'); 
            return; 
        }
        
        const metadata = graph.metadata || {};
        const rootPath = metadata.rootPath || '';
        const relativePath = metadata.relativePath || '';
        const scanMode = metadata.scanMode || 'deep';

        const modeText = scanMode === 'shallow' ? '📂 当前目录' : '🌳 递归扫描';

        el.innerHTML = `
            <button id="btn-go-up" style="padding: 2px 8px; margin-right: 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; cursor: pointer;">
                ⬆️ 返回上级
            </button>
            <span>📍</span>
            <a href="#" onclick="return false;">${escapeHtml(graph.title)}</a>
            <span style="opacity: 0.5; margin-left: 8px;">${modeText}</span>
            ${relativePath ? `<span style="opacity: 0.5"> | ${escapeHtml(relativePath)}</span>` : ''}
        `;

        // 绑定返回上级按钮
        const btnGoUp = document.getElementById('btn-go-up');
        if (btnGoUp) {
            btnGoUp.addEventListener('click', goUpDirectory);
        }
    }

    // 返回上级目录
    function goUpDirectory() {
        if (!graph || !graph.metadata) {
            return;
        }

        const currentPath = graph.metadata.rootPath;

        vscode.postMessage({
            type: 'go-up',
            payload: { currentPath }
        });
    }

    // HTML 转义
    function escapeHtml(s) {
        return String(s).replace(
            /[&<>"']/g,
            (m) =>
                ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;",
                }[m])
        );
    }

    // 检查是否有输入框获得焦点
    function isInputFocused() {
        const activeEl = document.activeElement;
        return activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
    }

    // 帮助浮层控制
    function toggleHelp() {
        if (!helpOverlay) return;
        
        if (helpOverlay.classList.contains('show')) {
            closeHelp();
        } else {
            openHelp();
        }
    }

    function openHelp() {
        if (helpOverlay) {
            helpOverlay.classList.add('show');
        }
    }

    function closeHelp() {
        if (!helpOverlay) return;
        
        helpOverlay.classList.remove('show');
        
        // 如果勾选了"不再显示"，保存到 localStorage
        if (noShowAgainCheckbox && noShowAgainCheckbox.checked) {
            try {
                localStorage.setItem(HELP_STORAGE_KEY, '1');
            } catch (e) {
                console.warn('无法保存帮助浮层状态', e);
            }
        }
    }

    // 检查是否首次使用，自动显示帮助
    function checkFirstTimeHelp() {
        try {
            const seen = localStorage.getItem(HELP_STORAGE_KEY);
            if (!seen) {
                // 延迟 500ms 显示，让画布先渲染
                setTimeout(() => {
                    openHelp();
                }, 500);
            }
        } catch (e) {
            console.warn('无法读取帮助浮层状态', e);
        }
    }

    // 初始化时检查
    window.addEventListener('message', (e) => {
        const msg = e.data;
        if (msg?.type === 'init-graph') {
            // 只在第一次初始化时检查
            if (!graph.nodes || graph.nodes.length === 0) {
                setTimeout(checkFirstTimeHelp, 100);
            }
        }
        
        // C. 消息接入：处理卡片相关消息
        if (msg?.type === 'show-analysis-card') {
            if (window.cardManager?.show) {
                window.cardManager.show(msg.payload);
            } else {
                console.warn('[graphView] cardManager 未就绪，无法显示卡片');
            }
        }
        
        if (msg?.type === 'update-analysis-card') {
            if (window.cardManager?.update) {
                window.cardManager.update(msg.payload);
            } else {
                console.warn('[graphView] cardManager 未就绪，无法更新卡片');
            }
        }
    });

    // ===== 调试工具：Ctrl+Shift+D 开启事件诊断 =====
    let debugEvents = false;

    window.addEventListener('keydown', (e) => {
        // Ctrl+Shift+D 切换调试模式
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            debugEvents = !debugEvents;
            console.log(`🔍 事件诊断: ${debugEvents ? '开启' : '关闭'}`);
            
            if (debugEvents) {
                // 诊断信息
                console.log('📊 当前图表状态:', {
                    graphType: graph?.metadata?.graphType,
                    nodeCount: graph?.nodes?.length,
                    folderNodes: graph?.nodes?.filter(n => n.type === 'folder').length,
                    rootNode: graph?.nodes?.find(n => n.data?.isRoot)
                });
                
                // 检查文件夹节点数据
                console.log('📁 文件夹节点详情:');
                graph?.nodes?.filter(n => n.type === 'folder').forEach(n => {
                    console.log(`  - ${n.label}:`, {
                        hasPath: !!n.data?.path,
                        path: n.data?.path,
                        isRoot: n.data?.isRoot,
                        position: n.position
                    });
                });
                
                console.log('💡 提示：双击文件夹节点查看事件路径');
            }
            e.preventDefault();
        }
    });

    // 监听所有双击事件（用于诊断）
    document.addEventListener('dblclick', (e) => {
        if (!debugEvents) return;
        
        const path = e.composedPath().map(el => {
            if (el.nodeType !== 1) return null;
            return el.className || el.id || el.tagName;
        }).filter(Boolean).slice(0, 8);
        
        console.log('🖱️ 双击事件路径:', path.join(' > '));
        console.log('🎯 目标元素:', e.target);
        console.log('📍 目标类名:', e.target.className);
        console.log('📦 目标数据:', e.target.dataset);
    }, true);

    // ===== 文件分析卡片功能 (已模块化) =====
    // ⚠️ 注意：以下函数已被 modules/analysisCard.js 中的 AnalysisCardManager 替代
    // 保留这些函数仅作为向后兼容，实际使用 window.cardManager
    // TODO: 待完全迁移后可以删除这些旧函数
    
    let cardOpenedAt = 0; // ✅ 记录卡片打开时间，用于防止双击第二下误关闭
    
    // ⚠️ 已弃用：请使用 window.cardManager.showCard()
    function showAnalysisCard(capsule) {
        console.log('[分析卡片] 显示:', capsule);
        
        try {
            // 查找或创建卡片容器和遮罩容器
            let analysisHost = document.getElementById('analysis-host');
            if (!analysisHost) {
                analysisHost = document.createElement('div');
                analysisHost.id = 'analysis-host';
                analysisHost.className = 'analysis-host';
                document.getElementById('canvas').appendChild(analysisHost);
            }

            // ✅ 清空旧内容（确保单例）
            analysisHost.innerHTML = '';

            // ✅ 创建遮罩层（点击关闭，但有300ms保护期）
            const backdrop = document.createElement('div');
            backdrop.className = 'analysis-backdrop';
            backdrop.addEventListener('click', (e) => {
                const elapsed = performance.now() - cardOpenedAt;
                if (elapsed < 300) {
                    // ✅ 防止双击第二下立即关闭卡片
                    console.log('[分析卡片] 保护期内，忽略点击关闭', elapsed);
                    e.stopPropagation();
                    return;
                }
                console.log('[分析卡片] 点击遮罩关闭');
                collapseAnalysisCard();
            });
            analysisHost.appendChild(backdrop);

            // ✅ 检查是否显示Loading状态
            const loadingBadge = capsule.loading 
                ? '<span class="loading-badge">⏳ AI分析中...</span>' 
                : '';

            // ✅ 创建卡片元素
            const card = document.createElement('div');
            card.className = 'analysis-card';
            card.setAttribute('data-file', capsule.file);
            
            // 渲染卡片内容
            card.innerHTML = `
                <!-- 标题栏 -->
                <div class="card-header">
                    <div class="card-title">
                        <span class="file-icon">📄</span>
                        <span class="file-name">${escapeHtml(capsule.file.split(/[/\\]/).pop())}</span>
                        ${loadingBadge}
                    </div>
                    <div class="card-actions">
                        <button class="btn-icon" data-action="open" title="打开源文件">📂</button>
                        <button class="btn-icon" data-action="refresh" title="刷新分析">↻</button>
                        <button class="btn-icon" data-action="close" title="关闭">✕</button>
                    </div>
                </div>

                <!-- Tab栏 -->
                <div class="card-tabs">
                    <button class="tab-btn active" data-tab="overview">概览</button>
                    <button class="tab-btn" data-tab="api">API</button>
                    <button class="tab-btn" data-tab="deps">依赖</button>
                    <button class="tab-btn" data-tab="evidence">证据</button>
                </div>

                <!-- 内容区域 -->
                <div class="card-content">
                    <div class="tab-pane active" data-pane="overview">
                        ${renderOverviewTab(capsule)}
                    </div>
                    <div class="tab-pane" data-pane="api">
                        ${renderApiTab(capsule)}
                    </div>
                    <div class="tab-pane" data-pane="deps">
                        ${renderDepsTab(capsule)}
                    </div>
                    <div class="tab-pane" data-pane="evidence">
                        ${renderEvidenceTab(capsule)}
                    </div>
                </div>
            `;

            analysisHost.appendChild(card);

            // ✅ 使用 requestAnimationFrame 确保 DOM 已插入，然后添加 show 类触发动画
            requestAnimationFrame(() => {
                cardOpenedAt = performance.now();
                card.classList.add('show');
                console.log('[分析卡片] 已添加 show 类，卡片应该可见');
            });

            // 绑定Tab切换
            card.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    // 切换Tab按钮状态
                    card.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    // 切换内容面板
                    const tabName = btn.dataset.tab;
                    card.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
                    card.querySelector(`.tab-pane[data-pane="${tabName}"]`).classList.add('active');
                });
            });

            // 绑定操作按钮
            card.querySelector('[data-action="open"]').addEventListener('click', () => {
                vscode.postMessage({
                    type: 'open-source',
                    payload: { file: capsule.file, line: 1 }
                });
            });

            card.querySelector('[data-action="refresh"]').addEventListener('click', () => {
                vscode.postMessage({
                    type: 'analyze-file',
                    payload: { path: capsule.file, force: true }
                });
            });

            card.querySelector('[data-action="close"]').addEventListener('click', () => {
                collapseAnalysisCard();
            });

            // 绑定证据锚点点击
            card.querySelectorAll('[data-evidence]').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const evidenceId = link.dataset.evidence;
                    const evidence = capsule.evidence?.[evidenceId];
                    if (evidence) {
                        vscode.postMessage({
                            type: 'open-source',
                            payload: {
                                file: evidence.file,
                                line: evidence.lines[0],
                                endLine: evidence.lines[1]
                            }
                        });
                    }
                });
            });

            console.log('[分析卡片] 渲染完成，返回 true');
            return true; // ✅ 返回 true 表示渲染成功
            
        } catch (error) {
            console.error('[分析卡片] 渲染失败:', error);
            return false;
        }
    }

    /**
     * 折叠/关闭分析卡片
     * ⚠️ 已弃用：请使用 window.cardManager.closeCard()
     */
    function collapseAnalysisCard() {
        const analysisHost = document.getElementById('analysis-host');
        if (analysisHost) {
            analysisHost.innerHTML = '';
            console.log('[分析卡片] 已关闭');
        }
    }

    /**
     * 更新已显示的分析卡片(AI分析完成后的增量更新)
     * ⚠️ 已弃用：请使用 window.cardManager.updateCard()
     */
    function updateAnalysisCard(capsule) {
        console.log('[分析卡片] AI更新:', capsule);
        
        const analysisHost = document.getElementById('analysis-host');
        if (!analysisHost) {
            // 如果容器不存在,直接显示新卡片
            console.warn('[分析卡片] 容器不存在,执行完整渲染');
            showAnalysisCard(capsule);
            return;
        }

        const card = analysisHost.querySelector('.analysis-card');
        if (!card || card.dataset.file !== capsule.file) {
            // 如果卡片文件不匹配,重新渲染
            console.warn('[分析卡片] 文件不匹配,执行完整渲染');
            showAnalysisCard(capsule);
            return;
        }

        // ✅ 增量更新: 移除Loading标记
        const loadingBadge = card.querySelector('.loading-badge');
        if (loadingBadge) {
            loadingBadge.remove();
            console.log('[分析卡片] 已移除 loading 徽章');
        }

        // ✅ 增量更新: 更新各个Tab的内容
        const overviewPane = card.querySelector('.tab-pane[data-pane="overview"]');
        const apiPane = card.querySelector('.tab-pane[data-pane="api"]');
        const depsPane = card.querySelector('.tab-pane[data-pane="deps"]');
        const evidencePane = card.querySelector('.tab-pane[data-pane="evidence"]');

        if (overviewPane) overviewPane.innerHTML = renderOverviewTab(capsule);
        if (apiPane) apiPane.innerHTML = renderApiTab(capsule);
        if (depsPane) depsPane.innerHTML = renderDepsTab(capsule);
        if (evidencePane) evidencePane.innerHTML = renderEvidenceTab(capsule);

        // 重新绑定证据链接
        card.querySelectorAll('[data-evidence]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const evidenceId = link.dataset.evidence;
                const evidence = capsule.evidence?.[evidenceId];
                if (evidence) {
                    vscode.postMessage({
                        type: 'open-source',
                        payload: {
                            file: evidence.file,
                            line: evidence.lines[0],
                            endLine: evidence.lines[1]
                        }
                    });
                }
            });
        });

        console.log('[分析卡片] AI更新完成');
    }

    function renderOverviewTab(capsule) {
        const summary = capsule.summary?.zh || capsule.summary?.en || '暂无摘要';
        const facts = capsule.facts || [];
        const inferences = capsule.inferences || [];
        const recommendations = capsule.recommendations || [];
        
        return `
            <div class="overview-section">
                <h4>📝 摘要</h4>
                <p class="summary">${escapeHtml(summary)}</p>
                
                ${facts.length > 0 ? `
                    <h4>✅ 事实</h4>
                    <ul class="fact-list">
                        ${facts.map(f => `
                            <li>
                                ${escapeHtml(f.text)}
                                ${f.evidence?.map(e => `<a href="#" class="evidence-link" data-evidence="${e}">[证据]</a>`).join(' ') || ''}
                            </li>
                        `).join('')}
                    </ul>
                ` : ''}
                
                ${inferences.length > 0 ? `
                    <h4>💡 AI 推断</h4>
                    <ul class="inference-list">
                        ${inferences.map(i => `
                            <li>
                                ${escapeHtml(i.text)}
                                <span class="confidence">置信度: ${(i.confidence * 100).toFixed(0)}%</span>
                                ${i.evidence?.map(e => `<a href="#" class="evidence-link" data-evidence="${e}">[证据]</a>`).join(' ') || ''}
                            </li>
                        `).join('')}
                    </ul>
                ` : ''}
                
                ${recommendations.length > 0 ? `
                    <h4>💡 AI 建议</h4>
                    <ul class="recommendation-list">
                        ${recommendations.map(r => `
                            <li class="rec-${r.priority || 'medium'}">
                                <div class="rec-header">
                                    <span class="rec-priority">${getPriorityEmoji(r.priority)}</span>
                                    <span class="rec-text">${escapeHtml(r.text)}</span>
                                </div>
                                ${r.reason ? `<div class="rec-reason">原因: ${escapeHtml(r.reason)}</div>` : ''}
                                ${r.evidence?.map(e => `<a href="#" class="evidence-link" data-evidence="${e}">[证据]</a>`).join(' ') || ''}
                            </li>
                        `).join('')}
                    </ul>
                ` : ''}
                
                <div class="meta-info">
                    <span>最后验证: ${formatTime(capsule.lastVerifiedAt)}</span>
                    ${capsule.stale ? '<span class="badge-warning">需要刷新</span>' : ''}
                    ${inferences.length > 0 || recommendations.length > 0 ? '<span class="badge-ai">🤖 AI增强</span>' : ''}
                </div>
            </div>
        `;
    }

    function getPriorityEmoji(priority) {
        const map = {
            'high': '🔴',
            'medium': '🟡',
            'low': '🟢'
        };
        return map[priority] || '🟡';
    }

    function formatTime(isoString) {
        if (!isoString) return '未知';
        try {
            const date = new Date(isoString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            
            if (diffMins < 1) return '刚刚';
            if (diffMins < 60) return `${diffMins}分钟前`;
            
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) return `${diffHours}小时前`;
            
            return date.toLocaleDateString('zh-CN');
        } catch {
            return isoString;
        }
    }

    function renderApiTab(capsule) {
        const api = capsule.api || [];
        if (api.length === 0) {
            return '<p class="empty">暂无API信息</p>';
        }
        
        return `
            <div class="api-section">
                <h4>📦 导出符号</h4>
                <ul class="api-list">
                    ${api.map(item => `
                        <li class="api-item">
                            <div class="api-header">
                                <span class="api-kind">${item.kind}</span>
                                <span class="api-name">${escapeHtml(item.name)}</span>
                            </div>
                            <div class="api-signature"><code>${escapeHtml(item.signature)}</code></div>
                            ${item.evidence?.map(e => `<a href="#" class="evidence-link" data-evidence="${e}">[证据]</a>`).join(' ') || ''}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    function renderDepsTab(capsule) {
        const depsOut = capsule.deps?.out || [];
        const depsIn = capsule.deps?.inSample || [];
        
        return `
            <div class="deps-section">
                ${depsOut.length > 0 ? `
                    <h4>📤 出依赖 (它引用了谁)</h4>
                    <ul class="deps-list">
                        ${depsOut.map(dep => `
                            <li>
                                ${escapeHtml(dep.module)}
                                <span class="dep-count">${dep.count} 次</span>
                                ${dep.evidence?.map(e => `<a href="#" class="evidence-link" data-evidence="${e}">[证据]</a>`).join(' ') || ''}
                            </li>
                        `).join('')}
                    </ul>
                ` : '<p class="empty">无出依赖</p>'}
                
                ${depsIn.length > 0 ? `
                    <h4>📥 入依赖样本 (谁引用了它)</h4>
                    <ul class="deps-list">
                        ${depsIn.map(dep => `
                            <li>
                                ${escapeHtml(dep.file)} : ${dep.line}
                                ${dep.evidence?.map(e => `<a href="#" class="evidence-link" data-evidence="${e}">[查看]</a>`).join(' ') || ''}
                            </li>
                        `).join('')}
                    </ul>
                ` : '<p class="empty">无入依赖信息</p>'}
            </div>
        `;
    }

    function renderEvidenceTab(capsule) {
        const evidence = capsule.evidence || {};
        const evidenceKeys = Object.keys(evidence);
        
        if (evidenceKeys.length === 0) {
            return '<p class="empty">暂无证据</p>';
        }
        
        return `
            <div class="evidence-section">
                <h4>🔍 证据索引</h4>
                <ul class="evidence-list">
                    ${evidenceKeys.map(key => {
                        const ev = evidence[key];
                        return `
                            <li class="evidence-item">
                                <span class="evidence-id">${key}</span>
                                <a href="#" class="evidence-link" data-evidence="${key}">
                                    ${escapeHtml(ev.file)} : ${ev.lines[0]}-${ev.lines[1]}
                                </a>
                            </li>
                        `;
                    }).join('')}
                </ul>
            </div>
        `;
    }

    // ✅ Phase 7: 双击事件探针（Ctrl+Shift+D 切换）
    (() => {
        let probeEnabled = false;
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                probeEnabled = !probeEnabled;
                console.log(`🔍 双击诊断探针: ${probeEnabled ? 'ON' : 'OFF'}`);
                if (probeEnabled) {
                    console.log('💡 现在双击任何元素，都会显示事件路径');
                }
            }
        });

        document.addEventListener('dblclick', (e) => {
            if (!probeEnabled) return;
            
            const path = e.composedPath()
                .filter(x => x?.nodeType === 1)
                .map(x => {
                    if (x.id) return `#${x.id}`;
                    if (x.className) return `.${x.className.split(' ')[0]}`;
                    return x.tagName;
                })
                .slice(0, 6);
            
            console.log('🖱️ dblclick 事件路径:', path.join(' > '));
            console.log('   目标元素:', e.target);
            console.log('   是否被阻止:', e.defaultPrevented);
            console.log('   是否冒泡:', e.bubbles);
        }, true); // capture 捕获阶段，能看到事件被谁拦截
    })();

    // 启动
    init();
})();

