function parseCsv(source) {
  const rows=[];let row=[],field="",quoted=false;
  for (let i=0;i<source.length;i++) {
    const c=source[i];
    if (c==='"') {
      if (quoted && source[i+1]==='"') {field+='"';i++;}
      else if (!quoted && field.length) throw new Error("Invalid CSV quote");
      else quoted=!quoted;
    } else if (c==="," && !quoted) {row.push(field);field="";}
    else if ((c==="\n" || c==="\r") && !quoted) {
      if(c==="\r" && source[i+1]==="\n") i++;
      row.push(field);if(row.some(value=>value.trim())) rows.push(row);
      row=[];field="";
    } else field+=c;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  row.push(field);if(row.some(value=>value.trim())) rows.push(row);
  return rows;
}
export function contactEmailsFromCsv(source) {
  if (source.length>64000) throw new Error("CSV file exceeds 64 KB");
  const rows=parseCsv(source.replace(/^\uFEFF/,""));
  const header=rows.shift()?.map(value=>value.trim().toLowerCase());
  const index=header?.indexOf("email")??-1;
  if(index<0) throw new Error("CSV must start with an email column header");
  if(!rows.length || rows.length>500) throw new Error("CSV must contain 1 to 500 contacts");
  const emails=rows.map(row=>row[index]?.trim().toLowerCase());
  if(emails.some(email=>!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) throw new Error("Invalid email in CSV");
  return emails;
}
function cell(value) {
  const raw=String(value??"");
  return `"${(/^[\s]*[=+\-@]/.test(raw)?"'":"")+raw.replaceAll('"','""')}"`;
}
export function contactsToCsv(contacts) {
  return "email,name\r\n"+contacts.map(contact=>`${cell(contact.email)},${cell(contact.name)}`).join("\r\n")+"\r\n";
}
