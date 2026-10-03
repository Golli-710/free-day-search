(() => {
  const rows = window.FACILITIES;
  const categories = ["美術館","博物館","科学館","動物園","水族館","植物園"];
  const prefectures = ["東京都","神奈川県","大阪府"];
  const app = document.querySelector("#app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const url = (params) => `?${new URLSearchParams(params).toString()}`;
  const monthDay = (iso) => iso.slice(5);
  const prettyDate = (md) => `${Number(md.slice(0,2))}月${Number(md.slice(3))}日`;
  const rulesFor = (f) => f.free_rules || (f.free_days || []).map(md => ({type:"annual_date",month_day:md,label:prettyDate(md)}));
  const auditStatusText = (f) => {
    const fields = Object.values(f.audit?.field_status || {});
    if (fields.includes("unverified")) return "無料条件・無料日を公式情報で確認できていません";
    if (f.audit?.status === "needs_review" || fields.includes("needs_review")) return "情報確認中";
    return "確認済み";
  };
  const reviewNotice = (f) => f.audit?.status === "needs_review" ? `<p class="audit-notice"><strong>${esc(auditStatusText(f))}</strong>${(f.audit.issues||[]).length?`<span>${esc(f.audit.issues[0])}</span>`:""}</p>` : "";
  const dateRuleTypes = new Set(["annual_date","holiday","specific_date","nth_weekday","weekly_weekday","nearest_weekday","annual_period"]);
  const mmdd = (date) => `${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const nthWeekday = (d, ordinal, weekday) => d.getDay()===weekday && Math.floor((d.getDate()-1)/7)+1===ordinal;
  const matchesRule = (rule, d) => {
    const day=mmdd(d), year=d.getFullYear();
    if (rule.type === "always_free" || rule.type === "eligibility") return true;
    if (rule.type === "annual_date" || rule.type === "holiday") return day===rule.month_day;
    if (rule.type === "specific_date") return `${year}-${day}`===rule.date;
    if (rule.type === "nth_weekday") return (rule.month===0 || rule.month===d.getMonth()+1) && !(rule.excluded_months||[]).includes(d.getMonth()+1) && nthWeekday(d,rule.ordinal,rule.weekday);
    if (rule.type === "weekly_weekday") return d.getDay()===rule.weekday;
    if (rule.type === "nearest_weekday") {
      if (d.getMonth()+1!==rule.month) return false;
      const base=new Date(year,rule.month-1,rule.day,12); let nearest=null;
      for(let delta=-3;delta<=3;delta++){const candidate=new Date(year,rule.month-1,rule.day+delta,12);if(candidate.getDay()===rule.weekday&&(!nearest||Math.abs(delta)<Math.abs(nearest.delta)))nearest={date:candidate,delta};}
      return !!nearest && mmdd(nearest.date)===day;
    }
    if (rule.type === "annual_period") return day>=rule.start && day<=rule.end;
    return false;
  };
  const isFreeOn = (f,d) => rulesFor(f).some(r=>matchesRule(r,d)) || (!rulesFor(f).length && (f.free_days||[]).includes(mmdd(d)));
  const hasDateFreeThisMonth = (f,month,year) => {
    const last=new Date(year,month,0).getDate();
    return rulesFor(f).some(r=>dateRuleTypes.has(r.type) && Array.from({length:last},(_,i)=>new Date(year,month-1,i+1,12)).some(d=>matchesRule(r,d)));
  };
  const ruleLabels = (f) => rulesFor(f).filter(r=>dateRuleTypes.has(r.type)).map(r=>r.label).filter(Boolean);
  const card = (f) => {
    const dates = ruleLabels(f);
    const days = dates.length ? dates.join("・") : rulesFor(f).some(r=>r.type==="always_free") ? "常時無料" : rulesFor(f).length ? "対象条件あり（詳細）" : "無料条件の登録なし";
    return `<article class="facility-card"><div class="card-top"><span class="tag">${esc(f.category)}</span><span class="muted">${esc(f.prefecture)}・${esc(f.municipality)}</span></div>${reviewNotice(f)}<h3><a href="${url({facility:f.facility_id})}">${esc(f.name)}</a></h3><p class="address">${esc(f.address)}</p><div class="free-date"><span>無料になる日・条件</span><strong>${esc(days)}</strong></div><p class="conditions">${esc(f.free_conditions)}</p><div class="card-bottom"><span>通常料金：${esc(f.regular_fee)}</span><a class="text-link" href="${url({facility:f.facility_id})}">詳細を見る →</a></div></article>`;
  };
  const setMeta = (title, desc, schema) => {
    document.title = title;
    document.querySelector('meta[name="description"]').content = desc;
    document.querySelector('link[rel="canonical"]').href = location.href.split("?")[0] + location.search;
    document.querySelector('meta[property="og:title"]').content = title;
    document.querySelector('meta[property="og:description"]').content = desc;
    document.querySelector('meta[property="og:url"]').content = location.href;
    document.querySelector("#structured-data").textContent = JSON.stringify(schema);
  };
  const heading = (eyebrow,title,desc="") => `<div class="page-heading"><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1>${desc?`<p>${esc(desc)}</p>`:""}</div>`;
  const listing = (title, desc, items, eyebrow="施設を探す") => {
    setMeta(`${title}｜無料デー検索`,desc,{"@context":"https://schema.org","@type":"CollectionPage","name":title,"description":desc,"inLanguage":"ja","mainEntity":{"@type":"ItemList","numberOfItems":items.length,"itemListElement":items.map((f,i)=>({"@type":"ListItem","position":i+1,"name":f.name,"url":`${location.href.split("?")[0]}?facility=${encodeURIComponent(f.facility_id)}`}))}});
    app.innerHTML = `<a class="back-link" href="./">← トップへ</a>${heading(eyebrow,title,desc)}<p class="result-count">${items.length}件の施設</p><h2 class="visually-hidden">施設一覧</h2>${items.length?`<div class="cards">${items.map(card).join("")}</div>`:`<div class="empty"><p>条件に合う施設が見つかりませんでした。</p><a class="button secondary" href="./">条件を変えて検索する</a></div>`}`;
  };
  const home = () => {
    setMeta("無料デー検索｜無料で楽しめる施設を探そう","東京・神奈川・大阪の美術館や動物園など、無料で入れる日と条件を探せます。",{"@context":"https://schema.org","@type":"WebSite","name":"無料デー検索","description":"美術館・博物館などの無料日を探せるサイト","inLanguage":"ja"});
    const today = new Date();
    const freeToday = rows.filter(f => isFreeOn(f,today));
    const thisMonth = rows.filter(f => hasDateFreeThisMonth(f,today.getMonth()+1,today.getFullYear()));
    app.innerHTML = `<section class="hero"><div class="hero-copy"><span class="eyebrow">おでかけの前に、無料の日をチェック</span><h1>今度の休み、<br><em>無料で行ける</em>場所ある？</h1><p>美術館や動物園などの無料日・無料条件を、かんたん検索。</p></div><form id="search-form" class="search-panel"><label>都道府県<select name="prefecture"><option value="">すべて</option>${prefectures.map(x=>`<option>${x}</option>`).join("")}</select></label><label>カテゴリ<select name="category"><option value="">すべて</option>${categories.map(x=>`<option>${x}</option>`).join("")}</select></label><label>行きたい日<input name="date" type="date" value="${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}"></label><label>施設名・無料条件<input name="q" type="search" placeholder="例：中学生、常時無料"></label><button class="button" type="submit">無料の施設を探す <span>→</span></button><small>日付と無料条件を組み合わせて探せます</small></form></section><section class="quick-links"><a href="${url({view:"today"})}"><span class="quick-icon">☀</span><span><strong>今日無料の施設</strong><small>今日のおでかけ先を探す</small></span><b>→</b></a><a href="${url({view:"month"})}"><span class="quick-icon">▦</span><span><strong>今月無料の日がある施設</strong><small>予定を立てておでかけ</small></span><b>→</b></a></section><section class="content-section"><div class="section-title"><div><span class="eyebrow">BROWSE BY AREA</span><h2>エリアから探す</h2></div></div><div class="pill-links">${prefectures.map(x=>`<a href="${url({prefecture:x})}">${x} <span>→</span></a>`).join("")}</div></section><section class="content-section"><div class="section-title"><div><span class="eyebrow">BROWSE BY CATEGORY</span><h2>カテゴリから探す</h2></div></div><div class="category-grid">${categories.map((x,i)=>`<a href="${url({category:x})}"><span class="cat-icon">${["▧","▤","⚛","♧","◉","❀"][i]}</span>${x}<b>→</b></a>`).join("")}</div></section><section class="content-section"><div class="section-title"><div><span class="eyebrow">FREE TODAY</span><h2>今日無料の施設</h2></div><a class="text-link" href="${url({view:"today"})}">一覧を見る →</a></div><p class="section-note">今日が無料日の施設、または無料条件に当てはまる方が無料で入れる施設です。</p>${freeToday.length?`<div class="cards">${freeToday.map(card).join("")}</div>`:`<div class="notice">今日は全員無料になる施設の登録がありません。無料条件にあてはまる施設は、条件から探してみてください。</div>`}</section><section class="content-section"><div class="section-title"><div><span class="eyebrow">THIS MONTH</span><h2>今月無料の日がある施設</h2></div><a class="text-link" href="${url({view:"month"})}">一覧を見る →</a></div>${thisMonth.length?`<div class="cards">${thisMonth.map(card).join("")}</div>`:`<div class="notice">今月の無料日が登録された施設はありません。</div>`}</section><p class="data-note">掲載データは試験公開用です。無料条件・日程は変更される場合があります。訪問前に施設の公式サイトをご確認ください。</p>`;
    document.querySelector("#search-form").addEventListener("submit", e => { e.preventDefault(); const v=Object.fromEntries(new FormData(e.currentTarget)); location.href=url({search:"1",...Object.fromEntries(Object.entries(v).filter(([,x])=>x))}); });
  };
  const render = () => {
    const q = new URLSearchParams(location.search);
    if (q.has("facility")) {
      const f=rows.find(x=>x.facility_id===q.get("facility"));
      if (!f) return listing("施設が見つかりません","URLをご確認ください。",[]);
      const facilitySchema={"@context":"https://schema.org","@type":"TouristAttraction","name":f.name,"address":{"@type":"PostalAddress","streetAddress":f.address,"addressLocality":f.municipality,"addressRegion":f.prefecture,"addressCountry":"JP"},"url":f.official_url,"sameAs":f.source_url};
      if(Number.isFinite(f.latitude)&&Number.isFinite(f.longitude)) facilitySchema.geo={"@type":"GeoCoordinates","latitude":f.latitude,"longitude":f.longitude};
      setMeta(`${f.name}の無料日・料金・営業時間｜無料デー検索`,`${f.name}（${f.prefecture}${f.municipality}）の無料日、無料条件、料金、営業時間を掲載。`,facilitySchema);
      const dateLabels=ruleLabels(f);
      app.innerHTML=`<a class="back-link" href="./">← トップへ</a><div class="detail-head"><span class="tag">${esc(f.category)}</span>${heading(`${f.prefecture}・${f.municipality}`,f.name)}</div><div class="detail-layout"><section class="detail-main">${reviewNotice(f)}<div class="detail-highlight"><span>無料になる日・条件</span><p>${esc(f.free_conditions||"公式情報で無料条件を確認できませんでした。")}</p>${dateLabels.length?`<div class="date-chips">${dateLabels.map(d=>`<b>${esc(d)}</b>`).join("")}</div>`:""}</div><h2>施設情報</h2><dl class="info-list"><div><dt>住所</dt><dd>${esc(f.address)}</dd></div><div><dt>カテゴリ</dt><dd>${esc(f.category)}</dd></div><div><dt>通常料金</dt><dd>${esc(f.regular_fee)}</dd></div><div><dt>営業時間</dt><dd>${esc(f.hours)}</dd></div><div><dt>定休日</dt><dd>${esc(f.closed)}</dd></div><div><dt>無料日</dt><dd>${dateLabels.length?dateLabels.map(esc).join("、"):"定例の無料日の登録なし"}</dd></div><div><dt>無料条件</dt><dd>${esc(f.free_conditions||"公式情報を確認できていません")}</dd></div><div><dt>最終確認日</dt><dd>${esc(f.last_checked||"未確認")}</dd></div><div><dt>情報確認状態</dt><dd>${esc(auditStatusText(f))}</dd></div></dl><p class="source-line">情報ソース：<a href="${esc(f.source_url)}" target="_blank" rel="noopener">公式情報を確認する ↗</a></p><a class="button" href="${esc(f.official_url)}" target="_blank" rel="noopener">施設の公式サイトへ ↗</a></section><aside class="detail-aside"><span>おでかけ前に</span><p>営業時間や無料開園日は変更される場合があります。最新情報は公式サイトでご確認ください。</p><a href="${esc(f.official_url)}" target="_blank" rel="noopener">公式サイト ↗</a></aside></div>`;
      return;
    }
    if (q.get("search")) {
      const date=q.get("date"); const md=date?monthDay(date):"";
      const selectedDate=date?new Date(`${date}T12:00:00`):null;
      const keyword=(q.get("q")||"").toLowerCase();
      let result=rows.filter(f=>{
        if(q.get("prefecture")&&f.prefecture!==q.get("prefecture")) return false;
        if(q.get("category")&&f.category!==q.get("category")) return false;
        if(selectedDate&&!isFreeOn(f,selectedDate)) return false;
        if(!keyword) return true;
        const conditions=`${f.name} ${f.free_conditions} ${rulesFor(f).filter(r=>r.type==="eligibility").map(r=>r.audience||"").join(" ")}`.toLowerCase();
        const matchingDateRules=rulesFor(f).filter(r=>dateRuleTypes.has(r.type)&&`${r.label||""} ${r.audience||""}`.toLowerCase().includes(keyword));
        const matchesCondition=conditions.includes(keyword);
        const matchesDateLabel=ruleLabels(f).join(" ").toLowerCase().includes(keyword);
        if(!matchesCondition&&!matchesDateLabel) return false;
        if(selectedDate&&!matchesCondition&&matchingDateRules.length&&!matchingDateRules.some(r=>matchesRule(r,selectedDate))) return false;
        return true;
      });
      const parts=[q.get("prefecture"),q.get("category"),date,q.get("q")].filter(Boolean);
      const description=parts.length?`${parts.join("・")}の条件で検索しました。${selectedDate?"対象者の無料条件に当てはまる場合も含みます。":""}`:"すべての施設を表示しています。";
      return listing("検索結果",description,result);
    }
    if(q.get("view")==="today") { const d=new Date(); return listing("今日無料の施設","今日の無料日と、対象者の条件により無料になる施設です。",rows.filter(f=>isFreeOn(f,d)),"今日のおでかけ"); }
    if(q.get("view")==="month") { const d=new Date(); return listing("今月無料の日がある施設","今月の無料日が設定されている施設です。",rows.filter(f=>hasDateFreeThisMonth(f,d.getMonth()+1,d.getFullYear())),"今月のおでかけ"); }
    if(q.has("prefecture")) { const p=q.get("prefecture"); return listing(`${p}の施設`,`${p}で無料条件のある施設を掲載しています。`,rows.filter(f=>f.prefecture===p),"エリアから探す"); }
    if(q.has("category")) { const c=q.get("category"); return listing(`${c}の施設`,`${c}で無料条件のある施設を掲載しています。`,rows.filter(f=>f.category===c),"カテゴリから探す"); }
    home();
  };
  render();
})();
