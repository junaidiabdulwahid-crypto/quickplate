import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { User } from './user.entity';

const secret = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
  throw new Error('JWT_SECRET must be set to at least 32 characters in production');
}

@Global() // every feature module can use JwtAuthGuard without importing AuthModule
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({ secret: secret ?? 'dev-only-secret-change-me-0000000000', signOptions: { expiresIn: '1d' } }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
