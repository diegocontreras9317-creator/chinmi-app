import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, PlanType, UserRole, BillingFrequency, Empleado, EmpleadoRol } from '../types';
import {
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider, facebookProvider } from '../firebase';
import {
  subscribeUserEmpleados,
  saveEmpleadoToFirestore,
  deleteEmpleadoFromFirestore
} from '../services/firestoreUserStorage';

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
  authProvider: 'email' | 'google' | 'facebook';
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  teamMembers: User[];
  empleadoActivo: Empleado | null;
  empleados: Empleado[];
  seleccionarEmpleado: (empleado: Empleado) => void;
  bloquearPantalla: () => void;
  crearEmpleado: (data: Omit<Empleado, 'id' | 'createdAt'>) => Promise<{ success: boolean; error?: string }>;
  actualizarEmpleado: (id: string, partial: Partial<Empleado>) => Promise<{ success: boolean; error?: string }>;
  eliminarEmpleado: (id: string) => Promise<{ success: boolean; error?: string }>;
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
  loginWithFacebook: () => Promise<{ success: boolean; error?: string }>;
  sendPasswordReset: (email: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  sendVerificationEmail: () => Promise<{ success: boolean; error?: string; message?: string }>;
  register: (
    name: string,
    email: string,
    password?: string,
    role?: UserRole,
    businessName?: string,
    plan?: PlanType,
    billingFrequency?: BillingFrequency
  ) => Promise<{ success: boolean; error?: string; message?: string }>;
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

  // Sub-usuarios / Perfiles de empleados (Netflix / POS)
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empleadoActivo, setEmpleadoActivo] = useState<Empleado | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = sessionStorage.getItem('chinmi_empleado_activo_v1');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const seleccionarEmpleado = (emp: Empleado) => {
    setEmpleadoActivo(emp);
    try {
      sessionStorage.setItem('chinmi_empleado_activo_v1', JSON.stringify(emp));
    } catch (err) {
      console.error('Error guardando empleado activo en sessionStorage:', err);
    }
  };

  const bloquearPantalla = () => {
    setEmpleadoActivo(null);
    try {
      sessionStorage.removeItem('chinmi_empleado_activo_v1');
    } catch (err) {
      console.error('Error al remover empleado activo de sessionStorage:', err);
    }
  };

  useEffect(() => {
    let unsubEmpleados: (() => void) | null = null;

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

        // Suscripción en tiempo real a los empleados de users/${uid}/empleados
        unsubEmpleados = subscribeUserEmpleados(uid, async (empList) => {
          setEmpleados(empList);

          // Si no hay empleados aún, sembramos automáticamente el Administrador principal
          if (empList.length === 0) {
            const defaultAdmin: Empleado = {
              id: `emp-admin-${uid.slice(0, 6)}`,
              nombre: resolvedUser.name || 'Administrador',
              rol: 'Admin',
              pin: '',
              avatarColor: 'purple',
              createdAt: new Date().toISOString()
            };
            try {
              await saveEmpleadoToFirestore(uid, defaultAdmin);
            } catch (e) {
              console.error('Error inicializando empleado admin:', e);
            }
          }

          // Mantener sincronizado el empleado activo con los datos más recientes de Firestore
          setEmpleadoActivo(curr => {
            if (!curr) return null;
            const fresh = empList.find(e => e.id === curr.id);
            if (!fresh) {
              // El empleado fue eliminado
              try { sessionStorage.removeItem('chinmi_empleado_activo_v1'); } catch {}
              return null;
            }
            try { sessionStorage.setItem('chinmi_empleado_activo_v1', JSON.stringify(fresh)); } catch {}
            return fresh;
          });
        });

      } else {
        setUser(null);
        setEmpleados([]);
        bloquearPantalla();
        if (unsubEmpleados) {
          unsubEmpleados();
          unsubEmpleados = null;
        }
      }
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
      if (unsubEmpleados) unsubEmpleados();
    };
  }, []);

  const loginWithEmail = async (email: string, password?: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setIsLoading(false);
      return { success: false, error: 'Por favor ingresa un correo electrónico válido.' };
    }

    if (!password) {
      setIsLoading(false);
      return { success: false, error: 'Por favor ingresa tu contraseña.' };
    }

    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      setIsLoading(false);
      return { success: true };
    } catch (err: any) {
      setIsLoading(false);
      const errCode = err?.code || '';
      let errMsg = 'Error al iniciar sesión.';
      if (errCode.includes('user-not-found') || errCode.includes('invalid-credential') || errCode.includes('wrong-password')) {
        errMsg = 'Correo o contraseña incorrectos. Si aún no tienes cuenta, regístrate.';
      } else if (errCode.includes('too-many-requests')) {
        errMsg = 'Demasiados intentos fallidos. Inténtalo más tarde o restablece tu contraseña.';
      } else if (errCode.includes('invalid-email')) {
        errMsg = 'El formato del correo electrónico no es válido.';
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
      setIsLoading(false);
      const errCode = err?.code || '';

      if (errCode === 'auth/popup-closed-by-user' || errCode === 'auth/cancelled-popup-request') {
        return { success: false, error: 'Has cerrado la ventana de inicio de sesión de Google.' };
      }

      if (errCode === 'auth/popup-blocked') {
        return { success: false, error: 'El navegador bloqueó la ventana emergente de Google. Por favor permite ventanas emergentes.' };
      }

      console.warn('Google Auth notice:', errCode || err);
      const errMsg = err?.message || 'Error al iniciar sesión con la cuenta de Google.';
      return { success: false, error: errMsg };
    }
  };

  const loginWithFacebook = async (): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);

    try {
      await signInWithPopup(auth, facebookProvider);
      setIsLoading(false);
      return { success: true };
    } catch (err: any) {
      setIsLoading(false);
      const errCode = err?.code || '';

      if (errCode === 'auth/popup-closed-by-user' || errCode === 'auth/cancelled-popup-request') {
        return { success: false, error: 'Has cerrado la ventana de inicio de sesión de Facebook.' };
      }

      if (errCode === 'auth/popup-blocked') {
        return { success: false, error: 'El navegador bloqueó la ventana emergente de Facebook. Permite ventanas emergentes.' };
      }

      if (errCode === 'auth/account-exists-with-different-credential') {
        return { success: false, error: 'Ya existe una cuenta vinculada a este correo con otro proveedor (Google o Contraseña). Inicia sesión con ese método.' };
      }

      console.warn('Facebook Auth notice:', errCode || err);
      return { success: false, error: 'Error al iniciar sesión con la cuenta de Facebook.' };
    }
  };

  const sendPasswordReset = async (email: string): Promise<{ success: boolean; error?: string; message?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Por favor ingresa un correo electrónico válido.' };
    }

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      return {
        success: true,
        message: 'Te hemos enviado un correo para restablecer tu contraseña. Revisa tu bandeja de entrada o spam.'
      };
    } catch (err: any) {
      const errCode = err?.code || '';
      let errMsg = 'No se pudo enviar el correo de recuperación.';
      if (errCode.includes('user-not-found') || errCode.includes('invalid-credential')) {
        errMsg = 'No encontramos ninguna cuenta registrada con este correo electrónico.';
      } else if (errCode.includes('invalid-email')) {
        errMsg = 'El formato del correo electrónico no es válido.';
      }
      return { success: false, error: errMsg };
    }
  };

  const sendVerificationEmail = async (): Promise<{ success: boolean; error?: string; message?: string }> => {
    if (!auth.currentUser) {
      return { success: false, error: 'No hay ninguna sesión activa para enviar la verificación.' };
    }

    try {
      await sendEmailVerification(auth.currentUser);
      return {
        success: true,
        message: 'Correo de verificación enviado. Revisa tu bandeja de entrada o spam.'
      };
    } catch (err: any) {
      return { success: false, error: 'No se pudo enviar el correo de verificación. Inténtalo más tarde.' };
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
  ): Promise<{ success: boolean; error?: string; message?: string }> => {
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

    if (!password || password.length < 6) {
      setIsLoading(false);
      return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    try {
      const res = await createUserWithEmailAndPassword(auth, cleanEmail, password);
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

      // Send Email Verification
      try {
        await sendEmailVerification(res.user);
      } catch (verifErr) {
        console.warn('Verification email error:', verifErr);
      }

      setUser(newUser);
      setIsLoading(false);
      return {
        success: true,
        message: '¡Registro exitoso! Te hemos enviado un correo de bienvenida y verificación. Revisa tu bandeja de entrada o spam para continuar.'
      };
    } catch (err: any) {
      setIsLoading(false);
      const errCode = err?.code || '';
      let errMsg = 'Error al registrar usuario en Firebase Auth.';
      if (errCode.includes('email-already-in-use')) {
        errMsg = 'Ya existe una cuenta con este correo. Por favor inicia sesión.';
      } else if (errCode.includes('weak-password')) {
        errMsg = 'La contraseña es muy débil. Debe tener al menos 6 caracteres.';
      } else if (errCode.includes('invalid-email')) {
        errMsg = 'El correo electrónico ingresado no es válido.';
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

  const crearEmpleado = async (data: Omit<Empleado, 'id' | 'createdAt'>): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'No hay usuario autenticado' };
    if (!data.nombre.trim()) return { success: false, error: 'El nombre es obligatorio' };

    const newEmp: Empleado = {
      id: `emp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      nombre: data.nombre.trim(),
      rol: data.rol,
      pin: data.pin?.trim() || '',
      avatarColor: data.avatarColor || 'purple',
      createdAt: new Date().toISOString()
    };

    try {
      await saveEmpleadoToFirestore(user.id, newEmp);
      return { success: true };
    } catch (err: any) {
      console.error('Error creating employee:', err);
      return { success: false, error: err?.message || 'Error al guardar empleado en Firestore' };
    }
  };

  const actualizarEmpleado = async (id: string, partial: Partial<Empleado>): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'No hay usuario autenticado' };
    const existing = empleados.find(e => e.id === id);
    if (!existing) return { success: false, error: 'Empleado no encontrado' };

    const updatedEmp: Empleado = {
      ...existing,
      ...partial,
      nombre: partial.nombre !== undefined ? partial.nombre.trim() : existing.nombre,
      pin: partial.pin !== undefined ? partial.pin.trim() : existing.pin
    };

    try {
      await saveEmpleadoToFirestore(user.id, updatedEmp);
      return { success: true };
    } catch (err: any) {
      console.error('Error updating employee:', err);
      return { success: false, error: err?.message || 'Error al actualizar empleado en Firestore' };
    }
  };

  const eliminarEmpleado = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'No hay usuario autenticado' };
    const empToDelete = empleados.find(e => e.id === id);
    if (!empToDelete) return { success: false, error: 'Empleado no encontrado' };

    const adminCount = empleados.filter(e => e.rol === 'Admin').length;
    if (empToDelete.rol === 'Admin' && adminCount <= 1) {
      return { success: false, error: 'No puedes eliminar el único perfil de Administrador.' };
    }

    try {
      await deleteEmpleadoFromFirestore(user.id, id);
      if (empleadoActivo?.id === id) {
        bloquearPantalla();
      }
      return { success: true };
    } catch (err: any) {
      console.error('Error deleting employee:', err);
      return { success: false, error: err?.message || 'Error al eliminar empleado en Firestore' };
    }
  };

  // Roles y permisos dinámicos según el perfil de empleado activo:
  // Si hay un perfil de empleado activo seleccionado, sus permisos mandan ("Admin", "Mesero", "Cajero", "Barman").
  // Si aún no se ha seleccionado perfil, usamos el rol global del dueño.
  const isGerente = empleadoActivo ? empleadoActivo.rol === 'Admin' : user?.role === 'gerente';
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
        empleadoActivo,
        empleados,
        seleccionarEmpleado,
        bloquearPantalla,
        crearEmpleado,
        actualizarEmpleado,
        eliminarEmpleado,
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
        loginWithFacebook,
        sendPasswordReset,
        sendVerificationEmail,
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
