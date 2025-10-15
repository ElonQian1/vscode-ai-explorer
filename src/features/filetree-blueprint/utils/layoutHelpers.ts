// src/features/filetree-blueprint/utils/layoutHelpers.ts
// [module: filetree-blueprint] [tags: Utils, Layout]
/**
 * 布局辅助工具
 * 提供节点位置计算等布局相关功能
 */

import { Position } from '../domain/FileTreeScanner';

/**
 * 网格布局计算器
 * 
 * @param count 节点数量
 * @param width 节点宽度
 * @param height 节点高度
 * @param offsetX X 轴偏移量
 * @param offsetY Y 轴偏移量
 * @param maxColumns 最大列数（默认自动计算）
 * @returns 位置数组
 */
export function gridLayout(
    count: number,
    width: number = 200,
    height: number = 140,
    offsetX: number = 80,
    offsetY: number = 80,
    maxColumns?: number
): Position[] {
    // 根据画布宽度计算最大列数（假设画布宽度 1200px）
    const canvasWidth = 1200;
    const cols = maxColumns ?? Math.max(1, Math.floor((canvasWidth - offsetX) / width));

    return Array.from({ length: count }, (_, index) => ({
        x: offsetX + (index % cols) * width,
        y: offsetY + Math.floor(index / cols) * height
    }));
}

/**
 * 圆形布局计算器
 * 
 * @param count 节点数量
 * @param radius 圆的半径
 * @param centerX 圆心 X 坐标
 * @param centerY 圆心 Y 坐标
 * @returns 位置数组
 */
export function circleLayout(
    count: number,
    radius: number = 300,
    centerX: number = 400,
    centerY: number = 300
): Position[] {
    if (count === 0) return [];
    if (count === 1) return [{ x: centerX, y: centerY }];

    const angleStep = (2 * Math.PI) / count;

    return Array.from({ length: count }, (_, index) => {
        const angle = index * angleStep - Math.PI / 2; // 从顶部开始
        return {
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle)
        };
    });
}

/**
 * 树形布局辅助计算
 * 简化版，用于父子层级关系
 */
export function treeLayout(
    count: number,
    levelWidth: number = 200,
    levelHeight: number = 150,
    startX: number = 100,
    startY: number = 100
): Position[] {
    return Array.from({ length: count }, (_, index) => ({
        x: startX + (index % 5) * levelWidth,
        y: startY + Math.floor(index / 5) * levelHeight
    }));
}
