import React from 'react';
import { useNavigate } from 'react-router';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { GraduationCap } from 'lucide-react';

export const Login = () => {
  const navigate = useNavigate();
  const [error, setError] = React.useState('');

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    }
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-8 pt-10">
          <div className="mx-auto w-20 h-20 bg-primary rounded-full flex items-center justify-center mb-6 shadow-lg">
            <GraduationCap className="w-10 h-10 text-primary-foreground" />
          </div>
          <CardTitle className="text-3xl font-bold text-primary mb-2">Miller Data Project</CardTitle>
          <CardDescription className="text-base">Sign in to access student IEP data</CardDescription>
        </CardHeader>
        <CardContent className="pb-10 px-8">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl mb-6 text-center">
              {error}
            </div>
          )}
          <Button 
            onClick={handleLogin} 
            className="w-full h-14 text-lg rounded-full shadow-md hover:shadow-lg transition-all"
          >
            Sign in with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
