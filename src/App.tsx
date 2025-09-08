import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as saveDialog, message } from "@tauri-apps/plugin-dialog";
import { open as openExternal } from "@tauri-apps/plugin-opener";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

type SeriesPayload = { symbol: string; dates: string[]; prices: number[]; };
type AnalysisResult = {
  mean_return_daily: number; std_return_daily: number; sharpe_annual: number;
  sma5: (number|null)[]; sma20: (number|null)[]; returns: number[];
};

export default function App() {
  const [symbol, setSymbol] = useState("7203.T");
  const [range, setRange] = useState("1y");
  const [interval, setInterval] = useState("1d");
  const [busy, setBusy] = useState(false);
  const [series, setSeries] = useState<SeriesPayload | null>(null);
  const [ana, setAna] = useState<AnalysisResult | null>(null);

  const chartData = useMemo(() => {
    if (!series || !ana) return [];
    return series.dates.map((d, i) => ({
      date: d, close: series.prices[i], sma5: ana.sma5[i] ?? null, sma20: ana.sma20[i] ?? null,
    }));
  }, [series, ana]);

  async function fetchAndAnalyze() {
    try {
      setBusy(true);
      const s = await invoke<SeriesPayload>("fetch_yahoo", { symbol, range, interval });
      setSeries(s);
      const a = await invoke<AnalysisResult>("analyze_series", { prices: s.prices });
      setAna(a);
    } catch (e) {
      console.error(e);
      await message(String(e), { title: "Error", kind: "error" });
    } finally { setBusy(false); }
  }

  async function saveCsv() {
    if (!series || !ana) return;
    const out = await saveDialog({ defaultPath: `${series.symbol}_${range}_${interval}.csv` });
    if (!out) return;
    try {
      const saved = await invoke<string>("save_csv", {
        dates: series.dates, prices: series.prices, returns: ana.returns,
        sma5: ana.sma5, sma20: ana.sma20, output_path: out,
      });
      await message("CSVを保存しました。開きますか？", { title: "保存", kind: "info" });
      await openExternal(saved);
    } catch (e) { await message(String(e), { title: "保存エラー", kind: "error" }); }
  }

  async function saveYaml() {
    if (!series || !ana) return;
    const out = await saveDialog({ defaultPath: `${series.symbol}_${range}_${interval}.yaml` });
    if (!out) return;
    try {
      const saved = await invoke<string>("save_yaml", {
        symbol: series.symbol, range, interval,
        dates: series.dates, prices: series.prices, returns: ana.returns,
        sma5: ana.sma5, sma20: ana.sma20,
        mean_return_daily: ana.mean_return_daily, std_return_daily: ana.std_return_daily, sharpe_annual: ana.sharpe_annual,
        output_path: out,
      });
      await message("YAMLを保存しました。開きますか？", { title: "保存", kind: "info" });
      await openExternal(saved);
    } catch (e) { await message(String(e), { title: "保存エラー", kind: "error" }); }
  }

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, Segoe UI, Roboto, Noto Sans JP, sans-serif" }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>KAFKAミニ・yfダッシュボード</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <label>Symbol: <input value={symbol} onChange={e => setSymbol(e.target.value)} style={{ width: 140 }}/></label>
          <label>Range:
            <select value={range} onChange={e => setRange(e.target.value)} style={{ marginLeft: 4 }}>
              {["1mo","3mo","6mo","1y","2y","5y","10y","ytd","max"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label>Interval:
            <select value={interval} onChange={e => setInterval(e.target.value)} style={{ marginLeft: 4 }}>
              {["1d","1wk","1mo"].map(iv => <option key={iv} value={iv}>{iv}</option>)}
            </select>
          </label>
          <button onClick={fetchAndAnalyze} disabled={busy} style={{ padding: "6px 10px" }}>
            {busy ? "取得中..." : "取得＆解析"}
          </button>
          <button onClick={saveCsv} disabled={!series || !ana} style={{ padding: "6px 10px" }}>CSV保存</button>
          <button onClick={saveYaml} disabled={!series || !ana} style={{ padding: "6px 10px" }}>YAML保存</button>
        </div>

        {series && ana && (
          <>
            <div style={{ marginTop: 12 }}>
              <strong>{series.symbol}</strong> ・ 日次平均 {ana.mean_return_daily.toFixed(6)} ・
              日次σ {ana.std_return_daily.toFixed(6)} ・ 年率Sharpe {ana.sharpe_annual.toFixed(3)}
            </div>
            <div style={{ width: "100%", height: 360, marginTop: 12 }}>
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={24} />
                  <YAxis tick={{ fontSize: 10 }} domain={["auto","auto"]} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="close" dot={false} name="Close" />
                  <Line type="monotone" dataKey="sma5" dot={false} name="SMA5" />
                  <Line type="monotone" dataKey="sma20" dot={false} name="SMA20" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    );
}
