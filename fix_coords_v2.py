
file_path = r'c:\Users\Administrator\Downloads\KK-Studio-1.0.0\src\App.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# indices are 0-based, so line X is index X-1

# 1. Success Path logic (Lines 1532-1565 in the view_file output)
# Note: 1532 is index 1531. 1565 is index 1564.
# Slice [1531:1565] replaces those lines.

success_replacement = [
    "      // ✅ 生成完成后重新获取主卡最新位置 (支持生成过程中拖动)\n",
    "      // 🚀 [Critical Fix] Re-calculate Center to support Canvas Pan during generation\n",
    "      const finalCanvas = activeCanvasRef.current;\n",
    "      const latestNode = finalCanvas?.promptNodes.find(n => n.id === promptNodeId);\n",
    "      const effectiveNodeForPos = latestNode || taskNode || node;\n",
    "\n",
    "      const currentTransform = canvasRef.current?.getCurrentTransform() || canvasTransform;\n",
    "      const viewportRect = canvasRef.current?.getCanvasRect() || null;\n",
    "      const leftOffset = isSidebarOpen && !isMobile ? 260 : (isMobile ? 0 : 60);\n",
    "      const rightOffset = isChatOpen && !isMobile ? 420 : 0;\n",
    "      const latestCenter = getViewportPreferredPosition(currentTransform, viewportRect, 180, { left: leftOffset, right: rightOffset });\n",
    "\n",
    "      const shouldAutoCenter = !effectiveNodeForPos.userMoved && !effectiveNodeForPos.sourceImageId;\n",
    "\n",
    "      // 🛡️ [NaN Guard]\n",
    "      const safeCenter = {\n",
    "        x: isFinite(latestCenter.x) ? latestCenter.x : node.position.x,\n",
    "        y: isFinite(latestCenter.y) ? latestCenter.y : node.position.y\n",
    "      };\n",
    "\n",
    "      finalPos = shouldAutoCenter ? safeCenter : (latestNode?.position || effectiveNodeForPos.position);\n",
    "\n",
    "      console.log('[executeGeneration] Resolving Position (Final Sync):', {\n",
    "        original: node.position,\n",
    "        latestFromCanvas: latestNode?.position,\n",
    "        calculatedCenter: latestCenter,\n",
    "        finalUsed: finalPos,\n",
    "        shouldAutoCenter\n",
    "      });\n",
    "\n",
    "      // 🛡️ [Anti-Zero-Bug]\n",
    "      if (finalPos.x === 0 && finalPos.y === 0 && (node.position.x !== 0 || node.position.y !== 0)) {\n",
    "        console.warn('[App] Detected zero-position bug, falling back to original position', node.position);\n",
    "        finalPos = node.position;\n",
    "      }\n",
    "\n",
    "      const effectiveNode = effectiveNodeForPos;\n"
]

# Indices for 1532 to 1565 (inclusive)
# Start index = 1531
# End index = 1565 (exclusive in slice)
lines[1531:1565] = success_replacement

# 2. Catch block logic (Lines 1726-1731 in the PREVIOUS view_file output?)
# WAIT! Since I replaced lines above, I must find the new indices for the catch block.
# success_replacement has 41 lines.
# original [1531:1565] had 34 lines.
# So indices after 1565 are shifted by +7.

# Original 1726 is now 1733.
# Original 1731 is now 1738.

catch_replacement = [
    "      // 🚀 [修复] 确保错误卡片始终显示在计算出的 finalPos 上\n",
    "      const currentCanvas = activeCanvasRef.current;\n",
    "      const currentNode = currentCanvas?.promptNodes.find(n => n.id === node.id) || node;\n",
    "\n",
    "      const errorNode = {\n",
    "        ...currentNode,\n",
    "        position: finalPos, // 🚀 Use latest center even on error!\n",
    "        isGenerating: false,\n",
    "        error: err.message || 'Failed'\n",
    "      };\n"
]

# Original indices were 1725:1732.
# Shifted by +7: 1732:1739.
# Let's verify by finding the marker string for safety.
found_catch = False
for i in range(1730, 1750):
    if '// 🚀 [修复] 确保错误卡片始终显示' in lines[i]:
        print(f"Found catch block at line {i+1}")
        lines[i:i+6] = catch_replacement
        found_catch = True
        break

if not found_catch:
    print("Could not find catch block markers. Using shifted indices.")
    lines[1732:1739] = catch_replacement

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Successfully applied line-level fixes.")
