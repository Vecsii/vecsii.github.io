/**
 * NVDA Stock Dashboard Logic
 * Uses uPlot for high-performance rendering.
 * Implements Tidy Data principles (sorting/parsing) and Responsive Design.
 */

// --- Utilities ---
function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const d2 = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${d2}`;
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

// --- Data Fetching & Transformation ---
async function fetchNvdaFromStooq() {
    const url = 'https://stooq.com/q/d/l/?s=nvda.us&i=d';
    // CORS proxy használata élesben javasolt, de demohoz a Stooq néha engedi direktben,
    // vagy a böngésző cache-ből dolgozik.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch NVDA data: ${res.status}`);
    
    const csv = await res.text();
    const lines = csv.trim().split(/\r?\n/);
    const header = lines.shift();
    
    if (!header || !header.toLowerCase().startsWith('date')) throw new Error('Unexpected CSV format');
    
    const out = [];
    for (const line of lines) {
        const [dateStr, openStr, highStr, lowStr, closeStr, volumeStr] = line.split(',');
        const date = new Date(dateStr);
        const open = Number(openStr);
        const high = Number(highStr);
        const low = Number(lowStr);
        const close = Number(closeStr);
        const volume = Number(volumeStr);
        
        if (!isFinite(close) || !isFinite(volume)) continue;
        out.push({ date, open, high, low, close, volume });
    }

    // TIDY DATA ELV: Mindig biztosítsuk a kronológiai sorrendet!
    out.sort((a, b) => a.date - b.date);

    return out;
}

function movingAverage(values, window) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    const q = [];
    for (let i = 0; i < values.length; i++) {
        const v = values[i];
        q.push(v);
        sum += v;
        if (q.length > window) sum -= q.shift();
        if (q.length === window) out[i] = sum / window;
    }
    return out;
}

// --- Global State ---
const state = {
    symbols: {},
    activeSymbol: 'NVDA',
    filteredIdx: [0, 100], // slider percentage 0..100
};

async function loadNvdaData() {
    try {
        const data = await fetchNvdaFromStooq();
        state.symbols = { NVDA: data };
    } catch (e) {
        console.warn('Using fallback synthetic NVDA data due to fetch error:', e);
        // Fallback: generált adatok, hogy a demó offline is működjön
        const start = addDays(new Date(), -365);
        const fallback = [];
        let p = 100;
        for (let i = 0; i < 365; i++) {
            const d = addDays(start, i);
            if (d.getDay() === 0 || d.getDay() === 6) continue; // Skip hétvége
            const shock = (Math.random() - 0.5) * 0.05; 
            p = Math.max(1, p * (1 + shock));
            fallback.push({ 
                date: d, 
                open: p * 0.99, high: p * 1.01, low: p * 0.98, close: p, 
                volume: 1_000_000 + Math.random() * 500_000 
            });
        }
        state.symbols = { NVDA: fallback };
    }
}

// --- Slice Helper ---
function getSliceRange(arr, pctStart, pctEnd) {
    const n = arr.length;
    const i0 = Math.max(0, Math.min(n - 1, Math.floor((pctStart / 100) * (n - 1))));
    const i1 = Math.max(i0, Math.min(n - 1, Math.floor((pctEnd / 100) * (n - 1))));
    return [i0, i1];
}

// --- Chart Factory Functions ---
let priceChart, maChart, volumeChart;

function getSize(container) {
    return { 
        width: container.clientWidth, 
        height: container.clientHeight || 280 
    };
}

function makePriceChart(container, data) {
    const { width, height } = getSize(container);
    const x = data.map(d => Math.floor(d.date.getTime() / 1000));
    const y = data.map(d => d.close);
    
    const opts = {
        width, height,
        scales: { x: { time: true }, y: { auto: true } },
        axes: [
            { grid: { show: true }, stroke: 'var(--muted)' },
            { grid: { show: true }, stroke: 'var(--muted)' },
        ],
        series: [
            {},
            { label: 'Close Price', stroke: '#3b82f6', width: 2, fill: 'rgba(59, 130, 246, 0.1)' }
        ],
    };
    return new uPlot(opts, [x, y], container);
}

function makeMaChart(container, data, ma20On, ma50On, ma200On) {
    const { width, height } = getSize(container);
    const x = data.map(d => Math.floor(d.date.getTime() / 1000));
    const close = data.map(d => d.close);
    const ma20 = movingAverage(close, 20);
    const ma50 = movingAverage(close, 50);
    const ma200 = movingAverage(close, 200);

    const opts = {
        width, height,
        scales: { x: { time: true }, y: { auto: true } },
        axes: [ { stroke: 'var(--muted)' }, { stroke: 'var(--muted)' } ],
        series: [
            {},
            { label: 'Close', stroke: '#93c5fd', width: 1 },
            { label: 'MA 20', stroke: '#10b981', width: 2, show: !!ma20On },
            { label: 'MA 50', stroke: '#f59e0b', width: 2, show: !!ma50On },
            { label: 'MA 200', stroke: '#ef4444', width: 2, show: !!ma200On },
        ],
        legend: { show: true },
    };
    return new uPlot(opts, [x, close, ma20, ma50, ma200], container);
}

function makeVolumeChart(container, data) {
    const { width, height } = getSize(container);
    const x = data.map(d => Math.floor(d.date.getTime() / 1000));
    const y = data.map(d => d.volume);

    const opts = {
        width, height,
        scales: { x: { time: true }, y: { auto: true } },
        axes: [
            { stroke: 'var(--muted)' },
            { label: 'Volume', stroke: 'var(--muted)', size: 60 },
        ],
        series: [
            {},
            { label: 'Vol', stroke: '#a78bfa', width: 1, fill: 'rgba(167, 139, 250, 0.4)' },
        ],
    };
    return new uPlot(opts, [x, y], container);
}

// --- Main Update Logic ---
function updateAllCharts() {
    const data = state.symbols[state.activeSymbol];
    if (!data || data.length === 0) return;

    const [i0, i1] = getSliceRange(data, state.filteredIdx[0], state.filteredIdx[1]);
    const slice = data.slice(i0, i1 + 1);

    const x = slice.map(d => Math.floor(d.date.getTime() / 1000));

    // 1. Update KPI Cards (Narratíva erősítése)
    let minP = Infinity, maxP = -Infinity, volSum = 0;
    const startP = slice[0].close;
    const endP = slice[slice.length - 1].close;

    for (const d of slice) {
        if (d.close < minP) minP = d.close;
        if (d.close > maxP) maxP = d.close;
        volSum += d.volume;
    }
    const totalRet = ((endP - startP) / startP) * 100;

    document.getElementById('kpiMin').innerText = '$' + minP.toFixed(2);
    document.getElementById('kpiMax').innerText = '$' + maxP.toFixed(2);
    document.getElementById('kpiVol').innerText = (volSum / slice.length / 1_000_000).toFixed(1) + 'M';
    
    const kpiRet = document.getElementById('kpiReturn');
    kpiRet.innerText = (totalRet > 0 ? '+' : '') + totalRet.toFixed(2) + '%';
    kpiRet.style.color = totalRet >= 0 ? 'var(--accent-2)' : 'var(--danger)';

    // 2. Update Charts
    // Price
    priceChart.setData([x, slice.map(d => d.close)]);
    
    // MA
    const ma20 = movingAverage(slice.map(d=>d.close), 20); // Recalc MA on slice visual logic if needed, or pass full
    // Optimization: uPlot is fast, passing full calculated MA sliced is better usually, 
    // but here we slice arrays for simplicity. Ideally calculate MA on full set then slice.
    // Let's do it correctly:
    const fullClose = data.map(d => d.close);
    const fMa20 = movingAverage(fullClose, 20).slice(i0, i1+1);
    const fMa50 = movingAverage(fullClose, 50).slice(i0, i1+1);
    const fMa200 = movingAverage(fullClose, 200).slice(i0, i1+1);
    
    maChart.setData([x, slice.map(d => d.close), fMa20, fMa50, fMa200]);
    maChart.setSeries(2, { show: document.getElementById('ma20').checked });
    maChart.setSeries(3, { show: document.getElementById('ma50').checked });
    maChart.setSeries(4, { show: document.getElementById('ma200').checked });

    // Volume
    volumeChart.setData([x, slice.map(d => d.volume)]);

    // 3. Label
    const startDate = slice[0]?.date;
    const endDate = slice[slice.length - 1]?.date;
    const label = (startDate && endDate) ? `${formatDate(startDate)} → ${formatDate(endDate)}` : '';
    document.getElementById('rangeLabel').textContent = label;
}

async function init() {
    await loadNvdaData();

    const rangeStart = document.getElementById('rangeStart');
    const rangeEnd = document.getElementById('rangeEnd');

    // Init Charts
    const initialData = state.symbols[state.activeSymbol];
    
    priceChart = makePriceChart(document.getElementById('priceChart'), initialData);
    maChart = makeMaChart(document.getElementById('maChart'), initialData, true, true, true);
    volumeChart = makeVolumeChart(document.getElementById('volumeChart'), initialData);

    // Filter Logic
    const clampRanges = () => {
        let s = Number(rangeStart.value);
        let e = Number(rangeEnd.value);
        if (s > e) [s, e] = [e, s]; // swap if crossed
        state.filteredIdx = [s, e];
        updateAllCharts();
    };
    rangeStart.addEventListener('input', clampRanges);
    rangeEnd.addEventListener('input', clampRanges);

    // Toggles
    ['ma20', 'ma50', 'ma200'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateAllCharts);
    });

    document.getElementById('resetAll').addEventListener('click', () => {
        state.filteredIdx = [0, 100];
        rangeStart.value = 0;
        rangeEnd.value = 100;
        updateAllCharts();
    });

    // Initial render
    updateAllCharts();

    // Responsive Resizing (ResizeObserver)
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const w = entry.contentRect.width;
            // Magasságot fixen hagyjuk vagy dinamikusan állítjuk, itt fix chart-container magasság van CSS-ben
            const h = 280; 
            if (entry.target.id === 'priceChart' && priceChart) priceChart.setSize({width: w, height: h});
            if (entry.target.id === 'maChart' && maChart) maChart.setSize({width: w, height: h});
            if (entry.target.id === 'volumeChart' && volumeChart) volumeChart.setSize({width: w, height: h});
        }
    });
    
    resizeObserver.observe(document.getElementById('priceChart'));
    resizeObserver.observe(document.getElementById('maChart'));
    resizeObserver.observe(document.getElementById('volumeChart'));
}

window.addEventListener('DOMContentLoaded', init);
