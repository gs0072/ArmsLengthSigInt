# ArmsLength SigInt - Signal Intelligence Platform

## Overview
ArmsLength SigInt is a signal intelligence platform designed for collecting, analyzing, and triangulating various wireless signals (Bluetooth, WiFi, RFID, SDR, LoRa). It integrates geospatial mapping, multi-user collaboration, and AI-powered device analysis. The platform's primary purpose is to provide comprehensive tools for understanding signal environments and tracking devices, serving search and rescue, law enforcement, military intelligence, and open-source intelligence.

## User Preferences
- Technical/movie-cool aesthetic preferred
- Dark mode by default
- Comprehensive and fun
- Multi-monitor support for higher resolutions
- Meshtastic/Meshcore-style map navigation (no auto-recenter on manual pan)

## System Architecture
The platform utilizes a React + TypeScript frontend with Tailwind CSS, Shadcn UI, Wouter, TanStack Query, Leaflet, and Framer Motion. The backend is an Express.js + TypeScript server with a PostgreSQL database (Drizzle ORM) and Replit Auth.

**Key Architectural Decisions & Features:**
- **Signal Collection:** Configurable hardware sensors (Bluetooth, WiFi, RFID, SDR, LoRa, Meshtastic, ADS-B) for real signal collection, managed via the Dashboard.
- **Device Association (Multi-INT):** Automated analysis links devices using geospatial, signal, and measurement intelligence with statistical outputs.
- **GEOINT Position Fix:** RSSI-weighted multilateration for device triangulation.
- **Multi-User & Data Modes:** Supports "Friends" mode for data sharing, "Combined/All Sources" aggregation, and "OSINT" with curated data sources.
- **Visualizations:** NodeLinkGraph for device associations, Leaflet.heat for signal density.
- **Data Management:** Full export/import with device ID remapping and MAC address deduplication.
- **SIGINT Tools Integration:** Includes nmap, Meshtastic, and SDR tools for specialized analysis.
- **SDR Spectrum Analyzer:** Full-page canvas-based analyzer with real-time spectrum/waterfall, signal detection, and frequency presets. Supports simulation and server-attached RTL-SDR.
- **Native App Capabilities:** Capacitor setup for iOS/Android with direct hardware access (CoreBluetooth, CoreLocation, Core ML) for BLE scanning, GPS, and on-device AI.
- **AI-powered Analysis:** Leverages OpenAI's gpt-4o for Multi-INT intelligence analysis (SIGINT, GEOINT, MASINT, OSINT, COMINT).
- **UI/UX:** Dark cyberpunk theme (cyan, purple, JetBrains Mono font), responsive design.
- **Tier System:** Five-tier feature gating (Free, Basic, Professional, Enterprise, Admin) controlled by backend.
- **Search & Rescue (SAR) Mode:** Dedicated page for coordinated SAR operations with real-time RSSI-weighted multilateration, probability heatmaps, and team tracking.
- **Drone Detection & Counter-UAS:** Database of drone signatures for identification and awareness of detection methods/frequencies.
- **LoRa Mesh Platform:** Dedicated interface for Meshtastic/Meshcore with live map, messaging, node telemetry, network topology, and full radio configuration.
- **Signal Decoder:** Workbench for decoding 20+ digital and analog signal types, with frequency identification, AI analysis, and reference databases.
- **Linux Scanner Service:** Background service using native Linux tools (hcitool, iwconfig, rtl_power, gpsd) for continuous passive scans and SDR frequency sweeps.
- **SDR Audio Receiver:** Real-time audio demodulation (WFM, NFM, AM, USB, LSB) from SDR signals.
- **Multi-Node Sync:** Supports data push/pull between collection nodes and a central server for distributed triangulation.
- **Deployment:** Designed for cloud (Replit), Linux self-hosted installations, and mobile monitoring via web UI.

## External Dependencies
- **Database:** PostgreSQL
- **Authentication:** Replit Auth (OpenID Connect)
- **Mapping:** Leaflet, Nominatim (geocoding)
- **AI/ML:** OpenAI (gpt-4o via Replit AI Integrations)
- **System Tools:** nmap, rtl-sdr, rtl-power, hcitool, bluetoothctl, iwconfig, gpsd
- **NPM Packages:** @meshtastic/core, @meshtastic/transport-http