/**
 * Pixi.js 类型声明
 * 
 * 这是一个可选依赖的类型声明文档
 * 如果用户安装了 pixi.js，这个文档会被 node_modules 中的类型覆盖
 * 如果没有安装，这个声明可以让代码编译通过
 */

declare module 'pixi.js' {
    export class Application {
        constructor(options?: {
            width?: number;
            height?: number;
            backgroundColor?: number;
            antialias?: boolean;
            resolution?: number;
            autoDensity?: boolean;
        });
        stage: Container;
        view: HTMLCanvasElement;
        renderer: {
            resize(width: number, height: number): void;
        };
        destroy(removeView?: boolean, options?: { children?: boolean; texture?: boolean }): void;
    }

    export class Container {
        x: number;
        y: number;
        scale: { set(x: number, y?: number): void };
        addChild(child: any): void;
        removeChild(child: any): void;
    }

    export class Sprite {
        constructor(texture?: Texture);
        x: number;
        y: number;
        width: number;
        height: number;
        anchor: { set(x: number, y?: number): void };
        name: string;
        destroy(): void;
        static from(source: string | Texture): Sprite;
    }

    export class Texture {
        static from(source: string): Texture;
        static fromURL(url: string): Promise<Texture>;
        destroy(destroyBase?: boolean): void;
    }
}
