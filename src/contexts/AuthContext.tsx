import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { auth, db } from '../lib/firebase';
import type { UserProfile } from '../types';
import { createProfile } from '../services/userService';

interface AuthContextValue {
  authUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (params: {
    email: string;
    password: string;
    username: string;
    displayName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setAuthUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!authUser) return;
    setLoading(true);
    return onSnapshot(doc(db, 'users', authUser.uid), (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      setLoading(false);
    });
  }, [authUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authUser,
      profile,
      loading,
      login: async (email, password) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      loginWithGoogle: async () => {
        await signInWithPopup(auth, googleProvider);
      },
      register: async ({ email, password, username, displayName }) => {
        const credentials = await createUserWithEmailAndPassword(auth, email, password);
        await createProfile({ authUser: credentials.user, username, displayName });
      },
      logout: () => signOut(auth),
    }),
    [authUser, loading, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
