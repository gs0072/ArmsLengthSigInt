# SIGINT Hub - Signal Intelligence Platform

## Overview
A comprehensive signal intelligence platform for collecting, analyzing, and triangulating Bluetooth, WiFi, RFID, SDR, LoRa, and sensor data with geospatial mapping, multi-user collaboration, and AI-powered device analysis. Designed for search and rescue, law enforcement, military operations, and open-source intelligence hobbyists.

## Current State
- MVP with full CRUD for nodes (detected devices/signals), observations, alerts, and following detection
- **Collection Sensors architecture**: Users configure hardware sensors in Settings, activate them from Dashboard to auto-discover nodes
  - `collection_sensors` table with full CRUD API (`/api/sensors`) and Zod validation
  - Sensor types: bluetooth, wifi, rfid, sdr, lora, meshtastic, adsb, sensor
  - Connection methods: builtin, bluetooth, usb, serial, network
  - Sensor statuses: idle, connecting, collecting, error, disconnected
  - AddSensorDialog component for configuring new sensors
  - Settings panel has sensor management section (add/view/delete sensors)
  - Dashboard shows sensor activation buttons (replaces old BLE Scan / Add Device buttons)
- **Passive Monitoring**: Simulated Wireshark-style passive scanning (no Web Bluetooth pairing dialogs)
  - `ble-scanner.ts` has `startPassiveScan()` / `stopPassiveScan()` with BLE and WiFi device pools
  - Dashboard live signal feed shows discovered nodes in real-time during scanning
  - Each discovered node is persisted to DB with GPS auto-tagging
- **Device Associations (SIGINT Intelligence Links)**:
  - `device_associations` table tracking co-movement, signal correlation, C2, network peer, proximity, frequency, temporal patterns
  - Association analyzer with **static collection bias filtering** — rejects false associations from single-location scanning
  - Requires geographic diversity (2+ unique locations per device) for spatial associations
  - Five SIGINT algorithms: spatiotemporal distance ratio test, Pearson RSSI correlation with Fisher Z-transform, multi-site proximity likelihood ratio, RF spectrum co-channel analysis, temporal activation synchronicity test
  - **Proper statistical output**: likelihood ratios, Bayesian posterior probability, confidence levels (almost_certain/highly_likely/likely/possible/unlikely), probability scales, p-values, hypothesis testing (H0/H1)
  - Full CRUD API (`/api/associations`) plus automated analysis endpoint (`/api/associations/analyze`)
  - DeviceDetail Links tab: each association shows linked node name, confidence level label, LR value; clicking opens detailed popup with mini link diagram, statistical method, hypothesis test, probability bar, observation data
- **Link Analysis Page** (/link-analysis) - Palantir-style force-directed graph visualization
  - Canvas-based interactive graph with physics simulation (repulsion + spring forces)
  - Drag nodes to rearrange, scroll to zoom, pan background
  - Color-coded edges by association type, dashed lines for low confidence
  - Node inspector panel showing device details and connected associations
  - Legend overlay for association type colors
- **Heat Map Visualization**:
  - Leaflet.heat integration on World Map with toggle button
  - Signal density visualization with RSSI-weighted intensity
  - Gradient: dark blue (low) through cyan/green to yellow/red (high intensity)
  - Zoom-dependent detail level (maxZoom: 17)
- **Data Export/Import**:
  - Full backup/restore of devices, observations, alerts, sensors, associations
  - Version-tagged export format with device ID remapping on import
  - MAC address deduplication during import
- **Map (Meshtastic-style navigation)**:
  - Location search via Nominatim geocoding + coordinate parsing (decimal, DMS, degrees/minutes)
  - Fly-to with zoom on search result selection (zoom level 15)
  - "Center on my location" button with GPS geolocation
  - After centering, manual pan/drag does NOT auto-recenter - stays where user navigated
  - Only re-centers on new search or my-location click (like Meshtastic/Meshcore)
  - Pink markers for search results, cyan for user location, color-coded for signal types
- **SIGINT Tools page** (/tools) with three integration tabs:
  - **nmap**: Network scanning with ping/quick/port scan types, restricted to private networks
  - **Meshtastic**: LoRa mesh device connectivity via HTTP API (port 4403)
  - **SDR**: RTL-SDR spectrum scanning with frequency range input
- **System Detection**: `/api/system/info` endpoint reports OS, arch, installed tools, network interfaces
  - Settings panel dynamically shows installed tools (nmap, rtl_sdr, rtl_power, etc.)
  - Host System section shows OS, architecture, CPU, memory, hostname
- **Terminology**: UI uses "Nodes" for detected signals/devices, "Sensors" for collection hardware
  - Internal data model still uses "devices" table for backward compatibility
  - Sidebar shows "Node List", stats show "Total Nodes", etc.
- Replit Auth with user profiles and tier system
- Dark cyberpunk-themed UI with responsive design
- Interactive world map with device markers via Leaflet
- Device catalog with comprehensive device categories
- Counter-intelligence panel with following detection
- Monitoring & alerts system
- Seed data with realistic signal intelligence scenarios
- AI-powered device analysis (OpenAI gpt-4o via Replit AI Integrations)
- SIGINT Node Report page (/node-report/:id) - comprehensive intelligence dossier per node
- Manual observation logging dialog with GPS auto-fill
- Settings panel: sensor management, browser capabilities, system info, data mode, security, data management
- Clear All Data feature to remove seed data and start fresh
- Backend validation: createDeviceSchema, createObservationSchema, createSensorSchema (Zod) on POST routes

## Architecture
- **Frontend**: React + TypeScript, Tailwind CSS, Shadcn UI, Wouter routing, TanStack Query, Leaflet maps, Framer Motion animations
- **Backend**: Express.js + TypeScript, PostgreSQL (Drizzle ORM), Replit Auth (OpenID Connect)
- **Database**: PostgreSQL with tables: users, sessions, devices, observations, alerts, device_catalog, user_profiles, activity_log, following_detection, collection_sensors
- **System Packages**: nmap (network scanning), rtl-sdr (software defined radio)
- **NPM Packages**: @meshtastic/core, @meshtastic/transport-http (LoRa mesh networking)

## Backend Services
- `server/services/nmap-scanner.ts` - Safe nmap execution with input sanitization, private network restriction
- `server/services/meshtastic-service.ts` - Meshtastic device connection management via HTTP API
- `server/services/sdr-service.ts` - RTL-SDR tool detection, device listing, spectrum scanning
- `server/services/system-info.ts` - OS detection, tool availability checking, network interface listing
- `server/services/association-analyzer.ts` - SIGINT association detection with five algorithmic analyzers

## Key Design Decisions
- Cyberpunk/tech-movie dark theme with cyan (#00d4ff) primary color and purple accents
- JetBrains Mono as the primary font for technical aesthetic
- Signal types: bluetooth, wifi, rfid, sdr, lora, meshtastic, adsb, sensor
- User tiers: free, basic, professional, enterprise, admin
- Data modes: local, friends, public, osint
- Map navigation: Meshtastic-style (no auto-recenter on pan, only on explicit search/location)
- nmap restricted to private network ranges for safety

## File Structure
- `shared/schema.ts` - All Drizzle models and TypeScript types
- `shared/models/auth.ts` - Replit Auth user/session schemas
- `server/routes.ts` - API endpoints (devices, observations, alerts, sensors, associations, export/import, nmap, meshtastic, sdr, system)
- `server/storage.ts` - Database storage layer (DatabaseStorage)
- `server/seed.ts` - Sample data seeder
- `server/db.ts` - Database connection
- `server/services/` - Backend service modules (nmap, meshtastic, sdr, system-info)
- `server/replit_integrations/auth/` - Authentication module
- `client/src/App.tsx` - Main app with routing and sidebar layout
- `client/src/pages/` - Dashboard, WorldMap, Devices, Search, Monitoring, CounterIntel, Catalog, Tools, LinkAnalysis, Settings, Landing, NodeReport
- `client/src/components/` - Reusable components (AppSidebar, MapView, DeviceList, DeviceDetail, DeviceAnalysis, StatsBar, etc.)
- `client/src/lib/signal-utils.ts` - Signal type definitions, utilities, device catalog data
- `client/src/lib/ble-scanner.ts` - Passive scanning simulation and GPS geolocation
- `client/src/components/add-sensor-dialog.tsx` - Sensor configuration dialog
- `client/src/components/add-observation-dialog.tsx` - Manual observation logging dialog

## User Preferences
- Technical/movie-cool aesthetic preferred
- Dark mode by default
- Comprehensive and fun
- Multi-monitor support for higher resolutions
- Meshtastic/Meshcore-style map navigation (no auto-recenter on manual pan)
