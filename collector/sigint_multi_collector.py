#!/usr/bin/env python3
"""
ArmsLength SigInt - Multi-Protocol Collector
==============================================
Scans WiFi networks AND Bluetooth devices simultaneously using your
system's hardware adapters and pushes everything to ArmsLength SigInt.

Combines WiFi + Bluetooth scanning into a single collector.

Supported Platforms:
  - macOS 12+ (Monterey, Ventura, Sonoma, Sequoia)
    WiFi: CoreWLAN framework (pip3 install pyobjc-framework-CoreWLAN)
    Bluetooth: bleak (pip3 install bleak)
    Note: Location Services required for WiFi, Bluetooth permission for BT
  - Windows 10/11
    WiFi: netsh (built-in)
    Bluetooth: bleak (pip3 install bleak)
  - Linux
    WiFi: nmcli (NetworkManager)
    Bluetooth: hcitool/bluetoothctl or bleak

Requirements:
  - Python 3.8+
  - pip3 install requests bleak
  - macOS WiFi: pip3 install pyobjc-framework-CoreWLAN pyobjc-framework-CoreLocation

Usage:
  python3 sigint_multi_collector.py --key YOUR_KEY --url https://your-app.replit.app
  python3 sigint_multi_collector.py --setup    # Check dependencies first
"""

import subprocess
import re
import time
import json
import sys
import os
import platform
import argparse
import asyncio
from datetime import datetime

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library not found.")
    print("Install it with: pip3 install requests")
    sys.exit(1)

API_KEY = os.environ.get("SIGINT_API_KEY", "YOUR_API_KEY_HERE")
APP_URL = os.environ.get("SIGINT_APP_URL", "https://your-app.replit.app")
SCAN_INTERVAL = 20
LATITUDE = None
LONGITUDE = None

OUI_DB = {
    "00:50:F2": "Microsoft", "00:0C:E7": "MediaTek", "00:E0:4C": "Realtek",
    "B0:7F:B9": "Netgear", "C4:E9:84": "TP-Link", "14:EB:B6": "TP-Link",
    "04:D9:F5": "ASUS", "1C:87:2C": "ASUS", "78:8A:20": "Ubiquiti",
    "F8:1E:DF": "Amazon", "F0:F0:A4": "Amazon", "30:FD:38": "Google",
    "A4:83:E7": "Apple", "3C:22:FB": "Apple", "DC:2B:61": "Samsung",
    "50:DC:E7": "Samsung", "88:B4:A6": "Huawei", "C8:47:8C": "Xiaomi",
    "A0:C5:89": "Motorola", "04:5D:4B": "Sony", "8C:85:90": "Intel",
    "A4:34:D9": "Intel", "20:02:AF": "Broadcom", "00:1A:2B": "Cisco",
    "F0:9F:C2": "Cisco", "48:5B:39": "Realtek", "9C:B6:D0": "HP",
    "B4:A5:EF": "AT&T", "E8:ED:F3": "ARRIS", "84:EA:ED": "Roku",
    "48:A6:B8": "Sonos", "44:07:0B": "Ring", "2C:AA:8E": "Wyze",
    "DC:56:E7": "Apple", "F0:D4:15": "Apple", "D4:F5:47": "Bose",
    "04:52:C7": "Bose", "7C:D9:F4": "JBL", "88:C6:26": "Tile",
    "74:75:48": "Amazon", "F4:F5:D8": "Google", "8C:DE:52": "Beats",
    "2C:41:A1": "Bose", "28:6C:07": "Xiaomi", "00:18:09": "Garmin",
}

def is_uuid_address(addr):
    """Check if an address is a macOS-style UUID rather than a MAC address."""
    return len(addr) > 17 or "-" in addr

def lookup_manufacturer(mac):
    if is_uuid_address(mac):
        return "Unknown (macOS UUID)"
    prefix = mac[:8].upper()
    return OUI_DB.get(prefix, "Unknown")

# ============================================================
# WiFi Scanning
# ============================================================

def scan_wifi_macos_corewlan():
    """Scan WiFi networks using macOS CoreWLAN framework."""
    try:
        import objc
        import CoreWLAN
    except ImportError:
        return None

    try:
        wifi_client = CoreWLAN.CWWiFiClient.sharedWiFiClient()
        interface = wifi_client.interface()
        if not interface:
            return []

        networks, error = interface.scanForNetworksWithName_includeHidden_error_(None, True, None)
        if error:
            print(f"  [!] CoreWLAN error: {error}")
            return []

        results = []
        for network in networks:
            bssid = network.bssid()
            if not bssid:
                continue
            channel_obj = network.wlanChannel()
            channel = channel_obj.channelNumber() if channel_obj else 0
            results.append({
                "ssid": network.ssid() or "Hidden Network",
                "bssid": bssid.upper(),
                "rssi": network.rssiValue(),
                "channel": channel,
                "auth": "Unknown",
            })
        return results
    except Exception as e:
        print(f"  [!] CoreWLAN error: {e}")
        return []

def scan_wifi_macos_airport():
    """Scan WiFi using legacy airport utility."""
    try:
        airport = "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport"
        if not os.path.exists(airport):
            return None
        result = subprocess.run([airport, "-s"], capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return None
        networks = []
        for line in result.stdout.strip().splitlines()[1:]:
            m = re.match(r"\s*(.+?)\s+([0-9a-f:]{17})\s+(-?\d+)\s+(\d+)\s+\S+\s+\S+\s+(\S+)", line, re.IGNORECASE)
            if m:
                networks.append({
                    "ssid": m.group(1).strip(), "bssid": m.group(2).upper(),
                    "rssi": int(m.group(3)), "channel": int(m.group(4)),
                    "auth": m.group(5),
                })
        return networks if networks else None
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None

def scan_wifi_macos():
    """Scan WiFi on macOS using best available method."""
    networks = scan_wifi_macos_corewlan()
    if networks is not None:
        return networks
    networks = scan_wifi_macos_airport()
    if networks is not None:
        return networks
    print("  [!] No WiFi scan method available. Install: pip3 install pyobjc-framework-CoreWLAN")
    return []

def scan_wifi_windows():
    try:
        result = subprocess.run(
            ["netsh", "wlan", "show", "networks", "mode=bssid"],
            capture_output=True, text=True, timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
        )
        if result.returncode != 0:
            return []
        networks = []
        current = {}
        for line in result.stdout.splitlines():
            line = line.strip()
            if line.startswith("SSID") and "BSSID" not in line:
                m = re.match(r"SSID\s+\d+\s*:\s*(.*)", line)
                if m: current["ssid"] = m.group(1).strip()
            elif line.startswith("BSSID"):
                m = re.match(r"BSSID\s+\d+\s*:\s*(.*)", line)
                if m: current["bssid"] = m.group(1).strip().upper()
            elif line.startswith("Signal"):
                m = re.match(r"Signal\s*:\s*(\d+)%", line)
                if m:
                    pct = int(m.group(1))
                    current["rssi"] = int(pct / 2 - 100)
            elif line.startswith("Channel"):
                m = re.match(r"Channel\s*:\s*(\d+)", line)
                if m: current["channel"] = int(m.group(1))
            elif line.startswith("Authentication"):
                m = re.match(r"Authentication\s*:\s*(.*)", line)
                if m: current["auth"] = m.group(1).strip()
            elif line.startswith("Radio type"):
                m = re.match(r"Radio type\s*:\s*(.*)", line)
                if m: current["radio"] = m.group(1).strip()
            if "bssid" in current and "rssi" in current:
                networks.append(current)
                ssid = current.get("ssid", "")
                current = {"ssid": ssid}
        return networks
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []

def scan_wifi_linux():
    try:
        result = subprocess.run(
            ["nmcli", "-t", "-f", "BSSID,SSID,SIGNAL,CHAN,SECURITY,FREQ", "dev", "wifi", "list", "--rescan", "yes"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return []
        networks = []
        for line in result.stdout.strip().splitlines():
            parts = line.split(":")
            if len(parts) >= 6:
                bssid = ":".join(parts[0:6]).strip().upper()
                remaining = ":".join(parts[6:])
                fields = remaining.split(":")
                if len(fields) >= 5:
                    try: signal_pct = int(fields[1].strip())
                    except ValueError: signal_pct = 0
                    try: channel = int(fields[2].strip())
                    except ValueError: channel = 0
                    networks.append({
                        "bssid": bssid, "ssid": fields[0].strip(),
                        "rssi": int(signal_pct / 2 - 100), "channel": channel,
                        "auth": fields[3].strip(), "radio": fields[4].strip(),
                    })
        return networks
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []

def scan_wifi():
    system = platform.system()
    if system == "Windows": return scan_wifi_windows()
    elif system == "Darwin": return scan_wifi_macos()
    elif system == "Linux": return scan_wifi_linux()
    return []

def channel_to_freq(channel):
    if 1 <= channel <= 14:
        return (2407 + channel * 5) * 1000000 if channel != 14 else 2484000000
    elif 36 <= channel <= 165:
        return (5000 + channel * 5) * 1000000
    return None

def format_wifi_devices(networks):
    devices = []
    for net in networks:
        bssid = net.get("bssid", "")
        if not bssid or bssid == "00:00:00:00:00:00": continue
        ssid = net.get("ssid", "Hidden Network") or "Hidden Network"
        channel = net.get("channel", 0)
        device = {
            "macAddress": bssid, "name": ssid, "signalType": "wifi",
            "deviceType": "Wi-Fi Network", "manufacturer": lookup_manufacturer(bssid),
            "signalStrength": net.get("rssi", -80),
            "frequency": channel_to_freq(channel), "channel": channel,
            "protocol": "802.11", "encryption": net.get("auth", "Unknown"),
        }
        if LATITUDE is not None and LONGITUDE is not None:
            device["latitude"] = LATITUDE
            device["longitude"] = LONGITUDE
        devices.append(device)
    return devices

# ============================================================
# Bluetooth Scanning
# ============================================================

def scan_bt_linux():
    devices = []
    try:
        result = subprocess.run(["hcitool", "scan", "--flush"], capture_output=True, text=True, timeout=20)
        for line in result.stdout.strip().splitlines()[1:]:
            m = re.match(r"\s+([0-9A-Fa-f:]{17})\s+(.*)", line)
            if m:
                devices.append({"mac": m.group(1).upper(), "name": m.group(2).strip() or "Unknown", "type": "classic", "rssi": -70})
    except (FileNotFoundError, subprocess.TimeoutExpired): pass

    try:
        result = subprocess.run(["bluetoothctl", "devices"], capture_output=True, text=True, timeout=10)
        for line in result.stdout.strip().splitlines():
            m = re.match(r"Device\s+([0-9A-Fa-f:]{17})\s+(.*)", line)
            if m:
                mac = m.group(1).upper()
                if not any(d["mac"] == mac for d in devices):
                    devices.append({"mac": mac, "name": m.group(2).strip(), "type": "classic", "rssi": -65})
    except (FileNotFoundError, subprocess.TimeoutExpired): pass
    return devices

def scan_bt_bleak():
    try:
        from bleak import BleakScanner
    except ImportError:
        return None

    try:
        async def do_scan():
            found = await BleakScanner.discover(timeout=8.0)
            return [{"mac": d.address.upper(), "name": d.name or "Unknown BLE", "type": "ble", "rssi": d.rssi or -80} for d in found]

        if platform.system() == "Darwin":
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            if loop and loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(asyncio.run, do_scan())
                    return future.result(timeout=15)
            else:
                return asyncio.run(do_scan())
        else:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(do_scan())
            finally:
                loop.close()
            return result
    except ImportError:
        return None
    except Exception as e:
        print(f"  [!] BLE error: {e}")
        if "not turned on" in str(e).lower() or "powered off" in str(e).lower():
            print("      Turn on Bluetooth in System Settings")
        elif "not authorized" in str(e).lower() or "permission" in str(e).lower():
            print("      Grant Bluetooth permission to Terminal/iTerm2")
        return []

def scan_bluetooth():
    system = platform.system()
    if system == "Linux":
        devices = scan_bt_linux()
        if not devices:
            bleak = scan_bt_bleak()
            if bleak is not None: devices = bleak
        return devices
    else:
        bleak = scan_bt_bleak()
        return bleak if bleak is not None else []

def classify_bt_device(name):
    n = (name or "").lower()
    if any(k in n for k in ["airpod", "buds", "earbuds", "wf-", "wh-", "jbl", "beats"]): return "Audio / Headphones"
    if any(k in n for k in ["watch", "band", "fitbit", "garmin"]): return "Wearable"
    if any(k in n for k in ["iphone", "galaxy", "pixel", "phone"]): return "Smartphone"
    if any(k in n for k in ["tile", "airtag", "smarttag"]): return "Tracker"
    if any(k in n for k in ["keyboard", "mouse", "controller"]): return "Peripheral"
    if any(k in n for k in ["speaker", "sonos", "echo"]): return "Smart Speaker"
    return "Bluetooth Device"

def format_bt_devices(bt_devices):
    devices = []
    for d in bt_devices:
        mac = d.get("mac", "")
        if not mac: continue
        name = d.get("name", "Unknown")
        bt_type = d.get("type", "classic")
        device = {
            "macAddress": mac, "name": name, "signalType": "bluetooth",
            "deviceType": classify_bt_device(name), "manufacturer": lookup_manufacturer(mac),
            "signalStrength": d.get("rssi", -80),
            "frequency": 2402000000 if bt_type == "ble" else 2440000000,
            "protocol": "BLE 5.0" if bt_type == "ble" else "Bluetooth Classic",
            "encryption": "AES-CCM" if bt_type == "ble" else "E0/AES",
        }
        if LATITUDE is not None and LONGITUDE is not None:
            device["latitude"] = LATITUDE
            device["longitude"] = LONGITUDE
        devices.append(device)
    return devices

# ============================================================
# Push & Main
# ============================================================

def push_to_server(devices):
    url = f"{APP_URL.rstrip('/')}/api/collector/push"
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    try:
        resp = requests.post(url, json={"devices": devices}, headers=headers, timeout=15)
        if resp.status_code == 200: return True, resp.json()
        elif resp.status_code == 401: return False, {"error": "Invalid API key."}
        elif resp.status_code == 403: return False, {"error": "API key is disabled."}
        else: return False, {"error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
    except requests.exceptions.ConnectionError: return False, {"error": f"Cannot connect to {APP_URL}."}
    except requests.exceptions.Timeout: return False, {"error": "Timeout."}
    except Exception as e: return False, {"error": str(e)}

def check_setup():
    """Run comprehensive setup check for all platforms."""
    system = platform.system()
    print(f"\n  Platform: {system} {platform.release()} ({platform.machine()})")
    print(f"  Python:   {sys.executable} ({platform.python_version()})")
    print()

    all_ok = True

    try:
        import requests as r
        print(f"  [+] requests: {r.__version__}")
    except ImportError:
        print("  [-] requests: Not installed (pip3 install requests)")
        all_ok = False

    print()

    if system == "Darwin":
        print("  === macOS WiFi ===")
        has_corewlan = False
        try:
            import CoreWLAN
            has_corewlan = True
            print("    [+] CoreWLAN: Available (modern WiFi scanning)")
        except ImportError:
            print("    [-] CoreWLAN: Not installed")
            print("        Fix: pip3 install pyobjc-framework-CoreWLAN pyobjc-framework-CoreLocation")

        airport = "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport"
        if os.path.exists(airport):
            print("    [+] airport: Available (legacy fallback)")
        else:
            print("    [-] airport: Removed (macOS Sonoma 14.4+)")
            if not has_corewlan:
                print("        You NEED CoreWLAN for WiFi scanning!")
                all_ok = False

        has_corelocation = False
        try:
            import CoreLocation
            has_corelocation = True
            print("    [+] CoreLocation: Available")
        except ImportError:
            print("    [-] CoreLocation: Not installed")
            print("        Fix: pip3 install pyobjc-framework-CoreLocation")

        print()
        print("  === macOS Bluetooth ===")
        try:
            import bleak
            print(f"    [+] bleak: {getattr(bleak, '__version__', 'unknown')}")
        except ImportError:
            print("    [-] bleak: Not installed (pip3 install bleak)")
            all_ok = False

        print()
        print("  === macOS Permissions ===")
        print("    [i] WiFi scanning requires Location Services for Terminal/iTerm2")
        print("        System Settings > Privacy & Security > Location Services")
        print("    [i] Bluetooth scanning requires Bluetooth permission")
        print("        System Settings > Privacy & Security > Bluetooth")
        print("    [i] Using system Python (/usr/bin/python3) gives best compatibility")

    elif system == "Windows":
        print("  === Windows WiFi ===")
        try:
            result = subprocess.run(["netsh", "wlan", "show", "interfaces"], capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                print("    [+] netsh WiFi: Available")
            else:
                print("    [-] netsh WiFi: Error")
        except FileNotFoundError:
            print("    [-] netsh: Not found")

        print()
        print("  === Windows Bluetooth ===")
        try:
            import bleak
            print(f"    [+] bleak: {getattr(bleak, '__version__', 'unknown')}")
        except ImportError:
            print("    [-] bleak: Not installed (pip3 install bleak)")
            all_ok = False

    elif system == "Linux":
        print("  === Linux WiFi ===")
        try:
            subprocess.run(["nmcli", "--version"], capture_output=True, text=True, timeout=5)
            print("    [+] nmcli: Available")
        except FileNotFoundError:
            print("    [-] nmcli: Not found (install NetworkManager)")
            all_ok = False

        print()
        print("  === Linux Bluetooth ===")
        try:
            subprocess.run(["hcitool", "--help"], capture_output=True, timeout=5)
            print("    [+] hcitool: Available")
        except FileNotFoundError:
            print("    [-] hcitool: Not found (install bluez)")
        try:
            import bleak
            print(f"    [+] bleak: {getattr(bleak, '__version__', 'unknown')} (fallback)")
        except ImportError:
            print("    [i] bleak: Not installed (optional: pip3 install bleak)")

    print()
    return all_ok

def print_banner():
    print("""
 ____  ___ ____ ___ _   _ _____   _   _ _   _ ____
/ ___|/ _ \\_ _| |_ _| \\ | |_   _| | | | | | | | __ )
\\___ \\ | | || | | |\\ |  | | |   | |_| | | | | |_ \\
 ___) | |_| || | | || \\ | | |   |  _  | |_| | |__) |
|____/ \\___/|___| |___|_| \\_| |_|   |_| |_|\\___/|____/

  Multi-Protocol Collector - WiFi + Bluetooth
  =============================================
""")

def main():
    parser = argparse.ArgumentParser(description="ArmsLength SigInt Multi-Protocol Collector")
    parser.add_argument("--key", help="Collector API key")
    parser.add_argument("--url", help="ArmsLength SigInt URL")
    parser.add_argument("--interval", type=int, default=SCAN_INTERVAL)
    parser.add_argument("--lat", type=float, help="Your latitude")
    parser.add_argument("--lng", type=float, help="Your longitude")
    parser.add_argument("--wifi-only", action="store_true", help="WiFi scanning only")
    parser.add_argument("--bt-only", action="store_true", help="Bluetooth scanning only")
    parser.add_argument("--once", action="store_true", help="Run one scan and exit")
    parser.add_argument("--setup", action="store_true", help="Check system setup and dependencies")
    args = parser.parse_args()

    global API_KEY, APP_URL, LATITUDE, LONGITUDE
    if args.key: API_KEY = args.key
    if args.url: APP_URL = args.url
    if args.lat is not None: LATITUDE = args.lat
    if args.lng is not None: LONGITUDE = args.lng

    print_banner()

    if args.setup:
        ok = check_setup()
        print()
        if ok:
            print("  Setup looks good! Run without --setup to start scanning.")
        else:
            print("  Some issues found. Fix them and try again.")
        print()
        print("  Quick install for macOS:")
        print("    pip3 install requests bleak pyobjc-framework-CoreWLAN pyobjc-framework-CoreLocation")
        print()
        print("  Quick install for Windows/Linux:")
        print("    pip3 install requests bleak")
        sys.exit(0 if ok else 1)

    if API_KEY == "YOUR_API_KEY_HERE" or not API_KEY:
        print("[!] ERROR: No API key. Use --key or set SIGINT_API_KEY")
        sys.exit(1)
    if "your-app" in APP_URL:
        print("[!] ERROR: No app URL. Use --url or set SIGINT_APP_URL")
        sys.exit(1)

    system = platform.system()
    scan_wifi_enabled = not args.bt_only
    scan_bt_enabled = not args.wifi_only

    print(f"  System:    {system} ({platform.release()})")
    print(f"  Python:    {sys.executable}")
    print(f"  Server:    {APP_URL}")
    print(f"  Interval:  {args.interval}s")
    print(f"  WiFi:      {'Enabled' if scan_wifi_enabled else 'Disabled'}")
    print(f"  Bluetooth: {'Enabled' if scan_bt_enabled else 'Disabled'}")
    if LATITUDE and LONGITUDE:
        print(f"  GPS:       {LATITUDE}, {LONGITUDE}")
    print()

    if system == "Darwin":
        print("  [i] macOS detected. Run with --setup to check dependencies.")
        if scan_bt_enabled:
            print("  [i] Bluetooth addresses on macOS appear as UUIDs (Apple privacy)")
        print()

    print("[*] Testing connection...")
    ok, result = push_to_server([])
    if ok: print("[+] Connected!")
    else: print(f"[!] Failed: {result.get('error', 'Unknown')}")
    print()

    scan_count = 0
    total_pushed = 0

    try:
        while True:
            scan_count += 1
            ts = datetime.now().strftime("%H:%M:%S")
            print(f"[{ts}] Scan #{scan_count}...")

            all_devices = []

            if scan_wifi_enabled:
                wifi_nets = scan_wifi()
                wifi_devs = format_wifi_devices(wifi_nets)
                print(f"  WiFi:      {len(wifi_nets)} networks")
                for n in wifi_nets[:3]:
                    print(f"    {n.get('ssid', '?')[:20]:<20} {n.get('bssid', '?')}  {n.get('rssi', '?')}dBm")
                all_devices.extend(wifi_devs)

            if scan_bt_enabled:
                bt_devs_raw = scan_bluetooth()
                bt_devs = format_bt_devices(bt_devs_raw)
                print(f"  Bluetooth: {len(bt_devs_raw)} devices")
                for d in bt_devs_raw[:3]:
                    mac = d.get("mac", "?")
                    if is_uuid_address(mac):
                        mac = mac[:8] + "..."
                    print(f"    {d.get('name', '?')[:20]:<20} {mac:<20}  {d.get('rssi', '?')}dBm")
                all_devices.extend(bt_devs)

            if all_devices:
                ok, result = push_to_server(all_devices)
                if ok:
                    total_pushed += result.get("processed", 0)
                    print(f"  Pushed: {result.get('created', 0)} new, {result.get('updated', 0)} updated (total: {total_pushed})")
                else:
                    print(f"  Push failed: {result.get('error', 'Unknown')}")
            else:
                print("  No signals found.")
                if system == "Darwin":
                    print("  Tip: Run with --setup to check your configuration")

            if args.once: break
            print(f"  Next scan in {args.interval}s... (Ctrl+C to stop)\n")
            time.sleep(args.interval)

    except KeyboardInterrupt:
        print(f"\n[*] Stopped. {scan_count} scans, {total_pushed} devices pushed.")

if __name__ == "__main__":
    main()
