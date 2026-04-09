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
          // Force token refresh to ensure Firestore has the latest auth state
          // This prevents race conditions where Firestore thinks the user is unauthenticated
          await firebaseUser.getIdToken(true);
          
          let email = firebaseUser.email.toLowerCase();
          console.log("AuthContext: Checking alias for", email);
          
          // Check for alias
          console.log(`AuthContext: Attempting to read doc(db, 'userAliases', '${email}')`);
          const aliasDocRef = doc(db, 'userAliases', email);
          let aliasDoc;
          try {
            aliasDoc = await getDoc(aliasDocRef);
            console.log("AuthContext: Successfully read aliasDoc");
          } catch (e: any) {
            console.error(`AuthContext: Failed to get aliasDoc for ${email}:`, e);
            throw new Error(`Failed to read userAliases for ${email}: ` + e.message);
          }

          if (aliasDoc.exists()) {
            console.log("AuthContext: Found alias, target is", aliasDoc.data().targetEmail);
            email = aliasDoc.data().targetEmail;
          }

          console.log("AuthContext: Fetching user doc for", email);
          const userDocRef = doc(db, 'users', email);
          let userDoc;
          try {
            userDoc = await getDoc(userDocRef);
          } catch (e: any) {
            console.error("AuthContext: Failed to get userDoc:", e);
            throw new Error("Failed to read users: " + e.message);
          }
          
          if (userDoc.exists()) {
            console.log("AuthContext: User doc exists");
            setProfile({ id: userDoc.id, ...userDoc.data() } as UserProfile);
            setUser(firebaseUser);
          } else {
            console.log("AuthContext: User doc does not exist, checking if admin");
            // If it's the specific admin email, create them
            if (email === 'mrenegar@gmail.com' || email === 'renegml@nv.ccsd.net') {
              console.log("AuthContext: Creating admin user");
              const newProfile: Omit<UserProfile, 'id'> = {
                name: firebaseUser.displayName || 'Admin User',
                email: email,
                role: 'admin',
                roomNumber: 'Unassigned',
                status: 'active'
              };
              try {
                await setDoc(userDocRef, newProfile);
              } catch (e: any) {
                console.error("AuthContext: Failed to set userDoc:", e);
                throw new Error("Failed to create admin user: " + e.message);
              }
              console.log("AuthContext: Admin user created");
              setProfile({ id: email, ...newProfile } as UserProfile);
              setUser(firebaseUser);
            } else {
              console.log("AuthContext: User not authorized");
              // User not found in allowed list
              await auth.signOut();
              setUser(null);
              setProfile(null);
              setAuthError('Access Denied: Your email address has not been authorized by an administrator.');
            }
          }
        } catch (error: any) {
          console.error("Auth Error caught in try block:", error);
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
