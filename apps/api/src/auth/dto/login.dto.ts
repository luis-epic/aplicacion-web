import { Transform } from 'class-transformer'
import { IsEmail, IsString, Length } from 'class-validator'

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => (
    typeof value === 'string' ? value.trim().toLowerCase() : value
  ))
  @IsEmail()
  email!: string

  @IsString()
  @Length(12, 128)
  password!: string
}
