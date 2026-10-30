import test from 'node:test';import assert from 'node:assert/strict';import {safeAlertText} from './systemAlerts.js';
test('alert text masks bearer tokens, payment secrets and verification codes',()=>{assert.equal(safeAlertText('Bearer secret-token SMOOTH-'+'A'.repeat(20)+' sk_live_secret'),'[redacted] [redacted] [redacted]');assert.equal(safeAlertText('x'.repeat(1000)).length,600);});
