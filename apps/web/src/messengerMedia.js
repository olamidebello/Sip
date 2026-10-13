import {icon} from './messengerIcons.js';
export function appendAttachment(document,item,message){
 if(!message.attachment_id||!message.attachment_mime)return;
 const url='/api/messenger/attachments/'+encodeURIComponent(message.attachment_id),mime=message.attachment_mime;
 let media;
 if(mime.startsWith('image/')){media=document.createElement('img');media.alt=message.attachment_name||'Shared image';media.loading='lazy';}
 else if(mime.startsWith('audio/')){media=document.createElement('audio');media.controls=true;media.preload='none';}
 else if(mime.startsWith('video/')){media=document.createElement('video');media.controls=true;media.playsInline=true;media.preload='metadata';}
 if(media){media.src=url;media.className='messenger-media';item.append(media);}
 const download=document.createElement('a');download.href=url;download.textContent=message.attachment_name||'Download attachment';download.download=message.attachment_name||'attachment';download.className='messenger-download';item.append(download);
}
export function setupMediaComposer({document,form,request,onError,voice=true}){
 const compact=form.id==='send-message';
 const toolbar=document.createElement('div');toolbar.className='messenger-media-tools';
 const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/gif,image/webp,audio/webm,audio/ogg,audio/mp4,video/webm,video/mp4,application/pdf';input.setAttribute('aria-label','Attach a file (up to 2 MB)');
 const preview=document.createElement('span');preview.setAttribute('role','status');
 const remove=document.createElement('button');remove.type='button';remove.textContent='Remove attachment';remove.hidden=true;
 let attachment=null,recorder=null,stream=null,timeout=null,disposed=false,uploading=false,gesture=null,suppressClick=0,cancelRecording=false,generation=0;
 async function upload(file){
  if(disposed||uploading)return;
  if(file.size>2*1024*1024){onError('File limit is 2 MB');return;}
  const version=generation;uploading=true;input.disabled=true;preview.textContent='Uploading…';
  try{
   if(attachment)await request('/api/messenger/attachments/'+attachment.id,{},'DELETE');attachment=null;
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Could not read file'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});
   const result=await request('/api/messenger/attachments',{name:file.name,mime:file.type,data});
   if(disposed||version!==generation){await request('/api/messenger/attachments/'+result.id,{},'DELETE');return;}
   attachment=result;const body=form.querySelector('textarea[name=body]');if(body&&!body.value)body.value=result.name;preview.textContent=result.name;remove.hidden=false;
  }catch(error){preview.textContent='';onError(error.message);}finally{uploading=false;input.disabled=false;input.value='';}
 }
 input.onchange=()=>{if(input.files[0])void upload(input.files[0]);};
 remove.onclick=async()=>{try{if(attachment)await request('/api/messenger/attachments/'+attachment.id,{},'DELETE');reset();}catch(error){onError(error.message);}};
 if(compact){input.hidden=true;const attach=document.createElement('button');attach.type='button';attach.className='chat-attach';attach.innerHTML=icon('attach');attach.setAttribute('aria-label','Attach file');attach.title='Attach file (up to 2 MB)';attach.onclick=()=>input.click();remove.innerHTML=icon('close');remove.setAttribute('aria-label','Remove attachment');remove.title='Remove attachment';preview.className='chat-attachment-preview';toolbar.append(input,attach,preview,remove);}else toolbar.append(input,preview,remove);form.prepend(toolbar);
 let record;
 function setRecordLabel(label){if(compact)record.innerHTML=icon(label==='Stop recording'?'stop':'mic');else record.textContent=label;record.setAttribute('aria-label',label);}
 function stopTracks(){clearTimeout(timeout);stream?.getTracks().forEach(track=>track.stop());stream=null;}
 if(voice){
  record=document.createElement('button');record.type='button';setRecordLabel('Record voice note');record.className='chat-record';record.setAttribute('aria-pressed','false');toolbar.append(record);
  record.onclick=async event=>{
   if(event&&Date.now()<suppressClick)return;
   if(recorder?.state==='recording'){recorder.stop();return;}
   if(!document.defaultView.navigator.mediaDevices?.getUserMedia||!document.defaultView.MediaRecorder){onError('Voice recording is unavailable in this browser');return;}
   try{
    cancelRecording=false;
    stream=await document.defaultView.navigator.mediaDevices.getUserMedia({audio:true});
    if(disposed||cancelRecording||(gesture&&!gesture.pressed&&!gesture.locked)){stopTracks();gesture=null;return;}
    const MediaRecorder=document.defaultView.MediaRecorder;const mime=['audio/webm','audio/ogg','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mime){stopTracks();onError('This browser has no supported recording format');return;}
    recorder=new MediaRecorder(stream,{mimeType:mime});let chunks=[],bytes=0;
    recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);bytes+=event.data.size;if(bytes>2*1024*1024&&recorder.state==='recording')recorder.stop();}};
    recorder.onstop=()=>{stopTracks();setRecordLabel('Record voice note');record.setAttribute('aria-pressed','false');if(!disposed&&!cancelRecording)void upload(new File(chunks,'voice-note.'+(mime==='audio/ogg'?'ogg':mime==='audio/mp4'?'m4a':'webm'),{type:mime}));gesture=null;cancelRecording=false;};
    recorder.onerror=()=>{stopTracks();setRecordLabel('Record voice note');onError('Voice recording failed');};
    recorder.start(1000);setRecordLabel('Stop recording');record.setAttribute('aria-pressed','true');timeout=setTimeout(()=>{if(recorder?.state==='recording')recorder.stop();},60000);
   }catch(error){stopTracks();onError(error.message);}
  };
  record.addEventListener('pointerdown',event=>{
   if(event.pointerType!=='touch'&&event.pointerType!=='pen')return;
   if(recorder?.state==='recording')return;
   gesture={id:event.pointerId,x:event.clientX,y:event.clientY,pressed:true,locked:false};suppressClick=Date.now()+2000;record.setPointerCapture?.(event.pointerId);void record.onclick();
  });
  record.addEventListener('pointermove',event=>{
   if(!gesture||gesture.id!==event.pointerId||!gesture.pressed)return;
   if(event.clientX-gesture.x<-80){cancelRecording=true;gesture.pressed=false;if(recorder?.state==='recording')recorder.stop();preview.textContent='Recording canceled';}
   else if(event.clientY-gesture.y<-80){gesture.locked=true;preview.textContent='Recording locked. Tap Stop recording to finish.';}
  });
  record.addEventListener('pointerup',event=>{if(gesture?.id!==event.pointerId)return;gesture.pressed=false;suppressClick=Date.now()+500;if(!gesture.locked&&recorder?.state==='recording')recorder.stop();});
  record.addEventListener('pointercancel',()=>{if(gesture){gesture.pressed=false;cancelRecording=true;if(recorder?.state==='recording')recorder.stop();}});
  record.title='Tap to record; on touch, hold to record, slide left to cancel or up to lock';
 }
 function reset(){generation++;if(recorder?.state==='recording'){cancelRecording=true;recorder.stop();}stopTracks();attachment=null;preview.textContent='';remove.hidden=true;input.value='';}
 return {get id(){return attachment?.id||null;},get name(){return attachment?.name||'';},get busy(){return uploading||recorder?.state==='recording';},reset,stop(){disposed=true;if(recorder?.state==='recording')recorder.stop();stopTracks();reset();},resume(){disposed=false;}};
}
