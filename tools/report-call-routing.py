"""Read newest private call routing log, printing fixed checks only."""
from pathlib import Path
import importlib.util
import re
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('summary',root/'tools/report-feature-tests.py');summary=importlib.util.module_from_spec(spec);spec.loader.exec_module(summary)
logs=list(Path('/opt/olamide/backups').glob('call-routing-*/deploy.log'))
if not logs:raise SystemExit('SIP_CALL_ROUTE_CHECK log=missing')
log=max(logs,key=lambda p:p.stat().st_mtime);text=log.read_text(errors='replace')
for fixed,label in {
 'Profile phone number requires caller-ID authorization by super administrator':'caller_id_authorization_required',
 'No authorized outbound DID assigned to this user':'assigned_did_required',
 'Unknown authentication gate':'authentication_gate_layout',
 'failed to solve':'image_build_failed',
 'Set your profile country':'profile_country_required',
 'Active subscription required for PSTN':'subscription_required',
 'USD wallet required':'wallet_required',
 'Activate Flowroute first':'carrier_inactive',
 'Active carrier rate required for destination':'destination_rate_required',
 'Insufficient credit for one minute':'insufficient_credit',
 'Billing unavailable':'billing_unavailable',
 'Kamailio paid route requires IP authentication':'old_ip_only_guard',
 'Cannot find module':'module_missing',
 'Unknown column':'schema_mismatch',
 'health verified':'health_verified',
 }.items():
 if fixed in text:print('SIP_CALL_ROUTE_CHECK failure='+label)
for line in summary.summarize(text,root):print(line)
