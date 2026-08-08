/** 与平台无关的版本策略，供运行时检查和 Node 单测共用。 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const difference = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function shouldOfferUpdate(latest: string, current: string): boolean {
  return Boolean(latest) && compareVersions(latest, current) > 0;
}

export function isRequiredUpdate(
  info: { min_supported?: string | null; mandatory?: boolean | null },
  current: string,
): boolean {
  return Boolean(info.mandatory) || compareVersions(info.min_supported || "0.0.0", current) > 0;
}
