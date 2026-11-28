import {useCallback, useState} from 'react';

/**
 * Tracks an element's border-box size with a ResizeObserver. Returns a callback ref to attach and
 * the latest size ({0, 0} until the element is first measured).
 */
export function useElementSize<T extends HTMLElement>() {
    const [size, setSize] = useState({width: 0, height: 0});
    // A callback ref (with cleanup, React 19) so the observer follows the element as it mounts and unmounts.
    const ref = useCallback((element: T | null) => {
        if (!element) return;
        const measure = () => {
            const {offsetWidth: width, offsetHeight: height} = element;
            setSize(current => (current.width === width && current.height === height ? current : {width, height}));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return [ref, size] as const;
}
