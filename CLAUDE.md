# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Frontend (React + Vite)
- `npm run dev` - Start development server
- `npm run build` - Build for production (runs TypeScript compilation and Vite build)
- `npm run preview` - Preview production build

### Tauri Desktop App
- `npm run tauri dev` - Start Tauri development mode (runs both frontend and backend)
- `npm run tauri build` - Build Tauri application for production

### Testing
- `npm run test` - Currently returns "No tests" - no test framework is configured

## Project Architecture

This is a **Tauri desktop application** that provides a financial dashboard for Yahoo Finance data analysis. The architecture follows a typical Tauri pattern with a React frontend communicating with a Rust backend via invoke calls.

### Frontend (React + TypeScript)
- **Technology**: React 18 with TypeScript, Vite as bundler
- **UI Library**: Recharts for charting, inline styles for layout
- **Main Component**: `src/App.tsx` - Single-page dashboard with Japanese UI text
- **Tauri Integration**: Uses `@tauri-apps/api` for backend communication and file dialogs

### Backend (Rust)
- **Technology**: Tauri 2.0 with Rust backend
- **Key Dependencies**: 
  - `reqwest` for HTTP requests to Yahoo Finance API
  - `serde`/`serde_json`/`serde_yaml` for serialization
  - `chrono` for date handling
  - `csv` for CSV export functionality

### Data Flow
1. Frontend requests financial data via `invoke("fetch_yahoo")` 
2. Rust backend fetches from Yahoo Finance Chart API v8
3. Backend analyzes data (SMA5/20, returns, Sharpe ratio) via `invoke("analyze_series")`
4. Frontend displays interactive chart using Recharts
5. Export functionality saves to CSV/YAML via `invoke("save_csv")` and `invoke("save_yaml")`

### Key Features
- **Financial Analysis**: Daily returns, standard deviation, annualized Sharpe ratio calculation
- **Technical Indicators**: 5-day and 20-day Simple Moving Averages  
- **Data Export**: CSV and YAML export with file dialogs
- **Multi-language**: Japanese UI text with English code comments

### File Structure
- `src/` - React frontend source
- `src-tauri/` - Rust backend source
- `src-tauri/src/main.rs` - All Tauri commands and business logic
- Configuration files follow standard Vite + Tauri patterns

## Notes
- Default symbol is "7203.T" (Toyota on Tokyo Stock Exchange)
- Uses Yahoo Finance Chart API without authentication
- No test framework currently configured
- UI text is in Japanese, code/comments in English