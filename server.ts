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

  app.use(express.json({ limit: '50mb' }));

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

  app.post('/api/gemini/extract-iep', async (req, res) => {
    try {
      const { mimeType, data, apiKey: clientApiKey, goalBank } = req.body;
      if (!data) return res.status(400).json({ error: 'Missing file data' });

      // @google/genai SDK
      const { GoogleGenAI, Type } = await import('@google/genai');
      
      let apiKey = clientApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim() === '' || apiKey.toLowerCase() === 'free' || apiKey === 'MY_GEMINI_API_KEY') {
        return res.status(400).json({ 
          error: 'Missing or invalid GEMINI_API_KEY. To use the free tier, please open Settings -> Secrets, click the RED TRASH CAN icon next to GEMINI_API_KEY to completely delete the secret (do not just clear the text). After deleting it, the system will provide a free key automatically.' 
        });
      }
      
      const ai = new GoogleGenAI({ apiKey });

      const goalBankContext = goalBank && goalBank.length > 0 
        ? `\n\nExisting Goal Bank for reference. If a goal from the document is extremely similar to an existing goal bank template, please modify the extracted goal slightly so it aligns with our goal bank template's phrasing. If it's a new goal not in the bank, extract it as a generic template that can be added to the goal bank:\n${JSON.stringify(goalBank, null, 2)}`
        : '';

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: {
          parts: [
            {
              inlineData: {
                data,
                mimeType
              }
            },
            {
              text: `You are an expert Special Education Assistant.
Extract the student's information and all IEP goals from the provided document (such as a Nevada/Infinite Campus IEP).
- Look for the student name (often formatted as "Last, First" or "Name: Last, First") and ID. First name and last name should be separated correctly.
- Look for sections titled like "MEASURABLE ANNUAL GOAL", "IEP GOALS, INCLUDING ACADEMIC AND FUNCTIONAL GOALS", or "BENCHMARKS OR SHORT-TERM OBJECTIVES" to find the goals.
- The goal domain or category might be at the start of the goal text (e.g., "Functional Reading:", "Functional Math:").
- For trackingType, pick one of: "percentage", "frequency", "duration". If not specified, estimate based on the mastery criteria (e.g., if criteria mentions "60%", trackingType is percentage). Extract numerical mastery Criteria (e.g., "60" instead of "60%").
- Extract each "BENCHMARK OR SHORT-TERM OBJECTIVE" associated with the goal as an objective. Ensure you capture the full text of the objective.
- IMPORTANT: When extracting the text for goals and objectives, do NOT include the actual student's name or gendered pronouns. Replace the student's name with "the Student" or "Student", and replace specific pronouns with generic equivalents like "he/she", "his/hers", or "him/her". Provide these as generalized templates that fit nicely into a standard goal bank.${goalBankContext}`
            }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              student: {
                type: Type.OBJECT,
                properties: {
                  firstName: { type: Type.STRING },
                  lastName: { type: Type.STRING },
                  studentId: { type: Type.STRING, description: "Student ID number if found" }
                },
                required: ["firstName", "lastName"]
              },
              goals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: "The descriptive title or text of the goal" },
                    domain: { type: Type.STRING, description: "Category/Domain (e.g. Reading, Math, Behavior)" },
                    trackingType: { type: Type.STRING, description: "percentage, frequency, or duration" },
                    masteryCriteria: { type: Type.INTEGER, description: "Numeric criteria, e.g. 80 for 80%" },
                    objectives: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          title: { type: Type.STRING, description: "Sub-skill or objective text" }
                        },
                        required: ["title"]
                      }
                    }
                  },
                  required: ["title", "domain", "trackingType", "objectives"]
                }
              }
            },
            required: ["student", "goals"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No text returned from Gemini");
      
      const json = JSON.parse(text);
      res.json(json);
    } catch (error: any) {
      console.error('Error in /api/gemini/extract-iep:', error);
      let errorMessage = error.message || 'Error occurred';
      if (errorMessage.includes('API key not valid')) {
          errorMessage = 'It looks like you copied the placeholder API key or entered an invalid one. Please open the Settings menu, navigate to Secrets, and either delete the GEMINI_API_KEY to use the free tier, or replace it with your actual valid Gemini API key.';
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  app.post('/api/gemini/merge-goals', async (req, res) => {
    try {
      const { goalsToMerge, apiKey: clientApiKey } = req.body;
      if (!goalsToMerge || !Array.isArray(goalsToMerge) || goalsToMerge.length < 2) {
        return res.status(400).json({ error: 'Provide at least two goals to merge' });
      }

      const { GoogleGenAI, Type } = await import('@google/genai');
      let apiKey = clientApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim() === '' || apiKey.toLowerCase() === 'free' || apiKey === 'MY_GEMINI_API_KEY') {
        return res.status(400).json({ 
          error: 'Missing or invalid GEMINI_API_KEY. To use the free tier, please open Settings -> Secrets, click the RED TRASH CAN icon next to GEMINI_API_KEY to completely delete the secret (do not just clear the text). After deleting it, the system will provide a free key automatically.' 
        });
      }
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `You are an expert Special Education Specialist.
          Analyze the following IEP goals and merge them into a single, clean, and comprehensive goal.
          Also merge their sub-skills (objectives) into a unified list, removing duplicates but keeping important steps.
          Determine the most appropriate domain and skill level (Basic, Intermediate, Advanced) for the merged goal.
          
          Goals to merge:
          ${JSON.stringify(goalsToMerge, null, 2)}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "The descriptive title or text of the merged goal" },
              domain: { type: Type.STRING, description: "Category/Domain (e.g. Reading, Math, Behavior)" },
              skillLevel: { type: Type.STRING, description: "Basic, Intermediate, or Advanced" },
              trackingType: { type: Type.STRING, description: "percentage, frequency, or duration" },
              objectives: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: "Sub-skill or objective text" }
                  },
                  required: ["title"]
                }
              }
            },
            required: ["title", "domain", "skillLevel", "trackingType", "objectives"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No text returned from Gemini");
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error('Error in /api/gemini/merge-goals:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/gemini/analyze-bank', async (req, res) => {
    try {
      const { goalBank, apiKey: clientApiKey } = req.body;
      if (!goalBank || !Array.isArray(goalBank)) {
        return res.status(400).json({ error: 'Provide a valid goalBank array' });
      }

      const { GoogleGenAI, Type } = await import('@google/genai');
      let apiKey = clientApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim() === '' || apiKey.toLowerCase() === 'free' || apiKey === 'MY_GEMINI_API_KEY') {
        return res.status(400).json({ 
          error: 'Missing or invalid GEMINI_API_KEY.' 
        });
      }
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: `You are an expert Special Education Specialist.
          Analyze the following bank of IEP goals.
          1. Find groups of goals that are very similar and should be merged.
          2. For each group of similar goals, provide a recommended merged goal that combines their best aspects, and their sub-skills (objectives).
          3. Ensure the merged goal is assigned to the correct domain, and evaluate its difficulty to assign a skill level (Basic, Intermediate, or Advanced).
          
          Goal Bank:
          ${JSON.stringify(goalBank, null, 2)}
          
          Only return groups where merging is recommended (at least 2 similar goals).`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              mergeProposals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    originalGoalIds: { 
                      type: Type.ARRAY, 
                      items: { type: Type.STRING },
                      description: "The IDs of the original goals that should be merged"
                    },
                    reason: { type: Type.STRING, description: "Why these goals should be merged" },
                    mergedGoal: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        domain: { type: Type.STRING },
                        skillLevel: { type: Type.STRING },
                        trackingType: { type: Type.STRING },
                        objectives: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              title: { type: Type.STRING }
                            },
                            required: ["title"]
                          }
                        }
                      },
                      required: ["title", "domain", "skillLevel", "trackingType", "objectives"]
                    }
                  },
                  required: ["originalGoalIds", "reason", "mergedGoal"]
                }
              }
            },
            required: ["mergeProposals"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No text returned from Gemini");
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error('Error in /api/gemini/analyze-bank:', error);
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
