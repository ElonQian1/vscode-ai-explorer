// src/core/logging/Logger.ts
// [module: core] [tags: Logging, Debug, Console, Output]
/**
 * 统一日志服务
 * 提供结构化日志记录，支持不同级别和输出通道
 */

import * as vscode from 'vscode';

export enum LogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3
}

export class Logger {
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel = LogLevel.Info;

    constructor(private name: string) {
        this.outputChannel = vscode.window.createOutputChannel(`AI Explorer - ${name}`);
    }

    setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    debug(message: string, ...args: any[]): void {
        this.log(LogLevel.Debug, message, args);
    }

    info(message: string, ...args: any[]): void {
        this.log(LogLevel.Info, message, args);
    }

    warn(message: string, ...args: any[]): void {
        this.log(LogLevel.Warn, message, args);
    }

    error(message: string, error?: Error | any, ...args: any[]): void {
        const errorInfo = error instanceof Error ? 
            `\\n错误详情: ${error.message}\\n堆栈: ${error.stack}` : 
            error ? `\\n详情: ${JSON.stringify(error)}` : '';
        this.log(LogLevel.Error, message + errorInfo, args);
    }

    private log(level: LogLevel, message: string, args: any[]): void {
        if (level < this.logLevel) {
            return;
        }

        const timestamp = new Date().toISOString();
        const levelName = LogLevel[level].toUpperCase();
        const formattedMessage = `[${timestamp}] [${levelName}] ${message}`;
        
        // 输出到 VS Code 输出面板
        this.outputChannel.appendLine(formattedMessage);
        if (args.length > 0) {
            this.outputChannel.appendLine(JSON.stringify(args, null, 2));
        }

        // 同时输出到控制台（开发调试时可见）
        switch (level) {
            case LogLevel.Debug:
            case LogLevel.Info:
                // eslint-disable-next-line no-console
                console.log(formattedMessage, ...args);
                break;
            case LogLevel.Warn:
                // eslint-disable-next-line no-console
                console.warn(formattedMessage, ...args);
                break;
            case LogLevel.Error:
                // eslint-disable-next-line no-console
                console.error(formattedMessage, ...args);
                break;
        }
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}