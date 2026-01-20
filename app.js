/**
 * Pro Dashboard v8.0 - Bulletproof Rendering
 * Fixes: RSI/Volume missing charts issue
 */

const state = {
    symbol: 'NVDA',
    source: 'static',
    data: [],
    meta: {},
    charts: { main: null, vol: null, rsi: null, macd: null },
    intervals: [] 
};

// --- ADAT BETÖLTÉS ---
async function loadData() {
    clearAllIntervals();
    updateStatus('Connecting...', 'warning');

    try {
        const timeBuster = new Date().getTime();
        const res = await fetch(`./stocks.json?t=${timeBuster}`);
        if (!res.ok) throw new Error("JSON Error");
        
        const json = await res.json();
        const stockData = json[state.symbol];
        
        if (!stockData) throw new Error("Symbol not found");

        state.meta = stockData.meta;
        // Dátum konverzió
        state.data = stockData.data.map(d => ({ 
            ...d, 
            dateObj: new Date(d.date) 
        }));
        state.data.sort((a,b) => a.dateObj - b.dateObj);

        // UI Fejléc
        document.querySelector('.header-left h1').innerHTML = 
            `${state.meta.longName || state.symbol} <span class="badge">PRO</span>`;

        // 1. LÉPÉS: MINDEN DIAGRAM INICIALIZÁLÁSA
        initAllCharts();

        // 2. LÉPÉS: MÓD VÁLASZTÁS
        if (state.source === 'static') {
            const dateStr = new Date(state.meta.last_updated).toLocaleDateString();
            updateStatus(`🔒 STATIC | Adat: ${dateStr}`, 'warning');
        } else {
            updateStatus(`● ÉLŐ KAPCSOLAT | Szinkronizálás...`, 'success');
            startAggressiveSimulation();
        }

    } catch (e) {
        console.error("Critical Error:", e);
        updateStatus('Hiba az adatokkal', 'danger');
    }
}

// --- BIZTONSÁGOS SZIMULÁTOR ---
function startAggressiveSimulation() {
    const ticker = setInterval(() => {
        if (!state.data.length) return;

        const lastCandle = state.data[state.data.length - 1];
        const prevCandle = state.data[state.data.length - 2];

        // Ármozgás
        const volatility = lastCandle.close * 0.003; 
        const change = (Math.random() - 0.5) * volatility;
        lastCandle.close += change;
        
        // High/Low igazítás
        if (lastCandle.close > lastCandle.high) lastCandle.high = lastCandle.close;
        if (lastCandle.close < lastCandle.low) lastCandle.low = lastCandle.close;
        
        // Volume
        lastCandle.volume += Math.floor(Math.random() * 1000);

        // UI Frissítés
        updateKPIs(lastCandle, prevCandle);
        
        // Chartok Frissítése (Csak adat)
        updateChartsData();

        // Idő
        const now = new Date().toLocaleTimeString(); 
        updateStatus(`● LIVE | Idő: ${now}`, 'success'); 

    }, 1000);

    state.intervals.push(ticker);
}

// --- FŐ RAJZOLÓ MOTOR (KÜLÖNVÁLASZTVA) ---
function initAllCharts() {
    // Ha nincs adat, nem csinálunk semmit
    if (!state.data.length) return;

    const dates = state.data.map(d => d.date);
    const isDark = document.documentElement.dataset.theme === 'dark';
    const textColor = isDark ? '#ccc' : '#333';
    const gridColor = isDark ? '#333' : '#e0e0e0';

    // --- 1. MAIN CHART (Ár) ---
    try {
        if (state.charts.main) state.charts.main.dispose();
        state.charts.main = echarts.init(document.getElementById('mainChart'));
        state.charts.main.setOption({
            animation: false,
            grid: { left: '3%', right: '3%', bottom: '10%' },
            tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
            xAxis: { data: dates, axisLine: { lineStyle: { color: textColor } } },
            yAxis: { scale: true, splitLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor } },
            dataZoom: [{ type: 'inside', start: 85, end: 100 }, { show: true, type: 'slider', top: '92%' }],
            series: [
                { name: 'Price', type: 'candlestick', data: [], itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' } },
                { name: 'MA20', type: 'line', data: [], showSymbol: false, lineStyle: { opacity: 0.5, width: 1 } },
                { name: 'MA50', type: 'line', data: [], showSymbol: false, lineStyle: { opacity: 0.5, width: 1 } }
            ]
        });
    } catch(e) { console.error("Main Chart Error", e); }

    // --- 2. VOLUME CHART ---
    try {
        if (state.charts.vol) state.charts.vol.dispose();
        state.charts.vol = echarts.init(document.getElementById('volChart'));
        state.charts.vol.setOption({
            grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
            xAxis: { data: dates, show: false },
            yAxis: { show: false },
            series: [{ type: 'bar', data: [], itemStyle: { color: '#3b82f6' } }]
        });
    } catch(e) { console.error("Vol Chart Error", e); }

    // --- 3. RSI CHART ---
    try {
        if (state.charts.rsi) state.charts.rsi.dispose();
        state.charts.rsi = echarts.init(document.getElementById('rsiChart'));
        state.charts.rsi.setOption({
            grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
            xAxis: { data: dates, show: false },
            yAxis: { min: 0, max: 100, splitLine: { show: false }, axisLabel: { color: textColor } },
            series: [{ type: 'line', data: [], showSymbol: false, lineStyle: { width: 1, color: '#f59e0b' }, markLine: { data: [{ yAxis: 30 }, { yAxis: 70 }], lineStyle: { type: 'dashed', opacity: 0.3 } } }]
        });
    } catch(e) { console.error("RSI Chart Error", e); }

    // --- 4. MACD CHART ---
    try {
        if (state.charts.macd) state.charts.macd.dispose();
        state.charts.macd = echarts.init(document.getElementById('macdChart'));
        state.charts.macd.setOption({
            grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
            xAxis: { data: dates, show: false },
            yAxis: { show: false },
            series: [{ type: 'bar', data: [], itemStyle: { color: '#3b82f6' } }]
        });
    } catch(e) { console.error("MACD Chart Error", e); }

    // Szinkronizálás
    echarts.connect([state.charts.main, state.charts.vol, state.charts.rsi, state.charts.macd]);
    
    // Első adatfeltöltés
    updateChartsData();
}

function updateChartsData() {
    const ohlc = state.data.map(d => [d.open, d.close, d.low, d.high]);
    const ma20 = calculateMA(20, state.data);
    const ma50 = calculateMA(50, state.data);
    const volumes = state.data.map((d, i) => ({ value: d.volume, itemStyle: { color: d.close > d.open ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)' } }));
    const rsiData = calculateRSI(state.data);
    const macdData = calculateMACD(state.data);

    // KPI Update
    const last = state.data[state.data.length-1];
    const prev = state.data[state.data.length-2];
    updateKPIs(last, prev);
    document.getElementById('kpiRsi').innerText = parseFloat(rsiData[rsiData.length-1]||0).toFixed(1);

    // Chart Data Update (Csak az adatokat küldjük be)
    if(state.charts.main) {
        state.charts.main.setOption({
            series: [
                { data: ohlc }, // Price
                { data: ma20 }, // MA20
                { data: ma50 }  // MA50
            ]
        });
    }
    if(state.charts.vol) state.charts.vol.setOption({ series: [{ data: volumes }] });
    if(state.charts.rsi) state.charts.rsi.setOption({ series: [{ data: rsiData }] });
    if(state.charts.macd) state.charts.macd.setOption({ series: [{ data: macdData }] });
}

// --- MATH FUNCTIONS (Biztonságos verziók) ---
function calculateMA(dayCount, data) {
    if(data.length < dayCount) return [];
    return data.map((val, i, arr) => {
        if (i < dayCount) return '-';
        let sum = 0;
        for (let j = 0; j < dayCount; j++) sum += arr[i - j].close;
        return (sum / dayCount).toFixed(2);
    });
}

function calculateRSI(data, period = 14) {
    if(data.length < period + 1) return [];
    let rsi = [];
    let gain = 0, loss = 0;
    // Első átlag
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
    // Feltöltés az elején nullával, hogy passzoljon a dátumhoz
    return new Array(period).fill(null).concat(rsi);
}

function calculateMACD(data) {
    // Egyszerűsített MACD megjelenítés (MA12 - MA26)
    const ma12 = calculateMA(12, data);
    const ma26 = calculateMA(26, data);
    return ma12.map((v, i) => (v==='-'||ma26[i]==='-') ? 0 : v - ma26[i]);
}

function updateKPIs(last, prev) {
    if(!last || !prev) return;
    document.getElementById('kpiPrice').innerText = `$${last.close.toFixed(2)}`;
    const change = ((last.close - prev.close) / prev.close) * 100;
    const chgEl = document.getElementById('kpiChange');
    chgEl.innerText = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
    chgEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
    document.getElementById('kpiVol').innerText = (last.volume / 1000000).toFixed(2) + 'M';
}

function clearAllIntervals() {
    state.intervals.forEach(i => clearInterval(i));
    state.intervals = [];
}

function updateStatus(msg, type) {
    const el = document.getElementById('statusIndicator');
    if(!el) return;
    el.innerText = msg;
    el.className = `status-badge ${type}`;
    if(state.source === 'live') el.classList.add('pulse-animation');
    else el.classList.remove('pulse-animation');
}

// --- INIT ---
window.addEventListener('DOMContentLoaded', () => {
    // Eseménykezelők
    const stockSel = document.getElementById('stockSelect');
    if(stockSel) stockSel.addEventListener('change', (e) => { state.symbol = e.target.value; loadData(); });
    
    document.querySelectorAll('input[name="source"]').forEach(r => {
        r.addEventListener('change', (e) => { if(e.target.checked) { state.source = e.target.value; loadData(); }});
    });

    // Theme kezelés
    const t = document.getElementById('themeToggle');
    if(t) {
        if(localStorage.getItem('theme')==='dark') { document.documentElement.dataset.theme='dark'; t.checked=true; }
        t.addEventListener('change', () => {
            localStorage.setItem('theme', t.checked ? 'dark' : 'light');
            location.reload();
        });
    }

    // Resize Observer (Profi méretezéshez)
    window.onresize = () => Object.values(state.charts).forEach(c => c && c.resize());

    // START
    loadData();
});
