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
  document.getElementById('section-title').textContent =
    { dashboard:'Dashboard', hosts:'Gestión de Hosts', map:'Mapa de Red', settings:'Configuración' }[id];
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
    il.innerHTML = '<p style="color:var(--text2);font-size:12px">Sin incidencias en las últimas 24h</p>';
  } else {
    il.innerHTML = stats.recent_incidents.map(l =>
      `<div class="incident-item">
        <span class="inc-name">${hostNameById(hosts, l.host_id)}</span>
        <span>${l.message}</span>
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
        ? `<div class="host-card-downtime">&#9660; Caído: ${fmtDownDuration(h.down_since)}</div>` : ''}
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
    grid.innerHTML = '<p style="color:var(--text2);text-align:center;padding:40px">No hay hosts. Ve a <b>Gestión de Hosts</b> para añadir uno.</p>';
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
      if (!a) return 1; if (!b) return -1; return a.localeCompare(b, 'es');
    }),
  ];

  grid.innerHTML = groupNames.map(g => {
    const hs  = sortGroupHosts(groupMap[g], g);
    const up   = hs.filter(h => h.current_status === 'up').length;
    const down = hs.filter(h => h.current_status === 'down').length;
    const col  = isGroupCollapsed(g);
    const label = g || 'Sin grupo';
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
        toast(`Movido a "${targetGroup || 'Sin grupo'}"`, 'info');
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
      toast(`Movido a "${targetGroup || 'Sin grupo'}"`, 'info');
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

async function loadHostsTable() {
  allHosts = await api.get('api/hosts');
  renderHostsTable(allHosts);
}

function renderHostsTable(hosts) {
  const tbody = document.getElementById('hosts-tbody');
  if (hosts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text2)">No hay hosts. Añade uno con el botón superior.</td></tr>';
    return;
  }
  tbody.innerHTML = hosts.map(h => `
    <tr>
      <td>
        <div class="status-dot ${h.current_status}" style="display:inline-block;margin-right:6px;vertical-align:middle"></div>
        <b>${esc(h.name)}</b>
      </td>
      <td>${esc(h.address)}</td>
      <td>${h.check_port || 'Ping'}</td>
      <td>${h.check_interval}s</td>
      <td><span class="pill ${h.current_status}">${statusLabel(h.current_status)}</span></td>
      <td>${h.last_rtt != null ? h.last_rtt.toFixed(1)+' ms' : '–'}</td>
      <td>${h.tags ? h.tags.split(',').map(t=>`<span class="tag">${esc(t.trim())}</span>`).join('') : '–'}</td>
      <td>
        <button class="btn-icon" title="Comprobar ahora" onclick="checkNow(${h.id})">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466"/></svg>
        </button>
        <button class="btn-icon" title="Historial" onclick="openHostDetail(${h.id})">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1m0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2"/><path d="M7.5 4.75a.75.75 0 0 1 1.5 0v3.5h2a.75.75 0 0 1 0 1.5h-2.75A.75.75 0 0 1 7.5 9z"/></svg>
        </button>
        <button class="btn-icon" title="Editar" onclick="editHost(${h.id})">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207zm-7.468 7.3-.799-2.982-.668 2.679-1.599.44 2.138.585.928-.722zm-2.76-3.222 5.068-5.068.943 3.531L3.272 10.285z"/></svg>
        </button>
        <button class="btn-icon" title="Eliminar" style="color:var(--down)" onclick="deleteHost(${h.id})">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>
        </button>
      </td>
    </tr>
  `).join('');
}

// Search filter
document.getElementById('host-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  renderHostsTable(allHosts.filter(h =>
    h.name.toLowerCase().includes(q) ||
    h.address.toLowerCase().includes(q) ||
    (h.tags || '').toLowerCase().includes(q)
  ));
});

async function checkNow(id) {
  toast('Comprobando host…', 'info');
  const h = await api.post(`api/hosts/${id}/check`, {}).then(r => r[1]);
  toast(`${h.name}: ${statusLabel(h.current_status)}${h.last_rtt ? ' – '+h.last_rtt.toFixed(1)+'ms' : ''}`,
        h.current_status === 'up' ? 'success' : 'error');
  loadHostsTable();
}

async function deleteHost(id) {
  const h = allHosts.find(x => x.id === id);
  if (!confirm(`¿Eliminar host "${h?.name}"?`)) return;
  await api.del(`api/hosts/${id}`);
  toast('Host eliminado', 'info');
  loadHostsTable();
  if (document.getElementById('dashboard').classList.contains('active')) loadDashboard();
}

// ── Host modal (add / edit) ───────────────────────────
const hostModal = document.getElementById('host-modal');
let editingHostId = null;

async function openHostModal(host = null) {
  editingHostId = host?.id ?? null;
  document.getElementById('host-modal-title').textContent = host ? 'Editar Host' : 'Nuevo Host';
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

async function openHostDetail(id) {
  const [h, logs] = await Promise.all([
    api.get(`api/hosts/${id}`),
    api.get(`api/hosts/${id}/logs?limit=40`),
  ]);
  const dlg = document.getElementById('detail-modal');
  document.getElementById('detail-title').textContent = h.name;
  document.getElementById('detail-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:13px">
      <div><span style="color:var(--text2)">Dirección:</span> <b>${esc(h.address)}</b></div>
      <div><span style="color:var(--text2)">Estado:</span> <span class="pill ${h.current_status}">${statusLabel(h.current_status)}</span></div>
      <div><span style="color:var(--text2)">Comprobación:</span> ${h.check_port ? 'Puerto '+h.check_port : 'ICMP Ping'}</div>
      <div><span style="color:var(--text2)">Intervalo:</span> ${h.check_interval}s</div>
      <div><span style="color:var(--text2)">Último RTT:</span> ${h.last_rtt != null ? h.last_rtt.toFixed(1)+' ms' : '–'}</div>
      <div><span style="color:var(--text2)">Última check:</span> ${h.last_check ? fmtTime(h.last_check) : '–'}</div>
    </div>
    <h4 style="font-size:12px;color:var(--text2);margin-bottom:8px">HISTORIAL RECIENTE</h4>
    <div style="max-height:260px;overflow-y:auto">
      ${logs.map(l => `
        <div class="log-item">
          <span class="status-dot ${l.status}" style="flex-shrink:0"></span>
          <span class="log-time">${fmtTime(l.checked_at)}</span>
          <span class="pill ${l.status}" style="font-size:10px">${statusLabel(l.status)}</span>
          <span style="color:var(--text2);flex:1">${esc(l.message)}</span>
          <span class="log-rtt">${l.rtt != null ? l.rtt.toFixed(1)+' ms' : '–'}</span>
        </div>
      `).join('') || '<p style="color:var(--text2);font-size:12px">Sin registros aún.</p>'}
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
  if (!data.name || !data.address) { toast('Nombre y dirección son obligatorios', 'error'); return; }

  if (editingHostId) {
    await api.put(`api/hosts/${editingHostId}`, data);
    toast('Host actualizado', 'success');
  } else {
    await api.post('api/hosts', data);
    toast('Host añadido', 'success');
  }
  hostModal.classList.remove('open');
  loadHostsTable();
  if (document.getElementById('dashboard').classList.contains('active')) loadDashboard();
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
  };
  await api.put('api/settings', data);
  toast('Configuración guardada', 'success');
});

document.getElementById('test-email-btn').addEventListener('click', async () => {
  const f = document.getElementById('settings-form');
  const to = f.alert_global_email.value.trim();
  if (!to) { toast('Introduce un email de destino en el campo "Email global"', 'error'); return; }
  toast('Enviando email de prueba…', 'info');
  const [status, res] = await api.post('api/settings/test-email', {
    to, smtp_host: f.smtp_host.value, smtp_port: f.smtp_port.value,
    smtp_user: f.smtp_user.value, smtp_pass: f.smtp_pass.value,
    smtp_from: f.smtp_from.value, smtp_tls: f.smtp_tls.checked,
  });
  if (res.ok) toast('Email de prueba enviado correctamente', 'success');
  else toast('Error: ' + (res.error || 'desconocido'), 'error');
});

// ── MAP CANVAS ───────────────────────────────────────
const canvas  = document.getElementById('mapCanvas');
const ctx     = canvas.getContext('2d');

let mapHosts  = [];
let mapLinks  = [];
let drag      = null;         // { host, ox, oy }
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

async function loadMapData() {
  [mapHosts, mapLinks] = await Promise.all([api.get('api/hosts'), api.get('api/links')]);
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
function drawMap() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Grid
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.04)';
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
    ctx.strokeStyle = 'rgba(139,148,158,.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Label
    if (lk.label) {
      const mx = (src.map_x + dst.map_x) / 2, my = (src.map_y + dst.map_y) / 2;
      ctx.fillStyle = 'rgba(139,148,158,.8)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lk.label, mx, my - 6);
    }
  });

  // Hosts
  mapHosts.forEach(h => drawHostNode(h));

  ctx.restore();
}

const COLORS = { up:'#3fb950', down:'#f85149', unknown:'#8b949e' };

function drawHostNode(h) {
  const x = h.map_x, y = h.map_y;
  const r = 22;
  const col = COLORS[h.current_status] || COLORS.unknown;

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
  ctx.fillStyle = '#161b22';
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
  ctx.fillStyle = '#e6edf3';
  ctx.font = `bold ${13}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(h.name, x, y + r + 15);
  ctx.fillStyle = '#8b949e';
  ctx.font = `${10}px sans-serif`;
  ctx.fillText(h.address, x, y + r + 26);

  // Link-mode highlight
  if (linkMode && linkSrc?.id !== h.id) {
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#1f6feb88';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
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
    default: // computer / generic
      ctx.strokeRect(-9, -8, 18, 12);
      ctx.beginPath(); ctx.moveTo(-5,4); ctx.lineTo(-5,9); ctx.lineTo(5,9); ctx.lineTo(5,4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-7,9); ctx.lineTo(7,9); ctx.stroke();
      break;
  }
  ctx.restore();
}

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

  if (h) {
    drag = { host: h, ox: toWorld(cx, cy).x - h.map_x, oy: toWorld(cx, cy).y - h.map_y };
    canvas.style.cursor = 'grabbing';
  } else if (e.button === 1 || e.altKey) {
    panning = { startX: cx, startY: cy, tx: transform.x, ty: transform.y };
    canvas.style.cursor = 'grab';
  } else {
    panning = { startX: cx, startY: cy, tx: transform.x, ty: transform.y };
    canvas.style.cursor = 'grab';
  }
});

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  if (drag) {
    const w = toWorld(cx, cy);
    drag.host.map_x = w.x - drag.ox;
    drag.host.map_y = w.y - drag.oy;
    drawMap();
    return;
  }
  if (panning) {
    transform.x = panning.tx + (cx - panning.startX);
    transform.y = panning.ty + (cy - panning.startY);
    drawMap();
    return;
  }

  const h = hostAt(cx, cy);
  canvas.style.cursor = h ? (linkMode ? 'crosshair' : 'pointer') : (linkMode ? 'crosshair' : 'default');
});

canvas.addEventListener('mouseup', async e => {
  if (drag) {
    const h = drag.host;
    canvas.style.cursor = 'default';
    drag = null;
    await api.put(`api/hosts/${h.id}`, { map_x: h.map_x, map_y: h.map_y });
  }
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
  const h = hostAt(e.clientX - rect.left, e.clientY - rect.top);
  if (h) openHostDetail(h.id);
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const h = hostAt(e.clientX - rect.left, e.clientY - rect.top);
  if (h) {
    // Find link from this host
    const lk = mapLinks.find(l => l.src === h.id || l.dst === h.id);
    const action = lk && confirm(`¿Eliminar enlace de "${h.name}"?`);
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
  linkBtn.style.background = linkMode ? 'rgba(31,111,235,.3)' : '';
  linkBtn.style.color = linkMode ? '#388bfd' : '';
  drawMap();
  document.querySelector('.map-hint').textContent = linkMode
    ? 'Haz clic en un host origen, luego en el destino. ESC para cancelar.'
    : 'Clic: arrastrar  |  Doble-clic: detalles  |  Rueda: zoom  |  Clic-dcho: quitar enlace';
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && linkMode) {
    linkMode = false; linkSrc = null;
    linkBtn.style.background = '';
    linkBtn.style.color = '';
    drawMap();
  }
});

document.getElementById('map-refresh').addEventListener('click', loadMapData);

async function createLink(src, dst) {
  const [status, res] = await api.post('api/links', { src, dst });
  if (status === 201) { mapLinks.push(res); toast('Enlace creado', 'success'); }
  else if (status === 409) toast('El enlace ya existe', 'info');
  drawMap();
}

async function deleteLink(id) {
  await api.del(`api/links/${id}`);
  mapLinks = mapLinks.filter(l => l.id !== id);
  toast('Enlace eliminado', 'info');
  drawMap();
}

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
  return { up:'En línea', down:'Caído', unknown:'Desconocido' }[s] || s;
}

function fmtTime(iso) {
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) +
         ' ' + d.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit' });
}

// ── Auto-refresh ──────────────────────────────────────
setInterval(() => {
  const active = document.querySelector('.section.active')?.id;
  if (active === 'dashboard') loadDashboard();
  if (active === 'hosts')     loadHostsTable();
  if (active === 'map') {
    api.get('api/hosts').then(h => {
      // Merge positions from canvas with fresh status
      mapHosts = h.map(nh => {
        const existing = mapHosts.find(x => x.id === nh.id);
        return { ...nh, map_x: existing?.map_x ?? nh.map_x, map_y: existing?.map_y ?? nh.map_y };
      });
      drawMap();
    });
  }
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
      lbl.textContent = 'Modo noche';
    } else {
      icon.innerHTML = SUN_SVG;
      lbl.textContent = 'Modo día';
    }
  }

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

// ── Init ──────────────────────────────────────────────
navigate('dashboard');
