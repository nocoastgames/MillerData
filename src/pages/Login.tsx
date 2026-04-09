import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { auth, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from '../firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { GraduationCap, Mail, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION } from '../version';

export const Login = () => {
  const navigate = useNavigate();
  const { authError, user, profile } = useAuth();
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  useEffect(() => {
    // Check if the page was loaded from a sign-in link
    const handleSignInLink = async () => {
      if (isSignInWithEmailLink(auth, window.location.href)) {
        let emailForSignIn = window.localStorage.getItem('emailForSignIn');
        
        if (!emailForSignIn) {
          // If email is missing (e.g. user opened link on different device), ask for it
          emailForSignIn = window.prompt('Please provide your email for confirmation');
        }

        if (emailForSignIn) {
          setLoading(true);
          try {
            await signInWithEmailLink(auth, emailForSignIn, window.location.href);
            window.localStorage.removeItem('emailForSignIn');
            // AuthContext will handle the profile loading and navigation
          } catch (err: any) {
            console.error('Error signing in with link:', err);
            setError(err.message || 'Failed to sign in with link');
          } finally {
            setLoading(false);
          }
        }
      }
    };

    handleSignInLink();
  }, [navigate]);

  useEffect(() => {
    if (authError) {
      setError(authError);
    }
  }, [authError]);

  useEffect(() => {
    if (user && profile) {
      navigate('/');
    }
  }, [user, profile, navigate]);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    const actionCodeSettings = {
      // The URL to redirect back to. The domain must be authorized in the Firebase Console.
      url: window.location.origin + window.location.pathname,
      handleCodeInApp: true,
    };

    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      setLinkSent(true);
    } catch (err: any) {
      console.error('Error sending link:', err);
      setError(err.message || 'Failed to send sign-in link');
    } finally {
      setLoading(false);
    }
  };

  if (linkSent) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-0">
          <CardHeader className="text-center pb-6 pt-10">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-primary mb-2">Check your email</CardTitle>
            <CardDescription className="text-base">
              We've sent a sign-in link to <span className="font-semibold text-foreground">{email}</span>.
              Click the link in the email to complete your sign-in.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-10 px-8 text-center">
            <p className="text-sm text-muted-foreground mb-6">
              You can close this window now.
            </p>
            <Button 
              variant="outline" 
              onClick={() => setLinkSent(false)}
              className="rounded-full"
            >
              Back to Sign In
            </Button>
            <div className="mt-6 text-[10px] text-muted-foreground/40 font-mono">
              v{APP_VERSION}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-6 pt-10">
          <div className="mx-auto w-20 h-20 bg-primary rounded-full flex items-center justify-center mb-6 shadow-lg">
            <GraduationCap className="w-10 h-10 text-primary-foreground" />
          </div>
          <CardTitle className="text-3xl font-bold text-primary mb-2">Miller Data Project</CardTitle>
          <CardDescription className="text-base">
            Enter your email to receive a secure sign-in link
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-10 px-8">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl mb-6 text-center">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSendLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="name@school.edu" 
                  className="pl-10 h-12"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 text-lg rounded-full shadow-md hover:shadow-lg transition-all mt-4"
              disabled={loading}
            >
              {loading ? 'Sending link...' : 'Send Sign-In Link'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="px-8 pb-8 flex-col gap-4 border-t pt-6">
          <p className="text-xs text-center text-muted-foreground">
            A secure link will be sent to your inbox. No password required.
          </p>
          <div className="text-[10px] text-muted-foreground/40 font-mono">
            v{APP_VERSION}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};
