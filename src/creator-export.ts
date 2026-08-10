export type CanvasPresetId = "video-16-9" | "social-square" | "article-ogp";

export type CanvasPreset = {
  id: CanvasPresetId;
  label: string;
  width: number;
  height: number;
};

export type BrandProfile = {
  schemaVersion: "skew.brand-profile.v1";
  displayName: string;
  logoPath: string;
  footer: string;
  fontScale: number;
  showMetrics: boolean;
};

export type CreatorSeries = {
  symbol: string;
  range: string;
  interval: string;
  dates: string[];
  prices: number[];
  generatedAt: string;
  sourceLabel: string;
};

export type CreatorMetrics = {
  meanReturnDaily: number;
  stdReturnDaily: number;
  sharpeAnnual: number;
};

export const CANVAS_PRESETS: readonly CanvasPreset[] = Object.freeze([
  { id: "video-16-9", label: "16:9 video", width: 1920, height: 1080 },
  { id: "social-square", label: "1:1 social", width: 1080, height: 1080 },
  { id: "article-ogp", label: "1200×630 article / OGP", width: 1200, height: 630 },
]);

export const DEFAULT_BRAND_PROFILE: BrandProfile = Object.freeze({
  schemaVersion: "skew.brand-profile.v1",
  displayName: "KAFKA Chart",
  logoPath: "",
  footer: "Market data is fetched locally by the app. Verify source terms before publication.",
  fontScale: 1,
  showMetrics: true,
});

const MAX_BATCH_SYMBOLS = 10;

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  })[char] as string);
}

export function getCanvasPreset(id: CanvasPresetId): CanvasPreset {
  const preset = CANVAS_PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`Unknown canvas preset: ${id}`);
  return preset;
}

export function validateBrandProfile(input: BrandProfile): BrandProfile {
  if (input.schemaVersion !== "skew.brand-profile.v1") throw new Error("Unsupported brand profile schema");
  if (!input.displayName.trim()) throw new Error("displayName is required");
  if (!Number.isFinite(input.fontScale) || input.fontScale < 0.75 || input.fontScale > 1.5) {
    throw new Error("fontScale must be between 0.75 and 1.5");
  }
  return {
    ...input,
    displayName: input.displayName.trim(),
    logoPath: input.logoPath.trim(),
    footer: input.footer.trim(),
  };
}

export function parseBatchSymbols(raw: string): string[] {
  const symbols = raw
    .split(/[\s,]+/)
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
  const unique = [...new Set(symbols)];
  if (unique.length === 0) throw new Error("At least one symbol is required");
  if (unique.length > MAX_BATCH_SYMBOLS) throw new Error(`Creator Batch supports at most ${MAX_BATCH_SYMBOLS} symbols`);
  return unique;
}

export function buildCreatorSvg(
  series: CreatorSeries,
  metrics: CreatorMetrics,
  profileInput: BrandProfile,
  presetId: CanvasPresetId,
): string {
  const profile = validateBrandProfile(profileInput);
  const preset = getCanvasPreset(presetId);
  if (series.dates.length !== series.prices.length || series.prices.length < 2) {
    throw new Error("Series must contain at least two aligned observations");
  }
  if (series.prices.some((value) => !Number.isFinite(value))) throw new Error("Series contains a non-finite price");
  if (!series.symbol.trim() || !series.range.trim() || !series.interval.trim()) throw new Error("Series metadata is incomplete");
  if (!series.generatedAt.trim() || !series.sourceLabel.trim()) throw new Error("Provenance metadata is incomplete");

  const width = preset.width;
  const height = preset.height;
  const scale = profile.fontScale;
  const padX = Math.round(width * 0.07);
  const headerY = Math.round(height * 0.11);
  const chartTop = Math.round(height * 0.25);
  const chartBottom = Math.round(height * 0.73);
  const chartLeft = padX;
  const chartRight = width - padX;
  const min = Math.min(...series.prices);
  const max = Math.max(...series.prices);
  const span = max - min || 1;
  const dx = (chartRight - chartLeft) / (series.prices.length - 1);
  const points = series.prices.map((value, index) => {
    const x = chartLeft + dx * index;
    const y = chartBottom - ((value - min) / span) * (chartBottom - chartTop);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");

  const titleSize = Math.round(Math.min(width, height) * 0.052 * scale);
  const bodySize = Math.round(Math.min(width, height) * 0.025 * scale);
  const smallSize = Math.round(Math.min(width, height) * 0.019 * scale);
  const metricsLine = profile.showMetrics
    ? `<text x="${padX}" y="${Math.round(height * 0.82)}" font-size="${smallSize}">Daily mean ${metrics.meanReturnDaily.toFixed(6)} · Daily σ ${metrics.stdReturnDaily.toFixed(6)} · Annualized Sharpe ${metrics.sharpeAnnual.toFixed(3)}</text>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-desc">`,
    `<title id="chart-title">${escapeXml(series.symbol)} market chart</title>`,
    `<desc id="chart-desc">${escapeXml(series.range)} ${escapeXml(series.interval)} chart generated ${escapeXml(series.generatedAt)}</desc>`,
    `<rect width="100%" height="100%" fill="white"/>`,
    `<text x="${padX}" y="${headerY}" font-size="${titleSize}" font-weight="700">${escapeXml(profile.displayName)}</text>`,
    `<text x="${padX}" y="${Math.round(height * 0.18)}" font-size="${bodySize}" font-weight="600">${escapeXml(series.symbol)} · ${escapeXml(series.range)} · ${escapeXml(series.interval)}</text>`,
    `<line x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight}" y2="${chartBottom}" stroke="currentColor" opacity="0.25"/>`,
    `<polyline points="${points}" fill="none" stroke="currentColor" stroke-width="${Math.max(2, Math.round(width / 500))}"/>`,
    `<text x="${chartLeft}" y="${Math.round(height * 0.77)}" font-size="${smallSize}">${escapeXml(series.dates[0])}</text>`,
    `<text x="${chartRight}" y="${Math.round(height * 0.77)}" font-size="${smallSize}" text-anchor="end">${escapeXml(series.dates[series.dates.length - 1])}</text>`,
    metricsLine,
    `<text x="${padX}" y="${Math.round(height * 0.90)}" font-size="${smallSize}">Generated: ${escapeXml(series.generatedAt)}</text>`,
    `<text x="${padX}" y="${Math.round(height * 0.94)}" font-size="${smallSize}">Source / method: ${escapeXml(series.sourceLabel)}</text>`,
    `<text x="${padX}" y="${Math.round(height * 0.98)}" font-size="${smallSize}">${escapeXml(profile.footer)}</text>`,
    profile.logoPath ? `<!-- logo-path: ${escapeXml(profile.logoPath)} (reference only; not embedded in portable SVG) -->` : "",
    `</svg>`,
  ].filter(Boolean).join("\n");
}

export function creatorFileName(symbol: string, range: string, interval: string, presetId: CanvasPresetId): string {
  const safeSymbol = symbol.replace(/[^A-Za-z0-9._-]/g, "_");
  return `${safeSymbol}_${range}_${interval}_${presetId}.svg`;
}
