export function setupProviderCredentialsAdmin({get,request}){
  const root=document.querySelector('#provider-credentials-admin');
  const form=root.querySelector('#provider-credentials-form');
  const status=root.querySelector('#provider-credentials-status');
  const list=root.querySelector('#provider-credentials-list');
  let revisions=new Map();
  function choose(){
    const didww=form.elements.provider.value==='didww';
    root.querySelector('#provider-access-label').hidden=didww;
    root.querySelector('#provider-secret-label').hidden=didww;
    root.querySelector('#provider-api-label').hidden=!didww;
    root.querySelector('#provider-env-label').hidden=!didww;
    form.elements.accessKey.required=!didww;
    form.elements.secretKey.required=!didww;
    form.elements.apiKey.required=didww;
  }
  async function refresh(){
    try{
      const data=await get('/api/admin/carriers/credentials');
      revisions=new Map(data.entries.map(row=>[row.provider,Number(row.revision)]));
      list.replaceChildren();
      for(const provider of ['flowroute','didww']){
        const row=data.entries.find(item=>item.provider===provider);
        const li=document.createElement('li');
        li.append(document.createTextNode(provider.toUpperCase()+' · '+(row?
          'configured (revision '+row.revision+', updated '+row.updated_at+')':'not configured')+' '));
        if(row){
          const remove=document.createElement('button');remove.type='button';remove.textContent='Remove credentials';
          remove.onclick=async()=>{if(!confirm('Remove '+provider+' API credentials for this tenant?'))return;
            remove.disabled=true;
            try{await request('/api/admin/carriers/credentials/'+provider,undefined,'DELETE');
              await refresh();status.textContent='Credentials removed.';}
            catch(error){status.textContent=error.message;remove.disabled=false;}
          };li.append(remove);
        }
        list.append(li);
      }
      if(!data.keyReady)status.textContent='API encryption key is unavailable. Configure PROVIDER_CREDENTIAL_KEY on the API server.';
    }catch(error){status.textContent=error.message;}
  }
  form.elements.provider.onchange=()=>{form.elements.accessKey.value='';form.elements.secretKey.value='';
    form.elements.apiKey.value='';choose();};
  form.onsubmit=async event=>{
    event.preventDefault();const provider=form.elements.provider.value,button=form.querySelector('button');
    const body=provider==='didww'?{apiKey:form.elements.apiKey.value,environment:form.elements.environment.value}:
      {accessKey:form.elements.accessKey.value,secretKey:form.elements.secretKey.value};
    body.expectedRevision=revisions.get(provider)||0;button.disabled=true;
    try{
      const result=await request('/api/admin/carriers/credentials/'+provider,body,'PUT');
      form.elements.accessKey.value='';form.elements.secretKey.value='';form.elements.apiKey.value='';
      await refresh();status.textContent=provider+' saved at revision '+result.revision+
        '. Use Verify in Carrier provider commissioning to check inventory access.';
    }catch(error){status.textContent=error.message;}
    finally{button.disabled=false;}
  };
  root.querySelector('#provider-credentials-refresh').onclick=refresh;
  choose();
  return {refresh};
}
