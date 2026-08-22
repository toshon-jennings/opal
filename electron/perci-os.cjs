// Perci OS integration — Phase 2.
//
// Everything here is inert unless isPerciOSShell() is true, which only
// happens on Linux with the /etc/perci-os-release marker present (written
// by perci-os's scripts/install-session.sh). A normal macOS/Windows
// install, and even a plain Linux desktop install of Perci that isn't
// running as the OS shell, never touches any of this — callers in
// main.cjs are expected to check isPerciOSShell() before wiring up the
// IPC handlers that use it, not just before answering them.
//
// D-Bus system-service integration (NetworkManager for now) rather than
// reimplementing WiFi scanning — the same relationship GNOME/KDE's own
// settings apps have to these daemons. See perci-os/README.md.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');

const PERCI_OS_MARKER_PATH = '/etc/perci-os-release';
const NM_SERVICE = 'org.freedesktop.NetworkManager';
const NM_OBJECT_PATH = '/org/freedesktop/NetworkManager';
const NM_IFACE = 'org.freedesktop.NetworkManager';
const NM_DEVICE_IFACE = 'org.freedesktop.NetworkManager.Device';
const NM_WIRELESS_IFACE = 'org.freedesktop.NetworkManager.Device.Wireless';
const NM_AP_IFACE = 'org.freedesktop.NetworkManager.AccessPoint';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';
const NM_DEVICE_TYPE_WIFI = 2;

const LOGIND_SERVICE = 'org.freedesktop.login1';
const LOGIND_OBJECT_PATH = '/org/freedesktop/login1';
const LOGIND_MANAGER_IFACE = 'org.freedesktop.login1.Manager';
const UPOWER_SERVICE = 'org.freedesktop.UPower';
const UPOWER_DISPLAY_DEVICE_PATH = '/org/freedesktop/UPower/devices/DisplayDevice';
const UPOWER_DEVICE_IFACE = 'org.freedesktop.UPower.Device';
const UPOWER_STATE_LABELS = {
  0: 'unknown', 1: 'charging', 2: 'discharging', 3: 'empty',
  4: 'full', 5: 'pending-charge', 6: 'pending-discharge',
};

const BACKLIGHT_ROOT = '/sys/class/backlight';

const DESKTOP_ENTRY_DIRS = [
  '/usr/share/applications',
  '/usr/local/share/applications',
  path.join(os.homedir(), '.local/share/applications'),
];

function isPerciOSShell() {
  if (process.platform !== 'linux') return false;
  try {
    return fs.existsSync(PERCI_OS_MARKER_PATH);
  } catch {
    return false;
  }
}

// dbus-next is only required lazily, inside functions gated by
// isPerciOSShell(), so it's never loaded on macOS/Windows even though
// it's a pure-JS package present in node_modules for every platform.
let _dbus = null;
function getDbus() {
  if (!_dbus) _dbus = require('dbus-next');
  return _dbus;
}

let _systemBus = null;
function getSystemBus() {
  if (!_systemBus) _systemBus = getDbus().systemBus();
  return _systemBus;
}

async function getProxyObject(service, objectPath) {
  const bus = getSystemBus();
  return bus.getProxyObject(service, objectPath);
}

async function getProperty(service, objectPath, iface, propName) {
  const obj = await getProxyObject(service, objectPath);
  const props = obj.getInterface(PROPS_IFACE);
  const variant = await props.Get(iface, propName);
  return variant.value;
}

// SSID comes off the bus as a raw byte array (D-Bus type "ay"), not a
// string — NetworkManager doesn't assume UTF-8 on the wire.
function decodeSsid(bytes) {
  try {
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return '';
  }
}

async function findWirelessDevicePath() {
  const nm = await getProxyObject(NM_SERVICE, NM_OBJECT_PATH);
  const iface = nm.getInterface(NM_IFACE);
  const devicePaths = await iface.GetDevices();
  for (const devicePath of devicePaths) {
    const deviceType = await getProperty(NM_SERVICE, devicePath, NM_DEVICE_IFACE, 'DeviceType');
    if (Number(deviceType) === NM_DEVICE_TYPE_WIFI) return devicePath;
  }
  return null;
}

async function listWifiNetworks() {
  const devicePath = await findWirelessDevicePath();
  if (!devicePath) return { supported: false, networks: [] };

  const device = await getProxyObject(NM_SERVICE, devicePath);
  const wireless = device.getInterface(NM_WIRELESS_IFACE);

  // Best-effort — a scan in progress or rate-limited by NM shouldn't
  // block showing already-known access points.
  try {
    await wireless.RequestScan({});
  } catch {
    // ignore
  }

  const apPaths = await wireless.GetAllAccessPoints();
  const activeApPath = await getProperty(NM_SERVICE, devicePath, NM_WIRELESS_IFACE, 'ActiveAccessPoint');

  const seen = new Map(); // ssid -> best entry, collapsing duplicate APs for the same network
  for (const apPath of apPaths) {
    const [ssidBytes, strength, wpaFlags, rsnFlags] = await Promise.all([
      getProperty(NM_SERVICE, apPath, NM_AP_IFACE, 'Ssid'),
      getProperty(NM_SERVICE, apPath, NM_AP_IFACE, 'Strength'),
      getProperty(NM_SERVICE, apPath, NM_AP_IFACE, 'WpaFlags'),
      getProperty(NM_SERVICE, apPath, NM_AP_IFACE, 'RsnFlags'),
    ]);
    const ssid = decodeSsid(ssidBytes);
    if (!ssid) continue; // hidden network, nothing to show/select

    const secured = Number(wpaFlags) !== 0 || Number(rsnFlags) !== 0;
    const isActive = apPath === activeApPath;
    const existing = seen.get(ssid);
    if (!existing || Number(strength) > existing.strength || isActive) {
      seen.set(ssid, { ssid, strength: Number(strength), secured, active: isActive, apPath });
    }
  }

  return {
    supported: true,
    networks: [...seen.values()].sort((a, b) => b.strength - a.strength),
  };
}

async function getWifiStatus() {
  const devicePath = await findWirelessDevicePath();
  if (!devicePath) return { supported: false, connected: false, ssid: null };

  const activeApPath = await getProperty(NM_SERVICE, devicePath, NM_WIRELESS_IFACE, 'ActiveAccessPoint');
  if (!activeApPath || activeApPath === '/') {
    return { supported: true, connected: false, ssid: null };
  }
  const ssidBytes = await getProperty(NM_SERVICE, activeApPath, NM_AP_IFACE, 'Ssid');
  return { supported: true, connected: true, ssid: decodeSsid(ssidBytes) };
}

// Connects (or reconnects) to an SSID. For a secured network this creates
// a new NetworkManager connection profile via AddAndActivateConnection;
// NOT YET VERIFIED against a real access point — the read path (list/
// status above) was, this one wasn't reached before Phase 2 was paused
// for review. Treat as a first draft.
async function connectToWifi(ssid, password) {
  const devicePath = await findWirelessDevicePath();
  if (!devicePath) throw new Error('No WiFi device found');

  const dbus = getDbus();
  const nm = await getProxyObject(NM_SERVICE, NM_OBJECT_PATH);
  const iface = nm.getInterface(NM_IFACE);

  const connection = {
    connection: {
      id: new dbus.Variant('s', ssid),
      type: new dbus.Variant('s', '802-11-wireless'),
    },
    '802-11-wireless': {
      ssid: new dbus.Variant('ay', Buffer.from(ssid, 'utf8')),
      mode: new dbus.Variant('s', 'infrastructure'),
    },
  };

  if (password) {
    connection['802-11-wireless-security'] = {
      'key-mgmt': new dbus.Variant('s', 'wpa-psk'),
      psk: new dbus.Variant('s', password),
    };
  }

  await iface.AddAndActivateConnection(connection, devicePath, '/');
}

// ── Power (systemd-logind + UPower, both D-Bus) ──────────────────────────
//
// UPower's DisplayDevice aggregates whatever battery is present into one
// object — on a desktop/VM with no battery at all, IsPresent is false,
// which is the normal case, not an error. logind's suspend/power-off/
// reboot all take an "interactive" bool controlling whether polkit shows
// its own auth dialog; passed false since Perci OS has no separate
// desktop session for such a dialog to appear in.

async function getBatteryStatus() {
  try {
    const [percentage, state, isPresent] = await Promise.all([
      getProperty(UPOWER_SERVICE, UPOWER_DISPLAY_DEVICE_PATH, UPOWER_DEVICE_IFACE, 'Percentage'),
      getProperty(UPOWER_SERVICE, UPOWER_DISPLAY_DEVICE_PATH, UPOWER_DEVICE_IFACE, 'State'),
      getProperty(UPOWER_SERVICE, UPOWER_DISPLAY_DEVICE_PATH, UPOWER_DEVICE_IFACE, 'IsPresent'),
    ]);
    if (!isPresent) return { supported: false, present: false };
    return {
      supported: true,
      present: true,
      percentage: Math.round(Number(percentage)),
      state: UPOWER_STATE_LABELS[Number(state)] || 'unknown',
    };
  } catch {
    return { supported: false, present: false }; // UPower not running, or no battery at all
  }
}

async function getPowerActions() {
  try {
    const login1 = await getProxyObject(LOGIND_SERVICE, LOGIND_OBJECT_PATH);
    const manager = login1.getInterface(LOGIND_MANAGER_IFACE);
    const [canSuspend, canPowerOff, canReboot] = await Promise.all([
      manager.CanSuspend(),
      manager.CanPowerOff(),
      manager.CanReboot(),
    ]);
    return {
      supported: true,
      canSuspend: canSuspend === 'yes',
      canPowerOff: canPowerOff === 'yes',
      canReboot: canReboot === 'yes',
    };
  } catch {
    return { supported: false, canSuspend: false, canPowerOff: false, canReboot: false };
  }
}

async function suspend() {
  const login1 = await getProxyObject(LOGIND_SERVICE, LOGIND_OBJECT_PATH);
  await login1.getInterface(LOGIND_MANAGER_IFACE).Suspend(false);
}

async function powerOff() {
  const login1 = await getProxyObject(LOGIND_SERVICE, LOGIND_OBJECT_PATH);
  await login1.getInterface(LOGIND_MANAGER_IFACE).PowerOff(false);
}

async function reboot() {
  const login1 = await getProxyObject(LOGIND_SERVICE, LOGIND_OBJECT_PATH);
  await login1.getInterface(LOGIND_MANAGER_IFACE).Reboot(false);
}

// ── Display brightness (kernel backlight sysfs — no daemon involved) ────
//
// Not D-Bus, deliberately: there's no daemon here to talk to. The kernel
// exposes brightness directly as a sysfs file; brightnessctl and every
// desktop environment's own brightness slider is just a thin wrapper
// over the same two files. Writing requires membership in the `video`
// group, granted via udev on real hardware — see
// perci-os/scripts/install-session.sh. UNVERIFIED beyond "reads/writes
// don't throw" — no VM has a real backlight device to test against.

function findBacklightDevice() {
  try {
    const devices = fs.readdirSync(BACKLIGHT_ROOT);
    return devices.length > 0 ? devices[0] : null;
  } catch {
    return null;
  }
}

function getBrightness() {
  const device = findBacklightDevice();
  if (!device) return { supported: false, percentage: null };
  try {
    const base = path.join(BACKLIGHT_ROOT, device);
    const current = parseInt(fs.readFileSync(path.join(base, 'brightness'), 'utf8').trim(), 10);
    const max = parseInt(fs.readFileSync(path.join(base, 'max_brightness'), 'utf8').trim(), 10);
    if (!max) return { supported: false, percentage: null };
    return { supported: true, percentage: Math.round((current / max) * 100) };
  } catch {
    return { supported: false, percentage: null };
  }
}

function setBrightness(percent) {
  const device = findBacklightDevice();
  if (!device) throw new Error('No backlight device found');
  const base = path.join(BACKLIGHT_ROOT, device);
  const max = parseInt(fs.readFileSync(path.join(base, 'max_brightness'), 'utf8').trim(), 10);
  const clamped = Math.max(0, Math.min(100, Number(percent)));
  const value = Math.round((clamped / 100) * max);
  fs.writeFileSync(path.join(base, 'brightness'), String(value));
}

// ── Volume (PipeWire via wpctl — deliberate exception to D-Bus-first) ───
//
// PipeWire, Debian trixie's default audio server, has no default D-Bus
// control surface — unlike NetworkManager/logind/UPower there's no
// equivalent of "org.freedesktop.PipeWire" on the bus without extra,
// non-default module configuration. wpctl (WirePlumber's CLI, ships with
// the default `wireplumber` session-manager package) is the practical
// way in. UNVERIFIED — no VM in this session had audio hardware to test
// against; `wpctl`'s presence and output format are per its own docs.

function execFileAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 3000 }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout);
    });
  });
}

async function getVolume() {
  try {
    const out = await execFileAsync('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@']);
    const match = out.match(/Volume:\s*([\d.]+)/);
    if (!match) return { supported: false, percentage: null, muted: false };
    return { supported: true, percentage: Math.round(parseFloat(match[1]) * 100), muted: out.includes('[MUTED]') };
  } catch {
    return { supported: false, percentage: null, muted: false };
  }
}

async function setVolume(percent) {
  const clamped = Math.max(0, Math.min(100, Number(percent)));
  await execFileAsync('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', String(clamped / 100)]);
}

async function toggleMute() {
  await execFileAsync('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', 'toggle']);
}

// ── Real-app launcher (freedesktop .desktop entries) ─────────────────────
//
// Lists and launches actual installed Linux apps — the whole point of
// Tier 2 (see perci-os/README.md): apt-installed apps like LibreOffice
// show up here, Perci doesn't reimplement anything. Standard XDG
// precedence order (first dir wins on id collision). UNVERIFIED beyond
// parsing real .desktop files copied out of a VM — never launched a real
// app through this path yet.

function stripExecFieldCodes(exec) {
  // Perci launches with no arguments, so field codes (%f/%F/%u/%U/%i/%c/%k)
  // are dropped rather than substituted — see the Desktop Entry Specification.
  return exec.replace(/%[fFuUick%]/g, '').replace(/\s+/g, ' ').trim();
}

function parseDesktopFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  let inEntry = false;
  const entry = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '[Desktop Entry]') { inEntry = true; continue; }
    if (trimmed.startsWith('[')) { inEntry = false; continue; }
    if (!inEntry) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!(key in entry)) entry[key] = line.slice(eq + 1).trim(); // first (locale-less) wins
  }
  if (entry.Type !== 'Application') return null;
  if (entry.NoDisplay === 'true' || entry.Hidden === 'true') return null;
  if (!entry.Name || !entry.Exec) return null;
  return { id: path.basename(filePath, '.desktop'), name: entry.Name, exec: stripExecFieldCodes(entry.Exec) };
}

function listInstalledApps() {
  const seen = new Map();
  for (const dir of DESKTOP_ENTRY_DIRS) {
    let files;
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.desktop'));
    } catch {
      continue;
    }
    for (const file of files) {
      const entry = parseDesktopFile(path.join(dir, file));
      if (entry && !seen.has(entry.id)) seen.set(entry.id, entry);
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Perci itself runs Wayland-native under labwc and doesn't need DISPLAY,
// so it's commonly unset in Perci's own process environment — but plenty
// of real apps are still X11-only. Confirmed during test-boot: spawning
// xterm without DISPLAY set succeeds (the process starts) but it exits
// immediately with "Can't open display" — a silent failure from the
// caller's point of view, since the spawn itself reports success. Rather
// than rely on inheriting a DISPLAY that may not be there, discover the
// live Xwayland socket and set it explicitly.
function discoverX11Display() {
  try {
    const socket = fs.readdirSync('/tmp/.X11-unix').find((f) => /^X\d+$/.test(f));
    return socket ? `:${socket.slice(1)}` : null;
  } catch {
    return null;
  }
}

function launchApp(appId) {
  const app = listInstalledApps().find((a) => a.id === appId);
  if (!app) throw new Error(`Unknown app: ${appId}`);
  const env = { ...process.env };
  if (!env.DISPLAY) {
    const display = discoverX11Display();
    if (display) env.DISPLAY = display;
  }
  // Detached + ignored stdio so the launched app isn't tied to Perci's
  // lifecycle — closing Perci shouldn't kill apps the user opened from it.
  const child = spawn('/bin/sh', ['-c', app.exec], { detached: true, stdio: 'ignore', env });
  child.unref();
}

module.exports = {
  isPerciOSShell,
  listWifiNetworks,
  getWifiStatus,
  connectToWifi,
  getBatteryStatus,
  getPowerActions,
  suspend,
  powerOff,
  reboot,
  getBrightness,
  setBrightness,
  getVolume,
  setVolume,
  toggleMute,
  listInstalledApps,
  launchApp,
};
