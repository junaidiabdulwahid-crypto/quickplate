import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from './user.entity';

/** Who is signed in. The guard writes it; @CurrentUser() reads it. */
export interface AuthUser {
  id: string;
  role: Role;
}
export type AuthedRequest = Request & { user: AuthUser };

/** @CurrentUser() in a controller parameter = the signed-in user. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});

/** @Roles('rider') on a route = only riders may call it. Read by JwtAuthGuard. */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
