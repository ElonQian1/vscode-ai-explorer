// src/features/filetree-blueprint/FileTreeBlueprintModule.ts
// [module: filetree-blueprint] [tags: Module, Entry]
/**
 * 文件树蓝图模块主入口
 * 负责注册命令、管理生命周期
 */

import * as vscode from 'vscode';
import { BaseModule } from '../../shared/base/BaseModule';
import { DIContainer } from '../../core/di/Container';
import { GenerateBlueprintUseCase } from './app/usecases/GenerateBlueprintUseCase';
import { resolveTargetToFileUri } from './utils/resolveTarget';

export class FileTreeBlueprintModule extends BaseModule {
    private generateUseCase?: GenerateBlueprintUseCase;

    constructor(container: DIContainer) {
        super(container, 'filetree-blueprint');
    }

    async activate(context: vscode.ExtensionContext): Promise<void> {
        this.logger.info('文件树蓝图模块正在激活...');

        // 注册服务
        this.registerServices(context);

        // 注册命令
        this.registerCommands(context);

        // 检查版本更新并显示提示
        this.checkVersionUpdate(context);

        this.logger.info('文件树蓝图模块激活完成');
    }

    private registerServices(context: vscode.ExtensionContext): void {
        // 注册生成蓝图用例
        this.container.registerSingleton('generateBlueprintUseCase', () => {
            return new GenerateBlueprintUseCase(this.logger, context.extensionUri);
        });

        this.generateUseCase = this.container.get<GenerateBlueprintUseCase>(
            'generateBlueprintUseCase'
        );
    }

    private registerCommands(context: vscode.ExtensionContext): void {
        if (!this.generateUseCase) {
            this.logger.error('生成蓝图用例未初始化');
            return;
        }

        // 命令 1: 从工作区生成蓝图
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'filetreeBlueprint.openFromWorkspace',
                async () => {
                    this.logger.info('执行命令: 从工作区生成蓝图');
                    await this.generateUseCase!.executeFromWorkspace();
                }
            )
        );

        // 命令 2: 从指定路径生成蓝图（右键菜单入口）
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'filetreeBlueprint.openFromPath',
                async (raw?: unknown) => {
                    this.logger.info('执行命令: 从路径生成蓝图');

                    // 使用统一的 URI 解析器
                    const resolved = await resolveTargetToFileUri(raw);
                    
                    if (!resolved) {
                        // 用户取消选择或无法解析
                        this.logger.info('用户取消或无法解析目标路径');
                        return;
                    }

                    this.logger.info(`已解析目标: ${resolved.focusPath} (${resolved.folderUri.fsPath})`);

                    // 执行蓝图生成（使用浅层扫描模式）
                    await this.generateUseCase!.executeFromPath(
                        resolved.folderUri,
                        undefined,
                        true // 浅层模式
                    );
                }
            )
        );

        // 命令 3: 从当前文档打开图表（JSON/Markdown）
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'filetreeBlueprint.openFromJson',
                async () => {
                    this.logger.info('执行命令: 从文档打开图表');

                    const editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        vscode.window.showWarningMessage(
                            '请先打开包含图表数据的文件 (.json 或含 ```flowjson 的 .md)'
                        );
                        return;
                    }

                    await this.generateUseCase!.executeFromDocument(editor.document);
                }
            )
        );

        // 命令 4: 打开帮助与快捷键
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'filetreeBlueprint.openHelp',
                () => {
                    this.logger.info('执行命令: 打开帮助');
                    
                    // 获取当前的蓝图面板并打开帮助
                    const { BlueprintPanel } = require('./panel/BlueprintPanel');
                    const currentPanel = (BlueprintPanel as any).currentPanel;
                    
                    if (currentPanel && typeof currentPanel.openHelp === 'function') {
                        currentPanel.openHelp();
                    } else {
                        vscode.window.showInformationMessage(
                            '请先打开蓝图视图，再使用帮助功能。\n\n💡 提示：右键任意文件夹 → "在此打开蓝图"',
                            '了解更多'
                        ).then(selection => {
                            if (selection === '了解更多') {
                                vscode.commands.executeCommand('filetreeBlueprint.openFromWorkspace');
                            }
                        });
                    }
                }
            )
        );

        // 命令 5: 开关状态栏提示
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'filetreeBlueprint.toggleHints',
                async () => {
                    this.logger.info('执行命令: 开关状态栏提示');
                    
                    const config = vscode.workspace.getConfiguration('filetreeBlueprint');
                    const currentValue = config.get<boolean>('showStatusBarHint', true);
                    
                    await config.update(
                        'showStatusBarHint',
                        !currentValue,
                        vscode.ConfigurationTarget.Global
                    );
                    
                    vscode.window.showInformationMessage(
                        `状态栏提示已${!currentValue ? '开启' : '关闭'}` +
                        (!currentValue ? '\n\n下次打开蓝图时将显示 15 秒的操作提示' : '')
                    );
                }
            )
        );

        this.logger.info('已注册 5 个命令');
    }

    /**
     * 检查版本更新并显示 What's New 提示
     */
    private checkVersionUpdate(context: vscode.ExtensionContext): void {
        const STORAGE_KEY = 'filetreeBlueprint.lastVersion';
        
        // 获取当前版本
        const currentVersion = vscode.extensions.getExtension('ElonQian1.ai-explorer')?.packageJSON.version || '0.0.0';
        
        // 获取上次记录的版本
        const lastVersion = context.globalState.get<string>(STORAGE_KEY);
        
        this.logger.debug(`版本检查 - 当前: ${currentVersion}, 上次: ${lastVersion || '未记录'}`);
        
        if (lastVersion !== currentVersion) {
            // 更新存储的版本
            context.globalState.update(STORAGE_KEY, currentVersion);
            
            // 如果是首次安装，不显示更新提示
            if (!lastVersion) {
                this.logger.info('首次安装，不显示更新提示');
                return;
            }
            
            // 显示更新通知
            this.logger.info(`检测到版本更新: ${lastVersion} → ${currentVersion}`);
            
            vscode.window.showInformationMessage(
                `🎉 蓝图视图已更新至 v${currentVersion}\n\n✨ 新功能：防抖动优化 + 快捷操作帮助系统`,
                '查看详情',
                '我知道了'
            ).then(selection => {
                if (selection === '查看详情') {
                    // 打开帮助文档
                    const helpDoc = vscode.Uri.joinPath(
                        context.extensionUri,
                        'docs',
                        '可视化世界画布',
                        '第二阶段完成-配置化增强.md'
                    );
                    vscode.commands.executeCommand('markdown.showPreview', helpDoc);
                }
            });
        }
    }

    async deactivate(): Promise<void> {
        this.logger.info('文件树蓝图模块正在停用...');
        // 清理资源（如果需要）
    }
}
