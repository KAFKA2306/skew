#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use chrono::{NaiveDateTime, TimeZone, Utc};

// ---- Yahoo Finance v8 chart 応答（必要最小） ----
#[derive(Deserialize)]
struct ChartResponse { chart: Chart }
#[derive(Deserialize)]
struct Chart {
  result: Option<Vec<ResultItem>>,
  error: Option<serde_json::Value>,
}
#[derive(Deserialize)]
struct ResultItem {
  timestamp: Option<Vec<i64>>,
  indicators: Indicators,
  meta: Meta,
}
#[derive(Deserialize)]
struct Indicators { quote: Vec<Quote> }
#[derive(Deserialize)]
struct Quote { close: Option<Vec<Option<f64>>> }
#[derive(Deserialize)]
struct Meta { symbol: String, timezone: String }

// ---- 画面へ返す系列＆解析結果 ----
#[derive(Serialize)]
struct SeriesPayload {
  symbol: String,
  dates: Vec<String>,
  prices: Vec<f64>,
}
#[derive(Serialize)]
struct AnalysisResult {
  mean_return_daily: f64,
  std_return_daily: f64,
  sharpe_annual: f64,
  sma5: Vec<Option<f64>>,
  sma20: Vec<Option<f64>>,
  returns: Vec<f64>,
}

// ---- 取得：Yahoo Finance（RustでHTTP） ----
#[tauri::command]
async fn fetch_yahoo(symbol: String, range: String, interval: String) -> Result<SeriesPayload, String> {
  let url = format!(
    "https://query1.finance.yahoo.com/v8/finance/chart/{}?range={}&interval={}&events=div,splits",
    urlencoding::encode(&symbol), range, interval
  );
  let resp = reqwest::Client::new()
    .get(&url).header("User-Agent", "Mozilla/5.0 (Tauri)")
    .send().await.map_err(|e| e.to_string())?;
  if !resp.status().is_success() {
    return Err(format!("HTTP {}: {}", resp.status(), url));
  }
  let data: ChartResponse = resp.json().await.map_err(|e| e.to_string())?;
  let result = data.chart.result.ok_or("No result")?
    .into_iter().next().ok_or("Empty result")?;
  let timestamps = result.timestamp.unwrap_or_default();
  let closes = result.indicators.quote.get(0)
    .and_then(|q| q.close.clone()).ok_or("No close data")?;

  let mut dates = Vec::new();
  let mut prices = Vec::new();
  for (i, ts) in timestamps.iter().enumerate() {
    if let Some(Some(c)) = closes.get(i).map(|x| x.as_ref()) {
      let dt = Utc.timestamp_opt(*ts, 0).single()
        .unwrap_or_else(|| Utc.from_utc_datetime(&NaiveDateTime::from_timestamp_opt(*ts, 0).unwrap()));
      dates.push(dt.date_naive().to_string()); // YYYY-MM-DD
      prices.push(*c);
    }
  }
  if prices.len() < 2 { return Err("価格データが不足しています".into()); }
  Ok(SeriesPayload { symbol: result.meta.symbol, dates, prices })
}

// ---- 解析：リターン/SMA/Sharpe ----
#[tauri::command]
fn analyze_series(prices: Vec<f64>) -> Result<AnalysisResult, String> {
  if prices.len() < 2 { return Err("データ不足".into()); }
  let mut returns = vec![0.0; prices.len()];
  for i in 1..prices.len() { returns[i] = prices[i] / prices[i-1] - 1.0; }
  let n = prices.len() as f64;
  let mean = returns.iter().sum::<f64>() / n;
  let var = returns.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n.max(1.0);
  let std = var.sqrt();
  let sharpe = if std > 0.0 { (mean * 252.0_f64.sqrt()) / std } else { 0.0 };

  fn sma(xs: &Vec<f64>, w: usize) -> Vec<Option<f64>> {
    let mut out = vec![None; xs.len()];
    if w == 0 { return out; }
    let mut s = 0.0;
    for i in 0..xs.len() {
      s += xs[i];
      if i >= w { s -= xs[i-w]; }
      if i + 1 >= w { out[i] = Some(s / (w as f64)); }
    }
    out
  }
  Ok(AnalysisResult {
    mean_return_daily: mean,
    std_return_daily: std,
    sharpe_annual: sharpe,
    sma5: sma(&prices, 5),
    sma20: sma(&prices, 20),
    returns,
  })
}

// ---- 保存：CSV ----
#[tauri::command]
fn save_csv(
  dates: Vec<String>, prices: Vec<f64>, returns: Vec<f64>,
  sma5: Vec<Option<f64>>, sma20: Vec<Option<f64>>, output_path: String
) -> Result<String, String> {
  if !(dates.len()==prices.len() && prices.len()==returns.len() && returns.len()==sma5.len() && sma5.len()==sma20.len()) {
    return Err("列長が一致しません".into());
  }
  let mut w = csv::Writer::from_path(&output_path).map_err(|e| e.to_string())?;
  w.write_record(["Date","Close","Return","SMA5","SMA20"]).map_err(|e| e.to_string())?;
  for i in 0..dates.len() {
    w.write_record(&[
      dates[i].as_str(),
      prices[i].to_string().as_str(),
      returns[i].to_string().as_str(),
      sma5[i].map(|x| x.to_string()).unwrap_or_default().as_str(),
      sma20[i].map(|x| x.to_string()).unwrap_or_default().as_str(),
    ]).map_err(|e| e.to_string())?;
  }
  w.flush().map_err(|e| e.to_string())?;
  Ok(output_path)
}

// ---- 保存：YAML（メタ＋メトリクス＋行） ----
#[derive(Serialize)]
struct YamlRow { date: String, close: f64, r#return: f64, sma5: Option<f64>, sma20: Option<f64> }
#[derive(Serialize)]
struct YamlParams { range: String, interval: String, source: String }
#[derive(Serialize)]
struct YamlMetrics { count: usize, mean_return_daily: f64, std_return_daily: f64, sharpe_annual: f64 }
#[derive(Serialize)]
struct YamlReport { symbol: String, params: YamlParams, generated_at: String, metrics: YamlMetrics, rows: Vec<YamlRow> }

#[tauri::command]
fn save_yaml(
  symbol: String, range: String, interval: String,
  dates: Vec<String>, prices: Vec<f64>, returns: Vec<f64>,
  sma5: Vec<Option<f64>>, sma20: Vec<Option<f64>>,
  mean_return_daily: f64, std_return_daily: f64, sharpe_annual: f64,
  output_path: String
) -> Result<String, String> {
  let n = dates.len();
  if !(n==prices.len() && n==returns.len() && n==sma5.len() && n==sma20.len()) {
    return Err("列長が一致しません（dates/prices/returns/sma5/sma20）".into());
  }
  let mut rows = Vec::with_capacity(n);
  for i in 0..n {
    rows.push(YamlRow {
      date: dates[i].clone(), close: prices[i], r#return: returns[i],
      sma5: sma5[i], sma20: sma20[i],
    });
  }
  let report = YamlReport {
    symbol,
    params: YamlParams { range, interval, source: "Yahoo Finance Chart API".into() },
    generated_at: Utc::now().to_rfc3339(),
    metrics: YamlMetrics { count: n, mean_return_daily, std_return_daily, sharpe_annual },
    rows,
  };
  let file = std::fs::File::create(&output_path).map_err(|e| e.to_string())?;
  serde_yaml::to_writer(file, &report).map_err(|e| e.to_string())?;
  Ok(output_path)
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![fetch_yahoo, analyze_series, save_csv, save_yaml])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
