import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {selectCandidate,jstToday,weightedLength,SITE_URL,formatTargetDate} from '../../src/social/generator.js';
import {readHistory,historyRecord} from './history.mjs';

export function trackingLink(facilityId,date,format) {
  if (!['x','carousel','story','reel'].includes(format) || !/^[a-z0-9-]+$/.test(facilityId)) throw Error('Invalid post identifier');
  const u=new URL(`facility/${facilityId}/`,SITE_URL);
  u.searchParams.set('utm_source',format==='x'?'x':'instagram');
  u.searchParams.set('utm_medium','social'); u.searchParams.set('utm_campaign','free_day_trial');
  u.searchParams.set('utm_content',`${facilityId}_${date}_${format}`); return u.href;
}
export function buildTrial(facilities,history,start,weeks=4) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isInteger(weeks) || weeks<1 || weeks>4) throw Error('Start YYYY-MM-DD; weeks 1–4');
  const first=new Date(`${start}T08:00:00Z`);
  if (Number.isNaN(first.valueOf()) || jstToday(first)!==start) throw Error('Invalid start date');
  const planned=structuredClone(history),posts=[],skipped=[];
  for (let offset=0;offset<weeks*7;offset++) {
    const now=new Date(first.valueOf()+offset*86400000),weekday=now.getUTCDay();
    const format=[1,3,5].includes(weekday)?'x':weekday===2?'carousel':weekday===4?'reel':null;
    if(!format) continue;
    const day=jstToday(now), candidate=selectCandidate(facilities,planned,now);
    if(!candidate){skipped.push({day,format,reason:'確認済み候補なし／重複回避'});continue;}
    const f=facilities.find(f=>f.facility_id===candidate.facilityId);
    const url=trackingLink(candidate.facilityId,day,format);
    const text=candidate.text.replace(candidate.url,url);
    if(weightedLength(text)>280) throw Error('X length exceeded');
    const visit=f.visit_info?.status==='confirmed'?f.visit_info:null;
    const video={schema_version:1,type:'free_outing',brand:'無料デー検索',facility_id:f.facility_id,facility_name:f.name,region:`${f.prefecture}・${f.municipality}`,target_date:candidate.targetDate,date_label:formatTargetDate(candidate.targetDate),free_condition:candidate.ruleLabel,free_scope:visit?.free_scope||f.free_conditions||candidate.ruleLabel,audience:candidate.targetConditions,hours:f.hours||'公式案内を確認',closed:f.closed||'公式案内を確認',reservation:visit?.reservation||'予約条件は施設の公式案内をご確認ください。',access:visit?.access||f.address,verified_at:f.last_checked||f.last_verified_date,source_url:f.source_url||f.official_url,url:trackingLink(f.facility_id,day,'reel'),cta:'無料条件・開館日を確認\nプロフィールのリンクから',duration:15,template:'friendly'};
    const caption=`${f.name}\n${video.region}\n\n${video.date_label}\n大人・一般の対象条件：${video.audience}\n無料条件：${video.free_condition}\n無料の範囲：${video.free_scope}\n営業時間：${video.hours}\n休館：${video.closed}\n\n予約：${video.reservation}\nアクセス：${video.access}\n\n情報確認日：${video.verified_at}\n最新情報は施設公式案内でご確認ください。\n詳しい条件はプロフィールのリンクから。\n\n#無料デー検索 #無料のお出かけ\n\n投稿用リンク：${url}\nストーリーズ用：${trackingLink(f.facility_id,day,'story')}`;
    posts.push({id:`${day}_${format}_${f.facility_id}`,scheduled_at:`${day}T17:00:00+09:00`,format,status:'draft',candidate,text:format==='x'?text:caption,url,source_url:video.source_url,video});
    // Simulate spacing in memory only; drafts never update actual posting history.
    planned.posts.push(historyRecord(candidate,{status:'posted',scheduledAt:`${day}T17:00:00+09:00`,postedAt:now.toISOString()}));
  }
  return {schema_version:1,start,weeks,campaign:'free_day_trial',posts,skipped};
}
function esc(t){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export async function writePack(pack,out) {
  await mkdir(out,{recursive:true});
  await writeFile(resolve(out,'manifest.json'),JSON.stringify(pack,null,2)+'\n');
  const csv=['投稿ID,予定日時,媒体・形式,対象施設,対象日,計測リンク,公開URL,制作分,表示回数,サイト訪問,公式クリック,収益円'];
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  for(const post of pack.posts){
    await writeFile(resolve(out,`${post.id}.txt`),post.text+'\n');
    await writeFile(resolve(out,`${post.id}.video.json`),JSON.stringify(post.video,null,2)+'\n');
    csv.push([post.id,post.scheduled_at,post.format,post.candidate.facilityName,post.candidate.targetDate,post.url,'','','','','',''].map(quote).join(','));
  }
  await writeFile(resolve(out,'measurement.csv'),'\uFEFF'+csv.join('\n')+'\n');
  await writeFile(resolve(out,'index.html'),`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>無料デー検索 投稿キット</title><style>body{font:16px/1.8 sans-serif;background:#f4f7f2;color:#20382f;max-width:980px;margin:auto;padding:24px}article{background:white;padding:24px;margin:24px 0;border-radius:16px}textarea{width:100%;min-height:220px;box-sizing:border-box}a{color:#35634f}img{width:240px;max-width:100%}</style><h1>無料デー検索・4週間の投稿キット</h1><p>${esc(pack.start)}から${pack.weeks}週間／${pack.posts.length}件の下書き。投稿前に無料条件・休館・臨時変更と画像を確認してください。自動投稿はしません。</p><p>Instagramは画像内のURLではなく、プロフィールまたはストーリーズのリンクから誘導します。形式別の計測リンクを使ってください。</p><p><a href="measurement.csv">計測表をダウンロード</a> ・ <a href="manifest.json">全素材データ</a></p>${pack.posts.map(p=>`<article><h2>${esc(p.scheduled_at.slice(0,10))} / ${esc(p.format)} / ${esc(p.candidate.facilityName)}</h2><p>対象日：${esc(p.candidate.targetDate)} ・ <a href="${esc(p.source_url)}">施設公式情報</a></p><textarea readonly>${esc(p.text)}</textarea><p><a href="${esc(p.id)}.txt">投稿文</a> ・ <a href="${esc(p.id)}.video.json">動画入力JSON</a> ・ <a href="${esc(p.url)}">計測リンク</a></p><p><a href="${esc(p.id)}/carousel-01.png">画像1</a> ・ <a href="${esc(p.id)}/carousel-02.png">画像2</a> ・ <a href="${esc(p.id)}/carousel-03.png">画像3</a> ・ <a href="${esc(p.id)}/carousel-04.png">画像4</a> ・ <a href="${esc(p.id)}/story.png">ストーリーズ画像</a>${p.format==='reel'?` ・ <a href="${esc(p.id)}/reel.mp4">15秒動画</a>`:''}</p><p>画像・動画はrender.pyで作成してから開けます。</p></article>`).join('')}</html>`);
}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),value=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
  const ctx={window:{}};vm.runInNewContext(await readFile(resolve(root,'data.js'),'utf8'),ctx,{timeout:1500});
  const history=await readHistory(resolve(root,'social/history.json'));
  const start=value('--start',jstToday()),weeks=Number(value('--weeks','4')),out=resolve(root,value('--out','social/outbox/trial'));
  const pack=buildTrial(ctx.window.FACILITIES,history,start,weeks);await writePack(pack,out);
  console.log(`${pack.posts.length} drafts / ${pack.skipped.length} skipped → ${out}`);
}
