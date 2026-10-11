export function dialTarget(value,domain){
  const target=value.trim();
  if(/^sip:[^\s@]+@[^\s@]+$/i.test(target))return target;
  const number=target.replace(/[\s().-]/g,'');
  if(!/^\+?[0-9*#]+$/.test(number)||!domain||/[\s@/]/.test(domain))throw Error('Enter a number, extension, or SIP address.');
  return `sip:${number}@${domain}`;
}

export function setupDialpad({root,input,inCall,sendTone,onError}){
  const keys=[['1',''],['2','ABC'],['3','DEF'],['4','GHI'],['5','JKL'],['6','MNO'],['7','PQRS'],['8','TUV'],['9','WXYZ'],['*',''],['0','+'],['#','']];
  const grid=root.ownerDocument.createElement('div');grid.className='dialpad-grid';
  for(const [digit,letters] of keys){
    const button=root.ownerDocument.createElement('button');button.type='button';button.dataset.digit=digit;button.setAttribute('aria-label',`${digit}${letters?' '+letters:''}`);
    const number=root.ownerDocument.createElement('span');number.textContent=digit;
    const caption=root.ownerDocument.createElement('small');caption.textContent=letters||'\u00a0';button.append(number,caption);
    button.addEventListener('click',async()=>{
      if(inCall()){try{await sendTone(digit);}catch(error){onError(error);}return;}
      const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;
      input.setRangeText(digit,start,end,'end');input.focus();
      input.dispatchEvent(new input.ownerDocument.defaultView.Event('input',{bubbles:true}));
    });grid.append(button);
  }
  root.append(grid);
  for(const [label,action] of [['Delete last digit',()=>{input.value=input.value.slice(0,-1);}],['Clear number',()=>{input.value='';}]]){
    const button=root.ownerDocument.createElement('button');button.type='button';button.textContent=label;
    button.addEventListener('click',()=>{if(!inCall()){action();input.focus();}});root.append(button);
  }
}
