import { useWindowDimensions } from "react-native";

export const breakpoints = {
  medium: 768,
  expanded: 1024,
} as const;

export const viewportTargets = {
  mobile: [375, 390, 414, 430],
  tablet: [768, 1024],
  desktop: [1280, 1440, 1920],
} as const;

export type ViewportClass = "compact" | "medium" | "expanded";
export type NavigationPlacement = "bottom" | "side";

export function classifyViewport(width: number): ViewportClass {
  if (width < breakpoints.medium) return "compact";
  if (width < breakpoints.expanded) return "medium";
  return "expanded";
}

export function getNavigationPlacement(width: number): NavigationPlacement {
  return classifyViewport(width) === "expanded" ? "side" : "bottom";
}

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const viewportClass = classifyViewport(width);

  return {
    width,
    height,
    viewportClass,
    isCompact: viewportClass === "compact",
    isMedium: viewportClass === "medium",
    isExpanded: viewportClass === "expanded",
    navigationPlacement: getNavigationPlacement(width),
    isLandscape: width > height,
  } as const;
}
