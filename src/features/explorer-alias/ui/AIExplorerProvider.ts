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
    private translateUseCase?: any; // EnhancedTranslateBatchUseCase instance

    constructor(
        private logger: Logger,
        private workspaceFolder: vscode.WorkspaceFolder,
        private cache?: any, // KVCache instance for loading aliases
        private dictionary?: any, // DictionaryManager instance
        translateUseCase?: any // Optional translation use case
    ) {
        this.translateUseCase = translateUseCase;
        this.loadFileTree().catch(error => {
            this.logger.error('初始化文件树失败', error);
        });
    }

    async refresh(): Promise<void> {
        this.logger.info('刷新 AI 资源管理器树视图');
        await this.loadFileTree();
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

    private async loadFileTree(): Promise<void> {
        if (!this.workspaceFolder) {
            this.fileTree = [];
            return;
        }

        try {
            this.fileTree = await this.buildFileTree(this.workspaceFolder.uri.fsPath);
            this.logger.debug(`加载文件树完成，共 ${this.countNodes(this.fileTree)} 个节点`);
        } catch (error) {
            this.logger.error('加载文件树失败', error);
            this.fileTree = [];
        }
    }

    private async buildFileTree(dirPath: string, relativePath: string = ''): Promise<FileNode[]> {
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
                    children: item.isDirectory() ? await this.buildFileTree(fullPath, itemRelativePath) : undefined
                };

                // 从缓存或词典加载已有的别名
                node.alias = await this.loadAliasFromCache(item.name);

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

    /**
     * 从缓存或词典加载别名
     */
    private async loadAliasFromCache(fileName: string): Promise<string | undefined> {
        try {
            // 1. 先尝试从缓存加载
            if (this.cache) {
                const cacheKey = `enhanced-translation:${fileName}`;
                const cached = await this.cache.get(cacheKey);
                if (cached && cached.translated) {
                    return cached.translated;
                }
            }

            // 2. 尝试从字典获取
            if (this.dictionary) {
                const translated = this.dictionary.translate(fileName);
                if (translated) {
                    return translated;
                }
            }

            return undefined;
        } catch (error) {
            this.logger.warn(`加载别名失败: ${fileName}`, error);
            return undefined;
        }
    }

    /**
     * 复制节点别名到剪贴板
     */
    async copyAlias(item?: FileNode): Promise<void> {
        if (!item) {
            vscode.window.showInformationMessage('请选择一个文件或文件夹');
            return;
        }

        const alias = item.alias;
        if (!alias || alias === item.name) {
            vscode.window.showInformationMessage('此节点暂无别名可复制');
            return;
        }

        try {
            await vscode.env.clipboard.writeText(alias);
            vscode.window.showInformationMessage(`已复制别名：${alias}`);
            this.logger.info(`复制别名: ${item.name} -> ${alias}`);
        } catch (error) {
            this.logger.error('复制别名失败', error);
            vscode.window.showErrorMessage('复制别名失败');
        }
    }

    /**
     * 用别名重命名真实文件（谨慎操作）
     */
    async renameToAlias(item?: FileNode): Promise<void> {
        if (!item) {
            vscode.window.showInformationMessage('请选择一个文件或文件夹');
            return;
        }

        const alias = item.alias;
        if (!alias || alias === item.name) {
            vscode.window.showInformationMessage('此节点暂无别名可用于重命名');
            return;
        }

        // 安全确认
        const confirmation = await vscode.window.showWarningMessage(
            `确定要将 "${item.name}" 重命名为 "${alias}" 吗？\n\n⚠️ 这将修改真实的文件/文件夹名称，请谨慎操作！`,
            { modal: true },
            '确认重命名',
            '取消'
        );

        if (confirmation !== '确认重命名') {
            return;
        }

        try {
            const oldUri = vscode.Uri.file(item.path);
            const newPath = path.join(path.dirname(item.path), this.sanitizeFileName(alias));
            const newUri = vscode.Uri.file(newPath);

            await vscode.workspace.fs.rename(oldUri, newUri, { overwrite: false });
            
            // 更新节点信息
            item.name = alias;
            item.path = newPath;
            item.alias = undefined; // 重命名后清除别名

            await this.refresh();
            vscode.window.showInformationMessage(`成功重命名为：${alias}`);
            this.logger.info(`重命名成功: ${item.path} -> ${newPath}`);

        } catch (error) {
            this.logger.error('重命名失败', error);
            vscode.window.showErrorMessage(`重命名失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 清除节点的翻译缓存
     */
    async clearCacheForNode(item?: FileNode): Promise<void> {
        if (!item) {
            vscode.window.showInformationMessage('请选择一个文件或文件夹');
            return;
        }

        try {
            if (this.cache) {
                const cacheKey = `enhanced-translation:${item.name}`;
                await this.cache.delete(cacheKey);
                
                // 清除别名
                item.alias = undefined;
                this._onDidChangeTreeData.fire(item);
                
                vscode.window.showInformationMessage(`已清除缓存：${item.name}`);
                this.logger.info(`清除缓存: ${item.name}`);
            }
        } catch (error) {
            this.logger.error('清除缓存失败', error);
            vscode.window.showErrorMessage('清除缓存失败');
        }
    }

    /**
     * 翻译单个文件或文件夹名（仅此项，不递归子项）
     * 兼容多种参数来源：AI Explorer 节点、原生资源管理器 Uri、活动编辑器
     */
    async translateThisFile(input?: any): Promise<void> {
        try {
            // 1. 参数解析
            const uri = await this.resolveToFileUri(input);
            if (!uri) {
                vscode.window.showWarningMessage("请选择一个文件或文件夹执行翻译");
                return;
            }

            // 2. 获取文件/文件夹信息
            let stat: vscode.FileStat | undefined;
            try {
                stat = await vscode.workspace.fs.stat(uri);
            } catch {
                stat = undefined;
            }
            
            if (!stat) {
                vscode.window.showWarningMessage("无法访问选中的项目");
                return;
            }

            const isFile = stat.type === vscode.FileType.File;
            const isDirectory = stat.type === vscode.FileType.Directory;

            // 3. 获取名称
            const fsPath = uri.fsPath;
            const itemName = path.basename(fsPath);
            const itemType = isFile ? 'file' : 'folder';
            const itemTypeText = isFile ? '文件' : '文件夹';

            // 4. 检查是否需要翻译
            if (!this.shouldTranslate(itemName)) {
                vscode.window.showInformationMessage(`${itemTypeText} "${itemName}" 无需翻译`);
                return;
            }

            // 5. 显示进度
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `正在翻译${itemTypeText}: ${itemName}`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0 });

                // 6. 调用翻译服务（如果已注入）
                if (!this.translateUseCase) {
                    // 降级：仅从缓存/词典加载
                    const alias = await this.loadAliasFromCache(itemName);
                    if (alias) {
                        const node = this.findNodeByPath(fsPath);
                        if (node) {
                            this.updateAlias(node, alias);
                        }
                        vscode.window.showInformationMessage(
                            `已加载别名：${itemName} → ${alias}（来源：缓存/词典）`
                        );
                    } else {
                        vscode.window.showInformationMessage(
                            `${itemTypeText} "${itemName}" 暂无别名，请先配置翻译服务`
                        );
                    }
                    return;
                }

                progress.report({ increment: 30, message: '调用翻译服务...' });

                // 7. 执行翻译
                const result = await this.translateUseCase.translateSingle(itemName, {
                    forceRefresh: false,
                    enableLearning: true
                });

                progress.report({ increment: 70, message: '更新视图...' });

                // 8. 更新树视图
                const node = this.findNodeByPath(fsPath);
                if (node && result.translated !== result.original) {
                    this.updateAlias(node, result.translated);
                }

                // 9. 显示结果
                const sourceMap: Record<string, string> = {
                    'dictionary': '词典',
                    'rule': '规则',
                    'ai': 'AI',
                    'cache': '缓存',
                    'fallback': '回退',
                    'error': '错误'
                };

                const sourceName = sourceMap[result.source || 'unknown'] || result.source || '未知';
                
                if (result.translated !== result.original) {
                    vscode.window.showInformationMessage(
                        `✅ 已翻译${itemTypeText}：${itemName} → ${result.translated}（来源：${sourceName}）`
                    );
                    this.logger.info(`翻译成功: ${itemName} -> ${result.translated} (来源: ${result.source})`);
                } else {
                    // 翻译结果与原名相同
                    this.logger.warn(`翻译结果与原文相同: ${itemName}, 来源: ${result.source}`);
                    
                    if (result.source === 'fallback' || result.source === 'error') {
                        // AI 翻译失败
                        vscode.window.showWarningMessage(
                            `⚠️ ${itemTypeText} ${itemName} 翻译失败（来源：${sourceName}）\n可能原因：AI 服务未配置或不可用`,
                            '检查AI状态',
                            '强制AI翻译',
                            '设置API Key'
                        ).then(action => {
                            if (action === '检查AI状态') {
                                vscode.commands.executeCommand('aiExplorer.checkAIStatus');
                            } else if (action === '强制AI翻译') {
                                vscode.commands.executeCommand('aiExplorer.forceAITranslate', input);
                            } else if (action === '设置API Key') {
                                vscode.commands.executeCommand('aiExplorer.setOpenAIKey');
                            }
                        });
                    } else {
                        // 其他情况（词典/规则/缓存返回原名）
                        vscode.window.showInformationMessage(
                            `ℹ️ ${itemTypeText} ${itemName} 无需翻译或无法翻译（来源：${sourceName}）`
                        );
                    }
                }

                progress.report({ increment: 100 });
            });

        } catch (error) {
            this.logger.error('单文件翻译失败', error);
            vscode.window.showErrorMessage(
                `翻译失败: ${error instanceof Error ? error.message : '未知错误'}`
            );
        }
    }

    /**
     * 强制使用 AI 翻译文件或文件夹（绕过缓存/词典/规则，直接调用 AI）
     * 用于诊断 AI 是否正常工作，或强制重新翻译
     */
    async forceAITranslate(input?: any): Promise<void> {
        try {
            // 1. 参数解析
            const uri = await this.resolveToFileUri(input);
            if (!uri) {
                vscode.window.showWarningMessage("请选择一个文件或文件夹执行强制 AI 翻译");
                return;
            }

            // 2. 获取项目信息
            let stat: vscode.FileStat | undefined;
            try {
                stat = await vscode.workspace.fs.stat(uri);
            } catch {
                stat = undefined;
            }
            
            if (!stat) {
                vscode.window.showWarningMessage("无法访问选中的项目");
                return;
            }

            const isFile = stat.type === vscode.FileType.File;
            const itemType = isFile ? '文件' : '文件夹';

            // 3. 获取名称
            const fsPath = uri.fsPath;
            const itemName = path.basename(fsPath);

            // 4. 检查 AI 服务是否可用
            if (!this.translateUseCase) {
                vscode.window.showErrorMessage(
                    '翻译服务未初始化，请检查扩展配置',
                    '检查AI状态'
                ).then(action => {
                    if (action === '检查AI状态') {
                        vscode.commands.executeCommand('aiExplorer.checkAIStatus');
                    }
                });
                return;
            }

            // 5. 显示进度并执行翻译
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `正在用 AI 翻译${itemType}: ${itemName}`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: '清除缓存...' });

                // 清除缓存，确保调用 AI
                if (this.cache) {
                    const cacheKey = `enhanced-translation:${itemName}`;
                    await this.cache.delete(cacheKey);
                }

                progress.report({ increment: 20, message: '调用 AI 服务...' });

                // 强制刷新翻译（跳过缓存）
                const result = await this.translateUseCase.translateSingle(itemName, {
                    forceRefresh: true,  // 强制刷新，跳过缓存
                    enableLearning: true  // 保存到学习词典
                });

                progress.report({ increment: 70, message: '更新视图...' });

                // 更新树视图
                const node = this.findNodeByPath(fsPath);
                if (node && result.translated !== result.original) {
                    this.updateAlias(node, result.translated);
                }

                progress.report({ increment: 100 });

                // 显示结果
                const sourceMap: Record<string, string> = {
                    'dictionary': '词典',
                    'rule': '规则',
                    'ai': 'AI',
                    'cache': '缓存',
                    'fallback': '回退',
                    'error': '错误'
                };

                const sourceName = sourceMap[result.source || 'unknown'] || result.source || '未知';
                
                if (result.source === 'ai' && result.translated !== result.original) {
                    vscode.window.showInformationMessage(
                        `✅ AI 翻译成功（${itemType}）：${itemName} → ${result.translated}\n已保存到学习词典，下次自动使用此翻译`
                    );
                    this.logger.info(`强制 AI 翻译成功: ${itemName} -> ${result.translated}`);
                } else if (result.source === 'fallback' || result.source === 'error') {
                    vscode.window.showErrorMessage(
                        `❌ ${itemType} AI 翻译失败（来源：${sourceName}）\n可能原因：\n1. AI 服务未配置或 API Key 无效\n2. 网络连接问题\n3. AI 服务不可用`,
                        '检查AI状态',
                        '设置API Key'
                    ).then(action => {
                        if (action === '检查AI状态') {
                            vscode.commands.executeCommand('aiExplorer.checkAIStatus');
                        } else if (action === '设置API Key') {
                            vscode.commands.executeCommand('aiExplorer.setOpenAIKey');
                        }
                    });
                    this.logger.warn(`强制 AI 翻译失败: ${itemName}, 来源: ${result.source}`);
                } else {
                    // 来自词典或规则（即使强制刷新也可能命中词典）
                    vscode.window.showInformationMessage(
                        `ℹ️ 翻译结果（${itemType}）：${itemName} → ${result.translated}（来源：${sourceName}）`
                    );
                }
            });

        } catch (error) {
            this.logger.error('强制 AI 翻译失败', error);
            vscode.window.showErrorMessage(
                `强制翻译失败: ${error instanceof Error ? error.message : '未知错误'}`
            );
        }
    }

    /**
     * 解析来自不同入口的参数为文件 Uri
     * 支持：AI Explorer 节点、vscode.Uri、活动编辑器、字符串路径等
     */
    private async resolveToFileUri(input?: any): Promise<vscode.Uri | undefined> {
        if (!input) {
            // 无参数 → 使用活动编辑器
            return vscode.window.activeTextEditor?.document?.uri;
        }
        
        // 直接是 Uri
        if (input instanceof vscode.Uri) {
            return input;
        }
        
        // 字符串路径
        if (typeof input === "string") {
            return vscode.Uri.file(input);
        }
        
        // 各种可能的对象格式
        if (input.resourceUri instanceof vscode.Uri) {
            return input.resourceUri;
        }
        
        if (input.uri instanceof vscode.Uri) {
            return input.uri;
        }
        
        // AI Explorer 的 FileNode (通过 TreeItem 传入)
        if (input.node && input.node.path) {
            return vscode.Uri.file(input.node.path);
        }
        
        if (input.path && typeof input.path === "string") {
            return vscode.Uri.file(input.path);
        }
        
        return undefined;
    }

    /**
     * 清理文件名中的非法字符
     */
    private sanitizeFileName(filename: string): string {
        return filename
            .replace(/[\\/:*?"<>|]/g, '-') // 替换非法字符
            .replace(/\s+/g, ' ') // 规范化空格
            .trim()
            .substring(0, 200); // 限制长度
    }
}