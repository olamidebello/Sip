export function languageText(value,max=4000){return typeof value==='string'&&value.trim().length>0&&value.length<=max;}
const active=new Set();
export async function handleLanguageTools({req,res,path,user,send,readJson,fetchImpl=fetch}){
 if(!user.features?.messaging)return send(res,403,{error:'Messaging unavailable'});
 if(process.env.LANGUAGE_TOOLS_ENABLED!=='true')return send(res,503,{error:'Self-hosted language services have not been installed'});
 const translate=process.env.LANGUAGE_TRANSLATE_URL||'http://language-translate:5000',speech=process.env.LANGUAGE_SPEECH_URL||'http://language-speech:8000';
 if(path==='/api/language/capabilities'&&req.method==='GET'){
 try{const r=await fetchImpl(translate+'/languages',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();const langs=await r.json();return send(res,200,{languages:langs.map(x=>({code:x.code,name:x.name,targets:x.targets})),ttsLanguages:['en'],callTranslation:false});}catch{return send(res,503,{error:'Translation models are still starting or unavailable'});}}
 if(req.method!=='POST')return send(res,405,{error:'POST required'});
 if(active.has(user.id))return send(res,429,{error:'A language request is already running'});
 active.add(user.id);
 try{
 const b=await readJson(req,path.endsWith('/transcribe')?1500000:8192);let endpoint,payload;
 if(path==='/api/language/translate'){if(!languageText(b.text)||!/^([a-z]{2,3})$/.test(b.target||''))return send(res,400,{error:'Text and supported target language required'});endpoint=translate+'/translate';payload={q:b.text,source:'auto',target:b.target,format:'text'};}
 else if(path==='/api/language/speak'){if(!languageText(b.text,1000)||b.language!=='en')return send(res,400,{error:'English speech supports 1–1000 characters'});endpoint=speech+'/speak';payload={text:b.text,language:'en'};}
 else if(path==='/api/language/transcribe'){if(typeof b.audio!=='string'||b.audio.length>1333336||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.audio))return send(res,400,{error:'Valid recording up to 1 MB required'});endpoint=speech+'/transcribe';payload={audio:b.audio};}
 else return send(res,404,{error:'Language route unavailable'});
 const r=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});if(!r.ok)return send(res,r.status===429?429:503,{error:'Language service unavailable or language unsupported'});const result=await r.json();
 return send(res,200,path.endsWith('/translate')?{text:result.translatedText}:result);
 }catch{return send(res,503,{error:'Language request failed. Check services and models.'});}finally{active.delete(user.id);}
}
