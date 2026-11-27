// @vitest-environment happy-dom
import {cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DocumentSettingsDialog} from '../src/common/DocumentSettingsDialog';
import {EditorStore} from '../src/model/EditorStore';
import {makeExampleDocument} from '../src/model/exampleDocument';
import {DEFAULT_GRID} from '../src/model/grid';
import {commandRegistry, makeTab, type CommandContext, type Workspace} from '../src/commands';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const setup = () => {
    const user = userEvent.setup();
    const store = new EditorStore(makeExampleDocument());
    const onClose = vi.fn();
    const view = render(<DocumentSettingsDialog store={store} onClose={onClose} />);
    return {user, store, onClose, view};
};
const grid = (store: EditorStore) => store.getSnapshot().document.settings.grid;

describe('document settings dialog', () => {
    it('shows the document grid and applies changes while open', async () => {
        const {user, store} = setup();
        const size = screen.getByRole('spinbutton', {name: 'Document grid size'}) as HTMLInputElement;
        expect(size.value).toBe('10');
        expect((screen.getByRole('combobox', {name: 'Document grid style'}) as HTMLSelectElement).value).toBe('lines');
        await user.selectOptions(screen.getByRole('combobox', {name: 'Document grid style'}), 'dots');
        await user.clear(size);
        await user.type(size, '24');
        expect(grid(store)).toEqual({size: 24, style: 'dots'});
        expect(store.getSnapshot().transactionActive).toBe(true);
    });

    it('keeps the changes as one undo step when Done is pressed', async () => {
        const {user, store, onClose} = setup();
        await user.selectOptions(screen.getByRole('combobox', {name: 'Document grid style'}), 'hidden');
        const size = screen.getByRole('spinbutton', {name: 'Document grid size'});
        await user.clear(size);
        await user.type(size, '5');
        await user.click(screen.getByRole('button', {name: 'Done'}));
        expect(onClose).toHaveBeenCalled();
        expect(store.getSnapshot().transactionActive).toBe(false);
        expect(grid(store)).toEqual({size: 5, style: 'hidden'});
        store.undo();
        expect(grid(store)).toEqual(DEFAULT_GRID);
    });

    it('puts everything back when cancelled', async () => {
        const {user, store, onClose, view} = setup();
        await user.selectOptions(screen.getByRole('combobox', {name: 'Document grid style'}), 'dots');
        await user.click(screen.getByRole('button', {name: 'Cancel'}));
        expect(onClose).toHaveBeenCalled();
        view.unmount();
        expect(grid(store)).toEqual(DEFAULT_GRID);
        expect(store.getSnapshot().transactionActive).toBe(false);
        expect(store.getSnapshot().canUndo).toBe(false);
    });

    it('ignores sizes outside the allowed range', async () => {
        const {user, store} = setup();
        const size = screen.getByRole('spinbutton', {name: 'Document grid size'});
        await user.clear(size);
        await user.type(size, '0');
        expect(grid(store).size).toBe(10);
    });

    it('overrides the grid for the current page', async () => {
        const {user, store} = setup();
        expect(screen.queryByRole('spinbutton', {name: 'Page grid size'})).toBeNull();
        await user.click(screen.getByRole('checkbox', {name: 'Use a different grid on this page'}));
        const pageSize = screen.getByRole('spinbutton', {name: 'Page grid size'}) as HTMLInputElement;
        expect(pageSize.value).toBe('10');
        await user.clear(pageSize);
        await user.type(pageSize, '40');
        await user.selectOptions(screen.getByRole('combobox', {name: 'Page grid style'}), 'dots');
        expect(store.getSnapshot().document.pages[0].grid).toEqual({size: 40, style: 'dots'});
        expect(grid(store)).toEqual(DEFAULT_GRID);
        await user.click(screen.getByRole('checkbox', {name: 'Use a different grid on this page'}));
        expect(store.getSnapshot().document.pages[0].grid).toBeUndefined();
    });
});

describe('grid commands', () => {
    const context = (workspace: Workspace) => {
        let current = workspace;
        const ctx = {
            state: workspace.tabs[0].store.getSnapshot(),
            setWorkspace: (next: Workspace | ((w: Workspace) => Workspace)) => {
                current = typeof next === 'function' ? next(current) : next;
            },
            setDocumentSettingsOpen: vi.fn(),
        } as unknown as CommandContext;
        return {ctx, get: () => current};
    };

    it('toggles the grid for the active tab only, starting off', () => {
        const first = makeTab(makeExampleDocument());
        const second = makeTab(makeExampleDocument());
        expect(first.gridEnabled).toBe(false);
        const {ctx, get} = context({tabs: [first, second], activeId: second.id});
        const toggle = commandRegistry.require('ui-toggle-grid');
        toggle.run(ctx);
        expect(get().tabs.map(tab => tab.gridEnabled)).toEqual([false, true]);
        toggle.run(ctx);
        expect(get().tabs.map(tab => tab.gridEnabled)).toEqual([false, false]);
    });

    it('opens the document settings unless an edit is in progress', () => {
        const tab = makeTab(makeExampleDocument());
        const {ctx} = context({tabs: [tab], activeId: tab.id});
        const settings = commandRegistry.require('document-settings');
        expect(settings.enabled(ctx)).toBe(true);
        settings.run(ctx);
        expect(ctx.setDocumentSettingsOpen).toHaveBeenCalledWith(true);
        tab.store.beginTransaction('drag');
        expect(settings.enabled({...ctx, state: tab.store.getSnapshot()})).toBe(false);
    });
});
