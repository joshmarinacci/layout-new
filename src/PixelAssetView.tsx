import {useRef, useState} from 'react';
import type {EditorStore} from './EditorStore';
import type {PixelImageData} from './types';
import {drawPixelImage} from './pixelImages';
import {NameField} from './NameField';

export function PixelAssetView({store, image, onBack}: {store: EditorStore; image: PixelImageData; onBack: () => void}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [error, setError] = useState('');
    const [zoom, setZoom] = useState(4);
    const draw = (canvas: HTMLCanvasElement | null) => {
        if (!canvas) return;
        canvasRef.current = canvas;
        canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (context) drawPixelImage(context, image);
    };
    const exportPng = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.toBlob(blob => {
            if (!blob) { setError('The PNG could not be created.'); return; }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = image.originalName || `${image.name || 'image'}.png`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setError('');
        }, 'image/png');
    };
    return <section className="asset-view" aria-label={`Asset ${image.name}`}>
        <header className="asset-view-header">
            <button onClick={onBack}>Back to canvas</button>
            <NameField store={store} label="Asset name" value={image.name}
                rename={name => store.renamePixelImage(image.id, name)}/>
            <button onClick={exportPng}>Export PNG</button>
        </header>
        <p>{image.width} × {image.height} pixels · {image.palette.length} colors</p>
        <p>Original file: {image.originalName ?? 'Created in editor'}</p>
        <div className="asset-zoom-controls" role="group" aria-label="Asset zoom controls">
            <button aria-label="Zoom out" title="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value / 2))}>−</button>
            <span aria-live="polite">{zoom}×</span>
            <button aria-label="Zoom in" title="Zoom in" disabled={zoom >= 32} onClick={() => setZoom(value => Math.min(32, value * 2))}>+</button>
            <button onClick={() => setZoom(4)}>Reset</button>
        </div>
        <div className="asset-preview-scroll">
            <canvas ref={draw} className="asset-preview checkerboard"
                style={{width: image.width * zoom, height: image.height * zoom}}
                aria-label={`Full image ${image.width} by ${image.height} pixels at ${zoom} times zoom`}/>
        </div>
        {error && <p role="alert">{error}</p>}
    </section>;
}
