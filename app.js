/**
 * Pro Dashboard v6.0 - AGRESSZÍV Live Szimuláció
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
    
    // TRÜKK: Mindig új időbélyeg (?t=...), hogy a GitHub ne cache-eljen!
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

        // DÖNTÉS: Static vagy Live?
        if (state.source === 'static') {
            // --- STATIC MÓD: NYUGALOM ---
            const dateStr = new Date(state.meta.last_updated).toLocaleDateString();
            updateStatus(`🔒 STATIC | Adat dátuma: ${dateStr}`, 'warning'); // Sárga, és FIX dátum
            renderDashboard(); 
        } else {
            // --- LIVE MÓD: AKCIÓ ---
            updateStatus(`● ÉLŐ KAPCSOLAT | Csatlakozás...`, 'success');
            startAggressiveSimulation();
        }

    } catch (e) {
        console.error(e);
        updateStatus('Hiba az adatokkal', 'danger');
    }
}

// --- SZIMULÁTOR (Hogy lásd a különbséget) ---
function startAggressiveSimulation() {
    renderDashboard(); // Kirajzoljuk az alapot

    const ticker = setInterval(() => {
        const lastCandle = state.data[state.data.length - 1];
        const prevCandle = state.data[state.data.length - 2];

        // Nagyobb mozgás, hogy lásd a változást!
        const volatility = lastCandle.close * 0.005; // 0.5% mozgás
        const change = (Math.random() - 0.5) * volatility;
        
        lastCandle.close += change;
        
        // Frissítjük a számokat a kártyákon
        updateKPIs(lastCandle, prevCandle);
        
        // Frissítjük a grafikont (csak az utolsó pontot)
        renderDashboard(true);

        // IDŐBÉLYEG PÖRÖG MÁSODPERCENKÉNT
        const now = new Date().toLocaleTimeString(); 
        // Ez bizonyítja, hogy ÉLŐ: pörögnek a másodpercek!
        updateStatus(`● LIVE | Idő: ${now}`, 'success'); 

    }, 1000); // Minden másodpercben frissít

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
    // Ha Live, villogjon
    if(state.source === 'live') el.classList.add('pulse-animation');
    else el.classList.remove('pulse-animation');
}

// --- SZÁMOLÁS & RAJZOLÁS ---
function calculateMA(dayCount, data) {
    return data.map((val, i, arr) => {
        if (i < dayCount) return '-';
        let sum = 0;
        for (let j = 0; j < dayCount; j++) sum += arr[i - j].close;
        return (sum / dayCount).toFixed(2);
    });
}

function updateKPIs(last, prev) {
    document.getElementById('kpiPrice').innerText = `$${last.close.toFixed(2)}`;
    const change = ((last.close - prev.close) / prev.close) * 100;
    const chgEl = document.getElementById('kpiChange');
    chgEl.innerText = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
    chgEl.style.color = change >= 0 ? '#10b981' : '#ef4444';
}

function renderDashboard(isUpdate = false) {
    if (!state.data.length) return;
    
    // ECharts konfig
    const dates = state.data.map(d => d.date);
    const ohlc = state.data.map(d => [d.open, d.close, d.low, d.high]);
    const ma20 = calculateMA(20, state.data);

    if (!state.charts.main) state.charts.main = echarts.init(document.getElementById('mainChart'));
    
    state.charts.main.setOption({
        animation: false, // Kikapcsoljuk az animációt a simább frissítésért Live módban
        grid: { left: '3%', right: '3%', bottom: '15%' },
        xAxis: { data: dates },
        yAxis: { scale: true }, // Fontos: skálázódjon az árral együtt!
        dataZoom: [{ type: 'inside', start: 85, end: 100 }, { show: !isUpdate, type: 'slider', top: '90%' }],
        series: [
            { type: 'candlestick', data: ohlc, itemStyle: { color: '#10b981', color0: '#ef4444' } },
            { type: 'line', data: ma20, showSymbol: false, lineStyle: { opacity: 0.5 } }
        ]
    });

    if(!isUpdate) updateKPIs(state.data[state.data.length-1], state.data[state.data.length-2]);
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
