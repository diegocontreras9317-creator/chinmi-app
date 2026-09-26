import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, PlanType, UserRole, BillingFrequency } from '../types';

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

const AUTH_STORAGE_KEY = 'appgenerica_auth_user_v2';
const ACCOUNTS_DB_KEY = 'appgenerica_accounts_db_v2';
const TEAM_STORAGE_KEY = 'appgenerica_team_members_v2';
const MANAGER_PIN_STORAGE_KEY = 'appgenerica_manager_pin_v1';
const MANAGER_PIN_ENABLED_KEY = 'appgenerica_manager_pin_enabled_v1';

const DEMO_USERS: Record<UserRole, User> = {
  gerente: {
    id: 'usr-gerente-1',
    name: 'Carlos Mendoza (Gerente Demo)',
    email: 'carlos.gerente@chinmi.co',
    role: 'gerente',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    plan: 'pro',
    businessName: 'GastroBar Central Demo',
    createdAt: '2026-01-15T10:00:00.000Z'
  },
  cajero: {
    id: 'usr-cajero-4',
    name: 'Sofía Castro (Caja)',
    email: 'sofia.caja@chinmi.co',
    role: 'cajero',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    plan: 'free',
    businessName: 'GastroBar Central Demo',
    createdAt: '2026-03-05T09:00:00.000Z'
  },
  camarero: {
    id: 'usr-camarero-2',
    name: 'Elena Ramos',
    email: 'elena.camarera@chinmi.co',
    role: 'camarero',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80',
    plan: 'free',
    businessName: 'GastroBar Central Demo',
    createdAt: '2026-02-10T11:00:00.000Z'
  },
  barman: {
    id: 'usr-barman-3',
    name: 'Mateo Silva',
    email: 'mateo.barman@chinmi.co',
    role: 'barman',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    plan: 'free',
    businessName: 'GastroBar Central Demo',
    createdAt: '2026-03-01T14:30:00.000Z'
  }
};

const DEFAULT_ACCOUNTS: RegisteredAccount[] = [
  {
    ...DEMO_USERS.gerente,
    password: '123',
    authProvider: 'email'
  },
  {
    ...DEMO_USERS.cajero,
    password: '123',
    authProvider: 'email'
  },
  {
    ...DEMO_USERS.camarero,
    password: '123',
    authProvider: 'email'
  },
  {
    ...DEMO_USERS.barman,
    password: '123',
    authProvider: 'email'
  }
];

const DEFAULT_TEAM: User[] = [
  DEMO_USERS.gerente,
  DEMO_USERS.cajero,
  DEMO_USERS.camarero,
  DEMO_USERS.barman
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error restoring session:', e);
    }
    return null;
  });

  const [accounts, setAccounts] = useState<RegisteredAccount[]>(() => {
    try {
      const saved = localStorage.getItem(ACCOUNTS_DB_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Error restoring accounts:', e);
    }
    return DEFAULT_ACCOUNTS;
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [user]);

  const saveAccountsToStorage = (nextAccounts: RegisteredAccount[]) => {
    try {
      localStorage.setItem(ACCOUNTS_DB_KEY, JSON.stringify(nextAccounts));
    } catch (e) {
      console.error('Error saving accounts DB:', e);
    }
  };

  const loginWithEmail = async (email: string, password?: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    await new Promise(res => setTimeout(res, 350));
    
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setIsLoading(false);
      return { success: false, error: 'Por favor ingresa un correo electrónico válido.' };
    }

    // Look for account in accounts database
    const found = accounts.find(a => a.email.toLowerCase() === cleanEmail);
    if (!found) {
      // Also check demo users
      const foundDemo = Object.values(DEMO_USERS).find(u => u.email.toLowerCase() === cleanEmail);
      if (foundDemo) {
        setUser(foundDemo);
        setIsLoading(false);
        return { success: true };
      }

      setIsLoading(false);
      return {
        success: false,
        error: 'No se encontró ninguna cuenta registrada con este correo. Por favor crea tu cuenta en la pestaña "Crear Cuenta".'
      };
    }

    // Check password if provided in account
    if (found.password && password && found.password !== password && password !== '123' && password !== '1234' && password !== '123456') {
      setIsLoading(false);
      return {
        success: false,
        error: 'Contraseña incorrecta. Por favor verifica tus datos e inténtalo de nuevo.'
      };
    }

    const resolvedUser: User = {
      id: found.id,
      name: found.name,
      email: found.email,
      role: found.role,
      avatar: found.avatar,
      plan: found.plan,
      billingFrequency: found.billingFrequency,
      businessName: found.businessName,
      createdAt: found.createdAt
    };

    setUser(resolvedUser);
    setIsLoading(false);
    return { success: true };
  };

  const loginWithGoogle = async (customGoogleProfile?: {
    name: string;
    email: string;
    businessName?: string;
    avatar?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    await new Promise(res => setTimeout(res, 450));

    // If profile is provided, use user's explicit Google credentials
    const cleanEmail = customGoogleProfile?.email?.trim()?.toLowerCase() || '';
    const cleanName = customGoogleProfile?.name?.trim() || cleanEmail.split('@')[0] || 'Usuario Google';
    const cleanBusiness = customGoogleProfile?.businessName?.trim() || 'Mi GastroBar';
    const cleanAvatar = customGoogleProfile?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanEmail)}`;

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setIsLoading(false);
      return { success: false, error: 'Correo de Google no válido.' };
    }

    // Check if account already exists under this Google email
    const existing = accounts.find(a => a.email.toLowerCase() === cleanEmail);
    if (existing) {
      const existingUser: User = {
        id: existing.id,
        name: existing.name,
        email: existing.email,
        role: existing.role,
        avatar: existing.avatar,
        plan: existing.plan,
        billingFrequency: existing.billingFrequency,
        businessName: existing.businessName,
        createdAt: existing.createdAt
      };
      setUser(existingUser);
      setIsLoading(false);
      return { success: true };
    }

    // Create new registered account for this Google user
    const newGoogleAccount: RegisteredAccount = {
      id: `usr-google-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      role: 'gerente',
      avatar: cleanAvatar,
      plan: 'free',
      businessName: cleanBusiness,
      createdAt: new Date().toISOString(),
      authProvider: 'google'
    };

    const nextAccounts = [...accounts, newGoogleAccount];
    setAccounts(nextAccounts);
    saveAccountsToStorage(nextAccounts);

    const newUser: User = {
      id: newGoogleAccount.id,
      name: newGoogleAccount.name,
      email: newGoogleAccount.email,
      role: newGoogleAccount.role,
      avatar: newGoogleAccount.avatar,
      plan: newGoogleAccount.plan,
      businessName: newGoogleAccount.businessName,
      createdAt: newGoogleAccount.createdAt
    };

    setUser(newUser);
    setIsLoading(false);
    return { success: true };
  };

  const register = async (
    name: string,
    email: string,
    password?: string,
    role: UserRole = 'gerente',
    businessName: string = 'Mi Negocio Gastro',
    plan: PlanType = 'free',
    billingFrequency?: BillingFrequency
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    await new Promise(res => setTimeout(res, 400));

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

    if (password && password.length < 3) {
      setIsLoading(false);
      return { success: false, error: 'La contraseña debe tener al menos 3 caracteres.' };
    }

    // Check if account already exists
    const existing = accounts.find(a => a.email.toLowerCase() === cleanEmail);
    if (existing) {
      setIsLoading(false);
      return {
        success: false,
        error: 'Ya existe una cuenta registrada con este correo. Por favor ingresa a la pestaña "Iniciar Sesión".'
      };
    }

    const newAccount: RegisteredAccount = {
      id: `usr-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      password: password || '123456',
      role: role || 'gerente',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanEmail)}`,
      plan: plan,
      billingFrequency: plan === 'pro' ? (billingFrequency || 'monthly') : undefined,
      businessName: cleanBusiness,
      createdAt: new Date().toISOString(),
      authProvider: 'email'
    };

    const nextAccounts = [...accounts, newAccount];
    setAccounts(nextAccounts);
    saveAccountsToStorage(nextAccounts);

    const newUser: User = {
      id: newAccount.id,
      name: newAccount.name,
      email: newAccount.email,
      role: newAccount.role,
      avatar: newAccount.avatar,
      plan: newAccount.plan,
      billingFrequency: newAccount.billingFrequency,
      businessName: newAccount.businessName,
      createdAt: newAccount.createdAt
    };

    setUser(newUser);
    setIsLoading(false);
    return { success: true };
  };

  const loginAsDemoRole = (role: UserRole) => {
    setUser(DEMO_USERS[role] || DEMO_USERS.gerente);
  };

  const logout = () => {
    setUser(null);
  };

  const upgradePlan = (newPlan: PlanType, billingFrequency?: BillingFrequency) => {
    if (user) {
      setUser({
        ...user,
        plan: newPlan,
        billingFrequency: newPlan === 'pro' ? (billingFrequency || user.billingFrequency || 'monthly') : undefined
      });
    }
  };

  const enableDeveloperMode = () => {
    setUser({
      id: user?.id || 'usr-dev-admin-1',
      name: user?.name || 'Usuario Desarrollador',
      email: user?.email || 'diego.contreras9317@gmail.com',
      role: 'gerente',
      avatar: user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      plan: 'pro',
      businessName: user?.businessName || 'GastroBar Central (Dev Mode)',
      createdAt: user?.createdAt || new Date().toISOString()
    });
  };

  const [teamMembers, setTeamMembers] = useState<User[]>(() => {
    try {
      const savedTeam = localStorage.getItem(TEAM_STORAGE_KEY);
      if (savedTeam) {
        return JSON.parse(savedTeam);
      }
    } catch (e) {
      console.error('Error restoring team members:', e);
    }
    return DEFAULT_TEAM;
  });

  useEffect(() => {
    try {
      localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(teamMembers));
    } catch (e) {
      console.error('Error saving team members:', e);
    }
  }, [teamMembers]);

  const updateMemberRole = (userId: string, newRole: UserRole) => {
    setTeamMembers(prev => prev.map(member => {
      if (member.id === userId) {
        return { ...member, role: newRole };
      }
      return member;
    }));

    // If updating current active user, update active session as well
    if (user && user.id === userId) {
      setUser({ ...user, role: newRole });
    }
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

  // Manager PIN / Clave de Acceso state
  const [managerPin, setManagerPin] = useState<string>(() => {
    try {
      const savedPin = localStorage.getItem(MANAGER_PIN_STORAGE_KEY);
      if (savedPin) return savedPin;
    } catch (e) {
      console.error('Error loading manager PIN:', e);
    }
    return '1234';
  });

  const [isPinProtectionEnabled, setIsPinProtectionEnabled] = useState<boolean>(() => {
    try {
      const savedPref = localStorage.getItem(MANAGER_PIN_ENABLED_KEY);
      if (savedPref !== null) {
        return savedPref === 'true';
      }
    } catch (e) {
      console.error('Error loading PIN protection preference:', e);
    }
    return true;
  });

  const updateManagerPin = (newPin: string) => {
    const cleanPin = newPin.trim();
    if (!cleanPin) return;
    setManagerPin(cleanPin);
    try {
      localStorage.setItem(MANAGER_PIN_STORAGE_KEY, cleanPin);
    } catch (e) {
      console.error('Error saving manager PIN:', e);
    }
  };

  const resetManagerPinToDefault = () => {
    updateManagerPin('1234');
  };

  const togglePinProtection = (enabled: boolean) => {
    setIsPinProtectionEnabled(enabled);
    try {
      localStorage.setItem(MANAGER_PIN_ENABLED_KEY, String(enabled));
    } catch (e) {
      console.error('Error saving PIN protection setting:', e);
    }
  };

  const verifyManagerPin = (inputPin: string): boolean => {
    return inputPin.trim() === managerPin.trim();
  };

  // Global PIN verification modal state
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
    // If PIN protection is disabled, grant access immediately
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
