#!/usr/bin/env python3
"""Render an original, captioned 18-second illustrated product tour."""
from pathlib import Path
import math,subprocess
from PIL import Image,ImageDraw,ImageFont
OUT=Path(__file__).resolve().parents[1]/'apps/web/public/welcome/olamideconnect-demo.mp4'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(size,bold=False):return ImageFont.truetype(BOLD if bold else FONT,size)
def render(t):
 im=Image.new('RGB',(960,540),'#103d32');d=ImageDraw.Draw(im);scene=min(2,int(t/6))
 d.ellipse((650,-140,1150,390),fill='#185442');d.ellipse((-120,420,270,800),fill='#185442')
 d.text((44,35),'olamideconnect',font=font(21,True),fill='#fff4df');d.text((44,79),'CLOSER, WHEREVER.',font=font(10),fill='#c5d5bf')
 titles=[('Your people.','One place.'),('Turn a message','into a moment.'),('Away for a while?','Keep the message.')]
 d.text((44,160),titles[scene][0],font=font(35,True),fill='#fff4df');d.text((44,207),titles[scene][1],font=font(35,True),fill='#ffa785')
 subtitles=['Conversations and contacts, together.','Calling controls, close at hand.','Personal greetings. A place to leave a message.']
 d.text((44,282),subtitles[scene],font=font(13),fill='#c5d5bf')
 d.rounded_rectangle((540,37,905,475),radius=24,fill='#f8f4e9');d.text((566,60),['Conversations','Your next conversation','Voicemail'][scene],font=font(18,True),fill='#143d33')
 if scene==0:
  for i,(name,text,color) in enumerate([('Ada Okafor','Let’s catch up today!','#eec29c'),('Jordan Blake','See you at the meeting.','#a9b896'),('Maya Khan','Thanks for keeping in touch.','#e4c778')]):
   y=114+i*92;d.ellipse((562,y,608,y+46),fill=color);d.text((572,y+13),''.join(n[0] for n in name.split()),font=font(13,True),fill='#244334');d.text((624,y+3),name,font=font(14,True),fill='#193f33');d.text((624,y+29),text,font=font(10),fill='#627769')
  d.rounded_rectangle((568,400,877,444),radius=10,fill='#176858');d.text((646,412),'Keep talking →',font=font(14),fill='white')
 elif scene==1:
  d.ellipse((666,113,780,227),fill='#efc9aa');d.text((699,151),'AO',font=font(28),fill='#674b38');d.text((662,251),'Ada Okafor',font=font(20,True),fill='#173d34');d.text((672,283),'Sample call screen',font=font(10),fill='#627769')
  for i in range(19):
   h=8+20*abs(math.sin(t*3+i*.6));x=625+i*10;d.rounded_rectangle((x,333-h/2,x+4,333+h/2),radius=2,fill='#176858')
  for x,label in [(595,'Mute'),(696,'Hold'),(797,'Keypad')]:
   d.rounded_rectangle((x,380,x+80,428),radius=15,fill='#e0e8d9');d.text((x+17,397),label,font=font(11),fill='#173d34')
 else:
  d.rounded_rectangle((565,113,880,240),radius=15,fill='#e5eadb');d.text((585,140),'“The user is not available.”',font=font(17,True),fill='#173d34');d.text((585,181),'Leave a message after the tone.',font=font(13),fill='#627769');d.text((567,274),'A message worth coming back to.',font=font(13),fill='#173d34');d.rounded_rectangle((566,313,880,381),radius=14,fill='#176858');d.text((588,337),'New voicemail · Sample message',font=font(13),fill='#fff4df');d.text((566,421),'Your greeting. Your connection.',font=font(12),fill='#627769')
 d.text((44,444),'ILLUSTRATED PRODUCT TOUR',font=font(10,True),fill='#c7d6c1');d.text((44,468),'Sample screens · No live calls or messages',font=font(10),fill='#a7bfac')
 d.rectangle((44,507,916,510),fill='#376757');d.rectangle((44,507,44+int(872*t/18),510),fill='#ffa785')
 return im
if __name__=='__main__':
 OUT.parent.mkdir(parents=True,exist_ok=True)
 cmd=['ffmpeg','-y','-f','rawvideo','-pix_fmt','rgb24','-s','960x540','-r','15','-i','-','-an','-c:v','libx264','-preset','fast','-crf','27','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT)]
 p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.DEVNULL)
 try:
  for frame in range(270):p.stdin.write(render(frame/15).tobytes())
 finally:p.stdin.close()
 if p.wait():raise SystemExit('Video encoding failed')
 render(1).save('/tmp/connect-demo-frame.png')
 print(str(OUT),OUT.stat().st_size,'bytes')
