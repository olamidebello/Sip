#!/usr/bin/env python3
"""Validate and install in-dialog video SDP relay support without replacing routing."""
import argparse,re,shutil,subprocess,time
from pathlib import Path

def build_candidate(original):
    marker='# OLAMIDE_VIDEO_REINVITE_V1'
    if marker in original:raise ValueError('Video routing patch already installed')
    anchor='if (is_method("BYE")) rtpengine_delete();'
    if original.count(anchor)!=1:raise ValueError('Unexpected dialog routing; active configuration unchanged')
    replacement='''# OLAMIDE_VIDEO_REINVITE_V1
        if (is_method("INVITE")) {
            if (is_present_hf("Contact") && !add_contact_alias()) {
                sl_send_reply("400","Invalid video contact"); exit;
            }
            if (has_body("application/sdp") && !rtpengine_offer()) {
                sl_send_reply("488","Video media unavailable"); exit;
            }
            t_on_reply("MEDIA_REPLY");
        }
        if (is_method("BYE")) rtpengine_delete();'''
    return original.replace(anchor,replacement,1)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    source=Path('/etc/kamailio/kamailio.cfg');original=source.read_text()
    candidate=build_candidate(original)
    staged=source.with_name('kamailio.cfg.video-candidate');staged.write_text(candidate);staged.chmod(0o600)
    try:
        result=subprocess.run(['kamailio','-c','-f',str(staged)],capture_output=True,text=True)
        if result.returncode:
            output=re.sub(r'Bearer [A-Za-z0-9._~+/=-]+','Bearer [REDACTED]',result.stdout+result.stderr)
            print(output);raise SystemExit('Validation failed; active configuration unchanged')
        if not args.apply:
            print('Video routing candidate validated; active configuration unchanged.');return
        backup=source.with_name('kamailio.cfg.before-video-'+time.strftime('%Y%m%d-%H%M%S'));shutil.copy2(source,backup)
        try:
            source.write_text(candidate)
            subprocess.run(['systemctl','restart','kamailio'],check=True)
            subprocess.run(['systemctl','is-active','--quiet','kamailio'],check=True)
        except Exception:
            shutil.copy2(backup,source);subprocess.run(['systemctl','restart','kamailio']);raise SystemExit('Restart failed; original restored and recovery restart attempted')
        print('Video SDP routing installed; Kamailio active. Backup:',backup)
    finally:staged.unlink(missing_ok=True)

if __name__=='__main__':main()
