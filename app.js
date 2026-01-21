/**
 * Pro Dashboard v5.0 - Live Ticker Simulation
 * Static: Valós GitHub adat | Live: Szimulált valós idejű mozgás
 */

const state = {
    symbol: 'NVDA',
    source: 'static',
    data: [],
    meta: {},
    charts: {},
    intervals: [] // Tároljuk az időzítőket, hogy törölhessük őket
};

// --- CORE: ADAT BETÖLTÉS ---
async function loadData() {
    clearAllIntervals(); // Minden korábbi folyamat leállítása
    updateStatus('Connecting...', 'warning');

    try {
        // Mindig a GitHub JSON az alap (bázis adat)
        const res = await fetch(`./stocks.json?t=${Date.now()}`);
        if (!res.ok) throw new Error("Data Source Error");
        
        const json = await res.json();
        if (!json[state.symbol]) throw new Error("Symbol missing");

        // Adatok mentése a memóriába
        state.meta = json[state.symbol].meta;
        state.data = json[state.symbol].data.map(d => ({
            ...d,
            dateObj: new Date(d.date) // Dátum objektummá alakítás
        }));
        state.data.sort((a,b) => a.dateObj - b.dateObj);

        // UI Fejléc
        document.querySelector('.header-left h1').innerHTML = 
            `${state.meta.longName || state.symbol} <span class="badge">PRO</span>`;

        // ELÁGAZÁS: STATIC VAGY LIVE?
        if (state.source === 'static') {
            // Static: Csak renderelünk és kész
            const time = new Date(state.meta.last_updated).toLocaleString();
            updateStatus(`Static Data | Updated: ${time}`, 'success');
            renderDashboard();
        } else {
            // Live: Elindítjuk a szimulátort
            startLiveSimulation();
        }

    } catch (e) {
        console.error(e);
        updateStatus('Offline / Error', 'danger');
    }
}

// --- VALÓDI LIVE ADAT LEKÉRDEZÉS (Finnhub API) ---
function startLiveSimulation() {
    updateStatus('● LIVE KAPCSOLÓDÁS (Finnhub)...', 'warning');

    // IDE ÍRD BE A SAJÁT KULCSODAT!
    const API_KEY = 'd5o9f9pr01qma2b8bmp0d5o9f9pr01qma2b8bmpg'; 
    const symbol = state.symbol; // pl. 'NVDA'

    // Töröljük a régi időzítőt, ha van
    if (state.intervals.length) clearAllIntervals();

    const fetchRealPrice = async () => {
        try {
            // Ez a sor megy ki az internetre a valós árért!
            const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`);
            const data = await response.json();

            // A Finnhub ezt adja vissza: { c: 185.32 (Current Price), ... }
            const currentPrice = data.c; 

            if (!currentPrice) return;

            // --- ADAT BEILLESZTÉSE A RENDSZERBE ---
            const lastCandle = state.data[state.data.length - 1];

            // Frissítjük a gyertyát a valós árral
            lastCandle.close = currentPrice;
            
            // Igazítjuk a csúcsot/aljat, ha az új ár kitörte
            if (currentPrice > lastCandle.high) lastCandle.high = currentPrice;
            if (currentPrice < lastCandle.low) lastCandle.low = currentPrice;

            // UI Frissítés
            updateKPIs(lastCandle, state.data[state.data.length - 2]);
            renderDashboard(true);

            // Státusz
            const now = new Date().toLocaleTimeString();
            updateStatus(`● REAL LIVE | Ár: $${currentPrice} | ${now}`, 'success');

        } catch (error) {
            console.error("API Hiba:", error);
            updateStatus('⚠️ API Hiba (Limit?)', 'danger');
        }
    };

    // Azonnal meghívjuk egyszer
    fetchRealPrice();

    // Utána 5 másodpercenként frissítjük (Az ingyenes limit miatt ne legyen túl gyors!)
    const ticker = setInterval(fetchRealPrice, 5000); 
    state.intervals.push(ticker);
}

// --- HELPER FUNCTIONS ---
function clearAllIntervals() {
    state.intervals.forEach(i => clearInterval(i));
    state.intervals = [];
}

function updateStatus(msg, type) {
    const el = document.getElementById('statusIndicator');
    el.textContent = msg;
    el.className = `status-badge ${type}`;
    if (type === 'success' && state.source === 'live') el.classList.add('pulse-animation');
    else el.classList.remove('pulse-animation');
}

// --- INDICATORS & MATH ---
function calculateMA(dayCount, data) {
    return data.map((val, i, arr) => {
        if (i < dayCount) return '-';
        let sum = 0;
        for (let j = 0; j < dayCount; j++) sum += arr[i - j].close;
        return (sum / dayCount).toFixed(2);
    });
}

function calculateRSI(data, period = 14) {
    let rsi = [];
    let gain = 0, loss = 0;
    
    // Első periódus
    for (let i = 1; i <= period; i++) {
        let change = data[i].close - data[i - 1].close;
        if (change > 0) gain += change; else loss -= change;
    }
    gain /= period; loss /= period;
    rsi.push(100 - (100 / (1 + gain / loss)));

    // Többi
    for (let i = period + 1; i < data.length; i++) {
        let change = data[i].close - data[i - 1].close;
        let g = change > 0 ? change : 0;
        let l = change < 0 ? -change : 0;
        gain = (gain * (period - 1) + g) / period;
        loss = (loss * (period - 1) + l) / period;
        rsi.push((100 - (100 / (1 + gain / loss))).toFixed(2));
    }
    // Feltöltjük az elejét nullával hogy egyezzen a hossza
    return new Array(period).fill(null).concat(rsi); 
}

// --- RENDERING ---
function updateKPIs(last, prev) {
    document.getElementById('kpiPrice').innerText = `$${last.close.toFixed(2)}`;
    const change = ((last.close - prev.close) / prev.close) * 100;
    const chgEl = document.getElementById('kpiChange');
    chgEl.innerText = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
    chgEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
    document.getElementById('kpiVol').innerText = (last.volume / 1000000).toFixed(2) + 'M';
}

function renderDashboard(isUpdate = false) {
    if (!state.data.length) return;

    const dates = state.data.map(d => d.date);
    const ohlc = state.data.map(d => [d.open, d.close, d.low, d.high]);
    const ma20 = calculateMA(20, state.data);
    const ma50 = calculateMA(50, state.data);
    
    // KPI frissítés (Static módnál itt fut le)
    if (!isUpdate) {
        updateKPIs(state.data[state.data.length-1], state.data[state.data.length-2]);
        // RSI csak teljes renderelésnél számoljuk újra a CPU kímélése miatt
        const rsi = calculateRSI(state.data);
        document.getElementById('kpiRsi').innerText = parseFloat(rsi[rsi.length-1]||0).toFixed(1);
    }

    // Chart beállítások
    const isDark = document.documentElement.dataset.theme === 'dark';
    const textColor = isDark ? '#ccc' : '#333';
    const gridColor = isDark ? '#333' : '#e0e0e0';

    // 1. MAIN CHART
    if (!state.charts.main) state.charts.main = echarts.init(document.getElementById('mainChart'));
    
    state.charts.main.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        grid: { left: '3%', right: '3%', bottom: '15%' },
        xAxis: { data: dates, axisLine: { lineStyle: { color: textColor } } },
        yAxis: { scale: true, splitLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor } },
        dataZoom: [{ type: 'inside', start: 80, end: 100 }, { show: !isUpdate, type: 'slider', top: '90%' }],
        series: [
            { name: 'Price', type: 'candlestick', data: ohlc, itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' } },
            { name: 'MA20', type: 'line', data: ma20, smooth: true, showSymbol: false, lineStyle: { opacity: 0.5 } },
            { name: 'MA50', type: 'line', data: ma50, smooth: true, showSymbol: false, lineStyle: { opacity: 0.5 } }
        ]
    });

    // Ha ez csak frissítés, a többi chartot nem rajzoljuk újra (performancia)
    if (isUpdate) return;

    // ... (A többi chart - Volume, RSI, MACD - kódja maradhat a régiben, vagy ide másolhatod, de a lényeg a Main Chart)
    // Az egyszerűség kedvéért itt most csak a fő chartot frissítem dinamikusan.
}

// --- EVENTS ---
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('stockSelect').addEventListener('change', (e) => { 
        state.symbol = e.target.value; 
        loadData(); 
    });
    
    document.querySelectorAll('input[name="source"]').forEach(r => {
        r.addEventListener('change', (e) => { 
            if(e.target.checked) {
                state.source = e.target.value;
                loadData();
            }
        });
    });

    handleTheme();
    loadData();
});

function handleTheme() {
    const t = document.getElementById('themeToggle');
    if(localStorage.getItem('theme')==='dark') {
        document.documentElement.dataset.theme='dark';
        t.checked=true;
    }
    t.addEventListener('change', () => {
        const isDark = t.checked;
        document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        location.reload(); 
    });
}
