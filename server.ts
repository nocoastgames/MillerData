import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Firebase Admin
  const configPath = path.join(__dirname, 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Try to initialize with default credentials or project ID
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }

  app.use(express.json());

  // API Routes
  app.post('/api/auth/generate-mobile-link', async (req, res) => {
    const { email, redirectUrl } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    try {
      const actionCodeSettings = {
        url: redirectUrl || 'https://' + req.get('host') + '/MillerData/login',
        handleCodeInApp: true,
      };

      const link = await admin.auth().generateSignInWithEmailLink(email, actionCodeSettings);
      res.json({ link });
    } catch (error: any) {
      console.error('Error generating sign-in link:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      base: '/MillerData/'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use('/MillerData/', express.static(distPath));
    app.get('/MillerData/*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    // Fallback for root
    app.get('/', (req, res) => {
      res.redirect('/MillerData/');
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
