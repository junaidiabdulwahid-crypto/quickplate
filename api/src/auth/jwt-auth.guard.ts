import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthedRequest, AuthUser, ROLES_KEY } from './current-user';
import type { Role } from './user.entity';

/** 401 when the token is missing or bad; 403 when the role is wrong. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Sign in first');

    let user: AuthUser;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; role: Role }>(token);
      user = { id: payload.sub, role: payload.role };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    request.user = user;

    // @Roles(…) on the method wins over @Roles(…) on the class
    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (allowed && !allowed.includes(user.role)) {
      throw new ForbiddenException(`Only ${allowed.join(' or ')} accounts can do this`);
    }
    return true;
  }
}
