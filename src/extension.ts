// src/extension.ts
// [module: main] [tags: Entry, Activation, DI]
/**
 * VS Code 插件主入口文件
 * 职责：轻量启动、模块路由、依赖注入容器初始化
 * 不放业务逻辑，只做模块编排
 */

import * as vscode from 'vscode';
import { DIContainer } from '@core/di/Container';
import { Logger } from '@core/logging/Logger';
import { ExplorerAliasModule } from '@feat/explorer/ExplorerAliasModule';
import { UMLCanvasModule } from '@feat/uml/UMLCanvasModule';

let container: DIContainer;

export async function activate(context: vscode.ExtensionContext) {
    try {
        // 初始化依赖注入容器
        container = new DIContainer();
        
        // 注册核心服务
        container.registerSingleton('logger', () => new Logger('AI-Explorer'));
        container.registerSingleton('context', () => context);
        
        const logger = container.get<Logger>('logger');
        logger.info('AI Explorer 插件正在激活...');
        
        // 激活各个功能模块
        const explorerModule = new ExplorerAliasModule(container);
        const umlModule = new UMLCanvasModule(container);
        
        await explorerModule.activate(context);
        await umlModule.activate(context);
        
        logger.info('AI Explorer 插件激活完成');
        
    } catch (error) {
        console.error('AI Explorer 插件激活失败:', error);
        vscode.window.showErrorMessage(`AI Explorer 插件启动失败: ${error}`);
    }
}

export function deactivate() {
    if (container) {
        const logger = container.get<Logger>('logger');
        logger.info('AI Explorer 插件正在停用...');
        container.dispose();
    }
}