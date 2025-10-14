"use client";

import { DarkVeilBackground } from "./ui/dark-veil-background";
import Noise from "./noise";
import { cn } from "@/lib/utils";

export default function HeroBackground({
  className = "",
  hueShift = 220,
  scanlineIntensity = 0.4,
  warpAmount = 1.0,
  speed = 1,
  noisePatternAlpha = 10,
  noiseRefresh = 0.6,
  veilClassName = "opacity-70",
}: {
  className?: string;
  hueShift?: number;
  scanlineIntensity?: number;
  warpAmount?: number;
  speed?: number;
  noisePatternAlpha?: number;
  noiseRefresh?: number; // seconds between refreshes (approx via RAF frames)
  veilClassName?: string; // позволяет осветлить/затемнить фон
}) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <DarkVeilBackground
        hueShift={hueShift}
        scanlineIntensity={scanlineIntensity}
        warpAmount={warpAmount}
        speed={speed}
        className={veilClassName}
      />
      <Noise
        patternSize={500}
        patternScaleX={1}
        patternScaleY={1}
        patternRefreshInterval={noiseRefresh}
        patternAlpha={noisePatternAlpha}
      />
    </div>
  );
}
