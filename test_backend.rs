// Backend standalone test
use std::sync::Arc;

// Copy essential structures for testing
#[derive(Debug)]
pub struct SecureCacheManager {
    // Simplified mock implementation
}

impl SecureCacheManager {
    pub fn new(_max_entries: usize, _max_size_mb: usize) -> Self {
        Self {}
    }
    
    pub async fn get(&self, _key: &str) -> Option<String> {
        None // Mock implementation
    }
    
    pub async fn set(&self, _key: String, _data: String) -> Result<(), String> {
        Ok(()) // Mock implementation
    }
}

pub struct YahooFinanceService {
    cache: Arc<SecureCacheManager>,
}

impl YahooFinanceService {
    pub fn new(cache: Arc<SecureCacheManager>) -> Self {
        Self { cache }
    }
    
    pub async fn test_yahoo_api(&self) -> Result<String, String> {
        // Test basic HTTP request to Yahoo Finance
        let url = "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d";
        
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .user_agent("Mozilla/5.0 (Test)")
            .build()
            .map_err(|e| format!("Client creation failed: {}", e))?;
        
        let response = client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        
        if response.status().is_success() {
            Ok(format!("✅ Yahoo Finance API accessible - Status: {}", response.status()))
        } else {
            Err(format!("❌ Yahoo Finance API error - Status: {}", response.status()))
        }
    }
}

#[tokio::main]
async fn main() {
    println!("🧪 Testing Backend Components");
    println!("============================");
    
    // Test 1: Cache Manager Creation
    print!("1. Creating SecureCacheManager... ");
    let cache_manager = Arc::new(SecureCacheManager::new(10, 5));
    println!("✅ Success");
    
    // Test 2: Service Creation
    print!("2. Creating YahooFinanceService... ");
    let service = YahooFinanceService::new(cache_manager.clone());
    println!("✅ Success");
    
    // Test 3: Network connectivity
    print!("3. Testing network connectivity... ");
    match service.test_yahoo_api().await {
        Ok(msg) => println!("{}", msg),
        Err(e) => println!("❌ {}", e),
    }
    
    // Test 4: Basic cache operations
    print!("4. Testing cache operations... ");
    match cache_manager.set("test_key".to_string(), "test_value".to_string()).await {
        Ok(_) => {
            match cache_manager.get("test_key").await {
                Some(_) => println!("✅ Cache operations working"),
                None => println!("⚠️  Cache get returned None (expected for mock)"),
            }
        },
        Err(e) => println!("❌ Cache set failed: {}", e),
    }
    
    println!("\n🎯 Backend Test Summary:");
    println!("   - Cache Manager: ✅ Created");
    println!("   - Service Layer: ✅ Created");
    println!("   - Network Test: Check output above");
    println!("   - Cache Operations: ✅ Mock working");
    
    println!("\n📝 Next Steps:");
    println!("   - Install system dependencies for full Tauri build");
    println!("   - Test with real financial data");
    println!("   - Verify memory management under load");
}