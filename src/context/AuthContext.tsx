import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, PlanType, UserRole, BillingFrequency, Empleado, EmpleadoRol } from '../types';
import {
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, Timestamp, deleteField } from 'firebase/firestore';
import { auth, db, googleProvider, facebookProvider } from '../firebase';
import {
  subscribeUserEmpleados,
  saveEmpleadoToFirestore,
  deleteEmpleadoFromFirestore
} from '../services/firestoreUserStorage';
import { isValidRealEmail } from '../utils/emailValidation';

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
  businessAddress?: string;
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
  isContabilidad: boolean;
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
  loginWithGoogle: (customGoogleProfile?: { name: string; email: string; businessName?: string; businessAddress?: string; avatar?: string }) => Promise<{ success: boolean; error?: string }>;
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
    billingFrequency?: BillingFrequency,
    businessAddress?: string
  ) => Promise<{ success: boolean; error?: string; message?: string }>;
  updateUserBusinessInfo: (businessName: string, businessAddress: string) => void;
  loginAsDemoRole: (role: UserRole) => void;
  logout: () => void;
  hasActivePaidSubscription: boolean;
  upgradePlan: (newPlan: PlanType, billingFrequency?: BillingFrequency, customDays?: number, isTestSubscription?: boolean) => void;
  enableDeveloperMode: () => void;
  updateMemberRole: (userId: string, newRole: UserRole) => void;
  addTeamMember: (name: string, email: string, role: UserRole) => void;
  removeTeamMember: (userId: string) => void;
  updateUserAvatar: (avatarDataUrl: string) => Promise<{ success: boolean; error?: string }>;
  removeUserAvatar: () => Promise<{ success: boolean; error?: string }>;
  isEmailVerified: boolean;
  reloadEmailVerification: () => Promise<boolean>;
}

const MANAGER_PIN_STORAGE_KEY = 'appgenerica_manager_pin_v1';
const MANAGER_PIN_ENABLED_KEY = 'appgenerica_manager_pin_enabled_v1';
const MASTER_ADMIN_EMAIL = 'diego.contreras9317@gmail.com';

function parseFirestoreExpiryIso(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof (raw as { toDate?: () => Date })?.toDate === 'function') {
    const d = (raw as { toDate: () => Date }).toDate();
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof (raw as { seconds?: number })?.seconds === 'number') {
    const d = new Date((raw as { seconds: number }).seconds * 1000);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function getBillingCycleDays(frequency?: BillingFrequency): number {
  if (frequency === 'annual') return 365;
  if (frequency === 'quarterly') return 90;
  return 30;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEmailVerified, setIsEmailVerified] = useState<boolean>(true);
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

  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    let unsubEmpleados: (() => void) | null = null;
    let unsubUserDoc: (() => void) | null = null;
    let didFinishInitialLoad = false;

    const finishLoadingSafely = () => {
      if (!didFinishInitialLoad) {
        didFinishInitialLoad = true;
        setIsLoading(false);
      }
    };

    // Tope de seguridad para que nunca se quede congelado en "Verificando credenciales..." en dominios personalizados
    const safetyBootTimer = setTimeout(finishLoadingSafely, 4000);

    const unsubscribe = onAuthStateChanged(
      auth,
      async (fbUser) => {
        if (unsubEmpleados) {
          unsubEmpleados();
          unsubEmpleados = null;
        }
        if (unsubUserDoc) {
          unsubUserDoc();
          unsubUserDoc = null;
        }

        if (fbUser) {
          const isVerified = Boolean(
            fbUser.emailVerified ||
            fbUser.providerData?.some(p => p.providerId === 'google.com' || p.providerId === 'facebook.com')
          );
          setIsEmailVerified(isVerified);

          const uid = fbUser.uid;
          const cleanEmail = fbUser.email?.toLowerCase() || '';
          const cleanName = fbUser.displayName || cleanEmail.split('@')[0] || 'Restaurante';
          const cleanAvatar =
            fbUser.photoURL ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanEmail || uid)}`;
          const isMasterOwner = cleanEmail === MASTER_ADMIN_EMAIL;

          const userRef = doc(db, 'users', uid);
          let initialUserName = cleanName;

          const fallbackUser: User = {
            id: uid,
            name: cleanName,
            email: cleanEmail,
            role: 'gerente',
            avatar: cleanAvatar,
            plan: isMasterOwner ? 'pro' : 'free',
            planExpiresAt: null,
            businessName: 'Mi GastroBar',
            createdAt: new Date().toISOString()
          };

          try {
            const snap = await Promise.race([
              getDoc(userRef),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
            ]);

            if (snap && snap.exists()) {
              const rawData = snap.data() as Record<string, unknown>;
              const data = rawData as unknown as User;
              initialUserName = data.name || cleanName;
              const parsedExpiry = parseFirestoreExpiryIso(rawData.plan_expira ?? rawData.planExpiresAt);
              const isExpired =
                !isMasterOwner && parsedExpiry !== null && new Date(parsedExpiry).getTime() <= Date.now();
              const storedPlan: PlanType = data.plan || (isMasterOwner ? 'pro' : 'free');
              const effectivePlan: PlanType = isExpired ? 'free' : storedPlan;

              const resolvedUser: User = {
                id: uid,
                name: data.name || cleanName,
                email: data.email || cleanEmail,
                role: data.role || 'gerente',
                avatar: data.avatar || cleanAvatar,
                plan: effectivePlan,
                isTestSubscription: Boolean(rawData.isTestSubscription ?? rawData.isTest),
                ...(effectivePlan === 'pro' && data.billingFrequency
                  ? { billingFrequency: data.billingFrequency }
                  : {}),
                planExpiresAt: effectivePlan === 'pro' ? parsedExpiry : null,
                businessName: data.businessName || 'Mi GastroBar',
                ...(data.businessAddress ? { businessAddress: data.businessAddress } : {}),
                createdAt: data.createdAt || new Date().toISOString()
              };

              setUser(resolvedUser);

              if (isExpired && storedPlan === 'pro') {
                setDoc(
                  userRef,
                  {
                    plan: 'free',
                    plan_expira: null,
                    planExpiresAt: null,
                    billingFrequency: deleteField()
                  },
                  { merge: true }
                ).catch(() => {});
              }
            } else if (snap && !snap.exists()) {
              setUser(fallbackUser);
              setDoc(userRef, fallbackUser, { merge: true }).catch(() => {});
            } else {
              // Si Firestore tardó más de 3s, mostramos de inmediato con perfil base y onSnapshot sincroniza enseguida
              setUser(fallbackUser);
            }
          } catch {
            setUser(fallbackUser);
          }

        // Suscripción en tiempo real al perfil de suscripción en users/${uid}
        unsubUserDoc = onSnapshot(
          userRef,
          (docSnap) => {
            if (!docSnap.exists()) return;
            const rawData = docSnap.data() as Record<string, unknown>;
            const data = rawData as unknown as User;
            const parsedExpiry = parseFirestoreExpiryIso(rawData.plan_expira ?? rawData.planExpiresAt);
            const isExpired = !isMasterOwner && parsedExpiry !== null && new Date(parsedExpiry).getTime() <= Date.now();
            const storedPlan: PlanType = data.plan || (isMasterOwner ? 'pro' : 'free');
            const effectivePlan: PlanType = isExpired ? 'free' : storedPlan;

            if (data.name && data.name.trim()) {
              initialUserName = data.name.trim();
            }

            setUser((prev) => ({
              id: uid,
              name: data.name || prev?.name || cleanName,
              email: data.email || prev?.email || cleanEmail,
              role: data.role || prev?.role || 'gerente',
              avatar: data.avatar || prev?.avatar || cleanAvatar,
              plan: effectivePlan,
              isTestSubscription: Boolean(rawData.isTestSubscription ?? rawData.isTest),
              ...(effectivePlan === 'pro' && data.billingFrequency ? { billingFrequency: data.billingFrequency } : {}),
              planExpiresAt: effectivePlan === 'pro' ? parsedExpiry : null,
              businessName: data.businessName || prev?.businessName || 'Mi GastroBar',
              ...(data.businessAddress ? { businessAddress: data.businessAddress } : {}),
              createdAt: data.createdAt || prev?.createdAt || new Date().toISOString()
            }));

            if (isExpired && storedPlan === 'pro') {
              setDoc(
                userRef,
                {
                  plan: 'free',
                  plan_expira: null,
                  planExpiresAt: null,
                  billingFrequency: deleteField()
                },
                { merge: true }
              ).catch(() => {});
            }
          },
          () => {}
        );

        // Suscripción en tiempo real a los empleados de users/${uid}/empleados
        unsubEmpleados = subscribeUserEmpleados(uid, async (empList) => {
          setEmpleados(empList);

          // Si no hay empleados aún, sembramos automáticamente el Administrador principal
          if (empList.length === 0) {
            const defaultAdmin: Empleado = {
              id: `emp-admin-${uid.slice(0, 6)}`,
              nombre: initialUserName || 'Administrador',
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
      }
      finishLoadingSafely();
      },
      () => {
        finishLoadingSafely();
      }
    );

    return () => {
      clearTimeout(safetyBootTimer);
      unsubscribe();
      if (unsubEmpleados) unsubEmpleados();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  // Vigilante automático de vencimiento de suscripción en tiempo real
  useEffect(() => {
    if (!user || user.plan !== 'pro' || !user.planExpiresAt) return;
    if (user.email?.toLowerCase() === MASTER_ADMIN_EMAIL) return;

    const expireMs = new Date(user.planExpiresAt).getTime();
    if (isNaN(expireMs)) return;

    const triggerDowngradeIfExpired = () => {
      const currentNow = Date.now();
      setNowTick(currentNow);
      if (expireMs <= currentNow) {
        setUser((prev) => {
          if (!prev || prev.plan !== 'pro') return prev;
          const downgraded: User = {
            ...prev,
            plan: 'free',
            billingFrequency: undefined,
            planExpiresAt: null
          };
          return downgraded;
        });
        setDoc(
          doc(db, 'users', user.id),
          {
            plan: 'free',
            plan_expira: null,
            planExpiresAt: null,
            billingFrequency: deleteField()
          },
          { merge: true }
        ).catch(() => {});
      }
    };

    if (expireMs <= Date.now()) {
      triggerDowngradeIfExpired();
      return;
    }

    const msUntilExpiry = expireMs - Date.now();
    let exactTimeout: ReturnType<typeof setTimeout> | null = null;
    if (msUntilExpiry <= 24 * 60 * 60 * 1000) {
      exactTimeout = setTimeout(triggerDowngradeIfExpired, msUntilExpiry + 50);
    }

    const interval = setInterval(triggerDowngradeIfExpired, 15000);

    return () => {
      if (exactTimeout) clearTimeout(exactTimeout);
      clearInterval(interval);
    };
  }, [user?.id, user?.email, user?.plan, user?.planExpiresAt]);

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

  const loginWithGoogle = async (customGoogleProfile?: {
    name: string;
    email: string;
    businessName?: string;
    businessAddress?: string;
    avatar?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user && (customGoogleProfile?.businessName || customGoogleProfile?.businessAddress)) {
        const updates: Record<string, string> = {};
        if (customGoogleProfile.businessName?.trim()) {
          updates.businessName = customGoogleProfile.businessName.trim();
        }
        if (customGoogleProfile.businessAddress?.trim()) {
          updates.businessAddress = customGoogleProfile.businessAddress.trim();
        }
        if (Object.keys(updates).length > 0) {
          await setDoc(doc(db, 'users', cred.user.uid), updates, { merge: true }).catch(() => {});
          setUser(prev => prev ? { ...prev, ...updates } : prev);
        }
      }
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

      if (errCode === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'tu dominio';
        return {
          success: false,
          error: `Para usar Google en ${host}, agrégalo en Firebase Console → Authentication → Settings → Dominios autorizados, o ingresa con correo y contraseña.`
        };
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

  const reloadEmailVerification = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    try {
      await auth.currentUser.reload();
      const verified = Boolean(
        auth.currentUser.emailVerified ||
        auth.currentUser.providerData?.some(p => p.providerId === 'google.com' || p.providerId === 'facebook.com')
      );
      setIsEmailVerified(verified);
      return verified;
    } catch {
      return false;
    }
  };

  const register = async (
    name: string,
    email: string,
    password?: string,
    role: UserRole = 'gerente',
    businessName: string = 'Mi Negocio Gastro',
    _plan: PlanType = 'free',
    _billingFrequency?: BillingFrequency,
    businessAddress?: string
  ): Promise<{ success: boolean; error?: string; message?: string }> => {
    setIsLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanBusiness = businessName.trim() || 'Mi Negocio Gastro';
    const cleanAddress = businessAddress?.trim() || '';

    const emailCheck = isValidRealEmail(cleanEmail);
    if (!emailCheck.valid) {
      setIsLoading(false);
      return { success: false, error: emailCheck.reason || 'Por favor ingresa un correo electrónico real y válido.' };
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
      await updateProfile(res.user, { displayName: cleanName }).catch(() => {});
      const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanEmail)}`;

      const newUser: User = {
        id: uid,
        name: cleanName,
        email: cleanEmail,
        role: role || 'gerente',
        avatar,
        plan: cleanEmail === 'diego.contreras9317@gmail.com' ? 'pro' : 'free',
        businessName: cleanBusiness,
        ...(cleanAddress ? { businessAddress: cleanAddress } : {}),
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', uid), newUser, { merge: true });
      await saveEmpleadoToFirestore(uid, {
        id: `emp-admin-${uid.slice(0, 6)}`,
        nombre: cleanName,
        rol: 'Admin',
        pin: '',
        avatarColor: 'purple',
        createdAt: new Date().toISOString()
      }).catch(() => {});

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

  const updateUserBusinessInfo = (businessName: string, businessAddress: string) => {
    const cleanName = businessName.trim();
    const cleanAddr = businessAddress.trim();
    setUser(prev => {
      if (!prev) return prev;
      const next: User = {
        ...prev,
        businessName: cleanName || prev.businessName,
        businessAddress: cleanAddr
      };
      setDoc(
        doc(db, 'users', prev.id),
        {
          businessName: next.businessName,
          businessAddress: cleanAddr
        },
        { merge: true }
      ).catch(() => {});
      return next;
    });
  };

  const loginAsDemoRole = (_role: UserRole) => {};

  const logout = () => {
    bloquearPantalla();
    try {
      signOut(auth).catch(() => {});
    } catch (e) {}
    setUser(null);
  };

  const upgradePlan = (
    newPlan: PlanType,
    billingFrequency?: BillingFrequency,
    customDays?: number,
    isTestSubscription: boolean = false
  ) => {
    if (!user) return;

    if (newPlan === 'pro') {
      const resolvedFrequency = billingFrequency || user.billingFrequency || 'monthly';
      const daysToAdd =
        typeof customDays === 'number' && customDays > 0
          ? customDays
          : getBillingCycleDays(resolvedFrequency);
      const expiryDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
      const expiryIso = expiryDate.toISOString();

      const updated: User = {
        ...user,
        plan: 'pro',
        isTestSubscription,
        ...(billingFrequency || user.billingFrequency ? { billingFrequency: resolvedFrequency } : {}),
        planExpiresAt: expiryIso
      };
      setUser(updated);

      const firestorePayload: Record<string, unknown> = {
        plan: 'pro',
        isTestSubscription,
        planMode: isTestSubscription ? 'test' : 'live',
        plan_expira: Timestamp.fromDate(expiryDate),
        planExpiresAt: expiryIso,
        updatedAt: new Date().toISOString()
      };
      if (billingFrequency || user.billingFrequency) {
        firestorePayload.billingFrequency = resolvedFrequency;
      }

      setDoc(doc(db, 'users', user.id), firestorePayload, { merge: true }).catch(() => {});
    } else {
      const { billingFrequency: _removedFreq, isTestSubscription: _removedTest, ...restUser } = user;
      const updated: User = {
        ...restUser,
        plan: 'free',
        isTestSubscription: false,
        planExpiresAt: null
      };
      setUser(updated);

      setDoc(
        doc(db, 'users', user.id),
        {
          plan: 'free',
          isTestSubscription: false,
          planMode: deleteField(),
          plan_expira: null,
          planExpiresAt: null,
          billingFrequency: deleteField()
        },
        { merge: true }
      ).catch(() => {});
    }
  };

  const enableDeveloperMode = () => {
    if (user) {
      const updated: User = {
        ...user,
        plan: 'pro',
        planExpiresAt: null
      };
      setUser(updated);
      setDoc(
        doc(db, 'users', user.id),
        {
          plan: 'pro',
          plan_expira: null,
          planExpiresAt: null
        },
        { merge: true }
      ).catch(() => {});
    }
  };

  const updateUserAvatar = async (avatarDataUrl: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'No hay usuario autenticado' };

    try {
      setUser(prev => prev ? { ...prev, avatar: avatarDataUrl } : prev);

      await setDoc(
        doc(db, 'users', user.id),
        {
          avatar: avatarDataUrl,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      return { success: true };
    } catch (err: any) {
      console.error('Error guardando avatar en Firestore:', err);
      return { success: false, error: err?.message || 'No se pudo guardar la imagen en tu cuenta.' };
    }
  };

  const removeUserAvatar = async (): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'No hay usuario autenticado' };

    try {
      setUser(prev => prev ? { ...prev, avatar: '' } : prev);

      await setDoc(
        doc(db, 'users', user.id),
        {
          avatar: '',
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      return { success: true };
    } catch (err: any) {
      console.error('Error eliminando avatar de Firestore:', err);
      return { success: false, error: err?.message || 'No se pudo eliminar la imagen.' };
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
  const isContabilidad = empleadoActivo ? empleadoActivo.rol === 'Contabilidad' : user?.role === 'contabilidad';
  const canManageInventory = isGerente;
  const canManageBusiness = isGerente;
  const canViewSalesReports = isGerente || isContabilidad;
  const canManageTableLayout = isGerente;

  const hasActivePaidSubscription = (() => {
    if (!user || user.plan !== 'pro') return false;
    if (user.email?.toLowerCase() === MASTER_ADMIN_EMAIL) return true;
    if (!user.planExpiresAt) return true;
    const expiryMs = new Date(user.planExpiresAt).getTime();
    if (isNaN(expiryMs)) return true;
    return expiryMs > Math.max(nowTick, Date.now());
  })();

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
        isContabilidad,
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
        updateUserBusinessInfo,
        loginAsDemoRole,
        logout,
        hasActivePaidSubscription,
        upgradePlan,
        enableDeveloperMode,
        updateMemberRole,
        addTeamMember,
        removeTeamMember,
        updateUserAvatar,
        removeUserAvatar,
        isEmailVerified,
        reloadEmailVerification
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
