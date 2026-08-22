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

const PERCI_OS_MARKER_PATH = '/etc/perci-os-release';
const NM_SERVICE = 'org.freedesktop.NetworkManager';
const NM_OBJECT_PATH = '/org/freedesktop/NetworkManager';
const NM_IFACE = 'org.freedesktop.NetworkManager';
const NM_DEVICE_IFACE = 'org.freedesktop.NetworkManager.Device';
const NM_WIRELESS_IFACE = 'org.freedesktop.NetworkManager.Device.Wireless';
const NM_AP_IFACE = 'org.freedesktop.NetworkManager.AccessPoint';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';
const NM_DEVICE_TYPE_WIFI = 2;

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

module.exports = {
  isPerciOSShell,
  listWifiNetworks,
  getWifiStatus,
  connectToWifi,
};
