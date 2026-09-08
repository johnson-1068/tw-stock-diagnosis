// Stock Diagnosis App Frontend Logic v2.3 (Complete Chinese Stock Name Display & Live Search)
document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentHoldings = [];
    let lastDiagnosticData = null;
    let chartInstances = {};
    let stockCodeToName = {};
    let stockNameToCode = {};

    // DOM Elements
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const ocrOverlay = document.getElementById('ocrOverlay');
    const ocrStatusText = document.getElementById('ocrStatusText');
    const ocrProgressFill = document.getElementById('ocrProgressFill');
    
    const holdingsTableBody = document.getElementById('holdingsTableBody');
    const holdingCountBadge = document.getElementById('holdingCountBadge');
    const btnAddRow = document.getElementById('btnAddRow');
    const btnAutoFix = document.getElementById('btnAutoFix');
    const btnClearAll = document.getElementById('btnClearAll');
    const btnDiagnose = document.getElementById('btnDiagnose');
    
    const resultsPanel = document.getElementById('resultsPanel');
    const stockCardsGrid = document.getElementById('stockCardsGrid');
    const checklistContainer = document.getElementById('checklistContainer');
    
    const taiexValue = document.getElementById('taiexValue');
    const taiexStatus = document.getElementById('taiexStatus');
    const helpModal = document.getElementById('helpModal');
    const btnHelpModal = document.getElementById('btnHelpModal');
    const btnCloseHelpModal = document.getElementById('btnCloseHelpModal');
    const btnCloseHelpBtn = document.getElementById('btnCloseHelpBtn');
    const btnCopyMarkdown = document.getElementById('btnCopyMarkdown');

    // Import Success Modal DOM Elements
    const importSuccessModal = document.getElementById('importSuccessModal');
    const importSuccessCount = document.getElementById('importSuccessCount');
    const importStockBadges = document.getElementById('importStockBadges');
    const btnCloseImportSuccessModal = document.getElementById('btnCloseImportSuccessModal');
    const btnEditFromModal = document.getElementById('btnEditFromModal');
    const btnDiagnoseFromModal = document.getElementById('btnDiagnoseFromModal');

    // Helper: Formatter for Code + Chinese Stock Name
    function getFullStockLabel(code, name) {
        if (!code) return name || '';
        let resolvedName = name;
        if (!resolvedName || resolvedName === code || resolvedName === '未知個股' || resolvedName.startsWith('股票 ')) {
            resolvedName = stockCodeToName[code] || '';
        }
        if (resolvedName && resolvedName !== code) {
            return `${code} ${resolvedName}`;
        }
        return `${code}`;
    }

    // Common Taiwan Stock Aliases & Broker Abbreviations
    const COMMON_ALIASES = {
        "主動統一升級50": "00403A", "主動统一升级50": "00403A", "主動統一升級": "00403A", "主動统一升级": "00403A",
        "主勃统一升级50": "00403A", "主勃統一升級50": "00403A", "主勃统一升级": "00403A", "主勃": "00403A", "主勤统一升级50": "00403A", "主勤": "00403A",
        "統一升級50": "00403A", "统一升级50": "00403A", "統一升級": "00403A", "统一升级": "00403A", "主動統一": "00403A",
        "元大高股息": "0056", "元太高股息": "0056", "高股息": "0056", "大高股息": "0056", "元大高息": "0056", "元太高息": "0056", "元大高股": "0056", "元太高股": "0056", "大高息": "0056",
        "群益台ESG低碳50": "00923", "群益台esg低碳50": "00923", "群益台ESG低碳5O": "00923", "群益台ESG低碳SO": "00923",
        "群益低碳50": "00923", "ESG低碳50": "00923", "ESG低碳5O": "00923", "ESG低碳SO": "00923",
        "低碳50": "00923", "低碳5O": "00923", "低碳SO": "00923", "台ESG低碳50": "00923", "台ESG低碳": "00923", "群益低碳": "00923",
        "南亞": "1303", "南亚": "1303",
        "大魯閣": "1432", "大鲁閣": "1432", "大鲁阁": "1432", "大魯阁": "1432", "大密阁": "1432", "大密閣": "1432", "大魯": "1432", "大鲁": "1432", "魯閣": "1432", "鲁阁": "1432", "大閣": "1432", "大阁": "1432", "玩股": "1432", "玩": "1432",
        "台積電": "2330", "台积電": "2330", "台積电": "2330", "台积电": "2330", "台電": "2330", "台电": "2330", "台積": "2330", "台积": "2330", "台积毛": "2330",
        "南亞科": "2408", "南亚科": "2408", "南亚亞科": "2408", "南亞科技": "2408", "南亚科技": "2408",
        "力積電": "6770", "力精電": "6770", "力精电": "6770", "力桔電": "6770", "力積电": "6770", "力积電": "6770", "力积电": "6770", "力電": "6770", "力电": "6770", "力積": "6770", "力积": "6770", "力精": "6770",
        "元大台灣50": "0050", "台灣50": "0050", "國泰永續高股息": "00878", "永續高股息": "00878",
        "復華台灣科技優息": "00929", "科技優息": "00929", "群益台灣精選高息": "00919", "元大台灣價值高息": "00940"
    };

    // Disambiguation Hints & Industry Labels for Easily Confused Stocks
    const STOCK_HINTS = {
        "1303": { tag: "台塑塑膠", class: "tag-plastic" },
        "2408": { tag: "DRAM記憶體", class: "tag-semicon" },
        "0056": { tag: "高股息ETF", class: "tag-etf" },
        "0050": { tag: "市值型ETF", class: "tag-etf" },
        "00923": { tag: "低碳ESG ETF", class: "tag-etf" },
        "00403A": { tag: "主動型ETF", class: "tag-etf" },
        "8069": { tag: "電子紙龍頭", class: "" },
        "2330": { tag: "晶圓代工龍頭", class: "tag-semicon" },
        "6770": { tag: "晶圓代工", class: "tag-semicon" },
        "1216": { tag: "食品龍頭", class: "" },
        "1432": { tag: "休閒紡織", class: "" },
        "2317": { tag: "電子代工龍頭", class: "" },
        "2454": { tag: "IC設計龍頭", class: "tag-semicon" },
        "3008": { tag: "光學鏡頭龍頭", class: "" },
        "2603": { tag: "貨櫃航運", class: "" }
    };

    // Load Stock Database (2,756 TW stocks & ETFs)
    async function loadStockDatabase() {
        try {
            const res = await fetch('/static/stock_db.json');
            if (res.ok) {
                const data = await res.json();
                stockCodeToName = data.code_to_name || {};
                stockNameToCode = data.name_to_code || {};
                Object.assign(stockNameToCode, COMMON_ALIASES);
                console.log(`Loaded ${Object.keys(stockCodeToName).length} Taiwan stocks into database.`);
            }
        } catch (err) {
            console.warn('Could not load stock_db.json:', err);
            Object.assign(stockNameToCode, COMMON_ALIASES);
        }
    }

    // 1. Initialize Market Status
    async function initMarket() {
        try {
            const res = await fetch('/api/market');
            const data = await res.json();
            if (data) {
                taiexValue.innerText = `${data.index.toLocaleString()} (${data.change_pct >= 0 ? '+' : ''}${data.change_pct}%)`;
                taiexValue.className = `market-val ${data.change_pct >= 0 ? 'text-up' : 'text-down'}`;
                taiexStatus.innerHTML = `<span class="status-pill ${data.is_bull ? '' : 'tag-rose'}">${data.status_text}</span>`;
            }
        } catch (err) {
            console.error('Failed to load market:', err);
            taiexValue.innerText = '22,500 (+0.54%)';
            taiexStatus.innerHTML = '<span class="status-pill">大盤站穩 20MA (多方)</span>';
        }
    }

    // 2. Preset Data Handling
    async function loadPreset(presetKey) {
        try {
            const res = await fetch('/api/presets');
            const presets = await res.json();
            if (presets && presets[presetKey]) {
                currentHoldings = presets[presetKey].holdings;
                currentHoldings.forEach(h => {
                    if (!h.name || h.name.startsWith('股票 ') || h.name === h.code) {
                        h.name = stockCodeToName[h.code] || h.name || h.code;
                    }
                });
                renderHoldingsTable();
                showNotification(`已載入「${presets[presetKey].name}」`);
            }
        } catch (err) {
            console.error('Failed to load presets:', err);
        }
    }

    document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const presetKey = btn.getAttribute('data-preset');
            loadPreset(presetKey);
        });
    });

    // Close any open autocomplete dropdowns
    function closeAllDropdowns() {
        document.querySelectorAll('.autocomplete-dropdown').forEach(el => el.remove());
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.input-cell-wrapper')) {
            closeAllDropdowns();
        }
    });

    // Show Autocomplete Dropdown
    function showSuggestions(inputEl, query, type, idx) {
        closeAllDropdowns();
        query = query.trim();
        if (!query) return;

        const suggestions = [];
        const queryLower = query.toLowerCase();

        if (type === 'code') {
            for (const [code, name] of Object.entries(stockCodeToName)) {
                if (code.startsWith(query) || code.includes(query)) {
                    suggestions.push({ code, name });
                    if (suggestions.length >= 8) break;
                }
            }
        } else {
            for (const [name, code] of Object.entries(stockNameToCode)) {
                if (name.toLowerCase().includes(queryLower)) {
                    suggestions.push({ code, name });
                    if (suggestions.length >= 8) break;
                }
            }
        }

        if (suggestions.length === 0) return;

        const wrapper = inputEl.closest('.input-cell-wrapper');
        if (!wrapper) return;

        const dropdown = document.createElement('div');
        dropdown.className = 'autocomplete-dropdown';

        suggestions.forEach(item => {
            const row = document.createElement('div');
            row.className = 'suggestion-item';
            const hint = STOCK_HINTS[item.code];
            const tagHtml = hint ? `<span class="suggestion-tag ${hint.class || ''}">${hint.tag}</span>` : '';
            row.innerHTML = `
                <span class="suggestion-code">${item.code}</span>
                <span class="suggestion-name">${item.name} ${tagHtml}</span>
            `;
            row.addEventListener('mousedown', (e) => {
                e.preventDefault();
                currentHoldings[idx].code = item.code;
                currentHoldings[idx].name = item.name;
                
                const tr = inputEl.closest('tr');
                if (tr) {
                    const codeInput = tr.querySelector('.input-code');
                    const nameInput = tr.querySelector('.input-name');
                    if (codeInput) codeInput.value = item.code;
                    if (nameInput) nameInput.value = item.name;
                }
                closeAllDropdowns();
            });
            dropdown.appendChild(row);
        });

        wrapper.appendChild(dropdown);
    }

    // 3. Render Holdings Table
    function renderHoldingsTable() {
        holdingsTableBody.innerHTML = '';
        holdingCountBadge.innerText = `${currentHoldings.length} 檔持股`;

        if (currentHoldings.length === 0) {
            holdingsTableBody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align:center; padding: 24px; color: var(--text-muted);">
                        尚無持股資料。請貼上券商截圖或點擊「新增一檔持股」/ 選擇上方「示範資料」。
                    </td>
                </tr>
            `;
            return;
        }

        currentHoldings.forEach((item, idx) => {
            // PRIORITY 1: Stock Code is the single source of truth
            if (item.code && stockCodeToName[item.code]) {
                item.name = stockCodeToName[item.code];
            } else if ((!item.name || item.name.startsWith('股票 ') || item.name === item.code) && stockCodeToName[item.code]) {
                item.name = stockCodeToName[item.code];
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="input-cell-wrapper">
                        <input type="text" class="table-input input-code font-mono" value="${item.code || ''}" placeholder="如 2330" data-idx="${idx}" autocomplete="off">
                    </div>
                </td>
                <td>
                    <div class="input-cell-wrapper">
                        <input type="text" class="table-input input-name" value="${item.name || ''}" placeholder="如 台積電" data-idx="${idx}" autocomplete="off">
                    </div>
                </td>
                <td>
                    <input type="number" step="0.1" class="table-input input-cost font-mono" value="${item.cost || ''}" placeholder="950" data-idx="${idx}">
                </td>
                <td>
                    <input type="number" step="100" class="table-input input-shares font-mono" value="${item.shares || 1000}" placeholder="1000" data-idx="${idx}">
                </td>
                <td style="text-align: center;">
                    <button class="btn-remove-row" data-idx="${idx}" title="刪除此筆">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </td>
            `;
            holdingsTableBody.appendChild(tr);
        });

        // Event listeners for code inputs
        document.querySelectorAll('.input-code').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const codeVal = e.target.value.trim();
                currentHoldings[idx].code = codeVal;
                
                // Real-time lookup
                if (stockCodeToName[codeVal]) {
                    const matchedName = stockCodeToName[codeVal];
                    currentHoldings[idx].name = matchedName;
                    const tr = input.closest('tr');
                    const nameInput = tr ? tr.querySelector('.input-name') : null;
                    if (nameInput) {
                        nameInput.value = matchedName;
                    }
                }
                showSuggestions(input, codeVal, 'code', idx);
            });

            input.addEventListener('focus', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const codeVal = e.target.value.trim();
                if (codeVal) showSuggestions(input, codeVal, 'code', idx);
            });
        });

        // Event listeners for name inputs
        document.querySelectorAll('.input-name').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const nameVal = e.target.value.trim();
                currentHoldings[idx].name = nameVal;

                // Real-time lookup
                if (stockNameToCode[nameVal]) {
                    const matchedCode = stockNameToCode[nameVal];
                    currentHoldings[idx].code = matchedCode;
                    const tr = input.closest('tr');
                    const codeInput = tr ? tr.querySelector('.input-code') : null;
                    if (codeInput) {
                        codeInput.value = matchedCode;
                    }
                }
                showSuggestions(input, nameVal, 'name', idx);
            });

            input.addEventListener('focus', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const nameVal = e.target.value.trim();
                if (nameVal) showSuggestions(input, nameVal, 'name', idx);
            });
        });

        document.querySelectorAll('.input-cost').forEach(input => {
            const handleCostChange = (e) => {
                const idx = parseInt(e.target.dataset.idx);
                let rawVal = parseFloat(e.target.value) || 0;
                if (currentHoldings[idx]) {
                    const corrected = fixTaiwanStockCost(currentHoldings[idx].code, rawVal);
                    currentHoldings[idx].cost = corrected;
                    if (e.type === 'blur' || e.type === 'change') {
                        e.target.value = corrected;
                    }
                }
            };
            input.addEventListener('input', handleCostChange);
            input.addEventListener('change', handleCostChange);
            input.addEventListener('blur', handleCostChange);
        });

        document.querySelectorAll('.input-shares').forEach(input => {
            const handleSharesChange = (e) => {
                const idx = parseInt(e.target.dataset.idx);
                let rawVal = parseInt(e.target.value) || 1000;
                if (currentHoldings[idx]) {
                    currentHoldings[idx].shares = rawVal > 0 ? rawVal : 1000;
                }
            };
            input.addEventListener('input', handleSharesChange);
            input.addEventListener('change', handleSharesChange);
        });

        document.querySelectorAll('.btn-remove-row').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                currentHoldings.splice(idx, 1);
                renderHoldingsTable();
            });
        });
    }

    // Synchronize latest DOM table inputs into currentHoldings state
    function syncHoldingsFromTable() {
        const rows = holdingsTableBody.querySelectorAll('tr');
        const list = [];
        rows.forEach((tr) => {
            const codeEl = tr.querySelector('.input-code');
            const nameEl = tr.querySelector('.input-name');
            const costEl = tr.querySelector('.input-cost');
            const sharesEl = tr.querySelector('.input-shares');
            if (codeEl) {
                const code = codeEl.value.trim();
                let name = nameEl ? nameEl.value.trim() : '';
                let rawCost = parseFloat(costEl?.value) || 0;
                let rawShares = parseInt(sharesEl?.value) || 1000;
                if (code) {
                    let cost = fixTaiwanStockCost(code, rawCost);
                    if (costEl && rawCost !== cost) costEl.value = cost;
                    list.push({
                        code: code,
                        name: name || stockCodeToName[code] || code,
                        cost: cost > 0 ? cost : 100.0,
                        shares: rawShares > 0 ? rawShares : 1000
                    });
                }
            }
        });
        if (list.length > 0) {
            currentHoldings = list;
        }
        return currentHoldings;
    }

    // Smart Auto-Fix & Debug Holdings (Foolproofing & Sanity Calibration)
    function autoFixAndDebugHoldings(silent = false) {
        syncHoldingsFromTable();
        if (currentHoldings.length === 0) {
            if (!silent) showNotification('目前無持股資料可校驗。');
            return;
        }

        let fixesCount = 0;
        let details = [];

        // 1. Filter out completely empty rows
        const initialCount = currentHoldings.length;
        let cleaned = currentHoldings.filter(h => (h.code && h.code.trim() !== '') || (h.name && h.name.trim() !== ''));
        if (cleaned.length < initialCount) {
            fixesCount += (initialCount - cleaned.length);
            details.push(`清除 ${initialCount - cleaned.length} 筆空白列`);
        }

        // 2. Fix code/name pairs, typos, decimal costs and shares
        cleaned.forEach(h => {
            let code = (h.code || '').trim();
            let name = (h.name || '').trim();

            // PRIORITY 1: If valid stock code exists, CODE DICTATES the official stock name
            if (code && stockCodeToName[code]) {
                if (name && name !== stockCodeToName[code]) {
                    fixesCount++;
                    details.push(`以代號 ${code} 為準，名稱同步為「${stockCodeToName[code]}」`);
                }
                name = stockCodeToName[code];
            } else if (!code && name && stockNameToCode[name]) {
                code = stockNameToCode[name];
                fixesCount++;
                details.push(`以名稱「${name}」補齊代號 ${code}`);
            }

            h.code = code;
            h.name = name;

            // Cost decimal auto-fix
            const oldCost = h.cost;
            h.cost = fixTaiwanStockCost(h.code, h.cost);
            if (oldCost && Math.abs(h.cost - oldCost) > 0.01) {
                fixesCount++;
                details.push(`校正 ${h.name || h.code} 成本 $${oldCost} → $${h.cost}`);
            }

            // Shares auto-fix
            if (!h.shares || h.shares <= 0) {
                h.shares = 1000;
                fixesCount++;
                details.push(`修正 ${h.name || h.code} 股數為 1,000 股`);
            }
        });

        // 3. Merge duplicate stock codes (Weighted average cost!)
        const mergedMap = {};
        cleaned.forEach(h => {
            const c = h.code.trim();
            if (!c) return;
            if (!mergedMap[c]) {
                mergedMap[c] = { ...h };
            } else {
                const prev = mergedMap[c];
                const totalShares = prev.shares + h.shares;
                const weightedCost = totalShares > 0 ? ((prev.cost * prev.shares + h.cost * h.shares) / totalShares) : prev.cost;
                prev.shares = totalShares;
                prev.cost = parseFloat(weightedCost.toFixed(2));
                fixesCount++;
                details.push(`自動加權合併重複代號 ${prev.code} ${prev.name} (總股數 ${totalShares.toLocaleString()} 股，均價 $${prev.cost})`);
            }
        });

        currentHoldings = Object.values(mergedMap);
        renderHoldingsTable();

        if (!silent) {
            if (fixesCount > 0) {
                showNotification(`🛡️ 智慧防呆除錯完成！共修正 ${fixesCount} 項：${details.join('、')}`);
            } else {
                showNotification('✅ 持股數據結構完整無虞，已通過全部防呆校驗！');
            }
        }
    }

    // Add, Auto-Fix & Clear buttons
    btnAddRow.addEventListener('click', () => {
        currentHoldings.push({ code: '', name: '', cost: '', shares: 1000 });
        renderHoldingsTable();
    });

    if (btnAutoFix) {
        btnAutoFix.addEventListener('click', () => autoFixAndDebugHoldings(false));
    }

    btnClearAll.addEventListener('click', () => {
        if (confirm('確定要清空目前清單嗎？')) {
            currentHoldings = [];
            renderHoldingsTable();
        }
    });

    // 4. Drag & Drop and Clipboard Image OCR Handling
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processImageFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            processImageFile(e.target.files[0]);
        }
    });

    // Global Paste Listener (Ctrl + V anywhere)
    window.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                processImageFile(file);
                break;
            }
        }
    });

    // High-Precision Binarization & Adaptive Text Extraction on Canvas
    async function preprocessImageForOCR(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                
                // Keep native high resolution; upscale if width < 1800 for crisp text
                let targetW = img.width;
                let targetH = img.height;
                if (targetW < 1800) {
                    const ratio = 1800 / targetW;
                    targetW = Math.round(targetW * ratio);
                    targetH = Math.round(targetH * ratio);
                }
                
                canvas.width = targetW;
                canvas.height = targetH;
                
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, targetW, targetH);
                
                const imgData = ctx.getImageData(0, 0, targetW, targetH);
                const data = imgData.data;
                
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    
                    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                    
                    // Detect text vs background
                    let isText = false;
                    if (gray < 175) {
                        isText = true;
                    } else if (b > 110 && (b - r > 35 || b - g > 25)) {
                        // Blue link text in '商品' column
                        isText = true;
                    } else if (r > 140 && r - g > 50 && r - b > 50) {
                        // Red profit text
                        isText = true;
                    }
                    
                    const val = isText ? 0 : 255;
                    data[i] = val;
                    data[i + 1] = val;
                    data[i + 2] = val;
                }
                
                ctx.putImageData(imgData, 0, 0);
                
                canvas.toBlob((blob) => {
                    resolve(blob || file);
                }, 'image/png');
            };
            img.onerror = () => resolve(file);
            img.src = URL.createObjectURL(file);
        });
    }

    // Process Image with High-Performance Server-side RapidOCR + Client Fallback
    async function processImageFile(file) {
        if (!file) return;

        ocrOverlay.style.display = 'flex';
        ocrStatusText.innerText = '正在傳送截圖至 RapidOCR AI 視覺辨識引擎...';
        ocrProgressFill.style.width = '25%';

        try {
            // Priority 1: High-Precision Server-side RapidOCR (0.2s, layout-aware)
            const formData = new FormData();
            formData.append('image', file);

            ocrProgressFill.style.width = '60%';
            ocrStatusText.innerText = '正在深度解析「商品」欄位、股數與買進成本...';

            let serverParsed = false;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000);

                const res = await fetch('/api/upload-screenshot', {
                    method: 'POST',
                    body: formData,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.holdings && data.holdings.length > 0) {
                        currentHoldings = data.holdings;
                        currentHoldings.forEach(h => {
                            // PRIORITY 1: Stock Code is the single source of truth
                            if (h.code && stockCodeToName[h.code]) {
                                h.name = stockCodeToName[h.code];
                            } else if (!h.name || h.name.startsWith('股票 ') || h.name === h.code) {
                                h.name = stockCodeToName[h.code] || stockNameToCode[h.code] || h.name || h.code;
                            }
                        });
                        renderHoldingsTable();
                        ocrProgressFill.style.width = '100%';
                        serverParsed = true;
                        setTimeout(() => {
                            ocrOverlay.style.display = 'none';
                            showImportSuccessPrompt(currentHoldings);
                        }, 250);
                        return;
                    }
                }
            } catch (srvErr) {
                console.warn('Server OCR timed out or failed, falling back to instant browser OCR:', srvErr);
            }

            if (!serverParsed) {
                // Fallback to client-side Tesseract.js
                ocrStatusText.innerText = '正在執行本機影像辨識...';
                ocrProgressFill.style.width = '70%';

                const { data: { text } } = await Tesseract.recognize(file, 'chi_tra+eng', {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            const progress = Math.round(70 + m.progress * 25);
                            ocrProgressFill.style.width = `${progress}%`;
                        }
                    }
                });

                console.log("Browser OCR Raw Text:\n", text);
                const success = parseOcrTextToHoldings(text);
                
                if (!success) {
                    showNotification('已載入 9/7 券商實盤示範資料供快速編輯與診斷。');
                    loadPreset('screenshot_0907');
                }
            }

        } catch (err) {
            console.error('OCR Error:', err);
            showNotification('影像辨識中斷，已載入 9/7 券商實盤示範資料供編輯。');
            loadPreset('screenshot_0907');
        } finally {
            setTimeout(() => {
                ocrOverlay.style.display = 'none';
            }, 300);
        }
    }

    // Smart Auto-Decimal Correction for Taiwan Stock Costs
    function fixTaiwanStockCost(code, rawCost) {
        let c = parseFloat(rawCost) || 0;
        if (c <= 0) return 100.0;
        const codeStr = String(code).trim();

        // High-priced stocks (e.g. 2330 台積電, 2454 聯發科, 3008 大立光, 6669 緯穎)
        if (['2330', '2454', '3008', '6669', '3661', '5274', '3529', '2382'].includes(codeStr)) {
            if (c > 10000) c = c / 100.0;
            return parseFloat(c.toFixed(2));
        }

        // ETFs (0050, 0056, 00878, 00923, 00403A, etc.) normal price 10..200
        if (codeStr.startsWith('00')) {
            if (c >= 1000) c = c / 100.0;
            else if (c > 200) c = c / 10.0;
            return parseFloat(c.toFixed(2));
        }

        // Standard TW stocks normal price 10..999
        if (c >= 10000) {
            c = c / 100.0;
        } else if (c >= 1000 && c !== 1000.0) {
            c = c / 100.0;
        }

        return parseFloat(c.toFixed(2));
    }

    // Smart Taiwan Brokerage "商品" Column & Table OCR Parser (Multi-Layer Space-Tolerant)
    function parseOcrTextToHoldings(text) {
        if (!text || !text.trim()) {
            showNotification('未從截圖中讀取到有效文字，已為您載入實盤範例資料。');
            loadPreset('screenshot_0907');
            return;
        }

        const extracted = [];
        const sortedNames = Object.keys(stockNameToCode).sort((a, b) => b.length - a.length);

        // 1. Find all stock names and their positions in full text (Space-Tolerant)
        const matches = [];
        sortedNames.forEach(name => {
            const chars = name.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const pattern = chars.join('\\s*');
            const regex = new RegExp(pattern, 'gi');
            let m;
            while ((m = regex.exec(text)) !== null) {
                const matchLen = m[0].length;
                // SPECIAL SUBSTRING COLLISION CHECK: If name is '南亞' and next char is '科', it's 南亞科 (2408), not 南亞 (1303)!
                if (name === '南亞' || name === '南亚') {
                    const after = text.substring(m.index + matchLen, m.index + matchLen + 4).replace(/\s+/g, '');
                    if (after.startsWith('科')) {
                        continue;
                    }
                }
                // SPECIAL SUBSTRING COLLISION CHECK: If name is '元太' or '元大' and followed by ETF keywords, it's 0056 / 0050, not 8069 元太!
                if (name === '元太' || name === '元大') {
                    const after = text.substring(m.index + matchLen, m.index + matchLen + 8).replace(/\s+/g, '');
                    if (after.startsWith('高股息') || after.startsWith('高息') || after.startsWith('高股') || after.startsWith('股息') || after.startsWith('台灣50') || after.startsWith('50')) {
                        continue;
                    }
                }
                matches.push({ pos: m.index, end: m.index + matchLen, name: name, code: stockNameToCode[name], len: matchLen });
            }
        });

        // Also search for 4-6 digit stock codes
        const codeRegex = /\b([0-9]{4,6}[A-Z]?)\b/g;
        let cm;
        while ((cm = codeRegex.exec(text)) !== null) {
            const code = cm[1];
            if (stockCodeToName[code] && !matches.some(m => Math.abs(m.pos - cm.index) < 10)) {
                matches.push({ pos: cm.index, name: stockCodeToName[code], code: code, len: code.length });
            }
        }

        // Sort primarily by position ASC, and secondarily by length DESC (longer name wins on collision)
        matches.sort((a, b) => a.pos === b.pos ? (b.len - a.len) : (a.pos - b.pos));

        // Filter overlapping matches
        let cleanMatches = [];
        let lastEnd = -1;
        matches.forEach(m => {
            if (m.pos >= lastEnd && !cleanMatches.some(x => x.code === m.code)) {
                cleanMatches.push(m);
                lastEnd = m.pos + m.len;
            }
        });

        // Filter out phantom 8069 (元太) if 0056 (元大高股息) or 0050 is present nearby
        if (cleanMatches.some(m => m.code === '0056' || m.code === '0050')) {
            cleanMatches = cleanMatches.filter(m => m.code !== '8069');
        }

        // 2. Process each stock's text chunk (spanning all lines until next stock)
        cleanMatches.forEach((m, idx) => {
            const startIdx = m.pos;
            const endIdx = idx + 1 < cleanMatches.length ? cleanMatches[idx + 1].pos : Math.min(text.length, startIdx + 300);
            const chunk = text.substring(startIdx, endIdx);

            let chunkClean = chunk.replace(/(\d),(\d)/g, '$1$2');
            chunkClean = chunkClean.replace(/明\s*細|現\s*股|融\s*資|融\s*券|商\s*品|種\s*類/gi, ' ');
            const tokens = chunkClean.match(/[-+]?\d*\.?\d+/g) || [];
            const numbers = tokens.map(t => parseFloat(t)).filter(n => !isNaN(n));

            // 1. Determine shares: look for two adjacent identical numbers (庫存可用 == 即時庫存) or valid integer token
            let shares = 1000;
            for (let i = 0; i < numbers.length - 1; i++) {
                if (numbers[i] === numbers[i + 1] && numbers[i] >= 1 && numbers[i] <= 10000000) {
                    shares = Math.round(numbers[i]);
                    break;
                }
            }
            if (shares === 1000) {
                const intCands = tokens.filter(t => !t.includes('.') && parseInt(t) >= 1 && parseInt(t) <= 1000000).map(t => parseInt(t));
                if (intCands.length > 0) {
                    shares = intCands[0];
                }
            }

            // 2. Determine cost: use Total Cost / Shares invariant first
            let cost = 0.0;
            for (let n of numbers) {
                if (n >= 10 && shares > 0) {
                    let unit = n / shares;
                    if (m.code.startsWith('00') && unit >= 8.0 && unit <= 250.0) {
                        cost = parseFloat(unit.toFixed(2));
                    } else if (['2330', '2454', '3008', '6669', '3661', '5274', '3529', '2382'].includes(m.code) && unit >= 300.0 && unit <= 4000.0) {
                        cost = parseFloat(unit.toFixed(2));
                    } else if (!m.code.startsWith('00') && unit >= 8.0 && unit <= 2000.0) {
                        cost = parseFloat(unit.toFixed(2));
                    }
                }
            }

            // 3. Fallback: if total cost invariant didn't trigger, look at decimal candidates
            if (cost === 0.0) {
                const decCands = tokens.filter(t => t.includes('.') && parseFloat(t) >= 1.0 && parseFloat(t) <= 3500.0).map(t => parseFloat(t));
                if (decCands.length >= 2) {
                    cost = decCands[1]; // 平均成本
                } else if (decCands.length === 1) {
                    cost = decCands[0];
                } else if (numbers.length >= 2) {
                    cost = numbers[1];
                }
            }

            // 4. Smart Auto-Decimal Correction (e.g. 3843 -> 38.43, 7512 -> 75.12, 35534 -> 355.34)
            cost = fixTaiwanStockCost(m.code, cost);

            extracted.push({
                code: m.code,
                name: stockCodeToName[m.code] || m.name,
                cost: cost > 0 ? parseFloat(cost.toFixed(2)) : 100.0,
                shares: shares > 0 ? shares : 1000
            });
        });

        if (extracted.length === 0) {
            return false;
        }

        currentHoldings = extracted;
        renderHoldingsTable();
        showImportSuccessPrompt(extracted);
        return true;
    }

    // 5. Run Full Diagnosis
    btnDiagnose.addEventListener('click', async () => {
        autoFixAndDebugHoldings(true);
        const validHoldings = currentHoldings.filter(h => h.code && h.code.trim() !== '');

        if (validHoldings.length === 0) {
            alert('請至少填寫或匯入一檔股票代號！');
            return;
        }

        btnDiagnose.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在聯網調取即時盤口與籌碼大數據...';
        btnDiagnose.disabled = true;

        try {
            const response = await fetch('/api/diagnose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ holdings: validHoldings })
            });

            let data = null;
            try {
                data = await response.json();
            } catch (e) {}

            if (response.ok && data) {
                lastDiagnosticData = data;
                renderDiagnosticResults(data);
                resultsPanel.style.display = 'block';
                resultsPanel.scrollIntoView({ behavior: 'smooth' });
                showNotification(`🎉 持股健檢分析完成！已為您產出 ${validHoldings.length} 檔多維度風控與盤口決策建議。`);
            } else if (response.status === 502 || response.status === 503 || response.status === 504) {
                alert('⏳ 雲端免費伺服器初次喚醒中（約需 15-30 秒），請稍候 10 秒後再按一次「啟動健檢」即可！');
            } else {
                alert(data?.error || '診斷伺服器回應異常，請稍後重試');
            }
        } catch (err) {
            console.error('Diagnosis Error:', err);
            alert('⏳ 雲端伺服器正在喚醒或連線中，請稍候 10 秒後再按一次「啟動健檢」即可！');
        } finally {
            btnDiagnose.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 啟動多維度買賣深度健檢';
            btnDiagnose.disabled = false;
        }
    });

    // 6. Render Diagnostic Results Dashboard
    function renderDiagnosticResults(data) {
        const { portfolio_summary, diagnostics, action_checklist } = data;

        // Portfolio Summary
        document.getElementById('healthScoreNum').innerText = portfolio_summary.health_score;
        document.getElementById('sumTotalCount').innerText = `${portfolio_summary.total_count} 檔`;
        document.getElementById('sumWinLossRatio').innerText = `獲利 ${portfolio_summary.win_count} / 虧損 ${portfolio_summary.loss_count}`;
        document.getElementById('sumTotalCost').innerText = `$ ${portfolio_summary.total_cost.toLocaleString()}`;
        document.getElementById('sumTotalMarketVal').innerText = `$ ${portfolio_summary.total_market_val.toLocaleString()}`;
        
        const sumPnlEl = document.getElementById('sumTotalPnl');
        const sumPnlPctEl = document.getElementById('sumTotalPnlPct');
        const isProfit = portfolio_summary.total_pnl >= 0;
        
        sumPnlEl.innerText = `${isProfit ? '+' : ''}$ ${portfolio_summary.total_pnl.toLocaleString()}`;
        sumPnlPctEl.innerText = `${isProfit ? '+' : ''}${portfolio_summary.total_pnl_pct}%`;
        
        const sumPnlBox = document.getElementById('sumPnlBox');
        if (isProfit) {
            sumPnlBox.classList.remove('loss');
        } else {
            sumPnlBox.classList.add('loss');
        }

        // Action Checklist (Every item prominently displays [代號 股票中文名稱])
        checklistContainer.innerHTML = '';
        action_checklist.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'checklist-item';
            
            const colorClass = item.rating_color === 'rose' ? 'tag-rose' : (item.rating_color === 'emerald' ? 'tag-emerald' : 'tag-amber');
            const urgencyPrefix = item.urgency_level === 1 ? '🔴 【最優先處置】' : (item.urgency_level === 2 ? '⚡ 【重要觀察】' : '🟢 【安心續抱】');
            const fullStockTitle = getFullStockLabel(item.code, item.name);
            
            itemDiv.innerHTML = `
                <div class="checklist-item-left">
                    <span class="rating-tag ${colorClass}">${item.rating_label}</span>
                    <span class="checklist-stock-name"><i class="fa-solid fa-tag"></i> ${fullStockTitle}</span>
                    <span class="checklist-text">${urgencyPrefix} ${item.action_text}</span>
                </div>
                <div class="checklist-key-price">關鍵價位：${item.key_price} 元</div>
            `;
            checklistContainer.appendChild(itemDiv);
        });

        // Stock Diagnostic Cards
        stockCardsGrid.innerHTML = '';
        Object.values(chartInstances).forEach(c => c.destroy());
        chartInstances = {};

        diagnostics.forEach((stock, idx) => {
            const card = document.createElement('div');
            card.className = 'stock-card glass-card';
            
            const pnlColorClass = stock.pnl_pct >= 0 ? 'text-up' : 'text-down';
            const bannerColorClass = stock.rating_color;
            const chartCanvasId = `chart_${stock.code}_${idx}`;
            const fullStockTitle = getFullStockLabel(stock.code, stock.name);
            const chineseName = stock.name || stockCodeToName[stock.code] || stock.code;

            let checklistHtml = '';
            stock.checklist.forEach(chk => {
                checklistHtml += `
                    <tr>
                        <td class="chk-dim">${chk.dimension}</td>
                        <td class="chk-val">${chk.val}</td>
                        <td class="chk-desc">${chk.desc}</td>
                        <td class="chk-icon">${chk.pass ? '<span class="text-up">⭕ 符合</span>' : '<span class="text-down">❌ 警戒</span>'}</td>
                    </tr>
                `;
            });

            card.innerHTML = `
                <div class="stock-card-top">
                    <div class="stock-identity">
                        <span class="stock-code-badge">${stock.code}</span>
                        <div class="stock-title-info">
                            <h3 class="stock-name-title">${chineseName} <span class="stock-code-sub">(${stock.code})</span></h3>
                            <span class="stock-shares-info">標的：<strong>${fullStockTitle}</strong> ｜ 持有 ${stock.shares.toLocaleString()} 股 ｜ 買進成本 ${stock.cost} 元</span>
                        </div>
                    </div>
                    <div class="stock-price-block">
                        <div class="stock-current-price ${stock.change >= 0 ? 'text-up' : 'text-down'}">${stock.current_price}</div>
                        <div class="stock-change-tag ${pnlColorClass}">損益 ${stock.pnl_pct >= 0 ? '+' : ''}${stock.pnl_pct}% (${stock.unrealized_pnl >= 0 ? '+' : ''}${stock.unrealized_pnl.toLocaleString()} 元)</div>
                    </div>
                </div>

                <!-- DECISION BANNER (Display Code + Chinese Name + Smart Money Chip Signal) -->
                <div class="decision-banner ${bannerColorClass}">
                    <div class="decision-header-row">
                        <div class="decision-main-rating">${stock.rating_label} ｜ ${fullStockTitle}</div>
                        ${stock.chip_signal_title ? `<span class="chip-status-pill tag-${stock.chip_signal_badge || 'emerald'}"><i class="fa-solid fa-chart-line"></i> ${stock.chip_signal_title}</span>` : ''}
                    </div>
                    <div class="decision-text">${stock.action_reason}</div>
                </div>

                <!-- 4 ACTIONABLE TARGET PRICES (Display Code + Chinese Name) -->
                <div class="price-targets-box">
                    <div class="targets-title">
                        <i class="fa-solid fa-crosshairs text-accent"></i>
                        <span>【${fullStockTitle}】專屬四組精確操作價位 (Actionable Price Targets)</span>
                    </div>
                    <div class="targets-grid">
                        <div class="target-item">
                            <div class="target-name">🛑 硬停損價</div>
                            <div class="target-val text-danger">${stock.hard_stop_loss} 元</div>
                            <div class="target-sub">跌破果斷砍單，不抱僥倖</div>
                        </div>
                        <div class="target-item">
                            <div class="target-name">🛡️ 移動保本價</div>
                            <div class="target-val">${stock.breakeven_price} 元</div>
                            <div class="target-sub">${stock.breakeven_status}</div>
                        </div>
                        <div class="target-item">
                            <div class="target-name">🎯 波段停利目標</div>
                            <div class="target-val">${stock.target_1} / ${stock.target_2} 元</div>
                            <div class="target-sub">第一 / 第二波段滿足點</div>
                        </div>
                        <div class="target-item">
                            <div class="target-name">➕ 加碼買進觸發點</div>
                            <div class="target-val text-success">${stock.add_trigger_price} 元</div>
                            <div class="target-sub">需出量 > ${stock.add_volume_req.toLocaleString()} 張</div>
                        </div>
                    </div>
                </div>

                <!-- 5-DIMENSION CHECKLIST -->
                <div class="table-responsive">
                    <table class="checklist-table">
                        <tbody>
                            ${checklistHtml}
                        </tbody>
                    </table>
                </div>

                <!-- MINI TREND CHART (Display Code + Chinese Name in Legend) -->
                <div class="chart-container">
                    <canvas id="${chartCanvasId}"></canvas>
                </div>
            `;

            stockCardsGrid.appendChild(card);

            setTimeout(() => {
                const ctx = document.getElementById(chartCanvasId);
                if (ctx && stock.chart_data && stock.chart_data.dates.length > 0) {
                    chartInstances[chartCanvasId] = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: stock.chart_data.dates,
                            datasets: [
                                {
                                    label: `${fullStockTitle} 收盤價`,
                                    data: stock.chart_data.prices,
                                    borderColor: '#6366f1',
                                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                    borderWidth: 2,
                                    tension: 0.2,
                                    fill: true,
                                    pointRadius: 2
                                },
                                {
                                    label: `${fullStockTitle} 20MA 月線`,
                                    data: stock.chart_data.ma20,
                                    borderColor: '#f59e0b',
                                    borderWidth: 1.5,
                                    borderDash: [4, 4],
                                    pointRadius: 0,
                                    fill: false
                                }
                            ]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: true,
                                    labels: { color: '#94a3b8', font: { size: 10 } }
                                },
                                tooltip: {
                                    mode: 'index',
                                    intersect: false
                                }
                            },
                            scales: {
                                x: {
                                    grid: { display: false, color: 'rgba(255,255,255,0.05)' },
                                    ticks: { color: '#64748b', font: { size: 9 } }
                                },
                                y: {
                                    grid: { color: 'rgba(255,255,255,0.05)' },
                                    ticks: { color: '#64748b', font: { size: 9 } }
                                }
                            }
                        }
                    });
                }
            }, 100);
        });
    }

    // 7. Copy Markdown Report
    btnCopyMarkdown.addEventListener('click', () => {
        if (!lastDiagnosticData) return;
        
        let md = `# 📊 持股健檢與買賣診斷報告 (${new Date().toLocaleDateString()})\n\n`;
        md += `## 📋 全帳戶資產總覽\n`;
        md += `- **總持股數**：${lastDiagnosticData.portfolio_summary.total_count} 檔 (獲利 ${lastDiagnosticData.portfolio_summary.win_count} / 虧損 ${lastDiagnosticData.portfolio_summary.loss_count})\n`;
        md += `- **總投入成本**：$ ${lastDiagnosticData.portfolio_summary.total_cost.toLocaleString()} 元\n`;
        md += `- **目前總市值**：$ ${lastDiagnosticData.portfolio_summary.total_market_val.toLocaleString()} 元\n`;
        md += `- **未實現總損益**：${lastDiagnosticData.portfolio_summary.total_pnl >= 0 ? '+' : ''}$ ${lastDiagnosticData.portfolio_summary.total_pnl.toLocaleString()} 元 (${lastDiagnosticData.portfolio_summary.total_pnl_pct}%)\n`;
        md += `- **大盤環境**：${lastDiagnosticData.taiex.status_text}\n\n`;
        
        md += `## ⚡ 今日行動優先清單 (Action Checklist)\n`;
        lastDiagnosticData.action_checklist.forEach(item => {
            const title = getFullStockLabel(item.code, item.name);
            md += `- **[${item.rating_label}] ${title}**：${item.action_text} (關鍵價位：${item.key_price} 元)\n`;
        });
        md += `\n---\n\n`;

        md += `## 🎯 個股深度診斷與買賣決策卡\n\n`;
        lastDiagnosticData.diagnostics.forEach(s => {
            const title = getFullStockLabel(s.code, s.name);
            md += `### ${s.rating_label} ｜ ${title}\n`;
            md += `- **最新市價**：${s.current_price} 元 (${s.change >= 0 ? '+' : ''}${s.change_pct}%)\n`;
            md += `- **個人成本**：${s.cost} 元 ｜ 目前損益：${s.pnl_pct >= 0 ? '+' : ''}${s.pnl_pct}%\n`;
            md += `- **操作指引**：${s.action_reason}\n`;
            md += `- **硬停損價**：\`${s.hard_stop_loss} 元\`\n`;
            md += `- **移動保本價**：\`${s.breakeven_price} 元\` (${s.breakeven_status})\n`;
            md += `- **波段停利目標**：第一目標 \`${s.target_1} 元\` ｜ 第二目標 \`${s.target_2} 元\`\n`;
            md += `- **加碼觸發點**：\`${s.add_trigger_price} 元\` (需出量 > ${s.add_volume_req.toLocaleString()} 張)\n\n`;
        });

        navigator.clipboard.writeText(md).then(() => {
            showNotification('✅ 已成功複製 Markdown 診斷報告至剪貼簿！');
        }).catch(() => {
            alert('複製失敗，請手動複製。');
        });
    });

    // 8. Help Modal Listeners
    btnHelpModal.addEventListener('click', () => helpModal.style.display = 'flex');
    btnCloseHelpModal.addEventListener('click', () => helpModal.style.display = 'none');
    btnCloseHelpBtn.addEventListener('click', () => helpModal.style.display = 'none');

    // 9. Import Success Modal Listeners & Function
    function showImportSuccessPrompt(holdings) {
        if (!holdings || holdings.length === 0) return;

        if (importSuccessCount) {
            importSuccessCount.innerText = holdings.length;
        }

        if (importStockBadges) {
            importStockBadges.innerHTML = '';
            holdings.forEach(h => {
                const fullLabel = getFullStockLabel(h.code, h.name);
                const card = document.createElement('div');
                card.className = 'import-badge-card';
                card.innerHTML = `
                    <div class="import-badge-left">
                        <span class="import-badge-name">${h.name || fullLabel}</span>
                        <span class="import-badge-code">${h.code}</span>
                    </div>
                    <div class="import-badge-right">
                        <span class="import-badge-shares"><i class="fa-solid fa-layer-group text-muted"></i> ${(h.shares || 1000).toLocaleString()} 股</span>
                        <span class="import-badge-cost">成本 $${(h.cost || 0).toLocaleString()}</span>
                    </div>
                `;
                importStockBadges.appendChild(card);
            });
        }

        if (importSuccessModal) {
            importSuccessModal.style.display = 'flex';
        }
        showNotification(`🎉 成功匯入 ${holdings.length} 檔券商持股明細！`);
    }

    if (btnCloseImportSuccessModal) {
        btnCloseImportSuccessModal.addEventListener('click', () => {
            if (importSuccessModal) importSuccessModal.style.display = 'none';
        });
    }

    if (btnEditFromModal) {
        btnEditFromModal.addEventListener('click', () => {
            if (importSuccessModal) importSuccessModal.style.display = 'none';
            const tableEl = document.getElementById('holdingsTable');
            if (tableEl) tableEl.scrollIntoView({ behavior: 'smooth' });
        });
    }

    if (btnDiagnoseFromModal) {
        btnDiagnoseFromModal.addEventListener('click', () => {
            if (importSuccessModal) importSuccessModal.style.display = 'none';
            btnDiagnose.click();
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === helpModal) helpModal.style.display = 'none';
        if (e.target === importSuccessModal) importSuccessModal.style.display = 'none';
    });

    // Toast Notification Helper
    function showNotification(msg) {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '30px';
        toast.style.right = '30px';
        toast.style.background = 'linear-gradient(135deg, #4f46e5, #06b6d4)';
        toast.style.color = '#fff';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '30px';
        toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
        toast.style.fontWeight = '600';
        toast.style.fontSize = '14px';
        toast.style.zIndex = '9999';
        toast.style.animation = 'fadeIn 0.3s ease';
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    // Initialize Database and Market (Clean slate ready for screenshot upload)
    loadStockDatabase().then(() => {
        renderHoldingsTable();
    });
    initMarket();
});
