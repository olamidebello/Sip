import {setupMessagePrivacy,closeViewOnce} from './messagePrivacy.js';
import {chatDayLabel,messageReceipt,setupMessageDetails} from './chatPresentation.js';
import {icon} from './messengerIcons.js';
import {appendAttachment,setupMediaComposer} from './messengerMedia.js';
export function setupConversations({get,request,isSignedIn,isVisible,callContact,preferencesChanged}) {
  const $=selector=>document.querySelector(selector),thread=()=>$('#contact-list').value;
  const media=setupMediaComposer({document,form:$('#send-message'),request,onError:message=>$('#chat-status').textContent=message});
  const details=setupMessageDetails(document);
  const privacy=setupMessagePrivacy({document,form:$('#send-message'),media,get});
  let contacts=[],replyTo=null,editing=null,loading=false,lastTyping=0,lastRendered='';
  function setSendLabel(label){const button=$('#send-message button:not([type=button])');button.innerHTML=icon('send');button.setAttribute('aria-label',label);button.title=label;}
  function clearDraft(){replyTo=null;editing=null;$('#message-context').hidden=true;setSendLabel('Send message');}
  async function control(input){if(!thread())return;await request('/api/messages/conversation/'+thread(),input,'PUT');if('archived' in input||'muted' in input||'pinned' in input||'unread' in input)await preferencesChanged();else await refresh();}
  function action(label,handler){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>Promise.resolve(handler()).catch(error=>{$('#chat-status').textContent=error.message;});return button;}
  async function refresh() {
    const contact=thread();if(!contact){lastRendered='';$('#message-list').replaceChildren();$('#call-contact').disabled=true;$('#send-message button:not([type=button])').disabled=true;$('#send-message [name=body]').disabled=true;$('#conversation-typing').textContent='';return;}if(loading)return;loading=true;
    try {
      const data=await get('/api/messages?contact='+encodeURIComponent(contact));
      if(thread()!==contact||!isSignedIn())return;
      const list=$('#message-list');
      const search=$('#message-search').value.toLowerCase();
      const renderKey=JSON.stringify([contact,search,data.messages,data.reactions]);
      if(renderKey!==lastRendered){lastRendered=renderKey;const atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80,scroll=list.scrollTop;list.replaceChildren();
      const unseen=data.messages.filter(m=>m.recipient===data.viewer&&!m.read_at);
      if(unseen.length&&!data.preferences.muted)$('#chat-status').textContent=`${unseen.length} new message${unseen.length===1?'':'s'}`;
      let lastDay=null;
      for(const message of data.messages) {
        if(search&&!message.body.toLowerCase().includes(search))continue;
        const day=chatDayLabel(message.created_at);if(day&&day!==lastDay){const divider=document.createElement('li');divider.className='chat-date-divider';divider.textContent=day;list.append(divider);lastDay=day;}
        const own=message.sender===data.viewer,item=document.createElement('li');item.className=own?'message-bubble sent':'message-bubble received';item.dataset.messageId=message.id;if(!message.deleted_at&&!message.view_once){item.tabIndex=0;item.setAttribute('aria-expanded','false');item.setAttribute('aria-label','Message. Long press or press Enter for actions.');}
        if(message.reply_to){const quote=document.createElement('blockquote'),jump=document.createElement('button');jump.type='button';jump.className='chat-reply-quote';jump.textContent=message.reply_body||'Original message removed';jump.setAttribute('aria-label','Go to replied message');jump.onclick=()=>{const original=[...list.querySelectorAll('[data-message-id]')].find(node=>node.dataset.messageId===message.reply_to);if(original){original.scrollIntoView?.({block:'center',behavior:'smooth'});original.classList.add('message-flash');setTimeout(()=>original.classList.remove('message-flash'),1200);}else $('#chat-status').textContent='Original message is outside the loaded history.';};quote.append(jump);item.append(quote);}
        const body=document.createElement('p');body.textContent=message.deleted_at?'Message removed':message.body;item.append(body);appendAttachment(document,item,message);
        const stamp=document.createElement('small');stamp.className='message-timestamp';stamp.textContent=new Date(message.created_at).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})+(message.edited_at?' · edited':'');if(own){const state=messageReceipt(message),receipt=document.createElement('span');receipt.className='message-receipt'+(state.read?' read':'');receipt.textContent=state.symbol;receipt.setAttribute('aria-label',state.label);stamp.append(' ',receipt);}item.append(stamp);
        if(!message.deleted_at&&!message.view_once){
          const controls=document.createElement('div');controls.className='message-actions';
          controls.append(action('Copy',async()=>{if(await details.copy(message))$('#chat-status').textContent='Message copied.';}));controls.append(action('Info',()=>details.info(message)));
          controls.append(action(message.starred?'Unstar':'Star',async()=>{await request('/api/messenger/messages/'+message.id+'/star',{starred:!message.starred},'PUT');await refresh();}));
          const forward=document.createElement('select');forward.setAttribute('aria-label','Forward message to contact');const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Forward to…';forward.append(placeholder);for(const contact of contacts){const option=document.createElement('option');option.value=contact.id;option.textContent=contact.name;forward.append(option);}forward.onchange=async()=>{if(!forward.value)return;try{await request('/api/messenger/messages/'+message.id+'/forward',{recipient:forward.value});$('#chat-status').textContent='Message forwarded.';}catch(error){$('#chat-status').textContent=error.message;}finally{forward.value='';}};controls.append(forward);
          for(const [kind,label]of [['translate','Translate message'],['speak','Read aloud (English)']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.languageMessage=kind;controls.append(b);}
          controls.append(action('Reply',()=>{clearDraft();editing=null;replyTo=message.id;$('#message-context').hidden=false;$('#message-context-text').textContent='Replying to: '+message.body.slice(0,90);$('#send-message [name=body]').focus();}));
          if(own){
            controls.append(action('Edit',()=>{clearDraft();replyTo=null;editing=message.id;$('#send-message [name=body]').value=message.body;setSendLabel('Save edit');$('#message-context').hidden=false;$('#message-context-text').textContent='Editing your message';$('#send-message [name=body]').focus();}));
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
      list.scrollTop=atBottom?list.scrollHeight:scroll;
      }
      for(const key of ['blocked','muted','archived','pinned','unread']){const input=$('#conversation-'+key);if(input)input.checked=data.preferences[key];}
      $('#conversation-typing').textContent=data.typing?'Typing…':'';
      $('#send-message [name=body]').disabled=data.preferences.blocked;
      $('#send-message button:not([type=button])').disabled=data.preferences.blocked;
      $('#call-contact').disabled=!contacts.find(c=>c.id===contact)?.sip_address;
      if(isVisible()&&document.visibilityState==='visible'&&data.messages.some(m=>m.recipient===data.viewer&&!m.read_at))await request('/api/messages/conversation/'+contact,{read:true},'PUT');
    }finally{loading=false;}
  }
  for(const key of ['blocked','muted','archived','pinned','unread'])if($('#conversation-'+key))$('#conversation-'+key).onchange=()=>control({[key]:$('#conversation-'+key).checked}).catch(error=>{$('#chat-status').textContent=error.message;});
  $('#message-context-cancel').onclick=clearDraft;
  $('#message-search').oninput=()=>refresh().catch(error=>{$('#chat-status').textContent=error.message;});
  $('#call-contact').onclick=()=>{const contact=contacts.find(c=>c.id===thread());if(contact?.sip_address)callContact(contact.sip_address);};
  $('#send-message [name=body]').oninput=()=>{
    if(thread()&&Date.now()-lastTyping>4000){lastTyping=Date.now();void request('/api/messages/conversation/'+thread(),{typing:true},'PUT').catch(()=>{});}
  };
  const timer=setInterval(()=>{if(isSignedIn()&&isVisible()&&document.visibilityState==='visible')refresh().catch(error=>{$('#chat-status').textContent=error.message;});},5000);
  timer.unref?.();
  return {refresh,dispose(){clearInterval(timer);media.stop();privacy.dispose();details.dispose();},stopMedia(){lastRendered='';media.stop();privacy.stop();closeViewOnce(document);details.close();},resumeMedia(){media.resume();void privacy.resume();},clearAttachment(){media.reset();},setContacts(value){contacts=value;clearDraft();},clearDraft,async send(body){
    if(media.busy)throw new Error('Finish recording or uploading before sending');
    body=body||media.name;
    if(editing)await request('/api/messages/'+editing,{body},'PATCH');
    else await request('/api/messages',{recipient:thread(),body,replyTo,...privacy.payload,...(media.id?{attachmentId:media.id}:{})});
    media.reset();privacy.reset();
    clearDraft();await request('/api/messages/conversation/'+thread(),{typing:false},'PUT').catch(()=>{});
  }};
}
