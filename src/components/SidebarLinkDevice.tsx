import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Loader2, CheckCircle2 } from 'lucide-react';
import { db } from '../firebase';
import { doc, setDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

export const SidebarLinkDevice = () => {
  const { profile } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'generating' | 'waiting' | 'scanned' | 'linked'>('generating');

  const generateSession = async () => {
    if (!profile) return;
    setStatus('generating');
    const newSessionId = Math.random().toString(36).substring(2, 15);
    
    try {
      await setDoc(doc(db, 'linkSessions', newSessionId), {
        targetEmail: profile.email,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setSessionId(newSessionId);
      setStatus('waiting');
    } catch (error) {
      console.error('Error generating link session:', error);
    }
  };

  useEffect(() => {
    if (profile) {
      generateSession();
    } else {
      setSessionId(null);
      setStatus('generating');
    }
  }, [profile]);

  useEffect(() => {
    if (sessionId && profile) {
      const unsubscribe = onSnapshot(doc(db, 'linkSessions', sessionId), async (snapshot) => {
        const data = snapshot.data();
        if (data) {
          if (data.status === 'scanned' && data.personalEmail) {
            setStatus('scanned');
            // Automatically link the account
            try {
              await setDoc(doc(db, 'userAliases', data.personalEmail), {
                targetEmail: profile.email,
                createdAt: serverTimestamp()
              });
              await updateDoc(doc(db, 'linkSessions', sessionId), {
                status: 'linked'
              });
              setStatus('linked');
              
              // Reset to a new QR code after 3 seconds
              setTimeout(() => {
                generateSession();
              }, 3000);
            } catch (error) {
              console.error('Error linking account:', error);
              // Reset on error
              setTimeout(() => {
                generateSession();
              }, 3000);
            }
          }
        }
      });
      return () => unsubscribe();
    }
  }, [sessionId, profile]);

  if (!profile) return null;

  const qrUrl = `${window.location.origin}${window.location.pathname}#/link-device?session=${sessionId}`;

  return (
    <div className="mt-6 px-4 pb-4">
      <div className="bg-primary-foreground/5 rounded-2xl p-4 flex flex-col items-center text-center">
        <div className="flex items-center gap-2 mb-3 text-primary-foreground/80">
          <Smartphone className="w-4 h-4" />
          <span className="text-xs font-medium uppercase tracking-wider">Link Mobile</span>
        </div>
        
        <div className="bg-white p-2 rounded-xl shadow-sm mb-3">
          {status === 'generating' && (
            <div className="w-[120px] h-[120px] flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <span className="text-[10px]">Generating...</span>
            </div>
          )}

          {status === 'waiting' && sessionId && (
            <QRCodeSVG value={qrUrl} size={120} level="L" />
          )}

          {status === 'scanned' && (
            <div className="w-[120px] h-[120px] flex flex-col items-center justify-center text-primary">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <span className="text-[10px] font-medium">Linking...</span>
            </div>
          )}

          {status === 'linked' && (
            <div className="w-[120px] h-[120px] flex flex-col items-center justify-center text-green-600">
              <CheckCircle2 className="w-8 h-8 mb-2" />
              <span className="text-[10px] font-bold">Linked!</span>
            </div>
          )}
        </div>
        
        <p className="text-[10px] text-primary-foreground/60 leading-tight">
          Scan to sign in on your phone without your school account.
        </p>
      </div>
    </div>
  );
};
