import { createContext, useContext, useEffect, useState } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const STORAGE_KEY = 'archie-auth-user';
const DEMO_USER: AuthUser = {
  id: 'ops-demo-user',
  email: 'ops-demo@example.com',
  name: 'Ops Demo',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthUser;
        if (parsed?.id) {
          setUser(parsed);
        }
      }
    } catch (error) {
      console.warn('Failed to restore auth user from storage', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signInWithGoogle = async () => {
    setUser(DEMO_USER);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO_USER));
  };

  const signOut = async () => {
    setUser(null);
    window.localStorage.removeItem(STORAGE_KEY);
  };

  const value: AuthContextType = {
    user,
    isLoading,
    signInWithGoogle,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
