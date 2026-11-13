import {
  Empleado,
  EmpleadoRol,
  ROLE_PERMISSIONS,
  RolePermissionConfig,
  User,
  UserRole,
} from '../types';

export const ALLOWED_EMPLEADO_ROLES: readonly EmpleadoRol[] = [
  'Admin',
  'Cajero',
  'Mesero',
  'Barman',
  'Contabilidad',
] as const;

export const ALLOWED_USER_ROLES: readonly UserRole[] = [
  'gerente',
  'cajero',
  'camarero',
  'barman',
  'contabilidad',
] as const;

const ROLE_TO_USER_MAP: Record<EmpleadoRol, UserRole> = {
  Admin: 'gerente',
  Cajero: 'cajero',
  Mesero: 'camarero',
  Barman: 'barman',
  Contabilidad: 'contabilidad',
};

const USER_TO_ROLE_MAP: Record<UserRole, EmpleadoRol> = {
  gerente: 'Admin',
  cajero: 'Cajero',
  camarero: 'Mesero',
  barman: 'Barman',
  contabilidad: 'Contabilidad',
};

const DEFAULT_COLOR_BY_ROLE: Record<EmpleadoRol, string> = {
  Admin: 'purple',
  Cajero: 'blue',
  Mesero: 'emerald',
  Barman: 'amber',
  Contabilidad: 'rose',
};

export function normalizeEmpleadoRol(raw: unknown): EmpleadoRol {
  const val = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  switch (val) {
    case 'admin':
    case 'administrador':
    case 'gerente':
    case 'owner':
      return 'Admin';
    case 'cajero':
    case 'caja':
    case 'cashier':
      return 'Cajero';
    case 'mesero':
    case 'camarero':
    case 'salon':
    case 'salón':
    case 'waiter':
      return 'Mesero';
    case 'barman':
    case 'barra':
    case 'bartender':
      return 'Barman';
    case 'contabilidad':
    case 'contador':
    case 'contable':
    case 'accounting':
      return 'Contabilidad';
    default:
      return 'Mesero';
  }
}

export function mapUserRoleToEmpleadoRol(role: UserRole | string): EmpleadoRol {
  if (typeof role === 'string' && role in USER_TO_ROLE_MAP) {
    return USER_TO_ROLE_MAP[role as UserRole];
  }
  return normalizeEmpleadoRol(role);
}

export function mapEmpleadoRolToUserRole(rol: EmpleadoRol | string): UserRole {
  const canonical = normalizeEmpleadoRol(rol);
  return ROLE_TO_USER_MAP[canonical];
}

export function getEmpleadoRoleConfig(rol: EmpleadoRol | string): RolePermissionConfig {
  const userRole = mapEmpleadoRolToUserRole(rol);
  return ROLE_PERMISSIONS[userRole];
}

export function getDefaultAvatarColorForRole(rol: EmpleadoRol): string {
  return DEFAULT_COLOR_BY_ROLE[rol] || 'purple';
}

export function normalizeEmployeeEmail(email?: string | null): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function normalizeEmpleadoRecord(
  raw: Record<string, unknown>,
  fallbackId?: string
): Empleado {
  const rol = normalizeEmpleadoRol(raw.rol ?? raw.role);
  const rawNombre = typeof raw.nombre === 'string' ? raw.nombre : typeof raw.name === 'string' ? raw.name : '';
  const nombre = rawNombre.trim() || 'Empleado';
  const email = normalizeEmployeeEmail(typeof raw.email === 'string' ? raw.email : '');
  const pin = typeof raw.pin === 'string' ? raw.pin.trim() : '';
  const avatarColor =
    typeof raw.avatarColor === 'string' && raw.avatarColor.trim()
      ? raw.avatarColor.trim()
      : getDefaultAvatarColorForRole(rol);
  const activo = raw.activo === false ? false : true;
  const createdAt = typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : undefined;
  const updatedAt = typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : undefined;
  const userId = typeof raw.userId === 'string' && raw.userId.trim() ? raw.userId.trim() : undefined;
  const authUid = typeof raw.authUid === 'string' && raw.authUid.trim() ? raw.authUid.trim() : undefined;

  return {
    id: String(raw.id || fallbackId || ''),
    nombre,
    rol,
    ...(email ? { email } : {}),
    activo,
    pin,
    avatarColor,
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(userId ? { userId } : {}),
    ...(authUid ? { authUid } : {}),
  };
}

export function sortEmpleados(list: Empleado[]): Empleado[] {
  const seen = new Set<string>();
  const unique: Empleado[] = [];

  for (const item of list) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }

  return unique.sort((a, b) => {
    const aActive = a.activo !== false ? 0 : 1;
    const bActive = b.activo !== false ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;

    const aAdmin = a.rol === 'Admin' ? 0 : 1;
    const bAdmin = b.rol === 'Admin' ? 0 : 1;
    if (aAdmin !== bAdmin) return aAdmin - bAdmin;

    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (!isNaN(aTime) && !isNaN(bTime) && aTime !== bTime) {
      return aTime - bTime;
    }

    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
  });
}

export function empleadoToTeamMember(
  emp: Empleado,
  ownerUser: Pick<User, 'plan' | 'businessName' | 'avatar'> | null
): User {
  const userRole = mapEmpleadoRolToUserRole(emp.rol);
  const seed = emp.email || emp.nombre || emp.id;
  return {
    id: emp.id,
    name: emp.nombre,
    email: emp.email || '',
    role: userRole,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`,
    plan: ownerUser?.plan || 'free',
    businessName: ownerUser?.businessName || 'Mi Restaurante',
    createdAt: emp.createdAt || new Date().toISOString(),
  };
}

export function validateEmployeeMutationAuthorization(
  empleadoActivo: Empleado | null
): { allowed: boolean; error?: string } {
  if (empleadoActivo && normalizeEmpleadoRol(empleadoActivo.rol) !== 'Admin') {
    return {
      allowed: false,
      error: 'Solo un perfil Administrador puede crear, editar o desactivar empleados y roles.',
    };
  }
  return { allowed: true };
}

export function validateEmpleadoData(
  input: {
    nombre: string;
    rol: EmpleadoRol;
    email?: string;
    pin?: string;
  },
  existingEmpleados: Empleado[],
  editingId?: string
): { valid: boolean; error?: string; normalizedEmail: string; normalizedPin: string } {
  const cleanName = input.nombre.trim();
  if (!cleanName) {
    return {
      valid: false,
      error: 'El nombre del empleado es obligatorio.',
      normalizedEmail: '',
      normalizedPin: '',
    };
  }

  const normalizedPin = (input.pin || '').trim();
  if (normalizedPin && !/^\d{4,6}$/.test(normalizedPin)) {
    return {
      valid: false,
      error: 'El PIN debe tener entre 4 y 6 dígitos numéricos (o déjalo vacío).',
      normalizedEmail: '',
      normalizedPin: '',
    };
  }

  const normalizedEmail = normalizeEmployeeEmail(input.email);
  if (normalizedEmail) {
    const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!basicEmailRegex.test(normalizedEmail)) {
      return {
        valid: false,
        error: 'El correo electrónico ingresado no tiene un formato válido.',
        normalizedEmail,
        normalizedPin,
      };
    }

    const emailCollision = existingEmpleados.find(
      (e) => e.id !== editingId && normalizeEmployeeEmail(e.email) === normalizedEmail
    );
    if (emailCollision) {
      return {
        valid: false,
        error: `Ya existe un empleado (${emailCollision.nombre}) con el correo ${normalizedEmail}.`,
        normalizedEmail,
        normalizedPin,
      };
    }
  }

  return {
    valid: true,
    normalizedEmail,
    normalizedPin,
  };
}

export function canDeactivateOrDeleteAdmin(
  targetEmp: Empleado,
  allEmpleados: Empleado[],
  options?: { nextRol?: EmpleadoRol; nextActivo?: boolean; isDeleting?: boolean }
): { allowed: boolean; error?: string } {
  const targetIsActiveAdmin =
    normalizeEmpleadoRol(targetEmp.rol) === 'Admin' && targetEmp.activo !== false;
  if (!targetIsActiveAdmin) {
    return { allowed: true };
  }

  const wouldLoseAdminStatus =
    Boolean(options?.isDeleting) ||
    options?.nextActivo === false ||
    (options?.nextRol !== undefined && normalizeEmpleadoRol(options.nextRol) !== 'Admin');

  if (!wouldLoseAdminStatus) {
    return { allowed: true };
  }

  const activeAdminCount = allEmpleados.filter(
    (e) => normalizeEmpleadoRol(e.rol) === 'Admin' && e.activo !== false
  ).length;

  if (activeAdminCount <= 1) {
    return {
      allowed: false,
      error: 'Debe existir al menos un perfil Administrador activo en el restaurante.',
    };
  }

  return { allowed: true };
}
