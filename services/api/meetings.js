import { WebSocketServer, WebSocket } from "ws";

const roomSockets = new Map();
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
      if (!user) throw new Error("Sign in required");
      const result = await pool.query(
        "SELECT host_id,locked,ended_at FROM meeting_rooms WHERE id=$1", [match[1]]
      );
      const room = result.rows[0];
      if (!room || room.ended_at) throw new Error("Meeting unavailable");
      const peers = roomSockets.get(match[1]) || new Map();
      if (room.locked && user.id !== room.host_id) throw new Error("Meeting locked");
      if (peers.size >= 4 || peers.has(user.id)) throw new Error("Meeting full or already joined");
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.roomId = match[1];
        ws.userId = user.id;
        ws.name = user.display_name;
        ws.hostId = room.host_id;
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
  wss.on("connection", (ws) => {
    const peers = roomSockets.get(ws.roomId) || new Map();
    roomSockets.set(ws.roomId, peers);
    send(ws, { type: "welcome", id: ws.userId, hostId: ws.hostId,
      peers: [...peers.values()].map((peer) => ({ id: peer.userId, name: peer.name })) });
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
        } else if (msg.type === "kick" && ws.userId === ws.hostId &&
                   typeof msg.to === "string" && msg.to !== ws.userId) {
          participants.get(msg.to)?.close(1008, "Removed by host");
        }
      } catch { ws.close(1003, "Invalid message"); }
    });
    ws.on("close", () => {
      if (peers.get(ws.userId) !== ws) return;
      peers.delete(ws.userId);
      for (const peer of peers.values()) send(peer, { type: "left", id: ws.userId });
      if (!peers.size) roomSockets.delete(ws.roomId);
    });
  });
  return {
    closeRoom(id) {
      for (const ws of roomSockets.get(id)?.values() || [])
        ws.close(1000, "Meeting ended");
    }
  };
}
