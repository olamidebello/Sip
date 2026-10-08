#!/usr/bin/env bash
# Debian 12 source build of the upstream FreeSWITCH release. Run only through
# the switch_node role; the role applies credentials, TLS and XML integration.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
version="${1:?FreeSWITCH release tag required}"
[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 2
marker="/usr/local/freeswitch/.olamide-source-${version}"
[[ -e "$marker" ]] && exit 0
if dpkg-query -W -f='${Status}' freeswitch 2>/dev/null | grep -q 'install ok installed'; then
  echo 'Refusing to mix a source build with an installed FreeSWITCH Debian package' >&2
  exit 1
fi
apt-get update
apt-get install -y --no-install-recommends git build-essential cmake automake autoconf libtool-bin pkg-config   ca-certificates curl bison nasm libssl-dev zlib1g-dev libdb-dev unixodbc-dev libncurses-dev   libexpat1-dev libgdbm-dev libtpl-dev libtiff-dev uuid-dev libpcre2-dev libedit-dev   libsqlite3-dev libcurl4-openssl-dev libogg-dev libspeex-dev libspeexdsp-dev   libopus-dev libsndfile1-dev libflac-dev libvorbis-dev libldns-dev
install -d -m 0755 /usr/local/src/olamide-freeswitch
cd /usr/local/src/olamide-freeswitch
clone() {
  local url="$1" dir="$2" ref="${3:-}"
  if [[ ! -d "$dir/.git" ]]; then git clone "$url" "$dir"; fi
  if [[ -n "$ref" ]]; then
    git -C "$dir" fetch --tags origin "$ref"
    git -C "$dir" checkout --detach "$ref"
  fi
}
clone https://github.com/signalwire/libks.git libks
clone https://github.com/freeswitch/sofia-sip.git sofia-sip
clone https://github.com/freeswitch/spandsp.git spandsp
clone https://github.com/signalwire/signalwire-c.git signalwire-c
clone https://github.com/signalwire/freeswitch.git freeswitch "$version"
(cd libks && cmake . -DCMAKE_INSTALL_PREFIX=/usr && make -j "$(nproc)" && make install)
(cd sofia-sip && ./bootstrap.sh && ./configure --with-pic --with-glib=no --without-doxygen --disable-stun --prefix=/usr && make -j "$(nproc)" && make install)
(cd spandsp && ./bootstrap.sh && ./configure --with-pic --prefix=/usr && make -j "$(nproc)" && make install)
(cd signalwire-c && cmake . -DCMAKE_INSTALL_PREFIX=/usr && make -j "$(nproc)" && make install)
ldconfig
cd freeswitch
sed -i 's|^#xml_int/mod_xml_curl$|xml_int/mod_xml_curl|' build/modules.conf.in
./bootstrap.sh -j
./configure
make -j "$(nproc)"
make install
id freeswitch >/dev/null 2>&1 || useradd --system --home /usr/local/freeswitch --shell /usr/sbin/nologin freeswitch
if [[ ! -e /etc/freeswitch ]]; then
  ln -s /usr/local/freeswitch/conf /etc/freeswitch
elif [[ ! -L /etc/freeswitch ]]; then
  echo '/etc/freeswitch already exists and is not the source-build configuration symlink' >&2
  exit 1
fi
ln -sfn /usr/local/freeswitch/bin/fs_cli /usr/local/bin/fs_cli
chown -R freeswitch:freeswitch /usr/local/freeswitch
cat >/etc/systemd/system/freeswitch.service <<'UNIT'
[Unit]
Description=FreeSWITCH source build
After=network-online.target
Wants=network-online.target
[Service]
Type=forking
User=freeswitch
Group=freeswitch
ExecStart=/usr/local/freeswitch/bin/freeswitch -ncwait -nonat
ExecStop=/usr/local/freeswitch/bin/freeswitch -stop
PIDFile=/usr/local/freeswitch/run/freeswitch.pid
Restart=on-failure
TimeoutStartSec=90
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
touch "$marker"
