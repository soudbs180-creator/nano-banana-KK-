/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class', // Uses .dark-mode class on body
    content: [
        "./index.html",
        "./app/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./context/**/*.{js,ts,jsx,tsx}",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./*.{js,ts,jsx,tsx}"
    ],
    theme: {
        extend: {
            // ===== 字体大小 - Design System v2.0 =====
            fontSize: {
                'h1': ['28px', { lineHeight: '1.25' }],
                'h2': ['22px', { lineHeight: '1.25' }],
                'h3': ['18px', { lineHeight: '1.25' }],
                'body-lg': ['16px', { lineHeight: '1.5' }],
                'body-md': ['14px', { lineHeight: '1.5' }],
                'body-sm': ['13px', { lineHeight: '1.5' }],
                'caption-lg': ['12px', { lineHeight: '1.5' }],
                'caption-md': ['11px', { lineHeight: '1.5' }],
                'caption-sm': ['10px', { lineHeight: '1.5' }],
            },
            // ===== 动画 - Design System v2.0 =====
            animation: {
                // 入场动画
                'fade-in': 'fadeIn 250ms ease-out',
                'fade-out': 'fadeOut 200ms ease-in',
                'scale-in': 'scaleIn 250ms ease-out',
                'scale-out': 'scaleOut 200ms ease-in',
                'modal-in': 'modalIn 250ms ease-out',
                'modal-out': 'modalOut 200ms ease-in',
                'slide-down': 'slideDown 300ms ease-out',
                'slide-up': 'slideUp 250ms ease-in',
                'slide-in-right': 'slideInRight 300ms ease-out',
                'slide-out-right': 'slideOutRight 250ms ease-in',
                'card-pop-in': 'cardPopIn 300ms cubic-bezier(0.16, 1, 0.3, 1)',
                // 持续动画
                'pulse': 'pulse 2s ease-in-out infinite',
                'shimmer': 'shimmer 2s linear infinite',
                'glow-pulse': 'glowPulse 2s ease-in-out infinite',
                'border-glow': 'borderGlow 2s ease-in-out infinite',
                'spin': 'spin 1s linear infinite',
                // 兼容旧动画名
                fadeIn: 'fadeIn 200ms ease-out',
                scaleIn: 'scaleIn 200ms ease-out',
                cardPopIn: 'cardPopIn 300ms cubic-bezier(0.16, 1, 0.3, 1)',
                slideDown: 'slideDown 300ms ease-out',
                slideUp: 'slideUp 300ms ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                fadeOut: {
                    '0%': { opacity: '1' },
                    '100%': { opacity: '0' },
                },
                scaleIn: {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                scaleOut: {
                    '0%': { opacity: '1', transform: 'scale(1)' },
                    '100%': { opacity: '0', transform: 'scale(0.95)' },
                },
                modalIn: {
                    '0%': { opacity: '0', transform: 'scale(0.95) translateY(-10px)' },
                    '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
                },
                modalOut: {
                    '0%': { opacity: '1', transform: 'scale(1) translateY(0)' },
                    '100%': { opacity: '0', transform: 'scale(0.95) translateY(-10px)' },
                },
                slideDown: {
                    '0%': { opacity: '0', transform: 'translateY(-10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                slideUp: {
                    '0%': { opacity: '1', transform: 'translateY(0)' },
                    '100%': { opacity: '0', transform: 'translateY(-10px)' },
                },
                slideInRight: {
                    '0%': { opacity: '0', transform: 'translateX(100%)' },
                    '100%': { opacity: '1', transform: 'translateX(0)' },
                },
                slideOutRight: {
                    '0%': { opacity: '1', transform: 'translateX(0)' },
                    '100%': { opacity: '0', transform: 'translateX(100%)' },
                },
                cardPopIn: {
                    '0%': { opacity: '0', transform: 'scale(0.9)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                pulse: {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.5' },
                },
                shimmer: {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
                glowPulse: {
                    '0%, 100%': { boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)' },
                    '50%': { boxShadow: '0 0 30px rgba(59, 130, 246, 0.6)' },
                },
                borderGlow: {
                    '0%, 100%': {
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        boxShadow: '0 0 15px rgba(59, 130, 246, 0.2)'
                    },
                    '50%': {
                        borderColor: 'rgba(59, 130, 246, 0.6)',
                        boxShadow: '0 0 25px rgba(59, 130, 246, 0.4)'
                    },
                },
            },
        },
    },
    plugins: [],
}
