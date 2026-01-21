/**
 * Pro Dashboard v5.1 - Date Fix & Memory Management
 * Fix: Live módban a dátum a MAI napra ugrik, Staticban visszaáll.
 */

const state = {
    symbol: 'NVDA',
    source: 'static',
    staticData: [], // BIZTONSÁGI MENTÉS (Eredeti 20.-ai adat)
    data: [],       // MUNKAPÉLDÁNY (Ezt rajzoljuk ki)
    meta: {},
    charts: { main: null }, // Elég a main chartot tárolni a zoomhoz
    intervals: [] 
};

// --- CORE: ADAT BETÖLTÉS ---
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
        
        // 1. Feldolgozzuk az adatot
        const rawData = json[state.symbol].data.map(d => ({
            ...d,
            dateObj: new Date(d.date)
        })).sort((a,b) => a.dateObj - b.dateObj);

        // 2. ELMENTJÜK A BIZTONSÁGI MÁSOLATOT (Ez az eredeti, tiszta adat)
        state.staticData = JSON.parse(JSON.stringify(rawData));
        
        // 3. Kezdésnek a munka-adat is legyen ez
        state.data = JSON.parse(JSON.stringify(rawData));

        // UI Fejléc
        document.querySelector('.header-left h1').innerHTML = 
            `${state.meta.longName || state.symbol} <span class="badge">PRO</span>`;

        // Mód kezelése (Itt dől el, hogy Static vagy Live)
        handleModeChange();

    } catch (e) {
        console.error(e);
        updateStatus('Offline / Error', 'danger');
    }
}

// --- MÓD VÁLTÓ LOGIKA (EZ AZ ÚJ RÉSZ) ---
function handleModeChange() {
    clearAllIntervals(); // Mindig leállítjuk az előzőt

    if (state.source === 'static') {
        // --- STATIC MÓD ---
        // Visszaállítjuk a TISZTA, EREDETI adatot a mentésből (20.-a)
        state.data = JSON.parse(JSON.stringify(state.staticData));
        
        const time = new Date(state.meta.last_updated).toLocaleDateString();
        updateStatus(`🔒 STATIC | Adat dátuma: ${time}`, 'warning');
        
        renderDashboard(); // Kirajzoljuk az eredetit
        
    } else {
        // --- LIVE MÓD ---
        // Visszatöltjük az eredetit alapnak...
        state.data = JSON.parse(JSON.stringify(state.staticData));
        
        // ...DE AZONNAL átírjuk az utolsó dátumot a MAI napra!
        const lastCandle = state.data[state.data.length - 1];
        const today = new Date().toISOString().split('T')[0]; // "2026-01-21" formátum
        lastCandle.date = today; // Dátum felülírása!

        renderDashboard(); // Kirajzoljuk a mai dátummal
        startLiveSimulation(); // Indul a mozgás
    }
}

// --- LIVE SIMULATION ENGINE ---
function startLiveSimulation() {
    updateStatus('● ÉLŐ KAPCSOLAT | Szinkronizálás...', 'success');

    const ticker = setInterval(() => {
        const lastCandle = state.data[state.data.length - 1];
        
        // Ármozgás generálása
        const volatility = lastCandle.close * 0.003; 
        const movement = (Math.random() - 0.5) * volatility;
        let newPrice = lastCandle.close + movement;
        
        // Adatok frissítése
        lastCandle.close = newPrice;
        if (newPrice > lastCandle.high) lastCandle.high = newPrice;
        if (newPrice < lastCandle.low) lastCandle.low = newPrice;
        lastCandle.volume += Math.floor(Math.random() * 2000);

        // UI Frissítése
        updateKPIs(lastCandle, state.data[state.data.length - 2]);
        
        // Chart frissítése (Dátum már a mai!)
        renderDashboard(true); 
        
        // Időbélyeg pörgetése
        const now = new Date().toLocaleTimeString();
        updateStatus(`● LIVE | ${lastCandle.date} ${now}`, 'success');

    }, 1000); 

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

    // Itt a kulcs: A dátumok listája a módosított state.data-ból jön!
    // Live módban az utolsó elem itt már a mai dátum.
    const dates = state.data.map(d => d.date);
    const ohlc = state.data.map(d => [d.open, d.close, d.low, d.high]);
    const ma20 = calculateMA(20, state.data);
    const ma50 = calculateMA(50, state.data);
    
    // KPI frissítés (Static módnál itt fut le)
    if (!isUpdate) {
        updateKPIs(state.data[state.data.length-1], state.data[state.data.length-2]);
        const rsi = calculateRSI(state.data);
        document.getElementById('kpiRsi').innerText = parseFloat(rsi[rsi.length-1]||0).toFixed(1);
    }

    const isDark = document.documentElement.dataset.theme === 'dark';
    const textColor = isDark ? '#ccc' : '#333';
    const gridColor = isDark ? '#333' : '#e0e0e0';

    // 1. MAIN CHART
    if (!state.charts.main) state.charts.main = echarts.init(document.getElementById('mainChart'));
    
    state.charts.main.setOption({
        animation: false, // Fontos a sima mozgáshoz
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        grid: { left: '3%', right: '3%', bottom: '15%' },
        xAxis: { 
            data: dates, 
            axisLine: { lineStyle: { color: textColor } } 
        },
        yAxis: { scale: true, splitLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor } },
        dataZoom: [{ type: 'inside', start: 80, end: 100 }, { show: !isUpdate, type: 'slider', top: '90%' }],
        series: [
            { name: 'Price', type: 'candlestick', data: ohlc, itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' } },
            { name: 'MA20', type: 'line', data: ma20, smooth: true, showSymbol: false, lineStyle: { opacity: 0.5 } },
            { name: 'MA50', type: 'line', data: ma50, smooth: true, showSymbol: false, lineStyle: { opacity: 0.5 } }
        ]
    });

    // Ha ez csak frissítés, a többi chartot nem rajzoljuk újra a performancia miatt
    // De az első betöltésnél igen!
    if (isUpdate) return;

    // Itt jöhetne a többi chart kódja (Volume, RSI, MACD) ha használnád őket,
    // de a v5.0-ban csak a Main chart volt benne.
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
                // Itt hívjuk meg a speciális módváltót
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
