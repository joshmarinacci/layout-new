import {type KeyboardEvent, useEffect, useRef, useState} from 'react';

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
    const editing = useRef(false);
    const skipBlurCommit = useRef(false);
    const input = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!editing.current) setDraft(String(value));
    }, [value]);

    const adjust = (amount: number) => {
        if (!editing.current) {
            onFocus?.();
            editing.current = true;
        }
        const current = draft === '' ? 0 : Number(draft);
        const next = Math.max(min ?? -Infinity, roundToTenth(current + amount));
        setDraft(String(next));
        onChange(next);
        input.current?.focus();
    };

    const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        if (event.deltaY === 0) return;
        event.preventDefault();
        adjust(event.deltaY < 0 ? step : -step);
    };

    return <div className="number-input-control" onWheel={handleWheel}>
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
                       setDraft(String(rounded));
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
                   setDraft(next);
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
