export function setupMeetings() {
  const root = document.querySelector("#meetings");
  const $ = (selector) => root.querySelector(selector);
  let ws, localStream, screenStream, roomId, selfId, hostId, iceServers = [];
  const peers = new Map();
  const status = (value) => { $("#meeting-status").textContent = value; };
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
    const peer = { pc, tile, candidates: [] };
    peers.set(id, peer);
    return peer;
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
    $("#meeting-live").hidden = true;
    roomId = selfId = hostId = undefined;
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
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
    roomId = id;
    $("#meeting-live").hidden = false;
    $("#meeting-title").textContent = room.title;
    $("#host-controls").hidden = true;
    videoTile("You", localStream);
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${location.host}/api/meetings/${id}/socket`);
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "welcome") {
          selfId = data.id;
          hostId = data.hostId;
          $("#host-controls").hidden = selfId !== hostId;
          $("#lock-room").textContent = room.locked ? "Unlock room" : "Lock room";
          for (const peer of data.peers) makePeer(peer.id, peer.name);
          status("Joined meeting. Share this meeting ID with signed-in participants.");
        } else if (data.type === "joined") {
          const peer = makePeer(data.id, data.name);
          await peer.pc.setLocalDescription(await peer.pc.createOffer());
          send({ type: "signal", to: data.id,
            signal: { type: "offer", sdp: peer.pc.localDescription.sdp } });
        } else if (data.type === "signal") await signalFrom(data);
        else if (data.type === "left") removePeer(data.id);
        else if (data.type === "chat") entry(data.name, data.text);
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
    } catch (error) { status(error.message); }
  });
  $("#meeting-join").onclick = () => join($("#meeting-id").value.trim())
    .catch((error) => { leave(); status(error.message); });
  $("#meeting-leave").onclick = () => { leave(); status("Left meeting"); };
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
      if (screenStream) { screenStream.getTracks().forEach((track) => track.stop()); return; }
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = screenStream.getVideoTracks()[0];
      const restore = async () => {
        screenStream = undefined;
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
    },
    hide() { leave(); root.hidden = true; }
  };
}
