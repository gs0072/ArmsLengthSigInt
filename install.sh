#!/bin/bash
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

echo ""
echo -e "${CYAN}${BOLD}"
echo "  ____  ___ ____ ___ _   _ _____   _   _ _   _ ____  "
echo " / ___|/_ _/ ___|_ _| \ | |_   _| | | | | | | | __ ) "
echo " \___ \| | |  _ | ||  \| | | |   | |_| | | | |  _ \ "
echo "  ___) | | |_| || || |\  | | |   |  _  | |_| | |_) |"
echo " |____/___\____|___|_| \_| |_|   |_| |_|\___/|____/ "
echo ""
echo -e "${NC}${BOLD}  Signal Intelligence Platform - Linux Installer${NC}"
echo ""

check_command() {
    if command -v "$1" &> /dev/null; then
        echo -e "  ${GREEN}[OK]${NC} $1 found"
        return 0
    else
        echo -e "  ${RED}[--]${NC} $1 not found"
        return 1
    fi
}

echo -e "${BOLD}[1/6] Checking prerequisites...${NC}"
echo ""

NODE_OK=true
if ! check_command node; then
    NODE_OK=false
fi
if ! check_command npm; then
    NODE_OK=false
fi

if [ "$NODE_OK" = false ]; then
    echo ""
    echo -e "${RED}Node.js is required. Install it first:${NC}"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Node.js 18+ required (found v${NODE_VERSION}). Please upgrade.${NC}"
    exit 1
fi

echo ""
echo -e "${BOLD}[2/6] Checking SIGINT tools (optional)...${NC}"
echo ""
check_command hcitool || true
check_command bluetoothctl || true
check_command hciconfig || true
check_command iwconfig || true
check_command airmon-ng || true
check_command nmap || true
check_command rtl_sdr || true
check_command rtl_power || true
check_command rtl_fm || true
check_command gpsd || true
check_command dump1090 || true
echo ""

echo -e "${YELLOW}Tip: Install missing tools with:${NC}"
echo "  sudo apt-get install -y bluez nmap gpsd gpsd-clients"
echo "  sudo apt-get install -y rtl-sdr librtlsdr-dev"
echo "  sudo apt-get install -y aircrack-ng iw wireless-tools"
echo ""

echo -e "${BOLD}[3/6] Installing Node.js dependencies...${NC}"
npm install

echo ""
echo -e "${BOLD}[4/6] Generating node identity...${NC}"

NODE_CONFIG_FILE=".sigint-node.json"
if [ -f "$NODE_CONFIG_FILE" ]; then
    echo -e "  ${GREEN}Node identity already exists${NC}"
    NODE_ID=$(cat "$NODE_CONFIG_FILE" | grep -o '"nodeId":"[^"]*"' | cut -d'"' -f4)
    echo -e "  Node ID: ${CYAN}${NODE_ID}${NC}"
else
    NODE_ID="sigint-$(hostname | tr '[:upper:]' '[:lower:]' | tr ' ' '-')-$(head -c 4 /dev/urandom | xxd -p)"
    NODE_NAME="$(hostname)"
    
    cat > "$NODE_CONFIG_FILE" << EOF
{
  "nodeId": "${NODE_ID}",
  "nodeName": "${NODE_NAME}",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platform": "$(uname -s)-$(uname -m)",
  "role": "collector",
  "syncEnabled": false,
  "syncTargetUrl": "",
  "scanIntervalMs": 30000,
  "enableBLE": true,
  "enableWiFi": true,
  "enableSDR": true
}
EOF
    
    echo -e "  ${GREEN}Node identity created${NC}"
    echo -e "  Node ID: ${CYAN}${NODE_ID}${NC}"
    echo -e "  Config: ${NODE_CONFIG_FILE}"
fi

echo ""
echo -e "${BOLD}[5/6] Setting up database...${NC}"

if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}DATABASE_URL not set. You have two options:${NC}"
    echo ""
    echo "  Option A: Use PostgreSQL locally"
    echo "    export DATABASE_URL=postgresql://user:pass@localhost:5432/siginthub"
    echo ""
    echo "  Option B: Use SQLite (coming soon)"
    echo ""
    echo "  Then re-run: npm run db:push"
    echo ""
else
    echo -e "  ${GREEN}DATABASE_URL is set${NC}"
    echo "  Running database migrations..."
    npm run db:push 2>/dev/null || npm run db:push --force 2>/dev/null || echo -e "  ${YELLOW}Database push had warnings (may be OK if tables exist)${NC}"
fi

echo ""
echo -e "${BOLD}[6/6] Setup complete!${NC}"
echo ""
echo -e "${CYAN}${BOLD}Quick Start:${NC}"
echo ""
echo "  Start the server:"
echo -e "    ${GREEN}npm run dev${NC}"
echo ""
echo "  The web UI will be available at:"
echo -e "    ${CYAN}http://localhost:5000${NC}"
echo -e "    ${CYAN}http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo '<your-ip>'):5000${NC}"
echo ""
echo "  Access from your phone on the same network using the IP address above."
echo ""
echo -e "${CYAN}${BOLD}Linux Scanner:${NC}"
echo ""
echo "  The built-in Linux scanner will automatically detect and use:"
echo "  - Bluetooth (hcitool/bluetoothctl) for continuous BLE scanning"
echo "  - WiFi (iwconfig/airmon-ng) for probe request detection"
echo "  - RTL-SDR (rtl_power) for spectrum analysis"
echo "  - GPS (gpsd) for automatic location tagging"
echo ""
echo "  Note: Some tools require root privileges. Run with sudo if needed:"
echo -e "    ${GREEN}sudo npm run dev${NC}"
echo ""
echo -e "${CYAN}${BOLD}Multi-Node Setup:${NC}"
echo ""
echo "  To connect multiple collection nodes:"
echo "  1. Install SIGINT Hub on each Linux box"
echo "  2. Designate one as the central server"
echo "  3. On each collector, go to Settings > Node Sync"
echo "  4. Enter the central server URL"
echo "  5. Enable sync - devices and observations will be shared"
echo ""
echo -e "  Node ID: ${CYAN}${NODE_ID}${NC}"
echo -e "  Config:  ${CYAN}${NODE_CONFIG_FILE}${NC}"
echo ""
