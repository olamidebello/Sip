#!/bin/bash
set -euo pipefail
umask 077
stage=${1:?reviewed helper directory required}
prefix=/opt/olamide/asterisk-22.11.0
config=/etc/olamide/voicemail
state=/var/lib/olamide/voicemail
if systemctl is-active --quiet asterisk || systemctl is-active --quiet freeswitch; then
  echo 'An existing PBX is active; refusing to replace it.' >&2; exit 1
fi
if ! test -x "$prefix/sbin/asterisk"; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -y --no-install-recommends ca-certificates curl bzip2 patch build-essential pkg-config libedit-dev libjansson-dev libsqlite3-dev libssl-dev libxml2-dev uuid-dev libncurses-dev libcurl4-openssl-dev libnewt-dev libspeex-dev libspeexdsp-dev libsrtp2-dev acl
  install -d -m 0700 /opt/olamide/voicemail-build
  cd /opt/olamide/voicemail-build
  curl --fail --location --proto '=https' --tlsv1.2 --retry 3 https://downloads.asterisk.org/pub/telephony/asterisk/releases/asterisk-22.11.0.tar.gz -o asterisk-22.11.0.tar.gz
  echo '3bd5ee040509a3d3cd9b1ba9520c18e6ec0a7e7981ca68c457dcd36ba3c54d94  asterisk-22.11.0.tar.gz' | sha256sum --check --status
  tar -xzf asterisk-22.11.0.tar.gz
  cd asterisk-22.11.0
  ./configure --prefix="$prefix" --libdir="$prefix/lib" --sysconfdir="$config" --with-pjproject-bundled --with-jansson-bundled
  make menuselect.makeopts
  menuselect/menuselect --disable BUILD_NATIVE --enable app_voicemail --enable CORE-SOUNDS-EN-WAV --disable CORE-SOUNDS-EN-GSM menuselect.makeopts
  make -j2
  make install
fi
test -f "$prefix/lib/asterisk/modules/app_voicemail.so"
test -f "$prefix/lib/asterisk/modules/chan_pjsip.so"
test -f "$prefix/var/lib/asterisk/sounds/en/vm-login.wav" || test -f "$prefix/var/lib/asterisk/sounds/vm-login.wav"
id olamidevm >/dev/null 2>&1 || useradd --system --home-dir "$state" --shell /usr/sbin/nologin olamidevm
install -d -o root -g olamidevm -m 0750 "$config"
install -d -o root -g olamidevm -m 0750 "$state"
install -d -o olamidevm -g olamidevm -m 0700 "$state/spool" "$state/db" /var/log/olamide-voicemail
command -v setfacl >/dev/null || apt-get install -y --no-install-recommends acl
setfacl -m u:olamidevm:--x /etc/olamide /opt/olamide /var/lib/olamide
install -d -m 0755 /usr/local/lib/olamide-voicemail
install -m 0755 "$stage/voicemail-sync.py" /usr/local/lib/olamide-voicemail/sync.py
python3 - "$prefix" "$config" "$state" <<'PY'
from pathlib import Path
import grp,os,socket,sys
prefix,config,state=sys.argv[1:];root=Path(config)
# Source address matches the existing Kamailio public UDP socket. Recorder itself binds only loopback.
import re
cfg=Path('/etc/kamailio/kamailio.cfg').read_text()
ips=re.findall(r'^listen=udp:([0-9.]+):5060\s*$',cfg,re.M)
if len(set(ips))!=1:raise SystemExit('Expected one Kamailio IPv4 UDP listener on port 5060')
socket.inet_aton(ips[0])
files={
'asterisk.conf':f'''[directories]
astetcdir => {config}
astmoddir => {prefix}/lib/asterisk/modules
astvarlibdir => {state}/db
astdbdir => {state}/db
astdatadir => {prefix}/var/lib/asterisk
astspooldir => {state}/spool
astrundir => /run/olamide-voicemail
astlogdir => /var/log/olamide-voicemail
[options]
maxcalls = 100
languageprefix = yes
systemname = olamide-voicemail
''',
'pjsip.conf':f'''[global]
type=global
endpoint_identifier_order=ip
[loopback]
type=transport
protocol=udp
bind=127.0.0.1:5062
[kamailio]
type=endpoint
transport=loopback
context=olamide-voicemail
disallow=all
allow=ulaw,alaw
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=no
dtmf_mode=rfc4733
media_address=127.0.0.1
bind_rtp_to_media_address=yes
allow_transfer=no
allow_subscribe=no
[kamailio-source]
type=identify
endpoint=kamailio
match=127.0.0.1/32,{ips[0]}/32
''',
'rtp.conf':'[general]\nrtpstart=24000\nrtpend=24999\nstrictrtp=yes\nicesupport=no\n',
'http.conf':'[general]\nenabled=no\n',
'manager.conf':'[general]\nenabled=no\n',
'logger.conf':'[general]\n[logfiles]\nconsole => warning,error,notice\n',
'modules.conf':'''[modules]
autoload=yes
noload=chan_iax2.so
noload=chan_sip.so
noload=chan_mgcp.so
noload=chan_skinny.so
noload=chan_unistim.so
noload=chan_ooh323.so
noload=chan_console.so
noload=chan_alsa.so
noload=chan_oss.so
noload=chan_dahdi.so
noload=res_pjsip_transport_websocket.so
noload=res_hep.so
noload=res_snmp.so
''',
'voicemail.conf':'[general]\nformat=wav\n',
'extensions.conf':'[general]\nstatic=yes\nwriteprotect=yes\n[olamide-voicemail]\nexten => s,1,Hangup(21)\n'}
for name,body in files.items():
    p=root/name
    if name in ('voicemail.conf','extensions.conf') and p.exists():continue
    tmp=p.with_suffix('.new');tmp.write_text(body);tmp.chmod(0o640);os.chown(tmp,0,grp.getgrnam('olamidevm').gr_gid);tmp.replace(p)
PY
cat > /etc/systemd/system/olamide-voicemail.service <<'UNIT'
[Unit]
Description=Olamide private voicemail recorder
After=network.target
[Service]
Type=simple
User=olamidevm
Group=olamidevm
RuntimeDirectory=olamide-voicemail
RuntimeDirectoryMode=0750
ExecStart=/opt/olamide/asterisk-22.11.0/sbin/asterisk -f -C /etc/olamide/voicemail/asterisk.conf
ExecReload=/opt/olamide/asterisk-22.11.0/sbin/asterisk -C /etc/olamide/voicemail/asterisk.conf -rx "core reload"
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/olamide/voicemail/spool /var/lib/olamide/voicemail/db /var/log/olamide-voicemail /run/olamide-voicemail
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/olamide-voicemail-sync.service <<'UNIT'
[Unit]
Description=Synchronize Olamide voicemail mailboxes
After=docker.service olamide-voicemail.service
Requires=olamide-voicemail.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /usr/local/lib/olamide-voicemail/sync.py
TimeoutStartSec=120
UMask=0077
UNIT
cat > /etc/systemd/system/olamide-voicemail-sync.timer <<'UNIT'
[Unit]
Description=Synchronize voicemail settings every 30 seconds
[Timer]
OnBootSec=60
OnUnitInactiveSec=30
AccuracySec=2
Unit=olamide-voicemail-sync.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now olamide-voicemail.service
for attempt in $(seq 1 20); do
  if "$prefix/sbin/asterisk" -C "$config/asterisk.conf" -rx 'module show like app_voicemail.so' 2>/dev/null | grep -q '1 modules loaded'; then exit 0; fi
  sleep 1
done
echo 'Voicemail recorder did not become ready; Kamailio has not been changed.' >&2
exit 1
