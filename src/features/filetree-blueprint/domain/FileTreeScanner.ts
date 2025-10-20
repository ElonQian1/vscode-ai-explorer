// src/features/filetree-blueprint/domain/FileTreeScanner.ts
// [module: filetree-blueprint] [tags: Domain, FileSystem]
/**
 * 文件树扫描器
 * 负责递归扫描工作区目录，生成文件树结构
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../../../core/logging/Logger';
import { gridLayout } from '../utils/layoutHelpers';
import { toPosixRelative, uriToRelative } from '../../../shared/utils/pathUtils';

export type Position = { x: number; y: number };

export type Node = {
    id: string;
    label: string;
    type?: 'folder' | 'file' | 'module';
    position: Position;
    data?: Record<string, any>;
};

export type Endpoint = { node: string; port?: string };

export type Edge = {
    id: string;
    label?: string;
    from: Endpoint;
    to: Endpoint;
    data?: Record<string, any>;
};

export type Graph = {
    id: string;
    title: string;
    nodes: Node[];
    edges: Edge[];
    metadata?: any;
    savedPositions?: Record<string, { x: number; y: number }>; // Priority 3: 持久化位置
};

const DEFAULT_EXCLUDES = [
    '**/.git/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/out/**',
    '**/target/**',              // Rust 构建产物
    '**/build/**',
    '**/.vscode/**',
    '**/.idea/**',
    '**/.DS_Store',
    '**/tsconfig.tsbuildinfo',
    '**/.next/**',               // Next.js
    '**/.nuxt/**',               // Nuxt.js
    '**/vendor/**',              // PHP/Go 依赖
    '**/__pycache__/**',         // Python
    '**/.pytest_cache/**',
    '**/coverage/**',            // 测试覆盖率
    '**/.cargo/**',              // Rust Cargo
    '**/Cargo.lock'
];

export class FileTreeScanner {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * 扫描指定路径，生成文件树蓝图
     */
    async scanPath(rootUri: vscode.Uri, title?: string): Promise<Graph> {
        this.logger.info(`开始扫描路径: ${rootUri.fsPath}`);
        
        const stat = await vscode.workspace.fs.stat(rootUri);
        const isFolder = (stat.type & vscode.FileType.Directory) !== 0;

        const rootName = path.basename(rootUri.fsPath);
        const graphId = `filetree-${Date.now()}`;
        const graphTitle = title || `文件树蓝图: ${rootName}`;

        const nodes: Node[] = [];
        const edges: Edge[] = [];

        if (isFolder) {
            // 扫描文件夹
            await this.scanDirectory(rootUri, rootUri, nodes, edges, 0);
        } else {
            // 单个文件
            const relativePath = uriToRelative(rootUri, rootUri);
            nodes.push({
                id: rootUri.fsPath,
                label: rootName,
                type: 'file',
                position: { x: 0, y: 0 },
                data: { 
                    path: relativePath,  // ✅ 使用 POSIX 相对路径
                    absPath: rootUri.fsPath  // 保留绝对路径供内部使用
                }
            });
        }

        this.logger.info(`扫描完成: ${nodes.length} 个节点, ${edges.length} 条边`);

        return {
            id: graphId,
            title: graphTitle,
            nodes,
            edges,
            metadata: {
                graphType: 'filetree', // ✅ 关键：前端双击绑定依赖此字段！
                rootPath: rootUri.fsPath,
                scannedAt: new Date().toISOString(),
                nodeCount: nodes.length,
                edgeCount: edges.length,
                scanMode: 'deep'
            }
        };
    }

    /**
     * 浅层扫描：只扫描当前目录的直接子项（不递归）
     * 用于右键点击目录时的快速预览
     */
    async scanPathShallow(targetUri: vscode.Uri, workspaceRoot?: vscode.Uri): Promise<Graph> {
        // 验证 URI 方案
        if (targetUri.scheme !== 'file') {
            throw new Error(`不支持的 URI 方案: ${targetUri.scheme}`);
        }

        this.logger.info(`开始浅层扫描: ${targetUri.fsPath}`);
        
        let stat: vscode.FileStat;
        try {
            stat = await vscode.workspace.fs.stat(targetUri);
        } catch (error) {
            this.logger.error(`无法访问路径: ${targetUri.fsPath}`, error);
            throw new Error(`无法访问路径: ${targetUri.fsPath}`);
        }

        const isFolder = (stat.type & vscode.FileType.Directory) !== 0;

        // 如果点击的是文件，扫描其父目录
        const dirUri = isFolder ? targetUri : vscode.Uri.file(path.dirname(targetUri.fsPath));
        const dirName = path.basename(dirUri.fsPath);
        
        // 计算相对路径用于显示
        const relativePath = workspaceRoot 
            ? path.relative(workspaceRoot.fsPath, dirUri.fsPath)
            : dirName;

        const graphId = `filetree-shallow-${Date.now()}`;
        const graphTitle = `📁 ${relativePath || dirName}`;

        const nodes: Node[] = [];
        const edges: Edge[] = [];

        // 添加当前目录作为根节点
        const rootNodeId = dirUri.fsPath;
        const rootRelativePath = workspaceRoot ? uriToRelative(dirUri, workspaceRoot) : '/';
        nodes.push({
            id: rootNodeId,
            label: dirName,
            type: 'folder',
            position: { x: 400, y: 50 },
            data: {
                path: rootRelativePath,  // ✅ 使用 POSIX 相对路径
                absPath: dirUri.fsPath,  // 保留绝对路径供内部使用
                isRoot: true,
                relativePath: relativePath || '.'
            }
        });

        try {
            // 只读取当前层级的直接子项
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            
            let fileCount = 0;
            let folderCount = 0;
            const childNodes: Node[] = [];

            for (const [name, type] of entries) {
                const childPath = path.join(dirUri.fsPath, name);
                
                // 检查是否应该排除
                if (this.shouldExclude(childPath, dirUri.fsPath)) {
                    continue;
                }

                const isDirectory = type === vscode.FileType.Directory;
                const nodeId = childPath;
                const childUri = vscode.Uri.file(childPath);
                const childRelativePath = workspaceRoot ? uriToRelative(childUri, workspaceRoot) : `/${name}`;

                const node: Node = {
                    id: nodeId,
                    label: name,
                    type: isDirectory ? 'folder' : 'file',
                    position: { x: 0, y: 0 }, // 临时位置，稍后批量计算
                    data: {
                        path: childRelativePath,  // ✅ 使用 POSIX 相对路径
                        absPath: childPath,  // 保留绝对路径供内部使用
                        parentPath: dirUri.fsPath,
                        extension: isDirectory ? undefined : path.extname(name)
                    }
                };

                childNodes.push(node);

                // 添加与根节点的连接
                edges.push({
                    id: `${rootNodeId}->${nodeId}`,
                    from: { node: rootNodeId },
                    to: { node: nodeId },
                    data: { type: 'contains' }
                });

                if (isDirectory) {
                    folderCount++;
                } else {
                    fileCount++;
                }
            }

            // 使用网格布局计算所有子节点的位置
            const positions = gridLayout(
                childNodes.length,
                150, // 节点宽度
                100, // 节点高度
                100, // X 偏移
                150  // Y 偏移（为根节点留空间）
            );

            childNodes.forEach((node, index) => {
                node.position = positions[index];
                nodes.push(node);
            });

            this.logger.info(`浅层扫描完成: ${folderCount} 个文件夹, ${fileCount} 个文件`);

        } catch (error) {
            this.logger.error(`浅层扫描失败: ${dirUri.fsPath}`, error);
        }

        return {
            id: graphId,
            title: graphTitle,
            nodes,
            edges,
            metadata: {
                graphType: 'filetree', // ✅ 关键：前端双击绑定依赖此字段！
                rootPath: dirUri.fsPath,
                workspaceRoot: workspaceRoot?.fsPath,
                relativePath,
                scannedAt: new Date().toISOString(),
                nodeCount: nodes.length,
                edgeCount: edges.length,
                scanMode: 'shallow'
            }
        };
    }

    /**
     * 递归扫描目录
     */
    private async scanDirectory(
        dirUri: vscode.Uri,
        rootUri: vscode.Uri,
        nodes: Node[],
        edges: Edge[],
        depth: number,
        parentId?: string
    ): Promise<void> {
        // 防止递归过深
        if (depth > 10) {
            this.logger.warn(`达到最大递归深度 (10)，跳过: ${dirUri.fsPath}`);
            return;
        }

        const dirName = path.basename(dirUri.fsPath);
        const nodeId = dirUri.fsPath;

        // 检查是否应该排除
        if (this.shouldExclude(dirUri.fsPath, rootUri.fsPath)) {
            return;
        }

        // 添加文件夹节点
        const folderNode: Node = {
            id: nodeId,
            label: dirName,
            type: 'folder',
            position: this.calculatePosition(nodes.length, depth),
            data: {
                path: dirUri.fsPath,
                depth,
                isDirectory: true
            }
        };
        nodes.push(folderNode);

        // 添加父子边
        if (parentId) {
            edges.push({
                id: `${parentId}->${nodeId}`,
                from: { node: parentId },
                to: { node: nodeId },
                data: { type: 'contains' }
            });
        }

        try {
            // 读取目录内容
            const entries = await vscode.workspace.fs.readDirectory(dirUri);

            for (const [name, type] of entries) {
                const childUri = vscode.Uri.joinPath(dirUri, name);
                const childPath = childUri.fsPath;

                // 检查排除规则
                if (this.shouldExclude(childPath, rootUri.fsPath)) {
                    continue;
                }

                if (type === vscode.FileType.Directory) {
                    // 递归扫描子文件夹
                    await this.scanDirectory(childUri, rootUri, nodes, edges, depth + 1, nodeId);
                } else if (type === vscode.FileType.File) {
                    // 添加文件节点
                    const fileNode: Node = {
                        id: childPath,
                        label: name,
                        type: 'file',
                        position: this.calculatePosition(nodes.length, depth + 1),
                        data: {
                            path: childPath,
                            depth: depth + 1,
                            extension: path.extname(name)
                        }
                    };
                    nodes.push(fileNode);

                    // 添加父子边
                    edges.push({
                        id: `${nodeId}->${childPath}`,
                        from: { node: nodeId },
                        to: { node: childPath },
                        data: { type: 'contains' }
                    });
                }
            }
        } catch (error) {
            this.logger.error(`扫描目录失败: ${dirUri.fsPath}`, error);
        }
    }

    /**
     * 判断路径是否应该被排除
     */
    private shouldExclude(filePath: string, rootPath: string): boolean {
        const relativePath = path.relative(rootPath, filePath);
        const fileName = path.basename(filePath);

        // 从配置读取排除规则
        const configExcludes = vscode.workspace
            .getConfiguration('filetreeBlueprint')
            .get<string[]>('excludes') || [];
        
        const allExcludes = [...DEFAULT_EXCLUDES, ...configExcludes];

        for (const pattern of allExcludes) {
            // 简单的 glob 匹配
            const regexPattern = pattern
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/\\\\]*')
                .replace(/\//g, '[/\\\\]');
            
            const regex = new RegExp(`^${regexPattern}$`);
            
            if (regex.test(relativePath) || regex.test(fileName)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 计算节点位置（简单的层级布局）
     */
    private calculatePosition(index: number, depth: number): Position {
        const horizontalSpacing = 200;
        const verticalSpacing = 100;
        
        // 简单的网格布局
        const itemsPerRow = 5;
        const row = Math.floor(index / itemsPerRow);
        const col = index % itemsPerRow;

        return {
            x: col * horizontalSpacing,
            y: depth * verticalSpacing + row * 80
        };
    }

    /**
     * 从 JSON 解析图结构
     */
    parseGraphFromJson(jsonContent: string): { ok: boolean; graph?: Graph; error?: string } {
        try {
            const parsed = JSON.parse(jsonContent);
            
            // 验证必需字段
            if (!parsed.id || !parsed.title || !Array.isArray(parsed.nodes)) {
                return { ok: false, error: '缺少必需字段 (id, title, nodes)' };
            }

            return { ok: true, graph: parsed as Graph };
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : '解析失败' };
        }
    }

    /**
     * 从 Markdown 中提取 flowjson 代码块
     */
    parseGraphFromMarkdown(content: string): { ok: boolean; graph?: Graph; error?: string } {
        const flowjsonRegex = /```flowjson\s*\n([\s\S]*?)\n```/;
        const match = content.match(flowjsonRegex);

        if (!match) {
            return { ok: false, error: '未找到 ```flowjson 代码块' };
        }

        return this.parseGraphFromJson(match[1]);
    }
}
