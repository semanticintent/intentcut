const DURATION_PATTERN = /^(\d+(?:\.\d+)?)(ms|s|m)$/;

export function parseDuration(value: string): number {
  const match = DURATION_PATTERN.exec(value);

  if (!match) {
    throw new Error(`Invalid duration "${value}". Use values such as 500ms, 4s, or 2.5m.`);
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid duration "${value}".`);
  }

  switch (unit) {
    case "ms":
      return amount;
    case "s":
      return amount * 1_000;
    case "m":
      return amount * 60_000;
    default:
      throw new Error(`Unsupported duration unit in "${value}".`);
  }
}

export function formatDuration(milliseconds: number): string {
  const totalMilliseconds = Math.round(milliseconds);
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1_000);
  const remainder = totalMilliseconds % 1_000;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(remainder).padStart(3, "0")}`;
}
