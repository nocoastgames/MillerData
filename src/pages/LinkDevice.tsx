import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { auth, googleProvider, signInWithPopup, db } from '../firebase';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Smartphone, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { APP_VERSION } from '../version';

export const LinkDevice = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  const navigate = useNavigate();
  
  const [status, setStatus] = useState<'loading' | 'ready' | 'linking' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [targetEmail, setTargetEmail] = useState('');

  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      setErrorMsg('Invalid or missing session ID.');
      return;
    }

    const checkSession = async () => {
      try {
        const sessionDoc = await getDoc(doc(db, 'linkSessions', sessionId));
        if (!sessionDoc.exists()) {
          setStatus('error');
          setErrorMsg('Session not found or expired.');
          return;
        }
        
        const data = sessionDoc.data();
        if (data.status !== 'pending') {
          setStatus('error');
          setErrorMsg('This code has already been used.');
          return;
        }

        setTargetEmail(data.targetEmail);
        setStatus('ready');

        // Listen for completion
        const unsubscribe = onSnapshot(doc(db, 'linkSessions', sessionId), (snapshot) => {
          if (snapshot.data()?.status === 'linked') {
            setStatus('success');
            setTimeout(() => {
              navigate('/');
            }, 2000);
          }
        });

        return () => unsubscribe();
      } catch (error) {
        console.error('Error checking session:', error);
        setStatus('error');
        setErrorMsg('Failed to verify session.');
      }
    };

    checkSession();
  }, [sessionId, navigate]);

  const handleSignIn = async () => {
    if (!sessionId) return;
    setStatus('linking');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const personalEmail = result.user.email;
      
      if (!personalEmail) throw new Error('No email returned from Google.');

      await updateDoc(doc(db, 'linkSessions', sessionId), {
        personalEmail: personalEmail.toLowerCase(),
        status: 'scanned'
      });
      
      // The desktop will see this and update to 'linked'
    } catch (error: any) {
      console.error('Sign in error:', error);
      setStatus('error');
      setErrorMsg(error.message || 'Failed to sign in.');
    }
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-6 pt-10">
          <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
            <Smartphone className="w-10 h-10 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold text-primary mb-2">Link Device</CardTitle>
          <CardDescription className="text-base">
            Connect your personal device to your school account.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="pb-10 px-8 text-center">
          {status === 'loading' && (
            <div className="flex flex-col items-center text-muted-foreground py-8">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Verifying secure link...</p>
            </div>
          )}

          {status === 'ready' && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                You are linking this device to <span className="font-semibold text-foreground">{targetEmail}</span>.
              </p>
              <p className="text-sm text-muted-foreground">
                Please sign in with your <strong>personal Google account</strong>. This account will be securely linked to your school profile.
              </p>
              <Button 
                onClick={handleSignIn}
                className="w-full h-12 text-lg rounded-full shadow-md"
              >
                Sign in with Google
              </Button>
            </div>
          )}

          {status === 'linking' && (
            <div className="flex flex-col items-center text-primary py-8">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p className="font-medium">Waiting for desktop authorization...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center text-green-600 py-8">
              <CheckCircle2 className="w-12 h-12 mb-4" />
              <p className="font-bold text-lg">Device Linked Successfully!</p>
              <p className="text-sm text-muted-foreground mt-2">Redirecting to dashboard...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center text-destructive py-8">
              <AlertCircle className="w-12 h-12 mb-4" />
              <p className="font-bold text-lg">Link Failed</p>
              <p className="text-sm mt-2">{errorMsg}</p>
              <Button 
                variant="outline" 
                onClick={() => navigate('/login')}
                className="mt-6 rounded-full"
              >
                Go to Login
              </Button>
            </div>
          )}

          <div className="mt-8 text-[10px] text-muted-foreground/40 font-mono">
            v{APP_VERSION}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
