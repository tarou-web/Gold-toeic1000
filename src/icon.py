from PIL import Image, ImageDraw, ImageFont
S=1024
img=Image.new('RGB',(S,S),'#4cc21c')
d=ImageDraw.Draw(img)
# soft highlight circle
hl=Image.new('RGBA',(S,S),(0,0,0,0));hd=ImageDraw.Draw(hl)
hd.ellipse((-200,-300,700,500),fill=(255,255,255,28)); img.paste(hl,(0,0),hl)
def card(cx,cy,w,h,angle,fill,shadow,edge):
    L=Image.new('RGBA',(S,S),(0,0,0,0));ld=ImageDraw.Draw(L)
    x0,y0=cx-w//2,cy-h//2
    ld.rounded_rectangle((x0,y0+28,x0+w,y0+h+28),radius=70,fill=shadow)
    ld.rounded_rectangle((x0,y0,x0+w,y0+h),radius=70,fill=fill)
    return L.rotate(angle,center=(cx,cy),resample=Image.BICUBIC)
back=card(560,500,520,620,-12,'#2fa8f0',(29,134,196,255),None)
img.paste(back,(0,0),back)
front=card(470,530,520,620,6,'#ffffff',(214,222,214,255),None)
img.paste(front,(0,0),front)
# text on front card
T=Image.new('RGBA',(S,S),(0,0,0,0));td=ImageDraw.Draw(T)
f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',190)
txt='1000';bb=td.textbbox((0,0),txt,font=f)
td.text((470-(bb[2]-bb[0])//2-bb[0],560-(bb[3]-bb[1])//2-bb[1]),txt,font=f,fill='#3a9a12')
# underline bar
td.rounded_rectangle((340,690,600,722),radius=16,fill='#ffb21e')
T=T.rotate(6,center=(470,530),resample=Image.BICUBIC)
img.paste(T,(0,0),T)
for n,s in [('apple-touch-icon.png',180),('icon-192.png',192),('icon-512.png',512)]:
    img.resize((s,s),Image.LANCZOS).save('site/'+n)
img.resize((256,256),Image.LANCZOS).save('icon-preview.png')
