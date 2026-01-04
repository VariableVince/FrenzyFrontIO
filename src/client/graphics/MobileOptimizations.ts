/**
 * Mobile-specific optimizations for rendering performance.
 * Detects mobile devices and provides configuration for reduced visual fidelity.
 * Now supports user-selectable quality presets.
 */

export type RenderQualityPreset = "auto" | "lowend" | "mobile" | "pc";

export interface MobileConfig {
  isMobile: boolean;
  isLowEnd: boolean;
  qualityPreset: RenderQualityPreset;

  // Rendering quality settings
  devicePixelRatio: number; // Lower = faster rendering
  maxFPS: number; // Cap framerate
  skipMiningCellsEffects: boolean; // Most expensive visual effect
  reducedParticles: boolean; // Fewer explosion particles
  simplifiedUnits: boolean; // Simpler unit rendering
  reducedAnimations: boolean; // Skip non-essential animations
  aggressiveCulling: boolean; // More aggressive viewport culling
  batchSize: number; // Objects per batch render
}

// Detect mobile device
function detectMobile(): boolean {
  if (typeof navigator === "undefined") return false;

  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = [
    "android",
    "webos",
    "iphone",
    "ipad",
    "ipod",
    "blackberry",
    "windows phone",
    "opera mini",
    "mobile",
  ];

  return mobileKeywords.some((keyword) => userAgent.includes(keyword));
}

// Detect low-end device (rough heuristic)
function detectLowEnd(): boolean {
  if (typeof navigator === "undefined") return false;

  // Check for low memory (if available)
  const nav = navigator as any;
  if (nav.deviceMemory && nav.deviceMemory < 4) return true;

  // Check for low core count
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4)
    return true;

  // iOS devices before iPhone X are generally slower
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) {
    const match = ua.match(/iPhone OS (\d+)/);
    if (match && parseInt(match[1]) < 13) return true;
  }

  return false;
}

// Get the saved quality preference from localStorage
function getSavedQuality(): RenderQualityPreset {
  if (typeof localStorage === "undefined") return "auto";
  const saved = localStorage.getItem("settings.renderQuality");
  if (saved === "lowend" || saved === "mobile" || saved === "pc") {
    return saved;
  }
  return "auto";
}

// Create config for PC/Desktop quality
function createPCConfig(): MobileConfig {
  return {
    isMobile: false,
    isLowEnd: false,
    qualityPreset: "pc",
    devicePixelRatio: window.devicePixelRatio || 1,
    maxFPS: 60,
    skipMiningCellsEffects: false,
    reducedParticles: false,
    simplifiedUnits: false,
    reducedAnimations: false,
    aggressiveCulling: false,
    batchSize: 1000,
  };
}

// Create config for standard mobile quality
function createMobileQualityConfig(): MobileConfig {
  return {
    isMobile: true,
    isLowEnd: false,
    qualityPreset: "mobile",
    devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    maxFPS: 45,
    skipMiningCellsEffects: false,
    reducedParticles: true,
    simplifiedUnits: false,
    reducedAnimations: true,
    aggressiveCulling: true,
    batchSize: 500,
  };
}

// Create config for low-end quality
function createLowEndConfig(): MobileConfig {
  return {
    isMobile: true,
    isLowEnd: true,
    qualityPreset: "lowend",
    devicePixelRatio: 1,
    maxFPS: 30,
    skipMiningCellsEffects: true,
    reducedParticles: true,
    simplifiedUnits: true,
    reducedAnimations: true,
    aggressiveCulling: true,
    batchSize: 200,
  };
}

// Create mobile config based on device detection or user preference
function createMobileConfig(): MobileConfig {
  const savedQuality = getSavedQuality();

  // If user has manually selected a quality preset, use it
  if (savedQuality !== "auto") {
    console.log(`Using user-selected render quality: ${savedQuality}`);
    switch (savedQuality) {
      case "pc":
        return createPCConfig();
      case "mobile":
        return createMobileQualityConfig();
      case "lowend":
        return createLowEndConfig();
    }
  }

  // Auto-detect based on device
  const isMobile = detectMobile();
  const isLowEnd = detectLowEnd();

  if (!isMobile) {
    const config = createPCConfig();
    config.qualityPreset = "auto";
    return config;
  }

  if (isLowEnd) {
    const config = createLowEndConfig();
    config.qualityPreset = "auto";
    return config;
  }

  const config = createMobileQualityConfig();
  config.qualityPreset = "auto";
  return config;
}

// Singleton instance
let mobileConfig: MobileConfig | null = null;

export function getMobileConfig(): MobileConfig {
  if (!mobileConfig) {
    mobileConfig = createMobileConfig();
    console.log("Mobile optimization config:", mobileConfig);
  }
  return mobileConfig;
}

// Force refresh of mobile config (call after user changes quality setting)
export function refreshMobileConfig(): MobileConfig {
  mobileConfig = createMobileConfig();
  console.log("Mobile optimization config refreshed:", mobileConfig);
  return mobileConfig;
}

// Listen for quality changes from settings
if (typeof window !== "undefined") {
  window.addEventListener("render-quality-changed", () => {
    refreshMobileConfig();
  });
}

// Utility to check if we should skip expensive rendering
export function shouldSkipExpensiveEffect(): boolean {
  return getMobileConfig().skipMiningCellsEffects;
}

// Utility to get effective device pixel ratio
export function getEffectivePixelRatio(): number {
  return getMobileConfig().devicePixelRatio;
}

// Check if on mobile
export function isMobileDevice(): boolean {
  return getMobileConfig().isMobile;
}
