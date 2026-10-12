import {icon} from './messengerIcons.js';
export function setupChatLanding(document){
  const chat=document.getElementById('chat'),select=document.getElementById('contact-list');
  const shell=document.createElement('div');shell.className='chat-shell';
  const sidebar=document.createElement('aside');sidebar.className='chat-sidebar';sidebar.setAttribute('aria-label','Conversations');
  const search=document.createElement('input');search.type='search';search.placeholder='Search chats';search.setAttribute('aria-label','Search chats');
  const list=document.createElement('div');list.className='chat-conversations';
  sidebar.append(search,list,document.getElementById('contact-directory'));
  const thread=document.createElement('div');thread.className='chat-thread';
  for(const child of [...chat.children])if(!child.matches('h2,.messenger-subtitle'))thread.append(child);
  const header=document.createElement('div');header.className='chat-thread-header';
  const back=document.createElement('button');back.type='button';back.innerHTML=icon('back');back.setAttribute('aria-label','Back to chats');back.onclick=()=>chat.classList.remove('thread-open');
  const title=document.createElement('strong');title.textContent=select.selectedOptions[0]?.textContent||'Select a conversation';header.append(back,title);thread.prepend(header);
  const options=document.createElement('details');options.className='chat-options';
  const summary=document.createElement('summary');summary.textContent='Conversation options';options.append(summary);
  for(const child of [...thread.children]){
    if(child===header||child.id==='conversation-typing'||child.id==='message-list')continue;
    if(child.tagName==='LABEL'||child.classList.contains('conversation-toolbar')||child.id==='load-messages'||(child.tagName==='P'&&!child.id))options.append(child);
  }
  header.after(options);
  const call=document.getElementById('call-contact');
  if(call){call.innerHTML=icon('calls');call.setAttribute('aria-label','Call this contact');header.append(call);}

  const menu=document.createElement('button');menu.type='button';menu.innerHTML=icon('more');menu.setAttribute('aria-label','Conversation menu');menu.onclick=()=>{options.open=!options.open;};header.append(menu);
  const create=document.createElement('button');create.type='button';create.className='chat-new';create.innerHTML=icon('plus');create.setAttribute('aria-label','New chat');
  create.onclick=()=>{chat.classList.remove('thread-open');const directory=document.getElementById('contact-directory');directory.open=true;directory.querySelector('input')?.focus();directory.scrollIntoView?.({block:'center'});};sidebar.append(create);
  shell.append(sidebar,thread);chat.append(shell);
  function render(){
    list.replaceChildren();
    const query=search.value.toLocaleLowerCase();
    for(const option of select.options){
      if(!option.value||!option.textContent.toLocaleLowerCase().includes(query))continue;
      const button=document.createElement('button');button.type='button';button.className='chat-contact';
      const avatar=document.createElement('span');avatar.className='chat-avatar';avatar.textContent=option.textContent.trim().slice(0,2).toUpperCase();avatar.setAttribute('aria-hidden','true');
      const name=document.createElement('span');name.className='chat-name';name.textContent=option.textContent;button.append(avatar,name);
      button.setAttribute('aria-pressed',String(option.value===select.value));
      button.addEventListener('click',()=>{select.value=option.value;title.textContent=option.textContent;chat.classList.add('thread-open');select.dispatchEvent(new document.defaultView.Event('change',{bubbles:true}));render();});list.append(button);
    }
    if(!list.children.length){const empty=document.createElement('p');empty.textContent=query?'No matching chats.':'Add a contact to start a conversation.';list.append(empty);}
  }
  search.addEventListener('input',render);select.addEventListener('change',()=>{title.textContent=select.selectedOptions[0]?.textContent||'Select a conversation';render();});
  const observer=new document.defaultView.MutationObserver(render);observer.observe(select,{childList:true,subtree:true,characterData:true});render();
  return {render,dispose:()=>observer.disconnect()};
}
