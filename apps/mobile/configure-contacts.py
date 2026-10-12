#!/usr/bin/env python3
"""Add the iOS contact-access purpose after generating the native project."""
import pathlib,plistlib
p=pathlib.Path(__file__).resolve().parent/'ios/App/App/Info.plist'
if p.exists():
    with p.open('rb') as f: data=plistlib.load(f)
    data['NSContactsUsageDescription']='Import contacts you allow into your private Olamide address book. Automatic import can be turned off in contact settings.'
    with p.open('wb') as f: plistlib.dump(data,f,sort_keys=False)
