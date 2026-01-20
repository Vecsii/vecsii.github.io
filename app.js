/**
 * Pro Dashboard v7.0 - COMPLETE (All Charts + Aggressive Live)
 */

const state = {
    symbol: 'NVDA',
    source: 'static',
    data: [],
    meta: {},
    charts: {},
    intervals: [] 
};

// --- ADAT BETÖLTÉS ---
async function loadData() {
    clearAllIntervals();
    const timeBuster = new Date().getTime();
    
    try {
        const res = await fetch(`./stocks.json?t=${timeBuster}`);
        if (!res.ok) throw new Error("JSON Error");
        
        const json = await res.json();
        const stockData = json[state.symbol];
        
        state.meta = stockData.meta;
        state.data = stockData.data.map(d => ({ ...d, dateObj: new Date(d.date) }));
        state.data.sort((a,b) => a.dateObj - b.dateObj);

        // Fejléc
        document.querySelector('.header-left h1').innerHTML = 
            `${state.meta.longName || state.symbol} <span class="badge">PRO</span>`;

        // Renderelés (MINDEN CHARTOT)
        renderDashboard();

        // Üzemmód választás
        if (state.source === 'static') {
            const dateStr = new Date(state.meta.last_updated).toLocaleDateString();
            updateStatus(`🔒 STATIC | Adat: ${dateStr}`, 'warning');
        } else {
            updateStatus(`● ÉLŐ KAPCSOLAT | Szinkronizálás...`, 'success');
            startAggressiveSimulation();
        }

    } catch (e) {
        console.error(e);
        updateStatus('Hiba az adatokkal', 'danger');
    }
}

// --- SZIMULÁTOR ---
function startAggressiveSimulation() {
    const ticker = setInterval(() => {
        const lastCandle = state.data[state.data.length - 1];
        const prevCandle = state.data[state.data.length - 2];

        // Ármozgás generálása
        const volatility = lastCandle.close * 0.003; 
        const change = (Math.random() - 0.5) * volatility;
        lastCandle.close += change;
        
        // Volume növelése kicsit
        lastCandle.volume += Math.floor(Math.random() * 500);

        // UI Frissítés
        updateKPIs(lastCandle, prevCandle);
        
        // Chartok frissítése (Csak adatcsere)
        renderDashboard(true);

        // Idő pörgetése
        const now = new Date().toLocaleTimeString(); 
        updateStatus(`● LIVE | Idő: ${now}`, 'success'); 

    }, 1000);

    state.intervals.push(ticker);
}

// --- SEGÉDEK ---
function clearAllIntervals() {
    state.intervals.forEach(i => clearInterval(i));
    state.intervals = [];
}

function updateStatus(msg, type) {
    const el = document.getElementById('statusIndicator');
    el.innerText = msg;
    el.className = `status-badge ${type}`;
    if(state.source === 'live') el.classList.add('pulse-animation');
    else el.classList.remove('pulse-animation');
}

// --- INDICATOR MATH ---
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
    for (let i = 1; i <= period; i++) {
        let change = data[i].close - data[i - 1].close;
        if (change > 0) gain += change; else loss -= change;
    }
    gain /= period; loss /= period;
    rsi.push(100 - (100 / (1 + gain / loss)));

    for (let i = period + 1; i < data.length; i++) {
        let change = data[i].close - data[i - 1].close;
        let g = change > 0 ? change : 0;
        let l = change < 0 ? -change : 0;
        gain = (gain * (period - 1) + g) / period;
        loss = (loss * (period - 1) + l) / period;
        rsi.push((100 - (100 / (1 + gain / loss))).toFixed(2));
    }
    return new Array(period).fill(null).concat(rsi); 
}

function updateKPIs(last, prev) {
    document.getElementById('kpiPrice').innerText = `$${last.close.toFixed(2)}`;
    const change = ((last.close - prev.close) / prev.close) * 100;
    const chgEl = document.getElementById('kpiChange');
    chgEl.innerText = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
    chgEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
    document.getElementById('kpiVol').innerText = (last.volume / 1000000).toFixed(2) + 'M';
}

// --- CORE RENDERING ---
function renderDashboard(isUpdate = false) {
    if (!state.data.length) return;
    
    // Adatok előkészítése
    const dates = state.data.map(d => d.date);
    const ohlc = state.data.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = state.data.map((d, i) => [i, d.volume, d.close > d.open ? 1 : -1]);
    const ma20 = calculateMA(20, state.data);
    const ma50 = calculateMA(50, state.data);
    
    // Theme colors
    const isDark = document.documentElement.dataset.theme === 'dark';
    const textColor = isDark ? '#ccc' : '#333';

    // --- 1. MAIN CHART (Árfolyam) ---
    if (!state.charts.main) state.charts.main = echarts.init(document.getElementById('mainChart'));
    state.charts.main.setOption({
        animation: false,
        grid: { left: '3%', right: '3%', bottom: '10%' },
        xAxis: { data: dates, axisLine: { lineStyle: { color: textColor } } },
        yAxis: { scale: true, axisLabel: { color: textColor } },
        dataZoom: [{ type: 'inside', start: 80, end: 100 }, { show: !isUpdate, type: 'slider', top: '92%' }],
        series: [
            { name: 'Price', type: 'candlestick', data: ohlc, itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' } },
            { name: 'MA20', type: 'line', data: ma20, showSymbol: false, lineStyle: { opacity: 0.5, width: 1 } },
            { name: 'MA50', type: 'line', data: ma50, showSymbol: false, lineStyle: { opacity: 0.5, width: 1 } }
        ]
    });

    // Ha ez csak gyors frissítés (Live), a többit nem rajzoljuk újra (CPU kímélés)
    if (isUpdate) return;

    // --- KPI RSI Frissítés ---
    const rsiData = calculateRSI(state.data);
    document.getElementById('kpiRsi').innerText = parseFloat(rsiData[rsiData.length-1]||0).toFixed(1);

    // --- 2. VOLUME CHART ---
    if (state.charts.vol) state.charts.vol.dispose();
    state.charts.vol = echarts.init(document.getElementById('volChart'));
    state.charts.vol.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '3%', top: '10%', bottom: '10%' },
        xAxis: { data: dates, show: false },
        yAxis: { show: false },
        series: [{ type: 'bar', data: volumes.map(v => ({ value: v[1], itemStyle: { color: v[2]>0?'rgba(16,185,129,0.5)':'rgba(239,68,68,0.5)' } })) }]
    });

    // --- 3. RSI CHART ---
    if (state.charts.rsi) state.charts.rsi.dispose();
    state.charts.rsi = echarts.init(document.getElementById('rsiChart'));
    state.charts.rsi.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '3%', top: '10%', bottom: '10%' },
        xAxis: { data: dates, show: false },
        yAxis: { min: 0, max: 100, splitLine: { show: false }, axisLabel: { color: textColor } },
        series: [{
            type: 'line', data: rsiData, showSymbol: false, lineStyle: { width: 1, color: '#f59e0b' },
            markLine: { data: [{ yAxis: 30 }, { yAxis: 70 }], lineStyle: { type: 'dashed', opacity: 0.3 } }
        }]
    });

    // --- 4. MACD CHART ---
    if (state.charts.macd) state.charts.macd.dispose();
    state.charts.macd = echarts.init(document.getElementById('macdChart'));
    const ma12 = calculateMA(12, state.data);
    const ma26 = calculateMA(26, state.data);
    const macdData = ma12.map((v, i) => (v==='-'||ma26[i]==='-') ? 0 : v - ma26[i]);
    state.charts.macd.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '3%', top: '10%', bottom: '10%' },
        xAxis: { data: dates, show: false },
        yAxis: { show: false },
        series: [{ type: 'bar', data: macdData, itemStyle: { color: '#3b82f6' } }]
    });

    // Összekötés (Zoom Sync)
    echarts.connect([state.charts.main, state.charts.vol, state.charts.rsi, state.charts.macd]);
    
    // Resize kezelés
    window.onresize = () => Object.values(state.charts).forEach(c => c.resize());
}

// --- INIT ---
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('stockSelect').addEventListener('change', (e) => { state.symbol = e.target.value; loadData(); });
    document.querySelectorAll('input[name="source"]').forEach(r => {
        r.addEventListener('change', (e) => { if(e.target.checked) { state.source = e.target.value; loadData(); }});
    });
    
    // Theme
    const t = document.getElementById('themeToggle');
    if(localStorage.getItem('theme')==='dark') { document.documentElement.dataset.theme='dark'; t.checked=true; }
    t.addEventListener('change', () => {
        localStorage.setItem('theme', t.checked ? 'dark' : 'light');
        location.reload();
    });

    loadData();
});
