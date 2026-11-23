// @vitest-environment happy-dom
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {clearMocks, mockIPC} from '@tauri-apps/api/mocks';
import type {InvokeArgs} from '@tauri-apps/api/core';
import type {CommandContext} from '../src/commands';
import {ImportSVGCommand, OpenPngDocumentCommand} from '../src/commands';
import {EditorStore, emptyDocument} from '../src/model/EditorStore';
import {readSavedDocuments, writeSavedDocuments, type SavedDocumentRecord} from '../src/io/savedDocuments';
import {serializeDocument} from '../src/io/serialization';
import {encodeDocumentPng, saveDocumentPngWithTauri} from '../src/io/pngDocument';

// The desktop build talks to Rust over Tauri's IPC bridge instead of using
// localStorage and <input type=file>. mockIPC stands in for the Rust side, so
// these tests drive the same frontend code paths the desktop app takes.

type Handler = (cmd: string, payload?: InvokeArgs) => unknown;
let calls: {cmd: string; payload?: InvokeArgs}[] = [];

function mockTauri(handler: Handler) {
    calls = [];
    mockIPC((cmd, payload) => {
        calls.push({cmd, payload});
        return handler(cmd, payload);
    });
    // isTauri() reads this flag, which the real webview injects.
    (globalThis as {isTauri?: boolean}).isTauri = true;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
    clearMocks();
    delete (globalThis as {isTauri?: boolean}).isTauri;
});

const record = (id: string, title: string): SavedDocumentRecord => ({
    id,
    name: title,
    savedAt: '2026-11-22T10:00:00.000Z',
    json: serializeDocument({...emptyDocument(), title}),
});

describe('saved documents in the desktop app', () => {
    it('reads through the read_saved_documents command instead of localStorage', async () => {
        localStorage.setItem('layout-new:saved-documents:v1', JSON.stringify([record('web', 'Browser copy')]));
        mockTauri(cmd => (cmd === 'read_saved_documents' ? [record('a', 'Desktop doc')] : undefined));

        const records = await readSavedDocuments();

        expect(records.map(item => item.name)).toEqual(['Desktop doc']);
        expect(calls).toEqual([{cmd: 'read_saved_documents', payload: {}}]);
    });

    it('writes through write_saved_documents with the records argument Rust expects', async () => {
        mockTauri(() => null);
        const records = [record('a', 'One'), record('b', 'Two')];

        await writeSavedDocuments(records);

        expect(calls).toEqual([{cmd: 'write_saved_documents', payload: {records}}]);
        expect(localStorage.length).toBe(0);
    });

    it('rejects malformed records returned from the Rust side', async () => {
        mockTauri(() => [{id: 'a', name: 'Missing fields'}]);
        await expect(readSavedDocuments()).rejects.toThrow('Saved documents storage is invalid');
    });

    it('surfaces Rust errors to the caller', async () => {
        mockTauri(() => {
            throw new Error('Permission denied (os error 13)');
        });
        await expect(writeSavedDocuments([])).rejects.toThrow('Permission denied');
    });
});

function commandContext(store: EditorStore, overrides: Partial<CommandContext> = {}): CommandContext {
    return {
        store,
        state: store.getSnapshot(),
        finishEditing: vi.fn(),
        workspace: {tabs: [], activeId: ''},
        setWorkspace: vi.fn(),
        clipboard: {shapes: [], images: [], fonts: [], photos: []},
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
        setError: vi.fn(),
        setFileDialogOpen: vi.fn(),
        setTheme: vi.fn(),
        setThemeSettingsOpen: vi.fn(),
        setSelectedAssetId: vi.fn(),
        setSelectedPaletteId: vi.fn(),
        openPaletteImport: vi.fn(),
        ...overrides,
    };
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 0 L10 10 Z"/></svg>';

describe('file commands in the desktop app', () => {
    it('imports an SVG chosen in the native open dialog', async () => {
        mockTauri(cmd => {
            if (cmd === 'plugin:dialog|open') return '/Users/someone/Art/Logo Mark.svg';
            if (cmd === 'plugin:fs|read_text_file') return [...new TextEncoder().encode(SVG)];
        });
        const store = new EditorStore(emptyDocument());
        const setError = vi.fn();
        const setFileDialogOpen = vi.fn();
        const before = store.getSnapshot().document.shapes.length;

        ImportSVGCommand.run(commandContext(store, {setError, setFileDialogOpen}));

        await vi.waitFor(() => expect(setError).toHaveBeenCalled());
        expect(setFileDialogOpen).not.toHaveBeenCalled();
        expect(calls.map(call => call.cmd)).toEqual(['plugin:dialog|open', 'plugin:fs|read_text_file']);
        expect(calls[1].payload).toMatchObject({path: '/Users/someone/Art/Logo Mark.svg'});
        expect(store.getSnapshot().document.shapes.length).toBeGreaterThan(before);
        expect(setError).toHaveBeenCalledWith('');
    });

    it('does nothing when the native open dialog is cancelled', async () => {
        mockTauri(cmd => (cmd === 'plugin:dialog|open' ? null : undefined));
        const store = new EditorStore(emptyDocument());
        const setError = vi.fn();

        ImportSVGCommand.run(commandContext(store, {setError}));

        await vi.waitFor(() => expect(calls).toHaveLength(1));
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(calls.map(call => call.cmd)).toEqual(['plugin:dialog|open']);
        expect(setError).not.toHaveBeenCalled();
    });

    it('reports a failed file read instead of throwing', async () => {
        mockTauri(cmd => {
            if (cmd === 'plugin:dialog|open') return '/tmp/broken.svg';
            throw new Error('forbidden path: /tmp/broken.svg');
        });
        const setError = vi.fn();

        ImportSVGCommand.run(commandContext(new EditorStore(emptyDocument()), {setError}));

        await vi.waitFor(() => expect(setError).toHaveBeenCalledWith('forbidden path: /tmp/broken.svg'));
    });

    it('opens a document PNG chosen in the native dialog', async () => {
        const saved = {...emptyDocument(), title: 'From disk'};
        const thumbnail = new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures/terrain.png')));
        const png = encodeDocumentPng(thumbnail, saved);
        mockTauri(cmd => {
            if (cmd === 'plugin:dialog|open') return 'C:\\Drawings\\From disk.json.png';
            if (cmd === 'plugin:fs|read_file') return [...png];
        });
        const setWorkspace = vi.fn();
        const setError = vi.fn();

        OpenPngDocumentCommand.run(commandContext(new EditorStore(emptyDocument()), {setWorkspace, setError}));

        await vi.waitFor(() => expect(setError).toHaveBeenCalledWith(''));
        expect(calls.map(call => call.cmd)).toEqual(['plugin:dialog|open', 'plugin:fs|read_file']);
        expect(setWorkspace).toHaveBeenCalled();
    });

    it('saves a document PNG to the path picked in the native save dialog', async () => {
        mockTauri(cmd => (cmd === 'plugin:dialog|save' ? '/Users/someone/Drawing.json.png' : null));
        const bytes = new Uint8Array([1, 2, 3, 4]);

        await saveDocumentPngWithTauri(bytes, 'Drawing.json.png');

        expect(calls[0]).toMatchObject({
            cmd: 'plugin:dialog|save',
            payload: {options: {defaultPath: 'Drawing.json.png'}},
        });
        expect(calls[1].cmd).toBe('plugin:fs|write_file');
        expect(new Uint8Array(calls[1].payload as Uint8Array)).toEqual(bytes);
    });
});
