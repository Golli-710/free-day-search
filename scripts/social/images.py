"""Render area-labelled static SNS cards offline; no paid service or video engine."""
import argparse,json,os
from pathlib import Path
from functools import lru_cache
from PIL import Image,ImageDraw,ImageFont

@lru_cache(maxsize=32)
def font(size):
    candidates=[os.getenv('SOCIAL_FONT',''),'/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc','/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc']
    path=next((p for p in candidates if p and Path(p).is_file()),None)
    if not path:raise ValueError('Japanese font required: set SOCIAL_FONT')
    return ImageFont.truetype(path,size)

def wrap(text,size,width):
    result=[]
    for para in text.split('\n'):
        line=''
        for char in para:
            if font(size).getlength(line+char)>width and line:result.append(line);line=char
            else:line+=char
        result.append(line)
    return result

def text(draw,value,box,max_size=52,min_size=20,color='#183c38'):
    x,y,w,h=box
    for size in range(max_size,min_size-1,-2):
        lines=wrap(value,size,w)
        if len(lines)*size*1.45<=h:
            for i,line in enumerate(lines):draw.text((x,y+i*size*1.45),line,font=font(size),fill=color)
            return
    raise ValueError('Text does not fit; shorten editorial copy before publishing')

def card(post,title,body,path,number,total):
    im=Image.new('RGB',(1080,1350),'#f0f5eb');d=ImageDraw.Draw(im)
    d.rounded_rectangle((50,55,1030,235),32,fill='#183c38')
    text(d,post['region'],(85,90,900,105),62,32,'#effb95')
    text(d,title,(80,285,920,275),76,36)
    d.line((80,585,1000,585),fill='#83a17c',width=4)
    text(d,body,(80,630,920,475),50,22)
    v=post['video']
    text(d,f"情報確認：{v['verified_at']}\n最新情報・臨時変更は施設の公式案内へ",(80,1135,920,95),27,22)
    text(d,f"無料デー検索     {number}/{total}",(80,1250,920,55),32,22)
    im.save(path)

def render_pack(pack,out):
    for post in pack['posts']:
        v=post['video'];folder=out/post['id'];folder.mkdir(parents=True,exist_ok=True)
        if post.get('roundup'):
            members=post['roundup']
            title=f"無料で立ち寄れる候補{len(members)}選"
            slides=[(title,'保存してお出かけ候補に。\n無料の範囲・対象条件は次の画像へ')]
            slides += [(m['name'],f"{m['municipality']}\n候補日：{m['target_date']}\n条件：{m['condition']}\n対象：{m['audience']}\n範囲：{m['scope']}\n休館：{m['closed']}") for m in members]
            slides += [('開館日と条件を確認','最新情報は施設の公式案内へ。\n詳しい条件・ほかの施設は\nプロフィールのリンクから。')]
            for i,(heading,body) in enumerate(slides,1):card(post,heading,body,folder/f'carousel-{i:02}.png',i,len(slides))
            body='\n\n'.join(f"{m['name']}\n候補日：{m['target_date']}\n{m['scope']}／対象：{m['audience']}" for m in members)
            card(post,title,body,folder/'x.png',1,1)
            continue
        slides=[(v['facility_name'],v['date_label']+'\n\n'+v['free_condition']),
          ('無料になる条件',v['free_scope']+'\n\n対象：'+v['audience']),
          ('行く前に確認','開館：'+v['hours']+'\n休館：'+v['closed']+'\n\n'+v['reservation']+'\n'+v['access']),
          ('詳しい条件はサイトへ','ほかの無料スポットも探せます。\n\nプロフィールのリンクから\n無料デー検索へ')]
        for i,(title,body) in enumerate(slides,1):card(post,title,body,folder/f'carousel-{i:02}.png',i,4)
        card(post,v['facility_name'],v['date_label']+'\n'+v['free_condition']+'\n対象：'+v['audience'],folder/'x.png',1,1)
    return len(pack['posts'])

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('manifest',type=Path);args=p.parse_args()
    print(f"{render_pack(json.loads(args.manifest.read_text()),args.manifest.parent)} static image sets rendered")
