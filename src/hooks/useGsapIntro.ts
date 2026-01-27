import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import { gsap } from 'gsap';

type GsapIntroOptions = {
    y?: number;
    duration?: number;
    delay?: number;
    ease?: string;
    scale?: number;
};

export const useGsapIntro = (
    ref: RefObject<HTMLElement>,
    active: boolean,
    options: GsapIntroOptions = {}
) => {
    useLayoutEffect(() => {
        if (!active || !ref.current) return;

        const {
            y = 12,
            duration = 0.45,
            delay = 0,
            ease = 'power2.out',
            scale = 0.98
        } = options;

        const ctx = gsap.context(() => {
            gsap.fromTo(
                ref.current,
                { opacity: 0, y, scale },
                { opacity: 1, y: 0, scale: 1, duration, delay, ease, clearProps: 'opacity,transform' }
            );
        }, ref);

        return () => ctx.revert();
    }, [active, ref, options.delay, options.duration, options.ease, options.scale, options.y]);
};
