import {describe, expect, it} from 'vitest';
import {EditorStore} from '../src/model/EditorStore';
import type {CommandContext} from '../src/commands';
import {NewPico8PaletteCommand} from '../src/commands';

function context() {
    const store = new EditorStore();
    return {
        store,
        state: store.getSnapshot(),
        setSelectedAssetId: () => {},
        setSelectedPaletteId: () => {},
    } as unknown as CommandContext;
}

describe('palette creation commands', () => {
    it('adds the PICO-8 palette through an Immer edit', () => {
        const ctx = context();
        expect(() => NewPico8PaletteCommand.run(ctx)).not.toThrow();
        expect(ctx.store.getSnapshot().document.palettes[0]).toMatchObject({
            name: 'PICO-8',
            colors: expect.arrayContaining([expect.objectContaining({value: '#1d2b53'})]),
        });
    });
});
