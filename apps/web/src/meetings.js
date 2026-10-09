export function setupMeetings() {
  const root = document.querySelector("#meetings");
  const $ = (selector) => root.querySelector(selector);
  let ws, localStream, screenStream, roomId, selfId, hostId, localTile,handRaised=false;
  let iceServers = [], features = {},policy={};
  const peers = new Map();
  const status = (value) => { $("#meeting-status").textContent = value; };
  const meetingLink = () => {
    const id=(roomId || $("#meeting-id").value).trim();
    if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Select a meeting first');
    const url=new URL(location.origin+'/');url.searchParams.set('meeting',id);url.hash='meetings';return url.href;
  };
  const participantCount=()=>{$('#meeting-participants').textContent=`${roomId?peers.size+1:0} participant(s) connected (maximum 4)`;};
  function applyPolicy(next){policy=next||{};
    $('#meeting-copy').hidden=policy.allowLinks===false;
    $('#meeting-native-share').hidden=policy.allowLinks===false;
    $('#meeting-invite').hidden=selfId!==hostId||policy.allowInvites===false;
    $('#meeting-share').hidden=!features.screen_share||policy.allowScreenShare===false;
    $('#meeting-chat-form').hidden=policy.allowChat===false;
    $('#meeting-hand').hidden=policy.allowHand===false;
    $('#meeting-reaction').hidden=policy.allowReactions===false;
  }
  const api = async (path, body) => {
    const response = await fetch(path, body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Meeting request failed");
    return data;
  };
  const send = (data) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  };
  const entry = (name, text) => {
    const item = document.createElement("li");
    item.textContent = `${name}: ${text}`;
    $("#meeting-chat").append(item);
  };
  function removePeer(id) {
    const peer = peers.get(id);
    if (!peer) return;
    peer.pc.close();
    peer.tile.remove();
    peers.delete(id);
    participantCount();
  }
  function showPointer(tile, x, y) {
    const video = tile.querySelector("video");
    const dot = document.createElement("span");
    dot.className = "meeting-pointer";
    dot.style.left = video.offsetLeft + video.clientWidth * x + "px";
    dot.style.top = video.offsetTop + video.clientHeight * y + "px";
    tile.append(dot);
    setTimeout(() => dot.remove(), 900);
  }
  function videoTile(name, stream, id) {
    const tile = document.createElement("div");
    const label = document.createElement("p");
    label.textContent = name;
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = !id;
    video.srcObject = stream;
    tile.append(label, video);
    if (id && selfId === hostId) {
      const kick = document.createElement("button");
      kick.textContent = "Remove";
      kick.onclick = () => send({ type: "kick", to: id });
      tile.append(kick);
    }
    $("#meeting-videos").append(tile);
    return tile;
  }
  function makePeer(id, name) {
    if (peers.has(id)) return peers.get(id);
    const pc = new RTCPeerConnection({ iceServers });
    const currentVideo = screenStream?.getVideoTracks()[0] || localStream.getVideoTracks()[0];
    for (const track of localStream.getAudioTracks()) pc.addTrack(track, localStream);
    if (currentVideo) pc.addTrack(currentVideo, screenStream || localStream);
    else pc.addTransceiver("video", { direction: "sendrecv" });
    const remote = new MediaStream();
    const tile = videoTile(name, remote, id);
    pc.ontrack = (event) => {
      if (!remote.getTracks().some((track) => track.id === event.track.id))
        remote.addTrack(event.track);
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) send({ type: "signal", to: id,
        signal: { type: "candidate", candidate: event.candidate.toJSON() } });
    };
    const assist = document.createElement("button");
    assist.type = "button";
    assist.textContent = "Request pointer assistance";
    assist.hidden = true;
    assist.onclick = () => {
      send({ type:"assist-request", to:id });
      status("Pointer assistance requested. The sharer must approve.");
    };
    tile.append(assist);
    const peer = { pc, tile, assist, candidates: [], screenActive:false, granted:false,
      lastPointer:0 };
    tile.querySelector("video").addEventListener("pointermove", (event) => {
      if (!peer.granted || !peer.screenActive || Date.now() - peer.lastPointer < 70) return;
      peer.lastPointer = Date.now();
      const rect = event.currentTarget.getBoundingClientRect();
      send({ type:"pointer", to:id,
        x:Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
        y:Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) });
    });
    peers.set(id, peer);
    participantCount();
    return peer;
  }
  function setPeerScreen(id, active) {
    const peer = peers.get(id);
    if (!peer) return;
    peer.screenActive = active;
    peer.assist.hidden = !active || !features.remote_assist;
    if (!active) peer.granted = false;
    peer.tile.querySelector("p").textContent =
      (peer.name || id.slice(0, 8)) + (active ? " — sharing screen" : "");
  }
  function addGrant(viewerId, name) {
    const row = document.createElement("div");
    row.dataset.viewer = viewerId;
    row.append(document.createTextNode(name + " can point at your shared screen. "));
    const revoke = document.createElement("button");
    revoke.textContent = "Revoke";
    revoke.onclick = () => {
      send({ type:"assist-revoke", to:viewerId });
      row.remove();
    };
    row.append(revoke);
    $("#assist-grants").append(row);
  }
  async function signalFrom(message) {
    const peer = makePeer(message.from, message.from.slice(0, 8));
    const { pc } = peer;
    const signal = message.signal;
    if (signal.type === "candidate") {
      if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
      else peer.candidates.push(signal.candidate);
      return;
    }
    await pc.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
    for (const candidate of peer.candidates.splice(0)) await pc.addIceCandidate(candidate);
    if (signal.type === "offer") {
      await pc.setLocalDescription(await pc.createAnswer());
      send({ type: "signal", to: message.from,
        signal: { type: "answer", sdp: pc.localDescription.sdp } });
    }
  }
  function leave() {
    ws?.close();
    ws = undefined;
    for (const id of peers.keys()) removePeer(id);
    localStream?.getTracks().forEach((track) => track.stop());
    screenStream?.getTracks().forEach((track) => track.stop());
    localStream = screenStream = undefined;
    $("#meeting-videos").replaceChildren();
    $("#meeting-chat").replaceChildren();
    $("#assist-requests").replaceChildren();
    $("#assist-grants").replaceChildren();
    $("#meeting-live").hidden = true;
    roomId = selfId = hostId = localTile = undefined;
    handRaised=false;$('#meeting-hand').textContent='Raise hand';$('#meeting-invite').hidden=true;participantCount();
  }
  function videoSender(pc) {
    return pc.getTransceivers().find((transceiver) =>
      transceiver.receiver.track.kind === "video")?.sender;
  }
  async function join(id) {
    if (roomId) leave();
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Enter a valid meeting ID");
    const [room, config] = await Promise.all([
      api("/api/meetings/" + id), api("/api/meetings/config")
    ]);
    iceServers = config.iceServers;
    features = config.features || {};
    policy=config.policy||{};
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    roomId = id;
    $('#meeting-id').value=id;
    $("#meeting-live").hidden = false;
    $("#meeting-title").textContent = room.title;
    $("#host-controls").hidden = true;
    localTile = videoTile("You", localStream);
    $("#meeting-share").hidden = !features.screen_share;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${location.host}/api/meetings/${id}/socket`);
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "welcome") {
          selfId = data.id;
          hostId = data.hostId;
          applyPolicy(data.policy);
          $("#host-controls").hidden = selfId !== hostId;
          $('#meeting-invite').hidden=selfId!==hostId;
          $("#lock-room").textContent = room.locked ? "Unlock room" : "Lock room";
          for (const peer of data.peers) {
            makePeer(peer.id, peer.name).name = peer.name;
            setPeerScreen(peer.id, peer.screenActive);
          }
          participantCount();status('Joined meeting. Use Copy meeting link or Invite to meeting to share it.');
        } else if (data.type === "joined") {
          const peer = makePeer(data.id, data.name);
          peer.name = data.name;
          await peer.pc.setLocalDescription(await peer.pc.createOffer());
          send({ type: "signal", to: data.id,
            signal: { type: "offer", sdp: peer.pc.localDescription.sdp } });
        } else if (data.type === "signal") await signalFrom(data);
        else if (data.type === "left") removePeer(data.id);
        else if (data.type === "chat") entry(data.name, data.text);
        else if(data.type==='hand')entry(data.name,data.raised?'raised a hand':'lowered a hand');
        else if(data.type==='reaction')entry(data.name,'👏');
        else if(data.type==='policy'){applyPolicy(data.policy);status('Meeting settings were updated by an administrator.');}
        else if (data.type === "screen-state") setPeerScreen(data.from, data.active);
        else if (data.type === "screen-stop") {
          screenStream?.getTracks().forEach((track) => track.stop());
          screenStream=undefined;
          if(localTile)localTile.querySelector('video').srcObject=localStream;
          const camera=localStream?.getVideoTracks()[0];
          await Promise.allSettled([...peers.values()].map(async({pc})=>{
            const sender=videoSender(pc);if(sender)await sender.replaceTrack(camera||null);}));
          $('#assist-requests').replaceChildren();$('#assist-grants').replaceChildren();
          $('#meeting-share').textContent='Share screen';
          applyPolicy(policy);
          status("Screen-sharing permission was removed");
        } else if (data.type === "assist-request" && screenStream) {
          const row = document.createElement("div");
          row.textContent = data.name + " requests pointer assistance on your shared screen. ";
          for (const approved of [true,false]) {
            const button = document.createElement("button");
            button.textContent = approved ? "Allow pointer" : "Deny";
            button.onclick = () => {
              send({ type:"assist-response", to:data.from, approved });
              if (approved) addGrant(data.from, data.name);
              row.remove();
            };
            row.append(button);
          }
          $("#assist-requests").append(row);
        } else if (data.type === "assist-response") {
          const peer = peers.get(data.from);
          if (peer) peer.granted = data.approved;
          status(data.approved ? "Pointer access approved. Move over the shared video to point."
            : "Pointer request declined");
        } else if (data.type === "assist-revoked") {
          const peer = peers.get(data.sharer);
          if (peer) peer.granted = false;
          status("Pointer access ended");
        } else if (data.type === "pointer" && localTile && screenStream) {
          showPointer(localTile, data.x, data.y);
        }
      } catch (error) { status(error.message); }
    };
    ws.onclose = () => {
      if (roomId === id) { leave(); status("Meeting connection closed"); }
    };
    ws.onerror = () => status("Meeting signaling connection failed");
  }
  $("#meeting-create").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const { id } = await api("/api/meetings",
        { title: new FormData(event.currentTarget).get("title") });
      $("#meeting-id").value = id;
      status("Room created. Share the meeting ID with signed-in participants.");
      await join(id);
      await refreshMeetings();
    } catch (error) { status(error.message); }
  });
  $("#meeting-join").onclick = () => join($("#meeting-id").value.trim())
    .catch((error) => { leave(); status(error.message); });
  $("#meeting-leave").onclick = () => { leave(); status("Left meeting"); };
  async function refreshMeetings(){
    const {meetings}=await api('/api/meetings');const list=$('#meeting-list');list.replaceChildren();
    for(const room of meetings){const row=document.createElement('li'),button=document.createElement('button');
      button.type='button';button.textContent=`Open ${room.title}${room.locked?' (locked)':''}`;
      button.onclick=()=>join(room.id).catch(error=>status(error.message));row.append(button);
      const copy=document.createElement('button');copy.type='button';copy.textContent='Copy link';
      copy.onclick=async()=>{try{$('#meeting-id').value=room.id;await navigator.clipboard.writeText(meetingLink());status('Meeting link copied');}catch(error){status(error.message);}};
      if(policy.allowLinks!==false)row.append(copy);list.append(row);}
  }
  $('#meeting-refresh').onclick=()=>refreshMeetings().catch(error=>status(error.message));
  $('#meeting-copy').onclick=async()=>{try{await navigator.clipboard.writeText(meetingLink());status('Meeting link copied');}catch(error){status(error.message);}};
  $('#meeting-native-share').onclick=async()=>{try{const url=meetingLink();
    if(navigator.share)await navigator.share({title:'Join my meeting',url});
    else {await navigator.clipboard.writeText(url);status('Meeting link copied');}
  }catch(error){if(error.name!=='AbortError')status(error.message);}};
  $('#meeting-invite').onsubmit=async event=>{event.preventDefault();try{
    await api(`/api/meetings/${roomId}/invite`,{email:new FormData(event.currentTarget).get('email')});
    event.currentTarget.reset();status('Invitation saved. The recipient can open it from My meetings.');
  }catch(error){status(error.message);}};
  $('#meeting-hand').onclick=()=>{handRaised=!handRaised;send({type:'hand',raised:handRaised});
    $('#meeting-hand').textContent=handRaised?'Lower hand':'Raise hand';};
  $('#meeting-reaction').onclick=()=>send({type:'reaction',reaction:'applause'});
  $("#meeting-mic").onclick = () => {
    const track = localStream?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; $("#meeting-mic").textContent = track.enabled ? "Mute" : "Unmute"; }
  };
  $("#meeting-camera").onclick = () => {
    const track = localStream?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; $("#meeting-camera").textContent = track.enabled ? "Camera off" : "Camera on"; }
  };
  $("#meeting-share").onclick = async () => {
    try {
      if (!features.screen_share) throw new Error("Screen sharing is unavailable for your groups");
      if (screenStream) { screenStream.getTracks().forEach((track) => track.stop()); return; }
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = screenStream.getVideoTracks()[0];
      const restore = async () => {
        if (!screenStream) return;
        screenStream = undefined;
        send({ type:"screen-state", active:false });
        $("#assist-requests").replaceChildren();
        $("#assist-grants").replaceChildren();
        if (localTile) localTile.querySelector("video").srcObject = localStream;
        const camera = localStream?.getVideoTracks()[0];
        await Promise.allSettled([...peers.values()].map(async ({ pc }) => {
          const sender = videoSender(pc);
          if (sender) await sender.replaceTrack(camera || null);
        }));
        $("#meeting-share").textContent = "Share screen";
      };
      track.onended = restore;
      await Promise.all([...peers.values()].map(async ({ pc }) => {
        const sender = videoSender(pc);
        if (sender) await sender.replaceTrack(track);
      }));
      if (localTile) localTile.querySelector("video").srcObject = screenStream;
      send({ type:"screen-state", active:true });
      $("#meeting-share").textContent = "Stop sharing";
    } catch (error) { status(error.message); }
  };
  $("#meeting-chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = new FormData(event.currentTarget).get("text");
    send({ type: "chat", text });
    event.currentTarget.reset();
  });
  $("#lock-room").onclick = async () => {
    try {
      const locked = $("#lock-room").textContent === "Lock room";
      await api(`/api/meetings/${roomId}/lock`, { locked });
      $("#lock-room").textContent = locked ? "Unlock room" : "Lock room";
    } catch (error) { status(error.message); }
  };
  $("#end-room").onclick = async () => {
    try { await api(`/api/meetings/${roomId}/end`, {}); leave(); status("Meeting ended"); }
    catch (error) { status(error.message); }
  };
  return {
    show() {
      root.hidden = false;
      const invited = new URL(location.href).searchParams.get("meeting");
      if (invited) $("#meeting-id").value = invited;
      refreshMeetings().catch(error=>status(error.message));
      api('/api/meetings/config').then(config=>{features=config.features||{};applyPolicy(config.policy);}).catch(error=>status(error.message));
    },
    hide() { leave(); root.hidden = true; }
  };
}
