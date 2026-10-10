(() => {
  const rows = window.FACILITIES;
  const categories = ["美術館", "博物館", "科学館", "動物園", "水族館", "植物園", "庭園"];
  const prefectures = ["東京都", "神奈川県", "大阪府"];
  const app = document.querySelector("#app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
  const url = (params) => `?${new URLSearchParams(params).toString()}`;
  const facilityUrl = (id) => { const root = new URL(location.href); root.search = ""; root.hash = ""; return new URL(`facility/${encodeURIComponent(id)}/`, root).href; };
  const rulesFor = (f) => f.free_rules || (f.free_days || []).map(md => ({type:"annual_date", month_day:md, label:prettyDate(md)}));
  // Normalize only explicit source wording. Ambiguous audiences remain excluded.
  const eligibilityForRule = (rule) => {
    if (rule.eligibility) return rule.eligibility;
    const audience = String(rule.audience || "");
    if (!audience) return {target:"general", age_conditions:[], age_condition:null, min_age:null, max_age:null, resident_prefectures:[], resident_municipalities:[], student:null, other_requirements:[], adult_general:rule.type !== "eligibility", adult_eligible:rule.type !== "eligibility", details:""};
    const youthOnly = /未就学児|小学生|中学生|高校生|18歳未満|\d+歳以下/.test(audience) && !/60歳以上|65歳以上|70歳以上|障害|手帳|大人|一般/.test(audience);
    const studentOnly = /学生/.test(audience) && !/小学生|中学生|高校生|大学生/.test(audience);
    const adultQualifier = /60歳以上|65歳以上|70歳以上|障害|手帳/.test(audience) || (!youthOnly && /市内在住|都内在住|東京都民|横浜市民|区民/.test(audience));
    const target = youthOnly ? "children" : studentOnly ? "students" : adultQualifier ? "conditional_adult" : "unverified";
    const residentMatch = audience.match(/(?:東京都|都内|横浜市|大阪市|[^・、。]+区|[^・、。]+市)(?:内)?在住|東京都民|横浜市民/);
    const residentPrefectures = /東京都|都内|東京都民/.test(residentMatch?.[0] || "") ? ["東京都"] : /大阪市/.test(residentMatch?.[0] || "") ? ["大阪府"] : /横浜市/.test(residentMatch?.[0] || "") ? ["神奈川県"] : [];
    const residentMunicipalities = /大阪市|横浜市/.test(residentMatch?.[0] || "") ? [residentMatch[0].replace(/内?在住|民/g, "")] : [];
    const ageConditions = audience.match(/\d+歳(?:以上|未満|以下)|小学生以下|中学生以下|高校生以下|高校生・18歳未満/g) || [];
    const age = ageConditions.length === 1 ? /^(\d+)歳(以上|未満|以下)$/.exec(ageConditions[0]) : null;
    const other = /障害|手帳/.test(audience) ? ["障害者手帳等の所持"] : [];
    return {target, age_conditions:ageConditions, age_condition:ageConditions.join("・") || null, min_age:age && age[2] === "以上" ? Number(age[1]) : null, max_age:age && age[2] !== "以上" ? Number(age[1]) - (age[2] === "未満" ? 1 : 0) : null, resident_prefectures:residentPrefectures, resident_municipalities:residentMunicipalities, student:studentOnly ? true : null, other_requirements:other, adult_general:false, adult_eligible:adultQualifier, details:audience};
  };
  rows.forEach(f => {
    f.free_rules = rulesFor(f).map(rule => ({...rule, eligibility:eligibilityForRule(rule)}));
    f.free_eligibility = f.free_rules.filter(rule => rule.type === "eligibility" || rule.audience).map(rule => rule.eligibility);
  });
  const adultRuleStatus = (rule) => eligibilityForRule(rule).adult_general ? "general" : eligibilityForRule(rule).adult_eligible ? "conditional" : "excluded";
  const calendarRuleStatus = (rule) => {
    const eligibility = eligibilityForRule(rule);
    if (eligibility.adult_general) return "general";
    const onlyResidence = (eligibility.resident_prefectures?.length || eligibility.resident_municipalities?.length) && !(eligibility.age_conditions?.length) && !(eligibility.other_requirements?.length) && !eligibility.student;
    return onlyResidence ? "conditional" : "excluded";
  };
  const calendarEventForDate = (f, date) => {
    if (!scheduleConfirmed(f)) return null;
    const rules = dateRulesFor(f).filter(rule => matchesRule(rule, date) && calendarRuleStatus(rule) !== "excluded");
    if (!rules.length) return null;
    return {date, rules, restricted:rules.some(rule => calendarRuleStatus(rule) === "conditional"), badge:"この日に無料"};
  };
  const audienceNotice = (rule) => eligibilityForRule(rule).details || "対象者限定";
  const adultEligibilitySummary = (f) => {
    if (!scheduleConfirmed(f)) return "大人・一般：情報未確認のため判定できません";
    const rules = rulesFor(f).filter(rule => rule.type === "eligibility");
    const conditional = rules.filter(rule => adultRuleStatus(rule) === "conditional").map(audienceNotice);
    if (conditional.length) return "大人・一般：条件付きで無料（" + [...new Set(conditional)].join("、") + "）";
    if (rules.length && rules.every(rule => adultRuleStatus(rule) === "excluded")) return "大人・一般：対象外（子ども・学生など対象者限定）";
    return "大人・一般：確認済みの無料日ルールを表示";
  };
  const dateRuleTypes = new Set(["annual_date", "holiday", "specific_date", "nth_weekday", "weekly_weekday", "nearest_weekday", "annual_period"]);
  const pad = (n) => String(n).padStart(2, "0");
  const monthDay = (date) => `${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const isoDate = (date) => `${date.getUTCFullYear()}-${monthDay(date)}`;
  const fromParts = (year, month, day) => new Date(Date.UTC(year, month - 1, day, 12));
  const parseIsoDate = (value) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!m) return null;
    const date = fromParts(Number(m[1]), Number(m[2]), Number(m[3]));
    return isoDate(date) === value ? date : null;
  };
  const todayJst = () => {
    const parts = new Intl.DateTimeFormat("en", {timeZone:"Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit"}).formatToParts(new Date());
    const part = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return fromParts(Number(part.year), Number(part.month), Number(part.day));
  };
  const prettyDate = (md) => `${Number(md.slice(0, 2))}月${Number(md.slice(3))}日`;
  const weekdayName = (date) => ["日", "月", "火", "水", "木", "金", "土"][date.getUTCDay()];
  const nthWeekdayDate = (year, month, ordinal, weekday) => {
    const first = fromParts(year, month, 1);
    const day = 1 + ((weekday - first.getUTCDay() + 7) % 7) + (ordinal - 1) * 7;
    const result = fromParts(year, month, day);
    return result.getUTCMonth() + 1 === month ? result : null;
  };
  const equinoxDay = (year, spring) => {
    if (year < 1980 || year > 2099) return null;
    const base = year - 1980;
    return Math.floor((spring ? 20.8431 : 23.2488) + 0.242194 * base - Math.floor(base / 4));
  };
  const fixedHolidayRules = [
    [1, 1, "元日"], [2, 11, "建国記念の日"], [2, 23, "天皇誕生日"], [4, 29, "昭和の日"],
    [5, 3, "憲法記念日"], [5, 4, "みどりの日"], [5, 5, "こどもの日"], [8, 11, "山の日"],
    [11, 3, "文化の日"], [11, 23, "勤労感謝の日"]
  ];
  const holidaysForYear = (year) => {
    const holidays = new Map();
    const add = (date, name) => { if (date) holidays.set(isoDate(date), name); };
    const addBaseHolidays = (holidayYear) => {
      fixedHolidayRules.forEach(([month, day, name]) => add(fromParts(holidayYear, month, day), name));
      add(nthWeekdayDate(holidayYear, 1, 2, 1), "成人の日");
      add(nthWeekdayDate(holidayYear, 7, 3, 1), "海の日");
      add(nthWeekdayDate(holidayYear, 9, 3, 1), "敬老の日");
      add(nthWeekdayDate(holidayYear, 10, 2, 1), "スポーツの日");
      const spring = equinoxDay(holidayYear, true), autumn = equinoxDay(holidayYear, false);
      if (spring) add(fromParts(holidayYear, 3, spring), "春分の日");
      if (autumn) add(fromParts(holidayYear, 9, autumn), "秋分の日");
    };
    // 前年末の祝日も含め、年をまたぐ振替休日を判定する。
    addBaseHolidays(year - 1);
    addBaseHolidays(year);

    // 国民の祝日に挟まれた平日と、日曜に重なった祝日の振替休日。
    for (let day = fromParts(year, 1, 2); day.getUTCFullYear() === year; day.setUTCDate(day.getUTCDate() + 1)) {
      const key = isoDate(day);
      if (!holidays.has(key) && holidays.has(isoDate(new Date(day.getTime() - 86400000))) && holidays.has(isoDate(new Date(day.getTime() + 86400000)))) {
        holidays.set(key, "国民の休日");
      }
    }
    [...holidays.entries()].filter(([key]) => parseIsoDate(key).getUTCDay() === 0).forEach(([key]) => {
      let substitute = parseIsoDate(key);
      do { substitute.setUTCDate(substitute.getUTCDate() + 1); } while (holidays.has(isoDate(substitute)));
      if (substitute.getUTCFullYear() === year) add(substitute, "振替休日");
    });
    return new Map([...holidays.entries()].filter(([key]) => parseIsoDate(key).getUTCFullYear() === year));
  };
  const holidayName = (date) => holidaysForYear(date.getUTCFullYear()).get(isoDate(date)) || "";
  const formatDate = (date) => `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日（${weekdayName(date)}${holidayName(date) ? "・祝" : ""}）`;
  const labelText = (rule) => String(rule.label || "");
  const movableHolidayDate = (rule, year) => {
    const label = labelText(rule);
    if (/成人の日/.test(label)) return nthWeekdayDate(year, 1, 2, 1);
    if (/海の日/.test(label)) return nthWeekdayDate(year, 7, 3, 1);
    if (/敬老の日/.test(label)) return nthWeekdayDate(year, 9, 3, 1);
    if (/スポーツの日|体育の日/.test(label)) return nthWeekdayDate(year, 10, 2, 1);
    if (/春分の日/.test(label)) { const day = equinoxDay(year, true); return day ? fromParts(year, 3, day) : null; }
    if (/秋分の日/.test(label)) { const day = equinoxDay(year, false); return day ? fromParts(year, 9, day) : null; }
    return null;
  };
  const matchesRule = (rule, date) => {
    const day = monthDay(date), year = date.getUTCFullYear();
    if (rule.type === "always_free" || rule.type === "eligibility") return true;
    if (rule.type === "annual_date" || rule.type === "holiday") {
      const movable = movableHolidayDate(rule, year);
      return movable ? isoDate(movable) === isoDate(date) : day === rule.month_day;
    }
    if (rule.type === "specific_date") return isoDate(date) === rule.date;
    if (rule.type === "nth_weekday") return (rule.month === 0 || rule.month === date.getUTCMonth() + 1) && !(rule.excluded_months || []).includes(date.getUTCMonth() + 1) && date.getUTCDay() === rule.weekday && Math.floor((date.getUTCDate() - 1) / 7) + 1 === rule.ordinal;
    if (rule.type === "weekly_weekday") return date.getUTCDay() === rule.weekday;
    if (rule.type === "nearest_weekday") {
      if (date.getUTCMonth() + 1 !== rule.month) return false;
      const options = [];
      for (let delta = -7; delta <= 7; delta++) {
        const candidate = fromParts(year, rule.month, rule.day + delta);
        if (candidate.getUTCDay() === rule.weekday) options.push({candidate, delta});
      }
      options.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.delta - b.delta);
      return !!options[0] && isoDate(options[0].candidate) === isoDate(date);
    }
    if (rule.type === "annual_period") return day >= rule.start && day <= rule.end;
    return false;
  };
  const auditStatusText = (f) => {
    const fields = Object.values(f.audit?.field_status || {});
    if (fields.includes("unverified")) return "公式情報を確認できていません";
    if (f.audit?.status === "needs_review" || fields.includes("needs_review")) return "情報確認中";
    return "確認済み";
  };
  const reviewNotice = (f) => auditStatusText(f) === "確認済み" ? "" : `<p class="audit-notice"><strong>${esc(auditStatusText(f))}</strong>${(f.audit.issues || []).length ? `<span>${esc(f.audit.issues[0])}</span>` : ""}</p>`;
  const scheduleConfirmed = (f) => f.audit?.status === "confirmed" && !["needs_review", "unverified"].includes(f.audit?.field_status?.free_rules) && !["needs_review", "unverified"].includes(f.audit?.field_status?.free_days) && !["needs_review", "unverified"].includes(f.audit?.field_status?.free_conditions);
  const dateRulesFor = (f) => rulesFor(f).filter(rule => dateRuleTypes.has(rule.type));
  const adultDateRulesFor = (f) => dateRulesFor(f).filter(rule => adultRuleStatus(rule) !== "excluded");
  const matchedDateRules = (f, date) => scheduleConfirmed(f) && openOn(f, date) ? dateRulesFor(f).filter(rule => matchesRule(rule, date) && adultRuleStatus(rule) !== "excluded") : [];
  const isFreeOn = (f, date) => scheduleConfirmed(f) && openOn(f, date) && (hasAlwaysFreeRule(f, date) || matchedDateRules(f, date).length > 0);
  const eventForDate = (f, date) => {
    const rules = matchedDateRules(f, date);
    if (!rules.length) return null;
    const restricted = rules.some(rule => adultRuleStatus(rule) === "conditional");
    return {date, rules, restricted, badge:restricted ? "対象条件あり" : "この日に無料"};
  };
  const openOn = (f, date) => {
    if (!date) return true;
    const weekday = date.getUTCDay(), day = date.getUTCDate();
    if (Array.isArray(f.open_weekdays) && !f.open_weekdays.includes(weekday)) return false;
    if ((f.closed_weekdays || []).includes(weekday) && !((f.open_month_days || []).includes(monthDay(date)) || (holidayName(date) && (f.open_on_holidays || []).includes(weekday)))) return false;
    if (f.closed_holidays && holidayName(date)) return false;
    if (f.closed_day_after_holiday && holidayName(new Date(date.getTime() - 86400000))) return false;
    for (let offset = 1; offset <= 7; offset++) {
      const holiday = new Date(date.getTime() - offset * 86400000);
      if (!(f.holiday_shifted_closure_weekdays || []).includes(holiday.getUTCDay()) || !holidayName(holiday)) continue;
      let closure = new Date(holiday.getTime() + 86400000);
      if (f.holiday_closure_shift === "next_weekday") {
        while ([0, 6].includes(closure.getUTCDay()) || holidayName(closure)) closure = new Date(closure.getTime() + 86400000);
      }
      if (isoDate(date) === isoDate(closure)) return false;
    }
    if ((f.closed_nth_weekdays || []).some(rule => weekday === rule.weekday && (rule.month == null || rule.month === date.getUTCMonth() + 1) && Math.floor((day - 1) / 7) + 1 === rule.ordinal)) return false;
    if ((f.closed_month_days || []).includes(monthDay(date))) return false;
    return !(f.closed_dates || []).includes(isoDate(date));
  };
  const hasAlwaysFreeRule = (f, date = null) => scheduleConfirmed(f) && rulesFor(f).some(rule => rule.type === "always_free") && openOn(f, date);
  const nextOccurrences = (f, start, count = 1, end = null) => {
    if (!scheduleConfirmed(f)) return [];
    const rules = adultDateRulesFor(f);
    if (!rules.length) return [];
    const results = [];
    const limit = end || fromParts(start.getUTCFullYear() + 8, start.getUTCMonth() + 1, start.getUTCDate());
    for (let date = new Date(start); date <= limit && results.length < count; date.setUTCDate(date.getUTCDate() + 1)) {
      if (!openOn(f, date)) continue;
      const matched = rules.filter(rule => matchesRule(rule, date));
      if (matched.length) results.push({date:new Date(date), rules:matched, restricted:matched.some(rule => adultRuleStatus(rule) === "conditional")});
    }
    return results;
  };
  const nextDateInfo = (f, today) => {
    if (!scheduleConfirmed(f)) return {label:auditStatusText(f) === "公式情報を確認できていません" ? "日付要確認（公式情報未確認）" : "日付要確認（情報確認中）", rules:[]};
    if (hasAlwaysFreeRule(f)) return {label:"常時無料", rules:[]};
    const occurrence = nextOccurrences(f, today, 1)[0];
    if (occurrence) return {...occurrence, label:formatDate(occurrence.date)};
    if (!adultDateRulesFor(f).length && rulesFor(f).some(rule => rule.type === "eligibility")) return {label:"大人・一般向けの無料日なし", rules:[]};
    return {label:"次回日程未登録", rules:[]};
  };
  const card = (f, context = null) => {
    const next = context || nextDateInfo(f, todayJst());
    const dates = dateRulesFor(f).map(labelText).filter(Boolean);
    const days = dates.length ? dates.join("・") : hasAlwaysFreeRule(f) ? "常時無料" : rulesFor(f).some(rule => rule.type === "eligibility") ? "対象条件により無料" : "無料日の登録なし";
    const eventLabel = next.badge || "次回無料日";
    const ruleLabels = (next.rules || []).map(labelText).filter(Boolean);
    const restrictedText = next.restricted ? "対象条件あり" : "";
    const qualified = (next.rules || []).filter(rule => adultRuleStatus(rule) === "conditional").map(audienceNotice);
    const hasGeneral = (next.rules || []).some(rule => adultRuleStatus(rule) === "general");
    return `<article class="facility-card"><div class="card-top"><span class="tag">${esc(f.category)}</span><span class="muted">${esc(f.prefecture)}・${esc(f.municipality)}</span></div>${reviewNotice(f)}<h3><a href="${facilityUrl(f.facility_id)}">${esc(f.name)}</a></h3><p class="address">${esc(f.address)}</p><div class="free-date"><span>${esc(eventLabel)}</span><strong>${esc(next.label || (next.date ? formatDate(next.date) : "日付要確認"))}</strong><small>大人・一般：${qualified.length && !hasGeneral ? "条件付きで無料" : "無料"}</small>${qualified.map(x => `<small>⚠️ ${esc(x)}</small>`).join("")}${restrictedText ? `<small>${restrictedText}</small>` : ""}${ruleLabels.length ? `<small>条件：${ruleLabels.map(esc).join("・")}</small>` : ""}</div><p class="conditions">無料条件：${esc(f.free_conditions)}</p><div class="card-bottom"><span>通常料金：${esc(f.regular_fee)}</span><a class="text-link" href="${facilityUrl(f.facility_id)}">詳細を見る →</a><a class="text-link" href="${esc(f.official_url)}" target="_blank" rel="noopener">公式サイト ↗</a></div><span class="visually-hidden">登録された無料日・条件：${esc(days)}</span></article>`;
  };
  const setMeta = (title, desc, schema) => {
    document.title = title;
    document.querySelector('meta[name="description"]').content = desc;
    const query = new URLSearchParams(location.search), baseUrl = new URL(location.href);
    baseUrl.search = ""; baseUrl.hash = "";
    const staticViews = {today:"free/today/", tomorrow:"free/tomorrow/", week:"free/this-week/", weekend:"free/this-weekend/", month:"free/this-month/"};
    const canonical = query.has("facility") ? facilityUrl(query.get("facility")) : staticViews[query.get("view")] ? new URL(staticViews[query.get("view")], baseUrl).href : baseUrl.href;
    document.querySelector('link[rel="canonical"]').href = canonical;
    const noIndex = ["search", "prefecture", "category", "date", "q"].some(key => query.has(key)) || query.get("view") === "calendar";
    let robots = document.querySelector('meta[name="robots"]');
    if (noIndex && !robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.appendChild(robots); }
    if (robots) robots.content = noIndex ? "noindex,follow" : "index,follow";
    document.querySelector('meta[property="og:title"]').content = title;
    document.querySelector('meta[property="og:description"]').content = desc;
    document.querySelector('meta[property="og:url"]').content = canonical;
    document.querySelector("#structured-data").textContent = JSON.stringify(schema);
  };
  const heading = (eyebrow, title, desc = "") => `<div class="page-heading"><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1>${desc ? `<p>${esc(desc)}</p>` : ""}</div>`;
  const listing = (title, desc, items, eyebrow = "施設を探す", contexts = new Map()) => {
    setMeta(`${title}｜無料デー検索`, desc, {"@context":"https://schema.org", "@type":"CollectionPage", name:title, description:desc, inLanguage:"ja", mainEntity:{"@type":"ItemList", numberOfItems:items.length, itemListElement:items.map((f, i) => ({"@type":"ListItem", position:i+1, name:f.name, url:facilityUrl(f.facility_id)}))}});
    app.innerHTML = `<a class="back-link" href="./">← トップへ</a>${heading(eyebrow, title, desc)}<p class="result-count">${items.length}件の施設</p><h2 class="visually-hidden">施設一覧</h2>${items.length ? `<div class="cards">${items.map(f => card(f, contexts.get(f.facility_id))).join("")}</div>` : `<div class="empty"><p>条件に合う施設が見つかりませんでした。</p><a class="button secondary" href="./">条件を変えて検索する</a></div>`}`;
  };
  const scheduledOn = (date) => {
    const found = rows.map(f => ({f, event:eventForDate(f, date) || (hasAlwaysFreeRule(f, date) ? {date:new Date(date), rules:[], badge:"常時無料"} : null)})).filter(x => x.event);
    return found.sort((a, b) => a.f.name.localeCompare(b.f.name, "ja"));
  };
  const contextForPeriod = (event, badge) => ({...event, label:event.label === "常時無料" ? "常時無料" : formatDate(event.date), badge:event.restricted ? "対象条件で無料" : badge || event.badge || "この日に無料"});
  const contextsForEvents = (events, badge) => new Map(events.map(({f, event}) => [f.facility_id, contextForPeriod(event, badge)]));
  const calendarMonthKey = (year, month) => year * 12 + month - 1;
  const calendarMonthDate = (key) => fromParts(Math.floor(key / 12), key % 12 + 1, 1);
  const calendarPage = (q, today) => {
    const currentKey = calendarMonthKey(today.getUTCFullYear(), today.getUTCMonth() + 1);
    const y = Number(q.get("year")), m = Number(q.get("month"));
    const requestKey = Number.isInteger(y) && Number.isInteger(m) && m >= 1 && m <= 12 ? calendarMonthKey(y, m) : currentKey;
    const monthKey = Math.max(currentKey - 12, Math.min(currentKey + 60, requestKey));
    const first = calendarMonthDate(monthKey), year = first.getUTCFullYear(), month = first.getUTCMonth() + 1;
    const category = q.get("category") || "", prefecture = q.get("prefecture") || "";
    const filtered = rows.filter(f => (!category || f.category === category) && (!prefecture || f.prefecture === prefecture));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(), eventsByDate = new Map();
    for (let day = 1; day <= lastDay; day++) {
      const date = fromParts(year, month, day);
      const events = filtered.map(f => ({f, event:calendarEventForDate(f, date) || (hasAlwaysFreeRule(f, date) ? {date:new Date(date), rules:[], restricted:false, badge:"常時無料", label:"常時無料"} : null)})).filter(x => x.event);
      if (events.length) eventsByDate.set(isoDate(date), events);
    }
    const selected = parseIsoDate(q.get("date") || "");
    const selectedEvents = selected && selected.getUTCFullYear() === year && selected.getUTCMonth() + 1 === month ? eventsByDate.get(isoDate(selected)) || [] : [];
    const monthUrl = (key) => { const d = calendarMonthDate(key); return url({view:"calendar", year:String(d.getUTCFullYear()), month:String(d.getUTCMonth()+1), ...(category?{category}:{}), ...(prefecture?{prefecture}:{})}); };
    const dayUrl = (date) => url({view:"calendar", year:String(year), month:String(month), date:isoDate(date), ...(category?{category}:{}), ...(prefecture?{prefecture}:{})}) + "#calendar-results";
    const weekdays = ["月", "火", "水", "木", "金", "土", "日"];
    const offset = (first.getUTCDay() + 6) % 7, cellCount = Math.ceil((offset + lastDay) / 7) * 7;
    const cells = Array.from({length:cellCount}, (_, i) => {
      const day = i - offset + 1;
      if (day < 1 || day > lastDay) return '<div class="calendar-cell calendar-empty" aria-hidden="true"></div>';
      const date = fromParts(year, month, day), key = isoDate(date), events = eventsByDate.get(key) || [];
      const isSelected = !!selected && key === isoDate(selected), label = `${year}年${month}月${day}日（${weekdayName(date)}）、無料施設${events.length}件`;
      const contents = `<span class="calendar-day-number">${day}</span>${events.length ? `<span class="calendar-day-mark" aria-hidden="true">●</span><span class="calendar-day-count">${events.length}件</span>` : ""}`;
      return events.length ? `<a class="calendar-cell calendar-date${isSelected ? " is-selected" : ""}" href="${dayUrl(date)}" aria-label="${esc(label)}"${isSelected ? ' aria-current="date"' : ""}>${contents}</a>` : `<div class="calendar-cell calendar-date" role="gridcell" aria-label="${esc(label)}">${contents}</div>`;
    }).join("");
    const categoryLinks = ["", ...categories].map(value => `<a class="calendar-filter${category === value ? " is-active" : ""}" href="${url({view:"calendar",year:String(year),month:String(month),...(value?{category:value}:{}),...(prefecture?{prefecture}:{})})}">${value || "すべて"}</a>`).join("");
    const areaLinks = ["", ...prefectures].map(value => `<a class="calendar-filter${prefecture === value ? " is-active" : ""}" href="${url({view:"calendar",year:String(year),month:String(month),...(category?{category}:{}),...(value?{prefecture:value}:{})})}">${value || "すべて"}</a>`).join("");
    const previousKey = Math.max(currentKey - 12, monthKey - 1), nextKey = Math.min(currentKey + 60, monthKey + 1);
    const title = selected ? `${formatDate(selected)}の無料施設` : `${year}年${month}月の無料日カレンダー`;
    setMeta(`${title}｜無料デー検索`, `${title}。大人・一般向けに確認済みの無料日と施設を表示します。`, {"@context":"https://schema.org","@type":"CollectionPage",name:title,inLanguage:"ja"});
    const results = selected ? `<section id="calendar-results" class="calendar-results"><div class="section-title"><div><span class="eyebrow">FREE ON THIS DAY</span><h2>${esc(title)}</h2></div></div><p class="section-note">${selectedEvents.length}施設。大人・一般が対象外の条件と確認中の無料日は除外しています。</p>${selectedEvents.length ? `<div class="cards">${selectedEvents.map(({f,event}) => card(f,{...event,label:formatDate(selected),badge:"指定日に無料"})).join("")}</div>` : '<div class="notice">この日・絞り込み条件で、大人・一般向けの確認済み無料施設はありません。</div>'}</section>` : "";
    app.innerHTML = `<a class="back-link" href="./">← トップへ</a>${heading("無料日カレンダー", `${year}年${month}月`, "大人・一般向けに確認済みの無料日がある日を表示します。対象者限定の条件は施設ごとに明記します。")}<section class="calendar-panel" aria-label="${year}年${month}月のカレンダー"><div class="calendar-toolbar"><a class="calendar-nav" href="${monthUrl(previousKey)}" aria-label="前の月">← 前の月</a><h2>${year}年${month}月</h2><a class="calendar-nav" href="${monthUrl(nextKey)}" aria-label="次の月">次の月 →</a></div><div class="calendar-grid" role="grid" aria-label="${year}年${month}月">${weekdays.map(day => `<div class="calendar-weekday" role="columnheader">${day}</div>`).join("")}${cells}</div><p class="calendar-legend"><span aria-hidden="true">●</span> 無料施設あり。日付の下に施設数を表示します。</p><div class="calendar-filter-group"><strong>カテゴリ</strong><div class="calendar-filters">${categoryLinks}</div></div><div class="calendar-filter-group"><strong>都道府県</strong><div class="calendar-filters">${areaLinks}</div></div></section>${results}`;
  };
  const nextWeekendRange = (today) => {
    const day = today.getUTCDay();
    const mondayOffset = (day + 6) % 7;
    const monday = new Date(today); monday.setUTCDate(monday.getUTCDate() - mondayOffset);
    const saturday = new Date(monday); saturday.setUTCDate(saturday.getUTCDate() + 5);
    const sunday = new Date(saturday); sunday.setUTCDate(sunday.getUTCDate() + 1);
    const start = today > saturday ? new Date(today) : saturday;
    return {start, end:sunday};
  };
  const currentWeekRange = (today) => {
    const start = new Date(today), weekday = (today.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - weekday);
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    return {start:today > start ? new Date(today) : start, end};
  };
  const eventsInRange = (start, end, badge) => {
    const events = [];
    rows.forEach(f => {
      for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
        const event = eventForDate(f, date);
        if (event) { events.push({f, event:{...event, badge:badge || event.badge}}); break; }
        if (hasAlwaysFreeRule(f, date)) { events.push({f, event:{date:new Date(date), rules:[], badge:"常時無料", label:"常時無料"}}); break; }
      }
    });
    return events.sort((a, b) => a.event.date - b.event.date || a.f.name.localeCompare(b.f.name, "ja"));
  };
  const home = () => {
    setMeta("無料デー検索｜無料で楽しめる施設を探そう", "東京・神奈川・大阪の美術館や動物園など、無料で入れる日と条件を探せます。", {"@context":"https://schema.org", "@type":"WebSite", name:"無料デー検索", description:"美術館・博物館などの無料日を探せるサイト", inLanguage:"ja"});
    const today = todayJst(), tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowEvents = scheduledOn(tomorrow);
    const todayFree = rows.filter(f => isFreeOn(f, today));
    const todayEvents = scheduledOn(today);
    const week = currentWeekRange(today), weekEvents = eventsInRange(week.start, week.end, "今週無料");
    const weekend = nextWeekendRange(today), weekendEvents = eventsInRange(weekend.start, weekend.end, "今週末無料");
    const monthEnd = fromParts(today.getUTCFullYear(), today.getUTCMonth() + 1, new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate());
    const monthEvents = eventsInRange(today, monthEnd, "今月無料");
    const weekendContexts = new Map(weekendEvents.map(x => [x.f.facility_id, {...x.event, label:formatDate(x.event.date), badge:"今週末無料"}]));
    const monthContexts = new Map(monthEvents.map(x => [x.f.facility_id, {...x.event, label:formatDate(x.event.date), badge:"今月無料"}]));
    app.innerHTML = `<section class="hero"><div class="hero-copy"><a class="tomorrow-inline" href="${url({view:"tomorrow"})}"><span>明日 ${tomorrow.getUTCMonth() + 1}月${tomorrow.getUTCDate()}日</span><strong>無料の施設 ${tomorrowEvents.length}件</strong><b>一覧を見る →</b></a><span class="eyebrow">おでかけの前に、無料の日をチェック</span><h1>今度の休み、<br><em>無料で行ける</em>場所ある？</h1><p>美術館や動物園などの無料日・無料条件を、かんたん検索。</p></div><form id="search-form" class="search-panel"><label>都道府県<select name="prefecture"><option value="">すべて</option>${prefectures.map(x => `<option>${x}</option>`).join("")}</select></label><label>カテゴリ<select name="category"><option value="">すべて</option>${categories.map(x => `<option>${x}</option>`).join("")}</select></label><label>行きたい日<input name="date" type="date" value="${isoDate(today)}"></label><label>施設名・無料条件<input name="q" type="search" placeholder="例：中学生、常時無料"></label><button class="button" type="submit">無料の施設を探す <span>→</span></button><small>日付と無料条件を組み合わせて探せます</small></form></section>
      <section class="content-section calendar-home-link"><a class="calendar-home-card" href="${url({view:"calendar"})}"><span class="quick-icon">▦</span><span><strong>無料日カレンダー</strong><small>月ごとの無料日をカレンダーで探す</small></span><b>カレンダーを見る →</b></a></section>
      <section class="tomorrow-panel"><div class="section-title"><div><span class="eyebrow">TOMORROW</span><h2>明日（${tomorrow.getUTCMonth() + 1}月${tomorrow.getUTCDate()}日）無料の施設</h2></div><a class="text-link" href="${url({view:"tomorrow"})}">一覧を見る →</a></div><p class="section-note">${tomorrowEvents.length ? `${tomorrowEvents.length}施設が該当します。日付が確定した無料日を表示します。子ども・学生限定の条件は大人向け一覧から除外しています。` : "明日が無料日に設定された施設はありません。日程が確定している情報だけを表示しています。"}</p>${tomorrowEvents.length ? `<div class="cards">${tomorrowEvents.slice(0, 4).map(({f, event}) => card(f, contextForPeriod(event, "明日無料"))).join("")}</div>` : `<div class="notice">明日の無料日登録はありません。<a class="text-link" href="${url({view:"weekend"})}">今週末の無料日を探す →</a></div>`}${tomorrowEvents.length > 4 ? `<a class="text-link more-link" href="${url({view:"tomorrow"})}">明日無料の施設をすべて見る（${tomorrowEvents.length}件） →</a>` : ""}</section>
      <section class="quick-links"><a class="quick-primary" href="${url({view:"tomorrow"})}"><span class="quick-icon">↗</span><span><strong>明日無料</strong><small>${formatDate(tomorrow)}の施設を見る</small></span><b>${tomorrowEvents.length}件 →</b></a><a href="${url({view:"today"})}"><span class="quick-icon">☀</span><span><strong>今日無料</strong><small>${formatDate(today)}のおでかけ先</small></span><b>${todayFree.length}件 →</b></a><a href="${url({view:"week"})}"><span class="quick-icon">▤</span><span><strong>今週無料</strong><small>${formatDate(week.start)}〜${formatDate(week.end)}</small></span><b>${weekEvents.length}件 →</b></a><a href="${url({view:"weekend"})}"><span class="quick-icon">▣</span><span><strong>今週末無料</strong><small>${formatDate(weekend.start)}〜${formatDate(weekend.end)}</small></span><b>${weekendEvents.length}件 →</b></a><a href="${url({view:"month"})}"><span class="quick-icon">▦</span><span><strong>今月無料</strong><small>今月のこれからの無料日</small></span><b>${monthEvents.length}件 →</b></a></section>
      <section class="content-section"><div class="section-title"><div><span class="eyebrow">FREE TODAY</span><h2>今日無料の施設</h2></div><a class="text-link" href="${url({view:"today"})}">一覧を見る →</a></div><p class="section-note">今日無料の施設を、大人・一般向けの無料ルールを基準に表示しています。年齢・居住地などの限定条件がある場合はカードに記載します。</p>${todayFree.length ? `<div class="cards">${todayFree.slice(0, 4).map(f => { const event = eventForDate(f, today); return card(f, event ? {...event, label:formatDate(today), badge:"今日無料"} : {label:hasAlwaysFreeRule(f) ? "常時無料" : formatDate(today), badge:hasAlwaysFreeRule(f) ? "常時無料" : "今日無料", rules:[]}); }).join("")}</div>` : `<div class="notice">今日は大人・一般向けの無料日登録がありません。</div>`}</section>
      <section class="content-section"><div class="section-title"><div><span class="eyebrow">THIS WEEKEND</span><h2>今週末無料の施設</h2></div><a class="text-link" href="${url({view:"weekend"})}">一覧を見る →</a></div>${weekendEvents.length ? `<div class="cards">${weekendEvents.slice(0, 4).map(({f, event}) => card(f, contextForPeriod(event, "今週末無料"))).join("")}</div>` : `<div class="notice">今週末に日付が確定している無料施設はありません。</div>`}</section>
      <section class="content-section"><div class="section-title"><div><span class="eyebrow">THIS WEEK</span><h2>今週無料の施設</h2></div><a class="text-link" href="${url({view:"week"})}">一覧を見る →</a></div>${weekEvents.length ? `<div class="cards">${weekEvents.slice(0, 4).map(({f, event}) => card(f, contextForPeriod(event, "今週無料"))).join("")}</div>` : `<div class="notice">今週の日付が確定している無料施設はありません。</div>`}</section>
      <section class="content-section"><div class="section-title"><div><span class="eyebrow">THIS MONTH</span><h2>今月無料の日がある施設</h2></div><a class="text-link" href="${url({view:"month"})}">一覧を見る →</a></div>${monthEvents.length ? `<div class="cards">${monthEvents.slice(0, 4).map(({f, event}) => card(f, contextForPeriod(event, "今月無料"))).join("")}</div>` : `<div class="notice">今月のこれからの無料日が登録された施設はありません。</div>`}</section>
      <section class="content-section"><div class="section-title"><div><span class="eyebrow">BROWSE BY AREA</span><h2>エリアから探す</h2></div></div><div class="pill-links">${prefectures.map(x => `<a href="${url({prefecture:x})}">${x} <span>→</span></a>`).join("")}</div></section><section class="content-section"><div class="section-title"><div><span class="eyebrow">BROWSE BY CATEGORY</span><h2>カテゴリから探す</h2></div></div><div class="category-grid">${categories.map((x, i) => `<a href="${url({category:x})}"><span class="cat-icon">${["▧", "▤", "⚛", "♧", "◉", "❀", "⌂"][i]}</span>${x}<b>→</b></a>`).join("")}</div></section><section class="content-section seo-entry-links"><div class="section-title"><div><span class="eyebrow">FREE DAY GUIDES</span><h2>無料日をテーマから探す</h2></div></div><div class="pill-links"><a href="free/always/">常時無料の施設 <span>→</span></a><a href="free/today/">今日無料の施設 <span>→</span></a><a href="free/tomorrow/">明日無料の施設 <span>→</span></a><a href="free/this-week/">今週無料 <span>→</span></a><a href="free/this-weekend/">今週末無料 <span>→</span></a><a href="free/this-month/">今月無料 <span>→</span></a><a href="tokyo/free/">東京の無料施設 <span>→</span></a><a href="kanagawa/free/">神奈川の無料施設 <span>→</span></a><a href="osaka/free/">大阪の無料施設 <span>→</span></a><a href="tokyo/art-museum/free/">東京の無料美術館 <span>→</span></a><a href="tokyo/garden/free/">東京の無料庭園 <span>→</span></a><a href="kanagawa/art-museum/free/">神奈川の無料美術館 <span>→</span></a><a href="kanagawa/museum/free/">神奈川の無料博物館 <span>→</span></a><a href="osaka/museum/free/">大阪の無料博物館 <span>→</span></a><a href="free/art-museum/">無料美術館 <span>→</span></a><a href="free/museum/">無料博物館 <span>→</span></a><a href="free/zoo/">無料動物園 <span>→</span></a><a href="free/botanical-garden/">無料植物園 <span>→</span></a><a href="free/garden/">無料庭園 <span>→</span></a></div></section><p class="data-note">掲載データは試験公開用です。無料条件・日程は変更される場合があります。訪問前に施設の公式サイトをご確認ください。</p>`;
    document.querySelector("#search-form").addEventListener("submit", e => { e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget)); window.SiteMetrics?.track("search_submit", {has_query: Boolean(values.q)}); location.href = url({search:"1", ...Object.fromEntries(Object.entries(values).filter(([, value]) => value))}); });
  };
  const render = () => {
    const q = new URLSearchParams(location.search), today = todayJst();
    if (q.get("view") === "calendar") return calendarPage(q, today);
    if (q.has("facility")) {
      const f = rows.find(x => x.facility_id === q.get("facility"));
      if (!f) return listing("施設が見つかりません", "URLをご確認ください。", []);
      const canonicalFacilityUrl = facilityUrl(f.facility_id);
      const facilitySchema = {"@context":"https://schema.org", "@type":"TouristAttraction", name:f.name, description:`${f.name}（${f.prefecture}${f.municipality}）の無料日・無料条件・料金・営業時間。`, address:{"@type":"PostalAddress", streetAddress:f.address, addressLocality:f.municipality, addressRegion:f.prefecture, addressCountry:"JP"}, url:canonicalFacilityUrl, sameAs:f.official_url};
      if (Number.isFinite(f.latitude) && Number.isFinite(f.longitude)) facilitySchema.geo = {"@type":"GeoCoordinates", latitude:f.latitude, longitude:f.longitude};
      setMeta(`${f.name}の無料日・料金・営業時間｜無料デー検索`, `${f.name}（${f.prefecture}${f.municipality}）の無料日、無料条件、料金、営業時間を掲載。`, facilitySchema);
      document.querySelector('link[rel="canonical"]').href = canonicalFacilityUrl;
      document.querySelector('meta[property="og:url"]').content = canonicalFacilityUrl;
      const dateLabels = dateRulesFor(f).map(labelText).filter(Boolean);
      const next = nextDateInfo(f, today);
      const nextRuleText = (next.rules || []).map(labelText).filter(Boolean).join("・");
      app.innerHTML = `<a class="back-link" href="./">← トップへ</a><div class="detail-head"><span class="tag">${esc(f.category)}</span>${heading(`${f.prefecture}・${f.municipality}`, f.name)}</div><div class="detail-layout"><section class="detail-main">${reviewNotice(f)}<div class="next-free-banner"><span>次回無料日</span><strong>${esc(next.label)}</strong>${nextRuleText ? `<p>無料条件：${esc(nextRuleText)}</p>` : ""}${next.restricted ? `<small>対象者などの条件があります</small>` : ""}</div><div class="detail-highlight"><span>対象者別の無料条件</span><p>${esc(adultEligibilitySummary(f))}</p><p>${esc(f.free_conditions || "公式情報で無料条件を確認できませんでした。")}</p>${dateLabels.length ? `<div class="date-chips">${dateLabels.map(d => `<b>${esc(d)}</b>`).join("")}</div>` : ""}</div><h2>施設情報</h2><dl class="info-list"><div><dt>住所</dt><dd>${esc(f.address)}</dd></div><div><dt>カテゴリ</dt><dd>${esc(f.category)}</dd></div><div><dt>通常料金</dt><dd>${esc(f.regular_fee)}</dd></div><div><dt>営業時間</dt><dd>${esc(f.hours)}</dd></div><div><dt>定休日</dt><dd>${esc(f.closed)}</dd></div><div><dt>無料日</dt><dd>${dateLabels.length ? `${esc(next.label)}${nextRuleText ? `（${esc(nextRuleText)}）` : ""}` : esc(next.label)}</dd></div><div><dt>無料条件</dt><dd>${esc(f.free_conditions || "公式情報を確認できていません")}</dd></div><div><dt>最終確認日</dt><dd>${esc(f.last_checked || "未確認")}</dd></div><div><dt>情報確認状態</dt><dd>${esc(auditStatusText(f))}</dd></div></dl><p class="source-line">情報ソース：<a href="${esc(f.source_url)}" target="_blank" rel="noopener">公式情報を確認する ↗</a></p><a class="button" href="${esc(f.official_url)}" target="_blank" rel="noopener">施設の公式サイトへ ↗</a></section><aside class="detail-aside"><span>おでかけ前に</span><p>営業時間や無料開園日は変更される場合があります。最新情報は公式サイトでご確認ください。</p><a href="${esc(f.official_url)}" target="_blank" rel="noopener">公式サイト ↗</a></aside></div>`;
      return;
    }
    if (q.get("search")) {
      const requestedDate = q.get("date"), selectedDate = parseIsoDate(requestedDate);
      const keyword = (q.get("q") || "").toLowerCase();
      const result = rows.filter(f => {
        if (q.get("prefecture") && f.prefecture !== q.get("prefecture")) return false;
        if (q.get("category") && f.category !== q.get("category")) return false;
        if (requestedDate && !selectedDate) return false;
        if (selectedDate && !isFreeOn(f, selectedDate)) return false;
        if (!keyword) return true;
        const conditions = `${f.name} ${f.free_conditions} ${rulesFor(f).filter(rule => rule.type === "eligibility").map(rule => rule.audience || "").join(" ")}`.toLowerCase();
        const matchingDateRules = dateRulesFor(f).filter(rule => `${rule.label || ""} ${rule.audience || ""}`.toLowerCase().includes(keyword));
        const matchesCondition = conditions.includes(keyword);
        const matchesDateLabel = dateRulesFor(f).map(labelText).join(" ").toLowerCase().includes(keyword);
        if (selectedDate && !matchesCondition && matchingDateRules.length && !matchingDateRules.some(rule => matchesRule(rule, selectedDate))) return false;
        return matchesCondition || matchesDateLabel;
      });
      const parts = [q.get("prefecture"), q.get("category"), q.get("date"), q.get("q")].filter(Boolean);
      const description = parts.length ? `${parts.join("・")}の条件で検索しました。${selectedDate ? "大人・一般向けの無料ルールがある施設を表示します。" : ""}` : "すべての施設を表示しています。";
      const contexts = selectedDate ? new Map(result.map(f => [f.facility_id, eventForDate(f, selectedDate) || {date:selectedDate, label:hasAlwaysFreeRule(f, selectedDate) ? "常時無料" : formatDate(selectedDate), badge:hasAlwaysFreeRule(f, selectedDate) ? "常時無料" : "指定日に無料", rules:[]}])) : new Map();
      return listing("検索結果", description, result, "施設を探す", contexts);
    }
    const view = q.get("view");
    if (["today", "tomorrow"].includes(view)) {
      const date = new Date(today); if (view === "tomorrow") date.setUTCDate(date.getUTCDate() + 1);
      const events = scheduledOn(date), items = events.map(x => x.f);
      return listing(view === "today" ? "今日無料の施設" : "明日無料の施設", `${formatDate(date)}の無料日が設定された施設です。年齢・居住地などの限定条件は明記しています。`, items, view === "today" ? "今日のおでかけ" : "明日のおでかけ", contextsForEvents(events, view === "today" ? "今日無料" : "明日無料"));
    }
    if (view === "weekend") {
      const range = nextWeekendRange(today), events = eventsInRange(range.start, range.end, "今週末無料");
      return listing("今週末無料の施設", `${formatDate(range.start)}から${formatDate(range.end)}までの無料日が設定された施設です。年齢・居住地などの限定条件は明記しています。`, events.map(x => x.f), "今週末のおでかけ", new Map(events.map(x => [x.f.facility_id, contextForPeriod(x.event, "今週末無料")])));
    }
    if (view === "week") {
      const range = currentWeekRange(today), events = eventsInRange(range.start, range.end, "今週無料");
      return listing("今週無料の施設", `${formatDate(range.start)}から${formatDate(range.end)}までの無料日が設定された施設です。年齢・居住地などの限定条件は明記しています。`, events.map(x => x.f), "今週のおでかけ", new Map(events.map(x => [x.f.facility_id, contextForPeriod(x.event, "今週無料")])));
    }
    if (view === "month") {
      const end = fromParts(today.getUTCFullYear(), today.getUTCMonth() + 1, new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate());
      const events = eventsInRange(today, end, "今月無料");
      return listing("今月無料の日がある施設", `今月（${today.getUTCMonth() + 1}月）のこれからの無料日が設定された施設です。年齢・居住地などの限定条件は明記しています。`, events.map(x => x.f), "今月のおでかけ", new Map(events.map(x => [x.f.facility_id, contextForPeriod(x.event, "今月無料")])));
    }
    if (q.has("prefecture")) { const prefecture = q.get("prefecture"); return listing(`${prefecture}の施設`, `${prefecture}で無料条件のある施設を掲載しています。`, rows.filter(f => f.prefecture === prefecture)); }
    if (q.has("category")) { const category = q.get("category"); return listing(`${category}の施設`, `${category}で無料条件のある施設を掲載しています。`, rows.filter(f => f.category === category)); }
    home();
  };
  render();
})();
