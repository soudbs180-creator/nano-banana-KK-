import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        const stored = localStorage.getItem('theme') || localStorage.getItem('kk_theme');
        if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
        return 'system';
    });

    useEffect(() => {
        const body = document.body;
        const root = document.documentElement;
        const media = window.matchMedia('(prefers-color-scheme: dark)');

        const applyMode = (mode: 'dark' | 'light') => {
            body.classList.toggle('dark-mode', mode === 'dark');
            root.style.colorScheme = mode;
        };

        if (theme === 'system') {
            applyMode(media.matches ? 'dark' : 'light');
            localStorage.removeItem('theme');
            localStorage.removeItem('kk_theme');
            const handleChange = (e: MediaQueryListEvent) => applyMode(e.matches ? 'dark' : 'light');
            media.addEventListener('change', handleChange);
            return () => media.removeEventListener('change', handleChange);
        }

        applyMode(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
