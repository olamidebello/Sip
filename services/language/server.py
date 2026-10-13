import base64,io,os,tempfile,threading,wave
from flask import Flask,request,jsonify
from faster_whisper import WhisperModel
from piper import PiperVoice
app=Flask(__name__);app.config['MAX_CONTENT_LENGTH']=1500000
lock=threading.Lock();whisper=None;voice=None
@app.get('/health')
def health():return jsonify(ready=True,ttsLanguages=['en'],callTranslation=False)
@app.post('/transcribe')
def transcribe():
 data=request.get_json();audio=base64.b64decode(data.get('audio',''),validate=True)
 if not audio or len(audio)>1000000:return jsonify(error='Audio limit exceeded'),400
 global whisper
 if not lock.acquire(blocking=False):return jsonify(error='Speech service busy'),429
 try:
  if whisper is None:whisper=WhisperModel('tiny',device='cpu',compute_type='int8',download_root='/models/whisper')
  with tempfile.NamedTemporaryFile() as f:
   f.write(audio);f.flush();segments,info=whisper.transcribe(f.name,beam_size=1,vad_filter=True)
   text=' '.join(s.text for s in segments)[:4000]
  return jsonify(text=text,language=info.language)
 finally:lock.release()
@app.post('/speak')
def speak():
 data=request.get_json();text=data.get('text','')
 if not isinstance(text,str) or not 1<=len(text)<=1000 or data.get('language','en')!='en':return jsonify(error='English text, 1–1000 characters required'),400
 global voice
 if not lock.acquire(blocking=False):return jsonify(error='Speech service busy'),429
 try:
  if voice is None:voice=PiperVoice.load('/models/en_US-lessac-medium.onnx')
  output=io.BytesIO()
  with wave.open(output,'wb') as f:voice.synthesize_wav(text,f)
  return jsonify(audio=base64.b64encode(output.getvalue()).decode(),mime='audio/wav')
 finally:lock.release()
