/**
 * NotesStore - 备注持久化存储服务
 * 
 * 职责：
 * 1. 保存文件的备注内容到 Markdown 文件
 * 2. 读取已保存的备注
 * 3. 提供删除和管理接口
 * 
 * 存储路径：`<workspace>/.ai-explorer-cache/notes/<featureId>/<relpath>.md`
 * 
 * 示例：
 * - `src/index.ts` 的备注存储在 `notes/default/src/index.ts.md`
 * - `lib/utils.ts` 的备注存储在 `notes/default/lib/utils.ts.md`
 */

import * as vscode from 'vscode';
import * as path from 'path';

export class NotesStore {
    private readonly workspaceUri: vscode.Uri;
    private readonly notesDir: vscode.Uri;

    constructor(workspaceUri: vscode.Uri, featureId: string = 'default') {
        this.workspaceUri = workspaceUri;
        this.notesDir = vscode.Uri.joinPath(
            workspaceUri,
            '.ai-explorer-cache',
            'notes',
            featureId
        );
    }

    /**
     * 读取备注内容
     * @param filePath - 文件路径（相对路径）
     * @returns 备注内容（Markdown）
     */
    async read(filePath: string): Promise<string> {
        try {
            const noteUri = this.getNoteUri(filePath);
            const fileData = await vscode.workspace.fs.readFile(noteUri);
            const content = Buffer.from(fileData).toString('utf8');
            console.log(`[NotesStore] 📖 读取备注: ${filePath} (${content.length} 字符)`);
            return content;
        } catch (error) {
            // 文件不存在，返回空字符串
            console.log(`[NotesStore] ℹ️ 备注不存在: ${filePath}`);
            return '';
        }
    }

    /**
     * 写入备注内容
     * @param filePath - 文件路径（相对路径）
     * @param content - 备注内容（Markdown）
     */
    async write(filePath: string, content: string): Promise<void> {
        try {
            const noteUri = this.getNoteUri(filePath);
            
            // 确保目录存在
            const noteDir = vscode.Uri.joinPath(
                noteUri,
                '..'
            );
            await vscode.workspace.fs.createDirectory(noteDir);

            // 写入文件
            await vscode.workspace.fs.writeFile(
                noteUri,
                new TextEncoder().encode(content)
            );

            console.log(`[NotesStore] 💾 保存备注: ${filePath} (${content.length} 字符)`);
        } catch (error) {
            console.error(`[NotesStore] ❌ 保存失败: ${filePath}`, error);
            throw error;
        }
    }

    /**
     * 删除备注
     * @param filePath - 文件路径
     */
    async delete(filePath: string): Promise<void> {
        try {
            const noteUri = this.getNoteUri(filePath);
            await vscode.workspace.fs.delete(noteUri);
            console.log(`[NotesStore] 🗑️ 删除备注: ${filePath}`);
        } catch (error) {
            // 文件不存在，忽略错误
            console.log(`[NotesStore] ℹ️ 备注不存在，无需删除: ${filePath}`);
        }
    }

    /**
     * 检查备注是否存在
     * @param filePath - 文件路径
     * @returns 是否存在
     */
    async exists(filePath: string): Promise<boolean> {
        try {
            const noteUri = this.getNoteUri(filePath);
            await vscode.workspace.fs.stat(noteUri);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 列出所有备注
     * @returns 文件路径数组
     */
    async listAll(): Promise<string[]> {
        try {
            const files = await this.walkDirectory(this.notesDir);
            const notes = files
                .filter(f => f.endsWith('.md'))
                .map(f => this.getNotePathFromUri(f));
            
            console.log(`[NotesStore] 📚 列出备注: ${notes.length} 条`);
            return notes;
        } catch {
            console.log('[NotesStore] ℹ️ 备注目录不存在');
            return [];
        }
    }

    /**
     * 清空所有备注
     */
    async clearAll(): Promise<void> {
        try {
            await vscode.workspace.fs.delete(this.notesDir, { recursive: true });
            console.log('[NotesStore] 🧹 清空所有备注');
        } catch {
            console.log('[NotesStore] ℹ️ 备注目录不存在，无需清空');
        }
    }

    /**
     * 获取备注统计
     * @returns 统计信息
     */
    async getStats(): Promise<{ count: number; totalSize: number }> {
        try {
            const files = await this.walkDirectory(this.notesDir);
            const noteFiles = files.filter(f => f.endsWith('.md'));
            
            let totalSize = 0;
            for (const file of noteFiles) {
                try {
                    const uri = vscode.Uri.file(file);
                    const stat = await vscode.workspace.fs.stat(uri);
                    totalSize += stat.size;
                } catch {
                    // 忽略错误
                }
            }

            return {
                count: noteFiles.length,
                totalSize
            };
        } catch {
            return { count: 0, totalSize: 0 };
        }
    }

    /**
     * 获取备注文件的 URI
     * @private
     */
    private getNoteUri(filePath: string): vscode.Uri {
        // 规范化路径（替换反斜杠为正斜杠）
        const normalizedPath = filePath.replace(/\\/g, '/');
        
        // 添加 .md 扩展名
        const noteFileName = `${normalizedPath}.md`;
        
        return vscode.Uri.joinPath(this.notesDir, noteFileName);
    }

    /**
     * 从 URI 恢复文件路径
     * @private
     */
    private getNotePathFromUri(uri: string): string {
        const notesPath = this.notesDir.fsPath;
        const relativePath = path.relative(notesPath, uri);
        
        // 移除 .md 扩展名
        return relativePath.replace(/\.md$/, '');
    }

    /**
     * 递归遍历目录
     * @private
     */
    private async walkDirectory(dirUri: vscode.Uri): Promise<string[]> {
        const files: string[] = [];
        
        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            
            for (const [name, type] of entries) {
                const entryUri = vscode.Uri.joinPath(dirUri, name);
                
                if (type === vscode.FileType.Directory) {
                    // 递归遍历子目录
                    const subFiles = await this.walkDirectory(entryUri);
                    files.push(...subFiles);
                } else {
                    // 添加文件
                    files.push(entryUri.fsPath);
                }
            }
        } catch {
            // 目录不存在，返回空数组
        }
        
        return files;
    }

    /**
     * 获取存储目录路径（用于调试）
     */
    getStorePath(): string {
        return this.notesDir.fsPath;
    }
}
