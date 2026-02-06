# SIGINT Hub - Signal Intelligence Platform

## Overview
A comprehensive signal intelligence platform for collecting, analyzing, and triangulating Bluetooth, WiFi, RFID, SDR, LoRa, and sensor data with geospatial mapping, multi-user collaboration, and AI-powered device analysis. Designed for search and rescue, law enforcement, military operations, and open-source intelligence hobbyists.

## Current State
- MVP with full CRUD for devices, observations, alerts, and following detection
- Replit Auth with user profiles and tier system
- Dark cyberpunk-themed UI with responsive design
- Interactive world map with device markers via Leaflet
- Device catalog with comprehensive device categories
- Counter-intelligence panel with following detection
- Monitoring & alerts system
- Seed data with realistic signal intelligence scenarios
- AI-powered device analysis (OpenAI gpt-4o via Replit AI Integrations)
- SIGINT Node Report page (/node-report/:id) - comprehensive intelligence dossier per device

## Architecture
- **Frontend**: React + TypeScript, Tailwind CSS, Shadcn UI, Wouter routing, TanStack Query, Leaflet maps, Framer Motion animations
- **Backend**: Express.js + TypeScript, PostgreSQL (Drizzle ORM), Replit Auth (OpenID Connect)
- **Database**: PostgreSQL with tables: users, sessions, devices, observations, alerts, device_catalog, user_profiles, activity_log, following_detection

## Key Design Decisions
- Cyberpunk/tech-movie dark theme with cyan (#00d4ff) primary color and purple accents
- JetBrains Mono as the primary font for technical aesthetic
- Signal types: bluetooth, wifi, rfid, sdr, lora, meshtastic, adsb, sensor
- User tiers: free, basic, professional, enterprise, admin
- Data modes: local, friends, public, osint

## Next Phase Features (Planned)
- AI-powered device analysis (OpenAI integration for node reports)
- OSINT integration for automated internet research
- Native mobile apps (Android/iOS) with hardware interfacing (BLE, Wi-Fi scanning)
- Native desktop apps (macOS) with SDR, LoRa/Meshtastic, RFID support
- Advanced triangulation algorithms across multiple collection points
- Aircraft/drone detection via ADS-B and SDR
- Interrogation detection system
- Digital forensics suite (Autopsy/Sleuth Kit integration)
- Live device forensics capabilities
- Python scripting engine for custom parsers
- Signal decryption toolkit
- Cloud storage integration
- Export/import tools for dataset sharing

## File Structure
- `shared/schema.ts` - All Drizzle models and TypeScript types
- `shared/models/auth.ts` - Replit Auth user/session schemas
- `server/routes.ts` - API endpoints
- `server/storage.ts` - Database storage layer (DatabaseStorage)
- `server/seed.ts` - Sample data seeder
- `server/db.ts` - Database connection
- `server/replit_integrations/auth/` - Authentication module
- `client/src/App.tsx` - Main app with routing and sidebar layout
- `client/src/pages/` - Dashboard, WorldMap, Devices, Search, Monitoring, CounterIntel, Catalog, Settings, Landing, NodeReport
- `client/src/components/` - Reusable components (AppSidebar, MapView, DeviceList, DeviceDetail, DeviceAnalysis, StatsBar, etc.)
- `client/src/lib/signal-utils.ts` - Signal type definitions, utilities, device catalog data

## User Preferences
- Technical/movie-cool aesthetic preferred
- Dark mode by default
- Comprehensive and fun
- Multi-monitor support for higher resolutions
