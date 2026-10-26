/* ═══════════════════════════════════════════════════
   Network Monitor – Frontend JS
   ═══════════════════════════════════════════════════ */

// ── API helpers ──────────────────────────────────────
const api = {
  async get(url)      { const r = await fetch(url); return r.json(); },
  async post(url, d)  { const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }); return [r.status, await r.json()]; },
  async put(url, d)   { const r = await fetch(url, { method:'PUT',  headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }); return [r.status, await r.json()]; },
  async del(url)      { const r = await fetch(url, { method:'DELETE' }); return r.status; },
};

// ── Toast ────────────────────────────────────────────
function toast(msg, type='info') {
  const el = Object.assign(document.createElement('div'), { className:`toast ${type}`, textContent:msg });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Nav ──────────────────────────────────────────────
const sections = { dashboard: null, hosts: null, map: null, settings: null };
function navigate(id) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.nav === id));
  document.querySelectorAll('.section').forEach(el => el.classList.toggle('active', el.id === id));
  document.getElementById('section-title').textContent = t('nav.' + id);
  if (id === 'dashboard') loadDashboard();
  if (id === 'hosts')     loadHostsTable();
  if (id === 'map')       { loadMapData(); }
  if (id === 'settings')  loadSettings();
}
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.nav));
});

// ── Dashboard order + group persistence ──────────────
const CARD_ORDER_KEY    = 'nm_card_order';    // {groupName: [ids]}
const GROUP_COLLAPSE_KEY = 'nm_group_collapse'; // {groupName: true}
const GROUP_ORDER_KEY   = 'nm_group_order';   // [groupName]

function getCardOrder()        { try { return JSON.parse(localStorage.getItem(CARD_ORDER_KEY))  || {}; } catch { return {}; } }
function saveCardOrder(obj)    { localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(obj)); }
function getGroupCollapse()    { try { return JSON.parse(localStorage.getItem(GROUP_COLLAPSE_KEY)) || {}; } catch { return {}; } }
function saveGroupCollapse(obj){ localStorage.setItem(GROUP_COLLAPSE_KEY, JSON.stringify(obj)); }
function getGroupOrder()       { try { return JSON.parse(localStorage.getItem(GROUP_ORDER_KEY)) || []; } catch { return []; } }
function saveGroupOrder(arr)   { localStorage.setItem(GROUP_ORDER_KEY, JSON.stringify(arr)); }

function isGroupCollapsed(g)   { return !!getGroupCollapse()[g]; }
function toggleGroup(g) {
  const c = getGroupCollapse();
  c[g] = !c[g];
  saveGroupCollapse(c);
  const cards = document.querySelector(`.dash-group-cards[data-group="${CSS.escape(g)}"]`);
  const toggle = document.querySelector(`.dash-group[data-group="${CSS.escape(g)}"] .dash-group-toggle`);
  if (cards)  cards.classList.toggle('collapsed', !!c[g]);
  if (toggle) toggle.textContent = c[g] ? '▸' : '▾';
}

function sortGroupHosts(hosts, groupName) {
  const order = (getCardOrder()[groupName] || []);
  if (!order.length) return hosts;
  return [
    ...order.map(id => hosts.find(h => h.id === id)).filter(Boolean),
    ...hosts.filter(h => !order.includes(h.id)),
  ];
}

let _dashHosts = [];
let _dragId    = null;
let _dragGroup = null;

// ── Dashboard ────────────────────────────────────────
async function loadDashboard() {
  const [stats, hosts] = await Promise.all([api.get('api/stats'), api.get('api/hosts')]);

  document.getElementById('stat-total').textContent   = stats.total;
  document.getElementById('stat-up').textContent      = stats.up;
  document.getElementById('stat-down').textContent    = stats.down;
  document.getElementById('stat-unknown').textContent = stats.unknown;

  _dashHosts = hosts;
  updateSidebarBadges(stats);

  // Incidents
  const il = document.getElementById('incident-list');
  if (stats.recent_incidents.length === 0) {
    il.innerHTML = `<p style="color:var(--text2);font-size:12px">${t('dash.noIncidents')}</p>`;
  } else {
    il.innerHTML = stats.recent_incidents.map(l =>
      `<div class="incident-item">
        <span class="inc-name">${hostNameById(hosts, l.host_id)}</span>
        <span>${esc(msgLabel(l.message))}</span>
        <span class="inc-time">${fmtTime(l.checked_at)}</span>
      </div>`
    ).join('');
  }

  // Host cards
  renderDashCards(hosts);
}

function fmtDownDuration(isoSince) {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(isoSince + (isoSince.endsWith('Z') ? '' : 'Z'))) / 1000));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60) % 60, h = Math.floor(secs / 3600) % 24, d = Math.floor(secs / 86400);
  if (d > 0) return `${d}d ${h}h`; if (h > 0) return `${h}h ${m}m`; return `${m}m`;
}

function cardHTML(h) {
  return `
    <div class="host-card ${h.current_status}" data-id="${h.id}" data-group="${esc(h.group_name)}" draggable="true">
      <div class="host-card-header">
        <div class="host-card-name" title="${esc(h.name)}">${esc(h.name)}</div>
        <div class="status-dot ${h.current_status}"></div>
      </div>
      <div class="host-card-addr">${esc(h.address)}${h.check_port ? ':'+h.check_port : ''}</div>
      ${h.current_status === 'down' && h.down_since
        ? `<div class="host-card-downtime">&#9660; ${t('card.down')}: ${fmtDownDuration(h.down_since)}</div>` : ''}
      <div class="host-card-footer">
        <div class="host-card-meta"><span>${h.check_port ? 'TCP' : 'Ping'}</span><span>${h.check_interval}s</span></div>
        <div class="host-card-rtt ${h.last_rtt != null ? h.current_status : 'unknown'}">
          ${h.last_rtt != null ? h.last_rtt.toFixed(1)+'ms' : '—'}
        </div>
      </div>
    </div>`;
}

function renderDashCards(hosts) {
  const grid = document.getElementById('host-grid');
  if (!hosts.length) {
    grid.innerHTML = `<p style="color:var(--text2);text-align:center;padding:40px">${t('dash.empty', { hosts: t('nav.hosts') })}</p>`;
    return;
  }

  // Build groups map
  const groupMap = {};
  hosts.forEach(h => {
    const g = h.group_name || '';
    (groupMap[g] = groupMap[g] || []).push(h);
  });

  // Order groups: saved order first, then alphabetical for new ones
  const savedGOrder = getGroupOrder();
  const allGroupNames = Object.keys(groupMap);
  const groupNames = [
    ...savedGOrder.filter(g => allGroupNames.includes(g)),
    ...allGroupNames.filter(g => !savedGOrder.includes(g)).sort((a, b) => {
      if (!a) return 1; if (!b) return -1; return a.localeCompare(b, LANG);
    }),
  ];

  grid.innerHTML = groupNames.map(g => {
    const hs  = sortGroupHosts(groupMap[g], g);
    const up   = hs.filter(h => h.current_status === 'up').length;
    const down = hs.filter(h => h.current_status === 'down').length;
    const col  = isGroupCollapsed(g);
    const label = g || t('group.none');
    return `
      <div class="dash-group" data-group="${esc(g)}">
        <div class="dash-group-header" onclick="toggleGroup('${esc(g).replace(/'/g,"\\'")}')">
          <span class="dash-group-toggle">${col ? '▸' : '▾'}</span>
          <span class="dash-group-name">${esc(label)}</span>
          <span class="dash-group-count">${hs.length}</span>
          <div class="dash-group-pills">
            ${up   ? `<span class="dash-group-pill up">&#9679; ${up}</span>`   : ''}
            ${down ? `<span class="dash-group-pill down">&#9660; ${down}</span>` : ''}
          </div>
        </div>
        <div class="dash-group-cards${col ? ' collapsed' : ''}" data-group="${esc(g)}">
          ${hs.map(h => cardHTML(h)).join('')}
        </div>
      </div>`;
  }).join('');

  // Attach drag & drop listeners
  grid.querySelectorAll('.host-card').forEach(card => {
    card.addEventListener('click', () => openHostDetail(Number(card.dataset.id)));

    card.addEventListener('dragstart', e => {
      _dragId    = Number(card.dataset.id);
      _dragGroup = card.dataset.group;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      grid.querySelectorAll('.dash-group-cards').forEach(z => z.classList.remove('drag-active'));
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      if (Number(card.dataset.id) !== _dragId) card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', async e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const targetId    = Number(card.dataset.id);
      const targetGroup = card.dataset.group;
      if (_dragId == null || _dragId === targetId) return;

      if (_dragGroup === targetGroup) {
        // Same group – reorder
        const order = getCardOrder();
        const ids = sortGroupHosts(groupMap[targetGroup] || [], targetGroup).map(h => h.id);
        const fi = ids.indexOf(_dragId), ti = ids.indexOf(targetId);
        if (fi !== -1 && ti !== -1) { ids.splice(fi, 1); ids.splice(ti, 0, _dragId); }
        order[targetGroup] = ids;
        saveCardOrder(order);
      } else {
        // Cross-group – move host to target group
        await api.put(`api/hosts/${_dragId}`, { group_name: targetGroup });
        const h = _dashHosts.find(x => x.id === _dragId);
        if (h) h.group_name = targetGroup;
        toast(t('toast.moved', { g: targetGroup || t('group.none') }), 'info');
      }
      renderDashCards(_dashHosts);
    });
  });

  // Group card zones as drop targets (for dropping into empty/collapsed groups)
  grid.querySelectorAll('.dash-group-cards').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('drag-active');
    });
    zone.addEventListener('dragleave', e => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-active');
    });
    zone.addEventListener('drop', async e => {
      zone.classList.remove('drag-active');
      // Only fires when dropped on empty space inside the group, not on a card
      if (e.target !== zone) return;
      const targetGroup = zone.dataset.group;
      if (_dragId == null || _dragGroup === targetGroup) return;
      await api.put(`api/hosts/${_dragId}`, { group_name: targetGroup });
      const h = _dashHosts.find(x => x.id === _dragId);
      if (h) h.group_name = targetGroup;
      toast(t('toast.moved', { g: targetGroup || t('group.none') }), 'info');
      renderDashCards(_dashHosts);
    });
  });
}

function hostNameById(hosts, id) {
  const h = hosts.find(x => x.id === id);
  return h ? esc(h.name) : `Host #${id}`;
}

// ── Hosts table ──────────────────────────────────────
let allHosts = [];
let hostQuery = '';
let hostSort = { key: 'name', dir: 1 };
try {
  const saved = JSON.parse(localStorage.getItem('nm_host_sort'));
  if (saved && ['name', 'address', 'icon', 'status'].includes(saved.key) && (saved.dir === 1 || saved.dir === -1)) hostSort = saved;
} catch {}

const STATUS_RANK = { down: 0, unknown: 1, up: 2 };

// IPv4 → number (null for hostnames / IPv6)
function ipKey(addr) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec((addr || '').trim());
  return m ? ((+m[1] * 256 + +m[2]) * 256 + +m[3]) * 256 + +m[4] : null;
}

// Device category (the "Icono" field) shown as a small glyph + its translated name
function iconLabel(type) {
  const key = 'icon.' + (type || 'computer');
  return I18N.es[key] ? t(key) : (type || '');
}

const _iconImgCache = {};
function iconImg(type) {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const k = theme + ':' + (type || 'computer');
  if (!_iconImgCache[k]) {
    const c = document.createElement('canvas');
    c.width = c.height = 40;                                  // drawn at 2x, shown at 20px
    drawIcon(c.getContext('2d'), type || 'computer', 20, 20, theme === 'light' ? '#656d76' : '#8b949e');
    _iconImgCache[k] = c.toDataURL();
  }
  return _iconImgCache[k];
}

function byName(a, b) {
  return a.name.localeCompare(b.name, LANG, { numeric: true, sensitivity: 'base' });
}

function compareHosts(a, b) {
  let r = 0;
  if (hostSort.key === 'address') {
    const ka = ipKey(a.address), kb = ipKey(b.address);
    if (ka !== null && kb !== null) r = ka - kb;
    else if (ka !== null) r = -1;            // IPs before hostnames
    else if (kb !== null) r = 1;
    else r = a.address.localeCompare(b.address, LANG, { numeric: true, sensitivity: 'base' });
  } else if (hostSort.key === 'icon') {
    r = iconLabel(a.icon_type).localeCompare(iconLabel(b.icon_type), LANG, { sensitivity: 'base' });
  } else if (hostSort.key === 'status') {
    r = (STATUS_RANK[a.current_status] ?? 1) - (STATUS_RANK[b.current_status] ?? 1);
  } else {
    r = byName(a, b);
  }
  return r * hostSort.dir || byName(a, b);
}

function updateSortHeaders() {
  document.querySelectorAll('#hosts th.sortable').forEach(th => {
    const active = th.dataset.sort === hostSort.key;
    th.classList.toggle('sort-asc', active && hostSort.dir === 1);
    th.classList.toggle('sort-desc', active && hostSort.dir === -1);
    th.setAttribute('aria-sort', active ? (hostSort.dir === 1 ? 'ascending' : 'descending') : 'none');
  });
}

document.querySelectorAll('#hosts th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    hostSort = th.dataset.sort === hostSort.key
      ? { key: hostSort.key, dir: -hostSort.dir }
      : { key: th.dataset.sort, dir: 1 };
    try { localStorage.setItem('nm_host_sort', JSON.stringify(hostSort)); } catch {}
    renderHostsTable();
  });
});

let bulkSel = new Set();      // ids ticked in the table (survives the 15 s auto-refresh)
let _visibleIds = [];

async function loadHostsTable() {
  allHosts = await api.get('api/hosts');
  bulkSel = new Set([...bulkSel].filter(id => allHosts.some(h => h.id === id)));
  renderHostsTable();
}

function updateBulkUI() {
  const n = bulkSel.size;
  document.getElementById('bulk-bar').hidden = n === 0;
  document.getElementById('bulk-count').textContent = t('bulk.selected', { n });
  const all = document.getElementById('bulk-all');
  const sel = _visibleIds.filter(id => bulkSel.has(id)).length;
  all.checked = _visibleIds.length > 0 && sel === _visibleIds.length;
  all.indeterminate = sel > 0 && sel < _visibleIds.length;
}

document.getElementById('hosts-tbody').addEventListener('change', e => {
  const cb = e.target.closest('.bulk-cb');
  if (!cb) return;
  const id = Number(cb.dataset.id);
  cb.checked ? bulkSel.add(id) : bulkSel.delete(id);
  cb.closest('tr').classList.toggle('bulk-selected', cb.checked);
  updateBulkUI();
});
document.getElementById('bulk-all').addEventListener('change', e => {
  _visibleIds.forEach(id => e.target.checked ? bulkSel.add(id) : bulkSel.delete(id));
  renderHostsTable();
});
document.getElementById('bulk-clear').addEventListener('click', () => { bulkSel.clear(); renderHostsTable(); });

function renderHostsTable() {
  const q = hostQuery;
  const hosts = allHosts
    .filter(h => !q ||
      h.name.toLowerCase().includes(q) ||
      h.address.toLowerCase().includes(q) ||
      (h.tags || '').toLowerCase().includes(q))
    .sort(compareHosts);
  updateSortHeaders();
  _visibleIds = hosts.map(h => h.id);
  const tbody = document.getElementById('hosts-tbody');
  if (hosts.length === 0) {
    updateBulkUI();
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text2)">${t('hosts.empty')}</td></tr>`;
    return;
  }
  tbody.innerHTML = hosts.map(h => `
    <tr class="${bulkSel.has(h.id) ? 'bulk-selected' : ''}">
      <td class="col-check"><input type="checkbox" class="bulk-cb" data-id="${h.id}" ${bulkSel.has(h.id) ? 'checked' : ''}></td>
      <td>
        <div class="status-dot ${h.current_status}" style="display:inline-block;margin-right:6px;vertical-align:middle"></div>
        <b>${esc(h.name)}</b>
      </td>
      <td>${esc(h.address)}</td>
      <td><span class="icon-cell"><img src="${iconImg(h.icon_type)}" width="20" height="20" alt="">${esc(iconLabel(h.icon_type))}</span></td>
      <td>${h.check_port || 'Ping'}</td>
      <td>${h.check_interval}s</td>
      <td><span class="pill ${h.current_status}">${statusLabel(h.current_status)}</span></td>
      <td>${h.last_rtt != null ? h.last_rtt.toFixed(1)+' ms' : '–'}</td>
      <td>${h.tags ? h.tags.split(',').map(t=>`<span class="tag">${esc(t.trim())}</span>`).join('') : '–'}</td>
      <td>
        <button class="btn-icon" title="${t('act.check')}" onclick="checkNow(${h.id})">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466"/></svg>
        </button>
        <button class="btn-icon" title="${t('act.history')}" onclick="openHostDetail(${h.id})">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1m0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2"/><path d="M7.5 4.75a.75.75 0 0 1 1.5 0v3.5h2a.75.75 0 0 1 0 1.5h-2.75A.75.75 0 0 1 7.5 9z"/></svg>
        </button>
        <button class="btn-icon" title="${t('act.edit')}" onclick="editHost(${h.id})">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207zm-7.468 7.3-.799-2.982-.668 2.679-1.599.44 2.138.585.928-.722zm-2.76-3.222 5.068-5.068.943 3.531L3.272 10.285z"/></svg>
        </button>
        <button class="btn-icon" title="${t('act.delete')}" style="color:var(--down)" onclick="deleteHost(${h.id})">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
}

// Search filter
document.getElementById('host-search').addEventListener('input', e => {
  hostQuery = e.target.value.toLowerCase();
  renderHostsTable();
});

async function checkNow(id) {
  toast(t('toast.checking'), 'info');
  const h = await api.post(`api/hosts/${id}/check`, {}).then(r => r[1]);
  toast(`${h.name}: ${statusLabel(h.current_status)}${h.last_rtt ? ' – '+h.last_rtt.toFixed(1)+'ms' : ''}`,
        h.current_status === 'up' ? 'success' : 'error');
  loadHostsTable();
}

async function deleteHost(id) {
  const h = allHosts.find(x => x.id === id);
  if (!confirm(t('confirm.deleteHost', { name: h?.name }))) return;
  await api.del(`api/hosts/${id}`);
  toast(t('toast.hostDeleted'), 'info');
  loadHostsTable();
  if (document.getElementById('dashboard').classList.contains('active')) loadDashboard();
}

// ── Bulk edit modal ───────────────────────────────────
const bulkModal = document.getElementById('bulk-modal');
const bulkForm  = document.getElementById('bulk-form');
const BULK_NUM  = ['check_port', 'check_interval', 'timeout'];
const BULK_BOOL = ['enabled', 'alert_on_down', 'alert_on_up'];

// same icon list as the single-host form (options carry their data-i18n)
bulkForm.elements.icon_type.innerHTML = document.querySelector('#host-form select[name=icon_type]').innerHTML;
applyI18n();

function bulkApplyLabel() {
  document.getElementById('bulk-apply-btn').textContent = t('bulk.apply', { n: bulkSel.size });
  document.getElementById('bulk-title').textContent = t('bulk.title', { n: bulkSel.size });
}

bulkForm.querySelectorAll('.bulk-apply').forEach(cb => cb.addEventListener('change', () => {
  bulkForm.elements[cb.dataset.field].disabled = !cb.checked;
}));

async function openBulkModal() {
  if (!bulkSel.size) return;
  bulkForm.reset();
  bulkForm.querySelectorAll('.bulk-apply').forEach(cb => { bulkForm.elements[cb.dataset.field].disabled = true; });
  bulkApplyLabel();
  const groups = await api.get('api/groups');
  document.getElementById('group-list').innerHTML = groups.filter(Boolean).map(g => `<option value="${esc(g)}">`).join('');
  bulkModal.classList.add('open');
}
document.getElementById('bulk-edit-btn').addEventListener('click', openBulkModal);
['bulk-cancel', 'bulk-cancel-x'].forEach(id => document.getElementById(id).addEventListener('click', () => bulkModal.classList.remove('open')));

bulkForm.addEventListener('submit', async e => {
  e.preventDefault();
  const changes = {};
  bulkForm.querySelectorAll('.bulk-apply:checked').forEach(cb => {
    const f = cb.dataset.field, v = bulkForm.elements[f].value;
    changes[f] = BULK_BOOL.includes(f) ? v === 'true' : BULK_NUM.includes(f) ? Number(v) : v.trim();
  });
  if (!Object.keys(changes).length) { toast(t('bulk.noFields'), 'error'); return; }
  const [status, res] = await api.put('api/hosts/bulk', { ids: [...bulkSel], changes });
  if (status !== 200) { toast(t('toast.error', { e: res.error || status }), 'error'); return; }
  bulkModal.classList.remove('open');
  toast(t('bulk.done', { n: res.updated }), 'success');
  loadHostsTable();
});

// ── Host modal (add / edit) ───────────────────────────
const hostModal = document.getElementById('host-modal');
let editingHostId = null;

async function openHostModal(host = null) {
  editingHostId = host?.id ?? null;
  document.getElementById('host-modal-title').textContent = t(host ? 'modal.editHost' : 'modal.newHost');
  const f = document.getElementById('host-form');
  f.name.value            = host?.name ?? '';
  f.address.value         = host?.address ?? '';
  f.description.value     = host?.description ?? '';
  f.tags.value            = host?.tags ?? '';
  f.group_name.value      = host?.group_name ?? '';
  f.check_port.value      = host?.check_port ?? 0;
  f.check_interval.value  = host?.check_interval ?? 60;
  f.timeout.value         = host?.timeout ?? 5;
  f.icon_type.value       = host?.icon_type ?? 'computer';
  f.enabled.checked       = host?.enabled ?? true;
  f.alert_on_down.checked = host?.alert_on_down ?? true;
  f.alert_on_up.checked   = host?.alert_on_up ?? true;
  f.alert_email.value     = host?.alert_email ?? '';
  // Populate group datalist
  const groups = await api.get('api/groups');
  const dl = document.getElementById('group-list');
  dl.innerHTML = groups.filter(Boolean).map(g => `<option value="${esc(g)}">`).join('');
  hostModal.classList.add('open');
}

function editHost(id) {
  const h = allHosts.find(x => x.id === id);
  if (h) openHostModal(h);
}

let _detailId = null;
async function openHostDetail(id) {
  _detailId = id;
  const [h, logs] = await Promise.all([
    api.get(`api/hosts/${id}`),
    api.get(`api/hosts/${id}/logs?limit=40`),
  ]);
  const dlg = document.getElementById('detail-modal');
  document.getElementById('detail-title').textContent = h.name;
  document.getElementById('detail-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:13px">
      <div><span style="color:var(--text2)">${t('det.address')}:</span> <b>${esc(h.address)}</b></div>
      <div><span style="color:var(--text2)">${t('det.status')}:</span> <span class="pill ${h.current_status}">${statusLabel(h.current_status)}</span></div>
      <div><span style="color:var(--text2)">${t('det.check')}:</span> ${h.check_port ? t('det.checkPort', { p: h.check_port }) : t('det.checkIcmp')}</div>
      <div><span style="color:var(--text2)">${t('det.interval')}:</span> ${h.check_interval}s</div>
      <div><span style="color:var(--text2)">${t('det.lastRtt')}:</span> ${h.last_rtt != null ? h.last_rtt.toFixed(1)+' ms' : '–'}</div>
      <div><span style="color:var(--text2)">${t('det.lastCheck')}:</span> ${h.last_check ? fmtTime(h.last_check) : '–'}</div>
    </div>
    <h4 style="font-size:12px;color:var(--text2);margin-bottom:8px">${t('det.history')}</h4>
    <div style="max-height:260px;overflow-y:auto">
      ${logs.map(l => `
        <div class="log-item">
          <span class="status-dot ${l.status}" style="flex-shrink:0"></span>
          <span class="log-time">${fmtTime(l.checked_at)}</span>
          <span class="pill ${l.status}" style="font-size:10px">${statusLabel(l.status)}</span>
          <span style="color:var(--text2);flex:1">${esc(msgLabel(l.message))}</span>
          <span class="log-rtt">${l.rtt != null ? l.rtt.toFixed(1)+' ms' : '–'}</span>
        </div>
      `).join('') || `<p style="color:var(--text2);font-size:12px">${t('det.noLogs')}</p>`}
    </div>
  `;
  dlg.classList.add('open');
}

document.getElementById('host-modal-cancel').addEventListener('click', () => hostModal.classList.remove('open'));
document.getElementById('add-host-btn').addEventListener('click', () => openHostModal());

document.getElementById('host-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const data = {
    name: f.name.value.trim(), address: f.address.value.trim(),
    description: f.description.value.trim(), tags: f.tags.value.trim(),
    group_name: f.group_name.value.trim(),
    check_port: Number(f.check_port.value),
    check_interval: Number(f.check_interval.value),
    timeout: Number(f.timeout.value),
    icon_type: f.icon_type.value,
    enabled: f.enabled.checked,
    alert_on_down: f.alert_on_down.checked,
    alert_on_up: f.alert_on_up.checked,
    alert_email: f.alert_email.value.trim(),
  };
  if (!data.name || !data.address) { toast(t('toast.required'), 'error'); return; }

  if (editingHostId) {
    await api.put(`api/hosts/${editingHostId}`, data);
    toast(t('toast.hostUpdated'), 'success');
  } else {
    await api.post('api/hosts', data);
    toast(t('toast.hostAdded'), 'success');
  }
  hostModal.classList.remove('open');
  loadHostsTable();
  if (document.getElementById('dashboard').classList.contains('active')) loadDashboard();
  if (document.getElementById('map').classList.contains('active')) refreshMapHosts();
});

document.getElementById('detail-modal-close').addEventListener('click', () =>
  document.getElementById('detail-modal').classList.remove('open'));

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── Settings ─────────────────────────────────────────
async function loadSettings() {
  const s = await api.get('api/settings');
  const f = document.getElementById('settings-form');
  Object.entries(s).forEach(([k, v]) => {
    const el = f.elements[k];
    if (!el) return;
    if (el.type === 'checkbox') el.checked = v.toLowerCase() === 'true';
    else el.value = v;
  });
}

document.getElementById('settings-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const data = {
    smtp_host: f.smtp_host.value.trim(),
    smtp_port: f.smtp_port.value,
    smtp_user: f.smtp_user.value.trim(),
    smtp_pass: f.smtp_pass.value,
    smtp_from: f.smtp_from.value.trim(),
    smtp_tls:  f.smtp_tls.checked ? 'true' : 'false',
    alert_global_email: f.alert_global_email.value.trim(),
    alert_down_delay_min: f.alert_down_delay_min.value,
  };
  await api.put('api/settings', data);
  toast(t('toast.saved'), 'success');
});

document.getElementById('test-email-btn').addEventListener('click', async () => {
  const f = document.getElementById('settings-form');
  const to = f.alert_global_email.value.trim();
  if (!to) { toast(t('toast.needEmail'), 'error'); return; }
  toast(t('toast.sendingTest'), 'info');
  const [status, res] = await api.post('api/settings/test-email', {
    to, smtp_host: f.smtp_host.value, smtp_port: f.smtp_port.value,
    smtp_user: f.smtp_user.value, smtp_pass: f.smtp_pass.value,
    smtp_from: f.smtp_from.value, smtp_tls: f.smtp_tls.checked,
  });
  if (res.ok) toast(t('toast.testOk'), 'success');
  else toast(t('toast.error', { e: res.error || t('toast.unknownError') }), 'error');
});

// ── MAP CANVAS ───────────────────────────────────────
const canvas  = document.getElementById('mapCanvas');
const ctx     = canvas.getContext('2d');

let mapHosts  = [];
let mapLinks  = [];
let linkMode  = false;
let linkSrc   = null;         // host in linking mode
let transform = { x: 0, y: 0, scale: 1 };
let panning   = null;         // { startX, startY, tx, ty }

function resizeCanvas() {
  const wrap = canvas.parentElement;
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  drawMap();
}
window.addEventListener('resize', resizeCanvas);

// Re-read hosts but keep the positions currently on the canvas (they may be mid-drag)
async function refreshMapHosts() {
  const fresh = await api.get('api/hosts');
  mapHosts = fresh.map(nh => {
    const existing = mapHosts.find(x => x.id === nh.id);
    return { ...nh, map_x: existing?.map_x ?? nh.map_x, map_y: existing?.map_y ?? nh.map_y };
  });
  drawMap();
}

async function loadMapData() {
  [mapHosts, mapLinks, mapShapes] = await Promise.all([api.get('api/hosts'), api.get('api/links'), api.get('api/shapes')]);
  selectShape(null);
  resizeCanvas();
}

// Convert canvas coords to world coords
function toWorld(cx, cy) {
  return {
    x: (cx - transform.x) / transform.scale,
    y: (cy - transform.y) / transform.scale,
  };
}

function hostAt(cx, cy) {
  const w = toWorld(cx, cy);
  return mapHosts.find(h => Math.hypot(h.map_x - w.x, h.map_y - w.y) < 28);
}

// ── Draw ──────────────────────────────────────────────
// Canvas colours follow the day/night theme (the CSS background is handled in style.css)
const MAP_THEMES = {
  dark:  { grid: 'rgba(255,255,255,.04)', node: '#161b22', label: '#e6edf3', sub: '#8b949e',
           link: 'rgba(139,148,158,.35)', linkLabel: 'rgba(139,148,158,.8)',
           status: { up: '#3fb950', down: '#f85149', unknown: '#8b949e' } },
  light: { grid: 'rgba(0,0,0,.07)', node: '#ffffff', label: '#1f2328', sub: '#656d76',
           link: 'rgba(101,109,118,.45)', linkLabel: 'rgba(101,109,118,.9)',
           status: { up: '#1a7f37', down: '#cf222e', unknown: '#656d76' } },
};
let MC = MAP_THEMES.dark;

// ── Animation: flowing link dashes + marching selection rings ──
let dashPhase = 0;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let _lastFrame = 0;
function animateMap(ts) {
  requestAnimationFrame(animateMap);
  stepMap(ts);
}
function stepMap(ts) {
  if (reduceMotion.matches || ts - _lastFrame < 33) return;          // ~30 fps, none if the user prefers reduced motion
  const dt = Math.min(0.1, (ts - _lastFrame) / 1000);
  _lastFrame = ts;
  const busy = mapLinks.length || selHosts.size || selShapes.size || linkMode;
  if (!busy || !document.getElementById('map').classList.contains('active')) return;
  dashPhase = (dashPhase + 22 * dt) % 1000;
  drawMap();
}
requestAnimationFrame(animateMap);

function drawMap() {
  MC = MAP_THEMES[document.documentElement.getAttribute('data-theme')] || MAP_THEMES.dark;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Grid
  ctx.save();
  ctx.strokeStyle = MC.grid;
  ctx.lineWidth = 1;
  const step = 40 * transform.scale;
  const ox = ((transform.x % step) + step) % step;
  const oy = ((transform.y % step) + step) % step;
  for (let x = ox; x < canvas.width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  for (let y = oy; y < canvas.height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
  ctx.restore();

  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.scale, transform.scale);

  // Links
  mapLinks.forEach(lk => {
    const src = mapHosts.find(h => h.id === lk.src);
    const dst = mapHosts.find(h => h.id === lk.dst);
    if (!src || !dst) return;
    ctx.beginPath();
    ctx.moveTo(src.map_x, src.map_y);
    ctx.lineTo(dst.map_x, dst.map_y);
    const picked = lk === selLink;
    ctx.strokeStyle = picked ? '#388bfd' : MC.link;
    ctx.lineWidth = picked ? 3.5 : 2;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -dashPhase;          // dashes travel from source to destination
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    // Label
    if (lk.label) {
      const mx = (src.map_x + dst.map_x) / 2, my = (src.map_y + dst.map_y) / 2;
      ctx.fillStyle = MC.linkLabel;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lk.label, mx, my - 6);
    }
  });

  // Annotation shapes (below hosts)
  mapShapes.forEach(drawShape);

  // Hosts
  mapHosts.forEach(h => drawHostNode(h));

  drawSelectionOverlay();

  ctx.restore();
}

function drawSelectionOverlay() {
  const k = 1 / transform.scale;
  ctx.save();
  ctx.strokeStyle = '#388bfd'; ctx.lineWidth = 2 * k; ctx.setLineDash([5 * k, 4 * k]);
  ctx.lineDashOffset = -dashPhase * k;        // selection ring "marches" around the device
  mapHosts.forEach(h => {
    if (!selHosts.has(h.id)) return;
    ctx.beginPath(); ctx.arc(h.map_x, h.map_y, 32, 0, Math.PI * 2); ctx.stroke();
  });
  ctx.restore();
  if (selShape) drawSelection(selShape);
  else selShapes.forEach(sh => drawSelection(sh, false));
  if (marquee) {
    const r = normRect(marquee);
    ctx.save();
    ctx.fillStyle = 'rgba(56,139,253,.12)'; ctx.strokeStyle = '#388bfd'; ctx.lineWidth = k;
    ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }
}

function drawHostNode(h) {
  const x = h.map_x, y = h.map_y;
  const r = 22;
  const col = MC.status[h.current_status] || MC.status.unknown;

  // Glow for down
  if (h.current_status === 'down') {
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
  }

  // Ring
  ctx.beginPath();
  ctx.arc(x, y, r + 3, 0, Math.PI * 2);
  ctx.strokeStyle = col + '80';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Circle body
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = MC.node;
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Icon
  drawIcon(ctx, h.icon_type, x, y, col);

  // Status dot (top-right)
  ctx.beginPath();
  ctx.arc(x + r * 0.7, y - r * 0.7, 5, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();

  // Label
  ctx.fillStyle = MC.label;
  ctx.font = `bold ${13}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(h.name, x, y + r + 15);
  ctx.fillStyle = MC.sub;
  ctx.font = `${10}px sans-serif`;
  ctx.fillText(h.address, x, y + r + 26);

  // Link-mode highlight
  if (linkMode && linkSrc?.id !== h.id) {
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#1f6feb88';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.lineDashOffset = -dashPhase;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }
  if (linkSrc?.id === h.id) {
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#388bfd';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}

function drawIcon(ctx, type, x, y, col) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';

  switch (type) {
    case 'server':
      ctx.strokeRect(-10, -12, 20, 8);
      ctx.strokeRect(-10,  -2, 20, 8);
      ctx.beginPath(); ctx.arc(-5, -8, 1.5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(-5,  2, 1.5, 0, Math.PI*2); ctx.fill();
      break;
    case 'router':
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI*2); ctx.stroke();
      [-1,1].forEach(d => {
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(d*12, -10); ctx.stroke();
        ctx.beginPath(); ctx.arc(d*12, -10, 2.5, 0, Math.PI*2); ctx.fill();
      });
      break;
    case 'switch':
      ctx.strokeRect(-11, -4, 22, 8);
      [-7,-2,3,8].forEach(px => {
        ctx.beginPath(); ctx.moveTo(px, -4); ctx.lineTo(px, -9); ctx.stroke();
      });
      break;
    case 'firewall':
      ctx.beginPath();
      ctx.moveTo(0,-12); ctx.lineTo(11,12); ctx.lineTo(-11,12); ctx.closePath();
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5,2); ctx.lineTo(5,2); ctx.stroke();
      break;
    case 'ap': // wireless access point
      ctx.beginPath(); ctx.arc(0, 3, 1.8, 0, Math.PI*2); ctx.fill();
      [5, 9, 13].forEach(rad => {
        ctx.beginPath(); ctx.arc(0, 3, rad, Math.PI*1.25, Math.PI*1.75); ctx.stroke();
      });
      ctx.strokeRect(-8, 7, 16, 5);
      break;
    case 'printer':
      ctx.strokeRect(-6, -12, 12, 8);          // paper in
      ctx.strokeRect(-11, -4, 22, 9);          // body
      ctx.strokeRect(-6, 3, 12, 8);            // paper out
      ctx.beginPath(); ctx.arc(7, -1, 1.2, 0, Math.PI*2); ctx.fill();
      break;
    case 'badge': // card / badge reader
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-7, -12, 14, 24, 3); else ctx.rect(-7, -12, 14, 24);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -7, 1.6, 0, Math.PI*2); ctx.fill();   // status LED
      [3.5, 6.5].forEach(rad => {                                       // contactless waves
        ctx.beginPath(); ctx.arc(-3, 4, rad, -0.7, 0.7); ctx.stroke();
      });
      ctx.beginPath(); ctx.arc(-3, 4, 1.2, 0, Math.PI*2); ctx.fill();
      break;
    case 'kiosk': // self-service kiosk
      ctx.strokeRect(-7, -12, 14, 21);
      ctx.strokeRect(-4, -9, 8, 8);                                     // screen
      [-3, 0, 3].forEach(px => { ctx.beginPath(); ctx.arc(px, 4, 1, 0, Math.PI*2); ctx.fill(); });
      ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(10, 12); ctx.stroke();
      break;
    case 'videoconf': // video-conference camera
      ctx.strokeRect(-11, -6, 15, 12);
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(11, -5); ctx.lineTo(11, 5); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-4, 0, 2.2, 0, Math.PI*2); ctx.fill();
      break;
    case 'ups': // battery backup with bolt
      ctx.strokeRect(-10, -8, 20, 18);
      ctx.fillRect(-3, -12, 6, 4);
      ctx.beginPath();
      ctx.moveTo(2, -5); ctx.lineTo(-4, 2); ctx.lineTo(0, 2); ctx.lineTo(-2, 8); ctx.lineTo(4, 0); ctx.lineTo(0, 0); ctx.closePath();
      ctx.fill();
      break;
    case 'pbx': // VoIP desk phone / PBX
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-11, -10, 22, 5, 2); else ctx.rect(-11, -10, 22, 5);
      ctx.stroke();
      ctx.strokeRect(-10, -3, 20, 13);
      [-4, 0, 4].forEach(px => [1, 5].forEach(py => { ctx.beginPath(); ctx.arc(px, py, 1, 0, Math.PI*2); ctx.fill(); }));
      break;
    default: // computer / generic
      ctx.strokeRect(-9, -8, 18, 12);
      ctx.beginPath(); ctx.moveTo(-5,4); ctx.lineTo(-5,9); ctx.lineTo(5,9); ctx.lineTo(5,4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-7,9); ctx.lineTo(7,9); ctx.stroke();
      break;
  }
  ctx.restore();
}

// ── Map shapes (rectangle, diamond, line, text box – transparent fill) ──
let mapShapes  = [];
let shapeTool  = null;      // 'rect' | 'diamond' | 'line' | 'text' | null
let selShape   = null;
let shapeDrag  = null;      // { mode, shape, ... }

const SHAPE_FONTS = ['sans-serif', 'serif', 'monospace', 'Arial', 'Verdana', 'Georgia', 'Courier New', 'Trebuchet MS'];
const SHAPE_DEFAULTS = {
  rect:    { w: 140, h: 90, color: '#388bfd', stroke_width: 2 },
  diamond: { w: 120, h: 100, color: '#388bfd', stroke_width: 2 },
  line:    { w: 140, h: 0,  color: '#388bfd', stroke_width: 2 },
  text:    { w: 180, h: 28, color: '', stroke_width: 1 },   // '' = automatic: follows the day/night theme
};
const $sp = id => document.getElementById(id);

// Automatic colour = the map's label colour for the current theme (dark in day mode, light in night mode)
const themeInk = () => (MAP_THEMES[document.documentElement.getAttribute('data-theme')] || MAP_THEMES.dark).label;
const shapeInk = sh => sh.color || themeInk();

function fontCss(sh) {
  const fam = SHAPE_FONTS.includes(sh.font_family) ? sh.font_family : 'sans-serif';
  return `${sh.font_size || 16}px ${fam.includes(' ') ? `"${fam}"` : fam}, sans-serif`;
}

// Word-wrap a text box to its width; returns { lines, lh, h } (h = real box height)
function textLayout(sh) {
  ctx.save();
  ctx.font = fontCss(sh);
  const maxW = Math.max(20, sh.w - 8), lines = [];
  String(sh.text || '').split('\n').forEach(par => {
    let line = '';
    par.split(' ').forEach(word => {
      const test = line ? line + ' ' + word : word;
      if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = word; }
      else line = test;
    });
    lines.push(line);
  });
  ctx.restore();
  const lh = (sh.font_size || 16) * 1.25;
  return { lines, lh, h: Math.max(sh.h, lines.length * lh + 8) };
}

function shapeBox(sh) {
  return sh.kind === 'text' ? { x: sh.x, y: sh.y, w: sh.w, h: textLayout(sh).h } : { x: sh.x, y: sh.y, w: sh.w, h: sh.h };
}

function drawShape(sh) {
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = shapeInk(sh);
  ctx.lineWidth = sh.stroke_width || 2;
  ctx.lineJoin = ctx.lineCap = 'round';
  const { x, y, w, h } = sh;
  if (sh.kind === 'rect') {
    ctx.strokeRect(x, y, w, h);
  } else if (sh.kind === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x, y + h / 2);
    ctx.closePath(); ctx.stroke();
  } else if (sh.kind === 'line') {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.stroke();
  } else if (sh.kind === 'text') {
    const L = textLayout(sh);
    ctx.font = fontCss(sh);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    L.lines.forEach((ln, i) => ctx.fillText(ln, x + 4, y + 4 + i * L.lh));
  }
  ctx.restore();
}

function shapeHandles(sh) {
  if (sh.kind === 'line') return [{ id: 'p1', x: sh.x, y: sh.y }, { id: 'p2', x: sh.x + sh.w, y: sh.y + sh.h }];
  const b = shapeBox(sh);
  return [
    { id: 'nw', x: b.x, y: b.y }, { id: 'ne', x: b.x + b.w, y: b.y },
    { id: 'sw', x: b.x, y: b.y + b.h }, { id: 'se', x: b.x + b.w, y: b.y + b.h },
  ];
}

function drawSelection(sh, handles = true) {
  const k = 1 / transform.scale;
  ctx.save();
  if (sh.kind !== 'line' || !handles) {
    const b = shapeBounds(sh);
    ctx.strokeStyle = '#388bfd'; ctx.lineWidth = k; ctx.setLineDash([5 * k, 4 * k]);
    ctx.lineDashOffset = -dashPhase * k;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
  }
  if (handles) shapeHandles(sh).forEach(p => {
    const r = 4.5 * k;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#388bfd'; ctx.lineWidth = 1.5 * k;
    ctx.fillRect(p.x - r, p.y - r, 2 * r, 2 * r);
    ctx.strokeRect(p.x - r, p.y - r, 2 * r, 2 * r);
  });
  ctx.restore();
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const u = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
}

function shapeHit(sh, p) {
  const tol = 7 / transform.scale;
  const { x, y, w, h } = sh;
  if (sh.kind === 'line') return distToSegment(p.x, p.y, x, y, x + w, y + h) <= tol;
  if (sh.kind === 'text') { const b = shapeBox(sh); return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }
  if (sh.kind === 'diamond') {
    const pts = [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
    return pts.some((a, i) => { const b = pts[(i + 1) % 4]; return distToSegment(p.x, p.y, a[0], a[1], b[0], b[1]) <= tol; });
  }
  // rect: border only (transparent inside, so the map can still be panned)
  const outer = p.x >= x - tol && p.x <= x + w + tol && p.y >= y - tol && p.y <= y + h + tol;
  const inner = p.x > x + tol && p.x < x + w - tol && p.y > y + tol && p.y < y + h - tol;
  return outer && !inner;
}

function shapeAt(p) {
  for (let i = mapShapes.length - 1; i >= 0; i--) if (shapeHit(mapShapes[i], p)) return mapShapes[i];
  return null;
}

function handleAt(p) {
  if (!selShape) return null;
  const tol = 9 / transform.scale;
  return shapeHandles(selShape).find(hd => Math.hypot(hd.x - p.x, hd.y - p.y) <= tol) || null;
}

// Persist (debounced per shape)
const _saveTimers = {};
function saveShape(sh, delay = 0) {
  if (!sh.id) return;
  clearTimeout(_saveTimers[sh.id]);
  _saveTimers[sh.id] = setTimeout(() => api.put(`api/shapes/${sh.id}`, {
    x: sh.x, y: sh.y, w: sh.w, h: sh.h, text: sh.text, font_family: sh.font_family,
    font_size: sh.font_size, color: sh.color, stroke_width: sh.stroke_width,
  }), delay);
}

async function createShape(data) {
  const [status, res] = await api.post('api/shapes', data);
  return status === 201 ? res : null;
}

// ── Property panel ──
// ── Multi-selection (hosts + shapes) ──
let selHosts    = new Set();   // selected host ids
let selShapes   = new Set();   // selected shape objects
let selectMode  = false;       // toolbar "Select": plain drag on empty space draws a selection box
let groupDrag   = null;        // { start, moved, hosts:[{id,x,y}], shapes:[{s,x,y}] }
let marquee     = null;        // { x0, y0, x1, y1, keep:{hosts,shapes} }

const normRect = m => ({ x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), w: Math.abs(m.x1 - m.x0), h: Math.abs(m.y1 - m.y0) });

function shapeBounds(sh) {
  if (sh.kind === 'line') return { x: Math.min(sh.x, sh.x + sh.w), y: Math.min(sh.y, sh.y + sh.h), w: Math.abs(sh.w), h: Math.abs(sh.h) };
  return shapeBox(sh);
}

// Hosts whose centre is inside r; boxes/diamonds only when fully inside (so a zone drawn
// around some nodes isn't picked up when you box-select the nodes), lines/text when touched.
function itemsInRect(r) {
  const hosts = mapHosts.filter(h => h.map_x >= r.x && h.map_x <= r.x + r.w && h.map_y >= r.y && h.map_y <= r.y + r.h).map(h => h.id);
  const shapes = mapShapes.filter(s => {
    const b = shapeBounds(s);
    if (s.kind === 'rect' || s.kind === 'diamond')
      return b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;
    return b.x <= r.x + r.w && b.x + b.w >= r.x && b.y <= r.y + r.h && b.y + b.h >= r.y;
  });
  return { hosts, shapes };
}

function selectShape(sh) { setSelection([], sh ? [sh] : []); }

// The property panel / resize handles only apply when exactly one shape is selected
// ── Link selection (click a link → delete it from the panel or with Supr) ──
let selLink = null;
const linkName = id => mapHosts.find(h => h.id === id)?.name ?? `#${id}`;

function linkAt(wp) {
  const tol = 6 / transform.scale;
  let best = null, bestD = tol;
  for (const lk of mapLinks) {
    const a = mapHosts.find(h => h.id === lk.src), b = mapHosts.find(h => h.id === lk.dst);
    if (!a || !b) continue;
    const d = distToSegment(wp.x, wp.y, a.map_x, a.map_y, b.map_x, b.map_y);
    if (d <= bestD) { best = lk; bestD = d; }
  }
  return best;
}

function selectLink(lk) {
  setSelection([], []);                      // clears host/shape selection (and any previous link)
  selLink = lk;
  const panel = $sp('link-panel');
  panel.hidden = !lk;
  if (lk) $sp('lp-title').textContent = t('link.title', { a: linkName(lk.src), b: linkName(lk.dst) });
  drawMap();
}
$sp('lp-delete').addEventListener('click', () => { if (selLink) deleteLink(selLink.id); });
$sp('lp-close').addEventListener('click', () => selectLink(null));

function setSelection(hostIds, shapes) {
  if (selLink) { selLink = null; $sp('link-panel').hidden = true; }
  selHosts = new Set(hostIds);
  selShapes = new Set(shapes);
  const sh = (selHosts.size === 0 && selShapes.size === 1) ? [...selShapes][0] : null;
  selShape = sh;
  const panel = $sp('shape-panel');
  panel.hidden = !sh;
  if (sh) {
    const isText = sh.kind === 'text';
    const auto = !sh.color;
    $sp('sp-auto').checked = auto;
    $sp('sp-color').disabled = auto;
    $sp('sp-color').value = /^#[0-9a-f]{6}$/i.test(shapeInk(sh)) ? shapeInk(sh) : '#388bfd';
    $sp('sp-width').value = sh.stroke_width;
    $sp('sp-width').style.display = $sp('sp-width').previousElementSibling.style.display = isText ? 'none' : '';
    $sp('sp-text-fields').style.display = isText ? '' : 'none';
    $sp('sp-text').value = sh.text || '';
    $sp('sp-font').value = SHAPE_FONTS.includes(sh.font_family) ? sh.font_family : 'sans-serif';
    $sp('sp-size').value = sh.font_size;
  }
  drawMap();
}

$sp('sp-font').innerHTML = SHAPE_FONTS.map(f => `<option value="${f}" style="font-family:'${f}'">${f}</option>`).join('');

function bindPanel(id, apply) {
  $sp(id).addEventListener('input', () => {
    if (!selShape) return;
    apply(selShape, $sp(id).value);
    drawMap();
    saveShape(selShape, 300);
  });
}
bindPanel('sp-color', (s, v) => { s.color = v; });
$sp('sp-auto').addEventListener('change', () => {
  if (!selShape) return;
  selShape.color = $sp('sp-auto').checked ? '' : $sp('sp-color').value;
  selectShape(selShape);
  saveShape(selShape);
});
bindPanel('sp-width', (s, v) => { s.stroke_width = Math.max(1, Math.min(12, Number(v) || 1)); });
bindPanel('sp-text',  (s, v) => { s.text = v; });
bindPanel('sp-font',  (s, v) => { s.font_family = v; });
bindPanel('sp-size',  (s, v) => { s.font_size = Math.max(8, Math.min(120, Math.round(Number(v)) || 16)); });

async function deleteSelectedShape() {
  const doomed = [...selShapes];
  if (!doomed.length || selHosts.size) return;       // hosts are never deleted from the map
  if (doomed.length > 1 && !confirm(t('confirm.deleteShapes', { n: doomed.length }))) return;
  setSelection([], []);
  mapShapes = mapShapes.filter(x => !doomed.includes(x));
  drawMap();
  await Promise.all(doomed.filter(s => s.id).map(s => api.del(`api/shapes/${s.id}`)));
}
$sp('sp-delete').addEventListener('click', deleteSelectedShape);
$sp('sp-close').addEventListener('click', () => selectShape(null));

// ── Tools ──
function setShapeTool(kind) {
  shapeTool = kind === shapeTool ? null : kind;
  if (shapeTool && linkMode) {                 // tools and link mode are mutually exclusive
    linkMode = false; linkSrc = null;
    linkBtn.style.background = ''; linkBtn.style.color = '';
  }
  if (shapeTool) selectMode = false;
  document.querySelectorAll('.shape-tool').forEach(b => b.classList.toggle('active', b.dataset.shape === shapeTool));
  $sp('map-select-btn').classList.toggle('active', selectMode);
  canvas.style.cursor = (shapeTool || selectMode) ? 'crosshair' : 'default';
  drawMap();
  updateMapHint();
}

function setSelectMode(on) {
  if (on && shapeTool) setShapeTool(shapeTool);
  if (on && linkMode) {
    linkMode = false; linkSrc = null;
    linkBtn.style.background = ''; linkBtn.style.color = '';
  }
  selectMode = on;
  $sp('map-select-btn').classList.toggle('active', on);
  canvas.style.cursor = on ? 'crosshair' : 'default';
  updateMapHint();
}
$sp('map-select-btn').addEventListener('click', () => setSelectMode(!selectMode));

function beginGroupDrag(wp, clickedHost = null) {
  hideMapTooltip();
  groupDrag = {
    start: wp, moved: false, clickedHost,
    hosts:  [...selHosts].map(id => { const h = mapHosts.find(x => x.id === id); return { id, x: h.map_x, y: h.map_y }; }),
    shapes: [...selShapes].map(s => ({ s, x: s.x, y: s.y })),
  };
  canvas.style.cursor = 'grabbing';
}
document.querySelectorAll('.shape-tool').forEach(b => b.addEventListener('click', () => setShapeTool(b.dataset.shape)));

async function beginShapeDraw(p) {
  const kind = shapeTool;
  const d = SHAPE_DEFAULTS[kind];
  setShapeTool(kind);                           // toggles the tool off: one shape per click
  if (kind === 'text') {
    const data = { kind, x: p.x, y: p.y, ...d, text: t('shape.defaultText'), font_family: 'sans-serif', font_size: 16 };
    const sh = await createShape(data);
    if (!sh) return;
    mapShapes.push(sh);
    selectShape(sh);
    $sp('sp-text').focus(); $sp('sp-text').select();
    return;
  }
  const sh = { kind, x: p.x, y: p.y, w: 0, h: 0, text: '', font_family: 'sans-serif', font_size: 16,
               color: d.color, stroke_width: d.stroke_width };
  mapShapes.push(sh);
  selShape = sh;
  shapeDrag = { mode: 'draw', shape: sh, start: p, moved: false };
}

function beginShapeResize(hd, p) {
  const sh = selShape;
  const b = shapeBox(sh);
  const opposite = { nw: [b.x + b.w, b.y + b.h], ne: [b.x, b.y + b.h], sw: [b.x + b.w, b.y], se: [b.x, b.y] }[hd.id];
  shapeDrag = { mode: 'resize', shape: sh, handle: hd.id, anchor: opposite ? { x: opposite[0], y: opposite[1] } : null, moved: false };
}

function updateShapeDrag(p) {
  const d = shapeDrag, sh = d.shape;
  d.moved = true;
  if (d.mode === 'draw') {
    if (sh.kind === 'line') { sh.w = p.x - d.start.x; sh.h = p.y - d.start.y; }
    else { sh.x = Math.min(d.start.x, p.x); sh.y = Math.min(d.start.y, p.y); sh.w = Math.abs(p.x - d.start.x); sh.h = Math.abs(p.y - d.start.y); }
  } else if (d.mode === 'resize') {
    if (d.handle === 'p1') { const x2 = sh.x + sh.w, y2 = sh.y + sh.h; sh.x = p.x; sh.y = p.y; sh.w = x2 - p.x; sh.h = y2 - p.y; }
    else if (d.handle === 'p2') { sh.w = p.x - sh.x; sh.h = p.y - sh.y; }
    else {
      sh.x = Math.min(d.anchor.x, p.x); sh.y = Math.min(d.anchor.y, p.y);
      sh.w = Math.max(20, Math.abs(p.x - d.anchor.x));
      sh.h = Math.max(sh.kind === 'text' ? 0 : 10, Math.abs(p.y - d.anchor.y));
    }
  }
  drawMap();
}

async function finishShapeDrag() {
  const d = shapeDrag;
  shapeDrag = null;
  canvas.style.cursor = shapeTool ? 'crosshair' : 'default';
  const sh = d.shape;
  if (d.mode === 'draw') {
    const tiny = sh.kind === 'line' ? Math.hypot(sh.w, sh.h) < 6 : (sh.w < 6 && sh.h < 6);
    if (tiny) { const def = SHAPE_DEFAULTS[sh.kind]; sh.w = def.w; sh.h = def.h; if (sh.kind !== 'line') { sh.x = d.start.x; sh.y = d.start.y; } }
    const saved = await createShape(sh);
    if (!saved) { mapShapes = mapShapes.filter(x => x !== sh); selShape = null; drawMap(); return; }
    Object.assign(sh, saved);
    selectShape(sh);
  } else if (d.moved) {
    saveShape(sh);
  }
}

window.addEventListener('mousemove', e => {
  if (!(shapeDrag || groupDrag || marquee)) return;
  const rect = canvas.getBoundingClientRect();
  const p = toWorld(e.clientX - rect.left, e.clientY - rect.top);
  if (shapeDrag) { updateShapeDrag(p); return; }
  if (groupDrag) {
    const dx = p.x - groupDrag.start.x, dy = p.y - groupDrag.start.y;
    groupDrag.moved = true;
    groupDrag.hosts.forEach(it => {
      const h = mapHosts.find(x => x.id === it.id);   // look up each time: the 15 s refresh replaces host objects
      if (h) { h.map_x = it.x + dx; h.map_y = it.y + dy; }
    });
    groupDrag.shapes.forEach(it => { it.s.x = it.x + dx; it.s.y = it.y + dy; });
    drawMap();
    return;
  }
  marquee.x1 = p.x; marquee.y1 = p.y;
  const found = itemsInRect(normRect(marquee));
  selHosts  = new Set([...marquee.keep.hosts,  ...found.hosts]);
  selShapes = new Set([...marquee.keep.shapes, ...found.shapes]);
  selShape = null; $sp('shape-panel').hidden = true;
  drawMap();
});

window.addEventListener('mouseup', async () => {
  if (shapeDrag) { finishShapeDrag(); return; }
  if (groupDrag) {
    const g = groupDrag;
    groupDrag = null;
    canvas.style.cursor = (shapeTool || selectMode) ? 'crosshair' : 'default';
    if (!g.moved) {
      if (g.clickedHost) { setSelection([g.clickedHost.id], []); openHostModal(g.clickedHost); }   // plain click = edit
      return;
    }
    await Promise.all([
      ...g.hosts.map(it => { const h = mapHosts.find(x => x.id === it.id); return h && api.put(`api/hosts/${h.id}`, { map_x: h.map_x, map_y: h.map_y }); }),
      ...g.shapes.map(it => saveShape(it.s)),
    ]);
    return;
  }
  if (marquee) {
    const hs = [...selHosts], ss = [...selShapes];
    marquee = null;
    setSelection(hs, ss);                              // re-evaluates the single-shape panel
  }
});

document.addEventListener('keydown', e => {
  if (!document.getElementById('map').classList.contains('active')) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if (e.key === 'Escape') {
    if (shapeDrag || groupDrag || marquee) return;
    if (shapeTool) setShapeTool(shapeTool);
    else if (selectMode) setSelectMode(false);
    else if (selHosts.size + selShapes.size || selLink) setSelection([], []);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !typing) {
    e.preventDefault();
    setSelection(mapHosts.map(h => h.id), mapShapes);
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selLink && !typing) {
    e.preventDefault();
    deleteLink(selLink.id);
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selShapes.size && !selHosts.size && !typing) {
    e.preventDefault();
    deleteSelectedShape();
  }
});

// ── Map interactions ──────────────────────────────────
canvas.addEventListener('mousedown', e => {
  const rect  = canvas.getBoundingClientRect();
  const cx    = e.clientX - rect.left;
  const cy    = e.clientY - rect.top;
  const h     = hostAt(cx, cy);

  if (linkMode) {
    if (h) {
      if (!linkSrc) {
        linkSrc = h;
        drawMap();
      } else if (linkSrc.id !== h.id) {
        createLink(linkSrc.id, h.id);
        linkSrc = null;
        drawMap();
      }
    }
    return;
  }

  const additive = e.shiftKey || e.metaKey;
  if (e.button === 0) {
    const wp = toWorld(cx, cy);
    if (shapeTool) { beginShapeDraw(wp); return; }
    const hd = handleAt(wp);
    if (hd) { beginShapeResize(hd, wp); return; }
    const sh = h ? null : shapeAt(wp);
    if (h || sh) {
      if (additive) {                                  // Shift/Cmd-click: toggle in the selection
        const hs = new Set(selHosts), ss = new Set(selShapes);
        if (h) { if (!hs.delete(h.id)) hs.add(h.id); }
        else   { if (!ss.delete(sh))   ss.add(sh); }
        setSelection([...hs], [...ss]);
        return;
      }
      const inSel = h ? selHosts.has(h.id) : selShapes.has(sh);
      if (!(inSel && selHosts.size + selShapes.size > 1))   // keep a multi-selection when dragging one of its members
        h ? setSelection([h.id], []) : setSelection([], [sh]);
      beginGroupDrag(wp, h);
      return;
    }
    if (!selectMode && !additive) {                    // click on a link selects it
      const lk = linkAt(wp);
      if (lk) { selectLink(lk); return; }
    }
    if (selectMode || additive) {                      // rubber-band selection on empty space
      marquee = { x0: wp.x, y0: wp.y, x1: wp.x, y1: wp.y,
                  keep: additive ? { hosts: [...selHosts], shapes: [...selShapes] } : { hosts: [], shapes: [] } };
      if (!additive) setSelection([], []);
      return;
    }
    if (selHosts.size + selShapes.size || selLink) setSelection([], []);
  }

  panning = { startX: cx, startY: cy, tx: transform.x, ty: transform.y };
  canvas.style.cursor = 'grab';
});

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  if (shapeDrag || groupDrag || marquee) return;
  if (panning) {
    hideMapTooltip();
    transform.x = panning.tx + (cx - panning.startX);
    transform.y = panning.ty + (cy - panning.startY);
    drawMap();
    return;
  }

  const h = hostAt(cx, cy);
  const wp = toWorld(cx, cy);
  showMapTooltip(h, e);
  canvas.style.cursor = h ? (linkMode ? 'crosshair' : 'pointer')
    : (linkMode || shapeTool || selectMode) ? 'crosshair'
    : handleAt(wp) ? 'pointer'
    : shapeAt(wp) ? 'move'
    : linkAt(wp) ? 'pointer' : 'default';
});

const mapTip = document.getElementById('map-tooltip');
function hideMapTooltip() { mapTip.hidden = true; }
function showMapTooltip(h, e) {
  const desc = (h?.description || '').trim();
  if (!desc) { hideMapTooltip(); return; }
  mapTip.textContent = desc;                       // textContent: descriptions are user text
  mapTip.hidden = false;
  const box = canvas.parentElement.getBoundingClientRect();
  let x = e.clientX - box.left + 16, y = e.clientY - box.top + 18;
  if (x + mapTip.offsetWidth > box.width - 8)  x = e.clientX - box.left - mapTip.offsetWidth - 12;
  if (y + mapTip.offsetHeight > box.height - 8) y = e.clientY - box.top - mapTip.offsetHeight - 12;
  mapTip.style.left = Math.max(4, x) + 'px';
  mapTip.style.top  = Math.max(4, y) + 'px';
}
canvas.addEventListener('mouseleave', hideMapTooltip);
canvas.addEventListener('wheel', hideMapTooltip, { passive: true });

canvas.addEventListener('mouseup', e => {
  if (panning) {
    panning = null;
    canvas.style.cursor = 'default';
  }
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const delta = e.deltaY > 0 ? 0.85 : 1.15;
  const newScale = Math.min(4, Math.max(0.2, transform.scale * delta));
  transform.x = cx - (cx - transform.x) * (newScale / transform.scale);
  transform.y = cy - (cy - transform.y) * (newScale / transform.scale);
  transform.scale = newScale;
  drawMap();
}, { passive: false });

canvas.addEventListener('dblclick', e => {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  if (hostAt(cx, cy)) return;
  const sh = shapeAt(toWorld(cx, cy));
  if (sh?.kind === 'text') { selectShape(sh); $sp('sp-text').focus(); }
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const h = hostAt(e.clientX - rect.left, e.clientY - rect.top);
  if (!h) {
    const lk = linkAt(toWorld(e.clientX - rect.left, e.clientY - rect.top));
    if (lk && confirm(t('confirm.deleteLinkBetween', { a: linkName(lk.src), b: linkName(lk.dst) }))) deleteLink(lk.id);
    return;
  }
  if (h) {
    // Find link from this host
    const lk = mapLinks.find(l => l.src === h.id || l.dst === h.id);
    const action = lk && confirm(t('confirm.deleteLink', { name: h.name }));
    if (action) deleteLink(lk.id);
  }
});

// Map toolbar buttons
document.getElementById('map-zoom-in').addEventListener('click', () => {
  transform.scale = Math.min(4, transform.scale * 1.2);
  drawMap();
});
document.getElementById('map-zoom-out').addEventListener('click', () => {
  transform.scale = Math.max(0.2, transform.scale * 0.8);
  drawMap();
});
document.getElementById('map-fit').addEventListener('click', () => {
  if (!mapHosts.length) return;
  const xs = mapHosts.map(h => h.map_x), ys = mapHosts.map(h => h.map_y);
  const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 60;
  const minY = Math.min(...ys) - 60, maxY = Math.max(...ys) + 60;
  const sw = canvas.width / (maxX - minX), sh = canvas.height / (maxY - minY);
  transform.scale = Math.min(sw, sh, 2);
  transform.x = canvas.width/2 - ((minX + maxX)/2) * transform.scale;
  transform.y = canvas.height/2 - ((minY + maxY)/2) * transform.scale;
  drawMap();
});

const linkBtn = document.getElementById('map-link-btn');
linkBtn.addEventListener('click', () => {
  linkMode = !linkMode;
  linkSrc = null;
  if (linkMode && shapeTool) setShapeTool(shapeTool);
  if (linkMode && selectMode) setSelectMode(false);
  linkBtn.style.background = linkMode ? 'rgba(31,111,235,.3)' : '';
  linkBtn.style.color = linkMode ? '#388bfd' : '';
  drawMap();
  updateMapHint();
});

function updateMapHint() {
  const key = linkMode ? 'map.hintLink' : selectMode ? 'map.hintSelect'
            : shapeTool ? (shapeTool === 'text' ? 'map.hintText' : 'map.hintDraw') : 'map.hint';
  document.querySelector('.map-hint').textContent = t(key);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && linkMode) {
    linkMode = false; linkSrc = null;
    linkBtn.style.background = '';
    linkBtn.style.color = '';
    drawMap();
    updateMapHint();
  }
});

document.getElementById('map-refresh').addEventListener('click', loadMapData);

async function createLink(src, dst) {
  const [status, res] = await api.post('api/links', { src, dst });
  if (status === 201) { mapLinks.push(res); toast(t('toast.linkCreated'), 'success'); }
  else if (status === 409) toast(t('toast.linkExists'), 'info');
  drawMap();
}

async function deleteLink(id) {
  await api.del(`api/links/${id}`);
  mapLinks = mapLinks.filter(l => l.id !== id);
  if (selLink?.id === id) selectLink(null);
  toast(t('toast.linkDeleted'), 'info');
  drawMap();
}

// ── Last modification (deployed version) shown at the bottom of the sidebar ──
let appVersion = null;
function renderAppUpdated() {
  const el = document.getElementById('app-updated');
  if (!appVersion?.updated) { el.textContent = '–'; return; }
  el.textContent = new Date(appVersion.updated * 1000).toLocaleString(LOCALES[LANG],
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  el.title = appVersion.commit ? `commit ${appVersion.commit}` : '';
}
api.get('api/version').then(v => { appVersion = v; renderAppUpdated(); }).catch(() => {});

// ── Sidebar badge update ──────────────────────────────
function updateSidebarBadges(stats) {
  document.getElementById('sb-up').textContent      = stats.up;
  document.getElementById('sb-down').textContent    = stats.down;
  document.getElementById('sb-unknown').textContent = stats.unknown;
}

// ── Utilities ─────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusLabel(s) {
  return ['up', 'down', 'unknown'].includes(s) ? t('status.' + s) : s;
}

// Check messages are stored in English by the backend; translate the known ones for display
function msgLabel(m) {
  m = m || '';
  if (m === 'OK') return t('msg.ok');
  if (m === 'Host unreachable') return t('msg.unreachable');
  if (m === 'Timeout') return t('msg.timeout');
  let r;
  if ((r = /^Port (\d+) open$/.exec(m)))    return t('msg.portOpen', { p: r[1] });
  if ((r = /^Port (\d+) timeout$/.exec(m))) return t('msg.portTimeout', { p: r[1] });
  if ((r = /^Port (\d+) refused$/.exec(m))) return t('msg.portRefused', { p: r[1] });
  return m;
}

function fmtTime(iso) {
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleTimeString(LOCALES[LANG], { hour:'2-digit', minute:'2-digit', second:'2-digit' }) +
         ' ' + d.toLocaleDateString(LOCALES[LANG], { day:'2-digit', month:'2-digit' });
}

// ── Auto-refresh ──────────────────────────────────────
setInterval(() => {
  const active = document.querySelector('.section.active')?.id;
  if (active === 'dashboard') loadDashboard();
  if (active === 'hosts')     loadHostsTable();
  if (active === 'map') refreshMapHosts();
}, 15000);

// ── Theme toggle ──────────────────────────────────────
(function initTheme() {
  const root = document.documentElement;
  const btn  = document.getElementById('theme-toggle');
  const icon = document.getElementById('theme-icon');
  const lbl  = document.getElementById('theme-label');

  const SUN_SVG = `<path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6m0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0m0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13m8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5M3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8m10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0m-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0m9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707M4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708"/>`;
  const MOON_SVG = `<path d="M6 .278a.77.77 0 0 1 .08.858 7.2 7.2 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277q.792-.001 1.533-.16a.79.79 0 0 1 .81.316.73.73 0 0 1-.031.893A8.35 8.35 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.75.75 0 0 1 6 .278"/>`;

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem('nm_theme', theme);
    if (theme === 'light') {
      icon.innerHTML = MOON_SVG;
    } else {
      icon.innerHTML = SUN_SVG;
    }
    lbl.textContent = t(theme === 'light' ? 'theme.toNight' : 'theme.toDay');
    if (document.getElementById('hosts').classList.contains('active')) renderHostsTable();   // icon glyph colours
    if (selShape) selectShape(selShape); else drawMap();   // refresh the panel's automatic colour too
  }
  window.refreshThemeLabel = () => applyTheme(root.getAttribute('data-theme') || 'dark');

  const saved = localStorage.getItem('nm_theme') || 'dark';
  applyTheme(saved);

  btn.addEventListener('click', () => {
    const current = root.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
})();

// ── Sidebar toggle (collapse on desktop, drawer on mobile) ──
(function initSidebar() {
  const body     = document.body;
  const btn      = document.getElementById('sidebar-toggle');
  const backdrop = document.getElementById('sidebar-backdrop');
  const mq       = window.matchMedia('(max-width: 768px)');
  const KEY      = 'nm_sidebar_collapsed';

  if (localStorage.getItem(KEY) === '1') body.classList.add('sidebar-collapsed');

  function closeMobile() { body.classList.remove('sidebar-open'); }

  btn.addEventListener('click', () => {
    if (mq.matches) {
      body.classList.toggle('sidebar-open');
    } else {
      const collapsed = body.classList.toggle('sidebar-collapsed');
      localStorage.setItem(KEY, collapsed ? '1' : '0');
      // repaint the map canvas once the width transition has settled
      setTimeout(() => window.dispatchEvent(new Event('resize')), 220);
    }
  });

  backdrop.addEventListener('click', closeMobile);
  document.querySelectorAll('.nav-item').forEach(el =>
    el.addEventListener('click', () => { if (mq.matches) closeMobile(); }));
  mq.addEventListener('change', closeMobile);
})();

// ── Language switch: re-render everything that JS built ──
function afterLangChange() {
  refreshThemeLabel();
  renderAppUpdated();
  updateBulkUI();
  if (bulkModal.classList.contains('open')) bulkApplyLabel();
  const active = document.querySelector('.section.active')?.id || 'dashboard';
  navigate(active);                                   // title + reload data with translated strings
  updateMapHint();
  if (hostModal.classList.contains('open'))
    document.getElementById('host-modal-title').textContent = t(editingHostId ? 'modal.editHost' : 'modal.newHost');
  if (document.getElementById('detail-modal').classList.contains('open') && _detailId != null) openHostDetail(_detailId);
}

// ── Init ──────────────────────────────────────────────
navigate('dashboard');
