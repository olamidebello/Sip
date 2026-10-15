export function dialTarget(value,domain){
  const target=value.trim();
  if(/^sip:[^\s@]+@[^\s@]+$/i.test(target))return target;
  const number=target.replace(/[\s().-]/g,'');
  if(!/^\+?[0-9*#]+$/.test(number)||!domain||/[\s@/]/.test(domain))throw Error('Enter a number, extension, or SIP address.');
  return `sip:${number}@${domain}`;
}

export function setupDialpad({root,input,inCall,sendTone,onError}){
  const display=root.ownerDocument.createElement('output');display.className='dialpad-number';display.setAttribute('aria-label','Number to call');display.setAttribute('aria-live','polite');
  const updateNumber=()=>{display.textContent=input.value||(input.dataset.routeTarget?'Name unavailable':'Enter a number');};
  input.addEventListener('input',updateNumber);updateNumber();root.append(display);
  const keys=[['1',''],['2','ABC'],['3','DEF'],['4','GHI'],['5','JKL'],['6','MNO'],['7','PQRS'],['8','TUV'],['9','WXYZ'],['*',''],['0','+'],['#','']];
  const grid=root.ownerDocument.createElement('div');grid.className='dialpad-grid';
  for(const [digit,letters] of keys){
    const button=root.ownerDocument.createElement('button');button.type='button';button.dataset.digit=digit;button.setAttribute('aria-label',`${digit}${letters?' '+letters:''}`);
    const number=root.ownerDocument.createElement('span');number.textContent=digit;
    const caption=root.ownerDocument.createElement('small');caption.textContent=letters||'\u00a0';button.append(number,caption);
    let timer,longPressed=false;
    if(digit==='0'){
      button.addEventListener('pointerdown',()=>{longPressed=false;timer=setTimeout(()=>{if(!inCall()){const start=input.selectionStart??input.value.length;input.setRangeText('+',start,input.selectionEnd??start,'end');input.dispatchEvent(new input.ownerDocument.defaultView.Event('input',{bubbles:true}));longPressed=true;}},600);});
      for(const event of ['pointerup','pointerleave','pointercancel'])button.addEventListener(event,()=>clearTimeout(timer));
      button.addEventListener('contextmenu',event=>event.preventDefault());
    }
    button.addEventListener('click',async()=>{
      if(longPressed){longPressed=false;return;}

      if(inCall()){try{await sendTone(digit);}catch(error){onError(error);}return;}
      const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;
      input.setRangeText(digit,start,end,'end');input.focus();
      input.dispatchEvent(new input.ownerDocument.defaultView.Event('input',{bubbles:true}));
    });grid.append(button);
  }
  input.addEventListener('keydown',async event=>{
    if(!inCall())return;
    if(/^[0-9*#]$/.test(event.key)&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();if(!event.repeat)try{await sendTone(event.key);}catch(error){onError(error);}}
    else if(event.key==='Enter')event.preventDefault();
  });
  root.append(grid);
  input.inputMode="tel";
  input.setAttribute("aria-label","Number, extension or SIP address");
  input.setAttribute("autocapitalize","none");input.spellcheck=false;
  for(const [label,action] of [['Delete last digit',()=>{if(!input.value)delete input.dataset.routeTarget;const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;input.setRangeText('',start===end?Math.max(0,start-1):start,end,'end');}],['Clear number',()=>{delete input.dataset.routeTarget;input.value='';}]]){
    const button=root.ownerDocument.createElement('button');button.type='button';button.textContent=label;button.className=label==='Delete last digit'?'dialpad-backspace':'dialpad-clear';button.setAttribute('aria-label',label);
    if(label==='Delete last digit'){
      let timer,cleared=false;
      button.addEventListener('pointerdown',()=>{cleared=false;timer=setTimeout(()=>{if(!inCall()){delete input.dataset.routeTarget;input.value='';input.dispatchEvent(new input.ownerDocument.defaultView.Event('input',{bubbles:true}));cleared=true;}},600);});
      for(const event of ['pointerup','pointerleave','pointercancel'])button.addEventListener(event,()=>clearTimeout(timer));
      button.addEventListener('contextmenu',event=>event.preventDefault());
      button.addEventListener('click',event=>{if(cleared){cleared=false;event.stopImmediatePropagation();}});
    }
    button.addEventListener('click',()=>{if(!inCall()){action();input.focus();input.dispatchEvent(new input.ownerDocument.defaultView.Event("input",{bubbles:true}));}});root.append(button);
  }
  const plus=root.ownerDocument.createElement('button');plus.type='button';plus.className='dialpad-plus';plus.textContent='Insert +';plus.setAttribute('aria-label','Insert international plus prefix');
  plus.onclick=()=>{if(inCall())return;const start=input.selectionStart??input.value.length;input.setRangeText('+',start,input.selectionEnd??start,'end');input.dispatchEvent(new input.ownerDocument.defaultView.Event('input',{bubbles:true}));};root.append(plus);

}
