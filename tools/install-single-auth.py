from pathlib import Path
import sys,re
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo')
changes=[]
def replace(s,a,b):
 if s.count(a)!=1:raise SystemExit('Unknown single-auth integration anchor; no source changed: '+a[:100])
 return s.replace(a,b)
def main(s):
 if '// SINGLE_AUTH_MAIN_V1' in s:return s
 s="import {setupSingleAuth} from './singleAuth.js';\n// SINGLE_AUTH_MAIN_V1\n"+s
 old='''        <button id="signin-user" type="button">User sign in</button><button id="signin-admin" type="button">Administrator sign in</button><button id="signin-super" type="button">Super administrator sign in</button>
        <a href="/pages/ldap-login">Directory sign in</a><a href="/pages/signup">Create an account</a>'''
 s=replace(s,old,'''        <a href="/pages/login">Sign in</a><a href="/pages/signup">Create account</a>''')
 s=replace(s,'<nav class="auth-pages" aria-label="Account pages"><a href="/pages/login">Sign in</a><a href="/pages/signup">Register</a><a href="/pages/ldap-login">Directory sign in</a></nav>','<nav class="auth-pages" aria-label="Account pages"><a href="/pages/login">Sign in</a><a href="/pages/signup">Create account</a></nav>')
 start='for(const [id,label] of [["signin-user","user"],["signin-admin","administrator"],["signin-super","super administrator"]]) {'
 end="$('#menu-account').onclick"
 if s.count(start)!=1 or s.count(end)!=1:raise SystemExit('Unknown role-menu handler; no source changed')
 a=s.index(start);b=s.index(end,a)
 s=s[:a]+s[b:]
 s=replace(s,'setupFormGroups();','setupFormGroups();\nsetupSingleAuth(document);')
 s=s.replace('Registration creates an active account and SIP identity immediately. Calling needs an activated switch account; no number or plan is assigned at signup.','Create one account for calling and messaging. Phone verification follows the administrator’s policy. Your assigned role determines the tools you can access.')
 s=s.replace('Your account is created immediately. Email verification is not required.','Complete the required verification steps after creating your account. No number or paid plan is purchased at signup.')
 return s
def routes(s):
 if '// SINGLE_AUTH_ROUTES_V1' in s:return s
 s="import {canonicalAuthPage,isAuthCompanion} from './singleAuth.js';\n// SINGLE_AUTH_ROUTES_V1\n"+s
 s=replace(s,'    const id = pageId(location.pathname);',"    const requestedId=pageId(location.pathname);\n    const id=canonicalAuthPage(requestedId);\n    if(['login','signup'].includes(id)&&location.pathname!==pagePath(id))history.replaceState(null,'',pagePath(id));")
 s=replace(s,'      if (sibling !== form) sibling.classList.add(\'page-route-hidden\');',"      if (sibling !== form&&!isAuthCompanion(id,sibling)) sibling.classList.add('page-route-hidden');")
 return replace(s,"      if (!group.contains(form)) group.classList.add('page-route-hidden');", "      if (!group.contains(form)&&!(id==='login'&&group.id==='account-directory-group')&&!group.querySelector('[data-auth-companion=\"'+id+'\"]')) group.classList.add('page-route-hidden');")
def onboarding(s):
 if '// SINGLE_AUTH_SIGNUP_ROLE_V1' in s:return s
 marker='INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,status) VALUES($1,$2,$3,$4,$5,$6,'
 if s.count(marker)!=1:raise SystemExit('Unknown public signup identity insert; no source changed')
 a=s.index(marker);end=s.index('"',a);sql=s[a:end]
 if not sql.endswith("'active')") and not sql.endswith('$7)'):raise SystemExit('Unknown public signup status binding; no source changed')
 new=sql.replace('password_hash,status)','password_hash,status,role)')[:-1]+",'user')"
 return '// SINGLE_AUTH_SIGNUP_ROLE_V1\n'+s[:a]+new+s[end:]
def otp_ui(s):
 if '// SINGLE_AUTH_OTP_COMPANIONS_V1' in s:return s
 s=replace(s,"signup.after(verify);let signupToken='';","verify.dataset.authCompanion='signup';signup.after(verify);let signupToken='';")
 s=replace(s,"verify.after(resume);","resume.querySelector('form').dataset.authCompanion='signup';verify.after(resume);")
 return '// SINGLE_AUTH_OTP_COMPANIONS_V1\n'+s
for file,fn in [('apps/web/src/main.js',main),('apps/web/src/pageRoutes.js',routes),('services/api/onboarding.js',onboarding),('apps/web/src/twilioAccountAuthUi.js',otp_ui)]:
 p=root/file;changes.append((p,fn(p.read_text())))
for p,s in changes:p.write_text(s)
print('Single sign-in/create-account navigation and explicit public user-role assignment integrated. Existing authentication methods retained.')
