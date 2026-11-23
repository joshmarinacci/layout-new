import {type ReactNode, useEffect, useRef} from 'react';
import type {EditorStore} from '../model/EditorStore';
import {useEditorStore} from '../model/useEditorStore';
import type {ColorPalette, Document, FontAsset, PhotoAsset, PixelImageData} from '../model/types';
import type {AssetSelection} from '../commands';
import {PropertySection} from '../ui/controls';
import {onPhotoDecoded, photoBitmap} from '../shapes/photos';
import {NameField} from './NameField';

export interface AssetActions {
    onPlacePhoto: (photo: PhotoAsset) => void;
    /** Called after an asset is deleted, so the app can clear the selection. */
    onDeleted: () => void;
}

/** The asset an AssetSelection points at, or null if it no longer exists. */
export type ResolvedAsset =
    | {kind: 'image'; asset: PixelImageData}
    | {kind: 'palette'; asset: ColorPalette}
    | {kind: 'font'; asset: FontAsset}
    | {kind: 'photo'; asset: PhotoAsset};

export function resolveAsset(document: Document, selection: AssetSelection): ResolvedAsset | null {
    if (!selection) return null;
    const {kind, id} = selection;
    if (kind === 'image') {
        const asset = document.images.find(item => item.id === id);
        return asset ? {kind, asset} : null;
    }
    if (kind === 'palette') {
        const asset = document.palettes.find(item => item.id === id);
        return asset ? {kind, asset} : null;
    }
    if (kind === 'font') {
        const asset = document.fonts.find(item => item.id === id);
        return asset ? {kind, asset} : null;
    }
    const asset = document.photos.find(item => item.id === id);
    return asset ? {kind, asset} : null;
}

/** How many shapes use an asset. Palettes are not referenced by shapes. */
export function assetUses(document: Document, resolved: ResolvedAsset): number | null {
    const {kind, asset} = resolved;
    if (kind === 'palette') return null;
    return document.shapes.filter(shape => {
        if (kind === 'image')
            return (
                (shape.type === 'pixel-image' || shape.type === 'repeating-image') &&
                shape.components.image.imageId === asset.id
            );
        if (kind === 'font') return shape.type === 'text' && shape.components.text.fontId === asset.id;
        return shape.type === 'photo' && shape.components.photo.photoId === asset.id;
    }).length;
}

export const formatBytes = (bytes: number) =>
    bytes < 1024
        ? `${bytes} B`
        : bytes < 1024 * 1024
          ? `${Math.round(bytes / 1024)} KB`
          : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Decoded size of base64 data, without decoding it. */
export const base64Bytes = (data: string) => Math.floor((data.length * 3) / 4) - (data.match(/=+$/)?.[0].length ?? 0);

const KIND_LABELS = {image: 'Pixel image', palette: 'Color palette', font: 'Google Font', photo: 'Image'} as const;

function Detail({label, children}: {label: string; children: ReactNode}) {
    return (
        <div className="asset-detail">
            <dt>{label}</dt>
            <dd>{children}</dd>
        </div>
    );
}

/** The Properties panel for the asset selected in the Assets tree. */
export function AssetProperties({
    store,
    selection,
    actions,
}: {
    store: EditorStore;
    selection: AssetSelection;
    actions: AssetActions;
}) {
    const state = useEditorStore(store);
    const resolved = resolveAsset(state.document, selection);
    if (!resolved) return <div className="prop-sheet empty-state">This asset no longer exists.</div>;
    const uses = assetUses(state.document, resolved);
    const usesText = uses === null ? null : uses === 0 ? 'Unused' : uses === 1 ? '1 shape' : `${uses} shapes`;
    const busy = state.transactionActive;
    return (
        <div className="prop-sheet asset-properties">
            <PropertySection title="General">
                {resolved.kind === 'font' ? (
                    <dl>
                        <Detail label="Family">{resolved.asset.family}</Detail>
                    </dl>
                ) : (
                    <NameField
                        store={store}
                        label="Asset name"
                        value={resolved.asset.name}
                        rename={name => rename(store, resolved, name)}
                    />
                )}
                <div className="shape-type" title={resolved.asset.id}>
                    {KIND_LABELS[resolved.kind]}
                </div>
            </PropertySection>
            <PropertySection title="Details">
                {resolved.kind === 'photo' && <PhotoThumbnail photo={resolved.asset} />}
                <dl>
                    {resolved.kind === 'image' && (
                        <>
                            <Detail label="Size">
                                {resolved.asset.width} × {resolved.asset.height} px
                            </Detail>
                            <Detail label="Colors">{resolved.asset.palette.length}</Detail>
                            {resolved.asset.originalName && (
                                <Detail label="Imported from">{resolved.asset.originalName}</Detail>
                            )}
                        </>
                    )}
                    {resolved.kind === 'palette' && <Detail label="Colors">{resolved.asset.colors.length}</Detail>}
                    {resolved.kind === 'font' && (
                        <Detail label="Embedded data">{formatBytes(resolved.asset.css.length)}</Detail>
                    )}
                    {resolved.kind === 'photo' && (
                        <>
                            <Detail label="Size">
                                {resolved.asset.width} × {resolved.asset.height} px
                            </Detail>
                            <Detail label="Format">
                                {resolved.asset.mimeType.replace('image/', '').toUpperCase()}
                            </Detail>
                            <Detail label="Stored size">{formatBytes(base64Bytes(resolved.asset.data))}</Detail>
                            {resolved.asset.originalName && (
                                <Detail label="Imported from">{resolved.asset.originalName}</Detail>
                            )}
                        </>
                    )}
                    {usesText && <Detail label="Used by">{usesText}</Detail>}
                </dl>
                <div className="photo-actions">
                    {resolved.kind === 'photo' && (
                        <button disabled={busy} onClick={() => actions.onPlacePhoto(resolved.asset)}>
                            Place on Canvas
                        </button>
                    )}
                    {(resolved.kind === 'photo' || resolved.kind === 'font') && (
                        <button
                            disabled={busy || uses !== 0}
                            title={uses ? 'Remove the shapes that use this asset first' : undefined}
                            onClick={() => {
                                if (resolved.kind === 'photo') store.deletePhoto(resolved.asset.id);
                                else
                                    store.edit('Delete font', draft => {
                                        draft.fonts = draft.fonts.filter(font => font.id !== resolved.asset.id);
                                    });
                                actions.onDeleted();
                            }}
                        >
                            Delete
                        </button>
                    )}
                </div>
            </PropertySection>
        </div>
    );
}

function rename(store: EditorStore, resolved: ResolvedAsset, name: string) {
    if (resolved.kind === 'image') store.renamePixelImage(resolved.asset.id, name);
    else if (resolved.kind === 'photo') store.renamePhoto(resolved.asset.id, name);
    else if (resolved.kind === 'palette')
        store.edit('Rename palette', draft => {
            const palette = draft.palettes.find(item => item.id === resolved.asset.id);
            if (palette) palette.name = name;
        });
}

/** A small preview of a photo, drawn from the shared decoded bitmap. */
function PhotoThumbnail({photo}: {photo: PhotoAsset}) {
    const ref = useRef<HTMLCanvasElement>(null);
    const scale = Math.min(1, 240 / photo.width, 160 / photo.height);
    const width = Math.max(1, Math.round(photo.width * scale));
    const height = Math.max(1, Math.round(photo.height * scale));
    useEffect(() => {
        const draw = () => {
            const canvas = ref.current;
            const bitmap = photoBitmap(photo);
            const ctx = canvas?.getContext('2d');
            if (!canvas || !ctx || !bitmap) return;
            canvas.width = width * devicePixelRatio;
            canvas.height = height * devicePixelRatio;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        };
        draw();
        return onPhotoDecoded(draw);
    }, [photo, width, height]);
    return (
        <canvas
            ref={ref}
            className="asset-thumbnail"
            role="img"
            aria-label={`Preview of ${photo.name}`}
            style={{width, height}}
        />
    );
}
