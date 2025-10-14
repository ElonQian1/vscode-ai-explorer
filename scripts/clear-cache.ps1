# 快速修复：清除旧缓存并重新翻译
# 用途：解决"clean-outdated-docs.ps1 → 清洁过时文档"缺少分隔符的问题

Write-Host "=== AI Explorer 缓存清理工具 ===" -ForegroundColor Cyan
Write-Host ""

# 1. 检查缓存目录
$cacheDir = ".vscode\.ai-cache"
if (Test-Path $cacheDir) {
    Write-Host "✅ 找到缓存目录: $cacheDir" -ForegroundColor Green
    
    # 显示缓存文件
    $cacheFiles = Get-ChildItem $cacheDir -Filter "*.json"
    Write-Host "📁 当前缓存文件数量: $($cacheFiles.Count)"
    
    if ($cacheFiles.Count -gt 0) {
        Write-Host ""
        Write-Host "缓存文件列表:" -ForegroundColor Yellow
        $cacheFiles | ForEach-Object {
            $size = [math]::Round($_.Length / 1KB, 2)
            Write-Host "  - $($_.Name) ($size KB)"
        }
        
        Write-Host ""
        $confirm = Read-Host "是否清除所有缓存？(Y/N)"
        
        if ($confirm -eq 'Y' -or $confirm -eq 'y') {
            Remove-Item "$cacheDir\*.json" -Force
            Write-Host "✅ 已清除所有缓存文件" -ForegroundColor Green
        } else {
            Write-Host "❌ 已取消" -ForegroundColor Red
            exit 0
        }
    } else {
        Write-Host "ℹ️  缓存目录为空，无需清理" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ️  未找到缓存目录，可能尚未翻译过文件" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== 下一步操作 ===" -ForegroundColor Cyan
Write-Host "1. 重新加载 VS Code：Ctrl+Shift+P → Developer: Reload Window"
Write-Host "2. 右键文件 → '强制用 AI 翻译此文件'"
Write-Host "3. 验证结果：clean-outdated-docs.ps1 → 清洁-过时-文档.ps1 ✅"
Write-Host ""
Write-Host "完成！" -ForegroundColor Green
