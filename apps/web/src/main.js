import { SimpleUser } from "sip.js/lib/platform/web";
import "./style.css";

const root = document.querySelector("#app");
root.innerHTML = `
  <h1>Olamide SIP</h1>
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
  try { status("Calling…"); await phone.call(target); } catch (error) { report(error); }
});
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
