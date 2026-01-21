let currentCity = "Budapest";
let charts = {}; 

document.addEventListener('DOMContentLoaded', () => {
    // ECharts példányok
    charts.temp = echarts.init(document.getElementById('tempChart'));
    charts.rain = echarts.init(document.getElementById('rainChart'));
    charts.wind = echarts.init(document.getElementById('windChart'));

    // Eseménykezelők
    document.getElementById('citySelect').addEventListener('change', (e) => {
        currentCity = e.target.value;
        updateDashboard();
    });

    document.getElementById('themeBtn').addEventListener('click', toggleTheme);
    window.addEventListener('resize', () => Object.values(charts).forEach(c => c.resize()));

    // Adatok ellenőrzése és betöltése
    if (typeof rawWeatherData !== 'undefined') {
        updateDashboard();
    } else {
        alert("Hiba: Futtasd le a 'generate_weather.py'-t előbb!");
    }
});

function updateDashboard() {
    const data = rawWeatherData[currentCity];
    if (!data) return;

    // Adat feldolgozás
    const times = data.map(d => d.time);
    const temps = data.map(d => d.temp);
    const rains = data.map(d => d.rain);
    const winds = data.map(d => d.wind);

    // KPI
    const avgTemp = (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1);
    const totalRain = rains.reduce((a, b) => a + b, 0).toFixed(0);
    const maxWind = Math.max(...winds).toFixed(1);

    document.getElementById('avgTemp').innerText = `${avgTemp} °C`;
    document.getElementById('totalRain').innerText = `${totalRain} mm`;
    document.getElementById('maxWind').innerText = `${maxWind} km/h`;

    // Színek
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#ccc' : '#333';

    // 1. Hőmérséklet
    charts.temp.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '3%', bottom: '10%', top: '10%' },
        xAxis: { type: 'category', data: times, show: false },
        yAxis: { type: 'value', axisLabel: { color: textColor }, splitLine: { show: false } },
        series: [{
            data: temps,
            type: 'line',
            smooth: true,
            showSymbol: false,
            itemStyle: { color: '#f59e0b' },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(245, 158, 11, 0.8)' },
                    { offset: 1, color: 'rgba(245, 158, 11, 0)' }
                ])
            }
        }]
    });

    // 2. Eső
    charts.rain.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '3%', bottom: '10%', top: '10%' },
        xAxis: { type: 'category', data: times, show: false },
        yAxis: { type: 'value', show: false },
        series: [{
            data: rains,
            type: 'bar',
            itemStyle: { color: '#3b82f6' }
        }]
    });

    // 3. Szél
    charts.wind.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '3%', bottom: '10%', top: '10%' },
        xAxis: { type: 'category', data: times, show: false },
        yAxis: { type: 'value', show: false },
        series: [{
            data: winds,
            type: 'line',
            smooth: true,
            showSymbol: false,
            itemStyle: { color: '#10b981' },
            areaStyle: { opacity: 0.2, color: '#10b981' }
        }]
    });
}

function toggleTheme() {
    const html = document.documentElement;
    html.setAttribute('data-theme', html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    updateDashboard();
}
