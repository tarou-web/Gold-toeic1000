from PIL import Image, ImageDraw
S=1024
def eyes(d,cx_off=215,cy=430,r=150,pr=72,look=(18,10),white='#ffffff',pupil='#2b2b2b'):
    for sx in (-1,1):
        cx=S//2+sx*cx_off
        d.ellipse((cx-r,cy-r*1.1,cx+r,cy+r*1.1),fill=white)
        px,py=cx+look[0]*(-sx if False else 1)-0, cy+look[1]
        px=cx+ (25 if sx<0 else -25)  # look slightly inward
        d.ellipse((px-pr,py-pr*1.15,px+pr,py+pr*1.15),fill=pupil)
        d.ellipse((px-pr*0.55,py-pr*0.85,px-pr*0.1,py-pr*0.35),fill='#ffffff')
def shiba():
    im=Image.new('RGB',(S,S),'#f0a640');d=ImageDraw.Draw(im)
    # ears
    d.polygon([(40,0),(330,0),(60,300)],fill='#d98a26');d.polygon([(S-40,0),(S-330,0),(S-60,300)],fill='#d98a26')
    d.polygon([(90,30),(260,30),(100,200)],fill='#ffd7a8');d.polygon([(S-90,30),(S-260,30),(S-100,200)],fill='#ffd7a8')
    # white muzzle / cheeks
    d.ellipse((150,560,S-150,S+260),fill='#fff6ea')
    # brows
    for sx in (-1,1):
        cx=S//2+sx*215; d.ellipse((cx-45,215,cx+45,265),fill='#fff6ea')
    eyes(d,cy=440,r=130,pr=66)
    # nose + mouth
    d.ellipse((S//2-70,600,S//2+70,690),fill='#2b2b2b')
    d.arc((S//2-90,640,S//2,760),20,160,fill='#2b2b2b',width=16)
    d.arc((S//2,640,S//2+90,760),20,160,fill='#2b2b2b',width=16)
    d.ellipse((S//2-40,740,S//2+40,830),fill='#ff7b8a')
    return im
def cat():
    im=Image.new('RGB',(S,S),'#8a7cf2');d=ImageDraw.Draw(im)
    d.polygon([(0,0),(320,0),(0,330)],fill='#6d5fd6');d.polygon([(S,0),(S-320,0),(S,330)],fill='#6d5fd6')
    d.polygon([(30,30),(210,30),(30,210)],fill='#ffb3c7');d.polygon([(S-30,30),(S-210,30),(S-30,210)],fill='#ffb3c7')
    d.ellipse((230,600,S-230,S+120),fill='#f3efff')
    eyes(d,cy=450,r=140,pr=60,pupil='#2b2448')
    d.polygon([(S//2-55,640),(S//2+55,640),(S//2,705)],fill='#ff86a6')
    d.arc((S//2-80,660,S//2,770),10,170,fill='#2b2448',width=14)
    d.arc((S//2,660,S//2+80,770),10,170,fill='#2b2448',width=14)
    for sx in (-1,1):
        for dy in (-30,25):
            d.line((S//2+sx*170,690+dy//2,S//2+sx*380,690+dy*2),fill='#2b2448',width=12)
    return im
def bear():
    im=Image.new('RGB',(S,S),'#b0764a');d=ImageDraw.Draw(im)
    for sx in (-1,1):
        cx=S//2+sx*360; d.ellipse((cx-170,-170,cx+170,170),fill='#8f5a33'); d.ellipse((cx-95,-95,cx+95,95),fill='#e8b98c')
    d.ellipse((250,560,S-250,S+80),fill='#f1d3ad')
    eyes(d,cy=430,r=125,pr=64)
    d.ellipse((S//2-75,620,S//2+75,710),fill='#3a2416')
    d.line((S//2,700,S//2,770),fill='#3a2416',width=14)
    d.arc((S//2-90,690,S//2,800),20,160,fill='#3a2416',width=14)
    d.arc((S//2,690,S//2+90,800),20,160,fill='#3a2416',width=14)
    for sx in (-1,1):
        cx=S//2+sx*330; d.ellipse((cx-70,620,cx+70,680),fill='#e58a7a')
    return im
def rounded(im,s):
    im=im.resize((s,s),Image.LANCZOS)
    m=Image.new('L',(s,s),0);ImageDraw.Draw(m).rounded_rectangle((0,0,s-1,s-1),radius=int(s*0.225),fill=255)
    out=Image.new('RGBA',(s,s),(0,0,0,0));out.paste(im,(0,0),m);return out
icons={'shiba':shiba(),'cat':cat(),'bear':bear()}
for k,v in icons.items(): v.save(f'animal-{k}.png')
sheet=Image.new('RGB',(3*300+80,360),'#e9eef5');sd=ImageDraw.Draw(sheet)
for i,k in enumerate(['shiba','cat','bear']):
    r=rounded(icons[k],260);sheet.paste(r,(30+i*310,30),r)
sheet.save('animal-options.png')
