// Integration helper for modern SIP.js UserAgent; import into the app explicitly.
// Obtain profile from your authenticated, tenant-authorized backend over HTTPS.
// Do not put passwords in this file, build-time environment, logs or localStorage.
export function sipClientOptions(UserAgent, profile) {
  const server = String(profile.websocketUrl ?? '').trim();
  let url;
  try { url = new URL(server); } catch { throw new Error('SIP WebSocket URL is missing or invalid'); }
  if (url.protocol !== 'wss:' || !url.hostname || url.username || url.password || url.hash) {
    throw new Error('SIP WebSocket URL must be a secure wss:// address');
  }
  const uri = UserAgent.makeURI(String(profile.sipAddress ?? '').trim());
  if (!uri) throw new Error('SIP address is invalid');
  if (!profile.authorizationUsername || !profile.password) {
    throw new Error('SIP credentials have not been provisioned');
  }
  return {
    uri,
    authorizationUsername: profile.authorizationUsername,
    authorizationPassword: profile.password,
    transportOptions: { server: url.href },
    logConfiguration: false
  };
}
// const ua = new UserAgent(sipClientOptions(UserAgent, profile));
// await ua.start();
// const registerer = new Registerer(ua);
// await registerer.register();
// Show Registered only when RegistererState.Registered is observed.
