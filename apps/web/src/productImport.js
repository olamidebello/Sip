import {parseCsv} from './contactsCsv.js';
export const productHeaders=['sku','name','category','description','terms','billing','sellingCents','resellerCents','setupCents'];
export function parseProductImport(source,json=false){
 if(source.length>2*1024*1024)throw Error('File exceeds 2 MB');
 let products;
 if(json){const data=JSON.parse(source);products=Array.isArray(data)?data:data.products;}
 else{
  const rows=parseCsv(source.replace(/^\uFEFF/,'')),header=rows.shift()?.map(v=>v.trim());
  if(!productHeaders.every(key=>header?.includes(key)))throw Error('CSV requires columns: '+productHeaders.join(', '));
  products=rows.map(row=>Object.fromEntries(productHeaders.map(key=>[key,row[header.indexOf(key)]])));
 }
 if(!Array.isArray(products)||!products.length||products.length>500)throw Error('Choose 1 to 500 products');
 const seen=new Set();
 return products.map((p,i)=>{
  const fail=()=>{throw Error('Invalid or duplicate product at row '+(i+1));};
  if(!p||typeof p.sku!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(p.sku)||seen.has(p.sku))fail();
  seen.add(p.sku);
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>180||typeof p.category!=='string'||!p.category.trim()||p.category.length>100||
    typeof p.description!=='string'||p.description.length>4000||typeof p.terms!=='string'||p.terms.length>4000||!['one_time','monthly','quarterly','annual'].includes(p.billing))fail();
  const out=Object.fromEntries(productHeaders.map(k=>[k,p[k]]));
  for(const k of ['sellingCents','resellerCents','setupCents']){
   if(p[k]===null||p[k]===undefined||typeof p[k]==='boolean'||String(p[k]).trim()==='')fail();
   out[k]=Number(p[k]);if(!Number.isSafeInteger(out[k])||out[k]<0||out[k]>100000000)fail();
  }
  return out;
 });
}
