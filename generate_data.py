import yfinance as yf
import json
from datetime import datetime

# Itt add meg, miket akarsz figyelni
SYMBOLS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'BTC-USD']
PERIOD = "2y"

print("🚀 Starting Data Pipeline...")
export_data = {}

for symbol in SYMBOLS:
    print(f"📥 Fetching {symbol}...")
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=PERIOD)
        df.index = df.index.strftime('%Y-%m-%d')
        
        records = []
        for date, row in df.iterrows():
            records.append({
                "date": date,
                "open": round(row['Open'], 2),
                "high": round(row['High'], 2),
                "low": round(row['Low'], 2),
                "close": round(row['Close'], 2),
                "volume": int(row['Volume'])
            })
        
        info = ticker.info
        export_data[symbol] = {
            "meta": {
                "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "longName": info.get('longName', symbol)
            },
            "data": records
        }
    except Exception as e:
        print(f"❌ Error: {e}")

with open("stocks.json", "w", encoding='utf-8') as f:
    json.dump(export_data, f)
print("💾 stocks.json saved.")
