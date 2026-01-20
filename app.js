// ... (app.js eleje változatlan)

async function loadData() {
    updateStatus('Syncing Data...', 'warning');
    
    try {
        // Mindig a JSON-t használjuk, mert a GitHub Action frissíti!
        // Hozzácsapunk egy random számot (?t=...), hogy a böngésző ne cache-elje be a régit
        const res = await fetch(`./stocks.json?t=${new Date().getTime()}`);
        
        if (!res.ok) throw new Error("Data sync failed");
        
        const json = await res.json();
        
        // Ellenőrizzük, hogy létezik-e az adott részvény a JSON-ben
        if (!json[state.symbol]) {
            throw new Error(`Symbol ${state.symbol} not found in dataset`);
        }

        const stockObj = json[state.symbol];
        state.data = stockObj.data; // Itt vannak a napi adatok
        
        // Frissítjük a címet a cég teljes nevével
        document.querySelector('.header-left h1').innerHTML = 
            `${stockObj.meta.longName} <span class="badge">PRO</span>`;
        
        // Kiírjuk, mikor frissült utoljára az adat
        console.log(`Data last updated: ${stockObj.meta.last_updated}`);
        
        updateStatus('Market Data Active', 'success');
        
        // Ha sikeres, renderelünk
        renderDashboard();

    } catch (e) {
        console.error(e);
        updateStatus('Offline / Demo Mode', 'danger');
        state.data = generateSyntheticData(); // Ha minden kötél szakad
        renderDashboard();
    }
}

// ... (többi rész változatlan)
