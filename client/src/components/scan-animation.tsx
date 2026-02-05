import { motion } from "framer-motion";

export function ScanPulse({ active = true, size = 80 }: { active?: boolean; size?: number }) {
  if (!active) return null;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border border-primary/40"
          initial={{ scale: 0.3, opacity: 0.8 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.6,
            ease: "easeOut",
          }}
        />
      ))}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="w-3 h-3 rounded-full bg-primary"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>
    </div>
  );
}

export function DataStream({ lines = 8 }: { lines?: number }) {
  return (
    <div className="font-mono text-[10px] leading-tight opacity-50 overflow-hidden max-h-32">
      {Array.from({ length: lines }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: [0, 0.6, 0.3], x: 0 }}
          transition={{ duration: 1.5, delay: i * 0.2, repeat: Infinity, repeatDelay: lines * 0.2 }}
          className="text-primary/60"
        >
          {generateHexLine()}
        </motion.div>
      ))}
    </div>
  );
}

function generateHexLine(): string {
  const chars = "0123456789ABCDEF";
  const segments = Math.floor(Math.random() * 4) + 3;
  return Array.from({ length: segments })
    .map(() =>
      Array.from({ length: 4 })
        .map(() => chars[Math.floor(Math.random() * 16)])
        .join("")
    )
    .join(" ");
}

export function GlowLine() {
  return (
    <div className="relative h-px w-full overflow-hidden">
      <motion.div
        className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/60 to-transparent"
        animate={{ x: ["-100%", "400%"] }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
      <div className="absolute inset-0 bg-border/30" />
    </div>
  );
}
