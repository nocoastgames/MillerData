import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { auth, googleProvider, signInWithPopup, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from '../firebase';
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

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // AuthContext will handle navigation
    } catch (err: any) {
      console.error('Error signing in with Google:', err);
      if (err.code === 'auth/popup-blocked') {
        setError('Sign-in popup was blocked. Please allow popups for this site.');
      } else {
        setError(err.message || 'Failed to sign in with Google');
      }
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

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button 
            variant="outline" 
            onClick={handleGoogleSignIn}
            className="w-full h-12 text-lg rounded-full shadow-sm hover:bg-muted transition-all"
            disabled={loading}
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </Button>
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
