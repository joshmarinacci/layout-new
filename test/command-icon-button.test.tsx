// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it} from 'vitest';
import {EditorStore} from '../src/model/EditorStore';
import {makeExampleDocument} from '../src/model/exampleDocument';
import {useEditorStore} from '../src/model/useEditorStore';
import {CommandIconButton} from '../src/common/common';
import type {CommandContext} from '../src/commands';

afterEach(cleanup);

function Buttons({store}: {store: EditorStore}) {
    const state = useEditorStore(store);
    const ctx = {store, state} as unknown as CommandContext;
    return (
        <>
            <CommandIconButton commandId="undo" ctx={ctx} />
            <CommandIconButton commandId="redo" ctx={ctx} />
        </>
    );
}

describe('CommandIconButton', () => {
    it('is labelled with its own command title, not always "Undo"', async () => {
        const store = new EditorStore(makeExampleDocument());
        render(<Buttons store={store} />);
        const undo = screen.getByRole('button', {name: 'Undo'});
        const redo = screen.getByRole('button', {name: 'Redo'});
        expect(redo.getAttribute('title')).toBe('Redo');
        expect(undo).toHaveProperty('disabled', true);
        expect(redo).toHaveProperty('disabled', true);

        // Each button runs its own command.
        store.renameShape('rect_1', 'Renamed');
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', {name: 'Undo'}));
        expect(store.getSnapshot().document.shapes.find(shape => shape.id === 'rect_1')?.name).toBe('rect');
        await user.click(screen.getByRole('button', {name: 'Redo'}));
        expect(store.getSnapshot().document.shapes.find(shape => shape.id === 'rect_1')?.name).toBe('Renamed');
    });
});
