import {icon} from './messengerIcons.js';
export function setupChatLanding(document){
  const chat=document.getElementById('chat'),select=document.getElementById('contact-list');
  const shell=document.createElement('div');shell.className='chat-shell';
  const sidebar=document.createElement('aside');sidebar.className='chat-sidebar';sidebar.setAttribute('aria-label','Conversations');
  const search=document.createElement('input');search.type='search';search.placeholder='Search chats';search.setAttribute('aria-label','Search chats');
  let filter='all';
  const list=document.createElement('div');list.className='chat-conversations';
  sidebar.append(search);
  const filters=document.createElement('div');filters.className='chat-filters';
  const archive=document.getElementById('show-archived-conversations');
  if(archive){
    for(const [label,archived] of [['Chats',false],['Archived',true]]){
      const button=document.createElement('button');button.type='button';button.textContent=label;
      const sync=()=>button.setAttribute('aria-pressed',String(archive.checked===archived));sync();archive.addEventListener('change',sync);
      button.onclick=()=>{if(archive.checked!==archived){archive.checked=archived;archive.dispatchEvent(new document.defaultView.Event('change',{bubbles:true}));}};filters.append(button);
    }
  }
  for(const [label,value] of [['Unread','unread'],['Pinned','pinned']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-pressed','false');button.onclick=()=>{filter=filter===value?'all':value;for(const other of filters.querySelectorAll('[data-filter]'))other.setAttribute('aria-pressed',String(other.dataset.filter===filter));render();};button.dataset.filter=value;filters.append(button);}
  sidebar.append(filters,list,document.getElementById('contact-directory'));
  const thread=document.createElement('div');thread.className='chat-thread';
  for(const child of [...chat.children])if(!child.matches('h2,.messenger-subtitle'))thread.append(child);
  const header=document.createElement('div');header.className='chat-thread-header';
  const back=document.createElement('button');back.type='button';back.innerHTML=icon('back');back.setAttribute('aria-label','Back to chats');back.onclick=()=>{chat.classList.remove('thread-open','chat-overlay');};
  const avatar=document.createElement('span');avatar.className='chat-avatar chat-header-avatar';avatar.setAttribute('aria-hidden','true');const copy=document.createElement('div');copy.className='chat-header-copy';const title=document.createElement('strong');const typing=document.getElementById('conversation-typing');copy.append(title);if(typing)copy.append(typing);header.append(back,avatar,copy);thread.prepend(header);
  function headerContact(){const selected=select.selectedOptions[0],name=selected?.dataset.name||selected?.textContent||'Select a conversation';title.textContent=name;avatar.textContent=selected?.value?name.slice(0,2).toUpperCase():'?';}headerContact();
  const options=document.createElement('details');options.className='chat-options';
  const summary=document.createElement('summary');summary.textContent='Conversation options';options.append(summary);
  for(const child of [...thread.children]){
    if(child===header||child.id==='conversation-typing'||child.id==='message-list')continue;
    if(child.tagName==='LABEL'||child.classList.contains('conversation-toolbar')||child.classList.contains('bulk-controls')||child.id==='add-contact'||child.id==='load-messages'||(child.tagName==='P'&&!child.id))options.append(child);
  }
  header.after(options);
  const call=thread.querySelector('#call-contact');
  if(call){call.innerHTML=icon('calls');call.setAttribute('aria-label','Call this contact');header.append(call);}

  const expand=document.createElement('button');expand.type='button';expand.textContent='⤢';expand.setAttribute('aria-label','Expand conversation');expand.setAttribute('aria-pressed','false');
  expand.onclick=()=>{const open=chat.classList.toggle('chat-overlay');expand.setAttribute('aria-pressed',String(open));expand.setAttribute('aria-label',open?'Restore conversation':'Expand conversation');};header.append(expand);
  const menu=document.createElement('button');menu.type='button';menu.innerHTML=icon('more');menu.setAttribute('aria-label','Conversation menu');menu.onclick=()=>{options.open=!options.open;};header.append(menu);
  const create=document.createElement('button');create.type='button';create.className='chat-new';create.innerHTML=icon('plus');create.setAttribute('aria-label','New chat');
  create.onclick=()=>{chat.classList.remove('thread-open');const directory=document.getElementById('contact-directory');directory.open=true;directory.querySelector('input')?.focus();directory.scrollIntoView?.({block:'center'});};sidebar.append(create);
  const composer=thread.querySelector('#send-message');
  if(composer){
    const input=composer.querySelector('textarea');
    const send=composer.querySelector('button');
    if(send){send.type='submit';send.innerHTML=icon('send');send.setAttribute('aria-label','Send message');}
    const toggle=document.createElement('button');toggle.type='button';toggle.className='chat-emoji-toggle';toggle.innerHTML=icon('emoji');toggle.setAttribute('aria-label','Choose emoji');toggle.setAttribute('aria-expanded','false');
    const picker=document.createElement('div');picker.className='chat-emoji-picker';picker.hidden=true;picker.setAttribute('aria-label','Emoji');
    const close=()=>{picker.hidden=true;toggle.setAttribute('aria-expanded','false');};
    toggle.onclick=()=>{picker.hidden=!picker.hidden;toggle.setAttribute('aria-expanded',String(!picker.hidden));};
    for(const emoji of ['😀','😂','🥰','😍','😊','😎','🤔','😢','👍','👎','🙏','👏','❤️','🎉','✅','👋']){
      const button=document.createElement('button');button.type='button';button.textContent=emoji;button.setAttribute('aria-label',`Insert ${emoji}`);
      button.onclick=()=>{const start=input.selectionStart,end=input.selectionEnd;if(input.value.length-(end-start)+emoji.length>input.maxLength)return;input.setRangeText(emoji,start,end,'end');input.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));close();input.focus();};picker.append(button);
    }
    picker.addEventListener('keydown',event=>{if(event.key==='Escape'){close();toggle.focus();}});
    composer.prepend(toggle);composer.before(picker);
  }
  shell.append(sidebar,thread);chat.append(shell);
  function render(){
    headerContact();list.replaceChildren();
    const query=search.value.toLocaleLowerCase();
    for(const option of select.options){
      if(!option.value||!option.textContent.toLocaleLowerCase().includes(query)||(filter==='unread'&&option.dataset.unread!=='true')||(filter==='pinned'&&option.dataset.pinned!=='true'))continue;
      const button=document.createElement('button');button.type='button';button.className='chat-contact';
      const avatar=document.createElement('span');avatar.className='chat-avatar';avatar.textContent=option.textContent.trim().slice(0,2).toUpperCase();avatar.setAttribute('aria-hidden','true');
      const copy=document.createElement('span');copy.className='chat-row-copy';
      const name=document.createElement('span');name.className='chat-name';name.textContent=option.dataset.name||option.textContent;
      const preview=document.createElement('small');preview.className='chat-preview';preview.textContent=(option.dataset.pinned==='true'?'📌 ': '')+(option.dataset.unread==='true'?'● Unread · ':'')+(option.dataset.preview||'Open conversation');copy.append(name,preview);button.append(avatar,copy);
      button.setAttribute('aria-pressed',String(option.value===select.value));
      button.addEventListener('click',()=>{select.value=option.value;headerContact();chat.classList.add('thread-open');select.dispatchEvent(new document.defaultView.Event('change',{bubbles:true}));render();});list.append(button);
    }
    if(!list.children.length){const empty=document.createElement('p');empty.textContent=query?'No matching chats.':'Add a contact to start a conversation.';list.append(empty);}
  }
  search.addEventListener('input',render);select.addEventListener('change',()=>{headerContact();render();});
  const outside=event=>{if(options.open&&!options.contains(event.target)&&!menu.contains(event.target))options.open=false;};
  const escape=event=>{if(event.key==='Escape'&&options.open){options.open=false;menu.focus();}};
  document.addEventListener('click',outside);document.addEventListener('keydown',escape);
  const threadMode=()=>document.body.classList.toggle('chat-thread-mode',chat.classList.contains('thread-open')&&!chat.classList.contains('workspace-inactive'));
  const modeObserver=new document.defaultView.MutationObserver(threadMode);modeObserver.observe(chat,{attributes:true,attributeFilter:['class']});threadMode();
  const observer=new document.defaultView.MutationObserver(render);observer.observe(select,{childList:true,subtree:true,characterData:true});render();
  return {render,dispose(){modeObserver.disconnect();document.body.classList.remove('chat-thread-mode');observer.disconnect();document.removeEventListener('click',outside);document.removeEventListener('keydown',escape);}};
}
