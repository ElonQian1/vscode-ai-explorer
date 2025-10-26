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
    private hoverService?: HoverInfoService; // 🔧 添加 HoverInfoService 实例
    
    constructor(
        public readonly node: FileNode,
        private showAlias: boolean,
        private context?: vscode.ExtensionContext // 🔧 新增：extension context
    ) {
        const displayName = showAlias && node.alias ? node.alias : node.name;
        
        super(displayName, node.type === 'directory' ? 
            vscode.TreeItemCollapsibleState.Collapsed : 
            vscode.TreeItemCollapsibleState.None);

        this.setupTreeItem();
    }

    private setupTreeItem(): void {
        // 🔧 初始化 HoverInfoService
        try {
            this.hoverService = HoverInfoService.getInstance(undefined, this.context);
        } catch (error) {
            console.warn('Failed to initialize HoverInfoService:', error);
        }
        
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

        // 设置智能工具提示 - 延迟加载，避免树视图刷新时的性能问题
        this.tooltip = this.buildLightweightTooltip();

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
     * 🎯 构建轻量级悬停提示（避免性能问题）
     * 注意：VS Code TreeItem的tooltip必须同步设置，异步更新无效
     */
    private buildLightweightTooltip(): vscode.MarkdownString | string {
        const tooltip = new vscode.MarkdownString();
        tooltip.isTrusted = true; // 允许命令链接
        tooltip.supportHtml = false;

        // 1. 基本文件信息
        let baseInfo = `**${this.showAlias && this.node.alias ? this.node.alias : this.node.name}**\n\n`;
        baseInfo += `📁 \`${this.node.path}\`\n`;
        baseInfo += `📝 类型: ${this.node.type === 'file' ? '文件' : '文件夹'}\n`;
        
        if (this.node.alias) {
            baseInfo += `🔤 别名: ${this.node.alias}\n`;
        }

        if (this.needsTranslation()) {
            baseInfo += `⚠️ 需要翻译\n`;
        }

        tooltip.appendMarkdown(baseInfo);

        // 检查hover模式配置
        const config = vscode.workspace.getConfiguration('aiExplorer');
        const hoverMode = config.get<string>('hoverMode', 'manual');

        if (hoverMode === 'disabled') {
            // 禁用模式：只显示基本信息
            return tooltip;
        }

        // 2. 🔧 AI分析状态显示（关键修复）
        tooltip.appendMarkdown(`\n---\n💡 **AI 分析**\n\n`);
        
        if (hoverMode === 'manual') {
            // 手动模式：使用智能tooltip逻辑
            // 🎯 关键修复：直接调用智能tooltip构建方法
            const smartTooltip = this.buildSmartTooltip();
            if (smartTooltip instanceof vscode.MarkdownString) {
                return smartTooltip;
            } else {
                // 如果返回的是字符串，添加到当前tooltip
                tooltip.appendMarkdown(smartTooltip);
            }
        } else {
            // 其他模式保持原有逻辑
            tooltip.appendMarkdown(`🔍 右键选择"AI分析"来分析此文件`);
        }
        
        return tooltip;
    }

    /**
     * 🎯 尝试显示已存在的分析结果
     */
    private tryDisplayExistingAnalysisResult(tooltip: vscode.MarkdownString): void {
        if (!this.hoverService) return;
        
        // 异步检查分析结果（不阻塞tooltip显示）
        this.hoverService.getExistingTooltip(this.node.path)
            .then(existingTooltip => {
                if (existingTooltip && existingTooltip.trim() !== '') {
                    console.log(`[ExplorerTreeItem] ✅ 发现分析结果: ${this.node.path.split(/[/\\]/).pop()}`);
                    // 注意：由于VS Code API限制，此时无法更新已构建的tooltip
                    // 分析结果会在下次TreeView刷新时正确显示
                } else {
                    console.log(`[ExplorerTreeItem] ⚠️ 暂无分析结果: ${this.node.path.split(/[/\\]/).pop()}`);
                }
            })
            .catch(error => {
                console.warn(`[ExplorerTreeItem] ❌ 检查分析结果失败: ${error}`);
            });
    }

    /**
     * 🎯 构建完整智能悬停提示（同步版本，修复异步更新问题）
     */
    private buildSmartTooltip(): vscode.MarkdownString | string {
        // 创建 Markdown 提示
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

        // 检查hover模式配置
        const config = vscode.workspace.getConfiguration('aiExplorer');
        const hoverMode = config.get<string>('hoverMode', 'manual');

        // 2. 根据配置模式处理AI分析
        if (hoverMode === 'disabled') {
            // 禁用模式：不显示AI分析选项
            tooltip.appendMarkdown(baseInfo);
            return tooltip;
        }

        if (hoverMode === 'auto') {
            // 自动模式：显示loading提示，实际分析会在后台进行
            tooltip.appendMarkdown(baseInfo + `\n---\n⏳ **AI 分析**\n\n正在分析中... 刷新查看结果`);
            // 触发后台分析
            this.loadSmartAnalysis().catch((error: any) => {
                console.warn(`后台智能分析失败 ${this.node.path}:`, error);
            });
        } else {
            // 手动模式（默认）：同步检查现有结果
            try {
                if (this.hoverService) {
                    // 同步检查缓存结果
                    const existingTooltip = this.hoverService.getExistingTooltipSync(this.node.path);
                    if (existingTooltip) {
                        tooltip.appendMarkdown(baseInfo + `\n---\n**🤖 AI 分析**\n\n${existingTooltip}`);
                    } else {
                        // 显示手动分析选项
                        let aiSection = `\n---\n💡 **AI 分析**\n\n`;
                        aiSection += `🔍 [点击进行智能分析](command:aiExplorer.refreshAnalysis?${encodeURIComponent(JSON.stringify([this.node]))})\n`;
                        aiSection += `📋 或右键选择 "刷新AI分析"`;
                        tooltip.appendMarkdown(baseInfo + aiSection);
                    }
                } else {
                    // hoverService 不可用时显示手动分析选项
                    let aiSection = `\n---\n💡 **AI 分析**\n\n`;
                    aiSection += `🔍 [点击进行智能分析](command:aiExplorer.refreshAnalysis?${encodeURIComponent(JSON.stringify([this.node]))})\n`;
                    aiSection += `📋 或右键选择 "刷新AI分析"`;
                    tooltip.appendMarkdown(baseInfo + aiSection);
                }
            } catch (error) {
                // 出错时显示手动分析选项
                const fallbackInfo = `\n---\n💡 右键选择 "刷新AI分析" 来分析此文件`;
                tooltip.appendMarkdown(baseInfo + fallbackInfo);
            }
        }

        return tooltip;
    }

    /**
     * ⚡ 快速检查是否有现有分析结果（轻量级，仅返回true/false）
     */
    private async quickCheckExistingAnalysis(): Promise<boolean> {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot || !this.context) {
                return false;
            }

            const hoverService = HoverInfoService.getInstance(workspaceRoot, this.context);
            const analysisText = await hoverService.getExistingTooltip(this.node.path);
            return Boolean(analysisText && analysisText.trim().length > 0);
        } catch (error) {
            console.warn(`[ExplorerTreeItem] ⚠️ 快速检查失败: ${this.node.path}`, error);
            return false;
        }
    }

    /**
     * 🔍 检查现有分析结果（不触发新分析）
     */
    private async checkExistingAnalysis(): Promise<string | null> {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                return null;
            }

            const hoverService = HoverInfoService.getInstance(workspaceRoot, this.context);
            const analysisText = await hoverService.getExistingTooltip(this.node.path);
            
            // 将纯文本转为 Markdown 格式
            return analysisText ? analysisText.replace(/\n/g, '  \n') : null;
        } catch (error) {
            // 静默处理错误，避免日志污染
            return null;
        }
    }

    /**
     * �📊 异步加载智能分析（保留用于兼容性）
     */
    private async loadSmartAnalysis(): Promise<string | null> {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) return null;

            const hoverService = HoverInfoService.getInstance(workspaceRoot, this.context);
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