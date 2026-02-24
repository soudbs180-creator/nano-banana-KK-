
$filePath = "c:\Users\Administrator\Downloads\KK-Studio-1.0.0\src\App.tsx"
$lines = Get-Content -Path $filePath -Encoding UTF8

# 1. Patch Success Block
$successStart = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -like "*生成完成后重新获取主卡最新位置*") {
        $successStart = $i
        break
    }
}

if ($successStart -ge 0) {
    # Find the end of the block (the last brace of Anti-Zero-Bug)
    $successEnd = -1
    for ($i = $successStart; $i -lt $successStart + 50; $i++) {
        if ($lines[$i] -like "*Detection*") { # Part of the anti-zero-bug warning
             $successEnd = $i + 2
             break
        }
    }

    if ($successEnd -ge 0) {
        Write-Host "Patching Success block at lines $($successStart+1) to $($successEnd+1)"
        $newLines = @()
        
        # Add lines before
        for ($i = 0; $i -lt $successStart; $i++) { $newLines += $lines[$i] }

        # Add replacement
        $newLines += "      // ✅ 生成完成后重新获取主卡最新位置 (支持生成过程中拖动)"
        $newLines += "      // 🚀 [Critical Fix] Re-calculate Center to support Canvas Pan during generation"
        $newLines += "      const finalCanvas = activeCanvasRef.current;"
        $newLines += "      const latestNode = finalCanvas?.promptNodes.find(n => n.id === promptNodeId);"
        $newLines += "      const effectiveNodeForPos = latestNode || taskNode || node;"
        $newLines += ""
        $newLines += "      const currentTransform = canvasRef.current?.getCurrentTransform() || canvasTransform;"
        $newLines += "      const viewportRect = canvasRef.current?.getCanvasRect() || null;"
        $newLines += "      const leftOffset = isSidebarOpen && !isMobile ? 260 : (isMobile ? 0 : 60);"
        $newLines += "      const rightOffset = isChatOpen && !isMobile ? 420 : 0;"
        $newLines += "      const latestCenter = getViewportPreferredPosition(currentTransform, viewportRect, 180, { left: leftOffset, right: rightOffset });"
        $newLines += ""
        $newLines += "      const shouldAutoCenter = !effectiveNodeForPos.userMoved && !effectiveNodeForPos.sourceImageId;"
        $newLines += ""
        $newLines += "      // 🛡️ [NaN Guard]"
        $newLines += "      const safeCenter = {"
        $newLines += "        x: isFinite(latestCenter.x) ? latestCenter.x : node.position.x,"
        $newLines += "        y: isFinite(latestCenter.y) ? latestCenter.y : node.position.y"
        $newLines += "      };"
        $newLines += ""
        $newLines += "      finalPos = shouldAutoCenter ? safeCenter : (latestNode?.position || effectiveNodeForPos.position);"
        $newLines += ""
        $newLines += "      console.log('[executeGeneration] Resolving Position (Final Sync):', {"
        $newLines += "        original: node.position,"
        $newLines += "        latestFromCanvas: latestNode?.position,"
        $newLines += "        calculatedCenter: latestCenter,"
        $newLines += "        finalUsed: finalPos,"
        $newLines += "        shouldAutoCenter"
        $newLines += "      });"
        $newLines += ""
        $newLines += "      // 🛡️ [Anti-Zero-Bug]"
        $newLines += "      if (finalPos.x === 0 && finalPos.y === 0 && (node.position.x !== 0 || node.position.y !== 0)) {"
        $newLines += "        console.warn('[App] Detected zero-position bug, falling back to original position', node.position);"
        $newLines += "        finalPos = node.position;"
        $newLines += "      }"
        $newLines += ""
        $newLines += "      const effectiveNode = effectiveNodeForPos;"

        # Add lines after
        for ($i = $successEnd + 1; $i -lt $lines.Count; $i++) { $newLines += $lines[$i] }
        $lines = $newLines
    }
}

# 2. Patch Error Block
$errorStart = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -like "*确保错误卡片始终显示*") {
        $errorStart = $i
        break
    }
}

if ($errorStart -ge 0) {
    # Find the end of the block (errorNode definition)
    $errorEnd = -1
    for ($i = $errorStart; $i -lt $errorStart + 10; $i++) {
        if ($lines[$i] -like "*const errorNode =*") {
             $errorEnd = $i
             break
        }
    }

    if ($errorEnd -ge 0) {
        Write-Host "Patching Error block at lines $($errorStart+1) to $($errorEnd+1)"
        $newLines = @()
        for ($i = 0; $i -lt $errorStart; $i++) { $newLines += $lines[$i] }
        
        $newLines += "      // 🚀 [修复] 确保错误卡片始终显示在计算出的 finalPos 上"
        $newLines += "      const currentCanvasForError = activeCanvasRef.current;"
        $newLines += "      const currentNode = currentCanvasForError?.promptNodes.find(n => n.id === node.id) || node;"
        $newLines += ""
        $newLines += "      const errorNode = {"
        $newLines += "        ...currentNode,"
        $newLines += "        position: finalPos, // 🚀 Use latest center even on error!"
        $newLines += "        isGenerating: false,"
        $newLines += "        error: err.message || 'Failed'"
        $newLines += "      };"

        for ($i = $errorEnd + 1; $i -lt $lines.Count; $i++) { $newLines += $lines[$i] }
        $lines = $newLines
    }
}

$lines | Set-Content -Path $filePath -Encoding UTF8
Write-Host "Successfully patched App.tsx"
