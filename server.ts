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
  app.post('/api/auth/get-custom-token', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const customToken = await admin.auth().createCustomToken(decodedToken.uid);
      res.json({ customToken });
    } catch (error: any) {
      console.error('Error creating custom token:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/generate-remote-login', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    
    try {
      // Create a remote login session in Firestore
      const db = admin.firestore();
      const sessionRef = await db.collection('remoteLoginSessions').add({
        email: email.toLowerCase().trim(),
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 mins
      });
      
      res.json({ sessionId: sessionRef.id });
    } catch (error: any) {
      console.error('Error generating remote login:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/authorize-remote-login', async (req, res) => {
    const { sessionId, idToken } = req.body;
    if (!sessionId || !idToken) return res.status(400).json({ error: 'Missing params' });

    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const db = admin.firestore();
      const sessionDoc = await db.collection('remoteLoginSessions').doc(sessionId).get();
      
      if (!sessionDoc.exists) return res.status(404).json({ error: 'Session not found' });
      const sessionData = sessionDoc.data();
      
      if (sessionData?.email !== decodedToken.email) {
        return res.status(403).json({ error: 'Email mismatch' });
      }

      const customToken = await admin.auth().createCustomToken(decodedToken.uid);
      await db.collection('remoteLoginSessions').doc(sessionId).update({
        status: 'authorized',
        customToken,
        authorizedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error authorizing remote login:', error);
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
