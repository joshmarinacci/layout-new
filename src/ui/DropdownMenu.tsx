import {ChevronDown, type LucideIcon} from 'lucide-react';
import type {ReactNode} from 'react';
import {Button, MenuTrigger, Separator as AriaSeparator} from 'react-aria-components';
import {MenuPopover} from './MenuPopover';

/** A menubar menu: React Aria opens it from its button by click, Enter, Space or the arrow keys. */
export function DropdownMenu({title, children, icon: Icon}: {title: string; children: ReactNode; icon?: LucideIcon}) {
    return (
        <div className="menubar-menu">
            <MenuTrigger>
                <Button>
                    {Icon && <Icon aria-hidden="true" />}
                    {title}
                    <ChevronDown aria-hidden="true" />
                </Button>
                <MenuPopover label={title}>{children}</MenuPopover>
            </MenuTrigger>
        </div>
    );
}

/** A line between groups of menu items. */
export function Separator() {
    return <AriaSeparator className="menu-separator" />;
}
