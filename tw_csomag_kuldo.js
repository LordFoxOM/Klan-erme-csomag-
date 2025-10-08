(function () {
  'use strict';

  // --- Helpers ---
  function envOk() {
    if (!window.$ || !window.TribalWars || !window.UI) {
      console.warn('[CsomagKüldő] jQuery/TribalWars/UI nem észlelhető. A játék oldalán futtasd.');
    }
    return true;
  }

  function ensureOnProd() {
    const ok = location.href.includes('screen=overview_villages') && location.href.includes('mode=prod');
    if (!ok) {
      const url = new URL(location.origin + '/game.php');
      url.searchParams.set('screen', 'overview_villages');
      url.searchParams.set('mode', 'prod');
      location.href = url.toString();
      return false;
    }
    return true;
  }

  if (!envOk()) return;
  if (!ensureOnProd()) return;

  let sentPackages = 0;
  let coordinate = '';
  let pkgWood = 0, pkgClay = 0, pkgIron = 0, maxPackages = 0;
  let selectedGroupId = null;
  let allGroups = [];
  let scriptStarted = false;
  const usedVillageIds = new Set();

  function parseCoordinate(raw) {
    if (raw == null) return null;
    let s = String(raw).trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
    const m = s.match(/(\d{1,3})\s*[\|\u00A6]\s*(\d{1,3})/);
    if (m) return m[1] + '|' + m[2];
    const stripped = s.replace(/[^\d\|\u00A6]/g, '');
    const n = stripped.match(/(\d{1,3})[\|\u00A6](\d{1,3})/);
    return n ? (n[1] + '|' + n[2]) : null;
  }

  // --- Panel ---
  const panel = document.createElement('div');
  panel.id = 'lf-package-panel';
  panel.style.cssText = [
    'position:fixed','top:100px','left:100px','z-index:9999',
    'background:#f4e4bc','color:#000','padding:10px','border:2px solid #804000',
    'width:460px','resize:both','overflow:auto','font-family:Verdana,sans-serif',
    'font-size:13px','border-radius:8px','box-shadow:0 0 10px #000'
  ].join(';');

  panel.innerHTML = [
    '<div style="text-align:right">',
    '  <button id="closePanel" style="background:#804000;color:white;border:none;padding:2px 6px;border-radius:4px;cursor:pointer">X</button>',
    '</div>',
    '<b style="font-size:15px">📦 Csomag Küldő</b>',
    '<table style="width:100%;margin-top:5px">',
    '  <tr><td><b>Cél koordináta:</b></td><td><input id="coordInput" type="text" placeholder="pl. 500|500" value=""></td></tr>',
    '  <tr><td><b><img src="https://dshu.innogamescdn.com/asset/7d3266bc/graphic/holz.webp" height="15"> 1 csomag fa:</b></td><td><input id="woodInput" type="number" value="2800"></td></tr>',
    '  <tr><td><b><img src="https://dshu.innogamescdn.com/asset/7d3266bc/graphic/lehm.webp" height="15"> 1 csomag agyag:</b></td><td><input id="clayInput" type="number" value="3000"></td></tr>',
    '  <tr><td><b><img src="https://dshu.innogamescdn.com/asset/7d3266bc/graphic/eisen.webp" height="15"> 1 csomag vas:</b></td><td><input id="ironInput" type="number" value="2500"></td></tr>',
    '  <tr><td><b>Max csomagszám:</b></td><td><input id="maxInput" type="number" value="10"></td></tr>',
    '  <tr><td><b>Falu csoport:</b></td><td><select id="groupSelector"></select></td></tr>',
    '  <tr><td colspan="2"><button id="startScript" class="btn">Indítás</button></td></tr>',
    '  <tr><td><b>Eddig Elküldött Csomagok:</b></td><td id="sentCounter">0</td></tr>',
    '</table>',
    '<div id="villList" style="max-height:400px;overflow-y:auto;margin-top:10px;border-top:1px solid #ccc;padding-top:5px">',
    '  Csoport kiválasztva. Kattints az Indításra!',
    '</div>',
    '<div style="text-align:center;font-size:11px;color:#555;margin-top:8px">By <b>LordFox</b></div>'
  ].join('');

  document.body.appendChild(panel);
  document.getElementById('closePanel').onclick = function () { panel.remove(); };

  panel.onmousedown = function (e) {
    if (['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName)) return;
    const rect = panel.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    function move(ev) {
      panel.style.left = (ev.pageX - offsetX) + 'px';
      panel.style.top = (ev.pageY - offsetY) + 'px';
    }
    document.addEventListener('mousemove', move);
    panel.onmouseup = function () { document.removeEventListener('mousemove', move); };
  };
  panel.ondragstart = function () { return false; };

  // --- Csoportok ---
  function fetchGroups() {
    const links = document.querySelectorAll('.group-menu-item');
    allGroups = Array.from(links).map(function (link) {
      return {
        id: link.dataset.groupId,
        name: link.textContent.replace(/[\\[\\]>]/g, '').trim(),
        href: link.getAttribute('href'),
        selected: link.classList.contains('selected') || link.parentElement.tagName === 'STRONG'
      };
    });

    const select = document.getElementById('groupSelector');
    if (!select) return;

    select.innerHTML = allGroups.map(function (g) {
      return '<option value="' + g.id + '" ' + (g.selected ? 'selected' : '') + '>' + g.name + '</option>';
    }).join('');

    selectedGroupId = select.value;

    select.onchange = function () {
      selectedGroupId = select.value;
      // Megkeressük a kiválasztott csoport linkjét és átirányítunk (console-run esetén ez a biztos)
      const g = allGroups.find(function (x) { return x.id === selectedGroupId; });
      if (g && g.href) {
        const u = new URL(g.href, location.origin);
        u.searchParams.set('mode', 'prod');
        location.href = u.toString();
      }
    };
  }

  // --- Indítás ---
  document.getElementById('startScript').onclick = function () {
    const raw = document.getElementById('coordInput').value;
    const parsed = parseCoordinate(raw);
    if (!parsed) {
      alert('Érvénytelen koordináta! Így add meg: 500|500');
      return;
    }
    coordinate = parsed;

    pkgWood = parseInt(document.getElementById('woodInput').value, 10);
    pkgClay = parseInt(document.getElementById('clayInput').value, 10);
    pkgIron = parseInt(document.getElementById('ironInput').value, 10);
    maxPackages = parseInt(document.getElementById('maxInput').value, 10);
    sentPackages = 0;
    usedVillageIds.clear();
    scriptStarted = true;
    document.getElementById('sentCounter').innerText = String(sentPackages);

    if ([pkgWood, pkgClay, pkgIron, maxPackages].some(function (n) { return isNaN(n); })) {
      alert('Hibás érték valamelyik mezőben!');
      return;
    }

    // Közvetlenül az AKTUÁLIS oldal DOM-jából olvasunk
    const villages = readVillagesFromPage();
    if (!villages.length) {
      document.getElementById('villList').innerHTML = 'Nem található falu a táblában (#production_table). Biztos a termelés nézeten vagy?';
      return;
    }
    console.log('[CsomagKüldő] Falvak száma (DOM):', villages.length);
    enrichWithMarketData(villages);
  };

  // --- Faluk olvasása az oldal DOM-jából ---
  function readVillagesFromPage() {
    const rows = document.querySelectorAll('#production_table tr.nowrap');
    const list = [];
    rows.forEach(function (row) {
      const nameEl = row.querySelector('.quickedit-vn');
      const villageLink = row.querySelector('a[href*="village="]');
      const name = nameEl ? nameEl.innerText.trim() : null;
      const href = villageLink ? villageLink.getAttribute('href') : null;
      const idMatch = href ? href.match(/village=(\d+)/) : null;
      const villageId = idMatch ? idMatch[1] : null;
      if (!name || !villageId) return;
      if (usedVillageIds.has(villageId)) return;

      const coordsMatch = name.match(/(\\d+)\\|(\\d+)/);
      if (!coordsMatch) return;
      const vx = parseInt(coordsMatch[1], 10);
      const vy = parseInt(coordsMatch[2], 10);

      const parseNum = function (sel) {
        const el = row.querySelector(sel);
        const t = el ? el.textContent.replace(/[^0-9]/g, '') : '0';
        return parseInt(t || '0', 10) || 0;
      };
      const wood = parseNum('.wood');
      const clay = parseNum('.stone');
      const iron = parseNum('.iron');

      list.push({ name: name, villageId: villageId, coords: [vx, vy], wood: wood, clay: clay, iron: iron, villageHref: href });
    });
    return list;
  }

  // --- Market adatok lekérése: a meglévő village href-ből építünk URL-t, hogy megmaradjon minden token ---
  function enrichWithMarketData(villageList) {
    // cél koordináta feldolgozása
    const parts = coordinate.split('|');
    const targetX = parseInt(parts[0], 10);
    const targetY = parseInt(parts[1], 10);
    villageList.forEach(function (v) {
      const vx = v.coords[0], vy = v.coords[1];
      v.distance = Math.round(Math.hypot(targetX - vx, targetY - vy));
    });

    let idx = 0;
    const delay = 1;

    function next() {
      if (idx >= villageList.length) {
        renderVillages(villageList);
        return;
      }
      const v = villageList[idx];
      // Token-megőrző market URL
      const marketURL = new URL(v.villageHref, location.origin);
      marketURL.searchParams.set('screen', 'market');
      marketURL.searchParams.delete('mode');
      marketURL.searchParams.delete('page');

      $.get(marketURL.toString(), function (marketRes) {
        try {
          const mDoc = new DOMParser().parseFromString(marketRes, 'text/html');
          const mc = mDoc.querySelector('#market_merchant_available_count');
          const freeMerchants = mc ? (parseInt(mc.textContent, 10) || 0) : 0;
          const packageVolume = pkgWood + pkgClay + pkgIron;

          const maxByResources = Math.floor(Math.min(
            v.wood / (pkgWood || Infinity),
            v.clay / (pkgClay || Infinity),
            v.iron / (pkgIron || Infinity)
          ));
          const maxByTraders = packageVolume > 0 ? Math.floor((freeMerchants * 1000) / packageVolume) : 0;

          v.maxFromVillage = Math.max(0, Math.min(
            Number.isFinite(maxByResources) ? maxByResources : 0,
            maxByTraders
          ));
        } catch (e) {
          console.warn('[CsomagKüldő] Market parse hiba a falunál', v.name, e);
          v.maxFromVillage = 0;
        }
        idx++;
        setTimeout(next, delay);
      }).fail(function (xhr) {
        console.warn('[CsomagKüldő] Market GET hiba a falunál', v.name, xhr && xhr.status);
        v.maxFromVillage = 0;
        idx++;
        setTimeout(next, delay);
      });
    }
    next();
  }

  function renderVillages(villages) {
    villages.sort(function (a, b) { return a.distance - b.distance; });
    const container = document.getElementById('villList');
    if (!container) return;

    const html = villages.map(function (v, i) {
      const id = 'sendBtn_' + i;
      const rowId = 'row_' + i;
      const selId = 'pkgSel_' + i;
      const remaining = Math.max(0, maxPackages - sentPackages);
      const availableFromVillage = Math.max(0, Math.min(v.maxFromVillage || 0, remaining));
      const opts = Array.from({ length: availableFromVillage + 1 }, function (_, k) {
        return '<option value="' + k + '">' + k + '</option>';
      }).join('');
      return [
        '<div id="' + rowId + '" style="border-bottom:1px solid #ccc;margin-bottom:4px;padding:4px">',
        '  <b>' + v.name + '</b> (' + v.distance + ' mező)<br>',
        '  Készlet: ',
        '  <img src="https://dshu.innogamescdn.com/asset/7d3266bc/graphic/holz.webp" height="14"> ' + v.wood.toLocaleString(),
        '  <img src="https://dshu.innogamescdn.com/asset/7d3266bc/graphic/lehm.webp" height="14"> ' + v.clay.toLocaleString(),
        '  <img src="https://dshu.innogamescdn.com/asset/7d3266bc/graphic/eisen.webp" height="14"> ' + v.iron.toLocaleString(),
        '  <br>',
        '  <label>Csomag: <select id="' + selId + '" data-max="' + (v.maxFromVillage || 0) + '">' + opts + '</select></label> ',
        '  <button id="' + id + '" class="btn">Küldés</button>',
        '</div>'
      ].join('');
    }).join('');

    container.innerHTML = html;

    villages.forEach(function (v, i) {
      const btnId = 'sendBtn_' + i;
      const selId = 'pkgSel_' + i;
      const rowId = 'row_' + i;
      const btn = document.getElementById(btnId);
      const sel = document.getElementById(selId);

      if (!btn || !sel) return;

      btn.onclick = function () {
        const count = parseInt(sel.value, 10) || 0;
        if (count === 0) return;

        $.get('/game.php?screen=api&ajax=target_selection&input=' + encodeURIComponent(coordinate) + '&type=coord', function (json) {
          const data = (typeof json === 'string') ? JSON.parse(json) : json;
          if (!data || !data.villages || !data.villages.length) {
            alert('Cél nem található!');
            return;
          }
          const targetId = data.villages[0].id;

          TribalWars.post('market',
            { ajaxaction: 'map_send', village: v.villageId },
            { target_id: targetId, wood: pkgWood * count, stone: pkgClay * count, iron: pkgIron * count },
            function (res) {
              try { UI.SuccessMessage(res.message); } catch (e) { console.log(res); }
              sentPackages += count;
              usedVillageIds.add(v.villageId);
              const sentEl = document.getElementById('sentCounter');
              if (sentEl) sentEl.innerText = String(sentPackages);
              const row = document.getElementById(rowId);
              if (row) row.remove();
              updateDropdowns();
              if (sentPackages >= maxPackages) {
                document.querySelectorAll("button[id^='sendBtn_']").forEach(function (b) { b.disabled = true; });
              }
            }
          );
        });
      };
    });
  }

  function updateDropdowns() {
    const remaining = Math.max(0, maxPackages - sentPackages);
    document.querySelectorAll("select[id^='pkgSel_']").forEach(function (select) {
      const maxFromVillage = parseInt(select.dataset.max || '0', 10) || 0;
      const available = Math.max(0, Math.min(maxFromVillage, remaining));
      const options = Array.from({ length: available + 1 }, function (_, k) {
        return '<option value="' + k + '">' + k + '</option>';
      }).join('');
      select.innerHTML = options;
    });
  }

  // Init
  fetchGroups();
})();
