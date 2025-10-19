# SAP Bridge Server

Server ponte per connettere Replit al sistema SAP interno attraverso VPN.

## 📋 Prerequisiti

- Node.js 16+ installato sulla workstation
- Connessione VPN attiva
- ngrok account gratuito: https://ngrok.com/download

## 🚀 Installazione (5 minuti)

### Passo 1: Installa il Bridge Server

1. **Copia la cartella `bridge-server`** sul tuo PC
2. **Apri il Prompt dei Comandi** nella cartella
3. **Installa le dipendenze:**
   ```bash
   npm install
   ```

### Passo 2: Avvia il Server

```bash
npm start
```

Dovresti vedere:
```
SAP BRIDGE SERVER ATTIVO
Porta locale: 3001
```

### Passo 3: Esponi con ngrok

1. **Scarica ngrok:** https://ngrok.com/download
2. **Registrati** (gratuito) e copia il token
3. **Configura ngrok:**
   ```bash
   ngrok config add-authtoken IL_TUO_TOKEN
   ```
4. **Avvia ngrok** (in un NUOVO prompt dei comandi):
   ```bash
   ngrok http 3001
   ```

Vedrai qualcosa come:
```
Forwarding  https://abc123-456-789.ngrok-free.app -> http://localhost:3001
```

5. **Copia l'URL pubblico** (es: `https://abc123-456-789.ngrok-free.app`)

### Passo 4: Configurazione Replit

1. Vai su Replit
2. Cerca `SAP_BRIDGE_URL` nel codice
3. Sostituisci con il tuo URL ngrok

## 🧪 Test

Verifica che funzioni:

```bash
curl https://IL_TUO_URL_NGROK.ngrok-free.app/health
```

Risposta attesa:
```json
{"status":"ok","message":"SAP Bridge Server attivo"}
```

## 🔐 Sicurezza

**IMPORTANTE:** Questo server:
- ✅ Gira solo sulla tua workstation
- ✅ Accede a SAP solo quando la VPN è attiva
- ✅ Usa autenticazione SAP Basic Auth
- ⚠️ L'URL ngrok è temporaneo (cambia ogni restart)
- 💡 Per URL permanente: ngrok a pagamento o Cloudflare Tunnel

## 🐛 Troubleshooting

**Server non parte:**
- Verifica che Node.js sia installato: `node --version`
- Verifica che la porta 3001 sia libera

**ngrok non funziona:**
- Verifica di aver configurato l'authtoken
- Prova a riavviare ngrok

**SAP non risponde:**
- Verifica che la VPN sia attiva
- Testa l'URL SAP con Postman

## 📝 Note

- Mantieni il server in esecuzione durante l'uso
- Mantieni ngrok in esecuzione
- Se riavvii ngrok, l'URL cambia (riconfigura Replit)
