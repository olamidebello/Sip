#!/usr/bin/env python3
"""Report fixed structural checks only; never print private Kamailio configuration."""
import pathlib,re,sys
from prepare_flowroute_outbound import patch,bounds
CHECKS={
 'Required route missing':'missing_route','Unbalanced route':'unbalanced_route',
 'Duplicate patch':'duplicate_patch','Commission paid billing and carrier routing first':'paid_marker_missing',
 'UAC module missing':'uac_missing','Existing UAC authentication requires reconciliation':'existing_uac_auth',
 'Unrecognized carrier authorization gate':'carrier_gate_layout','Unrecognized destination routing':'destination_layout',
 'Existing paid failure handling requires reconciliation':'existing_failure_route',
 'Unrecognized paid relay':'relay_layout','Unknown caller identity placement':'caller_identity_layout',
 'Unknown existing caller identity handling':'existing_caller_identity'}
def diagnose(text):
 result=[]
 try:patch(text);result.append('SIP_OUTBOUND_CHECK patch=recognized')
 except ValueError as error:result.append('SIP_OUTBOUND_CHECK blocker='+CHECKS.get(str(error),'unknown_layout'))
 for name,pattern in {
 'paid_marker':r'OLAMIDE_PAID_ROUTE_V1','carrier_marker':r'OLAMIDE_CARRIER_ADAPTER_V1',
 'uac_module':r'loadmodule\s+"(?:.*/)?uac.so"',
 'uac_auth_parameters':r'modparam\(\s*"uac"\s*,\s*"auth_',
 }.items():result.append('SIP_OUTBOUND_CHECK '+name+'='+str(bool(re.search(pattern,text))).lower())
 for name in ['OLAMIDE_FLOWROUTE','OLAMIDE_PAID_CALL']:
  try:
   a,b=bounds(text,name);route=text[a:b]
   for label,pattern in {
    'failure_handler':r't_on_failure\s*\(',
    'auth_function':r'uac_auth\s*\(',
    'authorized_gate':r'olamide_pstn_authorized',
    'caller_identity':r'P-Asserted-Identity',
    'credential_avps':r'\$avp\([^)]*(?:pass|auth)[^)]*\)',
   }.items():result.append('SIP_OUTBOUND_CHECK '+name.lower()+'_'+label+'='+str(bool(re.search(pattern,route))).lower())
  except ValueError:result.append('SIP_OUTBOUND_CHECK '+name.lower()+'=missing')
 return result
if __name__=='__main__':
 try:print('\n'.join(diagnose(pathlib.Path(sys.argv[1]).read_text())))
 except Exception:raise SystemExit('SIP_OUTBOUND_CHECK diagnostic=failed')
