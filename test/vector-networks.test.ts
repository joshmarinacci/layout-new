import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {EditorStore, emptyDocument} from '../src/EditorStore';
import {deserializeDocument, serializeDocument} from '../src/io/serialization';
import {
    addPoint,
    connect,
    curvePoint,
    deleteParts,
    deriveFaces,
    faceContains,
    joinCrossing,
    makeVector,
    mergePoints,
    moveHandle,
    movePoints,
    nearestSegment,
    reconcileRegions,
    resizeVector,
    smoothPair,
    splitSegment,
    vectorBounds,
    vectorHit
} from '../src/shapes/vectorNetworks';
import type {Point, VectorNetwork, VectorShape} from '../src/types';

function loop(n: VectorNetwork, coords: Point[]) { const ids = coords.map(p => addPoint(n, p)); ids.forEach((id, i) => connect(n, id, ids[(i + 1) % ids.length])); return ids; }
const square = (n: VectorNetwork, x = 0, y = 0, size = 100) => loop(n, [{x,y}, {x:x+size,y}, {x:x+size,y:y+size}, {x,y:y+size}]);
function fixture() { const shape = makeVector(), n = shape.components.network; const ids = square(n); reconcileRegions(n, makeVector().components.network); const store = new EditorStore(); store.addShape(shape); return {shape, ids, store, get: () => (store.getSnapshot().document.shapes[0] as VectorShape).components.network}; }
const paint = (store: EditorStore, id: string, color = '#ff0000') => store.updateShape(id, s => { if (s.type === 'vector') s.components.network.regions.forEach(r => r.fill = color); });
describe('vector planar regions', () => {
    it('supports branches and disconnected paths without inventing fills', () => {
        const n = makeVector().components.network, ids = square(n), tip = addPoint(n, {x: -40, y: 50}); connect(n, ids[0], tip);
        const free = addPoint(n, {x: 200, y: 0}); connect(n, free, addPoint(n, {x: 300, y: 0}));
        expect(deriveFaces(n)).toHaveLength(1);
        expect(faceContains(deriveFaces(n)[0], {x: 50, y: 50})).toBe(true);
        expect(n.points.find(p => p.id === ids[0])).toBeDefined();
        expect(n.segments.filter(s => s.a === ids[0] || s.b === ids[0])).toHaveLength(3);
    });
    it('discovers adjacent regions and nested holes and islands', () => {
        const n = makeVector().components.network; square(n); square(n,20,20,60); square(n,40,40,20); square(n,150,0,30);
        const faces = deriveFaces(n); expect(faces).toHaveLength(4);
        for (const p of [{x:10,y:10},{x:30,y:30},{x:50,y:50},{x:160,y:10}]) expect(faces.filter(f => faceContains(f,p))).toHaveLength(1);
        expect(faces.map(f=>f.loops.length).sort()).toEqual([1,1,2,2]);
    });
    it('splits at crossings without changing authored geometry', () => {
        const n = makeVector().components.network, ids = square(n); connect(n,ids[0],ids[2]); connect(n,ids[1],ids[3]);
        expect(deriveFaces(n)).toHaveLength(4); expect(n.points).toHaveLength(4); expect(n.segments).toHaveLength(6);
        expect(new Set(deriveFaces(n).map(f=>f.key)).size).toBe(4);
    });
    it('handles self-intersecting loops, collinear overlaps, and zero length segments', () => {
        const n = makeVector().components.network;
        loop(n,[{x:0,y:0},{x:100,y:100},{x:0,y:100},{x:100,y:0}]);
        expect(deriveFaces(n)).toHaveLength(2);
        const a=addPoint(n,{x:0,y:0}), b=addPoint(n,{x:100,y:0}); connect(n,a,b); connect(n,a,addPoint(n,{x:0,y:0}));
        expect(deriveFaces(n)).toHaveLength(2);
    });
    it('finds curved closed regions and uses curve-aware hit testing', () => {
        const shape=makeVector(), n=shape.components.network, a=addPoint(n,{x:0,y:0}), b=addPoint(n,{x:100,y:0});
        const id=connect(n,a,b)!; const s=n.segments[0]; s.c1={x:0,y:100}; s.c2={x:100,y:100}; connect(n,b,a);
        const faces=deriveFaces(n); expect(faces).toHaveLength(1); expect(faceContains(faces[0],{x:50,y:30})).toBe(true);
        expect(nearestSegment(n,{x:50,y:75},1)?.segment).toBe(id);
        expect(vectorBounds(n).height).toBeCloseTo(75);
        expect(vectorHit(shape,{x:50,y:75},1)).toBe(true); expect(vectorHit(shape,{x:50,y:30},1)).toBe(false);
    });
    it('keeps tiny gaps open instead of implicitly closing them', () => {
        const n=makeVector().components.network; const ids=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100},{x:0,y:.001}].map(p=>addPoint(n,p));
        ids.slice(1).forEach((id,i)=>connect(n,ids[i],id)); expect(deriveFaces(n)).toHaveLength(0);
    });
});
describe('vector edits and fill ownership', () => {
    it('preserves fills when moving points and inherits fills when dividing a region', () => {
        const {store,shape,ids,get}=fixture(); paint(store,shape.id);
        store.updateVector(shape.id,n=>movePoints(n,[ids[1]],{x:20,y:10})); expect(get().regions[0].fill).toBe('#ff0000');
        store.updateVector(shape.id,n=>{connect(n,ids[0],ids[2]);}); expect(get().regions).toHaveLength(2); expect(get().regions.map(r=>r.fill)).toEqual(['#ff0000','#ff0000']);
    });
    it('merges matching fills, clears conflicting fills, and restores both on undo', () => {
        const {store,shape,ids,get}=fixture(); paint(store,shape.id); let diagonal='';
        store.updateVector(shape.id,n=>{diagonal=connect(n,ids[0],ids[2])!;});
        store.updateVector(shape.id,n=>deleteParts(n,[],[diagonal])); expect(get().regions[0].fill).toBe('#ff0000'); store.undo();
        store.updateShape(shape.id,s=>{if(s.type==='vector')s.components.network.regions[1].fill='#0000ff';});
        store.updateVector(shape.id,n=>deleteParts(n,[],[diagonal])); expect(get().regions[0].fill).toBe(null);
        store.undo(); expect(get().regions.map(r=>r.fill).sort()).toEqual(['#0000ff','#ff0000']);
    });
    it('creates a transparent hole, preserves it on movement, and removes fills when opening boundaries', () => {
        const {store,shape,ids,get}=fixture(); paint(store,shape.id);
        store.updateVector(shape.id,n=>{square(n,25,25,50);});
        store.updateShape(shape.id,s=>{if(s.type==='vector') {const n=s.components.network, f=deriveFaces(n).find(f=>faceContains(f,{x:50,y:50}))!; n.regions.find(r=>r.key===f.key)!.fill=null;}});
        expect(get().regions.filter(r=>r.fill)).toHaveLength(1);
        const s=store.getSnapshot().document.shapes[0] as VectorShape;
        expect(vectorHit(s,{x:50,y:50},1)).toBe(false); expect(vectorHit(s,{x:10,y:10},1)).toBe(true);
        store.updateVector(shape.id,n=>movePoints(n,[ids[0]],{x:-10,y:-10})); expect(get().regions.filter(r=>r.fill)).toHaveLength(1);
        store.updateVector(shape.id,n=>deleteParts(n,[],[n.segments[0].id])); expect(get().regions.filter(r=>r.fill)).toHaveLength(0);
    });
    it('splits cubic segments exactly and merges endpoints into branches', () => {
        const n=makeVector().components.network, a=addPoint(n,{x:0,y:0}), b=addPoint(n,{x:100,y:0}); connect(n,a,b);
        n.segments[0].c1={x:0,y:100}; n.segments[0].c2={x:100,y:100}; const before=structuredClone(n);
        const id=splitSegment(n,n.segments[0].id,.3);
        for(const t of [.1,.2,.5,.8]) {const s=t<=.3?n.segments[0]:n.segments[1], u=t<=.3?t/.3:(t-.3)/.7; const p=curvePoint(n,s,u), q=curvePoint(before,before.segments[0],t); expect(p.x).toBeCloseTo(q.x); expect(p.y).toBeCloseTo(q.y);}
        const extra=addPoint(n,{x:50,y:50}); connect(n,extra,addPoint(n,{x:70,y:90})); mergePoints(n,[id,extra]); expect(n.segments.filter(s=>s.a===id||s.b===id)).toHaveLength(3);
    });
    it('joins crossings explicitly and preserves four branches', () => {
        const n=makeVector().components.network, ids=square(n); connect(n,ids[0],ids[2]); connect(n,ids[1],ids[3]);
        const id=joinCrossing(n,{x:50,y:50},3)!;
        expect(n.points.find(p=>p.id===id)!.x).toBeCloseTo(50); expect(n.points.find(p=>p.id===id)!.y).toBeCloseTo(50); expect(n.segments.filter(s=>s.a===id||s.b===id)).toHaveLength(4);
        expect(deriveFaces(n)).toHaveLength(4); expect(joinCrossing(n,{x:200,y:200},3)).toBe(null);
    });
    it('inserts at the clicked location on collinear cubics with uneven parameter spacing', () => {
        const n=makeVector().components.network, a=addPoint(n,{x:0,y:0}), b=addPoint(n,{x:0,y:300});
        connect(n,a,b); n.segments[0].c1={x:0,y:70};
        const hit=nearestSegment(n,{x:0,y:150},1)!;
        const id=splitSegment(n,hit.segment,hit.t), p=n.points.find(p=>p.id===id)!;
        expect(Math.abs(p.y-150)).toBeLessThan(.1);
    });
    it('keeps smooth handle pairs aligned at branches and makes corner handles independent', () => {
        const n=makeVector().components.network, center=addPoint(n,{x:50,y:50}), left=addPoint(n,{x:0,y:50}), right=addPoint(n,{x:100,y:50}), top=addPoint(n,{x:50,y:0});
        const a=connect(n,left,center)!, b=connect(n,center,right)!; connect(n,center,top);
        smoothPair(n,center,[a,b]); moveHandle(n,a,'c2',{x:30,y:30});
        const handle=n.segments.find(s=>s.id===b)!.c1!; expect(handle.x).toBeGreaterThan(50); expect(handle.x-50).toBeCloseTo(handle.y-50);
        const old={...handle}; n.smooth=[]; moveHandle(n,a,'c2',{x:10,y:50}); expect(n.segments.find(s=>s.id===b)!.c1).toEqual(old);
    });
    it('groups point drags into one undo and cancellation preserves redo', () => {
        const {store,shape,ids,get}=fixture(); const before=store.toJSON();
        store.beginTransaction('Drag'); const baseline=get();
        for(let x=1;x<20;x++) store.updateVector(shape.id,n=>{n.points=structuredClone(baseline.points);movePoints(n,[ids[0]],{x,y:0});},baseline);
        store.commitTransaction(); const after=store.toJSON(); store.undo(); expect(store.toJSON()).toBe(before);
        store.beginTransaction('Cancelled'); store.updateVector(shape.id,n=>movePoints(n,[ids[0]],{x:30,y:0})); store.cancelTransaction(); expect(store.getSnapshot().canRedo).toBe(true);
        store.redo(); expect(store.toJSON()).toBe(after);
    });
    it('moves and resizes geometry with handles and retains fills', () => {
        const {store,shape,get}=fixture(); paint(store,shape.id); const before=get();
        store.updateShape(shape.id,s=>{if(s.type==='vector') {resizeVector(s.components.network,before,200,300);s.components.network.origin={x:20,y:30};}});
        expect(vectorBounds(get())).toEqual({x:20,y:30,width:200,height:300}); expect(get().regions[0].fill).toBe('#ff0000');
    });
});
describe('vector documents', () => {
    it('loads the runnable curved multi-region example with its transparent hole', () => { const doc = deserializeDocument(readFileSync(new URL('../examples/vector-network.json', import.meta.url), 'utf8')); const n = (doc.shapes[0] as VectorShape).components.network; expect(n.regions).toHaveLength(3); expect(n.regions.filter(r=>r.fill)).toHaveLength(2); });
    it('round trips networks, curves, holes and independent region colors', () => {
        const {store,shape}=fixture(); store.updateVector(shape.id,n=>{square(n,20,20,30);n.segments[0].c1={x:30,y:-20};}); paint(store,shape.id);
        const json=store.toJSON(); expect(serializeDocument(deserializeDocument(json))).toBe(json);
    });
    it('migrates version 4 and rejects malformed references, fields, and numbers', () => {
        const old={...emptyDocument(),version:4}; expect(deserializeDocument(JSON.stringify(old)).version).toBe(5);
        const {store}=fixture();
        for(const corrupt of [(s:any)=>s.components.network.segments[0].a='missing',(s:any)=>s.components.network.points.push(s.components.network.points[0]),(s:any)=>s.components.network.points[0].x=null,(s:any)=>s.components.network.regions[0].loops[0][0].segment='missing',(s:any)=>s.components.network.extra=true,(s:any)=>s.components.network.regions[0].loops[0].pop(),(s:any)=>s.components.network.smooth=[{point:s.components.network.points[0].id,segments:['missing','other']}]]) {const doc=JSON.parse(store.toJSON());corrupt(doc.shapes[0]);expect(()=>deserializeDocument(JSON.stringify(doc))).toThrow();}
    });
    it('deletes grouped vectors atomically and restores group membership on undo', () => {
        const {store,shape}=fixture(); store.createGroup('page_1',[shape.id],'Vectors'); const before=store.toJSON();
        store.beginTransaction('Delete selection'); store.removeShape(shape.id); store.commitTransaction();
        expect(store.getSnapshot().document.pages[0].groups).toEqual([]); expect(store.getSnapshot().document.shapes).toEqual([]);
        expect(()=>deserializeDocument(store.toJSON())).not.toThrow(); store.undo(); expect(store.toJSON()).toBe(before);
    });
    it('round trips a resized network with crossing curves', () => {
        const {store,shape,ids,get}=fixture();
        store.updateVector(shape.id,n=>{ const a=connect(n,ids[0],ids[2])!; connect(n,ids[1],ids[3]); const s=n.segments.find(s=>s.id===a)!; s.c1={x:10,y:80}; s.c2={x:90,y:20}; });
        paint(store,shape.id); const baseline=get();
        store.updateShape(shape.id,s=>{if(s.type==='vector')resizeVector(s.components.network,baseline,170,240);});
        expect(()=>deserializeDocument(store.toJSON())).not.toThrow(); expect(get().regions.every(r=>r.fill==='#ff0000')).toBe(true);
    });
    it('duplicates and pastes independent networks with fills; tabs have isolated history', () => {
        const {store,shape,get}=fixture(); paint(store,shape.id); const original=get();
        const [id]=store.duplicateShapes([shape.id]); store.updateVector(id,n=>movePoints(n,[n.points[0].id],{x:20,y:30})); expect(get()).toEqual(original);
        const other=new EditorStore(); other.pasteShapes([store.getSnapshot().document.shapes[0]],[]); const json=other.toJSON(); store.undo(); expect(other.toJSON()).toBe(json);
        expect((other.getSnapshot().document.shapes[0] as VectorShape).components.network.regions[0].fill).toBe('#ff0000');
    });
});
