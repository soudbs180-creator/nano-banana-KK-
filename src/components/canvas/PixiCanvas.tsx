/**
 * Pixi.js Canvas Renderer
 * 
 * 基于Pixi.js的高性能画布渲染器
 * 用于优化大量图片的渲染性能
 * 
 * 特点：
 * - GPU加速渲染
 * - 视口剔除（只渲染可见元素）
 * - 纹理缓存管理
 * - 与现有InfiniteCanvas并存
 */

import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

// 动态导入Pixi.js以支持代码分割
let Application: any;
let Sprite: any;
let Container: any;
let Texture: any;

// Pixi.js是否已加载
let pixiLoaded = false;
let pixiLoadPromise: Promise<boolean> | null = null;

/**
 * 加载Pixi.js库
 */
async function loadPixi(): Promise<boolean> {
    if (pixiLoaded) return true;

    if (pixiLoadPromise) return pixiLoadPromise;

    pixiLoadPromise = (async () => {
        try {
            const pixi = await import('pixi.js');
            Application = pixi.Application;
            Sprite = pixi.Sprite;
            Container = pixi.Container;
            Texture = pixi.Texture;
            pixiLoaded = true;
            console.log('[PixiCanvas] Pixi.js loaded');
            return true;
        } catch (e) {
            console.warn('[PixiCanvas] Failed to load Pixi.js:', e);
            return false;
        }
    })();

    return pixiLoadPromise;
}

// 公开的句柄接口
export interface PixiCanvasHandle {
    addImage: (id: string, url: string, x: number, y: number, width: number, height: number) => void;
    removeImage: (id: string) => void;
    updateImage: (id: string, props: { x?: number; y?: number; width?: number; height?: number }) => void;
    setTransform: (x: number, y: number, scale: number) => void;
    getStats: () => { spriteCount: number; textureCount: number };
}

interface PixiCanvasProps {
    width: number;
    height: number;
    backgroundColor?: number;
    onReady?: () => void;
    onError?: (error: Error) => void;
}

/**
 * Pixi.js画布组件
 */
const PixiCanvas = forwardRef<PixiCanvasHandle, PixiCanvasProps>(({
    width,
    height,
    backgroundColor = 0x1a1a2e,
    onReady,
    onError
}, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<any>(null);
    const stageRef = useRef<any>(null);
    const spritesRef = useRef<Map<string, any>>(new Map());
    const texturesRef = useRef<Map<string, any>>(new Map());
    const [ready, setReady] = useState(false);

    // 初始化Pixi应用
    useEffect(() => {
        let mounted = true;

        const init = async () => {
            const loaded = await loadPixi();
            if (!loaded || !mounted) {
                onError?.(new Error('Failed to load Pixi.js'));
                return;
            }

            if (!containerRef.current) return;

            try {
                // 创建Pixi应用
                const app = new Application({
                    width,
                    height,
                    backgroundColor,
                    antialias: true,
                    resolution: window.devicePixelRatio || 1,
                    autoDensity: true,
                });

                // 添加到DOM
                containerRef.current.appendChild(app.view as HTMLCanvasElement);

                // 创建主容器
                const stage = new Container();
                app.stage.addChild(stage);

                appRef.current = app;
                stageRef.current = stage;

                setReady(true);
                onReady?.();

                console.log('[PixiCanvas] Initialized');

            } catch (e) {
                console.error('[PixiCanvas] Init failed:', e);
                onError?.(e as Error);
            }
        };

        init();

        return () => {
            mounted = false;

            // 清理纹理
            for (const texture of texturesRef.current.values()) {
                texture.destroy(true);
            }
            texturesRef.current.clear();
            spritesRef.current.clear();

            // 销毁应用
            if (appRef.current) {
                appRef.current.destroy(true, { children: true, texture: true });
                appRef.current = null;
            }
        };
    }, []);

    // 响应尺寸变化
    useEffect(() => {
        if (appRef.current && ready) {
            appRef.current.renderer.resize(width, height);
        }
    }, [width, height, ready]);

    // 暴露API给父组件
    useImperativeHandle(ref, () => ({
        /**
         * 添加图片
         */
        addImage: async (id: string, url: string, x: number, y: number, w: number, h: number) => {
            if (!ready || !stageRef.current) return;

            // 如果已存在，先移除
            if (spritesRef.current.has(id)) {
                const oldSprite = spritesRef.current.get(id);
                stageRef.current.removeChild(oldSprite);
                oldSprite.destroy();
            }

            try {
                // 加载纹理
                let texture = texturesRef.current.get(url);
                if (!texture) {
                    texture = await Texture.fromURL(url);
                    texturesRef.current.set(url, texture);
                }

                // 创建精灵
                const sprite = new Sprite(texture);
                sprite.x = x;
                sprite.y = y;
                sprite.width = w;
                sprite.height = h;
                sprite.anchor.set(0.5, 1); // 锚点在底部中心
                sprite.name = id;

                stageRef.current.addChild(sprite);
                spritesRef.current.set(id, sprite);

            } catch (e) {
                console.error(`[PixiCanvas] Failed to add image ${id}:`, e);
            }
        },

        /**
         * 移除图片
         */
        removeImage: (id: string) => {
            if (!stageRef.current) return;

            const sprite = spritesRef.current.get(id);
            if (sprite) {
                stageRef.current.removeChild(sprite);
                sprite.destroy();
                spritesRef.current.delete(id);
            }
        },

        /**
         * 更新图片属性
         */
        updateImage: (id: string, props: { x?: number; y?: number; width?: number; height?: number }) => {
            const sprite = spritesRef.current.get(id);
            if (!sprite) return;

            if (props.x !== undefined) sprite.x = props.x;
            if (props.y !== undefined) sprite.y = props.y;
            if (props.width !== undefined) sprite.width = props.width;
            if (props.height !== undefined) sprite.height = props.height;
        },

        /**
         * 设置画布变换
         */
        setTransform: (x: number, y: number, scale: number) => {
            if (!stageRef.current) return;

            stageRef.current.x = x;
            stageRef.current.y = y;
            stageRef.current.scale.set(scale);
        },

        /**
         * 获取统计信息
         */
        getStats: () => ({
            spriteCount: spritesRef.current.size,
            textureCount: texturesRef.current.size
        })
    }), [ready]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: ready ? 'auto' : 'none'
            }}
        />
    );
});

PixiCanvas.displayName = 'PixiCanvas';

export default PixiCanvas;

/**
 * 检查Pixi.js是否可用
 */
export function isPixiAvailable(): boolean {
    return pixiLoaded;
}

/**
 * 预加载Pixi.js
 */
export async function preloadPixi(): Promise<boolean> {
    return loadPixi();
}
