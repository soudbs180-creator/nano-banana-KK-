import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export type Theme = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

interface ThemeContextType {
    theme: Theme;
    resolvedTheme: ResolvedTheme;
    isDarkMode: boolean;
    isLightMode: boolean;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const getSystemTheme = (): ResolvedTheme => {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getStoredTheme = (): Theme => {
    if (typeof window === 'undefined') return 'dark';

    const stored = localStorage.getItem('theme') || localStorage.getItem('kk_theme');
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
    return 'dark';
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<Theme>(getStoredTheme);
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
        const initialTheme = getStoredTheme();
        return initialTheme === 'system' ? getSystemTheme() : initialTheme;
    });
    const hasMountedRef = useRef(false);
    const transitionTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const body = document.body;
        const root = document.documentElement;
        const media = window.matchMedia('(prefers-color-scheme: dark)');

        const clearThemeTransition = () => {
            body.classList.remove('theme-transitioning');
            root.classList.remove('theme-transitioning');

            if (transitionTimeoutRef.current !== null) {
                window.clearTimeout(transitionTimeoutRef.current);
                transitionTimeoutRef.current = null;
            }
        };

        const startThemeTransition = () => {
            if (!hasMountedRef.current) return;
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

            clearThemeTransition();
            body.classList.add('theme-transitioning');
            root.classList.add('theme-transitioning');
            transitionTimeoutRef.current = window.setTimeout(clearThemeTransition, 320);
        };

        const applyMode = (mode: ResolvedTheme) => {
            startThemeTransition();
            setResolvedTheme((currentMode) => (currentMode === mode ? currentMode : mode));
            body.classList.toggle('dark-mode', mode === 'dark');
            root.classList.toggle('dark', mode === 'dark');
            body.dataset.theme = mode;
            root.dataset.theme = mode;
            root.style.colorScheme = mode;
        };

        if (theme === 'system') {
            applyMode(getSystemTheme());
            localStorage.removeItem('theme');
            localStorage.removeItem('kk_theme');

            const handleChange = () => {
                applyMode(getSystemTheme());
            };

            media.addEventListener('change', handleChange);
            hasMountedRef.current = true;

            return () => {
                media.removeEventListener('change', handleChange);
                clearThemeTransition();
            };
        }

        applyMode(theme);
        localStorage.setItem('theme', theme);
        localStorage.setItem('kk_theme', theme);
        hasMountedRef.current = true;

        return () => {
            clearThemeTransition();
        };
    }, [theme]);

    useEffect(() => {
        return () => {
            if (transitionTimeoutRef.current !== null) {
                window.clearTimeout(transitionTimeoutRef.current);
            }
        };
    }, []);

    const toggleTheme = () => {
        setThemeState((previousTheme) => {
            if (previousTheme === 'dark') return 'light';
            if (previousTheme === 'light') return 'dark';
            return resolvedTheme === 'dark' ? 'light' : 'dark';
        });
    };

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
    };

    return (
        <ThemeContext.Provider
            value={{
                theme,
                resolvedTheme,
                isDarkMode: resolvedTheme === 'dark',
                isLightMode: resolvedTheme === 'light',
                toggleTheme,
                setTheme,
            }}
        >
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
