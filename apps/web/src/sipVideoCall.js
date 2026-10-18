const TYPE='application/vnd.olamide.video+json';
export function createSipVideoCall({onChange=()=>{},getMedia=constraints=>navigator.mediaDevices.getUserMedia(constraints),id=()=>crypto.randomUUID(),setTimer=setTimeout,clearTimer=clearTimeout}) {
  let phone,session,previousDelegate,delegate,pending,timer,revision=0,busy=false,facing='user',cameraAllowed=false,mediaHandler,mediaFactory;
  let state={phase:'voice',message:'',camera:false};
  const publish=patch=>{state={...state,...patch};onChange({...state,local:phone?.localMediaStream,remote:phone?.remoteMediaStream});};
  const localVideo=()=>phone?.localMediaStream?.getVideoTracks()||[];
  const sender=()=>session?.sessionDescriptionHandler?.peerConnection?.getTransceivers().find(t=>t.sender.track?.kind==='video'||t.receiver.track?.kind==='video')?.sender;
  const constraints=video=>({...session.sessionDescriptionHandlerOptionsReInvite,constraints:{audio:true,video}});
  function clearPending(){clearTimer(timer);timer=undefined;pending=undefined;}
  function stopCamera(){for(const track of localVideo()){track.stop();phone.localMediaStream?.removeTrack(track);}void sender()?.replaceTrack(null)?.catch(()=>{});}
  function voice(message='Voice call continues.') {
    clearPending();cameraAllowed=false;stopCamera();
    if(session)session.sessionDescriptionHandlerOptionsReInvite=constraints(false);
    publish({phase:'voice',camera:false,message});
  }
  function arm(){clearTimer(timer);timer=setTimer(()=>{if(pending){void signal('cancel',pending.id).catch(()=>{});voice('Video request expired. Voice call continues.');}},30000);timer?.unref?.();}
  async function signal(action,requestId) {
    if(!session||session.state!=='Established')throw Error('Connect a voice call before enabling video.');
    const own=revision;
    await session.info({requestOptions:{body:{contentDisposition:'render',contentType:TYPE,content:JSON.stringify({action,id:requestId})}},requestDelegate:{onReject:()=>{if(own===revision&&pending?.id===requestId)voice('The other device does not support this video request.');}}});
  }
  async function negotiate() {
    const own=revision,current=session,requestId=pending?.id,audio=phone.localMediaStream?.getAudioTracks().map(track=>track.enabled)||[];
    cameraAllowed=true;
    publish({phase:'negotiating',message:'Starting video…'});
    try {
      await current.invite({sessionDescriptionHandlerOptions:constraints(true),requestDelegate:{
        onAccept:()=>{if(own!==revision||pending?.id!==requestId)return;clearPending();phone.localMediaStream?.getAudioTracks().forEach((track,i)=>{track.enabled=audio[i]??true;});publish({phase:'video',camera:localVideo().some(t=>t.readyState==='live'),message:'Video call'});},
        onReject:()=>{if(own===revision&&pending?.id===requestId)voice('Video was not accepted. Voice call continues.');}
      }});
    } catch(error) {if(own===revision)voice('Unable to enable video: '+error.message);}
  }
  async function receive(info) {
    const contentType=info.request.getHeader('content-type')?.split(';')[0].trim().toLowerCase();
    if(contentType!==TYPE){if(previousDelegate?.onInfo)return previousDelegate.onInfo(info);return info.reject({statusCode:415});}
    let message;
    try{message=JSON.parse(info.request.body);if(!['request','accept','decline','cancel'].includes(message.action)||!/^[-a-zA-Z0-9]{16,64}$/.test(message.id))throw Error();}
    catch{return info.reject({statusCode:400});}
    await info.accept();
    if(message.action==='request') {
      if(state.phase!=='voice'){await signal('decline',message.id);return;}
      pending={id:message.id,direction:'incoming'};arm();publish({phase:'incoming',message:'The other caller wants to switch to video.'});return;
    }
    if(!pending||pending.id!==message.id)return;
    if(message.action==='accept'&&pending.direction==='outgoing'&&state.phase==='requesting'){await negotiate();return;}
    if(message.action==='decline'||message.action==='cancel')voice('Video request declined or canceled. Voice call continues.');
  }
  return {
    attach(nextPhone) {
      if(nextPhone?.session===session)return;
      this.reset();phone=nextPhone;session=phone?.session;
      if(!session)return;
      previousDelegate=session.delegate||{};
      mediaHandler=session.sessionDescriptionHandler;
      mediaFactory=mediaHandler?.mediaStreamFactory;
      if(typeof mediaFactory==='function')mediaHandler.mediaStreamFactory=async(constraints,...rest)=>{
        const own=revision,muted=!!phone?.isMuted?.();
        const stream=await mediaFactory.call(mediaHandler,{...constraints,video:cameraAllowed?constraints.video:false},...rest);
        if(own!==revision){stream?.getTracks?.().forEach(track=>track.stop());throw Error('Call ended during camera access');}
        stream?.getAudioTracks?.().forEach(track=>{track.enabled=!muted;});
        if(!cameraAllowed)for(const track of stream?.getVideoTracks?.()||[]){track.stop();stream.removeTrack(track);}
        return stream;
      };
      delegate={...previousDelegate,onInfo:info=>{void receive(info).catch(error=>voice(error.message));},onInvite:(...args)=>{
        previousDelegate.onInvite?.(...args);
        if(args[2]===200&&state.phase==='negotiating') {
          const sdp=session.sessionDescriptionHandler?.peerConnection?.remoteDescription?.sdp||'';
          if(!/^m=video [1-9][0-9]* /m.test(sdp))return;
          phone.localMediaStream?.getAudioTracks().forEach(track=>{track.enabled=!phone.isMuted();});
          clearPending();publish({phase:'video',camera:localVideo().some(t=>t.readyState==='live'),message:'Video call'});
        } else if(args[2]>=400&&state.phase==='negotiating')voice('Video could not start. Voice call continues.');
      }};
      session.delegate=delegate;publish({phase:'voice',camera:false,message:''});
    },
    async request() {
      if(!session||session.state!=='Established')throw Error('Connect a voice call before enabling video.');
      if(state.phase==='video')return this.camera();
      if(state.phase!=='voice'||busy)return;
      pending={id:id(),direction:'outgoing'};arm();publish({phase:'requesting',message:'Waiting for the other caller to accept video…'});
      try{await signal('request',pending.id);}catch(error){voice('Video request failed: '+error.message);}
    },
    async accept() {
      if(state.phase!=='incoming'||!pending)return;
      const requestId=pending.id;
      cameraAllowed=true;
      session.sessionDescriptionHandlerOptionsReInvite=constraints(true);
      publish({phase:'negotiating',message:'Starting video…'});
      try{await signal('accept',requestId);}catch(error){voice(error.message);}
    },
    async decline() {if(!pending)return;const requestId=pending.id;voice();await signal('decline',requestId).catch(()=>{});},
    async camera() {
      if(state.phase!=='video'||busy)return;
      if(localVideo().some(track=>track.readyState==='live')){cameraAllowed=false;stopCamera();publish({camera:false,message:'Camera off. You can still see the other caller.'});return;}
      await this.changeCamera(facing);
    },
    async flip(){if(state.phase==='video'&&!busy)await this.changeCamera(facing==='user'?'environment':'user');},
    async changeCamera(nextFacing) {
      if(busy||!session)return;
      busy=true;const own=revision;let stream;
      try {
        stream=await getMedia({audio:false,video:{facingMode:{ideal:nextFacing}}});
        if(own!==revision){stream.getTracks().forEach(t=>t.stop());return;}
        const track=stream.getVideoTracks()[0],output=sender();
        if(!track||!output)throw Error('Camera switching is unavailable on this device.');
        await output.replaceTrack(track);
        if(own!==revision){stream.getTracks().forEach(t=>t.stop());return;}
        for(const old of localVideo()){old.stop();phone.localMediaStream.removeTrack(old);}
        phone.localMediaStream.addTrack(track);facing=nextFacing;
        cameraAllowed=true;
        publish({camera:true,message:'Video call'});
      }catch(error){stream?.getTracks().forEach(t=>t.stop());if(own===revision)publish({message:error.name==='NotAllowedError'?'Camera permission denied. Voice call continues.':error.message});}
      finally{if(own===revision)busy=false;}
    },
    refresh(){if(session&&state.phase==='video')publish({});},
    reset(){revision++;busy=false;cameraAllowed=false;clearPending();stopCamera();if(session&&session.delegate===delegate)session.delegate=previousDelegate;if(mediaHandler&&mediaFactory)mediaHandler.mediaStreamFactory=mediaFactory;mediaHandler=undefined;mediaFactory=undefined;phone=undefined;session=undefined;delegate=undefined;previousDelegate=undefined;state={phase:'voice',message:'',camera:false};onChange({...state});},
    get state(){return {...state};}
  };
}

export function setupSipVideoCall({document,active,button,getPhone,onStatus=()=>{}}) {
  const stage=document.createElement('section');stage.className='sip-video-stage';stage.hidden=true;
  stage.innerHTML='<video class="sip-video-remote" autoplay playsinline muted></video><video class="sip-video-self" autoplay playsinline muted></video><p class="sip-video-message" role="status"></p><div class="sip-video-actions"><button type="button" data-camera>Camera off</button><button type="button" data-flip>Flip camera</button></div>';
  const prompt=document.createElement('section');prompt.className='sip-video-prompt';prompt.hidden=true;prompt.setAttribute('role','alertdialog');prompt.setAttribute('aria-label','Switch to video call');
  prompt.innerHTML='<p>The other caller wants to switch to video.</p><button type="button" data-accept>Switch to video</button><button type="button" data-decline>Keep voice call</button>';
  active.append(stage,prompt);
  const remote=stage.querySelector('.sip-video-remote'),local=stage.querySelector('.sip-video-self'),message=stage.querySelector('.sip-video-message');
  const css=document.createElement('style');css.textContent=`
    .sip-video-stage[hidden],.sip-video-prompt[hidden]{display:none!important}
    .sip-video-stage{position:absolute;inset:0 0 145px;background:#071017;overflow:hidden;border-radius:16px;z-index:1}
    .sip-video-remote{width:100%;height:100%;object-fit:contain;background:#071017}
    .sip-video-self{position:absolute;right:16px;top:16px;width:27%;max-width:180px;aspect-ratio:3/4;object-fit:cover;border-radius:12px;transform:scaleX(-1);background:#23333d}
    .sip-video-message{position:absolute;left:12px;bottom:48px;color:white;background:#0008;padding:6px;border-radius:6px}
    .sip-video-actions{position:absolute;bottom:8px;left:12px;display:flex;gap:8px}
    .sip-video-prompt{position:absolute;top:25%;left:5%;width:90%;box-sizing:border-box;z-index:20;background:#172d36;color:white;padding:24px;border-radius:20px;box-shadow:0 8px 40px #0008}
    .sip-video-prompt button{margin:6px;min-height:48px}
    #active.sip-video-mode .call-hero{visibility:hidden}
    body #active.sip-video-mode .call-controls{position:absolute;bottom:calc(12px + env(safe-area-inset-bottom));left:12px;right:12px;width:calc(100% - 24px);max-width:none;z-index:4;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;padding:12px 6px}
    body #active.sip-video-mode .call-controls button{min-width:0;font-size:11px;gap:6px}
    body #active.sip-video-mode .call-controls button svg{width:22px;height:22px;padding:10px}
    body #active.sip-video-mode .call-minimize{z-index:6}
    #active.sip-video-mode.call-minimized .sip-video-stage{display:none}
  `;document.head.append(css);
  const controller=createSipVideoCall({onChange:state=>{
    const video=state.phase==='video';stage.hidden=!video;prompt.hidden=state.phase!=='incoming';active.classList.toggle('sip-video-mode',video);
    if(remote.srcObject!==state.remote)remote.srcObject=state.remote||null;
    if(local.srcObject!==state.local)local.srcObject=state.local||null;
    if(video){void remote.play()?.catch(()=>{});void local.play()?.catch(()=>{});}
    message.textContent=state.message;button.disabled=['requesting','incoming','negotiating'].includes(state.phase);
    button.setAttribute('aria-pressed',String(video&&state.camera));button.setAttribute('aria-label',video?'Toggle camera':'Switch this call to video');
    stage.querySelector('[data-camera]').textContent=state.camera?'Camera off':'Camera on';
    local.hidden=!state.camera;
    if(state.message)onStatus(state.message);
  }});
  button.onclick=()=>{void controller.request().catch(error=>onStatus(error.message));};
  prompt.querySelector('[data-accept]').onclick=()=>void controller.accept();
  prompt.querySelector('[data-decline]').onclick=()=>void controller.decline();
  stage.querySelector('[data-camera]').onclick=()=>void controller.camera();
  stage.querySelector('[data-flip]').onclick=()=>void controller.flip();
  let timer;
  return {active(value){clearInterval(timer);if(value){controller.attach(getPhone());timer=setInterval(()=>controller.refresh(),500);}else controller.reset();},dispose(){clearInterval(timer);controller.reset();stage.remove();prompt.remove();css.remove();}};
}
