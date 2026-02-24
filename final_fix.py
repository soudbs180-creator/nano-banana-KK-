
import re
import sys

file_path = r'c:\Users\Administrator\Downloads\KK-Studio-1.0.0\src\App.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern 1 (Success Path): Use a very loose regex to match from the comment to the anti-zero-bug block
# Matches "// [Anything] 生成完成后重新获取主卡最新位置" up to the end of the zero-bug block
p1 = r'// .*? 生成完成后重新获取主卡最新位置.*?\[Anti-Zero-Bug\].*?\{.*?\n\s+\}'

r1 = """// ✅ 生成完成后重新获取主卡最新位置 (支持生成过程中拖动)
      // 🚀 [Critical Fix] Re-calculate Center to support Canvas Pan during generation
      const finalCanvas = activeCanvasRef.current;
      const latestNode = finalCanvas?.promptNodes.find(n => n.id === promptNodeId);
      const effectiveNodeForPos = latestNode || taskNode || node;

      const currentTransform = canvasRef.current?.getCurrentTransform() || canvasTransform;
      const viewportRect = canvasRef.current?.getCanvasRect() || null;
      const leftOffset = isSidebarOpen && !isMobile ? 260 : (isMobile ? 0 : 60);
      const rightOffset = isChatOpen && !isMobile ? 420 : 0;
      const latestCenter = getViewportPreferredPosition(currentTransform, viewportRect, 180, { left: leftOffset, right: rightOffset });

      const shouldAutoCenter = !effectiveNodeForPos.userMoved && !effectiveNodeForPos.sourceImageId;

      // 🛡️ [NaN Guard]
      const safeCenter = {
        x: isFinite(latestCenter.x) ? latestCenter.x : node.position.x,
        y: isFinite(latestCenter.y) ? latestCenter.y : node.position.y
      };

      finalPos = shouldAutoCenter ? safeCenter : (latestNode?.position || effectiveNodeForPos.position);

      console.log('[executeGeneration] Resolving Position (Final Sync):', {
        original: node.position,
        latestFromCanvas: latestNode?.position,
        calculatedCenter: latestCenter,
        finalUsed: finalPos,
        shouldAutoCenter
      });

      // 🛡️ [Anti-Zero-Bug]
      if (finalPos.x === 0 && finalPos.y === 0 && (node.position.x !== 0 || node.position.y !== 0)) {
        console.warn('[App] Detected zero-position bug, falling back to original position', node.position);
        finalPos = node.position;
      }

      const effectiveNode = effectiveNodeForPos;"""

new_content = re.sub(p1, r1, content, flags=re.DOTALL)

# Pattern 2 (Error Path): Match from error comment to the errorNode definition
p2 = r'// .*? 确保错误卡片始终显示.*?const errorNode = \{ \.\.\.currentNode, isGenerating: false, error: err\.message \|\| \'Failed\' \};'

r2 = """// 🚀 [修复] 确保错误卡片始终显示在计算出的 finalPos 上
      const currentCanvasForError = activeCanvasRef.current;
      const currentNode = currentCanvasForError?.promptNodes.find(n => n.id === node.id) || node;

      const errorNode = {
        ...currentNode,
        position: finalPos, // 🚀 Use latest center even on error!
        isGenerating: false,
        error: err.message || 'Failed'
      };"""

new_content = re.sub(p2, r2, new_content, flags=re.DOTALL)

if new_content == content:
    print("FAILED TO MATCH")
    sys.exit(1)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("SUCCESS")
