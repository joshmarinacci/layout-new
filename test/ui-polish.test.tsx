// @vitest-environment happy-dom
import {act, cleanup, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useRef, useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {commandRegistry} from '../src/commands';
import TreeView from '../src/common/TreeView';
import {makeExampleDocument} from '../src/model/exampleDocument';
import {ContextMenu} from '../src/ui/ContextMenu';
import {MenuItem} from '../src/ui/controls';
import {Separator} from '../src/ui/DropdownMenu';
import {NumberInput} from '../src/ui/NumberInput';
import {clampPanelWidth, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH, PanelResizer} from '../src/ui/PanelResizer';
import {DEFAULT_PANEL_WIDTHS, usePanelWidths} from '../src/ui/usePanelWidths';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('shape commands', () => {
    it('use one "New Rectangle" and one "New Circle" command', () => {
        const titles = commandRegistry.getAll().map(command => command.title);
        expect(titles.filter(title => title === 'New Rectangle')).toHaveLength(1);
        expect(titles.filter(title => title === 'New Circle')).toHaveLength(1);
        expect(titles.some(title => title.includes('xx'))).toBe(false);
    });

    it('names the PNG import action "New Image from PNG"', () => {
        expect(commandRegistry.require('import-png').title).toBe('New Image from PNG');
    });
});

describe('ContextMenu', () => {
    it('closes after an enabled item runs, and stays open for disabled items and separators', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn(),
            action = vi.fn();
        render(
            <ContextMenu x={0} y={0} label="Test actions" onClose={onClose}>
                <MenuItem label="Disabled" disabled onAction={action} />
                <Separator />
                <MenuItem label="Run" onAction={action} />
            </ContextMenu>,
        );
        await user.click(screen.getByRole('menuitem', {name: 'Disabled'}));
        await user.click(screen.getByRole('separator'));
        expect(onClose).not.toHaveBeenCalled();
        await user.click(screen.getByRole('menuitem', {name: 'Run'}));
        expect(action).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

function ControlledNumber({
    step,
    shiftStep,
    onChange,
}: {
    step?: number;
    shiftStep?: number;
    onChange: (value: number) => void;
}) {
    const [value, setValue] = useState(1);
    return (
        <NumberInput
            label="Amount"
            value={value}
            step={step}
            shiftStep={shiftStep}
            onChange={next => {
                setValue(next);
                onChange(next);
            }}
        />
    );
}

describe('NumberInput wheel', () => {
    const control = () => screen.getByLabelText('Amount').closest('.number-input-control')!;
    /** Dispatches a real cancelable wheel event and reports whether it was prevented. */
    const wheel = (init: WheelEventInit) => {
        const event = new WheelEvent('wheel', {bubbles: true, cancelable: true, ...init});
        // happy-dom's WheelEvent ignores modifier keys in its init dictionary.
        Object.defineProperty(event, 'shiftKey', {value: init.shiftKey ?? false});
        act(() => {
            control().dispatchEvent(event);
        });
        return event.defaultPrevented;
    };

    it('steps by step on wheel and by shiftStep on shift-wheel, preventing page scroll', () => {
        const onChange = vi.fn();
        render(<ControlledNumber onChange={onChange} />);
        expect(wheel({deltaY: -100})).toBe(true);
        expect(onChange).toHaveBeenLastCalledWith(2);
        // Many platforms report Shift+wheel as horizontal motion.
        expect(wheel({deltaX: -100, deltaY: 0, shiftKey: true})).toBe(true);
        expect(onChange).toHaveBeenLastCalledWith(12);
        wheel({deltaY: 100, shiftKey: true});
        expect(onChange).toHaveBeenLastCalledWith(2);
    });

    it('accumulates fractional steps across rapid wheel events', () => {
        const onChange = vi.fn();
        render(<ControlledNumber step={0.1} shiftStep={1} onChange={onChange} />);
        wheel({deltaY: -1});
        wheel({deltaY: -1});
        wheel({deltaY: -1});
        expect(onChange.mock.calls.map(call => call[0])).toEqual([1.1, 1.2, 1.3]);
    });

    it('ignores horizontal wheel motion without Shift', () => {
        const onChange = vi.fn();
        render(<ControlledNumber onChange={onChange} />);
        expect(wheel({deltaX: -100, deltaY: 0})).toBe(false);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("ends another field's edit session before a step button starts its own", async () => {
        const user = userEvent.setup();
        const events: string[] = [];
        render(
            <>
                <NumberInput
                    label="First"
                    value={1}
                    onChange={() => {}}
                    onFocus={() => events.push('first:focus')}
                    onBlur={() => events.push('first:blur')}
                />
                <NumberInput label="Second" value={1} onChange={() => {}} onFocus={() => events.push('second:focus')} />
            </>,
        );
        await user.click(screen.getByLabelText('First'));
        await user.click(screen.getByRole('button', {name: 'Increase Second'}));
        expect(events).toEqual(['first:focus', 'first:blur', 'second:focus']);
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
        onSelect: vi.fn(),
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
        onUngroup: vi.fn(),
        onRenameGroup: vi.fn(),
        onSelectGroup: vi.fn(),
        onPageContextMenu: vi.fn(),
        onPagesContextMenu: vi.fn(),
        onAssetsContextMenu: vi.fn(),
        onPaletteContextMenu: vi.fn(),
        onReorderPage: vi.fn(),
        onReorderShape: vi.fn(),
    };
}

describe('TreeView', () => {
    it('shows the document as a selectable leaf with Pages and Assets beside it', async () => {
        const user = userEvent.setup();
        const props = treeProps();
        render(<TreeView {...props} />);
        const doc = screen.getByRole('button', {name: /Doc: test doc/});
        expect(doc.hasAttribute('aria-expanded')).toBe(false);
        await user.click(doc);
        expect(props.onSelectDocument).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', {name: /^Pages$/}).getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByRole('button', {name: /^Assets$/})).toBeTruthy();
    });

    it('uses a page icon for pages, with or without shapes', () => {
        const props = treeProps();
        props.document.pages.push({id: 'page_empty', name: 'Empty page', groups: []});
        render(<TreeView {...props} />);
        for (const name of [/Page 1/, /Empty page/]) {
            const icon = screen.getByRole('button', {name}).querySelector('svg');
            expect(icon?.classList.contains('lucide-file-text')).toBe(true);
        }
        const pagesIcon = screen.getByRole('button', {name: /^Pages$/}).querySelector('svg');
        expect(pagesIcon?.classList.contains('lucide-folder')).toBe(true);
    });

    it('fully highlights the open page only when nothing more specific is selected', () => {
        const row = (name: RegExp) => screen.getByRole('button', {name}).closest('.tree-row')!;
        const props = treeProps();
        const {rerender} = render(<TreeView {...props} />);
        expect(row(/Page 1/).classList.contains('selected')).toBe(true);
        expect(row(/Doc: test doc/).classList.contains('selected')).toBe(false);

        // A shape is selected: the page gets the subtle current-page style instead.
        rerender(<TreeView {...props} selectedIds={[props.document.shapes[0].id]} />);
        expect(row(/^rect$/).classList.contains('selected')).toBe(true);
        expect(row(/Page 1/).classList.contains('selected')).toBe(false);
        expect(row(/Page 1/).classList.contains('current')).toBe(true);
        expect(screen.getByRole('button', {name: /Page 1/}).getAttribute('aria-current')).toBe('page');

        // The document row is the selection only once it has been chosen.
        rerender(<TreeView {...props} documentSelected />);
        expect(row(/Doc: test doc/).classList.contains('selected')).toBe(true);
        expect(row(/Page 1/).classList.contains('current')).toBe(true);
    });

    it('opens and closes folders with a single click', async () => {
        const user = userEvent.setup();
        render(<TreeView {...treeProps()} />);
        const pages = screen.getByRole('button', {name: /^Pages$/});
        expect(screen.getByRole('button', {name: /Page 1/})).toBeTruthy();
        await user.click(pages);
        expect(pages.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByRole('button', {name: /Page 1/})).toBeNull();
        await user.click(pages);
        expect(screen.getByRole('button', {name: /Page 1/})).toBeTruthy();
    });

    it('renames items in place on double-click, committing with Enter', async () => {
        const user = userEvent.setup();
        const props = treeProps();
        render(<TreeView {...props} />);
        await user.dblClick(screen.getByRole('button', {name: /^rect$/}));
        const field = screen.getByRole('textbox', {name: 'Rename rect'});
        await user.clear(field);
        await user.type(field, 'Box{Enter}');
        expect(props.onRenameShape).toHaveBeenCalledWith(props.document.shapes[0].id, 'Box');
        expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('renames the document by its title, and Escape cancels a rename', async () => {
        const user = userEvent.setup();
        const props = treeProps();
        render(<TreeView {...props} />);
        await user.dblClick(screen.getByRole('button', {name: /Doc: test doc/}));
        expect(screen.getByDisplayValue('test doc')).toBeTruthy();
        await user.type(screen.getByRole('textbox'), ' changed{Escape}');
        expect(props.onRenameDocument).not.toHaveBeenCalled();
        expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('starts renaming with F2 and does not rename folders like Pages', async () => {
        const user = userEvent.setup();
        const props = treeProps();
        render(<TreeView {...props} />);
        screen.getByRole('button', {name: /Page 1/}).focus();
        await user.keyboard('{F2}');
        await user.keyboard('{Control>}a{/Control}Cover{Enter}');
        expect(props.onRenamePage).toHaveBeenCalledWith(props.document.pages[0].id, 'Cover');
        await user.dblClick(screen.getByRole('button', {name: /^Pages$/}));
        expect(screen.queryByRole('textbox')).toBeNull();
    });
});

function ResizerHarness({
    side,
    initial,
    onCommit,
}: {
    side: 'left' | 'right';
    initial: number;
    onCommit: (width: number) => void;
}) {
    const target = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(initial);
    return (
        <div ref={target}>
            <PanelResizer
                side={side}
                label="Resize"
                width={width}
                target={target}
                onCommit={next => {
                    setWidth(next);
                    onCommit(next);
                }}
            />
        </div>
    );
}

describe('PanelResizer', () => {
    it('clamps widths to the allowed range', () => {
        expect(clampPanelWidth(10)).toBe(PANEL_MIN_WIDTH);
        expect(clampPanelWidth(5000)).toBe(PANEL_MAX_WIDTH);
        expect(clampPanelWidth(300.4)).toBe(300);
    });

    it('resizes with arrow keys toward and away from the canvas', async () => {
        const user = userEvent.setup();
        const left = vi.fn(),
            right = vi.fn();
        render(
            <>
                <ResizerHarness side="left" initial={220} onCommit={left} />
                <ResizerHarness side="right" initial={280} onCommit={right} />
            </>,
        );
        const [leftHandle, rightHandle] = screen.getAllByRole('separator');
        leftHandle.focus();
        await user.keyboard('{ArrowRight}{Shift>}{ArrowRight}{/Shift}{ArrowLeft}');
        expect(left.mock.calls.map(call => call[0])).toEqual([230, 280, 270]);
        expect(leftHandle.getAttribute('aria-valuenow')).toBe('270');
        rightHandle.focus();
        await user.keyboard('{ArrowLeft}');
        expect(right).toHaveBeenLastCalledWith(290);
    });
});

function WidthsProbe() {
    const [widths, setWidth] = usePanelWidths();
    return (
        <button onClick={() => setWidth('left', 999)}>
            {widths.left}/{widths.right}
        </button>
    );
}

describe('usePanelWidths', () => {
    beforeEach(() => localStorage.clear());

    it('defaults, persists clamped widths, and reloads them', async () => {
        const user = userEvent.setup();
        const {unmount} = render(<WidthsProbe />);
        expect(screen.getByRole('button').textContent).toBe(
            `${DEFAULT_PANEL_WIDTHS.left}/${DEFAULT_PANEL_WIDTHS.right}`,
        );
        await user.click(screen.getByRole('button'));
        expect(screen.getByRole('button').textContent).toBe(`${PANEL_MAX_WIDTH}/${DEFAULT_PANEL_WIDTHS.right}`);
        unmount();
        render(<WidthsProbe />);
        expect(screen.getByRole('button').textContent).toBe(`${PANEL_MAX_WIDTH}/${DEFAULT_PANEL_WIDTHS.right}`);
    });

    it('falls back to defaults when stored data is invalid', () => {
        localStorage.setItem('layout-new:panel-widths:v1', '{"left":"wide"}');
        render(<WidthsProbe />);
        expect(screen.getByRole('button').textContent).toBe(
            `${DEFAULT_PANEL_WIDTHS.left}/${DEFAULT_PANEL_WIDTHS.right}`,
        );
    });
});
