/**
 * Pro Dashboard v9.0 - "BACK TO BASICS"
 * A legstabilabb, legegyszerűbb verzió.
 */

const state = {
    symbol: 'NVDA',
    source: 'static',
    data: [],
    meta: {},
    timer: null // Az időzítőnek
};

// --- 1. INDÍTÁS ÉS ADATLETÖLTÉS ---
async function loadData() {
    // Takarítás: előző időzítő törlése
    if (state.timer) clearInterval(state.timer);
    
    updateStatus('Betöltés...', 'warning');

    try {
        // Cache trükk, hogy mindig friss legyen
        const t = new Date().getTime(); 
        const res = await fetch(`./stocks.json?t=${t}`);
        if (!res.ok) throw new Error("JSON nem elérhető");
        
        const json = await res.json();
        const stockData = json[state.symbol];
        
        if (!stockData) throw new Error("Részvény nem található");

        state.meta = stockData.meta;
        // Dátumok javítása
        state.data = stockData.data.map(d => ({
            ...d,
            dateObj: new Date(d.date)
        }));
        state.data.sort((a,b) => a.dateObj - b.dateObj);

        // Címsor beállítása
        document.querySelector('.header-left h1').innerHTML = 
            `${state.meta.longName || state.symbol} <span class="badge">PRO</span>`;

        // ELÁGAZÁS
        if (state.source === 'static') {
            // Static: Egyszer rajzolunk és kész
            const dateStr = new Date(state.meta.last_updated).toLocaleDateString();
            updateStatus(`🔒 STATIC | Adat: ${dateStr}`, 'warning');
            renderAllCharts(); // Rajzolás
        } else {
            // Live: Indítjuk a pörgetést
            updateStatus(`● ÉLŐ KAPCSOLAT | Csatlakozás...`, 'success');
            startLiveMode();
        }

    } catch (e) {
        console.error(e);
        updateStatus('Hiba történt!', 'danger');
    }
}

// --- 2. LIVE MÓD (SZIMULÁTOR) ---
function startLiveMode() {
    // Első rajzolás
    renderAllCharts();

    state.timer = setInterval(() => {
        if (state.data.length === 0) return;

        // Utolsó adatok módosítása (Szimuláció)
        const lastIndex = state.data.length - 1;
        const lastCandle = state.data[lastIndex];

        // Véletlenszerű mozgás
        const move = (Math.random() - 0.5) * (lastCandle.close * 0.005);
        lastCandle.close += move;
        
        // High/Low igazítás
        if (lastCandle.close > lastCandle.high) lastCandle.high = lastCandle.close;
        if (lastCandle.close < lastCandle.low) lastCandle.low = lastCandle.close;
        
        // Volume növelés
        lastCandle.volume += Math.floor(Math.random() * 500);

        // Újrarajzolás
        renderAllCharts();

        // Idő frissítése
        const time = new Date().toLocaleTimeString();
        updateStatus(`● LIVE | Idő: ${time}`, 'success');

    }, 1000); // 1 másodpercenként
}

// --- 3. A NAGY RAJZOLÓ FÜGGVÉNY ---
function renderAllCharts() {
    if (!state.data.length) return;

    // Adatok előkészítése
    const dates = state.data.map(d => d.date);
    const ohlc = state.data.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = state.data.map((d, i) => ({
        value: d.volume,
        itemStyle: { color: d.close > d.open ? '#10b981' : '#ef4444' }
    }));
    
    const ma20 = calculateSimpleMA(20, state.data);
    const rsiData = calculateSimpleRSI(14, state.data);
    const macdData = calculateSimpleMACD(state.data);

    // KPI-k frissítése (szövegek)
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

    // Stílusok
    const isDark = document.documentElement.dataset.theme === 'dark';
    const textColor = isDark ? '#ccc' : '#333';

    // --- CHART 1: MAIN (Árfolyam) ---
    const mainDom = document.getElementById('mainChart');
    if (mainDom) {
        // Fontos: dispose() nélkül néha nem frissül jól
        echarts.dispose(mainDom); 
        const chart = echarts.init(mainDom);
        chart.setOption({
            animation: false, // Kikapcsolva a villogás ellen
            grid: { left: '3%', right: '3%', bottom: '10%' },
            tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
            xAxis: { data: dates, axisLine: { lineStyle: { color: textColor } } },
            yAxis: { scale: true, axisLabel: { color: textColor } },
            dataZoom: [{ type: 'inside', start: 80, end: 100 }, { show: true, type: 'slider', top: '92%' }],
            series: [
                { type: 'candlestick', data: ohlc, itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' } },
                { type: 'line', data: ma20, showSymbol: false, lineStyle: { opacity: 0.5, width: 1 } }
            ]
        });
        // Összekötéshez elmentjük globálisan, ha kell, de most egyszerűsítünk
        state.mainChartRef = chart; 
    }

    // --- CHART 2: VOLUME ---
    const volDom = document.getElementById('volChart');
    if (volDom) {
        echarts.dispose(volDom);
        const chart = echarts.init(volDom);
        chart.setOption({
            animation: false,
            grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
            xAxis: { data: dates, show: false },
            yAxis: { show: false },
            tooltip: { trigger: 'axis' },
            series: [{ type: 'bar', data: volumes }]
        });
        state.volChartRef = chart;
    }

    // --- CHART 3: RSI ---
    const rsiDom = document.getElementById('rsiChart');
    if (rsiDom) {
        echarts.dispose(rsiDom);
        const chart = echarts.init(rsiDom);
        chart.setOption({
            animation: false,
            grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
            xAxis: { data: dates, show: false },
            yAxis: { min: 0, max: 100, show: true, splitLine: { show: false }, axisLabel: { color: textColor } },
            tooltip: { trigger: 'axis' },
            series: [{ 
                type: 'line', 
                data: rsiData, 
                showSymbol: false, 
                lineStyle: { color: '#f59e0b', width: 1 },
                markLine: { data: [{ yAxis: 30 }, { yAxis: 70 }], lineStyle: { type: 'dashed', opacity: 0.5 } }
            }]
        });
        state.rsiChartRef = chart;
    }

    // --- CHART 4: MACD ---
    const macdDom = document.getElementById('macdChart');
    if (macdDom) {
        echarts.dispose(macdDom);
        const chart = echarts.init(macdDom);
        chart.setOption({
            animation: false,
            grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
            xAxis: { data: dates, show: false },
            yAxis: { show: false },
            tooltip: { trigger: 'axis' },
            series: [{ type: 'bar', data: macdData, itemStyle: { color: '#3b82f6' } }]
        });
        state.macdChartRef = chart;
    }

    // Szinkronizálás (Zoom)
    if (state.mainChartRef && state.volChartRef && state.rsiChartRef && state.macdChartRef) {
        echarts.connect([state.mainChartRef, state.volChartRef, state.rsiChartRef, state.macdChartRef]);
    }
}

// --- 4. MATEK (EGYSZERŰSÍTVE) ---
function calculateSimpleMA(dayCount, data) {
    let result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < dayCount) {
            result.push('-');
            continue;
        }
        let sum = 0;
        for (let j = 0; j < dayCount; j++) sum += data[i - j].close;
        result.push((sum / dayCount).toFixed(2));
    }
    return result;
}

function calculateSimpleRSI(period, data) {
    let result = [];
    // Kezdeti üres értékek
    for(let i=0; i<period; i++) result.push(null);
    
    // RSI számítás
    for (let i = period; i < data.length; i++) {
        // Egyszerűsített RSI logika a stabilitásért
        let gains = 0, losses = 0;
        for(let j=0; j<period; j++) {
            let change = data[i-j].close - data[i-j-1].close;
            if(change > 0) gains += change;
            else losses -= change;
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        
        if(avgLoss === 0) result.push(100);
        else {
            let rs = avgGain / avgLoss;
            result.push((100 - (100 / (1 + rs))).toFixed(2));
        }
    }
    return result;
}

function calculateSimpleMACD(data) {
    // Nagyon egyszerű MACD (Close - MA20 különbség demonstrációnak)
    // Ez biztosan mindig ad adatot
    const ma20 = calculateSimpleMA(20, data);
    return data.map((d, i) => {
        if (ma20[i] === '-') return 0;
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
    // Események
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

    // Theme toggle
    const t = document.getElementById('themeToggle');
    if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.dataset.theme = 'dark';
        t.checked = true;
    }
    t.addEventListener('change', () => {
        localStorage.setItem('theme', t.checked ? 'dark' : 'light');
        location.reload();
    });

    // Resize
    window.onresize = () => {
        if(state.mainChartRef) state.mainChartRef.resize();
        if(state.volChartRef) state.volChartRef.resize();
        if(state.rsiChartRef) state.rsiChartRef.resize();
        if(state.macdChartRef) state.macdChartRef.resize();
    };

    // Start
    loadData();
});
