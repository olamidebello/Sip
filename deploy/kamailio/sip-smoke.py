#!/usr/bin/env python3
"""Loopback-only SIP smoke check. Never enables systemd or a public SIP socket."""
import os
import signal
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from jinja2 import Environment, StrictUndefined

ROOT = Path(__file__).resolve().parent
template = (ROOT / "adapter.cfg.j2").read_text()
config = Environment(undefined=StrictUndefined).from_string(template).render(
    kamailio_domain="sip.example.invalid",
    kamailio_api_url="http://127.0.0.1:18080",
    kamailio_route_token="staging-syntax-only-000000000000000000000000",
)
with tempfile.TemporaryDirectory(prefix="olamide-sip-smoke-") as work:
    path = Path(work) / "adapter.cfg"
    path.write_text(config)
    os.chmod(path, 0o600)
    subprocess.run(["kamailio", "-c", "-f", str(path)], check=True,
                   stdout=subprocess.DEVNULL)
    proc = subprocess.Popen(["kamailio", "-D", "-E", "-f", str(path)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                            start_new_session=True)
    try:
        def sip_request(method, sequence):
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as client:
                client.settimeout(1)
                client.bind(("127.0.0.1", 0))
                port = client.getsockname()[1]
                message = (
                    f"{method} sip:sip.example.invalid SIP/2.0\r\n"
                    f"Via: SIP/2.0/UDP 127.0.0.1:{port};branch=z9hG4bKsmoke{sequence}\r\n"
                    "Max-Forwards: 10\r\n"
                    "From: <sip:probe@sip.example.invalid>;tag=smoke\r\n"
                    "To: <sip:probe@sip.example.invalid>\r\n"
                    f"Call-ID: smoke{sequence}@localhost\r\n"
                    f"CSeq: {sequence} {method}\r\n"
                    f"Contact: <sip:probe@127.0.0.1:{port}>\r\n"
                    "Content-Length: 0\r\n\r\n"
                )
                client.sendto(message.encode(), ("127.0.0.1", 5062))
                return client.recvfrom(4096)[0].split(b"\r\n", 1)[0]
        for attempt in range(25):
            if proc.poll() is not None:
                raise RuntimeError(f"Kamailio exited before listening: {proc.stderr.read().decode(errors='replace')[-1500:]}")
            try:
                result = sip_request("OPTIONS", 1)
                break
            except socket.timeout:
                time.sleep(0.2)
        else:
            raise RuntimeError("Kamailio did not answer OPTIONS on loopback")
        if b" 200 " not in result:
            raise RuntimeError(f"OPTIONS expected 200, got {result!r}")
        result = sip_request("REGISTER", 2)
        if b" 401 " not in result:
            raise RuntimeError(f"Unauthenticated REGISTER expected 401, got {result!r}")
        result = sip_request("INVITE", 3)
        if b" 407 " not in result:
            raise RuntimeError(f"Unauthenticated INVITE expected 407, got {result!r}")
        print("Loopback SIP: OPTIONS 200; unauthenticated REGISTER 401; INVITE 407")
    finally:
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
