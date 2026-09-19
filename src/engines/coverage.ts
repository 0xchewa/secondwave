export type CoverageRange = {
  fromBlock: bigint;
  toBlock: bigint;
  fromTime: number;
  toTime: number;
};
export function mergeCoverage(rows: CoverageRange[]): CoverageRange[] {
  const merged: CoverageRange[] = [];
  for (const row of [...rows].sort((a, b) =>
    a.fromBlock < b.fromBlock ? -1 : a.fromBlock > b.fromBlock ? 1 : 0,
  )) {
    const previous = merged.at(-1);
    if (previous && row.fromBlock <= previous.toBlock + 1n) {
      if (row.toBlock > previous.toBlock) {
        previous.toBlock = row.toBlock;
        previous.toTime = Math.max(previous.toTime, row.toTime);
      }
      previous.fromTime = Math.min(previous.fromTime, row.fromTime);
    } else merged.push({ ...row });
  }
  return merged;
}

export function coversTime(
  ranges: CoverageRange[],
  from: number,
  to: number,
  block?: bigint,
): boolean {
  return ranges.some(
    (r) =>
      r.fromTime <= from &&
      r.toTime >= to &&
      (block === undefined || (r.fromBlock <= block && r.toBlock >= block)),
  );
}
