/**
 * GPU 加速背景效果组件
 * 
 * 使用 Canvas 2D + requestAnimationFrame 实现 GPU 加速的粒子背景
 * 自动检测设备性能，低性能设备自动降级
 * 
 * 特点：
 * - 纯客户端渲染，零服务器压力
 * - GPU 加速动画
 * - 自动适配设备性能
 * - 可配置粒子密度和效果
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    alpha: number;
    color: string;
}

interface GpuBackgroundProps {
    /** 粒子数量（默认根据设备性能自动调整） */
    particleCount?: number;
    /** 粒子颜色（支持多个颜色随机选择） */
    colors?: string[];
    /** 是否启用（可用于手动禁用） */
    enabled?: boolean;
    /** 透明度（0-1） */
    opacity?: number;
    /** 连接线最大距离 */
    connectionDistance?: number;
    /** 是否显示连接线 */
    showConnections?: boolean;
}

// 性能检测：根据设备能力返回推荐粒子数
function getRecommendedParticleCount(): number {
    if (typeof window === 'undefined') return 0;

    // 检测 GPU 能力
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!gl) return 20; // 无 WebGL 支持，使用最少粒子

    // 检测设备类型
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isLowEndDevice = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;

    // 检测用户是否启用了省电模式（prefers-reduced-motion）
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return 0; // 省电模式：禁用粒子
    if (isMobile) return 25; // 移动设备：少量粒子
    if (isLowEndDevice) return 40; // 低性能设备

    return 60; // 高性能设备
}

const GpuBackground: React.FC<GpuBackgroundProps> = ({
    particleCount,
    colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#22c55e'],
    enabled = true,
    opacity = 0.6,
    connectionDistance = 150,
    showConnections = true
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);
    const animationRef = useRef<number>(0);
    const [isSupported, setIsSupported] = useState(true);

    // 初始化粒子
    const initParticles = useCallback((width: number, height: number, count: number) => {
        const particles: Particle[] = [];
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 2 + 1,
                alpha: Math.random() * 0.5 + 0.3,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }
        return particles;
    }, [colors]);

    // 动画循环
    useEffect(() => {
        if (!enabled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            setIsSupported(false);
            return;
        }

        // 设置画布尺寸
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            ctx.scale(dpr, dpr);
        };
        resize();
        window.addEventListener('resize', resize);

        // 初始化粒子
        const count = particleCount ?? getRecommendedParticleCount();
        if (count === 0) {
            setIsSupported(false);
            return;
        }

        particlesRef.current = initParticles(window.innerWidth, window.innerHeight, count);

        // 动画帧
        const animate = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;

            // 清除画布
            ctx.clearRect(0, 0, width, height);

            const particles = particlesRef.current;

            // 更新和绘制粒子
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];

                // 更新位置
                p.x += p.vx;
                p.y += p.vy;

                // 边界反弹
                if (p.x < 0 || p.x > width) p.vx *= -1;
                if (p.y < 0 || p.y > height) p.vy *= -1;

                // 绘制粒子
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.alpha * opacity;
                ctx.fill();

                // 绘制连接线
                if (showConnections) {
                    for (let j = i + 1; j < particles.length; j++) {
                        const p2 = particles[j];
                        const dx = p.x - p2.x;
                        const dy = p.y - p2.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < connectionDistance) {
                            ctx.beginPath();
                            ctx.moveTo(p.x, p.y);
                            ctx.lineTo(p2.x, p2.y);
                            ctx.strokeStyle = p.color;
                            ctx.globalAlpha = (1 - dist / connectionDistance) * 0.2 * opacity;
                            ctx.lineWidth = 0.5;
                            ctx.stroke();
                        }
                    }
                }
            }

            ctx.globalAlpha = 1;
            animationRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationRef.current);
        };
    }, [enabled, particleCount, opacity, connectionDistance, showConnections, initParticles]);

    // 不支持或禁用时不渲染
    if (!enabled || !isSupported) return null;

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 z-0 pointer-events-none gpu-particle"
            style={{
                opacity: opacity,
                mixBlendMode: 'screen'
            }}
        />
    );
};

export default GpuBackground;

/**
 * 检测是否支持 GPU 加速
 */
export function isGpuAccelerated(): boolean {
    if (typeof window === 'undefined') return false;

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return gl !== null;
}
