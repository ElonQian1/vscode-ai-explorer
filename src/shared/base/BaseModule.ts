// src/shared/base/BaseModule.ts
// [module: shared] [tags: Module, Base, Activation, Lifecycle]
/**
 * 模块基类
 * 定义模块的标准生命周期和接口
 */

import * as vscode from 'vscode';
import { DIContainer } from '../../core/di/Container';
import { Logger } from '../../core/logging/Logger';

export abstract class BaseModule {
    protected logger: Logger;

    constructor(
        protected container: DIContainer,
        protected moduleId: string
    ) {
        this.logger = container.get<Logger>('logger');
    }

    /**
     * 模块激活
     */
    abstract activate(context: vscode.ExtensionContext): Promise<void>;

    /**
     * 模块停用
     */
    deactivate(): void {
        this.logger.info(`模块 ${this.moduleId} 正在停用`);
    }

    /**
     * 注册命令
     */
    protected registerCommand(
        context: vscode.ExtensionContext,
        commandId: string,
        callback: (...args: any[]) => any
    ): void {
        const disposable = vscode.commands.registerCommand(commandId, callback);
        context.subscriptions.push(disposable);
        this.logger.debug(`已注册命令: ${commandId}`);
    }

    /**
     * 注册树视图提供者
     */
    protected registerTreeDataProvider<T>(
        context: vscode.ExtensionContext,
        viewId: string,
        provider: vscode.TreeDataProvider<T>
    ): void {
        const disposable = vscode.window.createTreeView(viewId, {
            treeDataProvider: provider,
            showCollapseAll: true
        });
        context.subscriptions.push(disposable);
        this.logger.debug(`已注册树视图提供者: ${viewId}`);
    }
}