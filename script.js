const KEY_W = "PSN_WATCHLIST";
const KEY_C = "PSN_COLLECTION";
let rates = { TRY: 0.12, INR: 0.048, JPY: 0.026 };
let tempId = null;
let filterReg = 'ALL';

async function fetchRates() {
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/PLN');
        const data = await res.json();
        if(data?.rates) {
            rates.TRY = 1 / data.rates.TRY;
            rates.INR = 1 / data.rates.INR;
            rates.JPY = 1 / data.rates.JPY;
            document.getElementById('ratesDisplay').innerText = `Kursy: TRY=${rates.TRY.toFixed(3)} | INR=${rates.INR.toFixed(3)} | JPY=${rates.JPY.toFixed(4)}`;
        }
    } catch (e) {
        console.error("Błąd pobierania kursów walut:", e);
    }
    render();
}

function setupPasteHandlers() {
    ['pPL', 'pTR', 'pIN', 'pJP'].forEach(id => {
        const el = document.getElementById(id);
        if(!el) return;
        el.addEventListener('paste', function(e) {
            e.preventDefault(); 
            let txt = (e.clipboardData || window.clipboardData).getData('text').trim();
            
            if(id === 'pIN') {
                // Indie: Usuwamy przecinki (tysiące), zostawiamy kropkę (grosze)
                txt = txt.replace(/,/g, '').replace(/[^0-9.]/g, '');
            } else if (id === 'pJP') {
                // Japonia: Brak groszy. Usuwamy przecinki (tysiące) i wszystko inne
                txt = txt.replace(/,/g, '').replace(/[^0-9]/g, '');
            } else {
                // TR, PL: Usuwamy kropki (tysiące w TR), zmieniamy przecinek na kropkę
                txt = txt.replace(/\./g, '');
                txt = txt.replace(/,/g, '.');
                txt = txt.replace(/[^0-9.]/g, '');
            }
            
            this.value = txt; 
        });
    });
}

function syncSearch() {
    const val = document.getElementById('searchInp').value;
    document.getElementById('psLink').href = "https://store.playstation.com/pl-pl/search/" + encodeURIComponent(val);
    document.getElementById('gameName').value = val;
}

function openPsn(loc) {
    let id = document.getElementById('gameId').value;
    if(id.includes('product/')) id = id.split('product/')[1].split('/')[0].split('?')[0];
    if(id) window.open(`https://store.playstation.com/${loc}/product/${id}`, '_blank');
    else alert("Wpisz najpierw ID!");
}

function saveGame() {
    const name = document.getElementById('gameName').value;
    if(!name) return alert("Podaj nazwę gry!");
    let id = document.getElementById('gameId').value || Date.now().toString();
    
    let db = JSON.parse(localStorage.getItem(KEY_W) || '[]');
    const newGame = { 
        id, name, 
        ed: document.getElementById('gameEd').value, 
        pl: document.getElementById('pPL').value, 
        tr: document.getElementById('pTR').value, 
        in: document.getElementById('pIN').value, 
        jp: document.getElementById('pJP').value 
    };

    const idx = db.findIndex(x => x.id == id);
    if (idx > -1) db[idx] = newGame; else db.push(newGame);
    
    localStorage.setItem(KEY_W, JSON.stringify(db));
    ['gameId','gameName','pPL','pTR','pIN','pJP'].forEach(f => {
        const field = document.getElementById(f);
        if(field) field.value = '';
    });
    render();
}

function editGame(id, source = 'W') {
    const key = source === 'W' ? KEY_W : KEY_C;
    const db = JSON.parse(localStorage.getItem(key));
    const g = (source === 'W') ? db.find(x => x.id == id) : db[id];
    if(!g) return;
    document.getElementById('gameId').value = g.id || '';
    document.getElementById('gameName').value = g.name;
    document.getElementById('gameEd').value = g.ed;
    document.getElementById('pPL').value = g.pl || '';
    document.getElementById('pTR').value = g.tr || '';
    document.getElementById('pIN').value = g.in || '';
    document.getElementById('pJP').value = g.jp || '';
    window.scrollTo({top:0, behavior:'smooth'});
}

function openModal(id) {
    tempId = id;
    const g = JSON.parse(localStorage.getItem(KEY_W)).find(x => x.id == id);
    const sel = document.getElementById('modalRegionSelect');
    sel.innerHTML = '';
    const opts = [
        {id:'PL', f:'🇵🇱', v: g.pl, r:1, c:'PLN'},
        {id:'TR', f:'🇹🇷', v: g.tr, r:rates.TRY, c:'TRY'},
        {id:'IN', f:'🇮🇳', v: g.in, r:rates.INR, c:'INR'},
        {id:'JP', f:'🇯🇵', v: g.jp, r:rates.JPY, c:'JPY'}
    ];
    opts.forEach(o => {
        const el = document.createElement('option');
        el.value = o.id;
        el.innerText = `${o.id} ${o.f} ${o.v ? '('+o.v+' '+o.c+' ≈ '+(o.v*o.r).toFixed(2)+' zł)' : ''}`;
        sel.appendChild(el);
    });
    document.getElementById('regionModal').style.display = 'flex';
}

function confirmMove() {
    const reg = document.getElementById('modalRegionSelect').value;
    let dbW = JSON.parse(localStorage.getItem(KEY_W));
    const g = dbW.find(x => x.id == tempId);
    let dbC = JSON.parse(localStorage.getItem(KEY_C) || '[]');
    dbC.push({ ...g, reg, date: new Date().toLocaleDateString() });
    localStorage.setItem(KEY_C, JSON.stringify(dbC));
    localStorage.setItem(KEY_W, JSON.stringify(dbW.filter(x => x.id != tempId)));
    document.getElementById('regionModal').style.display = 'none'; 
    render();
}

function closeModal() {
    document.getElementById('regionModal').style.display = 'none';
}

function deleteItem(id, key) {
    if(!confirm("Usunąć?")) return;
    let db = JSON.parse(localStorage.getItem(key));
    if(key === KEY_W) db = db.filter(x => x.id != id); else db.splice(id, 1);
    localStorage.setItem(key, JSON.stringify(db));
    render();
}

function setFilter(reg) {
    filterReg = reg;
    document.querySelectorAll('.filt-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.getAttribute('data-r') === reg) btn.classList.add('active');
    });
    render();
}

function render() {
    const sW = document.getElementById('wSearch').value.toLowerCase();
    const dbW = JSON.parse(localStorage.getItem(KEY_W) || '[]');
    document.getElementById('wBody').innerHTML = dbW.filter(g => g.name.toLowerCase().includes(sW)).map(g => {
        const v = [parseFloat(g.pl)||Infinity, (parseFloat(g.tr)*rates.TRY)||Infinity, (parseFloat(g.in)*rates.INR)||Infinity, (parseFloat(g.jp)*rates.JPY)||Infinity];
        const min = Math.min(...v);
        const cl = (val) => val === min && min !== Infinity ? 'best-deal' : '';
        return `<tr>
            <td class="title-cell"><b>${g.name}</b><br><small style="color:#666">${g.ed}</small></td>
            <td><div class="${cl(v[0])}">${g.pl || '-'}</div></td>
            <td><div class="${cl(v[1])}">${g.tr || '-'}<span class="conv-val">${g.tr?(g.tr*rates.TRY).toFixed(2)+' zł':''}</span></div></td>
            <td><div class="${cl(v[2])}">${g.in || '-'}<span class="conv-val">${g.in?(g.in*rates.INR).toFixed(2)+' zł':''}</span></div></td>
            <td><div class="${cl(v[3])}">${g.jp || '-'}<span class="conv-val">${g.jp?(g.jp*rates.JPY).toFixed(2)+' zł':''}</span></div></td>
            <td><div class="action-group">
                <button class="btn-tab btn-edit" onclick="editGame('${g.id}', 'W')">✏️</button>
                <button class="btn-tab btn-buy" onclick="openModal('${g.id}')">🛒</button>
                <button class="btn-tab btn-del" onclick="deleteItem('${g.id}', KEY_W)">❌</button>
            </div></td>
        </tr>`;
    }).join('');

    const sC = document.getElementById('cSearch').value.toLowerCase();
    const dbC = JSON.parse(localStorage.getItem(KEY_C) || '[]');
    const filteredCollection = dbC.filter(g => {
        const matchesSearch = g.name.toLowerCase().includes(sC);
        const matchesReg = filterReg === 'ALL' || g.reg === filterReg;
        return matchesSearch && matchesReg;
    });

    document.getElementById('cBody').innerHTML = filteredCollection.map((g, i) => {
        let col = g.reg==='PL'?'#6b1414':g.reg==='TR'?'#4a2168':g.reg==='IN'?'#6b4515':'#bc002d';
        return `<tr>
            <td class="title-cell"><b>${g.name}</b><br><small style="color:#666">${g.ed}</small></td>
            <td><span class="tag-reg" style="background:${col}">${g.reg}</span></td>
            <td>${g.date}</td>
            <td><div class="action-group">
                <button class="btn-tab btn-edit" onclick="editGame(${i}, 'C')">✏️</button>
                <button class="btn-tab btn-del" onclick="deleteItem(${i}, KEY_C)">❌</button>
            </div></td>
        </tr>`;
    }).join('');
}

function exportData() {
    const d = { w: localStorage.getItem(KEY_W), c: localStorage.getItem(KEY_C) };
    const a = document.createElement("a"); 
    a.href=URL.createObjectURL(new Blob([JSON.stringify(d)],{type:"application/json"}));
    a.download="psn_backup.json"; 
    a.click();
}

function importData(inp) {
    const r = new FileReader(); 
    r.onload = e => { 
        const d = JSON.parse(e.target.result); 
        if (d.w) {
            let parsedW = JSON.parse(d.w);
            parsedW = parsedW.map(item => { if(item.ua) { item.jp = item.ua; delete item.ua; } return item; });
            localStorage.setItem(KEY_W, JSON.stringify(parsedW));
        }
        if (d.c) {
            let parsedC = JSON.parse(d.c);
            parsedC = parsedC.map(item => { if(item.reg === 'UA') item.reg = 'JP'; return item; });
            localStorage.setItem(KEY_C, JSON.stringify(parsedC));
        }
        render(); 
    };
    r.readAsText(inp.files[0]);
}

// Przykład ID: 10002131 (To jest Concept ID np. dla God of War Ragnarok)
async function fetchPrice(conceptId) {
    try {
        // Zwróć uwagę na względną ścieżkę - apka odpytuje swój własny serwer Vercel
        const response = await fetch(`/api/psn?conceptId=${conceptId}`);
        
        if (!response.ok) {
             throw new Error('Błąd przy pobieraniu z własnego proxy');
        }

        const data = await response.json();
        console.log("Surowe dane z proxy Vercel:", data);

        // Nawigacja po skomplikowanym obiekcie JSON z API Sony
        // Uwaga: ścieżka do ceny może się różnić w zależności od produktu!
        const productInfo = data?.data?.productRetrieve?.products?.[0];
        const priceObj = productInfo?.price?.displayPrice;

        if (priceObj) {
            console.log("Pobrana cena:", priceObj);
            // Tutaj wrzucasz logikę przypisania ceny do swojego HTMLa
            // np. document.getElementById('price-display').innerText = priceObj;
        } else {
             console.log("Nie znaleziono ceny dla tego ID.");
        }

    } catch (err) {
        console.error("Coś poszło nie tak:", err);
    }
}

// Przykład użycia (możesz to podpiąć pod onClick Twojego przycisku):
// fetchPrice('10002131');

window.onload = function() {
    fetchRates();
    setupPasteHandlers(); 
};
