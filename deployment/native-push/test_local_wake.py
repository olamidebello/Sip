import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('local_wake',Path(__file__).with_name('install-local-wake.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

SOURCE='''#!KAMAILIO
# OLAMIDE_CONTACT_FIX_V1
loadmodule "htable.so"
request_route {
    if (is_method("REGISTER")) {
        if (!save("location")) sl_send_reply("500","Registration failed");
        exit;
    }
    $var(realm)=$fd;
    # Caller authentication and API authorization happen here.
    $ru="sip:" + $var(target) + "@" + $var(realm);
    if (!lookup("location")) { sl_send_reply("404","Extension offline"); exit; }
    if (has_body("application/sdp") && !rtpengine_offer()) {
        sl_send_reply("488","Media unavailable"); exit;
    }
    record_route();
    t_on_reply("MEDIA_REPLY");
    if (!t_relay()) { rtpengine_delete(); sl_reply_error(); }
}
'''

class LocalWakeTests(unittest.TestCase):
    def test_rejects_secret_injection_and_unknown_layout(self):
        for token in ('short','a'*32+'"; injected();'):
            with self.assertRaises(ValueError):module.build_candidate(SOURCE,token)
        with self.assertRaises(ValueError):module.build_candidate(SOURCE.replace('save("location")','save("other")'),'a'*64)

    def test_wait_is_after_authorization_and_media_setup(self):
        candidate=module.build_candidate(SOURCE,'a'*64)
        self.assertLess(candidate.index('# Caller authentication'),candidate.index('route(OLAMIDE_PUSH_WAIT);'))
        self.assertLess(candidate.index('rtpengine_offer()'),candidate.index('route(OLAMIDE_PUSH_WAIT);'))
        self.assertLess(candidate.index('record_route();'),candidate.index('route(OLAMIDE_PUSH_WAIT);'))

    def test_registration_failure_cannot_resume_call(self):
        candidate=module.build_candidate(SOURCE,'a'*64)
        self.assertIn('if (!save("location")) { sl_send_reply("500","Registration failed"); exit; }\n        route(OLAMIDE_PUSH_REGISTER);',candidate)

    def test_second_install_refuses_to_duplicate_routes(self):
        candidate=module.build_candidate(SOURCE,'a'*64)
        with self.assertRaises(ValueError):module.build_candidate(candidate,'a'*64)

    def test_resume_preserves_cancel_guard_and_registered_destination_lookup(self):
        candidate=module.build_candidate(SOURCE,'a'*64)
        resume=candidate.split('route[OLAMIDE_PUSH_RESUME] {',1)[1]
        self.assertLess(resume.index('t_is_canceled()'),resume.index('lookup("location")'))
        self.assertLess(resume.index('lookup("location")'),resume.index('t_relay()'))
        self.assertIn('t_set_fr(45000,45000)',candidate)

if __name__=='__main__':unittest.main()
