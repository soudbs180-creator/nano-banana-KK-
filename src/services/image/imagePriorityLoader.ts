import { isElementInViewport, distanceFromViewportCenter } from '../../hooks/useLazyImage';

interface LoadTask {
    id: string;
    element: HTMLElement;
    loadFn: () => Promise<string | null>;
    onComplete: (url: string | null) => void;
    onError: (err: any) => void;
}

class ImagePriorityLoader {
    private queue: LoadTask[] = [];
    private activeCount = 0;
    private maxConcurrent = 4; // Max concurrent loads
    private intervalId: NodeJS.Timeout | null = null;

    constructor() {
        this.startLoop();
    }

    addTask(id: string, element: HTMLElement, loadFn: () => Promise<string | null>): Promise<string | null> {
        return new Promise((resolve, reject) => {
            // Add to queue
            this.queue.push({
                id,
                element,
                loadFn,
                onComplete: resolve,
                onError: reject
            });
            // Try to process immediately
            this.processQueue();
        });
    }

    cancelTask(id: string) {
        this.queue = this.queue.filter(t => t.id !== id);
    }

    private startLoop() {
        // Re-evaluate priorities every 200ms (in case of scroll)
        this.intervalId = setInterval(() => {
            if (this.queue.length > 0) {
                this.processQueue();
            }
        }, 200);
    }

    private processQueue() {
        if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) return;

        // 1. Filter out off-screen items (optional: or just deprioritize them heavily)
        // Actually, we might want to keep them but just prioritize on-screen ones.

        // 2. Sort queue by distance from center
        // We only need to sort the candidates we might pick roughly.
        // For performance, maybe only sort if we have slots available.

        // Sort entire queue is expensive if large? 
        // Usually queue size is ~50-100 max images on screen? Should be fine.

        this.queue.sort((a, b) => {
            const distA = distanceFromViewportCenter(a.element);
            const distB = distanceFromViewportCenter(b.element);
            return distA - distB;
        });

        // 3. Pick top
        while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
            const task = this.queue.shift(); // Get closest
            if (task) {
                this.activeCount++;
                this.executeTask(task);
            }
        }
    }

    private async executeTask(task: LoadTask) {
        try {
            const result = await task.loadFn();
            task.onComplete(result);
        } catch (e) {
            task.onError(e);
        } finally {
            this.activeCount--;
            // Try next
            this.processQueue();
        }
    }
}

export const priorityLoader = new ImagePriorityLoader();
