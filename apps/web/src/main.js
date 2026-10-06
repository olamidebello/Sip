import { SimpleUser } from "sip.js/lib/platform/web";
import { checkCurrentLocation } from "./geofence.js";
import { setupMeetings } from "./meetings.js";
import { setupGroupAdmin } from "./groups.js";
import { setupMobileAdmin } from "./mobileAdmin.js";
import { setupTenants } from "./tenants.js";
import { setupPbx } from "./pbx.js";
import { setupReports } from "./reports.js";
import { setupPricing } from "./pricing.js";
import { setupBackground } from "./background.js";
import { setupLdapAdmin } from "./ldapAdmin.js";
import { setupAuthProviders } from "./authProviders.js";
import { setupCatalogControl } from "./catalogControl.js";
import { setupInstall } from "./install.js";
import { setupDownloads } from "./downloads.js";
import { setupCarrierControl } from "./carrierControl.js";
import { contactEmailsFromCsv, contactsToCsv } from "./contactsCsv.js";
import { setupDashboard } from "./dashboard.js";
import { setupSupport } from "./support.js";
import { setupLocaleSettings } from "./localeSettings.js";
import "./style.css";

const root = document.querySelector("#app");
root.innerHTML = `
  <header class="brand" id="top">
    <a class="brand-mark" href="#top" aria-label="Olamide home"><img src="/olamide-icon.svg" alt="" width="48" height="48"><span>Olamide<span class="brand-dot">.</span></span></a>
    <nav class="public-nav" aria-label="Public navigation"><a href="#experience">Explore</a><a href="#downloads">Downloads</a><a class="nav-signin" href="#account">Sign in</a></nav>
  </header>
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero-copy"><p class="eyebrow"><span class="signal-dot"></span> YOUR CALLING SPACE</p>
      <h1 id="hero-title">Conversations feel better when everything connects.</h1>
      <p class="hero-lead">A clear place for SIP calling, messages, meetings and account tools. Bring a provisioned SIP account to connect and make calls.</p>
      <div class="hero-actions"><a class="button-link primary" href="#account">Get started <span aria-hidden="true">↗</span></a><a class="button-link secondary" href="#downloads">Download the app</a></div>
      <p class="hero-note">Use in your browser, or install a preview build on a supported device.</p>
    </div>
    <div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="hero-emblem"><img src="/olamide-icon.svg" alt=""></div><div class="art-label art-label-top">Olamide <span>● Connected</span></div><div class="art-label art-label-bottom">One place to connect<span>Calling · Messages · Meetings</span></div></div>
  </section>
  <section class="feature-strip" id="experience" aria-label="Olamide features">
    <article><span class="feature-icon" aria-hidden="true">◉</span><div><h2>Call with clarity</h2><p>Connect a compatible SIP account over secure WebSocket and manage your calls.</p></div></article>
    <article><span class="feature-icon" aria-hidden="true">✳</span><div><h2>Stay in touch</h2><p>Keep messages, contacts and meetings close to your calling workspace.</p></div></article>
    <article><span class="feature-icon" aria-hidden="true">▣</span><div><h2>Make it yours</h2><p>Choose your dashboard, appearance and account preferences.</p></div></article>
  </section>
  <section class="download-panel" id="downloads" aria-labelledby="download-title">
    <div class="section-heading"><div><p class="eyebrow">TAKE OLAMIDE WITH YOU</p><h2 id="download-title">Choose how you connect.</h2><p>Preview packages are published with each successful release build.</p></div><a href="https://github.com/olamidebello/Sip/releases" target="_blank" rel="noopener noreferrer">All releases ↗</a></div>
    <div id="download-options" class="download-grid" aria-live="polite"><p>Checking available downloads…</p></div>
    <p id="download-status" class="fine-print" role="status"></p>
    <details class="carrier-details"><summary>Carrier partner integration</summary><p>Carrier branding requires Android carrier privileges for the SIM. The Android package can check authorization and request an Olamide display name only on an authorized SIM. It does not replace the system phone app or emergency calling.</p><div id="carrier-control" hidden><p id="carrier-status" role="status"></p><button id="carrier-check" type="button">Check SIM authorization</button><button id="carrier-apply" type="button" hidden>Set Olamide display name</button><button id="carrier-clear" type="button" hidden>Restore carrier name</button></div><p><a href="/carrier-partner.md" download="Olamide-carrier-integration.md">Download integration requirements ↗</a></p></details>
  </section>
  <nav id="app-nav" aria-label="Application" hidden></nav>
  <section id="install-panel">
    <button id="install-app" type="button" hidden>Install Olamide</button>
    <p id="install-help" role="status"></p>
  </section>
  <section id="account">
    <h2>Welcome to Olamide</h2>
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
    <form id="ldap-login">
      <h3>Directory sign-in</h3>
      <label>Tenant slug <input name="tenantSlug" autocomplete="organization" required></label>
      <label>Directory email <input name="email" type="email" autocomplete="username" required></label>
      <label>Directory password <input name="password" type="password" autocomplete="current-password" required></label>
      <button>Sign in with LDAP</button>
    </form>
    <button id="logout" hidden>Sign out</button>
    <p id="account-status" role="status">Not signed in</p>
    <form id="password-change" hidden>
      <h3>Change password</h3>
      <label>Current password <input name="currentPassword" type="password" autocomplete="current-password" required></label>
      <label>New password <input name="newPassword" type="password" autocomplete="new-password" minlength="12" required></label>
      <button>Change password and sign out other sessions</button>
    </form>
  </section>
  <section id="dashboard" hidden>
    <h2>Dashboard</h2><button id="dashboard-refresh" type="button">Refresh dashboard</button>
    <p id="dashboard-updated"></p><div id="dashboard-tiles" class="dashboard-tiles"></div>
    <details><summary>Customize my dashboard</summary>
      <div id="dashboard-personal-options"></div>
      <button id="dashboard-save" type="button">Save my layout</button>
      <button id="dashboard-reset" type="button">Use tenant layout</button>
    </details>
    <p id="dashboard-status" role="status"></p>
  </section>
  <section id="search-panel" hidden>
    <h2>Search</h2>
    <form id="global-search"><label>Search visible app records <input name="q" minlength="2" maxlength="100" required></label>
      <label>Category <select name="scope"><option value="all">All</option><option value="tickets">Tickets</option><option value="contacts">Contacts</option><option value="plans">Plans</option></select></label>
      <button>Search</button></form>
    <div id="search-results"></div><p id="search-status" role="status"></p>
  </section>
  <section id="locale-settings" hidden>
    <h2>Language, country and currency</h2>
    <p>Your selection controls locale preferences and formatting. The interface text is currently English, and prices retain their stated billing currency.</p>
    <form id="locale-user-form"><label>Language <select name="language"></select></label>
      <label>Country or territory <select name="country"></select></label>
      <label>Preferred currency <select name="currency"></select></label>
      <button>Save my preferences</button></form>
    <button id="locale-reset" type="button">Use tenant defaults</button><p id="locale-status" role="status"></p>
  </section>
  <section id="support" hidden>
    <h2>Technical support</h2>
    <form id="support-create"><h3>New ticket</h3>
      <label>Subject <input name="subject" maxlength="160" required></label>
      <label>Category <select name="category"><option>technical</option><option>calling</option><option>numbers</option><option>account</option><option>billing</option><option>other</option></select></label>
      <label>Description <textarea name="description" maxlength="4000" required></textarea></label>
      <button>Create ticket</button></form>
    <form id="support-filter"><h3>Tickets</h3>
      <label>Keywords <input name="q" minlength="2" maxlength="100"></label>
      <label>Status <select name="status"><option value="">Any</option><option>open</option><option>in_progress</option><option>waiting_on_user</option><option>resolved</option><option>closed</option></select></label>
      <label>Priority <select name="priority"><option value="">Any</option><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></label>
      <button>Find tickets</button></form>
    <button id="support-refresh" type="button">Refresh tickets</button>
    <ul id="support-list"></ul>
    <button id="support-prev" type="button">Previous page</button><button id="support-next" type="button">Next page</button>
    <section id="support-detail" hidden><h3 id="support-title"></h3><p id="support-meta"></p>
      <p id="support-description"></p><h4>Conversation</h4><ol id="support-replies"></ol>
      <h4>Ticket history</h4><ol id="support-history"></ol>
      <form id="support-reply"><label>Reply <textarea name="body" maxlength="4000" required></textarea></label>
        <label id="support-note-control" hidden><input name="internalNote" type="checkbox"> Internal administrator note</label>
        <button>Post reply</button></form>
      <form id="support-manage" hidden><h4>Manage ticket</h4>
        <label>Status <select name="status"><option>open</option><option>in_progress</option><option>waiting_on_user</option><option>resolved</option><option>closed</option></select></label>
        <label>Priority <select name="priority"><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></label>
        <label>Assign administrator <select name="assigneeId"></select></label><button>Save ticket controls</button></form>
    </section><p id="support-status" role="status"></p>
  </section>
  <section id="background-user" hidden>
    <h2>My background</h2>
    <form id="background-user-form">
      <label>Day background <select name="dayPreset"><option value="ocean">Ocean</option><option value="midnight">Midnight</option><option value="aurora">Aurora</option><option value="sunrise">Sunrise</option><option value="slate">Slate</option></select></label>
      <label>Night background <select name="nightPreset"><option value="midnight">Midnight</option><option value="ocean">Ocean</option><option value="aurora">Aurora</option><option value="sunrise">Sunrise</option><option value="slate">Slate</option></select></label>
      <label><input name="schedule" type="checkbox"> Switch at 6 AM and 6 PM on this device</label>
      <label><input name="animate" type="checkbox"> Gentle movement</label>
      <button>Save my background</button>
    </form>
    <button id="background-reset" type="button">Use tenant background</button>
    <p id="background-user-status" role="status"></p>
  </section>
  <section id="chat" hidden>
    <h2>Messages</h2>
    <p>Account messages are stored on this server. They are not end-to-end encrypted.</p>
    <form id="add-contact">
      <label>Contact email <input name="email" type="email" required></label>
      <button>Add contact</button>
    </form>
    <div class="bulk-controls">
      <label>Import contacts CSV (email column, up to 500 tenant users) <input id="contacts-file" type="file" accept=".csv,text/csv"></label>
      <button id="contacts-import" type="button">Import contacts</button>
      <button id="contacts-export" type="button">Export contacts CSV</button>
    </div>
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
    <h3>Account wallet</h3>
    <p id="wallet-balance">Loading wallet…</p>
    <p>Funding and cash-out are unavailable until a verified payment provider is connected. A wallet transfer requires an existing cleared balance.</p>
    <form id="wallet-transfer">
      <label>Recipient email <input name="recipientEmail" type="email" required></label>
      <label>Amount (USD cents) <input name="amountCents" type="number" min="1" max="100000000" step="1" required></label>
      <button>Send from available balance</button>
    </form>
    <ul id="wallet-entries"></ul><p id="wallet-status" role="status"></p>
    <h3>Available numbers</h3>
    <label>Provider <select id="number-provider">
      <option value="inhouse">In-house</option><option value="flowroute">Flowroute</option><option value="didww">DIDWW</option>
    </select></label>
    <label>Number prefix (optional) <input id="number-prefix" placeholder="+23420315"></label>
    <button id="search-numbers" type="button">Search numbers</button>
    <ul id="numbers"></ul>
    <h3>My number requests</h3><ul id="my-numbers"></ul><ul id="provider-requests"></ul>
    <h3>Port a number</h3>
    <p>This creates a draft request for review; it does not submit a carrier port.</p>
    <form id="port-form">
      <label>Number (E.164) <input name="number" placeholder="+12125550123" required></label>
      <label>Destination provider <select name="provider"><option value="flowroute">Flowroute</option>
        <option value="didww">DIDWW</option></select></label>
      <button>Create draft</button>
    </form>
    <ul id="ports"></ul><p id="billing-status" role="status"></p>
    <h3>Nigeria identity verification</h3>
    <p id="nin-status">Checking NINAuth availability…</p>
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
    <section id="locale-admin">
      <h3>Tenant locale defaults</h3>
      <form id="locale-admin-form"><label>Language <select name="language"></select></label>
        <label>Country or territory <select name="country"></select></label>
        <label>Preferred currency <select name="currency"></select></label>
        <button>Save tenant defaults</button></form>
      <p id="locale-admin-status" role="status"></p>
    </section>
    <section id="dashboard-admin">
      <h3>Tenant dashboard defaults</h3>
      <div id="dashboard-tenant-options"></div>
      <label><input id="dashboard-overrides" type="checkbox"> Allow users to customize their dashboard</label>
      <button id="dashboard-tenant-save" type="button">Save tenant dashboard</button>
      <p id="dashboard-admin-status" role="status"></p>
    </section>
    <h2>Administrator</h2>
    <p id="admin-overview"></p>
    <form id="server-config">
      <label>Default SIP secure WebSocket URL <input name="sipWssUrl" type="url" placeholder="wss://sip.example.com"></label>
      <button>Save server URL</button>
    </form>
    <p id="admin-status" role="status"></p>
    <section id="geofence-admin">
      <h3>Tenant calling area policy</h3>
      <p>Allowed circles are checked by the browser before outgoing calls. The SIP switch must enforce its own location policy.</p>
      <label><input id="geofence-enabled" type="checkbox"> Require a location within an allowed zone</label>
      <label>Maximum location uncertainty (meters) <input id="geofence-accuracy" type="number" min="1" max="10000" value="100"></label>
      <form id="geofence-zone-add">
        <label>Latitude <input name="latitude" type="number" min="-90" max="90" step="any" required></label>
        <label>Longitude <input name="longitude" type="number" min="-180" max="180" step="any" required></label>
        <label>Radius (meters) <input name="radiusMeters" type="number" min="1" max="100000" step="any" required></label>
        <button>Add allowed zone</button>
      </form>
      <ul id="geofence-zones"></ul><button id="geofence-save" type="button">Save calling area policy</button>
      <p id="geofence-admin-status" role="status"></p>
    </section>
    <section id="catalog-controls">
      <h3>DID, plan, and tenant role controls</h3>
      <p>Super admins select a tenant above, then set its purchase and tenant administrator permissions here.</p>
      <p id="catalog-policy-status" role="status"></p>
      <form id="catalog-policy-form" hidden><button>Save tenant controls</button></form>
      <h4>Plan catalog</h4><ul id="admin-plans"></ul>
      <h4>Provider DID requests for review</h4><ul id="admin-did-requests"></ul>
    </section>
    <section id="ldap-admin">
      <h3>LDAP authentication and group access</h3>
      <p>Server LDAPS credentials are configured privately. Map directory group DNs to app groups; only mapped members can sign in.</p>
      <p id="ldap-config-state"></p>
      <label><input id="ldap-enabled" type="checkbox"> Enable directory sign-in for this tenant</label>
      <button id="ldap-save-enabled" type="button">Save sign-in policy</button>
      <form id="ldap-map-form">
        <label>Directory group DN <input name="groupDn" placeholder="cn=agents,ou=groups,dc=example,dc=com" required maxlength="512"></label>
        <label>App feature group <select name="groupId" id="ldap-app-group"></select></label>
        <button>Add group mapping</button>
      </form>
      <ul id="ldap-mappings"></ul>
      <p id="ldap-status" role="status"></p>
    </section>
    <section id="auth-providers-admin">
      <h3>Authentication providers</h3>
      <p id="auth-providers-status" role="status"></p>
      <form id="auth-providers-form" hidden>
        <label><input name="localEnabled" type="checkbox"> Allow local password sign-in</label>
        <label><input name="ldapAdminManaged" type="checkbox"> Let tenant administrators manage LDAP mappings and sign-in</label>
        <button>Save tenant authentication policy</button>
      </form>
    </section>
    <section id="background-admin" hidden>
      <h3>Tenant background policy</h3>
      <form id="background-admin-form">
        <label>Day background <select name="dayPreset"><option value="ocean">Ocean</option><option value="midnight">Midnight</option><option value="aurora">Aurora</option><option value="sunrise">Sunrise</option><option value="slate">Slate</option></select></label>
        <label>Night background <select name="nightPreset"><option value="midnight">Midnight</option><option value="ocean">Ocean</option><option value="aurora">Aurora</option><option value="sunrise">Sunrise</option><option value="slate">Slate</option></select></label>
        <label><input name="schedule" type="checkbox"> Switch at 6 AM and 6 PM on each device</label>
        <label><input name="animate" type="checkbox"> Gentle movement</label>
        <label><input name="allowUserOverride" type="checkbox" checked> Allow users to choose their own background</label>
        <button>Save tenant background</button>
      </form>
      <p id="background-admin-status" role="status"></p>
    </section>
    <section id="report-admin">
      <h3>Reports and analytics</h3>
      <form id="report-filter">
        <label>From (UTC) <input name="from" type="date" required></label>
        <label>Through (UTC) <input name="to" type="date" required></label>
        <button>Run report</button>
      </form>
      <p id="report-summary"></p>
      <a id="report-export" hidden>Download daily calls CSV</a>
      <a id="report-invoice-export" hidden>Download invoice summary CSV</a>
      <div id="report-details"></div>
      <p id="report-status" role="status"></p>
    </section>
    <section id="inhouse-admin">
      <h3>In-house DID management</h3>
      <p>NCC lists these five Nigerian +234 Ilorin blocks under Smooth Multi-Service Platform Limited. Import candidate inventory, then publish only verified unused numbers. No live switch provisioning is connected.</p>
      <ul id="inhouse-blocks"></ul>
      <form id="inhouse-block-import">
        <label>Block <select name="prefix"><option>203150</option><option>203151</option><option>203152</option><option>203153</option><option>203154</option></select></label>
        <label>Setup price in cents <input name="setupCents" type="number" min="0" required></label>
        <label>Monthly price in cents <input name="monthlyCents" type="number" min="0" required></label>
        <button>Import 10,000 candidates</button>
      </form>
      <form id="inhouse-range-publish">
        <label>Block <select name="prefix"><option>203150</option><option>203151</option><option>203152</option><option>203153</option><option>203154</option></select></label>
        <label>First verified suffix <input name="startSuffix" type="number" min="0" max="9999" required></label>
        <label>Last verified suffix <input name="endSuffix" type="number" min="0" max="9999" required></label>
        <label>Unused number verification reference <input name="inventoryReference" maxlength="255" required></label>
        <label><input name="confirmed" type="checkbox" required> I verified this range is unused and available to offer</label>
        <button>Publish verified range</button>
      </form>
      <form id="inhouse-import">
        <label>Verified E.164 number <input name="number" placeholder="+2342031500000" required></label>
        <label>Setup price in USD cents <input name="setupCents" type="number" min="0" required></label>
        <label>Monthly price in USD cents <input name="monthlyCents" type="number" min="0" required></label>
        <label>Numbering rights reference <input name="evidenceReference" maxlength="255" required></label>
        <button>Stage number</button>
      </form>
      <form id="inhouse-price">
        <h4>Price selected in-house number</h4>
        <label>Number ID <input name="id" readonly required></label>
        <label>Buy setup cents <input name="buySetupCents" type="number" min="0" required></label>
        <label>Buy monthly cents <input name="buyMonthlyCents" type="number" min="0" required></label>
        <label>Sell method <select name="priceMode"><option value="manual">Manual sell price</option><option value="rule">Follow in-house rule</option></select></label>
        <label>Manual setup sell cents <input name="sellSetupCents" type="number" min="0" required></label>
        <label>Manual monthly sell cents <input name="sellMonthlyCents" type="number" min="0" required></label>
        <button>Save number pricing</button>
      </form>
      <form id="inhouse-filter">
        <label>Inventory number prefix <input name="q" placeholder="+234203150"></label>
        <label>Status <select name="status"><option value="">All</option><option>unverified</option><option>available</option><option>reserved</option><option>assigned</option><option>disabled</option></select></label>
        <button>Find numbers</button>
      </form>
      <ul id="inhouse-admin-numbers"></ul>
      <p id="inhouse-status" role="status"></p>
    </section>
    <section id="nigeria-admin">
      <h3>Nigeria interconnect plans</h3>
      <p>Save the authorized clearinghouse or local operator handoff. No live SIP route is created.</p>
      <form id="nigeria-peer-form">
        <label>Operator name <input name="name" required maxlength="100"></label>
        <label>Peer type <select name="peerType"><option value="clearinghouse">Clearinghouse</option><option value="operator">Local operator</option></select></label>
        <label>Signaling host <input name="host" placeholder="peer.operator.example" required></label>
        <label>Port <input name="port" type="number" min="1" max="65535" value="5061" required></label>
        <label>Transport <select name="transport"><option value="tls">TLS</option><option value="tcp">TCP</option><option value="udp">UDP</option></select></label>
        <label>+234 destination digits prefix <input name="destinationPrefix" pattern="234[0-9]{0,12}" value="234" required></label>
        <label>Agreement reference <input name="agreementReference" maxlength="255" required></label>
        <button>Save handoff plan</button>
      </form>
      <ul id="nigeria-peers"></ul>
      <form id="nigeria-preview">
        <label>Preview Nigerian number <input name="number" placeholder="+2348012345678" required></label>
        <button>Preview planned peer</button>
      </form>
      <p id="nigeria-status" role="status"></p>
    </section>
    <section id="cdr-admin">
      <h3>Imported call records</h3>
      <p>Verified switch records only. These are unrated and never charge a customer.</p>
      <button id="refresh-cdr" type="button">Refresh call records</button>
      <ol id="cdr-records"></ol>
      <p id="cdr-status" role="status"></p>
    </section>
    <form id="create-plan">
      <h3>Create monthly plan</h3>
      <label>Name <input name="name" required></label>
      <label>Description <input name="description"></label>
      <label>Price in USD cents <input name="monthlyCents" type="number" min="0" step="1" required></label>
      <button>Create plan</button>
    </form>
    <section id="pricing-admin">
      <h3>DID buying and selling prices</h3>
      <p>Provider buy costs come from live inventory. In-house buy costs are entered by an administrator. Rules affect new searches and reservations.</p>
      <form id="pricing-rule">
        <label>Source <select name="provider"><option value="flowroute">Flowroute</option><option value="didww">DIDWW</option><option value="inhouse">In-house</option></select></label>
        <label>Method <select name="mode"><option value="percent">Percentage adjustment</option><option value="fixed">Fixed cent increase or decrease</option><option value="manual">Manual selling price in cents</option></select></label>
        <label>Setup value <input name="setupValue" type="number" step="1" required></label>
        <label>Monthly value <input name="monthlyValue" type="number" step="1" required></label>
        <p>Percentage values use basis points: 3000 = +30%, -1000 = -10%. Fixed values use cents; negative decreases price. Manual values are final cents. Decreases stop at zero.</p>
        <button>Save source rule</button>
      </form>
      <form id="pricing-preview">
        <label>Buy setup cost in cents <input name="buySetup" type="number" min="0" required></label>
        <label>Buy monthly cost in cents <input name="buyMonthly" type="number" min="0" required></label>
        <button>Preview selling prices</button>
      </form>
      <p id="pricing-result" role="status"></p>
    </section>
    <section id="group-admin">
      <h3>User groups and feature access</h3>
      <form id="group-create">
        <label>New group name <input name="name" minlength="2" maxlength="80" required></label>
        <div id="group-new-features"></div>
        <button>Create group</button>
      </form>
      <label>Group to edit <select id="group-list"></select></label>
      <label>Group name <input id="group-edit-name" minlength="2" maxlength="80"></label>
      <div id="group-edit-features"></div>
      <button id="group-update" type="button">Save group permissions</button>
      <button id="group-delete" type="button">Delete empty group</button>
      <label>User <select id="group-user"></select></label>
      <div id="group-memberships"></div>
      <button id="group-assign" type="button">Save user's groups</button>
      <h4>User security</h4>
      <p id="group-user-details"></p>
      <button id="user-suspend" type="button">Suspend user</button>
      <button id="user-activate" type="button">Activate user</button>
      <button id="user-revoke" type="button">Revoke sessions</button>
      <button id="user-promote" type="button">Promote to tenant admin</button>
      <button id="user-demote" type="button">Demote to user</button>
      <h4>Recent security events</h4>
      <ol id="security-events"></ol>
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
      <h4>Outbound call barring policy</h4>
      <p>Longest matching prefix wins. Policies affect the route preview only; connect a switch for live enforcement.</p>
      <form id="pbx-policy-form">
        <label>Digits prefix <input name="prefix" pattern="[0-9]{1,15}" required></label>
        <label>Action <select name="action"><option value="block">Block</option><option value="allow">Allow exception</option></select></label>
        <label>Reason <input name="reason" maxlength="200"></label>
        <button>Save preview policy</button>
      </form><ul id="pbx-policy-list"></ul>
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
    <p>Favorites, recent call entries, and do not disturb are saved to your Olamide account. Recent entries are app-side observations, not carrier CDRs.</p>
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
setupDownloads();
setupCarrierControl();
const navigation=[
  ["account","Account"],["dashboard","Dashboard"],["search-panel","Search"],["support","Support"],["locale-settings","Locale"],["softphone-tools","Dialer"],["geo","Calling area"],
  ["chat","Messages"],["billing","Billing"],["meetings","Meetings"],
  ["agent-panel","Call center"],["background-user","Appearance"],
  ["admin","Administration"],["locale-admin","Locale defaults"],["dashboard-admin","Dashboard defaults"],["group-admin","Users & groups"],["tenant-admin","Tenants"],
  ["catalog-controls","Plans & access"],["inhouse-admin","DID inventory"],
  ["pricing-admin","Pricing"],["pbx-admin","PBX"],["report-admin","Reports"],
  ["cdr-admin","Call records"],["nigeria-admin","Nigeria interconnect"],
  ["ldap-admin","LDAP"],["auth-providers-admin","Authentication"],
  ["geofence-admin","Geofencing"],["background-admin","Tenant appearance"],
  ["mobile-admin","App releases"]
];
function updateNavigation() {
  const nav=$("#app-nav");nav.replaceChildren();
  for(const [id,label] of navigation) {
    const section=document.getElementById(id);
    if(!section || section.closest("[hidden]")) continue;
    const link=document.createElement("a");link.href=`#${id}`;link.textContent=label;
    nav.append(link);
  }
  nav.hidden=false;
}
updateNavigation();
const connectForm = $("#connect");
const dialForm = $("#dial");
const meetings = setupMeetings();
const dashboard=setupDashboard({get:path=>apiGet(path),request:(path,body,method)=>accountRequest(path,body,method)});
const support=setupSupport({get:path=>apiGet(path),request:(path,body,method)=>accountRequest(path,body,method)});
const localeSettings=setupLocaleSettings({get:path=>apiGet(path),request:(path,body,method)=>accountRequest(path,body,method)});
const groupAdmin = setupGroupAdmin();
const mobileAdmin = setupMobileAdmin();
const tenantAdmin = setupTenants();
const pbx = setupPbx();
const reports = setupReports({get:(path)=>apiGet(path)});
const pricing = setupPricing();
const background = setupBackground();
const ldapAdmin = setupLdapAdmin();
const authProviders = setupAuthProviders();
const catalogControl = setupCatalogControl();
setupInstall();
let phone;
let onCall = false;
let onHold = false;
let muted = false;
let currentCall = null;
const favorites = new Set();
let recentCalls = [],softphoneUserId=null,softphoneLoad=0;
async function softphoneRequest(path,method="GET",body) {
  const response=await fetch(path,{method,credentials:"same-origin",
    headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
  const data=await response.json();
  if (!response.ok) throw new Error(data.error||"Softphone account request failed");
  return data;
}
async function refreshSoftphoneState(user) {
  const generation=++softphoneLoad;
  softphoneUserId=user.id;
  const [settings,history]=await Promise.all([
    softphoneRequest("/api/softphone/preferences"),softphoneRequest("/api/softphone/calls")]);
  if (generation!==softphoneLoad || softphoneUserId!==user.id) return;
  favorites.clear();for(const address of settings.favorites) favorites.add(address);
  $("#dnd").checked=settings.dnd;
  recentCalls=history.calls;renderSoftphoneLists();
}
async function saveSoftphonePreferences() {
  if (!softphoneUserId) throw new Error("Sign in to save softphone settings");
  await softphoneRequest("/api/softphone/preferences","PUT",{dnd:$("#dnd").checked,favorites:[...favorites]});
}
$("#dnd").onchange = () => saveSoftphonePreferences().catch(report);
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
    remove.onclick = async () => {
      favorites.delete(address);
      renderSoftphoneLists();
      try {await saveSoftphonePreferences();} catch(error) {favorites.add(address);renderSoftphoneLists();report(error);}
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
$("#favorite-form").onsubmit = async (event) => {
  event.preventDefault();
  const address = String(new FormData(event.currentTarget).get("address")).trim();
  if (!/^sip:[^\s@]+@[^\s@]+$/i.test(address)) return;
  favorites.add(address);
  try {await saveSoftphonePreferences();event.currentTarget.reset();renderSoftphoneLists();}
  catch(error) {favorites.delete(address);report(error);}
};
$("#clear-calls").onclick = async () => {
  try {await softphoneRequest("/api/softphone/calls","DELETE");recentCalls=[];renderSoftphoneLists();}
  catch(error) {report(error);}
};
function finishCall(result) {
  if (!currentCall) return;
  recentCalls.unshift({ ...currentCall, result, at: new Date().toISOString() });
  recentCalls = recentCalls.slice(0, 50);
  if (softphoneUserId) softphoneRequest("/api/softphone/calls","POST",{
    direction:currentCall.direction,address:currentCall.address,result
  }).catch(report);
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
let geofenceZones=[],geofenceGeneration=0;
function renderGeofenceZones() {
  const list=$("#geofence-zones");list.replaceChildren();
  geofenceZones.forEach((zone,index)=>{
    const item=document.createElement("li"),button=document.createElement("button");
    item.textContent=`${zone.latitude}, ${zone.longitude} — ${zone.radiusMeters} m `;
    button.type="button";button.textContent="Remove";
    button.onclick=()=>{geofenceZones.splice(index,1);renderGeofenceZones();};
    item.append(button);list.append(item);
  });
}
async function loadGeofencePolicy() {
  const generation=++geofenceGeneration;
  geoPolicyLoaded=false;
  const policy=await apiGet("/api/geofence");
  if (generation!==geofenceGeneration) return;
  if (typeof policy.enabled!=="boolean" || !Number.isFinite(policy.maxAccuracyMeters) || !Array.isArray(policy.zones))
    throw new Error("Invalid calling area policy");
  geoPolicy=policy;geoPolicyLoaded=true;
  $("#geo-policy").textContent=policy.enabled?"Calls require an accurate location within an allowed area.":"Location checks are currently off.";
  $("#check-location").hidden=!policy.enabled;
  return policy;
}
async function loadGeofenceAdmin() {
  const policy=await apiGet("/api/admin/geofence");
  $("#geofence-enabled").checked=policy.enabled;
  $("#geofence-accuracy").value=policy.maxAccuracyMeters;
  geofenceZones=policy.zones;renderGeofenceZones();
}
$("#geofence-zone-add").onsubmit=event=>{
  event.preventDefault();
  const data=Object.fromEntries(new FormData(event.currentTarget));
  if (geofenceZones.length>=20) {$("#geofence-admin-status").textContent="Maximum 20 zones";return;}
  geofenceZones.push({latitude:Number(data.latitude),longitude:Number(data.longitude),radiusMeters:Number(data.radiusMeters)});
  event.currentTarget.reset();renderGeofenceZones();
};
$("#geofence-save").onclick=async()=>{
  try {
    const policy=await accountRequest("/api/admin/geofence",{enabled:$("#geofence-enabled").checked,
      maxAccuracyMeters:Number($("#geofence-accuracy").value),zones:geofenceZones},"PUT");
    await loadGeofencePolicy();$("#geofence-admin-status").textContent=`Saved ${policy.zones.length} zone(s) for this tenant.`;
  } catch(error) {$("#geofence-admin-status").textContent=error.message;}
};

async function accountRequest(path, body, method="POST") {
  const response = await fetch(path, {
    method,
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
async function refreshCdr() {
  const {records} = await apiGet("/api/admin/cdr");
  const list = $("#cdr-records"); list.replaceChildren();
  for (const record of records) {
    const item = document.createElement("li");
    item.textContent = `${record.started_at} · ${record.direction} · ${record.caller_e164} → ${record.callee_e164} · ${record.disposition} · ${record.billable_seconds}s billable · ${record.source}/${record.leg_id}`;
    list.append(item);
  }
  $("#cdr-status").textContent = `${records.length} recent records; no charges applied.`;
}
async function refreshInhouse() {
  const filters=new URLSearchParams(new FormData($("#inhouse-filter")));
  const [blocks,inventory] = await Promise.all([
    apiGet("/api/admin/inhouse/blocks"),apiGet("/api/admin/inhouse/numbers?"+filters)
  ]);
  $("#inhouse-blocks").replaceChildren(...blocks.blocks.map((block) => {
    const item=document.createElement("li");
    item.textContent = `+234${block.prefix_digits}XXXX — ${block.requested_count.toLocaleString()} candidates, ${block.status}. ${block.note}`;
    return item;
  }));
  const list=$("#inhouse-admin-numbers");list.replaceChildren();
  for (const did of inventory.numbers) {
    const item=document.createElement("li");
    item.append(document.createTextNode(`${did.number_e164} — ${did.status} — ${did.price_mode} pricing (buy ${did.buy_setup_cents}/${did.buy_monthly_cents} cents setup/monthly) — `));
    if (["available","unverified","disabled"].includes(did.status)) {
      const edit=document.createElement("button");edit.type="button";edit.textContent="Set buy/sell price";
      edit.onclick=()=>{
        const form=$("#inhouse-price");
        for(const [name,value] of Object.entries({id:did.id,buySetupCents:did.buy_setup_cents,
          buyMonthlyCents:did.buy_monthly_cents,sellSetupCents:did.setup_cents,
          sellMonthlyCents:did.monthly_cents,priceMode:did.price_mode})) form.elements[name].value=value;
        form.scrollIntoView({behavior:"smooth"});
      };
      item.append(edit);
    }
    if (did.status==="unverified") {
      const publish=document.createElement("button"); publish.textContent="Confirm rights and publish";
      publish.onclick=async () => {
        try {
          await fetchInhouseAction(`/api/admin/inhouse/numbers/${did.id}/publish`,{confirmed:true});
          await refreshInhouse();
        } catch(error) {$("#inhouse-status").textContent=error.message;}
      };
      item.append(publish);
    }
    if (did.status==="available") {
      const disable=document.createElement("button");disable.textContent="Disable";
      disable.onclick=async () => {
        try {await fetchInhouseAction(`/api/admin/inhouse/numbers/${did.id}/disable`,{});await refreshInhouse();}
        catch(error) {$("#inhouse-status").textContent=error.message;}
      };
      item.append(disable);
    }
    if (did.status==="reserved") {
      const release=document.createElement("button");release.textContent="Release after expiry";
      release.onclick=async () => {
        try {await fetchInhouseAction(`/api/admin/inhouse/numbers/${did.id}/release`,{});await refreshInhouse();}
        catch(error) {$("#inhouse-status").textContent=error.message;}
      };
      item.append(release);
    }
    list.append(item);
  }
}
$("#inhouse-filter").onsubmit=(event)=>{
  event.preventDefault();refreshInhouse().catch(error=>{$("#inhouse-status").textContent=error.message;});
};
async function refreshNigeria() {
  const {peers}=await apiGet("/api/admin/nigeria/peers");
  $("#nigeria-peers").replaceChildren(...peers.map((peer)=>{
    const item=document.createElement("li");
    item.textContent=`${peer.name} (${peer.peer_type}): ${peer.host}:${peer.port}/${peer.transport}, prefix ${peer.destination_prefix} — ${peer.status}`;
    return item;
  }));
}
$("#nigeria-peer-form").onsubmit=async(event)=>{
  event.preventDefault();
  try {
    const form=event.currentTarget,data=Object.fromEntries(new FormData(form));
    await accountRequest("/api/admin/nigeria/peers",{...data,port:Number(data.port)});
    form.reset();await refreshNigeria();
    $("#nigeria-status").textContent="Handoff saved as a plan; no traffic routed.";
  } catch(error) {$("#nigeria-status").textContent=error.message;}
};
$("#nigeria-preview").onsubmit=async(event)=>{
  event.preventDefault();
  try {
    const number=event.currentTarget.elements.number.value;
    const {peer}=await apiGet("/api/admin/nigeria/preview?number="+encodeURIComponent(number));
    $("#nigeria-status").textContent=peer ?
      `Preview: ${peer.name} for prefix ${peer.destination_prefix}; no call placed.` :
      "No matching planned Nigerian peer.";
  } catch(error) {$("#nigeria-status").textContent=error.message;}
};
async function fetchInhouseAction(path,body) {return accountRequest(path,body);}
$("#inhouse-block-import").onsubmit=async(event) => {
  event.preventDefault();
  try {
    const form=event.currentTarget,data=Object.fromEntries(new FormData(form));
    const result=await accountRequest(`/api/admin/inhouse/blocks/${data.prefix}/import`,{
      setupCents:Number(data.setupCents),monthlyCents:Number(data.monthlyCents)});
    await refreshInhouse();
    $("#inhouse-status").textContent=`${result.imported} Nigerian numbers staged for verification.`;
  } catch(error) {$("#inhouse-status").textContent=error.message;}
};
$("#inhouse-range-publish").onsubmit=async(event) => {
  event.preventDefault();
  try {
    const form=event.currentTarget,data=Object.fromEntries(new FormData(form));
    const result=await accountRequest(`/api/admin/inhouse/blocks/${data.prefix}/publish-range`,{
      startSuffix:Number(data.startSuffix),endSuffix:Number(data.endSuffix),
      inventoryReference:data.inventoryReference,confirmed:data.confirmed==="on"});
    await refreshInhouse();
    $("#inhouse-status").textContent=`${result.published} verified numbers published for reservation; no SIP provisioning.`;
  } catch(error) {$("#inhouse-status").textContent=error.message;}
};
$("#inhouse-import").onsubmit=async(event) => {
  event.preventDefault();
  try {
    const form=event.currentTarget;
    const data=Object.fromEntries(new FormData(form));
    await accountRequest("/api/admin/inhouse/numbers",{...data,
      setupCents:Number(data.setupCents),monthlyCents:Number(data.monthlyCents)});
    form.reset();await refreshInhouse();
    $("#inhouse-status").textContent="Number staged for rights review.";
  } catch(error) {$("#inhouse-status").textContent=error.message;}
};
$("#inhouse-price").onsubmit=async(event)=>{
  event.preventDefault();
  try {
    const data=Object.fromEntries(new FormData(event.currentTarget));
    const response=await fetch(`/api/admin/inhouse/numbers/${data.id}/pricing`,{
      method:"PUT",headers:{"Content-Type":"application/json"},credentials:"same-origin",
      body:JSON.stringify({priceMode:data.priceMode,buySetupCents:Number(data.buySetupCents),
        buyMonthlyCents:Number(data.buyMonthlyCents),sellSetupCents:Number(data.sellSetupCents),
        sellMonthlyCents:Number(data.sellMonthlyCents)})});
    const result=await response.json();
    if (!response.ok) throw new Error(result.error||"Price update failed");
    await refreshInhouse();$("#inhouse-status").textContent="Number pricing saved.";
  } catch(error) {$("#inhouse-status").textContent=error.message;}
};
$("#refresh-cdr").onclick = () => refreshCdr().catch((error) => { $("#cdr-status").textContent = error.message; });
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
  refreshSoftphoneState(user).catch(error=>{$("#account-status").textContent=error.message;});
  loadGeofencePolicy().catch(error=>{$("#geo-policy").textContent=error.message+". Outgoing calls are blocked.";});
  $("#signup").hidden = true;
  $("#login").hidden = true;
  $("#ldap-login").hidden = true;
  $("#logout").hidden = false;
  $("#background-user").hidden = false;
  $("#dashboard").hidden=false;
  $("#search-panel").hidden=false;$("#support").hidden=false;
  $("#locale-settings").hidden=false;
  background.refresh(["admin","super_admin"].includes(user.role));
  $("#password-change").hidden = user.authSource==="ldap";
  $("#account-status").textContent = `Signed in as ${user.name}`;
  $("#chat").hidden = !user.features?.messaging;
  $("#billing").hidden = !user.features?.billing;
  if (user.features?.meetings) meetings.show();
  else meetings.hide();
  if (user.features?.billing)
    Promise.all([refreshBilling(),refreshMyNumbers()])
      .catch((error) => { $("#billing-status").textContent = error.message; });
  if (user.features?.billing) apiGet("/api/catalog-policy").then(policy=>{
    $("#select-plan").disabled=!policy.planRequests;
    $("#search-numbers").disabled=!policy.didRequests;
    if (!policy.planRequests || !policy.didRequests)
      $("#billing-status").textContent="Tenant purchase settings: plans "+(policy.planRequests?"enabled":"disabled")+", DIDs "+(policy.didRequests?"enabled":"disabled")+".";
  }).catch(error=>{$("#billing-status").textContent=error.message;});
  apiGet("/api/nigeria/nin/status")
    .then((result)=>{$("#nin-status").textContent=result.note;})
    .catch((error)=>{$("#nin-status").textContent=error.message;});
  if (user.features?.messaging)
    loadContacts().catch((error) => { $("#chat-status").textContent = error.message; });
  $("#agent-panel").hidden = !user.features?.call_center;
  pbx.refreshSelf(user).catch((error) => { $("#agent-status-result").textContent = error.message; });
  $("#admin").hidden = !(["admin","super_admin"].includes(user.role));
  dashboard.refresh(["admin","super_admin"].includes(user.role)).catch(error=>{$("#dashboard-status").textContent=error.message;});
  support.refresh(["admin","super_admin"].includes(user.role)).catch(error=>{$("#support-status").textContent=error.message;});
  localeSettings.refresh(["admin","super_admin"].includes(user.role)).catch(error=>{$("#locale-status").textContent=error.message;});
  if (["admin","super_admin"].includes(user.role)) {
    loadGeofenceAdmin().catch(error=>{$("#geofence-admin-status").textContent=error.message;});
    reports.refresh();
    pricing.refresh();
    ldapAdmin.refresh();
    authProviders.refresh();
    catalogControl.refresh();
    refreshCatalogAdmin().catch((error)=>{$("#admin-status").textContent=error.message;});
    refreshInhouse().catch((error) => { $("#inhouse-status").textContent = error.message; });
    refreshNigeria().catch((error) => { $("#nigeria-status").textContent = error.message; });
    refreshCdr().catch((error) => { $("#cdr-status").textContent = error.message; });
    pbx.refreshAdmin().catch((error) => { $("#pbx-status").textContent = error.message; });
    tenantAdmin.refresh(user).catch((error) => { $("#tenant-status").textContent = error.message; });
    mobileAdmin.refresh().catch((error) => { $("#mobile-status").textContent = error.message; });
    groupAdmin.refresh().catch((error) => { $("#group-status").textContent = error.message; });
    apiGet("/api/admin/overview")
      .then((stats) => { $("#admin-overview").textContent =
        `${stats.users} users, ${stats.messages} messages, ${stats.active_sessions} active sessions`; })
      .catch((error) => { $("#admin-status").textContent = error.message; });
  }
  updateNavigation();
}
function money(cents) { return new Intl.NumberFormat(document.documentElement.lang||"en",{style:"currency",currency:"USD"}).format(cents/100); }
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
async function refreshCatalogAdmin() {
  const [planData,didData,policyData]=await Promise.all([apiGet("/api/admin/plans"),apiGet("/api/admin/numbers/requests"),apiGet("/api/admin/catalog-policy")]);
  const list=$("#admin-plans");list.replaceChildren();
  for(const plan of planData.plans) {
    const item=document.createElement("li"),button=document.createElement("button");
    item.textContent=`${plan.name}: ${money(plan.monthly_cents)}/month, ${plan.active?"active":"hidden"} — `;
    button.type="button";button.textContent=plan.active?"Hide plan":"Publish plan";
    button.disabled=!(policyData.editable||policyData.policy.adminPlans);
    button.onclick=async()=>{
      try {await accountRequest(`/api/admin/plans/${plan.id}`,{name:plan.name,description:plan.description,
        monthlyCents:plan.monthly_cents,active:!plan.active},"PUT");
        await Promise.all([refreshCatalogAdmin(),loadPlans()]);}
      catch(error){$("#admin-status").textContent=error.message;}
    };
    item.append(button);list.append(item);
  }
  $("#admin-did-requests").replaceChildren(...didData.requests.map(request=>{
    const item=document.createElement("li");
    item.textContent=`${request.email}: ${request.number_e164} (${request.provider}) — ${request.status}; invoice ${request.invoice_status||"none"}; setup ${money(request.setup_cents)}, monthly ${money(request.monthly_cents)}`;
    return item;
  }));
}
async function refreshBilling() {
  const [invoices, subscription, ports,wallet] = await Promise.all([
    apiGet("/api/billing/invoices"),
    apiGet("/api/billing/subscription"),
    apiGet("/api/porting"),apiGet("/api/wallet")
  ]);
  $("#wallet-balance").textContent=`Available internal balance: ${money(wallet.balanceCents)} ${wallet.currency}. No funding provider connected.`;
  $("#wallet-entries").replaceChildren(...wallet.entries.map(entry=>{
    const item=document.createElement("li");
    item.textContent=`${Number(entry.delta_cents)>=0?"Received":"Sent"} ${money(Math.abs(Number(entry.delta_cents)))} · ${new Date(entry.created_at).toLocaleString()}`;
    return item;
  }));
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
let pendingWalletRequest;
$("#wallet-transfer").onsubmit=async event=>{
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector("button");
  if (!pendingWalletRequest) pendingWalletRequest=crypto.randomUUID();
  button.disabled=true;
  try {
    const data=Object.fromEntries(new FormData(form));
    const result=await accountRequest("/api/wallet/transfers",{recipientEmail:data.recipientEmail,
      amountCents:Number(data.amountCents),idempotencyKey:pendingWalletRequest});
    pendingWalletRequest=undefined;form.reset();await refreshBilling();
    $("#wallet-status").textContent=`Transfer ${result.status}.`;
  } catch(error) {$("#wallet-status").textContent=error.message;}
  finally {button.disabled=false;}
};
async function refreshMyNumbers() {
  const [{numbers},{requests}]=await Promise.all([apiGet("/api/inhouse/my-numbers"),apiGet("/api/numbers/requests")]);
  $("#my-numbers").replaceChildren(...numbers.map((did) => {
    const item=document.createElement("li");
    item.textContent=`${did.number_e164}: ${did.status}; invoice ${did.invoice_status || "none"}; no SIP route provisioned`;
    return item;
  }));
  $("#provider-requests").replaceChildren(...requests.map(request=>{
    const item=document.createElement("li");
    item.textContent=`${request.number_e164} (${request.provider}): ${request.status}; invoice ${request.invoice_status||"none"}; no carrier order placed`;
    return item;
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
    const inhouse=$("#number-provider").value==="inhouse";
    const data = await apiGet(inhouse ?
      "/api/inhouse/numbers?q="+encodeURIComponent($("#number-prefix").value.trim()) :
      "/api/numbers?provider=" + $("#number-provider").value);
    $("#numbers").replaceChildren(...data.numbers.map((number) => {
      const li = document.createElement("li");
      li.textContent = `${number.number}: ${money(number.setupCents)} setup, ${money(number.monthlyCents)}/month`;
      if (inhouse) {
        li.textContent=`${number.number_e164}: ${money(number.setup_cents)} setup, ${money(number.monthly_cents)}/month — `;
        const request=document.createElement("button");request.type="button";request.textContent="Request number";
        request.onclick=async () => {
          try {
            await accountRequest("/api/inhouse/reserve",{number:number.number_e164});
            await Promise.all([refreshMyNumbers(),refreshBilling()]);
            $("#search-numbers").click();
            $("#billing-status").textContent="Reserved for 24 hours; invoice unpaid. No SIP service provisioned.";
          } catch(error) {$("#billing-status").textContent=error.message;}
        };
        li.append(request);
      } else {
        li.textContent+=" — ";
        const request=document.createElement("button");request.type="button";request.textContent="Request DID";
        request.onclick=async()=>{
          try {
            await accountRequest("/api/numbers/request",{provider:number.provider,number:number.number,
              inventoryId:number.inventoryId,skuId:number.skuId});
            await Promise.all([refreshMyNumbers(),refreshBilling()]);
            $("#billing-status").textContent="Request recorded with an unpaid setup invoice. Carrier ordering and SIP provisioning require separate review.";
          } catch(error) {$("#billing-status").textContent=error.message;}
        };
        li.append(request);
      }
      return li;
    }));
    $("#billing-status").textContent = inhouse ?
      "In-house requests create unpaid invoices and 24-hour reservations; no live SIP provisioning." :
      "Provider inventory is checked again when you request a DID. Requests create unpaid invoices; no carrier order is placed.";
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
    await refreshCatalogAdmin();
    $("#admin-status").textContent = "Plan created";
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
$("#contacts-import").onclick=async()=>{
  const status=$("#chat-status"),file=$("#contacts-file").files?.[0];
  if(!file) {status.textContent="Choose a CSV file first";return;}
  try {
    if(file.size>64000) throw new Error("CSV file exceeds 64 KB");
    const emails=contactEmailsFromCsv(await file.text());
    const result=await accountRequest("/api/contacts/import",{emails});
    $("#contacts-file").value="";
    await loadContacts();
    status.textContent=`Processed ${result.processed} contacts (${result.duplicates} repeated rows).`;
  } catch(error) {status.textContent=error.message;}
};
$("#contacts-export").onclick=async()=>{
  try {
    const {contacts}=await apiGet("/api/contacts");
    const url=URL.createObjectURL(new Blob([contactsToCsv(contacts)],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="olamide-contacts.csv";link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    $("#chat-status").textContent=`Exported ${contacts.length} contacts.`;
  } catch(error) {$("#chat-status").textContent=error.message;}
};
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
$("#ldap-login").addEventListener("submit",async(event)=>{
  event.preventDefault();
  const form=event.currentTarget;
  try {
    const user=await accountRequest("/api/login/ldap",Object.fromEntries(new FormData(form)));
    form.reset();signedIn(user);
  } catch(error) {$("#account-status").textContent=error.message;}
});
$("#logout").onclick = async () => {
  try {
    if (phone) {
      if (onCall) await phone.hangup().catch(()=>{});
      await phone.unregister().catch(()=>{});
      await phone.disconnect().catch(()=>{});
      phone=undefined;connectForm.hidden=false;dialForm.hidden=true;$("#disconnect").hidden=true;callState(false);
    }
    await accountRequest("/api/logout", {});
    softphoneLoad++;softphoneUserId=null;favorites.clear();recentCalls=[];$("#dnd").checked=false;renderSoftphoneLists();
    geofenceGeneration++;geoPolicyLoaded=false;geoPolicy={enabled:true,maxAccuracyMeters:0,zones:[]};$("#geo-policy").textContent="Sign in to load calling area policy.";
    $("#signup").hidden = false;
    $("#login").hidden = false;
    $("#ldap-login").hidden = false;
    $("#logout").hidden = true;
    $("#password-change").hidden = true;
    $("#background-user").hidden = true;
    $("#dashboard").hidden = true;
    $("#search-panel").hidden=true;$("#support").hidden=true;
    $("#locale-settings").hidden=true;localeSettings.clear();
    support.clear();
    background.clear();
    $("#chat").hidden = true;
    $("#billing").hidden = true;
    meetings.hide();
    $("#agent-panel").hidden = true;
    $("#admin").hidden = true;
    $("#message-list").replaceChildren();
    $("#account-status").textContent = "Signed out";
    updateNavigation();
  } catch (error) { $("#account-status").textContent = error.message; }
};
$("#password-change").onsubmit=async(event)=>{
  event.preventDefault();
  try {
    const form=event.currentTarget;
    const result=await accountRequest("/api/account/password",Object.fromEntries(new FormData(form)));
    form.reset();$("#account-status").textContent=result.status;
  } catch(error) {$("#account-status").textContent=error.message;}
};
fetch("/api/me", { credentials: "same-origin" })
  .then(async (response) => response.ok ? signedIn(await response.json()) : undefined)
  .catch(() => { $("#account-status").textContent = "Account service unavailable"; });

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
  if (!softphoneUserId) {status("Sign in to Olamide before connecting a SIP account.");return;}
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
  try {await loadGeofencePolicy();} catch {status("Location policy unavailable. Call blocked.");return;}
  if (!geoPolicyLoaded) {status("Location policy unavailable. Call blocked.");return;}
  const location = await checkCurrentLocation(geoPolicy);
  $("#geo-result").textContent = location.reason;
  if (!location.allowed) { status("Call blocked: " + location.reason); return; }
  currentCall = { direction: "outgoing", address: target };
  try { status("Calling…"); await phone.call(target); }
  catch (error) { finishCall("failed"); report(error); }
});
$("#check-location").onclick = async () => {
  try {await loadGeofencePolicy();} catch {$("#geo-result").textContent="Location policy unavailable";return;}
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
