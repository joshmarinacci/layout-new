import type {Point, VectorNetwork, VectorSegment, VectorShape} from '../model/types';
import {deriveFaces, uid} from '../shapes/vectorNetworks';

type Matrix = [number, number, number, number, number, number];
type Cubic = {p0: Point; c1: Point; c2: Point; p1: Point};
type Subpath = {start: Point; segments: Cubic[]; closed: boolean};
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (a: Matrix, b: Matrix): Matrix => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const transformPoint = (m: Matrix, p: Point): Point => ({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
const point = (x: number, y: number): Point => ({x, y});
const lerp = (a: Point,b: Point,t:number):Point=>point(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
const line = (a: Point,b: Point): Cubic => ({p0:a,c1:lerp(a,b,1/3),c2:lerp(a,b,2/3),p1:b});
const numbers = (value: string) => value.match(/[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?/g)?.map(Number) ?? [];

function arcSegments(from:Point,rxInput:number,ryInput:number,rotation:number,largeArc:number,sweep:number,to:Point):Cubic[] {
    let rx=Math.abs(rxInput),ry=Math.abs(ryInput);
    if(largeArc!==0&&largeArc!==1||sweep!==0&&sweep!==1)throw new Error('SVG arc flags must be 0 or 1');
    if(Math.hypot(to.x-from.x,to.y-from.y)<1e-12)return[];
    if(rx<1e-12||ry<1e-12)return[line(from,to)];
    const phi=rotation*Math.PI/180,cos=Math.cos(phi),sin=Math.sin(phi),dx=(from.x-to.x)/2,dy=(from.y-to.y)/2;
    const xp=cos*dx+sin*dy,yp=-sin*dx+cos*dy;
    const scale=xp*xp/(rx*rx)+yp*yp/(ry*ry);
    if(scale>1){const factor=Math.sqrt(scale);rx*=factor;ry*=factor;}
    const numerator=Math.max(0,rx*rx*ry*ry-rx*rx*yp*yp-ry*ry*xp*xp);
    const denominator=rx*rx*yp*yp+ry*ry*xp*xp;
    const sign=largeArc===sweep?-1:1,coef=denominator===0?0:sign*Math.sqrt(numerator/denominator);
    const cxp=coef*(rx*yp/ry),cyp=coef*(-ry*xp/rx);
    const cx=cos*cxp-sin*cyp+(from.x+to.x)/2,cy=sin*cxp+cos*cyp+(from.y+to.y)/2;
    const ux=(xp-cxp)/rx,uy=(yp-cyp)/ry,vx=(-xp-cxp)/rx,vy=(-yp-cyp)/ry;
    let startAngle=Math.atan2(uy,ux),delta=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);
    if(!sweep&&delta>0)delta-=2*Math.PI;else if(sweep&&delta<0)delta+=2*Math.PI;
    const count=Math.ceil(Math.abs(delta)/(Math.PI/2)),step=delta/count;
    const at=(angle:number)=>point(cx+rx*cos*Math.cos(angle)-ry*sin*Math.sin(angle),cy+rx*sin*Math.cos(angle)+ry*cos*Math.sin(angle));
    const derivative=(angle:number)=>point(-rx*cos*Math.sin(angle)-ry*sin*Math.cos(angle),-rx*sin*Math.sin(angle)+ry*cos*Math.cos(angle));
    const result:Cubic[]=[];
    for(let j=0;j<count;j++){const a=startAngle+j*step,b=a+step,k=4/3*Math.tan((b-a)/4),p0=j===0?from:at(a),p1=j===count-1?to:at(b),d0=derivative(a),d1=derivative(b);result.push({p0,c1:point(p0.x+k*d0.x,p0.y+k*d0.y),c2:point(p1.x-k*d1.x,p1.y-k*d1.y),p1});}
    return result;
}

function parseTransform(value: string): Matrix {
    let matrix = IDENTITY;
    for (const match of value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
        const args = numbers(match[2]), name = match[1];
        let next: Matrix = IDENTITY;
        if (name === 'matrix' && args.length === 6) next = args as Matrix;
        else if (name === 'translate') next = [1,0,0,1,args[0]??0,args[1]??0];
        else if (name === 'scale') next = [args[0]??1,0,0,args[1]??args[0]??1,0,0];
        else if (name === 'rotate') {
            const angle=(args[0]??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=args[1]??0,y=args[2]??0;
            next=multiply([1,0,0,1,x,y],multiply([c,s,-s,c,0,0],[1,0,0,1,-x,-y]));
        } else if (name === 'skewX') next=[1,0,Math.tan((args[0]??0)*Math.PI/180),1,0,0];
        else if (name === 'skewY') next=[1,Math.tan((args[0]??0)*Math.PI/180),0,1,0,0];
        else throw new Error(`Unsupported SVG transform: ${name}`);
        matrix=multiply(matrix,next);
    }
    return matrix;
}

function pathData(data: string): Subpath[] {
    const tokens=data.match(/[a-zA-Z]|[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?/g) ?? [];
    const paths:Subpath[]=[]; let i=0, cmd='', current=point(0,0), start=point(0,0), previousControl:Point|null=null, lastCmd='';
    const hasNumber=()=>i<tokens.length&&!/[a-zA-Z]/.test(tokens[i]);
    const read=()=>{if(!hasNumber())throw new Error('Malformed SVG path data');return Number(tokens[i++]);};
    const readPoint=(relative:boolean)=>{const p=point(read(),read());return relative?point(current.x+p.x,current.y+p.y):p;};
    const add=(segment:Cubic)=>{const path=paths.at(-1);if(!path)throw new Error('SVG path must begin with moveto');path.segments.push(segment);current=segment.p1;};
    while(i<tokens.length){if(/[a-zA-Z]/.test(tokens[i]))cmd=tokens[i++];else if(!cmd)throw new Error('Malformed SVG path data');
        const relative=cmd===cmd.toLowerCase(), upper=cmd.toUpperCase();
        if(upper==='Z'){const path=paths.at(-1);if(path){if(Math.hypot(current.x-start.x,current.y-start.y)>1e-8)add(line(current,start));path.closed=true;current=start;}previousControl=null;lastCmd=cmd;cmd='';continue;}
        if(upper==='M'){const p=readPoint(relative);current=p;start=p;paths.push({start:p,segments:[],closed:false});cmd=relative?'l':'L';previousControl=null;lastCmd='M';continue;}
        if(upper==='L'){add(line(current,readPoint(relative)));}
        else if(upper==='H'){const x=read();add(line(current,point(relative?current.x+x:x,current.y)));}
        else if(upper==='V'){const y=read();add(line(current,point(current.x,relative?current.y+y:y)));}
        else if(upper==='C'){const c1=readPoint(relative),c2=readPoint(relative),p=readPoint(relative);add({p0:current,c1,c2,p1:p});previousControl=c2;}
        else if(upper==='S'){const c1=(lastCmd.toUpperCase()==='C'||lastCmd.toUpperCase()==='S')&&previousControl?point(2*current.x-previousControl.x,2*current.y-previousControl.y):current,c2=readPoint(relative),p=readPoint(relative);add({p0:current,c1,c2,p1:p});previousControl=c2;}
        else if(upper==='Q'||upper==='T'){const control:Point=upper==='T'&&(lastCmd.toUpperCase()==='Q'||lastCmd.toUpperCase()==='T')&&previousControl?point(2*current.x-previousControl.x,2*current.y-previousControl.y):upper==='Q'?readPoint(relative):current,p=readPoint(relative);add({p0:current,c1:lerp(current,control,2/3),c2:lerp(p,control,2/3),p1:p});previousControl=control;}
        else if(upper==='A'){const rx=read(),ry=read(),rotation=read(),largeArc=read(),sweep=read(),p=readPoint(relative),from=current,segments=arcSegments(from,rx,ry,rotation,largeArc,sweep,p);for(const segment of segments)add(segment);if(!segments.length)current=p;}
        else throw new Error(`Unsupported SVG path command: ${cmd}`);
        if(!['C','S','Q','T'].includes(upper))previousControl=null;
        lastCmd=cmd;
    }
    return paths.filter(path=>path.segments.length>0);
}

function ellipsePath(cx:number,cy:number,rx:number,ry:number):Subpath {
    const k=0.5522847498307936,start=point(cx+rx,cy), p1=point(cx,cy+ry),p2=point(cx-rx,cy),p3=point(cx,cy-ry);
    return {start,closed:true,segments:[{p0:start,c1:point(cx+rx,cy+k*ry),c2:point(cx+k*rx,cy+ry),p1},{p0:p1,c1:point(cx-k*rx,cy+ry),c2:point(cx-rx,cy+k*ry),p1:p2},{p0:p2,c1:point(cx-rx,cy-k*ry),c2:point(cx-k*rx,cy-ry),p1:p3},{p0:p3,c1:point(cx+k*rx,cy-ry),c2:point(cx+rx,cy-k*ry),p1:start}]};
}

function elementPaths(el:Element):Subpath[] {
    const num=(key:string, fallback=0)=>Number(el.getAttribute(key)??fallback);
    switch(el.localName){
        case 'path': return pathData(el.getAttribute('d')??'');
        case 'rect': {const x=num('x'),y=num('y'),w=num('width'),h=num('height');if(w<=0||h<=0)return[];return[{start:point(x,y),closed:true,segments:[line(point(x,y),point(x+w,y)),line(point(x+w,y),point(x+w,y+h)),line(point(x+w,y+h),point(x,y+h)),line(point(x,y+h),point(x,y))]}];}
        case 'circle': return [ellipsePath(num('cx'),num('cy'),num('r'),num('r'))];
        case 'ellipse': return [ellipsePath(num('cx'),num('cy'),num('rx'),num('ry'))];
        case 'line': {const a=point(num('x1'),num('y1')),b=point(num('x2'),num('y2'));return[{start:a,closed:false,segments:[line(a,b)]}];}
        case 'polyline': case 'polygon': {const ns=numbers(el.getAttribute('points')??''),ps:Point[]=[];for(let i=0;i+1<ns.length;i+=2)ps.push(point(ns[i],ns[i+1]));if(ps.length<2)return[];const closed=el.localName==='polygon';const segs=ps.slice(1).map((p,i)=>line(ps[i],p));if(closed)segs.push(line(ps.at(-1)!,ps[0]));return[{start:ps[0],closed,segments:segs}];}
        default:return[];
    }
}

function style(el:Element,parent:Record<string,string>) {
    const result={...parent};
    for(const key of ['fill','stroke','stroke-width','fill-rule','opacity','fill-opacity','stroke-opacity'])if(el.hasAttribute(key))result[key]=el.getAttribute(key)!;
    for(const declaration of (el.getAttribute('style')??'').split(';')){const [key,value]=declaration.split(':').map(part=>part.trim());if(key&&value)result[key]=value;}
    return result;
}

function makeShape(paths:Subpath[], matrix:Matrix, fill:string, stroke:string, strokeWidth:number, name:string, fillRule='nonzero'):VectorShape {
    const network:VectorNetwork={kind:'vector-network',origin:{x:0,y:0},points:[],segments:[],regions:[],smooth:[]};
    for(const path of paths){
        const coords=path.segments.map(segment=>segment.p0);
        if(!path.closed)coords.push(path.segments.at(-1)!.p1);
        const ids=coords.map(p=>{const q=transformPoint(matrix,p),id=uid();network.points.push({id,x:q.x,y:q.y});return id;});
        path.segments.forEach((segment,index)=>{const p0=transformPoint(matrix,segment.p0),p1=transformPoint(matrix,segment.p1),c1=transformPoint(matrix,segment.c1),c2=transformPoint(matrix,segment.c2),b=path.closed&&index===path.segments.length-1?ids[0]:ids[index+1];const linear1=lerp(p0,p1,1/3),linear2=lerp(p0,p1,2/3);const isLine=Math.hypot(c1.x-linear1.x,c1.y-linear1.y)<1e-8&&Math.hypot(c2.x-linear2.x,c2.y-linear2.y)<1e-8;const s:VectorSegment={id:uid(),a:ids[index],b,c1:isLine?null:c1,c2:isLine?null:c2};network.segments.push(s);});
    }
    const contourPolygons=paths.map(path=>{
        const points:Point[]=[];
        for(const segment of path.segments){
            const p0=segment.p0,c1=segment.c1,c2=segment.c2,p1=segment.p1;
            for(let i=0;i<12;i++){const t=i/12,u=1-t;points.push(transformPoint(matrix,point(u*u*u*p0.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*p1.x,u*u*u*p0.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*p1.y)));}
        }
        return points;
    });
    const windingAt=(p:Point)=>contourPolygons.reduce((total,poly)=>{
        let winding=0;
        for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];if(a.y<=p.y){if(b.y>p.y&&(b.x-a.x)*(p.y-a.y)-(p.x-a.x)*(b.y-a.y)>0)winding++;}else if(b.y<=p.y&&(b.x-a.x)*(p.y-a.y)-(p.x-a.x)*(b.y-a.y)<0)winding--;}
        return total+winding;
    },0);
    const regions=deriveFaces(network);network.regions=regions.map(face=>{const winding=windingAt(face.sample),inside=fillRule==='evenodd'?Math.abs(winding)%2===1:winding!==0;return{key:face.key,loops:face.loops,fill:fill!=='none'&&inside?fill:null};});
    return{id:uid(),pageId:'page_1',name,type:'vector',components:{network,stroke:{kind:'stroke-component',color:stroke==='none'?'#000000':stroke,width:stroke==='none'?0:strokeWidth}}};
}

function closeForSvgFill(path:Subpath):Subpath {
    if(path.closed)return path;
    const last=path.segments.at(-1);
    if(!last)return path;
    const segments=[...path.segments];
    if(Math.hypot(last.p1.x-path.start.x,last.p1.y-path.start.y)>1e-8)segments.push(line(last.p1,path.start));
    return{start:path.start,segments,closed:true};
}

export interface SvgImportResult {shapes:VectorShape[];warnings:string[]}
export function importSvg(source:string):SvgImportResult {
    if(source.length>5_000_000)throw new Error('SVG files must be smaller than 5 MB');
    if(/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('SVG document types and entities are not allowed');
    const doc=new DOMParser().parseFromString(source,'image/svg+xml');
    if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw new Error('Invalid SVG document');
    if(doc.querySelector('script,foreignObject,image,use,iframe,style'))throw new Error('SVG scripts, stylesheets, images, and external references are not supported');
    const shapes:VectorShape[]=[],warnings:string[]=[];let count=0;
    const walk=(el:Element,parentMatrix:Matrix,parentStyle:Record<string,string>)=>{
        if(++count>5000)throw new Error('SVG contains too many elements (maximum 5000)');
        const matrix=multiply(parentMatrix,parseTransform(el.getAttribute('transform')??'')),currentStyle=style(el,parentStyle);
        const supported=['svg','g','defs','title','desc','path','rect','circle','ellipse','line','polyline','polygon'];
        if(!supported.includes(el.localName)){warnings.push(`Skipped unsupported <${el.localName}> element`);return;}
        if(el.localName==='defs'||el.localName==='title'||el.localName==='desc')return;
        if(['path','rect','circle','ellipse','line','polyline','polygon'].includes(el.localName)){
            const fill=currentStyle.fill??'#000000',stroke=currentStyle.stroke??'none',width=Number(currentStyle['stroke-width']??1)*Math.sqrt(Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2]));
            if(!Number.isFinite(width)||width<0)throw new Error('SVG has an invalid stroke width');
            let paths:Subpath[];try{paths=elementPaths(el);}catch(error){warnings.push(`Skipped ${el.localName}: ${error instanceof Error?error.message:'unsupported geometry'}`);paths=[];}
            try{
                const name=el.getAttribute('id')||`${el.localName} ${shapes.length+1}`,fillRule=currentStyle['fill-rule']??'nonzero';
                if(fill!=='none'&&paths.some(path=>!path.closed)){
                    shapes.push(makeShape(paths.map(closeForSvgFill),matrix,fill,'none',0,stroke==='none'?name:`${name} fill`,fillRule));
                    if(stroke!=='none')shapes.push(makeShape(paths,matrix,'none',stroke,width,`${name} stroke`,fillRule));
                }else shapes.push(makeShape(paths,matrix,fill,stroke,width,name,fillRule));
            }
            catch(error){warnings.push(`Skipped ${el.localName} geometry: ${error instanceof Error?error.message:'unsupported geometry'}`);}
            if(currentStyle.opacity&&Number(currentStyle.opacity)<1)warnings.push('Element opacity is not preserved');
        }
        Array.from(el.children).forEach(child=>walk(child,matrix,currentStyle));
    };
    walk(doc.documentElement,IDENTITY,{fill:'#000000',stroke:'none','stroke-width':'1','fill-rule':'nonzero'});
    if(!shapes.length)throw new Error('No supported vector geometry found in this SVG');
    return{shapes,warnings:[...new Set(warnings)]};
}
