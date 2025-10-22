// src/features/explorer-alias/ui/ExplorerTreeItem.ts
// [module: explorer-alias] [tags: TreeItem, UI, VSCode, Display]
/**
 * 资源管理器树项定义
 * 定义树视图中每个项目的显示方式
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { FileNode } from '../../../shared/types';
import { HoverInfoService } from './HoverInfoService';

export class ExplorerTreeItem extends vscode.TreeItem {
    private static hoverService: HoverInfoService | null = null;
    
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

        // 设置工具提示（先同步显示，异步更新）
        this.tooltip = this.buildInitialTooltip();
        
        // 异步加载智能tooltip
        this.loadSmartTooltipAsync();

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

    /**
     * 📝 构建初始工具提示（同步显示）
     */
    private buildInitialTooltip(): vscode.MarkdownString {
        let tooltip = `**路径:** ${this.node.path}\n**类型:** ${this.node.type === 'file' ? '文件' : '文件夹'}`;
        
        if (this.node.alias) {
            tooltip += `\n**中文别名:** ${this.node.alias}`;
        }

        // 基础智能推测
        const basicDescription = this.getBasicSmartDescription();
        if (basicDescription) {
            tooltip += `\n**功能:** ${basicDescription}`;
        }

        if (this.needsTranslation()) {
            tooltip += '\n⚠️ 需要翻译';
        }

        tooltip += '\n*🔄 正在加载智能分析...*';

        const markdown = new vscode.MarkdownString(tooltip);
        markdown.supportHtml = false;
        markdown.supportThemeIcons = true;
        return markdown;
    }

    /**
     * 🚀 异步加载智能工具提示
     */
    private loadSmartTooltipAsync(): void {
        if (!ExplorerTreeItem.hoverService) {
            return;
        }

        // 异步获取智能tooltip，不阻塞UI
        ExplorerTreeItem.hoverService.getTooltip(this.node.path)
            .then(tooltipText => {
                const markdown = new vscode.MarkdownString(tooltipText);
                markdown.supportHtml = false;
                markdown.supportThemeIcons = true;
                this.tooltip = markdown;
                
                // 可以触发树刷新事件通知UI更新（可选）
                // 由于VS Code的限制，tooltip更新可能需要树节点刷新才能生效
            })
            .catch(error => {
                console.warn('加载智能tooltip失败:', error);
            });
    }

    /**
     * 🚀 设置悬停信息服务实例
     */
    public static setHoverService(service: HoverInfoService): void {
        ExplorerTreeItem.hoverService = service;
    }

    /**
     * 🧠 智能获取文件/文件夹用途描述 - 重构为基础推测
     */
    private getSmartDescription(): string | null {
        // 使用基础智能推测逻辑
        return this.getBasicSmartDescription();
    }

    /**
     * 🎯 获取基础智能描述（同步，不依赖AI）
     * 基于文件名和路径的快速智能推测
     */
    private getBasicSmartDescription(): string | null {
        // 直接使用现有的智能推测逻辑
        return this.getSmartDescription_V1();
    }

    /**
     * � 原版智能推测逻辑（重命名以避免递归）
     */
    private getSmartDescription_V1(): string | null {
        // 🎯 Phase 1: 基于文件名/路径的智能推测
        const fileName = this.node.name.toLowerCase();
        const filePath = this.node.path.toLowerCase();
        
        // 📁 文件夹智能推测
        if (this.node.type === 'directory') {
            if (fileName.includes('src') || fileName.includes('source')) {
                return '源代码目录';
            }
            if (fileName.includes('test') || fileName.includes('spec')) {
                return '测试文件目录';
            }
            if (fileName.includes('doc') || fileName.includes('docs')) {
                return '文档目录';
            }
            if (fileName.includes('config') || fileName.includes('conf')) {
                return '配置文件目录';
            }
            if (fileName.includes('lib') || fileName.includes('library')) {
                return '库文件目录';
            }
            if (fileName.includes('asset') || fileName.includes('resource')) {
                return '资源文件目录';
            }
            if (fileName.includes('util') || fileName.includes('helper')) {
                return '工具类目录';
            }
            if (fileName.includes('component')) {
                return '组件目录';
            }
            if (fileName.includes('service')) {
                return '服务层目录';
            }
            if (fileName.includes('model') || fileName.includes('entity')) {
                return '数据模型目录';
            }
        }
        
        // 📄 文件智能推测
        else {
            const ext = path.extname(fileName);
            
            // 配置文件
            if (fileName === 'package.json') return 'Node.js 项目配置文件';
            if (fileName === 'tsconfig.json') return 'TypeScript 编译配置';
            if (fileName === 'webpack.config.js') return 'Webpack 打包配置';
            if (fileName === 'vite.config.js') return 'Vite 构建配置';
            if (fileName === '.gitignore') return 'Git 忽略文件配置';
            if (fileName === 'readme.md') return '项目说明文档';
            if (fileName === 'license') return '开源许可证';
            
            // 根据扩展名推测
            if (ext === '.ts' || ext === '.js') {
                if (fileName.includes('test') || fileName.includes('spec')) {
                    return '测试文件';
                }
                if (fileName.includes('config') || fileName.includes('setting')) {
                    return '配置模块';
                }
                if (fileName.includes('util') || fileName.includes('helper')) {
                    return '工具函数';
                }
                if (fileName.includes('service')) {
                    return '服务层逻辑';
                }
                if (fileName.includes('component')) {
                    return 'UI 组件';
                }
                if (fileName.includes('model') || fileName.includes('entity')) {
                    return '数据模型';
                }
                if (fileName.includes('router') || fileName.includes('route')) {
                    return '路由配置';
                }
                return 'JavaScript/TypeScript 模块';
            }
            
            if (ext === '.vue') return 'Vue 组件文件';
            if (ext === '.jsx' || ext === '.tsx') return 'React 组件文件';
            if (ext === '.css' || ext === '.scss' || ext === '.less') return '样式表文件';
            if (ext === '.html') return 'HTML 页面文件';
            if (ext === '.md') return 'Markdown 文档';
            if (ext === '.json') return 'JSON 数据文件';
            if (ext === '.sql') return 'SQL 数据库脚本';
            if (ext === '.py') return 'Python 脚本';
            if (ext === '.java') return 'Java 类文件';
            if (ext === '.rs') return 'Rust 源码文件';
        }
        
        return null;
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