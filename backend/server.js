// server.js - Backend Node.js con Express
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// ==========================================
// MIDDLEWARE DI SICUREZZA
// ==========================================
app.use(helmet());
app.use(cors({
  origin: true, // Accetta qualsiasi origine
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuti
  max: 100, // massimo 100 richieste per IP
  message: 'Troppe richieste da questo IP'
});
app.use(limiter);

// Rate limiting specifico per login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // massimo 5 tentativi di login per IP
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
// DATABASE UTENTI (in produzione usare DB reale)
// ==========================================
const users = [
  {
    id: 1,
    name: "Milano Isola",
    email: "milano.isola@azienda.it",
    password: "isola2025", // Temporaneo in chiaro
    puntoVendita: "Milano Isola",
    role: "operator"
  },
  {
    id: 2,
    name: "Torino Centro", 
    email: "torino.centro@azienda.it",
    password: "torino2025", // Temporaneo in chiaro
    puntoVendita: "Torino Centro",
    role: "operator"
  },
  {
    id: 3,
    name: "Admin User",
    email: "admin@azienda.it", 
    password: "admin2025", // Temporaneo in chiaro
    puntoVendita: "Sede Centrale",
    role: "admin"
  }
];

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
  return validator.isEmail(email) && email.includes('@azienda.it');
};

const validateDate = (dateString) => {
  return validator.isDate(dateString) && new Date(dateString) <= new Date();
};

const sanitizeInput = (input) => {
  return validator.escape(input.trim());
};

// ==========================================
// FUNZIONI GOOGLE SHEETS
// ==========================================
const getGoogleSheet = async () => {
  try {
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    return doc.sheetsByIndex[0]; // Primo foglio
  } catch (error) {
    console.error('Errore connessione Google Sheets:', error);
    throw new Error('Impossibile connettersi a Google Sheets');
  }
};

const loadSheetData = async (puntoVendita = null) => {
  try {
    const sheet = await getGoogleSheet();
    const rows = await sheet.getRows();
    
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
      note: row.get('note') || '' // Aggiungi questa riga
    }));

    // Rimuovi duplicati basandoti sull'ID
    data = data.filter((invoice, index, self) => 
      index === self.findIndex(i => i.id === invoice.id)
    );

    if (puntoVendita) {
      data = data.filter(item => item.punto_vendita === puntoVendita);
    }

    return data;
  } catch (error) {
    console.error('Errore caricamento dati:', error);
    throw error;
  }
};

const updateSheetRow = async (id, updates) => {
  try {
    const sheet = await getGoogleSheet();
    const rows = await sheet.getRows();
    
    const row = rows.find(r => r.get('id') === id.toString());
    if (!row) {
      throw new Error('Fattura non trovata');
    }

    Object.keys(updates).forEach(key => {
      row.set(key, updates[key]);
    });

    await row.save();
    return true;
  } catch (error) {
    console.error('Errore aggiornamento:', error);
    throw error;
  }
};



// ==========================================
// ROUTES - AUTENTICAZIONE
// ==========================================

// Login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validazione input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password richiesti' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Email non valida' });
    }

   // Trova utente
const user = users.find(u => u.email === email);
console.log('🔍 Email cercata:', email);
console.log('🔍 Utente trovato:', user);
console.log('🔍 Password inserita:', password);
if (user) {
  console.log('🔍 Password utente:', user.password);
}

if (!user) {
  return res.status(401).json({ error: 'Credenziali non valide' });
}

   // Verifica password (temporaneo senza hash)
const isValidPassword = password === user.password;
console.log('🔍 Password match:', isValidPassword);
console.log('🔍 Tipo password inserita:', typeof password);
console.log('🔍 Tipo password utente:', typeof user.password);
console.log('🔍 Lunghezza password inserita:', password.length);
console.log('🔍 Lunghezza password utente:', user.password.length);

if (!isValidPassword) {
  console.log('❌ Password non corrisponde!');
  return res.status(401).json({ error: 'Credenziali non valide' });
}

console.log('✅ Password corretta, generando token...');

    // Genera JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        puntoVendita: user.puntoVendita,
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        puntoVendita: user.puntoVendita,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Errore login:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Verifica token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  try {
    // Trova l'utente dal token
    const user = users.find(u => u.id === req.user.userId);
    if (!user) {
      return res.status(401).json({ error: 'Utente non trovato' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        puntoVendita: user.puntoVendita,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Errore verifica token:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Logout
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  // In produzione, aggiungere token a blacklist
  res.json({ success: true, message: 'Logout effettuato' });
});

// ==========================================
// ROUTES - FATTURE
// ==========================================

// Carica fatture da Google Sheets
app.get('/api/invoices', authenticateToken, async (req, res) => {
  try {
    const data = await loadSheetData(req.user.puntoVendita);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Errore caricamento fatture:', error);
    res.status(500).json({ error: 'Impossibile caricare le fatture' });
  }
});

// Conferma consegna fattura
app.post('/api/invoices/:id/confirm', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { data_consegna, note_errori } = req.body;

    // Validazione
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

    // Aggiungi note se presenti
    if (note_errori && note_errori.trim()) {
      updates.note = sanitizeInput(note_errori.trim());
    }

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
    const { data_consegna, confermato_da } = req.body;

    // Validazione
    if (!id) {
      return res.status(400).json({ error: 'ID fattura richiesto' });
    }

    const updates = {};
    
    if (data_consegna) {
      if (!validateDate(data_consegna)) {
        return res.status(400).json({ error: 'Data non valida' });
      }
      updates.data_consegna = sanitizeInput(data_consegna);
    }

    if (confermato_da) {
      if (!validateEmail(confermato_da)) {
        return res.status(400).json({ error: 'Email non valida' });
      }
      updates.confermato_da = sanitizeInput(confermato_da);
    }

    await updateSheetRow(id, updates);
    
    res.json({ success: true, message: 'Fattura aggiornata' });
  } catch (error) {
    console.error('Errore aggiornamento:', error);
    res.status(500).json({ error: 'Impossibile aggiornare la fattura' });
  }
});

// ==========================================
// ROUTES - UTILITÀ
// ==========================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
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
      memory: process.memoryUsage()
    }
  });
});

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((error, req, res, next) => {
  console.error('Errore non gestito:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File troppo grande (max 10MB)' });
    }
  }
  
  res.status(500).json({ error: 'Errore interno del server' });
});

// Route non trovata
app.use('*', (req, res) => {
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
  console.log(`🤖 Google Vision configurato: ${!!GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
});

module.exports = app;