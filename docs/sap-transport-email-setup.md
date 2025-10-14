# Configurazione SAP Transport via Email

## Come Funziona

Il sistema permette di ricevere Transport Requests SAP tramite email invece che via API diretta. Questo ti rende completamente indipendente dall'IT del cliente.

## Setup

### 1. Configura una Cartella Email Dedicata

1. Vai su **Menu → Email → Configurazioni Email**
2. Aggiungi o modifica un account email
3. Nel campo "Cartelle", aggiungi una cartella dedicata (es. "SAP Transport" o "Transport")
4. Salva la configurazione

### 2. Formato JSON da Inviare

Il sistema ABAP deve inviare un'email con un allegato JSON alla cartella configurata. Il JSON deve avere questo formato:

```json
{
  "request_number": "DEVK900123",
  "description": "Sviluppo Report Vendite",
  "owner": "MARIO.ROSSI",
  "project_id": "4dbaa04c-4b5a-40bd-90f9-312149b920b2",
  "status": "modifiable",
  "target_system": "QAS",
  "release_date": "2025-01-15T10:00:00Z",
  "tasks": [
    {
      "task_number": "DEVK900124",
      "description": "Task sviluppo",
      "user": "MARIO.ROSSI",
      "status": "modifiable"
    }
  ],
  "objects": [
    {
      "object_name": "ZMM_REPORT_VENDITE",
      "object_type": "program",
      "lock_status": "locked",
      "content": [
        {
          "line_number": 1,
          "content": "REPORT zmm_report_vendite."
        },
        {
          "line_number": 2,
          "content": "* Report per analisi vendite"
        }
      ]
    }
  ]
}
```

### 3. Campi Obbligatori

- `request_number`: Numero TR (es. DEVK900123)
- `description`: Descrizione della TR
- `owner`: Utente SAP proprietario
- `project_id`: UUID del progetto CRM a cui associare la TR

### 4. Campi Opzionali

- `status`: Stato TR ("modifiable", "released", "imported", "error")
- `target_system`: Sistema target (QAS, PRD, etc.)
- `release_date`: Data rilascio
- `tasks[]`: Array di task
- `objects[]`: Array di oggetti modificati

## Processamento

1. Il sistema IMAP monitora la cartella configurata
2. Quando riceve un'email con allegato JSON:
   - Verifica che il nome file termini con `.json`
   - Valida che contenga il campo `request_number`
   - Controlla se la TR esiste già (per evitare duplicati)
   - Processa e salva la TR con tasks e objects
3. La TR appare automaticamente nella pagina SAP Transport Requests

## Riconoscimento Cartella

Il sistema riconosce automaticamente le cartelle SAP Transport se il nome contiene:
- "sap" (case insensitive)
- "transport" (case insensitive)

Esempi di nomi validi:
- "SAP Transport"
- "Transport Requests"
- "SAP TR"
- "Trasporti SAP"

## Log e Debug

Controlla i log del server per verificare il processamento:
- `[SAP-TR] Trovato JSON Transport Request: ...` - JSON rilevato
- `[SAP-TR] ✅ Transport Request processata con successo: ...` - TR creata
- `[SAP-TR] ❌ Errore processamento TR: ...` - Errore (verifica campi obbligatori)

## Esempio Report ABAP

```abap
REPORT z_send_tr_email.

DATA: lv_json TYPE string,
      lv_email TYPE string VALUE 'tuo-account@gmail.com',
      lt_binary TYPE solix_tab,
      lv_subject TYPE so_obj_des.

* Costruisci JSON
lv_json = '{'  &&
  '"request_number": "DEVK900123",' &&
  '"description": "Sviluppo Report",' &&
  '"owner": "MARIO.ROSSI",' &&
  '"project_id": "4dbaa04c-4b5a-40bd-90f9-312149b920b2"' &&
'}'.

* Invia email con allegato JSON
lv_subject = 'Transport Request DEVK900123'.

CALL FUNCTION 'SO_NEW_DOCUMENT_ATT_SEND_API1'
  EXPORTING
    document_data              = ...
    document_type              = 'RAW'
    put_in_outbox             = 'X'
  TABLES
    contents_txt              = ...
    contents_hex              = lt_binary
    receivers                 = ...
  EXCEPTIONS
    ...
ENDFUNCTION.

COMMIT WORK.
```
