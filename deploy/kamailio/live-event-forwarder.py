#!/usr/bin/env python3
"""Forward newline-delimited switch events to the signed live-call API.

Input is supplied by a trusted local collector. This process does not read SIP
packets or infer billing records. Restart it with a supervisor when it exits.
"""
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

EVENTS = {'ringing', 'answered', 'heartbeat', 'ended'}


def forward(line, endpoint, tenant, source, secret):
    value = json.loads(line)
    if not isinstance(value, dict) or value.get('event') not in EVENTS:
        raise ValueError('Invalid event')
    # The collector provides normalized direction and E.164 numbers. Never
    # include SIP credentials or raw headers in this feed.
    body = json.dumps({
        'tenantId': tenant, 'eventId': value.get('eventId') or str(uuid.uuid4()),
        'source': source, 'legId': value['legId'], 'event': value['event'],
        'direction': value['direction'], 'from': value['from'], 'to': value['to'],
        'occurredAt': value['occurredAt'],
    }, separators=(',', ':')).encode()
    stamp = str(int(time.time()))
    signature = hmac.new(secret.encode(), stamp.encode() + b'.' + body, hashlib.sha256).hexdigest()
    request = urllib.request.Request(endpoint, data=body, method='POST', headers={
        'Content-Type': 'application/json', 'X-CDR-Timestamp': stamp,
        'X-CDR-Signature': signature,
    })
    with urllib.request.urlopen(request, timeout=5) as response:
        if response.status not in (200, 202):
            raise RuntimeError('Event rejected')


def main():
    endpoint = os.environ['LIVE_CALL_EVENT_URL']
    tenant = os.environ['LIVE_CALL_TENANT_ID']
    source = os.environ['LIVE_CALL_SOURCE']
    secret = os.environ['LIVE_CALL_SIGNING_KEY']
    if not endpoint.startswith('http://127.0.0.1:') and not endpoint.startswith('https://'):
        raise ValueError('Use loopback HTTP or HTTPS event endpoint')
    if len(secret) < 32:
        raise ValueError('Signing key must have at least 32 characters')
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            forward(line, endpoint, tenant, source, secret)
        except (ValueError, KeyError, urllib.error.URLError, RuntimeError) as error:
            print(f'Live event delivery failed: {type(error).__name__}', file=sys.stderr, flush=True)
            # Fail closed: a supervisor must replay durable events. A raw
            # stdin pipe cannot safely guarantee delivery after API outages.
            return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
