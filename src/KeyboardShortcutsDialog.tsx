import {useMemo} from 'react';
import {commandRegistry} from './commands';
import {EditorDialog} from './EditorDialog';
import {keybindings, shortcutLabel} from './keybindings';

export function KeyboardShortcutsDialog({onClose}: {onClose: () => void}) {
    const groups = useMemo(() => {
        const grouped = new Map<string, ReturnType<typeof commandRegistry.getAll>>();
        for (const binding of keybindings) {
            const command = commandRegistry.get(binding.commandId);
            if (!command) continue;
            const keyword = command.keywords?.[0] ?? 'general';
            const group = grouped.get(keyword) ?? [];
            if (!group.some(item => item.id === command.id)) group.push(command);
            grouped.set(keyword, group);
        }
        return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([keyword, commands]) => ({
            keyword,
            commands: commands.sort((a, b) => a.title.localeCompare(b.title))
        }));
    }, []);

    return <EditorDialog title="Keyboard Shortcuts" onClose={onClose}>
        <div className="keyboard-shortcuts" aria-label="Keyboard shortcuts">
            {groups.map(group => <section className="keyboard-shortcut-group" key={group.keyword}>
                <h3>{group.keyword}</h3>
                {group.commands.map(command => <div className="keyboard-shortcut-row" key={command.id}>
                    <div><strong>{command.title}</strong><small>{command.description}</small></div>
                    <kbd>{shortcutLabel(command.id)}</kbd>
                </div>)}
            </section>)}
        </div>
    </EditorDialog>;
}
