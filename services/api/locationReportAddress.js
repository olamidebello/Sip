// This is the current profile address, not a reverse-geocoded check-in address.
export function profileAddress(row){
 const clean=value=>typeof value==='string'?value.trim():'';
 return [row.address1,row.address2,row.city,row.region,row.postalCode,row.country].map(clean).filter(Boolean).join(', ');
}
