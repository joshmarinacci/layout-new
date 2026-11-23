// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AssetProperties, assetUses, base64Bytes, formatBytes, resolveAsset} from '../src/common/AssetProperties';
import {EditorStore, emptyDocument} from '../src/model/EditorStore';
import type {Document, FontAsset, PhotoAsset} from '../src/model/types';
import {makeText} from '../src/model/reducer';
import {newPalette} from '../src/shapes/palettes';

afterEach(cleanup);

const photo: PhotoAsset = {
    id: 'photo-1',
    name: 'Beach',
    originalName: 'beach.jpg',
    mimeType: 'image/jpeg',
    width: 400,
    height: 300,
    data: btoa('x'.repeat(3000)),
};
const font: FontAsset = {id: 'font-1', family: 'Lobster', css: '@font-face{font-family:Lobster}'};

function setup() {
    const store = new EditorStore({...emptyDocument(), fonts: [font], palettes: [newPalette('Brand')]} as Document);
    store.addPhotoShape(photo, {x: 0, y: 0, width: 40, height: 30});
    store.createPixelImage(16, 8, ['#000000', '#ffffff']);
    const pixelImage = store.getSnapshot().document.images[0];
    const actions = {onPlacePhoto: vi.fn(), onDeleted: vi.fn()};
    return {store, actions, pixelImage, palette: store.getSnapshot().document.palettes[0]};
}

describe('asset lookups', () => {
    it('resolves selections and counts the shapes that use each asset', () => {
        const {store, pixelImage, palette} = setup();
        const doc = store.getSnapshot().document;
        expect(resolveAsset(doc, null)).toBeNull();
        expect(resolveAsset(doc, {kind: 'photo', id: 'missing'})).toBeNull();
        expect(assetUses(doc, resolveAsset(doc, {kind: 'photo', id: 'photo-1'})!)).toBe(1);
        expect(assetUses(doc, resolveAsset(doc, {kind: 'image', id: pixelImage.id})!)).toBe(1);
        expect(assetUses(doc, resolveAsset(doc, {kind: 'font', id: 'font-1'})!)).toBe(0);
        expect(assetUses(doc, resolveAsset(doc, {kind: 'palette', id: palette.id})!)).toBeNull();
    });

    it('reports stored sizes', () => {
        expect(base64Bytes(btoa('abcd'))).toBe(4);
        expect(base64Bytes(btoa('abcde'))).toBe(5);
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(3000)).toBe('3 KB');
        expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    });
});

describe('asset properties panel', () => {
    it('shows and renames a photo, and places another copy', async () => {
        const {store, actions} = setup();
        render(<AssetProperties store={store} selection={{kind: 'photo', id: 'photo-1'}} actions={actions} />);
        expect(screen.getByText('400 × 300 px')).toBeTruthy();
        expect(screen.getByText('JPEG')).toBeTruthy();
        expect(screen.getByText('3 KB')).toBeTruthy();
        expect(screen.getByText('beach.jpg')).toBeTruthy();
        expect(screen.getByText('1 shape')).toBeTruthy();
        expect(screen.getByRole('img', {name: 'Preview of Beach'})).toBeTruthy();
        expect((screen.getByRole('button', {name: 'Delete'}) as HTMLButtonElement).disabled).toBe(true);

        const user = userEvent.setup();
        const name = screen.getByRole('textbox', {name: 'Asset name'});
        await user.clear(name);
        await user.type(name, 'Sunset');
        await user.tab();
        expect(store.getSnapshot().document.photos[0].name).toBe('Sunset');
        expect(store.getSnapshot().canUndo).toBe(true);

        await user.click(screen.getByRole('button', {name: 'Place on Canvas'}));
        expect(actions.onPlacePhoto).toHaveBeenCalledWith(expect.objectContaining({id: 'photo-1'}));
    });

    it('shows a font and deletes it while no text uses it', async () => {
        const {store, actions} = setup();
        render(<AssetProperties store={store} selection={{kind: 'font', id: 'font-1'}} actions={actions} />);
        expect(screen.getByText('Lobster')).toBeTruthy();
        expect(screen.getByText('Google Font')).toBeTruthy();
        expect(screen.getByText('Unused')).toBeTruthy();
        expect(screen.queryByRole('textbox', {name: 'Asset name'})).toBeNull();
        await userEvent.setup().click(screen.getByRole('button', {name: 'Delete'}));
        expect(store.getSnapshot().document.fonts).toEqual([]);
        expect(actions.onDeleted).toHaveBeenCalled();
    });

    it('will not delete a font that text uses', () => {
        const {store, actions} = setup();
        const text = makeText('Hello', {x: 0, y: 0, width: 100, height: 40});
        text.components.text.fontId = 'font-1';
        store.addShape(text);
        render(<AssetProperties store={store} selection={{kind: 'font', id: 'font-1'}} actions={actions} />);
        expect(screen.getByText('1 shape')).toBeTruthy();
        expect((screen.getByRole('button', {name: 'Delete'}) as HTMLButtonElement).disabled).toBe(true);
    });

    it('shows and renames pixel images and palettes', async () => {
        const {store, actions, pixelImage, palette} = setup();
        const user = userEvent.setup();
        const {unmount} = render(
            <AssetProperties store={store} selection={{kind: 'image', id: pixelImage.id}} actions={actions} />,
        );
        expect(screen.getByText('16 × 8 px')).toBeTruthy();
        expect(screen.getByText('Pixel image')).toBeTruthy();
        await user.clear(screen.getByRole('textbox', {name: 'Asset name'}));
        await user.type(screen.getByRole('textbox', {name: 'Asset name'}), 'Sprite');
        await user.tab();
        expect(store.getSnapshot().document.images[0].name).toBe('Sprite');
        unmount();

        render(<AssetProperties store={store} selection={{kind: 'palette', id: palette.id}} actions={actions} />);
        expect(screen.getByText('Color palette')).toBeTruthy();
        expect(screen.getByText(String(palette.colors.length))).toBeTruthy();
        await user.clear(screen.getByRole('textbox', {name: 'Asset name'}));
        await user.type(screen.getByRole('textbox', {name: 'Asset name'}), 'Logo colors');
        await user.tab();
        expect(store.getSnapshot().document.palettes[0].name).toBe('Logo colors');
        expect(screen.queryByRole('button', {name: 'Delete'})).toBeNull();
    });

    it('says when the asset is gone', () => {
        const {store, actions} = setup();
        render(<AssetProperties store={store} selection={{kind: 'photo', id: 'gone'}} actions={actions} />);
        expect(screen.getByText('This asset no longer exists.')).toBeTruthy();
    });
});
