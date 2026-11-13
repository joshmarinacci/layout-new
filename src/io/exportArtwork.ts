import {isTauri} from '@tauri-apps/api/core';
import type {Bounds, Document, PixelImageData, Shape} from '../model/types';
import {spanControls, vectorBounds} from '../shapes/vectorNetworks';
import {wrapText} from '../shapes/text';
import {fontFamilyFor, waitForTextFont} from '../shapes/googleFonts';

export type ArtworkFormat = 'png' | 'svg';

function safeName(value: string) {
    return value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').replace(/\.+$/g, '') || 'Untitled';
}

function esc(value: string) {
    return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function bounds(shape: Shape): Bounds {
    switch (shape.type) {
        case 'vector': return vectorBounds(shape.components.network);
        case 'circle': {
            const {center, radius} = shape.components.circle;
            return {x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2};
        }
        case 'rectangle': return shape.components.rect.bounds;
        case 'text': return shape.components.rect.bounds;
        case 'oval': return shape.components.oval.bounds;
        case 'pixel-image': case 'repeating-image': return shape.components.rect.bounds;
    }
}

function pixelRuns(image: PixelImageData, source: Bounds, dest: Bounds): string {
    const sx = dest.width / source.width, sy = dest.height / source.height;
    const x0 = Math.floor(source.x), y0 = Math.floor(source.y), width = Math.ceil(source.width), height = Math.ceil(source.height);
    const rects: string[] = [];
    for (let y = 0; y < height; y++) {
        let x = 0;
        while (x < width) {
            const index = image.pixels[(y0 + y) * image.width + x0 + x];
            if (index < 0) { x++; continue; }
            let end = x + 1;
            while (end < width && image.pixels[(y0 + y) * image.width + x0 + end] === index) end++;
            rects.push(`<rect x="${x * sx}" y="${y * sy}" width="${(end - x) * sx}" height="${sy}" fill="${esc(image.palette[index])}"/>`);
            x = end;
        }
    }
    return rects.join('');
}

function shapeSvg(shape: Shape, doc: Document, index: number): string {
    if (shape.type === 'text') {
        const value = shape.components.text, b = shape.components.rect.bounds;
        const fontFamily = doc.fonts.find(font => font.id === value.fontId)?.family ?? 'sans-serif';
        const measure = document.createElement('canvas').getContext('2d');
        if (!measure) return '';
        measure.font = `${value.italic ? 'italic ' : ''}${value.fontWeight} ${value.fontSize}px ${fontFamilyFor(doc.fonts, value.fontId)}`;
        const lines = wrapText(measure, value.text, b.width), id = `text-clip-${index}`;
        const x = value.align === 'left' ? b.x : value.align === 'center' ? b.x + b.width / 2 : b.x + b.width;
        const tspans = lines.map((line, lineIndex) => `<tspan x="${x}" y="${b.y + value.fontSize + lineIndex * value.fontSize * value.lineHeight}">${esc(line)}</tspan>`).join('');
        return `<defs><clipPath id="${id}"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}"/></clipPath></defs><text clip-path="url(#${id})" font-family="${esc(fontFamily)}" font-size="${value.fontSize}" font-weight="${value.fontWeight}" font-style="${value.italic ? 'italic' : 'normal'}" text-anchor="${value.align === 'left' ? 'start' : value.align === 'center' ? 'middle' : 'end'}" fill="${esc(value.color)}">${tspans}</text>`;
    }
    if (shape.type === 'vector') {
        const n = shape.components.network;
        const paths = n.regions.filter(region => region.fill).map(region => {
            const d = region.loops.map(loop => loop.map((span, i) => {
                const segment = n.segments.find(item => item.id === span.segment);
                if (!segment) return '';
                const controls = spanControls(n, span);
                const point = (p: {x: number; y: number}) => `${p.x} ${p.y}`;
                return `${i === 0 ? `M ${point(controls[0])}` : ''} C ${point(controls[1])} ${point(controls[2])} ${point(controls[3])}`;
            }).join(' ') + ' Z').join(' ');
            return `<path d="${d}" fill="${esc(region.fill!)}" fill-rule="evenodd"/>`;
        }).join('');
        const stroke = shape.components.stroke;
        const lines = n.segments.map(segment => {
            const a = n.points.find(point => point.id === segment.a), b = n.points.find(point => point.id === segment.b);
            if (!a || !b) return '';
            const point = (p: {x: number; y: number}) => `${p.x} ${p.y}`;
            return `M ${point(a)} C ${point(segment.c1 ?? a)} ${point(segment.c2 ?? b)} ${point(b)}`;
        }).join(' ');
        return `<g transform="translate(${n.origin.x} ${n.origin.y})">${paths}<path d="${lines}" fill="none" stroke="${esc(stroke.color)}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    }
    if (shape.type === 'pixel-image' || shape.type === 'repeating-image') {
        const image = doc.images.find(item => item.id === shape.components.image.imageId);
        if (!image) return '';
        const source = shape.components.image.source;
        const b = shape.components.rect.bounds;
        if (shape.type === 'pixel-image') return `<g shape-rendering="crispEdges">${pixelRuns(image, source, b)}</g>`;
        const pattern = shape.components.pattern;
        const id = `repeat-${index}`;
        const tileBounds = {x: 0, y: 0, width: pattern.width, height: pattern.height};
        return `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" x="${b.x}" y="${b.y}" width="${pattern.width}" height="${pattern.height}"><g shape-rendering="crispEdges">${pixelRuns(image, source, tileBounds)}</g></pattern></defs><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="url(#${id})"/>`;
    }
    const fill = esc(shape.components.fill.fill.color), stroke = shape.components.stroke;
    const strokeAttrs = stroke.width > 0 ? ` stroke="${esc(stroke.color)}" stroke-width="${stroke.width}"` : '';
    if (shape.type === 'circle') {
        const {center, radius} = shape.components.circle;
        return `<circle cx="${center.x}" cy="${center.y}" r="${radius}" fill="${fill}"${strokeAttrs}/>`;
    }
    const b = bounds(shape);
    if (shape.type === 'oval') return `<ellipse cx="${b.x + b.width / 2}" cy="${b.y + b.height / 2}" rx="${b.width / 2}" ry="${b.height / 2}" fill="${fill}"${strokeAttrs}/>`;
    return `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${shape.components.cornerRadius.radius}" fill="${fill}"${strokeAttrs}/>`;
}

export function artworkSvg(doc: Document, shapes: readonly Shape[], pageSized = false): string {
    if (!shapes.length && !pageSized) throw new Error('There is no artwork to export');
    let view: Bounds;
    if (pageSized) view = {x: 0, y: 0, width: 1024, height: 1024};
    else {
        const list = shapes.map(shape => {
            const b = bounds(shape);
            const padding = shape.type === 'vector' || shape.type === 'circle' || shape.type === 'oval' || shape.type === 'rectangle'
                ? shape.components.stroke.width / 2 : 0;
            return {x: b.x - padding, y: b.y - padding, width: b.width + padding * 2, height: b.height + padding * 2};
        });
        const minX = Math.min(...list.map(b => b.x)), minY = Math.min(...list.map(b => b.y));
        const maxX = Math.max(...list.map(b => b.x + b.width)), maxY = Math.max(...list.map(b => b.y + b.height));
        view = {x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY)};
    }
    const background = pageSized ? `<rect x="0" y="0" width="${view.width}" height="${view.height}" fill="#ffffff"/>` : '';
    const usedFontIds = new Set(shapes.filter((shape): shape is Extract<Shape, {type: 'text'}> => shape.type === 'text').map(shape => shape.components.text.fontId).filter((id): id is string => !!id));
    const styles = doc.fonts.filter(font => usedFontIds.has(font.id)).map(font => `<style>${font.css.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</style>`).join('');
    const body = styles + background + shapes.map((shape, index) => shapeSvg(shape, doc, index)).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}" viewBox="${view.x} ${view.y} ${view.width} ${view.height}">${body}</svg>`;
}

function download(bytes: Uint8Array, mime: string, filename: string) {
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], {type: mime}));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveOutput(bytes: Uint8Array, mime: string, filename: string, format: ArtworkFormat) {
    if (!isTauri()) { download(bytes, mime, filename); return; }
    const [{save}, {writeFile}] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
    const path = await save({defaultPath: filename, filters: [{name: `${format.toUpperCase()} artwork`, extensions: [format]}]});
    if (path) await writeFile(path, bytes);
}

export async function exportArtwork(doc: Document, shapes: readonly Shape[], filename: string, format: ArtworkFormat, pageSized = false) {
    await Promise.all(shapes.filter((shape): shape is Extract<Shape, {type: 'text'}> => shape.type === 'text').map(shape => waitForTextFont(doc.fonts, shape.components.text)));
    const svg = artworkSvg(doc, shapes, pageSized);
    const safeFilename = `${safeName(filename)}.${format}`;
    if (format === 'svg') {
        await saveOutput(new TextEncoder().encode(svg), 'image/svg+xml', safeFilename, format);
        return;
    }
    const viewBox = svg.match(/viewBox="([^"]+)"/)![1].split(/\s+/).map(Number);
    const scale = Math.min(1, 4096 / Math.max(viewBox[2], viewBox[3]));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewBox[2] * scale)); canvas.height = Math.max(1, Math.ceil(viewBox[3] * scale));
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], {type: 'image/svg+xml;charset=utf-8'}));
    try {
        image.src = url;
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Unable to render artwork as PNG')); });
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Unable to create PNG canvas');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to encode PNG')), 'image/png'));
        await saveOutput(new Uint8Array(await blob.arrayBuffer()), 'image/png', safeFilename, format);
    } finally { URL.revokeObjectURL(url); }
}
