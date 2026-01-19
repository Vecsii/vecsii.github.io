/**
 * Pro Stock Dashboard
 * Features: Live/Static data, 6 Visualization types, Technical Indicators
 */

// --- 1. Data Processing & Indicators ---

// Calculate RSI
function calculateRSI(closes, period = 14) {
    let gains = 0, losses = 0;
    const rsi = new Array(closes.length).fill(null);
    
    // First avg
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        
        const rs = avgGain / avgLoss;
        rsi[i] = 100 - (100 / (1 + rs));
    }
    return rsi;
}

// Calculate MACD
function calculateMACD(closes) {
    // EMA helper
    const ema = (data, p) => {
        const k = 2 / (p + 1);
        const res = new Array(data.length).fill(null);
        res[p-1] = data.slice(0, p).reduce((a,b)=>a+b)/p; // simple avg for start
        for(let i=p; i<data.length; i++) res[i] = data[i] * k + res[i-1] * (1-k);
        return res;
    };
    
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macdLine = ema12.map((v, i) => (v !== null && ema26[i] !== null) ? v - ema26[i] : null);
    
    // Signal line (9 EMA of MACD)
    // We need to filter nulls first to compute valid signal, simplistic approach:
    const startIdx = macdLine.findIndex(v => v !== null);
    const validMacd = macdLine.slice(startIdx);
    const signalPart = ema(validMacd, 9);
    
    const signalLine = new Array(closes.length).fill(null);
    for(let i=0; i<signalPart.length; i++) signalLine[startIdx + i] = signalPart[i];
    
    const histogram = macdLine.map((v, i) => (v !== null && signalLine[i] !== null) ? v - signalLine[i] : null);
    
    return { macdLine, signalLine, histogram };
}

// Calculate Bollinger Bands
function calculateBB(closes, period = 20, mult = 2) {
    const ma = new Array(closes.length).fill(null);
    const upper = new Array(closes.length).fill(null);
    const lower = new Array(closes.length).fill(null);
    
    for (let i = period - 1; i < closes.length; i++) {
        const slice = closes.slice(i - period + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        
        ma[i] = mean;
        upper[i] = mean + mult * stdDev;
        lower[i] = mean - mult * stdDev;
    }
    return { ma, upper, lower };
}

// Generate Returns Histogram Data
function calculateHistogram(closes, bins = 20) {
    const returns = [];
    for(let i=1; i<closes.length; i++) {
        returns.push((closes[i] - closes[i-1]) / closes[i-1]);
    }
    if (returns.length === 0) return [[], []];

    const min = Math.min(...returns);
    const max = Math.max(...returns);
    const step = (max - min) / bins;
    
    const x = [], y = new Array(bins).fill(0);
    
    // Create bins
    for(let i=0; i<bins; i++) x.push(min + i*step);
    
    // Fill bins
    for(const r of returns) {
        const idx = Math.min(Math.floor((r - min) / step), bins - 1);
        y[idx]++;
    }
    
    // Format for uPlot (x needs to be strictly increasing, here it is)
    return [x, y];
}

// --- 2. Chart Renderers (Custom & Standard) ---

// Custom "Candlestick-like" Path Builder (Simplified as High-Low Bars + Open/Close ticks)
// For fully filled candles in uPlot, a plugin is best. Here we use a trick: 
// We draw OHLC as a series of custom paths or just use a standard line for Close 
// and "Error Bars" for High/Low. 
// DEMO: We will use a Line Chart for Close + Band for Bollinger to keep code clean,
// but let's try a "Bar" renderer for Volume which is built-in.

function makeChart(id, data, opts) {
    const el = document.getElementById(id);
    el.innerHTML = ''; // clear
    const { width, height } = { width: el.clientWidth, height: el.clientHeight || 250 };
    return new uPlot({ ...opts, width, height }, data, el);
}

// --- 3. Main App Logic ---

const state = {
    symbol: 'NVDA',
    source: 'live', // 'live' | 'static'
    fullData: [],
    sliceIdx: [0, 100],
    staticCache: null
};

// Data Fetching
async function fetchData() {
    let raw = [];
    
    if (state.source === 'static') {
        if (!state.staticCache) {
            try {
                const res = await fetch('stocks.json');
                if(!res.ok) throw new Error("stocks.json not found");
                state.staticCache = await res.json();
            } catch (e) {
                alert("Static file load failed. Make sure 'stocks.json' exists. Falling back to live.");
                document.getElementById('srcLive').checked = true;
                state.source = 'live';
                return fetchData();
            }
        }
        raw = state.staticCache[state.symbol] || [];
    } else {
        // LIVE (Stooq)
        const url = `https://stooq.com/q/d/l/?s=${state.symbol.toLowerCase()}.us&i=d`;
        try {
            const res = await fetch(url);
            const txt = await res.text();
            // Parse CSV
            const lines = txt.trim().split(/\r?\n/);
            lines.shift(); // header
            raw = lines.map(l => {
                const [d,o,h,l2,c,v] = l.split(',');
                if(!c) return null;
                return {
                    date: new Date(d),
                    open: +o, high: +h, low: +l2, close: +c, volume: +v
                };
            }).filter(x => x && x.close);
            // Sort
            raw.sort((a,b) => a.date - b.date);
        } catch(e) {
            console.error(e);
            // Fallback synthetic
            raw = generateSynthetic();
        }
    }
    
    // Process types if coming from JSON (dates are strings)
    state.fullData = raw.map(d => ({
        ...d,
        date: d.date instanceof Date ? d.date : new Date(d.date)
    }));
    
    updateDashboard();
}

function generateSynthetic() {
    const arr = [];
    let p = 100;
    const now = new Date();
    for(let i=300; i>0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        if(d.getDay()===0||d.getDay()===6) continue;
        const chg = (Math.random()-0.5)*0.04;
        p *= (1+chg);
        arr.push({date: d, open: p, high: p*1.02, low: p*0.98, close: p, volume: 1e6+Math.random()*1e6});
    }
    return arr;
}

// --- 4. Visualization Rendering ---

let charts = {}; // Store uPlot instances

function updateDashboard() {
    if (state.fullData.length === 0) return;

    // Filter
    const len = state.fullData.length;
    const i0 = Math.floor((state.sliceIdx[0]/100)*(len-1));
    const i1 = Math.floor((state.sliceIdx[1]/100)*(len-1));
    const start = Math.min(i0, i1), end = Math.max(i0, i1);
    const slice = state.fullData.slice(start, end + 1);
    
    if (slice.length < 2) return;

    // Prepare Arrays
    const dates = slice.map(d => d.date.getTime()/1000);
    const closes = slice.map(d => d.close);
    const volumes = slice.map(d => d.volume);
    
    // Indicators
    const { ma: bbMa, upper: bbUp, lower: bbLow } = calculateBB(closes);
    const rsi = calculateRSI(closes);
    const { macdLine, signalLine, histogram: macdHist } = calculateMACD(closes);
    
    // KPI Update
    document.getElementById('kpiClose').innerText = '$' + closes[closes.length-1].toFixed(2);
    document.getElementById('kpiHigh').innerText = '$' + Math.max(...closes).toFixed(2);
    document.getElementById('kpiLow').innerText = '$' + Math.min(...closes).toFixed(2);
    document.getElementById('kpiRsi').innerText = (rsi[rsi.length-1] || 0).toFixed(1);

    // --- RENDER CHART 1: Price + BB (Candle Proxy) ---
    // Using simple lines + band filling for BB
    const data1 = [dates, closes, bbUp, bbLow];
    if (!charts.c1) {
        charts.c1 = makeChart('chartCandle', data1, {
            scales: { x: { time: true }, y: { auto: true } },
            series: [
                {},
                { label: 'Price', stroke: '#fff', width: 2 },
                { label: 'BB Upper', stroke: 'rgba(255,255,255,0.2)', dash: [5,5] },
                { label: 'BB Lower', stroke: 'rgba(255,255,255,0.2)', dash: [5,5], fill: 'rgba(255,255,255,0.05)' },
            ]
        });
    } else charts.c1.setData(data1);

    // --- RENDER CHART 2: MAs ---
    // Simple MAs
    const ma20 = calculateBB(closes, 20, 0).ma; // reuse BB logic for MA
    const ma50 = calculateBB(closes, 50, 0).ma;
    const ma200 = calculateBB(closes, 200, 0).ma;
    const data2 = [dates, closes, ma20, ma50, ma200];
    if (!charts.c2) {
        charts.c2 = makeChart('chartMa', data2, {
            scales: { x: { time: true }, y: { auto: true } },
            series: [
                {},
                { stroke: '#666', width: 1 },
                { label: 'MA20', stroke: '#4ade80', width: 2 },
                { label: 'MA50', stroke: '#facc15', width: 2 },
                { label: 'MA200', stroke: '#f87171', width: 2 },
            ]
        });
    } else charts.c2.setData(data2);

    // --- RENDER CHART 3: Volume ---
    const data3 = [dates, volumes];
    if (!charts.c3) {
        charts.c3 = makeChart('chartVol', data3, {
            scales: { x: { time: true }, y: { auto: true } },
            series: [
                {},
                { label: 'Vol', fill: '#a78bfa', stroke: '#a78bfa', width: 1, type: 'bars' } // type logic depends on uPlot paths, default is line
            ],
            // For simple bars without plugin, we usually just fill area. 
            // uPlot requires custom path for real bars, using area here for demo simplicity.
            series: [{}, { stroke: '#a78bfa', fill: 'rgba(167, 139, 250, 0.5)' }] 
        });
    } else charts.c3.setData(data3);

    // --- RENDER CHART 4: RSI ---
    const data4 = [dates, rsi];
    if (!charts.c4) {
        charts.c4 = makeChart('chartRsi', data4, {
            scales: { x: { time: true }, y: { range: [0, 100] } },
            series: [
                {},
                { label: 'RSI', stroke: '#22d3ee', width: 2 }
            ],
            bands: [ { series: [1], constant: 70, fill: 'rgba(255,0,0,0.1)' }, { series: [1], constant: 30, fill: 'rgba(0,255,0,0.1)' } ]
        });
    } else charts.c4.setData(data4);

    // --- RENDER CHART 5: MACD ---
    const data5 = [dates, macdLine, signalLine];
    if (!charts.c5) {
        charts.c5 = makeChart('chartMacd', data5, {
            scales: { x: { time: true }, y: { auto: true } },
            series: [
                {},
                { label: 'MACD', stroke: '#c084fc', width: 2 },
                { label: 'Signal', stroke: '#fb923c', width: 2 }
            ]
        });
    } else charts.c5.setData(data5);

    // --- RENDER CHART 6: Histogram (Distribution) ---
    // Note: Histogram uses different X axis (Returns %) not Time!
    const [histX, histY] = calculateHistogram(closes);
    const data6 = [histX, histY];
    if (!charts.c6) {
        charts.c6 = new uPlot({
            width: document.getElementById('chartHist').clientWidth,
            height: 250,
            scales: { x: { time: false }, y: { auto: true } },
            axes: [
                { label: 'Return %' },
                { label: 'Freq' }
            ],
            series: [
                {},
                { label: 'Freq', stroke: '#f472b6', fill: 'rgba(244, 114, 182, 0.3)', width: 2 }
            ]
        }, data6, document.getElementById('chartHist'));
    } else {
        charts.c6.setData(data6);
    }
}

// --- 5. Init & Event Listeners ---
window.addEventListener('DOMContentLoaded', () => {
    // Selectors
    const selStock = document.getElementById('stockSelect');
    const radSource = document.querySelectorAll('input[name="source"]');
    const rangeStart = document.getElementById('rangeStart');
    const rangeEnd = document.getElementById('rangeEnd');
    
    // Listeners
    selStock.addEventListener('change', () => { state.symbol = selStock.value; fetchData(); });
    radSource.forEach(r => r.addEventListener('change', (e) => { 
        if(e.target.checked) { state.source = e.target.value; fetchData(); }
    }));
    
    const onRange = () => {
        state.sliceIdx = [parseInt(rangeStart.value), parseInt(rangeEnd.value)];
        updateDashboard();
    };
    rangeStart.addEventListener('input', onRange);
    rangeEnd.addEventListener('input', onRange);
    
    // Download CSV
    document.getElementById('downloadBtn').addEventListener('click', () => {
        if (!state.fullData.length) return;
        let csv = "Date,Open,High,Low,Close,Volume\n";
        state.fullData.forEach(d => {
            csv += `${d.date.toISOString().split('T')[0]},${d.open},${d.high},${d.low},${d.close},${d.volume}\n`;
        });
        const blob = new Blob([csv], {type: 'text/csv'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.symbol}_data.csv`;
        a.click();
    });

    // Start
    fetchData();
    
    // Resize Handler
    new ResizeObserver(() => {
        // Simple reload or resize logic could go here
        // For simplicity, we just rely on CSS flex, but uPlot needs explicit resize calls in prod
        Object.values(charts).forEach(u => u.setSize({ width: u.root.parentElement.clientWidth, height: 250 }));
    }).observe(document.body);
});
