// media/filetree-blueprint/graphView.js
// 文件树蓝图前端交互逻辑（防抖动优化版）
// 修复要点：拖拽/悬停不全量重渲染，只重画边；用 rAF 节流；坐标取整；CSS 抖动处理配合 index.css。

(function () {
    const vscode = acquireVsCodeApi();

    // 图表数据
    let graph = {
        nodes: [],
        edges: [],
        id: "g",
        title: "untitled",
        metadata: {},
    };

    // DOM 元素
    const wrap = document.getElementById("canvasWrap");
    const canvas = document.getElementById("canvas");
    const nodeContainer = document.getElementById("nodes");
    const edgeSvg = document.querySelector("svg.edges");
    const nodeCountEl = document.getElementById("node-count");
    const edgeCountEl = document.getElementById("edge-count");
    const breadcrumbEl = document.getElementById("breadcrumb");
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

    // 初始化
    function init() {
        setupEventListeners();
        notifyReady();
    }

    // 设置事件监听
    function setupEventListeners() {
        // 工具栏按钮
        document.getElementById('btn-reset-view').addEventListener('click', resetView);
        document.getElementById('btn-fit-view').addEventListener('click', fitView);
        document.getElementById('btn-zoom-in').addEventListener('click', () => zoom(1.2));
        document.getElementById('btn-zoom-out').addEventListener('click', () => zoom(0.8));
        document.getElementById('btn-help').addEventListener('click', toggleHelp);

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

    // 通知扩展已就绪
    function notifyReady() {
        vscode.postMessage({ type: 'ready' });
    }

    // 处理来自扩展的消息
    function handleMessage(event) {
        const msg = event.data;

        if (msg?.type === 'init-graph') {
            graph = msg.payload;
            console.log('Rendering graph:', graph.title, graph);
            
            // 初始化一次节点与边
            renderNodesOnce();
            initEdgesLayerOnce();
            drawEdges();
            updateStats();
            updateBreadcrumb(graph);

            // 自动适应视图
            setTimeout(() => fitView(), 100);
        } else if (msg?.type === 'open-help') {
            // 响应来自扩展的打开帮助命令
            openHelp();
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
        nodeCountEl.textContent = `节点: ${graph.nodes.length}`;
        edgeCountEl.textContent = `边: ${graph.edges.length}`;
    }

    // 更新面包屑
    function updateBreadcrumb(graph) {
        const metadata = graph.metadata || {};
        const rootPath = metadata.rootPath || '';
        const relativePath = metadata.relativePath || '';
        const scanMode = metadata.scanMode || 'deep';

        const modeText = scanMode === 'shallow' ? '📂 当前目录' : '🌳 递归扫描';

        breadcrumbEl.innerHTML = `
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
    });

    // 启动
    init();
})();
