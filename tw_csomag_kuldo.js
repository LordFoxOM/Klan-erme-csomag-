(function () {
  'use strict';
  function isOverview() {
    return location.href.includes('screen=overview_villages') && location.href.includes('mode=prod');
  }

  if (!isOverview()) {
    var cur = new URLSearchParams(location.search);
    var params = new URLSearchParams();
    if (cur.has('t')) params.set('t', cur.get('t'));
    var vid = cur.get('village');
    try {
      if (!vid && window.game_data && game_data.village && game_data.village.id) {
        vid = String(game_data.village.id);
      }
    } catch(e){}
    if (vid) params.set('village', vid);
    params.set('screen', 'overview_villages');
    params.set('mode', 'prod');
    params.set('page', '-1');
    location.href = '/game.php?' + params.toString();
    return; // VERY IMPORTANT: stop the script here
  }

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function safeInt(x) { var n = parseInt(x, 10); return Number.isFinite(n) ? n : 0; }

  function envOk() {
    if (!window.$ || !window.TribalWars || !window.UI) {
      console.warn('[CsomagKüldő] jQuery/TribalWars/UI nem észlelhető. A játék felületén futtasd.');
    }
    return true;
  }
  if (!envOk()) return;

  function buildUrl(params, includeVillage) {
    const base = new URLSearchParams();
    const cur = new URLSearchParams(location.search);
    if (cur.has('t')) base.set('t', cur.get('t'));
    const currentVillage = (window.game_data && game_data.village && game_data.village.id) ? String(game_data.village.id) : (cur.get('village') || '');
    if (includeVillage && currentVillage) base.set('village', currentVillage);
    Object.keys(params || {}).forEach(function (k) {
      const v = params[k];
      if (v !== undefined && v !== null) base.set(k, String(v));
    });
    return '/game.php?' + base.toString();
  }

  function parseCoordinate(raw) {
    if (raw == null) return null;
    let s = String(raw).trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
    let m = s.match(/(\d{1,3})\s*[\|\u00A6]\s*(\d{1,3})/);
    if (m) return m[1] + '|' + m[2];
    s = s.replace(/[^\d\|\u00A6]/g, '');
    m = s.match(/(\d{1,3})[\|\u00A6](\d{1,3})/);
    return m ? (m[1] + '|' + m[2]) : null;
  }

  function status(msg) {
    const el = document.getElementById('lf-status');
    if (el) el.textContent = msg;
  }

  const panel = document.createElement('div');
  panel.id = 'lf-package-panel';
  panel.style.cssText = [
    'position:fixed','top:90px','left:90px','z-index:9999',
    'background:#f4e4bc','color:#000','padding:10px','border:2px solid #804000',
    'width:520px','resize:both','overflow:auto','font-family:Verdana,sans-serif',
    'font-size:13px','border-radius:8px','box-shadow:0 0 10px #000'
  ].join(';');

  panel.innerHTML = [
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">',
    '  <b style="font-size:15px">Csomag Küldő</b>',
    '  <button id="lf-close" style="background:#804000;color:white;border:none;padding:2px 8px;border-radius:4px;cursor:pointer">X</button>',
    '</div>',
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">',
    '  <label><span><b>Cél koordináta</b></span><input id="coordInput" type="text" placeholder="pl. 500|500" value="" style="width:100%"></label>',
    '  <label><span><b>Max csomagszám</b></span><input id="maxInput" type="number" value="10" style="width:100%"></label>',
    '  <label><span><img src="https://dshu.innogamescdn.com/asset/7d3266bc/graphic/holz.webp" height="15"> <b>1 csomag fa</b></span><input id="woodInput" type="number" value="2800" style="width:100%"></label>',
    '  <label><span><img src="https://dshu.innogamescdn.com/asset/7d3266bc/graphic/lehm.webp" height="15"> <b>1 csomag agyag</b></span><input id="clayInput" type="number" value="3000" style="width:100%"></label>',
    '  <label><span><img src="https://dshu.innogamescdn.com/asset/7d3266bc/graphic/eisen.webp" height="15"> <b>1 csomag vas</b></span><input id="ironInput" type="number" value="2500" style="width:100%"></label>',
    '  <label><span><b>Falu csoport</b></span><select id="groupSelector" style="width:100%"></select></label>',
    '</div>',
    '<div style="margin-top:8px;display:flex;gap:8px;align-items:center">',
    '  <button id="startScript" class="btn">Indítás</button>',
    '  <div><b>Elküldve:</b> <span id="sentCounter">0</span></div>',
    '  <div id="lf-status" style="color:#444;font-size:12px"></div>',
    '</div>',
    '<div id="villList" style="max-height:420px;overflow-y:auto;margin-top:10px;border-top:1px solid #ccc;padding-top:5px">Csoport kiválasztva. Kattints az Indításra!</div>',
    '<div style="text-align:center;font-size:11px;color:#555;margin-top:8px">By <b>LordFox</b> · Eredeti Script/div>'
  ].join('');

  document.body.appendChild(panel);
  qs('#lf-close').onclick = function () { panel.remove(); };

  panel.onmousedown = function (e) {
    if (['INPUT','BUTTON','SELECT','TEXTAREA','LABEL'].includes(e.target.tagName)) return;
    const rect = panel.getBoundingClientRect();
    const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
    function move(ev) { panel.style.left = (ev.pageX - dx) + 'px'; panel.style.top = (ev.pageY - dy) + 'px'; }
    document.addEventListener('mousemove', move);
    panel.onmouseup = function () { document.removeEventListener('mousemove', move); };
  };
  panel.ondragstart = function () { return false; };

  let sentPackages = 0;
  let coordinate = '';
  let pkgWood = 0, pkgClay = 0, pkgIron = 0, maxPackages = 0;
  let selectedGroupId = null;
  let scriptStarted = false;
  const usedVillageIds = new Set();

  function loadGroups() {
    const links = qsa('.group-menu-item');
    const arr = links.map(function (link) {
      return {
        id: link.dataset.groupId,
        name: link.textContent.replace(/[\[\]>]/g, '').trim(),
        selected: link.classList.contains('selected') || (link.parentElement && link.parentElement.tagName === 'STRONG')
      };
    });
    const sel = qs('#groupSelector');
    sel.innerHTML = arr.map(function (g) {
      return '<option value="' + g.id + '" ' + (g.selected ? 'selected' : '') + '>' + g.name + '</option>';
    }).join('');
    selectedGroupId = sel.value;
    sel.onchange = function () {
      selectedGroupId = sel.value;
      if (scriptStarted) {
        status('Csoport váltás → lista frissítése...');
        setTimeout(loadVillages, 100);
      } else {
        qs('#villList').textContent = 'Csoport kiválasztva. Kattints az Indításra!';
      }
    };
  }
  loadGroups();

  qs('#startScript').onclick = function () {
    const parsed = parseCoordinate(qs('#coordInput').value);
    if (!parsed) { alert('Érvénytelen koordináta! Így add meg: 500|500'); return; }
    coordinate = parsed;

    pkgWood = safeInt(qs('#woodInput').value);
    pkgClay = safeInt(qs('#clayInput').value);
    pkgIron = safeInt(qs('#ironInput').value);
    maxPackages = safeInt(qs('#maxInput').value);
    if ([pkgWood,pkgClay,pkgIron,maxPackages].some(function(n){return !Number.isFinite(n);} )) {
      alert('Hibás érték valamelyik mezőben!'); return;
    }

    sentPackages = 0; usedVillageIds.clear(); scriptStarted = true;
    qs('#sentCounter').textContent = String(sentPackages);
    loadVillages();
  };

  function parseOverviewDoc(doc, targetX, targetY) {
    let rows = qsa('#production_table tr.nowrap', doc);
    if (!rows.length) rows = qsa('#production_table tr', doc);
    if (!rows.length) rows = qsa('table tr', doc);

    const villageList = [];
    rows.forEach(function (row) {
      const nameEl = row.querySelector('.quickedit-vn') || row.querySelector('a[href*="village="]');
      const linkEl = row.querySelector('a[href*="village="]');
      const name = nameEl ? nameEl.textContent.trim() : '';
      const link = linkEl ? linkEl.getAttribute('href') : '';
      const idm = link ? link.match(/village=(\d+)/) : null;
      const villageId = idm ? idm[1] : '';
      if (!name || !villageId) return;
      if (usedVillageIds.has(villageId)) return;

      const cm = name.match(/(\d+)\|(\d+)/);
      if (!cm) return;
      const vx = safeInt(cm[1]), vy = safeInt(cm[2]);
      const distance = Math.round(Math.hypot(targetX - vx, targetY - vy));

      function parseNum(sel) {
        const el = row.querySelector(sel) || row.querySelector('[class*="' + sel.replace('.', '') + '"]');
        const t = el ? el.textContent.replace(/[^0-9]/g, '') : '0';
        return safeInt(t);
      }
      const wood = parseNum('.wood');
      const clay = parseNum('.stone');
      const iron = parseNum('.iron');

      villageList.push({ name:name, villageId:villageId, coords:[vx,vy], wood:wood, clay:clay, iron:iron, distance:distance });
    });
    return villageList;
  }

  function loadVillages() {
    qs('#villList').innerHTML = ''; status('Faluk letöltése (overview)...');
    const [tx, ty] = (coordinate||'').split('|').map(function(s){return parseInt(s,10);});

    // Strategy 1: page=-1
    const urlAll = buildUrl({screen:'overview_villages', mode:'prod', group:selectedGroupId||0, page:-1}, true);

    $.get(urlAll, function (html1) {
      const doc1 = new DOMParser().parseFromString(html1, 'text/html');
      let list = parseOverviewDoc(doc1, tx, ty);
      if (list.length) { status('Faluk betöltve (page=-1): ' + list.length); return fetchMarketData(list); }

      // Strategy 2: paginated loop
      status('Nincs összefűzött oldal. Lapozás...');
      fetchPaginatedOverview(tx, ty).then(function(list2){
        if (list2.length) { status('Faluk betöltve (lapozva): ' + list2.length); fetchMarketData(list2); }
        else {
          // Strategy 3: ajax variants
          status('Próbálkozás ajax=1/ajax=fetch...');
          const urlAjax1 = buildUrl({screen:'overview_villages', mode:'prod', group:selectedGroupId||0, page:0, ajax:1}, true);
          $.get(urlAjax1, function (html2) {
            const doc2 = new DOMParser().parseFromString(html2, 'text/html');
            const list3 = parseOverviewDoc(doc2, tx, ty);
            if (list3.length) { status('Faluk betöltve (ajax=1): ' + list3.length); fetchMarketData(list3); }
            else {
              const urlAjaxFetch = buildUrl({screen:'overview_villages', mode:'prod', group:selectedGroupId||0, page:0, ajax:'fetch'}, true);
              $.get(urlAjaxFetch, function (html3) {
                const doc3 = new DOMParser().parseFromString(html3, 'text/html');
                const list4 = parseOverviewDoc(doc3, tx, ty);
                if (list4.length) { status('Faluk betöltve (ajax=fetch): ' + list4.length); fetchMarketData(list4); }
                else {
                  status('Nem találtam falvakat. Lehet, hogy a téma/szerver eltérő.'); 
                  qs('#villList').textContent = 'Nem találtam falvakat az overview válaszban.';
                }
              }).fail(function(){ status('ajax=fetch hiba'); qs('#villList').textContent='Nem találtam falvakat (ajax=fetch).'; });
            }
          }).fail(function(){ status('ajax=1 hiba'); });
        }
      });
    }).fail(function (xhr) {
      status('Overview GET hiba: ' + (xhr && xhr.status));
      console.error('[CsomagKüldő] Overview GET hiba', xhr && xhr.status);
    });
  }

  function fetchPaginatedOverview(tx, ty) {
    return new Promise(function (resolve) {
      const combined = [];
      let page = 0;
      let emptyStreak = 0;
      const MAXPAGES = 50; // biztonsági limit

      function nextPage() {
        if (page >= MAXPAGES || emptyStreak >= 2) return resolve(combined);
        const url = buildUrl({screen:'overview_villages', mode:'prod', group:selectedGroupId||0, page:page}, true);
        $.get(url, function (html) {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const list = parseOverviewDoc(doc, tx, ty);
          if (list.length) { combined.push.apply(combined, list); emptyStreak = 0; }
          else { emptyStreak++; }
          page++;
          setTimeout(nextPage, 20);
        }).fail(function(){ emptyStreak++; page++; setTimeout(nextPage, 20); });
      }
      nextPage();
    });
  }

  function fetchMarketData(villages) {
    status('Piac adatok lekérése...');
    const pkgVol = pkgWood + pkgClay + pkgIron;
    let i = 0;
    function step() {
      if (i >= villages.length) { render(villages); return; }
      const v = villages[i];
      const marketUrl = buildUrl({village:v.villageId, screen:'market'}, true);
      $.get(marketUrl, function (html) {
        try {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const mc = doc.querySelector('#market_merchant_available_count');
          const freeMerchants = mc ? safeInt(mc.textContent) : 0;
          const maxByRes = Math.floor(Math.min(
            v.wood / (pkgWood || Infinity),
            v.clay / (pkgClay || Infinity),
            v.iron / (pkgIron || Infinity)
          ));
          const maxByTraders = pkgVol > 0 ? Math.floor((freeMerchants * 1000) / pkgVol) : 0;
          v.maxFromVillage = Math.max(0, Math.min(Number.isFinite(maxByRes) ? maxByRes : 0, maxByTraders));
        } catch(e) {
          console.warn('[CsomagKüldő] Market parse hiba', v.name, e);
          v.maxFromVillage = 0;
        }
        i++; setTimeout(step, 10);
      }).fail(function(){ v.maxFromVillage = 0; i++; setTimeout(step, 10); });
    }
    step();
  }

  function render(villages) {
    villages.sort(function(a,b){ return a.distance - b.distance; });
    const cont = qs('#villList');
    const html = villages.map(function (v, idx) {
      const remaining = Math.max(0, maxPackages - sentPackages);
      const avail = Math.max(0, Math.min(v.maxFromVillage || 0, remaining));
      const opts = Array.from({length: avail + 1}, function(_,k){ return '<option value="'+k+'">'+k+'</option>'; }).join('');
      return [
        '<div id="row_',idx,'" style="border-bottom:1px solid #ccc;margin-bottom:4px;padding:4px">',
        ' <b>', v.name, '</b> (', v.distance, ' mező)<br>',
        ' Készlet: ',
        ' <img src="https://dshu.innogamescdn.com/asset/7d3266bc/graphic/holz.webp" height="14"> ', v.wood.toLocaleString(),
        ' <img src="https://dshu.innogamescdn.com/asset/7d3266bc/graphic/lehm.webp" height="14"> ', v.clay.toLocaleString(),
        ' <img src="https://dshu.innogamescdn.com/asset/7d3266bc/graphic/eisen.webp" height="14"> ', v.iron.toLocaleString(),
        ' <br><label>Csomag: <select id="pkgSel_',idx,'" data-max="', (v.maxFromVillage||0) ,'">', opts ,'</select></label> ',
        ' <button id="sendBtn_',idx,'" class="btn">Küldés</button>',
        '</div>'
      ].join('');
    }).join('');
    cont.innerHTML = html;

    villages.forEach(function(v, idx){
      qs('#sendBtn_'+idx).onclick = function(){
        const count = safeInt(qs('#pkgSel_'+idx).value);
        if (count === 0) return;
        const apiUrl = buildUrl({screen:'api', ajax:'target_selection', input:coordinate, type:'coord'}, true);
        $.get(apiUrl, function (json) {
          const data = (typeof json === 'string') ? JSON.parse(json) : json;
          if (!data || !data.villages || !data.villages.length) { alert('Cél nem található!'); return; }
          const targetId = data.villages[0].id;
          TribalWars.post('market',
            { ajaxaction:'map_send', village: v.villageId },
            { target_id: targetId, wood: pkgWood*count, stone: pkgClay*count, iron: pkgIron*count },
            function (res) {
              try { UI.SuccessMessage(res.message); } catch(e) { console.log(res); }
              sentPackages += count;
              qs('#sentCounter').textContent = String(sentPackages);
              const row = qs('#row_'+idx);
              if (row) row.remove();
              updateDropdowns();
              if (sentPackages >= maxPackages) {
                qsa('button[id^="sendBtn_"]').forEach(function(b){ b.disabled = true; });
              }
            }
          );
        });
      };
    });
    status('Kész. ' + villages.length + ' falu betöltve.');
  }

  function updateDropdowns() {
    const remaining = Math.max(0, maxPackages - sentPackages);
    qsa('select[id^="pkgSel_"]').forEach(function(sel){
      const maxFromVillage = safeInt(sel.dataset.max);
      const available = Math.max(0, Math.min(maxFromVillage, remaining));
      sel.innerHTML = Array.from({length: available + 1}, function(_,k){ return '<option value="'+k+'">'+k+'</option>'; }).join('');
    });
  }
})();
