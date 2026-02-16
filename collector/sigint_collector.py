#!/usr/bin/env python3
"""
SIGINT Hub - WiFi Collector for Windows
========================================
Scans nearby WiFi networks using your WiFi adapter (e.g. Alfa AC-1000)
and pushes discovered devices to your SIGINT Hub cloud instance.

Requirements:
  - Windows 10/11
  - Python 3.8+
  - requests library: pip install requests
  - A WiFi adapter (built-in or external like Alfa AC-1000)

Usage:
  1. Generate a Collector API Key in SIGINT Hub Settings
  2. Edit the CONFIG section below with your API key and app URL
  3. Run: python sigint_collector.py

The script will continuously scan and push results every 15 seconds.
Press Ctrl+C to stop.
"""

import subprocess
import re
import time
import json
import sys
import os
import platform
import argparse
from datetime import datetime

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library not found.")
    print("Install it with: pip install requests")
    sys.exit(1)

# ============================================================
# CONFIG - Edit these values
# ============================================================
API_KEY = os.environ.get("SIGINT_API_KEY", "YOUR_API_KEY_HERE")
APP_URL = os.environ.get("SIGINT_APP_URL", "https://your-app.replit.app")
SCAN_INTERVAL = 15  # seconds between scans
LATITUDE = None     # set your latitude or leave None for no GPS
LONGITUDE = None    # set your longitude or leave None for no GPS
# ============================================================

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
}

def lookup_manufacturer(bssid):
    prefix = bssid[:8].upper()
    return OUI_DB.get(prefix, "Unknown")

def scan_wifi_windows():
    """Scan WiFi networks using Windows netsh command."""
    try:
        result = subprocess.run(
            ["netsh", "wlan", "show", "networks", "mode=bssid"],
            capture_output=True, text=True, timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
        )
        if result.returncode != 0:
            print(f"  [!] netsh error: {result.stderr.strip()}")
            return []

        output = result.stdout
        networks = []
        current = {}

        for line in output.splitlines():
            line = line.strip()
            if line.startswith("SSID") and "BSSID" not in line:
                match = re.match(r"SSID\s+\d+\s*:\s*(.*)", line)
                if match:
                    current["ssid"] = match.group(1).strip()
            elif line.startswith("BSSID"):
                match = re.match(r"BSSID\s+\d+\s*:\s*(.*)", line)
                if match:
                    current["bssid"] = match.group(1).strip().upper()
            elif line.startswith("Signal"):
                match = re.match(r"Signal\s*:\s*(\d+)%", line)
                if match:
                    pct = int(match.group(1))
                    current["signal_pct"] = pct
                    current["rssi"] = int(pct / 2 - 100)
            elif line.startswith("Channel"):
                match = re.match(r"Channel\s*:\s*(\d+)", line)
                if match:
                    current["channel"] = int(match.group(1))
            elif line.startswith("Network type"):
                match = re.match(r"Network type\s*:\s*(.*)", line)
                if match:
                    current["network_type"] = match.group(1).strip()
            elif line.startswith("Authentication"):
                match = re.match(r"Authentication\s*:\s*(.*)", line)
                if match:
                    current["auth"] = match.group(1).strip()
            elif line.startswith("Encryption"):
                match = re.match(r"Encryption\s*:\s*(.*)", line)
                if match:
                    current["encryption"] = match.group(1).strip()
            elif line.startswith("Radio type"):
                match = re.match(r"Radio type\s*:\s*(.*)", line)
                if match:
                    current["radio"] = match.group(1).strip()

            if "bssid" in current and "rssi" in current:
                networks.append(current)
                bssid = current.get("bssid", "")
                ssid = current.get("ssid", "")
                current = {"ssid": ssid}

        return networks
    except FileNotFoundError:
        print("  [!] netsh command not found. Are you on Windows?")
        return []
    except subprocess.TimeoutExpired:
        print("  [!] WiFi scan timed out")
        return []

def scan_wifi_linux():
    """Scan WiFi networks using Linux iwlist/nmcli."""
    try:
        result = subprocess.run(
            ["nmcli", "-t", "-f", "BSSID,SSID,SIGNAL,CHAN,SECURITY,FREQ", "dev", "wifi", "list", "--rescan", "yes"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            result = subprocess.run(
                ["sudo", "iwlist", "scan"],
                capture_output=True, text=True, timeout=30
            )
            return []

        networks = []
        for line in result.stdout.strip().splitlines():
            parts = line.split(":")
            if len(parts) >= 6:
                bssid = ":".join(parts[0:6]).strip().upper()
                remaining = ":".join(parts[6:])
                fields = remaining.split(":")
                if len(fields) >= 5:
                    ssid = fields[0].strip()
                    try:
                        signal_pct = int(fields[1].strip())
                    except ValueError:
                        signal_pct = 0
                    try:
                        channel = int(fields[2].strip())
                    except ValueError:
                        channel = 0
                    security = fields[3].strip()
                    freq = fields[4].strip()

                    networks.append({
                        "bssid": bssid,
                        "ssid": ssid,
                        "signal_pct": signal_pct,
                        "rssi": int(signal_pct / 2 - 100),
                        "channel": channel,
                        "auth": security,
                        "encryption": security,
                        "radio": freq,
                    })
        return networks
    except FileNotFoundError:
        print("  [!] nmcli not found. Install NetworkManager.")
        return []

def scan_wifi_macos():
    """Scan WiFi networks using macOS airport utility."""
    try:
        airport_path = "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport"
        result = subprocess.run(
            [airport_path, "-s"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return []

        networks = []
        lines = result.stdout.strip().splitlines()
        for line in lines[1:]:
            match = re.match(r"\s*(.+?)\s+([0-9a-f:]{17})\s+(-?\d+)\s+(\d+)\s+\S+\s+\S+\s+(\S+)", line, re.IGNORECASE)
            if match:
                networks.append({
                    "ssid": match.group(1).strip(),
                    "bssid": match.group(2).upper(),
                    "rssi": int(match.group(3)),
                    "signal_pct": max(0, min(100, (int(match.group(3)) + 100) * 2)),
                    "channel": int(match.group(4)),
                    "auth": match.group(5),
                    "encryption": match.group(5),
                })
        return networks
    except FileNotFoundError:
        print("  [!] airport utility not found.")
        return []

def channel_to_freq(channel):
    if 1 <= channel <= 14:
        if channel == 14:
            return 2484000000
        return (2407 + channel * 5) * 1000000
    elif 36 <= channel <= 165:
        return (5000 + channel * 5) * 1000000
    return None

def radio_to_protocol(radio_str):
    if not radio_str:
        return "802.11"
    r = radio_str.lower()
    if "ax" in r or "wifi 6" in r or "wi-fi 6" in r:
        return "802.11ax"
    if "ac" in r or "wifi 5" in r:
        return "802.11ac"
    if "n" in r or "wifi 4" in r:
        return "802.11n"
    if "g" in r:
        return "802.11g"
    if "a" in r:
        return "802.11a"
    if "b" in r:
        return "802.11b"
    return "802.11"

def format_devices(networks):
    devices = []
    for net in networks:
        bssid = net.get("bssid", "")
        if not bssid or bssid == "00:00:00:00:00:00":
            continue

        ssid = net.get("ssid", "Hidden Network") or "Hidden Network"
        channel = net.get("channel", 0)
        freq = channel_to_freq(channel)
        manufacturer = lookup_manufacturer(bssid)

        device = {
            "macAddress": bssid,
            "name": ssid,
            "signalType": "wifi",
            "deviceType": "Wi-Fi Network",
            "manufacturer": manufacturer,
            "signalStrength": net.get("rssi", -80),
            "frequency": freq,
            "channel": channel,
            "protocol": radio_to_protocol(net.get("radio", "")),
            "encryption": net.get("auth", "Unknown"),
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
            data = resp.json()
            return True, data
        elif resp.status_code == 401:
            return False, {"error": "Invalid API key. Check your SIGINT_API_KEY."}
        elif resp.status_code == 403:
            return False, {"error": "API key is disabled."}
        else:
            return False, {"error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
    except requests.exceptions.ConnectionError:
        return False, {"error": f"Cannot connect to {APP_URL}. Check your SIGINT_APP_URL."}
    except requests.exceptions.Timeout:
        return False, {"error": "Request timed out."}
    except Exception as e:
        return False, {"error": str(e)}

def print_banner():
    print("""
 ____  ___ ____ ___ _   _ _____   _   _ _   _ ____
/ ___|/ _ \\_ _| |_ _| \\ | |_   _| | | | | | | | __ )
\\___ \\ | | || | | |\\ |  | | |   | |_| | | | | |_ \\
 ___) | |_| || | | || \\ | | |   |  _  | |_| | |__) |
|____/ \\___/|___| |___|_| \\_| |_|   |_| |_|\\___/|____/

  WiFi Collector - Real Hardware Scanner
  ========================================
""")

def main():
    parser = argparse.ArgumentParser(description="SIGINT Hub WiFi Collector")
    parser.add_argument("--key", help="Collector API key (or set SIGINT_API_KEY env var)")
    parser.add_argument("--url", help="SIGINT Hub URL (or set SIGINT_APP_URL env var)")
    parser.add_argument("--interval", type=int, default=SCAN_INTERVAL, help="Scan interval in seconds")
    parser.add_argument("--lat", type=float, help="Your latitude for GPS tagging")
    parser.add_argument("--lng", type=float, help="Your longitude for GPS tagging")
    parser.add_argument("--once", action="store_true", help="Run one scan and exit")
    args = parser.parse_args()

    global API_KEY, APP_URL, LATITUDE, LONGITUDE

    if args.key:
        API_KEY = args.key
    if args.url:
        APP_URL = args.url
    if args.lat is not None:
        LATITUDE = args.lat
    if args.lng is not None:
        LONGITUDE = args.lng

    print_banner()

    if API_KEY == "YOUR_API_KEY_HERE" or not API_KEY:
        print("[!] ERROR: No API key configured.")
        print("    Set SIGINT_API_KEY environment variable or use --key flag")
        print("    Generate a key in SIGINT Hub > Settings > Collector API Keys")
        sys.exit(1)

    if "your-app" in APP_URL:
        print("[!] ERROR: No app URL configured.")
        print("    Set SIGINT_APP_URL environment variable or use --url flag")
        print("    Example: --url https://your-repl-name.replit.app")
        sys.exit(1)

    system = platform.system()
    print(f"  System:    {system} ({platform.release()})")
    print(f"  Server:    {APP_URL}")
    print(f"  Interval:  {args.interval}s")
    if LATITUDE and LONGITUDE:
        print(f"  GPS:       {LATITUDE}, {LONGITUDE}")
    else:
        print(f"  GPS:       Not set (use --lat/--lng)")
    print()

    if system == "Windows":
        scan_fn = scan_wifi_windows
    elif system == "Darwin":
        scan_fn = scan_wifi_macos
    elif system == "Linux":
        scan_fn = scan_wifi_linux
    else:
        print(f"[!] Unsupported OS: {system}")
        sys.exit(1)

    print("[*] Testing connection to SIGINT Hub...")
    ok, result = push_to_server([])
    if ok:
        print("[+] Connected successfully!")
    else:
        print(f"[!] Connection test failed: {result.get('error', 'Unknown error')}")
        print("    Check your API key and app URL.")
        if not args.once:
            print("    Will keep trying...")
    print()

    scan_count = 0
    total_pushed = 0

    try:
        while True:
            scan_count += 1
            timestamp = datetime.now().strftime("%H:%M:%S")
            print(f"[{timestamp}] Scan #{scan_count}...")

            networks = scan_fn()
            print(f"  Found {len(networks)} WiFi networks")

            if networks:
                for net in networks[:5]:
                    ssid = net.get("ssid", "?")[:25]
                    bssid = net.get("bssid", "?")
                    rssi = net.get("rssi", "?")
                    ch = net.get("channel", "?")
                    print(f"    {ssid:<25} {bssid}  {rssi}dBm  Ch{ch}")
                if len(networks) > 5:
                    print(f"    ... and {len(networks) - 5} more")

                devices = format_devices(networks)
                ok, result = push_to_server(devices)
                if ok:
                    created = result.get("created", 0)
                    updated = result.get("updated", 0)
                    total_pushed += result.get("processed", 0)
                    print(f"  Pushed: {created} new, {updated} updated (total: {total_pushed})")
                else:
                    print(f"  Push failed: {result.get('error', 'Unknown')}")
            else:
                print("  No networks found. Is WiFi adapter active?")

            if args.once:
                break

            print(f"  Next scan in {args.interval}s... (Ctrl+C to stop)")
            print()
            time.sleep(args.interval)

    except KeyboardInterrupt:
        print(f"\n[*] Stopped. {scan_count} scans, {total_pushed} devices pushed.")

if __name__ == "__main__":
    main()
