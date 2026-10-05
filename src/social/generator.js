import { createHash } from "node:crypto";

export const SITE_URL = "https://golli-710.github.io/free-day-search/";
export const UTM_CAMPAIGN = "free_spot_daily";
export const RULE_TYPES = new Set(["annual_date", "holiday", "specific_date", "nth_weekday", "weekly_weekday", "nearest_weekday", "annual_period"]);
const DAY_MS = 86_400_000;
const pad = n => String(n).padStart(2, "0");
const asDate = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d, n) => new Date(d.getTime() + n * DAY_MS);
const weekdayName = d => ["日", "月", "火", "水", "木", "金", "土"][d.getUTCDay()];
const labelOf = r => String(r.label || "").trim();

export function jstToday(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function eligibilityFor(rule) {
  if (rule.eligibility && typeof rule.eligibility === "object") return rule.eligibility;
  const audience = String(rule.audience || "");
  if (!audience) return { adult_general: rule.type !== "eligibility", adult_eligible: rule.type !== "eligibility", details: "" };
  const youthOnly = /未就学児|小学生|中学生|高校生|18歳未満|\d+歳以下/.test(audience) && !/60歳以上|65歳以上|70歳以上|障害|手帳|大人|一般/.test(audience);
  const studentOnly = /学生/.test(audience) && !/小学生|中学生|高校生|大学生/.test(audience);
  const conditionalAdult = /60歳以上|65歳以上|70歳以上|障害|手帳|市内在住|都内在住|東京都民|横浜市民|区民/.test(audience);
  return { adult_general: false, adult_eligible: !youthOnly && !studentOnly && conditionalAdult, details: audience };
}

export function adultRuleStatus(rule) {
  const e = eligibilityFor(rule);
  if (e.adult_general === true) return "general";
  if (e.adult_eligible === true) return "conditional";
  return "excluded";
}

function confirmedFreeSchedule(f) {
  const status = f.audit?.status || f.audit_status;
  const fields = f.audit?.field_status || {};
  return status === "confirmed" && !["needs_review", "unverified"].includes(fields.free_rules) && !["needs_review", "unverified"].includes(fields.free_days) && !["needs_review", "unverified"].includes(fields.free_conditions);
}

function rulesFor(f) {
  if (Array.isArray(f.free_rules) && f.free_rules.length) return f.free_rules;
  return (f.free_days || f.free_dates || []).map(md => ({ type: "annual_date", month_day: md, label: `${Number(md.slice(0, 2))}月${Number(md.slice(3))}日` }));
}

function nthWeekday(year, month, ordinal, weekday) {
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const day = 1 + ((weekday - first.getUTCDay() + 7) % 7) + (ordinal - 1) * 7;
  const result = new Date(Date.UTC(year, month - 1, day, 12));
  return result.getUTCMonth() === month - 1 ? result : null;
}

function equinox(year, spring) {
  if (year < 1980 || year > 2099) return null;
  const base = year - 1980;
  return Math.floor((spring ? 20.8431 : 23.2488) + 0.242194 * base - Math.floor(base / 4));
}

const fixedHolidays = [[1,1,"元日"],[2,11,"建国記念の日"],[2,23,"天皇誕生日"],[4,29,"昭和の日"],[5,3,"憲法記念日"],[5,4,"みどりの日"],[5,5,"こどもの日"],[8,11,"山の日"],[11,3,"文化の日"],[11,23,"勤労感謝の日"]];
function holidays(year) {
  const map = new Map();
  const add = (d, name) => { if (d) map.set(iso(d), name); };
  for (const y of [year - 1, year]) {
    fixedHolidays.forEach(([m,d,n]) => add(new Date(Date.UTC(y,m-1,d,12)), n));
    add(nthWeekday(y,1,2,1),"成人の日"); add(nthWeekday(y,7,3,1),"海の日"); add(nthWeekday(y,9,3,1),"敬老の日"); add(nthWeekday(y,10,2,1),"スポーツの日");
    const spring = equinox(y,true), autumn = equinox(y,false);
    if (spring) add(new Date(Date.UTC(y,2,spring,12)),"春分の日");
    if (autumn) add(new Date(Date.UTC(y,8,autumn,12)),"秋分の日");
  }
  for (let d = new Date(Date.UTC(year,0,2,12)); d.getUTCFullYear() === year; d = addDays(d,1)) {
    if (!map.has(iso(d)) && map.has(iso(addDays(d,-1))) && map.has(iso(addDays(d,1)))) map.set(iso(d),"国民の休日");
  }
  for (const key of [...map.keys()]) {
    const d = asDate(key);
    if (d.getUTCFullYear() === year && d.getUTCDay() === 0) {
      let sub = addDays(d,1); while (map.has(iso(sub))) sub = addDays(sub,1);
      if (sub.getUTCFullYear() === year) map.set(iso(sub),"振替休日");
    }
  }
  return new Map([...map].filter(([key]) => asDate(key).getUTCFullYear() === year));
}

function movableHoliday(rule, year) {
  const label = labelOf(rule);
  if (/成人の日/.test(label)) return nthWeekday(year,1,2,1);
  if (/海の日/.test(label)) return nthWeekday(year,7,3,1);
  if (/敬老の日/.test(label)) return nthWeekday(year,9,3,1);
  if (/スポーツの日|体育の日/.test(label)) return nthWeekday(year,10,2,1);
  if (/春分の日/.test(label)) { const d = equinox(year,true); return d ? new Date(Date.UTC(year,2,d,12)) : null; }
  if (/秋分の日/.test(label)) { const d = equinox(year,false); return d ? new Date(Date.UTC(year,8,d,12)) : null; }
  return null;
}

export function matchesRule(rule, d) {
  const md = `${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  if (rule.type === "always_free") return true;
  if (rule.type === "annual_date" || rule.type === "holiday") {
    const movable = movableHoliday(rule, d.getUTCFullYear());
    return movable ? iso(movable) === iso(d) : md === rule.month_day;
  }
  if (rule.type === "specific_date") return iso(d) === rule.date;
  if (rule.type === "nth_weekday") return (!rule.month || rule.month === d.getUTCMonth()+1) && !(rule.excluded_months || []).includes(d.getUTCMonth()+1) && d.getUTCDay() === rule.weekday && Math.floor((d.getUTCDate()-1)/7)+1 === rule.ordinal;
  if (rule.type === "weekly_weekday") return d.getUTCDay() === rule.weekday;
  if (rule.type === "nearest_weekday") {
    if (d.getUTCMonth()+1 !== rule.month) return false;
    const dates = [];
    for (let delta=-7; delta<=7; delta++) { const candidate = new Date(Date.UTC(d.getUTCFullYear(),rule.month-1,rule.day+delta,12)); if (candidate.getUTCDay() === rule.weekday) dates.push({candidate,delta}); }
    dates.sort((a,b) => Math.abs(a.delta)-Math.abs(b.delta) || a.delta-b.delta);
    return !!dates[0] && iso(dates[0].candidate) === iso(d);
  }
  if (rule.type === "annual_period") return md >= rule.start && md <= rule.end;
  return false;
}

export function isOpenOn(f, d) {
  const weekday = d.getUTCDay(), day = d.getUTCDate(), md = `${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  const holiday = holidays(d.getUTCFullYear()).has(iso(d));
  if (Array.isArray(f.open_weekdays) && !f.open_weekdays.includes(weekday)) return false;
  if ((f.closed_weekdays || []).includes(weekday) && !(holiday && (f.open_on_holidays || []).includes(weekday))) return false;
  if (f.closed_holidays && holiday) return false;
  if (f.closed_day_after_holiday && holidays(d.getUTCFullYear()).has(iso(addDays(d,-1)))) return false;
  if ((f.closed_nth_weekdays || []).some(r => weekday === r.weekday && (r.month == null || r.month === d.getUTCMonth()+1) && Math.floor((day-1)/7)+1 === r.ordinal)) return false;
  if ((f.closed_month_days || []).includes(md)) return false;
  return !(f.closed_dates || []).includes(iso(d));
}

const weekdayLabel = d => `${d.getUTCFullYear()}年${d.getUTCMonth()+1}月${d.getUTCDate()}日（${weekdayName(d)}${holidays(d.getUTCFullYear()).has(iso(d)) ? "・祝" : ""}）`;
const displayDate = d => `${d.getUTCMonth()+1}月${d.getUTCDate()}日（${weekdayName(d)}）`;
const audienceFor = r => String(eligibilityFor(r).details || r.audience || "対象条件あり").trim();
const feeShort = f => {
  const value=String(f.regular_fee||"").replace(/\s+/g," ").trim();
  return /^(無料|常時無料|入館無料)[。．]?$/.test(value)?"":value;
};
const conditionFor = r => labelOf(r) || "施設公式情報に記載の無料日";
const categoryIcon = c => ({"美術館":"🎨","博物館":"🏛️","科学館":"🔬","動物園":"🦁","水族館":"🐟","植物園":"🌿","庭園":"🌳"}[c] || "🎟️");
const regionText = f => `${(f.prefecture || "").replace(/[都府県]$/,"")}・${f.municipality || ""}`.trim();

function withUtm(path, campaign) {
  const u = new URL(path, SITE_URL);
  u.searchParams.set("utm_source","x"); u.searchParams.set("utm_medium","social"); u.searchParams.set("utm_campaign",UTM_CAMPAIGN); u.searchParams.set("utm_content",campaign);
  return u.href;
}

function makeText(f, d, kind, rule, url) {
  const label = conditionFor(rule);
  const target = adultRuleStatus(rule) === "conditional" ? `\n⚠️ 対象条件：${audienceFor(rule)}` : "";
  const freeText = adultRuleStatus(rule) === "conditional" ? `大人も条件付きで無料` : `大人・一般：無料`;
  const date = displayDate(d);
  const place = regionText(f);
  const icon = categoryIcon(f.category);
  const fee = feeShort(f);
  if (kind === "tomorrow" && fee && fee.length <= 28) return `🎟️ 明日無料になる施設をチェック\n\n${icon} ${f.name}\n📍 ${place}\n📅 ${date}\n通常料金：${fee}\n→ ${freeText}（${label}）${target}\n\n${url}`;
  if (kind === "tomorrow") return `📅 明日、無料で行ける施設\n\n${icon} ${f.name}\n📍 ${place}\n📅 ${date}\n💰 ${freeText}（${label}）${target}\n\n詳しい条件はこちら👇\n${url}`;
  if (kind === "today") return `📍 今日無料で行ける施設\n\n${icon} ${f.name}\n📍 ${place}\n📅 ${date}\n💰 ${freeText}（${label}）${target}\n\n詳しい条件はこちら👇\n${url}`;
  if (kind === "this-weekend") return `🗓️ 今週末、無料で行ける施設\n\n${icon} ${f.name}\n📍 ${place}\n📅 ${date}\n💰 ${freeText}（${label}）${target}\n\n詳細はこちら👇\n${url}`;
  return `今週無料で行ける施設をチェック\n\n${icon} ${f.name}\n📍 ${place}\n📅 ${date}\n💰 ${freeText}（${label}）${target}\n\n${url}`;
}

function compactText(f,d,kind,rule,url) {
  const title = {tomorrow:"📅 明日無料",today:"📍 今日無料","this-weekend":"🗓️ 今週末無料","this-week":"今週無料"}[kind] || "無料情報";
  const eligibility = adultRuleStatus(rule) === "conditional" ? `\n⚠️ ${audienceFor(rule)}` : "";
  return `${title}：${f.name}\n📍 ${regionText(f)}\n📅 ${displayDate(d)}\n💰 ${adultRuleStatus(rule)==="conditional"?"大人も条件付きで無料":"大人・一般：無料"}（${conditionFor(rule)}）${eligibility}\n\n${url}`;
}

export function weightedLength(text) {
  const withoutUrl = text.replace(/https?:\/\/\S+/g,"<URL>");
  let weight = 0;
  for (const char of withoutUrl) weight += char === "<" ? 0 : char.codePointAt(0) > 0xff ? 2 : 1;
  return weight + (text.match(/https?:\/\/\S+/g) || []).length * 23;
}

function eventRules(f, d) {
  if (!confirmedFreeSchedule(f) || !isOpenOn(f,d)) return [];
  return rulesFor(f).filter(r => (RULE_TYPES.has(r.type) || r.type === "always_free") && matchesRule(r,d) && adultRuleStatus(r) !== "excluded");
}

function poolType(d, today) {
  if (iso(d) === iso(addDays(today,1))) return "tomorrow";
  if (iso(d) === iso(today)) return "today";
  const dow = d.getUTCDay();
  if ((dow === 6 || dow === 0) && d >= today && d <= addDays(today,7)) return "this-weekend";
  return "this-week";
}

export function generatePostCandidate({ facility, targetDate, postType }) {
  const d = typeof targetDate === "string" ? asDate(targetDate) : targetDate;
  const rules = eventRules(facility,d);
  if (!rules.length) throw new Error("Facility has no confirmed adult-eligible free rule for targetDate");
  const rule = [...rules].sort((a,b) => (a.type === "always_free") - (b.type === "always_free"))[0];
  const campaign = `${facility.facility_id}_${iso(d)}`;
  const url = withUtm(`facility/${encodeURIComponent(facility.facility_id)}/`,campaign);
  const kind = postType || poolType(d,asDate(jstToday()));
  let text = makeText(facility,d,kind,rule,url);
  if (weightedLength(text) > 280) text = compactText(facility,d,kind,rule,url);
  if (weightedLength(text) > 280) throw new Error("Generated post exceeds X's 280 weighted-character limit");
  const postId = createHash("sha256").update(`${facility.facility_id}\n${iso(d)}\n${text}`).digest("hex").slice(0,24);
  return { post_id:postId, facilityId:facility.facility_id, facilityName:facility.name, prefecture:facility.prefecture, municipality:facility.municipality, category:facility.category, lastVerifiedDate:facility.last_verified_date || facility.last_checked || "", targetDate:iso(d), postType:kind, text, url, ruleLabel:conditionFor(rule), targetConditions:adultRuleStatus(rule) === "conditional" ? audienceFor(rule) : "大人・一般", reason:`confirmed status・成人対象の無料ルール「${conditionFor(rule)}」・${kind}優先順位で選定`, auditStatus:"confirmed" };
}

export function candidatePool(facilities, now = new Date()) {
  const today = asDate(jstToday(now));
  const startMondayOffset = (today.getUTCDay()+6)%7;
  const weekStart = addDays(today,-startMondayOffset);
  const weekEnd = addDays(weekStart,6);
  const groups = { tomorrow:[], today:[], "this-weekend":[], "this-week":[] };
  const seen = new Set();
  for (const type of ["tomorrow","today","this-weekend","this-week"]) {
    const start = type === "tomorrow" ? addDays(today,1) : type === "today" ? today : type === "this-weekend" ? addDays(today,1) : today;
    const end = type === "tomorrow" || type === "today" ? start : type === "this-weekend" ? weekEnd : weekEnd;
    for (const f of facilities) {
      if (!confirmedFreeSchedule(f)) continue;
      for (let d = start; d <= end; d = addDays(d,1)) {
        if (type === "this-weekend" && ![0,6].includes(d.getUTCDay())) continue;
        if (type === "this-week" && ["tomorrow","today"].includes(poolType(d,today))) continue;
        const rules = eventRules(f,d);
        if (!rules.length) continue;
        const key = `${f.facility_id}:${iso(d)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        groups[type].push({facility:f,targetDate:iso(d),postType:type,explicit:rules.some(r => r.type !== "always_free")});
      }
    }
  }
  for (const group of Object.values(groups)) group.sort((a,b) => Number(b.explicit)-Number(a.explicit) || a.facility.prefecture.localeCompare(b.facility.prefecture,"ja") || a.facility.category.localeCompare(b.facility.category,"ja") || a.facility.name.localeCompare(b.facility.name,"ja"));
  return groups;
}

export function isDuplicateCandidate(candidate, history, { cooldownDays = 14, now = new Date() } = {}) {
  const posts = history?.posts || [];
  if (posts.some(p => p.status !== "failed" && p.facility_id === candidate.facilityId && p.target_date === candidate.targetDate)) return "same-facility-target-date";
  if (posts.some(p => p.status !== "failed" && p.post_text === candidate.text)) return "identical-post-text";
  const cooldown = posts.some(p => ["posted","posting","unknown"].includes(p.status) && p.facility_id === candidate.facilityId && postedWithinDays(p,cooldownDays,now));
  return cooldown ? "facility-cooldown" : null;
}

function postedWithinDays(record, days, now) {
  if (!record.posted_at && !record.scheduled_at) return false;
  const today = new Date(`${jstToday(now)}T00:00:00+09:00`).getTime();
  const recordDay = new Date(`${jstToday(new Date(record.posted_at || record.scheduled_at))}T00:00:00+09:00`).getTime();
  const delta = (today - recordDay) / DAY_MS;
  return delta >= 0 && delta < days;
}

export function checkPostQuality({ candidate, facility, history, now = new Date() }) {
  const checks = [];
  const add = (id, label, passed, detail) => checks.push({ id, label, passed: Boolean(passed), detail });
  const rules = eventRules(facility,asDate(candidate.targetDate));
  const rule = rules.find(r => conditionFor(r) === candidate.ruleLabel) || null;
  const adultStatus = rule ? adultRuleStatus(rule) : "excluded";
  const expectedPath = `/free-day-search/facility/${encodeURIComponent(candidate.facilityId)}/`;
  let parsedUrl = null;
  try { parsedUrl = new URL(candidate.url); } catch {}
  const urlValid = parsedUrl && parsedUrl.origin === new URL(SITE_URL).origin && parsedUrl.pathname === expectedPath;
  const utmValid = urlValid && parsedUrl.searchParams.get("utm_source") === "x" && parsedUrl.searchParams.get("utm_medium") === "social" && parsedUrl.searchParams.get("utm_campaign") === UTM_CAMPAIGN && parsedUrl.searchParams.get("utm_content") === `${candidate.facilityId}_${candidate.targetDate}`;
  const previous = (history?.posts || []).filter(p => p.post_id !== candidate.post_id && p.status !== "failed");
  const realPostStatuses = new Set(["posted","posting","unknown"]);
  const recentFacilityPost = previous.some(p => realPostStatuses.has(p.status) && p.facility_id === candidate.facilityId && postedWithinDays(p,14,now));
  const sameTarget = previous.some(p => p.facility_id === candidate.facilityId && p.target_date === candidate.targetDate);
  const sameText = previous.some(p => p.post_text === candidate.text);
  const recentDryRunCount = previous.filter(p => p.status === "dry_run" && p.facility_id === candidate.facilityId && postedWithinDays(p,14,now)).length;
  const conditionText = String(candidate.ruleLabel || "").trim();
  const vague = /要確認|未確認|未確定|日付不明|情報確認中|公式情報未確認|条件不明/.test(conditionText);
  const bodyHasCondition = !!conditionText && candidate.text.includes(conditionText);
  const conditionalAudience = adultStatus !== "conditional" || candidate.text.includes(audienceFor(rule)) && /対象条件|⚠️/.test(candidate.text);

  add("x_length","X文字数（URL短縮後の加重文字数）",weightedLength(candidate.text) <= 280,`${weightedLength(candidate.text)} / 280`);
  add("facility_name","施設名を含む",Boolean(facility?.name) && candidate.text.includes(facility.name),facility?.name || "施設名なし");
  add("condition_clear","無料条件が具体的で誤解を招く表現がない",adultStatus !== "excluded" && !vague && bodyHasCondition,conditionText || "無料条件が見つかりません");
  add("adult_eligible","大人・一般が無料対象",candidate.auditStatus === "confirmed" && Boolean(rule) && adultStatus !== "excluded",adultStatus === "conditional" ? `成人条件あり：${audienceFor(rule)}` : adultStatus === "general" ? "大人・一般対象" : "成人対象として確認できません");
  add("conditional_disclosed","成人への条件を本文に明記",conditionalAudience,adultStatus === "conditional" ? audienceFor(rule) : "条件付き成人ルールなし");
  add("facility_detail_url","施設詳細ページへのリンク",Boolean(urlValid),candidate.url);
  add("utm","UTMパラメーター",Boolean(utmValid),urlValid ? parsedUrl.search : "URL形式が不正");
  add("no_14d_post","過去14日以内の同一施設投稿なし",!recentFacilityPost,recentFacilityPost ? "過去14日以内に同一施設の投稿または送信結果不明の記録があります" : "実投稿・送信結果不明との重複なし");
  add("no_same_target","同一施設＋対象日の重複なし",!sameTarget,sameTarget ? "同一施設・同一対象日の履歴があります" : "同一施設・対象日の重複なし");
  add("no_same_text","同一本文の重複なし",!sameText,sameText ? "同じ投稿本文の履歴があります" : "同一本文の重複なし");
  const passed = checks.every(c => c.passed);
  return { passed, checks, duplicate_checks:{ no_post_within_14_days:!recentFacilityPost, no_same_facility_target_date:!sameTarget, no_identical_text:!sameText, recent_dry_run_same_facility_count:recentDryRunCount } };
}

export function selectCandidate(facilities, history, now = new Date()) {
  const groups = candidatePool(facilities,now);
  const latest = [...(history?.posts || [])].reverse().find(p => p.status !== "failed");
  for (const type of ["tomorrow","today","this-weekend","this-week"]) {
    const candidates = groups[type].flatMap(item => { try { return [generatePostCandidate({facility:item.facility,targetDate:item.targetDate,postType:type})]; } catch { return []; } });
    const filtered = candidates.filter(c => !isDuplicateCandidate(c,history,{now}));
    if (!filtered.length) continue;
    const lastPosted = new Map();
    for (const p of history?.posts || []) if (p.status === "posted" && p.facility_id) lastPosted.set(p.facility_id, Math.max(lastPosted.get(p.facility_id) || 0, Date.parse(p.posted_at || 0)));
    filtered.sort((a,b) => {
      const aVariety = Number(a.prefecture === latest?.prefecture) + Number(a.category === latest?.category);
      const bVariety = Number(b.prefecture === latest?.prefecture) + Number(b.category === latest?.category);
      return aVariety - bVariety || (lastPosted.get(a.facilityId) || 0) - (lastPosted.get(b.facilityId) || 0) || b.lastVerifiedDate.localeCompare(a.lastVerifiedDate) || a.facilityId.localeCompare(b.facilityId);
    });
    return filtered[0];
  }
  return null;
}

export function formatScheduledAt(now = new Date()) {
  const day = jstToday(now);
  return `${day}T17:00:00+09:00`;
}

export function formatTargetDate(date) {
  const d = typeof date === "string" ? asDate(date) : date;
  return weekdayLabel(d);
}
