const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const https = require('https');

const app = express();
const PORT = 3001;

// Configurazione per accettare certificati SSL self-signed
const httpsAgent = new https.Agent({
  rejectUnauthorized: false // ATTENZIONE: solo per certificati interni/self-signed
});

// Abilita CORS per permettere richieste da Replit
app.use(cors());
app.use(express.json());

// Endpoint di health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'SAP Bridge Server attivo' });
});

// Endpoint proxy per SAP OData
app.post('/sap-proxy', async (req, res) => {
  try {
    const { odataUrl, username, password } = req.body;

    if (!odataUrl) {
      return res.status(400).json({ error: 'Campo odataUrl mancante' });
    }

    console.log(`[BRIDGE] Chiamata a SAP: ${odataUrl}`);
    console.log(`[BRIDGE] Con autenticazione: ${!!username}`);

    // Prepara headers
    const headers = {
      'Accept': 'application/json',
    };

    // Aggiungi Basic Auth se fornite credenziali
    if (username && password) {
      const authString = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${authString}`;
    }

    // Chiamata a SAP attraverso la VPN
    const response = await fetch(odataUrl, {
      method: 'GET',
      headers,
      agent: odataUrl.startsWith('https') ? httpsAgent : undefined
    });

    console.log(`[BRIDGE] Risposta SAP: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BRIDGE] Errore SAP:`, errorText);
      return res.status(response.status).json({
        error: `Errore SAP: ${response.status} ${response.statusText}`,
        details: errorText.substring(0, 500)
      });
    }

    const data = await response.json();
    console.log(`[BRIDGE] Dati ricevuti, risultati: ${data.d?.results?.length || 0}`);

    // Restituisci i dati a Replit
    res.json(data);

  } catch (error) {
    console.error('[BRIDGE] Errore:', error.message);
    res.status(500).json({
      error: 'Errore nella chiamata a SAP',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║       SAP BRIDGE SERVER ATTIVO                        ║
╟───────────────────────────────────────────────────────╢
║  Porta locale: ${PORT}                                    ║
║  Health check: http://localhost:${PORT}/health          ║
║                                                       ║
║  PROSSIMI PASSI:                                      ║
║  1. Installa ngrok: https://ngrok.com/download        ║
║  2. Esegui: ngrok http ${PORT}                            ║
║  3. Copia l'URL pubblico (es: https://abc123.ngrok.io)║
║  4. Configuralo in Replit                             ║
╚═══════════════════════════════════════════════════════╝
  `);
});
