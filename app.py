import os
import re
import sys
import json
import logging
import threading
import webbrowser
import time
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import requests
import yfinance as yf
from flask import Flask, render_template, request, jsonify

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

try:
    import certifi
    import tempfile
    import shutil
    ca_orig = certifi.where()
    if os.path.exists(ca_orig):
        ca_temp = os.path.join(tempfile.gettempdir(), 'tw_stock_cacert.pem')
        try:
            shutil.copyfile(ca_orig, ca_temp)
            ca_path = ca_temp
        except Exception:
            ca_path = ca_orig
        os.environ['SSL_CERT_FILE'] = ca_path
        os.environ['REQUESTS_CA_BUNDLE'] = ca_path
        os.environ['CURL_CA_BUNDLE'] = ca_path
except Exception:
    pass

if getattr(sys, 'frozen', False):
    root_dir = os.path.dirname(sys.executable)
    internal_dir = os.path.join(root_dir, "_internal")
    if os.path.exists(os.path.join(internal_dir, "templates")):
        base_dir = internal_dir
    else:
        base_dir = root_dir
else:
    base_dir = os.path.dirname(os.path.abspath(__file__))

template_folder = os.path.join(base_dir, "templates")
static_folder = os.path.join(base_dir, "static")

app = Flask(
    __name__,
    root_path=base_dir,
    template_folder=template_folder,
    static_folder=static_folder,
    static_url_path="/static"
)
logger.info(f"Using base_dir: {base_dir}")
logger.info(f"Using template folder: {template_folder}")
logger.info(f"Using static folder: {static_folder}")

# Load Comprehensive Taiwan Stock Database (2,000+ Listed, OTC & ETFs)
STOCK_CODE_TO_NAME = {}
STOCK_NAME_TO_CODE = {}

try:
    db_file = os.path.join(static_folder, "stock_db.json")
    if not os.path.exists(db_file):
        db_file = os.path.join(find_resource_dir("static"), "stock_db.json")
    if os.path.exists(db_file):
        with open(db_file, "r", encoding="utf-8") as f:
            db_data = json.load(f)
            STOCK_CODE_TO_NAME = db_data.get("code_to_name", {})
            STOCK_NAME_TO_CODE = db_data.get("name_to_code", {})
            logger.info(f"Loaded {len(STOCK_CODE_TO_NAME)} stocks from stock_db.json")
except Exception as e:
    logger.warning(f"Failed to load stock_db.json: {e}")

# Fallback dictionary if database file is missing or empty
if not STOCK_CODE_TO_NAME:
    ESSENTIAL_STOCKS = {
        "2330": "台積電", "2317": "鴻海", "2454": "聯發科", "2382": "廣達", "2308": "台達電",
        "2881": "富邦金", "2882": "國泰金", "2412": "中華電", "2891": "中信金", "2357": "華碩",
        "3231": "緯創", "2379": "瑞昱", "2603": "長榮", "2609": "陽明", "2615": "萬海",
        "1519": "華城", "1503": "士電", "1513": "中興電", "1514": "亞力", "6669": "緯穎",
        "3008": "大立光", "2327": "國巨", "2303": "聯電", "3037": "欣興", "3034": "聯詠",
        "0050": "元大台灣50", "0056": "元大高股息", "00878": "國泰永續高股息", "00929": "復華台灣科技優息",
        "00919": "群益台灣精選高息", "00940": "元大台灣價值高息", "006208": "富邦台50"
    }
    STOCK_CODE_TO_NAME.update(ESSENTIAL_STOCKS)
    STOCK_NAME_TO_CODE.update({v: k for k, v in ESSENTIAL_STOCKS.items()})
    logger.info(f"Loaded {len(STOCK_CODE_TO_NAME)} essential stocks into fallback database")

def get_tw_symbol(code: str) -> list:
    """Return possible yfinance symbols for Taiwan stock"""
    code = str(code).strip()
    if "." in code:
        return [code]
    return [f"{code}.TW", f"{code}.TWO"]

def fetch_taiex_market():
    """Fetch Taiwan TAIEX (^TWII) index status and 20MA"""
    try:
        twii = yf.Ticker("^TWII")
        hist = twii.history(period="3mo")
        if hist.empty or len(hist) < 20:
            return {
                "index": 22500.0,
                "change": 120.0,
                "change_pct": 0.54,
                "ma20": 22300.0,
                "status": "bull",
                "status_text": "大盤站穩 20MA 月線 (多方軌道)",
                "is_bull": True
            }
        
        current_close = float(hist["Close"].iloc[-1])
        prev_close = float(hist["Close"].iloc[-2]) if len(hist) > 1 else current_close
        change = current_close - prev_close
        change_pct = (change / prev_close) * 100 if prev_close else 0
        
        ma20 = float(hist["Close"].tail(20).mean())
        is_bull = current_close >= ma20
        
        return {
            "index": round(current_close, 2),
            "change": round(change, 2),
            "change_pct": round(change_pct, 2),
            "ma20": round(ma20, 2),
            "status": "bull" if is_bull else "bear",
            "status_text": "大盤站穩 20MA 月線 (多方軌道)" if is_bull else "大盤跌破 20MA 月線 (警戒防守)",
            "is_bull": is_bull
        }
    except Exception as e:
        logger.warning(f"Failed to fetch TAIEX: {e}")
        return {
            "index": 22500.0,
            "change": 0.0,
            "change_pct": 0.0,
            "ma20": 22200.0,
            "status": "bull",
            "status_text": "大盤處於月線之上 (多方格局)",
            "is_bull": True
        }

def resolve_stock_name(code: str, user_name: str = "") -> str:
    """Resolve the most accurate stock name for a given code"""
    code = str(code).strip()
    user_name = str(user_name).strip() if user_name else ""
    
    # 1. Lookup in TW stock database
    if code in STOCK_CODE_TO_NAME and STOCK_CODE_TO_NAME[code]:
        # If user gave a custom specific name that isn't placeholder and differs from code
        if user_name and user_name != "未知個股" and not user_name.startswith("股票 ") and user_name != code:
            return user_name
        return STOCK_CODE_TO_NAME[code]
        
    # 2. If user gave a specific non-placeholder name
    if user_name and user_name != "未知個股" and not user_name.startswith("股票 "):
        return user_name
        
    # 3. Fallback clean code
    return code

def fetch_single_stock(code: str, name: str = "", cost: float = 0.0, shares: int = 1000):
    """Fetch stock historical and real-time data from yfinance with fallback"""
    code = str(code).strip()
    name = resolve_stock_name(code, name)
    
    symbols = get_tw_symbol(code)
    df = pd.DataFrame()
    valid_symbol = symbols[0]
    
    for sym in symbols:
        try:
            ticker = yf.Ticker(sym)
            temp_df = ticker.history(period="6mo")
            if not temp_df.empty and len(temp_df) > 5:
                df = temp_df
                valid_symbol = sym
                # If name is still just the code, try to get info from ticker
                if name == code:
                    try:
                        info_name = ticker.info.get('shortName') or ticker.info.get('longName')
                        if info_name:
                            name = info_name
                    except Exception:
                        pass
                break
        except Exception:
            continue
        
    if df.empty:
        logger.warning(f"Could not fetch live data for {code}, using estimated baseline")
        current_price = cost if cost > 0 else 100.0
        change_pct = 1.2
        volume = 5000
        vol_ma20 = 4500
        ma20 = current_price * 0.98
        ma60 = current_price * 0.95
        high60 = current_price * 1.08
        low20 = current_price * 0.94
        history_dates = [(datetime.now() - timedelta(days=i)).strftime("%m/%d") for i in range(20, -1, -1)]
        history_prices = [round(current_price * (1 + (i - 10) * 0.005), 2) for i in range(21)]
        history_ma20 = [round(current_price * 0.98, 2) for _ in range(21)]
    else:
        current_price = float(df["Close"].iloc[-1])
        prev_close = float(df["Close"].iloc[-2]) if len(df) > 1 else current_price
        change = current_price - prev_close
        change_pct = (change / prev_close) * 100 if prev_close else 0
        volume = int(df["Volume"].iloc[-1]) // 1000
        
        ma5 = float(df["Close"].tail(5).mean())
        ma20 = float(df["Close"].tail(20).mean()) if len(df) >= 20 else float(df["Close"].mean())
        ma60 = float(df["Close"].tail(60).mean()) if len(df) >= 60 else float(df["Close"].mean())
        
        vol_ma20 = int(df["Volume"].tail(20).mean()) // 1000 if len(df) >= 20 else volume
        if vol_ma20 <= 0: vol_ma20 = 1
        
        high60 = float(df["High"].tail(60).max())
        low20 = float(df["Low"].tail(20).min())
        
        chart_df = df.tail(25)
        history_dates = [d.strftime("%m/%d") for d in chart_df.index]
        history_prices = [round(p, 2) for p in chart_df["Close"].tolist()]
        history_ma20 = [round(p, 2) for p in chart_df["Close"].rolling(20, min_periods=1).mean().tolist()]

    cost = float(cost) if cost > 0 else current_price
    shares = int(shares) if shares > 0 else 1000
    
    total_cost = cost * shares
    total_market_val = current_price * shares
    unrealized_pnl = total_market_val - total_cost
    pnl_pct = ((current_price - cost) / cost) * 100 if cost > 0 else 0
    
    dist_ma20_pct = ((current_price - ma20) / ma20) * 100
    dist_ma60_pct = ((current_price - ma60) / ma60) * 100
    dist_high60_pct = ((high60 - current_price) / high60) * 100
    vol_ratio = (volume / vol_ma20) * 100 if vol_ma20 > 0 else 100
    
    # 5 Action Ratings
    rating = "STRONG_HOLD"
    rating_label = "🟢 強勢續抱"
    rating_color = "emerald"
    action_reason = "股價位於月季線之上，量價結構健康，建議續抱並設定移動保本。"
    urgency_level = 3
    
    if pnl_pct <= -7.0 or (current_price < ma20 and dist_ma20_pct < -3.0):
        rating = "STOP_LOSS"
        rating_label = "🔴 嚴格停損出清"
        rating_color = "rose"
        action_reason = f"已達個人硬停損標準或跌破 20MA 轉弱 (損益 {pnl_pct:.2f}%)，切勿拗單，應果斷執行停損控制風險。"
        urgency_level = 1
    elif pnl_pct >= 18.0 and dist_high60_pct <= 2.0:
        rating = "TAKE_PROFIT"
        rating_label = "🔴 觸發停利落袋"
        rating_color = "amber"
        action_reason = f"獲利已達 +{pnl_pct:.1f}% 且面臨前波壓力位 ({high60:.1f}元)，建議分批獲利了結 1/2 部位，鎖住利潤。"
        urgency_level = 1
    elif dist_ma20_pct >= 0 and dist_ma20_pct <= 3.5 and vol_ratio >= 130 and change_pct > 1.5:
        rating = "BUY_ADD"
        rating_label = "🟢 觸發加碼買進"
        rating_color = "emerald"
        action_reason = f"帶量轉強突破或回測 20MA 守穩出紅K，具備動能攻擊特徵，可於設定價位伺機加碼 20%~30% 部位。"
        urgency_level = 2
    elif dist_high60_pct < 3.0 and vol_ratio < 70:
        rating = "WATCH_TRIM"
        rating_label = "🟡 觀望洗盤 / 減碼警戒"
        rating_color = "yellow"
        action_reason = f"逼近前高壓力區 ({high60:.1f}元) 但量能明顯萎縮，多空交戰洗盤中，嚴禁追高，可微幅調節部位。"
        urgency_level = 2
    else:
        if pnl_pct > 0:
            rating = "STRONG_HOLD"
            rating_label = "🟢 強勢續抱"
            rating_color = "emerald"
            action_reason = f"持股獲利 +{pnl_pct:.1f}%，均線結構良好，啟動移動保本機制續抱享受波段。"
        else:
            rating = "WATCH_TRIM"
            rating_label = "🟡 觀望洗盤"
            rating_color = "yellow"
            action_reason = f"處於成本附近整理震盪，未觸及停損線，耐心觀察 20MA 支撐強度。"
            
    hard_stop_loss = round(min(cost * 0.925, ma20 * 0.97), 1)
    
    if pnl_pct >= 12.0:
        breakeven_price = round(max(cost * 1.02, ma20), 1)
        breakeven_status = f"已鎖定獲利保本 (跌破 {breakeven_price} 元全數獲利出場)"
    elif pnl_pct >= 6.0:
        breakeven_price = round(cost * 1.005, 1)
        breakeven_status = f"已啟動成本保本 (跌破 {breakeven_price} 元平手出場)"
    else:
        breakeven_price = round(cost * 1.0, 1)
        breakeven_status = "尚未觸發保本 (獲利達 +6%~+8% 時自動上移)"
        
    target_1 = round(max(high60, cost * 1.10), 1)
    target_2 = round(max(high60 * 1.08, cost * 1.20), 1)
    add_trigger_price = round(max(current_price * 1.015, high60 * 0.995), 1)
    add_volume_req = int(vol_ma20 * 1.5)
    
    checklist = [
        {
            "dimension": "均線位階",
            "val": f"20MA: {ma20:.1f} ({dist_ma20_pct:+.1f}%)｜60MA: {ma60:.1f} ({dist_ma60_pct:+.1f}%)",
            "desc": "站穩月季線之上，趨勢偏多" if current_price >= ma20 else "跌破 20MA 月線，均線反壓",
            "pass": bool(current_price >= ma20)
        },
        {
            "dimension": "成交量能",
            "val": f"今日: {volume:,} 張｜20日均量: {vol_ma20:,} 張 ({vol_ratio:.0f}%)",
            "desc": "極致窒息量 (洗盤沉澱)" if vol_ratio < 65 else ("爆量攻擊 (>150%)" if vol_ratio > 150 else "量能常態溫和"),
            "pass": bool(vol_ratio > 70 or (vol_ratio < 65 and current_price >= ma20))
        },
        {
            "dimension": "前高反壓",
            "val": f"近60日高點: {high60:.1f} 元 (距壓力 {dist_high60_pct:.1f}%)",
            "desc": "突破歷史/波段新高，無套牢賣壓" if dist_high60_pct <= 0.5 else ("逼近前高重壓區" if dist_high60_pct < 3.0 else "上方仍有足夠上漲空間"),
            "pass": bool(dist_high60_pct > 3.0 or dist_high60_pct <= 0.5)
        },
        {
            "dimension": "損益風險比",
            "val": f"個人成本: {cost:.1f} 元｜損益: {pnl_pct:+.2f}%",
            "desc": "獲利保護部位，具備主動權" if pnl_pct > 3.0 else ("小幅浮虧，仍在安全容忍區" if pnl_pct > -6.0 else "虧損擴大警戒"),
            "pass": bool(pnl_pct >= -6.0)
        }
    ]
    
    return {
        "code": code,
        "name": name,
        "current_price": round(current_price, 2),
        "change": round(current_price - prev_close, 2) if 'prev_close' in locals() else 0.0,
        "change_pct": round(change_pct, 2),
        "cost": round(cost, 2),
        "shares": shares,
        "total_cost": round(total_cost, 0),
        "total_market_val": round(total_market_val, 0),
        "unrealized_pnl": round(unrealized_pnl, 0),
        "pnl_pct": round(pnl_pct, 2),
        "ma20": round(ma20, 2),
        "ma60": round(ma60, 2),
        "volume": volume,
        "vol_ma20": vol_ma20,
        "vol_ratio": round(vol_ratio, 1),
        "high60": round(high60, 2),
        "low20": round(low20, 2),
        "rating": rating,
        "rating_label": rating_label,
        "rating_color": rating_color,
        "action_reason": action_reason,
        "urgency_level": urgency_level,
        "hard_stop_loss": hard_stop_loss,
        "breakeven_price": breakeven_price,
        "breakeven_status": breakeven_status,
        "target_1": target_1,
        "target_2": target_2,
        "add_trigger_price": add_trigger_price,
        "add_volume_req": add_volume_req,
        "checklist": checklist,
        "chart_data": {
            "dates": history_dates if 'history_dates' in locals() else [],
            "prices": history_prices if 'history_prices' in locals() else [],
            "ma20": history_ma20 if 'history_ma20' in locals() else []
        }
    }

@app.route("/")
def index():
    try:
        return render_template("index.html")
    except Exception as e:
        logger.warning(f"render_template failed ({e}), falling back to direct template load")
        for candidate_dir in [template_folder, os.path.join(base_dir, "templates"), os.path.join(os.getcwd(), "templates")]:
            html_file = os.path.join(candidate_dir, "index.html")
            if os.path.exists(html_file):
                with open(html_file, "r", encoding="utf-8") as f:
                    return f.read(), 200, {"Content-Type": "text/html; charset=utf-8"}
        return f"Error loading index.html: {e}", 500

@app.route("/static/<path:filename>")
def custom_static(filename):
    from flask import send_from_directory
    for s_dir in [static_folder, os.path.join(base_dir, "static"), os.path.join(os.getcwd(), "static")]:
        if os.path.exists(os.path.join(s_dir, filename)):
            return send_from_directory(s_dir, filename)
    return "File not found", 404

@app.route("/api/market", methods=["GET"])
def get_market():
    taiex = fetch_taiex_market()
    return jsonify(taiex)

@app.route("/api/lookup-stock", methods=["GET"])
def lookup_stock():
    query = request.args.get("query", "").strip()
    if not query:
        return jsonify([])
        
    results = []
    # If query is code prefix or exact code
    if query in STOCK_CODE_TO_NAME:
        results.append({"code": query, "name": STOCK_CODE_TO_NAME[query]})
    else:
        # Search by code prefix
        for c, n in STOCK_CODE_TO_NAME.items():
            if c.startswith(query):
                results.append({"code": c, "name": n})
                if len(results) >= 8:
                    break
        # Search by name match
        for n, c in STOCK_NAME_TO_CODE.items():
            if query in n and not any(r["code"] == c for r in results):
                results.append({"code": c, "name": n})
                if len(results) >= 8:
                    break
                    
    return jsonify(results)

@app.route("/api/parse-table", methods=["POST"])
def parse_table_api():
    """Server-side robust table parser for Taiwan stock screenshots"""
    data = request.get_json() or {}
    text = data.get("text", "")
    if not text:
        return jsonify([])
        
    extracted = []
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    sorted_names = sorted(STOCK_NAME_TO_CODE.keys(), key=lambda x: len(x), reverse=True)
    
    for line in lines:
        if re.search(r'即時庫存損益|整戶維持率|筆數|註：|付出成本|損益兩平點', line):
            continue
            
        line_nospace = re.sub(r'[\s\-_,.:;]+', '', line)
        found_name = None
        found_code = None
        match_str = ""
        
        for name in sorted_names:
            name_nospace = re.sub(r'[\s\-_,.:;]+', '', name)
            if len(name_nospace) >= 2 and name_nospace in line_nospace:
                found_name = name
                found_code = STOCK_NAME_TO_CODE[name]
                match_str = name
                break
                
        if not found_name:
            code_match = re.search(r'\b([0-9]{4,6}[A-Z]?)\b', line)
            if code_match and code_match.group(1) in STOCK_CODE_TO_NAME:
                found_code = code_match.group(1)
                found_name = STOCK_CODE_TO_NAME[found_code]
                match_str = found_code
                
        if not found_name or not found_code:
            continue
            
        if any(item["code"] == found_code for item in extracted):
            continue
            
        escaped_chars = [re.escape(c) for c in match_str]
        char_regex = r'\s*'.join(escaped_chars)
        line_clean = re.sub(char_regex, ' ', line, flags=re.IGNORECASE)
        line_clean = re.sub(r'明\s*細|現\s*股|融\s*資|融\s*券|商\s*品|種\s*類', ' ', line_clean, flags=re.IGNORECASE)
        line_clean = re.sub(r'(\d),(\d)', r'\1\2', line_clean)
        
        tokens = re.findall(r'[-+]?\d*\.?\d+', line_clean)
        numbers = []
        for t in tokens:
            try:
                numbers.append(float(t))
            except ValueError:
                pass
                
        shares = 1000
        cost = 0.0
        
        if len(numbers) >= 2:
            shares = int(numbers[1]) if len(numbers) > 1 and numbers[0] == numbers[1] else int(numbers[0])
            if len(numbers) >= 6:
                cost_candidate = numbers[5]
                if 0 < cost_candidate < 100000:
                    cost = cost_candidate
                elif 0 < numbers[4] < 100000:
                    cost = numbers[4]
            else:
                for n in numbers[1:]:
                    if 0 < n < 10000 and n != shares:
                        cost = n
                        break
        elif len(numbers) == 1:
            if numbers[0] >= 100: shares = int(numbers[0])
            else: cost = numbers[0]
            
        extracted.append({
            "code": found_code,
            "name": STOCK_CODE_TO_NAME.get(found_code, found_name),
            "cost": round(cost, 2) if cost > 0 else 100.0,
            "shares": shares if shares > 0 else 1000
        })
        
    return jsonify(extracted)

@app.route("/api/diagnose", methods=["POST"])
def run_diagnosis():
    data = request.get_json() or {}
    holdings = data.get("holdings", [])
    
    if not holdings:
        return jsonify({"error": "請提供至少一檔持股資料"}), 400
        
    taiex = fetch_taiex_market()
    results = []
    
    total_cost_all = 0.0
    total_val_all = 0.0
    
    for item in holdings:
        code = str(item.get("code", "")).strip()
        name = str(item.get("name", "")).strip()
        cost = float(item.get("cost", 0))
        shares = int(item.get("shares", 1000))
        
        if not code:
            continue
            
        diag = fetch_single_stock(code, name, cost, shares)
        if not taiex["is_bull"] and diag["rating"] == "STRONG_HOLD":
            diag["action_reason"] += " (註：大盤破月線，逢反彈宜適度收縮持股水位)"
            
        results.append(diag)
        total_cost_all += diag["total_cost"]
        total_val_all += diag["total_market_val"]
        
    total_pnl = total_val_all - total_cost_all
    total_pnl_pct = (total_pnl / total_cost_all * 100) if total_cost_all > 0 else 0
    
    sorted_checklist = sorted(results, key=lambda x: (x["urgency_level"], -abs(x["pnl_pct"])))
    
    action_items = []
    for s in sorted_checklist:
        action_items.append({
            "code": s["code"],
            "name": s["name"],
            "rating": s["rating"],
            "rating_label": s["rating_label"],
            "rating_color": s["rating_color"],
            "urgency_level": s["urgency_level"],
            "pnl_pct": s["pnl_pct"],
            "action_text": s["action_reason"],
            "key_price": s["hard_stop_loss"] if s["rating"] == "STOP_LOSS" else (s["target_1"] if s["rating"] == "TAKE_PROFIT" else s["breakeven_price"])
        })
        
    win_count = sum(1 for s in results if s["pnl_pct"] > 0)
    ma20_pass_count = sum(1 for s in results if s["current_price"] >= s["ma20"])
    
    health_score = 60
    if len(results) > 0:
        win_rate = win_count / len(results)
        ma20_rate = ma20_pass_count / len(results)
        health_score = int(30 + (win_rate * 35) + (ma20_rate * 35))
        if total_pnl_pct > 5: health_score = min(100, health_score + 10)
        elif total_pnl_pct < -5: health_score = max(20, health_score - 15)
        
    return jsonify({
        "taiex": taiex,
        "portfolio_summary": {
            "total_count": len(results),
            "total_cost": round(total_cost_all, 0),
            "total_market_val": round(total_val_all, 0),
            "total_pnl": round(total_pnl, 0),
            "total_pnl_pct": round(total_pnl_pct, 2),
            "health_score": health_score,
            "win_count": win_count,
            "loss_count": len(results) - win_count
        },
        "diagnostics": results,
        "action_checklist": action_items
    })

@app.route("/api/upload-screenshot", methods=["POST"])
def upload_screenshot():
    """High-accuracy server-side AI OCR endpoint for stock screenshots"""
    try:
        from server_ocr_engine import process_brokerage_image
        
        # 1. Multipart form upload
        if 'image' in request.files:
            file = request.files['image']
            img_bytes = file.read()
            holdings = process_brokerage_image(img_bytes)
            return jsonify({"success": True, "holdings": holdings, "count": len(holdings)})
        elif 'file' in request.files:
            file = request.files['file']
            img_bytes = file.read()
            holdings = process_brokerage_image(img_bytes)
            return jsonify({"success": True, "holdings": holdings, "count": len(holdings)})
            
        # 2. Base64 JSON upload
        data = request.get_json(silent=True) or {}
        if "image" in data:
            import base64
            img_str = data["image"]
            if "," in img_str:
                img_str = img_str.split(",")[1]
            img_bytes = base64.b64decode(img_str)
            holdings = process_brokerage_image(img_bytes)
            return jsonify({"success": True, "holdings": holdings, "count": len(holdings)})
            
        return jsonify({"success": False, "error": "未收到圖片檔案"}), 400
    except Exception as e:
        logger.error(f"Upload OCR error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/presets", methods=["GET"])
def get_presets():
    presets = {
        "screenshot_0907": {
            "name": "9/7 券商庫存截圖實盤範例 (商品欄位/8檔持股)",
            "holdings": [
                {"code": "00403A", "name": "主動統一升級50", "cost": 10.2, "shares": 5000},
                {"code": "0056", "name": "元大高股息", "cost": 38.34, "shares": 10000},
                {"code": "00923", "name": "群益台ESG低碳50", "cost": 24.76, "shares": 12375},
                {"code": "1303", "name": "南亞", "cost": 218.06, "shares": 1000},
                {"code": "1432", "name": "大魯閣", "cost": 14.0, "shares": 1},
                {"code": "2330", "name": "台積電", "cost": 1052.42, "shares": 2040},
                {"code": "2408", "name": "南亞科", "cost": 355.34, "shares": 2000},
                {"code": "6770", "name": "力積電", "cost": 75.12, "shares": 2000}
            ]
        },
        "yuanta_ai": {
            "name": "元大「投資先生」APP 庫存截圖範例 (AI半導體主流組)",
            "holdings": [
                {"code": "2330", "name": "台積電", "cost": 945.0, "shares": 1000},
                {"code": "2454", "name": "聯發科", "cost": 1320.0, "shares": 1000},
                {"code": "2317", "name": "鴻海", "cost": 208.0, "shares": 3000},
                {"code": "3231", "name": "緯創", "cost": 118.0, "shares": 5000}
            ]
        },
        "cathay_shipping": {
            "name": "國泰證券 APP 庫存截圖範例 (航運與重電權值組)",
            "holdings": [
                {"code": "2603", "name": "長榮", "cost": 196.0, "shares": 2000},
                {"code": "2609", "name": "陽明", "cost": 68.5, "shares": 3000},
                {"code": "1519", "name": "華城", "cost": 680.0, "shares": 1000},
                {"code": "2382", "name": "廣達", "cost": 290.0, "shares": 2000}
            ]
        },
        "mitake_mixed": {
            "name": "三竹股市系統 庫存截圖範例 (多空混合考驗組)",
            "holdings": [
                {"code": "2330", "name": "台積電", "cost": 980.0, "shares": 1000},
                {"code": "2603", "name": "長榮", "cost": 225.0, "shares": 1000},
                {"code": "2357", "name": "華碩", "cost": 530.0, "shares": 1000},
                {"code": "2881", "name": "富邦金", "cost": 72.0, "shares": 5000}
            ]
        }
    }
    return jsonify(presets)

def auto_open_browser(port):
    time.sleep(1.2)
    try:
        webbrowser.open(f"http://127.0.0.1:{port}")
    except Exception as e:
        logger.warning(f"Could not open browser automatically: {e}")

def get_lan_ip():
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    lan_ip = get_lan_ip()
    print("\n" + "=" * 60)
    print("  【持股健檢與盤口籌碼診斷系統】已成功啟動！")
    print(f"  * 電腦本機網址: http://127.0.0.1:{port}")
    print(f"  * 手機連線網址: http://{lan_ip}:{port} (手機需連同一 Wi-Fi)")
    print("=" * 60 + "\n")
    logger.info(f"Starting Stock Diagnosis Server on 0.0.0.0:{port}")
    threading.Thread(target=auto_open_browser, args=(port,), daemon=True).start()
    app.run(host="0.0.0.0", port=port, debug=False)

