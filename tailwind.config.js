/** @type {import('tailwindcss').Config} */
export default {
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
            animation: {
                fadeIn: 'fadeIn 0.2s ease-out',
                scaleIn: 'scaleIn 0.2s ease-out',
                cardPopIn: 'cardPopIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                slideDown: 'slideDown 0.3s ease-out',
                slideUp: 'slideUp 0.3s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                scaleIn: {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                cardPopIn: {
                    '0%': { opacity: '0', transform: 'translate(-50%, -100%) scale(0.9)' },
                    '100%': { opacity: '1', transform: 'translate(-50%, -100%) scale(1)' },
                },
                slideDown: {
                    '0%': { opacity: '0', transform: 'translateX(-50%) translateY(-20px)' },
                    '100%': { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
        },
    },
    plugins: [],
}
