// src/shared/utils/pathUtils.ts
// [module: shared] [tags: Utils, Path]
/**
 * 路径处理工具函数
 * 
 * 设计原则：
 * 1. 统一使用 POSIX 格式 (正斜杠 /)
 * 2. 相对路径相对于工作区根目录
 * 3. 始终以 / 开头，例如：/src/foo.ts
 * 4. 跨平台一致性 (Windows/Mac/Linux)
 */

import * as path from 'path';
import * as vscode from 'vscode';

/**
 * 将绝对路径转换为 POSIX 相对路径
 * 
 * @param absPath - 绝对路径 (例如: D:\project\src\foo.ts 或 /home/user/project/src/foo.ts)
 * @param workspaceRoot - 工作区根目录绝对路径
 * @returns POSIX 相对路径，以 / 开头 (例如: /src/foo.ts)
 * 
 * @example
 * ```typescript
 * // Windows
 * toPosixRelative('D:\\project\\src\\foo.ts', 'D:\\project')
 * // => '/src/foo.ts'
 * 
 * // Mac/Linux
 * toPosixRelative('/home/user/project/src/foo.ts', '/home/user/project')
 * // => '/src/foo.ts'
 * ```
 */
export function toPosixRelative(absPath: string, workspaceRoot: string): string {
    // 1. 计算相对路径
    const relative = path.relative(workspaceRoot, absPath);
    
    // 2. 转换为 POSIX 格式 (反斜杠 → 正斜杠)
    const posix = relative.replace(/\\/g, '/');
    
    // 3. 确保以 / 开头
    const normalized = posix.startsWith('/') ? posix : '/' + posix;
    
    return normalized;
}

/**
 * 将 POSIX 相对路径转换为绝对路径
 * 
 * @param posixRelative - POSIX 相对路径 (例如: /src/foo.ts)
 * @param workspaceRoot - 工作区根目录绝对路径
 * @returns 绝对路径
 * 
 * @example
 * ```typescript
 * // Windows
 * toAbsolute('/src/foo.ts', 'D:\\project')
 * // => 'D:\\project\\src\\foo.ts'
 * 
 * // Mac/Linux
 * toAbsolute('/src/foo.ts', '/home/user/project')
 * // => '/home/user/project/src/foo.ts'
 * ```
 */
export function toAbsolute(posixRelative: string, workspaceRoot: string): string {
    // 移除开头的 /
    const relative = posixRelative.startsWith('/') ? posixRelative.slice(1) : posixRelative;
    
    // 拼接为绝对路径
    const absolute = path.join(workspaceRoot, relative);
    
    return absolute;
}

/**
 * 将任意路径转换为 POSIX 格式
 * 
 * @param pathStr - 任意路径字符串
 * @returns POSIX 格式路径
 * 
 * @example
 * ```typescript
 * toPosix('D:\\project\\src\\foo.ts')
 * // => 'D:/project/src/foo.ts'
 * ```
 */
export function toPosix(pathStr: string): string {
    return pathStr.replace(/\\/g, '/');
}

/**
 * 从 URI 获取 POSIX 相对路径
 * 
 * @param uri - vscode.Uri 对象
 * @param workspaceRoot - 工作区根目录 URI
 * @returns POSIX 相对路径
 * 
 * @example
 * ```typescript
 * const fileUri = vscode.Uri.file('D:\\project\\src\\foo.ts');
 * const rootUri = vscode.Uri.file('D:\\project');
 * uriToRelative(fileUri, rootUri)
 * // => '/src/foo.ts'
 * ```
 */
export function uriToRelative(uri: vscode.Uri, workspaceRoot: vscode.Uri): string {
    return toPosixRelative(uri.fsPath, workspaceRoot.fsPath);
}

/**
 * 规范化文件路径（用于日志和显示）
 * 
 * @param pathStr - 任意路径字符串
 * @returns 规范化的路径
 * 
 * @example
 * ```typescript
 * normalize('D:\\project\\src\\..\\foo.ts')
 * // => 'D:/project/foo.ts'
 * ```
 */
export function normalize(pathStr: string): string {
    return path.normalize(pathStr).replace(/\\/g, '/');
}

/**
 * 获取文件的工作区相对路径（如果在工作区内）
 * 
 * @param uri - 文件 URI
 * @returns POSIX 相对路径，如果不在工作区内则返回 null
 * 
 * @example
 * ```typescript
 * const fileUri = vscode.Uri.file('D:\\project\\src\\foo.ts');
 * getWorkspaceRelative(fileUri)
 * // => '/src/foo.ts'
 * ```
 */
export function getWorkspaceRelative(uri: vscode.Uri): string | null {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
        return null;
    }
    
    return toPosixRelative(uri.fsPath, workspaceFolder.uri.fsPath);
}

/**
 * 检查路径是否在工作区内
 * 
 * @param uri - 文件 URI
 * @returns 是否在工作区内
 */
export function isInWorkspace(uri: vscode.Uri): boolean {
    return vscode.workspace.getWorkspaceFolder(uri) !== undefined;
}

/**
 * 比较两个路径是否相同（忽略平台差异）
 * 
 * @param path1 - 路径1
 * @param path2 - 路径2
 * @returns 是否相同
 * 
 * @example
 * ```typescript
 * pathsEqual('D:\\project\\src', 'D:/project/src')
 * // => true
 * ```
 */
export function pathsEqual(path1: string, path2: string): boolean {
    return normalize(path1) === normalize(path2);
}

/**
 * 获取相对路径的父目录
 * 
 * @param posixRelative - POSIX 相对路径 (例如: /src/foo/bar.ts)
 * @returns 父目录相对路径 (例如: /src/foo)
 * 
 * @example
 * ```typescript
 * getParentDir('/src/foo/bar.ts')
 * // => '/src/foo'
 * 
 * getParentDir('/src')
 * // => '/'
 * ```
 */
export function getParentDir(posixRelative: string): string {
    // 移除开头的 /
    const relative = posixRelative.startsWith('/') ? posixRelative.slice(1) : posixRelative;
    
    // 获取父目录
    const parent = path.dirname(relative);
    
    // 如果是 '.' 表示根目录
    if (parent === '.') {
        return '/';
    }
    
    // 转换为 POSIX 并加上前导 /
    const posixParent = parent.replace(/\\/g, '/');
    return posixParent.startsWith('/') ? posixParent : '/' + posixParent;
}

/**
 * 获取文件名（不含路径）
 * 
 * @param posixRelative - POSIX 相对路径
 * @returns 文件名
 * 
 * @example
 * ```typescript
 * getFileName('/src/foo/bar.ts')
 * // => 'bar.ts'
 * ```
 */
export function getFileName(posixRelative: string): string {
    return path.basename(posixRelative);
}

/**
 * 获取文件扩展名
 * 
 * @param posixRelative - POSIX 相对路径
 * @returns 扩展名（包含点号，如 '.ts'）
 * 
 * @example
 * ```typescript
 * getExtension('/src/foo/bar.ts')
 * // => '.ts'
 * ```
 */
export function getExtension(posixRelative: string): string {
    return path.extname(posixRelative);
}

/**
 * 路径工具使用指南：
 * 
 * 1. 所有内部存储使用 POSIX 相对路径
 *    - FileCapsule.file = '/src/foo.ts'
 *    - Node.data.path = '/src/foo.ts'
 *    - Message.payload.path = '/src/foo.ts'
 * 
 * 2. 与 VSCode API 交互时转换
 *    - 读取文件：toAbsolute() → vscode.Uri.file()
 *    - 处理完成：toPosixRelative() → 存储
 * 
 * 3. 日志输出使用相对路径
 *    - logger.info(`分析文件: ${relativePath}`)
 * 
 * 4. 跨平台一致性
 *    - Windows: D:\project\src\foo.ts → /src/foo.ts
 *    - Mac/Linux: /home/user/project/src/foo.ts → /src/foo.ts
 */
