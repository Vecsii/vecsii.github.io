/**
 * Pro Dashboard v4.0 - API & Live Sync
 * Adatforrás: Serverless JSON API (GitHub Actions)
 */

const state = {
    symbol: 'NVDA',
    source: 'static', // static | live
    data: [],
    meta: {},
    charts: {},
    refreshTimer: null // Az időzítő változója
};

// --- ADAT BETÖLTÉS (CORE API) ---
async function loadData() {
    // Ha Live módban vagyunk, jelezzük a frissítést
    if (state.source === 'live') {
        updateStatus('Checking API...', 'warning');
    } else {
        updateStatus('Loading Data...', 'warning');
    }

    try {
        // TRÜKK: A ?t=... rész miatt a böngésző nem cache-el, hanem mindig a legfrissebbet kéri
        const timestamp = new Date().getTime();
        const url = `./stocks.json?t=${timestamp}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("API Connection Failed");
        
        const json = await res.json();
        if (!json[state.symbol]) throw new Error("Symbol missing in API response");

        // Adatfeldolgozás
        state.meta = json[state.symbol].meta;
        state.data = json[state.symbol].data;
        
        // Dátum konverzió
        state.data.forEach(d => d.dateObj = new Date(d.date));
        state.data.sort((a,b) => a.dateObj - b.dateObj);

        // UI Frissítés
        document.querySelector('.header-left h1').innerHTML = 
            `${state.meta.longName || state.symbol} <span class="badge">PRO</span>`;
        
        // Időbélyeg formázása
        const lastUpdate = new Date(state.meta.last_updated); // Stringből dátum
        const timeString = lastUpdate.toLocaleString();

        if (state.source === 'live') {
            updateStatus(`● LIVE | Last Sync: ${timeString}`, 'success');
        } else {
            updateStatus(`Static Mode | Data: ${timeString}`, 'success');
        }

        renderDashboard();

    } catch (e) {
        console.error(e);
        updateStatus('API Error / Offline', 'danger');
        // Ha nincs net, vagy hiba van, ne generáljunk kamut, inkább legyen üres/hiba
    }
}

// --- STÁTUSZ KIÍRÁS ---
function updateStatus(msg, type) {
    const el = document.getElementById('statusIndicator');
    el.textContent = msg;
    // Típusok: warning (sárga), success (zöld), danger (piros)
    el.className = `status-badge ${type}`;
    
    // Ha Live, akkor villogjon a zöld
    if (type === 'success' && state.source === 'live') {
        el.classList.add('pulse-animation');
    }
}

// --- INDICATORS (Matematika) ---
function calculateMA(dayCount, data) {
    var result = [];
    for (var i = 0, len = data.length; i < len; i++) {
        if (i < dayCount) { result.push('-'); continue; }
        var sum = 0;
        for (var j = 0; j < dayCount; j++) sum += data[i - j].close;
        result.push((sum / dayCount).toFixed(2));
    }
    return result;
}

function calculateRSI(data, period = 14) {
    let rsi = new Array(period).fill(null);
    let prevAvgGain = 0, prevAvgLoss = 0;
    for(let i=1; i<=period; i++) {
        let change = data[i].close - data[i-1].close;
        if(change > 0) prevAvgGain += change; else prevAvgLoss -= change;
    }
    prevAvgGain /= period; prevAvgLoss /= period;
    rsi.push(100 - (100/(1 + prevAvgGain/prevAvgLoss)));
    for(let i=period+1; i<data.length; i++) {
        let change = data[i].close - data[i-1].close;
        let gain = change > 0 ? change : 0;
        let loss = change < 0 ? -change : 0;
        prevAvgGain = (prevAvgGain*(period-1) + gain)/period;
        prevAvgLoss = (prevAvgLoss*(period-1) + loss)/period;
        rsi.push((100 - (100/(1 + prevAvgGain/prevAvgLoss))).toFixed(2));
    }
    return rsi;
}

// --- RENDERING (ECharts) ---
function renderDashboard() {
    if(!state.data.length) return;

    const dates = state.data.map(d => d.date);
    const ohlc = state.data.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = state.data.map((d, i) => [i, d.volume, d.close > d.open ? 1 : -1]);
    
    const ma20 = calculateMA(20, state.data);
    const ma50 = calculateMA(50, state.data);
    const rsi = calculateRSI(state.data);

    // KPI Kártyák Frissítése
    const last = state.data[state.data.length-1];
    const prev = state.data[state.data.length-2];
    
    document.getElementById('kpiPrice').innerText = `$${last.close.toFixed(2)}`;
    const change = ((last.close - prev.close)/prev.close)*100;
    const chgEl = document.getElementById('kpiChange');
    chgEl.innerText = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
    chgEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
    document.getElementById('kpiRsi').innerText = parseFloat(rsi[rsi.length-1]||0).toFixed(1);
    document.getElementById('kpiVol').innerText = (last.volume/1000000).toFixed(1) + 'M';

    // Chart Színek
    const isDark = document.documentElement.dataset.theme === 'dark';
    const textColor = isDark ? '#ccc' : '#333';
    const gridColor = isDark ? '#333' : '#e0e0e0';

    // 1. MAIN CHART
    if(state.charts.main) state.charts.main.dispose();
    state.charts.main = echarts.init(document.getElementById('mainChart'));
    state.charts.main.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        grid: { left: '3%', right: '3%', bottom: '15%' },
        xAxis: { data: dates, axisLine: { lineStyle: { color: textColor } } },
        yAxis: { scale: true, splitLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor } },
        dataZoom: [{ type: 'inside', start: 80, end: 100 }, { show: true, type: 'slider', top: '90%' }],
        series: [
            { name: 'Price', type: 'candlestick', data: ohlc, itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' } },
            { name: 'MA20', type: 'line', data: ma20, smooth: true, lineStyle: { opacity: 0.5 } },
            { name: 'MA50', type: 'line', data: ma50, smooth: true, lineStyle: { opacity: 0.5 } }
        ]
    });

    // 2. VOLUME CHART
    if(state.charts.vol) state.charts.vol.dispose();
    state.charts.vol = echarts.init(document.getElementById('volChart'));
    state.charts.vol.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '3%', top: '10%', bottom: '10%' },
        xAxis: { data: dates, show: false },
        yAxis: { show: false },
        series: [{ type: 'bar', data: volumes.map(v => ({ value: v[1], itemStyle: { color: v[2]>0?'rgba(16,185,129,0.5)':'rgba(239,68,68,0.5)' } })) }]
    });

    // 3. RSI CHART
    if(state.charts.rsi) state.charts.rsi.dispose();
    state.charts.rsi = echarts.init(document.getElementById('rsiChart'));
    state.charts.rsi.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '3%', top: '10%', bottom: '10%' },
        xAxis: { data: dates, show: false },
        yAxis: { min: 0, max: 100, splitLine: { show: false }, axisLabel: { color: textColor } },
        series: [{
            type: 'line', data: rsi, lineStyle: { width: 1, color: '#f59e0b' },
            markLine: { data: [{ yAxis: 30 }, { yAxis: 70 }], lineStyle: { type: 'dashed', opacity: 0.3 } }
        }]
    });
    
    // 4. MACD CHART
    if(state.charts.macd) state.charts.macd.dispose();
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

    echarts.connect([state.charts.main, state.charts.vol, state.charts.rsi, state.charts.macd]);
    window.onresize = () => Object.values(state.charts).forEach(c => c.resize());
}

// --- VEZÉRLÉS ---
function handleSourceChange(newSource) {
    state.source = newSource;
    
    // Töröljük a korábbi időzítőt, ha volt
    if (state.refreshTimer) clearInterval(state.refreshTimer);

    if (state.source === 'live') {
        loadData(); // Azonnali betöltés
        // LIVE MÓD: Percenként frissítünk (Auto-Refresh)
        state.refreshTimer = setInterval(loadData, 60000); 
    } else {
        // STATIC MÓD: Csak egyszer töltünk be
        loadData();
    }
}

// Events
window.addEventListener('DOMContentLoaded', () => {
    // Részvény választó
    document.getElementById('stockSelect').addEventListener('change', (e) => { 
        state.symbol = e.target.value; 
        loadData(); 
    });

    // Source választó (Static / Live)
    document.querySelectorAll('input[name="source"]').forEach(r => {
        r.addEventListener('change', (e) => { 
            if(e.target.checked) handleSourceChange(e.target.value);
        });
    });

    // Kezdés
    handleSourceChange('static');
});
