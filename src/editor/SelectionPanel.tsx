import {useState, useSyncExternalStore} from 'react';
import {Tab, TabList, TabPanel, Tabs, type Key} from 'react-aria-components';
import {
    AlignCenterHorizontal,
    AlignCenterVertical,
    AlignEndHorizontal,
    AlignEndVertical,
    AlignHorizontalDistributeCenter,
    AlignStartHorizontal,
    AlignStartVertical,
    AlignVerticalDistributeCenter,
    type LucideIcon,
} from 'lucide-react';
import type {EditorStore} from '../model/EditorStore';
import {useEditorStore} from '../model/useEditorStore';
import {commandRegistry, type CommandContext, type CommandId} from '../commands';
import {commonComponents, FillFields, RadiusField, StrokeFields} from '../common/shapeFields';
import {IconButton} from '../ui/controls';
import {type CameraStore, documentToScreen, unionBounds} from './camera';
import {selectionBounds} from './VisualEditor';
import {useElementSize} from './useElementSize';

/** Space between the selection and the panel, and between the panel and the canvas edges. */
const GAP = 8;

const ALIGN_ROWS: {label: string; commands: [CommandId, LucideIcon][]}[] = [
    {
        label: 'Align horizontally',
        commands: [
            ['align-left', AlignStartVertical],
            ['align-center', AlignCenterVertical],
            ['align-right', AlignEndVertical],
        ],
    },
    {
        label: 'Align vertically',
        commands: [
            ['align-top', AlignStartHorizontal],
            ['align-middle', AlignCenterHorizontal],
            ['align-bottom', AlignEndHorizontal],
        ],
    },
    {
        label: 'Distribute',
        commands: [
            ['align-distribute-horizontal', AlignHorizontalDistributeCenter],
            ['align-distribute-vertical', AlignVerticalDistributeCenter],
        ],
    },
];

/** Where the panel goes: centered above the selection, below it when there is no room above, kept on screen. */
export function panelPosition(
    selection: {left: number; top: number; right: number; bottom: number},
    panel: {width: number; height: number},
    viewport: {width: number; height: number},
) {
    const maxLeft = Math.max(GAP, viewport.width - panel.width - GAP);
    const left = Math.min(maxLeft, Math.max(GAP, (selection.left + selection.right - panel.width) / 2));
    const above = selection.top - GAP - panel.height;
    const below = selection.bottom + GAP;
    const top =
        above >= GAP
            ? above
            : below + panel.height <= viewport.height - GAP
              ? below
              : Math.max(GAP, Math.min(above, viewport.height - panel.height - GAP));
    return {left, top};
}

/**
 * A small floating panel above the selected shapes with Fill, Stroke and Corners editors (the same
 * ones as the property sheet) and, for two or more shapes, the alignment commands. Tabs that not
 * every selected shape supports are left out. It fades out while `dragging`.
 */
export function SelectionPanel({
    store,
    camera,
    ctx,
    dragging,
}: {
    store: EditorStore;
    camera: CameraStore;
    ctx: CommandContext;
    /** A move or resize is in progress. */
    dragging: boolean;
}) {
    const state = useEditorStore(store);
    const pageId = state.selectedPageId;
    const view = useSyncExternalStore(camera.subscribe, () => camera.get(pageId));
    const [panel, size] = useElementSize<HTMLElement>();
    const [chosenTab, setChosenTab] = useState<Key>('fill');
    const shapes = state.document.shapes.filter(
        shape => shape.pageId === pageId && state.selectedIds.includes(shape.id),
    );
    const common = commonComponents(shapes);
    const keyOf = (kinds: string[]) => common.find(([, component]) => kinds.includes(component.kind))?.[0];
    const fillKey = keyOf(['fill-component']);
    const strokeKey = keyOf(['stroke-component']);
    const radiusKey = keyOf(['rounded-corner-component', 'circle-like-component']);
    const tabs = [
        fillKey && 'fill',
        strokeKey && 'stroke',
        radiusKey && 'corners',
        shapes.length > 1 && 'align',
    ].filter((tab): tab is string => !!tab);
    const bounds = unionBounds(shapes.map(selectionBounds));
    if (!tabs.length || !bounds) return null;
    // Keep the chosen tab when the selection changes, unless the new selection doesn't have it.
    const selectedTab = tabs.includes(String(chosenTab)) ? chosenTab : tabs[0];
    const topLeft = documentToScreen(view, bounds);
    const bottomRight = documentToScreen(view, {x: bounds.x + bounds.width, y: bounds.y + bounds.height});
    const position = panelPosition(
        {left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y},
        size,
        camera.viewport,
    );
    const palettes = state.document.palettes;
    return (
        <section
            ref={panel}
            className="selection-panel"
            aria-label="Selection properties"
            data-hidden={dragging || undefined}
            aria-hidden={dragging || undefined}
            inert={dragging}
            style={{left: position.left, top: position.top}}
        >
            <Tabs selectedKey={selectedTab} onSelectionChange={setChosenTab}>
                <TabList aria-label="Property groups" className="selection-panel-tabs">
                    {fillKey && <Tab id="fill">Fill</Tab>}
                    {strokeKey && <Tab id="stroke">Stroke</Tab>}
                    {radiusKey && <Tab id="corners">Corners</Tab>}
                    {shapes.length > 1 && <Tab id="align">Align</Tab>}
                </TabList>
                {fillKey && (
                    <TabPanel id="fill" className="selection-panel-body">
                        <FillFields store={store} shapes={shapes} componentKey={fillKey} palettes={palettes} />
                    </TabPanel>
                )}
                {strokeKey && (
                    <TabPanel id="stroke" className="selection-panel-body">
                        <StrokeFields store={store} shapes={shapes} componentKey={strokeKey} palettes={palettes} />
                    </TabPanel>
                )}
                {radiusKey && (
                    <TabPanel id="corners" className="selection-panel-body">
                        <RadiusField store={store} shapes={shapes} componentKey={radiusKey} />
                    </TabPanel>
                )}
                {shapes.length > 1 && (
                    <TabPanel id="align" className="selection-panel-body selection-panel-align">
                        {ALIGN_ROWS.map(row => (
                            <div key={row.label} role="group" aria-label={row.label}>
                                {row.commands.map(([id, icon]) => {
                                    const command = commandRegistry.require(id);
                                    return (
                                        <IconButton
                                            key={id}
                                            label={command.title}
                                            icon={icon}
                                            disabled={!command.enabled(ctx)}
                                            onClick={() => command.run(ctx)}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </TabPanel>
                )}
            </Tabs>
        </section>
    );
}
