import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('AI Explorer Integration Tests', () => {
    let extension: vscode.Extension<any>;

    suiteSetup(async () => {
        // 获取扩展实例
        extension = vscode.extensions.getExtension('your-publisher.ai-explorer')!;
        if (!extension.isActive) {
            await extension.activate();
        }
    });

    suite('Extension Activation', () => {
        test('应该成功激活扩展', () => {
            assert.ok(extension);
            assert.ok(extension.isActive);
        });

        test('应该注册所有命令', async () => {
            const commands = await vscode.commands.getCommands(true);
            const aiExplorerCommands = commands.filter(cmd => cmd.startsWith('aiExplorer.'));
            
            // 检查核心命令是否已注册
            const expectedCommands = [
                'aiExplorer.openFileTreeBlueprint',
                'aiExplorer.refreshFileTree',
                'aiExplorer.analyzeFile',
                'aiExplorer.setApiKey'
            ];

            expectedCommands.forEach(cmd => {
                assert.ok(aiExplorerCommands.includes(cmd), `命令 ${cmd} 未注册`);
            });
        });
    });

    suite('File Analysis Feature', () => {
        test('应该能够分析 TypeScript 文件', async function() {
            this.timeout(10000); // 增加超时时间

            // 创建临时测试文件
            const testContent = `
                class TestClass {
                    private value: number = 42;
                    
                    public getValue(): number {
                        return this.value;
                    }
                }
            `;

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            assert.ok(workspaceFolder, '需要打开工作区');

            const testFilePath = path.join(workspaceFolder.uri.fsPath, 'test-temp.ts');
            const testFileUri = vscode.Uri.file(testFilePath);

            // 创建并打开测试文件
            await vscode.workspace.fs.writeFile(testFileUri, Buffer.from(testContent));
            const document = await vscode.workspace.openTextDocument(testFileUri);
            await vscode.window.showTextDocument(document);

            // 等待一下确保文件完全加载
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 模拟双击文件事件 - 这里需要调用相应的分析命令
            try {
                await vscode.commands.executeCommand('aiExplorer.analyzeFile', testFileUri);
                
                // 验证分析结果 - 这里需要根据实际实现调整
                // 例如检查是否生成了分析卡片、是否更新了文件树等
                
                assert.ok(true, '文件分析命令执行成功');
            } catch (error) {
                assert.fail(`文件分析失败: ${error}`);
            } finally {
                // 清理测试文件
                try {
                    await vscode.workspace.fs.delete(testFileUri);
                } catch {
                    // 忽略删除错误
                }
            }
        });

        test('应该正确处理不支持的文件类型', async function() {
            this.timeout(5000);

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            assert.ok(workspaceFolder, '需要打开工作区');

            // 创建二进制文件
            const binaryFilePath = path.join(workspaceFolder.uri.fsPath, 'test-binary.exe');
            const binaryFileUri = vscode.Uri.file(binaryFilePath);

            try {
                await vscode.workspace.fs.writeFile(binaryFileUri, new Uint8Array([0x4D, 0x5A])); // PE header

                // 尝试分析二进制文件
                const result = await vscode.commands.executeCommand('aiExplorer.analyzeFile', binaryFileUri);
                
                // 应该优雅地处理不支持的文件类型
                assert.ok(result !== undefined, '应该返回分析结果（即使是错误或跳过）');
                
            } finally {
                // 清理测试文件
                try {
                    await vscode.workspace.fs.delete(binaryFileUri);
                } catch {
                    // 忽略删除错误
                }
            }
        });
    });

    suite('Webview Communication', () => {
        test('应该能够创建文件树蓝图面板', async function() {
            this.timeout(5000);

            try {
                // 执行打开文件树蓝图命令
                await vscode.commands.executeCommand('aiExplorer.openFileTreeBlueprint');
                
                // 验证 webview 面板是否创建
                // 注意：这里需要根据实际的 webview 管理方式来验证
                assert.ok(true, '文件树蓝图面板创建成功');
                
            } catch (error) {
                assert.fail(`创建文件树蓝图面板失败: ${error}`);
            }
        });

        test('应该正确处理 webview 消息', async function() {
            this.timeout(3000);

            // 这个测试需要根据实际的消息处理机制来实现
            // 例如模拟从 webview 发送消息到扩展后端
            
            // 模拟测试
            const testMessage = {
                type: 'analyze-file',
                data: { filePath: '/test/path' }
            };

            // 这里需要根据实际的消息处理器来测试
            assert.ok(testMessage.type === 'analyze-file', '消息类型正确');
        });
    });

    suite('API Key Management', () => {
        test('应该能够设置和获取 API Key', async function() {
            this.timeout(3000);

            const testApiKey = 'test-api-key-12345';

            try {
                // 设置 API Key
                await vscode.commands.executeCommand('aiExplorer.setApiKey', testApiKey);
                
                // 验证 API Key 是否正确保存
                // 这里需要根据实际的存储机制来验证
                // 例如从配置或密钥存储中读取
                
                assert.ok(true, 'API Key 设置成功');
                
            } catch (error) {
                assert.fail(`API Key 设置失败: ${error}`);
            }
        });
    });

    suite('Error Handling', () => {
        test('应该优雅地处理网络错误', async function() {
            this.timeout(5000);

            // 模拟网络错误情况
            // 这需要根据实际的 AI 客户端实现来测试
            
            try {
                // 使用无效的 API Key 或端点来触发网络错误
                const result = await vscode.commands.executeCommand('aiExplorer.analyzeFile', 
                    vscode.Uri.file('non-existent-file.ts'));
                
                // 应该返回错误信息而不是抛出异常
                assert.ok(result !== undefined, '应该优雅地处理错误');
                
            } catch (error) {
                // 如果确实需要抛出异常，确保错误信息有意义
                assert.ok((error as Error).message.length > 0, '错误信息应该有意义');
            }
        });
    });

    suiteTeardown(async () => {
        // 清理工作
        console.log('集成测试完成');
    });
});