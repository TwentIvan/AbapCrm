# 🚀 Guida Setup Completo - Sincronizzazione SAP via VPN

## Panoramica

Questo sistema permette a Replit di sincronizzare le Transport Request da SAP anche quando SAP è accessibile solo via VPN.

**Architettura:**
```
Replit (cloud) → ngrok (internet) → Bridge Server (tua workstation + VPN) → SAP (interno)
```

---

## 📦 Parte 1: Installazione Bridge Server (sulla tua workstation)

### 1.1 Scarica e prepara

1. **Scarica** la cartella `bridge-server` dal progetto Replit
2. **Salvala** sul tuo PC (esempio: `C:\sap-bridge`)
3. **Apri il Prompt dei Comandi** in quella cartella:
   - Vai nella cartella con Esplora File
   - Tieni premuto Shift e click destro → "Apri finestra PowerShell qui"

### 1.2 Installa Node.js (se non ce l'hai)

1. Vai su https://nodejs.org/
2. Scarica la versione LTS (Long Term Support)
3. Installa con le opzioni predefinite
4. Verifica: `node --version` (deve mostrare la versione)

### 1.3 Installa le dipendenze

```bash
npm install
```

Attendere che finisca (circa 30 secondi)

### 1.4 Avvia il server

```bash
npm start
```

✅ Vedrai:
```
╔═══════════════════════════════════════════════════════╗
║       SAP BRIDGE SERVER ATTIVO                        ║
║  Porta locale: 3001                                   ║
╚═══════════════════════════════════════════════════════╝
```

**Non chiudere questa finestra!** Il server deve rimanere in esecuzione.

---

## 🌐 Parte 2: Esporre con ngrok

### 2.1 Installa ngrok

1. Vai su https://ngrok.com/
2. **Registrati** (gratuito)
3. **Scarica ngrok** per Windows
4. **Estrai** `ngrok.exe` in una cartella (esempio: `C:\ngrok`)

### 2.2 Configura ngrok

1. **Copia il tuo token** dalla dashboard ngrok (dopo la registrazione)
2. **Apri un NUOVO Prompt dei Comandi**
3. **Vai nella cartella ngrok:**
   ```bash
   cd C:\ngrok
   ```
4. **Configura il token:**
   ```bash
   ngrok config add-authtoken IL_TUO_TOKEN_QUI
   ```

### 2.3 Avvia ngrok

```bash
ngrok http 3001
```

✅ Vedrai qualcosa tipo:
```
Forwarding  https://abc-123-456.ngrok-free.app -> http://localhost:3001
```

**COPIA L'URL** che inizia con `https://` (esempio: `https://abc-123-456.ngrok-free.app`)

**Non chiudere questa finestra!** ngrok deve rimanere in esecuzione.

---

## ⚙️ Parte 3: Configurazione Replit

### 3.1 Aggiungi la variabile d'ambiente

1. **Vai su Replit**
2. **Clicca sull'icona "Tools"** (barra laterale sinistra)
3. **Clicca "Secrets"**
4. **Aggiungi un nuovo secret:**
   - **Key:** `SAP_BRIDGE_URL`
   - **Value:** `https://abc-123-456.ngrok-free.app` (il TUO URL ngrok)
5. **Clicca "Add Secret"**

### 3.2 Riavvia l'applicazione

Il server si riavvierà automaticamente e caricherà la nuova configurazione.

---

## 🧪 Parte 4: Test

### 4.1 Test del Bridge Server

**Dalla tua workstation**, apri il browser e vai a:
```
http://localhost:3001/health
```

✅ Dovresti vedere:
```json
{"status":"ok","message":"SAP Bridge Server attivo"}
```

### 4.2 Test di ngrok

**Da qualsiasi browser**, vai a:
```
https://IL-TUO-URL-NGROK.ngrok-free.app/health
```

✅ Dovresti vedere lo stesso messaggio (potrebbe apparire una schermata ngrok, clicca "Visit Site")

### 4.3 Test della sincronizzazione

1. **Assicurati che la VPN sia attiva**
2. **Vai nel CRM Replit** → pagina "SAP Transport"
3. **Clicca "Sincronizza da SAP"**
4. **Inserisci:**
   - URL: `https://vhgivds4ci.rise.givagroup.it:44300/sap/opu/odata/SAP/ZTHU_DOC_SRV/TransportSet?$top=5&$format=json`
   - Username: (le tue credenziali SAP)
   - Password: (la tua password SAP)
5. **Clicca "Sincronizza"**

✅ Dovresti vedere le Transport Request importate!

---

## 📝 Uso quotidiano

### Al mattino (inizio lavoro):

1. **Connetti la VPN**
2. **Avvia il Bridge Server:**
   ```bash
   cd C:\sap-bridge
   npm start
   ```
3. **Avvia ngrok** (in un'altra finestra):
   ```bash
   cd C:\ngrok
   ngrok http 3001
   ```
4. **Se l'URL ngrok è cambiato**, aggiornalo su Replit (Secrets → SAP_BRIDGE_URL)

### Durante il giorno:

- Mantieni Bridge Server e ngrok in esecuzione
- Mantieni la VPN attiva
- Sincronizza quando vuoi dal CRM

### A fine giornata:

- Puoi chiudere Bridge Server e ngrok
- Disconnetti la VPN

---

## 🐛 Risoluzione Problemi

### Errore: "Impossibile connettersi al bridge"

1. Verifica che Bridge Server sia in esecuzione (`npm start`)
2. Verifica che ngrok sia in esecuzione
3. Verifica che l'URL ngrok in Replit sia corretto

### Errore: "SAP non risponde"

1. Verifica che la VPN sia attiva
2. Testa l'URL SAP con Postman
3. Verifica username/password SAP

### ngrok dice "Session Expired"

- Riavvia ngrok: `ngrok http 3001`
- Se l'URL cambia, aggiornalo su Replit

### L'URL ngrok cambia sempre

**Soluzione gratuita:** Annotalo e aggiornalo quando cambia

**Soluzione professionale:** Aggiorna ngrok a un piano a pagamento per avere URL fisso ($8/mese)

---

## 🔒 Note di Sicurezza

✅ **Sicuro:**
- Le credenziali SAP viaggiano solo tra Replit e Bridge Server (HTTPS)
- Il Bridge Server è sulla tua workstation (non su internet)
- ngrok usa connessioni criptate

⚠️ **Attenzione:**
- Non condividere l'URL ngrok pubblicamente
- Non committare l'URL ngrok nel codice
- Chiudi ngrok quando non lo usi

---

## 💡 Alternative per il Futuro

1. **ngrok a pagamento** ($8/mese) → URL fisso, più affidabile
2. **Cloudflare Tunnel** (gratuito) → Più complesso da configurare ma gratuito
3. **Server bridge dedicato** → VM nella rete aziendale sempre attiva

---

## ✅ Checklist Setup Completo

- [ ] Node.js installato
- [ ] Bridge Server scaricato e `npm install` eseguito
- [ ] Bridge Server in esecuzione (`npm start`)
- [ ] ngrok scaricato e configurato
- [ ] ngrok in esecuzione (`ngrok http 3001`)
- [ ] URL ngrok copiato
- [ ] `SAP_BRIDGE_URL` aggiunto su Replit
- [ ] Test `/health` funzionante
- [ ] Prima sincronizzazione SAP completata ✨

---

**Serve aiuto?** Controlla i log del Bridge Server e di ngrok per dettagli sugli errori.
