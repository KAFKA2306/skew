import yfinance as yf
import numpy as np

def compute_skew(period: str = '1y') -> float:
    data = yf.download('NVDA', period=period, interval='1d')
    data['log_return'] = np.log(data['Close']).diff()
    return data['log_return'].dropna().skew()

if __name__ == '__main__':
    skew = compute_skew()
    print(f"NVDA daily log return skewness over the last year: {skew}")
