export function setupReports({get}) {
  const form=document.querySelector("#report-filter");
  const status=document.querySelector("#report-status");
  const summary=document.querySelector("#report-summary");
  const details=document.querySelector("#report-details");
  const exportLink=document.querySelector("#report-export");
  const invoiceExport=document.querySelector("#report-invoice-export");
  const today=new Date().toISOString().slice(0,10);
  form.elements.to.value=today;
  form.elements.from.value=new Date(Date.parse(`${today}T00:00:00Z`)-29*86400000).toISOString().slice(0,10);
  const table=(title,headers,rows) => {
    const section=document.createElement("section"),heading=document.createElement("h4"),grid=document.createElement("table");
    heading.textContent=title;
    const head=grid.createTHead().insertRow();
    for(const label of headers) {const cell=document.createElement("th");cell.scope="col";cell.textContent=label;head.append(cell);}
    const body=grid.createTBody();
    for(const values of rows) {const row=body.insertRow();for(const value of values) row.insertCell().textContent=String(value);}
    section.append(heading,grid);return section;
  };
  async function refresh() {
    status.textContent="Loading report…";
    const params=new URLSearchParams({from:form.elements.from.value,to:form.elements.to.value});
    try {
      const data=await get(`/api/admin/reports?${params}`);
      const {total}=data.calls;
      summary.textContent=`${total.calls} recorded calls, ${data.calls.answerRatePercent}% answered, ${data.calls.averageDurationSeconds}s average duration, ${total.billableSeconds} billable seconds; ${data.users.new} new users (${data.users.total} total).`;
      details.replaceChildren(
        table("Calls by UTC day",["Day","Calls","Answered","Missed","Duration (s)","Billable (s)"],
          data.calls.daily.map(d=>[d.day,d.calls,d.answered,d.missed,d.duration_seconds,d.billable_seconds])),
        table("Call disposition",["Disposition","Calls"],data.calls.dispositions.map(d=>[d.disposition,d.calls])),
        table("Call direction",["Direction","Calls"],data.calls.directions.map(d=>[d.direction,d.calls])),
        table("CDR sources",["Source","Calls","Answered"],data.calls.sources.map(d=>[d.source,d.calls,d.answered])),
        table("Calls by UTC hour",["Hour","Calls"],data.calls.hours.map(d=>[`${String(d.utc_hour).padStart(2,"0")}:00`,d.calls])),
        table("Invoices by currency and status",["Currency","Status","Invoices","Recorded amount (cents)"],
          data.billing.invoices.map(i=>[i.currency,i.status,i.invoices,i.amount_cents])),
        table("Current in-house DID inventory",["Status","Numbers"],data.inventory.inhouseDids.map(d=>[d.status,d.numbers])),
        table("Port requests created in period",["Status","Requests"],data.porting.requests.map(p=>[p.status,p.requests])),
        table("Current PBX agent status",["Status","Agents"],data.callCenter.agentStatus.map(a=>[a.status,a.agents]))
      );
      exportLink.href=`/api/admin/reports.csv?${params}`;
      exportLink.hidden=false;
      invoiceExport.href=`/api/admin/reports.csv?${params}&kind=invoices`;
      invoiceExport.hidden=false;
      status.textContent=data.note;
    } catch(error) {exportLink.hidden=true;invoiceExport.hidden=true;status.textContent=error.message;}
  }
  form.addEventListener("submit",event=>{event.preventDefault();refresh();});
  return {refresh};
}
