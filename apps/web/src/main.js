import {setupCarrierConsole} from './carrierConsole.js';
import {setupContactCard} from './contactCard.js';
import {setupSocialPublishing} from './socialPublishing.js';
import {setupLanguageTools} from './languageTools.js';
import {setupContactManagerLayout} from './contactManagerLayout.js';
import {setupSocialLinks} from './socialLinks.js';
import {setupSocialWorkspace} from './socialWorkspace.js';
import {setupSignupCaptcha} from './signupCaptcha.js';
import {setupContactDiscovery} from './contactDiscovery.js';
import {setupSubscriberDelivery} from './subscriberDelivery.js';
import {setupChatComposerShortcuts} from './chatComposerShortcuts.js';
import {setupMessengerPreferences} from './messengerPreferences.js';
import {styleMessengerSettings} from './messengerSettings.js';
import {setupCallsScreen} from './callsScreen.js';
import {setupNavigationPolicy} from './navigationPolicy.js';
import {waitForSipRegistration} from './sipRegistration.js';
import {messengerPanels,setupMessengerHub} from './messengerHub.js';
import {setupSessionAdmin} from './sessionAdmin.js';
import {createSessionWatch} from './sessionWatch.js';
import {setupDialerContacts} from './dialerContacts.js';
import {setupMessengerOverflow} from './messengerOverflow.js';
import {setupMoneyWorkspace} from './moneyWorkspace.js';
import {createNativeCallClient} from './nativeCallClient.js';
import {createNativePushClient} from './nativePushClient.js';
import {createAutoSipRegistration} from './autoSipRegistration.js';
import {setupDialpad,dialTarget} from './dialpad.js';
import {setupChatLanding} from './chatLanding.js';
import {setupCallGui} from './callGui.js';
import {setupChatGestures} from './chatGestures.js';
import {icon} from './messengerIcons.js';
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
import {setupWalletProvidersAdmin} from './walletProvidersAdmin.js';
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
    <nav class="public-nav" aria-label="Public navigation"><a href="#experience">Explore</a><a href="#downloads">Downloads</a><a href="#help" id="public-help">Help</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>
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
    <section id="signed-in-profile" hidden><h3>My profile</h3><label>Name <input id="profile-name" readonly></label><label>Email <input id="profile-email" readonly></label></section>
    <nav class="auth-pages" aria-label="Account pages"><a href="/pages/login">Sign in</a><a href="/pages/signup">Register</a><a href="/pages/ldap-login">Directory sign in</a></nav>
    <form id="signup">
      <h3>Create an account</h3><p>Review our <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a> and <a href="/terms" target="_blank" rel="noopener">Terms of Service</a> before registering.</p>
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
  <section id="campaign-inbox-panel" hidden><h2>Announcements</h2><button id="campaign-inbox-refresh" type="button">Refresh notifications</button><p id="campaign-inbox-status" role="status"></p><ul id=…61991 tokens truncated…Installation does not turn that into a billed PSTN route. `routingCommissioned` therefore defaults to false, and verify/activate return an error until that integration is implemented and tested.

The added `OLAMIDE_FLOWROUTE` hook expects `$var(olamide_tenant_id)` and `$var(olamide_pstn_authorized)=1` from the authenticated, server-authorized billing path. It validates E.164 destinations and builds the Flowroute `techPrefix*number` URI and UDP destination. It does not relay the call itself. The upstream route must reserve credit, enforce subscriptions/fraud/concurrency, apply the configured authorized caller ID, process RTP, record-route and relay, and settle accounting on completion. Subscriber-controlled values must not set these authorization variables. Only after this integration is actually commissioned should deployment set `-e carrier_adapter_routing_commissioned=true`.

A Kamailio restart clears in-memory carrier state, so the route fails closed until the gateway is reactivated in the GUI. The private state file is available for recovery but is not automatically replayed. Health proves RPC reachability, not successful SIP calls or billing. The Python backend and stage generator have unit tests; actual Kamailio parser validation and call testing take place on the server during deployment/integration.
