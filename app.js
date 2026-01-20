/**
 * Pro Dashboard v10.0 - Stable Live Animation
 * Fix: Charts are initialized ONCE, data is UPDATED dynamically.
 */

const state = {
    symbol: 'NVDA',
    source: 'static',
    data: [],
    meta: {},
    charts: { main: null, vol: null, rsi: null, macd: null }, // Itt tároljuk a chartokat
    timer: null
};

// --- 1. ADAT BETÖLTÉS ---
async function loadData() {
    if (state.timer) clearInterval(state.timer);
    updateStatus('Kapcsolódás...', 'warning');

    try {
        const t = new Date().getTime();
        const res = await fetch(`./stocks.json?t=${t}`);
        if (!res.ok) throw new Error("JSON hiba");
        
        const json = await res.json();
        if (!json[state.symbol]) throw new Error("Nincs adat");

        state.meta = json[state.symbol].meta;
        state.data = json[state.symbol].data.map(d => ({
            ...d,
            dateObj: new Date(d.date)
        }));
        state.data.sort((a,b) => a.dateObj - b.dateObj);

        // UI Header
        document.querySelector('.header-left h1').innerHTML = 
            `${state.meta.longName || state.symbol} <span class="badge">PRO</span>`;

        // ELŐSZÖR LÉTREHOZZUK A CHART KERETEKET (ÜRESEN)
        initCharts();

        // FELTÖLTJÜK ADATTAL
        updateDashboard();

        if (state.source === 'static') {
            const dateStr = new Date(state.meta.last_updated).toLocaleDateString();
            updateStatus(`🔒 STATIC | Adat: ${dateStr}`, 'warning');
        } else {
            updateStatus(`● ÉLŐ PIACTÉR | Aktív`, 'success');
            startLiveSimulation();
        }

    } catch (e) {
        console.error(e);
        updateStatus('Adatbetöltési hiba', 'danger');
    }
}

// --- 2. LIVE SIMULÁTOR ---
function startLiveSimulation() {
    state.timer = setInterval(() => {
        if (!state.data.length) return;

        // Utolsó gyertya manipulálása
        const lastIndex = state.data.length - 1;
        const lastCandle = state.data[lastIndex];
        
        // Random mozgás
        const volatility = lastCandle.close * 0.002; // 0.2% mozgás
        const move = (Math.random() - 0.5) * volatility;
        
        let newPrice = lastCandle.close + move;
        lastCandle.close = parseFloat(newPrice.toFixed(2));

        // High/Low igazítás (hogy a gyertya kanóca is nőjön)
        if (lastCandle.close > lastCandle.high) lastCandle.high = lastCandle.close;
        if (lastCandle.close < lastCandle.low) lastCandle.low = lastCandle.close;
        
        lastCandle.volume += Math.floor(Math.random() * 5000);

        // FRISSÍTÉS (Csak az adatokat küldjük be újra)
        updateDashboard();

        // Idő pörgetése
        const now = new Date().toLocaleTimeString();
        updateStatus(`● LIVE | ${now} | Ár: ${lastCandle.close}`, 'success');

    }, 1000); // 1 másodpercenként
}

// --- 3. CHART INICIALIZÁLÁS (CSAK EGYSZER FUT LE) ---
function initCharts() {
    // Ha már léteznek, nem hozzuk létre újra, csak átméretezzük
    if (state.charts.main) return;

    const isDark = document.documentElement.dataset.theme === 'dark';
    const textColor = isDark ? '#ccc' : '#333';
    const gridColor = isDark ? '#333' : '#e0e0e0';

    // 1. MAIN CHART
    const mainDom = document.getElementById('mainChart');
    if(mainDom) {
        state.charts.main = echarts.init(mainDom);
        state.charts.main.setOption({
            animation: false, // Fontos a teljesítményhez
            grid: { left: '50px', right: '20px', bottom: '30px', top: '20px' },
            tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
            xAxis: { type: 'category', data: [], axisLine: { lineStyle: { color: textColor } } },
            yAxis: { scale: true, splitLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor } },
            dataZoom: [{ type: 'inside', start: 80, end: 100 }, { show: true, type: 'slider', top: '92%' }],
            series: [
                { name: 'Price', type: 'candlestick', data: [], itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' } },
                { name: 'MA20', type: 'line', data: [], showSymbol: false, lineStyle: { opacity: 0.5, width: 1 } }
            ]
        });
    }

    // 2. VOLUME CHART
    const volDom = document.getElementById('volChart');
    if(volDom) {
        state.charts.vol = echarts.init(volDom);
        state.charts.vol.setOption({
            grid: { left: '50px', right: '20px', top: '10px', bottom: '10px' },
            xAxis: { type: 'category', data: [], show: false },
            yAxis: { show: false },
            tooltip: { trigger: 'axis' },
            series: [{ type: 'bar', data: [] }]
        });
    }

    // 3. RSI CHART
    const rsiDom = document.getElementById('rsiChart');
    if(rsiDom) {
        state.charts.rsi = echarts.init(rsiDom);
        state.charts.rsi.setOption({
            grid: { left: '50px', right: '20px', top: '10px', bottom: '10px' },
            xAxis: { type: 'category', data: [], show: false },
            yAxis: { min: 0, max: 100, splitLine: { show: false }, axisLabel: { color: textColor } },
            tooltip: { trigger: 'axis' },
            series: [{ type: 'line', data: [], showSymbol: false, lineStyle: { color: '#f59e0b', width: 1 }, markLine: { data: [{ yAxis: 30 }, { yAxis: 70 }], lineStyle: { type: 'dashed', opacity: 0.5 } } }]
        });
    }

    // 4. MACD CHART
    const macdDom = document.getElementById('macdChart');
    if(macdDom) {
        state.charts.macd = echarts.init(macdDom);
        state.charts.macd.setOption({
            grid: { left: '50px', right: '20px', top: '10px', bottom: '10px' },
            xAxis: { type: 'category', data: [], show: false },
            yAxis: { show: false },
            tooltip: { trigger: 'axis' },
            series: [{ type: 'bar', data: [], itemStyle: { color: '#3b82f6' } }]
        });
    }

    // Összekapcsolás
    echarts.connect([state.charts.main, state.charts.vol, state.charts.rsi, state.charts.macd]);
}

// --- 4. FRISSÍTÉS (EZ FUT MÁSODPERCENKÉNT) ---
function updateDashboard() {
    if (!state.data.length) return;

    // Adatok előkészítése
    const dates = state.data.map(d => d.date);
    const ohlc = state.data.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = state.data.map((d, i) => ({
        value: d.volume,
        itemStyle: { color: d.close > d.open ? '#10b981' : '#ef4444' }
    }));
    
    const ma20 = calculateMA(20, state.data);
    const rsiData = calculateRSI(14, state.data);
    const macdData = calculateMACD(state.data);

    // KPI-k (Számok a tetején)
    const last = state.data[state.data.length - 1];
    const prev = state.data[state.data.length - 2];
    
    document.getElementById('kpiPrice').innerText = `$${last.close.toFixed(2)}`;
    const chg = ((last.close - prev.close) / prev.close) * 100;
    const chgEl = document.getElementById('kpiChange');
    chgEl.innerText = `${chg > 0 ? '+' : ''}${chg.toFixed(2)}%`;
    chgEl.style.color = chg >= 0 ? '#10b981' : '#ef4444';
    
    const rsiVal = rsiData[rsiData.length-1];
    document.getElementById('kpiRsi').innerText = (rsiVal && rsiVal !== '-') ? parseFloat(rsiVal).toFixed(1) : '--';
    document.getElementById('kpiVol').innerText = (last.volume / 1000000).toFixed(2) + 'M';

    // DIAGRAMOK FRISSÍTÉSE (setOption csak az adatokat cseréli)
    if(state.charts.main) {
        state.charts.main.setOption({
            xAxis: { data: dates },
            series: [{ data: ohlc }, { data: ma20 }]
        });
    }
    if(state.charts.vol) {
        state.charts.vol.setOption({ xAxis: { data: dates }, series: [{ data: volumes }] });
    }
    if(state.charts.rsi) {
        state.charts.rsi.setOption({ xAxis: { data: dates }, series: [{ data: rsiData }] });
    }
    if(state.charts.macd) {
        state.charts.macd.setOption({ xAxis: { data: dates }, series: [{ data: macdData }] });
    }
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

function calculateRSI(period, data) {
    let result = [];
    for(let i=0; i<period; i++) result.push(null);
    for (let i = period; i < data.length; i++) {
        let gains = 0, losses = 0;
        for(let j=0; j<period; j++) {
            let change = data[i-j].close - data[i-j-1].close;
            if(change > 0) gains += change; else losses -= change;
        }
        let rs = losses === 0 ? 100 : (gains/period) / (losses/period);
        result.push((100 - (100 / (1 + rs))).toFixed(2));
    }
    return result;
}

function calculateMACD(data) {
    // Egyszerűsített MACD (Close - MA20) demonstrációnak
    const ma20 = calculateMA(20, data);
    return data.map((d, i) => {
        if(ma20[i] === '-') return 0;
        return (d.close - parseFloat(ma20[i])).toFixed(2);
    });
}

function updateStatus(msg, type) {
    const el = document.getElementById('statusIndicator');
    if (el) {
        el.innerText = msg;
        el.className = `status-badge ${type}`;
        if (type === 'success') el.classList.add('pulse-animation');
    }
}

// --- INIT ---
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('stockSelect').addEventListener('change', (e) => {
        state.symbol = e.target.value;
        loadData();
    });

    document.querySelectorAll('input[name="source"]').forEach(r => {
        r.addEventListener('change', (e) => {
            if (e.target.checked) {
                state.source = e.target.value;
                loadData();
            }
        });
    });

    // Theme toggle - Újratöltés helyett csak a chartokat frissítjük
    const t = document.getElementById('themeToggle');
    if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.dataset.theme = 'dark';
        t.checked = true;
    }
    t.addEventListener('change', () => {
        localStorage.setItem('theme', t.checked ? 'dark' : 'light');
        document.documentElement.dataset.theme = t.checked ? 'dark' : 'light';
        // A chartokat el kell dobni és újraépíteni téma váltáskor
        Object.values(state.charts).forEach(c => c && c.dispose());
        state.charts = { main: null, vol: null, rsi: null, macd: null };
        initCharts();
        updateDashboard();
    });

    window.onresize = () => Object.values(state.charts).forEach(c => c && c.resize());

    loadData();
});
