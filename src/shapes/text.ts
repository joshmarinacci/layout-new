import type {Bounds, FontAsset, TextShape} from '../model/types';
import {fontFamilyFor} from './googleFonts';

export function wrapText(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number): string[] {
    const paragraphs = text.split('\n');
    const lines: string[] = [];
    for (const paragraph of paragraphs) {
        if (!paragraph) { lines.push(''); continue; }
        let line = '';
        for (const word of paragraph.split(/\s+/)) {
            const candidate = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(candidate).width > maxWidth) {
                lines.push(line);
                line = '';
            }
            if (ctx.measureText(word).width <= maxWidth) {
                line = line ? `${line} ${word}` : word;
                continue;
            }
            for (const character of word) {
                if (line && ctx.measureText(line + character).width > maxWidth) {
                    lines.push(line);
                    line = character;
                } else line += character;
            }
        }
        lines.push(line);
    }
    return lines;
}

export function textBounds(shape: TextShape): Bounds { return shape.components.rect.bounds; }

export function drawTextShape(ctx: CanvasRenderingContext2D, shape: TextShape, fonts: readonly FontAsset[]) {
    const bounds = textBounds(shape), style = shape.components.text, fontFamily = fontFamilyFor(fonts, style.fontId);
    ctx.save();
    ctx.beginPath(); ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height); ctx.clip();
    ctx.font = `${style.italic ? 'italic ' : ''}${style.fontWeight} ${style.fontSize}px ${fontFamily}`;
    ctx.textAlign = style.align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = style.color;
    const x = style.align === 'left' ? bounds.x : style.align === 'center' ? bounds.x + bounds.width / 2 : bounds.x + bounds.width;
    const lines = wrapText(ctx, style.text, bounds.width);
    lines.forEach((line, index) => ctx.fillText(line, x, bounds.y + style.fontSize + index * style.fontSize * style.lineHeight, bounds.width));
    ctx.restore();
}
