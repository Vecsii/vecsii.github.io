/**
 * Pro Dashboard v3.5
 * Handles: Yahoo Finance Data Structure (Meta+Data)
 */

const state = {
    symbol: 'NVDA',
    source: 'static',
    data: [],
    meta: {},
    charts: {} 
};

// --- DATA LOADING ---
async function loadData() {
    updateStatus('Syncing Data...', 'warning');
    let rawData = [];

    try {
        if (state.source === 'static') {
            // Cache buster (?t=...) hogy mindig a friss JSON-t lássuk GitHubon
            const res = await fetch(`./stocks.json?t=${new Date().getTime()}`);
            if (!res.ok) throw new Error("JSON not found");
            
            const json = await res.json();
            if (!json[state.symbol]) throw new Error("Symbol not in JSON");

            // ÚJ STRUKTÚRA KEZELÉSE
            state.meta = json[state.symbol].meta;
            state.data = json[state.symbol].data;
            
            // Dátum objektummá alakítás
            state.data.forEach(d => d.dateObj = new Date(d.date));
            state.data.sort((a,b) => a.dateObj - b.dateObj);

            // Címsor frissítése
            document.querySelector('.header-left h1').innerHTML = 
                `${state.meta.longName || state.symbol} <span class="badge">PRO</span>`;
            
            console.log(`Updated: ${state.meta.last_updated}`);
            updateStatus('Static (Auto-Update)', 'success');

        } else {
            // Demo fallback
            throw new Error("Live API not implemented in demo");
        }
    } catch (e) {
        console.warn(e);
        updateStatus('Demo Mode (Synthetic)', 'danger');
        state.data = generateSyntheticData();
    }

    renderDashboard();
}

function updateStatus(msg, type) {
    const el = document.getElementById('statusIndicator');
    el.textContent = msg;
    el.className = `status-badge ${type}`;
}

function generateSyntheticData() {
    const arr = [];
    let price = 150;
    const now = new Date();
    for (let i = 200; i > 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const change = (Math.random() - 0.5) * 5;
        price += change;
        arr.push({ 
            date: d.toISOString().split('T')[0], 
            open: price, high: price+2, low: price-2, close: price, 
            volume: 1000000 + Math.random()*500000 
        });
    }
    return arr;
}

// --- INDICATORS ---
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

// --- RENDERING ---
function renderDashboard() {
    if(!state.data.length) return;

    const dates = state.data.map(d => d.date);
    const ohlc = state.data.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = state.data.map((d, i) => [i, d.volume, d.close > d.open ? 1 : -1]);
    
    const ma20 = calculateMA(20, state.data);
    const ma50 = calculateMA(50, state.data);
    const rsi = calculateRSI(state.data);

    // KPI Update
    const last = state.data[state.data.length-1];
    const prev = state.data[state.data.length-2];
    
    document.getElementById('kpiPrice').innerText = `$${last.close.toFixed(2)}`;
    const change = ((last.close - prev.close)/prev.close)*100;
    const chgEl = document.getElementById('kpiChange');
    chgEl.innerText = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
    chgEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
    document.getElementById('kpiRsi').innerText = parseFloat(rsi[rsi.length-1]||0).toFixed(1);
    document.getElementById('kpiVol').innerText = (last.volume/1000000).toFixed(1) + 'M';

    // Charts Config
    const isDark = document.documentElement.dataset.theme === 'dark';
    const textColor = isDark ? '#ccc' : '#333';
    const gridColor = isDark ? '#333' : '#e0e0e0';

    // 1. MAIN
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

    // 2. VOLUME
    if(state.charts.vol) state.charts.vol.dispose();
    state.charts.vol = echarts.init(document.getElementById('volChart'));
    state.charts.vol.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '3%', top: '10%', bottom: '10%' },
        xAxis: { data: dates, show: false },
        yAxis: { show: false },
        series: [{ type: 'bar', data: volumes.map(v => ({ value: v[1], itemStyle: { color: v[2]>0?'rgba(16,185,129,0.5)':'rgba(239,68,68,0.5)' } })) }]
    });

    // 3. RSI
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
    
    // 4. MACD (Simple Proxy)
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

// Events
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('stockSelect').addEventListener('change', (e) => { state.symbol = e.target.value; loadData(); });
    document.querySelectorAll('input[name="source"]').forEach(r => r.addEventListener('change', (e) => { if(e.target.checked) { state.source = e.target.value; loadData(); } }));
    loadData();
});
