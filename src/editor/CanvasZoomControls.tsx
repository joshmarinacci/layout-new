import {useSyncExternalStore} from 'react';
import {Maximize2, Scan, ZoomIn, ZoomOut} from 'lucide-react';
import {IconButton} from '../ui/controls';
import {type CameraStore, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP} from './camera';

/**
 * Zoom buttons for the canvas toolbar. They subscribe to the camera themselves,
 * so pinch and wheel zooming re-render only this group, not the whole app.
 */
export function CanvasZoomControls({
    camera,
    pageId,
    onZoomToFit,
}: {
    camera: CameraStore;
    pageId: string;
    onZoomToFit: () => void;
}) {
    const zoom = useSyncExternalStore(camera.subscribe, () => camera.get(pageId).zoom);
    return (
        <div className="canvas-zoom-controls" role="group" aria-label="Canvas zoom controls">
            <IconButton
                label="Zoom out"
                icon={ZoomOut}
                disabled={zoom <= MIN_ZOOM}
                onClick={() => camera.zoomBy(pageId, 1 / ZOOM_STEP)}
            />
            <span aria-live="polite">{formatZoom(zoom)}</span>
            <IconButton
                label="Zoom in"
                icon={ZoomIn}
                disabled={zoom >= MAX_ZOOM}
                onClick={() => camera.zoomBy(pageId, ZOOM_STEP)}
            />
            <IconButton label="Reset zoom" icon={Maximize2} onClick={() => camera.setZoom(pageId, 1)} />
            <IconButton label="Zoom to fit" icon={Scan} onClick={onZoomToFit} />
        </div>
    );
}

/** 100%, 2.5%, 6400%: whole percentages except below 10%, where tenths still matter. */
export const formatZoom = (zoom: number) => {
    const percent = zoom * 100;
    return `${percent < 10 ? Math.round(percent * 10) / 10 : Math.round(percent)}%`;
};
