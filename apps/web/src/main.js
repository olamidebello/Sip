import {createNativeCallClient} from './nativeCallClient.js';
import {createNativePushClient} from './nativePushClient.js';
import {createAutoSipRegistration} from './autoSipRegistration.js';
import {setupContactDirectory} from './contactDirectory.js';
import {setupConversations} from './conversations.js';
import {setupWorkspaceNavigation,fragmentTarget} from "./workspaceNavigation.js";
import {setupUserActivity} from "./userActivity.js";
import {setupProductStore} from './productStore.js';
import { SimpleUser } from "sip.js/lib/platform/web";
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { checkCurrentLocation } from "./geofence.js";
import { setupMeetings } from "./meetings.js";
import { setupGroupAdmin } from "./groups.js";
import { setupSipProfiles } from "./sipProfiles.js";
import {setupCommerceOps} from "./commerceOps.js";
import {setupProviderWebhookAdmin} from "./providerWebhookAdmin.js";
import {setupProviderCredentialsAdmin} from "./providerCredentialsAdmin.js";
import {setupConfigurationLinks} from "./configurationLinks.js";
import {setupDidwwAdmin} from "./didwwAdmin.js";
import {setupAdapterAdmin} from "./adapterAdmin.js";
import {setupOperatorControl} from "./operatorControl.js";
import {setupKamailioAdmin} from "./kamailioAdmin.js";
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
        <a href="/pages/ldap-login">Directory sign in</a><a href="/pages/signup">Create an account</a></div>
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
      <details><summary>How do I register and sign in?</summary><p>Choose Create an account in the Sign in menu, enter your details, type the password twice, and complete the CAPTCHA. Your account is created immediately. Return to Sign in with your email or assigned username.</p></details>
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
      <li>Register with matching passwords and CAPTCHA, then sign in.</li><li>Open Account & security to set a passkey and check your SIP identity.</li>
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
    <p>Registration creates an active account and SIP identity immediately. Calling needs an activated switch account; no number or plan is assigned at signup.</p>
    <p id="signin-role-help">Your assigned role controls which menus appear after sign-in.</p>
    <nav class="auth-pages" aria-label="Account pages"><a href="/pages/login">Sign in</a><a href="/pages/signup">Register</a><a href="/pages/ldap-login">Directory sign in</a></nav>
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
      <label>Confirm password <input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required></label>
      <input name="captchaId" type="hidden"><img id="signup-captcha-image" alt="CAPTCHA challenge: enter the six digits shown" width="240" height="76">
      <button id="signup-captcha-refresh" type="button">New CAPTCHA</button>
      <label>CAPTCHA digits <input name="captchaAnswer" inputmode="numeric" autocomplete="off" pattern="[0-9]{6}" maxlength="6" required></label>
      <p>Your account is created immediately. Email verification is not required.</p>
      <button>Create account</button>
    </form>
    <form id="signup-verify"><h3>Legacy email verification</h3>
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
    <section id="sip-account-panel" hidden><h3>My SIP account</h3><p>Your account connects automatically after sign-in and reconnects while this app is open. Closing the app or browser suspension can interrupt incoming calls.</p><p id="sip-account-status" role="status"></p>
      <form id="sip-credentials"><label>Account password to reveal SIP credentials <input name="password" type="password" autocomplete="current-password" required></label><label><input name="autoRegister" type="checkbox" checked> Register on this server after password verification</label><button>Verify and connect SIP account</button></form>
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
    <details id="contact-directory"><summary>Contacts, visibility and forwarding</summary>
      <form id="user-directory-search"><label>Search workspace users <input name="q" minlength="2" maxlength="100" required></label><button>Search users</button></form>
      <ul id="user-directory-results"></ul>
      <form id="contact-presence-settings">
        <label><input name="searchable" type="checkbox"> Allow workspace users to find me</label>
        <label>Presence <select name="presence"><option value="available">Available</option><option value="away">Away</option><option value="busy">Busy</option><option value="invisible">Invisible</option><option value="dnd">Do not disturb</option></select></label>
        <label>Status <input name="status_text" maxlength="160"></label>
        <label><input name="share_presence" type="checkbox"> Share presence and status in search</label>
        <label><input name="accept_forwarded" type="checkbox"> Accept forwarded calls and messages</label>
        <label>Forward app calls to contact <select name="call_forward"><option value="">Off</option></select></label>
        <label>Copy incoming account messages to contact <select name="message_forward"><option value="">Off</option></select></label>
        <p>Forwarding uses active workspace contacts who accept forwarding. Messages stay in your inbox and are copied once. Call forwarding applies to calls placed from this app; other SIP clients require switch routing configuration.</p>
        <button>Save visibility and forwarding</button>
      </form>
      <button id="contact-settings-refresh" type="button">Refresh contact settings</button>
      <h3>Private phone and email address book</h3>
      <button id="phone-contact-import" type="button">Choose contacts from phone</button>
      <form id="address-book-import"><label>Phone vCard or email contacts CSV <input name="file" type="file" accept=".vcf,.vcard,.csv,text/vcard,text/csv" required></label><button>Preview import</button></form>
      <p>Export contacts from Google Contacts, Outlook, or your phone and upload the file. Phone selection is available in supported mobile browsers.</p>
      <ul id="address-book-preview"></ul><button id="address-book-save" type="button" disabled>Import selected contacts</button>
      <ul id="address-book-list"></ul><p id="contact-directory-status" role="status"></p>
    </details>
    <p>Account messages are stored on this server. They are not end-to-end encrypted.</p>
    <form id="add-contact">
      <label>Contact email <input name="email" type="email" required></label>
      <button>Add contact</button>
    </form>
    <div class="bulk-controls">
      <label>Import contacts CSV (email column, up to 500 tenant users) <input id="contacts-file" type="file" accept=".csv,text/csv"></label>
      <button id="contacts-preview" type="button">Preview contact import</button>
      <label><input id="contacts-select-all" type="checkbox"> Select all import rows</label><span id="contacts-import-count" role="status"></span><ul id="contacts-import-rows"></ul>
      <button id="contacts-import" type="button" disabled>Import selected contacts</button>
      <button id="contacts-export" type="button">Export contacts CSV</button>
    </div>
    <label><input id="show-archived-conversations" type="checkbox"> Show archived conversations</label>
    <label>Conversation <select id="contact-list"></select></label>
    <div class="conversation-toolbar">
      <button id="call-contact" type="button" disabled>Call contact on SIP</button>
      <label><input id="conversation-blocked" type="checkbox"> Block messages</label>
      <label><input id="conversation-muted" type="checkbox"> Mute conversation</label>
      <label><input id="conversation-archived" type="checkbox"> Archive conversation</label>
    </div>
    <p id="conversation-typing" role="status" aria-live="polite"></p>
    <label>Search this conversation <input id="message-search" type="search" placeholder="Find a message"></label>
    <button id="load-messages" type="button">Refresh messages</button>
    <ol id="message-list"></ol>
    <div id="message-context" hidden><span id="message-context-text"></span><button id="message-context-cancel" type="button">Cancel</button></div>
    <form id="send-message">
      <label>Message <textarea name="body" maxlength="4000" rows="3" placeholder="Write a message…" required></textarea></label>
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
  <section id="product-store" hidden><h2>Olamide products &amp; services</h2>
    <p>Purchase products or subscribe to services. Subscriptions create monthly, quarterly or annual invoices payable through Billing; automatic card debits are not enabled. Payment and service delivery are tracked separately.</p>
    <label>Search <input id="store-search" type="search"></label><label>Category <select id="store-category"></select></label><button id="store-refresh" type="button">Refresh catalog</button>
    <p id="store-status" role="status"></p><div id="store-products"></div><h3>My orders &amp; subscriptions</h3><ul id="store-orders"></ul>
  </section>
  <section id="product-store-admin" hidden><h2>Product catalog management</h2>
    <p>Reference prices come from the August 2010 product list. Import creates drafts. Review current costs, availability, fulfillment and terms before publishing. Existing edits survive re-import. Recurring renewal prices are fixed at purchase; cancellation stops future invoices.</p>
    <button id="store-import-reference" type="button">Import 177 reference products</button><button id="store-admin-refresh" type="button">Refresh products &amp; orders</button><p id="store-admin-status" role="status"></p>
    <label>Search products <input id="store-admin-search" type="search"></label>
    <label><input id="store-select-all" type="checkbox"> Select all filtered products</label><button id="store-clear-selection" type="button">Clear selection</button><span id="store-selection-count" role="status"></span>
    <label>Bulk status <select id="store-bulk-status"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
    <label><input id="store-bulk-ready" type="checkbox"> I verified availability, current costs, fulfillment and each selected product’s terms.</label><button id="store-bulk-apply" type="button">Apply to selected products</button>
    <h3>Mass import</h3><p>Upload CSV or JSON with up to 500 products. Prices use USD cents. New products become drafts; existing SKUs are skipped.</p>
    <button id="store-import-template" type="button">Download CSV template</button><label>Product file <input id="store-import-file" type="file" accept=".csv,.json,text/csv,application/json"></label>
    <button id="store-import-preview" type="button">Preview import</button><label><input id="store-import-all" type="checkbox"> Select all import rows</label><span id="store-import-count" role="status"></span>
    <ul id="store-import-rows"></ul><button id="store-import-selected" type="button" disabled>Import selected products</button>
    <div id="store-admin-products"></div><h3>Order commissioning &amp; delivery</h3><ul id="store-admin-orders"></ul>
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
    <label>Number search (prefix for Flowroute; contains for DIDWW) <input id="number-prefix" placeholder="+23420315"></label>
    <button id="search-numbers" type="button">Search numbers</button>
    <p>Flowroute and DIDWW prices include a 30% increase on provider USD costs. Orders charge setup plus the first month. Availability is checked at submission; carrier purchase and activation require fulfillment review.</p>
    <label><input id="did-order-terms" type="checkbox"> I accept the displayed setup and monthly prices and understand this is a request pending carrier fulfillment, not an activated DID.</label>
    <button id="next-numbers" type="button" hidden>Next Flowroute results</button>
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
    <section id="carrier-admin"><h3>Carrier provider commissioning</h3><p>Default outbound call termination: Flowroute. Other providers are excluded from outbound route selection. Calls require an active, commissioned Flowroute trunk and matching rate; there is no automatic provider fallback.</p>
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
      <h3>Kamailio services</h3>
      <p>Install and enable capabilities through reviewed server profiles. Installation, configuration, connection and acceptance status are tracked separately.</p>
      <form id="kamailio-plan"><h4>Capability deployment</h4>
        <label>Switch node <select name="node" required></select></label>
        <label>Reviewed controller profile <input name="profile" pattern="[a-z][a-z0-9_-]{0,63}" value="production" required></label>
        <label>Search module <input name="search" type="search"></label>
        <label>Status <select name="filter"><option value="">All</option><option>pending</option><option>configured</option><option>connected</option><option>tested</option></select></label>
        <button id="kamailio-select" type="button">Select released capabilities</button>
        <button id="kamailio-same-server" type="button">Select same-server SIP and media profile</button>
        <button id="kamailio-same-server-trunk" type="button">Select same-server carrier trunk profile</button>
        <button id="kamailio-same-server-mail" type="button">Select combined SIP, trunk and email profile</button>
        <button id="kamailio-carrier-grade" type="button">Select carrier deployment and acceptance gate</button>
        <button id="kamailio-freeswitch-cluster" type="button">Select two FreeSWITCH backends</button>
        <button id="kamailio-same-server-pbx" type="button">Select same-server PBX profile</button>
        <button id="kamailio-clear" type="button">Clear selection</button>
        <button type="submit">Queue installation and configuration</button>
      </form>
      <button id="kamailio-refresh" type="button">Refresh status</button><button id="kamailio-export" type="button">Export inventory and evidence</button>
      <p id="kamailio-status" role="status"></p>
      <div style="overflow:auto"><table><thead><tr><th>Capability</th><th>Maturity</th><th>Install</th><th>Enable</th><th>Installed</th><th>Status</th><th>Evidence</th><th>Guide</th></tr></thead><tbody id="kamailio-features"></tbody></table></div>
      <h4>Switch and server commissioning</h4><p>Live process and transport checks are separate from call acceptance. Inventory refreshes each minute.</p><ul id="service-inventory"></ul><p><a href="#carrier-admin">Carrier commissioning</a> · <a href="#carrier-adapter-admin">Routing adapters</a> · <a href="#sip-profile-admin">SIP provisioning policies</a></p><h4>Production commissioning</h4><p>Same-server plans install Kamailio and RTPengine using a private reviewed profile. Successful deployment verifies media control, WebSocket transport and public DNS. SIP authentication, two-way audio, carrier calls, billing, backups and capacity tests remain separate acceptance requirements.</p><h4>Carrier and ASTPP-style feature readiness</h4><p>Application integration is separate from live-service acceptance. Pending features require implementation or commissioning; this is not an ASTPP installation.</p><ul id="carrier-readiness"></ul><h4>Automatic account provisioning</h4><p id="sip-provisioning-status" role="status"></p><button type="button" id="sip-provisioning-retry">Retry pending accounts</button><ul id="sip-provisioning-accounts"></ul><h4>Deployment history</h4><ul id="kamailio-history"></ul>
    </section>
    <section id="carrier-adapter-admin" hidden>
      <h3>Carrier adapter nodes</h3>
      <p>Assign multiple private adapter targets to Flowroute, DIDWW, or a future carrier. Health and capacity determine which node commissions a carrier; the active assignment stays pinned until deactivation. Define target URLs and tokens only on the server.</p>
      <form id="adapter-create">
        <label>Carrier <select name="provider" required></select></label>
        <label>Adapter name <input name="name" maxlength="80" required></label>
        <label>Private target key <select name="targetKey" required></select></label>
        <p><a id="adapter-configure" href="#adapter-target-configuration" aria-controls="adapter-target-configuration" aria-expanded="false">Configure private targets</a></p>
        <details id="adapter-target-configuration">
          <summary>Private target configuration</summary>
          <p>On the SIP server, add your deployed adapter endpoint and its authentication token to <code>CARRIER_ADAPTER_TARGETS_JSON</code> in <code>/etc/olamide/secrets.env</code> and the active Compose environment file <code>/opt/olamide/repo/deployment/docker/.env</code>. Keep both files private.</p>
          <pre>CARRIER_ADAPTER_TARGETS_JSON={"us-east":{"url":"https://adapter.example.com/provision","token":"REPLACE_WITH_YOUR_ADAPTER_TOKEN_32_OR_MORE_CHARACTERS"}}</pre>
          <p>Replace the example with your actual adapter URL and token. Target keys must start with a lowercase letter, contain only lowercase letters, digits or hyphens, and be 2–40 characters long. Use an HTTPS endpoint and a token of at least 32 characters. This token authenticates your adapter service; it is se…26970 tokens truncated….value;
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
    await nativeCalls.stop();
    await nativePush.stop();
    await autoSip.stop();
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
    $("#product-store").hidden=true;
    $("#product-store-admin").hidden=true;
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
const nativePush=createNativePushClient({request:accountRequest,onStatus:message=>{$('#sip-account-status').textContent=message;}});
const autoSip=createAutoSipRegistration({
  session:()=>accountRequest('/api/sip-account/session',{}),
  connected:()=>sipRegistered&&!!phone?.isConnected(),
  onStatus:message=>{$('#sip-account-status').textContent=message;status(message);},
  async connect(account,valid){
    if(onCall)return;
    const data=new FormData();for(const [key,value] of Object.entries({aor:`sip:${account.username}@${account.domain}`,username:account.username,password:account.password,server:'wss://'+location.host+'/ws'}))data.set(key,value);
    await registerSip(data,valid);
  },
  async disconnect(){if(phone){const current=phone;phone=undefined;sipRegistered=false;if(onCall)await current.hangup().catch(()=>{});await current.unregister().catch(()=>{});await current.disconnect().catch(()=>{});callState(false);connectForm.hidden=false;dialForm.hidden=true;$('#disconnect').hidden=true;}}
});
const nativeCalls=createNativeCallClient({plugin:()=>window.Capacitor?.Plugins?.NativePush,wake:()=>autoSip.wake(),currentCall:()=>({callId:currentCall?.sipCallId}),answer:()=>{if(!phone)throw new Error('SIP connection pending');return phone.answer();},end:()=>onCall?phone?.hangup():phone?.decline(),onError:report});
window.addEventListener('online',()=>{autoSip.wake();if(softphoneUserId)void nativePush.start();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')autoSip.wake();});
window.addEventListener('pagehide',()=>{void autoSip.stop();});
window.addEventListener('pageshow',event=>{if(event.persisted&&softphoneUserId)autoSip.start(softphoneUserId);});
fetch("/api/me", { credentials: "same-origin" })
  .then(async (response) => response.ok ? signedIn(await response.json()) : undefined)
  .catch(() => { $("#account-status").textContent = "Account service unavailable"; });

function status(message) { $("#status").textContent = message; }
function callState(active) {
  onCall = active;
  const nativeCall=window.Capacitor?.Plugins?.NativePush;
  if(nativeCall?.setCallActive)void nativeCall.setCallActive({active}).catch(error=>{$('#status').textContent=error.message;});
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

async function registerSip(data,shouldContinue=()=>true) {
  if (!softphoneUserId) {status("Sign in to Olamide before connecting a SIP account.");return;}
  if(phone){if(onCall)throw new Error("End the current call before changing registration.");await phone.unregister();await phone.disconnect();phone=null;}
  const aor = String(data.get("aor")).trim();
  const server = String(data.get("server")).trim();
  if (!/^sip:[^\s@]+@[^\s@]+$/i.test(aor) || !server.startsWith("wss://")) {
    status("Enter a valid sip:user@domain and wss:// URL.");
    return;
  }
  const candidate = new SimpleUser(server, {
    aor,
    reconnectionAttempts:8,reconnectionDelay:4,registererOptions:{expires:300,refreshFrequency:80},
    media: { remote: { audio: $("#remote") } },
    userAgentOptions: {
      transportOptions:{keepAliveInterval:30,keepAliveDebounce:10},
      authorizationUsername: String(data.get("username")),
      authorizationPassword: String(data.get("password"))
    },
    delegate: {
      onCallReceived: async () => {
        // SIP.js 0.21.2 SimpleUser keeps the Invitation internally; require its exact Call-ID.
        currentCall = { direction: "incoming", address: "Unknown caller", sipCallId:candidate.session?.request?.callId };
        if ($("#dnd").checked) {
          try { await candidate.decline(); } catch (error) { report(error); }
          finishCall("declined (do not disturb)");
          return;
        }
        void nativeCalls.incoming(currentCall.sipCallId).catch(report);
        $("#incoming").hidden = false; showWorkspace("calling-workspace"); status("Incoming call");
      },
      onCallAnswered: () => { void nativeCalls.connected(currentCall?.sipCallId).catch(report); if (currentCall) currentCall.answered = true; showWorkspace("calling-workspace"); callState(true); status("Call connected"); },
      onCallHangup: () => { void nativeCalls.ended(currentCall?.sipCallId).catch(report); finishCall(currentCall?.answered ? "completed" : "missed or unanswered"); callState(false); status("Call ended"); },
      onServerDisconnect: () => {sipRegistered=false;status("Connection lost. Reconnecting…");autoSip.dropped();},
      onRegistered: () => {if(shouldContinue()){sipRegistered=true;status("Registered");}},
      onUnregistered: () => {sipRegistered=false;status("Unregistered");autoSip.dropped();}
    }
  });
  try {
    status("Connecting…");
    await candidate.connect();
    await candidate.register();
    if(!shouldContinue()){await candidate.unregister().catch(()=>{});await candidate.disconnect();return;}
    phone = candidate;
    connectForm.hidden = true;
    dialForm.hidden = false;
    $("#disconnect").hidden = false;
    status(sipRegistered?"Registered":"Waiting for SIP registration…");
    refreshAudioOutputs();
  } catch (error) {
    report(error);
    await candidate.disconnect().catch(() => {});
    throw error;
  }
}
connectForm.addEventListener("submit",async event=>{event.preventDefault();try{await registerSip(new FormData(connectForm));}catch(error){report(error);}});

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
  let authorizedTarget=target;
  try {const access=await accountRequest('/api/softphone/authorize',{target});authorizedTarget=access.target||target;}catch(error){status(error.message);return;}
  currentCall = { direction: "outgoing", address: target };
  try { status("Calling…"); await phone.call(authorizedTarget); }
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
  await autoSip.stop();
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
  $('#flowroute-rate-status').textContent='Automatic checks: '+(result.sync?.enabled?'enabled':'disabled')+' · '+(result.sync?.last_error||('Last success: '+(result.sync?.last_success_at||'pending')));
}
for(const [id,path] of [['flowroute-rate-sync','sync'],['flowroute-rate-sync-disable','sync/disable']])$('#'+id).onclick=async()=>{try{await accountRequest('/api/admin/rates/flowroute/'+path,{});await refreshFlowrouteRateDeck();}catch(error){$('#flowroute-rate-status').textContent=error.message;}};
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
