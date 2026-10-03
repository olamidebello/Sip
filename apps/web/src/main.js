import { SimpleUser } from "sip.js/lib/platform/web";
import { checkCurrentLocation } from "./geofence.js";
import "./style.css";

const root = document.querySelector("#app");
root.innerHTML = `
  <header class="brand">
    <img src="/olamide-logo.jpg" alt="Olamide" width="1536" height="620">
    <h1>Olamide</h1>
  </header>
  <section id="account">
    <strong>Olamide account</strong>
    <p>Account sign-up does not yet provision a SIP number or calling plan.</p>
    <form id="signup">
      <label>Name <input name="name" autocomplete="name" minlength="2" maxlength="100" required></label>
      <label>Email <input name="email" type="email" autocomplete="email" required></label>
      <label>Password <input name="password" type="password" autocomplete="new-password" minlength="12" required></label>
      <button>Create account</button>
    </form>
    <form id="login">
      <label>Email <input name="email" type="email" autocomplete="username" required></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
      <button>Sign in</button>
    </form>
    <button id="logout" hidden>Sign out</button>
    <p id="account-status" role="status">Not signed in</p>
  </section>
  <section id="chat" hidden>
    <h2>Messages</h2>
    <p>Account messages are stored on this server. They are not end-to-end encrypted.</p>
    <form id="add-contact">
      <label>Contact email <input name="email" type="email" required></label>
      <button>Add contact</button>
    </form>
    <label>Conversation <select id="contact-list"></select></label>
    <button id="load-messages" type="button">Refresh messages</button>
    <ol id="message-list"></ol>
    <form id="send-message">
      <label>Message <input name="body" maxlength="4000" required></label>
      <button>Send</button>
    </form>
    <p id="chat-status" role="status"></p>
  </section>
  <section id="admin" hidden>
    <h2>Administrator</h2>
    <p id="admin-overview"></p>
    <form id="server-config">
      <label>Default SIP secure WebSocket URL <input name="sipWssUrl" type="url" placeholder="wss://sip.example.com"></label>
      <button>Save server URL</button>
    </form>
    <p id="admin-status" role="status"></p>
  </section>
  <p>Development browser dialer. Use a test account on a WSS and WebRTC enabled SIP server.</p>
  <form id="connect">
    <label>SIP address <input name="aor" placeholder="sip:alice@example.com" required></label>
    <label>Authorization username <input name="username" autocomplete="username" required></label>
    <label>Password <input name="password" type="password" autocomplete="off" required></label>
    <label>Secure WebSocket URL <input name="server" type="url" placeholder="wss://sip.example.com:7443" required></label>
    <button>Connect</button>
  </form>
  <form id="dial" hidden>
    <label>Destination SIP address <input name="target" placeholder="sip:bob@example.com" required></label>
    <button>Call</button>
  </form>
  <section id="geo">
    <strong>Calling area</strong>
    <p id="geo-policy">Loading location policy…</p>
    <button id="check-location" type="button" hidden>Check my location</button>
    <p id="geo-result" role="status"></p>
  </section>
  <section id="incoming" hidden><strong>Incoming call</strong>
    <button id="answer">Answer</button><button id="reject">Reject</button>
  </section>
  <section id="active" hidden>
    <button id="hold">Hold</button><button id="hangup">Hang up</button>
    <label>DTMF <input id="tone" maxlength="1" pattern="[0-9*#]"></label><button id="send-tone">Send tone</button>
  </section>
  <button id="disconnect" hidden>Disconnect</button>
  <audio id="remote" autoplay></audio>
  <p id="status" role="status">Disconnected</p>
`;

const $ = (selector) => document.querySelector(selector);
const connectForm = $("#connect");
const dialForm = $("#dial");
let phone;
let onCall = false;
let onHold = false;
let geoPolicy = { enabled: true, maxAccuracyMeters: 0, zones: [] };
let geoPolicyLoaded = false;

async function accountRequest(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Account request failed");
  return data;
}
async function apiGet(path) {
  const response = await fetch(path, { credentials: "same-origin" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function loadContacts() {
  const { contacts } = await apiGet("/api/contacts");
  const list = $("#contact-list");
  const selected = list.value;
  list.replaceChildren();
  for (const contact of contacts) {
    const option = document.createElement("option");
    option.value = contact.id;
    option.textContent = `${contact.name} (${contact.email})`;
    list.append(option);
  }
  if (contacts.some((contact) => contact.id === selected)) list.value = selected;
  await loadMessages();
}
async function loadMessages() {
  const contact = $("#contact-list").value;
  const list = $("#message-list");
  list.replaceChildren();
  if (!contact) return;
  const { messages } = await apiGet("/api/messages?contact=" + encodeURIComponent(contact));
  for (const message of messages) {
    const item = document.createElement("li");
    item.textContent = `${new Date(message.created_at).toLocaleString()}: ${message.body}`;
    list.append(item);
  }
}
function signedIn(user) {
  $("#signup").hidden = true;
  $("#login").hidden = true;
  $("#logout").hidden = false;
  $("#account-status").textContent = `Signed in as ${user.name}`;
  $("#chat").hidden = false;
  loadContacts().catch((error) => { $("#chat-status").textContent = error.message; });
  $("#admin").hidden = user.role !== "admin";
  if (user.role === "admin") {
    apiGet("/api/admin/overview")
      .then((stats) => { $("#admin-overview").textContent =
        `${stats.users} users, ${stats.messages} messages, ${stats.active_sessions} active sessions`; })
      .catch((error) => { $("#admin-status").textContent = error.message; });
  }
}
$("#add-contact").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await accountRequest("/api/contacts", Object.fromEntries(new FormData(event.currentTarget)));
    event.currentTarget.reset();
    await loadContacts();
    $("#chat-status").textContent = "Contact added";
  } catch (error) { $("#chat-status").textContent = error.message; }
});
$("#contact-list").onchange = () => loadMessages().catch((error) => {
  $("#chat-status").textContent = error.message;
});
$("#load-messages").onclick = () => loadMessages().catch((error) => {
  $("#chat-status").textContent = error.message;
});
$("#send-message").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await accountRequest("/api/messages", {
      recipient: $("#contact-list").value,
      body: new FormData(event.currentTarget).get("body")
    });
    event.currentTarget.reset();
    await loadMessages();
    $("#chat-status").textContent = "Message sent";
  } catch (error) { $("#chat-status").textContent = error.message; }
});
$("#server-config").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await accountRequest("/api/admin/config",
      Object.fromEntries(new FormData(event.currentTarget)));
    $("#connect [name=server]").value = result.sipWssUrl;
    $("#admin-status").textContent = "Server URL saved";
  } catch (error) { $("#admin-status").textContent = error.message; }
});
apiGet("/api/config").then(({ sipWssUrl }) => {
  if (sipWssUrl) $("#connect [name=server]").value = sipWssUrl;
}).catch(() => {});
$("#signup").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    await accountRequest("/api/register", Object.fromEntries(data));
    form.reset();
    $("#account-status").textContent = "Account created. Sign in below.";
  } catch (error) { $("#account-status").textContent = error.message; }
});
$("#login").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const user = await accountRequest("/api/login", Object.fromEntries(new FormData(form)));
    form.reset();
    signedIn(user);
  } catch (error) { $("#account-status").textContent = error.message; }
});
$("#logout").onclick = async () => {
  try {
    await accountRequest("/api/logout", {});
    $("#signup").hidden = false;
    $("#login").hidden = false;
    $("#logout").hidden = true;
    $("#chat").hidden = true;
    $("#admin").hidden = true;
    $("#message-list").replaceChildren();
    $("#account-status").textContent = "Signed out";
  } catch (error) { $("#account-status").textContent = error.message; }
};
fetch("/api/me", { credentials: "same-origin" })
  .then(async (response) => response.ok ? signedIn(await response.json()) : undefined)
  .catch(() => { $("#account-status").textContent = "Account service unavailable"; });

fetch("/geofence-policy.json", { cache: "no-store" })
  .then(async (response) => {
    if (!response.ok) throw new Error("Policy unavailable");
    const policy = await response.json();
    if (typeof policy.enabled !== "boolean" ||
        !Number.isFinite(policy.maxAccuracyMeters) ||
        !Array.isArray(policy.zones)) throw new Error("Invalid policy");
    geoPolicy = policy;
    geoPolicyLoaded = true;
    $("#geo-policy").textContent = policy.enabled
      ? "Calls require an accurate location within an allowed area."
      : "Location checks are currently off.";
    $("#check-location").hidden = !policy.enabled;
  })
  .catch(() => {
    $("#geo-policy").textContent = "Location policy unavailable. Outgoing calls are blocked.";
  });

function status(message) { $("#status").textContent = message; }
function callState(active) {
  onCall = active;
  $("#active").hidden = !active;
  if (!active) {
    $("#incoming").hidden = true;
    onHold = false;
    $("#hold").textContent = "Hold";
  }
}
function report(error) {
  status(error instanceof Error ? error.message : String(error));
}

connectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(connectForm);
  const aor = String(data.get("aor")).trim();
  const server = String(data.get("server")).trim();
  if (!/^sip:[^\s@]+@[^\s@]+$/i.test(aor) || !server.startsWith("wss://")) {
    status("Enter a valid sip:user@domain and wss:// URL.");
    return;
  }
  const candidate = new SimpleUser(server, {
    aor,
    media: { remote: { audio: $("#remote") } },
    userAgentOptions: {
      authorizationUsername: String(data.get("username")),
      authorizationPassword: String(data.get("password"))
    },
    delegate: {
      onCallReceived: () => { $("#incoming").hidden = false; status("Incoming call"); },
      onCallAnswered: () => { callState(true); status("Call connected"); },
      onCallHangup: () => { callState(false); status("Call ended"); },
      onRegistered: () => status("Registered"),
      onUnregistered: () => status("Unregistered")
    }
  });
  try {
    status("Connecting…");
    await candidate.connect();
    await candidate.register();
    phone = candidate;
    connectForm.hidden = true;
    dialForm.hidden = false;
    $("#disconnect").hidden = false;
    status("Registered");
  } catch (error) {
    report(error);
    await candidate.disconnect().catch(() => {});
  }
});

dialForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!phone || onCall) return;
  const target = String(new FormData(dialForm).get("target")).trim();
  if (!/^sip:[^\s@]+@[^\s@]+$/i.test(target)) { status("Enter a SIP address."); return; }
  if (!geoPolicyLoaded) { status("Location policy unavailable. Call blocked."); return; }
  const location = await checkCurrentLocation(geoPolicy);
  $("#geo-result").textContent = location.reason;
  if (!location.allowed) { status("Call blocked: " + location.reason); return; }
  try { status("Calling…"); await phone.call(target); } catch (error) { report(error); }
});
$("#check-location").onclick = async () => {
  const result = await checkCurrentLocation(geoPolicy);
  $("#geo-result").textContent = result.reason;
};
$("#answer").onclick = async () => { try { await phone?.answer(); } catch (error) { report(error); } };
$("#reject").onclick = async () => { try { await phone?.decline(); } catch (error) { report(error); } };
$("#hangup").onclick = async () => { try { await phone?.hangup(); } catch (error) { report(error); } };
$("#hold").onclick = async () => {
  if (!phone || !onCall) return;
  try {
    if (onHold) await phone.unhold(); else await phone.hold();
    onHold = !onHold;
    $("#hold").textContent = onHold ? "Resume" : "Hold";
  } catch (error) { report(error); }
};
$("#send-tone").onclick = async () => {
  const tone = $("#tone").value;
  if (!onCall || !/^[0-9*#]$/.test(tone)) return;
  try { await phone.sendDTMF(tone); $("#tone").value = ""; } catch (error) { report(error); }
};
$("#disconnect").onclick = async () => {
  if (!phone) return;
  try {
    if (onCall) await phone.hangup();
    await phone.unregister();
    await phone.disconnect();
    phone = undefined;
    connectForm.reset();
    connectForm.hidden = false;
    dialForm.hidden = true;
    $("#disconnect").hidden = true;
    callState(false);
    status("Disconnected");
  } catch (error) { report(error); }
};
