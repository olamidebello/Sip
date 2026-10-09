import { SimpleUser } from "sip.js/lib/platform/web";
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { checkCurrentLocation } from "./geofence.js";
import { setupMeetings } from "./meetings.js";
import { setupGroupAdmin } from "./groups.js";
import { setupSipProfiles } from "./sipProfiles.js";
import {setupCommerceOps} from "./commerceOps.js";
import {setupProviderWebhookAdmin} from "./providerWebhookAdmin.js";
import {setupDidwwAdmin} from "./didwwAdmin.js";
import {setupAdapterAdmin} from "./adapterAdmin.js";
import {setupOperatorControl} from "./operatorControl.js";
import {setupSwitchAdmin} from "./switchAdmin.js";
import {setupServerFleetAdmin} from "./serverFleetAdmin.js";
import {setupFleetNetworkAdmin} from "./fleetNetworkAdmin.js";
import {setupFleetAccessAdmin} from "./fleetAccessAdmin.js";
import {setupFleetFirewallAdmin} from "./fleetFirewallAdmin.js";
import {setupOperationsAdmin} from "./operationsAdmin.js";
import {setupWorkspaceQuick} from "./workspaceQuick.js";
import {setupWorkPlanner} from "./workPlanner.js";
import {setupCampaigns} from "./campaigns.js";
import {setupPasskeyPolicy} from "./passkeyPolicy.js";
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
import { setupFormGroups } from "./formGroups.js";
import { setupPageRoutes, pageId } from "./pageRoutes.js";
import { contactEmailsFromCsv, contactsToCsv } from "./contactsCsv.js";
import { setupDashboard } from "./dashboard.js";
import { setupSupport } from "./support.js";
import { setupLocaleSettings } from "./localeSettings.js";
import "./style.css";

const root = document.querySelector("#app");
root.innerHTML = `
  <header class="brand" id="top">
    <a class="brand-mark" href="#top" aria-label="Olamide home"><img src="/olamide-icon.svg" alt="" width="48" height="48"><span>Olamide<span class="brand-dot">.</span></span></a>
    <nav class="public-nav" aria-label="Public navigation"><a href="#experience">Explore</a><a href="#downloads">Downloads</a><a href="#help" id="public-help">Help</a>
      <details class="login-menu"><summary id="login-menu-label">Sign in</summary><div class="login-options"><div id="login-options-auth">
        <button id="signin-user" type="button">User sign in</button><button id="signin-admin" type="button">Administrator sign in</button><button id="signin-super" type="button">Super administrator sign in</button>
        <a href="/pages/ldap-login">Directory sign in</a><a href="/pages/signup">Create an account</a><a href="/pages/signup-verify">Verify email</a></div>
        <div id="login-options-account" hidden><button id="menu-account" type="button">Account settings</button><button id="menu-logout" type="button">Sign out</button></div>
      </div></details></nav>
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
    <div id="install-panel">
      <button id="install-app" type="button" hidden>Install Olamide</button>
      <p id="install-help" role="status"></p>
    </div>
  </section>
  <nav id="app-nav" aria-label="Application" hidden></nav>
  <dialog id="command-palette" aria-label="Jump to a workspace page"><h2>Jump to</h2><label>Find a page <input id="command-search" type="search" autocomplete="off" placeholder="Search pages…"></label><ul id="command-results"></ul><p id="command-empty" hidden>No matching page in your current access.</p><form method="dialog"><button>Close</button></form></dialog>
  <section id="help" aria-labelledby="help-title"><h2 id="help-title">Help center</h2>
    <p>Find a quick answer, follow a guided tour, or contact support.</p>
    <nav class="help-links" aria-label="Help topics"><a href="#help-faq">FAQs</a><a href="#help-user">User tutorial</a><a href="#help-admin">Administrator tutorial</a><a href="#help-technical">Technical guide</a><a href="#help-agent">AI support</a><a href="#support">Support tickets</a></nav>
    <section id="help-faq"><h3>Frequently asked questions</h3>
      <details><summary>How do I register and sign in?</summary><p>Choose Create an account in the Sign in menu, enter your details, then verify the email code. Return to Sign in with your email or assigned username.</p></details>
      <details><summary>How do I make a call?</summary><p>Open Dialer, enter the secure SIP WebSocket server and your provisioned SIP account, connect, and dial an allowed number. Your administrator must activate the account on a real switch.</p></details>
      <details><summary>Why can I not send an external text?</summary><p>Your administrator must assign an SMS enabled Flowroute number, set a daily allowance, and configure the carrier account. Check Communications → Text messages for your sender.</p></details>
      <details><summary>How do I buy a number or plan?</summary><p>Open Plans, numbers & billing. Requests create an invoice; payment, number assignment and carrier activation need operational review.</p></details>
      <details><summary>What does biometric sign in do?</summary><p>Passkeys use a device fingerprint, face, or PIN check. Your device keeps the private key; Olamide stores a public key.</p></details>
      <details><summary>Where can I get technical help?</summary><p>Sign in and open Support tickets. The AI support guide is available when your administrator configures it.</p></details>
      <details><summary>Why is registration blocked?</summary><p>A super administrator may close public signup or limit it to approved email domains. Ask your tenant administrator for access.</p></details>
      <details><summary>What does a network device configuration save do?</summary><p>It creates a versioned desired configuration and an audit event. Router and firewall vendor changes need a supported adapter; saving a draft does not change the device.</p></details>
      <details><summary>Why is a deployment job pending?</summary><p>The private Ansible runner may be offline or waiting for SSH, Vault or a previous job. An operator can inspect the controller timer and job history.</p></details>
      <details><summary>How do named dashboards and backgrounds work?</summary><p>Save a personal dashboard view or choose a tenant view. Drag tiles to change their order. In My background, choose a preset or dark custom colors. Tenant administrators can lock personal overrides.</p></details>
      <details><summary>How do I jump back to a workspace page?</summary><p>Press Ctrl K or Command K to search visible pages. Save up to eight quick links on Dashboard and use Continue to return to a recently visited page. Links follow your current access.</p></details>
    </section>
    <section id="help-user"><h3>User tutorial</h3><ol>
      <li>Register, confirm your email, and sign in.</li><li>Open Account & security to set a passkey and check your SIP identity.</li>
      <li>Open Dialer and connect only after your SIP service is activated.</li><li>Use Account messages for Olamide contacts or Text messages for assigned external SMS.</li>
      <li>Review plan and number requests under Commerce, then open Support tickets if activation needs help.</li></ol></section>
    <section id="help-admin" hidden><h3>Administrator tutorial</h3><ol>
      <li>Open Users & groups to manage tenant access. Super administrators use Tenants & roles to select a tenant and control administrators.</li>
      <li>Set the actual SIP WSS URL in Overview & SIP server and configure authenticated carrier profiles.</li>
      <li>Verify number ownership before assigning messaging numbers; copy webhook URLs to Flowroute Manage.</li>
      <li>Import the carrier rate file under Carrier rate deck and review rate quotes. Switch charging and settlement require separate integrations.</li>
      <li>Review tickets, security events, reports, and tenant policy before enabling services.</li>
      <li>Publish named tenant dashboard views, arrange tiles, and set the tenant background and personal override policy.</li>
      <li>Super administrators can grant fleet view, manage or deploy access to selected users and groups. Review the shared infrastructure scope before granting access.</li>
      <li>For dedicated Linux switches, review SSH and carrier CIDRs, then queue the firewall apply job and confirm health. WSS discovery only selects healthy, recent targets.</li></ol></section>
    <section id="help-technical"><h3>Technical and operations guide</h3>
      <p>Read the <a href="/operations-manual.md" target="_blank" rel="noopener noreferrer">user, administrator and operations manual</a> for fleet permissions, installation, firewall recovery, WSS discovery, dashboards, training exercises and troubleshooting.</p>
      <ol><li>Use the fleet view to check server health, version, jobs and events.</li>
        <li>Keep the private controller online for scheduled work. A token configured in the API does not prove the timer is running.</li>
        <li>Save a structured device configuration, inspect its revision and export a credential-free dump before applying any supported change.</li>
        <li>For a failed switch or firewall job, inspect the controller journal and attach a sanitized job ID to a support ticket.</li></ol></section>
    <section id="help-agent" hidden><h3>AI support guide</h3><p>Answers general Olamide usage questions. Do not enter passwords, OTPs, payment details, or identification numbers.</p>
      <form id="help-ask"><label>Your question <textarea name="question" maxlength="1200" minlength="3" required></textarea></label><button>Ask support guide</button></form>
      <div id="help-answer" role="status" aria-live="polite"></div><p id="help-agent-status" role="status"></p>
      <button id="help-ticket" type="button">Open a support ticket</button>
    </section>
  </section>
  <section id="account">
    <h2>Welcome to Olamide</h2>
    <p>Email verification creates an account and SIP identity. Calling needs an activated switch account; no number or plan is assigned at signup.</p>
    <p id="signin-role-help">Your assigned role controls which menus appear after sign-in.</p>
    <nav class="auth-pages" aria-label="Account pages"><a href="/pages/login">Sign in</a><a href="/pages/signup">Register</a><a href="/pages/signup-verify">Verify email</a><a href="/pages/ldap-login">Directory sign in</a></nav>
    <form id="signup">
      <h3>Create an account</h3>
      <label>Full name <input name="name" autocomplete="name" minlength="2" maxlength="100" required></label>
      <label>Email <input name="email" type="email" autocomplete="email" required></label>
      <label>Phone (international format) <input name="phone" type="tel" autocomplete="tel" placeholder="+2348012345678" pattern="\+[1-9][0-9]{7,14}" required></label>
      <label>Street address <input name="address1" autocomplete="address-line1" maxlength="160" required></label>
      <label>Apartment or suite <input name="address2" autocomplete="address-line2" maxlength="160"></label>
      <label>City <input name="city" autocomplete="address-level2" maxlength="100" required></label>
      <label>State or region <input name="region" autocomplete="address-level1" maxlength="100" required></label>
      <label>Postal code <input name="postalCode" autocomplete="postal-code" maxlength="32" required></label>
      <label>Country (ISO two-letter code) <input name="country" autocomplete="country" maxlength="2" pattern="[A-Za-z]{2}" placeholder="NG" required></label>
      <label>Password <input name="password" type="password" autocomplete="new-password" minlength="12" required></label>
      <button>Create account and email code</button>
    </form>
    <form id="signup-verify"><h3>Verify your email</h3>
      <p>Enter the six-digit code we sent. It expires after 10 minutes.</p>
      <label>Email <input name="email" type="email" autocomplete="email" required></label>
      <label>Verification code <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>
      <button>Verify and activate</button>
      <button id="signup-resend" type="button">Resend code</button>
    </form>
    <form id="login">
      <label>Email or username <input name="email" autocomplete="username" required></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
      <button>Sign in</button>
      <button type="button" id="passkey-login">Sign in with passkey</button>
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
    <section id="passkey-settings" hidden><h3>Passkeys and device biometrics</h3>
      <p>Your device checks your fingerprint, face or PIN locally. Olamide stores only a public key.</p>
      <button id="passkey-add" type="button">Add a passkey</button><ul id="passkey-list"></ul>
      <p id="passkey-status" role="status"></p>
    </section>
    <section id="sip-account-panel" hidden><h3>My SIP account</h3><p id="sip-account-status" role="status"></p>
      <form id="sip-credentials"><label>Account password to reveal SIP credentials <input name="password" type="password" autocomplete="current-password" required></label><button>Reveal SIP credentials</button></form>
      <p id="sip-credentials-result" role="status"></p>
      <h3>Saved SIP connection profiles</h3><p>Save connection settings without storing your SIP password.</p>
      <form id="sip-profile-create"><label>Profile name <input name="label" maxlength="100" required></label>
        <label>Authorization username <input name="username" maxlength="128" required></label>
        <label>SIP domain <input name="domain" maxlength="255" required></label>
        <label>Secure WebSocket URL <input name="wssUrl" type="url" placeholder="wss://sip.example.com:7443" required></label>
        <button>Save profile</button></form><ul id="sip-profile-list"></ul><p id="sip-profile-status" role="status"></p>
    </section>
  </section>
  <section id="dashboard" hidden>
    <h2>Dashboard</h2><button id="dashboard-refresh" type="button">Refresh dashboard</button>
    <button id="command-open" type="button">Jump to page · Ctrl K</button>
    <section id="workspace-shortcuts"><h3>My quick links</h3><button id="workspace-add-current" type="button">Add current page</button><button id="workspace-resume" type="button" hidden></button><ul id="workspace-shortcut-list"></ul><p id="workspace-shortcut-status" role="status"></p></section>
    <p id="dashboard-updated"></p><div id="dashboard-tiles" class="dashboard-tiles"></div>
    <details><summary>My dashboard views</summary><p>Create named layouts for yourself. Administrators can publish a layout to the selected tenant.</p>
      <form id="dashboard-view-create"><label>View name <input name="name" maxlength="60" required></label>
        <label>Visibility <select name="visibility"><option value="personal">Only me</option><option value="tenant">Selected tenant</option></select></label><button>Save current layout as a view</button></form>
      <button id="dashboard-view-default" type="button">Use default layout</button><ul id="dashboard-view-list"></ul>
      <p id="dashboard-view-status" role="status"></p></details>
    <details><summary>Customize my dashboard</summary>
      <div id="dashboard-personal-options"></div>
      <button id="dashboard-save" type="button">Save my layout</button>
      <button id="dashboard-reset" type="button">Use tenant layout</button>
    </details>
    <p id="dashboard-status" role="status"></p>
  </section>
  <section id="planner" hidden><h2>Events and tasks</h2><p>Park an idea, schedule it for a later day, and share it with active users in your tenant. Shared viewers can read; editors can change the item. Only the creator manages sharing.</p>
    <p id="planner-summary"></p><button id="planner-new" type="button">New item</button><button id="planner-refresh" type="button">Refresh</button>
    <label>Show <select id="planner-filter"><option value="all">All</option><option value="scheduled">Scheduled</option><option value="parked">Parked</option><option value="completed">Completed</option><option value="shared">Shared with me</option></select></label>
    <form id="planner-form"><input name="itemId" type="hidden"><input name="expectedVersion" type="hidden">
      <label>Type <select name="kind"><option value="task">Task</option><option value="event">Event</option></select></label>
      <label>Title <input name="title" maxlength="160" required></label><label>Details <textarea name="description" maxlength="2000"></textarea></label>
      <label>Status <select name="status"><option value="parked">Park for later</option><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
      <label>Start or due time <input name="startAt" type="datetime-local"></label><label>Event end <input name="endAt" type="datetime-local"></label>
      <label>Share with tenant user emails, one per line <textarea name="shares" rows="3"></textarea></label>
      <label>Share permission <select name="sharePermission"><option value="view">View</option><option value="edit">Edit</option></select></label><button>Save item</button></form>
    <p id="planner-status" role="status"></p><ul id="planner-list"></ul><p id="planner-detail"></p>
  </section>
  <section id="campaign-inbox-panel" hidden><h2>Announcements</h2><button id="campaign-inbox-refresh" type="button">Refresh notifications</button><p id="campaign-inbox-status" role="status"></p><ul id="campaign-inbox"></ul></section>
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
    <p>For fleet issues, include the node name, job ID, UTC time and sanitized error summary. Do not paste SSH keys, Vault passwords, SIP credentials or raw private configuration.</p>
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
      <label>Day background <select name="dayPreset"><option value="ocean">Ocean</option><option value="midnight">Midnight</option><option value="aurora">Aurora</option><option value="sunrise">Sunrise</option><option value="slate">Slate</option><option value="custom">Custom colors</option></select></label>
      <label>Night background <select name="nightPreset"><option value="midnight">Midnight</option><option value="ocean">Ocean</option><option value="aurora">Aurora</option><option value="sunrise">Sunrise</option><option value="slate">Slate</option><option value="custom">Custom colors</option></select></label>
      <label><input name="schedule" type="checkbox"> Switch at 6 AM and 6 PM on this device</label>
      <label><input name="animate" type="checkbox"> Gentle movement</label>
      <label>Custom start color <input name="colorStart" type="color" value="#071b36"></label><label>Custom end color <input name="colorEnd" type="color" value="#0c4861"></label>
      <label>Gradient angle <input name="angle" type="number" min="0" max="359" value="135"></label>
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
  <section id="external-sms" hidden>
    <h2>Text messages</h2><p>Send SMS to external mobile numbers using an assigned, messaging-enabled Flowroute number. Carrier delivery and fees depend on the provider. Ask your administrator to assign a sender and daily allowance.</p>
    <button id="sms-refresh" type="button">Refresh inbox and sent</button>
    <form id="sms-send"><h3>New text</h3>
      <label>From <select name="from" id="sms-senders" required></select></label>
      <label>To (international format) <input name="to" type="tel" placeholder="+12065550123" pattern="\+[1-9][0-9]{7,14}" required></label>
      <label>Message <textarea name="body" maxlength="1600" required></textarea></label>
      <button>Send SMS</button></form>
    <p id="sms-status" role="status"></p><h3>Inbox</h3><div id="sms-inbox"></div><h3>Sent</h3><div id="sms-sent"></div>
  </section>
  <section id="outbound-rates" hidden><h2>Outbound calling rates</h2>
    <p>Look up the current Flowroute customer rate by destination digits. Prices are USD per minute; this is a rate quote, not a live call charge.</p>
    <form id="outbound-rate-search"><label>Destination digits <input name="prefix" inputmode="numeric" pattern="[0-9]{1,15}" placeholder="12065551234" required></label><button>Find rate</button></form>
    <p id="outbound-rate-result" role="status"></p>
  </section>
  <section id="billing" hidden>
    <h2>Plans and billing</h2>
    <p>Plan requests create invoices. Where enabled, pay an unpaid USD invoice using hosted Stripe Checkout. Payment does not activate calling or assign a number.</p>
    <label>Monthly plan <select id="plans"></select></label>
    <button id="select-plan" type="button">Request plan</button>
    <p id="subscription"></p>
    <h3>Invoices</h3><ul id="invoices"></ul><p id="checkout-status" role="status"></p>
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
  <section id="dialplan-marketplace" hidden><h2>Dial plan marketplace</h2>
    <p>Browse tenant offers and request a plan. Orders create unpaid invoices; activation requires payment and switch provisioning.</p>
    <button id="dialplan-refresh" type="button">Refresh offers and orders</button>
    <div id="dialplan-offers" class="dashboard-tiles"></div><h3>My requests</h3><ul id="dialplan-orders"></ul>
    <form id="dialplan-admin-create" hidden><h3>Publish an offer</h3>
      <label>Name <input name="name" maxlength="100" required></label>
      <label>Description <textarea name="description" maxlength="1000" required></textarea></label>
      <label>Monthly price in cents <input name="monthlyCents" type="number" min="0" max="100000000" step="1" required></label>
      <label>Currency <input name="currency" value="USD" maxlength="3" pattern="[A-Z]{3}" required></label>
      <label>Status <select name="status"><option value="draft">Draft</option><option value="published">Published</option></select></label>
      <button>Save offer</button>
    </form><p id="dialplan-status" role="status"></p>
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
    <section id="passkey-policy-admin"><h3>Passkey requirements</h3><p>Require device verified WebAuthn sign-in for local accounts at tenant, group or user level. A user override takes priority; a required group takes priority over the tenant default.</p><label>Tenant mode <select id="passkey-policy-tenant-mode"><option value="optional">Optional</option><option value="required">Required</option></select></label><button id="passkey-policy-tenant-save" type="button">Save tenant policy</button><label>Group <select id="passkey-policy-group"></select></label><label>Override <select id="passkey-policy-group-mode"><option value="inherit">Inherit</option><option value="optional">Optional</option><option value="required">Required</option></select></label><button id="passkey-policy-group-save" type="button">Save group policy</button><label>Local user <select id="passkey-policy-user"></select></label><label>Override <select id="passkey-policy-user-mode"><option value="inherit">Inherit</option><option value="optional">Optional</option><option value="required">Required</option></select></label><button id="passkey-policy-user-save" type="button">Save user policy</button><p id="passkey-policy-status" role="status"></p></section>
    <section id="background-admin" hidden>
      <h3>Tenant background policy</h3>
      <form id="background-admin-form">
        <label>Day background <select name="dayPreset"><option value="ocean">Ocean</option><option value="midnight">Midnight</option><option value="aurora">Aurora</option><option value="sunrise">Sunrise</option><option value="slate">Slate</option><option value="custom">Custom colors</option></select></label>
        <label>Night background <select name="nightPreset"><option value="midnight">Midnight</option><option value="ocean">Ocean</option><option value="aurora">Aurora</option><option value="sunrise">Sunrise</option><option value="slate">Slate</option><option value="custom">Custom colors</option></select></label>
        <label><input name="schedule" type="checkbox"> Switch at 6 AM and 6 PM on each device</label>
        <label><input name="animate" type="checkbox"> Gentle movement</label>
        <label>Custom start color <input name="colorStart" type="color" value="#071b36"></label><label>Custom end color <input name="colorEnd" type="color" value="#0c4861"></label>
        <label>Gradient angle <input name="angle" type="number" min="0" max="359" value="135"></label>
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
    <section id="carrier-admin"><h3>Carrier provider commissioning</h3>
      <p>Link a tenant trunk, set capacity, verify private provider credentials, then ask the switch adapter to activate. A provider remains blocked from DID requests until activation is acknowledged.</p>
      <form id="carrier-catalog-form" hidden><h4>Add a future carrier</h4>
        <label>Carrier ID <input name="provider" pattern="[a-z][a-z0-9-]{1,15}" maxlength="16" required placeholder="carrier-name"></label>
        <label>Display name <input name="displayName" maxlength="80" required></label>
        <button type="submit">Add carrier</button>
      </form>
      <p id="carrier-catalog-status" role="status"></p>
      <form id="flowroute-auto-form" hidden><h4>Flowroute PoP setup</h4>
        <label>Point of presence <select name="pop"><option value="US-East-VA">US East, Virginia</option><option value="US-West-OR">US West, Oregon</option></select></label>
        <label>Maximum concurrent calls <input name="maxConcurrentCalls" type="number" min="1" max="100000" value="10" required></label>
        <label>Routing intent <select name="routingMode"><option value="manual">Manual</option><option value="least_cost">Least cost</option><option value="priority">Priority</option></select></label>
        <button type="submit">Set up Flowroute trunk</button>
        <p>The trunk is staged with traffic disabled. Activating calls requires the switch adapter and matching Flowroute route settings.</p>
      </form><form id="carrier-profile-form">
        <label>Provider <select name="provider"><option value="flowroute">Flowroute</option><option value="didww">DIDWW</option></select></label>
        <label>Tenant trunk <select name="trunkId" required></select></label>
        <label>Maximum concurrent calls <input name="maxConcurrentCalls" type="number" min="1" max="100000" value="10" required></label>
        <label>Routing intent <select name="routingMode"><option value="manual">Manual</option><option value="least_cost">Least cost</option><option value="priority">Priority</option></select></label>
        <button>Save provider profile</button>
      </form><div id="carrier-profiles"></div><p id="carrier-admin-status" role="status"></p>
    </section>
    <section id="operator-admin">
      <h3>Wholesale tariffs & route preview</h3>
      <p>Configure tenant tariffs, scheduled carrier rates, and blocked destination prefixes. Quotes show eligible active carrier profiles. Live switch routing, real time spending limits, and charging require a switch integration.</p>
      <form id="operator-create"><label>Tariff name <input name="name" maxlength="80" required></label>
        <label>Selection <select name="mode"><option value="least_cost">Least cost</option><option value="priority">Priority</option></select></label><button>Create tariff</button></form>
      <div id="operator-tariffs"></div>
      <label>Tariff <select id="operator-tariff"></select></label>
      <form id="operator-rate-create"><h4>Scheduled carrier rate</h4>
        <label>Carrier <select id="operator-carrier"></select></label>
        <label>Destination prefix <input name="prefix" pattern="[1-9][0-9]{0,14}" required></label>
        <label>Cost cents/min <input name="cost" type="number" min="0" max="1000000" required></label>
        <label>Price cents/min <input name="price" type="number" min="0" max="1000000" required></label>
        <label>Priority <input name="priority" type="number" min="1" max="1000" value="100" required></label>
        <label>Effective UTC <input name="effective" type="datetime-local" required></label>
        <label>Expires UTC <input name="expires" type="datetime-local"></label><button>Add rate</button></form>
      <ul id="operator-rates"></ul>
      <form id="operator-block-create"><h4>Destination fraud block</h4>
        <label>Prefix <input name="prefix" pattern="[1-9][0-9]{0,14}" required></label>
        <label>Reason <input name="reason" maxlength="200" required></label><button>Block prefix</button></form>
      <ul id="operator-blocks"></ul>
      <form id="operator-quote-form"><h4>Route quote</h4>
        <label>E.164 destination <input name="number" placeholder="+12125550123" required></label><button>Preview route</button></form>
      <p id="operator-quote" role="status"></p><p id="operator-status" role="status"></p>
    </section>
    <section id="switch-admin">
      <h3>FreeSWITCH</h3>
      <p>Serve active SIP accounts and authenticated outbound dialplans from the tenant database. Configure FreeSWITCH XML curl and Sofia gateways on the switch host before enabling traffic. Public inbound routes and real time charging are not enabled here.</p>
      <form id="switch-config">
        <label>SIP domain <input name="domain" placeholder="sip.example.com" required></label>
        <label>Outbound tariff <select name="tariffId"></select></label>
        <label><input name="enabled" type="checkbox"> Enable tenant switch lookups</label>
        <button>Save switch settings</button>
      </form>
      <form id="switch-gateway-form">
        <label>Carrier <select name="provider" id="switch-provider"></select></label>
        <label>Configured Sofia gateway name <input name="gatewayName" pattern="[a-z][a-z0-9_-]{1,63}" required></label>
        <label><input name="enabled" type="checkbox"> Enable gateway route</label><button>Save gateway mapping</button>
      </form>
      <section aria-labelledby="kamailio-readiness-title">
        <h4 id="kamailio-readiness-title">Kamailio commissioning</h4>
        <p>This panel checks tenant data and credentials. It cannot verify the host services, media, call tests, or billing.</p>
        <button id="kamailio-readiness-refresh" type="button">Check Kamailio readiness</button>
        <p id="kamailio-readiness-summary" role="status"></p>
        <ul id="kamailio-readiness-blockers"></ul>
        <nav aria-label="Switch commissioning">
          <a href="#operator-admin">Tariffs and destination blocks</a>
          <a href="#carrier-admin">Carrier profiles</a>
          <a href="#pbx-admin">PBX routes</a>
          <a href="#cdr-admin">Call records</a>
          <a href="#fleet-admin">Server operations</a>
        </nav>
      </section>
      <h4>Gateway mappings</h4><ul id="switch-gateways"></ul>
      <h4>SIP accounts</h4><ul id="switch-accounts"></ul>
      <button id="switch-refresh" type="button">Refresh switch configuration</button>
      <p id="switch-status" role="status"></p>
    </section>
    <section id="carrier-adapter-admin" hidden>
      <h3>Carrier adapter nodes</h3>
      <p>Assign multiple private adapter targets to Flowroute, DIDWW, or a future carrier. Health and capacity determine which node commissions a carrier; the active assignment stays pinned until deactivation. Define target URLs and tokens only on the server.</p>
      <form id="adapter-create">
        <label>Carrier <select name="provider" required></select></label>
        <label>Adapter name <input name="name" maxlength="80" required></label>
        <label>Private target key <select name="targetKey" required></select></label>
        <label>Region <input name="region" maxlength="40" placeholder="US East" required></label>
        <label>Priority <input name="priority" type="number" min="1" max="1000" value="100" required></label>
        <label>Maximum concurrent calls <input name="maxConcurrentCalls" type="number" min="1" max="100000" value="100" required></label>
        <button type="submit">Add adapter</button>
      </form>
      <button id="adapter-refresh" type="button">Refresh adapter health and activity</button>
      <p id="adapter-status" role="status"></p><div id="adapter-list"></div>
      <h4>Recent adapter operations</h4><ul id="adapter-history"></ul>
    </section>
    <section id="flowroute-rate-admin"><h3>Flowroute outbound rate deck</h3>
      <p>Import a Flowroute outbound_rates.csv. The server validates every prefix and applies a fixed 30% markup at six decimal places before atomically activating the new database deck. Live switch rating is separate.</p>
      <form id="flowroute-rate-import"><label>Carrier rate CSV <input name="rateFile" type="file" accept=".csv,text/csv" required></label><button>Import and activate rate deck</button></form>
      <button id="flowroute-rate-refresh" type="button">Refresh rate decks</button><div id="flowroute-rate-decks"></div>
      <p id="flowroute-rate-status" role="status"></p>
    </section>
    <section id="messaging-webhooks"><h3>Flowroute messaging callbacks</h3>
      <p>Paste each private URL into its matching SMS, MMS, SMS DLR or MMS DLR field in Flowroute Manage. Treat the URL as a password. Received events are kept for this carrier tenant.</p>
      <button id="webhooks-refresh" type="button">Refresh callbacks and events</button>
      <div id="webhooks-urls"></div><h4>Assign a messaging number</h4>
      <p>Confirm the number is on your Flowroute account and enabled for SMS before allowing sends. Zero daily allowance disables sending.</p>
      <form id="sms-number-admin"><label>Flowroute number <input name="number" type="tel" placeholder="+12065550123" required></label>
        <label>User ID <input name="userId" placeholder="User UUID" required></label>
        <label>Daily SMS limit <input name="dailyLimit" type="number" min="0" max="10000" value="0" required></label>
        <label>Enabled <input name="enabled" type="checkbox"></label><button>Assign number</button></form>
      <div id="sms-number-list"></div><h4>Recent events</h4><div id="webhooks-events"></div>
      <p id="webhooks-status" role="status"></p>
    </section>
    <section id="charging-admin"><h3>Charging operations</h3>
      <p>Tenant billing and rate inventory. Live call rating, prepaid cutoff and carrier settlement require authoritative switch integration.</p>
      <button id="charging-refresh" type="button">Refresh charging overview</button>
      <div id="charging-tiles" class="dashboard-tiles"></div>
      <nav class="auth-pages" aria-label="Charging administration"><a href="#pbx-admin">Rate deck and routing</a><a href="#cdr-admin">Call records</a><a href="#pricing-admin">DID pricing</a><a href="#report-admin">Reports</a><a href="#carrier-admin">Carriers</a></nav>
      <p id="charging-status" role="status"></p>
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
    <section id="payment-admin">
      <h3>Stripe payment gateway</h3><p>Tenant scoped Stripe Checkout for existing USD invoices. Enter a secret API key and webhook signing secret. Stored credentials are encrypted; existing values are never shown again.</p>
      <p>Webhook URL: <code id="stripe-webhook-url"></code></p>
      <form id="stripe-settings"><label>Stripe secret key <input name="secretKey" type="password" autocomplete="off" placeholder="Leave blank to keep existing"></label>
        <label>Webhook signing secret <input name="webhookSecret" type="password" autocomplete="off" placeholder="Leave blank to keep existing"></label>
        <label><input name="enabled" type="checkbox"> Accept Stripe payments for this tenant</label>
        <label><input name="confirmLive" type="checkbox"> Confirm live Stripe payments and reconciliation responsibility</label>
        <button>Save Stripe settings</button></form>
      <button id="stripe-refresh" type="button">Refresh gateway and payment attempts</button>
      <p id="stripe-status" role="status"></p><h4>Recent payment attempts</h4><ul id="stripe-attempts"></ul>
    </section>
    <section id="cluster-admin">
      <h3>API capacity</h3><p id="cluster-summary"></p>
      <form id="cluster-scale"><label>Desired API replicas on this host <input name="apiReplicas" type="number" min="1" max="4" step="1" required></label><button>Request scaling</button></form>
      <button id="cluster-refresh" type="button">Refresh scaling status</button><p id="cluster-status" role="status"></p>
      <h4>Recent requests</h4><ul id="cluster-history"></ul>
    </section>
    <section id="fleet-admin" hidden>
      <h3>Server and network operations</h3><p>Register switch hosts, review connectivity and versions, queue approved installations, and schedule health checks or upgrades. The private Ansible runner requires SSH access and passwordless sudo on managed hosts.</p>
      <p id="fleet-summary"></p><p id="fleet-status" role="status"></p>
      <h4>Cluster overview by region</h4><p id="fleet-topology"></p>
      <form id="fleet-add"><h4>Add a server</h4>
        <label>Name <input name="name" pattern="[a-z][a-z0-9-]{1,39}" required></label>
        <label>IPv4 address <input name="host" required></label>
        <label>Role <select name="role"><option value="switch">Switch</option><option value="app">Application inventory</option></select></label>
        <label>SSH user <input name="sshUser" required></label><label>SSH port <input name="sshPort" type="number" min="1" max="65535" value="22" required></label>
        <label>Region <input name="region" value="primary" required></label><label>Configured capacity <input name="capacity" type="number" min="1" max="100000" value="100" required></label>
        <button>Add server</button></form>
      <button id="fleet-refresh" type="button">Refresh monitoring</button><h4>Servers</h4><ul id="fleet-nodes"></ul>
      <h4>Scheduled events</h4><ul id="fleet-schedules"></ul><h4>Deployment jobs</h4><ul id="fleet-jobs"></ul><h4>Event log</h4><ul id="fleet-events"></ul>
      <form id="fleet-report-settings"><h4>Report thresholds</h4><label>Stale after seconds <input name="staleSeconds" type="number" min="60" max="3600" required></label>
        <label>Warning latency ms <input name="warningLatencyMs" type="number" min="100" max="30000" required></label>
        <label>Retention days <input name="retentionDays" type="number" min="7" max="365" required></label><button>Save thresholds</button></form>
      <label>Report window in days <input id="fleet-report-days" type="number" min="1" max="90" value="7"></label><button id="fleet-report-run" type="button">Generate report</button><p id="fleet-report"></p>
      <section id="fleet-device-panel"><h3>Network devices and configuration versions</h3>
        <p>Drag devices to reorder them. Router, firewall and load balancer configurations are stored as reviewed intent; only linked Linux switch hosts have an installation adapter.</p>
        <button id="fleet-device-refresh" type="button">Refresh devices</button><button id="fleet-device-new" type="button">New device</button>
        <p id="fleet-device-status" role="status"></p><ul id="fleet-devices"></ul>
        <form id="fleet-device-form"><h4 id="fleet-device-editor-title">Add a network device</h4><input name="deviceId" type="hidden"><input name="expectedVersion" type="hidden">
          <label>Name <input name="name" pattern="[a-z][a-z0-9-]{1,39}" required></label>
          <label>Kind <select name="kind"><option value="server">Server</option><option value="switch">Switch</option><option value="router">Router</option><option value="firewall">Firewall</option><option value="load_balancer">Load balancer</option></select></label>
          <label>Management IPv4 <input name="host" required></label><label>Port <input name="port" type="number" min="1" max="65535" value="22" required></label>
          <label>Site <input name="site" maxlength="60" required></label><label><input name="enabled" type="checkbox" checked> Enabled</label>
          <label>Linked switch <select name="nodeId"><option value="">No linked switch</option></select></label>
          <p id="fleet-device-drop-note">Drop a small JSON file onto the editor, then review and save.</p>
          <label>Structured desired configuration <textarea name="config" rows="12" spellcheck="false" required>{"hostname":"device-1","vlans":[],"interfaces":[],"routes":[]}</textarea></label>
          <button>Save configuration version</button></form>
        <h4>Configuration versions</h4><ul id="fleet-device-versions"></ul><h4>Device audit events</h4><ul id="fleet-device-events"></ul>
      </section>
      <section id="fleet-access-panel" hidden><h3>Fleet access grants</h3><p>View, manage, or deploy access can be assigned to a user or group in the selected tenant. A grant applies to the shared fleet.</p>
        <form id="fleet-access-form"><label>Principal <select name="type"><option value="user">User</option><option value="group">Group</option></select></label>
          <label>User or group <select name="principalId" required></select></label>
          <label>Access <select name="level"><option value="view">View and export</option><option value="manage">Manage inventory and configuration</option><option value="deploy">Deploy and schedule</option></select></label><button>Save access</button></form>
        <p id="fleet-access-status" role="status"></p><ul id="fleet-access-grants"></ul></section>
      <section id="fleet-firewall-panel"><h3>Dedicated switch firewall policy</h3>
        <p>Save CIDR allowlists, then queue a separate apply job. The controller checks that its SSH source is still allowed. The application and Docker host is excluded.</p>
        <form id="fleet-firewall-form"><label>Switch <select name="nodeId" required></select></label>
          <label><input name="enabled" type="checkbox"> Enable policy for apply</label>
          <label>SSH source CIDRs, one per line <textarea name="sshCidrs" rows="4" required></textarea></label>
          <label>Carrier SIP source CIDRs, one per line <textarea name="carrierCidrs" rows="4"></textarea></label><button type="submit">Save policy</button></form>
        <p id="fleet-firewall-preview"></p><button id="fleet-firewall-apply" type="button">Apply reviewed policy</button><p id="fleet-firewall-status" role="status"></p>
      </section>
      <section id="fleet-operations-panel" hidden><h3>Registration and switch discovery</h3>
        <form id="registration-policy"><h4>User registration policy</h4><label><input name="openSignup" type="checkbox"> Allow new public registrations</label>
          <label>Allowed email domains, one per line (empty allows any domain) <textarea name="allowedDomains" rows="4"></textarea></label><button>Save registration policy</button></form>
        <h4>Healthy WSS discovery targets</h4><p id="redirector-scope"></p><button id="redirector-new" type="button">New target</button>
        <form id="redirector-form"><input name="targetId" type="hidden"><label>Name <input name="name" required></label>
          <label>Region <input name="region" value="global" required></label><label>Linked switch <select name="nodeId" required></select></label>
          <label>WSS URL <input name="wssUrl" type="url" placeholder="wss://sip.example.com/" required></label>
          <label>Weight <input name="weight" type="number" min="1" max="100" value="1" required></label>
          <label><input name="enabled" type="checkbox"> Enabled</label><button>Save WSS target</button></form>
        <p id="operations-status" role="status"></p><ul id="redirector-targets"></ul><h4>Operations audit</h4><ul id="operations-events"></ul>
      </section>
    </section>
    <section id="provider-webhook-admin" hidden>
      <h3>Provider callback registry</h3><p id="provider-webhook-tenant"></p>
      <p>Flowroute SMS/MMS callbacks are configured on Messaging webhooks. DIDWW API callbacks have a separate signed receiver under DIDWW API. This registry accepts future provider callbacks for audit.</p>
      <form id="provider-webhook-create"><label>Provider slug <input name="provider" pattern="[a-z][a-z0-9-]{1,39}" placeholder="didww" required></label>
        <label>Display name <input name="displayName" maxlength="100" required></label><button>Add provider</button></form>
      <p id="provider-webhook-result" role="status"></p>
      <button id="provider-webhook-refresh" type="button">Refresh providers and events</button>
      <ul id="provider-webhook-list"></ul><h4>Recent verified callback receipts</h4><ul id="provider-webhook-events"></ul>
      <p id="provider-webhook-status" role="status"></p>
    </section>
    <section id="didww-admin" hidden>
      <h3>DIDWW API and signed callbacks</h3>
      <p id="didww-config"></p>
      <label>Callback URL <input id="didww-callback-url" readonly></label>
      <button id="didww-copy-url" type="button">Copy callback URL</button>
      <p>Set a callback secret in DIDWW, enable it, and configure this URL on each supported resource. The server verifies DIDWW signatures. API keys and callback secrets are private server settings.</p>
      <label>Call Events URL <input id="didww-call-events-url" readonly></label>
      <p>Call Events require DIDWW support to enable the service. Configure X-Auth-Token in the DIDWW Call Events panel to match the private server token.</p>
      <form id="didww-resource-form">
        <label>Resource <select name="resource" required></select></label>
        <label>Method <select name="method" required></select></label>
        <label>Resource ID for one item <input name="resourceId" pattern="[0-9a-fA-F-]{36}" placeholder="UUID"></label>
        <label>JSON:API request body for POST/PATCH <textarea name="payload" rows="8" spellcheck="false" placeholder='{"data":{"type":"voice_in_trunks","attributes":{}}}'></textarea></label>
        <button type="submit">Send DIDWW request</button>
      </form>
      <p id="didww-status" role="status"></p><pre id="didww-response"></pre>
      <button id="didww-refresh" type="button">Refresh callback events</button>
      <h4>Signed API callbacks</h4><ul id="didww-events"></ul>
      <h4>Call Events</h4><ul id="didww-call-events"></ul>
    </section>
    <section id="sip-profile-admin" hidden>
      <h3>SIP profile access</h3><p>Super administrators set tenant defaults, group grants and individual overrides for viewing, adding, editing and deleting SIP profiles.</p>
      <label>Tenant <select id="sip-policy-tenant"></select></label>
      <h4>Tenant defaults</h4><div id="sip-tenant-choices"></div><button type="button" id="sip-tenant-save">Save tenant defaults</button>
      <h4>Group grants</h4><label>Group <select id="sip-policy-group"></select></label><div id="sip-group-choices"></div><button type="button" id="sip-group-save">Save group grants</button>
      <h4>User overrides</h4><label>User <select id="sip-policy-user"></select></label><div id="sip-user-choices"></div><button type="button" id="sip-user-save">Save user overrides</button>
      <p id="sip-policy-status" role="status"></p>
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
      <h4>Trunk management and rate deck</h4>
      <p>These trunk records drive route previews. Carrier activation and switch configuration use the separate provider and FreeSWITCH controls; a saved trunk alone does not provision a live SIP connection.</p>
      <form id="pbx-trunk-form">
        <input name="trunkId" type="hidden"><input name="revision" type="hidden">
        <label>Name <input name="name" required></label>
        <label>Host <input name="host" placeholder="sip.provider.example" required></label>
        <label>Port <input name="port" type="number" min="1" max="65535" value="5061" required></label>
        <label>Transport <select name="transport"><option value="tls">TLS</option><option value="udp">UDP</option><option value="tcp">TCP</option></select></label>
        <label>Priority <input name="priority" type="number" min="1" max="1000" value="100" required></label>
        <button>Save trunk</button><button id="pbx-trunk-cancel" type="button">Clear form</button>
      </form>
      <button id="pbx-trunks-refresh" type="button">Refresh trunks</button>
      <button id="pbx-trunks-enable" type="button">Enable selected for preview</button>
      <button id="pbx-trunks-disable" type="button">Disable selected for preview</button>
      <ul id="pbx-trunk-list"></ul><p id="pbx-trunk-detail" role="status"></p>
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
    <section id="campaign-admin"><h3>Tenant campaigns and alerts</h3><p>Draft, schedule and publish in-app announcements. All tenants is available to super administrators.</p><button id="campaign-new" type="button">New draft</button><form id="campaign-form"><label>Title <input name="title" maxlength="160" required></label><label>Message <textarea name="body" maxlength="4000" required></textarea></label><label>Audience <select name="audience"><option value="tenant">Current tenant</option><option value="all">All tenants</option></select></label><label>Publish time <input name="publishAt" type="datetime-local" required></label><label>Expires <input name="expiresAt" type="datetime-local"></label><button>Save draft</button></form><button id="campaign-refresh" type="button">Refresh</button><button id="campaign-publish" type="button">Publish selected</button><button id="campaign-pause" type="button">Pause selected</button><button id="campaign-archive" type="button">Archive selected</button><p id="campaign-status" role="status"></p><ul id="campaign-list"></ul></section>
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
      <h4>Batch release actions</h4><label>Choose releases <select id="mobile-batch-releases" multiple size="6"></select></label>
      <button id="mobile-batch-approve" type="button">Approve selected internally</button>
      <button id="mobile-batch-reopen" type="button">Reopen selected</button>
      <button id="mobile-batch-archive" type="button">Archive selected</button>
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
  <section id="calling-workspace" class="calling-workspace" hidden>
  <h2>Olamide dialer</h2>
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
  </section>
  <footer class="site-copyright"><small>© 2026 Olamide Olatayo Bello. All rights reserved. Third-party components retain their own licenses.</small></footer>
`;

const $ = (selector) => document.querySelector(selector);
root.append($('#fleet-admin'));
setupFormGroups();
setupDownloads();
setupCarrierControl();
const navigationGroups=[
  {label:"Workspace",items:[["dashboard","Dashboard"],["campaign-inbox-panel","Announcements"],["planner","Events & tasks"],["search-panel","Search"],["support","Support tickets"],["help","Help & tutorials"]]},
  {label:"Communications",items:[["calling-workspace","Dialer"],["geo","Calling area"],["chat","Account messages"],["external-sms","Text messages"],["outbound-rates","Outbound rates"],["meetings","Meetings"],["agent-panel","Call center"]]},
  {label:"Commerce",items:[["billing","Plans, numbers & billing"],["dialplan-marketplace","Dial plan marketplace"]]},
  {label:"My settings",items:[["account","Account & security"],["locale-settings","Language, country & currency"],["background-user","Appearance"],["downloads","Download apps"]]},
  {label:"Administration",roles:["admin","super_admin"],items:[["admin","Overview & SIP server"],["group-admin","Users & groups"],["catalog-controls","Plans & access"],["inhouse-admin","DID inventory"],["pricing-admin","Pricing"],["pbx-admin","PBX"],["carrier-admin","Carrier providers"],["operator-admin","Wholesale tariffs"],["switch-admin","FreeSWITCH"],["flowroute-rate-admin","Carrier rate deck"],["messaging-webhooks","Messaging webhooks"],["charging-admin","Charging operations"],["payment-admin","Stripe gateway"],["cluster-admin","API capacity"],["report-admin","Reports"],["cdr-admin","Call records"],["nigeria-admin","Nigeria interconnect"]]},
  {label:"Admin settings",roles:["admin","super_admin"],items:[["ldap-admin","LDAP groups"],["auth-providers-admin","Authentication"],["geofence-admin","Geofencing"],["background-admin","Tenant appearance"],["locale-admin","Locale defaults"],["dashboard-admin","Dashboard defaults"],["campaign-admin","Campaigns & alerts"],["mobile-admin","App releases"]]},
  {label:"Fleet operations",items:[["fleet-admin","Server and network operations"]]},
  {label:"Super admin",roles:["super_admin"],items:[["tenant-admin","Tenants & roles"],["sip-profile-admin","SIP profile access"],["provider-webhook-admin","Provider callbacks"],["didww-admin","DIDWW API"],["carrier-adapter-admin","Carrier adapters"]]}
];
let activeRole=null;
let pageRoutes;
const workspaceViews=["account","help","dashboard","planner","campaign-inbox-panel","search-panel","support","locale-settings","background-user","chat","external-sms","outbound-rates","billing","dialplan-marketplace","meetings","admin","fleet-admin","agent-panel","calling-workspace","downloads"];
let activeView="dashboard";
function showWorkspace(target) {
  if(!activeRole) return;
  const requested=document.getElementById(target);
  if(!requested || requested.closest("[hidden]")) return;
  for(let parent=requested.parentElement;parent;parent=parent.parentElement) if(parent.tagName==="DETAILS") parent.open=true;
  const rootView=workspaceViews.find(id=>{const section=document.getElementById(id);return section&&(section===requested||section.contains(requested));});
  if(!rootView) return;
  activeView=target;
  if(pageId(location.pathname) && target!==document.getElementById(pageId(location.pathname))?.closest('section[id]')?.id) {
    history.pushState(null,'',`/#${target}`);
    pageRoutes?.render();
  }
  for(const id of workspaceViews) document.getElementById(id)?.classList.toggle("workspace-inactive",id!==rootView);
  const admin=$("#admin");
  admin.classList.toggle("admin-subview",rootView==="admin"&&target!=="admin");
  for(const section of admin.querySelectorAll(":scope > section[id]"))
    section.classList.toggle("workspace-inactive",rootView==="admin"&&section.id!==target);
  for(const link of $("#app-nav").querySelectorAll(".menu-links a")) {
    if(link.hash===`#${target}`) link.setAttribute("aria-current","page");
    else link.removeAttribute("aria-current");
  }
  workspaceQuick.record(target);
}
function resetWorkspace() {
  document.body.classList.remove("workspace-mode");
  for(const section of document.querySelectorAll(".workspace-inactive")) section.classList.remove("workspace-inactive");
  $("#admin").classList.remove("admin-subview");
}
function updateNavigation() {
  const nav=$("#app-nav");nav.replaceChildren();
  nav.hidden=!activeRole;
  if (!activeRole) return;
  const heading=document.createElement("div");heading.className="menu-heading";
  const title=document.createElement("strong");title.textContent="Olamide workspace";
  const role=document.createElement("span");role.className="role-badge";role.textContent=activeRole==="super_admin"?"Super admin":activeRole==="admin"?"Administrator":"User";
  heading.append(title,role);nav.append(heading);
  const returnToCall=document.createElement("a");returnToCall.id="return-to-call";returnToCall.href="#calling-workspace";returnToCall.textContent="Return to call";returnToCall.hidden=!onCall;
  returnToCall.onclick=()=>showWorkspace("calling-workspace");nav.append(returnToCall);
  const search=document.createElement("input");search.type="search";search.className="menu-search";search.placeholder="Find a menu…";search.setAttribute("aria-label","Find a menu");nav.append(search);
  const groups=document.createElement("div");groups.className="menu-groups";nav.append(groups);
  for(const group of navigationGroups) {
    if(group.roles&&!group.roles.includes(activeRole)) continue;
    const items=group.items.filter(([id])=>{const section=document.getElementById(id);return section&&!section.closest("[hidden]");});
    if(!items.length) continue;
    const details=document.createElement("details");details.className="menu-group";details.open=group.label==="Workspace";
    const summary=document.createElement("summary");summary.textContent=group.label;details.append(summary);
    const links=document.createElement("div");links.className="menu-links";
    for(const [id,label] of items) {
      const link=document.createElement("a");link.href=`#${id}`;link.textContent=label;
      link.onclick=()=>{showWorkspace(id);details.open=false;};
      if(location.hash===`#${id}`) link.setAttribute("aria-current","page");
      links.append(link);
    }
    details.append(links);groups.append(details);
  }
  const signout=document.createElement("button");signout.type="button";signout.className="nav-signout";signout.textContent="Sign out";signout.onclick=()=>$("#logout").click();nav.append(signout);
  const quickMenu=document.createElement("details");quickMenu.className="menu-group locale-menu";
  const quickTitle=document.createElement("summary");quickTitle.textContent="Language & currency";quickMenu.append(quickTitle);
  const quick=document.createElement("form");quick.id="quick-locale";quick.className="quick-locale";
  quick.innerHTML='<label>Language <select name="language" aria-label="Quick language"></select></label><label>Currency <select name="currency" aria-label="Quick currency"></select></label><button type="submit">Save preferences</button><p id="quick-locale-status" role="status"></p>';
  quickMenu.append(quick);nav.append(quickMenu);
  const empty=document.createElement("p");empty.className="menu-empty";empty.hidden=true;empty.textContent="No menus match your search.";empty.setAttribute("role","status");nav.append(empty);
  search.oninput=()=>{
    const query=search.value.trim().toLocaleLowerCase();
    let visible=0;
    for(const group of groups.children){let count=0;for(const link of group.querySelectorAll("a")){link.hidden=!!query&&!link.textContent.toLocaleLowerCase().includes(query);if(!link.hidden)count++;}group.hidden=count===0;visible+=count;if(query&&count)group.open=true;}
    empty.hidden=!query||visible>0;
  };
  pageRoutes?.refresh();
}
updateNavigation();
pageRoutes=setupPageRoutes({showWorkspace,isSignedIn:()=>!!activeRole});
$("#app-nav").addEventListener("keydown",event=>{
  if(event.key!=="Escape") return;
  for(const menu of $("#app-nav").querySelectorAll("details[open]")) menu.open=false;
  $("#app-nav .menu-search")?.focus();
});
document.addEventListener("click",event=>{
  if($("#app-nav").contains(event.target)) return;
  for(const menu of $("#app-nav").querySelectorAll("details[open]")) menu.open=false;
});
$(".public-nav a[href='#downloads']").addEventListener("click",()=>showWorkspace("downloads"));
$('#public-help').addEventListener('click',()=>{if(activeRole) showWorkspace('help');});
$(".login-menu").addEventListener('click',event=>{if(event.target.closest('button,a'))$(".login-menu").open=false;});
$(".brand-mark").addEventListener("click",()=>{if(activeRole) showWorkspace("dashboard");});
window.addEventListener("hashchange",()=>{
  const target=decodeURIComponent(location.hash.slice(1));
  if(activeRole&&$("#app-nav").querySelector(`a[href="#${CSS.escape(target)}"]`)) showWorkspace(target);
});
for(const [id,label] of [["signin-user","user"],["signin-admin","administrator"],["signin-super","super administrator"]]) {
  $("#"+id).onclick=()=>{
    if(pageId(location.pathname)!=='login') pageRoutes.go('login');
    $("#account-login-group").open=true;
    $("#signin-role-help").textContent=`Sign in with your existing account. ${label[0].toUpperCase()+label.slice(1)} menus appear only if that role is assigned to you.`;
    $("#login").scrollIntoView({behavior:"smooth",block:"center"});
    $("#login").elements.email.focus({preventScroll:true});
  };
}
$('#menu-account').onclick=()=>showWorkspace('account');
$('#menu-logout').onclick=()=>$('#logout').click();
const connectForm = $("#connect");
const dialForm = $("#dial");
const meetings = setupMeetings();
const dashboard=setupDashboard({get:path=>apiGet(path),request:(path,body,method)=>accountRequest(path,body,method)});
const support=setupSupport({get:path=>apiGet(path),request:(path,body,method)=>accountRequest(path,body,method)});
const localeSettings=setupLocaleSettings({get:path=>apiGet(path),request:(path,body,method)=>accountRequest(path,body,method)});
const groupAdmin = setupGroupAdmin();
const sipProfiles = setupSipProfiles({get:apiGet,request:accountRequest});
const commerceOps=setupCommerceOps({get:apiGet,request:accountRequest});
const serverFleet=setupServerFleetAdmin({get:apiGet,request:accountRequest});
const fleetNetwork=setupFleetNetworkAdmin({get:apiGet,request:accountRequest});
const fleetGrants=setupFleetAccessAdmin({get:apiGet,request:accountRequest});
const fleetFirewall=setupFleetFirewallAdmin({get:apiGet,request:accountRequest});
const operationsAdmin=setupOperationsAdmin({get:apiGet,request:accountRequest});
const workspaceQuick=setupWorkspaceQuick({get:apiGet,request:accountRequest,show:showWorkspace,current:()=>activeView});
const workPlanner=setupWorkPlanner({get:apiGet,request:accountRequest});
const campaigns=setupCampaigns();
const passkeyPolicy=setupPasskeyPolicy();
const providerWebhooks=setupProviderWebhookAdmin({get:apiGet,request:accountRequest});
const didwwAdmin=setupDidwwAdmin({get:apiGet,request:accountRequest});
const adapterAdmin=setupAdapterAdmin({get:apiGet,request:accountRequest});
const operatorAdmin=setupOperatorControl();
const switchAdmin=setupSwitchAdmin();
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
  if(user.mustChangePassword){
    activeRole='pending_password_change';
    $('#account-password-group').open=true;
    $('#account-login-group').hidden=true;
    $('#account-signup-group').hidden=true;
    $('#account-directory-group').hidden=true;
    $('#account-verify-group').hidden=true;
    document.body.classList.add('workspace-mode');
    $('#account').hidden=false;$('#password-change').hidden=false;
    $('#account-password-group').hidden=false;
    $('#logout').hidden=false;
    $('#app-nav').hidden=true;
    $('#account-status').textContent='Temporary password: change it now before using administrator controls.';
    showWorkspace('account');
    return;
  }
  if(user.passkeyEnrollmentRequired||user.passkeySigninRequired){
    activeRole='pending_passkey';document.body.classList.add('workspace-mode');
    $('#account').hidden=false;$('#logout').hidden=false;$('#app-nav').hidden=true;
    $('#account-login-group').hidden=true;$('#account-signup-group').hidden=true;$('#account-directory-group').hidden=true;$('#account-verify-group').hidden=true;
    $('#password-change').hidden=true;$('#passkey-settings').hidden=!!user.passkeySigninRequired;
    if(user.passkeyEnrollmentRequired)refreshPasskeys();
    $('#account-status').textContent=user.passkeySigninRequired?'Sign out and use passkey sign-in to continue.':'Register a passkey, then sign out and use passkey sign-in.';
    showWorkspace('account');return;
  }
  activeRole=["admin","super_admin"].includes(user.role)?user.role:"user";
  apiGet('/api/redirector').then(({target})=>{if(target?.wssUrl&&!onCall)$("#connect [name=server]").value=target.wssUrl;}).catch(()=>{});
  document.body.classList.add("workspace-mode");
  refreshSoftphoneState(user).catch(error=>{$("#account-status").textContent=error.message;});
  loadGeofencePolicy().catch(error=>{$("#geo-policy").textContent=error.message+". Outgoing calls are blocked.";});
  $("#signup").hidden = true;
  $("#login").hidden = true;
  $("#ldap-login").hidden = true;
  $("#logout").hidden = false;
  for(const id of ["account-login-group","account-signup-group","account-verify-group","account-directory-group"]) $("#"+id).hidden=true;
  $("#passkey-settings").hidden=user.authSource!=="local";
  if(user.authSource==="local") refreshPasskeys();
  $("#sip-account-panel").hidden=false;
  refreshSipAccount();
  sipProfiles.refresh();
  $("#sip-profile-admin").hidden=user.role!=="super_admin";
  $("#provider-webhook-admin").hidden=user.role!=="super_admin";
  $("#didww-admin").hidden=user.role!=="super_admin";
  $("#carrier-adapter-admin").hidden=user.role!=="super_admin";
  $("#fleet-admin").hidden=user.role!=="super_admin";
  $("#fleet-access-panel").hidden=user.role!=="super_admin";
  $("#fleet-operations-panel").hidden=user.role!=="super_admin";
  $("#flowroute-auto-form").hidden=user.role!=="super_admin";
  $("#carrier-catalog-form").hidden=user.role!=="super_admin";
  if(user.role==="super_admin"){providerWebhooks.refresh();didwwAdmin.refresh();adapterAdmin.refresh();serverFleet.refresh();fleetNetwork.refresh();fleetGrants.refresh();fleetFirewall.refresh();operationsAdmin.refresh();}
  if(["admin","super_admin"].includes(user.role))operatorAdmin.refresh();
  if(["admin","super_admin"].includes(user.role)){
    switchAdmin.refresh(user.role==="super_admin");
    $("#switch-config").querySelectorAll("input,select,button").forEach(el=>el.disabled=user.role!=="super_admin");
    $("#switch-gateway-form").querySelectorAll("input,select,button").forEach(el=>el.disabled=user.role!=="super_admin");
  }
  if(["admin","super_admin"].includes(user.role)){commerceOps.refreshPayment();commerceOps.refreshCluster();}
  if(user.role==="super_admin") sipProfiles.refreshAdmin();
  $("#dialplan-marketplace").hidden=!user.features?.billing;
  $("#dialplan-admin-create").hidden=!['admin','super_admin'].includes(user.role);
  if(user.features?.billing) refreshDialplans();
  $("#account-password-group").hidden=user.authSource==="ldap";
  $('#help-agent').hidden=false;
  apiGet('/api/help/agent').then(({available})=>{
    $('#help-ask').querySelector('button').disabled=!available;
    $('#help-agent-status').textContent=available?'Ask a question about using Olamide.':'AI support is not configured. Open a support ticket for help.';
  }).catch(error=>{$('#help-agent-status').textContent=error.message;});
  $('#help-admin').hidden=!['admin','super_admin'].includes(user.role);
  $("#signin-role-help").textContent=`Signed in with ${activeRole==="super_admin"?"super administrator":activeRole==="admin"?"administrator":"user"} access.`;
  $('#login-menu-label').textContent='My account';$('#login-options-auth').hidden=true;$('#login-options-account').hidden=false;
  $("#background-user").hidden = false;
  $("#calling-workspace").hidden=false;
  $("#dashboard").hidden=false;
  $("#planner").hidden=false;$("#campaign-inbox-panel").hidden=false;$("#search-panel").hidden=false;$("#support").hidden=false;
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
    refreshExternalSms().catch(error=>{$("#sms-status").textContent=error.message;});
  $("#external-sms").hidden=!user.features?.messaging;
  if (user.features?.messaging)
    loadContacts().catch((error) => { $("#chat-status").textContent = error.message; });
  $("#agent-panel").hidden = !user.features?.call_center;
  pbx.refreshSelf(user).catch((error) => { $("#agent-status-result").textContent = error.message; });
  $("#admin").hidden = !(["admin","super_admin"].includes(user.role));
  updateNavigation();
  workspaceQuick.refresh();workPlanner.refresh();campaigns.inbox();
  if(["admin","super_admin"].includes(user.role)){ $("#campaign-admin").hidden=false;$("#campaign-form [name=audience] option[value=all]").hidden=user.role!=="super_admin";campaigns.refresh();passkeyPolicy.refresh(); }
  if(user.role!=="super_admin")apiGet("/api/admin/servers/permissions").then(({accessLevel})=>{
    if(!activeRole||activeRole==="pending_password_change")return;
    $("#fleet-admin").hidden=accessLevel==="none";
    if(accessLevel!=="none"){serverFleet.refresh();fleetNetwork.refresh();fleetFirewall.refresh();}
    updateNavigation();
    workspaceQuick.refresh();
  }).catch(()=>{});
  const requested=decodeURIComponent(location.hash.slice(1));
  showWorkspace(pageId(location.pathname) ? document.getElementById(pageId(location.pathname))?.closest('section[id]')?.id || 'dashboard' : $("#app-nav").querySelector(`a[href="#${CSS.escape(requested)}"]`)?requested:"dashboard");
  pageRoutes.render();
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
    refreshCarriers().catch(error=>{$("#carrier-admin-status").textContent=error.message;});
    refreshFlowrouteRateDeck().catch(error=>{$("#flowroute-rate-status").textContent=error.message;});
    refreshMessagingWebhooks().catch(error=>{$("#webhooks-status").textContent=error.message;});
    refreshCharging().catch(error=>{$("#charging-status").textContent=error.message;});
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
    li.textContent = `${invoice.description}: ${money(invoice.amount_cents)} — ${invoice.status} `;
    if(invoice.status==='unpaid'&&invoice.currency==='USD'&&Number(invoice.amount_cents)>0){
      const button=document.createElement('button');button.type='button';button.textContent='Pay with Stripe';
      button.onclick=async()=>{button.disabled=true;try{const result=await accountRequest('/api/payments/checkout',{invoiceId:invoice.id});
        const dest=new URL(result.url);if(dest.protocol!=='https:'||dest.hostname!=='checkout.stripe.com')throw new Error('Invalid checkout URL');
        location.assign(dest.href);
      }catch(error){$('#checkout-status').textContent=error.message;button.disabled=false;}};li.append(button);
    }
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
    $("#signup-verify").elements.email.value=data.get('email');
    form.reset();
    $("#account-status").textContent = "Check your email for a verification code.";
    pageRoutes.go('signup-verify');
  } catch (error) { $("#account-status").textContent = error.message; }
});
$("#signup-verify").addEventListener('submit',async event=>{
  event.preventDefault();
  try {await accountRequest('/api/register/verify',Object.fromEntries(new FormData(event.currentTarget)));
    $("#account-status").textContent='Email verified. Sign in to continue.';pageRoutes.go('login');}
  catch(error){$("#account-status").textContent=error.message;}
});
$("#signup-resend").onclick=async()=>{
  try {const result=await accountRequest('/api/register/resend',{email:$("#signup-verify").elements.email.value});
    $("#account-status").textContent=result.status;}
  catch(error){$("#account-status").textContent=error.message;}
};
async function refreshPasskeys(){
  try {const result=await apiGet('/api/passkeys');const list=$("#passkey-list");list.replaceChildren();
    for(const key of result.passkeys){const item=document.createElement('li');
      item.textContent=`Passkey added ${new Date(key.created_at).toLocaleDateString()} `;
      const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';
      remove.onclick=async()=>{try{await accountRequest(`/api/passkeys/${encodeURIComponent(key.id)}`,{},'DELETE');await refreshPasskeys();}
        catch(error){$("#passkey-status").textContent=error.message;}};item.append(remove);list.append(item);}
  }catch(error){$("#passkey-status").textContent=error.message;}
}
async function refreshSipAccount(){
  try {const {account,note}=await apiGet('/api/sip-account');
    $("#sip-account-status").textContent=account?`${account.username}@${account.domain}: ${account.status}. ${note}`:'No SIP account record. Contact support.';
    $("#sip-credentials").hidden=!account||account.status!=='active';
  }catch(error){$("#sip-account-status").textContent=error.message;}
}
$("#sip-credentials").onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget;
  try {const result=await accountRequest('/api/sip-account/credentials',{password:form.elements.password.value});
    form.reset();$("#sip-credentials-result").textContent=`SIP username: ${result.username}; domain: ${result.domain}; password: ${result.password}`;
    setTimeout(()=>{$("#sip-credentials-result").textContent='Credentials cleared from this page.';},60000);
  }catch(error){form.reset();$("#sip-credentials-result").textContent=error.message;}
};
async function refreshDialplans(){
  try {const [catalog,requests]=await Promise.all([apiGet('/api/dialplan/offers'),apiGet('/api/dialplan/orders')]);
    const offers=$("#dialplan-offers");offers.replaceChildren();
    for(const offer of catalog.offers){const card=document.createElement('article');
      const heading=document.createElement('h3');heading.textContent=offer.name;
      const description=document.createElement('p');description.textContent=offer.description;
      const price=document.createElement('p');price.textContent=new Intl.NumberFormat(undefined,{style:'currency',currency:offer.currency}).format(offer.monthly_cents/100)+' / month';
      const order=document.createElement('button');order.type='button';order.textContent='Request this plan';
      order.onclick=async()=>{try{const result=await accountRequest('/api/dialplan/orders',{offerId:offer.id});
        $("#dialplan-status").textContent=`Request saved; invoice ${result.invoiceId} is unpaid.`;await refreshDialplans();}
        catch(error){$("#dialplan-status").textContent=error.message;}};
      card.append(heading,description,price,order);offers.append(card);}
    if(!catalog.offers.length) offers.textContent='No published offers yet.';
    const list=$("#dialplan-orders");list.replaceChildren();
    for(const request of requests.orders){const item=document.createElement('li');item.textContent=`${request.name}: ${request.status} (${new Date(request.created_at).toLocaleDateString()})`;list.append(item);}
  }catch(error){$("#dialplan-status").textContent=error.message;}
}
async function refreshCarriers(){
  const [data,trunks]=await Promise.all([apiGet('/api/admin/carriers'),apiGet('/api/pbx/trunks')]);
  const providerSelect=$("#carrier-profile-form").elements.provider,priorProvider=providerSelect.value;
  providerSelect.replaceChildren();
  for(const profile of data.providers){const option=document.createElement('option');
    option.value=profile.provider;option.textContent=profile.displayName;
    option.disabled=!profile.enabled;providerSelect.append(option);}
  if(data.providers.some(profile=>profile.provider===priorProvider&&profile.enabled))providerSelect.value=priorProvider;
  const selection=$("#carrier-profile-form").elements.trunkId,priorTrunk=selection.value;selection.replaceChildren();
  for(const trunk of trunks.trunks){const option=document.createElement('option');option.value=trunk.id;
    option.textContent=`${trunk.name} (${trunk.host})`;selection.append(option);}
  if(trunks.trunks.some(trunk=>trunk.id===priorTrunk)) selection.value=priorTrunk;
  const list=$("#carrier-profiles");list.replaceChildren();
  for(const profile of data.providers){const card=document.createElement('article');
    const title=document.createElement('h4');title.textContent=`${profile.displayName}: ${profile.enabled?profile.status:'disabled'}`;
    const details=document.createElement('p');details.textContent=`${['flowroute','didww'].includes(profile.provider)?'Provider API credentials: '+(profile.credentialsConfigured?'configured':'missing'):'Carrier adapter verification: '+(profile.adapterVerified?'verified':'pending')} · capacity: ${profile.max_concurrent_calls??0} · routing: ${profile.routing_mode} · adapter: ${data.adapterConfigured?'configured':'missing'}`;
    const trunk=trunks.trunks.find(item=>item.id===profile.trunk_id);
    const target=document.createElement('p');target.textContent=trunk?`Trunk: ${trunk.name} (${trunk.host}:${trunk.port}/${trunk.transport}) · ${trunk.enabled?'enabled':'disabled'}`:'No trunk selected';
    const verify=document.createElement('button');verify.type='button';verify.textContent='Verify inventory API';
    verify.disabled=!profile.enabled||(!['flowroute','didww'].includes(profile.provider)?!data.adapterConfigured:!profile.credentialsConfigured);
    if(!['flowroute','didww'].includes(profile.provider))verify.textContent='Verify carrier adapter';
    verify.onclick=async()=>{try{const result=await accountRequest(`/api/admin/carriers/${profile.provider}/verify`,{});
      $("#carrier-admin-status").textContent=result.adapterVerified?`${result.provider}: carrier adapter verified. No SIP route activated.`:
        `${result.provider}: credentials valid; ${result.sampleCount} inventory results. No SIP route activated.`;
      }catch(error){$("#carrier-admin-status").textContent=error.message;}};
    const activate=document.createElement('button');activate.type='button';activate.textContent='Provision with switch adapter';
    activate.disabled=!profile.trunk_id||!data.adapterConfigured||
      (['flowroute','didww'].includes(profile.provider)&&!profile.credentialsConfigured);
    if(!['flowroute','didww'].includes(profile.provider))activate.disabled ||= !profile.adapterVerified;
    activate.disabled ||= !profile.enabled;
    activate.onclick=async()=>{try{const result=await accountRequest(`/api/admin/carriers/${profile.provider}/activate`,{});
      $("#carrier-admin-status").textContent=`${result.provider}: ${result.status}`;await refreshCarriers();}
      catch(error){$("#carrier-admin-status").textContent=error.message;await refreshCarriers();}};
    card.append(title,details,target,verify,activate);
    if(profile.status==='active'){
      const deactivate=document.createElement('button');deactivate.type='button';
      deactivate.textContent='Deactivate with switch adapter';
      deactivate.disabled=!data.adapterConfigured;
      deactivate.onclick=async()=>{deactivate.disabled=true;try{
        await accountRequest(`/api/admin/carriers/${profile.provider}/deactivate`,{});
        await refreshCarriers();$("#carrier-admin-status").textContent=`${profile.displayName} deactivated by the switch adapter.`;
      }catch(error){$("#carrier-admin-status").textContent=error.message;deactivate.disabled=false;}};
      card.append(deactivate);
    }
    if(activeRole==='super_admin'&&!['flowroute','didww'].includes(profile.provider)){
      const toggle=document.createElement('button');toggle.type='button';
      toggle.textContent=profile.enabled?'Disable carrier':'Enable carrier';
      toggle.onclick=async()=>{toggle.disabled=true;try{
        await accountRequest(`/api/admin/carriers/catalog/${profile.provider}`,{enabled:!profile.enabled},'PUT');
        await refreshCarriers();$("#carrier-catalog-status").textContent=`${profile.displayName} ${profile.enabled?'disabled':'enabled'}.`;
      }catch(error){$("#carrier-catalog-status").textContent=error.message;toggle.disabled=false;}};
      card.append(toggle);
    }
    list.append(card);}
}
$("#carrier-catalog-form").onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');
  button.disabled=true;
  try{
    const {provider,displayName}=Object.fromEntries(new FormData(form));
    await accountRequest('/api/admin/carriers/catalog',{provider,displayName});
    await refreshCarriers();$("#carrier-profile-form").elements.provider.value=provider;
    $("#carrier-catalog-status").textContent=`${displayName} added. Create a tenant trunk and save its carrier profile.`;
    form.reset();
  }catch(error){$("#carrier-catalog-status").textContent=error.message;}
  finally{button.disabled=false;}
};
$("#flowroute-auto-form").onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
  button.disabled=true;
  try{
    const data=Object.fromEntries(new FormData(form));
    const result=await accountRequest('/api/admin/carriers/flowroute/auto-provision',{
      pop:data.pop,maxConcurrentCalls:Number(data.maxConcurrentCalls),routingMode:data.routingMode});
    await refreshCarriers();
    $("#carrier-profile-form").elements.provider.value='flowroute';
    $("#carrier-profile-form").elements.trunkId.value=result.trunkId;
    $("#carrier-admin-status").textContent=`Flowroute ${result.pop} trunk staged at ${result.host}:5060. Activate with the switch adapter when ready.`;
  }catch(error){$("#carrier-admin-status").textContent=error.message;}
  finally{button.disabled=false;}
};
$("#carrier-profile-form").onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget;const data=Object.fromEntries(new FormData(form));
  try{await accountRequest(`/api/admin/carriers/${data.provider}`,{trunkId:data.trunkId,
    maxConcurrentCalls:Number(data.maxConcurrentCalls),routingMode:data.routingMode},'PUT');
    $("#carrier-admin-status").textContent='Provider profile saved as draft.';await refreshCarriers();}
  catch(error){$("#carrier-admin-status").textContent=error.message;}
};
async function refreshCharging(){
  const summary=await apiGet('/api/admin/charging/overview');
  const tiles=$("#charging-tiles");tiles.replaceChildren();
  for(const [label,value] of [
    ['Imported CDRs (unrated)',summary.cdrCount],['Enabled preview rates',summary.rateCount],
    ['Unpaid invoices',summary.unpaidInvoices],['Unpaid amount (USD cents)',summary.unpaidCents],
    ['Pending dial plan requests',summary.pendingDialplans],['Active carrier profiles',summary.activeCarriers],
    ['Wallet liabilities (USD cents)',summary.walletLiabilityCents]
  ]){const card=document.createElement('article'),heading=document.createElement('h4'),number=document.createElement('strong');
    heading.textContent=label;number.textContent=String(value);card.append(heading,number);tiles.append(card);}
  $("#charging-status").textContent=summary.note;
}
$("#charging-refresh").onclick=()=>refreshCharging().catch(error=>{$("#charging-status").textContent=error.message;});
$("#dialplan-refresh").onclick=refreshDialplans;
$("#dialplan-admin-create").onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget;const data=Object.fromEntries(new FormData(form));
  try {await accountRequest('/api/admin/dialplan/offers',{...data,monthlyCents:Number(data.monthlyCents)});
    form.reset();$("#dialplan-status").textContent='Offer saved.';await refreshDialplans();}
  catch(error){$("#dialplan-status").textContent=error.message;}
};
$("#passkey-add").onclick=async()=>{
  try {const options=await accountRequest('/api/passkeys/register/options',{});
    const response=await startRegistration({optionsJSON:options});
    await accountRequest('/api/passkeys/register/verify',response);
    $("#passkey-status").textContent='Passkey added.';await refreshPasskeys();}
  catch(error){$("#passkey-status").textContent=error.message;}
};
$("#passkey-login").onclick=async()=>{
  const email=$("#login").elements.email.value;
  try {const options=await accountRequest('/api/passkeys/login/options',{email});
    const response=await startAuthentication({optionsJSON:options});
    const user=await accountRequest('/api/passkeys/login/verify',{email,response});
    signedIn(user);if(!user.mustChangePassword){history.replaceState(null,'','/#dashboard');pageRoutes.render();showWorkspace('dashboard');}}
  catch(error){$("#account-status").textContent=error.message;}
};
$("#login").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const user = await accountRequest("/api/login", Object.fromEntries(new FormData(form)));
    form.reset();
    signedIn(user);
    if(!user.mustChangePassword){history.replaceState(null,'','/#dashboard');pageRoutes.render();showWorkspace('dashboard');}
  } catch (error) { $("#account-status").textContent = error.message; }
});
$("#ldap-login").addEventListener("submit",async(event)=>{
  event.preventDefault();
  const form=event.currentTarget;
  try {
    const user=await accountRequest("/api/login/ldap",Object.fromEntries(new FormData(form)));
    form.reset();signedIn(user);history.replaceState(null,'','/#dashboard');pageRoutes.render();showWorkspace('dashboard');
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
    for(const id of ["account-login-group","account-signup-group","account-verify-group","account-directory-group"]) $("#"+id).hidden=false;
    $("#passkey-settings").hidden=true;
    $("#sip-account-panel").hidden=true;$("#sip-credentials-result").textContent='';
    $("#dialplan-marketplace").hidden=true;$("#dialplan-offers").replaceChildren();$("#dialplan-orders").replaceChildren();
    $("#account-password-group").hidden=true;
    activeRole=null;workspaceQuick.clear();resetWorkspace();$("#help-agent").hidden=true;$("#help-admin").hidden=true;$("#signin-role-help").textContent="Your assigned role controls which menus appear after sign-in.";
    $('#login-menu-label').textContent='Sign in';$('#login-options-auth').hidden=false;$('#login-options-account').hidden=true;
    $("#password-change").hidden = true;
    $("#background-user").hidden = true;
    $("#calling-workspace").hidden=true;
    $("#dashboard").hidden = true;
    $("#planner").hidden=true;$("#campaign-inbox-panel").hidden=true;$("#campaign-admin").hidden=true;$("#search-panel").hidden=true;$("#support").hidden=true;
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
    pageRoutes.go('login');
  } catch (error) { $("#account-status").textContent = error.message; }
};
$("#password-change").onsubmit=async(event)=>{
  event.preventDefault();
  try {
    const form=event.currentTarget;
    const result=await accountRequest("/api/account/password",Object.fromEntries(new FormData(form)));
    form.reset();$("#account-status").textContent=result.status;
    const fresh=await apiGet("/api/me");signedIn(fresh);
  } catch(error) {$("#account-status").textContent=error.message;}
};
fetch("/api/me", { credentials: "same-origin" })
  .then(async (response) => response.ok ? signedIn(await response.json()) : undefined)
  .catch(() => { $("#account-status").textContent = "Account service unavailable"; });

function status(message) { $("#status").textContent = message; }
function callState(active) {
  onCall = active;
  if($("#return-to-call")) $("#return-to-call").hidden=!active;
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
        $("#incoming").hidden = false; showWorkspace("calling-workspace"); status("Incoming call");
      },
      onCallAnswered: () => { if (currentCall) currentCall.answered = true; showWorkspace("calling-workspace"); callState(true); status("Call connected"); },
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

async function refreshMessagingWebhooks(){
  const data=await apiGet('/api/admin/messaging/webhooks');
  await refreshSmsNumberAdmin();
  const urls=$('#webhooks-urls');urls.replaceChildren();
  if(!data.configured){$('#webhooks-status').textContent='Private webhook token is not configured. Rerun deployment/bootstrap.sh on the server.';return;}
  $('#webhooks-status').textContent='Callbacks ready. Add these URLs in Flowroute Manage to receive messages.';
  for(const [kind,url] of Object.entries(data.urls)){
    const line=document.createElement('p'),label=document.createElement('strong'),input=document.createElement('input'),copy=document.createElement('button');
    label.textContent=kind.toUpperCase()+' ';input.value=url;input.readOnly=true;input.setAttribute('aria-label',kind+' callback URL');input.size=60;
    copy.type='button';copy.textContent='Copy';copy.onclick=async()=>{try{await navigator.clipboard.writeText(url);$('#webhooks-status').textContent=kind.toUpperCase()+' URL copied';}catch(error){input.select();$('#webhooks-status').textContent='Select and copy the URL';}};
    line.append(label,input,copy);urls.append(line);
  }
  const events=$('#webhooks-events');events.replaceChildren();
  for(const event of data.events){
    const item=document.createElement('p');
    item.textContent=`${event.received_at} · ${event.kind.toUpperCase()} · ${event.sender} → ${event.recipient} · ${event.status||event.body||'(media)'}`;
    events.append(item);
  }
  if(!data.events.length) events.textContent='No callbacks received yet.';
}
$('#webhooks-refresh').onclick=()=>refreshMessagingWebhooks().catch(error=>{$('#webhooks-status').textContent=error.message;});

async function refreshExternalSms(){
  const [numbers,inbox,sent]=await Promise.all([apiGet('/api/external-sms/numbers'),apiGet('/api/external-sms/inbox'),apiGet('/api/external-sms/sent')]);
  const senders=$('#sms-senders'),selected=senders.value;senders.replaceChildren();
  for(const number of numbers.numbers.filter(n=>n.enabled)){
    const option=document.createElement('option');option.value=number.number_e164;
    option.textContent=`${number.number_e164} · ${number.used_today}/${number.daily_limit} today`;senders.append(option);
  }
  if([...senders.options].some(n=>n.value===selected))senders.value=selected;
  $('#sms-status').textContent=senders.length?'':'No assigned messaging number yet.';
  for(const [target,records,direction] of [['#sms-inbox',inbox.messages,'from'],['#sms-sent',sent.messages,'to']]){
    const node=$(target);node.replaceChildren();
    for(const message of records){const item=document.createElement('p');
      item.textContent=`${new Date(message.received_at||message.created_at).toLocaleString()} · ${direction==='from'?'From':'To'} ${message[direction==='from'?'sender':'recipient']} · ${message.body||'(media)'} ${message.status||''}`;
      node.append(item);
    }
    if(!records.length)node.textContent='No messages yet.';
  }
}
$('#sms-refresh').onclick=()=>refreshExternalSms().catch(error=>{$('#sms-status').textContent=error.message;});
$('#sms-send').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget;const input=Object.fromEntries(new FormData(form));
  try{const result=await accountRequest('/api/external-sms/send',input);$('#sms-status').textContent=`Carrier accepted SMS ${result.providerId}`;form.elements.body.value='';await refreshExternalSms();}
  catch(error){$('#sms-status').textContent=error.message;}
};
async function refreshSmsNumberAdmin(){
  const data=await apiGet('/api/admin/messaging/numbers'),node=$('#sms-number-list');node.replaceChildren();
  for(const number of data.numbers){const row=document.createElement('p');row.textContent=`${number.number_e164} · ${number.display_name} · ${number.enabled?'enabled':'disabled'} · ${number.used_today}/${number.daily_limit} today`;node.append(row);}
}
$('#sms-number-admin').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,values=Object.fromEntries(new FormData(form));
  try{await accountRequest('/api/admin/messaging/numbers',{number:values.number,userId:values.userId,dailyLimit:Number(values.dailyLimit),enabled:form.elements.enabled.checked});
    $('#webhooks-status').textContent='Messaging number assigned.';await refreshSmsNumberAdmin();}
  catch(error){$('#webhooks-status').textContent=error.message;}
};

async function refreshFlowrouteRateDeck(){
  const result=await apiGet('/api/admin/rates/flowroute');const list=$('#flowroute-rate-decks');list.replaceChildren();
  for(const deck of result.decks){const row=document.createElement('p');
    row.textContent=`${deck.active?'Active':'Archived'} · ${deck.row_count} prefixes · ${Number(deck.markup_bps)/100}% markup · imported ${new Date(deck.imported_at).toLocaleString()} · SHA-256 ${deck.source_sha256}`;
    list.append(row);
  }
  if(!result.decks.length)list.textContent='No imported carrier rates.';
}
$('#flowroute-rate-refresh').onclick=()=>refreshFlowrouteRateDeck().catch(error=>{$('#flowroute-rate-status').textContent=error.message;});
$('#flowroute-rate-import').onsubmit=async event=>{
  event.preventDefault();const file=event.currentTarget.elements.rateFile.files?.[0];
  if(!file)return;
  const status=$('#flowroute-rate-status');status.textContent='Validating and importing carrier rates…';
  try{
    const response=await fetch('/api/admin/rates/flowroute/import',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'text/csv'},body:file});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Rate import failed');
    status.textContent=`${result.count} prefixes ${result.active?'active':'unchanged'} with 30% markup. Live switch not provisioned.`;
    await refreshFlowrouteRateDeck();
  }catch(error){status.textContent=error.message;}
};
$('#outbound-rate-search').onsubmit=async event=>{
  event.preventDefault();const prefix=event.currentTarget.elements.prefix.value;
  try{const {rate}=await apiGet('/api/rates/flowroute/search?prefix='+encodeURIComponent(prefix));
    $('#outbound-rate-result').textContent=rate?`${rate.destination} · +${rate.prefix} · $${rate.price_usd_per_minute}/minute · ${rate.first_interval}s first, ${rate.sub_interval}s thereafter`:'No active Flowroute rate for this destination.';
  }catch(error){$('#outbound-rate-result').textContent=error.message;}
};

$('#help-ask').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,question=form.elements.question.value;
  const button=form.querySelector('button');button.disabled=true;$('#help-answer').textContent='Checking the Olamide help guide…';
  try{const result=await accountRequest('/api/help/agent',{question});$('#help-answer').textContent=result.answer;$('#help-agent-status').textContent='AI generated answer. Open a ticket for account specific help.';}
  catch(error){$('#help-answer').textContent='';$('#help-agent-status').textContent=error.message;}
  finally{button.disabled=false;}
};
$('#help-ticket').onclick=()=>showWorkspace('support');
