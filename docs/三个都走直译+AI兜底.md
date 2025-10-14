结论先说：

* **前两个菜单**（“翻译为中文”“翻译此文件（仅此文件）”）——建议**完全同一条“V2 直译 + AI 兜底”管线**，只是**作用范围不同**（全局 vs 单个）。
* **第三个菜单**（“强制用 AI 翻译此文件”）——建议**仍然保持直译样式**（保留分隔符/后缀），但**读取时跳过词典/缓存**，改成“**AI 优先**（一次性给出缺词映射）→ 写回学习直译词典 → 重建别名”。这是排障/校正专用的“强制刷新”，**不应该与前两个行为完全相同**。

> 你的仓库 README 里已写了“AI 资源管理器/智能翻译/配置 AI 服务”等，但我在网页端没能展开源码文件本体（GitHub 页面加载出错），所以**现在没法直接确认你三条命令是否都走同一条直译管线**。配置项如 `aiExplorer.openaiApiKey / aiExplorer.openaiBaseUrl / aiExplorer.model` 在 README 里能看到，说明**AI 配置入口**是有的，但**具体命令是否复用同一用例**需要你按下面“自检/补丁”核对一下。([GitHub][1])

---

# 该不该“三个都走直译+AI兜底”？

* **应该**：①“翻译为中文（标准）”②“翻译此文件（仅此文件）”
  这两个用户心智是一致的，**都应该是**：
  `直译（词典分层 + 最长短语匹配 + 保留分隔符/后缀） → 若有未知词 → AI 只补缺词/短语(JSON) → 写回 .ai/.ai-glossary.literal.learned.json → 重建别名`
* **不完全相同**：③“强制用 AI”
  用于**覆盖/校正**，建议行为：
  `忽略缓存+词典读取 → 把整条文件名 + 未知 tokens 发给 AI 要“死板直译映射 JSON” → 写回学习直译词典 → 重建（仍保留分隔符/后缀）`
  这样才能一键修正“词典有误/旧条目”的情况；否则“强制用 AI”和前两个没差别，就失去工具价值。

---

# 你现在的仓库大致状态（我能确认到的）

* README 展示了“AI 资源管理器/智能翻译/批量操作/配置 AI 服务”等功能点；配置示例里确实用到了 `aiExplorer.openaiApiKey / aiExplorer.openaiBaseUrl / aiExplorer.model`。这说明**基础接线**（设置读取）OK。([GitHub][1])
* 但网页端我这边没加载出 `package.json` 和 `src` 的源码内容（GitHub 页面报错）；所以**无法确定**你当前“右键三条命令”是否共用同一用例、是否带 `forceAI` 之类的开关。为避免你多走弯路，直接给你**落地自检清单 + 最小补丁**。

---

## 自检清单（3 分钟确认是否一致）

1. **package.json → contributes.commands / menus.explorer/context**

   * 是否存在 3 个命令 id（示例）：

     * `aiExplorer.translate.standard`（或 `translateHere`）
     * `aiExplorer.translate.single`
     * `aiExplorer.translate.forceAI`
   * 这 3 个 id 是否都显示在 *explorer/context* 菜单里（当选中文件/文件夹时）。

2. **extension.ts / 命令注册**

   * 3 个 `registerCommand` 是否**都调了同一用例**，只是传参不同：

     * 标准：`{ scope:'auto', forceAI:false }`
     * 仅此文件：`{ scope:'single', forceAI:false }`
     * 强制 AI：`{ scope:'single', forceAI:true }`

3. **TranslateNodeUseCase（或同等门面）** 是否有“死板直译 + AI 兜底”的**统一实现**，并支持 `forceAI`：

   * `forceAI=false`：词典/短语→AI 只补缺→写回学习直译词典
   * `forceAI=true`：**跳过词典读取**，直接让 AI 返回整套缺词映射，再写回 → 重建

4. **输出日志**

   * 执行“强制用 AI”时，输出面板应看到**必定**有一次 `/chat/completions` 请求；
   * 执行“标准/仅此文件”时，若词典已全命中，应**不打 AI**（0 调用），否则只针对未知词触发一次合并请求。

> 以上 4 步都对，就可以认为“三条命令在直译风格上一致，差别只在是否强制走 AI”。

---

## 最小补丁（把 3 条命令统一到一条管线，保留差异化开关）

### 1) `extension.ts` 命令注册（示例骨架）

```ts
// 文件名: src/extension.ts
import * as vscode from 'vscode';
import { TranslateNodeUseCase, ExecOptions } from './features/explorer-alias/app/TranslateNodeUseCase';

export function activate(ctx: vscode.ExtensionContext) {
  const usecase = new TranslateNodeUseCase(/* 注入上下文/词典/AI路由等 */);

  // 标准翻译（V2直译模式）
  ctx.subscriptions.push(vscode.commands.registerCommand('aiExplorer.translate.standard', async (uri?: vscode.Uri) => {
    const opt: ExecOptions = { scope: uri ? 'single':'auto', forceAI: false, style: 'literal' };
    await usecase.execEntry(uri, opt);
  }));

  // 只翻译单个文件
  ctx.subscriptions.push(vscode.commands.registerCommand('aiExplorer.translate.single', async (uri: vscode.Uri) => {
    const opt: ExecOptions = { scope: 'single', forceAI: false, style: 'literal' };
    await usecase.execEntry(uri, opt);
  }));

  // 强制用 AI（跳过词典/缓存读取，但仍按直译样式重建）
  ctx.subscriptions.push(vscode.commands.registerCommand('aiExplorer.translate.forceAI', async (uri: vscode.Uri) => {
    const opt: ExecOptions = { scope: 'single', forceAI: true, style: 'literal' };
    await usecase.execEntry(uri, opt);
  }));
}
```

### 2) 用例门面：一个实现喂三种模式

```ts
// 文件名: src/features/explorer-alias/app/TranslateNodeUseCase.ts
export type ExecOptions = {
  scope: 'single'|'selection'|'auto';
  forceAI: boolean;
  style: 'literal'; // 你喜欢“死板直译”，就固定 literal；以后可加 'natural'
};

export class TranslateNodeUseCase {
  // ……构造里注入 LiteralDictResolver / LiteralPreserveWithAIFallback / Cache / Logger 等

  async execEntry(uri: vscode.Uri | undefined, opt: ExecOptions) {
    const targets = await this.pickTargets(uri, opt.scope);
    for (const t of targets) await this.translateOne(t.fsPath, t.name, t.kind, opt);
  }

  private async translateOne(fsPath:string, name:string, kind:'file'|'folder', opt: ExecOptions) {
    if (!opt.forceAI) {
      // 正常：词典直译 + AI 只补缺（保留分隔符/扩展名）
      const { alias, usedAI } = await this.literal.build(name); // build 内部已：词典→AI补缺→写回→重建
      this.cache.set(fsPath, { alias, source: usedAI?'ai':'rule', confidence: usedAI?0.88:0.92 });
      return;
    }
    // 强制 AI：跳过词典读取，直接让 AI 给缺词映射，然后重建（仍保留分隔符/扩展名）
    const { alias } = await this.literal.buildForceAI(name); // 你可以在 LiteralPreserveWithAIFallback 里加一个 force 入口
    this.cache.set(fsPath, { alias, source: 'ai', confidence: 0.88 });
  }
}
```

### 3) 兜底实现要点（你已有的就复用）

* **分词并保留分隔符** → 词典分层 + 最长短语匹配 → **未知 tokens[]**
* **非强制模式**：把 `unknown[] + 整条文件名` 发给模型，**只要 JSON “英文→中文”映射** → 写回 `/.ai/.ai-glossary.literal.learned.json` → 重建
* **强制模式**：忽略词典读取，直接让模型对 **全部 tokens** 返回直译映射（或至少对 `unknown[]` 返回），再写回 → 重建
* **两者最终都保持直译样式**（原分隔符 + 是否保留扩展名由配置控制）。

---

## 快速自测（确保三条命令行为“表里一致”）

1. 随便找一个含生僻词的 `*.cjs`：

   * 点“**翻译此文件**”：第一次可能打一次 AI；第二次不应再打（命中学习直译词典）。
2. 同一个文件点“**强制用 AI**”：**一定会打一次 AI**，并更新学习直译词典（可打开 `/.ai/.ai-glossary.literal.learned.json` 看）。
3. “**翻译为中文**”在根目录触发，应与“翻译此文件”保持**同样直译样式**，只是批量作用范围不同。

---

如果你愿意，我可以把这 3 个命令的 **package.json 菜单声明** 和 **extension.ts 的注册函数**，以及 **LiteralPreserveWithAIFallback.buildForceAI(...)** 的最小实现，按你仓库的路径写成**逐行补丁清单**给你。现在从 README 能看出你的“AI 资源管理器/AI 配置”已经在位，但要实现“**三条菜单统一直译风格，只在是否强制 AI 上有差别**”，就按上面的门面 + 开关把它们拉到同一条管线上即可。([GitHub][1])

[1]: https://github.com/ElonQian1/vscode-ai-explorer "GitHub - ElonQian1/vscode-ai-explorer: vscode-ai-explorer 中文资源管理器"
