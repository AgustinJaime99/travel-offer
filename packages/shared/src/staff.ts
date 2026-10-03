import { z } from 'zod';
import { paginatedSchema } from './pagination.js';

export const STAFF_SESSION_COOKIE = 'tr_staff';

export const staffRoles = ['ADMIN', 'COMMERCIAL', 'VIEWER'] as const;
export const staffRoleSchema = z.enum(staffRoles);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const staffRoleLabels: Record<StaffRole, string> = {
  ADMIN: 'Administrador',
  COMMERCIAL: 'Comercial',
  VIEWER: 'Solo lectura',
};

/** NIST SP 800-63B style: length limits only, no composition rules. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const staffEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: 'Ingresá un email válido.' })
      .max(254, { error: 'El email es demasiado largo.' }),
  );

export const staffFullNameSchema = z
  .string()
  .trim()
  .min(2, { error: 'Ingresá el nombre completo.' })
  .max(120, { error: 'El nombre es demasiado largo.' });

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    error: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `La contraseña puede tener hasta ${PASSWORD_MAX_LENGTH} caracteres.`,
  });

const passwordInputSchema = z
  .string()
  .min(1, { error: 'Ingresá la contraseña.' })
  .max(PASSWORD_MAX_LENGTH, { error: 'La contraseña es demasiado larga.' });

export const loginRequestSchema = z.object({
  email: staffEmailSchema,
  password: passwordInputSchema,
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const changePasswordRequestSchema = z
  .object({
    currentPassword: passwordInputSchema,
    newPassword: newPasswordSchema,
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ['newPassword'],
    error: 'La nueva contraseña debe ser distinta de la actual.',
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const staffUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  fullName: z.string(),
  role: staffRoleSchema,
  active: z.boolean(),
  mustChangePassword: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type StaffUser = z.infer<typeof staffUserSchema>;

export const staffUserListSchema = paginatedSchema(staffUserSchema);

export const createStaffUserRequestSchema = z.object({
  email: staffEmailSchema,
  fullName: staffFullNameSchema,
  role: staffRoleSchema,
});
export type CreateStaffUserRequest = z.infer<typeof createStaffUserRequestSchema>;

export const updateStaffUserRequestSchema = z
  .object({
    fullName: staffFullNameSchema.optional(),
    role: staffRoleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'No hay cambios para guardar.',
  });
export type UpdateStaffUserRequest = z.infer<typeof updateStaffUserRequestSchema>;

/** Returned once: the plaintext is never stored or shown again. */
export const temporaryPasswordResponseSchema = z.object({ temporaryPassword: z.string() });

export const createStaffUserResponseSchema = z.object({
  user: staffUserSchema,
  temporaryPassword: z.string(),
});
