import {readFileSync} from 'node:fs';
let cached;
export function boundaries(){
 if(!cached){const raw=JSON.parse(readFileSync(process.env.COUNTRY_BOUNDARIES_FILE||'/app/resources/countries.geojson','utf8'));cached=new Map();for(const f of raw.features||[]){const code=f.properties?.['ISO3166-1-Alpha-2'];if(/^[A-Z]{2}$/.test(code)){const list=cached.get(code)||[];list.push(...(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[]));cached.set(code,list);}}if(cached.size<200)throw Error('Country boundary resource incomplete');}return cached;
}
// Unwrap each edge around the query longitude to handle the antimeridian.
const relative=(x,origin)=>((x-origin+540)%360)-180;
function ring(point,coords){let inside=false,min=Infinity;const [lon,lat]=point,scale=Math.cos(lat*Math.PI/180),m=111195;
 for(let i=0,j=coords.length-1;i<coords.length;j=i++){
  let ax=relative(coords[j][0],lon),bx=relative(coords[i][0],lon);if(bx-ax>180)bx-=360;if(bx-ax< -180)bx+=360;
  const ay=coords[j][1]-lat,by=coords[i][1]-lat;
  if((ay>0)!==(by>0)&&0<(bx-ax)*(-ay)/(by-ay)+ax)inside=!inside;
  const x=ax*scale,y=ay,dx=(bx-ax)*scale,dy=by-ay,t=Math.max(0,Math.min(1,-(x*dx+y*dy)/(dx*dx+dy*dy||1)));
  min=Math.min(min,Math.hypot(x+t*dx,y+t*dy)*m);
 }return {inside,distance:min};
}
export function inCountry(polygons,p){
 if(!p||![p.latitude,p.longitude,p.accuracy].every(Number.isFinite)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180||p.accuracy<0||p.accuracy>10000)return false;
 return polygons.some(poly=>{const outer=ring([p.longitude,p.latitude],poly[0]);if(!outer.inside||outer.distance<=p.accuracy+100)return false;return poly.slice(1).every(h=>{const hole=ring([p.longitude,p.latitude],h);return !hole.inside&&hole.distance>p.accuracy+100;});});
}
export function countryVerdict(countries,p){if(!countries?.length)return {allowed:true};try{const data=boundaries();const allowed=countries.some(c=>inCountry(data.get(c)||[],p));return {allowed,reason:allowed?'Within selected service country':'Outside selected service countries or too close to a boundary'};}catch{return {allowed:false,reason:'Country boundary resource unavailable'};}}
