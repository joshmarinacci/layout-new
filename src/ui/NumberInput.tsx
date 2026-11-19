import {type KeyboardEvent, useEffect, useEffectEvent, useRef, useState} from 'react';

function roundToTenth(value: number) {
    return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function NumberInput({
                                label,
                                value,
                                min,
                                step = 1,
                                shiftStep = 10,
                                onChange,
                                onFocus,
                                onBlur,
                                onKeyDown
                            }: {
    label: string;
    value: number | string;
    min?: number;
    step?: number;
    shiftStep?: number;
    onChange: (value: number) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
    const [draft, setDraft] = useState(String(value));
    // Mirrors draft so rapid wheel events that land before a re-render still accumulate.
    const latestDraft = useRef(draft);
    const editing = useRef(false);
    const skipBlurCommit = useRef(false);
    const input = useRef<HTMLInputElement>(null);
    const control = useRef<HTMLDivElement>(null);
    const updateDraft = (next: string) => {
        latestDraft.current = next;
        setDraft(next);
    };

    useEffect(() => {
        if (!editing.current) {
            latestDraft.current = String(value);
            setDraft(String(value));
        }
    }, [value]);

    const adjust = (amount: number) => {
        if (!editing.current) {
            // Step buttons keep focus where it was; commit any other field's edit
            // session before this field starts its own.
            const focused = document.activeElement;
            if (focused instanceof HTMLElement && focused !== input.current) focused.blur();
            onFocus?.();
            editing.current = true;
        }
        const current = latestDraft.current === '' ? 0 : Number(latestDraft.current);
        const next = Math.max(min ?? -Infinity, roundToTenth(current + amount));
        updateDraft(String(next));
        onChange(next);
        input.current?.focus();
    };

    const onWheel = useEffectEvent((event: WheelEvent) => {
        // Holding Shift turns vertical wheel motion into horizontal on many platforms.
        const delta = event.deltaY !== 0 ? event.deltaY : event.shiftKey ? event.deltaX : 0;
        if (delta === 0) return;
        event.preventDefault();
        const amount = event.shiftKey ? shiftStep : step;
        adjust(delta < 0 ? amount : -amount);
    });
    useEffect(() => {
        const element = control.current;
        if (!element) return;
        // React's onWheel is passive, so preventDefault needs a native listener.
        const listener = (event: WheelEvent) => onWheel(event);
        element.addEventListener('wheel', listener, {passive: false});
        return () => element.removeEventListener('wheel', listener);
    }, []);

    return <div className="number-input-control" ref={control}>
        <button type="button" className="number-step-button"
                aria-label={`Decrease ${label}`}
                title={`Decrease ${label}`}
                onMouseDown={event => event.preventDefault()}
                onClick={() => adjust(-step)}>−
        </button>
        <input ref={input} aria-label={label} type="number" inputMode="decimal"
               value={draft}
               min={min} step={step} onFocus={() => {
            if (!editing.current) {
                editing.current = true;
                onFocus?.();
            }
        }}
               onBlur={() => {
                   if (skipBlurCommit.current) {
                       skipBlurCommit.current = false;
                       editing.current = false;
                       return;
                   }
                   const parsed = Number(draft);
                   if (draft !== '' && Number.isFinite(parsed)) {
                       const rounded = Math.max(min ?? -Infinity, roundToTenth(parsed));
                       updateDraft(String(rounded));
                       onChange(rounded);
                   }
                   editing.current = false;
                   onBlur?.();
               }}
               onKeyDown={event => {
                   if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                       event.preventDefault();
                       adjust((event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? shiftStep : step));
                   }
                   if (event.key === 'Escape') skipBlurCommit.current = true;
                   onKeyDown?.(event);
               }}
               onChange={event => {
                   const next = event.currentTarget.value;
                   updateDraft(next);
                   if (next === '') return;
                   const parsed = event.currentTarget.valueAsNumber;
                   if (Number.isFinite(parsed) && (min === undefined || parsed >= min)) onChange(parsed);
               }}/>
        <button type="button" className="number-step-button"
                aria-label={`Increase ${label}`}
                title={`Increase ${label}`}
                onMouseDown={event => event.preventDefault()}
                onClick={() => adjust(step)}>+
        </button>
    </div>;
}
