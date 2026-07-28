import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { REFRESH_COOKIE_NAME } from './auth/auth.constants'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)
  const nodeEnvironment = config.getOrThrow<string>('NODE_ENV')
  const port = config.getOrThrow<number>('PORT')
  const trustProxyHops = config.getOrThrow<number>('TRUST_PROXY_HOPS')
  if (trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops)
  }

  app.setGlobalPrefix('api/v1')
  app.enableCors({
    credentials: true,
    origin: [
      config.getOrThrow<string>('APP_URL'),
      config.getOrThrow<string>('FIELD_APP_URL'),
    ],
  })
  app.use(nodeEnvironment === 'production' ? helmet() : helmet({ contentSecurityPolicy: false }))
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({
    forbidNonWhitelisted: true,
    transform: true,
    whitelist: true,
  }))
  app.enableShutdownHooks()

  if (nodeEnvironment !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('OPECONCA API')
      .setDescription('API del portal administrativo y la aplicación de campo.')
      .setVersion('0.3.0')
      .addBearerAuth()
      .addCookieAuth(REFRESH_COOKIE_NAME)
      .build()
    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup('docs', app, document)
  }

  await app.listen(port)
}

void bootstrap()
