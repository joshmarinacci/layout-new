import {applyTheme, loadTheme, normalize, saveTheme, type ThemeSettings} from '@joshmarinacci/tooltheme';
import {useEffect, useState} from 'react';

/** The Appearance menu's choices; tooltheme stores 'system' as an empty mode. */
export type Theme = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'layout-editor-theme-settings';
/** Before tooltheme, only the mode was saved, under this key. */
const LEGACY_MODE_KEY = 'layout-editor-theme';

export function loadThemeSettings(): ThemeSettings {
    try {
        const saved = loadTheme(THEME_STORAGE_KEY);
        if (saved) return saved;
        const legacy = localStorage.getItem(LEGACY_MODE_KEY);
        return normalize({mode: legacy === 'light' || legacy === 'dark' ? legacy : ''});
    } catch {
        return normalize();
    }
}

export function themeMode(settings: ThemeSettings): Theme {
    return settings.mode || 'system';
}

/**
 * tooltheme settings (accent, contrast, corners, spacing, type and mode) for the whole app.
 * They're applied to <html> as CSS variables and remembered per browser.
 */
export function useThemeSettings() {
    const [settings, setSettings] = useState(loadThemeSettings);
    useEffect(() => {
        applyTheme(settings);
        saveTheme(settings, THEME_STORAGE_KEY);
    }, [settings]);
    const setMode = (theme: Theme) => setSettings(current => ({...current, mode: theme === 'system' ? '' : theme}));
    return {settings, setSettings, setMode};
}
