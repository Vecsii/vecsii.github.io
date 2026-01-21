/**
 * Pro Dashboard v11.0 - TRUE LIVE ANIMATION
 * Feature: Élő chart mozgás + Tiszta visszaállás Static módba
 */

const state = {
    symbol: 'NVDA',
    source: 'static',
    staticData: [], // Itt őrizzük az eredeti, tiszta adatot
    currentData: [], // Ezzel dolgozik a chart (ez változik Live-ban)
    meta: {},
    charts: { main: null, vol: null, rsi: null, macd: null },
    timer: null
};

// --- 1. INDÍTÁS ÉS ADATLETÖLTÉS ---
async function loadData() {
    stopLiveSimulation(); // Előző folyamatok leállítása
    updateStatus('Adatletöltés...', 'warning');

    try {
        const t = new Date().getTime();
        const res = await fetch(`./stocks.json?t=${t}`);
        if (!res.ok) throw new Error("JSON Hiba");
        
        const json = await res.json();
        const stockData = json[state.symbol];
        
        if (!stockData) throw new Error("Nincs adat ehhez a részvényhez");

        state.meta = stockData.meta;
        
        // Dátumok konvertálása és rendezés
        const processedData = stockData.data.map(d => ({
            ...d,
            dateObj: new Date(d.date)
        })).sort((a,b) => a.dateObj - b.dateObj);

        // BIZTONSÁGI MENTÉS (Deep Copy)
        // Ez az eredeti állapot, ehhez térünk vissza Static módban
        state.staticData = JSON.parse(JSON.stringify(processedData));
        
        // Kezdésnek a jelenlegi adat is legyen ez
        state.currentData = JSON.parse(JSON.stringify(processedData));

        // Fejléc beállítása
        document.querySelector('.header-left h1').innerHTML = 
            `${state.meta.longName || state.symbol} <span class="badge">PRO</span>`;

        // Chartok inicializálása (csak keretek)
        initCharts();

        // Mód kezelése
        handleModeChange();

    } catch (e) {
        console.error(e);
        updateStatus('Hiba! Futtasd a Pythont.', 'danger');
    }
}

// --- 2. MÓD VÁLTÓ LOGIKA ---
function handleModeChange() {
    stopLiveSimulation(); // Mindig leállítjuk az előzőt

    if (state.source === 'static') {
        // --- STATIC MÓD ---
        // 1. Visszaállítjuk az EREDETI adatot a mentésből
        state.currentData = JSON.parse(JSON.stringify(state.staticData));
        
        // 2. Frissítjük a chartokat
        updateAllCharts();
        
        // 3. Státusz kiírás
        const dateStr = new Date(state.meta.last_updated).toLocaleDateString();
        updateStatus(`🔒 STATIC | Adat: ${dateStr}`, 'warning');
        
    } else {
        // --- LIVE MÓD ---
        // 1. Azonnali rajzolás, hogy ne legyen üresjárat
        updateAllCharts();
        
        // 2. Indítjuk a szimulátort
        updateStatus(`● ÉLŐ KAPCSOLAT | Csatlakozva`, 'success');
        startLiveSimulation();
    }
}

// --- 3. LIVE SIMULÁTOR (A MOTOR) ---
function startLiveSimulation() {
    state.timer = setInterval(() => {
        // Ha valamiért üres az adat, kilépünk
        if (!state.currentData.length) return;

        // Az UTOLSÓ gyertyát fogjuk meg
        const lastIndex = state.currentData.length - 1;
        const lastCandle = state.currentData[lastIndex];

        // 1. Ármozgás generálása (Random Walk)
        // +/- 0.3% mozgás másodpercenként
        const volatility = lastCandle.close * 0.003; 
        const movement = (Math.random() - 0.5) * volatility;
        
        // Új záróár
        let newClose = lastCandle.close + movement;
        
        // 2. Gyertya adatainak frissítése
        lastCandle.close = newClose;
        
        // Ha az új ár magasabb mint az eddigi csúcs, növeljük a csúcsot (kanóc nő)
        if (newClose > lastCandle.high) lastCandle.high = newClose;
        // Ha alacsonyabb mint az alj, csökkentjük az aljat
        if (newClose < lastCandle.low) lastCandle.low = newClose;

        // 3. Volume növelése (hogy látszódjon a kereskedés)
        lastCandle.volume += Math.floor(Math.random() * 5000);

        // 4. CHART FRISSÍTÉS (Ez mozgatja a vonalakat!)
        updateAllCharts();

        // 5. Státusz pörgetése
        const now = new Date().toLocaleTimeString();
        updateStatus(`● LIVE | ${now} | Ár: $${newClose.toFixed(2)}`, 'success');

    }, 1000); // 1000ms = 1 másodperc
}

function stopLiveSimulation() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
}

// --- 4. RAJZOLÓ MOTOR ---
function updateAllCharts() {
    // Matek újraszámolása a módosult adatokkal
    const dates = state.currentData.map(d => d.date);
    const ohlc = state.currentData.map(d => [d.open, d.close, d.low, d.high]);
    const volumes = state.currentData.map((d, i) => ({
        value: d.volume,
        itemStyle: { color: d.close > d.open ? '#10b981' : '#ef4444' }
    }));
    
    const ma20 = calculateMA(20, state.currentData);
    const rsiData = calculateRSI(14, state.currentData);
    const macdData = calculateMACD(state.currentData);

    // KPI-k frissítése (Bal oldali kártyák)
    const last = state.currentData[state.currentData.length - 1];
    const prev = state.currentData[state.currentData.length - 2];
    
    document.getElementById('kpiPrice').innerText = `$${last.close.toFixed(2)}`;
    
    const change = ((last.close - prev.close) / prev.close) * 100;
    const chgEl = document.getElementById('kpiChange');
    chgEl.innerText = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
    chgEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
    
    const rsiVal = rsiData[rsiData.length-1];
    document.getElementById('kpiRsi').innerText = (rsiVal && rsiVal !== '-') ? parseFloat(rsiVal).toFixed(1) : '--';
    document.getElementById('kpiVol').innerText = (last.volume / 1000000).toFixed(2) + 'M';

    // Chartok frissítése az új adatokkal
    if(state.charts.main) {
        state.charts.main.setOption({
            xAxis: { data: dates },
            series: [{ data: ohlc }, { data: ma20 }]
        });
    }
    if(state.charts.vol) state.charts.vol.setOption({ xAxis: { data: dates }, series: [{ data: volumes }] });
    if(state.charts.rsi) state.charts.rsi.setOption({ xAxis: { data: dates }, series: [{ data: rsiData }] });
    if(state.charts.macd) state.charts.macd.setOption({ xAxis: { data: dates }, series: [{ data: macdData }] });
}

// --- 5. INITIALIZÁLÁS (Csak egyszer fut le) ---
function initCharts() {
    if (state.charts.main) return; // Ha már létezik, ne hozza létre újra

    const isDark = document.documentElement.dataset.theme === 'dark';
    const textColor = isDark ? '#ccc' : '#333';
    const gridColor = isDark ? '#333' : '#e0e0e0';

    // MAIN
    state.charts.main = echarts.init(document.getElementById('mainChart'));
    state.charts.main.setOption({
        animation: false, // Fontos a sima live mozgáshoz!
        grid: { left: '3%', right: '3%', bottom: '10%' },
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        xAxis: { data: [], axisLine: { lineStyle: { color: textColor } } },
        yAxis: { scale: true, splitLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor } },
        dataZoom: [{ type: 'inside', start: 80, end: 100 }, { show: true, type: 'slider', top: '92%' }],
        series: [
            { name: 'Price', type: 'candlestick', data: [], itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' } },
            { name: 'MA20', type: 'line', data: [], showSymbol: false, lineStyle: { opacity: 0.5, width: 1 } }
        ]
    });

    // VOLUME
    state.charts.vol = echarts.init(document.getElementById('volChart'));
    state.charts.vol.setOption({
        grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
        xAxis: { data: [], show: false },
        yAxis: { show: false },
        series: [{ type: 'bar', data: [] }]
    });

    // RSI
    state.charts.rsi = echarts.init(document.getElementById('rsiChart'));
    state.charts.rsi.setOption({
        grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
        xAxis: { data: [], show: false },
        yAxis: { min: 0, max: 100, splitLine: { show: false }, axisLabel: { color: textColor } },
        series: [{ type: 'line', data: [], showSymbol: false, lineStyle: { color: '#f59e0b', width: 1 }, markLine: { data: [{ yAxis: 30 }, { yAxis: 70 }], lineStyle: { type: 'dashed', opacity: 0.5 } } }]
    });

    // MACD
    state.charts.macd = echarts.init(document.getElementById('macdChart'));
    state.charts.macd.setOption({
        grid: { left: '3%', right: '3%', top: '5%', bottom: '5%' },
        xAxis: { data: [], show: false },
        yAxis: { show: false },
        series: [{ type: 'bar', data: [], itemStyle: { color: '#3b82f6' } }]
    });

    // Zoom szinkron
    echarts.connect([state.charts.main, state.charts.vol, state.charts.rsi, state.charts.macd]);
}

// --- MATEK FÜGGVÉNYEK ---
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
        else el.classList.remove('pulse-animation');
    }
}

// --- ESEMÉNYKEZELŐK ---
window.addEventListener('DOMContentLoaded', () => {
    // Részvény váltás
    document.getElementById('stockSelect').addEventListener('change', (e) => {
        state.symbol = e.target.value;
        loadData(); // Új adat letöltése
    });

    // Mód váltás (Static / Live)
    document.querySelectorAll('input[name="source"]').forEach(r => {
        r.addEventListener('change', (e) => {
            if (e.target.checked) {
                state.source = e.target.value;
                handleModeChange(); // Itt történik a varázslat
            }
        });
    });

    // Theme váltás
    const t = document.getElementById('themeToggle');
    if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.dataset.theme = 'dark';
        t.checked = true;
    }
    t.addEventListener('change', () => {
        localStorage.setItem('theme', t.checked ? 'dark' : 'light');
        location.reload();
    });

    window.onresize = () => Object.values(state.charts).forEach(c => c && c.resize());

    // Indítás
    loadData();
});
