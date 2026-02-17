interface DecodedSignal {
  type: string;
  modulation: string;
  frequency: number;
  bandwidth: number;
  content: string;
  metadata: Record<string, any>;
  confidence: number;
  timestamp: number;
}

interface DecodeRequest {
  frequency: number;
  modulation: string;
  sampleRate?: number;
  latitude?: number;
  longitude?: number;
}

interface SignalIdentification {
  name: string;
  category: string;
  description: string;
  modulation: string;
  bandwidth: string;
  typicalUse: string;
  legalStatus: string;
  interestLevel: "low" | "medium" | "high" | "critical";
  decoderAvailable: boolean;
  decoderType?: string;
}

const KNOWN_FREQUENCY_ALLOCATIONS: {
  startMHz: number;
  endMHz: number;
  name: string;
  category: string;
  description: string;
  modulation: string;
  bandwidth: string;
  typicalUse: string;
  legalStatus: string;
  interestLevel: "low" | "medium" | "high" | "critical";
  decoderAvailable: boolean;
  decoderType?: string;
}[] = [
  { startMHz: 0.003, endMHz: 0.03, name: "VLF Naval/Submarine Comms", category: "Military", description: "Very Low Frequency communications used by navies for submarine contact", modulation: "MSK/FSK", bandwidth: "100-200 Hz", typicalUse: "Submarine communications, navigation", legalStatus: "Government/Military", interestLevel: "critical", decoderAvailable: true, decoderType: "cw" },
  { startMHz: 137.0, endMHz: 137.8, name: "NOAA Weather Satellite (APT)", category: "Satellite", description: "NOAA polar-orbiting weather satellites transmit Automatic Picture Transmission imagery", modulation: "APT (AM subcarrier)", bandwidth: "34 kHz", typicalUse: "Weather imagery from NOAA-15, 18, 19", legalStatus: "Open/Public", interestLevel: "high", decoderAvailable: true, decoderType: "apt" },
  { startMHz: 137.5, endMHz: 138.0, name: "Meteor-M2 LRPT", category: "Satellite", description: "Russian Meteor-M2 weather satellite LRPT digital imagery", modulation: "QPSK", bandwidth: "120 kHz", typicalUse: "High-res weather imagery", legalStatus: "Open/Public", interestLevel: "high", decoderAvailable: true, decoderType: "lrpt" },
  { startMHz: 145.0, endMHz: 146.0, name: "ISS SSTV / APRS", category: "Space", description: "International Space Station transmits SSTV images and APRS packets on 2m amateur band", modulation: "FM (SSTV/APRS)", bandwidth: "12-15 kHz", typicalUse: "ISS amateur radio, SSTV events, APRS digipeater", legalStatus: "Amateur Radio", interestLevel: "high", decoderAvailable: true, decoderType: "sstv" },
  { startMHz: 144.0, endMHz: 148.0, name: "2m Amateur Band", category: "Amateur Radio", description: "VHF amateur radio band, heavily used for local FM voice, digital modes, satellite uplinks", modulation: "FM/SSB/Digital", bandwidth: "12-15 kHz", typicalUse: "Ham radio voice, APRS, satellite", legalStatus: "Amateur Licensed", interestLevel: "medium", decoderAvailable: true, decoderType: "fm" },
  { startMHz: 144.39, endMHz: 144.39, name: "APRS Data (144.390 US)", category: "Digital", description: "Automatic Packet Reporting System - position/telemetry digital network", modulation: "AFSK 1200 baud", bandwidth: "12 kHz", typicalUse: "Position tracking, weather stations, telemetry", legalStatus: "Amateur Licensed", interestLevel: "high", decoderAvailable: true, decoderType: "aprs" },
  { startMHz: 162.0, endMHz: 163.0, name: "NOAA Weather Radio", category: "Weather", description: "NWR continuous weather broadcasts from local NOAA stations", modulation: "NFM", bandwidth: "10 kHz", typicalUse: "Weather alerts, forecasts", legalStatus: "Public", interestLevel: "low", decoderAvailable: true, decoderType: "fm" },
  { startMHz: 406.0, endMHz: 406.1, name: "EPIRB/PLB Distress", category: "Emergency", description: "Emergency Position Indicating Radio Beacons and Personal Locator Beacons", modulation: "Digital burst", bandwidth: "3 kHz", typicalUse: "Maritime/aviation emergency", legalStatus: "Emergency Use Only", interestLevel: "critical", decoderAvailable: false },
  { startMHz: 420.0, endMHz: 450.0, name: "70cm Amateur / ISS", category: "Amateur Radio", description: "UHF amateur band including ISS downlink (437.800 MHz)", modulation: "FM/SSB/AX.25", bandwidth: "12-25 kHz", typicalUse: "Ham radio, satellites, ISS voice", legalStatus: "Amateur Licensed", interestLevel: "medium", decoderAvailable: true, decoderType: "fm" },
  { startMHz: 87.5, endMHz: 108, name: "FM Broadcast", category: "Broadcast", description: "Commercial FM radio stations with stereo audio", modulation: "WFM (stereo)", bandwidth: "200 kHz", typicalUse: "Music, news, talk radio", legalStatus: "Public", interestLevel: "low", decoderAvailable: true, decoderType: "wfm" },
  { startMHz: 108, endMHz: 118, name: "VOR/ILS Navigation", category: "Aviation", description: "VHF Omnidirectional Range and Instrument Landing System", modulation: "AM/VOR", bandwidth: "50 kHz", typicalUse: "Aircraft navigation aids", legalStatus: "Aviation", interestLevel: "medium", decoderAvailable: true, decoderType: "am" },
  { startMHz: 118, endMHz: 137, name: "Aircraft Voice", category: "Aviation", description: "Air Traffic Control and pilot communications", modulation: "AM", bandwidth: "25 kHz", typicalUse: "ATC, pilot comms, ATIS, VOLMET", legalStatus: "Receive-only legal", interestLevel: "high", decoderAvailable: true, decoderType: "am" },
  { startMHz: 156, endMHz: 162, name: "Marine VHF", category: "Maritime", description: "Ship-to-shore and ship-to-ship marine communications", modulation: "NFM", bandwidth: "25 kHz", typicalUse: "Marine voice, DSC distress", legalStatus: "Receive-only legal", interestLevel: "medium", decoderAvailable: true, decoderType: "fm" },
  { startMHz: 161.975, endMHz: 162.025, name: "AIS Marine Tracking", category: "Maritime", description: "Automatic Identification System for ship position/identity", modulation: "GMSK 9600 baud", bandwidth: "25 kHz", typicalUse: "Ship tracking and collision avoidance", legalStatus: "Open", interestLevel: "high", decoderAvailable: true, decoderType: "ais" },
  { startMHz: 225, endMHz: 400, name: "Military UHF Air", category: "Military", description: "Military aviation communications band", modulation: "AM/FM/HAVE QUICK", bandwidth: "25 kHz", typicalUse: "Military aircraft, SATCOM", legalStatus: "Government/Military", interestLevel: "critical", decoderAvailable: true, decoderType: "am" },
  { startMHz: 400, endMHz: 406, name: "Military Satellite", category: "Military", description: "UHF military satellite communications (UFO/MUOS)", modulation: "Various digital", bandwidth: "25 kHz", typicalUse: "Military SATCOM downlinks", legalStatus: "Government/Military", interestLevel: "critical", decoderAvailable: false },
  { startMHz: 433, endMHz: 434.8, name: "ISM 433 MHz", category: "ISM", description: "Industrial, Scientific, Medical band - used by IoT, weather stations, key fobs", modulation: "OOK/FSK/LoRa", bandwidth: "200 kHz", typicalUse: "IoT sensors, weather stations, car key fobs, LoRa", legalStatus: "License-free", interestLevel: "medium", decoderAvailable: true, decoderType: "fsk" },
  { startMHz: 462, endMHz: 467, name: "GMRS/FRS", category: "Land Mobile", description: "General Mobile Radio Service channels", modulation: "NFM", bandwidth: "12.5 kHz", typicalUse: "Personal/family communications", legalStatus: "License-free/Licensed", interestLevel: "low", decoderAvailable: true, decoderType: "fm" },
  { startMHz: 824, endMHz: 849, name: "Cellular 800 MHz", category: "Cellular", description: "Cellular telephone uplink band (LTE Band 5/26)", modulation: "LTE OFDMA", bandwidth: "10-20 MHz", typicalUse: "Mobile phones", legalStatus: "Licensed carrier", interestLevel: "low", decoderAvailable: false },
  { startMHz: 869, endMHz: 894, name: "Cellular 800 Downlink", category: "Cellular", description: "Cellular telephone downlink band", modulation: "LTE OFDMA", bandwidth: "10-20 MHz", typicalUse: "Cell tower to phone", legalStatus: "Licensed carrier", interestLevel: "low", decoderAvailable: false },
  { startMHz: 902, endMHz: 928, name: "ISM 900 MHz / LoRa", category: "ISM", description: "ISM band used for LoRa, Meshtastic, smart meters, RFID", modulation: "LoRa CSS/FSK", bandwidth: "125-500 kHz", typicalUse: "LoRa networks, Meshtastic, smart meters", legalStatus: "License-free", interestLevel: "high", decoderAvailable: true, decoderType: "lora" },
  { startMHz: 1030, endMHz: 1030.1, name: "Mode S Interrogator", category: "Aviation", description: "Secondary Surveillance Radar interrogation frequency", modulation: "Pulse", bandwidth: "1 MHz", typicalUse: "ATC radar interrogation", legalStatus: "Aviation", interestLevel: "medium", decoderAvailable: false },
  { startMHz: 1090, endMHz: 1090.1, name: "ADS-B Aircraft", category: "Aviation", description: "Automatic Dependent Surveillance-Broadcast - aircraft position/ID/altitude", modulation: "PPM 1 Mbps", bandwidth: "1 MHz", typicalUse: "Aircraft tracking worldwide", legalStatus: "Open/Public", interestLevel: "high", decoderAvailable: true, decoderType: "adsb" },
  { startMHz: 1176.45, endMHz: 1176.45, name: "GPS L5", category: "Navigation", description: "GPS L5 civil safety-of-life signal", modulation: "BPSK", bandwidth: "24 MHz", typicalUse: "Precision GPS for aviation", legalStatus: "Open", interestLevel: "low", decoderAvailable: false },
  { startMHz: 1227.6, endMHz: 1227.6, name: "GPS L2", category: "Navigation", description: "GPS L2 military/civilian signal", modulation: "BPSK", bandwidth: "20 MHz", typicalUse: "Dual-frequency GPS", legalStatus: "Open", interestLevel: "low", decoderAvailable: false },
  { startMHz: 1544, endMHz: 1545, name: "NOAA HRPT", category: "Satellite", description: "High Resolution Picture Transmission from NOAA POES satellites", modulation: "BPSK", bandwidth: "3 MHz", typicalUse: "Full-resolution weather imagery", legalStatus: "Open", interestLevel: "high", decoderAvailable: true, decoderType: "hrpt" },
  { startMHz: 1575.42, endMHz: 1575.42, name: "GPS L1", category: "Navigation", description: "Primary GPS civil signal", modulation: "BPSK/MBOC", bandwidth: "24 MHz", typicalUse: "GPS positioning worldwide", legalStatus: "Open", interestLevel: "low", decoderAvailable: false },
  { startMHz: 1691, endMHz: 1694, name: "GOES HRIT/EMWIN", category: "Satellite", description: "GOES geostationary weather satellite data relay", modulation: "BPSK", bandwidth: "2.1 MHz", typicalUse: "Full-disk weather imagery, emergency weather", legalStatus: "Open", interestLevel: "high", decoderAvailable: true, decoderType: "goes" },
  { startMHz: 2400, endMHz: 2483.5, name: "ISM 2.4 GHz / WiFi", category: "ISM", description: "WiFi (802.11b/g/n), Bluetooth, ZigBee, microwave ovens", modulation: "OFDM/GFSK/DSSS", bandwidth: "20-40 MHz", typicalUse: "WiFi, Bluetooth, IoT, drones", legalStatus: "License-free", interestLevel: "medium", decoderAvailable: false },
  { startMHz: 5725, endMHz: 5850, name: "5 GHz WiFi / Drone", category: "ISM", description: "WiFi 5 GHz band, drone video downlinks, ISM applications", modulation: "OFDM", bandwidth: "20-160 MHz", typicalUse: "WiFi 5/6, drone video, radar", legalStatus: "License-free", interestLevel: "medium", decoderAvailable: false },
];

const DIGITAL_MODES = [
  { name: "CW (Morse Code)", modulation: "CW", bandwidth: "50-150 Hz", description: "Continuous Wave telegraphy using International Morse Code. Oldest digital mode, extremely narrowband and can be decoded at very weak signal levels.", decoderType: "cw" },
  { name: "RTTY", modulation: "FSK", bandwidth: "170-850 Hz", description: "Radio Teletype using frequency shift keying. Used for weather bulletins (NAVTEX), press services, and amateur radio.", decoderType: "rtty" },
  { name: "PSK31", modulation: "BPSK/QPSK", bandwidth: "31 Hz", description: "Phase Shift Keying at 31.25 baud. Keyboard-to-keyboard QSO mode popular on HF amateur bands. Extremely narrowband.", decoderType: "psk" },
  { name: "FT8", modulation: "8-GFSK", bandwidth: "50 Hz", description: "Franke-Taylor 8-tone mode for weak-signal amateur contacts. 15-second transmissions, highly automated. Dominant HF digital mode.", decoderType: "ft8" },
  { name: "FT4", modulation: "4-GFSK", bandwidth: "83 Hz", description: "Faster version of FT8 with 7.5-second transmissions. Used for contests and rapid contacts.", decoderType: "ft4" },
  { name: "WSPR", modulation: "4-FSK", bandwidth: "6 Hz", description: "Weak Signal Propagation Reporter. Ultra-low-power beacon mode for testing propagation paths. 2-minute transmissions.", decoderType: "wspr" },
  { name: "APRS", modulation: "AFSK 1200", bandwidth: "12 kHz", description: "Automatic Packet Reporting System using AX.25 protocol. Position reports, weather data, telemetry, messages.", decoderType: "aprs" },
  { name: "AX.25 Packet", modulation: "AFSK/G3RUH", bandwidth: "12-25 kHz", description: "Amateur X.25 packet radio protocol. Foundation of APRS and amateur packet networks.", decoderType: "ax25" },
  { name: "POCSAG Pager", modulation: "FSK", bandwidth: "12.5 kHz", description: "Post Office Code Standardisation Advisory Group paging protocol. Still used by hospitals and emergency services.", decoderType: "pocsag" },
  { name: "FLEX Pager", modulation: "4-FSK", bandwidth: "12.5 kHz", description: "Motorola FLEX paging protocol. Higher speed successor to POCSAG.", decoderType: "flex" },
  { name: "DMR", modulation: "4FSK", bandwidth: "12.5 kHz", description: "Digital Mobile Radio. TDMA digital voice/data used by amateur and commercial radio.", decoderType: "dmr" },
  { name: "P25", modulation: "C4FM/CQPSK", bandwidth: "12.5 kHz", description: "Project 25 digital voice for public safety (police, fire, EMS).", decoderType: "p25" },
  { name: "SSTV", modulation: "Analog tones", bandwidth: "2.5 kHz", description: "Slow Scan Television. Transmits still images via audio tones. Used by ISS for special events.", decoderType: "sstv" },
  { name: "NOAA APT", modulation: "AM subcarrier", bandwidth: "34 kHz", description: "Automatic Picture Transmission from NOAA weather satellites. Produces visible/IR weather imagery.", decoderType: "apt" },
  { name: "Meteor LRPT", modulation: "QPSK", bandwidth: "120 kHz", description: "Low Rate Picture Transmission from Russian Meteor-M2 satellites. Higher resolution than APT.", decoderType: "lrpt" },
  { name: "ADS-B", modulation: "PPM", bandwidth: "1 MHz", description: "Automatic Dependent Surveillance-Broadcast from aircraft at 1090 MHz. Aircraft ID, position, altitude, speed.", decoderType: "adsb" },
  { name: "AIS", modulation: "GMSK", bandwidth: "25 kHz", description: "Automatic Identification System for ships. Position, identity, course, speed of vessels.", decoderType: "ais" },
  { name: "LoRa", modulation: "CSS", bandwidth: "125-500 kHz", description: "Long Range chirp spread spectrum modulation. Used by LoRaWAN IoT networks and Meshtastic mesh networking.", decoderType: "lora" },
  { name: "ACARS", modulation: "MSK", bandwidth: "2.4 kHz", description: "Aircraft Communications Addressing and Reporting System. Short text messages between aircraft and ground.", decoderType: "acars" },
  { name: "NAVTEX", modulation: "FSK (SITOR-B)", bandwidth: "340 Hz", description: "Maritime text broadcast system for weather, navigation warnings, and search/rescue info on 518 kHz and 490 kHz.", decoderType: "navtex" },
];

function generateSimulatedDecode(decoderType: string, frequency: number): DecodedSignal {
  const timestamp = Date.now();

  switch (decoderType) {
    case "apt": {
      const channels = ["Visible (Channel 1)", "Near-IR (Channel 2)", "Thermal IR (Channel 3A)", "Thermal IR (Channel 4)"];
      const satellites = ["NOAA-15", "NOAA-18", "NOAA-19"];
      return {
        type: "NOAA APT Weather Image",
        modulation: "AM Subcarrier 2400 Hz",
        frequency,
        bandwidth: 34000,
        content: `Decoding APT image from ${satellites[Math.floor(Math.random() * satellites.length)]}...\nPass direction: ${Math.random() > 0.5 ? "Northbound" : "Southbound"}\nChannels: ${channels[Math.floor(Math.random() * channels.length)]} + ${channels[Math.floor(Math.random() * channels.length)]}\nImage width: 2080 pixels\nLine rate: 2 lines/sec\nSync detected: Frame A + Frame B\nTelemetry wedges: 16 calibration steps decoded\nSNR: ${(15 + Math.random() * 20).toFixed(1)} dB\nElevation: ${(10 + Math.random() * 70).toFixed(0)} degrees\nSignal quality: ${Math.random() > 0.5 ? "Good" : "Excellent"}`,
        metadata: { satellite: satellites[Math.floor(Math.random() * satellites.length)], imageType: "APT", resolution: "4km/pixel" },
        confidence: 0.85 + Math.random() * 0.15,
        timestamp,
      };
    }
    case "sstv": {
      const modes = ["Martin M1", "Martin M2", "Scottie S1", "Scottie S2", "Robot 36", "PD120", "PD180"];
      const sources = ["ISS (RS0ISS)", "Amateur station", "ISS crew"];
      return {
        type: "SSTV Image",
        modulation: "Analog FM audio tones",
        frequency,
        bandwidth: 2500,
        content: `SSTV image detected!\nMode: ${modes[Math.floor(Math.random() * modes.length)]}\nSource: ${sources[Math.floor(Math.random() * sources.length)]}\nVIS code: 0x${Math.floor(Math.random() * 255).toString(16).padStart(2, "0")}\nImage: 320x256 pixels\nTransmission time: ${(90 + Math.floor(Math.random() * 120))} seconds\nColor mode: RGB\nSync: 1200 Hz header detected\nContent: Commemorative event image from space\nSNR: ${(8 + Math.random() * 15).toFixed(1)} dB`,
        metadata: { mode: modes[Math.floor(Math.random() * modes.length)], resolution: "320x256" },
        confidence: 0.75 + Math.random() * 0.2,
        timestamp,
      };
    }
    case "aprs": {
      const callsigns = ["W1ABC-9", "KE5XX-7", "N3LLO-1", "VE3RSA-12", "K4HTA-5"];
      const types = ["Position", "Weather", "Message", "Telemetry", "Status"];
      const call = callsigns[Math.floor(Math.random() * callsigns.length)];
      const type = types[Math.floor(Math.random() * types.length)];
      return {
        type: "APRS Packet",
        modulation: "AFSK 1200 baud",
        frequency,
        bandwidth: 12000,
        content: `APRS Packet Decoded:\nFrom: ${call}\nType: ${type} Report\n${type === "Position" ? `Lat: ${(30 + Math.random() * 20).toFixed(4)}N\nLon: ${(80 + Math.random() * 40).toFixed(4)}W\nAlt: ${Math.floor(Math.random() * 3000)} ft\nSpeed: ${Math.floor(Math.random() * 65)} mph\nCourse: ${Math.floor(Math.random() * 360)} deg\nSymbol: Car` : type === "Weather" ? `Temp: ${Math.floor(50 + Math.random() * 50)}F\nHumidity: ${Math.floor(30 + Math.random() * 60)}%\nWind: ${Math.floor(Math.random() * 30)} mph @ ${Math.floor(Math.random() * 360)} deg\nBarometer: ${(29.5 + Math.random() * 1.5).toFixed(2)} inHg\nRain: ${(Math.random() * 0.5).toFixed(2)} in/hr` : `Message: ${["QRV on 146.52", "Net check-in", "Emergency traffic none", "APRS testing"][Math.floor(Math.random() * 4)]}`}\nPath: WIDE1-1,WIDE2-1\nDigipeaters: ${Math.floor(1 + Math.random() * 3)}`,
        metadata: { callsign: call, packetType: type },
        confidence: 0.9 + Math.random() * 0.1,
        timestamp,
      };
    }
    case "adsb": {
      const airlines = ["UAL", "AAL", "DAL", "SWA", "JBU", "FFT", "SKW"];
      const flights = airlines[Math.floor(Math.random() * airlines.length)] + Math.floor(100 + Math.random() * 9000);
      const icao = Math.floor(Math.random() * 16777215).toString(16).toUpperCase().padStart(6, "0");
      return {
        type: "ADS-B Aircraft",
        modulation: "PPM 1 Mbps",
        frequency: 1090000000,
        bandwidth: 1000000,
        content: `ADS-B Message Decoded:\nICAO: ${icao}\nFlight: ${flights}\nAltitude: ${Math.floor(5000 + Math.random() * 40000)} ft\nGround Speed: ${Math.floor(150 + Math.random() * 400)} kts\nTrack: ${Math.floor(Math.random() * 360)} deg\nVertical Rate: ${Math.floor(-1500 + Math.random() * 3000)} ft/min\nSquawk: ${Math.floor(1000 + Math.random() * 7000)}\nLat: ${(25 + Math.random() * 25).toFixed(4)}N\nLon: ${(70 + Math.random() * 50).toFixed(4)}W\nCategory: A${Math.floor(1 + Math.random() * 5)}\nNIC: ${Math.floor(5 + Math.random() * 4)}\nNACp: ${Math.floor(7 + Math.random() * 4)}\nEmitter: Large airplane`,
        metadata: { icao, flight: flights, type: "ADS-B" },
        confidence: 0.95 + Math.random() * 0.05,
        timestamp,
      };
    }
    case "cw": {
      const messages = [
        "CQ CQ CQ DE W1AW W1AW K",
        "VVV DE NDB .- -... -.-. -.-",
        "QTH NEWINGTON CT RST 599 599",
        "73 DE K3LR SK",
        "SOS SOS SOS DE MAYDAY",
      ];
      return {
        type: "Morse Code (CW)",
        modulation: "CW (On-Off Keying)",
        frequency,
        bandwidth: 100,
        content: `Morse Code Decoded:\n${messages[Math.floor(Math.random() * messages.length)]}\nWPM: ${Math.floor(12 + Math.random() * 25)}\nTone: ${Math.floor(500 + Math.random() * 500)} Hz\nSNR: ${(5 + Math.random() * 20).toFixed(1)} dB`,
        metadata: { wpm: Math.floor(12 + Math.random() * 25), mode: "CW" },
        confidence: 0.7 + Math.random() * 0.25,
        timestamp,
      };
    }
    case "fm": {
      return {
        type: "FM Voice",
        modulation: "Narrowband FM",
        frequency,
        bandwidth: 12500,
        content: `FM Audio Demodulated:\nDeviation: ${(2.5 + Math.random() * 2.5).toFixed(1)} kHz\nCTCSS Tone: ${[67.0, 71.9, 77.0, 82.5, 88.5, 91.5, 100.0, 103.5, 107.2, 110.9, 114.8, 123.0, 127.3, 131.8, 136.5, 141.3, 146.2, 151.4, 156.7, 162.2, 167.9, 173.8, 179.9, 186.2, 192.8, 203.5, 210.7, 218.1, 225.7, 233.6, 241.8, 250.3][Math.floor(Math.random() * 32)].toFixed(1)} Hz\nSquelch: Open\nAudio level: ${(-20 + Math.random() * 20).toFixed(0)} dB\nModulation quality: ${Math.random() > 0.5 ? "Good" : "Fair"}`,
        metadata: { deviation: 5.0, mode: "NFM" },
        confidence: 0.85 + Math.random() * 0.15,
        timestamp,
      };
    }
    case "wfm": {
      const stations = ["WHTZ 100.3 Z100", "WBLS 107.5", "WCBS 101.1", "WQHT 97.1 HOT97", "WKTU 103.5"];
      return {
        type: "Wideband FM Broadcast",
        modulation: "Stereo WFM",
        frequency,
        bandwidth: 200000,
        content: `FM Broadcast Decoded:\nStation: ${stations[Math.floor(Math.random() * stations.length)]}\nStereo: ${Math.random() > 0.3 ? "Yes (19 kHz pilot detected)" : "Mono"}\nRDS: ${Math.random() > 0.5 ? "PI: " + Math.floor(Math.random() * 65535).toString(16).toUpperCase() + " PS: STATION" : "Not detected"}\nAudio: Stereo 15 kHz bandwidth\nSNR: ${(25 + Math.random() * 30).toFixed(1)} dB\nMultipath: ${Math.random() > 0.7 ? "Moderate" : "Low"}`,
        metadata: { stereo: true, mode: "WFM" },
        confidence: 0.9 + Math.random() * 0.1,
        timestamp,
      };
    }
    case "am": {
      return {
        type: "AM Voice",
        modulation: "Amplitude Modulation",
        frequency,
        bandwidth: 8000,
        content: `AM Audio Demodulated:\nCarrier: ${(frequency / 1e6).toFixed(3)} MHz\nModulation depth: ${(40 + Math.random() * 50).toFixed(0)}%\nAudio bandwidth: ${(3 + Math.random() * 5).toFixed(1)} kHz\nSNR: ${(10 + Math.random() * 25).toFixed(1)} dB\nCarrier level: ${(-30 + Math.random() * 30).toFixed(0)} dBm\n${frequency > 118e6 && frequency < 137e6 ? "Aviation band detected - ATC communications likely" : "Standard AM audio"}`,
        metadata: { mode: "AM" },
        confidence: 0.8 + Math.random() * 0.15,
        timestamp,
      };
    }
    case "ssb": {
      return {
        type: "SSB Voice",
        modulation: frequency > 10e6 ? "USB" : "LSB",
        frequency,
        bandwidth: 2700,
        content: `SSB Audio Demodulated:\nSideband: ${frequency > 10e6 ? "Upper (USB)" : "Lower (LSB)"}\nBandwidth: 2.7 kHz\nAudio quality: ${Math.random() > 0.5 ? "Clear" : "Noisy with QSB fading"}\nAGC: Active\nSNR: ${(5 + Math.random() * 20).toFixed(1)} dB\nFrequency stability: ${Math.random() > 0.5 ? "Good" : "Slight drift detected"}`,
        metadata: { mode: frequency > 10e6 ? "USB" : "LSB" },
        confidence: 0.75 + Math.random() * 0.2,
        timestamp,
      };
    }
    case "psk": {
      const messages = [
        "CQ CQ CQ DE N1MM N1MM K",
        "DE K3LR K3LR BTU",
        "RST 599 599 QTH PA PA",
        "TNX FER QSO 73 DE W1AW",
      ];
      return {
        type: "PSK31 Digital Text",
        modulation: "BPSK-31",
        frequency,
        bandwidth: 31,
        content: `PSK31 Decoded Text:\n"${messages[Math.floor(Math.random() * messages.length)]}"\nBaud rate: 31.25\nIMD: ${(-20 - Math.random() * 15).toFixed(0)} dB\nPhase quality: ${(80 + Math.random() * 19).toFixed(0)}%\nSNR: ${(5 + Math.random() * 15).toFixed(1)} dB\nFrequency offset: ${(-10 + Math.random() * 20).toFixed(0)} Hz`,
        metadata: { mode: "PSK31", baud: 31.25 },
        confidence: 0.8 + Math.random() * 0.15,
        timestamp,
      };
    }
    case "rtty": {
      return {
        type: "RTTY Teletype",
        modulation: "FSK (170 Hz shift)",
        frequency,
        bandwidth: 250,
        content: `RTTY Decoded:\nShift: 170 Hz\nBaud: 45.45\nBits: 5 (Baudot/ITA2)\nText: "RYRYRY CQ CQ DE ${["W1AW", "DL1ABC", "VK2XYZ"][Math.floor(Math.random() * 3)]} TEST"\nMark freq: ${(frequency / 1e6).toFixed(3)} MHz\nSpace freq: ${((frequency - 170) / 1e6).toFixed(3)} MHz\nSNR: ${(8 + Math.random() * 15).toFixed(1)} dB`,
        metadata: { mode: "RTTY", shift: 170, baud: 45.45 },
        confidence: 0.8 + Math.random() * 0.15,
        timestamp,
      };
    }
    case "ft8": {
      const calls = ["W1ABC", "KE5XX", "N3LLO", "VE3RSA", "JA1XYZ", "G4ABC", "VK2DEF"];
      const grids = ["FN31", "EM48", "CM87", "JO32", "PM95", "QF56"];
      const c1 = calls[Math.floor(Math.random() * calls.length)];
      const c2 = calls[Math.floor(Math.random() * calls.length)];
      return {
        type: "FT8 Digital",
        modulation: "8-GFSK",
        frequency,
        bandwidth: 50,
        content: `FT8 Messages Decoded:\n${[
          `CQ ${c1} ${grids[Math.floor(Math.random() * grids.length)]}`,
          `${c1} ${c2} ${(-5 + Math.floor(Math.random() * 30)).toString().padStart(3, " ")}`,
          `${c2} ${c1} R${(-5 + Math.floor(Math.random() * 30)).toString().padStart(3, " ")}`,
          `${c1} ${c2} RR73`,
          `${c2} ${c1} 73`,
        ].join("\n")}\nPeriod: 15 seconds\nSync: Costas array detected\nDT: ${(-0.5 + Math.random()).toFixed(1)}s\nDF: ${Math.floor(-100 + Math.random() * 200)} Hz\nSNR: ${(-15 + Math.floor(Math.random() * 30))} dB`,
        metadata: { mode: "FT8", period: 15 },
        confidence: 0.9 + Math.random() * 0.1,
        timestamp,
      };
    }
    case "ais": {
      const mmsi = Math.floor(200000000 + Math.random() * 600000000).toString();
      const ships = ["EVER GIVEN", "MAERSK ALABAMA", "SS BOTANY BAY", "MV HORIZON", "FISHING VESSEL ALPHA"];
      return {
        type: "AIS Ship Data",
        modulation: "GMSK 9600 baud",
        frequency: 161975000,
        bandwidth: 25000,
        content: `AIS Message Decoded:\nMMSI: ${mmsi}\nName: ${ships[Math.floor(Math.random() * ships.length)]}\nType: ${["Cargo", "Tanker", "Passenger", "Fishing", "Tug"][Math.floor(Math.random() * 5)]}\nLat: ${(25 + Math.random() * 25).toFixed(4)}N\nLon: ${(65 + Math.random() * 55).toFixed(4)}W\nSOG: ${(1 + Math.random() * 20).toFixed(1)} kts\nCOG: ${Math.floor(Math.random() * 360)} deg\nHeading: ${Math.floor(Math.random() * 360)} deg\nNavStatus: ${["Under way", "At anchor", "Moored", "Fishing"][Math.floor(Math.random() * 4)]}\nDest: ${["NEW YORK", "ROTTERDAM", "SINGAPORE", "HOUSTON", "SHANGHAI"][Math.floor(Math.random() * 5)]}`,
        metadata: { mmsi, type: "AIS" },
        confidence: 0.95 + Math.random() * 0.05,
        timestamp,
      };
    }
    case "lora": {
      return {
        type: "LoRa Packet",
        modulation: "CSS (Chirp Spread Spectrum)",
        frequency,
        bandwidth: 125000,
        content: `LoRa Packet Decoded:\nSF: ${[7, 8, 9, 10, 11, 12][Math.floor(Math.random() * 6)]}\nBW: 125 kHz\nCR: 4/${4 + Math.floor(Math.random() * 4)}\nPreamble: 8 symbols\nPayload: ${Math.floor(10 + Math.random() * 50)} bytes\nCRC: ${Math.random() > 0.1 ? "Valid" : "Error"}\nRSSI: ${-120 + Math.floor(Math.random() * 60)} dBm\nSNR: ${(-10 + Math.random() * 20).toFixed(1)} dB\n${Math.random() > 0.5 ? "Meshtastic mesh packet detected\nNode ID: !"+Math.floor(Math.random()*0xffffffff).toString(16) : "LoRaWAN uplink - DevAddr: "+Math.floor(Math.random()*0xffffffff).toString(16).padStart(8,"0")}`,
        metadata: { mode: "LoRa" },
        confidence: 0.85 + Math.random() * 0.15,
        timestamp,
      };
    }
    case "pocsag": {
      return {
        type: "POCSAG Pager",
        modulation: "FSK",
        frequency,
        bandwidth: 12500,
        content: `POCSAG Message Decoded:\nRate: ${[512, 1200, 2400][Math.floor(Math.random() * 3)]} baud\nAddress: ${Math.floor(Math.random() * 2097151)}\nFunction: ${Math.floor(Math.random() * 4)}\nType: ${Math.random() > 0.5 ? "Alphanumeric" : "Numeric"}\nMessage: "${Math.random() > 0.5 ? "RESPOND CODE 3 - 123 MAIN ST" : Math.floor(1000000 + Math.random() * 9000000).toString()}"`,
        metadata: { mode: "POCSAG" },
        confidence: 0.85 + Math.random() * 0.15,
        timestamp,
      };
    }
    case "acars": {
      const airlines2 = ["UA", "AA", "DL", "BA", "LH", "AF"];
      return {
        type: "ACARS Message",
        modulation: "MSK 2400 baud",
        frequency,
        bandwidth: 2400,
        content: `ACARS Message Decoded:\nMode: ${["2", "H", "Q"][Math.floor(Math.random() * 3)]}\nRegistration: N${Math.floor(100 + Math.random() * 900)}${["UA", "AA", "DL"][Math.floor(Math.random() * 3)]}\nFlight: ${airlines2[Math.floor(Math.random() * airlines2.length)]}${Math.floor(100 + Math.random() * 900)}\nLabel: ${["H1", "SA", "Q0", "5Z", "B6"][Math.floor(Math.random() * 5)]}\nBlock: ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}\nMessage: "${["POSRPT", "OOOI", "WXRQ", "FREETEXT", "METAR"][Math.floor(Math.random() * 5)]}"`,
        metadata: { mode: "ACARS" },
        confidence: 0.9 + Math.random() * 0.1,
        timestamp,
      };
    }
    default: {
      return {
        type: "Unknown Signal",
        modulation: "Unknown",
        frequency,
        bandwidth: 10000,
        content: `Signal detected at ${(frequency / 1e6).toFixed(3)} MHz\nModulation: Unidentified\nBandwidth: ~${(10 + Math.random() * 50).toFixed(0)} kHz\nPower: ${(-80 + Math.random() * 40).toFixed(0)} dBm\nDuration: ${(0.1 + Math.random() * 5).toFixed(1)} seconds\nAnalysis required for identification.`,
        metadata: {},
        confidence: 0.3 + Math.random() * 0.3,
        timestamp,
      };
    }
  }
}

function identifyByFrequency(frequencyMHz: number): SignalIdentification[] {
  const results: SignalIdentification[] = [];

  for (const alloc of KNOWN_FREQUENCY_ALLOCATIONS) {
    if (frequencyMHz >= alloc.startMHz && frequencyMHz <= alloc.endMHz) {
      results.push({
        name: alloc.name,
        category: alloc.category,
        description: alloc.description,
        modulation: alloc.modulation,
        bandwidth: alloc.bandwidth,
        typicalUse: alloc.typicalUse,
        legalStatus: alloc.legalStatus,
        interestLevel: alloc.interestLevel,
        decoderAvailable: alloc.decoderAvailable,
        decoderType: alloc.decoderType,
      });
    }
  }

  return results;
}

function identifyByLocation(frequencyMHz: number, latitude: number, longitude: number): string[] {
  const tips: string[] = [];

  const isNorthAmerica = latitude > 24 && latitude < 72 && longitude > -170 && longitude < -50;
  const isEurope = latitude > 35 && latitude < 72 && longitude > -10 && longitude < 40;
  const isCoastal = Math.abs(latitude) < 60;

  if (frequencyMHz >= 0.144 && frequencyMHz <= 0.148) {
    tips.push(isNorthAmerica ? "APRS on 144.390 MHz is the US standard" : isEurope ? "APRS on 144.800 MHz is the European standard" : "Check local APRS frequency for your region");
  }

  if (frequencyMHz >= 87.5 && frequencyMHz <= 108) {
    if (isNorthAmerica) tips.push("US FM broadcast band, stations at 200 kHz spacing (even channels only)");
    else if (isEurope) tips.push("European FM broadcast, stations at 100 kHz spacing");
  }

  if (frequencyMHz >= 118 && frequencyMHz <= 137) {
    tips.push("Monitor local airport ATIS/CTAF frequencies for your nearest airfield");
    if (isNorthAmerica) tips.push("121.5 MHz is the international aviation emergency frequency");
  }

  if (frequencyMHz >= 156 && frequencyMHz <= 163) {
    if (isCoastal) tips.push("Marine VHF - strongest near coastlines, harbors, and waterways. Ch 16 (156.800) is the distress channel.");
  }

  if (frequencyMHz >= 0.135 && frequencyMHz <= 0.14) {
    tips.push("NOAA satellite passes occur every ~90 minutes. Use a satellite tracker app to predict when NOAA-15/18/19 are overhead.");
    tips.push("A simple V-dipole or QFH antenna optimized for 137 MHz gives best APT image results.");
  }

  if (frequencyMHz >= 0.145 && frequencyMHz <= 0.146) {
    tips.push("ISS passes can be tracked at spotthestation.nasa.gov. ISS SSTV events are announced on ARISS website.");
    tips.push("ISS downlink: 145.800 MHz (voice/SSTV), 145.825 MHz (APRS digipeater)");
  }

  if (frequencyMHz >= 1088 && frequencyMHz <= 1092) {
    tips.push("ADS-B reception range depends on altitude and line of sight. Higher antenna = more aircraft.");
    if (isNorthAmerica) tips.push("ADS-B Out is mandatory for most US aircraft in controlled airspace since 2020.");
  }

  if (frequencyMHz >= 902 && frequencyMHz <= 928) {
    if (isNorthAmerica) tips.push("LoRa/Meshtastic commonly uses 915 MHz in the Americas");
    else tips.push("Check your region's ISM band allocation - EU uses 868 MHz, not 915 MHz");
  }

  return tips;
}

export {
  KNOWN_FREQUENCY_ALLOCATIONS,
  DIGITAL_MODES,
  generateSimulatedDecode,
  identifyByFrequency,
  identifyByLocation,
  type DecodedSignal,
  type DecodeRequest,
  type SignalIdentification,
};
