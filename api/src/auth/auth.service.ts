import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginDto } from './auth.dto';
import { User } from './user.entity';

/** Demo login: a real app checks the hash of an SMS OTP. This demo accepts 000000. */
const DEMO_CODE = '000000';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ access_token: string; user: { id: string; name: string; role: string } }> {
    if (dto.code !== DEMO_CODE) throw new UnauthorizedException('Wrong code');

    // insert-or-ignore: two first logins at the same moment still create one user
    await this.users
      .createQueryBuilder()
      .insert()
      .values({ phone: dto.phone, name: dto.name?.trim() ?? '', role: dto.role ?? 'customer' })
      .orIgnore()
      .execute();
    const user = await this.users.findOneByOrFail({ phone: dto.phone });

    // the role is in the token, so the guard never asks the database
    const access_token = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { access_token, user: { id: user.id, name: user.name, role: user.role } };
  }
}
