#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use chrono::{Duration, NaiveDateTime, TimeZone, Utc};
use std::sync::Arc;
use tokio::sync::RwLock;
use lru::LruCache;
use std::num::NonZeroUsize;
use thiserror::Error;
use tracing::{info, error, warn, debug};
use uuid::Uuid;

// ---- エラー型定義 ----
#[derive(Error, Debug)]
pub enum AppError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("Cache error: {0}")]
    Cache(String),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Yahoo Finance API error: {0}")]
    YahooFinance(String),
    #[error("Data parsing error: {0}")]
    DataParsing(String),
    #[error("Storage error: {0}")]
    Storage(String),
}

impl From<AppError> for String {
    fn from(error: AppError) -> String {
        error.to_string()
    }
}

// ---- セキュアなキャッシュマネージャー ----
#[derive(Debug)]
pub struct SecureCacheManager {
    store: Arc<RwLock<LruCache<String, CachedData>>>,
    max_size_bytes: usize,
    current_size_bytes: Arc<RwLock<usize>>,
    session_id: String,
}

impl SecureCacheManager {
    pub fn new(max_entries: usize, max_size_mb: usize) -> Self {
        let capacity = NonZeroUsize::new(max_entries).unwrap_or(NonZeroUsize::new(100).unwrap());
        Self {
            store: Arc::new(RwLock::new(LruCache::new(capacity))),
            max_size_bytes: max_size_mb * 1024 * 1024, // MB to bytes
            current_size_bytes: Arc::new(RwLock::new(0)),
            session_id: Uuid::new_v4().to_string(),
        }
    }

    pub async fn get(&self, key: &str) -> Option<CachedData> {
        debug!("Cache GET request for key: {}", key);
        let store = self.store.read().await;
        let result = store.peek(key).cloned();
        
        if let Some(ref data) = result {
            if data.is_expired() {
                drop(store);
                self.remove(key).await;
                return None;
            }
            debug!("Cache HIT for key: {}", key);
        } else {
            debug!("Cache MISS for key: {}", key);
        }
        
        result
    }

    pub async fn set(&self, key: String, data: CachedData) -> Result<(), AppError> {
        let data_size = self.estimate_size(&data);
        
        // メモリ制限チェック
        {
            let current_size = *self.current_size_bytes.read().await;
            if current_size + data_size > self.max_size_bytes {
                warn!("Cache size limit exceeded, cleaning up");
                self.cleanup_lru().await?;
            }
        }
        
        debug!("Cache SET for key: {}, size: {} bytes", key, data_size);
        
        {
            let mut store = self.store.write().await;
            if let Some(old_data) = store.put(key.clone(), data) {
                let old_size = self.estimate_size(&old_data);
                let mut current_size = self.current_size_bytes.write().await;
                *current_size = current_size.saturating_sub(old_size).saturating_add(data_size);
            } else {
                let mut current_size = self.current_size_bytes.write().await;
                *current_size = current_size.saturating_add(data_size);
            }
        }
        
        Ok(())
    }

    pub async fn remove(&self, key: &str) -> bool {
        debug!("Cache REMOVE for key: {}", key);
        let mut store = self.store.write().await;
        if let Some(data) = store.pop(key) {
            let data_size = self.estimate_size(&data);
            let mut current_size = self.current_size_bytes.write().await;
            *current_size = current_size.saturating_sub(data_size);
            true
        } else {
            false
        }
    }

    pub async fn clear(&self) -> usize {
        info!("Clearing all cache entries");
        let mut store = self.store.write().await;
        let count = store.len();
        store.clear();
        
        let mut current_size = self.current_size_bytes.write().await;
        *current_size = 0;
        
        count
    }

    pub async fn cleanup_expired(&self) -> usize {
        info!("Cleaning up expired cache entries");
        let mut store = self.store.write().await;
        let mut expired_keys = Vec::new();
        
        for (key, data) in store.iter() {
            if data.is_expired() {
                expired_keys.push(key.clone());
            }
        }
        
        let mut removed_size = 0;
        for key in &expired_keys {
            if let Some(data) = store.pop(key) {
                removed_size += self.estimate_size(&data);
            }
        }
        
        let mut current_size = self.current_size_bytes.write().await;
        *current_size = current_size.saturating_sub(removed_size);
        
        let count = expired_keys.len();
        drop(store);
        
        info!("Removed {} expired entries, freed {} bytes", count, removed_size);
        count
    }

    async fn cleanup_lru(&self) -> Result<(), AppError> {
        let mut store = self.store.write().await;
        let target_size = self.max_size_bytes / 2; // 半分まで減らす
        let mut current_size = *self.current_size_bytes.read().await;
        let mut removed_size = 0;
        let mut removed_count = 0;
        
        while current_size > target_size && !store.is_empty() {
            if let Some((_, data)) = store.pop_lru() {
                let data_size = self.estimate_size(&data);
                removed_size += data_size;
                current_size = current_size.saturating_sub(data_size);
                removed_count += 1;
            } else {
                break;
            }
        }
        
        let mut size_guard = self.current_size_bytes.write().await;
        *size_guard = current_size;
        
        warn!("LRU cleanup: removed {} entries, freed {} bytes", removed_count, removed_size);
        Ok(())
    }

    fn estimate_size(&self, data: &CachedData) -> usize {
        // 簡単なサイズ推定（実際はより精密な計算が必要）
        let base_size = std::mem::size_of::<CachedData>();
        let data_size = data.data.prices.len() * 8 + // f64のサイズ
                       data.data.dates.iter().map(|s| s.len()).sum::<usize>() +
                       data.analysis.returns.len() * 8 +
                       data.analysis.sma5.len() * 16 + // Option<f64>
                       data.analysis.sma20.len() * 16;
        base_size + data_size
    }

    pub async fn get_stats(&self) -> CacheStats {
        let store = self.store.read().await;
        let current_size = *self.current_size_bytes.read().await;
        
        CacheStats {
            entry_count: store.len(),
            size_bytes: current_size,
            max_size_bytes: self.max_size_bytes,
            session_id: self.session_id.clone(),
        }
    }
}

#[derive(Serialize, Debug)]
pub struct CacheStats {
    entry_count: usize,
    size_bytes: usize,
    max_size_bytes: usize,
    session_id: String,
}

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

// ---- 改良されたキャッシュデータ構造 ----
#[derive(Serialize, Deserialize, Clone, Debug)]
struct CachedData {
    data: Arc<SeriesPayload>, // Arc使用でクローンコスト削減
    analysis: Arc<AnalysisResult>,
    cached_at: chrono::DateTime<Utc>,
    ttl_minutes: i64,
}

impl CachedData {
    fn new(data: SeriesPayload, analysis: AnalysisResult, ttl_minutes: i64) -> Self {
        Self {
            data: Arc::new(data),
            analysis: Arc::new(analysis),
            cached_at: Utc::now(),
            ttl_minutes,
        }
    }

    fn is_expired(&self) -> bool {
        let now = Utc::now();
        let expiry = self.cached_at + Duration::minutes(self.ttl_minutes);
        now > expiry
    }
}

#[derive(Serialize, Debug)]
struct CacheEntryInfo {
    key: String,
    cached_at: String,
    ttl_minutes: i64,
    data_points: usize,
}

// ---- 画面へ返す系列＆解析結果 ----
#[derive(Serialize, Deserialize, Clone)]
struct SeriesPayload {
  symbol: String,
  dates: Vec<String>,
  prices: Vec<f64>,
  cached: Option<bool>,
  cached_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct AnalysisResult {
  mean_return_daily: f64,
  std_return_daily: f64,
  sharpe_annual: f64,
  sma5: Vec<Option<f64>>,
  sma20: Vec<Option<f64>>,
  returns: Vec<f64>,
}

// ---- ビジネスロジック層 ----
pub struct YahooFinanceService {
    client: reqwest::Client,
    cache: Arc<SecureCacheManager>,
}

impl YahooFinanceService {
    pub fn new(cache: Arc<SecureCacheManager>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (Tauri/Financial-Dashboard)")
            .build()
            .unwrap();
        
        Self { client, cache }
    }

    pub async fn get_financial_data(&self, symbol: &str, range: &str, interval: &str) -> Result<(SeriesPayload, AnalysisResult), AppError> {
        let cache_key = self.generate_cache_key(symbol, range, interval);
        
        // キャッシュ確認
        if let Some(cached_data) = self.cache.get(&cache_key).await {
            info!("Cache HIT for {}", cache_key);
            let mut payload = (*cached_data.data).clone();
            payload.cached = Some(true);
            payload.cached_at = Some(cached_data.cached_at.to_rfc3339());
            return Ok((payload, (*cached_data.analysis).clone()));
        }

        info!("Cache MISS for {}, fetching from Yahoo Finance", cache_key);
        
        // 新しいデータを取得
        let series_data = self.fetch_from_yahoo(symbol, range, interval).await?;
        let analysis_result = self.analyze_financial_data(&series_data.prices)?;
        
        // キャッシュに保存
        let cached_data = CachedData::new(series_data.clone(), analysis_result.clone(), 15);
        if let Err(e) = self.cache.set(cache_key, cached_data).await {
            error!("Failed to cache data: {}", e);
        }
        
        let mut final_payload = series_data;
        final_payload.cached = Some(false);
        final_payload.cached_at = None;
        
        Ok((final_payload, analysis_result))
    }

    async fn fetch_from_yahoo(&self, symbol: &str, range: &str, interval: &str) -> Result<SeriesPayload, AppError> {
        let url = format!(
            "https://query1.finance.yahoo.com/v8/finance/chart/{}?range={}&interval={}&events=div,splits",
            urlencoding::encode(symbol), range, interval
        );
        
        debug!("Fetching from URL: {}", url);
        
        let response = self.client
            .get(&url)
            .send()
            .await?;
        
        if !response.status().is_success() {
            return Err(AppError::YahooFinance(format!("HTTP {}: {}", response.status(), url)));
        }
        
        let chart_response: ChartResponse = response.json().await
            .map_err(|e| AppError::YahooFinance(format!("JSON parse error: {}", e)))?;
        
        let result = chart_response.chart.result
            .ok_or_else(|| AppError::YahooFinance("No result in response".to_string()))?
            .into_iter()
            .next()
            .ok_or_else(|| AppError::YahooFinance("Empty result".to_string()))?;
        
        let timestamps = result.timestamp.unwrap_or_default();
        let closes = result.indicators.quote.get(0)
            .and_then(|q| q.close.clone())
            .ok_or_else(|| AppError::YahooFinance("No close data".to_string()))?;

        let mut dates = Vec::new();
        let mut prices = Vec::new();
        
        for (i, &ts) in timestamps.iter().enumerate() {
            if let Some(Some(price)) = closes.get(i) {
                let dt = Utc.timestamp_opt(ts, 0).single()
                    .unwrap_or_else(|| Utc.from_utc_datetime(&NaiveDateTime::from_timestamp_opt(ts, 0).unwrap()));
                dates.push(dt.date_naive().to_string());
                prices.push(*price);
            }
        }
        
        if prices.len() < 2 {
            return Err(AppError::DataParsing("Insufficient price data".to_string()));
        }
        
        Ok(SeriesPayload {
            symbol: result.meta.symbol,
            dates,
            prices,
            cached: Some(false),
            cached_at: None,
        })
    }

    fn analyze_financial_data(&self, prices: &[f64]) -> Result<AnalysisResult, AppError> {
        if prices.len() < 2 {
            return Err(AppError::DataParsing("Insufficient data for analysis".to_string()));
        }
        
        let mut returns = vec![0.0; prices.len()];
        for i in 1..prices.len() {
            returns[i] = prices[i] / prices[i-1] - 1.0;
        }
        
        let n = prices.len() as f64;
        let mean = returns.iter().sum::<f64>() / n;
        let var = returns.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n.max(1.0);
        let std = var.sqrt();
        let sharpe = if std > 0.0 { (mean * 252.0_f64.sqrt()) / std } else { 0.0 };

        let sma5 = Self::calculate_sma(prices, 5);
        let sma20 = Self::calculate_sma(prices, 20);
        
        Ok(AnalysisResult {
            mean_return_daily: mean,
            std_return_daily: std,
            sharpe_annual: sharpe,
            sma5,
            sma20,
            returns,
        })
    }

    fn calculate_sma(prices: &[f64], window: usize) -> Vec<Option<f64>> {
        let mut result = vec![None; prices.len()];
        if window == 0 { return result; }
        
        let mut sum = 0.0;
        for i in 0..prices.len() {
            sum += prices[i];
            if i >= window { sum -= prices[i - window]; }
            if i + 1 >= window { result[i] = Some(sum / (window as f64)); }
        }
        
        result
    }

    fn generate_cache_key(&self, symbol: &str, range: &str, interval: &str) -> String {
        format!("{}:{}:{}", symbol, range, interval)
    }
}

// ---- Tauriコマンド層 ----
#[tauri::command]
async fn fetch_yahoo(symbol: String, range: String, interval: String, service: tauri::State<'_, YahooFinanceService>) -> Result<SeriesPayload, String> {
    match service.get_financial_data(&symbol, &range, &interval).await {
        Ok((series_payload, _)) => Ok(series_payload),
        Err(e) => {
            error!("fetch_yahoo error: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn analyze_series(symbol: String, range: String, interval: String, service: tauri::State<'_, YahooFinanceService>) -> Result<AnalysisResult, String> {
    match service.get_financial_data(&symbol, &range, &interval).await {
        Ok((_, analysis_result)) => Ok(analysis_result),
        Err(e) => {
            error!("analyze_series error: {}", e);
            Err(e.to_string())
        }
    }
}

// ---- キャッシュ管理コマンド ----
#[tauri::command]
async fn clear_cache(service: tauri::State<'_, YahooFinanceService>) -> Result<String, String> {
    let count = service.cache.clear().await;
    info!("Cache cleared: {} entries removed", count);
    Ok(format!("{}件のキャッシュエントリを削除しました", count))
}

#[tauri::command]
async fn get_cache_info(service: tauri::State<'_, YahooFinanceService>) -> Result<CacheStats, String> {
    Ok(service.cache.get_stats().await)
}

#[tauri::command]
async fn remove_expired_cache(service: tauri::State<'_, YahooFinanceService>) -> Result<String, String> {
    let count = service.cache.cleanup_expired().await;
    info!("Expired cache cleaned: {} entries removed", count);
    Ok(format!("{}件の期限切れキャッシュを削除しました", count))
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

// ---- ユーザー設定関連 ----
#[derive(Serialize, Deserialize, Clone)]
struct UserSettings {
  default_symbol: String,
  default_range: String,
  default_interval: String,
  cache_ttl_minutes: i64,
  theme: String,
}

impl Default for UserSettings {
  fn default() -> Self {
    Self {
      default_symbol: "7203.T".to_string(),
      default_range: "1y".to_string(),
      default_interval: "1d".to_string(),
      cache_ttl_minutes: 15,
      theme: "light".to_string(),
    }
  }
}

#[tauri::command]
async fn get_user_settings(app: tauri::AppHandle) -> Result<UserSettings, String> {
  let stores = app.store_collection();
  let store = stores
    .get("settings.json")
    .ok_or("設定ストア取得失敗")?;
  
  if let Some(settings_value) = store.get("user_settings") {
    serde_json::from_value(settings_value.clone())
      .map_err(|e| format!("設定デシリアライズエラー: {}", e))
  } else {
    Ok(UserSettings::default())
  }
}

#[tauri::command]
async fn save_user_settings(settings: UserSettings, app: tauri::AppHandle) -> Result<String, String> {
  let stores = app.store_collection();
  let store = stores
    .get("settings.json")
    .ok_or("設定ストア取得失敗")?;
  
  let settings_value = serde_json::to_value(&settings)
    .map_err(|e| format!("設定シリアライズエラー: {}", e))?;
  
  store.set("user_settings", settings_value);
  store.save().await
    .map_err(|e| format!("設定保存エラー: {}", e))?;
  
  Ok("設定を保存しました".to_string())
}

// 重複した関数を削除


fn main() {
    // ロギング初期化
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();
    
    info!("Starting Financial Dashboard Application");
    
    // セキュアキャッシュマネージャーを初期化 (最大100エントリ、50MB)
    let cache_manager = Arc::new(SecureCacheManager::new(100, 50));
    
    // Yahoo Financeサービスを初期化
    let yahoo_service = YahooFinanceService::new(cache_manager.clone());
    
    // バックグラウンドでキャッシュクリーンアップタスクを開始
    let cleanup_cache = cache_manager.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(300)); // 5分間隔
        loop {
            interval.tick().await;
            cleanup_cache.cleanup_expired().await;
        }
    });
    
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(yahoo_service)
        .invoke_handler(tauri::generate_handler![
            fetch_yahoo, analyze_series, save_csv, save_yaml,
            clear_cache, get_cache_info, remove_expired_cache,
            get_user_settings, save_user_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
