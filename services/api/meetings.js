import { WebSocketServer, WebSocket } from "ws";

const roomSockets = new Map();
const assistGrants = new Map();
const uuid = /^[0-9a-f-]{36}$/i;

export function attachMeetingSignaling(server, { pool, origin, currentUser }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024, perMessageDeflate: false });
  server.on("upgrade", async (req, socket, head) => {
    try {
      const path = new URL(req.url, origin).pathname;
      const match = /^\/api\/meetings\/([0-9a-f-]{36})\/socket$/i.exec(path);
      if (!match || !uuid.test(match[1]) || req.headers.origin !== origin)
        throw new Error("Invalid meeting origin or path");
      const user = await currentUser(req);
      if (!user?.features.meetings) throw new Error("Meetings unavailable");
      const result = await pool.query(
        "SELECT host_id,locked,ended_at FROM meeting_rooms WHERE id=$1 AND tenant_id=$2", [match[1],user.tenant_id]
      );
      const room = result.rows[0];
      if (!room || room.ended_at) throw new Error("Meeting unavailable");
      const peers = roomSockets.get(match[1]) || new Map();
      if (room.locked && user.id !== room.host_id) throw new Error("Meeting locked");
      if (peers.size >= 4 || peers.has(user.id)) throw new Error("Meeting full or already joined");
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.roomId = match[1];
        ws.userId = user.id;
        ws.tenantId = user.tenant_id;
        ws.name = user.display_name;
        ws.hostId = room.host_id;
        ws.features = user.features;
        ws.screenActive = false;
        ws.pendingAssist = new Set();
        ws.rate = { start: Date.now(), count: 0 };
        wss.emit("connection", ws);
      });
    } catch {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  });
  function send(ws, data) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }
  function revokeFor(roomId, userId) {
    const grants = assistGrants.get(roomId);
    const peers = roomSockets.get(roomId);
    if (!grants) return;
    for (const key of [...grants]) {
      const [viewer, sharer] = key.split(":");
      if (viewer === userId || sharer === userId) {
        grants.delete(key);
        send(peers?.get(viewer), { type:"assist-revoked", sharer });
      }
    }
    if (!grants.size) assistGrants.delete(roomId);
  }
  wss.on("connection", (ws) => {
    const peers = roomSockets.get(ws.roomId) || new Map();
    roomSockets.set(ws.roomId, peers);
    send(ws, { type: "welcome", id: ws.userId, hostId: ws.hostId,
      peers: [...peers.values()].map((peer) => ({
        id: peer.userId, name: peer.name, screenActive: peer.screenActive
      })) });
    peers.set(ws.userId, ws);
    for (const peer of peers.values()) if (peer !== ws)
      send(peer, { type: "joined", id: ws.userId, name: ws.name });
    ws.on("message", (raw) => {
      try {
        const now = Date.now();
        if (now - ws.rate.start > 10000) ws.rate = { start: now, count: 0 };
        if (++ws.rate.count > 50) return ws.close(1008, "Rate limit");
        const msg = JSON.parse(raw.toString());
        const participants = roomSockets.get(ws.roomId);
        if (participants?.get(ws.userId) !== ws) return;
        if (msg.type === "signal" && typeof msg.to === "string" &&
            ["offer","answer","candidate"].includes(msg.signal?.type)) {
          const signal = msg.signal;
          if ((signal.type === "candidate" && typeof signal.candidate === "object") ||
              (["offer","answer"].includes(signal.type) && typeof signal.sdp === "string")) {
            send(participants.get(msg.to), { type: "signal", from: ws.userId, signal });
          }
        } else if (msg.type === "chat" && typeof msg.text === "string" &&
                   msg.text.trim().length && msg.text.length <= 2000) {
          for (const peer of participants.values())
            send(peer, { type: "chat", from: ws.userId, name: ws.name, text: msg.text.trim() });
        } else if (msg.type === "screen-state" && ws.features.screen_share &&
                   typeof msg.active === "boolean") {
          ws.screenActive = msg.active;
          if (!msg.active) revokeFor(ws.roomId, ws.userId);
          for (const peer of participants.values()) if (peer !== ws)
            send(peer, { type:"screen-state", from:ws.userId, active:msg.active });
        } else if (msg.type === "assist-request" && ws.features.remote_assist &&
                   typeof msg.to === "string" && msg.to !== ws.userId) {
          const sharer = participants.get(msg.to);
          if (sharer?.features.screen_share && sharer.screenActive) {
            sharer.pendingAssist.add(ws.userId);
            send(sharer, { type:"assist-request", from:ws.userId, name:ws.name });
          }
        } else if (msg.type === "assist-response" && ws.features.screen_share &&
                   ws.screenActive && typeof msg.to === "string" &&
                   typeof msg.approved === "boolean" && ws.pendingAssist.delete(msg.to)) {
          const viewer = participants.get(msg.to);
          if (viewer?.features.remote_assist) {
            if (msg.approved) {
              const grants = assistGrants.get(ws.roomId) || new Set();
              grants.add(msg.to + ":" + ws.userId);
              assistGrants.set(ws.roomId, grants);
            }
            send(viewer, { type:"assist-response", from:ws.userId, approved:msg.approved });
          }
        } else if (msg.type === "assist-revoke" && ws.features.screen_share &&
                   typeof msg.to === "string") {
          assistGrants.get(ws.roomId)?.delete(msg.to + ":" + ws.userId);
          send(participants.get(msg.to), { type:"assist-revoked", sharer:ws.userId });
        } else if (msg.type === "pointer" && ws.features.remote_assist &&
                   typeof msg.to === "string" && Number.isFinite(msg.x) &&
                   Number.isFinite(msg.y) && msg.x >= 0 && msg.x <= 1 &&
                   msg.y >= 0 && msg.y <= 1 &&
                   assistGrants.get(ws.roomId)?.has(ws.userId + ":" + msg.to) &&
                   participants.get(msg.to)?.screenActive) {
          send(participants.get(msg.to), {
            type:"pointer", from:ws.userId, x:msg.x, y:msg.y
          });
        } else if (msg.type === "kick" && ws.userId === ws.hostId &&
                   typeof msg.to === "string" && msg.to !== ws.userId) {
          participants.get(msg.to)?.close(1008, "Removed by host");
        }
      } catch { ws.close(1003, "Invalid message"); }
    });
    ws.on("close", () => {
      if (peers.get(ws.userId) !== ws) return;
      peers.delete(ws.userId);
      revokeFor(ws.roomId, ws.userId);
      for (const peer of peers.values()) peer.pendingAssist.delete(ws.userId);
      for (const peer of peers.values()) send(peer, { type: "left", id: ws.userId });
      if (!peers.size) roomSockets.delete(ws.roomId);
    });
  });
  return {
    closeUser(id) {
      for (const peers of roomSockets.values())
        peers.get(id)?.close(1008,"Account access changed");
    },
    recheckUser(id, features) {
      for (const [roomId, peers] of roomSockets) {
        const ws = peers.get(id);
        if (!ws) continue;
        ws.features = features;
        if (!features.meetings) ws.close(1008, "Meeting access removed");
        else {
          if (!features.remote_assist) revokeFor(roomId, id);
          if (!features.screen_share && ws.screenActive) {
            ws.screenActive = false;
            revokeFor(roomId, id);
            for (const peer of peers.values()) if (peer !== ws)
              send(peer, { type:"screen-state", from:id, active:false });
            send(ws, { type:"screen-stop" });
          }
        }
      }
    },
    closeTenant(tenantId) {
      for (const peers of roomSockets.values())
        for (const ws of peers.values())
          if (ws.tenantId === tenantId) ws.close(1008, "Tenant suspended");
    },
    closeRoom(id) {
      for (const ws of roomSockets.get(id)?.values() || [])
        ws.close(1000, "Meeting ended");
      assistGrants.delete(id);
    }
  };
}
