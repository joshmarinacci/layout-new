// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from 'vitest';
import {clearMocks, mockIPC} from '@tauri-apps/api/mocks';
import {isTextEditingTarget, performNativeTextEdit, textEditFor} from '../src/common/nativeTextEdit';

const element = (html: string) => {
    document.body.innerHTML = html;
    return document.body.firstElementChild;
};

afterEach(() => {
    clearMocks();
    document.body.innerHTML = '';
});

describe('native menu shortcuts in text fields', () => {
    it('treats text inputs, text areas and editable content as text fields', () => {
        for (const html of [
            '<input>',
            '<input type="text">',
            '<input type="number">',
            '<input type="search">',
            '<textarea></textarea>',
            '<div contenteditable="true"></div>',
        ])
            expect(isTextEditingTarget(element(html)), html).toBe(true);
    });

    it('leaves other controls and the canvas to the shape commands', () => {
        for (const html of [
            '<input type="checkbox">',
            '<input type="range">',
            '<input disabled>',
            '<textarea readonly></textarea>',
            '<button>Go</button>',
            '<canvas></canvas>',
        ])
            expect(isTextEditingTarget(element(html)), html).toBe(false);
        expect(isTextEditingTarget(null)).toBe(false);
    });

    it('maps the edit menu items to text edits only while a text field has focus', () => {
        const input = element('<input>');
        expect(textEditFor('undo', input)).toBe('undo');
        expect(textEditFor('redo', input)).toBe('redo');
        expect(textEditFor('selection-cut', input)).toBe('cut');
        expect(textEditFor('selection-copy', input)).toBe('copy');
        expect(textEditFor('selection-paste', input)).toBe('paste');
        expect(textEditFor('select-all', input)).toBe('selectAll');
        expect(textEditFor('selection-duplicate', input)).toBeNull();
        expect(textEditFor('selection-copy', element('<canvas></canvas>'))).toBeNull();
    });

    it('asks Rust to perform the edit', async () => {
        const calls: unknown[] = [];
        mockIPC((cmd, payload) => {
            calls.push({cmd, payload});
        });
        await performNativeTextEdit('paste');
        expect(calls).toEqual([{cmd: 'native_text_edit', payload: {action: 'paste'}}]);
    });
});
