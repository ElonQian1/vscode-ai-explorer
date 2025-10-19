/**
 * 布局引擎服务 - 基于elkjs实现蓝图式自动布局
 * 支持节点展开/收起时的动态重排，实现"挤开其他节点"的效果
 */

(function (global, factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        // CommonJS - 需要动态导入elkjs
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(factory);
    } else {
        // 浏览器全局
        global.layoutEngine = factory();
    }
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    // ===== 布局配置 =====
    const LAYOUT_CONFIG = {
        algorithm: 'layered',           // elkjs分层算法，类似UE蓝图
        nodeSpacing: 50,                // 节点间距
        layerSpacing: 80,               // 层间距
        edgeRouting: 'ORTHOGONAL',      // 正交连线
        direction: 'RIGHT'              // 从左到右布局
    };

    // ===== 节点尺寸策略 =====
    const NODE_SIZE = {
        COMPACT: { width: 160, height: 40 },        // 普通节点（小卡片）
        EXPANDED: { width: 520, height: 420 },      // 展开节点（大卡片）
        FILE: { width: 140, height: 35 },           // 文件节点
        FOLDER: { width: 180, height: 45 }          // 文件夹节点
    };

    // ===== 状态管理 =====
    let graphData = { nodes: [], edges: [] };
    let expandedNodes = new Set(); // 记录已展开的节点
    let elkInstance = null;
    let layoutInProgress = false;

    // ===== 布局引擎类 =====
    class LayoutEngine {
        constructor() {
            this.onLayoutComplete = null;
            this.onLayoutStart = null;
            
            // 动态加载elkjs (浏览器环境)
            this.initELK();
        }

        async initELK() {
            try {
                // 🔧 CSP修复：直接使用本地加载的window.ELK
                if (window.ELK && typeof window.ELK === 'function') {
                    elkInstance = new window.ELK();
                    console.log('[layoutEngine] ✅ 本地ELK.js初始化成功');
                } else {
                    console.warn('[layoutEngine] ⚠️ 本地ELK.js未找到，使用网格兜底布局');
                    elkInstance = this.createFallbackLayout();
                }
            } catch (error) {
                console.warn('[layoutEngine] ELK初始化失败，使用网格兜底布局:', error);
                elkInstance = this.createFallbackLayout();
            }
        }

        // 降级布局实现（简单的力导向）
        createFallbackLayout() {
            return {
                layout: async (graph) => {
                    console.log('[layoutEngine] 🔄 使用降级网格布局算法');
                    
                    // ✅ 真实网格布局：一定返回坐标，保证节点能画出来
                    const children = graph.children || [];
                    const COLS = Math.ceil(Math.sqrt(children.length || 1));
                    const GAPX = 80, GAPY = 60, W = 160, H = 40;
                    
                    children.forEach((c, i) => {
                        const col = i % COLS;
                        const row = Math.floor(i / COLS);
                        c.x = col * (W + GAPX);
                        c.y = row * (H + GAPY);
                        // 确保尺寸信息存在
                        c.width = c.width || W;
                        c.height = c.height || H;
                    });
                    
                    console.log(`[layoutEngine] ✅ 网格布局完成: ${children.length}个节点已分配坐标`);
                    
                    return {
                        id: 'root',
                        children: children,
                        edges: graph.edges || []
                    };
                }
            };
        }

        /**
         * 设置图数据
         */
        setGraph(nodes, edges) {
            graphData = { nodes: [...nodes], edges: [...edges] };
            console.log(`[layoutEngine] 📊 设置图数据: ${nodes.length} 节点, ${edges.length} 边`);
        }

        /**
         * 标记节点为展开状态
         */
        markExpanded(nodeId, expanded = true) {
            if (expanded) {
                expandedNodes.add(nodeId);
                console.log(`[layoutEngine] 📌 节点展开: ${nodeId}`);
            } else {
                expandedNodes.delete(nodeId);
                console.log(`[layoutEngine] 📌 节点收起: ${nodeId}`);
            }
        }

        /**
         * 获取节点尺寸（根据展开状态）
         */
        getNodeSize(node) {
            if (expandedNodes.has(node.id)) {
                return NODE_SIZE.EXPANDED;
            }
            
            switch (node.type) {
                case 'file':
                    return NODE_SIZE.FILE;
                case 'folder':
                    return NODE_SIZE.FOLDER;
                default:
                    return NODE_SIZE.COMPACT;
            }
        }

        /**
         * 执行布局重排
         */
        async reflow(reason = 'manual', changedNodes = []) {
            if (layoutInProgress) {
                console.log('[layoutEngine] ⏳ 布局进行中，跳过本次请求');
                return false;
            }

            if (!elkInstance) {
                console.warn('[layoutEngine] ⚠️ ELK实例未就绪');
                return false;
            }

            layoutInProgress = true;
            console.log(`[layoutEngine] 🔄 开始重新布局: ${reason}, 影响节点:`, changedNodes);

            try {
                this.onLayoutStart?.(reason, changedNodes);

                // 准备ELK图数据
                const elkGraph = this.prepareELKGraph();
                
                // 执行布局计算
                const layoutResult = await elkInstance.layout(elkGraph);
                
                // 应用布局结果
                const appliedLayout = this.applyLayout(layoutResult);
                
                console.log('[layoutEngine] ✅ 布局完成');
                this.onLayoutComplete?.(appliedLayout, reason);
                
                return appliedLayout;
                
            } catch (error) {
                console.error('[layoutEngine] ❌ 布局失败:', error);
                return null;
            } finally {
                layoutInProgress = false;
            }
        }

        /**
         * 准备ELK图数据结构
         */
        prepareELKGraph() {
            const elkNodes = graphData.nodes.map(node => {
                const size = this.getNodeSize(node);
                return {
                    id: node.id,
                    width: size.width,
                    height: size.height,
                    layoutOptions: expandedNodes.has(node.id) ? {
                        'elk.padding': '[top=10,left=10,bottom=10,right=10]'
                    } : {}
                };
            });

            const elkEdges = graphData.edges.map(edge => ({
                id: edge.id || `${edge.from?.node || edge.from}-${edge.to?.node || edge.to}`,
                sources: [edge.from?.node || edge.from],
                targets: [edge.to?.node || edge.to]
            }));

            return {
                id: 'root',
                layoutOptions: {
                    'elk.algorithm': LAYOUT_CONFIG.algorithm,
                    'elk.spacing.nodeNode': LAYOUT_CONFIG.nodeSpacing.toString(),
                    'elk.layered.spacing.nodeNodeBetweenLayers': LAYOUT_CONFIG.layerSpacing.toString(),
                    'elk.edgeRouting': LAYOUT_CONFIG.edgeRouting,
                    'elk.direction': LAYOUT_CONFIG.direction,
                    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
                    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF'
                },
                children: elkNodes,
                edges: elkEdges
            };
        }

        /**
         * 应用布局结果到图数据
         */
        applyLayout(layoutResult) {
            if (!layoutResult || !layoutResult.children) {
                console.warn('[layoutEngine] ⚠️ 无效的布局结果');
                return null;
            }

            // 更新节点位置
            const positionUpdates = {};
            
            layoutResult.children.forEach(elkNode => {
                const originalNode = graphData.nodes.find(n => n.id === elkNode.id);
                if (originalNode && elkNode.x !== undefined && elkNode.y !== undefined) {
                    positionUpdates[elkNode.id] = {
                        x: elkNode.x,
                        y: elkNode.y,
                        width: elkNode.width,
                        height: elkNode.height
                    };
                }
            });

            console.log(`[layoutEngine] 📍 更新 ${Object.keys(positionUpdates).length} 个节点位置`);
            
            return {
                nodes: positionUpdates,
                edges: this.calculateEdgeRoutes(layoutResult),
                bounds: this.calculateGraphBounds(layoutResult)
            };
        }

        /**
         * 计算边的路由路径
         */
        calculateEdgeRoutes(layoutResult) {
            const edgeRoutes = {};
            
            if (layoutResult.edges) {
                layoutResult.edges.forEach(edge => {
                    if (edge.sections && edge.sections.length > 0) {
                        const section = edge.sections[0];
                        edgeRoutes[edge.id] = {
                            startPoint: { x: section.startX, y: section.startY },
                            endPoint: { x: section.endX, y: section.endY },
                            bendPoints: section.bendPoints || []
                        };
                    }
                });
            }
            
            return edgeRoutes;
        }

        /**
         * 计算图的总边界
         */
        calculateGraphBounds(layoutResult) {
            if (!layoutResult.children || layoutResult.children.length === 0) {
                return { x: 0, y: 0, width: 800, height: 600 };
            }

            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;

            layoutResult.children.forEach(node => {
                minX = Math.min(minX, node.x);
                minY = Math.min(minY, node.y);
                maxX = Math.max(maxX, node.x + node.width);
                maxY = Math.max(maxY, node.y + node.height);
            });

            return {
                x: minX,
                y: minY,
                width: maxX - minX + 100,  // 添加边距
                height: maxY - minY + 100
            };
        }

        /**
         * 强制重新布局（忽略进行状态）
         */
        async forceReflow(reason = 'force') {
            layoutInProgress = false;
            return await this.reflow(reason);
        }

        /**
         * 获取当前状态
         */
        getState() {
            return {
                layoutInProgress,
                expandedNodes: Array.from(expandedNodes),
                nodeCount: graphData.nodes.length,
                edgeCount: graphData.edges.length
            };
        }
    }

    // ===== 导出API =====
    return {
        /**
         * 创建布局引擎实例
         */
        create() {
            return new LayoutEngine();
        },

        /**
         * 节点尺寸常量
         */
        NODE_SIZE,

        /**
         * 布局配置
         */
        LAYOUT_CONFIG
    };
});