import type { CSSProperties } from "react";
import { initScene, version as webSpatialSdkVersion } from "@webspatial/react-sdk";

export const PERSONA_SCENE_NAME = "personaScene";
export const WEBSPATIAL_FORK_REPOSITORY = "https://github.com/zill4/webspatial-sdk";
export const WEBSPATIAL_FORK_COMMIT = "ac4bd47eb14a894ffef34a4044ddd0bbd47f3e72";

type SpatialWindow = Window & {
  webspatialBridge?: unknown;
  __WebSpatialData?: {
    getNativeVersion?: () => string;
  };
};

export type SpatialEnvironmentSnapshot = {
  isWebSpatial: boolean;
  sdkVersion: string;
  nativeVersion: string | null;
  hasBridge: boolean;
  hasWebSpatialData: boolean;
};

export type XrStyle = CSSProperties & {
  "--xr-back"?: number | string;
  "--xr-background-material"?: string;
};

export function xrStyle(back: number, material: string): XrStyle {
  return {
    "--xr-back": String(back),
    "--xr-background-material": material,
  };
}

export function detectSpatialEnvironment(): SpatialEnvironmentSnapshot {
  const typedWindow = window as SpatialWindow;
  const userAgent = navigator.userAgent;
  const userAgentVersion = userAgent.match(/WebSpatial\/([\d.]+)/)?.[1] ?? null;
  const nativeVersion = (() => {
    try {
      return typedWindow.__WebSpatialData?.getNativeVersion?.() ?? userAgentVersion;
    } catch {
      return userAgentVersion;
    }
  })();

  return {
    isWebSpatial: userAgent.includes("WebSpatial/"),
    sdkVersion: webSpatialSdkVersion,
    nativeVersion,
    hasBridge: typeof typedWindow.webspatialBridge !== "undefined",
    hasWebSpatialData: typeof typedWindow.__WebSpatialData !== "undefined",
  };
}

export function configurePersonaScene() {
  initScene(
    PERSONA_SCENE_NAME,
    previous => ({
      ...previous,
      defaultSize: {
        width: 1440,
        height: 960,
      },
      resizability: {
        minWidth: 960,
        minHeight: 720,
        maxWidth: 1800,
        maxHeight: 1280,
      },
      worldAlignment: "gravityAligned",
      worldScaling: "automatic",
      baseplateVisibility: "hidden",
    }),
    { type: "window" },
  );
}

export function openPersonaScene() {
  configurePersonaScene();
  window.open(`${__XR_ENV_BASE__}/scene`, PERSONA_SCENE_NAME);
}
