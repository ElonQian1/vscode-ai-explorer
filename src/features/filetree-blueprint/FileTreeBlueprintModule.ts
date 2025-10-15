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

        this.logger.info('已注册 3 个命令');
    }

    async deactivate(): Promise<void> {
        this.logger.info('文件树蓝图模块正在停用...');
        // 清理资源（如果需要）
    }
}
