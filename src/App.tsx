import { useMemo, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as saveDialog, message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import "./App.css";

type SeriesPayload = { 
  symbol: string; 
  dates: string[]; 
  prices: number[]; 
  cached?: boolean;
  cached_at?: string;
};

type AnalysisResult = {
  mean_return_daily: number; std_return_daily: number; sharpe_annual: number;
  sma5: (number|null)[]; sma20: (number|null)[]; returns: number[];
};

type UserSettings = {
  default_symbol: string;
  default_range: string;
  default_interval: string;
  cache_ttl_minutes: number;
  theme: string;
};

type CacheEntry = {
  key: string;
  cached_data: {
    data: SeriesPayload;
    analysis: AnalysisResult;
    cached_at: string;
    ttl_minutes: number;
  };
};

export default function App() {
  const [symbol, setSymbol] = useState("7203.T");
  const [range, setRange] = useState("1y");
  const [interval, setInterval] = useState("1d");
  const [busy, setBusy] = useState(false);
  const [series, setSeries] = useState<SeriesPayload | null>(null);
  const [ana, setAna] = useState<AnalysisResult | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const [showCacheInfo, setShowCacheInfo] = useState(false);

  // LocalStorage関連
  const saveToLocalStorage = (key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error("LocalStorage保存エラー:", e);
    }
  };

  const loadFromLocalStorage = <T,>(key: string, defaultValue: T): T => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error("LocalStorage読み込みエラー:", e);
      return defaultValue;
    }
  };

  // 設定とUIステート初期化
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // サーバー設定読み込み
        const userSettings = await invoke<UserSettings>("get_user_settings");
        setSettings(userSettings);
        setSymbol(userSettings.default_symbol);
        setRange(userSettings.default_range);
        setInterval(userSettings.default_interval);
      } catch (e) {
        console.error("設定読み込みエラー:", e);
        setSettings({
          default_symbol: "7203.T",
          default_range: "1y", 
          default_interval: "1d",
          cache_ttl_minutes: 15,
          theme: "light"
        });
      }
      
      // LocalStorageからUI状態復元
      const savedShowCache = loadFromLocalStorage("showCacheInfo", false);
      setShowCacheInfo(savedShowCache);
    };
    
    initializeApp();
  }, []);

  // UIステート変更時の保存
  useEffect(() => {
    saveToLocalStorage("showCacheInfo", showCacheInfo);
  }, [showCacheInfo]);

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
      const a = await invoke<AnalysisResult>("analyze_series", { symbol, range, interval });
      setAna(a);
      
      // キャッシュ情報を更新
      if (showCacheInfo) {
        loadCacheInfo();
      }
    } catch (e) {
      console.error(e);
      await message(String(e), { title: "Error", kind: "error" });
    } finally { setBusy(false); }
  }

  async function loadCacheInfo() {
    try {
      const entries = await invoke<CacheEntry[]>("get_cache_info");
      setCacheEntries(entries);
    } catch (e) {
      console.error("キャッシュ情報取得エラー:", e);
      setCacheEntries([]);
    }
  }

  async function clearCache() {
    try {
      const result = await invoke<string>("clear_cache");
      await message(result, { title: "キャッシュクリア", kind: "info" });
      setCacheEntries([]);
      if (showCacheInfo) {
        loadCacheInfo();
      }
    } catch (e) {
      await message(String(e), { title: "エラー", kind: "error" });
    }
  }

  async function removeExpiredCache() {
    try {
      const result = await invoke<string>("remove_expired_cache");
      await message(result, { title: "期限切れキャッシュ削除", kind: "info" });
      if (showCacheInfo) {
        loadCacheInfo();
      }
    } catch (e) {
      await message(String(e), { title: "エラー", kind: "error" });
    }
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
      await openUrl(saved);
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
      await openUrl(saved);
    } catch (e) { await message(String(e), { title: "保存エラー", kind: "error" }); }
  }

  return (
    <div className="app-container">
        <h1 className="app-title">KAFKAミニ・yfダッシュボード</h1>
        <div className="controls-container">
          <div className="control-row">
            <label>Symbol: <input value={symbol} onChange={e => setSymbol(e.target.value)} className="input-symbol"/></label>
            <label>Range:
              <select value={range} onChange={e => setRange(e.target.value)} className="select-input">
                {["1mo","3mo","6mo","1y","2y","5y","10y","ytd","max"].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label>Interval:
              <select value={interval} onChange={e => setInterval(e.target.value)} className="select-input">
                {["1d","1wk","1mo"].map(iv => <option key={iv} value={iv}>{iv}</option>)}
              </select>
            </label>
          </div>
          <button onClick={fetchAndAnalyze} disabled={busy} className="btn btn-primary">
            {busy ? "取得中..." : "取得＆解析"}
          </button>
          <div className="control-row">
            <button onClick={saveCsv} disabled={!series || !ana} className="btn btn-secondary">CSV保存</button>
            <button onClick={saveYaml} disabled={!series || !ana} className="btn btn-secondary">YAML保存</button>
          </div>
          
          {/* キャッシュ管理セクション */}
          <div className="cache-section">
            <button 
              onClick={() => {
                setShowCacheInfo(!showCacheInfo);
                if (!showCacheInfo) loadCacheInfo();
              }} 
              className="btn btn-info"
            >
              {showCacheInfo ? "キャッシュ情報を隠す" : "キャッシュ情報を表示"}
            </button>
            
            {showCacheInfo && (
              <div className="cache-controls">
                <button onClick={loadCacheInfo} className="btn btn-secondary">更新</button>
                <button onClick={removeExpiredCache} className="btn btn-warning">期限切れ削除</button>
                <button onClick={clearCache} className="btn btn-danger">全削除</button>
              </div>
            )}
          </div>
        </div>

        {/* データステータス表示 */}
        {series && (
          <div className="data-status">
            <span className={`cache-indicator ${series.cached ? 'cached' : 'fresh'}`}>
              {series.cached ? '📄 キャッシュ済み' : '🌐 新規取得'}
            </span>
            {series.cached_at && (
              <span className="cache-time">
                取得日時: {new Date(series.cached_at).toLocaleString('ja-JP')}
              </span>
            )}
          </div>
        )}

        {/* キャッシュ情報テーブル */}
        {showCacheInfo && (
          <div className="cache-info">
            <h3>キャッシュエントリ ({cacheEntries.length}件)</h3>
            {cacheEntries.length > 0 ? (
              <div className="cache-table">
                {cacheEntries.map((entry, index) => (
                  <div key={index} className="cache-entry">
                    <div className="cache-key">{entry.key}</div>
                    <div className="cache-details">
                      <span>取得: {new Date(entry.cached_data.cached_at).toLocaleString('ja-JP')}</span>
                      <span>TTL: {entry.cached_data.ttl_minutes}分</span>
                      <span>データ点数: {entry.cached_data.data.prices.length}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-cache">キャッシュエントリはありません</p>
            )}
          </div>
        )}

        {series && ana && (
          <>
            <div className="stats-container">
              <strong>{series.symbol}</strong> ・ 日次平均 {ana.mean_return_daily.toFixed(6)} ・
              日次σ {ana.std_return_daily.toFixed(6)} ・ 年率Sharpe {ana.sharpe_annual.toFixed(3)}
            </div>
            <div className="chart-container">
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
