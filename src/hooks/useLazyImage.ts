import { useState, useEffect, useRef } from 'react';

/**
 * 图片懒加载Hook
 * 使用Intersection Observer检测元素是否在视口内
 * 只有在视口内时才加载图片
 */
interface UseLazyImageOptions {
    rootMargin?: string; // 提前加载的边距，例如 '200px'
    threshold?: number;  // 可见度阈值，0-1
}

export function useLazyImage(
    imageId: string,
    loadImageFn: (id: string) => Promise<string | null>,
    options: UseLazyImageOptions = {}
) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const elementRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);

    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;

        // 创建Intersection Observer
        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    // 当元素进入视口时加载图片
                    if (entry.isIntersecting && !imageUrl && !isLoading) {
                        setIsLoading(true);
                        loadImageFn(imageId)
                            .then((url) => {
                                if (url) {
                                    setImageUrl(url);
                                }
                                setIsLoading(false);
                            })
                            .catch((err) => {
                                setError(err);
                                setIsLoading(false);
                            });
                    }
                });
            },
            {
                rootMargin: options.rootMargin || '200px', // 提前200px开始加载
                threshold: options.threshold || 0.01, // 至少1%可见就触发
            }
        );

        // 开始观察
        observerRef.current.observe(element);

        // 清理
        return () => {
            if (observerRef.current && element) {
                observerRef.current.unobserve(element);
            }
        };
    }, [imageId, loadImageFn, imageUrl, isLoading, options.rootMargin, options.threshold]);

    return {
        elementRef,
        imageUrl,
        isLoading,
        error,
    };
}

/**
 * 检查元素是否在视口内
 */
export function isElementInViewport(element: HTMLElement, buffer = 0): boolean {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;

    return (
        rect.top < windowHeight + buffer &&
        rect.bottom > -buffer &&
        rect.left < windowWidth + buffer &&
        rect.right > -buffer
    );
}

/**
 * 计算元素距离视口中心的距离
 * 用于优先加载中心区域
 */
export function distanceFromViewportCenter(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;

    const centerX = windowWidth / 2;
    const centerY = windowHeight / 2;

    const elementCenterX = rect.left + rect.width / 2;
    const elementCenterY = rect.top + rect.height / 2;

    const dx = elementCenterX - centerX;
    const dy = elementCenterY - centerY;

    return Math.sqrt(dx * dx + dy * dy);
}
