import type {FontAsset, TextComponent} from '../model/types';

function toBase64(bytes: Uint8Array) {
    let binary = '';
    for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
    return btoa(binary);
}

/** Fetch one Google Fonts family and embed its WOFF2 subset files in the asset. */
export async function fetchGoogleFont(familyInput: string): Promise<FontAsset> {
    const family = familyInput.trim();
    if (!family || family.length > 200 || /[<>\u0000-\u001f]/.test(family)) throw new Error('Enter a valid Google Fonts family name');
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replaceAll('%20', '+')}&display=swap`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google Fonts did not find “${family}”`);
    let css = await response.text();
    const urls = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map(match => match[1].trim().replace(/^['"]|['"]$/g, '')))];
    if (!urls.length) throw new Error('Google Fonts returned no font files for this family');
    const embedded = new Map<string, string>();
    await Promise.all(urls.map(async fontUrl => {
        const file = await fetch(fontUrl);
        if (!file.ok) throw new Error(`Unable to download the ${family} font file`);
        embedded.set(fontUrl, `data:font/woff2;base64,${toBase64(new Uint8Array(await file.arrayBuffer()))}`);
    }));
    css = css.replace(/url\(([^)]+)\)/g, (_whole, value: string) => {
        const fontUrl = value.trim().replace(/^['"]|['"]$/g, '');
        return `url("${embedded.get(fontUrl)}")`;
    });
    return {id: crypto.randomUUID(), family, css};
}

export function installDocumentFonts(fonts: readonly FontAsset[]) {
    const id = 'layout-document-fonts';
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement('style');
        style.id = id;
        document.head.append(style);
    }
    style.textContent = fonts.map(font => font.css).join('\n');
}

export async function waitForTextFont(fonts: readonly FontAsset[], text: TextComponent) {
    const font = fonts.find(item => item.id === text.fontId);
    if (!font) return;
    installDocumentFonts(fonts);
    const style = text.italic ? 'italic ' : 'normal ';
    await document.fonts.load(`${style}${text.fontWeight} ${text.fontSize}px ${JSON.stringify(font.family)}`);
}

export function fontFamilyFor(fonts: readonly FontAsset[], fontId: string | null) {
    return JSON.stringify(fonts.find(font => font.id === fontId)?.family ?? 'sans-serif');
}
