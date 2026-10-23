const icons={green:'🟢',yellow:'🟡',red:'🔴'};
const failure=new Set(['failed','failure','error','unhealthy','down','offline','suspended','blocked','removed','closed','rejected']);
export function adminStatus(kind,record={},now=Date.now()){
 const value=String(record.status??record.health??record.state??'unknown').toLowerCase();
 const result=(color,label)=>({color,label});
 if(kind==='user')return value==='active'?result('green','Ready · account active (presence not checked)'):failure.has(value)||value==='disabled'?result('red','Failure · account '+value):result('yellow','Alarm · account '+value);
 if(record.enabled===false||record.enabled===0)return result('yellow','Alarm · disabled');
 if(kind==='equipment')return result('yellow','Alarm · inventory only; device health not monitored');
 if(kind==='configuration')return result('yellow','Alarm · configured; connection not verified');
 if(kind==='provider')return value==='enabled'?result('yellow','Alarm · enabled; gateway health is separate'):failure.has(value)?result('red','Failure · provider '+value):result('yellow','Alarm · provider '+value);
 if(kind==='gateway')return value==='active'?result('green','Ready · gateway activation acknowledged (delivery not tested)'):failure.has(value)?result('red','Failure · gateway '+value):result('yellow','Alarm · gateway '+value);
 if(kind==='capability')return value==='tested'?result('green','Ready · acceptance tested'):failure.has(value)?result('red','Failure · capability '+value):result('yellow','Alarm · acceptance '+value);
 if(kind==='service')return record.active===false?result('red','Failure · service process stopped'):record.active&&record.transportConnected?result('green','Ready · process and transport connected (calls not tested)'):result('yellow','Alarm · service checks incomplete');
 const stamp=record.last_check_at??record.last_seen_at??record.last_checked_at??record.checked_at??record.health_checked_at;
 const checked=typeof stamp==='string'?Date.parse(stamp.includes('T')?stamp:stamp.replace(' ','T')+'Z'):stamp instanceof Date?stamp.getTime():NaN;
 const age=now-checked,limit=Number(record.staleSeconds||300)*1000;
 if(!Number.isFinite(age)||age<0||age>limit)return result('yellow','Alarm · health evidence missing or stale');
 if(failure.has(value))return result('red','Failure · '+value);
 if(['healthy','online','ok','connected'].includes(value))return result('green','Ready · recent health check passed');
 return result('yellow','Alarm · health '+value);
}
export function appendAdminStatus(parent,kind,record){
 const badge=parent.ownerDocument.createElement('span'),status=adminStatus(kind,record);
 badge.className='admin-status-icon';badge.dataset.statusColor=status.color;badge.dataset.statusKind=kind;
 badge.textContent=icons[status.color]+' '+status.label;badge.setAttribute('role','status');badge.setAttribute('aria-label',status.label);
 badge.style.display='inline-block';badge.style.margin='4px 8px';parent.append(badge);return badge;
}
