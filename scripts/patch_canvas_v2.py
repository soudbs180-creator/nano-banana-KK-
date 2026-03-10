
from pathlib import Path

target_file = Path(__file__).resolve().parents[1] / "src" / "context" / "CanvasContext.tsx"

# New Logic Block (Indented to match context)
new_logic = r"""        // --- SCOPED ARRANGE: Selected Nodes Only (Smart Layout) ---
        const selectedIds = state.selectedNodeIds || [];
        if (selectedIds.length > 0) {
            
            // 1. Identify "Sortable Roots" (Cards or Groups)
            const uniqueRootsMap = new Map<string, { id: string, type: 'prompt' | 'image', obj: any }>();
            
            const getPrompt = (id: string) => currentCanvas.promptNodes.find(p => p.id === id);
            const getImage = (id: string) => currentCanvas.imageNodes.find(img => img.id === id);

            selectedIds.forEach(id => {
                const p = getPrompt(id);
                if (p) {
                    uniqueRootsMap.set(p.id, { id: p.id, type: 'prompt', obj: p });
                    return;
                }
                const img = getImage(id);
                if (img) {
                    if (img.parentPromptId) {
                        // Image is part of a group -> Add the Group Root (Prompt)
                        const parent = getPrompt(img.parentPromptId);
                        if (parent) {
                            uniqueRootsMap.set(parent.id, { id: parent.id, type: 'prompt', obj: parent });
                        } else {
                            uniqueRootsMap.set(img.id, { id: img.id, type: 'image', obj: img });
                        }
                    } else {
                        uniqueRootsMap.set(img.id, { id: img.id, type: 'image', obj: img });
                    }
                }
            });

            // Prepare visualization data
            const roots = Array.from(uniqueRootsMap.values()).map(r => {
                const node = r.obj;
                const width = r.type === 'prompt' ? 300 : (getImageDims(node.aspectRatio, node.dimensions).w); 
                const height = r.type === 'prompt' ? (node.height || 200) : (getImageDims(node.aspectRatio, node.dimensions).h);
                
                return {
                    ...r,
                    x: node.position.x,
                    y: node.position.y,
                    width,
                    height,
                    visualCx: node.position.x,
                    visualCy: node.position.y - height / 2,
                };
            });

            if (roots.length < 2) return; 

            // 2. Decide Strategy
            let strategy = 'row';
            const GAP = 40;

            if (roots.length > 6) {
                strategy = 'matrix';
            } else {
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                roots.forEach(r => {
                    minX = Math.min(minX, r.x);
                    maxX = Math.max(maxX, r.x);
                    minY = Math.min(minY, r.y);
                    maxY = Math.max(maxY, r.y);
                });
                if ((maxY - minY) > (maxX - minX) * 1.5) { 
                    strategy = 'column';
                }
            }

            // 3. Arrange
            const newPositions = {};

            if (strategy === 'matrix') {
                roots.sort((a, b) => {
                    if (Math.abs(a.visualCy - b.visualCy) > 200) return a.visualCy - b.visualCy;
                    return a.visualCx - b.visualCx;
                });
                
                const columns = Math.ceil(Math.sqrt(roots.length));
                const avgX = roots.reduce((s, r) => s + r.x, 0) / roots.length;
                const avgY = roots.reduce((s, r) => s + r.y, 0) / roots.length;
                
                const maxW = Math.max(...roots.map(r => r.width));
                const maxH = Math.max(...roots.map(r => r.height));
                const CELL_W = maxW + GAP;
                const CELL_H = maxH + GAP;
                
                const gridW = columns * CELL_W;
                const rows = Math.ceil(roots.length / columns);
                const gridH = rows * CELL_H;
                
                const startX = avgX - gridW / 2 + CELL_W / 2; 
                const startY = avgY - gridH / 2 + CELL_H; 
                
                roots.forEach((r, i) => {
                    const col = i % columns;
                    const row = Math.floor(i / columns);
                    newPositions[r.id] = {
                        x: startX + col * CELL_W,
                        y: startY + row * CELL_H
                    };
                });
                
            } else if (strategy === 'column') {
                roots.sort((a, b) => a.visualCy - b.visualCy);
                const avgX = roots.reduce((s, r) => s + r.x, 0) / roots.length;
                
                const topY = Math.min(...roots.map(r => r.visualCy - r.height/2));
                let currentY = topY;

                roots.forEach((r) => {
                   currentY += r.height; 
                   newPositions[r.id] = { x: avgX, y: currentY };
                   currentY += GAP;
                });
                
            } else {
                // Row
                roots.sort((a, b) => a.visualCx - b.visualCx);
                const avgCy = roots.reduce((s, r) => s + r.visualCy, 0) / roots.length;
                
                let currentLeft = Math.min(...roots.map(r => r.visualCx - r.width/2));
                
                roots.forEach((r) => {
                    const newX = currentLeft + r.width / 2;
                    newPositions[r.id] = { x: newX, y: avgCy + r.height / 2 };
                    currentLeft += r.width + GAP;
                });
            }

            // 4. Apply & Sync Children
            const newCanvases = state.canvases.map(c => {
                if (c.id !== state.activeCanvasId) return c;
                
                const getRootDelta = (rid) => {
                    const target = newPositions[rid];
                    const original = roots.find(r => r.id === rid);
                    if (!target || !original) return { x: 0, y: 0 };
                    return { x: target.x - original.x, y: target.y - original.y };
                };

                return {
                    ...c,
                    promptNodes: c.promptNodes.map(pn => newPositions[pn.id] ? { ...pn, position: newPositions[pn.id] } : pn),
                    imageNodes: c.imageNodes.map(img => {
                        if (newPositions[img.id]) return { ...img, position: newPositions[img.id] };
                        if (img.parentPromptId && newPositions[img.parentPromptId]) {
                            const delta = getRootDelta(img.parentPromptId);
                            return { ...img, position: { x: img.position.x + delta.x, y: img.position.y + delta.y } };
                        }
                        return img;
                    }),
                    lastModified: Date.now()
                };
            });

            setState(prev => ({ ...prev, canvases: newCanvases }));
            return;
        }"""

try:
    with open(target_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # 0-indexed: Keep 0 to 830 (lines[0]...lines[830])
    # Skip 831 to 953 (lines[831]...lines[953])
    # Keep 954 to End (lines[954]...)
    
    start_skip = 831
    end_skip = 953
    
    # Validation check: Ensure line 831 looks right
    if "// --- SCOPED ARRANGE" not in lines[start_skip]:
         print(f"Warning: Line {start_skip} content mismatch: {lines[start_skip].strip()}")
         # Fallback search
         for i, l in enumerate(lines):
             if "// --- SCOPED ARRANGE" in l:
                 start_skip = i
                 break
    
    # Validation check: Ensure line 955 is "1. Build Data Structures"
    if "// --- 1. Build Data Structures" not in lines[end_skip+2]: # 955 is skip+2?
          # 953 is last line of block (})
          # 954 is empty
          # 955 is next block
          pass 
    
    # Just to be safe, search for end block near 950
    found_end = False
    for i in range(start_skip, min(len(lines), 1100)):
        if "// --- 1. Build Data Structures" in lines[i]:
             end_skip = i - 2 # The } is 2 lines before?
             found_end = True
             break
    
    if found_end:
        print(f"Detected block: {start_skip} to {end_skip}")
        
        pre_content = lines[:start_skip]
        # new_logic
        post_content = lines[end_skip+1:] # Skip the } line too?
        # My new_logic ends with } so I should skip the old }
        
        with open(target_file, 'w', encoding='utf-8') as f:
            f.writelines(pre_content)
            f.write(new_logic + "\n")
            f.writelines(post_content)
        print("Success")
    else:
        print("End block not found")

except Exception as e:
    print(f"Error: {e}")
