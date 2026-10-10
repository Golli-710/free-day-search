"""Generate PNG cards and an outing reel using an existing golli-video-engine.
The engine project is imported read-only; its salon/recruitment planner is untouched.
"""
import argparse, importlib.util, json, sys
from pathlib import Path

def validate(data):
    if data.get('type') != 'free_outing' or data.get('duration') != 15:
        raise ValueError('free_outing / 15秒の入力を指定してください')
    for name in ['brand','facility_name','region','date_label','free_condition','audience','hours','closed','reservation','access','verified_at','source_url','url','cta']:
        if not isinstance(data.get(name),str) or not data[name].strip() or len(data[name]) > 600:
            raise ValueError(f'{name}: 1〜600文字の確認済み情報が必要です')
    for name in ['source_url','url']:
        if not data[name].startswith('https://'):raise ValueError('HTTPS URLが必要です')
    return data

def load_engine(path):
    entry=Path(path)/'engine/video.py'
    if not entry.is_file():raise ValueError('golli-video-engineのディレクトリを指定してください')
    spec=importlib.util.spec_from_file_location('golli_outing_backend',entry)
    engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
    return engine

def scenes(data):
    return [
      {'title':data['facility_name'],'lines':[data['region'],data['date_label']],'seconds':3},
      {'title':'無料になる条件','lines':[data['free_condition'],f"対象：{data['audience']}",f"営業時間：{data['hours']}"],'seconds':4},
      {'title':'お出かけ前に','lines':[data['reservation'],data['access']],'seconds':5},
      {'title':'詳しい条件を確認','lines':[data['cta'],data['brand'],'free-day-search.pages.dev'],'seconds':3},
    ]

def poster(engine,data,title,lines,path,height=1920):
    from PIL import Image,ImageDraw
    image=Image.new('RGB',(1080,height),'#f4f7ef');draw=ImageDraw.Draw(image)
    draw.rounded_rectangle((64,100,1016,height-140),radius=36,fill='#ffffff')
    engine.textblock(draw,'無料のお出かけ',(100,150,880,100),'#416953',46)
    engine.textblock(draw,title,(100,310,880,290),'#20392c',76,38)
    y=650 if height==1920 else 570
    engine.textblock(draw,'\n\n'.join(lines),(100,y,880,height-y-310),'#20392c',48,26)
    engine.textblock(draw,f"情報確認：{data['verified_at']}｜最新情報は公式案内へ",(100,height-260,880,90),'#416953',28,24)
    engine.textblock(draw,data['brand'],(100,height-115,880,60),'#416953',32,24)
    image.save(path)

def render(data,out,engine,video=True):
    validate(data);out=Path(out);out.mkdir(parents=True,exist_ok=True)
    slides=[('01',data['facility_name'],[data['region'],data['date_label'],'無料条件は次の画像へ']),
      ('02','無料になる条件',[data['free_condition'],f"対象：{data['audience']}",f"開館：{data['hours']}"]),
      ('03','お出かけ前に',[data['reservation'],data['access']]),
      ('04','詳しい条件を確認',[data['cta'],data['brand'],'free-day-search.pages.dev'])]
    for number,title,lines in slides:poster(engine,data,title,lines,out/f'carousel-{number}.png',1350)
    poster(engine,data,data['facility_name'],[data['region'],data['date_label'],data['free_condition'],data['cta']],out/'story.png')
    if not video:return
    segments=[]
    for i,scene in enumerate(scenes(data)):
        poster(engine,data,scene['title'],scene['lines'],out/f'scene-{i}.png')
        segment=out/f'segment-{i}.mp4';segments.append(segment)
        seconds=scene['seconds'];frames=seconds*engine.FPS
        vf=f"zoompan=z='1+0.01*on/{frames}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={frames}:s=1080x1920:fps={engine.FPS},fade=t=in:st=0:d=0.18,fade=t=out:st={seconds-0.18}:d=0.18,format=yuv420p"
        engine.run(['-i',str(out/f'scene-{i}.png'),'-vf',vf,'-frames:v',str(frames),'-c:v','libx264','-preset','veryfast','-crf','20','-threads','2',str(segment)])
        print(f'{i+1}/4 scenes',flush=True)
    concat=out/'concat.txt';concat.write_text(''.join(f"file '{p.name}'\n" for p in segments))
    engine.run(['-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(out/'reel.mp4')])
    for p in segments:p.unlink()
    concat.unlink()
    (out/'render.json').write_text(json.dumps({'duration':15,'width':1080,'height':1920,'fps':engine.FPS,'source':data,'scenes':scenes(data),'audio':'none','external_api_cost_jpy':0},ensure_ascii=False,indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('input',type=Path);parser.add_argument('--engine',type=Path,required=True);parser.add_argument('--out',type=Path,required=True);parser.add_argument('--images-only',action='store_true');a=parser.parse_args()
    render(json.loads(a.input.read_text()),a.out,load_engine(a.engine),not a.images_only)
