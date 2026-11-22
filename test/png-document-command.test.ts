import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorStore, emptyDocument} from '../src/model/EditorStore';

const mocks = vi.hoisted(() => ({
    download: vi.fn(),
    render: vi.fn(() => new Uint8Array([1])),
    encode: vi.fn(() => new Uint8Array([2])),
}));
vi.mock('../src/io/pngDocument', async importOriginal => ({
    ...(await importOriginal<typeof import('../src/io/pngDocument')>()),
    downloadDocumentPng: mocks.download,
    renderDocumentPreview: mocks.render,
    encodeDocumentPng: mocks.encode,
}));

describe('Save as JSON PNG command', () => {
    beforeEach(() => mocks.download.mockClear());
    it('downloads a PNG document with the .json.png extension', async () => {
        const {SavePngDocumentCommand} = await import('../src/commands');
        const store = new EditorStore({...emptyDocument(), title: 'My drawing'});
        const state = store.getSnapshot();
        const setError = vi.fn();
        SavePngDocumentCommand.run({
            store,
            state,
            finishEditing: vi.fn(),
            workspace: {tabs: [], activeId: ''},
            setWorkspace: vi.fn(),
            clipboard: {shapes: [], images: [], fonts: []},
            setClipboard: vi.fn(),
            commandPaletteOpen: false,
            setCommandPaletteOpen: vi.fn(),
            setKeyboardShortcutsOpen: vi.fn(),
            setSavedDocumentsOpen: vi.fn(),
            leftPanelVisible: true,
            setLeftPanelVisible: vi.fn(),
            rightPanelVisible: true,
            setRightPanelVisible: vi.fn(),
            setRenamePageDialog: vi.fn(),
            setRenameDocumentName: vi.fn(),
            setImageDialog: vi.fn(),
            setRepeatingImageDialog: vi.fn(),
            setVectorId: vi.fn(),
            setPixelEditor: vi.fn(),
            setError,
            setFileDialogOpen: vi.fn(),
            setTheme: vi.fn(),
            setThemeSettingsOpen: vi.fn(),
            setSelectedAssetId: vi.fn(),
            setSelectedPaletteId: vi.fn(),
            openPaletteImport: vi.fn(),
        });
        await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledOnce());
        expect(mocks.download).toHaveBeenCalledOnce();
        expect(mocks.download.mock.calls[0][1]).toBe('My drawing.json.png');
        expect(mocks.download.mock.calls[0][0]).toEqual(new Uint8Array([2]));
        expect(mocks.render).toHaveBeenCalledWith(state.document);
        expect(mocks.encode).toHaveBeenCalledWith(new Uint8Array([1]), state.document);
        expect(setError).toHaveBeenCalledWith('');
    });
});
