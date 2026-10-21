import type {
    Bounds,
    Point,
    VectorNetwork,
    VectorSegment,
    VectorShape,
    VectorSpan
} from '../model/types';

export const VECTOR_TOLERANCE = 0.1; // document units, independent of viewport zoom
const EPS = 1e-7;
export const uid = () => crypto.randomUUID();
export const lerp = (a: Point, b: Point, t: number): Point => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
});
const sub = (a: Point, b: Point): Point => ({x: a.x - b.x, y: a.y - b.y});
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function makeVector(): VectorShape {
    return {
        id: uid(), name: 'Vector Network', pageId: 'page_1', type: 'vector', components: {
            network: {
                kind: 'vector-network',
                origin: {x: 0, y: 0},
                points: [],
                segments: [],
                regions: [],
                smooth: []
            },
            stroke: {kind: 'stroke-component', color: '#ffffff', width: 2},
        }
    };
}

export function controls(n: VectorNetwork, s: VectorSegment): [Point, Point, Point, Point] {
    const a = n.points.find(p => p.id === s.a)!, b = n.points.find(p => p.id === s.b)!;
    return [a, s.c1 ?? lerp(a, b, 1 / 3), s.c2 ?? lerp(a, b, 2 / 3), b];
}

export function splitControls(c: Point[], t: number): [Point[], Point[]] {
    const a = lerp(c[0], c[1], t), b = lerp(c[1], c[2], t), d = lerp(c[2], c[3], t);
    const e = lerp(a, b, t), f = lerp(b, d, t), p = lerp(e, f, t);
    return [[c[0], a, e, p], [p, f, d, c[3]]];
}

export function curvePoint(n: VectorNetwork, s: VectorSegment, t: number) {
    return splitControls(controls(n, s), t)[0][3];
}

export function spanControls(n: VectorNetwork, span: VectorSpan): Point[] {
    const s = n.segments.find(s => s.id === span.segment)!;
    const lo = Math.min(span.from, span.to), hi = Math.max(span.from, span.to);
    let c: Point[] = controls(n, s);
    if (hi < 1) c = splitControls(c, hi)[0];
    if (lo > 0) c = splitControls(c, lo / hi)[1];
    return span.from > span.to ? c.reverse() : c;
}

function lineProjection(p: Point, a: Point, b: Point) {
    const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
    return l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
}

interface Sample extends Point {
    t: number
}

export function flatten(n: VectorNetwork, s: VectorSegment): Sample[] {
    const c = controls(n, s), out: Sample[] = [{...c[0], t: 0}];
    if (!s.c1 && !s.c2) return [...out, {...c[3], t: 1}];
    const walk = (c: Point[], lo: number, hi: number, depth: number) => {
        const flat = Math.max(distance(c[1], lerp(c[0], c[3], 1 / 3)), distance(c[2], lerp(c[0], c[3], 2 / 3)));
        if (flat <= VECTOR_TOLERANCE || depth === 12) {
            out.push({...c[3], t: hi});
            return;
        }
        const [a, b] = splitControls(c, .5), mid = (lo + hi) / 2;
        walk(a, lo, mid, depth + 1);
        walk(b, mid, hi, depth + 1);
    };
    walk(c, 0, 1, 0);
    return out;
}

export function nearestSegment(n: VectorNetwork, p: Point, tolerance = Infinity) {
    let best: { segment: string; t: number; distance: number; point: Point } | null = null;
    for (const s of n.segments) {
        const samples = flatten(n, s);
        for (let i = 1; i < samples.length; i++) {
            const a = samples[i - 1], b = samples[i], f = lineProjection(p, a, b),
                q = lerp(a, b, f), d = distance(p, q);
            if (d <= tolerance && (!best || d < best.distance)) best = {
                segment: s.id,
                t: a.t + (b.t - a.t) * f,
                distance: d,
                point: q
            };
        }
    }
    return best;
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

export interface Face {
    key: string;
    loops: VectorSpan[][];
    polygons: Point[][];
    sample: Point;
    area: number
}

export const faceContains = (face: Face, p: Point) => pointInPolygon(p, face.polygons[0]) && !face.polygons.slice(1).some(poly => pointInPolygon(p, poly));
const area = (p: Point[]) => p.reduce((sum, a, i) => sum + cross(a, p[(i + 1) % p.length]), 0) / 2;

interface Piece {
    a: Point;
    b: Point;
    segment: string;
    lo: number;
    hi: number;
    cuts: number[]
}

interface Half {
    a: number;
    b: number;
    twin: number;
    span: VectorSpan
}

function canonical(tokens: string[]): string {
    return tokens.map((_, i) => JSON.stringify([...tokens.slice(i), ...tokens.slice(0, i)])).sort()[0] ?? '[]';
}

/** A temporary planar arrangement: crossings split derived edges, never authored segments. */
export function deriveFaces(n: VectorNetwork): Face[] {
    const pieces: Piece[] = [];
    for (const s of n.segments) {
        const samples = flatten(n, s);
        for (let i = 1; i < samples.length; i++) if (distance(samples[i - 1], samples[i]) > EPS) pieces.push({
            a: samples[i - 1],
            b: samples[i],
            segment: s.id,
            lo: samples[i - 1].t,
            hi: samples[i].t,
            cuts: [0, 1]
        });
    }
    if (pieces.length > 8192) throw new Error('Vector has too many curve subdivisions; simplify the network');
    for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
        const a = pieces[i], b = pieces[j];
        if (Math.max(a.a.x, a.b.x) + EPS < Math.min(b.a.x, b.b.x) || Math.max(b.a.x, b.b.x) + EPS < Math.min(a.a.x, a.b.x) || Math.max(a.a.y, a.b.y) + EPS < Math.min(b.a.y, b.b.y) || Math.max(b.a.y, b.b.y) + EPS < Math.min(a.a.y, a.b.y)) continue;
        const r = sub(a.b, a.a), s = sub(b.b, b.a), q = sub(b.a, a.a), den = cross(r, s);
        if (Math.abs(den) > EPS) {
            const t = cross(q, s) / den, u = cross(q, r) / den;
            if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
                a.cuts.push(Math.max(0, Math.min(1, t)));
                b.cuts.push(Math.max(0, Math.min(1, u)));
            }
        } else if (Math.abs(cross(q, r)) < EPS) {
            // Collinear overlaps are represented once in the arrangement.
            for (const p of [b.a, b.b]) if (distance(p, lerp(a.a, a.b, lineProjection(p, a.a, a.b))) < EPS) a.cuts.push(lineProjection(p, a.a, a.b));
            for (const p of [a.a, a.b]) if (distance(p, lerp(b.a, b.b, lineProjection(p, b.a, b.b))) < EPS) b.cuts.push(lineProjection(p, b.a, b.b));
        }
    }
    const vertices: Point[] = [], vertexMap = new Map<string, number>(), halves: Half[] = [],
        edges = new Set<string>();
    const vertex = (p: Point) => {
        const key = `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)}`;
        let id = vertexMap.get(key);
        if (id === undefined) {
            id = vertices.length;
            vertices.push(p);
            vertexMap.set(key, id);
        }
        return id;
    };
    for (const piece of pieces) {
        const cuts = [...new Set(piece.cuts.map(t => Math.round(t * 1e10) / 1e10))].sort((a, b) => a - b);
        for (let i = 1; i < cuts.length; i++) {
            const lo = cuts[i - 1], hi = cuts[i], a = vertex(lerp(piece.a, piece.b, lo)),
                b = vertex(lerp(piece.a, piece.b, hi));
            const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
            if (a === b || edges.has(key)) continue;
            edges.add(key);
            const from = piece.lo + (piece.hi - piece.lo) * lo,
                to = piece.lo + (piece.hi - piece.lo) * hi, k = halves.length;
            halves.push({a, b, twin: k + 1, span: {segment: piece.segment, from, to}}, {
                a: b,
                b: a,
                twin: k,
                span: {segment: piece.segment, from: to, to: from}
            });
        }
    }
    const outgoing = vertices.map(() => [] as number[]);
    halves.forEach((h, i) => outgoing[h.a].push(i));
    outgoing.forEach((list, v) => list.sort((a, b) => Math.atan2(vertices[halves[a].b].y - vertices[v].y, vertices[halves[a].b].x - vertices[v].x) - Math.atan2(vertices[halves[b].b].y - vertices[v].y, vertices[halves[b].b].x - vertices[v].x)));
    const junctionCuts = new Map<string, number[]>();
    for (const h of halves) if (outgoing[h.a].length > 2 || h.span.from === 0 || h.span.from === 1) {
        const cuts = junctionCuts.get(h.span.segment) ?? [];
        cuts.push(h.span.from);
        junctionCuts.set(h.span.segment, cuts);
    }
    for (const [id, cuts] of junctionCuts) junctionCuts.set(id, [...new Set(cuts.map(t => Math.round(t * 1e7) / 1e7))].sort((a, b) => a - b));
    const cutIndex = (id: string, t: number) => (junctionCuts.get(id) ?? []).findIndex(v => Math.abs(v - t) < 1e-6);
    const visited = new Set<number>(), faces: Face[] = [];
    for (let start = 0; start < halves.length; start++) {
        if (visited.has(start)) continue;
        let current = start;
        const walk: number[] = [];
        do {
            visited.add(current);
            walk.push(current);
            const h = halves[current], list = outgoing[h.b], back = list.indexOf(h.twin);
            current = list[(back + list.length - 1) % list.length];
        } while (current !== start && !visited.has(current));
        // Remove dangling branches, including ones spanning the cyclic start.
        let changed = true;
        while (changed && walk.length) {
            changed = false;
            for (let i = 0; i < walk.length; i++) {
                const j = (i + 1) % walk.length;
                if (halves[walk[i]].twin === walk[j]) {
                    if (j === 0) {
                        walk.pop();
                        walk.shift();
                    } else walk.splice(i, 2);
                    changed = true;
                    break;
                }
            }
        }
        const poly = walk.map(i => vertices[halves[i].a]), signedArea = area(poly);
        if (signedArea < 1e-6) continue;
        const spans: VectorSpan[] = [];
        for (const i of walk) {
            const span = halves[i].span, last = spans.at(-1);
            if (last && last.segment === span.segment && Math.abs(last.to - span.from) < 1e-6 && (last.to - last.from) * (span.to - span.from) > 0) last.to = span.to;
            else spans.push({...span});
        }
        if (spans.length > 1 && spans[0].segment === spans.at(-1)!.segment && Math.abs(spans.at(-1)!.to - spans[0].from) < 1e-6) {
            spans[0].from = spans.pop()!.from;
        }
        const key = canonical(spans.map(s => `${s.segment}:${s.to > s.from ? '+' : '-'}:${cutIndex(s.segment, s.from)}:${cutIndex(s.segment, s.to)}`));
        faces.push({key, loops: [spans], polygons: [poly], sample: poly[0], area: signedArea});
    }
    // Positive walks are bounded faces. Disconnected inner components become holes in their immediate enclosing face.
    for (const child of faces) {
        const parents = faces.filter(parent => parent !== child && parent.area > child.area && child.polygons[0].every(p => pointInPolygon(p, parent.polygons[0]) && !parent.polygons[0].some(q => distance(p, q) < 1e-6)));
        const parent = parents.sort((a, b) => a.area - b.area)[0];
        if (parent) {
            parent.loops.push(child.loops[0].slice().reverse().map(s => ({
                segment: s.segment,
                from: s.to,
                to: s.from
            })));
            parent.polygons.push(child.polygons[0]);
        }
    }
    for (const face of faces) {
        const poly = face.polygons[0];
        // Interior witnesses near a boundary work for concave faces and rings.
        outer: for (let i = 0; i < poly.length; i++) {
            const a = poly[i], b = poly[(i + 1) % poly.length], length = distance(a, b);
            for (const offset of [1e-4, 1e-6, .01]) {
                const p = {
                    x: (a.x + b.x) / 2 - (b.y - a.y) / length * offset,
                    y: (a.y + b.y) / 2 + (b.x - a.x) / length * offset
                };
                if (faceContains(face, p)) {
                    face.sample = p;
                    break outer;
                }
            }
        }
    }
    return faces;
}

const faceCache = new WeakMap<VectorNetwork, Face[]>();

export function facesFor(n: VectorNetwork) {
    let faces = faceCache.get(n);
    if (!faces) {
        faces = deriveFaces(n);
        faceCache.set(n, faces);
    }
    return faces;
}

/** Run on a mutable network after an edit, comparing to the immutable gesture baseline. */
export function reconcileRegions(n: VectorNetwork, before: VectorNetwork) {
    const oldFaces = facesFor(before), next = deriveFaces(n);
    const oldColor = (f: Face) => before.regions.find(r => r.key === f.key)?.fill ?? null;
    n.regions = next.map(face => {
        const exact = oldFaces.find(f => f.key === face.key);
        let fill: string | null = null;
        if (exact && oldFaces.length === next.length) fill = oldColor(exact);
        else {
            const contributors = oldFaces.filter(f => faceContains(face, f.sample));
            if (contributors.length) {
                const colors = new Set(contributors.map(oldColor));
                if (colors.size === 1) fill = oldColor(contributors[0]);
            } else {
                const parent = oldFaces.find(f => faceContains(f, face.sample));
                fill = parent ? oldColor(parent) : exact ? oldColor(exact) : null;
            }
        }
        return {key: face.key, loops: face.loops, fill};
    });
}

export function addPoint(n: VectorNetwork, p: Point): string {
    const id = uid();
    n.points.push({id, x: p.x, y: p.y});
    return id;
}

export function connect(n: VectorNetwork, a: string, b: string): string | null {
    if (a === b || n.segments.some(s => (s.a === a && s.b === b || s.b === a && s.a === b) && !s.c1 && !s.c2)) return null;
    const id = uid();
    n.segments.push({id, a, b, c1: null, c2: null});
    return id;
}

export function splitSegment(n: VectorNetwork, id: string, t: number, existingPoint?: string): string {
    const s = n.segments.find(s => s.id === id)!;
    if (t < 1e-6) return s.a;
    if (t > 1 - 1e-6) return s.b;
    const [a, b] = splitControls(controls(n, s), t), point = existingPoint ?? addPoint(n, a[3]);
    const end = s.b, curved = !!s.c1 || !!s.c2;
    s.b = point;
    s.c1 = curved ? a[1] : null;
    s.c2 = curved ? a[2] : null;
    const nextId = uid();
    n.segments.push({
        id: nextId,
        a: point,
        b: end,
        c1: curved ? b[1] : null,
        c2: curved ? b[2] : null
    });
    for (const pair of n.smooth) if (pair.point === end) pair.segments = pair.segments.map(edge => edge === id ? nextId : edge) as [string, string];
    return point;
}

export function movePoints(n: VectorNetwork, ids: string[], delta: Point) {
    const move = (p: Point) => {
        p.x += delta.x;
        p.y += delta.y;
    };
    n.points.filter(p => ids.includes(p.id)).forEach(move);
    for (const s of n.segments) {
        if (ids.includes(s.a) && s.c1) move(s.c1);
        if (ids.includes(s.b) && s.c2) move(s.c2);
    }
}

export function deleteParts(n: VectorNetwork, points: string[], segments: string[]) {
    n.points = n.points.filter(p => !points.includes(p.id));
    n.segments = n.segments.filter(s => !segments.includes(s.id) && !points.includes(s.a) && !points.includes(s.b));
    n.smooth = n.smooth.filter(pair => !points.includes(pair.point) && pair.segments.every(id => n.segments.some(s => s.id === id)));
}

export function mergePoints(n: VectorNetwork, ids: string[]) {
    const target = n.points.find(p => p.id === ids[0]);
    if (!target) return;
    for (const id of ids.slice(1)) {
        const p = n.points.find(p => p.id === id);
        if (!p) continue;
        movePoints(n, [id], sub(target, p));
        for (const s of n.segments) {
            if (s.a === id) s.a = target.id;
            if (s.b === id) s.b = target.id;
        }
    }
    n.points = n.points.filter(p => p.id === target.id || !ids.includes(p.id));
    n.segments = n.segments.filter(s => s.a !== s.b);
    n.smooth = n.smooth.filter(pair => !ids.includes(pair.point) && pair.segments.every(id => n.segments.some(s => s.id === id)));
}

export function curveSegment(n: VectorNetwork, id: string) {
    const s = n.segments.find(s => s.id === id)!;
    if (s.c1 || s.c2) return;
    const [a, , , b] = controls(n, s), d = sub(b, a);
    s.c1 = {x: a.x + d.x / 3 - d.y / 6, y: a.y + d.y / 3 + d.x / 6};
    s.c2 = {x: a.x + 2 * d.x / 3 - d.y / 6, y: a.y + 2 * d.y / 3 + d.x / 6};
}

export function smoothPair(n: VectorNetwork, pointId: string, segmentIds: string[]) {
    const p = n.points.find(p => p.id === pointId)!;
    const pair = n.segments.filter(s => segmentIds.includes(s.id) && (s.a === pointId || s.b === pointId));
    if (pair.length !== 2) return;
    n.smooth = n.smooth.filter(p => p.point !== pointId || !p.segments.some(id => pair.some(s => s.id === id)));
    n.smooth.push({point: pointId, segments: [pair[0].id, pair[1].id]});
    const endpoints = pair.map(s => n.points.find(q => q.id === (s.a === pointId ? s.b : s.a))!);
    const d = sub(endpoints[1], endpoints[0]), length = Math.hypot(d.x, d.y) || 1;
    pair.forEach((s, i) => {
        const c = controls(n, s);
        s.c1 = {...c[1]};
        s.c2 = {...c[2]};
        const scale = distance(p, endpoints[i]) / 3 * (i ? 1 : -1);
        s[s.a === pointId ? 'c1' : 'c2'] = {
            x: p.x + d.x / length * scale,
            y: p.y + d.y / length * scale
        };
    });
}

/** Smoothness belongs to an explicit pair, so branches can have independent tangents. */
export function moveHandle(n: VectorNetwork, segmentId: string, handle: 'c1' | 'c2', p: Point) {
    const s = n.segments.find(s => s.id === segmentId)!;
    s[handle] = {...p};
    const pointId = handle === 'c1' ? s.a : s.b, anchor = n.points.find(p => p.id === pointId)!;
    for (const pair of n.smooth.filter(pair => pair.point === pointId && pair.segments.includes(segmentId))) {
        const other = n.segments.find(s => s.id === pair.segments.find(id => id !== segmentId))!;
        const otherHandle = other.a === pointId ? 'c1' : 'c2';
        const length = distance(anchor, other[otherHandle] ?? anchor), d = sub(p, anchor),
            magnitude = Math.hypot(d.x, d.y);
        if (magnitude > EPS) other[otherHandle] = {
            x: anchor.x - d.x / magnitude * length,
            y: anchor.y - d.y / magnitude * length
        };
    }
}

export function vectorBounds(n: VectorNetwork): Bounds {
    // Include analytic cubic extrema, not control-box bounds.
    const points: Point[] = [...n.points];
    for (const s of n.segments) {
        const c = controls(n, s);
        for (const axis of ['x', 'y'] as const) {
            const a = -c[0][axis] + 3 * c[1][axis] - 3 * c[2][axis] + c[3][axis],
                b = 2 * (c[0][axis] - 2 * c[1][axis] + c[2][axis]), d = c[1][axis] - c[0][axis];
            const roots = Math.abs(a) < EPS ? Math.abs(b) < EPS ? [] : [-d / b] : b * b - 4 * a * d < 0 ? [] : [(-b + Math.sqrt(b * b - 4 * a * d)) / (2 * a), (-b - Math.sqrt(b * b - 4 * a * d)) / (2 * a)];
            roots.filter(t => t > 0 && t < 1).forEach(t => points.push(curvePoint(n, s, t)));
        }
    }
    const minX = points.length ? Math.min(...points.map(p => p.x)) : 0,
        minY = points.length ? Math.min(...points.map(p => p.y)) : 0;
    return {
        x: n.origin.x + minX,
        y: n.origin.y + minY,
        width: points.length ? Math.max(...points.map(p => p.x)) - minX : 0,
        height: points.length ? Math.max(...points.map(p => p.y)) - minY : 0
    };
}

export function resizeVector(n: VectorNetwork, before: VectorNetwork, width: number, height: number) {
    const bounds = vectorBounds(before), x = bounds.x - before.origin.x,
        y = bounds.y - before.origin.y;
    const sx = bounds.width ? Math.max(.01, width) / bounds.width : 1,
        sy = bounds.height ? Math.max(.01, height) / bounds.height : 1;
    const transform = (p: Point): Point => ({x: x + (p.x - x) * sx, y: y + (p.y - y) * sy});
    n.points = before.points.map(p => ({...p, ...transform(p)}));
    n.segments = before.segments.map(s => ({
        ...s,
        c1: s.c1 && transform(s.c1),
        c2: s.c2 && transform(s.c2)
    }));
    reconcileRegions(n, before);
}

export function vectorHit(shape: VectorShape, p: Point, tolerance: number) {
    const n = shape.components.network, local = sub(p, n.origin);
    return !!nearestSegment(n, local, Math.max(tolerance, shape.components.stroke.width / 2)) || n.points.some(q => distance(local, q) <= tolerance) || facesFor(n).some(f => n.regions.find(r => r.key === f.key)?.fill && faceContains(f, local));
}

export function regionPath(n: VectorNetwork, loops: VectorSpan[][], ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    for (const loop of loops) {
        loop.forEach((span, i) => {
            const c = spanControls(n, span);
            if (!i) ctx.moveTo(c[0].x, c[0].y);
            ctx.bezierCurveTo(c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y);
        });
        ctx.closePath();
    }
}

export function drawVector(ctx: CanvasRenderingContext2D, shape: VectorShape) {
    const n = shape.components.network;
    ctx.save();
    ctx.translate(n.origin.x, n.origin.y);
    for (const r of n.regions) if (r.fill) {
        regionPath(n, r.loops, ctx);
        ctx.fillStyle = r.fill;
        ctx.fill('evenodd');
    }
    ctx.beginPath();
    for (const s of n.segments) {
        const c = controls(n, s);
        ctx.moveTo(c[0].x, c[0].y);
        ctx.bezierCurveTo(c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y);
    }
    ctx.strokeStyle = shape.components.stroke.color;
    ctx.lineWidth = shape.components.stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (shape.components.stroke.width > 0) ctx.stroke();
    ctx.restore();
}

export function joinCrossing(n: VectorNetwork, p: Point, tolerance: number): string | null {
    const hits = n.segments.map(s => nearestSegment({
        ...n,
        segments: [s]
    }, p, tolerance)).filter(h => h !== null).sort((a, b) => a.distance - b.distance);
    if (hits.length < 2) return null;
    // Refine both curve parameters together before inserting the junction.
    const [a, b] = hits;
    let ta = a.t, tb = b.t;
    const sa = n.segments.find(s => s.id === a.segment)!,
        sb = n.segments.find(s => s.id === b.segment)!;
    const evaluate = (s: typeof sa, t: number) => {
        const c = controls(n, s), u = 1 - t;
        return {
            x: u * u * u * c[0].x + 3 * u * u * t * c[1].x + 3 * u * t * t * c[2].x + t * t * t * c[3].x,
            y: u * u * u * c[0].y + 3 * u * u * t * c[1].y + 3 * u * t * t * c[2].y + t * t * t * c[3].y
        };
    };
    for (let i = 0; i < 12; i++) {
        const pa = evaluate(sa, ta), pb = evaluate(sb, tb),
            da = evaluate(sa, Math.min(1, ta + 1e-5)), db = evaluate(sb, Math.min(1, tb + 1e-5));
        const ax = (da.x - pa.x) / 1e-5, ay = (da.y - pa.y) / 1e-5, bx = (db.x - pb.x) / 1e-5,
            by = (db.y - pb.y) / 1e-5, det = ay * bx - ax * by;
        if (Math.abs(det) < 1e-8) break;
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        ta = Math.max(0, Math.min(1, ta + (-by * dx + bx * dy) / det));
        tb = Math.max(0, Math.min(1, tb + (ax * dy - ay * dx) / det));
    }
    if (distance(evaluate(sa, ta), evaluate(sb, tb)) > .2 || distance(evaluate(sa, ta), p) > tolerance * 2) return null;
    const id = splitSegment(n, a.segment, ta);
    const other = splitSegment(n, b.segment, tb, id);
    if (other !== id) mergePoints(n, [id, other]);
    return id;
}
