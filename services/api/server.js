import {handleSuperAdminControl,migrateSuperAdminControl} from './superAdminControl.js';
import {handleCallingPlan} from './defaultCallingPlan.js';
import {handleModuleAudit} from './moduleAudit.js';
import {handleCdrArchives,startCdrArchives} from './cdrArchive.js';
import {handlePaymentReconciliation,startPaymentReconciliation} from './paymentReconciliation.js';
import {handleStoreGateways} from './storeGateways.js';
import {handleMarketplaceControl} from './marketplaceControl.js';
import {handleTelecomRefills} from './telecomRefills.js';
import {handleTelecomAnalytics} from './telecomAnalytics.js';
import {handleTelecomReports,startTelecomReports} from './telecomReports.js';
import {handleTelecomPolicies} from './telecomPolicies.js';
import {handleTariffCatalog} from './tariffCatalog.js';
import {handleTelecomResources} from './telecomResources.js';
import {handleAccountRanges} from './accountRanges.js';
import {handleTelecomFeatures} from './telecomFeatures.js';
import {handleContactCards} from './contactCards.js';
import {handleLanguageTools} from './languageTools.js';
import {handleSocial} from './social.js';
import {handleContactDiscovery} from './contactDiscovery.js';
import {handleSubscriberSettings,deliverSubscriberSms,startSubscriberEmail} from './subscriberDelivery.js';
import {handleSubscriberRouting,startSubscriberDelivery} from './subscriberRouting.js';
import {handleViewOnce,startMessageExpiry} from './messagePrivacy.js';
import {handleMessengerPreferences,handleProfilePhoto} from './messengerPreferences.js';
import {handleScheduledCalls} from './scheduledCalls.js';
import {handleNavigationPolicy} from './navigationPolicy.js';
import {createProxyClientResolver,createRequestLimiter,requestLimitRule} from './requestLimits.js';
import {handleMessengerFeatures} from './messengerFeatures.js';
import {createLimitedSession,handleSessionPolicy} from './sessionPolicy.js';
import {handleGoogleContactsAdmin} from './googleContactsConfig.js';
import {migratePstnBilling} from './pstnBilling.js';
import {startKamailioHttpBridge} from './kamailioHttpBridge.js';
import {handleNativePush,pushHookAuthorized,startNativePush} from './nativePush.js';
import {handleContactSettings} from './contactSettings.js';
import {handleCallAccess,activeSubscription} from './callAccess.js';
import {handleConversations} from './conversations.js';
import {handleUserActivity,recordApiActivity} from './userActivity.js';
import {handleProductStore,startStoreRenewals} from './productStore.js';
import { startSipProvisioning, handleSipProvisioning } from './sipProvisioning.js';
import http from "node:http";
import { migrate } from './migrate.js';
import { randomUUID } from 'node:crypto';
import { handleOnboarding } from './onboarding.js';
import { handlePasskeys } from './passkeys.js';
import { handleSipMarketplace } from './sipMarketplace.js';
import { handleSipProfiles } from './sipProfiles.js';
import {handlePaymentAdmin,handlePaymentCheckout,handleStripeWebhook} from './payments.js';
import {handleCluster} from './cluster.js';
import {handleProviderWebhook,handleProviderWebhookAdmin} from './providerWebhooks.js';
import {handleWalletProviderAdmin} from './walletProviders.js';
import {handleProviderCredentials} from './providerCredentials.js';
import {handleDidwwCallback,handleDidwwAdmin} from './didwwIntegration.js';
import { handleCarrierProviders, carrierActive } from './carrierProviders.js';
import { handleAdapterRegistry } from './adapterRegistry.js';
import { handleOperatorControl } from './operatorControl.js';
import {handleKamailioAdmin,handleKamailioRunner} from './kamailio.js';
import { handleServerFleetAdmin,handleServerFleetRunner } from './serverFleet.js';
import {handleOperationsPolicy,resolveWss} from './operationsPolicy.js';
import {handleWorkspaceShortcuts} from './workspaceShortcuts.js';
import {handleWorkPlanner} from './workPlanner.js';
import {handleCampaigns} from './campaigns.js';
import {effectivePasskeyMode,passkeyGate,handlePasskeyPolicy} from './passkeyPolicy.js';
import {startFlowrouteRateSync} from './flowrouteRateSync.js';
import { handleFlowrouteRates } from './flowrouteRates.js';
import { handleHelpAgent } from './helpAgent.js';
import { handleFlowrouteWebhook, handleMessagingWebhookAdmin, handleExternalSms, handleSmsNumberAdmin } from './messagingWebhooks.js';
import { handleCharging } from './charging.js';
import { createDatabase } from "./db.js";
import { handleMobileAdmin } from "./mobileAdmin.js";
import { handlePbx } from "./pbx.js";
import { handleCdrIngest, handleCdrAdmin } from "./cdr.js";
import { handleInhouseDids } from "./dids.js";
import { handleNigeria } from "./nigeria.js";
import { handleReports } from "./reports.js";
import { handleAccess } from "./access.js";
import { pricingRule,sellingCents,handlePricing } from "./pricing.js";
import { handleBackground } from "./background.js";
import { loadLdapConnections,loginWithLdap,handleLdapAdmin } from "./ldap.js";
import { handleAuthProviders } from "./authProviders.js";
import {catalogPolicy,allowed,routeCapability,handleCatalogControl} from "./catalogControl.js";
import {handleSoftphoneState} from "./softphoneState.js";
import {handleGeofencePolicy} from "./geofencePolicy.js";
import {turnIceServer} from "./turn.js";
import {handleWallet} from "./wallet.js";
import {handleDashboard} from "./dashboard.js";
import {handleSupport} from "./support.js";
import {handleSearch} from "./search.js";
import {handleLocales} from "./locales.js";
import { handleTenants, isAdmin, defaultTenantId } from "./tenancy.js";
import { availableNumbers,inventorySearch } from "./providers.js";
import { attachMeetingSignaling } from "./meetings.js";
import { validateFeatures, effectiveFeatures } from "./permissions.js";
import {
  verifyPassword, createSessionToken, tokenHash
} from "./security.js";

const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5173";
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
if (!local && !origin.startsWith("https://"))
  throw new Error("PUBLIC_ORIGIN must use HTTPS outside local development");
const pool = createDatabase(process.env.MYSQL_URL);
const maxBodyBytes = 8192;
const requestLimiter=createRequestLimiter();
const proxyClient=createProxyClientResolver();
const uuidPattern = /^[0-9a-f-]{36}$/i;
const meetingIceServers = JSON.parse(process.env.MEETING_ICE_SERVERS_JSON || "[]");
if (!Array.isArray(meetingIceServers)) throw new Error("MEETING_ICE_SERVERS_JSON must be an array");
const turnSecret=process.env.TURN_SECRET,turnHost=process.env.TURN_PUBLIC_HOST;
if ((turnSecret || turnHost) && (!turnSecret || !turnHost))
  throw new Error("TURN_SECRET and TURN_PUBLIC_HOST must be set together");
if (turnSecret) turnIceServer({secret:turnSecret,host:turnHost,userId:"00000000-0000-4000-8000-000000000000"});
const cdrKeys = JSON.parse(process.env.CDR_INGEST_KEYS_JSON || "{}");
const ldapConnections=loadLdapConnections(process.env.LDAP_TENANTS_JSON);
if (!cdrKeys || typeof cdrKeys !== "object" || Array.isArray(cdrKeys) ||
    Object.entries(cdrKeys).some(([tenant,secret]) =>
      !uuidPattern.test(tenant) || typeof secret !== "string" || secret.length < 32))
  throw new Error("CDR_INGEST_KEYS_JSON must map tenant IDs to secrets of at least 32 characters");
let meetingSignaling;

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  res.end(JSON.stringify(body));
}
async function readJson(req, limit=maxBodyBytes) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new Error("Content-Type must be application/json");
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > limit) throw new Error("Request too large");
  }
  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid JSON object");
  return parsed;
}
function sessionCookie(token, maxAge) {
  return `olamide_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${local ? "" : "; Secure"}`;
}
function currentToken(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)olamide_session=([^;]+)/);
  return match?.[1];
}
async function currentUser(req) {
  const token = currentToken(req);
  if (!token) return null;
  const result = await pool.query(
    "SELECT u.id,u.display_name,u.email,u.role,u.auth_source,u.must_change_password,s.auth_method, CASE WHEN u.role='super_admin' AND selected.id IS NOT NULL THEN selected.id ELSE u.tenant_id END AS tenant_id FROM sessions s JOIN users u ON u.id=s.user_id AND u.status='active' JOIN tenants t ON t.id=u.tenant_id AND t.status='active' LEFT JOIN tenant_ldap_settings ldap ON ldap.tenant_id=u.tenant_id LEFT JOIN tenant_auth_policy auth ON auth.tenant_id=u.tenant_id LEFT JOIN tenants selected ON selected.id=s.selected_tenant_id AND selected.status='active' WHERE s.token_hash=$1 AND s.expires_at>now() AND ((u.auth_source='local' AND (auth.local_enabled IS NULL OR auth.local_enabled=TRUE OR u.role='super_admin')) OR (u.auth_source='ldap' AND ldap.enabled=TRUE))",
    [tokenHash(token)]
  );
  const user = result.rows[0];
  if (!user) return null;
  user.passkeyGate=await passkeyGate(pool,user);
  user.features = await featuresFor(user);
  return user;
}
async function featuresFor(user) {
  if (isAdmin(user)) return effectiveFeatures([], true);
  const result = await pool.query(
    "SELECT g.features FROM user_group_members m JOIN user_groups g ON g.id=m.group_id WHERE m.user_id=$1 AND g.tenant_id=$2",
    [user.id,user.tenant_id]
  );
  return effectiveFeatures(result.rows.map((row) => row.features));
}
async function handler(req, res) {
  const path = new URL(req.url, origin).pathname;
  const nativePushHook=path==='/api/native-push/wake'&&pushHookAuthorized(req);
  if (req.method === "GET" && path === "/api/health")
    return send(res, 200, { status: "ok", ...(process.env.APP_RELEASE ? {release:process.env.APP_RELEASE} : {}) });
  const flowrouteWebhook = path.startsWith("/api/webhooks/flowroute/");
  const stripeWebhook = path.startsWith("/api/webhooks/stripe/");
  const providerWebhook=path.startsWith("/api/webhooks/providers/");
  const didwwWebhook=path.startsWith("/api/webhooks/didww/");
  const cdrIngest = req.method === "POST" && path === "/api/integrations/cdr";
  const switchXml = path === "/api/switch/xml";
  const deployRunner = path.startsWith('/api/integrations/deployment/');
  const kamailioRunner=path.startsWith('/api/integrations/kamailio/');
  if (req.method !== "GET" && !nativePushHook && !deployRunner && !kamailioRunner && !switchXml && !cdrIngest && !flowrouteWebhook && !stripeWebhook && !providerWebhook && !didwwWebhook && req.headers.origin !== origin)
    return send(res, 403, { error: "Invalid origin" });
  try {
    if(req.method!=='GET'||path==='/api/register/captcha'){
      const external=!!(nativePushHook||deployRunner||kamailioRunner||switchXml||cdrIngest||flowrouteWebhook||stripeWebhook||providerWebhook||didwwWebhook);
      const client=await proxyClient(req);
      const edge=requestLimiter.check('edge:'+client,600);
      if(!edge.allowed)return send(res,429,{error:'Too many requests',retryAfter:edge.retryAfter},{'Retry-After':String(edge.retryAfter)});
      const rateUser=!external&&currentToken(req)?await currentUser(req):null;
      const rule=requestLimitRule({path,userId:rateUser?.id,client,external,actions:Number(process.env.API_RATE_LIMIT||120),auth:Number(process.env.AUTH_RATE_LIMIT||20)});
      const limited=requestLimiter.check(rule.key,rule.maximum);
      if(!limited.allowed)return send(res,429,{error:'Too many requests',retryAfter:limited.retryAfter},{'Retry-After':String(limited.retryAfter)});
    }
    if(path==='/api/native-push/wake')return await handleNativePush({req,res,path,pool,send,readJson});
    if (switchXml) return send(res,410,{error:'Legacy XML integration retired'});
    if(kamailioRunner) return await handleKamailioRunner({req,res,path,pool,send,readJson});
    if (deployRunner) return await handleServerFleetRunner({req,res,path,pool,send,readJson});
    if (flowrouteWebhook) return await handleFlowrouteWebhook({req,res,path,pool,send});
    if (stripeWebhook) return await handleStripeWebhook({req,res,path,pool,send});
    if (providerWebhook) return await handleProviderWebhook({req,res,path,pool,send});
    if (didwwWebhook) return await handleDidwwCallback({req,res,path,pool,send,origin});
    if (cdrIngest) return await handleCdrIngest({req,res,pool,send,keys:cdrKeys});
    if (currentToken(req) && !['/api/account/password','/api/me','/api/logout','/api/login'].includes(path)) {
      const sessionAccount=await currentUser(req);
      if(sessionAccount?.must_change_password) return send(res,403,{error:'Change your temporary password before continuing'});
      if(sessionAccount?.passkeyGate && !((sessionAccount.passkeyGate==='enroll') && (path==='/api/passkeys'||path.startsWith('/api/passkeys/register/')))) return send(res,403,{error:sessionAccount.passkeyGate==='enroll'?'Register a passkey, then sign in with it':'Passkey sign-in required'});
    }
    if (path.startsWith('/api/register')) return await handleOnboarding({req,res,path,pool,send,readJson,origin});
    if (path.startsWith('/api/passkeys')) return await handlePasskeys({req,res,path,pool,send,readJson,origin,currentUser,featuresFor,sessionCookie,closeSessions:hashes=>meetingSignaling?.closeSessions(hashes)});
    if (req.method === "POST" && path === "/api/login") {
      const { email, password } = await readJson(req);
      if (typeof email !== "string" || typeof password !== "string" ||
          email.length > 254 || password.length > 1024)
        return send(res, 400, { error: "Invalid credentials" });
      const result = await pool.query(
        "SELECT u.id, u.display_name, u.email, u.role, u.tenant_id,u.must_change_password, u.password_salt, u.password_hash FROM users u JOIN tenants t ON t.id=u.tenant_id AND t.status='active' LEFT JOIN tenant_auth_policy auth ON auth.tenant_id=u.tenant_id WHERE (u.email=$1 OR u.username=$1) AND u.status='active' AND u.auth_source='local' AND (auth.local_enabled IS NULL OR auth.local_enabled=TRUE OR u.role='super_admin')",
        [email.trim().toLowerCase()]
      );
      const user = result.rows[0];
      if (!user || !await verifyPassword(password, user.password_salt, user.password_hash))
        return send(res, 401, { error: "Invalid credentials" });
      const passkeyMode=await effectivePasskeyMode(pool,{...user,auth_source:'local'});
      const keys=passkeyMode==='required'?await pool.query('SELECT 1 FROM passkeys WHERE user_id=$1 LIMIT 1',[user.id]):null;
      if(keys?.rowCount)return send(res,403,{error:'Use passkey sign-in for this account'});
      const token = createSessionToken();
      const revoked=await createLimitedSession(pool,{userId:user.id,token});
      meetingSignaling?.closeSessions(revoked);
      return send(res, 200, { id: user.id, name: user.display_name, email: user.email,
        role: user.role, authSource:"local",mustChangePassword:!!user.must_change_password,passkeyEnrollmentRequired:passkeyMode==='required',tenantId:user.tenant_id, features:await featuresFor(user) },
        { "Set-Cookie": sessionCookie(token, 604800) });
    }
    if (req.method==="POST" && path==="/api/login/ldap") {
      const {tenantSlug,email,password}=await readJson(req);
      let user;
      try {user=await loginWithLdap({pool,connections:ldapConnections,slug:tenantSlug,email,password});}
      catch(error) {console.error("LDAP sign-in failed",error.code||error.name);return send(res,401,{error:"Directory sign-in failed"});}
      if (!user) return send(res,401,{error:"Directory sign-in failed"});
      const token=createSessionToken();
      const revoked=await createLimitedSession(pool,{userId:user.id,token,seconds:3600});
      meetingSignaling?.closeSessions(revoked);
      return send(res,200,{id:user.id,name:user.display_name,email:user.email,role:user.role,authSource:"ldap",
        tenantId:user.tenant_id,features:await featuresFor(user)},
        {"Set-Cookie":sessionCookie(token,3600)});
    }
    if (req.method === "GET" && path === "/api/me") {
      const user = await currentUser(req);
      return user
        ? send(res, 200, { id: user.id, name: user.display_name, email: user.email,authSource:user.auth_source,
            role: user.role, tenantId:user.tenant_id,mustChangePassword:!!user.must_change_password,passkeyEnrollmentRequired:user.passkeyGate==='enroll',passkeySigninRequired:user.passkeyGate==='signin', features:user.features })
        : send(res, 401, { error: "Session expired" });
    }
    if (req.method === "POST" && path === "/api/logout") {
      const token = currentToken(req);
      if (token) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
      return send(res, 200, { status: "signed out" },
        { "Set-Cookie": sessionCookie("", 0) });
    }
    if (path === "/api/config" && req.method === "GET") {
      const viewer = await currentUser(req);
      const result = await pool.query("SELECT value FROM tenant_settings WHERE tenant_id=$1 AND setting_key='sip_wss_url'", [viewer?.tenant_id || defaultTenantId]);
      return send(res, 200, { sipWssUrl: result.rows[0]?.value || "" });
    }
    if (path === "/api/plans" && req.method === "GET") {
      const viewer = await currentUser(req);
      const result = await pool.query(
        "SELECT id,name,monthly_cents,description FROM plans WHERE tenant_id=$1 AND active=true ORDER BY monthly_cents,id", [viewer?.tenant_id || defaultTenantId]
      );
      return send(res, 200, { plans: result.rows });
    }
    if (path==="/api/activity/events" || path.startsWith("/api/language/") || path.startsWith("/api/social/") || path==="/api/navigation" || path.startsWith("/api/store/") || path==="/api/help/agent" || path.startsWith("/api/rates/flowroute/") || path.startsWith("/api/external-sms/") || path.startsWith("/api/contacts") || path.startsWith("/api/messenger/") || path.startsWith("/api/messages") ||
        path.startsWith("/api/admin/") || path==='/api/redirector' || path.startsWith('/api/workspace/shortcuts') || path.startsWith('/api/work/items') || path.startsWith('/api/campaigns/') || path.startsWith("/api/account/") || path==="/api/background" || path==="/api/catalog-policy" || path.startsWith("/api/billing/") ||
        path.startsWith("/api/numbers") || path.startsWith("/api/porting") ||
        path.startsWith("/api/inhouse/") || path.startsWith("/api/admin/inhouse/") ||
        path.startsWith("/api/nigeria/") || path.startsWith("/api/admin/nigeria/") ||
        path.startsWith("/api/meetings") || path.startsWith("/api/pbx/") || path.startsWith("/api/softphone/") || path.startsWith("/api/native-push/") ||
        path==="/api/geofence" || path==="/api/search" || path.startsWith("/api/support/") || path==="/api/locales" || path==="/api/locales/catalog" || path==="/api/admin/locales" || path==="/api/admin/google-contacts" || path.startsWith("/api/dashboard") || path==="/api/admin/dashboard" || path==="/api/wallet" || path.startsWith("/api/wallet/") ||
        path === "/api/admin/cdr" || path.startsWith('/api/marketplace/') || path.startsWith('/api/payments/') || path.startsWith('/api/sip-profiles') || path.startsWith('/api/sip-account') || path.startsWith('/api/dialplan/') || path.startsWith('/api/admin/dialplan/')) {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "Sign in required" });
      if(path.startsWith('/api/softphone/scheduled'))return await handleScheduledCalls({req,res,path,user,pool,send,readJson});
      if(path==='/api/navigation'||path.startsWith('/api/admin/navigation'))return await handleNavigationPolicy({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/contacts/registration-alerts'))return await handleContactDiscovery({req,res,path,user,pool,send,readJson});
      if(path==='/api/account/subscriber-delivery'||path==='/api/account/subscriber-registration')return await handleSubscriberSettings({req,res,path,user,pool,send,readJson,sessionHash:tokenHash(currentToken(req))});
      if(path==='/api/messenger/privacy/capabilities'&&req.method==='GET')return send(res,200,{directDisappearing:!!user.features?.messaging,directViewOnce:!!user.features?.messaging,endToEndEncryption:false,nativeBackupSync:false});
      if(/^\/api\/messenger\/messages\/[0-9a-f-]{36}\/open$/.test(path))return await handleViewOnce({req,res,path,user,pool,send});
      if(path==='/api/account/photo')return await handleProfilePhoto({req,res,user,pool,send,readJson});
      if(path==='/api/messenger/preferences')return await handleMessengerPreferences({req,res,user,pool,send,readJson});
      if(path.startsWith('/api/messenger/')||path.startsWith('/api/account/sessions'))return await handleMessengerFeatures({req,res,path,user,pool,send,readJson,url:new URL(req.url,origin),sessionHash:tokenHash(currentToken(req)),closeSessions:hashes=>meetingSignaling?.closeSessions(hashes)});
      if(path.startsWith('/api/admin/user-sessions'))return await handleSessionPolicy({req,res,path,user,pool,send,readJson,closeSessions:hashes=>meetingSignaling?.closeSessions(hashes)});
      if(path==='/api/admin/google-contacts')return await handleGoogleContactsAdmin({req,res,user,pool,send,readJson});
      if(path==='/api/redirector'&&req.method==='GET'){
        const region=new URL(req.url,origin).searchParams.get('region')||'global';
        if(!/^[a-zA-Z0-9 ._-]{1,40}$/.test(region))return send(res,400,{error:'Valid region required'});
        const target=await resolveWss(pool,user.id,region);
        return send(res,200,{target,scope:'WSS discovery for healthy switch targets; SIP calls still use the configured switch route.'});
      }
      if(!path.includes('/activity/')&&!path.startsWith('/api/me'))res.once('finish',()=>{if(['POST','PUT','PATCH','DELETE'].includes(req.method))recordApiActivity(pool,user,req.method,path,res.statusCode).catch(()=>{});});
      if(path==='/api/activity/events'||path==='/api/admin/activity/events')return await handleUserActivity({req,res,path,user,pool,send,readJson,url:new URL(req.url,origin)});
      if(path.startsWith('/api/workspace/shortcuts'))return await handleWorkspaceShortcuts({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/work/items'))return await handleWorkPlanner({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/campaigns/')||path.startsWith('/api/admin/campaigns'))return await handleCampaigns({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/admin/passkey-policy'))return await handlePasskeyPolicy({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/admin/operations'))return await handleOperationsPolicy({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/admin/wallet-providers')) return await handleWalletProviderAdmin({req,res,path,user,pool,send,readJson});
      if(path==='/api/admin/marketplace/reconciliation') return await handlePaymentReconciliation({req,res,user,pool,send});
      if(path.startsWith('/api/admin/telecom/archives')) return await handleCdrArchives({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/marketplace/')||path==='/api/admin/marketplace/gateways') return await handleStoreGateways({req,res,path,user,pool,send,readJson,origin});
      if(path.startsWith('/api/admin/marketplace/')) return await handleMarketplaceControl({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/admin/payments/')) return await handlePaymentAdmin({req,res,path,user,pool,send,readJson});
      if(path==='/api/payments/checkout'&&req.method==='POST') return await handlePaymentCheckout({req,res,user,pool,send,readJson,origin});
      if(path.startsWith('/api/admin/provider-webhooks')) return await handleProviderWebhookAdmin({req,res,path,user,pool,send,readJson,origin});
      if(path.startsWith('/api/admin/didww/')) return await handleDidwwAdmin({req,res,path,user,pool,send,readJson,origin});
      if(path.startsWith('/api/admin/cluster')) return await handleCluster({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/sip-profiles') || path.startsWith('/api/admin/sip-profile-policy'))
        return await handleSipProfiles({req,res,path,user,pool,send,readJson,url:new URL(req.url,origin)});
      if(path.startsWith('/api/admin/sip-provisioning')) return await handleSipProvisioning({req,res,path,user,pool,send});
      if(path.startsWith('/api/sip-account') || path.startsWith('/api/dialplan/') || path.startsWith('/api/admin/dialplan/'))
        return await handleSipMarketplace({req,res,path,user,pool,send,readJson});
      if(path==='/api/help/agent') return await handleHelpAgent({req,res,user,send,readJson});
      if(path.startsWith('/api/admin/rates/flowroute') || path==='/api/rates/flowroute/search')
        return await handleFlowrouteRates({req,res,path,user,pool,send});
      if(path==='/api/admin/messaging/numbers') return await handleSmsNumberAdmin({req,res,path,user,pool,send,readJson});
      if(path==='/api/external-sms/send'&&req.method==='POST'){const input=await readJson(req);try{const local=await deliverSubscriberSms({user,pool,input});if(local)return send(res,202,local);}catch(e){if(e.status)return send(res,e.status,{error:e.message});throw e;}if(!await activeSubscription(pool,user))return send(res,403,{error:'An active subscription is required for external texts',configurationUrl:'/#billing'});return await handleExternalSms({req,res,path,user,pool,send,readJson:async()=>input});}

      if(path.startsWith('/api/language/'))return await handleLanguageTools({req,res,path,user,send,readJson});
      if(path.startsWith('/api/social/')) return await handleSocial({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/account/subscriber-routing')) return await handleSubscriberRouting({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/external-sms/')) return await handleExternalSms({req,res,path,user,pool,send,readJson});
      if(path==='/api/admin/messaging/webhooks') return await handleMessagingWebhookAdmin({req,res,user,pool,send,origin});
      if(path.startsWith('/api/admin/carrier-adapters')) return await handleAdapterRegistry({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/admin/operator')) return await handleOperatorControl({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/admin/switch')) return send(res,410,{error:'Legacy switch controls retired'});
      if(path.startsWith('/api/admin/kamailio')) return await handleKamailioAdmin({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/admin/servers')) return await handleServerFleetAdmin({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/admin/carriers/credentials')) return await handleProviderCredentials({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/admin/carriers')) return await handleCarrierProviders({req,res,path,user,pool,send,readJson});
      if(path==='/api/admin/account-range'||path==='/api/admin/account-range/assign')return await handleAccountRanges({req,res,path,user,pool,send,readJson});
      if(path==='/api/admin/telecom/refills')return await handleTelecomRefills({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/admin/telecom/analytics/'))return await handleTelecomAnalytics({req,res,path,user,pool,send});
      if(path==='/api/admin/telecom/reports'||path.startsWith('/api/admin/telecom/reports/'))return await handleTelecomReports({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/admin/telecom/policies/'))return await handleTelecomPolicies({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/admin/tariff-catalog/'))return await handleTariffCatalog({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/admin/telecom/resources/'))return await handleTelecomResources({req,res,path,user,pool,send});
      if(path==='/api/admin/telecom/module-audit')return await handleModuleAudit({req,res,user,pool,send});
      if(path==='/api/admin/telecom/features')return await handleTelecomFeatures({req,res,user,send});
      if(path==='/api/admin/charging/overview') return await handleCharging({req,res,user,pool,send});
      if (path==="/api/locales" || path==="/api/locales/catalog" || path==="/api/admin/locales")
        return await handleLocales({req,res,path,user,pool,send,readJson});
      if (path==="/api/search") return await handleSearch({req,res,user,pool,send});
      if (path.startsWith("/api/support/")) return await handleSupport({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/native-push/'))return await handleNativePush({req,res,path,user,pool,send,readJson,sessionHash:tokenHash(currentToken(req))});

      if(path==='/api/softphone/identity'&&req.method==='GET'){
        const address=new URL(req.url,origin).searchParams.get('address')||'';
        const match=/^sips?:([^@\s]+)@([^@\s;>]+)$/i.exec(address);
        if(!match||address.length>255)return send(res,200,{label:'Unknown caller'});
        const result=await pool.query("SELECT u.display_name AS name,p.phone_e164 AS phone FROM sip_accounts a JOIN users u ON u.id=a.user_id AND u.tenant_id=a.tenant_id LEFT JOIN user_profiles p ON p.user_id=u.id WHERE a.tenant_id=$1 AND a.username=$2 AND a.domain=$3 AND a.status='active' AND u.status='active' LIMIT 1",[user.tenant_id,match[1],match[2]]);
        const person=result.rows[0];
        const number=/^\+?[0-9*#]+$/.test(match[1])?match[1]:'';
        return send(res,200,{label:person?(person.name?.trim()||person.phone||'Registered SIP user'):(number||'Unknown caller')});
      }
      if(path==='/api/softphone/access'||path==='/api/softphone/authorize')return await handleCallAccess({req,res,path,user,pool,send,readJson});
      if (path.startsWith("/api/softphone/"))
        return await handleSoftphoneState({req,res,path,user,pool,send,readJson});
      if (path==="/api/geofence" || path==="/api/admin/geofence")
        return await handleGeofencePolicy({req,res,path,user,pool,send,readJson});
      if (path==="/api/wallet" || path.startsWith("/api/wallet/"))
        return await handleWallet({req,res,path,user,pool,send,readJson});
      if (path.startsWith("/api/dashboard") || path==="/api/admin/dashboard")
        return await handleDashboard({req,res,path,user,pool,send,readJson});
      if (path==="/api/catalog-policy" && req.method==="GET") {
        const policy=await catalogPolicy(pool,user.tenant_id);
        return send(res,200,{planRequests:allowed(policy,user,"planRequests"),didRequests:allowed(policy,user,"didRequests")});
      }
      if (path==="/api/admin/catalog-policy")
        return await handleCatalogControl({req,res,path,user,pool,send,readJson});
      if(path.startsWith('/api/store/')||path.startsWith('/api/admin/store/')) return await handleProductStore({req,res,path,user,pool,send,readJson});
      const capability=routeCapability(path,req.method);
      if (capability && !allowed(await catalogPolicy(pool,user.tenant_id),user,capability))
        return send(res,403,{error:"This action is disabled by the tenant's super admin"});
      if (path.startsWith("/api/pbx/"))
        return await handlePbx({req,res,path,user,pool,send,readJson});
      if (path==="/api/background" || path==="/api/admin/background")
        return await handleBackground({req,res,path,user,pool,send,readJson});
      if (path==="/api/admin/ldap" || path.startsWith("/api/admin/ldap/"))
        return await handleLdapAdmin({req,res,path,user,pool,send,readJson,connections:ldapConnections,meetingSignaling});
      if (path==="/api/admin/auth-providers")
        return await handleAuthProviders({req,res,path,user,pool,send,readJson,connections:ldapConnections,meetingSignaling});
      if (path==="/api/account/password" || path.startsWith("/api/admin/security/") ||
          /^\/api\/admin\/users\/[0-9a-f-]{36}\/security$/i.test(path) ||
          /^\/api\/admin\/groups\/[0-9a-f-]{36}\/delete$/i.test(path))
        return await handleAccess({req,res,path,user,pool,send,readJson,
          sessionHash:tokenHash(currentToken(req)),meetingSignaling});
      if (path === "/api/admin/reports" || path === "/api/admin/reports.csv")
        return await handleReports({req,res,user,pool,send});
      if (path==="/api/admin/pricing" || path.startsWith("/api/admin/pricing/"))
        return await handlePricing({req,res,path,user,pool,send,readJson});
      if (path === "/api/admin/cdr" && req.method === "GET")
        return await handleCdrAdmin({req,res,user,pool,send});
      if (path.startsWith("/api/inhouse/") || path.startsWith("/api/admin/inhouse/"))
        return await handleInhouseDids({req,res,path,user,pool,send,readJson});
      if (path.startsWith("/api/nigeria/") || path.startsWith("/api/admin/nigeria/"))
        return await handleNigeria({req,res,path,user,pool,send,readJson});
      if (path.startsWith("/api/admin/tenants") || path === "/api/admin/tenant-users")
        return await handleTenants({req,res,path,user,pool,readJson,send,meetingSignaling,sessionHash:tokenHash(currentToken(req))});
      if (path.startsWith("/api/admin/mobile/"))
        return await handleMobileAdmin({ req,res,path,user,pool,send,readJson });
      if (path.startsWith("/api/meetings") && !user.features.meetings)
        return send(res, 403, { error: "Meetings unavailable for your groups" });
      if (path.startsWith("/api/messages") || path.startsWith("/api/contacts"))
        if (!user.features.messaging) return send(res, 403, { error: "Messaging unavailable for your groups" });
      if ((path.startsWith("/api/billing/") || path.startsWith("/api/numbers") ||
           path.startsWith("/api/porting")) && !user.features.billing)
        return send(res, 403, { error: "Billing unavailable for your groups" });
      if (path === "/api/meetings/config" && req.method === "GET")
        return send(res, 200, { iceServers: [...meetingIceServers,...(turnSecret?[turnIceServer({secret:turnSecret,host:turnHost,userId:user.id})]:[])], maxParticipants: 4,
          features:user.features });
      if (path === "/api/meetings" && req.method === "POST") {
        const { title } = await readJson(req);
        if (typeof title !== "string" || !title.trim() || title.length > 100)
          return send(res, 400, { error: "Meeting title required (max 100 characters)" });
        const id = randomUUID();
        await pool.query("INSERT INTO meeting_rooms(id,host_id,tenant_id,title) VALUES($1,$2,$3,$4)",
          [id,user.id,user.tenant_id,title.trim()]);
        return send(res, 201, { id,title:title.trim(),hostId:user.id });
      }
      if (path === "/api/meetings" && req.method === "GET") {
        const result = await pool.query(
          "SELECT id,title,locked,created_at FROM meeting_rooms WHERE host_id=$1 AND ended_at IS NULL ORDER BY created_at DESC LIMIT 50",
          [user.id]
        );
        return send(res, 200, { meetings: result.rows });
      }
      const meetingMatch = /^\/api\/meetings\/([0-9a-f-]{36})(?:\/(lock|end))?$/i.exec(path);
      if (meetingMatch && uuidPattern.test(meetingMatch[1])) {
        const id = meetingMatch[1];
        const result = await pool.query(
          "SELECT id,title,host_id,locked,ended_at FROM meeting_rooms WHERE id=$1 AND tenant_id=$2", [id,user.tenant_id]
        );
        const room = result.rows[0];
        if (!room || room.ended_at) return send(res, 404, { error: "Meeting unavailable" });
        if (req.method === "GET" && !meetingMatch[2])
          return send(res, 200, { id, title:room.title, hostId:room.host_id, locked:room.locked });
        if (req.method === "POST" && room.host_id === user.id && meetingMatch[2] === "lock") {
          const { locked } = await readJson(req);
          if (typeof locked !== "boolean") return send(res, 400, { error: "Boolean locked required" });
          await pool.query("UPDATE meeting_rooms SET locked=$1 WHERE id=$2", [locked,id]);
          return send(res, 200, { locked });
        }
        if (req.method === "POST" && room.host_id === user.id && meetingMatch[2] === "end") {
          await pool.query("UPDATE meeting_rooms SET ended_at=now() WHERE id=$1", [id]);
          meetingSignaling.closeRoom(id);
          return send(res, 200, { status: "ended" });
        }
        return send(res, 403, { error: "Host permission required" });
      }
      if(path==='/api/contacts/card')return await handleContactCards({req,res,user,pool,send,readJson});
      if(path==='/api/account/contact-settings'||path==='/api/contacts/search'||path==='/api/contacts/address-book'||path==='/api/contacts/google/config')return await handleContactSettings({req,res,path,user,pool,send,readJson,url:new URL(req.url,origin)});
      if (path === "/api/contacts" && req.method === "GET") {
        const result = await pool.query(
          "SELECT u.id, u.display_name AS name, u.email, COALESCE(cp.archived,0) AS archived, COALESCE(cp.muted,0) AS muted,COALESCE(cp.pinned,0) AS pinned, (COALESCE(cp.unread,0) OR EXISTS(SELECT 1 FROM messages unread WHERE unread.sender_id=u.id AND unread.recipient_id=c.owner_id AND unread.read_at IS NULL AND unread.deleted_at IS NULL AND (unread.expires_at IS NULL OR unread.expires_at>UTC_TIMESTAMP(3)))) AS unread, CASE WHEN a.status='active' THEN CONCAT('sip:',a.username,'@',a.domain) ELSE NULL END AS sip_address FROM contacts c JOIN users u ON u.id=c.contact_id LEFT JOIN sip_accounts a ON a.user_id=u.id AND a.tenant_id=u.tenant_id LEFT JOIN conversation_preferences cp ON cp.owner_id=c.owner_id AND cp.contact_id=c.contact_id WHERE c.owner_id=$1 AND u.tenant_id=$2 ORDER BY COALESCE(cp.pinned,0) DESC,u.display_name LIMIT 1000",
          [user.id,user.tenant_id]
        );
        return send(res, 200, { contacts: result.rows });
      }
      if (path === "/api/contacts" && req.method === "POST") {
        const { email } = await readJson(req);
        if (typeof email !== "string" || email.length > 254)
          return send(res, 400, { error: "Valid contact email required" });
        const found = await pool.query("SELECT id FROM users WHERE email=$1 AND tenant_id=$2", [email.trim().toLowerCase(),user.tenant_id]);
        const contact = found.rows[0];
        if (!contact || contact.id === user.id)
          return send(res, 404, { error: "Contact not found" });
        await pool.query(
          "INSERT IGNORE INTO contacts(owner_id, contact_id) VALUES ($1,$2)",
          [user.id, contact.id]
        );
        return send(res, 201, { id: contact.id });
      }
      if (path === "/api/contacts/import" && req.method === "POST") {
        const { emails } = await readJson(req, 64000);
        if (!Array.isArray(emails) || emails.length < 1 || emails.length > 500 ||
            emails.some(email => typeof email !== "string" || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())))
          return send(res, 400, { error: "Provide 1 to 500 valid contact emails" });
        const normalized=[...new Set(emails.map(email=>email.trim().toLowerCase()))];
        const placeholders=normalized.map((_,index)=>`$${index+2}`).join(",");
        const found=await pool.query(`SELECT id,email FROM users WHERE tenant_id=$1 AND email IN (${placeholders}) AND status='active'`,
          [user.tenant_id,...normalized]);
        const mapped=new Map(found.rows.map(row=>[row.email.toLowerCase(),row.id]));
        const missing=normalized.filter(email=>!mapped.has(email) || mapped.get(email)===user.id);
        if (missing.length) return send(res, 422, { error: "All contacts must be active users in your tenant (excluding yourself)", missing });
        const db=await pool.connect();
        try {
          await db.query("BEGIN");
          for (const email of normalized)
            await db.query("INSERT IGNORE INTO contacts(owner_id,contact_id) VALUES($1,$2)",[user.id,mapped.get(email)]);
          await db.query("COMMIT");
        } catch(error) { await db.query("ROLLBACK"); throw error; } finally {db.release();}
        return send(res, 200, {processed:normalized.length,duplicates:emails.length-normalized.length});
      }
      if(path.startsWith('/api/messages'))return await handleConversations({req,res,path,user,pool,send,readJson,url:new URL(req.url,origin)});
      if (path === "/api/billing/invoices" && req.method === "GET") {
        const result = await pool.query(
          "SELECT id,description,amount_cents,currency,status,created_at FROM invoices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
          [user.id]
        );
        return send(res, 200, { invoices: result.rows });
      }
      if (path === "/api/billing/subscription" && req.method === "GET") {
        const result = await pool.query(
          "SELECT s.plan_id,s.status,p.name,p.monthly_cents FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1",
          [user.id]
        );
        return send(res, 200, { subscription: result.rows[0] || null });
      }
      if (path === "/api/billing/select-plan" && req.method === "POST") {
        const { planId } = await readJson(req);
        if (typeof planId !== "string" || !uuidPattern.test(planId))
          return send(res, 400, { error: "Valid plan required" });
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const existing = await client.query("SELECT status FROM subscriptions WHERE user_id=$1 FOR UPDATE", [user.id]);
          if (existing.rows[0]?.status === "active") {
            await client.query("ROLLBACK");
            return send(res, 409, { error: "Active plan changes require administrator review" });
          }
          const plan = await client.query("SELECT name,monthly_cents FROM plans WHERE id=$1 AND tenant_id=$2 AND active=true", [planId,user.tenant_id]);
          if (!plan.rowCount) {
            await client.query("ROLLBACK");
            return send(res, 404, { error: "Plan unavailable" });
          }
          await client.query(
            "UPDATE invoices SET status='void' WHERE user_id=$1 AND status='unpaid' AND description LIKE '% monthly plan'",
            [user.id]
          );
          await client.query(
            "INSERT INTO subscriptions(user_id,plan_id) VALUES($1,$2) ON DUPLICATE KEY UPDATE plan_id=$3,status='pending_payment'",
            [user.id, planId, planId]
          );
          const invoiceId = randomUUID();
          await client.query(
            "INSERT INTO invoices(id,user_id,description,amount_cents) VALUES($1,$2,$3,$4)",
            [invoiceId,user.id,plan.rows[0].name + " monthly plan",plan.rows[0].monthly_cents]
          );
          await client.query("COMMIT");
          return send(res, 201, { status: "pending_payment", invoiceId });
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally { client.release(); }
      }
      if (path === "/api/numbers" && req.method === "GET") {
        const provider = new URL(req.url, origin).searchParams.get("provider");
        if (!["flowroute","didww"].includes(provider))
          return send(res, 400, { error: "Select Flowroute or DIDWW" });
        if(!await carrierActive(pool,user.tenant_id,provider)) return send(res,409,{error:'Carrier provider awaits administrator activation'});
        let search;
        try {const params=new URL(req.url,origin).searchParams;search=inventorySearch({prefix:params.get("prefix"),offset:params.get("offset")});}
        catch(error) {return send(res,400,{error:error.message});}
        const rule=await pricingRule(pool,user.tenant_id,provider);
        try {
          const numbers = await availableNumbers(provider,{...search,pool,tenant:user.tenant_id});
          return send(res, 200, { search, nextOffset:provider==="flowroute" && numbers.length===20 && search.offset<10000 ? search.offset+20 : null, currency:"USD", pricing:{mode:rule.mode,setupValue:Number(rule.setupValue),monthlyValue:Number(rule.monthlyValue)},
            numbers: numbers.map(({ monthlyCostCents,setupCostCents,...item }) => ({
              ...item, monthlyCents: sellingCents(monthlyCostCents,rule.mode,Number(rule.monthlyValue)),
              setupCents: sellingCents(setupCostCents,rule.mode,Number(rule.setupValue)),
              initialCents:sellingCents(setupCostCents,rule.mode,Number(rule.setupValue))+sellingCents(monthlyCostCents,rule.mode,Number(rule.monthlyValue))
            }))
          });
        } catch (error) {
          return send(res, 503, { error: error.message });
        }
      }
      if (path === "/api/numbers/request" && req.method === "POST") {
        const {provider,number,inventoryId,skuId,expectedSetupCents,expectedMonthlyCents,acceptTerms}=await readJson(req);
        if (!["flowroute","didww"].includes(provider) || typeof number!=="string" ||
            !/^\+?[1-9]\d{7,14}$/.test(number) || typeof inventoryId!=="string" || inventoryId.length>128 ||
            typeof skuId!=="undefined" && (typeof skuId!=="string" || skuId.length>128))
          return send(res,400,{error:"Choose a valid inventory number"});
        if(!await carrierActive(pool,user.tenant_id,provider)) return send(res,409,{error:'Carrier provider awaits administrator activation'});
        if (acceptTerms!==true || ![expectedSetupCents,expectedMonthlyCents].every(value=>Number.isSafeInteger(value)&&value>=0&&value<=10000000))
          return send(res,400,{error:"Accept fulfillment terms and confirm the displayed setup and monthly prices"});
        let inventory;
        try {inventory=(await availableNumbers(provider,{pool,tenant:user.tenant_id,prefix:number.replace(/^\+/,""),inventoryId})).find(item=>item.number===number && item.inventoryId===inventoryId && (item.skuId||null)===(skuId||null));}
        catch(error) {return send(res,503,{error:error.message});}
        if (!inventory) return send(res,409,{error:"Number is no longer in the current provider listing"});
        const rule=await pricingRule(pool,user.tenant_id,provider);
        const setup=sellingCents(inventory.setupCostCents,rule.mode,Number(rule.setupValue));
        const monthly=sellingCents(inventory.monthlyCostCents,rule.mode,Number(rule.monthlyValue));
        if (setup!==expectedSetupCents || monthly!==expectedMonthlyCents)
          return send(res,409,{error:"Provider price changed. Search again and confirm the updated price"});
        const quoteId=randomUUID(),invoiceId=randomUUID(),client=await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[user.id]);
          const existing=await client.query("SELECT id FROM did_quotes WHERE user_id=$1 AND provider=$2 AND number_e164=$3 AND status IN ('pending_payment','fulfilled')",[user.id,provider,number]);
          if (existing.rowCount) {await client.query("ROLLBACK");return send(res,409,{error:"You already have an open request for this provider number"});}
          await client.query("INSERT INTO invoices(id,user_id,description,amount_cents) VALUES($1,$2,$3,$4)",
            [invoiceId,user.id,`Provider DID request ${provider} ${number}: setup and first month`,setup+monthly]);
          await client.query("INSERT INTO did_quotes(id,user_id,provider,number_e164,provider_monthly_cents,provider_setup_cents,monthly_cents,setup_cents,markup_bps,status,invoice_id,inventory_id,sku_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending_payment',$10,$11,$12)",
            [quoteId,user.id,provider,number,inventory.monthlyCostCents,inventory.setupCostCents,monthly,setup,rule.mode==="percent"?Number(rule.setupValue):0,invoiceId,inventoryId,skuId||null]);
          await client.query("COMMIT");
          return send(res,201,{quoteId,invoiceId,status:"pending_payment",setupCents:setup,monthlyCents:monthly,initialCents:setup+monthly,provisioned:false});
        } catch(error) {await client.query("ROLLBACK");throw error;} finally {client.release();}
      }
      if (path === "/api/numbers/requests" && req.method === "GET") {
        const result=await pool.query("SELECT q.id,q.provider,q.number_e164,q.setup_cents,q.monthly_cents,q.status,i.status AS invoice_status FROM did_quotes q LEFT JOIN invoices i ON i.id=q.invoice_id JOIN users u ON u.id=q.user_id WHERE q.user_id=$1 AND u.tenant_id=$2 ORDER BY q.created_at DESC LIMIT 100",[user.id,user.tenant_id]);
        return send(res,200,{requests:result.rows});
      }
      if (path === "/api/admin/numbers/requests" && req.method === "GET") {
        if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
        const result=await pool.query("SELECT q.id,q.provider,q.number_e164,q.setup_cents,q.monthly_cents,q.provider_setup_cents,q.provider_monthly_cents,q.inventory_id,q.sku_id,q.status,i.status AS invoice_status,u.email FROM did_quotes q JOIN users u ON u.id=q.user_id LEFT JOIN invoices i ON i.id=q.invoice_id WHERE u.tenant_id=$1 ORDER BY q.created_at DESC LIMIT 200",[user.tenant_id]);
        return send(res,200,{requests:result.rows});
      }
      if (path === "/api/porting" && req.method === "GET") {
        const result = await pool.query(
          "SELECT id,number_e164,provider,status,created_at FROM port_requests WHERE user_id=$1 ORDER BY created_at DESC",
          [user.id]
        );
        return send(res, 200, { requests: result.rows });
      }
      if (path === "/api/porting" && req.method === "POST") {
        const { number, provider } = await readJson(req);
        if (typeof number !== "string" || !/^\+[1-9]\d{7,14}$/.test(number) ||
            !["flowroute","didww"].includes(provider))
          return send(res, 400, { error: "Enter E.164 number and provider" });
        const id = randomUUID();
        await pool.query(
          "INSERT INTO port_requests(id,user_id,number_e164,provider) VALUES($1,$2,$3,$4)",
          [id,user.id,number,provider]
        );
        return send(res, 201, { id,status:"draft" });
      }
      if(path.startsWith('/api/admin/platform-control')) return handleSuperAdminControl({req,res,path,user,pool,send,readJson});
      if(path==='/api/admin/calling-plan') return handleCallingPlan({req,res,path,user,pool,send,readJson});
      if (path === "/api/admin/plans" && req.method === "GET") {
        if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
        const result=await pool.query("SELECT id,name,description,monthly_cents,active FROM plans WHERE tenant_id=$1 ORDER BY name LIMIT 200",[user.tenant_id]);
        return send(res,200,{plans:result.rows});
      }
      const planMatch=/^\/api\/admin\/plans\/([0-9a-f-]{36})$/.exec(path);
      if (planMatch && req.method === "PUT") {
        if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
        const {name,description,monthlyCents,active}=await readJson(req);
        if (typeof name!=="string" || !name.trim() || name.length>100 || typeof description!=="string" || description.length>1000 ||
            !Number.isSafeInteger(monthlyCents) || monthlyCents<0 || monthlyCents>10000000 || typeof active!=="boolean")
          return send(res,400,{error:"Valid plan details required"});
        const result=await pool.query("UPDATE plans SET name=$1,description=$2,monthly_cents=$3,active=$4 WHERE id=$5 AND tenant_id=$6",
          [name.trim(),description,monthlyCents,active,planMatch[1],user.tenant_id]);
        if (!result.rowCount) return send(res,404,{error:"Plan unavailable"});
        await pool.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'plan_updated')",[randomUUID(),user.tenant_id,user.id,planMatch[1]]);
        return send(res,200,{id:planMatch[1],active});
      }
      if (path === "/api/admin/plans" && req.method === "POST") {
        if (!isAdmin(user)) return send(res, 403, { error: "Administrator required" });
        const { name, description = "", monthlyCents } = await readJson(req);
        if (typeof name !== "string" || !name.trim() || name.length > 100 ||
            typeof description !== "string" || description.length > 1000 ||
            !Number.isSafeInteger(monthlyCents) || monthlyCents < 0 || monthlyCents > 10000000)
          return send(res, 400, { error: "Valid plan name and monthly cents required" });
        const id = randomUUID();
        await pool.query(
          "INSERT INTO plans(id,tenant_id,name,description,monthly_cents) VALUES($1,$2,$3,$4,$5)",
          [id,user.tenant_id,name.trim(),description,monthlyCents]
        );
        return send(res, 201, { id });
      }
      if (path === "/api/admin/markup" && req.method === "POST") {
        if (!isAdmin(user)) return send(res, 403, { error: "Administrator required" });
        const { percent } = await readJson(req);
        if (!Number.isInteger(percent) || percent < 0 || percent > 1000)
          return send(res, 400, { error: "Markup must be a whole percent from 0 to 1000" });
        await pool.query(
          "INSERT INTO tenant_settings(tenant_id,setting_key,value) VALUES($1,'did_markup_bps',$2) ON DUPLICATE KEY UPDATE value=$3",
          [user.tenant_id,String(percent * 100),String(percent * 100)]
        );
        return send(res, 200, { percent });
      }
      if (path === "/api/admin/overview" && req.method === "GET") {
        if (!isAdmin(user)) return send(res, 403, { error: "Administrator required" });
        const result = await pool.query(
          "SELECT (SELECT COUNT(*) FROM users WHERE tenant_id=$1) AS users, (SELECT COUNT(*) FROM messages m JOIN users u ON u.id=m.sender_id WHERE u.tenant_id=$2) AS messages, (SELECT COUNT(*) FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.tenant_id=$3 AND s.expires_at>UTC_TIMESTAMP(3)) AS active_sessions", [user.tenant_id,user.tenant_id,user.tenant_id]
        );
        return send(res, 200, result.rows[0]);
      }
      if (path === "/api/admin/groups" && req.method === "GET") {
        if (!isAdmin(user)) return send(res, 403, { error: "Administrator required" });
        const result = await pool.query(
          "SELECT g.id,g.name,g.features,(SELECT COUNT(*) FROM user_group_members m WHERE m.group_id=g.id) AS members FROM user_groups g WHERE g.tenant_id=$1 ORDER BY g.name LIMIT 200", [user.tenant_id]
        );
        return send(res, 200, { groups:result.rows });
      }
      if (path === "/api/admin/groups" && req.method === "POST") {
        if (!isAdmin(user)) return send(res, 403, { error: "Administrator required" });
        const { name, features } = await readJson(req);
        if (typeof name !== "string" || name.trim().length < 2 || name.length > 80)
          return send(res, 400, { error: "Group name must be 2–80 characters" });
        let safe;
        try { safe = validateFeatures(features); }
        catch { return send(res, 400, { error: "Invalid group features" }); }
        try {
          const id = randomUUID();
          await pool.query(
            "INSERT INTO user_groups(id,tenant_id,name,features) VALUES($1,$2,$3,$4)",
            [id,user.tenant_id,name.trim(),JSON.stringify(safe)]
          );
          await pool.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'group_created')",
            [randomUUID(),user.tenant_id,user.id,id]);
          return send(res, 201, { id,name:name.trim(),features:safe });
        } catch (error) {
          if (error.code === "ER_DUP_ENTRY") return send(res, 409, { error: "Group already exists" });
          throw error;
        }
      }
      const groupMatch = /^\/api\/admin\/groups\/([0-9a-f-]{36})$/.exec(path);
      if (groupMatch && req.method === "PUT") {
        if (!isAdmin(user)) return send(res, 403, { error: "Administrator required" });
        if (!uuidPattern.test(groupMatch[1])) return send(res, 400, { error: "Invalid group" });
        const { name,features } = await readJson(req);
        if (name!==undefined && (typeof name!=="string" || name.trim().length<2 || name.length>80))
          return send(res,400,{error:"Group name must be 2–80 characters"});
        let safe;
        try { safe = validateFeatures(features); }
        catch { return send(res, 400, { error: "Invalid group features" }); }
        const before=await pool.query("SELECT name FROM user_groups WHERE id=$1 AND tenant_id=$2",[groupMatch[1],user.tenant_id]);
        if (!before.rowCount) return send(res,404,{error:"Group unavailable"});
        const nextName=name===undefined?before.rows[0].name:name.trim();
        if (before.rows[0].name==="Standard" && nextName!=="Standard")
          return send(res,409,{error:"Standard group name is protected"});
        try {
          await pool.query("UPDATE user_groups SET name=$1,features=$2 WHERE id=$3 AND tenant_id=$4",
            [nextName,JSON.stringify(safe),groupMatch[1],user.tenant_id]);
        } catch(error) {
          if (error.code==="ER_DUP_ENTRY") return send(res,409,{error:"Group name exists"});
          throw error;
        }
        const updated = await pool.query(
          "SELECT id,name,features FROM user_groups WHERE id=$1 AND tenant_id=$2", [groupMatch[1],user.tenant_id]
        );
        if (updated.rowCount) {
          await pool.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'group_features_updated')",
            [randomUUID(),user.tenant_id,user.id,groupMatch[1]]);
          const members = await pool.query(
            "SELECT u.id,u.role,u.tenant_id FROM user_group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=$1",
            [groupMatch[1]]
          );
          for (const member of members.rows)
            meetingSignaling.recheckUser(member.id, await featuresFor(member));
        }
        return updated.rowCount ? send(res, 200, updated.rows[0])
          : send(res, 404, { error: "Group unavailable" });
      }
      if (path === "/api/admin/users" && req.method === "GET") {
        if (!isAdmin(user)) return send(res, 403, { error: "Administrator required" });
        const result = await pool.query(
          "SELECT id,display_name AS name,email,role,status,auth_source FROM users WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200", [user.tenant_id]
        );
        const membership = await pool.query("SELECT m.user_id,m.group_id FROM user_group_members m JOIN users u ON u.id=m.user_id JOIN user_groups g ON g.id=m.group_id WHERE u.tenant_id=$1 AND g.tenant_id=$2", [user.tenant_id,user.tenant_id]);
        return send(res, 200, { users:result.rows.map((row) => ({
          ...row, group_ids:membership.rows.filter((item) => item.user_id === row.id)
            .map((item) => item.group_id)
        })) });
      }
      const memberMatch = /^\/api\/admin\/users\/([0-9a-f-]{36})\/groups$/.exec(path);
      if (memberMatch && req.method === "PUT") {
        if (!isAdmin(user)) return send(res, 403, { error: "Administrator required" });
        const { groupIds } = await readJson(req);
        if (!Array.isArray(groupIds) || groupIds.length > 20 ||
            groupIds.some((id) => typeof id !== "string" || !uuidPattern.test(id)))
          return send(res, 400, { error: "Valid group IDs required" });
        const ids = [...new Set(groupIds)];
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const target = await client.query("SELECT id,role,tenant_id,auth_source FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [memberMatch[1],user.tenant_id]);
          if (!target.rowCount) {
            await client.query("ROLLBACK");
            return send(res, 404, { error: "User unavailable" });
          }
          if (target.rows[0].auth_source==="ldap") {
            await client.query("ROLLBACK");
            return send(res,409,{error:"LDAP groups are synchronized from directory mappings"});
          }
          const found = ids.length
            ? await client.query(`SELECT id FROM user_groups WHERE tenant_id=$1 AND id IN (${ids.map((_, i) => "$" + (i + 2)).join(",")})`, [user.tenant_id,...ids])
            : { rowCount:0 };
          if (found.rowCount !== ids.length) {
            await client.query("ROLLBACK");
            return send(res, 400, { error: "Unknown group" });
          }
          await client.query("DELETE FROM user_group_members WHERE user_id=$1", [memberMatch[1]]);
          for (const id of ids)
            await client.query("INSERT INTO user_group_members(user_id,group_id) VALUES($1,$2)", [memberMatch[1],id]);
          await client.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'group_membership_updated')",
            [randomUUID(),user.tenant_id,user.id,memberMatch[1]]);
          await client.query("COMMIT");
          meetingSignaling.recheckUser(memberMatch[1],
            await featuresFor(target.rows[0]));
          return send(res, 200, { groupIds:ids });
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally { client.release(); }
      }
      if (path === "/api/admin/config" && req.method === "POST") {
        if (!isAdmin(user)) return send(res, 403, { error: "Administrator required" });
        const { sipWssUrl } = await readJson(req);
        if (typeof sipWssUrl !== "string" || sipWssUrl.length > 500 ||
            (sipWssUrl !== "" && (!sipWssUrl.startsWith("wss://") || !URL.canParse(sipWssUrl))))
          return send(res, 400, { error: "A wss:// URL is required" });
        await pool.query(
          "INSERT INTO tenant_settings(tenant_id,setting_key,value) VALUES($1,'sip_wss_url',$2) ON DUPLICATE KEY UPDATE value=$3",
          [user.tenant_id,sipWssUrl,sipWssUrl]
        );
        return send(res, 200, { sipWssUrl });
      }
    }
    return send(res, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof SyntaxError || error.message?.startsWith("Content-Type") ||
        error.message === "Request too large" || error.message === "Invalid JSON object" ||
        error.message?.startsWith("Name must") ||
        error.message?.startsWith("Enter a valid") ||
        error.message?.startsWith("Password must") ||
        error.message?.startsWith("Phone must") || error.message?.startsWith("Enter a complete") ||
        error.message?.startsWith("Valid platform") || error.message?.startsWith("Valid version"))
      return send(res, 400, { error: error.message });
    console.error("API request failed", error.code || error.name);
    return send(res, 500, { error: "Internal server error" });
  }
}

await migrate(pool);
await migratePstnBilling(pool);
await migrateSuperAdminControl(pool);
const kamailioHttpBridge=startKamailioHttpBridge(pool);
const stopTelecomReports=startTelecomReports(pool);
const stopCdrArchives=startCdrArchives(pool);
const stopPaymentReconciliation=startPaymentReconciliation(pool);
const stopSipProvisioning=startSipProvisioning(pool,origin);
const stopMessageExpiry=startMessageExpiry(pool);
const stopSubscriberEmail=startSubscriberEmail(pool);
const stopSubscriberDelivery=startSubscriberDelivery(pool);
const stopNativePush=startNativePush(pool);
const stopRateSync=startFlowrouteRateSync(pool);
const stopStoreRenewals=startStoreRenewals(pool);
const address = process.env.LISTEN_ADDR || "127.0.0.1";
const port = Number(process.env.PORT || 8080);
const server = http.createServer(handler);
server.on("close",stopSubscriberEmail);
server.on("close",stopTelecomReports);
server.on("close",stopCdrArchives);
server.on("close",stopPaymentReconciliation);
server.on("close",stopSipProvisioning);
server.on("close",()=>kamailioHttpBridge?.close());
server.on("close",stopNativePush);
server.on("close",stopSubscriberDelivery);
server.on("close",stopRateSync);
server.on("close",stopStoreRenewals);
meetingSignaling = attachMeetingSignaling(server, { pool, origin, currentUser });
server.listen(port, address, () =>
  console.log(`Account API listening on ${address}:${port}`));
