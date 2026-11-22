import {useEffect, useMemo, useRef, useState} from 'react';
import {EditorDialog} from '../common/EditorDialog';
import {convertImportedPixels, type DecodedPixels, decodePng} from '../io/pngImport';
import type {EditorStore} from '../model/EditorStore';

export function ImportPixelImage({store, onClose}: {store: EditorStore; onClose: () => void}) {
    const [source, setSource] = useState<DecodedPixels | null>(null);
    const [originalName, setOriginalName] = useState<string | null>(null);
    const [name, setName] = useState('Imported image');
    const [split, setSplit] = useState(false);
    const [tileWidth, setTileWidth] = useState(8);
    const [tileHeight, setTileHeight] = useState(8);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const request = useRef(0);
    const preview = useRef<HTMLCanvasElement>(null);
    useEffect(
        () => () => {
            request.current++;
        },
        [],
    );
    const result = useMemo(() => {
        if (!source) return null;
        try {
            return {
                value: convertImportedPixels(source, name, split ? {width: tileWidth, height: tileHeight} : undefined),
                error: '',
            };
        } catch (error) {
            return {value: null, error: error instanceof Error ? error.message : 'Unsupported image.'};
        }
    }, [source, name, split, tileWidth, tileHeight]);
    useEffect(() => {
        if (!source || !preview.current) return;
        const ctx = preview.current.getContext('2d');
        if (!ctx) return;
        const pixels = ctx.createImageData(source.width, source.height);
        pixels.data.set(source.rgba);
        ctx.putImageData(pixels, 0, 0);
    }, [source]);
    const zoom = source ? Math.max(1, Math.min(16, Math.floor(Math.min(640 / source.width, 320 / source.height)))) : 1;
    return (
        <EditorDialog title="Import PNG" onClose={onClose}>
            <form
                className="pixel-create"
                onSubmit={event => {
                    event.preventDefault();
                    if (!source || busy || !result?.value) return;
                    try {
                        const ids = store.importPixelImages(
                            source,
                            name,
                            split ? {width: tileWidth, height: tileHeight} : undefined,
                            originalName,
                        );
                        store.select(ids[0]);
                        onClose();
                    } catch (error) {
                        setError(error instanceof Error ? error.message : 'Unable to import image.');
                    }
                }}
            >
                <label>
                    PNG file
                    <input
                        autoFocus
                        type="file"
                        accept=".png,image/png"
                        onChange={async event => {
                            const file = event.target.files?.[0];
                            const token = ++request.current;
                            setSource(null);
                            setError('');
                            setBusy(!!file);
                            if (!file) return;
                            try {
                                const decoded = await decodePng(file);
                                if (request.current !== token) return;
                                setSplit(decoded.width > 256 || decoded.height > 256);
                                setOriginalName(file.name);
                                setName(file.name.replace(/\.png$/i, '') || 'Imported image');
                                setSource(decoded);
                            } catch (error) {
                                if (request.current === token)
                                    setError(error instanceof Error ? error.message : 'Unable to read PNG.');
                            } finally {
                                if (request.current === token) setBusy(false);
                            }
                        }}
                    />
                </label>
                <p>
                    Up to 2048 × 2048 pixels and 256 colors; sources over 256 pixels require tile splitting. Colors and
                    dimensions are preserved; partially transparent pixels are not supported.
                </p>
                {busy && <p role="status">Reading PNG…</p>}
                {source && (
                    <>
                        <div className="import-preview">
                            <canvas
                                ref={preview}
                                className="checkerboard"
                                aria-label="PNG preview"
                                width={source.width}
                                height={source.height}
                                style={{
                                    width: source.width * zoom,
                                    height: source.height * zoom,
                                    imageRendering: 'pixelated',
                                }}
                            />
                        </div>
                        <p>
                            {source.width} × {source.height} pixels
                        </p>
                        <label>
                            <span>Slice into tile shapes</span>
                            <input type="checkbox" checked={split} onChange={e => setSplit(e.target.checked)} />
                        </label>
                        {split && (
                            <>
                                <label>
                                    Tile width
                                    <select value={tileWidth} onChange={e => setTileWidth(Number(e.target.value))}>
                                        {[8, 16, 32, 64, 128, 256].map(size => (
                                            <option key={size} value={size}>
                                                {size} pixels
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    Tile height
                                    <select value={tileHeight} onChange={e => setTileHeight(Number(e.target.value))}>
                                        {[8, 16, 32, 64, 128, 256].map(size => (
                                            <option key={size} value={size}>
                                                {size} pixels
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <p>
                                    Tiles are read left-to-right, then top-to-bottom. Transparent tiles are kept. All
                                    tile shapes reference regions of one shared image asset.
                                </p>
                            </>
                        )}
                        {result?.value && (
                            <p>
                                {result.value.regions.length} {result.value.regions.length === 1 ? 'image' : 'images'}{' '}
                                will be added using one shared asset in one undo step.
                            </p>
                        )}
                    </>
                )}
                <p role="alert">{error || result?.error}</p>
                <button type="submit" disabled={busy || !result?.value}>
                    Import
                    {result?.value
                        ? ` ${result.value.regions.length} ${result.value.regions.length === 1 ? 'image' : 'images'}`
                        : ''}
                </button>
            </form>
        </EditorDialog>
    );
}
