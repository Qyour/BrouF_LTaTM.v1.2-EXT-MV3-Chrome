// background.js (MV3) — Brouf_PoP décodage clic droit (avec auto-detection de la clé)
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "brouf_decode",
        title: "Brouf_Q — Décoder le texte",
        contexts: ["image"]
    });
});

// Injecteur du décodeur dans la page (inchangé)
async function tryInjectDecoder(tabId, srcUrl, key) {
    try {
        const [res] = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (srcUrlInner, keyInner) => {
                try {
                    const r = await fetch(srcUrlInner);
                    if (!r.ok) return { status: "error", message: "HTTP " + r.status };
                    const ab = await r.arrayBuffer();
                    const data = new Uint8Array(ab);

                    const toU32 = (a, off) => (a[off] | (a[off+1]<<8) | (a[off+2]<<16) | (a[off+3]<<24)) >>> 0;
                    const BUFFER = 123456>>>0, VAR4 = 314314>>>0, VAR3 = 990099>>>0, VAR2 = 737276>>>0;
                    const VAR1 = (keyInner + 2165145) >>> 0;

                    let offset = -1;
                    for (let p = 0; p <= data.length - 24; p++) {
                        if (toU32(data,p)===BUFFER && toU32(data,p+4)===VAR4 && toU32(data,p+8)===VAR3 && toU32(data,p+12)===VAR2) {
                            const v1 = toU32(data, p+16);
                            if (v1 === VAR1) { offset = p; break; }
                        }
                    }

                    if (offset === -1) return { status: "no_signature" };

                    const SF = toU32(data, offset + 20);
                    if (!SF || SF <= 0) return { status: "error", message: "SF invalide" };
                    const encStart = offset + 999;
                    if (encStart + SF > data.length) return { status: "error", message: "Payload tronqué" };

                    const encrypted = data.slice(encStart, encStart + SF);
                    const iVal = keyInner % 256;
                    let var6 = 0;
                    const dec = new Uint8Array(SF);
                    for (let j = 0; j < SF; j++) {
                        let v = encrypted[j];
                        let kVal = v - iVal * var6;
                        kVal = ((kVal % 256) + 256) % 256;
                        dec[j] = kVal;
                        var6 = (var6 + 1) % 10;
                    }
                    const text = new TextDecoder().decode(dec).replace(/\0+$/g, "");

                    // overlay
                    const existing = document.getElementById("brouf-popup-overlay");
                    if (existing) existing.remove();
                    const overlay = document.createElement("div");
                 overlay.id = "brouf-popup-overlay";
                    Object.assign(overlay.style, {
                        position: "fixed",
                        right: "20px",
                        top: "20px",
                        zIndex: 2147483647,
                        width: "520px",
                        maxWidth: "calc(100% - 40px)",
                        background: "#0b1220",
                        color: "#e6eef8",
                        border: "1px solid #a33636",
                        borderRadius: "8px",
                        boxShadow: "0 10px 30px rgba(2,6,23,0.6)",
                        padding: "12px",
                        fontFamily: "Inter, system-ui, Arial, sans-serif",
                        maxHeight: "72vh",
                        overflow: "hidden",
                        boxSizing: "border-box"
                    });

                    overlay.innerHTML = `
                      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
                        <div style="background:#a33636;color:#fff;padding:8px 12px;border-radius:8px;font-weight:700">BrouF_Q by KyouR</div>
                        <strong style="flex:1;color:#fff;font-size:14px">Texte décodé</strong>
                        <button id="brouf-copy-btn" style="background:#a33636;border:none;color:white;padding:6px 10px;border-radius:8px;cursor:pointer">Copier</button>
                        <button id="brouf-close-btn" style="background:#a33636;border:none;color:white;padding:6px 10px;border-radius:8px;cursor:pointer">Fermer</button>
                      </div>
                      <textarea id="brouf-decoded-text" style="width:100%;height:300px;padding:10px;border-radius:6px;border:1px solid #a33636;background:#071025;color:#e6eef8;resize:vertical;box-sizing:border-box"></textarea>
                    `;

                    document.documentElement.appendChild(overlay);
                    const ta = overlay.querySelector("#brouf-decoded-text");
                    ta.value = text;
                    ta.select();
                    overlay.querySelector("#brouf-copy-btn").addEventListener("click", async () => {
                        try { await navigator.clipboard.writeText(ta.value); const btn = overlay.querySelector("#brouf-copy-btn"); btn.textContent = "Copié ✓"; setTimeout(()=>btn.textContent="Copier",900); }
                        catch(e){ ta.select(); alert("Impossible d'accéder au presse-papier. Copiez manuellement (Ctrl/Cmd+C)."); }
                    });
                    overlay.querySelector("#brouf-close-btn").addEventListener("click", ()=>overlay.remove());

                    return { status: "ok", textLength: SF };
                } catch(e) {
                    return { status: "error", message: (e && e.message) ? e.message : String(e) };
                }
            },
            args: [srcUrl, key]
        });
        return res && res.result ? res.result : { status: "error", message: "no result from injection" };
    } catch(e) {
        console.error("executeScript error:", e);
        return { status: "error", message: e && e.message ? e.message : String(e) };
    }
}

/*
 * Nouvelle fonction : essaye d'auto-détecter la clé dans l'image via injection dans la page.
 * Renvoie { status:'ok', key:n } ou { status:'no_signature' } ou { status:'error', message }
 */
async function tryAutoDetectKey(tabId, srcUrl) {
    try {
        const [res] = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (srcUrlInner) => {
                try {
                    const toU32 = (a, off) => (a[off] | (a[off+1]<<8) | (a[off+2]<<16) | (a[off+3]<<24)) >>> 0;
                    const BUFFER = 123456>>>0, VAR4 = 314314>>>0, VAR3 = 990099>>>0, VAR2 = 737276>>>0;
                    const KEY_OFFSET_ADDER = 2165145>>>0;

                    const r = await fetch(srcUrlInner);
                    if (!r.ok) return { status: "error", message: "HTTP " + r.status };
                    const ab = await r.arrayBuffer();
                    const data = new Uint8Array(ab);

                    for (let p = 0; p <= data.length - 24; p++) {
                        if (toU32(data, p) === BUFFER &&
                            toU32(data, p+4) === VAR4 &&
                            toU32(data, p+8) === VAR3 &&
                            toU32(data, p+12) === VAR2) {
                            const v = toU32(data, p+16);
                            // key = v - 2165145  (unsigned safe)
                            const key = (v - KEY_OFFSET_ADDER) >>> 0;
                            return { status: "ok", key, offset: p };
                        }
                    }
                    return { status: "no_signature" };
                } catch(e) {
                    return { status: "error", message: (e && e.message) ? e.message : String(e) };
                }
            },
            args: [srcUrl]
        });
        return res && res.result ? res.result : { status: "error", message: "no result from injection" };
    } catch (e) {
        console.error("tryAutoDetectKey executeScript error:", e);
        return { status: "error", message: e && e.message ? e.message : String(e) };
    }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.id || !info || !info.srcUrl) return;
    console.log("Clic droit sur image:", info.srcUrl);

    const store = await chrome.storage.local.get({ broufKey: null });
    console.log("Storage lu (background):", store);
    let key = store.broufKey;

    // Si aucune clé ou invalide → on tente d'abord l'auto-détection
    if (!key || isNaN(key) || key < 1000 || key > 9999) {
        console.log("Clé absente ou invalide, tentative d'auto-détection...");
        const detected = await tryAutoDetectKey(tab.id, info.srcUrl);
        console.log("Auto-detection result:", detected);
        if (detected && detected.status === 'ok' && typeof detected.key === 'number') {
            // si la clé détectée est dans la plage 1000..9999 on l'accepte, sinon on l'accepte quand même (selon ton besoin)
            if (detected.key >= 1000 && detected.key <= 9999) {
                await chrome.storage.local.set({ broufKey: detected.key });
                key = detected.key;
                console.log("Clé auto-détectée et enregistrée:", key);
            } else {
                // clé détectée mais hors plage "4 chiffres" — on la stocke quand même mais on log
                await chrome.storage.local.set({ broufKey: detected.key });
                key = detected.key;
                console.warn("Clé détectée hors plage 4-chiffres :", detected.key);
            }
        } else if (detected && detected.status === 'no_signature') {
            console.log("Aucune signature trouvée avec auto-détection. On retombe sur prompt.");
            // fallback: ancien prompt (si l'utilisateur veut entrer manuellement)
            const [promptRes] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (msg) => {
                    const k = parseInt(prompt(msg + "\n(4 chiffres, ex: 2025)"), 10);
                    return isNaN(k) ? null : k;
                },
                args: ["Entrez la clé Brouf pour cette image"]
            });
            const newKey = promptRes && promptRes.result;
            if (!newKey) return;
            await chrome.storage.local.set({ broufKey: newKey });
            key = newKey;
        } else {
            // erreur (fetch/CORS ou autre)
            console.warn("Auto-detection erreur:", detected && detected.message);
            // propose le prompt à l'utilisateur — idem que précédemment
            const [promptRes] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (msg) => {
                    const k = parseInt(prompt(msg + "\n(4 chiffres, ex: 2025)"), 10);
                    return isNaN(k) ? null : k;
                },
                args: ["Entrez la clé Brouf pour cette image"]
            });
            const newKey = promptRes && promptRes.result;
            if (!newKey) return;
            await chrome.storage.local.set({ broufKey: newKey });
            key = newKey;
        }
    }

    // Maintenant on a (peut-être) une clé — lance le décodeur
    const result = await tryInjectDecoder(tab.id, info.srcUrl, key);
    console.log("tryInjectDecoder result:", result);

    if (result.status === "ok") return;

    // Si la signature n'a pas matché avec la clé fournie, on essaye l'auto-détect avant de reprompter
    if (result.status === "no_signature") {
        console.log("Signature non trouvée avec la clé fournie, tentative d'auto-détection...");
        const detected = await tryAutoDetectKey(tab.id, info.srcUrl);
        console.log("Auto-detection result (retry):", detected);
        if (detected && detected.status === 'ok' && typeof detected.key === 'number') {
            await chrome.storage.local.set({ broufKey: detected.key });
            const retry = await tryInjectDecoder(tab.id, info.srcUrl, detected.key);
            if (retry.status === "ok") return;
            // si retry échoue, on tombe sur le prompt classique
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (m)=>alert(m), args:["Clé détectée mais décodage échoué."] });
            return;
        }

        // si pas de signature détectée ou erreur, demander la clé à l'utilisateur (fallback)
        const [promptRes] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (msg) => {
                const k = parseInt(prompt(msg + "\n(4 chiffres, ex: 2010)"), 10);
                return isNaN(k) ? null : k;
            },
            args: ["Entrez la clé Brouf"]
        });
        const newKey = promptRes && promptRes.result;
        if (newKey && newKey >= 1000 && newKey <= 9999) {
            await chrome.storage.local.set({ broufKey: newKey });
            const retry = await tryInjectDecoder(tab.id, info.srcUrl, newKey);
            if (retry.status === "ok") return;
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (m)=>alert(m), args:["Clé refusée."] });
        } else {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (m)=>alert(m), args:["Saisie annulée."] });
        }
        return;
    }

    // Tout autre échec
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (m)=>alert(m), args:["Décodage impossible : " + (result.message || "erreur inconnue")] });
});
