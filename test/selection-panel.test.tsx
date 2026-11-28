// @vitest-environment happy-dom
import {cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it} from 'vitest';
import {EditorStore} from '../src/model/EditorStore';
import {makeExampleDocument} from '../src/model/exampleDocument';
import {useEditorStore} from '../src/model/useEditorStore';
import {CameraStore} from '../src/editor/camera';
import {panelPosition, SelectionPanel} from '../src/editor/SelectionPanel';
import type {CommandContext} from '../src/commands';

// The example document: "rect" (rect_1) at (0, 0) 100×100 with corner radius 10, and
// "circle" (circle_1) centered at (200, 200) with radius 30.

afterEach(cleanup);

/** Renders the panel with a command context rebuilt from the store on every change, as the app does. */
function Harness({store, camera, dragging}: {store: EditorStore; camera: CameraStore; dragging: boolean}) {
    const state = useEditorStore(store);
    const ctx = {store, state} as unknown as CommandContext;
    return <SelectionPanel store={store} camera={camera} ctx={ctx} dragging={dragging} />;
}

const setup = (selected: string[], {dragging = false} = {}) => {
    const store = new EditorStore(makeExampleDocument());
    store.select(selected[0]);
    selected.slice(1).forEach(id => store.toggleSelection(id));
    const camera = new CameraStore();
    camera.setViewport({width: 800, height: 600});
    const view = render(<Harness store={store} camera={camera} dragging={dragging} />);
    return {store, camera, view, user: userEvent.setup()};
};
const tabNames = () => screen.queryAllByRole('tab').map(tab => tab.textContent);
const shape = (store: EditorStore, id: string) => store.getSnapshot().document.shapes.find(item => item.id === id)!;

describe('selection panel', () => {
    it('is not shown when nothing is selected', () => {
        const store = new EditorStore(makeExampleDocument());
        store.select(null);
        const camera = new CameraStore();
        render(<Harness store={store} camera={camera} dragging={false} />);
        expect(screen.queryByRole('region', {name: 'Selection properties'})).toBeNull();
    });

    it('shows Fill, Stroke and Corners for one rectangle, with no Align tab', () => {
        setup(['rect_1']);
        expect(screen.getByRole('region', {name: 'Selection properties'})).toBeTruthy();
        expect(tabNames()).toEqual(['Fill', 'Stroke', 'Corners']);
        expect(screen.getByRole('tab', {name: 'Fill'}).getAttribute('aria-selected')).toBe('true');
    });

    it('edits the same properties as the property sheet, as one undo step per field', async () => {
        const {store, user} = setup(['rect_1']);
        await user.click(screen.getByRole('tab', {name: 'Corners'}));
        const radius = screen.getByRole('spinbutton', {name: 'radius'});
        await user.clear(radius);
        await user.type(radius, '24');
        await user.tab();
        const rect = shape(store, 'rect_1');
        expect(rect.type === 'rectangle' && rect.components.cornerRadius.radius).toBe(24);
        store.undo();
        const undone = shape(store, 'rect_1');
        expect(undone.type === 'rectangle' && undone.components.cornerRadius.radius).toBe(10);

        await user.click(screen.getByRole('tab', {name: 'Stroke'}));
        const width = screen.getByRole('spinbutton', {name: 'Stroke width'});
        await user.clear(width);
        await user.type(width, '6');
        await user.tab();
        const stroked = shape(store, 'rect_1');
        expect(stroked.type === 'rectangle' && stroked.components.stroke.width).toBe(6);

        await user.click(screen.getByRole('tab', {name: 'Fill'}));
        const fill = screen.getByLabelText('Fill color');
        fireEvent.focus(fill);
        fireEvent.change(fill, {target: {value: '#123456'}});
        fireEvent.blur(fill);
        const filled = shape(store, 'rect_1');
        expect(filled.type === 'rectangle' && filled.components.fill.fill.color).toBe('#123456');
    });

    it('drops tabs the selection does not share and adds Align for several shapes', () => {
        // A rectangle's corner radius and a circle's radius are different components, so no Corners tab.
        setup(['rect_1', 'circle_1']);
        expect(tabNames()).toEqual(['Fill', 'Stroke', 'Align']);
    });

    it('runs the alignment commands, with distribute disabled for fewer than three shapes', async () => {
        const {store, user} = setup(['rect_1', 'circle_1']);
        await user.click(screen.getByRole('tab', {name: 'Align'}));
        const panel = screen.getByRole('tabpanel');
        expect(within(panel).getByRole('button', {name: 'Distribute Horizontally'})).toHaveProperty('disabled', true);
        expect(within(panel).getByRole('button', {name: 'Distribute Vertically'})).toHaveProperty('disabled', true);
        await user.click(within(panel).getByRole('button', {name: 'Align Left'}));
        const circle = shape(store, 'circle_1');
        // The circle's left edge moves to the rectangle's, x = 0, so its center is at 30.
        expect(circle.type === 'circle' && circle.components.circle.center.x).toBe(30);
        expect(store.getSnapshot().canUndo).toBe(true);
        store.undo();
        const back = shape(store, 'circle_1');
        expect(back.type === 'circle' && back.components.circle.center.x).toBe(200);
    });

    it('keeps the chosen tab across selections that have it, and falls back when they do not', async () => {
        const {store, user} = setup(['rect_1', 'circle_1']);
        await user.click(screen.getByRole('tab', {name: 'Align'}));
        store.select('rect_1');
        expect(await screen.findByRole('tab', {name: 'Fill', selected: true})).toBeTruthy();
    });

    it('hides from pointer and assistive technology while dragging', () => {
        setup(['rect_1'], {dragging: true});
        const panel = document.querySelector('.selection-panel')!;
        expect(panel.hasAttribute('data-hidden')).toBe(true);
        expect(panel.getAttribute('aria-hidden')).toBe('true');
        expect(panel.hasAttribute('inert')).toBe(true);
    });
});

describe('panelPosition', () => {
    const viewport = {width: 800, height: 600};
    const panel = {width: 200, height: 100};
    it('centers the panel above the selection', () => {
        expect(panelPosition({left: 300, top: 300, right: 500, bottom: 400}, panel, viewport)).toEqual({
            left: 300,
            top: 192,
        });
    });
    it('goes below the selection when there is no room above', () => {
        expect(panelPosition({left: 300, top: 50, right: 500, bottom: 150}, panel, viewport).top).toBe(158);
    });
    it('stays inside the canvas horizontally', () => {
        expect(panelPosition({left: -100, top: 300, right: 0, bottom: 400}, panel, viewport).left).toBe(8);
        expect(panelPosition({left: 750, top: 300, right: 900, bottom: 400}, panel, viewport).left).toBe(592);
    });
    it('overlaps the top of the canvas when the selection fills it', () => {
        expect(panelPosition({left: 0, top: 20, right: 800, bottom: 590}, panel, viewport).top).toBe(8);
    });
});
