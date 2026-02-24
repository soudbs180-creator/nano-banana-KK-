
import sys

file_path = r'c:\Users\Administrator\Downloads\KK-Studio-1.0.0\src\App.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 🛡️ SAFETY CHECK: Verify line 1286
if "executeGeneration" not in lines[1285]:
    print(f"Error: Line 1286 does not contain executeGeneration. Found: {lines[1285]}")
    sys.exit(1)

# PART 1: Success Path repositioning
# Target range (approx 1532 to 1564)
# In my view_file output:
# 1532:       // ✅ 生成完成后重新获取主卡最新位置 (支持生成过程中拖动)
# 1564:         finalPos = node.position;
# 1565:       }

start1 = -1
for i in range(1500, 1550):
    if "// ✅ 生成完成后重新获取主卡最新位置" in lines[i]:
        start1 = i
        break

if start1 == -1:
    print("Could not find success positioning block start.")
    sys.exit(1)

# Find end of that block (up to anti-zero-bug)
end1 = -1
for i in range(start1, start1 + 40):
    if "finalPos = node.position;" in lines[i] and "}" in lines[i+1]:
        end1 = i + 1
        break

if end1 == -1:
    print("Could not find success positioning block end.")
    sys.exit(1)

print(f"Replacing success positioning from {start1+1} to {end1+1}")

replacement1 = [
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

lines[start1 : end1 + 1] = replacement1

# PART 2: Catch block repositioning
# Need to find the marker again because indices shifted
start2 = -1
for i in range(len(lines)-200, len(lines)):
    if "// 🚀 [修复] 确保错误卡片始终显示" in lines[i]:
        start2 = i
        break

if start2 == -1:
     for i in range(1600, len(lines)):
        if "// 🚀 [修复] 确保错误卡片始终显示" in lines[i]:
            start2 = i
            break

if start2 == -1:
    print("Could not find error positioning block start.")
    sys.exit(1)

# Replace the block (currentNode definition and errorNode definition)
# Target:
#       const currentNode = currentCanvas?.promptNodes.find(n => n.id === node.id) || node; // Try to find latest, fallback to stale
#
#       const errorNode = { ...currentNode, isGenerating: false, error: err.message || 'Failed' };

end2 = -1
for i in range(start2, start2 + 10):
    if "const errorNode =" in lines[i]:
        end2 = i
        break

if end2 == -1:
    print("Could not find error positioning block end.")
    sys.exit(1)

print(f"Replacing error positioning from {start2+1} to {end2+1}")

replacement2 = [
    "      // 🚀 [修复] 确保错误卡片始终显示在计算出的 finalPos 上\n",
    "      const currentCanvasForError = activeCanvasRef.current;\n",
    "      const currentNode = currentCanvasForError?.promptNodes.find(n => n.id === node.id) || node;\n",
    "\n",
    "      const errorNode = {\n",
    "        ...currentNode,\n",
    "        position: finalPos, // 🚀 Use latest center even on error!\n",
    "        isGenerating: false,\n",
    "        error: err.message || 'Failed'\n",
    "      };\n"
]

lines[start2 : end2 + 1] = replacement2

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Successfully patched App.tsx coordinates logic.")
