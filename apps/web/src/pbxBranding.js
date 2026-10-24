// Workspace names are data, never markup, CSS values or tenant selectors.
export function applyPbxBranding(name,doc=document){
 const label=typeof name==='string'?name.trim().slice(0,150):'';
 const colors=['#176b52','#245fa4','#6b469a','#945024'];
 let hash=0;for(const ch of label)hash=(hash*31+ch.codePointAt(0))>>>0;
 for(const [selector,suffix,fallback] of [['#pbx-admin h3','PBX & call center','PBX and call center configuration'],['#calling-workspace h2','Phone services','Calls']]){
  const heading=doc.querySelector(selector);if(!heading)continue;
  heading.textContent=label?label+' · '+suffix:fallback;
  const section=heading.closest('section');if(section){section.style.borderInlineStart=label?'5px solid '+colors[hash%colors.length]:'';section.style.paddingInlineStart=label?'1rem':'';section.setAttribute('aria-label',label?label+' '+suffix:fallback);}
 }
}
