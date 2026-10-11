import {parseCsv} from './contactsCsv.js';
export function addressBookFromFile(text,filename){
  if(text.length>256000)throw Error('Contact file exceeds 256 KB');
  let contacts;
  if(/\.vc(?:f|ard)$/i.test(filename)){
    const unfolded=text.replace(/\r?\n[ \t]/g,'');
    const decode=s=>s.replace(/\\n/gi,' ').replace(/\\([,;\\])/g,'$1');
    contacts=unfolded.split(/BEGIN:VCARD/i).slice(1).map(card=>{
      const value=name=>{const line=card.split(/\r?\n/).find(l=>new RegExp('^'+name+'(?:;[^:]*)?:','i').test(l));return line?decode(line.slice(line.indexOf(':')+1)).trim():'';};
      return {name:value('FN')||value('N').split(';').filter(Boolean).reverse().join(' '),email:value('EMAIL').toLowerCase(),phone:value('TEL').replace(/^tel:/i,'')};
    });
  }else{
    const rows=parseCsv(text.replace(/^\uFEFF/,'')),headers=rows.shift()?.map(h=>h.trim().toLowerCase())||[];
    const index=names=>headers.findIndex(h=>names.includes(h));
    const email=index(['email','email address','e-mail address','e-mail 1 - value']),phone=index(['phone','phone number','mobile phone','phone 1 - value']);
    const name=index(['name','full name','display name']),first=index(['first name','given name']),last=index(['last name','family name']);
    if(email<0&&phone<0)throw Error('CSV needs an email or phone column');
    contacts=rows.map(r=>({name:(r[name]||[r[first],r[last]].filter(Boolean).join(' ')).trim(),email:(r[email]||'').trim().toLowerCase(),phone:(r[phone]||'').trim()}));
  }
  if(!contacts.length||contacts.length>500)throw Error('Choose 1–500 contacts');
  if(contacts.some(c=>c.name.length>160||c.email.length>254||c.phone.length>64||(!c.email&&!c.phone)||(c.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email))))throw Error('Contact has invalid email, missing phone/email, or an oversized field');
  return contacts;
}
