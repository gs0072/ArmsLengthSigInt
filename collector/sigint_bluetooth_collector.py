#!/usr/bin/env python3
"""
ArmsLength SigInt - Bluetooth Collector
========================================
Scans nearby Bluetooth and BLE devices using your system's Bluetooth adapter
and pushes discovered devices to your ArmsLength SigInt instance.

Supported Platforms:
  - macOS 12+ (uses bleak library with CoreBluetooth)
    Note: macOS uses UUID-style addresses instead of MAC addresses (Apple privacy)
    Devices are still tracked consistently across scans on the same machine
  - Windows 10/11 (uses bleak)
  - Linux (uses hcitool/bluetoothctl, falls back to bleak)

Requirements:
  - Python 3.8+
  - pip3 install requests bleak
  - macOS: Bluetooth must be enabled in System Settings
  - macOS: Terminal/iTerm2 needs Bluetooth permission
    (System Settings > Privacy & Security > Bluetooth)

Usage:
  1. Generate a Collector API Key in ArmsLength SigInt Settings
  2. Run: python3 sigint_bluetooth_collector.py --key YOUR_KEY --url https://your-app.replit.app
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
SCAN_INTERVAL = 15
LATITUDE = None
LONGITUDE = None

BT_OUI_DB = {
    "A4:83:E7": "Apple", "3C:22:FB": "Apple", "DC:56:E7": "Apple",
    "F0:D4:15": "Apple", "78:7B:8A": "Apple", "AC:BC:32": "Apple",
    "DC:2B:61": "Samsung", "50:DC:E7": "Samsung", "88:B4:A6": "Huawei",
    "C8:47:8C": "Xiaomi", "A0:C5:89": "Motorola", "04:5D:4B": "Sony",
    "F8:1E:DF": "Amazon", "44:07:0B": "Ring", "2C:AA:8E": "Wyze",
    "48:A6:B8": "Sonos", "74:75:48": "Amazon", "30:FD:38": "Google",
    "F4:F5:D8": "Google", "54:60:09": "Google", "E8:48:B8": "Samsung",
    "B0:BE:76": "Samsung", "94:DB:56": "Sony", "D4:F5:47": "Bose",
    "04:52:C7": "Bose", "2C:41:A1": "Bose", "28:6C:07": "Xiaomi",
    "8C:DE:52": "Beats", "7C:D9:F4": "JBL", "00:18:09": "Garmin",
    "00:16:4E": "Nokia", "88:C6:26": "Tile", "E4:17:D8": "Tile",
}

def is_uuid_address(addr):
    """Check if an address is a macOS-style UUID rather than a MAC address."""
    return len(addr) > 17 or "-" in addr

def lookup_manufacturer(mac):
    if is_uuid_address(mac):
        return "Unknown (macOS UUID)"
    prefix = mac[:8].upper()
    return BT_OUI_DB.get(prefix, "Unknown")

def scan_bluetooth_linux_hcitool():
    devices = []
    try:
        result = subprocess.run(
            ["hcitool", "scan", "--flush"],
            capture_output=True, text=True, timeout=20
        )
        for line in result.stdout.strip().splitlines()[1:]:
            match = re.match(r"\s+([0-9A-Fa-f:]{17})\s+(.*)", line)
            if match:
                mac = match.group(1).upper()
                name = match.group(2).strip() or "Unknown Device"
                devices.append({
                    "mac": mac,
                    "name": name,
                    "type": "classic",
                    "rssi": -70,
                })
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    try:
        result = subprocess.run(
            ["hcitool", "lescan", "--duplicates"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.strip().splitlines():
            match = re.match(r"([0-9A-Fa-f:]{17})\s+(.*)", line)
            if match:
                mac = match.group(1).upper()
                name = match.group(2).strip()
                if name and name != "(unknown)" and not any(d["mac"] == mac for d in devices):
                    devices.append({
                        "mac": mac,
                        "name": name,
                        "type": "ble",
                        "rssi": -75,
                    })
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    try:
        result = subprocess.run(
            ["bluetoothctl", "devices"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.strip().splitlines():
            match = re.match(r"Device\s+([0-9A-Fa-f:]{17})\s+(.*)", line)
            if match:
                mac = match.group(1).upper()
                name = match.group(2).strip()
                if not any(d["mac"] == mac for d in devices):
                    devices.append({
                        "mac": mac,
                        "name": name,
                        "type": "classic",
                        "rssi": -65,
                    })
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return devices

def scan_bluetooth_bleak():
    try:
        from bleak import BleakScanner
    except ImportError:
        return None

    try:
        async def do_scan():
            found = await BleakScanner.discover(timeout=8.0)
            results = []
            for d in found:
                addr = d.address.upper()
                results.append({
                    "mac": addr,
                    "name": d.name or "Unknown BLE Device",
                    "type": "ble",
                    "rssi": d.rssi if d.rssi else -80,
                    "is_uuid": is_uuid_address(addr),
                })
            return results

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
                devices = loop.run_until_complete(do_scan())
            finally:
                loop.close()
            return devices
    except ImportError:
        return None
    except Exception as e:
        print(f"  [!] BLE scan error: {e}")
        if "not turned on" in str(e).lower() or "powered off" in str(e).lower():
            print("      Turn on Bluetooth in System Settings")
        elif "not authorized" in str(e).lower() or "permission" in str(e).lower():
            print("      Grant Bluetooth permission to Terminal/iTerm2:")
            print("      System Settings > Privacy & Security > Bluetooth")
        return []

def scan_bluetooth():
    system = platform.system()
    if system == "Linux":
        devices = scan_bluetooth_linux_hcitool()
        if not devices:
            bleak_devices = scan_bluetooth_bleak()
            if bleak_devices is not None:
                devices = bleak_devices
        return devices
    else:
        bleak_devices = scan_bluetooth_bleak()
        if bleak_devices is not None:
            return bleak_devices
        print(f"  [!] Install 'bleak' for Bluetooth scanning: pip3 install bleak")
        return []

def classify_bt_device(name, manufacturer):
    name_lower = (name or "").lower()
    if any(kw in name_lower for kw in ["airpod", "buds", "earbuds", "wf-", "wh-", "jbl", "beats"]):
        return "Audio / Headphones"
    if any(kw in name_lower for kw in ["watch", "band", "fitbit", "garmin", "mi band"]):
        return "Wearable"
    if any(kw in name_lower for kw in ["iphone", "galaxy", "pixel", "phone"]):
        return "Smartphone"
    if any(kw in name_lower for kw in ["ipad", "tab", "tablet"]):
        return "Tablet"
    if any(kw in name_lower for kw in ["tile", "airtag", "smarttag"]):
        return "Tracker"
    if any(kw in name_lower for kw in ["keyboard", "mouse", "controller"]):
        return "Peripheral"
    if any(kw in name_lower for kw in ["speaker", "sonos", "echo", "homepod"]):
        return "Smart Speaker"
    if any(kw in name_lower for kw in ["tv", "roku", "fire", "chromecast"]):
        return "Smart TV / Streaming"
    if any(kw in name_lower for kw in ["ring", "nest", "wyze", "cam"]):
        return "Smart Home"
    return "Bluetooth Device"

def format_devices(bt_devices):
    devices = []
    for d in bt_devices:
        mac = d.get("mac", "")
        if not mac or mac == "00:00:00:00:00:00":
            continue

        name = d.get("name", "Unknown Device")
        manufacturer = lookup_manufacturer(mac)
        device_type = classify_bt_device(name, manufacturer)
        bt_type = d.get("type", "classic")
        rssi = d.get("rssi", -80)

        device = {
            "macAddress": mac,
            "name": name,
            "signalType": "bluetooth",
            "deviceType": device_type,
            "manufacturer": manufacturer,
            "signalStrength": rssi,
            "frequency": 2402000000 if bt_type == "ble" else 2440000000,
            "protocol": "BLE 5.0" if bt_type == "ble" else "Bluetooth Classic",
            "encryption": "AES-CCM" if bt_type == "ble" else "E0/AES",
        }

        if LATITUDE is not None and LONGITUDE is not None:
            device["latitude"] = LATITUDE
            device["longitude"] = LONGITUDE

        devices.append(device)
    return devices

def push_to_server(devices):
    url = f"{APP_URL.rstrip('/')}/api/collector/push"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        resp = requests.post(url, json={"devices": devices}, headers=headers, timeout=15)
        if resp.status_code == 200:
            return True, resp.json()
        elif resp.status_code == 401:
            return False, {"error": "Invalid API key."}
        elif resp.status_code == 403:
            return False, {"error": "API key is disabled."}
        else:
            return False, {"error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
    except requests.exceptions.ConnectionError:
        return False, {"error": f"Cannot connect to {APP_URL}."}
    except requests.exceptions.Timeout:
        return False, {"error": "Request timed out."}
    except Exception as e:
        return False, {"error": str(e)}

def check_macos_setup():
    """Check macOS Bluetooth requirements."""
    print("  [macOS Bluetooth Setup Check]")

    has_bleak = False
    bleak_version = "?"
    try:
        import bleak
        has_bleak = True
        bleak_version = getattr(bleak, "__version__", "unknown")
    except ImportError:
        pass

    if has_bleak:
        print(f"    [+] bleak: {bleak_version}")
    else:
        print("    [-] bleak: Not installed")
        print("        Fix: pip3 install bleak")

    print()
    print("    [i] macOS Bluetooth notes:")
    print("        - macOS uses UUID addresses instead of MAC addresses (Apple privacy)")
    print("          Devices are still tracked consistently on the same machine")
    print("        - Bluetooth must be enabled: System Settings > Bluetooth")
    print("        - Terminal needs Bluetooth permission:")
    print("          System Settings > Privacy & Security > Bluetooth > Terminal")
    print()
    return has_bleak

def check_setup():
    """Run platform-specific setup checks."""
    system = platform.system()
    print(f"\n  Platform: {system} {platform.release()} ({platform.machine()})")
    print(f"  Python:   {sys.executable} ({platform.python_version()})")
    print()

    if system == "Darwin":
        ok = check_macos_setup()
    elif system == "Windows":
        print("  [Windows Bluetooth Setup Check]")
        has_bleak = False
        try:
            import bleak
            has_bleak = True
            print(f"    [+] bleak: {getattr(bleak, '__version__', 'unknown')}")
        except ImportError:
            print("    [-] bleak: Not installed (pip3 install bleak)")
        ok = has_bleak
    elif system == "Linux":
        print("  [Linux Bluetooth Setup Check]")
        try:
            subprocess.run(["hcitool", "--help"], capture_output=True, timeout=5)
            print("    [+] hcitool: Available")
        except FileNotFoundError:
            print("    [-] hcitool: Not found (install bluez)")
        try:
            import bleak
            print(f"    [+] bleak: {getattr(bleak, '__version__', 'unknown')} (fallback)")
        except ImportError:
            print("    [i] bleak: Not installed (optional fallback: pip3 install bleak)")
        ok = True
    else:
        print(f"  [!] Unsupported OS: {system}")
        ok = False

    print()
    try:
        import requests as r
        print(f"  [+] requests: {r.__version__}")
    except ImportError:
        print("  [-] requests: Not installed (pip3 install requests)")
        ok = False

    return ok

def print_banner():
    print("""
 ____  ___ ____ ___ _   _ _____   _   _ _   _ ____
/ ___|/ _ \\_ _| |_ _| \\ | |_   _| | | | | | | | __ )
\\___ \\ | | || | | |\\ |  | | |   | |_| | | | | |_ \\
 ___) | |_| || | | || \\ | | |   |  _  | |_| | |__) |
|____/ \\___/|___| |___|_| \\_| |_|   |_| |_|\\___/|____/

  Bluetooth Collector - Cross-Platform Hardware Scanner
  =======================================================
""")

def main():
    parser = argparse.ArgumentParser(description="ArmsLength SigInt Bluetooth Collector")
    parser.add_argument("--key", help="Collector API key")
    parser.add_argument("--url", help="ArmsLength SigInt URL")
    parser.add_argument("--interval", type=int, default=SCAN_INTERVAL, help="Scan interval in seconds")
    parser.add_argument("--lat", type=float, help="Your latitude")
    parser.add_argument("--lng", type=float, help="Your longitude")
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
        if ok:
            print("  Setup looks good! Run without --setup to start scanning.")
        else:
            print("  Some issues found. Fix them and try again.")
        sys.exit(0 if ok else 1)

    if API_KEY == "YOUR_API_KEY_HERE" or not API_KEY:
        print("[!] ERROR: No API key configured.")
        print("    Set SIGINT_API_KEY env var or use --key flag")
        sys.exit(1)
    if "your-app" in APP_URL:
        print("[!] ERROR: No app URL configured.")
        print("    Set SIGINT_APP_URL env var or use --url flag")
        sys.exit(1)

    system = platform.system()
    print(f"  System:    {system} ({platform.release()})")
    print(f"  Python:    {sys.executable}")
    print(f"  Server:    {APP_URL}")
    print(f"  Interval:  {args.interval}s")
    if LATITUDE and LONGITUDE:
        print(f"  GPS:       {LATITUDE}, {LONGITUDE}")
    print()

    if system == "Darwin":
        uuid_count = 0
        print("  [i] macOS: Bluetooth addresses will appear as UUIDs (Apple privacy)")
        print("      Devices are still tracked consistently on this machine")
        print("  [i] Tip: Run with --setup to check your configuration")
        print()

    print("[*] Testing connection...")
    ok, result = push_to_server([])
    if ok:
        print("[+] Connected successfully!")
    else:
        print(f"[!] Connection test failed: {result.get('error', 'Unknown')}")
    print()

    scan_count = 0
    total_pushed = 0

    try:
        while True:
            scan_count += 1
            ts = datetime.now().strftime("%H:%M:%S")
            print(f"[{ts}] Scan #{scan_count}...")

            bt_devices = scan_bluetooth()
            print(f"  Found {len(bt_devices)} Bluetooth devices")

            if bt_devices:
                for d in bt_devices[:5]:
                    name = (d.get("name", "?"))[:25]
                    mac = d.get("mac", "?")
                    if is_uuid_address(mac):
                        mac = mac[:8] + "..."
                    rssi = d.get("rssi", "?")
                    bt_type = d.get("type", "?")
                    print(f"    {name:<25} {mac:<20} {rssi}dBm  {bt_type}")
                if len(bt_devices) > 5:
                    print(f"    ... and {len(bt_devices) - 5} more")

                devices = format_devices(bt_devices)
                ok, result = push_to_server(devices)
                if ok:
                    created = result.get("created", 0)
                    updated = result.get("updated", 0)
                    total_pushed += result.get("processed", 0)
                    print(f"  Pushed: {created} new, {updated} updated (total: {total_pushed})")
                else:
                    print(f"  Push failed: {result.get('error', 'Unknown')}")
            else:
                if system == "Darwin":
                    print("  No devices found. Possible causes:")
                    print("    - Bluetooth is turned off (System Settings > Bluetooth)")
                    print("    - Terminal lacks Bluetooth permission")
                    print("    - No BLE devices advertising nearby")
                    print("    - Run with --setup to diagnose")
                else:
                    print("  No devices found. Is Bluetooth adapter enabled?")

            if args.once:
                break

            print(f"  Next scan in {args.interval}s... (Ctrl+C to stop)\n")
            time.sleep(args.interval)

    except KeyboardInterrupt:
        print(f"\n[*] Stopped. {scan_count} scans, {total_pushed} devices pushed.")

if __name__ == "__main__":
    main()
