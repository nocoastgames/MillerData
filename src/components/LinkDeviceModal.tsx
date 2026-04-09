import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Loader2, CheckCircle2 } from 'lucide-react';
import { db } from '../firebase';
import { doc, setDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

interface LinkDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LinkDeviceModal = ({ isOpen, onClose }: LinkDeviceModalProps) => {
  const { profile } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<'generating' | 'waiting' | 'scanned' | 'linked'>('generating');

  useEffect(() => {
    if (isOpen && profile) {
      const generateSession = async () => {
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
      generateSession();
    } else {
      setSessionId(null);
      setStatus('generating');
    }
  }, [isOpen, profile]);

  useEffect(() => {
    if (sessionId && isOpen && profile) {
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
              setTimeout(() => {
                onClose();
              }, 2000);
            } catch (error) {
              console.error('Error linking account:', error);
            }
          }
        }
      });
      return () => unsubscribe();
    }
  }, [sessionId, isOpen, profile, onClose]);

  const qrUrl = `${window.location.origin}${window.location.pathname}#/link-device?session=${sessionId}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md text-center">
        <DialogHeader>
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Smartphone className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-2xl font-bold text-center">Link Mobile Device</DialogTitle>
          <DialogDescription className="text-center">
            Scan this QR code with your phone to sign in without using your school account.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-6">
          {status === 'generating' && (
            <div className="flex flex-col items-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Generating secure code...</p>
            </div>
          )}

          {status === 'waiting' && sessionId && (
            <div className="bg-white p-4 rounded-2xl shadow-inner mb-4">
              <QRCodeSVG value={qrUrl} size={200} level="H" />
            </div>
          )}

          {status === 'scanned' && (
            <div className="flex flex-col items-center text-primary">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p className="font-medium">Device scanned! Linking account...</p>
            </div>
          )}

          {status === 'linked' && (
            <div className="flex flex-col items-center text-green-600">
              <CheckCircle2 className="w-12 h-12 mb-4" />
              <p className="font-bold text-lg">Device Linked Successfully!</p>
              <p className="text-sm text-muted-foreground mt-2">You can now use your phone.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
