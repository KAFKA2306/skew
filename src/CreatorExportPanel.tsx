import { useEffect, useState } from "react";
import {
  BrandProfile,
  CANVAS_PRESETS,
  CanvasPresetId,
  CreatorMetrics,
  CreatorSeries,
  DEFAULT_BRAND_PROFILE,
  buildCreatorSvg,
  creatorFileName,
  parseBatchSymbols,
  validateBrandProfile,
} from "./creator-export";

type SeriesPayload = {
  symbol: string;
  dates: string[];
  prices: number[];
};

type AnalysisResult = {
  mean_return_daily: number;
  std_return_daily: number;
  sharpe_annual: number;
};

type Props = {
  series: SeriesPayload | null;
  analysis: AnalysisResult | null;
  range: string;
  interval: string;
  fetchSeries: (symbol: string) => Promise<{ series: SeriesPayload; analysis: AnalysisResult }>;
};

const PROFILE_KEY = "skew.creator.brand-profile.v1";
const EVENT_KEY = "skew.creator.events.v1";

type CreatorEvent = "template_previewed" | "creator_cta_clicked" | "purchase_or_inquiry_started";

function recordEvent(event: CreatorEvent) {
  try {
    const current = JSON.parse(localStorage.getItem(EVENT_KEY) || "{}") as Record<string, number>;
    current[event] = (current[event] || 0) + 1;
    localStorage.setItem(EVENT_KEY, JSON.stringify(current));
  } catch {
    // Analytics are deliberately local-only and non-blocking.
  }
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toCreatorSeries(series: SeriesPayload, range: string, interval: string): CreatorSeries {
  return {
    symbol: series.symbol,
    range,
    interval,
    dates: series.dates,
    prices: series.prices,
    generatedAt: new Date().toISOString(),
    sourceLabel: "Yahoo Finance chart endpoint via local Tauri command; app-side SVG rendering",
  };
}

function toMetrics(analysis: AnalysisResult): CreatorMetrics {
  return {
    meanReturnDaily: analysis.mean_return_daily,
    stdReturnDaily: analysis.std_return_daily,
    sharpeAnnual: analysis.sharpe_annual,
  };
}

export default function CreatorExportPanel({ series, analysis, range, interval, fetchSeries }: Props) {
  const [preset, setPreset] = useState<CanvasPresetId>("video-16-9");
  const [profile, setProfile] = useState<BrandProfile>(DEFAULT_BRAND_PROFILE);
  const [batchInput, setBatchInput] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved) setProfile(validateBrandProfile(JSON.parse(saved) as BrandProfile));
    } catch {
      setStatus("保存済みBrand Profileを読み込めなかったため既定値を使用しています。");
    }
  }, []);

  function saveProfile() {
    try {
      const clean = validateBrandProfile(profile);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(clean));
      setProfile(clean);
      setStatus("Brand Profileをローカル保存しました。");
    } catch (error) {
      setStatus(String(error));
    }
  }

  function exportProfileJson() {
    const clean = validateBrandProfile(profile);
    downloadText("skew-brand-profile.json", `${JSON.stringify(clean, null, 2)}\n`, "application/json");
  }

  function importProfileJson(file: File | undefined) {
    if (!file) return;
    file.text().then((text) => {
      const clean = validateBrandProfile(JSON.parse(text) as BrandProfile);
      setProfile(clean);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(clean));
      setStatus("Brand Profile JSONを読み込みました。");
    }).catch((error) => setStatus(String(error)));
  }

  function exportCurrent() {
    if (!series || !analysis) return;
    try {
      const svg = buildCreatorSvg(toCreatorSeries(series, range, interval), toMetrics(analysis), profile, preset);
      downloadText(creatorFileName(series.symbol, range, interval, preset), svg, "image/svg+xml");
      recordEvent("template_previewed");
      setStatus(`${series.symbol} を ${preset} SVGで書き出しました。`);
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function exportBatch() {
    try {
      const symbols = parseBatchSymbols(batchInput);
      setBatchBusy(true);
      for (const symbol of symbols) {
        const result = await fetchSeries(symbol);
        const svg = buildCreatorSvg(toCreatorSeries(result.series, range, interval), toMetrics(result.analysis), profile, preset);
        downloadText(creatorFileName(result.series.symbol, range, interval, preset), svg, "image/svg+xml");
      }
      recordEvent("template_previewed");
      setStatus(`${symbols.length}銘柄のCreator Batchを書き出しました。`);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <section className="creator-export" aria-labelledby="creator-export-title">
      <div className="creator-export-heading">
        <div>
          <p className="eyebrow">Creator Export</p>
          <h2 id="creator-export-title">同じブランドで、そのまま投稿できるSVGへ</h2>
        </div>
        <span className="local-only">Profile / analytics: local only</span>
      </div>

      <div className="creator-grid">
        <div className="creator-card">
          <h3>1. Canvas</h3>
          <label>Preset
            <select value={preset} onChange={(event) => setPreset(event.target.value as CanvasPresetId)} className="select-input">
              {CANVAS_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" disabled={!series || !analysis} onClick={exportCurrent}>Export SVG</button>
        </div>

        <div className="creator-card">
          <h3>2. Brand Profile</h3>
          <label>Display name<input value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} /></label>
          <label>Logo path (reference only)<input value={profile.logoPath} onChange={(event) => setProfile({ ...profile, logoPath: event.target.value })} /></label>
          <label>Footer<input value={profile.footer} onChange={(event) => setProfile({ ...profile, footer: event.target.value })} /></label>
          <label>Font scale<input type="number" min="0.75" max="1.5" step="0.05" value={profile.fontScale} onChange={(event) => setProfile({ ...profile, fontScale: Number(event.target.value) })} /></label>
          <label className="check-row"><input type="checkbox" checked={profile.showMetrics} onChange={(event) => setProfile({ ...profile, showMetrics: event.target.checked })} /> Metricsを表示</label>
          <div className="button-row">
            <button className="btn btn-secondary" onClick={saveProfile}>ローカル保存</button>
            <button className="btn btn-secondary" onClick={exportProfileJson}>JSON保存</button>
            <label className="btn btn-secondary file-button">JSON読込<input type="file" accept="application/json,.json" onChange={(event) => importProfileJson(event.target.files?.[0])} /></label>
          </div>
        </div>

        <div className="creator-card">
          <h3>3. Creator Batch</h3>
          <p>同一profile / presetで最大10銘柄。空白またはカンマ区切り。</p>
          <textarea rows={4} placeholder="7203.T, NVDA, MSFT" value={batchInput} onChange={(event) => setBatchInput(event.target.value)} />
          <button className="btn btn-primary" disabled={batchBusy} onClick={exportBatch}>{batchBusy ? "書き出し中..." : "Batch Export"}</button>
        </div>
      </div>

      <div className="creator-business-row">
        <div><strong>Free</strong><span> 3 presets / local profile / SVG export</span></div>
        <div><strong>Paid PoC candidate</strong><span> custom template / team presets / delivery workflow</span></div>
        <a href="https://github.com/KAFKA2306/skew/issues/6" target="_blank" rel="noreferrer" onClick={() => recordEvent("creator_cta_clicked")}>仕様・フィードバック</a>
        <a href="https://github.com/KAFKA2306/skew/issues/6" target="_blank" rel="noreferrer" onClick={() => recordEvent("purchase_or_inquiry_started")}>PoC相談</a>
      </div>
      {status && <p className="creator-status" role="status">{status}</p>}
    </section>
  );
}
