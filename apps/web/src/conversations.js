export function setupConversations({get,request,isSignedIn,isVisible,callContact,preferencesChanged}) {
  const $=selector=>document.querySelector(selector),thread=()=>$('#contact-list').value;
  let contacts=[],replyTo=null,editing=null,loading=false,lastTyping=0;
  function clearDraft(){replyTo=null;editing=null;$('#message-context').hidden=true;$('#send-message button').textContent='Send';}
  async function control(input){if(!thread())return;await request('/api/messages/conversation/'+thread(),input,'PUT');if('archived' in input||'muted' in input)await preferencesChanged();else await refresh();}
  function action(label,handler){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>Promise.resolve(handler()).catch(error=>{$('#chat-status').textContent=error.message;});return button;}
  async function refresh() {
    const contact=thread();if(!contact){$('#message-list').replaceChildren();$('#call-contact').disabled=true;$('#send-message button').disabled=true;$('#send-message [name=body]').disabled=true;$('#conversation-typing').textContent='';return;}if(loading)return;loading=true;
    try {
      const data=await get('/api/messages?contact='+encodeURIComponent(contact));
      if(thread()!==contact||!isSignedIn())return;
      const list=$('#message-list');list.replaceChildren();
      const search=$('#message-search').value.toLowerCase();
      const unseen=data.messages.filter(m=>m.recipient===data.viewer&&!m.read_at);
      if(unseen.length&&!data.preferences.muted)$('#chat-status').textContent=`${unseen.length} new message${unseen.length===1?'':'s'}`;
      for(const message of data.messages) {
        if(search&&!message.body.toLowerCase().includes(search))continue;
        const own=message.sender===data.viewer,item=document.createElement('li');item.className=own?'message-bubble sent':'message-bubble received';
        if(message.reply_to){const quote=document.createElement('blockquote');quote.textContent=message.reply_body||'Original message removed';item.append(quote);}
        const body=document.createElement('p');body.textContent=message.deleted_at?'Message removed':message.body;item.append(body);
        const stamp=document.createElement('small');stamp.textContent=new Date(message.created_at).toLocaleString()+(message.edited_at?' · edited':'')+(own?' · '+(message.read_at?'Read':'Sent'):'');item.append(stamp);
        if(!message.deleted_at){
          const controls=document.createElement('div');controls.className='message-actions';
          controls.append(action('Reply',()=>{clearDraft();editing=null;replyTo=message.id;$('#message-context').hidden=false;$('#message-context-text').textContent='Replying to: '+message.body.slice(0,90);$('#send-message [name=body]').focus();}));
          if(own){
            controls.append(action('Edit',()=>{clearDraft();replyTo=null;editing=message.id;$('#send-message [name=body]').value=message.body;$('#send-message button').textContent='Save edit';$('#message-context').hidden=false;$('#message-context-text').textContent='Editing your message';$('#send-message [name=body]').focus();}));
            controls.append(action('Remove',async()=>{await request('/api/messages/'+message.id,{},'DELETE');await refresh();}));
          }
          const reaction=document.createElement('select');reaction.setAttribute('aria-label','React to message');
          for(const [value,label] of [['','React…'],['👍','👍'],['❤️','❤️'],['😂','😂'],['😮','😮'],['😢','😢'],['🙏','🙏'],['remove','Remove reaction']]){const option=document.createElement('option');option.value=value;option.textContent=label;reaction.append(option);}
          reaction.onchange=async()=>{try{await request('/api/messages/'+message.id,{reaction:reaction.value==='remove'?null:reaction.value},'PUT');await refresh();}catch(error){$('#chat-status').textContent=error.message;}};
          controls.append(reaction);item.append(controls);
          const reactions=document.createElement('span');reactions.className='reaction-counts';
          const counts=new Map();for(const r of data.reactions.filter(r=>r.message_id===message.id))counts.set(r.reaction,(counts.get(r.reaction)||0)+1);
          reactions.textContent=[...counts].map(([emoji,count])=>`${emoji} ${count}`).join('  ');item.append(reactions);
        }
        list.append(item);
      }
      for(const key of ['blocked','muted','archived'])$('#conversation-'+key).checked=data.preferences[key];
      $('#conversation-typing').textContent=data.typing?'Typing…':'';
      $('#send-message [name=body]').disabled=data.preferences.blocked;
      $('#send-message button').disabled=data.preferences.blocked;
      $('#call-contact').disabled=!contacts.find(c=>c.id===contact)?.sip_address;
      if(isVisible()&&document.visibilityState==='visible'&&data.messages.some(m=>m.recipient===data.viewer&&!m.read_at))await request('/api/messages/conversation/'+contact,{read:true},'PUT');
    }finally{loading=false;}
  }
  for(const key of ['blocked','muted','archived'])$('#conversation-'+key).onchange=()=>control({[key]:$('#conversation-'+key).checked}).catch(error=>{$('#chat-status').textContent=error.message;});
  $('#message-context-cancel').onclick=clearDraft;
  $('#message-search').oninput=()=>refresh().catch(error=>{$('#chat-status').textContent=error.message;});
  $('#call-contact').onclick=()=>{const contact=contacts.find(c=>c.id===thread());if(contact?.sip_address)callContact(contact.sip_address);};
  $('#send-message [name=body]').oninput=()=>{
    if(thread()&&Date.now()-lastTyping>4000){lastTyping=Date.now();void request('/api/messages/conversation/'+thread(),{typing:true},'PUT').catch(()=>{});}
  };
  const timer=setInterval(()=>{if(isSignedIn()&&isVisible()&&document.visibilityState==='visible')refresh().catch(error=>{$('#chat-status').textContent=error.message;});},5000);
  timer.unref?.();
  return {refresh,dispose(){clearInterval(timer);},setContacts(value){contacts=value;clearDraft();},clearDraft,async send(body){
    if(editing)await request('/api/messages/'+editing,{body},'PATCH');
    else await request('/api/messages',{recipient:thread(),body,replyTo});
    clearDraft();await request('/api/messages/conversation/'+thread(),{typing:false},'PUT').catch(()=>{});
  }};
}
