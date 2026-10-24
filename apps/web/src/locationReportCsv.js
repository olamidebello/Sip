export function locationReportCsv(entries){
 const rows=[['User ID','Saved at','Latitude','Longitude','Accuracy meters','User name','Current profile address','Address line 1','Address line 2','City','State or region','Postal code','Country'],...entries.map(e=>[e.userId,e.recordedAt,e.latitude,e.longitude,e.accuracyMeters,e.name,e.profileAddress,e.address1,e.address2,e.city,e.region,e.postalCode,e.country])];
 const cell=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 return rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
