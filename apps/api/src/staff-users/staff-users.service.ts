import { Injectable } from '@nestjs/common';
import type {
  CreateStaffUserRequest,
  Paginated,
  PaginationQuery,
  UpdateStaffUserRequest,
} from '@travel-rock/shared';
import { ApiException } from '../common/api-exception.js';
import { Prisma, type StaffUser as StaffUserRecord } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedStaff } from '../staff-auth/authenticated-staff.js';
import { generateTemporaryPassword, hashPassword } from '../staff-auth/password.js';
import { StaffSessionsService } from '../staff-auth/staff-sessions.service.js';

const notFound = () => new ApiException(404, 'NOT_FOUND', 'Usuario no encontrado.');

@Injectable()
export class StaffUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: StaffSessionsService,
  ) {}

  async list({ page, pageSize }: PaginationQuery): Promise<Paginated<StaffUserRecord>> {
    const [items, total] = await Promise.all([
      this.prisma.staffUser.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.staffUser.count(),
    ]);
    return { items, page, pageSize, total };
  }

  /** New users get a server-generated temporary password they must change at first login. */
  async create(
    input: CreateStaffUserRequest,
  ): Promise<{ user: StaffUserRecord; temporaryPassword: string }> {
    const temporaryPassword = generateTemporaryPassword();
    try {
      const user = await this.prisma.staffUser.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          role: input.role,
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
        },
      });
      return { user, temporaryPassword };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiException(409, 'EMAIL_TAKEN', 'Ya existe un usuario con ese email.');
      }
      throw error;
    }
  }

  async update(
    id: string,
    patch: UpdateStaffUserRequest,
    actor: AuthenticatedStaff,
  ): Promise<StaffUserRecord> {
    const changesOwnAccess =
      (patch.role !== undefined && patch.role !== actor.user.role) || patch.active === false;
    if (id === actor.user.id && changesOwnAccess) {
      throw new ApiException(
        409,
        'SELF_MODIFICATION',
        'No podés cambiar tu propio rol ni desactivar tu cuenta.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Lock every active ADMIN row first, in a fixed order, so two concurrent demotions
      // cannot both see "another admin remains" and leave the system without one.
      const activeAdmins = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "StaffUser" WHERE role = 'ADMIN' AND active = true ORDER BY id FOR UPDATE`;
      const target = await tx.staffUser.findUnique({ where: { id } });
      if (!target) throw notFound();

      const removesAdmin =
        target.role === 'ADMIN' &&
        target.active &&
        ((patch.role !== undefined && patch.role !== 'ADMIN') || patch.active === false);
      if (removesAdmin && activeAdmins.length <= 1) {
        throw new ApiException(
          409,
          'LAST_ADMIN',
          'Tiene que quedar al menos un administrador activo.',
        );
      }

      const data: Prisma.StaffUserUpdateInput = {};
      if (patch.fullName !== undefined) data.fullName = patch.fullName;
      if (patch.role !== undefined) data.role = patch.role;
      if (patch.active !== undefined) data.active = patch.active;
      const user = await tx.staffUser.update({ where: { id }, data });

      // Deactivation takes effect on the user's very next request.
      if (patch.active === false) await this.sessions.revokeAllForUser(id, { db: tx });
      return user;
    });
  }

  async resetTemporaryPassword(id: string, actor: AuthenticatedStaff): Promise<string> {
    if (id === actor.user.id) {
      throw new ApiException(
        409,
        'SELF_MODIFICATION',
        'Para tu propia cuenta usá "Cambiar contraseña".',
      );
    }
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.staffUser.updateMany({
        where: { id },
        data: { passwordHash, mustChangePassword: true },
      });
      if (count === 0) throw notFound();
      await this.sessions.revokeAllForUser(id, { db: tx });
    });
    return temporaryPassword;
  }

  /** Bootstrap for an empty database (CLI). Refuses once an active ADMIN exists. */
  async createInitialAdmin(input: {
    email: string;
    fullName: string;
  }): Promise<{ user: StaffUserRecord; temporaryPassword: string }> {
    const activeAdmins = await this.prisma.staffUser.count({
      where: { role: 'ADMIN', active: true },
    });
    if (activeAdmins > 0) {
      throw new ApiException(409, 'ADMIN_EXISTS', 'Ya existe un administrador activo.');
    }
    return this.create({ ...input, role: 'ADMIN' });
  }
}
