// @vitest-environment happy-dom
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import PropSheet from '../src/common/PropSheet';
import TreeView from '../src/common/TreeView';
import {EditorStore} from '../src/model/EditorStore';
import {makeExampleDocument} from '../src/model/exampleDocument';
import {Toolbar} from '../src/ui/Toolbar';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('document properties', () => {
    it('shows the title, contents and fonts when the document is selected', () => {
        const store = new EditorStore(makeExampleDocument());
        render(<PropSheet store={store} documentSelected onAddGoogleFont={vi.fn()} />);
        expect((screen.getByRole('textbox', {name: 'Title'}) as HTMLInputElement).value).toBe('test doc');
        const stats = Object.fromEntries(
            Array.from(document.querySelectorAll('.prop-stats > div')).map(row => [
                row.querySelector('dt')?.textContent,
                row.querySelector('dd')?.textContent,
            ]),
        );
        expect(stats).toMatchObject({
            Pages: '1',
            Shapes: String(store.getSnapshot().document.shapes.length),
            Fonts: '0',
        });
        expect(screen.getByText('No fonts saved with this document.')).toBeTruthy();
    });

    it('renames the document as one undoable edit', async () => {
        const user = userEvent.setup();
        const store = new EditorStore(makeExampleDocument());
        render(<PropSheet store={store} documentSelected onAddGoogleFont={vi.fn()} />);
        const title = screen.getByRole('textbox', {name: 'Title'});
        await user.clear(title);
        await user.type(title, 'Poster{Enter}');
        expect(store.getSnapshot().document.title).toBe('Poster');
        store.undo();
        expect(store.getSnapshot().document.title).toBe('test doc');
    });

    it('opens the Google Font dialog from the Fonts section', async () => {
        const user = userEvent.setup();
        const onAddGoogleFont = vi.fn();
        render(
            <PropSheet
                store={new EditorStore(makeExampleDocument())}
                documentSelected
                onAddGoogleFont={onAddGoogleFont}
            />,
        );
        await user.click(screen.getByRole('button', {name: 'Add Google Font…'}));
        expect(onAddGoogleFont).toHaveBeenCalledTimes(1);
    });

    it('still prompts for a selection when neither the document nor a shape is selected', () => {
        render(<PropSheet store={new EditorStore(makeExampleDocument())} onAddGoogleFont={vi.fn()} />);
        expect(screen.getByText(/Select an\s+object/)).toBeTruthy();
    });
});

function treeProps() {
    const document = makeExampleDocument();
    return {
        document,
        selectedIds: [],
        selectedAsset: null,
        selectedPageId: document.pages[0].id,
        documentSelected: false,
        onSelectShapes: vi.fn(),
        onSelectAsset: vi.fn(),
        onSelectPalette: vi.fn(),
        onShapeContextMenu: vi.fn(),
        onSelectPage: vi.fn(),
        onDocumentContextMenu: vi.fn(),
        onSelectDocument: vi.fn(),
        onRenameDocument: vi.fn(),
        onRenamePage: vi.fn(),
        onRenameShape: vi.fn(),
        onRenamePalette: vi.fn(),
        onRenameImage: vi.fn(),
        onRenamePhoto: vi.fn(),
        onSelectFont: vi.fn(),
        onSelectPhoto: vi.fn(),
        onPhotoContextMenu: vi.fn(),
        onRenameGroup: vi.fn(),
        onPageContextMenu: vi.fn(),
        onPagesContextMenu: vi.fn(),
        onAssetsContextMenu: vi.fn(),
        onPaletteContextMenu: vi.fn(),
        onReorderPage: vi.fn(),
        onReorderShape: vi.fn(),
    };
}

describe('renameable folders', () => {
    const page = () => screen.getByRole('row', {name: 'Page 1'});

    it('rename on double-click without opening and closing (no flicker)', async () => {
        const user = userEvent.setup();
        render(<TreeView {...treeProps()} />);
        const expandedStates: (string | null)[] = [];
        const observer = new MutationObserver(() => expandedStates.push(page().getAttribute('aria-expanded')));
        observer.observe(page(), {attributes: true, attributeFilter: ['aria-expanded']});
        await user.dblClick(page());
        observer.disconnect();
        expect(screen.getByRole('textbox', {name: 'Rename Page 1'})).toBeTruthy();
        expect(expandedStates).toEqual([]);
        expect(screen.getByRole('row', {name: 'rect'})).toBeTruthy();
    });

    it('select on a single click without collapsing, and open and close from the chevron', async () => {
        const user = userEvent.setup();
        const props = treeProps();
        render(<TreeView {...props} selectedIds={['rect_1']} />);
        await user.click(page());
        expect(props.onSelectPage).toHaveBeenCalledWith('page_1');
        expect(page().getAttribute('aria-expanded')).toBe('true');
        await user.click(within(page()).getAllByRole('button')[0]);
        expect(page().getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByRole('row', {name: 'rect'})).toBeNull();
    });
});

describe('Toolbar', () => {
    function renderToolbar() {
        render(
            <>
                <button>Before</button>
                <Toolbar label="Canvas tools">
                    <button>Zoom out</button>
                    <button disabled>Zoom in</button>
                    <button>Reset</button>
                    <button>Delete</button>
                </Toolbar>
                <button>After</button>
            </>,
        );
    }
    const focused = () => document.activeElement?.textContent;

    it('is a single Tab stop', async () => {
        const user = userEvent.setup();
        renderToolbar();
        screen.getByRole('button', {name: 'Before'}).focus();
        await user.tab();
        expect(focused()).toBe('Zoom out');
        await user.tab();
        expect(focused()).toBe('After');
    });

    it('moves between enabled buttons with arrows, Home and End, and remembers the last one', async () => {
        const user = userEvent.setup();
        renderToolbar();
        expect(screen.getByRole('toolbar', {name: 'Canvas tools'}).getAttribute('aria-orientation')).toBe('horizontal');
        screen.getByRole('button', {name: 'Zoom out'}).focus();
        await user.keyboard('{ArrowRight}');
        expect(focused()).toBe('Reset');
        await user.keyboard('{End}');
        expect(focused()).toBe('Delete');
        await user.keyboard('{ArrowRight}');
        expect(focused()).toBe('Zoom out');
        await user.keyboard('{ArrowLeft}');
        expect(focused()).toBe('Delete');
        await user.keyboard('{Home}');
        await user.keyboard('{ArrowRight}');
        expect(focused()).toBe('Reset');
        await user.tab();
        await user.tab({shift: true});
        expect(focused()).toBe('Reset');
    });
});
