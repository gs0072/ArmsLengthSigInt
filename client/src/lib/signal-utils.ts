import type { Device, Observation } from "@shared/schema";

export const SIGNAL_TYPES = [
  { value: "bluetooth", label: "Bluetooth", color: "hsl(217, 91%, 60%)" },
  { value: "wifi", label: "Wi-Fi", color: "hsl(142, 76%, 48%)" },
  { value: "rfid", label: "RFID", color: "hsl(45, 90%, 55%)" },
  { value: "sdr", label: "SDR", color: "hsl(280, 65%, 55%)" },
  { value: "lora", label: "LoRa", color: "hsl(25, 85%, 55%)" },
  { value: "meshtastic", label: "Meshtastic", color: "hsl(185, 100%, 50%)" },
  { value: "adsb", label: "ADS-B", color: "hsl(0, 72%, 55%)" },
  { value: "sensor", label: "Sensor", color: "hsl(320, 70%, 55%)" },
  { value: "unknown", label: "Unknown", color: "hsl(200, 20%, 50%)" },
] as const;

export function getSignalColor(type: string): string {
  return SIGNAL_TYPES.find(s => s.value === type)?.color || "hsl(200, 20%, 50%)";
}

export function getSignalLabel(type: string): string {
  return SIGNAL_TYPES.find(s => s.value === type)?.label || "Unknown";
}

export function signalStrengthToPercent(rssi: number | null | undefined): number {
  if (!rssi) return 0;
  const clamped = Math.max(-100, Math.min(-20, rssi));
  return Math.round(((clamped + 100) / 80) * 100);
}

export function signalStrengthLabel(rssi: number | null | undefined): string {
  const pct = signalStrengthToPercent(rssi);
  if (pct >= 75) return "Excellent";
  if (pct >= 50) return "Good";
  if (pct >= 25) return "Fair";
  return "Weak";
}

export interface BroadcastSignature {
  terms: string[];
  signalTypes: string[];
  description: string;
}

export const DEVICE_BROADCAST_SIGNATURES: Record<string, BroadcastSignature> = {
  "Apple iPhone": {
    terms: ["iPhone", "Apple Inc.", "iPhone 15", "iPhone 14", "iPhone 13", "iPhone 12", "iPhone SE", "iPhone 11", "iPhone XR", "iPhone XS", "Apple iPhone", "Apple, Inc."],
    signalTypes: ["bluetooth", "wifi"],
    description: "Apple iPhone smartphones broadcasting via BLE and Wi-Fi"
  },
  "Samsung Galaxy": {
    terms: ["Galaxy", "Samsung", "SM-G", "SM-S", "SM-A", "SM-N", "Galaxy S24", "Galaxy S23", "Galaxy S22", "Galaxy A54", "Galaxy A34", "Galaxy Z Flip", "Galaxy Z Fold", "Galaxy Note", "SAMSUNG"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Samsung Galaxy smartphones across S, A, Z, and Note series"
  },
  "Google Pixel": {
    terms: ["Pixel", "Google", "Pixel 8", "Pixel 7", "Pixel 6", "Pixel 9", "Pixel Fold", "Pixel 7a", "Pixel 8a", "Google Pixel"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Google Pixel smartphones"
  },
  "OnePlus": {
    terms: ["OnePlus", "ONE PLUS", "OnePlus 12", "OnePlus 11", "OnePlus Nord", "OnePlus Open", "ONEPLUS"],
    signalTypes: ["bluetooth", "wifi"],
    description: "OnePlus smartphones"
  },
  "Xiaomi": {
    terms: ["Xiaomi", "MI", "Redmi", "POCO", "Xiaomi 14", "Xiaomi 13", "Redmi Note", "POCO F", "POCO X", "Mi Band"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Xiaomi, Redmi, and POCO smartphones"
  },
  "Huawei": {
    terms: ["HUAWEI", "Huawei", "Mate", "P50", "P60", "Nova", "HUAWEI Mate", "HUAWEI P"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Huawei smartphones"
  },
  "Motorola": {
    terms: ["Motorola", "Moto", "Moto G", "Moto Edge", "moto g", "Motorola Edge", "MOTOROLA"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Motorola smartphones"
  },
  "Sony Xperia": {
    terms: ["Xperia", "Sony", "Xperia 1", "Xperia 5", "Xperia 10", "SONY"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Sony Xperia smartphones"
  },
  "LG": {
    terms: ["LG", "LG-", "LGE", "LG V", "LG G", "LG Velvet", "LG Wing"],
    signalTypes: ["bluetooth", "wifi"],
    description: "LG smartphones"
  },
  "Nokia": {
    terms: ["Nokia", "HMD", "Nokia X", "Nokia G", "Nokia C"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Nokia/HMD smartphones"
  },
  "Apple Watch": {
    terms: ["Apple Watch", "Watch", "Apple Watch Ultra", "Apple Watch SE", "Apple Watch Series", "APPLE WATCH"],
    signalTypes: ["bluetooth"],
    description: "Apple Watch smartwatches"
  },
  "Samsung Galaxy Watch": {
    terms: ["Galaxy Watch", "SM-R", "Galaxy Watch6", "Galaxy Watch5", "Galaxy Watch4", "Samsung Watch", "Galaxy Watch Ultra"],
    signalTypes: ["bluetooth"],
    description: "Samsung Galaxy Watch smartwatches"
  },
  "Fitbit": {
    terms: ["Fitbit", "Charge", "Versa", "Sense", "Inspire", "Fitbit Charge", "Fitbit Versa", "Fitbit Sense", "Fitbit Inspire", "Fitbit Luxe", "Fitbit Ace", "FB5"],
    signalTypes: ["bluetooth"],
    description: "Fitbit fitness trackers and smartwatches"
  },
  "Garmin": {
    terms: ["Garmin", "fenix", "Forerunner", "Venu", "vivoactive", "Instinct", "Garmin fenix", "Garmin FR", "Garmin Venu", "GARMIN", "Edge", "vivomove", "Lily", "vivosmart"],
    signalTypes: ["bluetooth"],
    description: "Garmin fitness and GPS watches"
  },
  "Amazfit": {
    terms: ["Amazfit", "GTS", "GTR", "T-Rex", "Bip", "Amazfit GTS", "Amazfit GTR", "Amazfit T-Rex", "Amazfit Bip", "Amazfit Cheetah"],
    signalTypes: ["bluetooth"],
    description: "Amazfit smartwatches"
  },
  "Whoop": {
    terms: ["WHOOP", "Whoop", "WHOOP 4.0", "Whoop Band", "WHOOP Strap"],
    signalTypes: ["bluetooth"],
    description: "WHOOP fitness bands"
  },
  "Oura Ring": {
    terms: ["Oura", "Oura Ring", "OURA", "Oura Ring Gen3", "Oura Ring 4"],
    signalTypes: ["bluetooth"],
    description: "Oura smart rings"
  },
  "Pacemaker": {
    terms: [
      "Azure XT", "Azure S", "Azure XT DR", "Azure S SR", "Medtronic Azure", "MDT W1DR01", "MDT W3DR01",
      "Micra AV", "Micra VR", "Micra AV2", "Micra VR2",
      "AVEIR AR", "AVEIR VR", "AVEIR LP", "AVEIR i2i",
      "BlueSync PM", "BlueSync Enabled", "BlueSync",
      "Assurity MRI", "Endurity MRI",
      "Gallant ICD", "Entrant CRT",
      "ACCOLADE MRI", "ACCOLADE EL", "ESSENTIO MRI", "ESSENTIO SR", "INGENITY MRI", "INGENITY DR",
      "BSC ACCOLADE", "BSC ESSENTIO", "BSC Pacer", "BSC Latitude",
      "Percepta CRT", "Solara CRT",
      "Cobalt XT", "Crome HF",
      "Amvia Sky", "Amvia HF", "Amvia Edge", "Biotronik Amvia",
      "Evia DR", "Evia ProMRI",
      "Rivacor DR", "Rivacor HF",
      "Acticor DX",
      "BIOTRONIK PM",
      "HeartPOD", "Chronicle ICM", "HeartLogic",
      "Reveal LINQ", "Biomonitor ICM", "Assert-IQ", "TriageHF",
      "LSP201A", "LSP202V", "LSL02 Module",
      "BLE Pacemaker", "Medical BLE Device", "Cardiac Implant Broadcast",
      "Heart Rate BLE", "Cardiac BLE Sync", "Implant BLE Broadcast",
      "Heart Device Advert", "Pacemaker BLE Name", "Medical LP Beacon",
      "MDT", "Azure", "AVEIR", "BSC", "ACCOLADE", "Evia", "Micra", "Rivacor", "Acticor",
      "Latitude", "INGENITY", "Endurity", "Assurity", "Gallant", "Entrant", "Percepta", "Solara",
      "Cobalt", "Crome", "Amvia", "BlueSync"
    ],
    signalTypes: ["bluetooth"],
    description: "Cardiac pacemakers and implantable cardiac devices from Medtronic, Abbott, Boston Scientific, and Biotronik"
  },
  "Hearing Aid": {
    terms: [
      "Phonak", "Oticon", "Signia", "ReSound", "Widex", "Starkey",
      "Phonak Lumity", "Phonak Paradise", "Phonak Marvel", "Phonak Audeo",
      "Oticon Real", "Oticon More", "Oticon Own", "Oticon Intent",
      "Signia AX", "Signia IX", "Signia Pure", "Signia Styletto", "Signia Active",
      "ReSound Nexia", "ReSound OMNIA", "ReSound ONE", "GN ReSound",
      "Widex Moment", "Widex SmartRIC", "Widex EVOKE",
      "Starkey Genesis", "Starkey Evolv", "Starkey Livio",
      "Unitron", "Bernafon", "Sonic",
      "HA-BLE", "Hearing Aid", "ASHA Stream", "MFi Hearing",
      "Sonova", "Demant", "WS Audiofit",
      "Roger", "Roger ON", "Roger Select",
      "Cochlear", "Nucleus", "Cochlear Nucleus", "Baha",
      "MED-EL", "AudioLink", "AudioStream"
    ],
    signalTypes: ["bluetooth"],
    description: "BLE hearing aids from Phonak, Oticon, Signia, ReSound, Widex, Starkey, and cochlear implants"
  },
  "Insulin Pump": {
    terms: [
      "Medtronic 780G", "MiniMed 780G", "MiniMed 770G", "MiniMed 670G",
      "Omnipod 5", "Omnipod DASH", "Omnipod", "DASH PDM", "Insulet",
      "Tandem t:slim", "t:slim X2", "Tandem Mobi", "Tandem",
      "Ypsomed YpsoPump", "YpsoPump",
      "Beta Bionics iLet", "iLet Bionic Pancreas",
      "Medtronic Pump", "MDT Pump", "Insulin Pump BLE",
      "Guardian Sensor", "Guardian 4", "Guardian Link",
      "InPen", "InPen Smart",
      "CamAPS", "CamAPS FX", "CamDiab",
      "DBLG1", "Diabeloop",
      "Loop", "OpenAPS", "AndroidAPS"
    ],
    signalTypes: ["bluetooth"],
    description: "Insulin pumps and automated insulin delivery systems from Medtronic, Insulet, Tandem, and others"
  },
  "CGM Monitor": {
    terms: [
      "Dexcom G7", "Dexcom G6", "Dexcom ONE", "Dexcom ONE+", "Dexcom Stelo",
      "DXCM", "DexCom", "Dexcom",
      "FreeStyle Libre 3", "FreeStyle Libre 2", "FreeStyle Libre",
      "LibreLink", "Libre Sensor", "Abbott Libre",
      "Guardian Sensor 4", "Guardian Sensor 3", "Guardian Connect",
      "Medtronic CGM", "MDT CGM",
      "Eversense", "Eversense E3", "Senseonics",
      "GlucoRx Aidex", "Aidex CGM",
      "GlucoMen Day", "Menarini",
      "CGM BLE", "Glucose Monitor", "Continuous Glucose"
    ],
    signalTypes: ["bluetooth"],
    description: "Continuous glucose monitors from Dexcom, Abbott FreeStyle Libre, Medtronic Guardian, and Senseonics"
  },
  "Pulse Oximeter": {
    terms: [
      "Masimo", "MightySat", "Masimo Radius",
      "Nonin", "Nonin 3230", "Nonin WristOx",
      "Contec CMS50", "CMS50D", "CMS50E", "CMS50F",
      "Wellue O2Ring", "O2Ring", "Wellue",
      "iHealth Air", "iHealth",
      "Beurer PO", "Beurer",
      "BLE SpO2", "Pulse Ox", "Oximeter BLE"
    ],
    signalTypes: ["bluetooth"],
    description: "Bluetooth pulse oximeters from Masimo, Nonin, Contec, and consumer brands"
  },
  "Blood Pressure Monitor": {
    terms: [
      "Omron", "Omron Evolv", "Omron HEM", "Omron BP",
      "Withings BPM", "BPM Connect", "BPM Core", "Withings",
      "QardioArm", "Qardio",
      "iHealth Clear", "iHealth Feel",
      "Beurer BM", "A&D Medical",
      "BP BLE", "Blood Pressure BLE"
    ],
    signalTypes: ["bluetooth"],
    description: "Bluetooth blood pressure monitors from Omron, Withings, Qardio, and others"
  },
  "AirPods": {
    terms: ["AirPods", "AirPods Pro", "AirPods Max", "AirPods 3", "AirPods 4", "Apple AirPods", "AirPod"],
    signalTypes: ["bluetooth"],
    description: "Apple AirPods wireless earbuds and headphones"
  },
  "Galaxy Buds": {
    terms: ["Galaxy Buds", "Buds2", "Buds Pro", "Buds FE", "Buds Live", "SM-R", "Galaxy Buds2", "Galaxy Buds3", "Samsung Buds"],
    signalTypes: ["bluetooth"],
    description: "Samsung Galaxy Buds wireless earbuds"
  },
  "Sony WF/WH": {
    terms: ["WF-1000XM", "WH-1000XM", "Sony WF", "Sony WH", "LinkBuds", "WF-1000XM5", "WH-1000XM5", "Sony LE_", "SONY:WF", "SONY:WH"],
    signalTypes: ["bluetooth"],
    description: "Sony wireless earbuds and headphones"
  },
  "Bose QC": {
    terms: ["Bose", "QC45", "QC Ultra", "QuietComfort", "Bose QC", "Bose NC", "Bose Sport", "Bose SoundLink", "LE-Bose", "BOSE"],
    signalTypes: ["bluetooth"],
    description: "Bose QuietComfort and SoundLink audio devices"
  },
  "JBL Speaker": {
    terms: ["JBL", "JBL Flip", "JBL Charge", "JBL Xtreme", "JBL Go", "JBL Clip", "JBL Pulse", "JBL PartyBox", "JBL Tune", "JBL Live"],
    signalTypes: ["bluetooth"],
    description: "JBL portable speakers and headphones"
  },
  "Sonos": {
    terms: ["Sonos", "Sonos One", "Sonos Roam", "Sonos Move", "Sonos Era", "Sonos Beam", "Sonos Arc", "Sonos Ace"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Sonos smart speakers"
  },
  "Marshall Speaker": {
    terms: ["Marshall", "Marshall Stanmore", "Marshall Emberton", "Marshall Kilburn", "Marshall Acton", "Marshall Minor", "Marshall Motif"],
    signalTypes: ["bluetooth"],
    description: "Marshall Bluetooth speakers and headphones"
  },
  "MacBook": {
    terms: ["MacBook", "MacBook Pro", "MacBook Air", "Apple Mac", "Apple Inc"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Apple MacBook laptops"
  },
  "iPad": {
    terms: ["iPad", "iPad Pro", "iPad Air", "iPad mini", "Apple iPad"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Apple iPads"
  },
  "Surface": {
    terms: ["Surface", "Surface Pro", "Surface Laptop", "Surface Go", "Microsoft Surface"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Microsoft Surface devices"
  },
  "Chromebook": {
    terms: ["Chromebook", "Chrome OS", "Acer Chromebook", "HP Chromebook", "Lenovo Chromebook", "Samsung Chromebook"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Chromebook laptops"
  },
  "ThinkPad": {
    terms: ["ThinkPad", "Lenovo ThinkPad", "ThinkPad X", "ThinkPad T", "ThinkPad L", "LENOVO"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Lenovo ThinkPad laptops"
  },
  "Dell XPS": {
    terms: ["Dell", "XPS", "Dell XPS", "Dell Latitude", "Dell Inspiron", "DELL"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Dell laptops"
  },
  "Amazon Echo": {
    terms: ["Echo", "Amazon Echo", "Echo Dot", "Echo Show", "Echo Pop", "Echo Studio", "Alexa", "Fire TV", "Fire Stick", "AMAZON"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Amazon Echo and Fire TV smart home devices"
  },
  "Google Nest": {
    terms: ["Nest", "Google Nest", "Nest Hub", "Nest Mini", "Nest Audio", "Google Home", "Chromecast", "Nest Cam", "Nest Doorbell"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Google Nest smart home devices"
  },
  "Ring Doorbell": {
    terms: ["Ring", "Ring Doorbell", "Ring Camera", "Ring Stick Up", "Ring Floodlight", "Ring Spotlight", "Ring Alarm", "RING"],
    signalTypes: ["wifi"],
    description: "Ring smart doorbells and security cameras"
  },
  "Hue Lights": {
    terms: ["Philips Hue", "Hue", "Hue Bridge", "Hue Bulb", "Hue Strip", "Hue Play", "Signify"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Philips Hue smart lighting"
  },
  "Smart Lock": {
    terms: ["August", "August Lock", "Yale", "Yale Lock", "Schlage Encode", "Schlage", "Kwikset Halo", "Kwikset", "Level Lock", "Level", "Ultraloq", "Lockly", "Smart Lock BLE"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Smart door locks from August, Yale, Schlage, Kwikset, and others"
  },
  "Smart Thermostat": {
    terms: ["Nest Thermostat", "ecobee", "Honeywell T", "Honeywell Home", "Sensi", "Emerson", "Mysa", "Thermostat BLE"],
    signalTypes: ["wifi", "bluetooth"],
    description: "Smart thermostats from Nest, ecobee, Honeywell, and others"
  },
  "Smart Plug": {
    terms: ["TP-Link Kasa", "Kasa Smart", "Wemo", "Wyze Plug", "Amazon Smart Plug", "Meross", "Govee Plug", "Smart Plug", "ESP_"],
    signalTypes: ["wifi"],
    description: "Smart plugs and outlets"
  },
  "Tesla": {
    terms: ["Tesla", "Tesla Model", "Model 3", "Model Y", "Model S", "Model X", "TESLA", "S1a2b3c4d5e6", "Tesla BLE Key"],
    signalTypes: ["bluetooth", "wifi"],
    description: "Tesla electric vehicles and BLE key broadcasts"
  },
  "BMW": {
    terms: ["BMW", "BMW Connected", "BMW Digital Key", "MY BMW"],
    signalTypes: ["bluetooth"],
    description: "BMW vehicle BLE broadcasts"
  },
  "Mercedes": {
    terms: ["Mercedes", "MB Companion", "Mercedes me", "MBUX"],
    signalTypes: ["bluetooth"],
    description: "Mercedes-Benz vehicle BLE broadcasts"
  },
  "Audi": {
    terms: ["Audi", "Audi Connect", "myAudi", "Audi BLE"],
    signalTypes: ["bluetooth"],
    description: "Audi vehicle BLE broadcasts"
  },
  "Ford": {
    terms: ["Ford", "FordPass", "SYNC", "Ford SYNC", "Ford BLE"],
    signalTypes: ["bluetooth"],
    description: "Ford vehicle BLE broadcasts"
  },
  "Toyota": {
    terms: ["Toyota", "Toyota Connected", "Lexus", "Toyota BLE"],
    signalTypes: ["bluetooth"],
    description: "Toyota/Lexus vehicle BLE broadcasts"
  },
  "OBD-II Scanner": {
    terms: ["OBD", "OBD2", "OBD-II", "ELM327", "OBDII", "Vgate", "Veepeak", "BlueDriver", "Fixd", "BAFX", "Car Scanner", "Torque", "OBDLink"],
    signalTypes: ["bluetooth", "wifi"],
    description: "OBD-II vehicle diagnostic scanners"
  },
  "Apple AirTag": {
    terms: ["AirTag", "Apple AirTag", "Find My", "Apple Find My"],
    signalTypes: ["bluetooth"],
    description: "Apple AirTag location trackers"
  },
  "Tile Tracker": {
    terms: ["Tile", "Tile Mate", "Tile Pro", "Tile Slim", "Tile Sticker", "Tile Ultra", "Life360"],
    signalTypes: ["bluetooth"],
    description: "Tile Bluetooth trackers"
  },
  "Samsung SmartTag": {
    terms: ["SmartTag", "Galaxy SmartTag", "SmartTag2", "Samsung SmartTag", "SmartThings Find"],
    signalTypes: ["bluetooth"],
    description: "Samsung Galaxy SmartTag trackers"
  },
  "Chipolo": {
    terms: ["Chipolo", "Chipolo ONE", "Chipolo Card", "Chipolo SPOT"],
    signalTypes: ["bluetooth"],
    description: "Chipolo Bluetooth trackers"
  },
  "DJI Mavic": {
    terms: ["DJI", "Mavic", "Mavic 3", "Mavic Air", "Mavic Pro", "DJI-Mavic", "DJI Mavic", "RC-N1", "RC-N2", "RC Pro"],
    signalTypes: ["wifi", "sdr"],
    description: "DJI Mavic series drones and remote controllers"
  },
  "DJI Mini": {
    terms: ["DJI Mini", "Mini 4", "Mini 3", "Mini 2", "DJI-Mini", "Mavic Mini"],
    signalTypes: ["wifi", "sdr"],
    description: "DJI Mini series compact drones"
  },
  "DJI Phantom": {
    terms: ["Phantom", "DJI Phantom", "Phantom 4", "DJI-Phantom"],
    signalTypes: ["wifi", "sdr"],
    description: "DJI Phantom series drones"
  },
  "Skydio": {
    terms: ["Skydio", "Skydio 2", "Skydio X2", "Skydio X10"],
    signalTypes: ["wifi"],
    description: "Skydio autonomous drones"
  },
  "Autel": {
    terms: ["Autel", "EVO", "Autel EVO", "EVO Nano", "EVO Lite", "EVO Max", "Autel Robotics"],
    signalTypes: ["wifi", "sdr"],
    description: "Autel Robotics drones"
  },
  "Parrot": {
    terms: ["Parrot", "ANAFI", "Parrot ANAFI", "Bebop", "Parrot Bebop"],
    signalTypes: ["wifi"],
    description: "Parrot drones"
  },
  "RTL-SDR": {
    terms: ["RTL-SDR", "RTL2832", "R820T", "RTL SDR", "Generic RTL"],
    signalTypes: ["sdr"],
    description: "RTL-SDR USB receivers"
  },
  "HackRF": {
    terms: ["HackRF", "HackRF One", "Great Scott Gadgets"],
    signalTypes: ["sdr"],
    description: "HackRF software defined radios"
  },
  "USRP": {
    terms: ["USRP", "Ettus", "USRP B200", "USRP B210", "USRP N210", "National Instruments"],
    signalTypes: ["sdr"],
    description: "Ettus USRP software defined radios"
  },
  "Baofeng": {
    terms: ["Baofeng", "UV-5R", "UV-82", "BF-F8HP", "BF-888S", "GT-3", "Baofeng UV"],
    signalTypes: ["sdr"],
    description: "Baofeng handheld radios"
  },
  "Yaesu": {
    terms: ["Yaesu", "FT-", "VX-", "FT-818", "FT-991", "FT-710", "FT-891", "FTM-", "Yaesu FT"],
    signalTypes: ["sdr"],
    description: "Yaesu amateur radios"
  },
  "Icom": {
    terms: ["Icom", "IC-", "IC-705", "IC-7300", "IC-9700", "ID-52", "Icom IC"],
    signalTypes: ["sdr"],
    description: "Icom amateur radios"
  },
  "Kenwood": {
    terms: ["Kenwood", "TH-", "TS-", "TM-", "TH-D75", "TH-D74", "Kenwood TH"],
    signalTypes: ["sdr"],
    description: "Kenwood amateur radios"
  },
  "Heltec LoRa": {
    terms: ["Heltec", "HT-CT62", "Heltec V3", "Heltec V2", "WiFi LoRa 32", "Heltec ESP32", "CubeCell"],
    signalTypes: ["lora", "meshtastic"],
    description: "Heltec LoRa development boards and modules"
  },
  "TTGO T-Beam": {
    terms: ["T-Beam", "TTGO", "T-Beam Supreme", "LilyGO T-Beam", "T-Beam S3"],
    signalTypes: ["lora", "meshtastic"],
    description: "LilyGO TTGO T-Beam LoRa boards with GPS"
  },
  "RAK WisBlock": {
    terms: ["RAK", "WisBlock", "RAK4631", "RAK2560", "RAK19007", "RAKwireless", "WisMesh"],
    signalTypes: ["lora", "meshtastic"],
    description: "RAKwireless WisBlock modular LoRa systems"
  },
  "LilyGO": {
    terms: ["LilyGO", "T-Deck", "T-Echo", "T-Watch", "T-Display", "LILYGO"],
    signalTypes: ["lora", "meshtastic"],
    description: "LilyGO LoRa boards and displays"
  },
  "Meshtastic Node": {
    terms: ["Meshtastic", "Mesh", "MESH-", "LongFast", "MediumFast", "ShortFast", "Meshcore", "MeshNode", "MeshTastic"],
    signalTypes: ["meshtastic", "lora"],
    description: "Generic Meshtastic mesh networking nodes"
  },
  "Commercial Airliner": {
    terms: ["Boeing", "Airbus", "B737", "B747", "B777", "B787", "A320", "A330", "A350", "A380", "B738", "B739", "A321", "A319", "E175", "E190", "CRJ", "ERJ", "AAL", "UAL", "DAL", "SWA", "JBU"],
    signalTypes: ["adsb"],
    description: "Commercial airline aircraft ADS-B transponders"
  },
  "Private Aircraft": {
    terms: ["Cessna", "Piper", "Beechcraft", "Cirrus", "Diamond", "C172", "C182", "C206", "PA28", "PA32", "SR22", "DA40", "DA42", "King Air", "Citation", "Phenom", "Learjet", "Gulfstream", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9"],
    signalTypes: ["adsb"],
    description: "Private and general aviation aircraft ADS-B transponders"
  },
  "Helicopter": {
    terms: ["Helicopter", "Heli", "R44", "R22", "R66", "Bell 206", "Bell 407", "Bell 412", "EC135", "EC145", "H125", "H135", "H145", "AS350", "S76", "AW139", "UH-60", "Black Hawk", "Chinook", "Apache"],
    signalTypes: ["adsb"],
    description: "Helicopter ADS-B transponders including civilian and military"
  },
  "Military Aircraft": {
    terms: ["Military", "MIL", "BLOCKED", "AE", "F-16", "F-18", "F-35", "C-130", "C-17", "KC-135", "E-3", "P-8", "V-22", "USAF", "USN", "ARMY", "COAST GUARD"],
    signalTypes: ["adsb"],
    description: "Military aircraft ADS-B transponders (often blocked/limited)"
  },
  "Garmin GPS": {
    terms: ["Garmin GPS", "Garmin Drive", "Garmin RV", "Garmin Overlander", "GPSMAP", "eTrex", "Montana", "Oregon", "Garmin inReach", "inReach Mini", "inReach Explorer"],
    signalTypes: ["bluetooth"],
    description: "Garmin GPS navigators and satellite communicators"
  },
  "TomTom": {
    terms: ["TomTom", "TomTom GO", "TomTom Rider", "TomTom Via"],
    signalTypes: ["bluetooth"],
    description: "TomTom GPS navigation devices"
  },
  "Marine AIS Transponder": {
    terms: ["AIS", "MMSI", "VHF AIS", "AIS Class A", "AIS Class B", "AIS SART", "Vessel", "Ship", "Marine VHF", "DSC", "EPIRB"],
    signalTypes: ["sdr"],
    description: "Marine AIS transponders and VHF broadcasts"
  },
  "EPIRB/PLB": {
    terms: ["EPIRB", "PLB", "406 MHz", "COSPAS", "SARSAT", "ACR", "McMurdo", "Ocean Signal", "ResQLink", "GlobalFix"],
    signalTypes: ["sdr"],
    description: "Emergency position indicating beacons and personal locator beacons"
  },
  "Wi-Fi Router": {
    terms: ["Router", "NETGEAR", "Linksys", "TP-Link", "ASUS RT", "Ubiquiti", "UniFi", "Eero", "Orbi", "Arris", "Motorola Router", "Cisco", "Meraki", "D-Link"],
    signalTypes: ["wifi"],
    description: "Wi-Fi routers and gateways"
  },
  "Access Point": {
    terms: ["AP", "Access Point", "UniFi AP", "Aruba", "Ruckus", "Cisco AP", "Meraki MR", "EnGenius", "TP-Link EAP", "Cambium", "Ubiquiti UAP"],
    signalTypes: ["wifi"],
    description: "Enterprise and consumer Wi-Fi access points"
  },
  "Mesh Node": {
    terms: ["Mesh", "Eero", "Google Wifi", "Orbi", "Velop", "Deco", "TP-Link Deco", "AmpliFi", "Nest Wifi"],
    signalTypes: ["wifi"],
    description: "Wi-Fi mesh networking nodes"
  },
  "Hotspot": {
    terms: ["Hotspot", "MiFi", "Jetpack", "Nighthawk", "NETGEAR Hotspot", "T-Mobile Hotspot", "AT&T Hotspot", "Inseego", "Franklin T10"],
    signalTypes: ["wifi"],
    description: "Mobile Wi-Fi hotspot devices"
  },
  "Repeater": {
    terms: ["Repeater", "Extender", "Range Extender", "TP-Link RE", "NETGEAR EX", "Linksys RE"],
    signalTypes: ["wifi"],
    description: "Wi-Fi range extenders and repeaters"
  },
};

export const DEVICE_CATEGORIES = [
  {
    category: "Mobile Phones",
    items: ["Apple iPhone", "Samsung Galaxy", "Google Pixel", "OnePlus", "Xiaomi", "Huawei", "Motorola", "Sony Xperia", "LG", "Nokia"]
  },
  {
    category: "Wearables",
    items: ["Apple Watch", "Samsung Galaxy Watch", "Fitbit", "Garmin", "Amazfit", "Whoop", "Oura Ring"]
  },
  {
    category: "Medical Devices",
    items: ["Pacemaker", "Hearing Aid", "Insulin Pump", "CGM Monitor", "Pulse Oximeter", "Blood Pressure Monitor"]
  },
  {
    category: "Audio Devices",
    items: ["AirPods", "Galaxy Buds", "Sony WF/WH", "Bose QC", "JBL Speaker", "Sonos", "Marshall Speaker"]
  },
  {
    category: "Computers & Tablets",
    items: ["MacBook", "iPad", "Surface", "Chromebook", "ThinkPad", "Dell XPS"]
  },
  {
    category: "IoT & Smart Home",
    items: ["Amazon Echo", "Google Nest", "Ring Doorbell", "Hue Lights", "Smart Lock", "Smart Thermostat", "Smart Plug"]
  },
  {
    category: "Vehicles",
    items: ["Tesla", "BMW", "Mercedes", "Audi", "Ford", "Toyota", "OBD-II Scanner"]
  },
  {
    category: "Trackers & Tags",
    items: ["Apple AirTag", "Tile Tracker", "Samsung SmartTag", "Chipolo"]
  },
  {
    category: "Drones & UAVs",
    items: ["DJI Mavic", "DJI Mini", "DJI Phantom", "Skydio", "Autel", "Parrot"]
  },
  {
    category: "Radio & SDR",
    items: ["RTL-SDR", "HackRF", "USRP", "Baofeng", "Yaesu", "Icom", "Kenwood"]
  },
  {
    category: "LoRa & Meshtastic",
    items: ["Heltec LoRa", "TTGO T-Beam", "RAK WisBlock", "LilyGO", "Meshtastic Node"]
  },
  {
    category: "Aircraft",
    items: ["Commercial Airliner", "Private Aircraft", "Helicopter", "Military Aircraft"]
  },
  {
    category: "Navigation",
    items: ["Garmin GPS", "TomTom", "Marine AIS Transponder", "EPIRB/PLB"]
  },
  {
    category: "Networking",
    items: ["Wi-Fi Router", "Access Point", "Mesh Node", "Hotspot", "Repeater"]
  }
] as const;

export const NODE_FILTER_CATEGORIES = [
  { key: "bluetooth", label: "Bluetooth", signalTypes: ["bluetooth"], deviceTypes: [] },
  { key: "wifi", label: "Wi-Fi", signalTypes: ["wifi"], deviceTypes: [] },
  { key: "phones", label: "Phones", signalTypes: [], deviceTypes: ["Apple iPhone", "Samsung Galaxy", "Google Pixel", "OnePlus", "Xiaomi", "Huawei", "Motorola", "Sony Xperia", "LG", "Nokia", "Mobile Phone"] },
  { key: "drones", label: "Drones", signalTypes: [], deviceTypes: ["DJI Mavic", "DJI Mini", "DJI Phantom", "Skydio", "Autel", "Parrot", "Drone", "UAV"] },
  { key: "vehicles", label: "Vehicles", signalTypes: [], deviceTypes: ["Tesla", "BMW", "Mercedes", "Audi", "Ford", "Toyota", "OBD-II Scanner", "Vehicle"] },
  { key: "iot", label: "IoT", signalTypes: [], deviceTypes: ["Amazon Echo", "Google Nest", "Ring Doorbell", "Hue Lights", "Smart Lock", "Smart Thermostat", "Smart Plug", "IoT"] },
  { key: "wearables", label: "Wearables", signalTypes: [], deviceTypes: ["Apple Watch", "Samsung Galaxy Watch", "Fitbit", "Garmin", "Amazfit", "Whoop", "Oura Ring", "Wearable"] },
  { key: "trackers", label: "Trackers", signalTypes: [], deviceTypes: ["Apple AirTag", "Tile Tracker", "Samsung SmartTag", "Chipolo", "Tracker", "Tag"] },
  { key: "lora", label: "LoRa", signalTypes: ["lora", "meshtastic"], deviceTypes: [] },
  { key: "sdr", label: "SDR", signalTypes: ["sdr"], deviceTypes: [] },
  { key: "adsb", label: "Aircraft", signalTypes: ["adsb"], deviceTypes: ["Commercial Airliner", "Private Aircraft", "Helicopter", "Military Aircraft"] },
  { key: "audio", label: "Audio", signalTypes: [], deviceTypes: ["AirPods", "Galaxy Buds", "Sony WF/WH", "Bose QC", "JBL Speaker", "Sonos", "Marshall Speaker", "Audio"] },
] as const;

export function formatCoordinates(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return "Unknown";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function formatFrequency(freq: number | null | undefined): string {
  if (!freq) return "N/A";
  if (freq >= 1e9) return `${(freq / 1e9).toFixed(3)} GHz`;
  if (freq >= 1e6) return `${(freq / 1e6).toFixed(3)} MHz`;
  if (freq >= 1e3) return `${(freq / 1e3).toFixed(3)} kHz`;
  return `${freq} Hz`;
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "Never";
  const now = new Date();
  const then = new Date(date);
  const diff = now.getTime() - then.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
