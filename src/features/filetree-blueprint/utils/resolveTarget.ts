// src/features/filetree-blueprint/utils/resolveTarget.ts
// [module: filetree-blueprint] [tags: Utils, URI]
/**
 * URI 解析工具
 * 将各种入口上下文（右键、命令面板、快捷键等）解析为文件系统 URI
 * 如果无法获取有效的 file: URI，会提示用户选择文件或文件夹
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface ResolvedTarget {
    /** 工作区根文件夹 */
    workspace: vscode.WorkspaceFolder;
    /** 焦点目录的 URI（始终是文件夹的 file: URI） */
    folderUri: vscode.Uri;
    /** 相对于工作区根的路径，以 / 开头，如 /docs/architecture */
    focusPath: string;
}

/**
 * 解析目标为文件系统 URI
 * 
 * @param raw 原始输入参数（可能来自右键菜单、命令面板等）
 * @returns 解析后的目标信息，如果用户取消选择则返回 undefined
 */
export async function resolveTargetToFileUri(
    raw?: unknown
): Promise<ResolvedTarget | undefined> {
    // 🔍 调试日志：查看接收到的参数类型
    console.log('[resolveTargetToFileUri] 接收参数类型:', typeof raw);
    console.log('[resolveTargetToFileUri] 参数详情:', raw);
    if ((raw as any)?.resourceUri) {
        console.log('[resolveTargetToFileUri] resourceUri:', (raw as any).resourceUri.toString());
    }

    // 1) 优先从原始参数解析 URI
    let uri: vscode.Uri | undefined;

    // 优先检查 resourceUri（TreeItem 对象）
    if ((raw as any)?.resourceUri instanceof vscode.Uri) {
        uri = (raw as any).resourceUri as vscode.Uri;
        console.log('[resolveTargetToFileUri] 从 resourceUri 提取:', uri.toString());
    } 
    // 多选场景，取第一个
    else if (Array.isArray(raw) && raw.length > 0) {
        const first = raw[0];
        if ((first as any)?.resourceUri instanceof vscode.Uri) {
            uri = (first as any).resourceUri as vscode.Uri;
            console.log('[resolveTargetToFileUri] 从数组第一项的 resourceUri 提取:', uri.toString());
        } else if (first instanceof vscode.Uri) {
            uri = first;
            console.log('[resolveTargetToFileUri] 从数组第一项提取 Uri:', uri.toString());
        }
    } 
    // 直接传入 URI
    else if (raw instanceof vscode.Uri) {
        uri = raw;
        console.log('[resolveTargetToFileUri] 直接 Uri 参数:', uri.toString());
    } 
    // 命令面板/快捷键触发，无上下文
    else {
        console.log('[resolveTargetToFileUri] 未检测到任何 URI，准备弹出选择框');
        uri = undefined;
    }

    // 2) 确定工作区
    const workspace = (uri && vscode.workspace.getWorkspaceFolder(uri)) 
        ?? vscode.workspace.workspaceFolders?.[0];

    if (!workspace) {
        vscode.window.showWarningMessage('请先打开一个工作区再生成蓝图。');
        return undefined;
    }

    // 3) 如果 URI 不是 file: 协议或者没有 URI，让用户选择
    if (!uri || uri.scheme !== 'file') {
        const reason = uri 
            ? `当前上下文不是文件系统资源（${uri.scheme}:）` 
            : '未检测到文件上下文';

        const picked = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: true,
            canSelectMany: false,
            defaultUri: workspace.uri,
            title: `${reason}，请选择要生成蓝图的文件或文件夹`,
            openLabel: '生成蓝图'
        });

        if (!picked || picked.length === 0) {
            return undefined; // 用户取消
        }

        uri = picked[0];
    }

    // 4) 确保是文件夹：如果选中的是文件，切换到父目录
    let folderUri: vscode.Uri;
    
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        const isDirectory = (stat.type & vscode.FileType.Directory) !== 0;
        
        if (isDirectory) {
            folderUri = uri;
        } else {
            // 是文件，使用父目录
            folderUri = vscode.Uri.file(path.dirname(uri.fsPath));
        }
    } catch (error) {
        // 路径不存在或无法访问，回退到工作区根
        vscode.window.showWarningMessage(
            `无法访问路径 ${uri.fsPath}，将使用工作区根目录。`
        );
        folderUri = workspace.uri;
    }

    // 5) 计算相对路径（用于面包屑导航和标题）
    const relativePath = path.relative(workspace.uri.fsPath, folderUri.fsPath);
    const focusPath = relativePath 
        ? '/' + relativePath.split(path.sep).join('/')
        : '/';

    return {
        workspace,
        folderUri,
        focusPath
    };
}

/**
 * 返回上一级路径
 * @param currentPath 当前路径，如 /docs/architecture
 * @returns 父路径，如 /docs；根路径返回 /
 */
export function drillUp(currentPath: string): string {
    if (currentPath === '/' || !currentPath) {
        return '/';
    }

    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    
    return parts.length ? '/' + parts.join('/') : '/';
}

/**
 * 将字符串转换为安全的 ID（用于节点 ID）
 * @param str 原始字符串
 * @returns 安全的 ID 字符串
 */
export function safeId(str: string): string {
    return str.replace(/[^\w\-./]/g, '_');
}
