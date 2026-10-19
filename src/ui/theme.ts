import {useEffect, useState} from 'react';

export type Theme = 'system' | 'light' | 'dark';

export function useTheme() {
    const [theme, setTheme] = useState<Theme>(() => {
        try {
            const saved = localStorage.getItem('layout-editor-theme');
            return saved === 'light' || saved === 'dark' ? saved : 'system';
        } catch {
            return 'system';
        }
    });
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        try {
            localStorage.setItem('layout-editor-theme', theme);
        } catch { /* Styling also works without storage. */
        }
    }, [theme]);
    return [theme, setTheme] as const;
}
