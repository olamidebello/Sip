export function setupChatLanding(document){
  const chat=document.getElementById('chat'),select=document.getElementById('contact-list');
  const shell=document.createElement('div');shell.className='chat-shell';
  const sidebar=document.createElement('aside');sidebar.className='chat-sidebar';sidebar.setAttribute('aria-label','Conversations');
  const search=document.createElement('input');search.type='search';search.placeholder='Search chats';search.setAttribute('aria-label','Search chats');
  const list=document.createElement('div');list.className='chat-conversations';
  sidebar.append(search,list,document.getElementById('contact-directory'));
  const thread=document.createElement('div');thread.className='chat-thread';
  for(const child of [...chat.children])if(!child.matches('h2,.messenger-subtitle'))thread.append(child);
  shell.append(sidebar,thread);chat.append(shell);
  function render(){
    list.replaceChildren();
    const query=search.value.toLocaleLowerCase();
    for(const option of select.options){
      if(!option.value||!option.textContent.toLocaleLowerCase().includes(query))continue;
      const button=document.createElement('button');button.type='button';button.className='chat-contact';button.textContent=option.textContent;
      button.setAttribute('aria-pressed',String(option.value===select.value));
      button.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new document.defaultView.Event('change',{bubbles:true}));render();});list.append(button);
    }
    if(!list.children.length){const empty=document.createElement('p');empty.textContent=query?'No matching chats.':'Add a contact to start a conversation.';list.append(empty);}
  }
  search.addEventListener('input',render);select.addEventListener('change',render);
  const observer=new document.defaultView.MutationObserver(render);observer.observe(select,{childList:true,subtree:true,characterData:true});render();
  return {render,dispose:()=>observer.disconnect()};
}
