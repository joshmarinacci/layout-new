import type {Bounds, FontAsset, TextComponent, TextShape} from '../model/types';
import {fontFamilyFor} from './googleFonts';

type Measure = Pick<CanvasRenderingContext2D, 'measureText'>;

/** Approximate descender depth as a fraction of font size, so bottom-aligned text isn't clipped. */
const DESCENT_RATIO = 0.25;

export function wrapText(ctx: Measure, text: string, maxWidth: number): string[] {
    const paragraphs = text.split('\n');
    const lines: string[] = [];
    for (const paragraph of paragraphs) {
        if (!paragraph) {
            lines.push('');
            continue;
        }
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

export interface TextLine {
    text: string;
    y: number;
}
export interface TextLayout {
    x: number;
    lines: TextLine[];
}

/** Position wrapped lines inside the box; shared by canvas rendering and SVG export. */
export function layoutText(ctx: Measure, style: TextComponent, bounds: Bounds): TextLayout {
    const wrapped = wrapText(ctx, style.text, bounds.width);
    const step = style.fontSize * style.lineHeight;
    const blockHeight = style.fontSize + (wrapped.length - 1) * step + style.fontSize * DESCENT_RATIO;
    const top =
        style.verticalAlign === 'top'
            ? bounds.y
            : style.verticalAlign === 'middle'
              ? bounds.y + (bounds.height - blockHeight) / 2
              : bounds.y + bounds.height - blockHeight;
    const x =
        style.align === 'left'
            ? bounds.x
            : style.align === 'center'
              ? bounds.x + bounds.width / 2
              : bounds.x + bounds.width;
    return {x, lines: wrapped.map((text, index) => ({text, y: top + style.fontSize + index * step}))};
}

export function textBounds(shape: TextShape): Bounds {
    return shape.components.rect.bounds;
}

export function drawTextShape(ctx: CanvasRenderingContext2D, shape: TextShape, fonts: readonly FontAsset[]) {
    const bounds = textBounds(shape),
        style = shape.components.text,
        fontFamily = fontFamilyFor(fonts, style.fontId);
    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.clip();
    ctx.font = `${style.italic ? 'italic ' : ''}${style.fontWeight} ${style.fontSize}px ${fontFamily}`;
    ctx.textAlign = style.align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = style.color;
    const {x, lines} = layoutText(ctx, style, bounds);
    lines.forEach(line => ctx.fillText(line.text, x, line.y, bounds.width));
    ctx.restore();
}
