import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { User, PlanType, UserRole, BillingFrequency, Empleado } from '../types';
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
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider, facebookProvider } from '../firebase';
import {
  subscribeUserEmpleados,
  saveEmpleadoToFirestore,
  deleteEmpleadoFromFirestore
} from '../services/firestoreUserStorage';
import { isValidRealEmail } from '../utils/emailValidation';
import {
  canDeactivateOrDeleteAdmin,
  empleadoToTeamMember,
  getDefaultAvatarColorForRole,
  mapEmpleadoRolToUserRole,
  mapUserRoleToEmpleadoRol,
  normalizeEmpleadoRecord,
  normalizeEmpleadoRol,
  validateEmpleadoData,
  validateEmployeeMutationAuthorization
} from '../utils/employeeRoles';
import {
  BackendCapabilities,
  cancelSubscriptionOnBackend,
  fetchServerSubscriptionStatus,
  redeemPromoCodeOnBackend,
  saveOverLimitSelectionOnBackend
} from '../services/epaycoService';
import {
  deriveSubscriptionState,
  isMasterAdminEmail,
  MASTER_ADMIN_EMAIL,
  parseTimestampMs
} from '../utils/subscription';

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
  activeRole: UserRole;
  seleccionarEmpleado: (empleado: Empleado) => boolean;
  bloquearPantalla: () => void;
  crearEmpleado: (data: Omit<Empleado, 'id' | 'createdAt'>) => Promise<{ success: boolean; error?: string }>;
  actualizarEmpleado: (id: string, partial: Partial<Empleado>) => Promise<{ success: boolean; error?: string }>;
  toggleEmpleadoActivo: (id: string, activo: boolean) => Promise<{ success: boolean; error?: string }>;
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
  serverNowMs: number;
  backendCapabilities: BackendCapabilities;
  refreshSubscriptionStatus: () => Promise<void>;
  cancelSubscription: () => Promise<{ success: boolean; error?: string }>;
  redeemPromoCode: (code: string) => Promise<{ success: boolean; dias?: number; planExpiresAt?: string; error?: string }>;
  saveSubscriptionSelection: (selection: { activeTableIds: string[]; activeProductIds: string[] }) => Promise<{ success: boolean; error?: string }>;
  upgradePlan: (newPlan: PlanType, billingFrequency?: BillingFrequency, customDays?: number, isTestSubscription?: boolean) => void;
  enableDeveloperMode: () => void;
  updateMemberRole: (userId: string, newRole: UserRole) => Promise<{ success: boolean; error?: string }>;
  addTeamMember: (name: string, email: string, role: UserRole) => Promise<{ success: boolean; error?: string }>;
  removeTeamMember: (userId: string) => Promise<{ success: boolean; error?: string }>;
  updateUserAvatar: (avatarDataUrl: string) => Promise<{ success: boolean; error?: string }>;
  removeUserAvatar: () => Promise<{ success: boolean; error?: string }>;
  isEmailVerified: boolean;
  reloadEmailVerification: () => Promise<boolean>;
}

const MANAGER_PIN_STORAGE_KEY = 'appgenerica_manager_pin_v1';
const MANAGER_PIN_ENABLED_KEY = 'appgenerica_manager_pin_enabled_v1';

function mapFirestoreUserFields(
  uid: string,
  rawData: Record<string, unknown>,
  defaults: {
    name: string;
    email: string;
    avatar: string;
    businessName: string;
    createdAt: string;
  }
): User {
  const data = rawData as unknown as User;
  const email = data.email || defaults.email;
  const isMaster = isMasterAdminEmail(email);
  const parsedExpiryMs = parseTimestampMs(rawData.plan_expira ?? rawData.planExpiresAt);
  const parsedExpiry = parsedExpiryMs !== null ? new Date(parsedExpiryMs).toISOString() : null;
  const parsedGraceMs = parseTimestampMs(rawData.graceEndsAt);
  const parsedGrace = parsedGraceMs !== null ? new Date(parsedGraceMs).toISOString() : null;
  const storedPlan: PlanType = isMaster ? 'pro' : (data.plan || 'free');

  return {
    id: uid,
    name: data.name || defaults.name,
    email,
    role: data.role || 'gerente',
    avatar: data.avatar || defaults.avatar,
    plan: storedPlan,
    subscriptionStatus: data.subscriptionStatus,
    isTestSubscription: Boolean(rawData.isTestSubscription ?? rawData.isTest),
    ...(data.billingFrequency ? { billingFrequency: data.billingFrequency } : {}),
    planExpiresAt: parsedExpiry,
    graceEndsAt: parsedGrace,
    cancelAtPeriodEnd: Boolean(rawData.cancelAtPeriodEnd),
    cancelledAt: (rawData.cancelledAt as string) || null,
    subscriptionId: (rawData.subscriptionId as string) || null,
    lastPaymentRef: (rawData.lastPaymentRef as string) || null,
    planMode: data.planMode,
    subscriptionSelection: data.subscriptionSelection || null,
    lastQuotaReconciliationAt: (rawData.lastQuotaReconciliationAt as string) || null,
    businessName: data.businessName || defaults.businessName,
    ...(data.businessAddress ? { businessAddress: data.businessAddress } : {}),
    createdAt: data.createdAt || defaults.createdAt
  };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEmailVerified, setIsEmailVerified] = useState<boolean>(true);

  // Sub-usuarios / Perfiles de empleados (Fuente única sincronizada en Firestore: users/${uid}/empleados)
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const seededAdminForUidRef = useRef<string | null>(null);
  const inFlightCreateKeysRef = useRef<Set<string>>(new Set());

  const teamMembers = useMemo<User[]>(
    () => empleados.map(emp => empleadoToTeamMember(emp, user)),
    [empleados, user]
  );

  const [empleadoActivo, setEmpleadoActivo] = useState<Empleado | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = sessionStorage.getItem('chinmi_empleado_activo_v1');
      if (!saved) return null;
      const normalized = normalizeEmpleadoRecord(JSON.parse(saved));
      if (normalized.activo === false) {
        sessionStorage.removeItem('chinmi_empleado_activo_v1');
        return null;
      }
      return normalized;
    } catch {
      return null;
    }
  });

  const seleccionarEmpleado = (emp: Empleado): boolean => {
    const normalized = normalizeEmpleadoRecord(emp as unknown as Record<string, unknown>, emp.id);
    if (normalized.activo === false) {
      return false;
    }
    setEmpleadoActivo(normalized);
    try {
      sessionStorage.setItem('chinmi_empleado_activo_v1', JSON.stringify(normalized));
    } catch (err) {
      console.error('Error guardando empleado activo en sessionStorage:', err);
    }
    return true;
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
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState<number>(0);
  const [backendCapabilities, setBackendCapabilities] = useState<BackendCapabilities>({
    adminConfigured: true,
    epaycoSignatureConfigured: false,
    epaycoMode: 'test',
    degradationEnabled: true
  });

  const refreshSubscriptionStatus = async (): Promise<void> => {
    const statusRes = await fetchServerSubscriptionStatus();
    if (!statusRes) return;
    if (typeof statusRes.serverNowMs === 'number' && Number.isFinite(statusRes.serverNowMs)) {
      const localNow = Date.now();
      setServerClockOffsetMs(statusRes.serverNowMs - localNow);
      setNowTick(localNow);
    }
    if (statusRes.capabilities) {
      setBackendCapabilities(statusRes.capabilities);
    }
    if (statusRes.authenticated && statusRes.subscription) {
      const sub = statusRes.subscription;
      setUser((prev) => {
        if (!prev) return prev;
        if (statusRes.uid && prev.id !== statusRes.uid) return prev;
        return {
          ...prev,
          plan: sub.plan,
          subscriptionStatus: sub.status,
          planExpiresAt: sub.planExpiresAt,
          graceEndsAt: sub.graceEndsAt,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd
        };
      });
    }
  };

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
            subscriptionStatus: isMasterOwner ? 'pro_active' : 'free',
            planExpiresAt: null,
            graceEndsAt: null,
            cancelAtPeriodEnd: false,
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
              const resolvedUser = mapFirestoreUserFields(uid, rawData, {
                name: cleanName,
                email: cleanEmail,
                avatar: cleanAvatar,
                businessName: 'Mi GastroBar',
                createdAt: new Date().toISOString()
              });
              initialUserName = resolvedUser.name;
              setUser(resolvedUser);
            } else if (snap && !snap.exists()) {
              setUser(fallbackUser);
              setDoc(
                userRef,
                {
                  id: uid,
                  name: cleanName,
                  email: cleanEmail,
                  role: 'gerente',
                  avatar: cleanAvatar,
                  plan: isMasterOwner ? 'pro' : 'free',
                  subscriptionStatus: isMasterOwner ? 'pro_active' : 'free',
                  planExpiresAt: null,
                  graceEndsAt: null,
                  cancelAtPeriodEnd: false,
                  businessName: 'Mi GastroBar',
                  createdAt: fallbackUser.createdAt
                },
                { merge: true }
              ).catch(() => {});
            } else {
              setUser(fallbackUser);
            }
          } catch {
            setUser(fallbackUser);
          }

          // Reconciliación y sincronización de reloj con el backend autoritativo
          refreshSubscriptionStatus().catch(() => {});

        // Suscripción en tiempo real al perfil de suscripción en users/${uid}
        unsubUserDoc = onSnapshot(
          userRef,
          (docSnap) => {
            if (!docSnap.exists()) return;
            const rawData = docSnap.data() as Record<string, unknown>;
            const mapped = mapFirestoreUserFields(uid, rawData, {
              name: cleanName,
              email: cleanEmail,
              avatar: cleanAvatar,
              businessName: 'Mi GastroBar',
              createdAt: new Date().toISOString()
            });

            if (mapped.name && mapped.name.trim()) {
              initialUserName = mapped.name.trim();
            }

            setUser((prev) => ({
              ...mapped,
              name: (rawData.name as string) || prev?.name || cleanName,
              email: (rawData.email as string) || prev?.email || cleanEmail,
              avatar: (rawData.avatar as string) || prev?.avatar || cleanAvatar,
              businessName: (rawData.businessName as string) || prev?.businessName || 'Mi GastroBar',
              ...((rawData.businessAddress as string) || prev?.businessAddress
                ? { businessAddress: (rawData.businessAddress as string) || prev?.businessAddress }
                : {})
            }));
          },
          () => {}
        );

        // Suscripción en tiempo real a los empleados de users/${uid}/empleados
        unsubEmpleados = subscribeUserEmpleados(uid, async (empList) => {
          setEmpleados(empList);

          // Si no hay empleados aún, sembramos automáticamente el Administrador principal (una sola vez por sesión/UID)
          if (empList.length === 0 && seededAdminForUidRef.current !== uid) {
            seededAdminForUidRef.current = uid;
            const defaultAdmin: Empleado = {
              id: `emp-admin-${uid.slice(0, 6)}`,
              nombre: initialUserName || 'Administrador',
              rol: 'Admin',
              ...(cleanEmail ? { email: cleanEmail } : {}),
              activo: true,
              pin: '',
              avatarColor: 'purple',
              userId: uid,
              createdAt: new Date().toISOString()
            };
            try {
              await saveEmpleadoToFirestore(uid, defaultAdmin);
            } catch (e) {
              seededAdminForUidRef.current = null;
              console.error('Error inicializando empleado admin:', e);
            }
          }

          // Mantener sincronizado el empleado activo con los datos más recientes de Firestore
          // y bloquear inmediatamente si fue eliminado o desactivado en otro dispositivo
          setEmpleadoActivo(curr => {
            if (!curr) return null;
            const fresh = empList.find(e => e.id === curr.id);
            if (!fresh || fresh.activo === false) {
              try { sessionStorage.removeItem('chinmi_empleado_activo_v1'); } catch {}
              return null;
            }
            try { sessionStorage.setItem('chinmi_empleado_activo_v1', JSON.stringify(fresh)); } catch {}
            return fresh;
          });
        });

      } else {
        seededAdminForUidRef.current = null;
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

  // Vigilante autoritativo sincronizado con servidor (sin degradar desde reloj local)
  useEffect(() => {
    if (!user) return;
    if (isMasterAdminEmail(user.email)) return;

    const tick = () => {
      setNowTick(Date.now());
    };

    const syncInterval = setInterval(() => {
      tick();
      if (user.plan === 'pro') {
        refreshSubscriptionStatus().catch(() => {});
      }
    }, 60000);

    const expireMs = parseTimestampMs(user.planExpiresAt);
    const graceMs = parseTimestampMs(user.graceEndsAt);
    const currentServerNow = Date.now() + serverClockOffsetMs;
    const nextBoundary =
      expireMs && expireMs > currentServerNow
        ? expireMs - currentServerNow
        : graceMs && graceMs > currentServerNow
          ? graceMs - currentServerNow
          : null;

    let boundaryTimeout: ReturnType<typeof setTimeout> | null = null;
    if (nextBoundary !== null && nextBoundary <= 24 * 60 * 60 * 1000) {
      boundaryTimeout = setTimeout(() => {
        tick();
        refreshSubscriptionStatus().catch(() => {});
      }, Math.max(500, nextBoundary + 1500));
    }

    return () => {
      clearInterval(syncInterval);
      if (boundaryTimeout) clearTimeout(boundaryTimeout);
    };
  }, [user?.id, user?.email, user?.plan, user?.planExpiresAt, user?.graceEndsAt, serverClockOffsetMs]);

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
    _newPlan: PlanType,
    _billingFrequency?: BillingFrequency,
    _customDays?: number,
    _isTestSubscription: boolean = false
  ) => {
    // La activación y cambios de plan son exclusivamente autoritativos en backend; aquí refrescamos desde el servidor.
    refreshSubscriptionStatus().catch(() => {});
  };

  const enableDeveloperMode = () => {
    refreshSubscriptionStatus().catch(() => {});
  };

  const cancelSubscription = async (): Promise<{ success: boolean; error?: string }> => {
    const res = await cancelSubscriptionOnBackend();
    if (res.success) {
      setUser((prev) =>
        prev
          ? {
              ...prev,
              cancelAtPeriodEnd: true,
              cancelledAt: new Date(Date.now() + serverClockOffsetMs).toISOString()
            }
          : prev
      );
      await refreshSubscriptionStatus();
      return { success: true };
    }
    return { success: false, error: res.error || 'No se pudo cancelar la renovación.' };
  };

  const redeemPromoCode = async (
    code: string
  ): Promise<{ success: boolean; dias?: number; planExpiresAt?: string; error?: string }> => {
    const res = await redeemPromoCodeOnBackend(code);
    if (res.success) {
      await refreshSubscriptionStatus();
    }
    return res;
  };

  const saveSubscriptionSelection = async (selection: {
    activeTableIds: string[];
    activeProductIds: string[];
  }): Promise<{ success: boolean; error?: string }> => {
    const res = await saveOverLimitSelectionOnBackend(selection);
    if (res.success) {
      setUser((prev) =>
        prev
          ? {
              ...prev,
              subscriptionSelection: {
                ...selection,
                updatedAt: new Date(Date.now() + serverClockOffsetMs).toISOString()
              }
            }
          : prev
      );
      await refreshSubscriptionStatus();
    }
    return res;
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

  const updateMemberRole = async (userId: string, newRole: UserRole): Promise<{ success: boolean; error?: string }> => {
    const mappedRol = mapUserRoleToEmpleadoRol(newRole);
    return actualizarEmpleado(userId, { rol: mappedRol });
  };

  const addTeamMember = async (name: string, email: string, role: UserRole): Promise<{ success: boolean; error?: string }> => {
    const mappedRol = mapUserRoleToEmpleadoRol(role);
    return crearEmpleado({
      nombre: name.trim(),
      email: email.trim(),
      rol: mappedRol,
      activo: true,
      pin: '',
      avatarColor: getDefaultAvatarColorForRole(mappedRol)
    });
  };

  const removeTeamMember = async (userId: string): Promise<{ success: boolean; error?: string }> => {
    return eliminarEmpleado(userId);
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

    const authGuard = validateEmployeeMutationAuthorization(empleadoActivo);
    if (!authGuard.allowed) {
      return { success: false, error: authGuard.error };
    }

    const normalizedRol = normalizeEmpleadoRol(data.rol);
    const validation = validateEmpleadoData(
      {
        nombre: data.nombre || '',
        rol: normalizedRol,
        email: data.email,
        pin: data.pin
      },
      empleados
    );

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const dedupKey = `${user.id}|${data.nombre.trim().toLowerCase()}|${normalizedRol}|${validation.normalizedEmail}`;
    if (inFlightCreateKeysRef.current.has(dedupKey)) {
      return { success: false, error: 'Creación en curso, espera un momento.' };
    }
    inFlightCreateKeysRef.current.add(dedupKey);

    const nowIso = new Date().toISOString();
    const newEmp: Empleado = {
      id: `emp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      nombre: data.nombre.trim(),
      rol: normalizedRol,
      ...(validation.normalizedEmail ? { email: validation.normalizedEmail } : {}),
      activo: data.activo !== false,
      pin: validation.normalizedPin,
      avatarColor: data.avatarColor || getDefaultAvatarColorForRole(normalizedRol),
      createdAt: nowIso,
      updatedAt: nowIso,
      userId: user.id
    };

    try {
      await saveEmpleadoToFirestore(user.id, newEmp);
      return { success: true };
    } catch (err: any) {
      console.error('Error creating employee:', err);
      return { success: false, error: err?.message || 'Error al guardar empleado en Firestore' };
    } finally {
      inFlightCreateKeysRef.current.delete(dedupKey);
    }
  };

  const actualizarEmpleado = async (id: string, partial: Partial<Empleado>): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'No hay usuario autenticado' };

    const authGuard = validateEmployeeMutationAuthorization(empleadoActivo);
    if (!authGuard.allowed) {
      return { success: false, error: authGuard.error };
    }

    const existing = empleados.find(e => e.id === id);
    if (!existing) return { success: false, error: 'Empleado no encontrado' };

    const nextRol = partial.rol !== undefined ? normalizeEmpleadoRol(partial.rol) : existing.rol;
    const nextActivo = partial.activo !== undefined ? partial.activo !== false : existing.activo !== false;

    const adminGuard = canDeactivateOrDeleteAdmin(existing, empleados, {
      nextRol,
      nextActivo
    });
    if (!adminGuard.allowed) {
      return { success: false, error: adminGuard.error };
    }

    const validation = validateEmpleadoData(
      {
        nombre: partial.nombre !== undefined ? partial.nombre : existing.nombre,
        rol: nextRol,
        email: partial.email !== undefined ? partial.email : existing.email,
        pin: partial.pin !== undefined ? partial.pin : existing.pin
      },
      empleados,
      id
    );

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const updatedEmp: Empleado = {
      ...existing,
      ...partial,
      nombre: partial.nombre !== undefined ? partial.nombre.trim() : existing.nombre,
      rol: nextRol,
      email: validation.normalizedEmail,
      activo: nextActivo,
      pin: validation.normalizedPin,
      updatedAt: new Date().toISOString(),
      userId: user.id
    };

    try {
      await saveEmpleadoToFirestore(user.id, updatedEmp);
      if (empleadoActivo?.id === id && nextActivo === false) {
        bloquearPantalla();
      }
      return { success: true };
    } catch (err: any) {
      console.error('Error updating employee:', err);
      return { success: false, error: err?.message || 'Error al actualizar empleado en Firestore' };
    }
  };

  const toggleEmpleadoActivo = async (id: string, activo: boolean): Promise<{ success: boolean; error?: string }> => {
    return actualizarEmpleado(id, { activo });
  };

  const eliminarEmpleado = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'No hay usuario autenticado' };

    const authGuard = validateEmployeeMutationAuthorization(empleadoActivo);
    if (!authGuard.allowed) {
      return { success: false, error: authGuard.error };
    }

    const empToDelete = empleados.find(e => e.id === id);
    if (!empToDelete) return { success: false, error: 'Empleado no encontrado' };

    const adminGuard = canDeactivateOrDeleteAdmin(empToDelete, empleados, { isDeleting: true });
    if (!adminGuard.allowed) {
      return { success: false, error: adminGuard.error };
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
  // Si hay un perfil de empleado activo seleccionado, su rol normalizado gobierna permisos y vistas.
  // Si aún no se ha seleccionado perfil, usamos el rol global del dueño.
  const activeRole: UserRole = empleadoActivo
    ? mapEmpleadoRolToUserRole(empleadoActivo.rol)
    : (user?.role || 'gerente');
  const isGerente = activeRole === 'gerente';
  const isContabilidad = activeRole === 'contabilidad';
  const canManageInventory = isGerente;
  const canManageBusiness = isGerente;
  const canViewSalesReports = isGerente || isContabilidad;
  const canManageTableLayout = isGerente;

  const serverNowMs = nowTick + serverClockOffsetMs;

  const hasActivePaidSubscription = useMemo(() => {
    const derived = deriveSubscriptionState({
      user,
      serverNowMs,
      degradationEnabled: backendCapabilities.degradationEnabled
    });
    return derived.hasProAccess;
  }, [user, serverNowMs, backendCapabilities.degradationEnabled]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        teamMembers,
        empleadoActivo,
        empleados,
        activeRole,
        seleccionarEmpleado,
        bloquearPantalla,
        crearEmpleado,
        actualizarEmpleado,
        toggleEmpleadoActivo,
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
        serverNowMs,
        backendCapabilities,
        refreshSubscriptionStatus,
        cancelSubscription,
        redeemPromoCode,
        saveSubscriptionSelection,
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
