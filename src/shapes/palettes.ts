import {converter, formatHex, parse} from 'culori';
import type {ColorPalette, PaletteColor} from '../model/types';

export const pico8Colors = [
    '#000000',
    '#1d2b53',
    '#7e2553',
    '#008751',
    '#ab5236',
    '#5f574f',
    '#c2c3c7',
    '#fff1e8',
    '#ff004d',
    '#ffa300',
    '#ffec27',
    '#00e436',
    '#29adff',
    '#83769c',
    '#ff77a8',
    '#ffccaa',
];
export const newPalette = (
    name = 'Custom palette',
    values: string[] = ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#1d3557'],
): ColorPalette => ({
    id: crypto.randomUUID(),
    name,
    colors: values.map((value, i) => ({
        id: crypto.randomUUID(),
        name: `Color ${i + 1}`,
        space: 'srgb',
        value: normalizeColor(value),
    })),
});
export function normalizeColor(value: string): string {
    const result = formatHex(parse(value));
    if (!result) throw new Error(`Invalid color: ${value}`);
    return result.toLowerCase();
}
export function convertColor(value: string, mode: 'rgb' | 'hsl' | 'oklch' | 'oklab') {
    const converted = converter(mode)(parse(value));
    if (!converted) return '';
    if (mode === 'rgb')
        return `rgb(${Math.round((converted.r ?? 0) * 255)} ${Math.round((converted.g ?? 0) * 255)} ${Math.round((converted.b ?? 0) * 255)})`;
    if (mode === 'hsl')
        return `hsl(${Math.round(converted.h ?? 0)} ${Math.round((converted.s ?? 0) * 100)}% ${Math.round((converted.l ?? 0) * 100)}%)`;
    if (mode === 'oklab')
        return `oklab(${(converted.l ?? 0).toFixed(3)} ${(converted.a ?? 0).toFixed(3)} ${(converted.b ?? 0).toFixed(3)})`;
    return `oklch(${(converted.l ?? 0).toFixed(3)} ${(converted.c ?? 0).toFixed(3)} ${Math.round(converted.h ?? 0)})`;
}
export function fromColorSpace(value: string, mode: 'rgb' | 'hsl' | 'oklch' | 'oklab') {
    return normalizeColor(formatHex(converter('rgb')(converter(mode)(parse(value)))) ?? value);
}
export function parsePalette(text: string, filename: string): ColorPalette {
    const ext = filename.toLowerCase().split('.').pop();
    let colors: PaletteColor[];
    if (ext === 'gpl') {
        const lines = text
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(
                line =>
                    line &&
                    !line.startsWith('#') &&
                    !line.startsWith('GIMP Palette') &&
                    !line.startsWith('Name:') &&
                    !line.startsWith('Columns:'),
            );
        colors = lines.flatMap((line, i) => {
            const m = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s*(.*)$/);
            if (!m) return [];
            return [
                {
                    id: crypto.randomUUID(),
                    space: 'srgb' as const,
                    value: normalizeColor(
                        `#${[m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('')}`,
                    ),
                    name: m[4].trim() || `Color ${i + 1}`,
                },
            ];
        });
    } else if (ext === 'json') {
        const value: unknown = JSON.parse(text);
        const list = Array.isArray(value)
            ? value
            : typeof value === 'object' && value && 'colors' in value
              ? (value as {colors: unknown}).colors
              : null;
        if (!Array.isArray(list)) throw new Error('Palette JSON must be an array or have a colors array');
        colors = list.map((item, i) => {
            const entry =
                typeof item === 'string'
                    ? {value: item}
                    : (item as {name?: string; value?: string; color?: string; space?: PaletteColor['space']});
            const value = entry.value ?? entry.color;
            if (typeof value !== 'string') throw new Error(`Invalid color at index ${i}`);
            normalizeColor(value);
            const space = entry.space ?? 'srgb';
            if (!['srgb', 'rgb', 'hsl', 'oklab', 'oklch'].includes(space))
                throw new Error(`Unsupported color space at index ${i}`);
            return {
                id: crypto.randomUUID(),
                name: entry.name,
                space,
                value: space === 'srgb' ? normalizeColor(value) : convertColor(value, space),
            };
        });
    } else {
        colors = text
            .split(/[\r\n,\s]+/)
            .map(token => token.trim())
            .filter(token => /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(token))
            .map((token, i) => ({
                id: crypto.randomUUID(),
                name: `Color ${i + 1}`,
                space: 'srgb' as const,
                value: normalizeColor(token.startsWith('#') ? token : `#${token}`),
            }));
    }
    if (!colors.length || colors.length > 256) throw new Error('Palette must contain 1–256 colors');
    return {id: crypto.randomUUID(), name: filename.replace(/\.[^.]+$/, '') || 'Imported palette', colors};
}
