import {useState} from 'react';
import {clampPanelWidth} from './PanelResizer';

export interface PanelWidths { left: number; right: number }

const STORAGE_KEY = 'layout-new:panel-widths:v1';
export const DEFAULT_PANEL_WIDTHS: PanelWidths = {left: 220, right: 280};

function load(): PanelWidths {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
        if (parsed && typeof parsed === 'object' && 'left' in parsed && 'right' in parsed
            && typeof parsed.left === 'number' && typeof parsed.right === 'number')
            return {left: clampPanelWidth(parsed.left), right: clampPanelWidth(parsed.right)};
    } catch { /* Storage may be unavailable or hold bad data; fall back to defaults. */ }
    return DEFAULT_PANEL_WIDTHS;
}

/** Side panel widths, remembered per browser as a viewer preference. */
export function usePanelWidths() {
    const [widths, setWidths] = useState(load);
    const setWidth = (side: keyof PanelWidths, width: number) => {
        const next = {...widths, [side]: clampPanelWidth(width)};
        setWidths(next);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Not persisted. */ }
    };
    return [widths, setWidth] as const;
}
