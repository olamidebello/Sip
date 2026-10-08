import test from 'node:test';
import assert from 'node:assert/strict';
import {validConfig,validDevice} from './fleetNetwork.js';
import {validCidr,validFirewall} from './fleetFirewall.js';
import {validRedirector} from './operationsPolicy.js';

const config={hostname:'edge-1',vlans:[{id:100,name:'voice'}],interfaces:[{name:'eth0',vlan:100,enabled:true}],routes:[]};
test('structured device configuration rejects commands and malformed inventory',()=>{
  assert.equal(validConfig(config),true);
  assert.equal(validConfig({...config,shell:'rm -rf /'}),false);
  assert.equal(validConfig({...config,vlans:[{id:4095,name:'bad'}]}),false);
  const device={name:'edge-1',kind:'router',host:'192.0.2.10',port:22,site:'Chicago',enabled:true,config};
  assert.equal(validDevice(device),true);
  assert.equal(validDevice({...device,host:'127.0.0.1'}),false);
});
test('firewall policy bounds SSH and carrier CIDRs',()=>{
  assert.equal(validCidr('198.51.100.0/24'),true);
  assert.equal(validCidr('0.0.0.0/0'),false);
  assert.equal(validFirewall({enabled:true,sshCidrs:['198.51.100.0/24'],carrierCidrs:[]}),true);
  assert.equal(validFirewall({enabled:true,sshCidrs:[],carrierCidrs:[]}),false);
});
test('redirector target requires a credential-free WSS URL and linked switch',()=>{
  const b={name:'edge-1',region:'global',nodeId:'00000000-0000-4000-8000-000000000001',wssUrl:'wss://sip.example.com/',weight:10,enabled:true};
  assert.equal(validRedirector(b),true);
  assert.equal(validRedirector({...b,wssUrl:'https://sip.example.com/'}),false);
  assert.equal(validRedirector({...b,wssUrl:'wss://user:pass@sip.example.com/'}),false);
});
