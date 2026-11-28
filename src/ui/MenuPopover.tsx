import {type ReactNode, type RefObject, useContext} from 'react';
import {Menu, OverlayTriggerStateContext, Popover, type PopoverProps} from 'react-aria-components';

/**
 * A React Aria popover holding a labelled menu. React Aria positions it (flipping and shifting it
 * to stay on screen), moves focus into it, handles arrow keys, Home/End, typeahead and Escape,
 * and returns focus when it closes. Inside a MenuTrigger it opens from the trigger; standalone it
 * needs `triggerRef`, `isOpen` and `onOpenChange`. Tab closes it too, as it did before React Aria
 * (whose popover would otherwise keep focus inside).
 */
export function MenuPopover({
    label,
    children,
    onClose,
    ...popover
}: Pick<PopoverProps, 'placement' | 'offset' | 'isOpen' | 'onOpenChange'> & {
    label: string;
    triggerRef?: RefObject<Element | null>;
    /** Called after an item runs, when the menu isn't inside a MenuTrigger (which closes itself). */
    onClose?: () => void;
    children: ReactNode;
}) {
    const trigger = useContext(OverlayTriggerStateContext);
    const close = () => (onClose ? onClose() : trigger?.close());
    return (
        <Popover className="menu-popover" placement="bottom start" offset={4} containerPadding={8} {...popover}>
            {/* Neither Popover nor Menu takes a key handler, so Tab is caught as it bubbles out of the menu. */}
            <div
                onKeyDown={event => {
                    if (event.key !== 'Tab') return;
                    event.preventDefault();
                    close();
                }}
            >
                <Menu aria-label={label} autoFocus="first" onClose={onClose}>
                    {children}
                </Menu>
            </div>
        </Popover>
    );
}
