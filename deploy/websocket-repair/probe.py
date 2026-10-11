#!/usr/bin/env python3
import base64, hashlib, os, socket, ssl, sys
from urllib.parse import urlsplit

def probe(url, origin, host_header):
    u = urlsplit(url)
    if u.scheme not in ('ws', 'wss') or not u.hostname or u.username or u.fragment:
        raise ValueError('Invalid WebSocket URL')
    key = base64.b64encode(os.urandom(16)).decode()
    port = u.port or (443 if u.scheme == 'wss' else 80)
    with socket.create_connection((u.hostname, port), timeout=10) as raw:
        connection = ssl.create_default_context().wrap_socket(raw, server_hostname=u.hostname) if u.scheme == 'wss' else raw
        with connection:
            path = (u.path or '/') + ('?' + u.query if u.query else '')
            connection.sendall((f'GET {path} HTTP/1.1\r\nHost: {host_header}\r\nOrigin: {origin}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Protocol: sip\r\n\r\n').encode())
            response = b''
            while b'\r\n\r\n' not in response:
                chunk = connection.recv(4096)
                if not chunk or len(response) > 65536:
                    raise RuntimeError('Incomplete or oversized handshake')
                response += chunk
            lines = response.split(b'\r\n\r\n')[0].decode('latin1').split('\r\n')
            headers = dict((k.lower().strip(), v.strip()) for k, v in (line.split(':', 1) for line in lines[1:] if ':' in line))
            expected = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
            if lines[0].split()[1] != '101' or headers.get('sec-websocket-accept') != expected or headers.get('sec-websocket-protocol') != 'sip' or headers.get('upgrade', '').lower() != 'websocket' or 'upgrade' not in headers.get('connection', '').lower():
                raise RuntimeError('SIP WebSocket upgrade rejected: ' + lines[0])
    print('PASS: verified SIP WebSocket upgrade (not SIP registration)')

if __name__ == '__main__':
    try:
        probe(*sys.argv[1:])
    except Exception as exc:
        print('FAIL:', exc, file=sys.stderr)
        sys.exit(1)
