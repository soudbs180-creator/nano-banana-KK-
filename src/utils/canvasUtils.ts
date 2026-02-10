
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
 * Centers the node in the VISIBLE canvas area (above the PromptBar).
 */
export const getViewportPreferredPosition = (
    transform: CanvasTransform,
    viewportWidth: number = window.innerWidth,
    viewportHeight: number = window.innerHeight
): Point => {
    // Get PromptBar height to calculate visible area
    const promptBarHeight = getPromptBarHeight();
    const visibleHeight = viewportHeight - promptBarHeight;

    // Center X relative to viewport
    const screenCenterX = viewportWidth / 2;

    // Center Y relative to VISIBLE area (above PromptBar)
    // Use 45% of visible area to center it nicely
    const screenTargetY = promptBarHeight + (visibleHeight * 0.45);

    // Convert to World Coordinates
    // World = (Screen - Translate) / Scale
    const worldX = (screenCenterX - transform.x) / transform.scale;
    const worldY = (screenTargetY - transform.y) / transform.scale;

    console.log('[canvasUtils] getViewportPreferredPosition:', {
        transform,
        viewport: { width: viewportWidth, height: viewportHeight },
        promptBarHeight,
        visibleHeight,
        screen: { x: screenCenterX, y: screenTargetY },
        world: { x: worldX, y: worldY }
    });

    // Round to integer for cleaner values
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
