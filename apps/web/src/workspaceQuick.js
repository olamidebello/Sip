export function setupWorkspaceQuick({get,request,show,current}){
  const $=id=>document.getElementById(id),palette=$('command-palette');
  let targets=[],last=null,recordTimer;
  const visibleLinks=()=>[...document.querySelectorAll('#app-nav .menu-links a')].filter(a=>!a.closest('[hidden]')&&!a.hidden);
  const linkFor=id=>visibleLinks().find(a=>a.hash==='#'+id);
  function draw(){
    const list=$('workspace-shortcut-list');list.replaceChildren();
    for(const id of targets){const link=linkFor(id);if(!link)continue;
      const li=document.createElement('li');const go=document.createElement('button');go.type='button';go.textContent=link.textContent;go.onclick=()=>show(id);li.append(go);
      const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.onclick=async()=>{try{targets=targets.filter(t=>t!==id);await request('/api/workspace/shortcuts',{targets},'PUT');draw();}catch(e){$('workspace-shortcut-status').textContent=e.message;}};li.append(remove);list.append(li);
    }
    const resume=$('workspace-resume');const link=last&&linkFor(last);resume.hidden=!link;if(link)resume.textContent='Continue: '+link.textContent;
  }
  async function refresh(){const result=await get('/api/workspace/shortcuts');targets=result.targets;last=result.lastTarget;draw();}
  function commands(query=''){
    const matches=visibleLinks().filter(a=>a.textContent.toLowerCase().includes(query.toLowerCase())).slice(0,25);
    const list=$('command-results');list.replaceChildren();for(const link of matches){const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=link.textContent;button.onclick=()=>{palette.close();show(link.hash.slice(1));};li.append(button);list.append(li);}
    $('command-empty').hidden=matches.length>0;
  }
  function open(){if(!visibleLinks().length)return;commands();$('command-search').value='';palette.showModal();$('command-search').focus();}
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(palette.open)palette.close();else open();}});
  $('command-open').onclick=open;
  $('command-search').oninput=e=>commands(e.currentTarget.value);
  $('command-search').onkeydown=e=>{if(e.key==='Enter'){const first=$('command-results').querySelector('button');if(first){e.preventDefault();first.click();}}};
  $('workspace-add-current').onclick=async()=>{const id=current();if(!linkFor(id)){ $('workspace-shortcut-status').textContent='Open a visible workspace page first.';return;}
    if(targets.includes(id))return;if(targets.length>=8){$('workspace-shortcut-status').textContent='Keep up to eight quick links.';return;}
    try{targets.push(id);await request('/api/workspace/shortcuts',{targets},'PUT');draw();$('workspace-shortcut-status').textContent='Quick link saved.';}
    catch(e){targets.pop();$('workspace-shortcut-status').textContent=e.message;}};
  $('workspace-resume').onclick=()=>{if(last&&linkFor(last))show(last);};
  return {refresh:()=>refresh().catch(e=>$('workspace-shortcut-status').textContent=e.message),
    record(id){if(id==='dashboard'||!linkFor(id))return;last=id;draw();clearTimeout(recordTimer);recordTimer=setTimeout(()=>request('/api/workspace/shortcuts/last',{target:id},'PUT').catch(()=>{}),800);},
    clear(){clearTimeout(recordTimer);targets=[];last=null;draw();if(palette.open)palette.close();}};
}
