import {randomInt,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {deflateSync} from 'node:zlib';
export const captchaHash=(id,answer)=>createHash('sha256').update(`${id}:${answer}`).digest('hex');
const digits={2:['11111','00001','00001','11111','10000','10000','11111'],3:['11111','00001','00001','11111','00001','00001','11111'],4:['10001','10001','10001','11111','00001','00001','00001'],5:['11111','10000','10000','11111','00001','00001','11111'],6:['11111','10000','10000','11111','10001','10001','11111'],7:['11111','00001','00010','00100','01000','01000','01000'],8:['11111','10001','10001','11111','10001','10001','11111'],9:['11111','10001','10001','11111','00001','00001','11111']};
function crc32(buffer){let c=0xffffffff;for(const b of buffer){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc]);}
export function captchaPng(answer){
 const width=240,height=76,pixels=Buffer.alloc(width*height*3,245);
 const set=(x,y,r,g,b)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<width&&y>=0&&y<height){const i=(y*width+x)*3;pixels[i]=r;pixels[i+1]=g;pixels[i+2]=b;}};
 for(let i=0;i<800;i++)set(randomInt(width),randomInt(height),randomInt(130,230),randomInt(130,230),randomInt(130,230));
 [...answer].forEach((d,i)=>{const top=randomInt(12,25),left=i*37+10,slant=randomInt(-3,4);digits[d].forEach((row,y)=>[...row].forEach((bit,x)=>{if(bit==='1')for(let dx=0;dx<4;dx++)for(let dy=0;dy<5;dy++)set(left+x*4+dx+slant*y/7,top+y*5+dy,20,35,65);}));});
 for(let line=0;line<4;line++){const y0=randomInt(height),y1=randomInt(height);for(let x=0;x<width;x++)set(x,y0+(y1-y0)*x/width,100,125,160);}
 const raw=Buffer.alloc(height*(width*3+1));for(let y=0;y<height;y++)pixels.copy(raw,y*(width*3+1)+1,y*width*3,(y+1)*width*3);
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export async function issueCaptcha(pool){
 const id=randomUUID(),answer=Array.from({length:6},()=>String(randomInt(2,10))).join('');
 await pool.query('DELETE FROM signup_captchas WHERE expires_at<UTC_TIMESTAMP(3) LIMIT 500');
 await pool.query('INSERT INTO signup_captchas(id,answer_hash,expires_at) VALUES($1,$2,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE))',[id,captchaHash(id,answer)]);
 return {captchaId:id,image:`data:image/png;base64,${captchaPng(answer).toString('base64')}`,expiresInSeconds:300};
}
export async function consumeCaptcha(pool,id,answer){
 if(!/^[0-9a-f-]{36}$/i.test(id||'')||typeof answer!=='string'||!/^\d{6}$/.test(answer.trim()))return false;
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');const row=(await db.query('SELECT answer_hash,expires_at FROM signup_captchas WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(row)await db.query('DELETE FROM signup_captchas WHERE id=$1',[id]);
  const valid=!!row&&new Date(row.expires_at).getTime()>Date.now()&&timingSafeEqual(Buffer.from(row.answer_hash,'hex'),Buffer.from(captchaHash(id,answer.trim()),'hex'));
  await db.query('COMMIT');return valid;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}

