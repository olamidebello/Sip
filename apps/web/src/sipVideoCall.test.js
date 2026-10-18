import test from 'node:test';
import assert from 'node:assert/strict';
import {createSipVideoCall} from './sipVideoCall.js';
const requestId='12345678-1234-1234-1234-123456789012';
function fixture() {
  const sent=[],tracks=[{kind:'audio',enabled:true,readyState:'live',stop(){this.readyState='ended';}}];
  const stream={getTracks:()=>tracks,getAudioTracks:()=>tracks.filter(t=>t.kind==='audio'),getVideoTracks:()=>tracks.filter(t=>t.kind==='video'),addTrack:t=>tracks.push(t),removeTrack:t=>{const i=tracks.indexOf(t);if(i>=0)tracks.splice(i,1);}};
  const sender={track:null,replaceTrack:async track=>{sender.track=track;}};
  let invites=0,timer,captures=0;
  const previousInfo=()=>{previousInfo.called=true;};
  const session={state:'Established',delegate:{onInfo:previousInfo},sessionDescriptionHandlerOptionsReInvite:{},
    sessionDescriptionHandler:{mediaStreamFactory:async constraints=>{captures++;return constraints;},peerConnection:{getTransceivers:()=>[{sender,receiver:{track:{kind:'video'}}}],remoteDescription:{sdp:'m=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'}}},
    info:async options=>{sent.push(JSON.parse(options.requestOptions.body.content));},
    invite:async options=>{invites++;session.lastInvite=options;}
  };
  const phone={session,localMediaStream:stream,remoteMediaStream:{},isMuted:()=>false};
  const controller=createSipVideoCall({id:()=>requestId,setTimer:fn=>{timer=fn;return 1;},clearTimer:()=>{},getMedia:async()=>{captures++;return {getVideoTracks:()=>[{kind:'video',enabled:true,readyState:'live',stop(){this.readyState='ended';}}],getTracks(){return this.getVideoTracks();}};}});
  controller.attach(phone);
  const receive=async(action,id=requestId)=>{session.delegate.onInfo({request:{getHeader:()=> 'application/vnd.olamide.video+json',body:JSON.stringify({action,id})},accept:async()=>{},reject:async()=>{}});await new Promise(resolve=>setImmediate(resolve));};
  return {controller,session,phone,sent,tracks,receive,previousInfo,sender,invites:()=>invites,captures:()=>captures,expire:()=>timer()};
}
test('click requests consent without acquiring camera or starting a different call',async()=>{
 const f=fixture();await f.controller.request();assert.equal(f.controller.state.phase,'requesting');assert.equal(f.captures(),0);assert.equal(f.invites(),0);assert.equal(f.sent[0].action,'request');
 await f.receive('accept');assert.equal(f.invites(),1);assert.equal(f.session.lastInvite.sessionDescriptionHandlerOptions.constraints.video,true);
 f.session.lastInvite.requestDelegate.onAccept();assert.equal(f.controller.state.phase,'video');
});
test('decline and unsupported peer keep voice media intact',async()=>{
 const f=fixture();await f.controller.request();await f.receive('decline');assert.equal(f.controller.state.phase,'voice');assert.equal(f.tracks[0].readyState,'live');assert.equal(f.invites(),0);
});
test('incoming request requires an explicit accept before camera is permitted',async()=>{
 const f=fixture();await f.receive('request');assert.equal(f.controller.state.phase,'incoming');
 let constraints=await f.session.sessionDescriptionHandler.mediaStreamFactory({audio:true,video:true});assert.equal(constraints.video,false);
 await f.controller.accept();constraints=await f.session.sessionDescriptionHandler.mediaStreamFactory({audio:true,video:true});assert.equal(constraints.video,true);assert.equal(f.sent.at(-1).action,'accept');
});
test('timeout and late accept cannot start video',async()=>{
 const f=fixture();await f.controller.request();f.expire();await f.receive('accept');assert.equal(f.invites(),0);assert.equal(f.controller.state.phase,'voice');
});
test('SIP rejection leaves voice call live and camera disabled',async()=>{
 const f=fixture();await f.controller.request();await f.receive('accept');f.session.lastInvite.requestDelegate.onReject();
 assert.equal(f.controller.state.phase,'voice');assert.equal(f.tracks[0].readyState,'live');
 const constraints=await f.session.sessionDescriptionHandler.mediaStreamFactory({audio:true,video:true});assert.equal(constraints.video,false);
});
test('camera off and cleanup stop camera without stopping microphone',async()=>{
 const f=fixture();await f.controller.request();await f.receive('accept');f.session.lastInvite.requestDelegate.onAccept();await f.controller.camera();
 const video=f.tracks.find(t=>t.kind==='video');assert.ok(video);await f.controller.camera();assert.equal(video.readyState,'ended');assert.equal(f.tracks[0].readyState,'live');
 f.controller.reset();assert.equal(f.session.delegate.onInfo,f.previousInfo);
});
test('unrelated INFO continues to the original DTMF handler',()=>{
 const f=fixture();f.session.delegate.onInfo({request:{getHeader:()=> 'application/dtmf-relay'}});assert.equal(f.previousInfo.called,true);
});
test('ending a call while camera permission is pending releases late media',async()=>{
 const f=fixture();let resolve,stopped=false;
 const c=createSipVideoCall({getMedia:()=>new Promise(r=>resolve=r)});c.attach(f.phone);
 const capture=c.changeCamera('user');c.reset();resolve({getTracks:()=>[{stop:()=>{stopped=true;}}]});await capture;assert.equal(stopped,true);
});
test('reacquired microphone stays muted before it is attached to the peer connection',async()=>{
 const f=fixture();f.controller.reset();const track={kind:'audio',enabled:true};
 f.phone.isMuted=()=>true;f.session.sessionDescriptionHandler.mediaStreamFactory=async()=>({getAudioTracks:()=>[track],getVideoTracks:()=>[]});
 f.controller.attach(f.phone);await f.session.sessionDescriptionHandler.mediaStreamFactory({audio:true,video:true});assert.equal(track.enabled,false);
});
test('camera permission denial retains the established call and microphone',async()=>{
 const f=fixture();f.controller.reset();const c=createSipVideoCall({getMedia:async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'});}});c.attach(f.phone);
 await c.changeCamera('user');assert.equal(f.session.state,'Established');assert.equal(f.tracks[0].readyState,'live');assert.match(c.state.message,/permission denied/);c.reset();
});
