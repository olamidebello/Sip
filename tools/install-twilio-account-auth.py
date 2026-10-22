from pathlib import Path
import sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo')
changes=[]
def replace(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unknown account authentication integration anchor; no files changed: '+a[:100])
 return s.replace(a,b)
def server(s):
 if '// TWILIO_ACCOUNT_AUTH_V1' in s:return s
 s="import {migrateTwilioAccountAuth,handleAccountAuth,loginAccountGate} from './twilioAccountAuth.js';\n// TWILIO_ACCOUNT_AUTH_V1\n"+s
 s=replace(s,'await migratePstnBilling(pool);','await migratePstnBilling(pool);\nawait migrateTwilioAccountAuth(pool);')
 anchor='    if (req.method === "POST" && path === "/api/login") {'
 s=replace(s,anchor,"    if(path.startsWith('/api/account-auth/')||path==='/api/account/auth-pin'||path==='/api/admin/twilio/account-auth')return await handleAccountAuth({req,res,path,pool,user:path.startsWith('/api/account-auth/')?null:await currentUser(req),send,readJson,origin});\n"+anchor)
 s=replace(s,'const { email, password } = await readJson(req);','const { email, password, pin, authChallenge, authCode } = await readJson(req);')
 anchor="      if(keys?.rowCount)return send(res,403,{error:'Use passkey sign-in for this account'});"
 return replace(s,anchor,anchor+"\n      try{const challenge=await loginAccountGate(pool,user,{pin,authChallenge,authCode});if(challenge)return send(res,202,challenge);}catch(error){return send(res,401,{error:error.message});}")
def onboarding(s):
 if '// TWILIO_SIGNUP_AUTH_V1' in s:return s
 s="import {accountAuthPolicy,signupPin,startAccountChallenge,validPin} from './twilioAccountAuth.js';\n// TWILIO_SIGNUP_AUTH_V1\n"+s
 s=replace(s,'    const data=validateRegistration(input);',"    const data=validateRegistration(input);\n    const authPolicy=await accountAuthPolicy(pool,defaultTenantId);\n    if(authPolicy.requirePin&&(authPolicy.signup||authPolicy.login)&&!validPin(input.pin))return send(res,400,{error:'Choose a nontrivial account PIN of 6 to 8 digits'});\n    if(authPolicy.signup&&!authPolicy.allowedPrefixes.some(p=>data.phone.startsWith(p)))return send(res,400,{error:'Phone is outside allowed account verification destinations'});")
 s=replace(s,"VALUES($1,$2,$3,$4,$5,$6,'active')\",\n        [id,defaultTenantId,data.name,data.email,salt,hash]);","VALUES($1,$2,$3,$4,$5,$6,$7)\",\n        [id,defaultTenantId,data.name,data.email,salt,hash,authPolicy.signup?'pending_email':'active']);\n      await signupPin(db,id,defaultTenantId,input.pin,authPolicy.requirePin&&(authPolicy.signup||authPolicy.login));")
 s=replace(s,'      await createSipAccount(db,id,new URL(origin).hostname);',"      if(!authPolicy.signup)await createSipAccount(db,id,new URL(origin).hostname);")
 anchor="    return send(res,201,{email:data.email,status:'active',verificationRequired:false,sipProvisioning:'pending',callingScope:'internal_only'});"
 return replace(s,anchor,"    if(authPolicy.signup){try{return send(res,202,{email:data.email,...await startAccountChallenge(pool,{id,tenant_id:defaultTenantId},'signup')});}catch{return send(res,202,{email:data.email,verificationRequired:true,deliveryUncertain:true,message:'Account pending phone verification. Use Resume phone verification after the cooldown; no automatic resend was made.'});}}\n"+anchor)
def ui(s):
 if '// TWILIO_ACCOUNT_AUTH_UI_V1' in s:return s
 s="import {setupAccountAuthUi} from './twilioAccountAuthUi.js';\n"+s
 anchor='const signupCaptcha=setupSignupCaptcha({document,get:apiGet});'
 s=replace(s,anchor,"// TWILIO_ACCOUNT_AUTH_UI_V1\nconst accountAuthUi=setupAccountAuthUi({document,get:apiGet,request:accountRequest,getUserId:()=>softphoneUserId,isSuper:()=>activeRole==='super_admin'});\n"+anchor)
 s=replace(s,"await accountRequest('/api/register',data);created=true;","const registered=await accountRequest('/api/register',data);created=true;if(registered.verificationRequired){accountAuthUi.receiveSignup(registered);return;}")
 anchor='    const user = await accountRequest("/api/login", Object.fromEntries(new FormData(form)));'
 return replace(s,anchor,anchor+'\n    if(user.verificationRequired){accountAuthUi.receiveLogin(user);return;}')
for file,fn in [('services/api/server.js',server),('services/api/onboarding.js',onboarding),('apps/web/src/main.js',ui)]:
 p=root/file;changes.append((p,fn(p.read_text())))
for p,s in changes:p.write_text(s)
print('Twilio account signup/login OTP and PIN gates integrated; existing passkey and directory authentication preserved.')
