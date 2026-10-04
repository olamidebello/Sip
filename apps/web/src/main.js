import { SimpleUser } from "sip.js/lib/platform/web";
import { checkCurrentLocation } from "./geofence.js";
import { setupMeetings } from "./meetings.js";
import { setupGroupAdmin } from "./groups.js";
import { setupMobileAdmin } from "./mobileAdmin.js";
import { setupTenants } from "./tenants.js";
import { setupPbx } from "./pbx.js";
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
  <section id="billing" hidden>
    <h2>Plans and billing</h2>
    <p>Plan requests create unpaid invoices. Online payment and activation are not available yet.</p>
    <label>Monthly plan <select id="plans"></select></label>
    <button id="select-plan" type="button">Request plan</button>
    <p id="subscription"></p>
    <h3>Invoices</h3><ul id="invoices"></ul>
    <h3>Available numbers</h3>
    <label>Provider <select id="number-provider">
      <option value="flowroute">Flowroute</option><option value="didww">DIDWW</option>
    </select></label>
    <button id="search-numbers" type="button">Search numbers</button>
    <ul id="numbers"></ul>
    <h3>Port a number</h3>
    <p>This creates a draft request for review; it does not submit a carrier port.</p>
    <form id="port-form">
      <label>Number (E.164) <input name="number" placeholder="+12125550123" required></label>
      <label>Destination provider <select name="provider"><option value="flowroute">Flowroute</option>
        <option value="didww">DIDWW</option></select></label>
      <button>Create draft</button>
    </form>
    <ul id="ports"></ul><p id="billing-status" role="status"></p>
  </section>
  <section id="meetings" hidden>
    <h2>Meetings</h2>
    <p>Small browser video rooms for up to four signed-in participants.</p>
    <form id="meeting-create">
      <label>Meeting title <input name="title" maxlength="100" required></label>
      <button>Create meeting</button>
    </form>
    <label>Meeting ID <input id="meeting-id" placeholder="Paste a meeting ID"></label>
    <button id="meeting-join" type="button">Join meeting</button>
    <div id="meeting-live" hidden>
      <h3 id="meeting-title"></h3>
      <div id="meeting-videos" class="meeting-videos"></div>
      <button id="meeting-mic" type="button">Mute</button>
      <button id="meeting-camera" type="button">Camera off</button>
      <button id="meeting-share" type="button">Share screen</button>
      <p id="share-notice">Screen sharing is visible to all meeting participants. Pointer assistance needs your approval and does not control your computer.</p>
      <div id="assist-requests" aria-live="polite"></div>
      <div id="assist-grants"></div>
      <button id="meeting-leave" type="button">Leave</button>
      <div id="host-controls" hidden>
        <button id="lock-room" type="button">Lock room</button>
        <button id="end-room" type="button">End meeting for all</button>
      </div>
      <h3>Room chat</h3><ul id="meeting-chat"></ul>
      <form id="meeting-chat-form">
        <label>Message <input name="text" maxlength="2000" required></label>
        <button>Send</button>
      </form>
    </div>
    <p id="meeting-status" role="status"></p>
  </section>
  <section id="admin" hidden>
    <h2>Administrator</h2>
    <p id="admin-overview"></p>
    <form id="server-config">
      <label>Default SIP secure WebSocket URL <input name="sipWssUrl" type="url" placeholder="wss://sip.example.com"></label>
      <button>Save server URL</button>
    </form>
    <p id="admin-status" role="status"></p>
    <form id="create-plan">
      <h3>Create monthly plan</h3>
      <label>Name <input name="name" required></label>
      <label>Description <input name="description"></label>
      <label>Price in USD cents <input name="monthlyCents" type="number" min="0" step="1" required></label>
      <button>Create plan</button>
    </form>
    <form id="markup-form">
      <label>DID markup percentage <input name="percent" type="number" min="0" max="1000" step="1" value="30" required></label>
      <button>Save markup</button>
    </form>
    <section id="group-admin">
      <h3>User groups and feature access</h3>
      <form id="group-create">
        <label>New group name <input name="name" minlength="2" maxlength="80" required></label>
        <div id="group-new-features"></div>
        <button>Create group</button>
      </form>
      <label>Group to edit <select id="group-list"></select></label>
      <div id="group-edit-features"></div>
      <button id="group-update" type="button">Save group permissions</button>
      <label>User <select id="group-user"></select></label>
      <div id="group-memberships"></div>
      <button id="group-assign" type="button">Save user's groups</button>
      <p id="group-status" role="status"></p>
    </section>
    <section id="tenant-admin">
      <h3>Tenants and administrators</h3>
      <div id="tenant-super" hidden>
        <form id="tenant-create">
          <label>Tenant name <input name="name" maxlength="100" required></label>
          <label>Slug <input name="slug" pattern="[a-z][a-z0-9-]+" required></label>
          <button>Create tenant</button>
        </form>
      </div>
      <label>Tenant for new user <select id="tenant-select"></select></label>
      <button id="tenant-switch" type="button">Manage selected tenant</button>
      <button id="tenant-suspend" type="button">Suspend selected tenant</button>
      <button id="tenant-activate" type="button">Activate selected tenant</button>
      <form id="tenant-user-create">
        <label>Name <input name="name" required minlength="2"></label>
        <label>Email <input name="email" type="email" required></label>
        <label>Initial password <input name="password" type="password" minlength="12" required></label>
        <label>Role <select name="role"><option value="user">User</option><option value="admin">Tenant admin</option></select></label>
        <button>Create tenant user</button>
      </form>
      <p id="tenant-status" role="status"></p>
    </section>
    <section id="pbx-admin">
      <h3>PBX and call center configuration</h3>
      <p id="pbx-overview"></p>
      <h4>Extensions</h4>
      <form id="pbx-extension-form">
        <label>Number <input name="number" pattern="[0-9]{2,10}" required></label>
        <label>Name <input name="name" maxlength="100" required></label>
        <label>Assigned user <select id="pbx-extension-user" name="userId"></select></label>
        <label><input name="voicemailEnabled" type="checkbox"> Voicemail planned</label>
        <label>Forward target <input name="forwardTo" placeholder="Extension or +E.164"></label>
        <button>Create extension</button>
      </form><ul id="pbx-extension-list"></ul>
      <h4>Call queues</h4>
      <form id="pbx-queue-form">
        <label>Queue number <input name="number" pattern="[0-9]{2,10}" required></label>
        <label>Name <input name="name" maxlength="100" required></label>
        <label>Strategy <select name="strategy"><option value="ring_all">Ring all</option><option value="ordered">Ordered</option><option value="longest_idle">Longest idle</option></select></label>
        <label>Maximum wait in seconds <input name="maxWaitSeconds" type="number" min="5" max="3600" value="120" required></label>
        <button>Create queue</button>
      </form>
      <label>Queue <select id="pbx-queue-select"></select></label>
      <div id="pbx-members"></div>
      <button id="pbx-save-members" type="button">Save queue members</button>
      <button id="pbx-preview-queue" type="button">Preview eligible agents</button>
      <h4>Inbound DID routing</h4>
      <form id="pbx-route-form">
        <label>DID (+E.164) <input name="did" placeholder="+12125550123" required></label>
        <label>Destination <select id="pbx-route-destination" name="destinationId"></select></label>
        <button>Save DID route</button>
      </form><ul id="pbx-route-list"></ul>
      <h4>Trunk plans and rate deck</h4>
      <p>Trunks and rates are for preview. No live trunk is provisioned.</p>
      <form id="pbx-trunk-form">
        <label>Name <input name="name" required></label>
        <label>Host <input name="host" placeholder="sip.provider.example" required></label>
        <label>Port <input name="port" type="number" min="1" max="65535" value="5061" required></label>
        <label>Transport <select name="transport"><option value="tls">TLS</option><option value="udp">UDP</option><option value="tcp">TCP</option></select></label>
        <label>Priority <input name="priority" type="number" min="1" max="1000" value="100" required></label>
        <button>Add trunk plan</button>
      </form><ul id="pbx-trunk-list"></ul>
      <form id="pbx-rate-form">
        <label>Digits prefix <input name="prefix" pattern="[0-9]{1,15}" required></label>
        <label>Trunk <select name="trunkId" id="pbx-rate-trunk"></select></label>
        <label>Cost cents/min <input name="cost" type="number" min="0" required></label>
        <label>Price cents/min <input name="price" type="number" min="0" required></label>
        <button>Add rate</button>
      </form><ul id="pbx-rate-list"></ul>
      <form id="pbx-route-preview-form">
        <label>Preview outbound +E.164 <input name="number" placeholder="+12125550123" required></label>
        <button>Preview route</button>
      </form>
      <p id="pbx-status" role="status"></p>
    </section>
    <section id="mobile-admin">
      <h3>Android and iOS releases</h3>
      <p>Internal release planning and approval. Store upload and publishing are not connected.</p>
      <form id="mobile-app-form">
        <label>Platform <select name="platform"><option value="android">Android</option><option value="ios">iOS</option></select></label>
        <label>App identifier <input name="appIdentifier" placeholder="com.example.olamide" required></label>
        <label>Display name <input name="displayName" required maxlength="100"></label>
        <label>Store app ID (optional) <input name="storeAppId" maxlength="64"></label>
        <button>Register app</button>
      </form>
      <label>App for new release <select id="mobile-apps"></select></label>
      <label>Existing release <select id="mobile-releases"></select></label>
      <button id="mobile-new-release" type="button">New draft</button>
      <form id="mobile-release-form">
        <label>Version <input name="versionName" required></label>
        <label>Build number <input name="buildNumber" required></label>
        <label>Track <select name="track"><option>internal</option><option>alpha</option><option>beta</option><option>production</option><option>testflight</option><option>app-store</option></select></label>
        <label>Rollout percent <input name="rolloutPercent" type="number" min="1" max="100" value="100" required></label>
        <label>Release notes <textarea name="releaseNotes" maxlength="4000"></textarea></label>
        <label>HTTPS artifact reference (no tokens or query string) <input name="artifactUrl" type="url" required></label>
        <label>Artifact SHA-256 <input name="artifactSha256" pattern="[a-fA-F0-9]{64}" required></label>
        <button>Save draft</button>
      </form>
      <button id="mobile-approve" type="button">Approve internally</button>
      <button id="mobile-reopen" type="button">Reopen draft</button>
      <button id="mobile-archive" type="button">Archive</button>
      <h4>Release history</h4><ul id="mobile-events"></ul>
      <p id="mobile-status" role="status"></p>
    </section>
  </section>
  <section id="agent-panel" hidden>
    <h2>Call center agent</h2>
    <p id="my-extension"></p>
    <form id="agent-status-form">
      <label>Availability <select id="agent-presence"><option>offline</option><option>ready</option><option>away</option></select></label>
      <button>Set availability</button>
    </form>
    <p id="agent-status-result" role="status"></p>
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
  <section id="softphone-tools">
    <h2>Calling tools</h2>
    <label><input id="dnd" type="checkbox"> Do not disturb on this browser</label>
    <p>Do not disturb declines incoming calls while this page is connected. It does not change your SIP server settings.</p>
    <form id="favorite-form">
      <label>Favorite SIP address <input name="address" placeholder="sip:bob@example.com" required></label>
      <button>Save favorite</button>
    </form>
    <h3>Favorites</h3><ul id="favorites"></ul>
    <h3>Recent calls</h3><ol id="recent-calls"></ol>
    <button id="clear-calls" type="button">Clear recent calls</button>
    <label>Audio output <select id="audio-output"><option value="">System default</option></select></label>
    <button id="refresh-devices" type="button">Refresh audio outputs</button>
    <p id="device-status" role="status"></p>
    <p>Favorites, call history, and do not disturb are saved in this browser only.</p>
  </section>
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
    <button id="hold">Hold</button><button id="mute">Mute</button><button id="hangup">Hang up</button>
    <label>DTMF <input id="tone" maxlength="1" pattern="[0-9*#]"></label><button id="send-tone">Send tone</button>
  </section>
  <button id="disconnect" hidden>Disconnect</button>
  <audio id="remote" autoplay></audio>
  <p id="status" role="status">Disconnected</p>
`;

const $ = (selector) => document.querySelector(selector);
const connectForm = $("#connect");
const dialForm = $("#dial");
const meetings = setupMeetings();
const groupAdmin = setupGroupAdmin();
const mobileAdmin = setupMobileAdmin();
const tenantAdmin = setupTenants();
const pbx = setupPbx();
let phone;
let onCall = false;
let onHold = false;
let muted = false;
let currentCall = null;
const localKey = (name) => `olamide.softphone.${name}`;
function readLocal(name, fallback) {
  try { return JSON.parse(localStorage.getItem(localKey(name))) ?? fallback; }
  catch { return fallback; }
}
const favorites = new Set(readLocal("favorites", []).filter((value) =>
  typeof value === "string" && /^sip:[^\s@]+@[^\s@]+$/i.test(value)));
let recentCalls = readLocal("recent", []);
if (!Array.isArray(recentCalls)) recentCalls = [];
$("#dnd").checked = readLocal("dnd", false) === true;
$("#dnd").onchange = () => localStorage.setItem(localKey("dnd"), JSON.stringify($("#dnd").checked));
function renderSoftphoneLists() {
  const favoriteList = $("#favorites");
  favoriteList.replaceChildren();
  for (const address of favorites) {
    const item = document.createElement("li");
    const dial = document.createElement("button");
    dial.textContent = address;
    dial.onclick = () => { dialForm.elements.target.value = address; dialForm.requestSubmit(); };
    const remove = document.createElement("button");
    remove.textContent = "Remove";
    remove.onclick = () => {
      favorites.delete(address);
      localStorage.setItem(localKey("favorites"), JSON.stringify([...favorites]));
      renderSoftphoneLists();
    };
    item.append(dial, " ", remove);
    favoriteList.append(item);
  }
  const history = $("#recent-calls");
  history.replaceChildren();
  for (const call of recentCalls.slice(0, 50)) {
    if (!call || typeof call.address !== "string") continue;
    const item = document.createElement("li");
    item.textContent = `${call.direction} · ${call.result} · ${call.address} · ${new Date(call.at).toLocaleString()}`;
    history.append(item);
  }
}
renderSoftphoneLists();
$("#favorite-form").onsubmit = (event) => {
  event.preventDefault();
  const address = String(new FormData(event.currentTarget).get("address")).trim();
  if (!/^sip:[^\s@]+@[^\s@]+$/i.test(address)) return;
  favorites.add(address);
  localStorage.setItem(localKey("favorites"), JSON.stringify([...favorites]));
  event.currentTarget.reset();
  renderSoftphoneLists();
};
$("#clear-calls").onclick = () => {
  recentCalls = [];
  localStorage.removeItem(localKey("recent"));
  renderSoftphoneLists();
};
function finishCall(result) {
  if (!currentCall) return;
  recentCalls.unshift({ ...currentCall, result, at: new Date().toISOString() });
  recentCalls = recentCalls.slice(0, 50);
  localStorage.setItem(localKey("recent"), JSON.stringify(recentCalls));
  currentCall = null;
  renderSoftphoneLists();
}
async function refreshAudioOutputs() {
  const output = $("#audio-output");
  const previous = output.value;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    output.replaceChildren(new Option("System default", ""));
    for (const device of devices.filter((entry) => entry.kind === "audiooutput"))
      output.add(new Option(device.label || "Audio output", device.deviceId));
    output.value = [...output.options].some((option) => option.value === previous) ? previous : "";
    $("#device-status").textContent = "Audio outputs loaded.";
  } catch (error) { $("#device-status").textContent = error.message; }
}
$("#refresh-devices").onclick = refreshAudioOutputs;
$("#audio-output").onchange = async (event) => {
  try {
    if (!$("#remote").setSinkId) throw new Error("Audio output selection is not supported in this browser.");
    await $("#remote").setSinkId(event.target.value);
    $("#device-status").textContent = "Audio output selected.";
  } catch (error) { $("#device-status").textContent = error.message; }
};
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
  $("#chat").hidden = !user.features?.messaging;
  $("#billing").hidden = !user.features?.billing;
  if (user.features?.meetings) meetings.show();
  else meetings.hide();
  if (user.features?.billing)
    refreshBilling().catch((error) => { $("#billing-status").textContent = error.message; });
  if (user.features?.messaging)
    loadContacts().catch((error) => { $("#chat-status").textContent = error.message; });
  $("#agent-panel").hidden = !user.features?.call_center;
  pbx.refreshSelf(user).catch((error) => { $("#agent-status-result").textContent = error.message; });
  $("#admin").hidden = !(["admin","super_admin"].includes(user.role));
  if (["admin","super_admin"].includes(user.role)) {
    pbx.refreshAdmin().catch((error) => { $("#pbx-status").textContent = error.message; });
    tenantAdmin.refresh(user).catch((error) => { $("#tenant-status").textContent = error.message; });
    mobileAdmin.refresh().catch((error) => { $("#mobile-status").textContent = error.message; });
    groupAdmin.refresh().catch((error) => { $("#group-status").textContent = error.message; });
    apiGet("/api/admin/overview")
      .then((stats) => { $("#admin-overview").textContent =
        `${stats.users} users, ${stats.messages} messages, ${stats.active_sessions} active sessions`; })
      .catch((error) => { $("#admin-status").textContent = error.message; });
  }
}
function money(cents) { return "$" + (cents / 100).toFixed(2); }
async function loadPlans() {
  const { plans } = await apiGet("/api/plans");
  const list = $("#plans");
  list.replaceChildren();
  for (const plan of plans) {
    const option = document.createElement("option");
    option.value = plan.id;
    option.textContent = `${plan.name} — ${money(plan.monthly_cents)}/month: ${plan.description}`;
    list.append(option);
  }
}
async function refreshBilling() {
  const [invoices, subscription, ports] = await Promise.all([
    apiGet("/api/billing/invoices"),
    apiGet("/api/billing/subscription"),
    apiGet("/api/porting")
  ]);
  $("#subscription").textContent = subscription.subscription
    ? `${subscription.subscription.name}: ${subscription.subscription.status}` : "No plan requested";
  $("#invoices").replaceChildren(...invoices.invoices.map((invoice) => {
    const li = document.createElement("li");
    li.textContent = `${invoice.description}: ${money(invoice.amount_cents)} — ${invoice.status}`;
    return li;
  }));
  $("#ports").replaceChildren(...ports.requests.map((request) => {
    const li = document.createElement("li");
    li.textContent = `${request.number_e164} → ${request.provider}: ${request.status}`;
    return li;
  }));
}
loadPlans().catch(() => {});
$("#select-plan").onclick = async () => {
  try {
    await accountRequest("/api/billing/select-plan", { planId: $("#plans").value });
    await refreshBilling();
    $("#billing-status").textContent = "Plan requested. Invoice is unpaid.";
  } catch (error) { $("#billing-status").textContent = error.message; }
};
$("#search-numbers").onclick = async () => {
  try {
    const data = await apiGet("/api/numbers?provider=" + $("#number-provider").value);
    $("#numbers").replaceChildren(...data.numbers.map((number) => {
      const li = document.createElement("li");
      li.textContent = `${number.number}: ${money(number.setupCents)} setup, ${money(number.monthlyCents)}/month`;
      return li;
    }));
    $("#billing-status").textContent = `Live provider inventory with ${data.markupPercent}% markup. Purchasing is unavailable.`;
  } catch (error) { $("#billing-status").textContent = error.message; }
};
$("#port-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await accountRequest("/api/porting", Object.fromEntries(new FormData(event.currentTarget)));
    event.currentTarget.reset();
    await refreshBilling();
    $("#billing-status").textContent = "Draft port request created";
  } catch (error) { $("#billing-status").textContent = error.message; }
});
$("#create-plan").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await accountRequest("/api/admin/plans", { ...data, monthlyCents: Number(data.monthlyCents) });
    await loadPlans();
    $("#admin-status").textContent = "Plan created";
  } catch (error) { $("#admin-status").textContent = error.message; }
});
$("#markup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const percent = Number(new FormData(event.currentTarget).get("percent"));
    await accountRequest("/api/admin/markup", { percent });
    $("#admin-status").textContent = "DID markup saved";
  } catch (error) { $("#admin-status").textContent = error.message; }
});
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
    $("#billing").hidden = true;
    meetings.hide();
    $("#agent-panel").hidden = true;
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
    muted = false;
    $("#mute").textContent = "Mute";
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
      onCallReceived: async () => {
        currentCall = { direction: "incoming", address: "Unknown caller" };
        if ($("#dnd").checked) {
          try { await candidate.decline(); } catch (error) { report(error); }
          finishCall("declined (do not disturb)");
          return;
        }
        $("#incoming").hidden = false; status("Incoming call");
      },
      onCallAnswered: () => { if (currentCall) currentCall.answered = true; callState(true); status("Call connected"); },
      onCallHangup: () => { finishCall(currentCall?.answered ? "completed" : "missed or unanswered"); callState(false); status("Call ended"); },
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
    refreshAudioOutputs();
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
  currentCall = { direction: "outgoing", address: target };
  try { status("Calling…"); await phone.call(target); }
  catch (error) { finishCall("failed"); report(error); }
});
$("#check-location").onclick = async () => {
  const result = await checkCurrentLocation(geoPolicy);
  $("#geo-result").textContent = result.reason;
};
$("#answer").onclick = async () => { try { await phone?.answer(); } catch (error) { report(error); } };
$("#reject").onclick = async () => { try { await phone?.decline(); finishCall("declined"); } catch (error) { report(error); } };
$("#hangup").onclick = async () => { try { await phone?.hangup(); } catch (error) { report(error); } };
$("#hold").onclick = async () => {
  if (!phone || !onCall) return;
  try {
    if (onHold) await phone.unhold(); else await phone.hold();
    onHold = !onHold;
    $("#hold").textContent = onHold ? "Resume" : "Hold";
  } catch (error) { report(error); }
};
$("#mute").onclick = () => {
  if (!phone || !onCall) return;
  try {
    if (muted) phone.unmute(); else phone.mute();
    muted = !muted;
    $("#mute").textContent = muted ? "Unmute" : "Mute";
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
