
import sys

file_path = r'c:\Users\Administrator\Downloads\KK-Studio-1.0.0\src\App.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 🚀 Part 1: Fix success path alignment
target1 = """      // ✅ 生成完成后重新获取主卡最新位置 (支持生成过程中拖动)
      // 🚀 [Critical Fix] Fetch LATEST node state to prevent overwriting user changes (e.g. text edits during generation)
      const finalCanvas = activeCanvasRef.current;
      const latestNode = finalCanvas?.promptNodes.find(n => n.id === promptNodeId);

      // 🛡️ [Robust Fallback] If latestNode is missing (e.g. rapid switch) or has invalid pos (0,0 bug), use original node
      const effectiveNode = latestNode || node;

      // 🚀 [Critical Fix] Re-calculate Center to support Canvas Pan during generation
      // This ensures both Main Card and Sub Cards land exactly at current screen center
      const currentTransform = canvasRef.current?.getCurrentTransform() || canvasTransform;
      const viewportRect = canvasRef.current?.getCanvasRect() || null;
      const leftOffset = isSidebarOpen && !isMobile ? 260 : (isMobile ? 0 : 60);
      const rightOffset = isChatOpen && !isMobile ? 420 : 0;
      const latestCenter = getViewportPreferredPosition(currentTransform, viewportRect, 180, { left: leftOffset, right: rightOffset });

      const shouldAutoCenter = !effectiveNode.userMoved && !effectiveNode.sourceImageId;

      let finalPos = shouldAutoCenter ? latestCenter : effectiveNode.position;

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
      }"""

# Use flexible matching for whitespace/newlines
import re
# Escape target for regex but replace literal spaces with \s*
pattern1 = re.escape(target1).replace(r'\ ', r'\s+').replace(r'\n', r'\s*')

replacement1 = """      // ✅ 生成完成后重新获取主卡最新位置 (支持生成过程中拖动)
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

new_content = re.sub(pattern1, replacement1, content, flags=re.MULTILINE)

# 🚀 Part 2: Fix error path coordination
target2 = """      // 🚀 [修复] 确保错误卡片始终显示
      // 如果节点不存在于画布中，先添加它再更新错误状态
      const currentCanvas = activeCanvasRef.current;
      const currentNode = currentCanvas?.promptNodes.find(n => n.id === node.id) || node; // Try to find latest, fallback to stale

      const errorNode = { ...currentNode, isGenerating: false, error: err.message || 'Failed' };"""

pattern2 = re.escape(target2).replace(r'\ ', r'\s+').replace(r'\n', r'\s*')

replacement2 = """      // 🚀 [修复] 确保错误卡片始终显示在计算出的 finalPos 上
      const currentCanvas = activeCanvasRef.current;
      const currentNode = currentCanvas?.promptNodes.find(n => n.id === node.id) || node;

      const errorNode = {
        ...currentNode,
        position: finalPos, // 🚀 Use latest center even on error!
        isGenerating: false,
        error: err.message || 'Failed'
      };"""

new_content = re.sub(pattern2, replacement2, new_content, flags=re.MULTILINE)

# Check if changes applied
if new_content == content:
    print("No changes applied. Pattern mismatch.")
    sys.exit(1)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully applied coordinate fixes.")
