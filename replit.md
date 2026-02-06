# SIGINT Hub - Signal Intelligence Platform

## Overview
SIGINT Hub is a signal intelligence platform designed for collecting, analyzing, and triangulating various wireless signals, including Bluetooth, WiFi, RFID, SDR, and LoRa. It integrates geospatial mapping, multi-user collaboration, and AI-powered device analysis. The platform aims to serve search and rescue operations, law enforcement, military intelligence, and open-source intelligence hobbyists by providing comprehensive tools for understanding signal environments and tracking devices.

## User Preferences
- Technical/movie-cool aesthetic preferred
- Dark mode by default
- Comprehensive and fun
- Multi-monitor support for higher resolutions
- Meshtastic/Meshcore-style map navigation (no auto-recenter on manual pan)

## System Architecture
The platform is built with a React + TypeScript frontend utilizing Tailwind CSS, Shadcn UI, Wouter for routing, TanStack Query for data fetching, Leaflet for interactive maps, and Framer Motion for animations. The backend is an Express.js + TypeScript server with a PostgreSQL database (managed by Drizzle ORM) and Replit Auth for user management.

**Key Features:**
- **Collection Sensors:** Configurable hardware sensors (Bluetooth, WiFi, RFID, SDR, LoRa, Meshtastic, ADS-B, environmental sensors) with various connection methods (builtin, bluetooth, usb, serial, network). Sensors activate from the Dashboard to auto-discover nodes.
- **Passive Monitoring:** Simulated Wireshark-style scanning with 250+ device templates and an OUI database for manufacturer identification. Supports progressive discovery where nodes are created with partial data and updated as more information resolves. Telemetry-enabled nodes (LoRa, Meshtastic, ADS-B, drones) use broadcasted GPS for observations, while others use the sensor host's geolocation.
- **Device Associations (Multi-INT Intelligence Links):** Automated analysis creates links between devices based on geospatial (co-movement, triangulation), signal (RSSI correlation, temporal activation), and measurement/signature intelligence (RF emission, frequency fingerprinting). Associations require geographic diversity for spatial analysis and provide statistical outputs like likelihood ratios and confidence levels.
- **NodeLinkGraph Component:** A canvas-based force-directed graph for visualizing device associations, used in both individual Node Reports and a dedicated Link Analysis page.
- **GEOINT Position Fix / Triangulation:** Calculates estimated latitude/longitude, error radius, and confidence for a single device using RSSI-weighted multilateration from multiple observations.
- **Trusted Users & Data Modes:** Supports "Friends" mode for sharing data with trusted users and "Combined/All Sources" mode for aggregating data. "OSINT" mode provides configuration for 12 curated OSINT data sources and HUMINT linking guidance.
- **OSINT Links / HUMINT Associations:** Manages associations between human identities/aliases and detected devices.
- **Heat Map Visualization:** Integrates Leaflet.heat on the World Map to visualize signal density with RSSI-weighted intensity.
- **Data Export/Import:** Full backup and restore functionality for devices, observations, alerts, sensors, and associations, with device ID remapping and MAC address deduplication.
- **Map Navigation:** Meshtastic-style map interaction with location search (Nominatim geocoding), "center on my location" via GPS, and pink markers for search results.
- **SIGINT Tools Page:** Integrates `nmap` for network scanning (restricted to private networks), `Meshtastic` for LoRa mesh device connectivity, and `SDR` for RTL-SDR spectrum scanning.
- **System Detection:** `/api/system/info` endpoint provides host system information (OS, arch, CPU, memory, hostname) and dynamically lists installed SIGINT tools.
- **Device Catalog with Broadcast Signatures:** A curated catalog of devices (e.g., pacemakers, medical devices) with known broadcast names for fast searching and alert creation.
- **AI-powered Multi-INT Intelligence Analysis:** Leverages OpenAI's gpt-4o for comprehensive analysis covering SIGINT, GEOINT, MASINT, OSINT, and COMINT, including OUI/MAC cross-referencing, OSINT enrichment, behavioral pattern analysis, and threat assessment.
- **SIGINT Node Report:** Comprehensive intelligence dossier for each detected node.
- **UI/UX:** Dark cyberpunk-themed interface with cyan primary color, purple accents, and JetBrains Mono font. Responsive design with multi-monitor support.
- **Terminology:** "Nodes" refers to detected signals/devices, "Sensors" to collection hardware.
- **Backend Validation:** Zod schemas are used for input validation on POST routes (e.g., `createDeviceSchema`, `createObservationSchema`, `createSensorSchema`).
- **Tier Feature System:** Five-tier system (Free, Basic, Professional, Enterprise, Admin) with per-tier feature gating defined in `shared/tier-features.ts`. Tiers control: max devices/sensors/trusted users, analysis timeout (45s for non-enterprise, unlimited for enterprise/admin), allowed data modes, and feature access (link analysis, AI analysis, triangulation, OSINT, export/import, etc.). Admins can set user tiers in Settings. Backend enforces tier restrictions on analysis and AI endpoints.
- **Frequency Sharing Analysis:** Only applies to SDR signal types. WiFi, Bluetooth, LoRa, Meshtastic, ADS-B, and RFID frequency matches are excluded since they use standard bands.
- **Data Mode Persistence:** Data mode selection in Settings saves to user profile via PATCH /api/profile and is validated against tier-allowed modes.

## External Dependencies
- **Database:** PostgreSQL
- **Authentication:** Replit Auth (OpenID Connect)
- **Mapping:** Leaflet, Nominatim (geocoding)
- **AI/ML:** OpenAI (gpt-4o via Replit AI Integrations)
- **System Tools:** nmap, rtl-sdr, rtl-power
- **NPM Packages for Specific Hardware/Protocols:** @meshtastic/core, @meshtastic/transport-http