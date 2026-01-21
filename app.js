/**
 * Pro Dashboard v5.2 - FULL VERSION
 * Tartalmazza: Dátum fix, Memória kezelés, ÖSSZES CHART (Main, Vol, RSI, MACD)
 */

const state = {
    symbol: 'NVDA',
    source: 'static',
    staticData: [], // Biztonsági mentés
    data: [],       // Munkapéldány
    meta: {},
    charts: { main: null, vol: null, rsi: null, macd: null }, // Itt tároljuk mind a 4-et
    intervals: [] 
};

// --- 1. ADAT BETÖLTÉS ---
async function loadData() {
    clearAllIntervals(); 
    updateStatus('Kapcsolódás...', 'warning');

    try {
        const t = new Date().getTime();
        const res = await fetch(`./stocks.json?t=${t}`);
        if (!res.ok) throw new Error("Data Source Error");
        
        const json = await res.json();
        if (!json[state.symbol]) throw new Error("Symbol missing");

        state.meta = json[state.symbol].meta;
        
        // Adatok feldolgozása
        const rawData = json[state.symbol].data.map(d => ({
            ...d,
            dateObj: new Date(d.date)
        })).sort((a,b) => a.dateObj - b.dateObj);

        // Mentések létrehozása
        state.staticData = JSON.parse(JSON.stringify(rawData));
        state.data = JSON.parse(JSON.stringify(rawData));

        // Fejléc
        document.querySelector('.header-left h1').innerHTML = 
            `${state.meta.longName || state.symbol} <span class="badge">PRO</span>`;

        // Indulás
        handleModeChange();

    } catch (e) {
        console.error(e);
        updateStatus('Offline / Error', 'danger');
    }
}

// --- 2. MÓD VÁLTÁS ---
function handleModeChange() {
    clearAllIntervals();

    if (state.source === 'static') {
        // STATIC: Visszaállunk az eredetire (20.-a)
        state.data = JSON.parse(JSON.stringify(state.staticData));
        const time = new Date(state.meta.last_updated).toLocaleDateString();
        updateStatus(`🔒 STATIC | Adat dátuma: ${time}`, 'warning');
        renderDashboard(); 
        
    } else {
        // LIVE: Visszaállunk, de a dátumot átírjuk MARA
        state.data = JSON.parse(JSON.stringify(state.staticData));
        
        const lastCandle = state.data[state.data.length - 1];
        const today = new Date().toISOString().split('T')[0]; 
        lastCandle.date = today; 

        renderDashboard(); 
        startLiveSimulation(); 
    }
}

// --- 3. LIVE SZIMULÁTOR ---
function startLiveSimulation() {
    updateStatus('● ÉLŐ KAPCSOLAT | Szinkronizálás...', 'success');

    const ticker = setInterval(() => {
        const lastCandle = state.data[state.data.length - 1];
        
        // Random mozgás
        const volatility = lastCandle.close * 0.003; 
        const movement = (Math.random() - 0.5) * volatility;
        let newPrice = lastCandle.close + movement;
        
        lastCandle.close = newPrice;
        if (newPrice > lastCandle.high) lastCandle.high = newPrice;
        if (newPrice < lastCandle.low) lastCandle.low = newPrice;
        lastCandle.volume += Math.floor(Math.random() * 5000);

        // UI Frissítés
        updateKPIs(lastCandle, state.data[state.data.length - 2]);
        renderDashboard(true); // true = csak gyors frissítés
        
        const now = new Date().toLocaleTimeString();
        updateStatus(`● LIVE | ${lastCandle.date} ${now}`, 'success');

    }, 1000); 

    state.intervals.push(ticker);
}

// --- 4. RAJZOLÁS (RENDER) - MOST MÁR MINDEN BENNE VAN ---
function renderDashboard(isUpdate = false) {
    if (!state.data.length) return;

    // Adatok előkészítése
    const dates = state.data.map(d => d.date);
    const ohlc = state.data.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = state.data.map((d, i) => ({
        value: d.volume,
        itemStyle: { color: d.close > d.open ? '#10b981' : '#ef4444' }
    }));
    
    const ma20 = calculateMA(20, state.data);
    const ma50 = calculateMA(50, state.data);
    const rsiData = calculateRSI(state.data);
    const macdData = calculateMACD(state.data); // Feltételezve, hogy van ilyen függvény, vagy írunk egyet lentebb

    // KPI (ha nem update)
    if (!isUpdate) {
        updateKPIs(state.data[state.data.length-1], state.data[state.data.length-2]);
        document.getElementById('kpiRsi').innerText = parseFloat(rsiData[rsiData.length-1]||0).toFixed(1);
    }

    // Stílusok
    const isDark = document.documentElement.dataset.theme === 'dark';
    const textColor = isDark ? '#ccc' : '#333';
    const gridColor = isDark ? '#333' : '#e0e0e0';

    // --- CHART 1: MAIN ---
    if (!state.charts.main) state.charts.main = echarts.init(document.getElementById('mainChart'));
    state.charts.main.setOption({
        animation: false,
        grid: { left: '3%', right: '3%', bottom: '15%' },
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        xAxis: { data: dates, axisLine: { lineStyle: { color: textColor } } },
        yAxis: { scale: true, splitLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor } },
        dataZoom: [{ type: 'inside', start: 80, end: 100 }, { show: !isUpdate, type: 'slider', top: '90%' }],
        series: [
            { name: 'Price', type: 'candlestick', data: ohlc, itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' } },
            { name: 'MA20', type: 'line', data: ma20, smooth: true, showSymbol: false, lineStyle: { opacity: 0.5 } },
            { name: 'MA50', type: 'line', data: ma50, smooth: true, showSymbol: false, lineStyle: { opacity: 0.5 } }
        ]
    });

    // Ha csak gyors frissítés van, a többit nem rajzoljuk újra (CPU kímélés)
    // KIVÉVE ha mozogniuk kell (Live módban érdemes lehet)
    // De most maradjunk a biztonságosnál: Frissítjük őket is, ha kell.
    
    // --- CHART 2: VOLUME ---
    if (!state.charts.vol) state.charts.vol = echarts.init(document.getElementById('volChart'));
    state.charts.vol.setOption({
        animation: false,
        grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
        xAxis: { data: dates, show: false },
        yAxis: { show: false },
        series: [{ type: 'bar', data: volumes }]
    });

    // --- CHART 3: RSI ---
    if (!state.charts.rsi) state.charts.rsi = echarts.init(document.getElementById('rsiChart'));
    state.charts.rsi.setOption({
        animation: false,
        grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
        xAxis: { data: dates, show: false },
        yAxis: { min: 0, max: 100, splitLine: { show: false }, axisLabel: { show: false } }, // Kicsit egyszerűsítve
        series: [{ 
            type: 'line', data: rsiData, showSymbol: false, lineStyle: { color: '#f59e0b', width: 1 },
            markLine: { data: [{ yAxis: 30 }, { yAxis: 70 }], lineStyle: { type: 'dashed', opacity: 0.5 } }
        }]
    });

    // --- CHART 4: MACD ---
    if (!state.charts.macd) state.charts.macd = echarts.init(document.getElementById('macdChart'));
    state.charts.macd.setOption({
        animation: false,
        grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
        xAxis: { data: dates, show: false },
        yAxis: { show: false },
        series: [{ type: 'bar', data: macdData, itemStyle: { color: '#3b82f6' } }]
    });

    // Szinkronizálás (hogy egyszerre zoomoljanak)
    if (!isUpdate) {
        echarts.connect([state.charts.main, state.charts.vol, state.charts.rsi, state.charts.macd]);
    }
}

// --- SEGÉDFÜGGVÉNYEK ---
function clearAllIntervals() {
    state.intervals.forEach(i => clearInterval(i));
    state.intervals = [];
}

function updateStatus(msg, type) {
    const el = document.getElementById('statusIndicator');
    if (el) {
        el.textContent = msg;
        el.className = `status-badge ${type}`;
        if (type === 'success' && state.source === 'live') el.classList.add('pulse-animation');
        else el.classList.remove('pulse-animation');
    }
}

function updateKPIs(last, prev) {
    document.getElementById('kpiPrice').innerText = `$${last.close.toFixed(2)}`;
    const change = ((last.close - prev.close) / prev.close) * 100;
    const chgEl = document.getElementById('kpiChange');
    chgEl.innerText = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
    chgEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
    document.getElementById('kpiVol').innerText = (last.volume / 1000000).toFixed(2) + 'M';
}

// --- MATEK ---
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

function calculateMACD(data) {
    // Egyszerűsített MACD (Close - MA20) a vizualizációhoz
    const ma20 = calculateMA(20, data);
    return data.map((d, i) => {
        if(ma20[i] === '-') return 0;
        return (d.close - parseFloat(ma20[i])).toFixed(2);
    });
}

// --- INDÍTÁS ---
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('stockSelect').addEventListener('change', (e) => { 
        state.symbol = e.target.value; 
        loadData(); 
    });
    
    document.querySelectorAll('input[name="source"]').forEach(r => {
        r.addEventListener('change', (e) => { 
            if(e.target.checked) {
                state.source = e.target.value;
                handleModeChange(); 
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
