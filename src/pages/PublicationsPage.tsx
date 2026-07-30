import { useCallback, useEffect, useState } from 'react'
import { FieldSessionBanner, useFieldSession } from '../components/FieldSessionProvider'
import { Icon } from '../components/Icon'
import { enqueuePublicationAcknowledgement, loadCachedPublications } from '../services/enterpriseStorage'
import { fetchPublicationCover } from '../services/fieldApi'
import type { CachedPublication } from '../types/enterprise'

const corporateCoverPattern = /^\/media\/publications\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:avif|gif|jpe?g|png|webp)$/

function publicationDate(publication: CachedPublication): string {
  return new Date(publication.publishedAt ?? publication.createdAt).toLocaleDateString('es', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function PublicationsPage() {
  const session = useFieldSession()
  const [publications, setPublications] = useState<CachedPublication[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [failedCoverUrl, setFailedCoverUrl] = useState<string | null>(null)
  const [coverObjectUrl, setCoverObjectUrl] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!session.identity) return
    const items = await loadCachedPublications(session.identity.id)
    setPublications(items)
    setSelectedId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id ?? null)
  }, [session.identity])

  useEffect(() => {
    void reload()
  }, [reload, session.dataRevision])

  const acknowledge = async (publication: CachedPublication) => {
    if (!session.identity || publication.acknowledgedAt || publication.pendingAcknowledgement) return
    await enqueuePublicationAcknowledgement(session.identity.id, publication)
    await session.outboxChanged()
    await reload()
    session.setMessage(session.isOnline
      ? 'Confirmación guardada y preparada para sincronizar.'
      : 'Lectura confirmada sin conexión. Se enviará al recuperar la red.')
    if (session.isOnline) await session.synchronize(true)
  }

  const selected = publications.find((item) => item.id === selectedId) ?? null

  useEffect(() => {
    setFailedCoverUrl(null)
    setCoverObjectUrl(null)
    const coverPath = selected?.coverImageUrl
    if (!selected || !coverPath || !corporateCoverPattern.test(coverPath) || !session.isOnline) return

    let active = true
    let generatedUrl: string | null = null
    void fetchPublicationCover(selected.id)
      .then((blob) => {
        generatedUrl = URL.createObjectURL(blob)
        if (active) setCoverObjectUrl(generatedUrl)
        else URL.revokeObjectURL(generatedUrl)
      })
      .catch(() => { if (active) setFailedCoverUrl(coverPath) })
    return () => {
      active = false
      if (generatedUrl) URL.revokeObjectURL(generatedUrl)
    }
  }, [selected, session.isOnline])

  return (
    <section className="page publications-page">
      <header className="page-header split-header">
        <div><span className="eyebrow">Actualidad OPECONCA</span><h1>Boletín corporativo</h1><p>Noticias de obra, seguridad y gestión disponibles incluso cuando pierdes la conexión.</p></div>
        <div className="header-actions"><button className="secondary-button" disabled={session.isBusy} onClick={() => void session.synchronize(true)} type="button"><Icon name="routines" /> Sincronizar</button><button className="secondary-button" disabled={session.isBusy} onClick={() => void session.logoutSession()} type="button">Cerrar sesión</button></div>
      </header>
      <FieldSessionBanner />
      {session.message && <p className="notice-banner field-message">{session.message}</p>}

      {!publications.length ? (
        <div className="field-empty enterprise-empty"><Icon name="book" size={32} /><strong>No hay publicaciones disponibles</strong><p>Conéctate para descargar el boletín correspondiente a tu audiencia.</p></div>
      ) : (
        <div className="newspaper-layout">
          <div className="newspaper-list" aria-label="Ediciones disponibles">
            {publications.map((publication) => (
              <button className={publication.id === selectedId ? 'newspaper-teaser active' : 'newspaper-teaser'} key={publication.id} onClick={() => setSelectedId(publication.id)} type="button">
                <span className={`publication-priority ${publication.priority.toLowerCase()}`}>{publication.category}</span>
                <strong>{publication.title}</strong>
                <p>{publication.summary}</p>
                <small>{publicationDate(publication)} · {publication.authorName}</small>
              </button>
            ))}
          </div>
          {selected && (
            <article className="newspaper-article">
              {selected.coverImageUrl && corporateCoverPattern.test(selected.coverImageUrl) && coverObjectUrl && failedCoverUrl !== selected.coverImageUrl
                ? <img alt="" onError={() => setFailedCoverUrl(selected.coverImageUrl)} src={coverObjectUrl} />
                : selected.coverImageUrl && <div aria-label="Portada no disponible" className="publication-cover-fallback" role="img">OPECONCA</div>}
              <div className="newspaper-masthead"><span>{selected.type.replaceAll('_', ' ')}</span><span>{publicationDate(selected)}</span></div>
              <h2>{selected.title}</h2>
              <p className="newspaper-lead">{selected.summary}</p>
              <div className="newspaper-copy">{selected.content.split(/\n{2,}/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
              <footer>
                <div><strong>{selected.authorName}</strong><small>{selected.projectName ? `${selected.projectCode} · ${selected.projectName}` : 'Comunicado corporativo'}</small></div>
                {selected.acknowledgementError && <p className="inline-status error">{selected.acknowledgementError}</p>}
                <button className="primary-button" disabled={Boolean(selected.acknowledgedAt) || Boolean(selected.pendingAcknowledgement)} onClick={() => void acknowledge(selected)} type="button"><Icon name="check" /> {selected.pendingAcknowledgement ? 'Pendiente de envío' : selected.acknowledgedAt ? 'Lectura confirmada' : selected.acknowledgementError ? 'Reintentar confirmación' : 'Confirmar lectura'}</button>
              </footer>
            </article>
          )}
        </div>
      )}
    </section>
  )
}
