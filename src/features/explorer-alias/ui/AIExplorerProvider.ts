// src/features/explorer-alias/ui/AIExplorerProvider.ts
// [module: explorer-alias] [tags: TreeView, Provider, UI, VSCode]
/**
 * AI 资源管理器树视图数据提供者
 * 负责展示文件目录结构和中文别名
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { FileNode } from '../../../shared/types';
import { Logger } from '../../../core/logging/Logger';
import { ExplorerTreeItem } from './ExplorerTreeItem';

export class AIExplorerProvider implements vscode.TreeDataProvider<FileNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileNode | undefined | null | void> = new vscode.EventEmitter<FileNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private showAlias: boolean = true;
    private fileTree: FileNode[] = [];

    constructor(
        private logger: Logger,
        private workspaceFolder: vscode.WorkspaceFolder
    ) {
        this.loadFileTree();
    }

    refresh(): void {
        this.logger.info('刷新 AI 资源管理器树视图');
        this.loadFileTree();
        this._onDidChangeTreeData.fire();
    }

    toggleAliasDisplay(): void {
        this.showAlias = !this.showAlias;
        this.logger.info(`切换别名显示: ${this.showAlias ? '显示' : '隐藏'}`);
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FileNode): vscode.TreeItem {
        return new ExplorerTreeItem(element, this.showAlias);
    }

    getChildren(element?: FileNode): Thenable<FileNode[]> {
        if (!element) {
            // 返回根级别的文件和文件夹
            return Promise.resolve(this.fileTree);
        } else {
            // 返回指定节点的子节点
            return Promise.resolve(element.children || []);
        }
    }

    /**
     * 添加或更新文件节点的别名
     */
    updateAlias(node: FileNode, alias: string): void {
        node.alias = alias;
        this.logger.debug(`更新别名: ${node.name} -> ${alias}`);
        this._onDidChangeTreeData.fire(node);
    }

    /**
     * 获取指定路径的节点
     */
    findNodeByPath(targetPath: string): FileNode | null {
        const findInTree = (nodes: FileNode[]): FileNode | null => {
            for (const node of nodes) {
                if (node.path === targetPath) {
                    return node;
                }
                if (node.children) {
                    const found = findInTree(node.children);
                    if (found) {
                        return found;
                    }
                }
            }
            return null;
        };

        return findInTree(this.fileTree);
    }

    /**
     * 获取所有需要翻译的文件节点
     */
    getNodesNeedingTranslation(): FileNode[] {
        const result: FileNode[] = [];
        
        const traverse = (nodes: FileNode[]) => {
            for (const node of nodes) {
                if (!node.alias && this.shouldTranslate(node.name)) {
                    result.push(node);
                }
                if (node.children) {
                    traverse(node.children);
                }
            }
        };

        traverse(this.fileTree);
        return result;
    }

    private loadFileTree(): void {
        if (!this.workspaceFolder) {
            this.fileTree = [];
            return;
        }

        try {
            this.fileTree = this.buildFileTree(this.workspaceFolder.uri.fsPath);
            this.logger.debug(`加载文件树完成，共 ${this.countNodes(this.fileTree)} 个节点`);
        } catch (error) {
            this.logger.error('加载文件树失败', error);
            this.fileTree = [];
        }
    }

    private buildFileTree(dirPath: string, relativePath: string = ''): FileNode[] {
        const result: FileNode[] = [];

        try {
            const items = require('fs').readdirSync(dirPath, { withFileTypes: true });
            
            for (const item of items) {
                // 跳过隐藏文件和不需要显示的目录
                if (this.shouldSkip(item.name)) {
                    continue;
                }

                const fullPath = path.join(dirPath, item.name);
                const itemRelativePath = path.join(relativePath, item.name);

                const node: FileNode = {
                    path: fullPath,
                    name: item.name,
                    type: item.isDirectory() ? 'directory' : 'file',
                    children: item.isDirectory() ? this.buildFileTree(fullPath, itemRelativePath) : undefined
                };

                // TODO: 从缓存加载已有的别名
                // node.alias = await this.loadAliasFromCache(fullPath);

                result.push(node);
            }
        } catch (error) {
            this.logger.warn(`读取目录失败: ${dirPath}`, error);
        }

        return result.sort((a, b) => {
            // 文件夹排在前面，然后按名称排序
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
    }

    private shouldSkip(name: string): boolean {
        const skipPatterns = [
            /^\\./, // 隐藏文件
            /^node_modules$/,
            /^out$/,
            /^\\.vscode$/,
            /^\\.git$/,
            /^dist$/,
            /^build$/,
            /^\\.nyc_output$/,
            /^coverage$/
        ];

        return skipPatterns.some(pattern => pattern.test(name));
    }

    private shouldTranslate(filename: string): boolean {
        // 只翻译英文文件名（包含英文字母）
        return /[a-zA-Z]/.test(filename) && 
               !filename.startsWith('.') &&
               filename !== 'README.md' &&
               filename !== 'LICENSE';
    }

    private countNodes(nodes: FileNode[]): number {
        let count = nodes.length;
        for (const node of nodes) {
            if (node.children) {
                count += this.countNodes(node.children);
            }
        }
        return count;
    }
}