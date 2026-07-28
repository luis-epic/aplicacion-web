import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { SessionUser } from '@opeconca/contracts'
import { PrismaService } from '../database/prisma.service'
import { PageQueryDto, type PageResult, pageArgs } from '../common/page-query.dto'
import { iso, throwPrismaConflict } from '../common/prisma-errors'
import { CreateClientDto, CreateContactDto, UpdateClientDto, UpdateContactDto } from './clients.dto'

export interface ContactView {
  id: string
  clientId: string
  name: string
  email: string | null
  phone: string | null
  position: string | null
  isPrimary: boolean
}

export interface ClientView {
  id: string
  name: string
  taxId: string | null
  isActive: boolean
  contacts?: ContactView[]
  contactCount?: number
  createdAt: string
  updatedAt: string
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PageQueryDto): Promise<PageResult<ClientView>> {
    const search = query.search?.trim()
    const where: Prisma.ClientWhereInput = search
      ? { OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { taxId: { contains: search, mode: 'insensitive' } },
        ] }
      : {}
    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({ ...pageArgs(query), where, orderBy: { name: 'asc' }, include: { _count: { select: { contacts: true } } } }),
      this.prisma.client.count({ where }),
    ])
    return {
      items: items.map((client) => ({
        id: client.id, name: client.name, taxId: client.taxId, isActive: client.isActive,
        contactCount: client._count.contacts,
        createdAt: iso(client.createdAt)!, updatedAt: iso(client.updatedAt)!,
      })),
      page: query.page, pageSize: query.pageSize, total,
    }
  }

  async get(id: string): Promise<ClientView> {
    const client = await this.prisma.client.findUnique({ where: { id } })
    if (!client) throw new NotFoundException('Cliente no encontrado.')
    return {
      id: client.id, name: client.name, taxId: client.taxId, isActive: client.isActive,
      createdAt: iso(client.createdAt)!, updatedAt: iso(client.updatedAt)!,
    }
  }

  async create(dto: CreateClientDto, actor: SessionUser): Promise<ClientView> {
    try {
      const client = await this.prisma.$transaction(async (tx) => {
        const created = await tx.client.create({ data: {
          name: dto.name.trim(), taxId: dto.taxId?.trim(), isActive: dto.isActive,
        } })
        await tx.auditLog.create({ data: { action: 'client.created', actorId: actor.id, entityId: created.id, entityType: 'Client' } })
        return created
      })
      return { ...client, createdAt: iso(client.createdAt)!, updatedAt: iso(client.updatedAt)! }
    } catch (error) {
      throwPrismaConflict(error, 'Ya existe un cliente con ese identificador fiscal.')
    }
  }

  async update(id: string, dto: UpdateClientDto, actor: SessionUser): Promise<ClientView> {
    try {
      const client = await this.prisma.$transaction(async (tx) => {
        await this.assertClient(tx, id)
        const updated = await tx.client.update({ where: { id }, data: {
          name: dto.name?.trim(), taxId: dto.taxId === null ? null : dto.taxId?.trim(), isActive: dto.isActive,
        } })
        await tx.auditLog.create({ data: { action: 'client.updated', actorId: actor.id, entityId: id, entityType: 'Client', metadata: { fields: Object.keys(dto) } } })
        return updated
      })
      return { ...client, createdAt: iso(client.createdAt)!, updatedAt: iso(client.updatedAt)! }
    } catch (error) {
      if (error instanceof NotFoundException) throw error
      throwPrismaConflict(error, 'Ya existe un cliente con ese identificador fiscal.')
    }
  }

  async remove(id: string, actor: SessionUser): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.assertClient(tx, id)
        await tx.client.delete({ where: { id } })
        await tx.auditLog.create({ data: { action: 'client.deleted', actorId: actor.id, entityId: id, entityType: 'Client' } })
      })
    } catch (error) {
      if (error instanceof NotFoundException) throw error
      throwPrismaConflict(error, 'El cliente tiene proyectos asociados y no puede eliminarse.')
    }
  }

  async listContacts(clientId: string, query: PageQueryDto): Promise<PageResult<ContactView>> {
    await this.assertClient(this.prisma, clientId)
    const search = query.search?.trim()
    const where: Prisma.ContactWhereInput = {
      clientId,
      OR: search ? [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } },
      ] : undefined,
    }
    const [contacts, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({ ...pageArgs(query), where, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] }),
      this.prisma.contact.count({ where }),
    ])
    return { items: contacts.map((contact) => this.toContact(contact)), page: query.page, pageSize: query.pageSize, total }
  }

  async getContact(clientId: string, contactId: string): Promise<ContactView> {
    const contact = await this.prisma.contact.findFirst({ where: { id: contactId, clientId } })
    if (!contact) throw new NotFoundException('Contacto no encontrado para este cliente.')
    return this.toContact(contact)
  }

  async createContact(clientId: string, dto: CreateContactDto, actor: SessionUser): Promise<ContactView> {
    const contact = await this.prisma.$transaction(async (tx) => {
      await this.assertClient(tx, clientId)
      if (dto.isPrimary) await tx.contact.updateMany({ where: { clientId, isPrimary: true }, data: { isPrimary: false } })
      const created = await tx.contact.create({ data: {
        clientId, name: dto.name.trim(), email: dto.email?.trim().toLowerCase(), phone: dto.phone?.trim(),
        position: dto.position?.trim(), isPrimary: dto.isPrimary,
      } })
      await tx.auditLog.create({ data: { action: 'contact.created', actorId: actor.id, entityId: created.id, entityType: 'Contact', metadata: { clientId } } })
      return created
    })
    return this.toContact(contact)
  }

  async updateContact(clientId: string, contactId: string, dto: UpdateContactDto, actor: SessionUser): Promise<ContactView> {
    const contact = await this.prisma.$transaction(async (tx) => {
      await this.assertContact(tx, clientId, contactId)
      if (dto.isPrimary) await tx.contact.updateMany({ where: { clientId, isPrimary: true, id: { not: contactId } }, data: { isPrimary: false } })
      const updated = await tx.contact.update({ where: { id: contactId }, data: {
        name: dto.name?.trim(), email: dto.email === null ? null : dto.email?.trim().toLowerCase(),
        phone: dto.phone === null ? null : dto.phone?.trim(), position: dto.position === null ? null : dto.position?.trim(),
        isPrimary: dto.isPrimary,
      } })
      await tx.auditLog.create({ data: { action: 'contact.updated', actorId: actor.id, entityId: contactId, entityType: 'Contact', metadata: { clientId, fields: Object.keys(dto) } } })
      return updated
    })
    return this.toContact(contact)
  }

  async removeContact(clientId: string, contactId: string, actor: SessionUser): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.assertContact(tx, clientId, contactId)
      await tx.contact.delete({ where: { id: contactId } })
      await tx.auditLog.create({ data: { action: 'contact.deleted', actorId: actor.id, entityId: contactId, entityType: 'Contact', metadata: { clientId } } })
    })
  }

  private async assertClient(tx: Prisma.TransactionClient | PrismaService, id: string): Promise<void> {
    const client = await tx.client.findUnique({ where: { id }, select: { id: true } })
    if (!client) throw new NotFoundException('Cliente no encontrado.')
  }

  private async assertContact(tx: Prisma.TransactionClient, clientId: string, contactId: string): Promise<void> {
    const contact = await tx.contact.findFirst({ where: { id: contactId, clientId }, select: { id: true } })
    if (!contact) throw new NotFoundException('Contacto no encontrado para este cliente.')
  }

  private toContact(contact: { id: string; clientId: string; name: string; email: string | null; phone: string | null; position: string | null; isPrimary: boolean }): ContactView {
    return { ...contact }
  }
}
