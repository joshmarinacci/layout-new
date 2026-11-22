import {ChevronDown, type LucideIcon} from 'lucide-react';
import {type CSSProperties, type ReactNode, useEffect, useId, useRef, useState} from 'react';
import {MenuPopover} from './MenuPopover';

/** Opens under its button; menus in the right half of the window align to the button's right edge. */
function positionUnder(button: HTMLElement): CSSProperties {
    const rect = button.getBoundingClientRect();
    const top = rect.bottom + 4;
    return rect.left > window.innerWidth / 2
        ? {top, right: Math.max(0, window.innerWidth - rect.right)}
        : {top, left: rect.left};
}

export function DropdownMenu({title, children, icon: Icon}: {title: string; children: ReactNode; icon?: LucideIcon}) {
    const [position, setPosition] = useState<CSSProperties | null>(null);
    const open = position !== null;
    const root = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const id = useId();
    useEffect(() => {
        if (!open) return;
        const dismiss = (event: PointerEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target)) setPosition(null);
        };
        document.addEventListener('pointerdown', dismiss);
        return () => document.removeEventListener('pointerdown', dismiss);
    }, [open]);
    const show = () => {
        if (button.current) setPosition(positionUnder(button.current));
    };
    const close = () => setPosition(null);
    return (
        <div
            className="menubar-menu"
            ref={root}
            onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) close();
            }}
            onKeyDown={event => {
                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault();
                    const focusItem = () => {
                        const items = Array.from(
                            root.current?.querySelectorAll<HTMLButtonElement>('[role=menu] button:not(:disabled)') ??
                                [],
                        );
                        if (!items.length) return;
                        const index = items.findIndex(item => item === document.activeElement);
                        const next =
                            event.key === 'Home'
                                ? 0
                                : event.key === 'End'
                                  ? items.length - 1
                                  : event.key === 'ArrowDown'
                                    ? (index + 1) % items.length
                                    : index < 0
                                      ? items.length - 1
                                      : (index - 1 + items.length) % items.length;
                        items[next]?.focus();
                    };
                    if (!open) {
                        show();
                        requestAnimationFrame(focusItem);
                    } else focusItem();
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    close();
                    button.current?.focus();
                }
            }}
        >
            <button
                ref={button}
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                aria-haspopup="menu"
                onClick={() => (open ? close() : show())}
            >
                {Icon && <Icon aria-hidden="true" />}
                {title}
                <ChevronDown aria-hidden="true" />
            </button>
            {position && (
                <MenuPopover
                    id={id}
                    label={title}
                    style={position}
                    onClick={event => {
                        if (event.target instanceof Element && event.target.closest('button:not(:disabled)')) {
                            close();
                            button.current?.focus();
                        }
                    }}
                >
                    {children}
                </MenuPopover>
            )}
        </div>
    );
}

export function Separator() {
    return <hr />;
}
