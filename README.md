# NiftyPredictor Dashboard

Live Nifty 50 and Bank Nifty candlestick charts with ML-based direction predictions.

## Architecture

```
Browser  ──►  Next.js 14 App (port 3000)  ──►  Upstox API
                      │
                      └──►  Python FastAPI ML Service (port 8000)
```

## Quick Start

### 1. Configure Upstox credentials

Edit `nextjs-app/.env.local`:
```
UPSTOX_API_KEY=your_actual_api_key
UPSTOX_API_SECRET=your_actual_api_secret
UPSTOX_REDIRECT_URI=http://127.0.0.1:3000/api/upstox/callback
ML_API_URL=http://127.0.0.1:8000
```

### 2. Start the Python ML Service

```bash
cd python-ml
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Start the Next.js App

```bash
cd nextjs-app
npm install
npm run dev
```

### 4. First-Time Setup

1. Open http://localhost:3000
2. Click **Connect Upstox** in the navbar
3. Log in with your Upstox credentials
4. You will be redirected back to the dashboard
5. Charts and predictions will load automatically

## Features

- **Live candlestick charts** for Nifty 50 and Bank Nifty via TradingView Lightweight Charts
- **EMA 9 + EMA 21** overlays on charts
- **Volume histogram** below each chart
- **Technical indicators**: RSI, MACD, EMA Cross, Bollinger Bands
- **ML predictions**: 5-min, 10-min, 30-min direction (UP/DOWN) with confidence %
- **Real-time updates** via Socket.IO every 60 seconds during market hours
- **Market status badge**: OPEN / CLOSED based on IST time
- **Dark theme** throughout

## ML Model

- Algorithm: RandomForestClassifier (scikit-learn, 200 estimators)
- Features: RSI, MACD, EMA cross, Bollinger proximity, candle patterns, volume change
- Labels: 1 if next candle close > current close, else 0
- Models trained on first request if `.pkl` files don't exist
- Models saved as `model_5min.pkl`, `model_10min.pkl`, `model_30min.pkl`

## Notes

- Access token expires daily — click **Connect Upstox** again to refresh
- If ML service is unavailable, mock predictions are shown
- Market hours: Monday–Friday, 9:15 AM – 3:30 PM IST
- This is not financial advice

for python run 

not reuireqed : rm -f model_5min.pkl model_10min.pkl model_30min.pkl imputer.pkl scaler.pkl lstm_5min.keras lstm_10min.keras lstm_30min.keras metrics.json lstm_metrics.json

python main.py


