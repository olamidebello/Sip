export function setupProfilePhoto({document,request,get}){
 const avatar=document.getElementById('messenger-settings-avatar');let owner=null,generation=0,busy=false;
 const controls=document.createElement('div');controls.className='profile-photo-controls';
 const choose=document.createElement('button');choose.type='button';choose.textContent='Change picture';
 const remove=document.createElement('button');remove.type='button';remove.textContent='Remove picture';remove.hidden=true;
 const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.hidden=true;input.setAttribute('aria-label','Choose profile picture');
 const status=document.createElement('p');status.setAttribute('role','status');
 controls.append(choose,remove,input,status);avatar.parentElement.append(controls);
 function render(photo){avatar.replaceChildren();if(photo){const image=document.createElement('img');image.src=photo;image.alt='';image.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:50%';avatar.append(image);}else avatar.textContent=(owner?.name||'').slice(0,2).toUpperCase();remove.hidden=!photo;}
 function lock(value){busy=value;choose.disabled=value;remove.disabled=value;}
 choose.onclick=()=>input.click();
 input.onchange=async()=>{const file=input.files?.[0];input.value='';if(!file||!owner||busy)return;const current=generation;lock(true);status.textContent='Saving picture…';try{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Choose a JPEG, PNG or WebP image up to 5 MB.');
  const image=await document.defaultView.createImageBitmap(file);
  let photo;try{const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,256,256);const size=Math.min(image.width,image.height);context.drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,256,256);photo=canvas.toDataURL('image/jpeg',0.85);}finally{image.close();}
  if(current!==generation)return;const saved=await request('/api/account/photo',{photo},'PUT');if(current!==generation)return;render(saved.photo);status.textContent='Profile picture saved.';
 }catch(error){if(current===generation)status.textContent=error.message;}finally{if(current===generation)lock(false);}};
 remove.onclick=async()=>{if(!owner||busy)return;const current=generation;lock(true);try{await request('/api/account/photo',{},'DELETE');if(current===generation){render(null);status.textContent='Profile picture removed.';}}catch(error){if(current===generation)status.textContent=error.message;}finally{if(current===generation)lock(false);}};
 return {async refresh(value){owner=value;const current=++generation;lock(false);render(null);status.textContent='';if(!value)return;try{const data=await get('/api/account/photo');if(current===generation)render(data.photo);}catch(error){if(current===generation)status.textContent=error.message;}},clear(){owner=null;generation++;render(null);status.textContent='';lock(false);}};
}
