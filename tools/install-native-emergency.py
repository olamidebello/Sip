from pathlib import Path
root=Path('/opt/olamide/repo')
p=root/'apps/web/src/main.js'
s=p.read_text()
call='setupNativeEmergency({document,form:dialForm,input:dialForm.elements.target});'
if call not in s:
    anchor='dialForm.noValidate=true;'
    if s.count(anchor)!=1:raise RuntimeError('Unexpected dial form integration; no files written')
    s="import {setupNativeEmergency} from './nativeEmergency.js';\n"+s.replace(anchor,anchor+'\n'+call)
    p.write_text(s)
