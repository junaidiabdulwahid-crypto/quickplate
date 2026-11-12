import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ROLES, type Role } from './user.entity';

export class LoginDto {
  @IsString()
  @Matches(/^\+91\d{10}$/, { message: 'phone must look like +91 followed by 10 digits' })
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;

  /** Used only the first time a phone number signs in. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  /** Used only the first time. A real app verifies restaurants and riders before giving these roles. */
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;
}
