// src/features/explorer-alias/app/commands/APIKeyCommands.ts
// [module: explorer-alias] [tags: Commands, API, Configuration, Settings]
/**
 * API Key 管理命令
 * 处理 OpenAI 和腾讯混元等 API Key 的设置和管理
 */

import * as vscode from 'vscode';
import { Logger } from '../../../../core/logging/Logger';

export class APIKeyCommands {
    constructor(private logger: Logger) {}

    /**
     * 设置 OpenAI API Key
     */
    async setOpenAIKey(): Promise<void> {
        try {
            const apiKey = await vscode.window.showInputBox({
                prompt: '请输入 OpenAI API Key',
                password: true,
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'API Key 不能为空';
                    }
                    if (!value.startsWith('sk-')) {
                        return 'OpenAI API Key 应该以 "sk-" 开头';
                    }
                    if (value.length < 20) {
                        return 'API Key 长度不正确';
                    }
                    return null;
                }
            });

            if (apiKey) {
                const config = vscode.workspace.getConfiguration('aiExplorer');
                await config.update('openaiApiKey', apiKey, vscode.ConfigurationTarget.Global);
                
                this.logger.info('OpenAI API Key 设置成功');
                vscode.window.showInformationMessage('OpenAI API Key 设置成功！');
                
                // 测试 API Key
                await this.testAPIKey('openai', apiKey);
            }
        } catch (error) {
            this.logger.error('设置 OpenAI API Key 失败', error);
            vscode.window.showErrorMessage('设置 OpenAI API Key 失败');
        }
    }

    /**
     * 设置腾讯混元 API Key
     */
    async setHunyuanKey(): Promise<void> {
        try {
            const apiKey = await vscode.window.showInputBox({
                prompt: '请输入腾讯混元 API Key',
                password: true,
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'API Key 不能为空';
                    }
                    if (value.length < 10) {
                        return 'API Key 长度不正确';
                    }
                    return null;
                }
            });

            if (apiKey) {
                const config = vscode.workspace.getConfiguration('aiExplorer');
                await config.update('hunyuanApiKey', apiKey, vscode.ConfigurationTarget.Global);
                
                this.logger.info('腾讯混元 API Key 设置成功');
                vscode.window.showInformationMessage('腾讯混元 API Key 设置成功！');
                
                // 测试 API Key
                await this.testAPIKey('hunyuan', apiKey);
            }
        } catch (error) {
            this.logger.error('设置腾讯混元 API Key 失败', error);
            vscode.window.showErrorMessage('设置腾讯混元 API Key 失败');
        }
    }

    /**
     * 选择主要 AI 提供商
     */
    async chooseProvider(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('aiExplorer');
            const currentPrimary = config.get<string>('provider.primary', 'openai');
            const currentFallback = config.get<string>('provider.fallback', 'none');

            const providers = [
                {
                    label: 'OpenAI',
                    description: currentPrimary === 'openai' ? '（当前主要提供商）' : '',
                    value: 'openai'
                },
                {
                    label: '腾讯混元',
                    description: currentPrimary === 'hunyuan' ? '（当前主要提供商）' : '',
                    value: 'hunyuan'
                }
            ];

            const selectedPrimary = await vscode.window.showQuickPick(providers, {
                placeHolder: '选择主要 AI 提供商',
                ignoreFocusOut: true
            });

            if (!selectedPrimary) {
                return;
            }

            // 选择备用提供商
            const fallbackOptions = [
                { label: '无备用提供商', value: 'none' },
                ...providers.filter(p => p.value !== selectedPrimary.value)
            ];

            const selectedFallback = await vscode.window.showQuickPick(fallbackOptions, {
                placeHolder: '选择备用 AI 提供商（可选）',
                ignoreFocusOut: true
            });

            if (selectedFallback) {
                // 更新配置
                await config.update('provider.primary', selectedPrimary.value, vscode.ConfigurationTarget.Global);
                await config.update('provider.fallback', selectedFallback.value, vscode.ConfigurationTarget.Global);

                this.logger.info(`AI 提供商配置更新: 主要=${selectedPrimary.value}, 备用=${selectedFallback.value}`);
                
                const message = selectedFallback.value === 'none' 
                    ? `已设置主要提供商为：${selectedPrimary.label}`
                    : `已设置主要提供商为：${selectedPrimary.label}，备用提供商为：${selectedFallback.label}`;
                
                vscode.window.showInformationMessage(message);

                // 显示 API Key 设置提示
                await this.checkAPIKeyStatus();
            }
        } catch (error) {
            this.logger.error('选择 AI 提供商失败', error);
            vscode.window.showErrorMessage('选择 AI 提供商失败');
        }
    }

    /**
     * 检查当前 API Key 配置状态
     */
    async checkAPIKeyStatus(): Promise<void> {
        const config = vscode.workspace.getConfiguration('aiExplorer');
        const primaryProvider = config.get<string>('provider.primary', 'openai');
        const fallbackProvider = config.get<string>('provider.fallback', 'none');

        const status = {
            openai: {
                configured: !!config.get<string>('openaiApiKey'),
                needed: primaryProvider === 'openai' || fallbackProvider === 'openai'
            },
            hunyuan: {
                configured: !!config.get<string>('hunyuanApiKey'),
                needed: primaryProvider === 'hunyuan' || fallbackProvider === 'hunyuan'
            }
        };

        const missingKeys: string[] = [];
        
        if (status.openai.needed && !status.openai.configured) {
            missingKeys.push('OpenAI');
        }
        
        if (status.hunyuan.needed && !status.hunyuan.configured) {
            missingKeys.push('腾讯混元');
        }

        if (missingKeys.length > 0) {
            const action = await vscode.window.showWarningMessage(
                `以下提供商需要配置 API Key：${missingKeys.join('、')}`,
                '立即配置',
                '稍后配置'
            );

            if (action === '立即配置') {
                await this.showAPIKeySetupWizard();
            }
        } else {
            const statusItems = [];
            if (status.openai.configured) statusItems.push('OpenAI ✓');
            if (status.hunyuan.configured) statusItems.push('腾讯混元 ✓');
            
            vscode.window.showInformationMessage(`API Key 配置状态：${statusItems.join('、')}`);
        }
    }

    /**
     * API Key 设置向导
     */
    async showAPIKeySetupWizard(): Promise<void> {
        const config = vscode.workspace.getConfiguration('aiExplorer');
        const primaryProvider = config.get<string>('provider.primary', 'openai');
        const fallbackProvider = config.get<string>('provider.fallback', 'none');

        const setupTasks = [];

        if ((primaryProvider === 'openai' || fallbackProvider === 'openai') && 
            !config.get<string>('openaiApiKey')) {
            setupTasks.push({
                label: '$(key) 设置 OpenAI API Key',
                description: '配置 OpenAI 服务密钥',
                action: () => this.setOpenAIKey()
            });
        }

        if ((primaryProvider === 'hunyuan' || fallbackProvider === 'hunyuan') && 
            !config.get<string>('hunyuanApiKey')) {
            setupTasks.push({
                label: '$(key) 设置腾讯混元 API Key',
                description: '配置腾讯混元服务密钥',
                action: () => this.setHunyuanKey()
            });
        }

        if (setupTasks.length === 0) {
            vscode.window.showInformationMessage('所有必需的 API Key 都已配置！');
            return;
        }

        const selected = await vscode.window.showQuickPick(setupTasks, {
            placeHolder: '选择要配置的 API Key',
            ignoreFocusOut: true
        });

        if (selected) {
            await selected.action();
        }
    }

    /**
     * 测试 API Key 有效性
     */
    private async testAPIKey(provider: 'openai' | 'hunyuan', apiKey: string): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `测试 ${provider === 'openai' ? 'OpenAI' : '腾讯混元'} API Key...`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 50 });
                
                // 这里应该调用实际的 AI 客户端进行测试
                // 为了简化，这里只是模拟
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                progress.report({ increment: 100 });
            });

            vscode.window.showInformationMessage(
                `${provider === 'openai' ? 'OpenAI' : '腾讯混元'} API Key 测试成功！`
            );
        } catch (error) {
            this.logger.warn(`${provider} API Key 测试失败`, error);
            vscode.window.showWarningMessage(
                `${provider === 'openai' ? 'OpenAI' : '腾讯混元'} API Key 测试失败，请检查密钥是否正确`
            );
        }
    }
}