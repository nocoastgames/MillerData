import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true, authError: null });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthError(null);
      if (firebaseUser && firebaseUser.email) {
        try {
          let email = firebaseUser.email.toLowerCase();
          
          // Check for alias
          const aliasDocRef = doc(db, 'userAliases', email);
          const aliasDoc = await getDoc(aliasDocRef);
          if (aliasDoc.exists()) {
            email = aliasDoc.data().targetEmail;
          }

          const userDocRef = doc(db, 'users', email);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            setProfile({ id: userDoc.id, ...userDoc.data() } as UserProfile);
            setUser(firebaseUser);
          } else {
            // If it's the specific admin email, create them
            if (email === 'mrenegar@gmail.com' || email === 'renegml@nv.ccsd.net') {
              const newProfile: Omit<UserProfile, 'id'> = {
                name: firebaseUser.displayName || 'Admin User',
                email: email,
                role: 'admin',
                roomNumber: 'Unassigned',
                status: 'active'
              };
              await setDoc(userDocRef, newProfile);
              setProfile({ id: email, ...newProfile } as UserProfile);
              setUser(firebaseUser);
            } else {
              // User not found in allowed list
              await auth.signOut();
              setUser(null);
              setProfile(null);
              setAuthError('Access Denied: Your email address has not been authorized by an administrator.');
            }
          }
        } catch (error: any) {
          console.error("Auth Error:", error);
          setUser(null);
          setProfile(null);
          setAuthError(error.message || 'Authentication failed');
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, authError }}>
      {children}
    </AuthContext.Provider>
  );
};
