// 文件: src/features/filetree-blueprint/panel/resolveTarget.ts
// [module: filetree-blueprint] [tags: Utils, Path Resolution]
/**
 * 统一的目标路径解析工具
 * 
 * 功能：
 * - 把各种入口（TreeItem、FileNode、Uri、字符串）解析为 file:// Uri
 * - 同时返回用于本面板的 rootUri（优先: 所在工作区; 兜底: 目标自身）
 * 
 * 用途：
 * - 右键菜单入口
 * - AI 资源管理器 TreeItem
 * - 命令面板传参
 * - 避免 "无法确定工作区根目录" 错误
 */

import * as vscode from 'vscode';

export interface ResolvedTarget {
    /** 目标路径（文件或文件夹）*/
    target: vscode.Uri;
    /** 面板根目录（用于相对路径计算）*/
    root: vscode.Uri;
}

/**
 * 从任何传参推导出目标 Uri 和根 Uri
 * 
 * @param raw - 可能的输入类型：
 *   - FileNode (AI Explorer TreeItem)
 *   - vscode.TreeItem
 *   - vscode.Uri
 *   - string (绝对路径)
 * @returns { target, root } - 目标 Uri 和根 Uri
 * 
 * @example
 * ```typescript
 * // 右键菜单
 * const { target, root } = resolveTargetToFileAndRoot(uri);
 * 
 * // AI Explorer TreeItem
 * const { target, root } = resolveTargetToFileAndRoot(treeItem);
 * 
 * // 命令面板
 * const { target, root } = resolveTargetToFileAndRoot('/path/to/folder');
 * ```
 */
export function resolveTargetToFileAndRoot(raw: any): ResolvedTarget {
    // 1) FileNode 支持 (AI Explorer TreeItem)
    // FileNode 有 path 字符串属性
    if (raw && typeof raw === 'object' && typeof raw.path === 'string') {
        const target = vscode.Uri.file(raw.path);
        const wf = vscode.workspace.getWorkspaceFolder(target);
        const root = wf?.uri ?? target; // ✅ 不在工作区也能用自身做根
        return { target, root };
    }

    // 2) TreeItem 支持 (vscode.TreeItem)
    // TreeItem 有 resourceUri 属性
    if (raw?.resourceUri) {
        const target = raw.resourceUri as vscode.Uri;
        const wf = vscode.workspace.getWorkspaceFolder(target);
        const root = wf?.uri ?? target;
        return { target, root };
    }

    // 3) Uri 支持
    if (raw instanceof vscode.Uri) {
        const wf = vscode.workspace.getWorkspaceFolder(raw);
        const root = wf?.uri ?? raw;
        return { target: raw, root };
    }

    // 4) 字符串路径支持
    if (typeof raw === 'string') {
        const target = vscode.Uri.file(raw);
        const wf = vscode.workspace.getWorkspaceFolder(target);
        const root = wf?.uri ?? target;
        return { target, root };
    }

    // 5) 兜底：无法解析
    throw vscode.FileSystemError.FileNotFound('无法解析目标路径: ' + String(raw));
}

/**
 * 将路径转换为 POSIX 格式（正斜杠）
 * Windows 路径 C:\foo\bar => /foo/bar 或 C:/foo/bar
 */
export function toPosix(p: string): string {
    return p.replace(/\\/g, '/');
}

/**
 * 计算相对路径（POSIX 格式）
 * 
 * @param from - 根目录 Uri
 * @param to - 目标 Uri
 * @returns 相对路径，以 / 开头
 * 
 * @example
 * ```typescript
 * const root = vscode.Uri.file('/workspace');
 * const file = vscode.Uri.file('/workspace/src/index.ts');
 * const rel = relativePosix(root, file); // => '/src/index.ts'
 * ```
 */
export function relativePosix(from: vscode.Uri, to: vscode.Uri): string {
    const fromPath = toPosix(from.fsPath);
    const toPath = toPosix(to.fsPath);

    if (toPath.startsWith(fromPath)) {
        let rel = toPath.slice(fromPath.length);
        if (!rel.startsWith('/')) {
            rel = '/' + rel;
        }
        return rel;
    }

    // 如果不在同一根目录下，返回绝对路径
    return toPath;
}

/**
 * 将相对路径转换为绝对 Uri
 * 
 * @param root - 根目录 Uri
 * @param relativePath - 相对路径（可选的 / 前缀）
 * @returns 绝对 Uri
 * 
 * @example
 * ```typescript
 * const root = vscode.Uri.file('/workspace');
 * const abs = toAbsoluteUri(root, '/src/index.ts');
 * // => file:///workspace/src/index.ts
 * ```
 */
export function toAbsoluteUri(root: vscode.Uri, relativePath: string): vscode.Uri {
    const rel = relativePath.replace(/^\/+/, ''); // 移除前导斜杠
    return vscode.Uri.joinPath(root, rel);
}
