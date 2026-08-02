import type { Platform } from "../types.js";
import { xConnector } from "./x.js";
import { linkedinConnector } from "./linkedin.js";
import { facebookConnector, instagramConnector } from "./meta.js";
import { tiktokConnector } from "./tiktok.js";
import { pinterestConnector } from "./pinterest.js";
import type { PlatformConnector } from "./types.js";

const CONNECTORS: Record<Platform, PlatformConnector> = {
  x: xConnector,
  linkedin: linkedinConnector,
  facebook: facebookConnector,
  instagram: instagramConnector,
  tiktok: tiktokConnector,
  pinterest: pinterestConnector,
};

export function getConnector(platform: Platform): PlatformConnector {
  return CONNECTORS[platform];
}

export type { PlatformConnector } from "./types.js";
