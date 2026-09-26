import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, PlanType, UserRole, BillingFrequency } from '../types';

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
  loginWithEmail: (email: string, password?: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  register: (
    name: string,
    email: string,
    role: UserRole,
    businessName: string,
    plan?: PlanType,
    billingFrequency?: BillingFrequency
  ) => Promise<boolean>;
  loginAsDemoRole: (role: UserRole) => void;
  logout: () => void;
  upgradePlan: (newPlan: PlanType, billingFrequency?: BillingFrequency) => void;
  enableDeveloperMode: () => void;
  updateMemberRole: (userId: string, newRole: UserRole) => void;
  addTeamMember: (name: string, email: string, role: UserRole) => void;
  removeTeamMember: (userId: string) => void;
}

const AUTH_STORAGE_KEY = 'appgenerica_auth_user_v2';
const TEAM_STORAGE_KEY = 'appgenerica_team_members_v2';
const MANAGER_PIN_STORAGE_KEY = 'appgenerica_manager_pin_v1';
const MANAGER_PIN_ENABLED_KEY = 'appgenerica_manager_pin_enabled_v1';

const DEMO_USERS: Record<UserRole, User> = {
  gerente: {
    id: 'usr-gerente-1',
    name: 'Carlos Mendoza (Desarrollador / Admin)',
    email: 'diego.contreras9317@gmail.com',
    role: 'gerente',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    plan: 'pro',
    businessName: 'GastroBar Central',
    createdAt: '2026-01-15T10:00:00.000Z'
  },
  cajero: {
    id: 'usr-cajero-4',
    name: 'Sofía Castro (Caja)',
    email: 'sofia.caja@chinmi.co',
    role: 'cajero',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    plan: 'free',
    businessName: 'GastroBar Central',
    createdAt: '2026-03-05T09:00:00.000Z'
  },
  camarero: {
    id: 'usr-camarero-2',
    name: 'Elena Ramos',
    email: 'elena.camarera@chinmi.co',
    role: 'camarero',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80',
    plan: 'free',
    businessName: 'GastroBar Central',
    createdAt: '2026-02-10T11:00:00.000Z'
  },
  barman: {
    id: 'usr-barman-3',
    name: 'Mateo Silva',
    email: 'mateo.barman@chinmi.co',
    role: 'barman',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    plan: 'free',
    businessName: 'GastroBar Central',
    createdAt: '2026-03-01T14:30:00.000Z'
  }
};

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
    // Starts as null so the user lands on the Registration screen initially
    return null;
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [user]);

  const loginWithEmail = async (email: string, _password?: string): Promise<boolean> => {
    setIsLoading(true);
    await new Promise(res => setTimeout(res, 400));
    
    // Si el email coincide con algún demo, usamos ese
    const foundDemo = Object.values(DEMO_USERS).find(u => u.email.toLowerCase() === email.toLowerCase());
    const resolvedUser: User = foundDemo || {
      id: `usr-${Date.now()}`,
      name: email.split('@')[0] || 'Usuario Hostelería',
      email: email,
      role: 'gerente',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
      plan: 'free',
      businessName: 'Mi Restaurante',
      createdAt: new Date().toISOString()
    };

    setUser(resolvedUser);
    setIsLoading(false);
    return true;
  };

  const loginWithGoogle = async (): Promise<boolean> => {
    setIsLoading(true);
    await new Promise(res => setTimeout(res, 600));
    const googleUser: User = {
      id: 'usr-google-99',
      name: 'Diego Contreras',
      email: 'diego.contreras9317@gmail.com',
      role: 'gerente',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
      plan: 'free',
      businessName: 'Terraza GastroBar',
      createdAt: new Date().toISOString()
    };
    setUser(googleUser);
    setIsLoading(false);
    return true;
  };

  const register = async (
    name: string,
    email: string,
    role: UserRole,
    businessName: string,
    plan: PlanType = 'free',
    billingFrequency?: BillingFrequency
  ): Promise<boolean> => {
    setIsLoading(true);
    await new Promise(res => setTimeout(res, 450));
    const newUser: User = {
      id: `usr-${Date.now()}`,
      name: name || 'Nuevo Usuario',
      email: email,
      role: role || 'gerente',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
      plan: plan,
      billingFrequency: plan === 'pro' ? (billingFrequency || 'monthly') : undefined,
      businessName: businessName || 'Mi Negocio',
      createdAt: new Date().toISOString()
    };
    setUser(newUser);
    setIsLoading(false);
    return true;
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
