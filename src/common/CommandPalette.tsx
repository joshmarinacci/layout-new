import {useEffect, useMemo, useRef, useState} from 'react';
import {shortcutLabel} from './keybindings';
import type {Command, CommandContext} from "../commands";

export function CommandPalette({commands, onClose, ctx}: {
    commands: Command[],
    onClose: () => void,
    ctx: CommandContext,
}) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const input = useRef<HTMLInputElement>(null);
    const matches = useMemo(() => {
        const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return commands
            .filter(command => command.enabled && command.enabled(ctx))
            .map(command => ({
                command,
                score: terms.reduce((score, term) => {
                    const name = command.title.toLowerCase();
                    const haystack = `${name} ${command.description} ${(command.keywords ?? []).join(' ')}`.toLowerCase();
                    return score + (name === term ? 8 : name.startsWith(term) ? 5 : name.includes(term) ? 3 : haystack.includes(term) ? 1 : -100);
                }, 0)
            })).filter(item => item.score >= 0)
            .sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title))
            .map(item => item.command);
    }, [commands, query]);

    useEffect(() => {
        input.current?.focus();
    }, []);
    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    const run = (command?: Command) => {
        if (!command) return;
        onClose();
        command.run(ctx);
    };

    return <div className="command-palette-backdrop" onPointerDown={event => {
        if (event.target === event.currentTarget) onClose();
    }}>
        <section className="command-palette" role="dialog" aria-modal="true"
                 aria-label="Command palette">
            <input ref={input} type="search" value={query}
                   placeholder="Search commands…"
                   aria-label="Search commands" aria-controls="command-results"
                   aria-activedescendant={matches[activeIndex] ? `command-${matches[activeIndex].id}` : undefined}
                   onChange={event => setQuery(event.target.value)}
                   onKeyDown={event => {
                       if (event.key === 'Escape') {
                           event.preventDefault();
                           onClose();
                       } else if (event.key === 'ArrowDown') {
                           event.preventDefault();
                           setActiveIndex(index => Math.min(index + 1, matches.length - 1));
                       } else if (event.key === 'ArrowUp') {
                           event.preventDefault();
                           setActiveIndex(index => Math.max(index - 1, 0));
                       } else if (event.key === 'Enter') {
                           event.preventDefault();
                           run(matches[activeIndex]);
                       }
                   }}/>
            <div id="command-results" className="command-results" role="listbox"
                 aria-label="Commands">
                {matches.length ? matches.map((command, index) => <button
                        key={command.id}
                        id={`command-${command.id}`} type="button" role="option"
                        aria-selected={index === activeIndex}
                        className={`command-result${index === activeIndex ? ' active' : ''}`}
                        onPointerMove={() => setActiveIndex(index)}
                        onClick={() => run(command)}>
                        <span
                            className="command-result-copy"><strong>{command.title}</strong><small>{command.description}</small></span>
                        {(shortcutLabel(command.id) ?? command.shortcut) &&
                            <kbd>{shortcutLabel(command.id) ?? command.shortcut}</kbd>}
                    </button>) :
                    <p className="command-empty">No matching commands</p>}
            </div>
            <footer>
                <span>↑↓ Navigate</span><span>↵ Run</span><span>Esc Close</span>
            </footer>
        </section>
    </div>;
}
