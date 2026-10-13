export function chatDayLabel(value,now=new Date()){
 const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
 const day=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
 if(day(date)===day(now))return 'Today';const yesterday=new Date(now);yesterday.setDate(now.getDate()-1);if(day(date)===day(yesterday))return 'Yesterday';
 return date.toLocaleDateString(undefined,{day:'numeric',month:'long',year:date.getFullYear()!==now.getFullYear()?'numeric':undefined});
}
export function messageReceipt(message){return message.read_at?{label:'Read',symbol:'✓✓',read:true}:{label:'Sent',symbol:'✓',read:false};}
export function setupMessageDetails(document){
 const dialog=document.createElement('dialog');dialog.className='chat-message-dialog';const title=document.createElement('h2'),content=document.createElement('div'),close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>{if(dialog.close)dialog.close();else dialog.open=false;};dialog.append(title,content,close);document.body.append(dialog);
 function open(heading,message,copy=false){title.textContent=heading;content.replaceChildren();if(copy){const text=document.createElement('textarea');text.readOnly=true;text.value=message.body;content.append(text);}else{const text=document.createElement('p');text.textContent=message.body;const dates=document.createElement('dl');for(const [label,value]of [['Sent',message.created_at],['Read',message.read_at],['Edited',message.edited_at]]){if(!value)continue;const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=new Date(value).toLocaleString();dates.append(term,detail);}content.append(text,dates);}if(dialog.showModal)dialog.showModal();else dialog.open=true;if(copy){content.querySelector('textarea').focus();content.querySelector('textarea').select();}}
 return {info:message=>open('Message info',message),async copy(message){try{if(!document.defaultView.navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await document.defaultView.navigator.clipboard.writeText(message.body);return true;}catch{open('Copy message text',message,true);return false;}},close(){if(dialog.close)dialog.close();else dialog.open=false;},dispose(){dialog.remove();}};
}
