from PIL import Image, ImageDraw
import math
S=1024; C=S//2
def eye(d,cx,cy,r=125,pr=64,white='#ffffff',pupil='#2b2b2b',inward=0):
    d.ellipse((cx-r,cy-r*1.1,cx+r,cy+r*1.1),fill=white)
    px=cx+inward
    d.ellipse((px-pr,cy-pr*1.15,px+pr,cy+pr*1.15),fill=pupil)
    d.ellipse((px-pr*0.55,cy-pr*0.85,px-pr*0.1,cy-pr*0.35),fill='#ffffff')
def eyes(d,off=215,cy=430,**k):
    eye(d,C-off,cy,inward=22,**k); eye(d,C+off,cy,inward=-22,**k)

def elephant():
    im=Image.new('RGB',(S,S),'#8ea7cc');d=ImageDraw.Draw(im)
    for sx in (-1,1):
        cx=C+sx*500; d.ellipse((cx-300,120,cx+300,820),fill='#7a93ba'); d.ellipse((cx-200,230,cx+200,710),fill='#f2b6c4')
    eyes(d,off=200,cy=380,r=115,pr=60)
    # trunk
    d.rounded_rectangle((C-95,470,C+95,S-120),radius=95,fill='#a3badb')
    for y in range(600,S-140,70): d.arc((C-80,y-20,C+80,y+20),200,340,fill='#7a93ba',width=10)
    d.ellipse((C-110,S-200,C+110,S-60),fill='#a3badb')
    d.ellipse((C-45,S-150,C-5,S-110),fill='#5f769c');d.ellipse((C+5,S-150,C+45,S-110),fill='#5f769c')
    # tusks
    for sx in (-1,1):
        d.polygon([(C+sx*120,720),(C+sx*190,720),(C+sx*230,880)],fill='#fff8e8')
    for sx in (-1,1): d.ellipse((C+sx*330-60,560,C+sx*330+60,615),fill='#e98fa3')
    return im

def chimp():
    im=Image.new('RGB',(S,S),'#5e3f2c');d=ImageDraw.Draw(im)
    for sx in (-1,1):
        cx=C+sx*470; d.ellipse((cx-150,300,cx+150,600),fill='#e7b48f'); d.ellipse((cx-85,370,cx+85,530),fill='#c98d68')
    face='#f0c7a3'
    d.ellipse((C-380,210,C+20,620),fill=face); d.ellipse((C-20,210,C+380,620),fill=face)
    d.ellipse((C-330,470,C+330,S+60),fill=face)
    # brow ridge
    eyes(d,off=185,cy=420,r=110,pr=58,pupil='#2a1a10')
    d.ellipse((C-60,600,C-15,650),fill='#5e3f2c');d.ellipse((C+15,600,C+60,650),fill='#5e3f2c')
    d.arc((C-210,560,C+210,860),25,155,fill='#5e3f2c',width=18)
    for sx in (-1,1): d.ellipse((C+sx*300-55,600,C+sx*300+55,650),fill='#e9918a')
    return im

def octopus():
    im=Image.new('RGB',(S,S),'#ff7d6e');d=ImageDraw.Draw(im)
    # head shading highlight
    d.ellipse((150,-250,700,250),fill='#ff9183')
    d.ellipse((230,70,330,130),fill='#ffb3a9');d.ellipse((350,40,410,80),fill='#ffb3a9')
    # tentacles at bottom
    n=6
    for i in range(n):
        x=int(-40+i*(S+80)/(n-1)); d.ellipse((x-120,S-170,x+120,S+90),fill='#ef5f52')
        for j in range(3): d.ellipse((x-60+j*45,S-70,x-25+j*45,S-35),fill='#ffc2b9')
    eyes(d,off=210,cy=440,r=125,pr=62)
    # mouth
    d.ellipse((C-70,620,C+70,740),fill='#d94f45'); d.ellipse((C-38,655,C+38,710),fill='#9c2f2a')
    for sx in (-1,1): d.ellipse((C+sx*340-60,610,C+sx*340+60,665),fill='#ff4f6d')
    return im

def parrot():
    im=Image.new('RGB',(S,S),'#9aa3ad');d=ImageDraw.Draw(im)
    # scalloped feathers texture
    for y in range(40,560,110):
        for x in range(-40,S+80,140): d.arc((x-70+(y//110%2)*70,y-50,x+70+(y//110%2)*70,y+50),20,160,fill='#8a939e',width=10)
    # white face patches
    for sx in (-1,1): d.ellipse((C+sx*215-185,240,C+sx*215+185,620),fill='#f4f6f8')
    eyes(d,off=215,cy=430,r=105,pr=58,white='#fff3c4',pupil='#222')
    # beak: rounded upper mandible with a hook curling down, small lower jaw
    d.ellipse((C-120,505,C+120,700),fill='#2c2c30')
    d.polygon([(C-70,650),(C+118,610),(C+60,760),(C+25,800),(C+5,770)],fill='#2c2c30')
    d.ellipse((C-85,665,C+20,745),fill='#45454d')
    d.arc((C-85,530,C+60,640),200,290,fill='#5c5c66',width=14)
    # red tail feathers peeking at bottom
    d.rectangle((0,S-110,S,S),fill='#9aa3ad')
    for i in range(7):
        x=i*S//6; d.ellipse((x-95,S-120,x+95,S+120),fill='#e23b3b')
    return im

icons={'elephant':elephant(),'chimp':chimp(),'octopus':octopus(),'parrot':parrot()}
for k,v in icons.items(): v.save(f'animal-{k}.png')
def rounded(im,s):
    im=im.resize((s,s),Image.LANCZOS)
    m=Image.new('L',(s,s),0);ImageDraw.Draw(m).rounded_rectangle((0,0,s-1,s-1),radius=int(s*0.225),fill=255)
    out=Image.new('RGBA',(s,s),(0,0,0,0));out.paste(im,(0,0),m);return out
order=['bear','elephant','chimp','octopus','parrot']
icons['bear']=Image.open('animal-bear.png')
sheet=Image.new('RGB',(len(order)*240+20,260),'#e9eef5')
for i,k in enumerate(order):
    r=rounded(icons[k],210);sheet.paste(r,(25+i*240,25),r)
sheet.save('animal-options2.png')
