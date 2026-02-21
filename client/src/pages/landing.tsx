import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { ScanPulse, DataStream, GlowLine } from "@/components/scan-animation";
import {
  Radar, Wifi, Bluetooth, Radio, Satellite, Shield, Globe,
  Search, Map, Bell, Fingerprint, Lock, Users, Zap, ChevronRight
} from "lucide-react";

export default function LandingPage() {
  const features = [
    {
      icon: <Radar className="w-6 h-6" />,
      title: "Multi-Signal Collection",
      desc: "Bluetooth, Wi-Fi, RFID, SDR, LoRa, Meshtastic, ADS-B - all in one platform",
    },
    {
      icon: <Map className="w-6 h-6" />,
      title: "Geospatial Intelligence",
      desc: "Real-time world map with signal triangulation and device tracking",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Counter-Intelligence",
      desc: "Detect if you're being followed or your devices are being interrogated",
    },
    {
      icon: <Search className="w-6 h-6" />,
      title: "Advanced Search",
      desc: "Search by name, hex, ASCII, frequency, or any transmitted data pattern",
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: "Collaborative Intel",
      desc: "Share collections with trusted users or access open-source datasets",
    },
    {
      icon: <Bell className="w-6 h-6" />,
      title: "Real-Time Alerts",
      desc: "Monitor for specific signals and get instant notifications when detected",
    },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 left-0 w-full h-full" style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, hsl(185, 100%, 50%) 0%, transparent 50%),
            radial-gradient(circle at 75% 75%, hsl(280, 65%, 55%) 0%, transparent 50%)`,
        }} />
      </div>

      <header className="relative z-10 flex items-center justify-between p-4 lg:px-8 backdrop-blur-sm border-b border-border/30">
        <div className="flex items-center gap-3">
          <Radar className="w-7 h-7 text-primary" />
          <span className="text-sm font-bold tracking-wider uppercase text-primary">ArmsLength SigInt</span>
        </div>
        <Button onClick={() => window.location.href = "/api/login"} data-testid="button-login">
          <Lock className="w-3.5 h-3.5 mr-1.5" />
          Secure Login
        </Button>
      </header>

      <main className="relative z-10">
        <section className="px-4 lg:px-8 py-16 lg:py-24">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Badge variant="outline" className="mb-4 text-[10px] uppercase tracking-widest border-primary/30 text-primary">
                Signal Intelligence Platform
              </Badge>
              <h1 className="text-3xl lg:text-5xl font-bold leading-tight mb-4 font-serif">
                One Tool to
                <span className="text-primary block">Rule All Signals</span>
              </h1>
              <p className="text-sm lg:text-base text-muted-foreground mb-6 max-w-lg leading-relaxed">
                Comprehensive signal intelligence for search and rescue, law enforcement, military operations,
                and open-source intelligence hobbyists. Collect, analyze, and triangulate any signal - anywhere.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={() => window.location.href = "/api/login"} data-testid="button-get-started">
                  Get Started
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
                <Button variant="outline" data-testid="button-learn-more">
                  Learn More
                </Button>
              </div>
              <div className="flex items-center gap-4 mt-6 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-chart-3" /> Free tier available</span>
                <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-primary" /> End-to-end encrypted</span>
                <span className="flex items-center gap-1"><Fingerprint className="w-3 h-3 text-accent" /> Two-factor auth</span>
              </div>
            </motion.div>

            <motion.div
              className="relative"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <Card className="p-6 relative overflow-visible">
                <div className="flex items-center justify-center mb-4">
                  <ScanPulse active size={100} />
                </div>
                <DataStream lines={6} />
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { icon: <Bluetooth className="w-4 h-4" />, label: "BLE", color: "hsl(217, 91%, 60%)" },
                    { icon: <Wifi className="w-4 h-4" />, label: "WiFi", color: "hsl(142, 76%, 48%)" },
                    { icon: <Radio className="w-4 h-4" />, label: "SDR", color: "hsl(280, 65%, 55%)" },
                    { icon: <Satellite className="w-4 h-4" />, label: "LoRa", color: "hsl(25, 85%, 55%)" },
                    { icon: <Radar className="w-4 h-4" />, label: "ADS-B", color: "hsl(0, 72%, 55%)" },
                    { icon: <Globe className="w-4 h-4" />, label: "OSINT", color: "hsl(185, 100%, 50%)" },
                  ].map(sig => (
                    <div key={sig.label} className="flex items-center gap-1.5 text-xs p-1.5 rounded-md bg-muted/20" style={{ color: sig.color }}>
                      {sig.icon}
                      <span>{sig.label}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          </div>
        </section>

        <GlowLine />

        <section className="px-4 lg:px-8 py-16">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-bold font-serif mb-2">Capabilities</h2>
              <p className="text-sm text-muted-foreground">Everything you need for comprehensive signal intelligence</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map((feat, i) => (
                <motion.div
                  key={feat.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * i, duration: 0.5 }}
                >
                  <Card className="p-4 h-full hover-elevate overflow-visible">
                    <div className="text-primary mb-3">{feat.icon}</div>
                    <h3 className="text-sm font-semibold mb-1">{feat.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{feat.desc}</p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <GlowLine />

        <section className="px-4 lg:px-8 py-16 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold font-serif mb-3">Ready to Begin?</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Start collecting and analyzing signal intelligence today. Free tier includes up to 2 GB of local storage.
            </p>
            <Button onClick={() => window.location.href = "/api/login"} data-testid="button-cta-login">
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              Access ArmsLength SigInt
            </Button>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/30 px-4 lg:px-8 py-4 text-center">
        <p className="text-[10px] text-muted-foreground">
          ArmsLength SigInt - Signal Intelligence Platform. All data encrypted. Activity logged for accountability.
        </p>
      </footer>
    </div>
  );
}
