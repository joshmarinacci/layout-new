import {invoke} from '@tauri-apps/api/core';

/**
 * Native menu items whose shortcuts are also the standard text-editing shortcuts
 * (⌘Z, ⇧⌘Z, ⌘X, ⌘C, ⌘V, ⌘A), and the text edit each stands for. The desktop app's
 * menu takes these keys before the web view sees them, so while a text field has
 * focus the app hands them back to it instead of running the shape command.
 */
const TEXT_EDITS: Readonly<Record<string, string>> = {
    undo: 'undo',
    redo: 'redo',
    'selection-cut': 'cut',
    'selection-copy': 'copy',
    'selection-paste': 'paste',
    'select-all': 'selectAll',
};

const NON_TEXT_INPUTS = new Set([
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
]);

/** Whether `element` takes typed text, so edit shortcuts belong to it rather than to the canvas. */
export function isTextEditingTarget(element: Element | null): boolean {
    if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
    if (element instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(element.type) && !element.disabled;
    return element instanceof HTMLElement && element.isContentEditable;
}

/** The text edit a native menu item stands for while `focused` is a text field, if any. */
export function textEditFor(menuId: string, focused: Element | null): string | null {
    const edit = TEXT_EDITS[menuId];
    return edit && isTextEditingTarget(focused) ? edit : null;
}

/** Performs the edit in the focused text field, as the standard macOS Edit menu would. */
export const performNativeTextEdit = (action: string) => invoke('native_text_edit', {action});
