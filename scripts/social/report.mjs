const jstDay = value => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
};
const safe = value => String(value ?? "—").replaceAll("|","\\|").replaceAll("\n","<br>");
const location = p => p.municipality ? `${p.prefecture||""}・${p.municipality}` : (p.prefecture||"未設定");
const countBy = (rows,key) => rows.reduce((counts,row)=>{const value=row[key]||"未設定";counts[value]=(counts[value]||0)+1;return counts;},{});
const countTable = (title,counts) => `### ${title}\n\n${Object.keys(counts).length?Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],"ja")).map(([name,count])=>`- ${name}: ${count}件`).join("\n"):"- まだ履歴がありません"}\n`;

export function buildJobSummary({ candidate, quality, history, scheduledAt, postingEnabled = false, generatedAt = new Date().toISOString() }) {
  const posts=history?.posts||[];
  const cutoff=Date.parse(generatedAt)-7*24*60*60*1000;
  const recent=posts.filter(p=>["dry_run","quality_failed"].includes(p.status)&&Date.parse(p.scheduled_at||"")>=cutoff).sort((a,b)=>String(b.scheduled_at).localeCompare(String(a.scheduled_at)));
  const lines=["# X投稿候補 Dry Run", "", `- 生成日時（JST）: ${jstDay(generatedAt)} ${new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(generatedAt))}`, `- 投稿予定日時（JST）: ${safe(scheduledAt)}`, `- 投稿スイッチ: **${postingEnabled?"有効":"無効（Dry Runのみ）"}**`, ""];
  if(candidate){
    lines.push("## 今回の候補","",`- 施設: **${safe(candidate.facilityName||candidate.facilityId)}**`, `- 地域: ${safe(location(candidate))}`, `- カテゴリ: ${safe(candidate.category)}`, `- 無料になる日: ${safe(candidate.targetDate)}`, `- 無料条件: ${safe(candidate.ruleLabel)}`, `- 成人対象: ${safe(candidate.targetConditions)}`, `- 投稿タイプ・選出理由: ${safe(candidate.postType)} — ${safe(candidate.reason)}`, `- 投稿先URL（UTM付き）: [施設詳細](${candidate.url})`, `- URL: ${candidate.url}`, "", "### 投稿予定本文", "", "```text", candidate.text, "```", "", "### 品質チェック", "", "| 結果 | チェック | 詳細 |", "|---|---|---|");
    for(const check of quality?.checks||[]) lines.push(`| ${check.passed?"PASS":"FAIL"} | ${safe(check.label)} | ${safe(check.detail)} |`);
    lines.push("", `**投稿可能状態: ${quality?.passed?"PASS — 品質チェックを通過":"BLOCKED — 投稿不可"}**`, "", `過去14日以内の重複確認: 同一施設=${quality?.duplicate_checks?.no_post_within_14_days?"なし":"あり"} / 同一施設＋対象日=${quality?.duplicate_checks?.no_same_facility_target_date?"なし":"あり"} / 同一本文=${quality?.duplicate_checks?.no_identical_text?"なし":"あり"}。直近14日Dry Runでの同一施設候補=${quality?.duplicate_checks?.recent_dry_run_same_facility_count??0}件。`, "");
  }else{
    lines.push("## 今回の候補","","**No eligible post candidate** — 確認済みの候補がないか、重複・品質条件で候補がブロックされました。","", "投稿可能状態: **候補なし**", "");
  }
  lines.push("## 直近7日間のDry Run履歴","",`記録: ${recent.length}回`,"");
  if(recent.length){
    lines.push("| 実行日 | 施設 | 地域 | カテゴリ | 対象日 | タイプ | 投稿文 | 選出理由 | 品質 |","|---|---|---|---|---|---|---|---|---|");
    for(const p of recent) lines.push(`| ${safe(jstDay(p.scheduled_at))} | ${safe(p.facility_name||p.facility_id)} | ${safe(location(p))} | ${safe(p.category)} | ${safe(p.target_date)} | ${safe(p.post_type)} | ${safe(p.post_text)} | ${safe(p.reason)} | ${p.quality_passed?"PASS":"FAIL"} |`);
  }else lines.push("まだ7日分のDry Run履歴はありません。");
  lines.push("",countTable("地域別候補数",countBy(recent,"prefecture")),countTable("カテゴリ別候補数",countBy(recent,"category")),"> 地域・カテゴリの件数は直近7日間に選ばれたDry Run候補の回数です。","");
  return lines.join("\n");
}
