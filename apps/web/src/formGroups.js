function wrapElements(root,id,label,selectors,open=false) {
  const nodes=selectors.map(selector=>root.querySelector(selector)).filter(Boolean);
  if(!nodes.length) return null;
  const group=document.createElement("details");group.id=id;group.className="form-group";group.open=open;
  const summary=document.createElement("summary");summary.textContent=label;group.append(summary);
  nodes[0].before(group);
  for(const node of nodes) group.append(node);
  return group;
}

function groupByHeadings(sectionId,tag,initialLabel) {
  const section=document.getElementById(sectionId);
  if(!section) return;
  let group=null,index=0;
  for(const node of [...section.children]) {
    if(node.tagName===tag) {
      group=document.createElement("details");group.className="form-group";group.id=`${sectionId}-group-${++index}`;
      const summary=document.createElement("summary");summary.textContent=node.textContent;
      group.append(summary);section.insertBefore(group,node);node.remove();
    } else if(!group && initialLabel && node.tagName!=="H2" && node.tagName!=="H3" && node.tagName!=="P") {
      group=document.createElement("details");group.className="form-group";group.id=`${sectionId}-group-${++index}`;group.open=true;
      const summary=document.createElement("summary");summary.textContent=initialLabel;
      group.append(summary);section.insertBefore(group,node);
    }
    if(group && node.isConnected && node!==group && node.tagName!==tag) group.append(node);
  }
}

function addGroupIndex(sectionId) {
  const section=document.getElementById(sectionId);
  const groups=[...section.querySelectorAll(":scope > details.form-group")];
  if(groups.length<2) return;
  const index=document.createElement("nav");index.className="section-index";index.setAttribute("aria-label","Form groups");
  for(const group of groups) {
    const link=document.createElement("a");link.href=`#${group.id}`;link.textContent=group.querySelector("summary").textContent;
    link.onclick=()=>{group.open=true;};index.append(link);
  }
  const heading=section.querySelector(":scope > h2, :scope > h3");
  if(heading) heading.after(index);else section.prepend(index);
}

export function setupFormGroups() {
  const account=document.getElementById("account");
  const login=wrapElements(account,"account-login-group","Email sign in",["#login"],true);
  const signup=wrapElements(account,"account-signup-group","Create an account",["#signup"]);
  if(login&&signup) account.insertBefore(login,signup);
  wrapElements(account,"account-directory-group","Directory sign in",["#ldap-login"]);
  wrapElements(account,"account-verify-group","Verify email",["#signup-verify"]);
  const password=wrapElements(account,"account-password-group","Change password",["#password-change"]);
  if(password) password.hidden=true;

  const support=document.getElementById("support");
  wrapElements(support,"support-new-group","Create a support ticket",["#support-create"]);
  wrapElements(support,"support-browse-group","Browse and manage tickets",["#support-filter","#support-refresh","#support-list","#support-prev","#support-next","#support-detail"],true);

  groupByHeadings("billing","H3","Request a plan");
  groupByHeadings("group-admin","H4","Groups and memberships");
  groupByHeadings("pbx-admin","H4");
  groupByHeadings("pricing-admin","H4");
  const tenants=document.getElementById("tenant-admin");
  wrapElements(tenants,"tenant-create-group","Create tenant",["#tenant-super"]);
  wrapElements(tenants,"tenant-user-group","Create tenant user",["#tenant-user-create"]);

  const calling=document.getElementById("calling-workspace");
  wrapElements(calling,"calling-tools-group","Favorites, recents and audio",["#softphone-tools"]);
  wrapElements(calling,"calling-area-group","Calling area",["#geo"]);
  for(const id of ["billing","support","group-admin","pbx-admin","pricing-admin","tenant-admin","calling-workspace"])
    addGroupIndex(id);
}
