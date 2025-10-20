/**
 * PositionsStore - UI 位置持久化存储服务
 * 
 * 职责：
 * 1. 保存卡片/节点的拖拽位置到本地文件
 * 2. 读取已保存的位置数据
 * 3. 提供清理和管理接口
 * 
 * 存储格式：
 * ```json
 * {
 *   "src/index.ts": { "x": 100, "y": 200, "posClass": "pos-abc123", "t": 1730000000 },
 *   "src/utils.ts": { "x": 300, "y": 150, "posClass": "pos-def456", "t": 1730000000 }
 * }
 * ```
 * 
 * 存储路径：`<workspace>/.ai-explorer-cache/ui/positions.json`
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface Position {
    x: number;
    y: number;
    posClass?: string;
    t: number; // timestamp
}

export interface PositionsMap {
    [filePath: string]: Position;
}

export class PositionsStore {
    private readonly workspaceUri: vscode.Uri;
    private readonly storeUri: vscode.Uri;
    private cache: PositionsMap | null = null;

    constructor(workspaceUri: vscode.Uri) {
        this.workspaceUri = workspaceUri;
        const uiDir = vscode.Uri.joinPath(workspaceUri, '.ai-explorer-cache', 'ui');
        this.storeUri = vscode.Uri.joinPath(uiDir, 'positions.json');
    }

    /**
     * 获取所有位置数据
     * @returns 位置映射表
     */
    async getAll(): Promise<PositionsMap> {
        // 使用缓存（避免频繁读取文件）
        if (this.cache !== null) {
            return this.cache;
        }

        try {
            const fileData = await vscode.workspace.fs.readFile(this.storeUri);
            const content = Buffer.from(fileData).toString('utf8');
            this.cache = JSON.parse(content);
            console.log('[PositionsStore] ✅ 加载位置数据:', Object.keys(this.cache!).length, '条');
            return this.cache!;
        } catch (error) {
            // 文件不存在或解析失败，返回空对象
            console.log('[PositionsStore] ℹ️ 位置文件不存在，返回空数据');
            this.cache = {};
            return this.cache;
        }
    }

    /**
     * 设置单个文件的位置
     * @param filePath - 文件路径（相对路径）
     * @param x - X 坐标
     * @param y - Y 坐标
     * @param posClass - 位置类名（可选）
     */
    async set(filePath: string, x: number, y: number, posClass?: string): Promise<void> {
        const all = await this.getAll();
        
        all[filePath] = {
            x,
            y,
            posClass: posClass || this.generatePosClass(filePath),
            t: Date.now()
        };

        await this.save(all);
        console.log(`[PositionsStore] 💾 保存位置: ${filePath} (${x}, ${y})`);
    }

    /**
     * 批量设置位置
     * @param positions - 位置映射表
     */
    async setMany(positions: PositionsMap): Promise<void> {
        const all = await this.getAll();
        
        Object.entries(positions).forEach(([filePath, position]) => {
            all[filePath] = {
                ...position,
                t: Date.now()
            };
        });

        await this.save(all);
        console.log(`[PositionsStore] 💾 批量保存位置: ${Object.keys(positions).length} 条`);
    }

    /**
     * 获取单个文件的位置
     * @param filePath - 文件路径
     * @returns 位置数据或 undefined
     */
    async get(filePath: string): Promise<Position | undefined> {
        const all = await this.getAll();
        return all[filePath];
    }

    /**
     * 删除单个文件的位置
     * @param filePath - 文件路径
     */
    async delete(filePath: string): Promise<void> {
        const all = await this.getAll();
        
        if (all[filePath]) {
            delete all[filePath];
            await this.save(all);
            console.log(`[PositionsStore] 🗑️ 删除位置: ${filePath}`);
        }
    }

    /**
     * 清空所有位置数据
     */
    async clear(): Promise<void> {
        await this.save({});
        console.log('[PositionsStore] 🧹 清空所有位置数据');
    }

    /**
     * 清理过期数据（超过 30 天未更新）
     * @param daysThreshold - 天数阈值（默认 30）
     */
    async cleanup(daysThreshold: number = 30): Promise<number> {
        const all = await this.getAll();
        const now = Date.now();
        const threshold = daysThreshold * 24 * 60 * 60 * 1000;
        let cleaned = 0;

        Object.keys(all).forEach(filePath => {
            const position = all[filePath];
            if (now - position.t > threshold) {
                delete all[filePath];
                cleaned++;
            }
        });

        if (cleaned > 0) {
            await this.save(all);
            console.log(`[PositionsStore] 🧹 清理过期数据: ${cleaned} 条`);
        }

        return cleaned;
    }

    /**
     * 保存位置数据到文件
     * @private
     */
    private async save(data: PositionsMap): Promise<void> {
        try {
            // 确保目录存在
            const uiDir = vscode.Uri.joinPath(this.workspaceUri, '.ai-explorer-cache', 'ui');
            await vscode.workspace.fs.createDirectory(uiDir);

            // 写入文件
            const content = JSON.stringify(data, null, 2);
            await vscode.workspace.fs.writeFile(
                this.storeUri,
                new TextEncoder().encode(content)
            );

            // 更新缓存
            this.cache = data;
        } catch (error) {
            console.error('[PositionsStore] ❌ 保存失败:', error);
            throw error;
        }
    }

    /**
     * 生成位置类名（基于文件路径的哈希）
     * @private
     */
    private generatePosClass(filePath: string): string {
        // 简单的哈希函数
        let hash = 0;
        for (let i = 0; i < filePath.length; i++) {
            const char = filePath.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `pos-${Math.abs(hash).toString(36)}`;
    }

    /**
     * 获取存储文件路径（用于调试）
     */
    getStorePath(): string {
        return this.storeUri.fsPath;
    }
}
