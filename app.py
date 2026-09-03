from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import threading
import time
import subprocess
import socket
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import platform
import os

app = Flask(__name__)
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(basedir, "network_monitor.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# ─────────────────────────── MODELS ───────────────────────────

class Host(db.Model):
    id              = db.Column(db.Integer, primary_key=True)
    name            = db.Column(db.String(100), nullable=False)
    address         = db.Column(db.String(255), nullable=False)
    description     = db.Column(db.Text, default='')
    tags            = db.Column(db.String(255), default='')
    check_port      = db.Column(db.Integer, default=0)      # 0 = ICMP ping
    check_interval  = db.Column(db.Integer, default=60)     # seconds
    timeout         = db.Column(db.Integer, default=5)      # seconds
    enabled         = db.Column(db.Boolean, default=True)
    map_x           = db.Column(db.Float, default=150.0)
    map_y           = db.Column(db.Float, default=150.0)
    icon_type       = db.Column(db.String(50), default='computer')
    group_name      = db.Column(db.String(100), default='')  # dashboard group
    current_status  = db.Column(db.String(20), default='unknown')
    last_check      = db.Column(db.DateTime)
    last_rtt        = db.Column(db.Float)                   # ms
    down_since      = db.Column(db.DateTime, nullable=True) # set when host goes down
    alert_on_down   = db.Column(db.Boolean, default=True)
    alert_on_up     = db.Column(db.Boolean, default=True)
    alert_email     = db.Column(db.String(255), default='')
    logs            = db.relationship('StatusLog', backref='host', lazy=True,
                                      cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'address': self.address,
            'description': self.description, 'tags': self.tags,
            'check_port': self.check_port, 'check_interval': self.check_interval,
            'timeout': self.timeout, 'enabled': self.enabled,
            'map_x': self.map_x, 'map_y': self.map_y, 'icon_type': self.icon_type,
            'current_status': self.current_status,
            'group_name': self.group_name or '',
            'last_check': self.last_check.isoformat() if self.last_check else None,
            'last_rtt': self.last_rtt,
            'down_since': self.down_since.isoformat() if self.down_since else None,
            'alert_on_down': self.alert_on_down, 'alert_on_up': self.alert_on_up,
            'alert_email': self.alert_email,
        }


class StatusLog(db.Model):
    id          = db.Column(db.Integer, primary_key=True)
    host_id     = db.Column(db.Integer, db.ForeignKey('host.id'), nullable=False)
    status      = db.Column(db.String(20), nullable=False)
    rtt         = db.Column(db.Float)
    message     = db.Column(db.String(255), default='')
    checked_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'host_id': self.host_id, 'status': self.status,
            'rtt': self.rtt, 'message': self.message,
            'checked_at': self.checked_at.isoformat(),
        }


class MapLink(db.Model):
    id      = db.Column(db.Integer, primary_key=True)
    src_id  = db.Column(db.Integer, db.ForeignKey('host.id'), nullable=False)
    dst_id  = db.Column(db.Integer, db.ForeignKey('host.id'), nullable=False)
    label   = db.Column(db.String(100), default='')


class Setting(db.Model):
    key   = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.Text, default='')

    @staticmethod
    def get(key, default=''):
        s = Setting.query.get(key)
        return s.value if s else default

    @staticmethod
    def put(key, value):
        s = Setting.query.get(key)
        if s:
            s.value = str(value)
        else:
            db.session.add(Setting(key=key, value=str(value)))
        db.session.commit()


# ─────────────────────────── MONITORING ENGINE ───────────────────────────

def ping_host(address, timeout):
    """Returns (success, rtt_ms, message)."""
    try:
        if platform.system() == 'Windows':
            cmd = ['ping', '-n', '1', '-w', str(timeout * 1000), address]
        else:
            cmd = ['ping', '-c', '1', '-W', str(timeout), address]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 2)
        if result.returncode == 0:
            out = result.stdout
            # Extract RTT
            rtt = None
            for token in ['tiempo=', 'time=', 'tiempo<']:
                if token in out.lower():
                    part = out.lower().split(token)[-1].split()[0]
                    part = part.replace('ms', '').replace('<', '').strip()
                    try:
                        rtt = float(part)
                    except ValueError:
                        rtt = 1.0
                    break
            return True, rtt or 1.0, 'OK'
        return False, None, 'Host unreachable'
    except subprocess.TimeoutExpired:
        return False, None, 'Timeout'
    except Exception as e:
        return False, None, str(e)


def check_port(address, port, timeout):
    """Returns (success, rtt_ms, message)."""
    try:
        start = time.monotonic()
        sock = socket.create_connection((address, port), timeout=timeout)
        rtt = (time.monotonic() - start) * 1000
        sock.close()
        return True, round(rtt, 2), f'Port {port} open'
    except socket.timeout:
        return False, None, f'Port {port} timeout'
    except ConnectionRefusedError:
        return False, None, f'Port {port} refused'
    except Exception as e:
        return False, None, str(e)


def send_alert(host, new_status, message):
    """Send email alert for status change."""
    recipients = []
    if host.alert_email:
        recipients += [e.strip() for e in host.alert_email.split(',') if e.strip()]

    global_email = Setting.get('alert_global_email', '')
    if global_email:
        recipients += [e.strip() for e in global_email.split(',') if e.strip()]

    if not recipients:
        return

    smtp_host   = Setting.get('smtp_host', '')
    smtp_port   = int(Setting.get('smtp_port', '587') or 587)
    smtp_user   = Setting.get('smtp_user', '')
    smtp_pass   = Setting.get('smtp_pass', '')
    smtp_from   = Setting.get('smtp_from', smtp_user)
    smtp_tls    = Setting.get('smtp_tls', 'true').lower() == 'true'

    if not smtp_host:
        return

    icon = '🔴' if new_status == 'down' else '🟢'
    subject = f'{icon} [{new_status.upper()}] {host.name} ({host.address})'
    body = (
        f'<h2 style="color:{"#e74c3c" if new_status=="down" else "#27ae60"}">'
        f'{icon} Host {new_status.upper()}</h2>'
        f'<table style="font-family:monospace;border-collapse:collapse">'
        f'<tr><td><b>Host:</b></td><td>{host.name}</td></tr>'
        f'<tr><td><b>Dirección:</b></td><td>{host.address}</td></tr>'
        f'<tr><td><b>Estado:</b></td><td>{new_status.upper()}</td></tr>'
        f'<tr><td><b>Mensaje:</b></td><td>{message}</td></tr>'
        f'<tr><td><b>Fecha:</b></td><td>{datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</td></tr>'
        f'</table>'
    )

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From']    = smtp_from
        msg['To']      = ', '.join(recipients)
        msg.attach(MIMEText(body, 'html'))

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            if smtp_tls:
                server.starttls()
            if smtp_user and smtp_pass:
                server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, recipients, msg.as_string())
    except Exception as e:
        print(f'[ALERT] Error sending email: {e}')


def do_check(host_id):
    """Perform one check cycle for a host (called from background thread)."""
    with app.app_context():
        host = Host.query.get(host_id)
        if not host or not host.enabled:
            return

        if host.check_port and host.check_port > 0:
            ok, rtt, msg = check_port(host.address, host.check_port, host.timeout)
        else:
            ok, rtt, msg = ping_host(host.address, host.timeout)

        new_status = 'up' if ok else 'down'
        prev_status = host.current_status

        host.current_status = new_status
        host.last_check = datetime.utcnow()
        host.last_rtt = rtt

        if new_status == 'down' and prev_status != 'down':
            host.down_since = datetime.utcnow()
        elif new_status == 'up':
            host.down_since = None

        log = StatusLog(host_id=host.id, status=new_status, rtt=rtt, message=msg)
        db.session.add(log)
        db.session.commit()

        # Send alert on status change
        if prev_status != new_status:
            if new_status == 'down' and host.alert_on_down:
                send_alert(host, 'down', msg)
            elif new_status == 'up' and host.alert_on_up and prev_status != 'unknown':
                send_alert(host, 'up', msg)


class MonitorEngine(threading.Thread):
    """Background thread that runs checks for each host at its configured interval."""

    def __init__(self):
        super().__init__(daemon=True, name='MonitorEngine')
        self._next = {}   # host_id -> next check timestamp

    def run(self):
        print('[Monitor] Engine started')
        while True:
            with app.app_context():
                hosts = Host.query.filter_by(enabled=True).all()
                now = time.monotonic()
                for h in hosts:
                    due = self._next.get(h.id, 0)
                    if now >= due:
                        self._next[h.id] = now + h.check_interval
                        t = threading.Thread(target=do_check, args=(h.id,), daemon=True)
                        t.start()
            time.sleep(5)


# ─────────────────────────── API ROUTES ───────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# Hosts
@app.route('/api/hosts', methods=['GET'])
def get_hosts():
    hosts = Host.query.order_by(Host.name).all()
    return jsonify([h.to_dict() for h in hosts])


@app.route('/api/hosts', methods=['POST'])
def add_host():
    d = request.json
    host = Host(
        name=d['name'], address=d['address'],
        description=d.get('description', ''), tags=d.get('tags', ''),
        group_name=d.get('group_name', ''),
        check_port=int(d.get('check_port', 0)),
        check_interval=int(d.get('check_interval', 60)),
        timeout=int(d.get('timeout', 5)),
        enabled=d.get('enabled', True),
        map_x=float(d.get('map_x', 150)), map_y=float(d.get('map_y', 150)),
        icon_type=d.get('icon_type', 'computer'),
        alert_on_down=d.get('alert_on_down', True),
        alert_on_up=d.get('alert_on_up', True),
        alert_email=d.get('alert_email', ''),
    )
    db.session.add(host)
    db.session.commit()
    return jsonify(host.to_dict()), 201


@app.route('/api/hosts/<int:host_id>', methods=['GET'])
def get_host(host_id):
    host = Host.query.get_or_404(host_id)
    return jsonify(host.to_dict())


@app.route('/api/hosts/<int:host_id>', methods=['PUT'])
def update_host(host_id):
    host = Host.query.get_or_404(host_id)
    d = request.json
    for field in ['name', 'address', 'description', 'tags', 'icon_type', 'alert_email', 'group_name']:
        if field in d:
            setattr(host, field, d[field])
    for field in ['check_port', 'check_interval', 'timeout']:
        if field in d:
            setattr(host, field, int(d[field]))
    for field in ['map_x', 'map_y']:
        if field in d:
            setattr(host, field, float(d[field]))
    for field in ['enabled', 'alert_on_down', 'alert_on_up']:
        if field in d:
            setattr(host, field, bool(d[field]))
    db.session.commit()
    return jsonify(host.to_dict())


@app.route('/api/hosts/<int:host_id>', methods=['DELETE'])
def delete_host(host_id):
    host = Host.query.get_or_404(host_id)
    MapLink.query.filter(
        (MapLink.src_id == host_id) | (MapLink.dst_id == host_id)
    ).delete()
    db.session.delete(host)
    db.session.commit()
    return '', 204


@app.route('/api/hosts/<int:host_id>/check', methods=['POST'])
def manual_check(host_id):
    t = threading.Thread(target=do_check, args=(host_id,), daemon=True)
    t.start()
    t.join(timeout=15)
    host = Host.query.get_or_404(host_id)
    return jsonify(host.to_dict())


@app.route('/api/hosts/<int:host_id>/logs', methods=['GET'])
def get_logs(host_id):
    limit = int(request.args.get('limit', 50))
    logs = (StatusLog.query
            .filter_by(host_id=host_id)
            .order_by(StatusLog.checked_at.desc())
            .limit(limit).all())
    return jsonify([l.to_dict() for l in logs])


# Map links
@app.route('/api/links', methods=['GET'])
def get_links():
    links = MapLink.query.all()
    return jsonify([{'id': l.id, 'src': l.src_id, 'dst': l.dst_id, 'label': l.label}
                    for l in links])


@app.route('/api/links', methods=['POST'])
def add_link():
    d = request.json
    # Prevent duplicates
    existing = MapLink.query.filter(
        ((MapLink.src_id == d['src']) & (MapLink.dst_id == d['dst'])) |
        ((MapLink.src_id == d['dst']) & (MapLink.dst_id == d['src']))
    ).first()
    if existing:
        return jsonify({'error': 'Link already exists'}), 409
    link = MapLink(src_id=d['src'], dst_id=d['dst'], label=d.get('label', ''))
    db.session.add(link)
    db.session.commit()
    return jsonify({'id': link.id, 'src': link.src_id, 'dst': link.dst_id,
                    'label': link.label}), 201


@app.route('/api/links/<int:link_id>', methods=['DELETE'])
def delete_link(link_id):
    link = MapLink.query.get_or_404(link_id)
    db.session.delete(link)
    db.session.commit()
    return '', 204


# Settings
@app.route('/api/settings', methods=['GET'])
def get_settings():
    keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass',
            'smtp_from', 'smtp_tls', 'alert_global_email']
    return jsonify({k: Setting.get(k, '') for k in keys})


@app.route('/api/settings', methods=['PUT'])
def update_settings():
    for k, v in request.json.items():
        Setting.put(k, v)
    return jsonify({'ok': True})


@app.route('/api/settings/test-email', methods=['POST'])
def test_email():
    d = request.json
    to = d.get('to', '')
    if not to:
        return jsonify({'error': 'No recipient'}), 400
    try:
        smtp_host = d.get('smtp_host') or Setting.get('smtp_host')
        smtp_port = int(d.get('smtp_port') or Setting.get('smtp_port', '587') or 587)
        smtp_user = d.get('smtp_user') or Setting.get('smtp_user')
        smtp_pass = d.get('smtp_pass') or Setting.get('smtp_pass')
        smtp_from = d.get('smtp_from') or Setting.get('smtp_from') or smtp_user
        smtp_tls  = str(d.get('smtp_tls', Setting.get('smtp_tls', 'true'))).lower() == 'true'

        msg = MIMEMultipart('alternative')
        msg['Subject'] = '✅ Test de alerta – Network Monitor'
        msg['From']    = smtp_from
        msg['To']      = to
        msg.attach(MIMEText(
            '<h2>Prueba de alerta correcta</h2>'
            '<p>El sistema de alertas por correo está configurado y funciona.</p>',
            'html'
        ))
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            if smtp_tls:
                server.starttls()
            if smtp_user and smtp_pass:
                server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, [to], msg.as_string())
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/groups', methods=['GET'])
def get_groups():
    rows = db.session.query(Host.group_name).distinct().all()
    names = sorted({r[0] or '' for r in rows})
    return jsonify(names)


# Stats for dashboard
@app.route('/api/stats', methods=['GET'])
def get_stats():
    total   = Host.query.count()
    up      = Host.query.filter_by(current_status='up').count()
    down    = Host.query.filter_by(current_status='down').count()
    unknown = total - up - down

    # Recent alerts (status changes in last 24h)
    since = datetime.utcnow() - timedelta(hours=24)
    recent_down = (StatusLog.query
                   .filter(StatusLog.status == 'down', StatusLog.checked_at >= since)
                   .order_by(StatusLog.checked_at.desc())
                   .limit(10).all())
    return jsonify({
        'total': total, 'up': up, 'down': down, 'unknown': unknown,
        'recent_incidents': [l.to_dict() for l in recent_down],
    })


# ─────────────────────────── MAIN ───────────────────────────

if __name__ == '__main__':
    from sqlalchemy import text, inspect as sa_inspect
    with app.app_context():
        db.create_all()
        # Migrate: add down_since column if it doesn't exist
        insp = sa_inspect(db.engine)
        existing = [c['name'] for c in insp.get_columns('host')]
        if 'down_since' not in existing:
            with db.engine.connect() as conn:
                conn.execute(text('ALTER TABLE host ADD COLUMN down_since DATETIME'))
                conn.commit()
        if 'group_name' not in existing:
            with db.engine.connect() as conn:
                conn.execute(text("ALTER TABLE host ADD COLUMN group_name VARCHAR(100) DEFAULT ''"))
                conn.commit()
        # Default settings
        for k, v in [('smtp_port', '587'), ('smtp_tls', 'true')]:
            if not Setting.query.get(k):
                db.session.add(Setting(key=k, value=v))
        db.session.commit()

    MonitorEngine().start()
    print('[Network Monitor] http://localhost:5000')
    app.run(debug=False, host='0.0.0.0', port=5000, use_reloader=False)
