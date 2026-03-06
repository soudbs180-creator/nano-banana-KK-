
/**
 * Utility functions for canvas positioning and collision detection
 */

interface Point {
    x: number;
    y: number;
}

interface CanvasTransform {
    x: number;
    y: number;
    scale: number;
}

interface NodeBounds {
    x: number; // Center X
    y: number; // Bottom Y
    width: number;
    height: number;
}

/**
 * Gets the height of the PromptBar to calculate visible canvas area
 */
const getPromptBarHeight = (): number => {
    // PromptBar is positioned at bottom: 32px, estimate its height
    // The actual height varies based on content, but typically around 80-120px
    const promptBar = document.getElementById('prompt-bar-container');
    if (promptBar) {
        const rect = promptBar.getBoundingClientRect();
        return rect.height + 32 + 20; // height + bottom offset + margin
    }
    return 180; // Default fallback height
};

/**
 * Calculates a preferred position for a new node based on the current viewport.
 * Centers the node in the VISIBLE canvas area (above the PromptBar),
 * accounting for the Bottom-Center anchor of the card.
 */
export const getViewportPreferredPosition = (
    transform: CanvasTransform,
    viewportRect: DOMRect | null = null,
    avgCardHeight: number = 180, // Approximate height of a prompt card
    offsets: { left: number; right: number } = { left: 0, right: 0 }
): Point => {
    // Fallback to window dimensions if rect is not available
    const vw = viewportRect ? viewportRect.width : window.innerWidth;
    const vh = viewportRect ? viewportRect.height : window.innerHeight;

    // Get sidebars impact
    const leftOffset = offsets.left || 0;
    const rightOffset = offsets.right || 0;
    const visibleWidth = vw - leftOffset - rightOffset;

    // Get PromptBar height dynamically to avoid new cards overlapping with input bar
    const promptBarHeight = Math.max(110, getPromptBarHeight() + 12);
    const visibleHeight = Math.max(220, vh - promptBarHeight);

    // Use viewport rect origin when available (important when canvas isn't at 0,0).
    const viewportLeft = viewportRect ? viewportRect.left : 0;
    const viewportTop = viewportRect ? viewportRect.top : 0;

    // Target screen-space center in the visible area (excluding sidebars and prompt bar).
    const screenX = viewportLeft + leftOffset + visibleWidth / 2;
    // Nodes are bottom-center anchored; move down by half card height so visual center matches.
    const screenY = viewportTop + visibleHeight / 2 + avgCardHeight / 2;

    // Convert screen coordinates to world coordinates via current transform.
    const scale = transform?.scale && transform.scale > 0 ? transform.scale : 1;
    const tx = Number.isFinite(transform?.x) ? transform.x : 0;
    const ty = Number.isFinite(transform?.y) ? transform.y : 0;
    const worldX = (screenX - tx) / scale;
    const worldY = (screenY - ty) / scale;

    return {
        x: Math.round(worldX),
        y: Math.round(worldY)
    };
};

/**
 * Checks if a proposed position collides with any existing nodes.
 * Assumes nodes use Bottom-Center anchor (x=center, y=bottom).
 */
const isColliding = (
    pos: Point,
    width: number,
    height: number,
    existingNodes: NodeBounds[]
): boolean => {
    // Proposed Bounds (Center X, Bottom Y -> Box)
    const l1 = pos.x - width / 2;
    const r1 = pos.x + width / 2;
    const b1 = pos.y;
    const t1 = pos.y - height;

    // Margin to avoid tight packing
    const MARGIN = 50;

    return existingNodes.some(node => {
        const l2 = node.x - node.width / 2 - MARGIN;
        const r2 = node.x + node.width / 2 + MARGIN;
        const b2 = node.y + MARGIN;
        const t2 = node.y - node.height - MARGIN;

        // AABB Collision Check
        return !(l2 > r1 || r2 < l1 || t2 > b1 || b2 < t1);
    });
};

/**
 * Finds a safe position for a new node, starting from initialPos.
 * Spirals outwards or shifts if collision is detected.
 */
export const findSafePosition = (
    initialPos: Point,
    existingNodes: NodeBounds[],
    width: number = 380, // Approximate prompt width
    height: number = 400 // Conservative height including results
): Point => {
    let finalPos = { ...initialPos };
    const stepSize = 100;
    let attempts = 0;
    const maxAttempts = 20;

    // Simple "Shift Down-Right" strategy for now, can be spiral if needed
    // We prefer shifting Down to follow "feed" flow, or Right for columns.
    // Let's try Diagonal Down-Right first.
    while (isColliding(finalPos, width, height, existingNodes) && attempts < maxAttempts) {
        // Try shifting right first (create row)
        finalPos.x += stepSize;
        // If still colliding after some right shifts, try down
        if (attempts % 5 === 0 && attempts > 0) {
            finalPos.x = initialPos.x; // Reset X
            finalPos.y += stepSize * 2; // Move Down significantly
        }
        attempts++;
    }

    // If we failed to find a spot in 20 tries, just overlap slightly offset (return last try)
    return finalPos;
};
