// server.js - AGGIORNAMENTO PER GENERAZIONE FILE TXT
const express = require('express');
const archiver = require('archiver');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
const path = require('path');
const fs = require('fs').promises; // 📁 AGGIUNTO per la gestione file
require('dotenv').config();

// Importa i dati dei negozi per ottenere i codici
const negoziData = require('../frontend/src/data/negozi.json'); // 📊 AGGIUNTO

const app = express();
const PORT = process.env.PORT || 3001;

// ==========================================
// VERIFICA CONFIGURAZIONE STARTUP
// ==========================================
console.log('🔍 VERIFICA CONFIGURAZIONE STARTUP:');
console.log('📊 PORT:', PORT);
console.log('🔐 JWT_SECRET configurato:', !!process.env.JWT_SECRET);
console.log('📊 GOOGLE_SHEET_ID:', process.env.GOOGLE_SHEET_ID ? 'CONFIGURATO' : 'MANCANTE');
console.log('🤖 GOOGLE_SERVICE_ACCOUNT_EMAIL:', process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'CONFIGURATO' : 'MANCANTE');
console.log('🔑 GOOGLE_PRIVATE_KEY configurato:', !!process.env.GOOGLE_PRIVATE_KEY);

// Crea cartella per i file TXT se non esiste
const TXT_FILES_DIR = path.join(__dirname, 'generated_txt_files');

const ensureTxtDir = async () => {
  try {
    await fs.access(TXT_FILES_DIR);
  } catch (error) {
    console.log('📁 Creando cartella per file TXT:', TXT_FILES_DIR);
    await fs.mkdir(TXT_FILES_DIR, { recursive: true });
  }
};

// Inizializza la cartella all'avvio
ensureTxtDir().then(() => {
  console.log('📁 Cartella file TXT pronta:', TXT_FILES_DIR);
}).catch(error => {
  console.error('❌ Errore creazione cartella TXT:', error);
});

// ==========================================
// MIDDLEWARE DI SICUREZZA
// ==========================================
app.use(helmet());
app.use(cors({
  origin: true,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Troppe richieste da questo IP'
});
app.use(limiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Troppi tentativi di login. Riprova tra 15 minuti.'
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// CONFIGURAZIONE GOOGLE SHEETS
// ==========================================
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

const serviceAccountAuth = new JWT({
  email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: GOOGLE_PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

// ==========================================
// FUNZIONE PER GENERARE FILE TXT - NUOVA
// ==========================================
const generateTxtFile = async (invoiceData) => {
  try {
    console.log('📄 Generando file TXT per fattura:', invoiceData.id);
    console.log('📊 Dati fattura ricevuti:', invoiceData);

    // Estrai i dati necessari
    const dataConsegna = invoiceData.data_consegna;
    const puntoVendita = invoiceData.punto_vendita;
    const codiceFornitore = invoiceData.codice_fornitore || 'UNKNOWN'; // Colonna M
    const contenutoTxt = invoiceData.txt || ''; // Colonna L

    console.log('📋 Dati estratti:', {
      dataConsegna,
      puntoVendita,
      codiceFornitore,
      contenutoTxt: contenutoTxt.substring(0, 100) + '...'
    });

    // Trova il codice del negozio
    const negozio = negoziData.find(n => n.nome === puntoVendita);
    const codiceNegozio = negozio?.codice || 'UNKNOWN';

    console.log('🏢 Negozio trovato:', negozio);
    console.log('🏢 Codice negozio:', codiceNegozio);

    // Valida i dati richiesti
    if (!dataConsegna) {
      throw new Error('Data di consegna mancante');
    }

    if (!contenutoTxt || contenutoTxt.trim() === '') {
      console.log('⚠️ Contenuto TXT vuoto, salto la generazione del file');
      return null;
    }

    // Formatta la data per il nome del file (rimuovi caratteri non validi)
    const dataFormatted = dataConsegna.replace(/[\/\\:*?"<>|]/g, '-');

    // Genera il nome del file: DATA-CODICE_NEGOZIO-CODICE_FORNITORE.txt
    const fileName = `${dataFormatted}-${codiceNegozio}-${codiceFornitore}.txt`;
    const filePath = path.join(TXT_FILES_DIR, fileName);

    console.log('📄 Nome file generato:', fileName);
    console.log('📍 Percorso completo:', filePath);

    // Scrivi il file
    await fs.writeFile(filePath, contenutoTxt, 'utf8');

    console.log('✅ File TXT generato con successo:', fileName);
    console.log('📏 Dimensione contenuto:', contenutoTxt.length, 'caratteri');

    return {
      fileName,
      filePath,
      size: contenutoTxt.length
    };

  } catch (error) {
    console.error('❌ Errore generazione file TXT:', error);
    console.error('❌ Stack trace:', error.stack);
    throw error;
  }
};

// ==========================================
// DATABASE UTENTI
// ==========================================
const users = [
  // UFFICIO CENTRALE
  {
    id: 1,
    name: "FDV Office",
    email: "office@fradiavolopizzeria.com",
    password: "fdv2025", 
    puntoVendita: "FDV Office",
    role: "admin"
  },
  
  // GENOVA
  {
    id: 101,
    name: "FDV Genova Castello",
    email: "genova.castello@fradiavolopizzeria.com",
    password: "castello2025",
    puntoVendita: "FDV Genova Castello",
    role: "operator"
  },
  {
    id: 128,
    name: "FDV Genova Mare",
    email: "genova.mare@fradiavolopizzeria.com",
    password: "mare2025",
    puntoVendita: "FDV Genova Mare",
    role: "operator"
  },
  
  // MILANO
  {
    id: 113,
    name: "FDV Milano Sempione",
    email: "milano.sempione@fradiavolopizzeria.com",
    password: "sempione2025",
    puntoVendita: "FDV Milano Sempione",
    role: "operator"
  },
  {
    id: 120,
    name: "FDV Milano Isola",
    email: "milano.isola@fradiavolopizzeria.com",
    password: "isola2025",
    puntoVendita: "FDV Milano Isola",
    role: "operator"
  },
  {
    id: 121,
    name: "FDV Milano Citylife",
    email: "milano.citylife@fradiavolopizzeria.com",
    password: "citylife2025",
    puntoVendita: "FDV Milano Citylife",
    role: "operator"
  },
  {
    id: 125,
    name: "FDV Milano Bicocca",
    email: "milano.bicocca@fradiavolopizzeria.com",
    password: "bicocca2025",
    puntoVendita: "FDV Milano Bicocca",
    role: "operator"
  },
  {
    id: 127,
    name: "FDV Milano Premuda",
    email: "milano.premuda@fradiavolopizzeria.com",
    password: "premuda2025",
    puntoVendita: "FDV Milano Premuda",
    role: "operator"
  },
  {
    id: 131,
    name: "FDV Milano Porta Venezia",
    email: "milano.portavenezia@fradiavolopizzeria.com",
    password: "portavenezia2025",
    puntoVendita: "FDV Milano Porta Venezia",
    role: "operator"
  },
  
  // TORINO
  {
    id: 114,
    name: "FDV Torino Carlina",
    email: "torino.carlina@fradiavolopizzeria.com",
    password: "carlina2025",
    puntoVendita: "FDV Torino Carlina",
    role: "operator"
  },
  {
    id: 117,
    name: "FDV Torino GM",
    email: "torino.gm@fradiavolopizzeria.com",
    password: "gm2025",
    puntoVendita: "FDV Torino GM",
    role: "operator"
  },
  {
    id: 123,
    name: "FDV Torino IV Marzo",
    email: "torino.ivmarzo@fradiavolopizzeria.com",
    password: "ivmarzo2025",
    puntoVendita: "FDV Torino IV Marzo",
    role: "operator"
  },
  {
    id: 130,
    name: "FDV Torino Vanchiglia",
    email: "torino.vanchiglia@fradiavolopizzeria.com",
    password: "vanchiglia2025",
    puntoVendita: "FDV Torino Vanchiglia",
    role: "operator"
  },
  {
    id: 136,
    name: "FDV Torino San Salvario",
    email: "torino.sansalvario@fradiavolopizzeria.com",
    password: "sansalvario2025",
    puntoVendita: "FDV Torino San Salvario",
    role: "operator"
  },
  
  // ROMA
  {
    id: 107,
    name: "FDV Roma Parioli",
    email: "roma.parioli@fradiavolopizzeria.com",
    password: "parioli2025",
    puntoVendita: "FDV Roma Parioli",
    role: "operator"
  },
  {
    id: 133,
    name: "FDV Roma Ostiense",
    email: "roma.ostiense@fradiavolopizzeria.com",
    password: "ostiense2025",
    puntoVendita: "FDV Roma Ostiense",
    role: "operator"
  },
  {
    id: 138,
    name: "FDV Roma Trastevere",
    email: "roma.trastevere@fradiavolopizzeria.com",
    password: "trastevere2025",
    puntoVendita: "FDV Roma Trastevere",
    role: "operator"
  },
  
  // EMILIA ROMAGNA
  {
    id: 106,
    name: "FDV Bologna S.Stefano",
    email: "bologna.stefano@fradiavolopizzeria.com",
    password: "stefano2025",
    puntoVendita: "FDV Bologna S.Stefano",
    role: "operator"
  },
  {
    id: 124,
    name: "FDV Parma",
    email: "parma@fradiavolopizzeria.com",
    password: "parma2025",
    puntoVendita: "FDV Parma",
    role: "operator"
  },
  {
    id: 132,
    name: "FDV Modena",
    email: "modena@fradiavolopizzeria.com",
    password: "modena2025",
    puntoVendita: "FDV Modena",
    role: "operator"
  },
  {
    id: 137,
    name: "FDV Rimini",
    email: "rimini@fradiavolopizzeria.com",
    password: "rimini2025",
    puntoVendita: "FDV Rimini",
    role: "operator"
  },
  
  // LOMBARDIA
  {
    id: 122,
    name: "FDV Arese",
    email: "arese@fradiavolopizzeria.com",
    password: "arese2025",
    puntoVendita: "FDV Arese",
    role: "operator"
  },
  {
    id: 126,
    name: "FDV Monza",
    email: "monza@fradiavolopizzeria.com",
    password: "monza2025",
    puntoVendita: "FDV Monza",
    role: "operator"
  },
  {
    id: 135,
    name: "FDV Brescia Centro",
    email: "brescia.centro@fradiavolopizzeria.com",
    password: "brescia2025",
    puntoVendita: "FDV Brescia Centro",
    role: "operator"
  },
  
  // PIEMONTE
  {
    id: 112,
    name: "FDV Novara",
    email: "novara@fradiavolopizzeria.com",
    password: "novara2025",
    puntoVendita: "FDV Novara",
    role: "operator"
  },
  {
    id: 129,
    name: "FDV Alessandria",
    email: "alessandria@fradiavolopizzeria.com",
    password: "alessandria2025",
    puntoVendita: "FDV Alessandria",
    role: "operator"
  },
  {
    id: 134,
    name: "FDV Asti",
    email: "asti@fradiavolopizzeria.com",
    password: "asti2025",
    puntoVendita: "FDV Asti",
    role: "operator"
  },
  
  // ALTRE REGIONI
  {
    id: 119,
    name: "FDV Varese",
    email: "varese@fradiavolopizzeria.com",
    password: "varese2025",
    puntoVendita: "FDV Varese",
    role: "operator"
  }
];

console.log('👥 Utenti disponibili:', users.length);
console.log('🏢 Punti vendita configurati:', [...new Set(users.map(u => u.puntoVendita))].length);

// ==========================================
// MIDDLEWARE DI AUTENTICAZIONE JWT
// ==========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token di accesso richiesto' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token non valido' });
    }
    req.user = user;
    next();
  });
};

// ==========================================
// FUNZIONI DI VALIDAZIONE
// ==========================================
const validateEmail = (email) => {
  return validator.isEmail(email) && 
         (email.includes('@fradiavolopizzeria.com') || email.includes('@azienda.it'));
};

const validateDate = (dateString) => {
  return validator.isDate(dateString) && new Date(dateString) <= new Date();
};

const sanitizeInput = (input) => {
  return validator.escape(input.trim());
};

// ==========================================
// FUNZIONI GOOGLE SHEETS - FATTURE
// ==========================================
const getGoogleSheet = async (sheetName = null) => {
  try {
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    
    if (sheetName) {
      const sheet = doc.sheetsByTitle[sheetName];
      if (!sheet) {
        throw new Error(`Foglio "${sheetName}" non trovato`);
      }
      return sheet;
    } else {
      return doc.sheetsByIndex[0];
    }
  } catch (error) {
    console.error('Errore connessione Google Sheets:', error);
    throw new Error('Impossibile connettersi a Google Sheets');
  }
};

const loadSheetData = async (puntoVendita = null) => {
  try {
    console.log('📊 Caricamento dati da Google Sheets per punto vendita:', puntoVendita);
    const sheet = await getGoogleSheet();
    const rows = await sheet.getRows();
    
    console.log('📊 Righe caricate dal foglio:', rows.length);
    
    let data = rows.map(row => ({
      id: row.get('id'),
      numero: row.get('numero'),
      fornitore: row.get('fornitore'),
      data_emissione: row.get('data_emissione'),
      data_consegna: row.get('data_consegna'),
      stato: row.get('stato'),
      punto_vendita: row.get('punto_vendita'),
      confermato_da: row.get('confermato_da'),
      pdf_link: row.get('pdf_link'),
      importo_totale: row.get('importo_totale'),
      note: row.get('note') || '',
      txt: row.get('txt') || '', // 📄 AGGIUNTO - Colonna L
      codice_fornitore: row.get('codice_fornitore') || '' // 📄 AGGIUNTO - Colonna M
    }));

    console.log('📊 Dati elaborati:', data.length);

    data = data.filter((invoice, index, self) => 
      index === self.findIndex(i => i.id === invoice.id)
    );

    console.log('📊 Dopo rimozione duplicati:', data.length);

    if (puntoVendita) {
      data = data.filter(item => item.punto_vendita === puntoVendita);
      console.log('📊 Filtrate per punto vendita:', data.length);
    }

    return data;
  } catch (error) {
    console.error('Errore caricamento dati:', error);
    throw error;
  }
};

// ==========================================
// FUNZIONE UPDATESHEETROW MODIFICATA
// ==========================================
const updateSheetRow = async (id, updates) => {
  try {
    console.log('🔄 updateSheetRow chiamata con:', { id, updates });
    
    const sheet = await getGoogleSheet();
    const rows = await sheet.getRows();
    
    console.log('📊 Totale righe nel foglio:', rows.length);
    
    const row = rows.find(r => r.get('id') === id.toString());
    if (!row) {
      console.error('❌ Riga non trovata per ID:', id);
      console.log('🔍 IDs disponibili:', rows.map(r => r.get('id')).slice(0, 10));
      throw new Error('Fattura non trovata');
    }
    
    console.log('✅ Riga trovata:', {
      id: row.get('id'),
      numero: row.get('numero'),
      fornitore: row.get('fornitore'),
      stato_attuale: row.get('stato'),
      data_consegna_attuale: row.get('data_consegna')
    });

    // 📄 RACCOGLIE I DATI PRIMA DELL'AGGIORNAMENTO PER LA GENERAZIONE TXT
    const invoiceDataForTxt = {
      id: row.get('id'),
      numero: row.get('numero'),
      fornitore: row.get('fornitore'),
      data_emissione: row.get('data_emissione'),
      data_consegna: updates.data_consegna || row.get('data_consegna'),
      punto_vendita: row.get('punto_vendita'),
      confermato_da: updates.confermato_da || row.get('confermato_da'),
      txt: row.get('txt') || '', // Colonna L
      codice_fornitore: row.get('codice_fornitore') || '', // Colonna M
      note: updates.note || row.get('note') || ''
    };

    // Aggiorna tutti i campi passati
    Object.keys(updates).forEach(key => {
      const oldValue = row.get(key);
      const newValue = updates[key];
      console.log(`🔄 Aggiornamento ${key}: "${oldValue}" → "${newValue}"`);
      row.set(key, newValue);
    });

    console.log('💾 Salvando modifiche su Google Sheets...');
    await row.save();
    console.log('✅ Modifiche salvate con successo!');
    
    // Verifica che i campi siano stati aggiornati
    console.log('🔍 Verifica post-aggiornamento:', {
      id: row.get('id'),
      data_consegna: row.get('data_consegna'),
      confermato_da: row.get('confermato_da'),
      note: row.get('note'),
      stato: row.get('stato')
    });

    // 📄 GENERA FILE TXT SE LO STATO È DIVENTATO "CONSEGNATO"
    if (updates.stato === 'consegnato') {
      console.log('📄 Stato aggiornato a "consegnato", generando file TXT...');
      
      try {
        const txtResult = await generateTxtFile(invoiceDataForTxt);
        if (txtResult) {
          console.log('✅ File TXT generato:', txtResult.fileName);
        } else {
          console.log('ℹ️ File TXT non generato (contenuto vuoto)');
        }
      } catch (txtError) {
        console.error('❌ Errore generazione file TXT:', txtError);
        // Non interrompere il processo principale se la generazione TXT fallisce
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Errore updateSheetRow:', error);
    console.error('❌ Stack trace:', error.stack);
    throw error;
  }
};

// ==========================================
// FUNZIONI GOOGLE SHEETS - MOVIMENTAZIONI
// ==========================================
const saveMovimentazioniToSheet = async (movimenti, origine) => {
  try {
    console.log('📦 Salvando movimentazioni su Google Sheets...');
    console.log('📝 Movimenti ricevuti:', movimenti);
    console.log('🏢 Origine:', origine);

    const sheet = await getGoogleSheet('Movimentazioni');
    
    console.log('✅ Foglio "Movimentazioni" trovato:', sheet.title);
    
    const timestamp = new Date().toISOString();
    const dataOggi = new Date().toLocaleDateString('it-IT');
    
    console.log('📅 Timestamp:', timestamp);
    console.log('📅 Data oggi:', dataOggi);

    const righe = movimenti.map((movimento, index) => ({
      id: `${timestamp}-${index}`,
      data_movimento: dataOggi,
      timestamp: timestamp,
      origine: movimento.origine || origine,
      codice_origine: movimento.codice_origine || '',
      prodotto: movimento.prodotto,
      quantita: movimento.quantita,
      unita_misura: movimento.unita_misura,
      destinazione: movimento.destinazione,
      codice_destinazione: movimento.codice_destinazione || '',
      stato: 'registrato'
    }));

    console.log('📝 Righe da inserire:', righe);

    await sheet.addRows(righe);
    
    console.log('✅ Movimentazioni salvate con successo!');
    return { success: true, righe_inserite: righe.length };

  } catch (error) {
    console.error('❌ Errore salvataggio movimentazioni:', error);
    console.error('❌ Stack trace:', error.stack);
    throw error;
  }
};

const loadMovimentazioniFromSheet = async (puntoVendita) => {
  try {
    console.log('📦 Caricamento movimentazioni da Google Sheets per:', puntoVendita);
    
    const sheet = await getGoogleSheet('Movimentazioni');
    const rows = await sheet.getRows();
    
    console.log('📊 Righe caricate dal foglio movimentazioni:', rows.length);
    
    let data = rows.map(row => ({
      id: row.get('id'),
      data_movimento: row.get('data_movimento'),
      timestamp: row.get('timestamp'),
      origine: row.get('origine'),
      codice_origine: row.get('codice_origine') || '',
      prodotto: row.get('prodotto'),
      quantita: row.get('quantita'),
      unita_misura: row.get('unita_misura'),
      destinazione: row.get('destinazione'),
      codice_destinazione: row.get('codice_destinazione') || '',
      stato: row.get('stato') || 'registrato'
    }));

    console.log('📊 Movimentazioni elaborate:', data.length);

    if (puntoVendita) {
      data = data.filter(item => item.origine === puntoVendita);
      console.log('📊 Filtrate per punto vendita:', data.length);
    }

    data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return data;
  } catch (error) {
    console.error('❌ Errore caricamento movimentazioni:', error);
    throw error;
  }
};

// ==========================================
// ROUTES - AUTENTICAZIONE
// ==========================================

// Login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  console.log('🔄 POST /api/auth/login ricevuta');
  console.log('📝 Headers ricevuti:', req.headers);
  console.log('📝 Body ricevuto:', req.body);
  console.log('📝 Content-Type:', req.headers['content-type']);
  
  try {
    const { email, password } = req.body;
    console.log('📧 Email:', email);
    console.log('🔑 Password ricevuta:', password ? 'SI' : 'NO');

    if (!email || !password) {
      console.error('❌ Email o password mancanti');
      return res.status(400).json({ error: 'Email e password richiesti' });
    }

    console.log('🔍 Validando email...');
    if (!validateEmail(email)) {
      console.error('❌ Email non valida:', email);
      return res.status(400).json({ error: 'Email non valida - deve contenere @fradiavolopizzeria.com' });
    }

    console.log('🔍 Cercando utente nel database...');
    const user = users.find(u => u.email === email);
    console.log('👤 Utente trovato:', user ? 'SI' : 'NO');
    
    if (user) {
      console.log('👤 Dettagli utente:', {
        id: user.id,
        name: user.name,
        email: user.email,
        puntoVendita: user.puntoVendita
      });
    }

    if (!user) {
      console.error('❌ Utente non trovato per email:', email);
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    console.log('🔍 Verificando password...');
    console.log('🔑 Password utente nel DB:', user.password);
    console.log('🔑 Password inserita:', password);
    
    const isValidPassword = password === user.password;
    console.log('✅ Password match:', isValidPassword);

    if (!isValidPassword) {
      console.error('❌ Password non corrisponde!');
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    console.log('✅ Password corretta, generando token...');
    
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET non configurato!');
      return res.status(500).json({ error: 'Configurazione server non valida' });
    }
    
    console.log('🔑 JWT_SECRET configurato:', !!process.env.JWT_SECRET);

    const tokenPayload = { 
      userId: user.id, 
      email: user.email, 
      puntoVendita: user.puntoVendita,
      role: user.role 
    };
    
    console.log('📝 Token payload:', tokenPayload);
    
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    console.log('✅ Token generato:', token ? 'SI' : 'NO');

    const responseData = {
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        puntoVendita: user.puntoVendita,
        role: user.role
      }
    };
    
    console.log('📤 Inviando risposta:', responseData);
    res.json(responseData);

  } catch (error) {
    console.error('❌ Errore durante login:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ error: 'Errore interno del server: ' + error.message });
  }
});

// Verifica token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  console.log('🔄 GET /api/auth/verify ricevuta');
  console.log('👤 User dal token:', req.user);
  
  try {
    const user = users.find(u => u.id === req.user.userId);
    if (!user) {
      console.error('❌ Utente non trovato per ID:', req.user.userId);
      return res.status(401).json({ error: 'Utente non trovato' });
    }

    console.log('✅ Utente verificato:', user.email);

    const responseData = {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        puntoVendita: user.puntoVendita,
        role: user.role
      }
    };

    console.log('📤 Inviando risposta verify:', responseData);
    res.json(responseData);
  } catch (error) {
    console.error('❌ Errore verifica token:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Logout
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  console.log('🔄 POST /api/auth/logout ricevuta');
  res.json({ success: true, message: 'Logout effettuato' });
});

// ==========================================
// ROUTES - FATTURE
// ==========================================

// Carica fatture da Google Sheets
app.get('/api/invoices', authenticateToken, async (req, res) => {
  console.log('🔄 GET /api/invoices ricevuta');
  console.log('👤 Richiesta da utente:', req.user.email);
  console.log('🏢 Punto vendita:', req.user.puntoVendita);
  
  try {
    const data = await loadSheetData(req.user.puntoVendita);
    console.log('📤 Invio dati fatture:', data.length, 'fatture');
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Errore caricamento fatture:', error);
    res.status(500).json({ error: 'Impossibile caricare le fatture' });
  }
});

// Conferma consegna fattura
app.post('/api/invoices/:id/confirm', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { data_consegna, note_errori } = req.body;

    console.log('🔄 Conferma consegna per fattura:', id);
    console.log('📝 Dati:', { data_consegna, note_errori });

    if (!id || !data_consegna) {
      return res.status(400).json({ error: 'ID fattura e data consegna richiesti' });
    }

    if (!validateDate(data_consegna)) {
      return res.status(400).json({ error: 'Data non valida' });
    }

    const updates = {
      stato: 'consegnato',
      data_consegna: sanitizeInput(data_consegna),
      confermato_da: req.user.email
    };

    if (note_errori && note_errori.trim()) {
      updates.note = sanitizeInput(note_errori.trim());
    }

    console.log('📦 Updates da applicare:', updates);

    await updateSheetRow(id, updates);
    
    res.json({ success: true, message: 'Consegna confermata' });
  } catch (error) {
    console.error('Errore conferma:', error);
    res.status(500).json({ error: 'Impossibile confermare la consegna' });
  }
});

// Modifica fattura
app.put('/api/invoices/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { data_consegna, confermato_da, note } = req.body;

    console.log('🔄 PUT /api/invoices/:id chiamata');
    console.log('📝 ID fattura:', id);
    console.log('📝 Dati ricevuti:', { data_consegna, confermato_da, note });
    console.log('👤 Utente richiedente:', req.user.email);

    if (!id) {
      console.error('❌ ID fattura mancante');
      return res.status(400).json({ error: 'ID fattura richiesto' });
    }

    const updates = {};
    
    if (data_consegna) {
      if (!validateDate(data_consegna)) {
        console.error('❌ Data non valida:', data_consegna);
        return res.status(400).json({ error: 'Data non valida' });
      }
      updates.data_consegna = sanitizeInput(data_consegna);
      console.log('✅ Data consegna validata:', updates.data_consegna);
    }

    if (confermato_da) {
      if (!validateEmail(confermato_da)) {
        console.error('❌ Email non valida:', confermato_da);
        return res.status(400).json({ error: 'Email non valida' });
      }
      updates.confermato_da = sanitizeInput(confermato_da);
      console.log('✅ Email validata:', updates.confermato_da);
    }

    if (note !== undefined) {
      updates.note = sanitizeInput(note);
      console.log('✅ Note processate:', updates.note);
    }

    console.log('📦 Updates finali da inviare:', updates);

    if (Object.keys(updates).length === 0) {
      console.error('❌ Nessun campo da aggiornare');
      return res.status(400).json({ error: 'Nessun campo da aggiornare' });
    }

    console.log('🔄 Chiamando updateSheetRow...');
    await updateSheetRow(id, updates);
    
    console.log('✅ Google Sheets aggiornato con successo');
    
    res.json({ 
      success: true, 
      message: 'Fattura aggiornata con successo',
      updated_fields: Object.keys(updates)
    });
  } catch (error) {
    console.error('❌ Errore aggiornamento fattura:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Impossibile aggiornare la fattura: ' + error.message 
    });
  }
});

// ==========================================
// ROUTES - MOVIMENTAZIONI
// ==========================================

// Carica movimentazioni da Google Sheets
app.get('/api/movimentazioni', authenticateToken, async (req, res) => {
  console.log('🔄 GET /api/movimentazioni ricevuta');
  console.log('👤 Richiesta da utente:', req.user.email);
  console.log('🏢 Punto vendita:', req.user.puntoVendita);
  
  try {
    const data = await loadMovimentazioniFromSheet(req.user.puntoVendita);
    console.log('📤 Invio dati movimentazioni:', data.length, 'movimenti');
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Errore caricamento movimentazioni:', error);
    res.status(500).json({ error: 'Impossibile caricare le movimentazioni' });
  }
});

// Salva movimentazioni
app.post('/api/movimentazioni', authenticateToken, async (req, res) => {
  console.log('🔄 POST /api/movimentazioni ricevuta');
  console.log('👤 Richiesta da utente:', req.user.email);
  console.log('🏢 Punto vendita:', req.user.puntoVendita);
  console.log('📝 Body ricevuto:', req.body);

  try {
    const { movimenti, origine } = req.body;

    if (!movimenti || !Array.isArray(movimenti) || movimenti.length === 0) {
      console.error('❌ Movimenti non validi');
      return res.status(400).json({ error: 'Lista movimenti richiesta' });
    }

    if (!origine || origine.trim() === '') {
      console.error('❌ Origine mancante');
      return res.status(400).json({ error: 'Punto vendita di origine richiesto' });
    }

    if (req.user.puntoVendita !== origine && req.user.role !== 'admin') {
      console.error('❌ Utente non autorizzato per questo punto vendita');
      return res.status(403).json({ error: 'Non autorizzato per questo punto vendita' });
    }

    for (let i = 0; i < movimenti.length; i++) {
      const movimento = movimenti[i];
      
      if (!movimento.prodotto || movimento.prodotto.trim() === '') {
        return res.status(400).json({ error: `Prodotto richiesto per movimento ${i + 1}` });
      }
      
      if (!movimento.quantita || isNaN(movimento.quantita) || movimento.quantita <= 0) {
        return res.status(400).json({ error: `Quantità valida richiesta per movimento ${i + 1}` });
      }
      
      if (!movimento.destinazione || movimento.destinazione.trim() === '') {
        return res.status(400).json({ error: `Destinazione richiesta per movimento ${i + 1}` });
      }

      movimento.prodotto = sanitizeInput(movimento.prodotto);
      movimento.quantita = parseFloat(movimento.quantita);
      movimento.unita_misura = sanitizeInput(movimento.unita_misura || '');
      movimento.destinazione = sanitizeInput(movimento.destinazione);
    }

    console.log('📦 Movimenti validati:', movimenti);

    const result = await saveMovimentazioniToSheet(movimenti, sanitizeInput(origine));
    
    console.log('✅ Movimentazioni salvate:', result);

    res.json({ 
      success: true, 
      message: `${result.righe_inserite} movimenti registrati con successo`,
      data: result
    });

  } catch (error) {
    console.error('❌ Errore salvataggio movimentazioni:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Impossibile salvare le movimentazioni: ' + error.message 
    });
  }
});

// ==========================================
// ROUTES - UTILITÀ E FILE TXT
// ==========================================

// Route per scaricare i file TXT generati
app.get('/api/txt-files', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 GET /api/txt-files ricevuta');
    console.log('👤 Richiesta da utente:', req.user.email);

    const files = await fs.readdir(TXT_FILES_DIR);
    const txtFiles = files.filter(file => file.endsWith('.txt'));
    
    const fileList = await Promise.all(
      txtFiles.map(async (fileName) => {
        const filePath = path.join(TXT_FILES_DIR, fileName);
        const stats = await fs.stat(filePath);
        
        return {
          name: fileName,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
    );

    console.log('📄 File TXT trovati:', fileList.length);
    
    res.json({
      success: true,
      files: fileList.sort((a, b) => new Date(b.created) - new Date(a.created))
    });

  } catch (error) {
    console.error('❌ Errore caricamento lista file TXT:', error);
    res.status(500).json({ error: 'Impossibile caricare la lista dei file TXT' });
  }
});

// Route per scaricare un singolo file TXT
app.get('/api/txt-files/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    
    console.log('🔄 GET /api/txt-files/:filename ricevuta');
    console.log('📄 File richiesto:', filename);
    console.log('👤 Richiesta da utente:', req.user.email);

    // Validazione del nome file per sicurezza
    if (!filename.endsWith('.txt') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Nome file non valido' });
    }

    const filePath = path.join(TXT_FILES_DIR, filename);
    
    // Verifica che il file esista
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ error: 'File non trovato' });
    }

    // Leggi e invia il file
    const fileContent = await fs.readFile(filePath, 'utf8');
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fileContent);

    console.log('✅ File TXT inviato:', filename);

  } catch (error) {
    console.error('❌ Errore download file TXT:', error);
    res.status(500).json({ error: 'Impossibile scaricare il file TXT' });
  }
});

// Aggiungi questo endpoint nel server.js, dopo gli altri endpoint /api/txt-files

// Route per leggere il contenuto di un file TXT (per visualizzazione/modifica)
app.get('/api/txt-files/:filename/content', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    
    console.log('🔄 GET /api/txt-files/:filename/content ricevuta');
    console.log('📄 File richiesto:', filename);
    console.log('👤 Richiesta da utente:', req.user.email);

    // Validazione del nome file per sicurezza
    if (!filename.endsWith('.txt') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Nome file non valido' });
    }

    const filePath = path.join(TXT_FILES_DIR, filename);
    
    // Verifica che il file esista
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ error: 'File non trovato' });
    }

    // Leggi il contenuto del file
    const fileContent = await fs.readFile(filePath, 'utf8');
    
    console.log('✅ Contenuto file TXT letto:', filename);
    
    res.json({
      success: true,
      filename: filename,
      content: fileContent,
      size: fileContent.length
    });

  } catch (error) {
    console.error('❌ Errore lettura contenuto file TXT:', error);
    res.status(500).json({ error: 'Impossibile leggere il contenuto del file TXT' });
  }
});

// Route per aggiornare il contenuto di un file TXT
app.put('/api/txt-files/:filename/content', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const { content } = req.body;
    
    console.log('🔄 PUT /api/txt-files/:filename/content ricevuta');
    console.log('📄 File da aggiornare:', filename);
    console.log('👤 Richiesta da utente:', req.user.email);
    console.log('📝 Nuovo contenuto (primi 100 char):', content.substring(0, 100) + '...');

    // Validazione input
    if (!filename.endsWith('.txt') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Nome file non valido' });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Contenuto deve essere una stringa' });
    }

    const filePath = path.join(TXT_FILES_DIR, filename);
    
    // Verifica che il file esista
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ error: 'File non trovato' });
    }

    // Crea un backup del file originale
    const backupPath = path.join(TXT_FILES_DIR, `${filename}.backup.${Date.now()}`);
    const originalContent = await fs.readFile(filePath, 'utf8');
    await fs.writeFile(backupPath, originalContent, 'utf8');
    
    console.log('💾 Backup creato:', backupPath);

    // Scrivi il nuovo contenuto
    await fs.writeFile(filePath, content, 'utf8');
    
    console.log('✅ File TXT aggiornato:', filename);
    console.log('📏 Nuova dimensione:', content.length, 'caratteri');

    res.json({
      success: true,
      message: 'File aggiornato con successo',
      filename: filename,
      size: content.length,
      backup_created: true
    });

  } catch (error) {
    console.error('❌ Errore aggiornamento file TXT:', error);
    res.status(500).json({ error: 'Impossibile aggiornare il file TXT' });
  }
});

// Route per eliminare un file TXT (opzionale)
app.delete('/api/txt-files/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    
    console.log('🔄 DELETE /api/txt-files/:filename ricevuta');
    console.log('📄 File da eliminare:', filename);
    console.log('👤 Richiesta da utente:', req.user.email);

    // Validazione del nome file per sicurezza
    if (!filename.endsWith('.txt') || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Nome file non valido' });
    }

    const filePath = path.join(TXT_FILES_DIR, filename);
    
    // Verifica che il file esista
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({ error: 'File non trovato' });
    }

    // Crea un backup prima di eliminare
    const backupPath = path.join(TXT_FILES_DIR, `DELETED_${filename}.backup.${Date.now()}`);
    const originalContent = await fs.readFile(filePath, 'utf8');
    await fs.writeFile(backupPath, originalContent, 'utf8');

    // Elimina il file originale
    await fs.unlink(filePath);
    
    console.log('🗑️ File TXT eliminato:', filename);
    console.log('💾 Backup salvato come:', backupPath);

    res.json({
      success: true,
      message: 'File eliminato con successo',
      filename: filename,
      backup_created: true
    });

  } catch (error) {
    console.error('❌ Errore eliminazione file TXT:', error);
    res.status(500).json({ error: 'Impossibile eliminare il file TXT' });
  }
});

// Route per scaricare tutti i file TXT di una specifica data come ZIP
app.get('/api/txt-files/download-by-date/:date', authenticateToken, async (req, res) => {
  try {
    const { date } = req.params;
    
    console.log('🔄 GET /api/txt-files/download-by-date/:date ricevuta');
    console.log('📅 Data richiesta:', date);
    console.log('👤 Richiesta da utente:', req.user.email);

    // Validazione della data (formato YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Formato data non valido. Usa YYYY-MM-DD' });
    }

    // Leggi tutti i file nella cartella
    const allFiles = await fs.readdir(TXT_FILES_DIR);
    const txtFiles = allFiles.filter(file => file.endsWith('.txt') && !file.includes('.backup'));

    // Filtra i file per la data specifica
    const filesForDate = txtFiles.filter(filename => {
      // Estrai la data dal nome del file (formato: YYYY-MM-DD-CODICE_NEGOZIO-CODICE_FORNITORE.txt)
      const datePart = filename.split('-').slice(0, 3).join('-'); // Prende YYYY-MM-DD
      return datePart === date;
    });

    console.log('📄 File trovati per la data', date, ':', filesForDate.length);

    if (filesForDate.length === 0) {
      return res.status(404).json({ 
        error: `Nessun file TXT trovato per la data ${date}` 
      });
    }

    // Crea lo ZIP
    const archive = archiver('zip', {
      zlib: { level: 9 } // Massima compressione
    });

    const zipFilename = `TXT_Files_${date}.zip`;

    // Configura gli header per il download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    // Pipe dell'archivio nella response
    archive.pipe(res);

    // Aggiungi ogni file all'archivio
    for (const filename of filesForDate) {
      const filePath = path.join(TXT_FILES_DIR, filename);
      
      try {
        // Verifica che il file esista
        await fs.access(filePath);
        
        // Leggi il contenuto del file
        const fileContent = await fs.readFile(filePath, 'utf8');
        
        // Aggiungi il file all'archivio
        archive.append(fileContent, { name: filename });
        
        console.log('📄 Aggiunto al ZIP:', filename);
      } catch (fileError) {
        console.warn('⚠️ Errore lettura file:', filename, fileError.message);
        // Continua con gli altri file anche se uno fallisce
      }
    }

    // Finalizza l'archivio
    await archive.finalize();

    console.log('✅ ZIP creato e inviato:', zipFilename);
    console.log('📊 File inclusi:', filesForDate.length);

  } catch (error) {
    console.error('❌ Errore creazione ZIP:', error);
    
    // Se la response non è già stata inviata, invia l'errore
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Impossibile creare l\'archivio ZIP: ' + error.message 
      });
    }
  }
});

// Route per ottenere statistiche sui file raggruppati per data
app.get('/api/txt-files/stats-by-date', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 GET /api/txt-files/stats-by-date ricevuta');
    console.log('👤 Richiesta da utente:', req.user.email);

    // Leggi tutti i file nella cartella
    const allFiles = await fs.readdir(TXT_FILES_DIR);
    const txtFiles = allFiles.filter(file => file.endsWith('.txt') && !file.includes('.backup'));

    // Raggruppa i file per data
    const filesByDate = {};
    
    for (const filename of txtFiles) {
      try {
        // Estrai la data dal nome del file
        const datePart = filename.split('-').slice(0, 3).join('-'); // YYYY-MM-DD
        
        if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
          console.warn('⚠️ Nome file con formato data non valido:', filename);
          continue;
        }

        if (!filesByDate[datePart]) {
          filesByDate[datePart] = [];
        }

        // Ottieni le statistiche del file
        const filePath = path.join(TXT_FILES_DIR, filename);
        const stats = await fs.stat(filePath);
        
        filesByDate[datePart].push({
          name: filename,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        });
      } catch (fileError) {
        console.warn('⚠️ Errore elaborazione file:', filename, fileError.message);
      }
    }

    // Ordina le date (più recenti prima)
    const sortedDates = Object.keys(filesByDate).sort((a, b) => new Date(b) - new Date(a));

    // Crea la risposta con statistiche
    const dateGroups = sortedDates.map(date => ({
      date,
      fileCount: filesByDate[date].length,
      totalSize: filesByDate[date].reduce((sum, file) => sum + file.size, 0),
      files: filesByDate[date].sort((a, b) => new Date(b.created) - new Date(a.created))
    }));

    console.log('📊 Statistiche per date:', dateGroups.length, 'date trovate');
    console.log('📄 Totale file:', txtFiles.length);

    res.json({
      success: true,
      totalFiles: txtFiles.length,
      totalDates: dateGroups.length,
      dateGroups
    });

  } catch (error) {
    console.error('❌ Errore calcolo statistiche:', error);
    res.status(500).json({ 
      error: 'Impossibile calcolare le statistiche: ' + error.message 
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  console.log('🔄 GET /api/health ricevuta');
  res.json({ 
    success: true, 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    txt_files_dir: TXT_FILES_DIR
  });
});

// Info sistema
app.get('/api/info', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    server: {
      node: process.version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      txt_files_directory: TXT_FILES_DIR
    }
  });
});

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((error, req, res, next) => {
  console.error('Errore non gestito:', error);
  res.status(500).json({ error: 'Errore interno del server' });
});

// Route non trovata
app.use('*', (req, res) => {
  console.log('❌ Route non trovata:', req.originalUrl);
  res.status(404).json({ error: 'Endpoint non trovato' });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server in esecuzione su 0.0.0.0:${PORT}`);
  console.log(`📱 Accesso mobile: http://192.168.60.142:${PORT}`);
  console.log(`🔐 JWT Secret configurato: ${!!process.env.JWT_SECRET}`);
  console.log(`📊 Google Sheets ID: ${GOOGLE_SHEET_ID}`);
  console.log(`🤖 Google Service Account configurato: ${!!GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
  console.log(`📁 Cartella file TXT: ${TXT_FILES_DIR}`);
});

module.exports = app;