import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, PlanType, UserRole, BillingFrequency } from '../types';
import {
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';

export interface RegisteredAccount {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  avatar: string;
  plan: PlanType;
  billingFrequency?: BillingFrequency;
  businessName: string;
  createdAt: string;
  authProvider: 'email' | 'google';
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  teamMembers: User[];
  isGerente: boolean;
  canManageInventory: boolean;
  canManageBusiness: boolean;
  canViewSalesReports: boolean;
  canManageTableLayout: boolean;
  managerPin: string;
  isPinProtectionEnabled: boolean;
  updateManagerPin: (newPin: string) => void;
  verifyManagerPin: (pin: string) => boolean;
  togglePinProtection: (enabled: boolean) => void;
  resetManagerPinToDefault: () => void;
  isPinModalOpen: boolean;
  pinModalConfig: { title?: string; description?: string; onSuccess: () => void } | null;
  promptManagerPin: (onSuccess: () => void, title?: string, description?: string) => void;
  closePinModal: () => void;
  loginWithEmail: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: (customGoogleProfile?: { name: string; email: string; businessName?: string; avatar?: string }) => Promise<{ success: boolean; error?: string }>;
  register: (
    name: string,
    email: string,
    password?: string,
    role?: UserRole,
    businessName?: string,
    plan?: PlanType,
    billingFrequency?: BillingFrequency
  ) => Promise<{ success: boolean; error?: string }>;
  loginAsDemoRole: (role: UserRole) => void;
  logout: () => void;
  upgradePlan: (newPlan: PlanType, billingFrequency?: BillingFrequency) => void;
  enableDeveloperMode: () => void;
  updateMemberRole: (userId: string, newRole: UserRole) => void;
  addTeamMember: (name: string, email: string, role: UserRole) => void;
  removeTeamMember: (userId: string) => void;
}

const MANAGER_PIN_STORAGE_KEY = 'appgenerica_manager_pin_v1';
const MANAGER_PIN_ENABLED_KEY = 'appgenerica_manager_pin_enabled_v1';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const uid = fbUser.uid;
        const cleanEmail = fbUser.email?.toLowerCase() || '';
        const cleanName = fbUser.displayName || cleanEmail.split('@')[0] || 'Restaurante';
        const cleanAvatar = fbUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanEmail || uid)}`;

        let resolvedUser: User;
        try {
          const userRef = doc(db, 'users', uid);
          const snap = await getDoc(userRef);

          if (snap.exists()) {
            const data = snap.data() as User;
            resolvedUser = {
              id: uid,
              name: data.name || cleanName,
              email: data.email || cleanEmail,
              role: data.role || 'gerente',
              avatar: data.avatar || cleanAvatar,
              plan: cleanEmail === 'diego.contreras9317@gmail.com' ? 'pro' : (data.plan || 'free'),
              billingFrequency: data.billingFrequency,
              businessName: data.businessName || 'Mi GastroBar',
              createdAt: data.createdAt || new Date().toISOString()
            };
          } else {
            resolvedUser = {
              id: uid,
              name: cleanName,
              email: cleanEmail,
              role: 'gerente',
              avatar: cleanAvatar,
              plan: cleanEmail === 'diego.contreras9317@gmail.com' ? 'pro' : 'free',
              businessName: 'Mi GastroBar',
              createdAt: new Date().toISOString()
            };
            await setDoc(userRef, resolvedUser, { merge: true });
          }
        } catch (err) {
          resolvedUser = {
            id: uid,
            name: cleanName,
            email: cleanEmail,
            role: 'gerente',
            avatar: cleanAvatar,
            plan: 'free',
            businessName: 'Mi GastroBar',
            createdAt: new Date().toISOString()
          };
        }
        setUser(resolvedUser);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithEmail = async (email: string, password?: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setIsLoading(false);
      return { success: false, error: 'Por favor ingresa un correo electrónico válido.' };
    }

    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password || '123456');
      setIsLoading(false);
      return { success: true };
    } catch (err: any) {
      setIsLoading(false);
      const errCode = err.code || '';
      let errMsg = 'Error al iniciar sesión con Firebase Auth.';
      if (errCode.includes('user-not-found') || errCode.includes('invalid-credential')) {
        errMsg = 'No se encontró la cuenta o la contraseña es incorrecta. Si es tu primera vez, regístrate.';
      } else if (errCode.includes('wrong-password')) {
        errMsg = 'Contraseña incorrecta. Por favor verifica tus datos.';
      }
      return { success: false, error: errMsg };
    }
  };

  const loginWithGoogle = async (_customGoogleProfile?: {
    name: string;
    email: string;
    businessName?: string;
    avatar?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);

    try {
      await signInWithPopup(auth, googleProvider);
      setIsLoading(false);
      return { success: true };
    } catch (err: any) {
      console.error('Error in Google Auth:', err);
      setIsLoading(false);
      const errMsg = err.message || 'Error al iniciar sesión con la cuenta de Google.';
      return { success: false, error: errMsg };
    }
  };

  const register = async (
    name: string,
    email: string,
    password?: string,
    role: UserRole = 'gerente',
    businessName: string = 'Mi Negocio Gastro',
    _plan: PlanType = 'free',
    _billingFrequency?: BillingFrequency
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanBusiness = businessName.trim() || 'Mi Negocio Gastro';

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setIsLoading(false);
      return { success: false, error: 'Por favor ingresa un correo electrónico válido.' };
    }

    if (!cleanName) {
      setIsLoading(false);
      return { success: false, error: 'Por favor ingresa tu nombre completo.' };
    }

    try {
      const res = await createUserWithEmailAndPassword(auth, cleanEmail, password || '123456');
      const uid = res.user.uid;
      const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanEmail)}`;

      const newUser: User = {
        id: uid,
        name: cleanName,
        email: cleanEmail,
        role: role || 'gerente',
        avatar,
        plan: cleanEmail === 'diego.contreras9317@gmail.com' ? 'pro' : 'free',
        businessName: cleanBusiness,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', uid), newUser, { merge: true });
      setUser(newUser);
      setIsLoading(false);
      return { success: true };
    } catch (err: any) {
      setIsLoading(false);
      const errCode = err.code || '';
      let errMsg = 'Error al registrar usuario en Firebase Auth.';
      if (errCode.includes('email-already-in-use')) {
        errMsg = 'Ya existe una cuenta con este correo. Por favor inicia sesión.';
      }
      return { success: false, error: errMsg };
    }
  };

  const loginAsDemoRole = (_role: UserRole) => {};

  const logout = () => {
    try {
      signOut(auth).catch(() => {});
    } catch (e) {}
    setUser(null);
  };

  const upgradePlan = (newPlan: PlanType, billingFrequency?: BillingFrequency) => {
    if (user) {
      const updated = {
        ...user,
        plan: newPlan,
        billingFrequency: newPlan === 'pro' ? (billingFrequency || user.billingFrequency || 'monthly') : undefined
      };
      setUser(updated);
      setDoc(doc(db, 'users', user.id), updated, { merge: true }).catch(() => {});
    }
  };

  const enableDeveloperMode = () => {
    if (user) {
      const updated = { ...user, plan: 'pro' as PlanType };
      setUser(updated);
      setDoc(doc(db, 'users', user.id), updated, { merge: true }).catch(() => {});
    }
  };

  const updateMemberRole = (userId: string, newRole: UserRole) => {
    setTeamMembers(prev => prev.map(m => m.id === userId ? { ...m, role: newRole } : m));
  };

  const addTeamMember = (name: string, email: string, role: UserRole) => {
    const newMember: User = {
      id: `usr-team-${Date.now()}`,
      name: name.trim(),
      email: email.trim(),
      role: role,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
      plan: user?.plan || 'free',
      businessName: user?.businessName || 'Mi Restaurante',
      createdAt: new Date().toISOString()
    };
    setTeamMembers(prev => [...prev, newMember]);
  };

  const removeTeamMember = (userId: string) => {
    setTeamMembers(prev => prev.filter(m => m.id !== userId));
  };

  // Manager PIN state
  const [managerPin, setManagerPin] = useState<string>(() => {
    try {
      const savedPin = localStorage.getItem(MANAGER_PIN_STORAGE_KEY);
      if (savedPin) return savedPin;
    } catch (e) {}
    return '1234';
  });

  const [isPinProtectionEnabled, setIsPinProtectionEnabled] = useState<boolean>(() => {
    try {
      const savedPref = localStorage.getItem(MANAGER_PIN_ENABLED_KEY);
      if (savedPref !== null) return savedPref === 'true';
    } catch (e) {}
    return true;
  });

  const updateManagerPin = (newPin: string) => {
    const cleanPin = newPin.trim();
    if (!cleanPin) return;
    setManagerPin(cleanPin);
    try {
      localStorage.setItem(MANAGER_PIN_STORAGE_KEY, cleanPin);
    } catch (e) {}
  };

  const resetManagerPinToDefault = () => {
    updateManagerPin('1234');
  };

  const togglePinProtection = (enabled: boolean) => {
    setIsPinProtectionEnabled(enabled);
    try {
      localStorage.setItem(MANAGER_PIN_ENABLED_KEY, String(enabled));
    } catch (e) {}
  };

  const verifyManagerPin = (inputPin: string): boolean => {
    return inputPin.trim() === managerPin.trim();
  };

  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinModalConfig, setPinModalConfig] = useState<{
    title?: string;
    description?: string;
    onSuccess: () => void;
  } | null>(null);

  const promptManagerPin = (
    onSuccess: () => void,
    title?: string,
    description?: string
  ) => {
    if (!isPinProtectionEnabled) {
      onSuccess();
      return;
    }

    setPinModalConfig({
      title,
      description,
      onSuccess,
    });
    setIsPinModalOpen(true);
  };

  const closePinModal = () => {
    setIsPinModalOpen(false);
    setPinModalConfig(null);
  };

  const isGerente = user?.role === 'gerente';
  const canManageInventory = isGerente;
  const canManageBusiness = isGerente;
  const canViewSalesReports = isGerente;
  const canManageTableLayout = isGerente;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        teamMembers,
        isGerente,
        canManageInventory,
        canManageBusiness,
        canViewSalesReports,
        canManageTableLayout,
        managerPin,
        isPinProtectionEnabled,
        updateManagerPin,
        verifyManagerPin,
        togglePinProtection,
        resetManagerPinToDefault,
        isPinModalOpen,
        pinModalConfig,
        promptManagerPin,
        closePinModal,
        loginWithEmail,
        loginWithGoogle,
        register,
        loginAsDemoRole,
        logout,
        upgradePlan,
        enableDeveloperMode,
        updateMemberRole,
        addTeamMember,
        removeTeamMember
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
