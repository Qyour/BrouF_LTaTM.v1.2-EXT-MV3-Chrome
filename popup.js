document.addEventListener('DOMContentLoaded', () => {
  const keyInput = document.getElementById('keyInput');
  const imgUrl = document.getElementById('imgUrl');
  const txtInput = document.getElementById('txtInput');
  const filenameInput = document.getElementById('filename');
  const encodeBtn = document.getElementById('encodeBtn');
  const uploadCheckbox = document.getElementById('uploadCheckbox');
  const status = document.getElementById('status');

  // --- RESTAURATION DES CHAMPS ---
  chrome.storage.local.get(['key','url','text','filename','upload'], data => {
    if(data.key) keyInput.value = data.key;
    if(data.url) imgUrl.value = data.url;
    if(data.text) txtInput.value = data.text;
    if(data.filename) filenameInput.value = data.filename;
    if(data.upload !== undefined) uploadCheckbox.checked = data.upload;
  });

  // --- SAUVEGARDE AUTOMATIQUE À CHAQUE MODIF ---
  [keyInput, imgUrl, txtInput, filenameInput, uploadCheckbox].forEach(el => {
    el.addEventListener('input', () => {
      chrome.storage.local.set({
        key: keyInput.value,
        url: imgUrl.value,
        text: txtInput.value,
        filename: filenameInput.value,
        upload: uploadCheckbox.checked
      });
    });
  });

  const resetButton = () => { encodeBtn.textContent = 'Crypter et télécharger'; encodeBtn.disabled = false; }

  encodeBtn.addEventListener('click', async () => {
    status.textContent = '';
    const key = parseInt(keyInput.value, 10);
    const url = imgUrl.value.trim();
    const text = txtInput.value;
    let filename = filenameInput.value.trim() || 'texte.txt';
    filename = filename.split(/[\\/]/).pop() || 'texte.txt';

    if (!url) { alert("Colle l'URL de l'image."); return; }
    if (!text) { alert('Entrez le texte à crypter.'); return; }
    if (!key || isNaN(key)) { alert('Entrez une clé valide (entier).'); return; }

    encodeBtn.textContent = 'Encodage...';
    encodeBtn.disabled = true;

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) { status.textContent = 'Aucun onglet actif trouvé.'; resetButton(); return; }

      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: async (imageUrl, textToEncode, keyVal, filenameUsed) => {
          const u32le_write = (buf, off, v) => { buf[off]=v&0xff; buf[off+1]=(v>>>8)&0xff; buf[off+2]=(v>>>16)&0xff; buf[off+3]=(v>>>24)&0xff; };
          try {
            const r = await fetch(imageUrl);
            if (!r.ok) throw new Error('HTTP '+r.status);
            const ab = await r.arrayBuffer();
            const img = new Uint8Array(ab);
            const origLen = img.length;
            const encoder = new TextEncoder();
            let nameBytes = encoder.encode(filenameUsed || 'texte.txt');
            if (nameBytes.length>0x104) nameBytes = nameBytes.slice(0,0x104);
            const fichierP = new Uint8Array(0x104); fichierP.set(nameBytes);
            let keyByte = ((keyVal%256)+256)%256;
            const fichier_C = new Uint8Array(0x104);
            let v6_enc=0;
            for(let i=0;i<0x104;i++){let val=(fichierP[i]+keyByte*v6_enc)%256; fichier_C[i]=(val+256)%256; v6_enc=(v6_enc+1)%10;}
            const textBytes = encoder.encode(textToEncode);
            const SF = textBytes.length>>>0;
            const outText = new Uint8Array(SF);
            let var6=0;
            for(let j=0;j<SF;j++){let kVal=(keyByte*var6+textBytes[j])%256; outText[j]=(kVal+256)%256; var6=(var6+1)%10;}
            const BUFFER=123456>>>0, VAR4=314314>>>0, VAR3=990099>>>0, VAR2=737276>>>0, VAR1=(keyVal+2165145)>>>0;
            const header=new Uint8Array(24);
            u32le_write(header,0,BUFFER); u32le_write(header,4,VAR4); u32le_write(header,8,VAR3); u32le_write(header,12,VAR2); u32le_write(header,16,VAR1); u32le_write(header,20,SF>>>0);
            const filler16=new Uint8Array(16);
            const finalLen=origLen+999+SF;
            const out=new Uint8Array(finalLen);
            out.set(img,0); out.set(header,origLen); out.set(filler16,origLen+24); out.set(fichier_C,origLen+40); out.set(outText,origLen+999);
            let binary=''; const chunkSize=0x8000;
            for(let i=0;i<out.length;i+=chunkSize){const chunk=out.subarray(i,i+chunkSize); binary+=String.fromCharCode(...chunk);}
            const base64Data=btoa(binary);
            const baseName=(filenameUsed||'texte.txt').replace(/\.[^/.]+$/,'')||'file';
            const suggestedName=baseName+'_brouf.jpg';
            return { status:'ok', base64:base64Data, filename:suggestedName };
          } catch(err){return {status:'error', message: err.message||String(err)};}
        },
        args: [url, text, key, filename]
      });

      const result = res?.result || res;

      if(result.status==='ok'){
        const byteCharacters = atob(result.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for(let i=0;i<byteCharacters.length;i++) byteNumbers[i]=byteCharacters.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {type:'image/jpeg'});

        if(!uploadCheckbox.checked){
          const a=document.createElement('a');
          a.href=URL.createObjectURL(blob);
          a.download=result.filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(a.href);
          status.textContent=`Fichier téléchargé : ${result.filename}`;
          
          // Vider le stockage après succès
          chrome.storage.local.remove(['key','url','text','filename','upload']);

          resetButton();
        } else {
          status.textContent='Upload en cours...';
          encodeBtn.textContent='Upload...';
          const reader = new FileReader();
          reader.onloadend=async()=>{
            const base64Img = reader.result.split(',')[1];
            try{
              const imgbbKey='d76f6ce755902112a8759bf5e8434842';
              const resp = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`,{
                method:'POST',
                body: new URLSearchParams({ image: base64Img })
              });
              const data = await resp.json();
              if(data.success){
                status.innerHTML = `URL image: <a href="${data.data.url}" target="_blank">${data.data.url}</a> <button id="copyBtn">Copier</button>`;
                const copyBtn = document.getElementById('copyBtn');
                copyBtn.addEventListener('click', async ()=>{
                  try{ await navigator.clipboard.writeText(data.data.url); copyBtn.textContent='Copié !'; setTimeout(()=>copyBtn.textContent='Copier',1000); }
                  catch(e){alert('Erreur copie: '+e.message);}
                });
                // Copie automatique
                try { await navigator.clipboard.writeText(data.data.url); } catch(e){console.warn('Copie automatique échouée', e);}
                
                // --- VIDER LE STOCKAGE APRES UPLOAD RÉUSSI ---
                chrome.storage.local.remove(['key','url','text','filename','upload']);
              } else { status.textContent='Upload échoué'; }
            } catch(e){ status.textContent='Erreur upload : '+e.message; }
            finally{ resetButton(); }
          };
          reader.readAsDataURL(blob);
        }
      } else { status.textContent='Erreur encodage : '+(result.message||'inconnue'); resetButton(); }

    } catch(e){ status.textContent='Erreur interne : '+(e.message||String(e)); resetButton(); }
  });
});
