// src/features/explorer-alias/ui/ExplorerTreeItem.ts
// [module: explorer-alias] [tags: TreeItem, UI, VSCode, Display]
/**
 * 资源管理器树项定义
 * 定义树视图中每个项目的显示方式
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { FileNode } from '../../../shared/types';
import { HoverInfoService } from './HoverInfoService';

export class ExplorerTreeItem extends vscode.TreeItem {
    constructor(
        public readonly node: FileNode,
        private showAlias: boolean
    ) {
        const displayName = showAlias && node.alias ? node.alias : node.name;
        
        super(displayName, node.type === 'directory' ? 
            vscode.TreeItemCollapsibleState.Collapsed : 
            vscode.TreeItemCollapsibleState.None);

        this.setupTreeItem();
    }

    private setupTreeItem(): void {
        // 🔧 设置 resourceUri（关键！右键菜单命令需要此属性来传递 URI）
        this.resourceUri = vscode.Uri.file(this.node.path);

        // 设置图标
        if (this.node.type === 'directory') {
            this.iconPath = new vscode.ThemeIcon('folder');
        } else {
            this.iconPath = this.getFileIcon();
        }

        // 设置上下文值（用于右键菜单）
        const hasAlias = Boolean(this.node.alias && this.node.alias !== this.node.name);
        this.contextValue = this.node.type === 'file'
            ? (hasAlias ? 'fileHasAlias' : 'file')
            : (hasAlias ? 'folderHasAlias' : 'folder');

        // 设置智能工具提示
        this.tooltip = this.buildSmartTooltip();

        // 设置描述（显示在右侧的灰色文字）
        if (this.showAlias && this.node.alias) {
            this.description = `(${this.node.name})`;
        }

        // 文件可以点击打开
        if (this.node.type === 'file') {
            this.command = {
                command: 'vscode.open',
                title: '打开文件',
                arguments: [vscode.Uri.file(this.node.path)]
            };
        }

        // 如果没有别名且是英文文件名，标记为需要翻译
        if (this.needsTranslation()) {
            this.iconPath = new vscode.ThemeIcon('symbol-text', new vscode.ThemeColor('charts.orange'));
        }
    }

    private getFileIcon(): vscode.ThemeIcon {
        const ext = path.extname(this.node.name).toLowerCase();
        
        const iconMap: Record<string, string> = {
            '.ts': 'file-typescript',
            '.js': 'file-javascript',
            '.json': 'file-json',
            '.md': 'file-markdown',
            '.py': 'file-python',
            '.html': 'file-html',
            '.css': 'file-css',
            '.scss': 'file-scss',
            '.less': 'file-less',
            '.vue': 'file-vue',
            '.jsx': 'file-react',
            '.tsx': 'file-react',
            '.java': 'file-java',
            '.cs': 'file-cs',
            '.cpp': 'file-cpp',
            '.c': 'file-c',
            '.h': 'file-header',
            '.php': 'file-php',
            '.rb': 'file-ruby',
            '.go': 'file-go',
            '.rs': 'file-rust',
            '.dart': 'file-dart',
            '.swift': 'file-swift',
            '.kt': 'file-kotlin',
            '.xml': 'file-xml',
            '.yml': 'file-yaml',
            '.yaml': 'file-yaml',
            '.toml': 'file-toml',
            '.ini': 'file-config',
            '.cfg': 'file-config',
            '.conf': 'file-config',
            '.txt': 'file-text',
            '.log': 'file-log',
            '.sql': 'file-sql',
            '.sh': 'terminal',
            '.bat': 'terminal',
            '.ps1': 'terminal'
        };

        const iconName = iconMap[ext] || 'file';
        return new vscode.ThemeIcon(iconName);
    }

    private buildTooltip(): string {
        let tooltip = `路径: ${this.node.path}\\n类型: ${this.node.type === 'file' ? '文件' : '文件夹'}`;
        
        if (this.node.alias) {
            tooltip += `\\n中文别名: ${this.node.alias}`;
        }

        if (this.needsTranslation()) {
            tooltip += '\\n⚠️ 需要翻译';
        }

        return tooltip;
    }

    /**
     * 🎯 构建智能工具提示 - 集成AI分析
     */
    private buildSmartTooltip(): vscode.MarkdownString | string {
        // 创建可更新的 Markdown 提示
        const tooltip = new vscode.MarkdownString();
        tooltip.supportHtml = true;
        tooltip.isTrusted = true;

        // 1. 立即显示基础信息
        let baseInfo = `**${this.showAlias && this.node.alias ? this.node.alias : this.node.name}**\n\n`;
        baseInfo += `📁 \`${this.node.path}\`\n`;
        baseInfo += `📝 类型: ${this.node.type === 'file' ? '文件' : '文件夹'}\n`;
        
        if (this.node.alias) {
            baseInfo += `🔤 别名: ${this.node.alias}\n`;
        }

        if (this.needsTranslation()) {
            baseInfo += `⚠️ 需要翻译\n`;
        }

        // 2. 异步加载智能分析（不阻塞UI）
        this.loadSmartAnalysis().then(analysis => {
            if (analysis) {
                const smartInfo = `\n---\n**🤖 AI 分析**\n\n${analysis}`;
                tooltip.appendMarkdown(baseInfo + smartInfo);
                // 这里可以触发TreeView刷新（如果需要）
            }
        }).catch(error => {
            console.warn(`智能分析失败 ${this.node.path}:`, error);
        });

        tooltip.appendMarkdown(baseInfo + `\n---\n⏳ AI 分析中...`);
        return tooltip;
    }

    /**
     * 📊 异步加载智能分析
     */
    private async loadSmartAnalysis(): Promise<string | null> {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) return null;

            const hoverService = HoverInfoService.getInstance(workspaceRoot);
            const analysisText = await hoverService.getTooltip(this.node.path);
            
            // 将纯文本转为 Markdown 格式
            return analysisText.replace(/\n/g, '  \n'); // Markdown 换行需要两个空格
        } catch (error) {
            console.warn('加载智能分析失败:', error);
            return null;
        }
    }

    private needsTranslation(): boolean {
        return !this.node.alias && 
               this.shouldTranslate(this.node.name) &&
               this.node.type === 'file';
    }

    private shouldTranslate(filename: string): boolean {
        // 只翻译英文文件名（包含英文字母）
        return /[a-zA-Z]/.test(filename) && 
               !filename.startsWith('.') &&
               filename !== 'README.md' &&
               filename !== 'LICENSE' &&
               filename !== 'package.json' &&
               filename !== 'tsconfig.json';
    }
}