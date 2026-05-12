import pandas as pd
import pandas_ta as ta
import numpy as np


def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df = df.sort_values("time").reset_index(drop=True)

    df["ema9"] = ta.ema(df["close"], length=9)
    df["ema21"] = ta.ema(df["close"], length=21)

    df["rsi"] = ta.rsi(df["close"], length=14)

    macd_df = ta.macd(df["close"], fast=12, slow=26, signal=9)
    if macd_df is not None:
        df["macd"] = macd_df.iloc[:, 0]
        df["macd_hist"] = macd_df.iloc[:, 1]
        df["macd_signal"] = macd_df.iloc[:, 2]
    else:
        df["macd"] = np.nan
        df["macd_hist"] = np.nan
        df["macd_signal"] = np.nan

    bb_df = ta.bbands(df["close"], length=20, std=2)
    if bb_df is not None:
        df["bb_lower"] = bb_df.iloc[:, 0]
        df["bb_mid"] = bb_df.iloc[:, 1]
        df["bb_upper"] = bb_df.iloc[:, 2]
    else:
        df["bb_lower"] = np.nan
        df["bb_mid"] = np.nan
        df["bb_upper"] = np.nan

    df["ema_cross_up"] = (df["ema9"] > df["ema21"]).astype(int)
    df["rsi_overbought"] = (df["rsi"] > 70).astype(int)
    df["rsi_oversold"] = (df["rsi"] < 30).astype(int)
    df["near_bb_upper"] = (df["close"] > df["bb_upper"] * 0.99).astype(int)
    df["near_bb_lower"] = (df["close"] < df["bb_lower"] * 1.01).astype(int)

    df["candle_body"] = (df["close"] - df["open"]).abs()
    df["candle_direction"] = (df["close"] > df["open"]).astype(int)

    df["prev1_dir"] = df["candle_direction"].shift(1)
    df["prev2_dir"] = df["candle_direction"].shift(2)
    df["prev3_dir"] = df["candle_direction"].shift(3)

    df["volume_change"] = df["volume"] / df["volume"].shift(1).replace(0, np.nan)

    return df
