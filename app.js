// Utilities: date helpers
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

// Fetch NVDA daily OHLCV from Stooq CSV (no key, usually CORS-enabled)
async function fetchNvdaFromStooq() {
    const url = 'https://stooq.com/q/d/l/?s=nvda.us&i=d';
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
        out.push({ date, open, high, low, close, volume, ret: 0 });
    }
    // compute daily returns for coloring scatter
    for (let i = 1; i < out.length; i++) {
        const prev = out[i - 1].close;
        const curr = out[i].close;
        out[i].ret = prev ? (curr - prev) / prev : 0;
    }
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

// Global state
const state = {
    symbols: {},
    activeSymbol: 'NVDA',
    filteredIdx: [0, 100], // percentage indices 0..100
};

async function loadNvdaData() {
    try {
        const data = await fetchNvdaFromStooq();
        state.symbols = { NVDA: data };
    } catch (e) {
        // Fallback: tiny synthetic in case network blocked
        const start = addDays(new Date(), -365);
        const fallback = [];
        let p = 100;
        for (let i = 0; i < 365; i++) {
            const d = addDays(start, i);
            if (d.getDay() === 0 || d.getDay() === 6) continue;
            const shock = (Math.random() - 0.5) * 0.03; p = Math.max(1, p * (1 + shock));
            fallback.push({ date: d, open: p*0.99, high: p*1.01, low: p*0.98, close: p, volume: 1_000_000 + Math.random()*500_000, ret: shock });
        }
        state.symbols = { NVDA: fallback };
        console.warn('Using fallback synthetic NVDA data due to fetch error:', e);
    }
}

// Range helpers
function getSliceRange(arr, pctStart, pctEnd) {
    const n = arr.length;
    const i0 = Math.max(0, Math.min(n - 1, Math.floor((pctStart / 100) * (n - 1))));
    const i1 = Math.max(i0, Math.min(n - 1, Math.floor((pctEnd / 100) * (n - 1))));
    return [i0, i1];
}

// Chart instances (uPlot)
let priceChart, maChart, volumeChart;

function makePriceChart(container, data) {
    const x = data.map(d => Math.floor(d.date.getTime() / 1000));
    const y = data.map(d => d.close);
    const opts = {
        width: container.clientWidth,
        height: 280,
        scales: { x: { time: true }, y: { auto: true } },
        axes: [
            { grid: { show: true } },
            { grid: { show: true } },
        ],
        series: [
            {},
            { stroke: '#3b82f6', width: 2 }
        ],
        plugins: [],
    };
    const u = new uPlot(opts, [x, y], container);
    return u;
}

function makeMaChart(container, data, ma20On, ma50On, ma200On) {
    const x = data.map(d => Math.floor(d.date.getTime() / 1000));
    const close = data.map(d => d.close);
    const ma20 = movingAverage(close, 20);
    const ma50 = movingAverage(close, 50);
    const ma200 = movingAverage(close, 200);
    const opts = {
        width: container.clientWidth,
        height: 260,
        scales: { x: { time: true }, y: { auto: true } },
        axes: [ { grid: { show: true } }, { grid: { show: true } } ],
        series: [
            {},
            { label: 'Close', stroke: '#93c5fd', width: 2 },
            { label: 'MA 20', stroke: '#10b981', width: 2, show: !!ma20On },
            { label: 'MA 50', stroke: '#f59e0b', width: 2, show: !!ma50On },
            { label: 'MA 200', stroke: '#ef4444', width: 2, show: !!ma200On },
        ],
        legend: { show: true },
    };
    const u = new uPlot(opts, [x, close, ma20, ma50, ma200], container);
    return u;
}

function makeVolumeChart(container, data) {
    const x = data.map(d => Math.floor(d.date.getTime() / 1000));
    const y = data.map(d => d.volume);
    const opts = {
        width: container.clientWidth,
        height: 260,
        scales: { x: { time: true }, y: { auto: true } },
        axes: [
            { grid: { show: true } },
            { label: 'Volume', grid: { show: true } },
        ],
        series: [
            {},
            { stroke: '#a78bfa', width: 1, fill: 'rgba(167, 139, 250, 0.25)' },
        ],
    };
    const u = new uPlot(opts, [x, y], container);
    return u;
}

function updateAllCharts() {
    const data = state.symbols[state.activeSymbol];
    const [i0, i1] = getSliceRange(data, state.filteredIdx[0], state.filteredIdx[1]);
    const slice = data.slice(i0, i1 + 1);

    // Price chart
    {
        const x = slice.map(d => Math.floor(d.date.getTime() / 1000));
        const y = slice.map(d => d.close);
        priceChart.setData([x, y]);
    }

    // MA chart
    {
        const x = slice.map(d => Math.floor(d.date.getTime() / 1000));
        const close = slice.map(d => d.close);
        const ma20 = movingAverage(close, 20);
        const ma50 = movingAverage(close, 50);
        const ma200 = movingAverage(close, 200);
        maChart.setData([x, close, ma20, ma50, ma200]);
        maChart.setSeries(2, { show: document.getElementById('ma20').checked });
        maChart.setSeries(3, { show: document.getElementById('ma50').checked });
        maChart.setSeries(4, { show: document.getElementById('ma200').checked });
    }

    // Volume chart
    {
        const x = slice.map(d => Math.floor(d.date.getTime() / 1000));
        const y = slice.map(d => d.volume);
        volumeChart.setData([x, y]);
    }

    // Range label
    const start = slice[0]?.date;
    const end = slice[slice.length - 1]?.date;
    const label = (start && end) ? `${formatDate(start)} → ${formatDate(end)}` : '';
    document.getElementById('rangeLabel').textContent = label;
}

async function init() {
    await loadNvdaData();

    // DOM
    const stockSelect = document.getElementById('stockSelect');
    const rangeStart = document.getElementById('rangeStart');
    const rangeEnd = document.getElementById('rangeEnd');

    // Setup charts
    const priceEl = document.getElementById('priceChart');
    const maEl = document.getElementById('maChart');
    const volumeEl = document.getElementById('volumeChart');

    const initialData = state.symbols[state.activeSymbol];
    priceChart = makePriceChart(priceEl, initialData);
    maChart = makeMaChart(maEl, initialData, true, true, true);
    volumeChart = makeVolumeChart(volumeEl, initialData);

    // Hook controls
    // Stock select is fixed to NVDA (disabled in UI)

    const clampRanges = () => {
        const s = Math.min(Number(rangeStart.value), Number(rangeEnd.value));
        const e = Math.max(Number(rangeStart.value), Number(rangeEnd.value));
        state.filteredIdx = [s, e];
        updateAllCharts();
    };
    rangeStart.addEventListener('input', clampRanges);
    rangeEnd.addEventListener('input', clampRanges);

    document.getElementById('ma20').addEventListener('change', updateAllCharts);
    document.getElementById('ma50').addEventListener('change', updateAllCharts);
    document.getElementById('ma200').addEventListener('change', updateAllCharts);

    document.getElementById('resetAll').addEventListener('click', () => {
        // Reset filters
        state.filteredIdx = [0, 100];
        rangeStart.value = 0;
        rangeEnd.value = 100;
        updateAllCharts();
    });

    updateAllCharts();
}

// time scale adapter: use luxon if available; otherwise use native Date
// Chart.js v4 can use built-in timeseries with date objects directly.
window.addEventListener('DOMContentLoaded', init);


