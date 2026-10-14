/* ═══════════════════════════════════════════════════
   Network Monitor – i18n (ES / EN)
   Static text:   data-i18n / data-i18n-html / data-i18n-placeholder /
                  data-i18n-title / data-i18n-aria
   Dynamic text:  t('key', { param: value })
   ═══════════════════════════════════════════════════ */

const I18N = {
  es: {
    'app.subtitle': 'Monitorización de red',
    'nav.dashboard': 'Dashboard',
    'nav.hosts': 'Gestión de Hosts',
    'nav.map': 'Mapa de Red',
    'nav.settings': 'Configuración',
    'menu.toggle': 'Mostrar / ocultar menú',
    'theme.toggle': 'Cambiar modo noche/día',
    'theme.toDay': 'Modo día',
    'theme.toNight': 'Modo noche',
    'lang.label': 'Idioma',

    'sb.up': 'En línea', 'sb.down': 'Caídos', 'sb.unknown': 'Desconocido',
    'status.up': 'En línea', 'status.down': 'Caído', 'status.unknown': 'Desconocido',

    'stat.total': 'Total hosts', 'stat.up': 'En línea', 'stat.down': 'Caídos', 'stat.nodata': 'Sin datos',
    'dash.incidents': 'INCIDENCIAS ÚLTIMAS 24h',
    'dash.noIncidents': 'Sin incidencias en las últimas 24h',
    'dash.empty': 'No hay hosts. Ve a <b>{hosts}</b> para añadir uno.',
    'group.none': 'Sin grupo',
    'card.down': 'Caído',

    'hosts.search': 'Buscar por nombre, IP o etiqueta…',
    'hosts.add': 'Añadir Host',
    'hosts.refresh': 'Actualizar',
    'hosts.empty': 'No hay hosts. Añade uno con el botón superior.',
    'th.name': 'Nombre', 'th.address': 'Dirección', 'th.port': 'Puerto', 'th.interval': 'Intervalo',
    'th.status': 'Estado', 'th.rtt': 'RTT', 'th.tags': 'Etiquetas', 'th.actions': 'Acciones',
    'sort.hint': 'Clic para ordenar',
    'act.check': 'Comprobar ahora', 'act.history': 'Historial', 'act.edit': 'Editar', 'act.delete': 'Eliminar',

    'map.zoomIn': '＋ Zoom', 'map.zoomOut': '－ Zoom', 'map.fit': '⊡ Ajustar',
    'map.link': 'Enlazar hosts', 'map.refresh': '↺ Actualizar',
    'map.hint': 'Clic: arrastrar  |  Doble-clic: detalles  |  Rueda: zoom  |  Clic-dcho: quitar enlace',
    'map.hintLink': 'Haz clic en un host origen, luego en el destino. ESC para cancelar.',
    'map.hintDraw': 'Arrastra sobre el mapa para dibujar. ESC para cancelar.',
    'map.hintText': 'Haz clic donde quieras colocar el texto. ESC para cancelar.',
    'shape.rect': 'Cuadro', 'shape.diamond': 'Rombo', 'shape.line': 'Línea', 'shape.text': 'Texto',
    'shape.color': 'Color', 'shape.width': 'Grosor', 'shape.font': 'Fuente', 'shape.size': 'Tamaño',
    'shape.delete': 'Eliminar', 'shape.defaultText': 'Texto',

    'set.smtpTitle': 'Servidor SMTP (envío de alertas)',
    'set.smtpHost': 'Servidor SMTP', 'set.port': 'Puerto', 'set.user': 'Usuario',
    'set.pass': 'Contraseña / App Password', 'set.from': 'From (remitente)', 'set.tls': 'Usar STARTTLS',
    'set.alerts': 'Alertas',
    'set.globalEmail': 'Email global de alertas (recibe todas las notificaciones)',
    'set.delay': 'Retraso antes de alertar caída (minutos)',
    'set.save': 'Guardar configuración', 'set.test': 'Enviar email de prueba',
    'set.helpTitle': 'Ayuda – Gmail App Password',
    'set.help1': 'Activa la verificación en dos pasos en tu cuenta de Google.',
    'set.help2': 'Ve a <b>Seguridad → Contraseñas de aplicación</b>.',
    'set.help3': 'Genera una contraseña para "Correo" y pégala en el campo de contraseña.',
    'set.help4': 'Usa <code>smtp.gmail.com</code> / puerto <code>587</code> con STARTTLS.',

    'modal.newHost': 'Nuevo Host', 'modal.editHost': 'Editar Host',
    'f.name': 'Nombre *', 'f.address': 'Dirección IP / Hostname *', 'f.desc': 'Descripción',
    'f.port': 'Puerto (0 = ICMP Ping)', 'f.interval': 'Intervalo de comprobación (seg)',
    'f.timeout': 'Timeout (seg)', 'f.icon': 'Icono', 'f.tags': 'Etiquetas (separadas por coma)',
    'f.group': 'Grupo (dashboard)', 'f.alertEmail': 'Email de alerta para este host (opcional)',
    'f.enabled': 'Monitorización activa', 'f.alertDown': 'Alertar al caer', 'f.alertUp': 'Alertar al recuperarse',
    'ph.name': 'Servidor Web', 'ph.address': '192.168.1.1 o server.local', 'ph.desc': 'Descripción opcional',
    'ph.tags': 'red, producción, dmz', 'ph.group': 'Servidores, Red, DNS…',
    'ph.alertEmail': 'responsable@empresa.com',
    'icon.computer': 'Ordenador / Genérico', 'icon.server': 'Servidor', 'icon.router': 'Router',
    'icon.switch': 'Switch', 'icon.firewall': 'Firewall', 'icon.ap': 'Punto de acceso (AP)',
    'icon.printer': 'Impresora', 'icon.badge': 'Lector de acceso (badge)', 'icon.kiosk': 'Kiosko',
    'btn.cancel': 'Cancelar', 'btn.save': 'Guardar', 'btn.close': 'Cerrar',

    'det.address': 'Dirección', 'det.status': 'Estado', 'det.check': 'Comprobación',
    'det.checkPort': 'Puerto {p}', 'det.checkIcmp': 'ICMP Ping', 'det.interval': 'Intervalo',
    'det.lastRtt': 'Último RTT', 'det.lastCheck': 'Última check',
    'det.history': 'HISTORIAL RECIENTE', 'det.noLogs': 'Sin registros aún.',

    'msg.ok': 'OK', 'msg.unreachable': 'Host inalcanzable', 'msg.timeout': 'Tiempo agotado',
    'msg.portOpen': 'Puerto {p} abierto', 'msg.portTimeout': 'Puerto {p}: tiempo agotado',
    'msg.portRefused': 'Puerto {p} rechazado',

    'toast.checking': 'Comprobando host…',
    'toast.hostDeleted': 'Host eliminado', 'toast.hostUpdated': 'Host actualizado', 'toast.hostAdded': 'Host añadido',
    'toast.required': 'Nombre y dirección son obligatorios',
    'toast.saved': 'Configuración guardada',
    'toast.needEmail': 'Introduce un email de destino en el campo "Email global"',
    'toast.sendingTest': 'Enviando email de prueba…',
    'toast.testOk': 'Email de prueba enviado correctamente',
    'toast.error': 'Error: {e}', 'toast.unknownError': 'desconocido',
    'toast.moved': 'Movido a "{g}"',
    'toast.linkCreated': 'Enlace creado', 'toast.linkExists': 'El enlace ya existe', 'toast.linkDeleted': 'Enlace eliminado',
    'confirm.deleteHost': '¿Eliminar host "{name}"?',
    'confirm.deleteLink': '¿Eliminar enlace de "{name}"?',
  },

  en: {
    'app.subtitle': 'Network monitoring',
    'nav.dashboard': 'Dashboard',
    'nav.hosts': 'Host Management',
    'nav.map': 'Network Map',
    'nav.settings': 'Settings',
    'menu.toggle': 'Show / hide menu',
    'theme.toggle': 'Switch night/day mode',
    'theme.toDay': 'Day mode',
    'theme.toNight': 'Night mode',
    'lang.label': 'Language',

    'sb.up': 'Online', 'sb.down': 'Down', 'sb.unknown': 'Unknown',
    'status.up': 'Online', 'status.down': 'Down', 'status.unknown': 'Unknown',

    'stat.total': 'Total hosts', 'stat.up': 'Online', 'stat.down': 'Down', 'stat.nodata': 'No data',
    'dash.incidents': 'INCIDENTS – LAST 24h',
    'dash.noIncidents': 'No incidents in the last 24h',
    'dash.empty': 'No hosts yet. Go to <b>{hosts}</b> to add one.',
    'group.none': 'No group',
    'card.down': 'Down',

    'hosts.search': 'Search by name, IP or tag…',
    'hosts.add': 'Add Host',
    'hosts.refresh': 'Refresh',
    'hosts.empty': 'No hosts yet. Add one with the button above.',
    'th.name': 'Name', 'th.address': 'Address', 'th.port': 'Port', 'th.interval': 'Interval',
    'th.status': 'Status', 'th.rtt': 'RTT', 'th.tags': 'Tags', 'th.actions': 'Actions',
    'sort.hint': 'Click to sort',
    'act.check': 'Check now', 'act.history': 'History', 'act.edit': 'Edit', 'act.delete': 'Delete',

    'map.zoomIn': '＋ Zoom', 'map.zoomOut': '－ Zoom', 'map.fit': '⊡ Fit',
    'map.link': 'Link hosts', 'map.refresh': '↺ Refresh',
    'map.hint': 'Click: drag  |  Double-click: details  |  Wheel: zoom  |  Right-click: remove link',
    'map.hintLink': 'Click a source host, then the destination. ESC to cancel.',
    'map.hintDraw': 'Drag on the map to draw. ESC to cancel.',
    'map.hintText': 'Click where you want the text. ESC to cancel.',
    'shape.rect': 'Box', 'shape.diamond': 'Diamond', 'shape.line': 'Line', 'shape.text': 'Text',
    'shape.color': 'Color', 'shape.width': 'Width', 'shape.font': 'Font', 'shape.size': 'Size',
    'shape.delete': 'Delete', 'shape.defaultText': 'Text',

    'set.smtpTitle': 'SMTP server (alert delivery)',
    'set.smtpHost': 'SMTP server', 'set.port': 'Port', 'set.user': 'User',
    'set.pass': 'Password / App Password', 'set.from': 'From (sender)', 'set.tls': 'Use STARTTLS',
    'set.alerts': 'Alerts',
    'set.globalEmail': 'Global alert email (receives all notifications)',
    'set.delay': 'Delay before sending a down alert (minutes)',
    'set.save': 'Save settings', 'set.test': 'Send test email',
    'set.helpTitle': 'Help – Gmail App Password',
    'set.help1': 'Turn on 2-step verification in your Google account.',
    'set.help2': 'Go to <b>Security → App passwords</b>.',
    'set.help3': 'Generate a password for "Mail" and paste it into the password field.',
    'set.help4': 'Use <code>smtp.gmail.com</code> / port <code>587</code> with STARTTLS.',

    'modal.newHost': 'New Host', 'modal.editHost': 'Edit Host',
    'f.name': 'Name *', 'f.address': 'IP address / Hostname *', 'f.desc': 'Description',
    'f.port': 'Port (0 = ICMP Ping)', 'f.interval': 'Check interval (sec)',
    'f.timeout': 'Timeout (sec)', 'f.icon': 'Icon', 'f.tags': 'Tags (comma-separated)',
    'f.group': 'Group (dashboard)', 'f.alertEmail': 'Alert email for this host (optional)',
    'f.enabled': 'Monitoring enabled', 'f.alertDown': 'Alert when down', 'f.alertUp': 'Alert on recovery',
    'ph.name': 'Web Server', 'ph.address': '192.168.1.1 or server.local', 'ph.desc': 'Optional description',
    'ph.tags': 'network, production, dmz', 'ph.group': 'Servers, Network, DNS…',
    'ph.alertEmail': 'manager@company.com',
    'icon.computer': 'Computer / Generic', 'icon.server': 'Server', 'icon.router': 'Router',
    'icon.switch': 'Switch', 'icon.firewall': 'Firewall', 'icon.ap': 'Access Point (AP)',
    'icon.printer': 'Printer', 'icon.badge': 'Badge reader', 'icon.kiosk': 'Kiosk',
    'btn.cancel': 'Cancel', 'btn.save': 'Save', 'btn.close': 'Close',

    'det.address': 'Address', 'det.status': 'Status', 'det.check': 'Check type',
    'det.checkPort': 'Port {p}', 'det.checkIcmp': 'ICMP Ping', 'det.interval': 'Interval',
    'det.lastRtt': 'Last RTT', 'det.lastCheck': 'Last check',
    'det.history': 'RECENT HISTORY', 'det.noLogs': 'No records yet.',

    'msg.ok': 'OK', 'msg.unreachable': 'Host unreachable', 'msg.timeout': 'Timeout',
    'msg.portOpen': 'Port {p} open', 'msg.portTimeout': 'Port {p} timeout',
    'msg.portRefused': 'Port {p} refused',

    'toast.checking': 'Checking host…',
    'toast.hostDeleted': 'Host deleted', 'toast.hostUpdated': 'Host updated', 'toast.hostAdded': 'Host added',
    'toast.required': 'Name and address are required',
    'toast.saved': 'Settings saved',
    'toast.needEmail': 'Enter a recipient in the "Global email" field',
    'toast.sendingTest': 'Sending test email…',
    'toast.testOk': 'Test email sent successfully',
    'toast.error': 'Error: {e}', 'toast.unknownError': 'unknown',
    'toast.moved': 'Moved to "{g}"',
    'toast.linkCreated': 'Link created', 'toast.linkExists': 'The link already exists', 'toast.linkDeleted': 'Link deleted',
    'confirm.deleteHost': 'Delete host "{name}"?',
    'confirm.deleteLink': 'Delete link of "{name}"?',
  },
};

const LANG_KEY = 'nm_lang';
const LOCALES  = { es: 'es-ES', en: 'en-GB' };
let LANG = 'es';
try { const saved = localStorage.getItem(LANG_KEY); if (saved in I18N) LANG = saved; } catch {}

function t(key, params) {
  let s = I18N[LANG][key] ?? I18N.es[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(v);
  return s;
}

function applyI18n() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('.lang-switch button').forEach(b => {
    const on = b.dataset.lang === LANG;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function setLang(lang) {
  if (!(lang in I18N) || lang === LANG) return;
  LANG = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
  applyI18n();
  if (typeof afterLangChange === 'function') afterLangChange();
}

document.querySelectorAll('.lang-switch button').forEach(b =>
  b.addEventListener('click', () => setLang(b.dataset.lang)));
applyI18n();
