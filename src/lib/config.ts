import { API_BASE } from './api'

// Configuración de un proyecto en ReportesSandbox: datos, tarifas del proyecto y responsables.
// Nada de esto escribe en Books (crear el proyecto en Books y sincronizar tareas quedan fuera).
export type TipoCobro = 'horas' | 'fijo' | 'iguala'
export const TIPO_COBRO_LABEL: Record<TipoCobro, string> = { horas: 'Por hora', fijo: 'Cuota fija', iguala: 'Iguala mensual' }
export const MONEDAS = ['MXN', 'USD', 'EUR'] as const
export type Rol = 'facturacion' | 'cobranza'
export const ROL_LABEL: Record<Rol, string> = { facturacion: 'Facturación', cobranza: 'Cobranza' }
// Qué puede ser cada abogado como responsable. "general" cubre facturación y cobranza.
export type TipoResponsable = Rol | 'general'
export const TIPO_RESPONSABLE_LABEL: Record<TipoResponsable, string> = { facturacion: 'Facturación', cobranza: 'Cobranza', general: 'General (ambos)' }
export interface Elegible { abogado_id: number; tipo: TipoResponsable }
export type RolAsignar = Rol | 'ambos'
export const ROL_ASIGNAR_LABEL: Record<RolAsignar, string> = { facturacion: 'Facturación', cobranza: 'Cobranza', ambos: 'Ambos' }
export const puedeRol = (tipo: TipoResponsable | null | undefined, rol: RolAsignar) =>
  tipo === 'general' || (rol !== 'ambos' && tipo === rol)

export interface ProyectoDetalle {
  id: number; nombre: string; cliente_id: string; cliente_nombre?: string; moneda: string; activo: number
  tipo_cobro: TipoCobro; honorario_fijo: number | null; zoho_tax_id: string | null; nombre_completo?: string
  zoho_project_name?: string | null; zoho_project_code?: string | null
}
export interface Tarifa {
  id: number; moneda: string; tarifa: number; proyecto_id: number | null; abogado_id: number | null; tipo_id: number | null
  abogado_nombre?: string | null; tipo_nombre?: string | null; nivel: string; nivel_etiqueta?: string
}
export interface Impuesto { zoho_id: string; nombre: string; porcentaje: number; tipo: string }
export interface Responsable {
  id: number; rol: Rol; nombre: string; proyecto_id: number | null; cliente_id?: string | null
  abogado_id?: number | null
  // false = al abogado le quitaron la marca o está inactivo (la asignación sigue contando)
  abogado_cubre_rol?: boolean | null
}
export interface ResolverTarifa {
  moneda: string; aplicada: { orden: number; nivel: string; etiqueta: string; tarifa: number; tarifa_id: number } | null
  cadena: Array<{ orden: number; nivel: string; etiqueta?: string; tarifa: number | null }>; aviso: string | null
}
export interface ResolverResponsables { facturacion: { texto: string; fuente: string | null }; cobranza: { texto: string; fuente: string | null } }

type Uncertain = Error & { uncertain?: boolean }
const fail = (message: string, uncertain: boolean) => Object.assign(new Error(message), { uncertain }) as Uncertain
const url = (org: string, path: string) => `${API_BASE}/${encodeURIComponent(org)}/${path}`

async function read<T>(org: string, path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url(org, path), { signal })
  const data = await response.json().catch(() => null)
  if (!response.ok || data === null) throw new Error(data?.error || `No se pudo cargar ${path.split('?')[0]}.`)
  return data as T
}

// Escritura con el mismo manejo que las capturas: red caída o respuesta sin id = resultado incierto.
async function write<T>(org: string, method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, expectId = true): Promise<T> {
  let response: Response
  try {
    response = await fetch(url(org, path), { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) })
  } catch {
    throw fail('Se perdió la respuesta. Recarga el proyecto para comprobar si el cambio se guardó.', true)
  }
  const data = await response.json().catch(() => null)
  if (!response.ok && !data && response.status >= 400 && response.status < 500) {
    throw fail(response.status === 404 ? 'La función de Catalyst no tiene esta ruta (HTTP 404). Despliega la versión actual de aptus_overview_services.' : `El servidor rechazó la petición (HTTP ${response.status}).`, false)
  }
  if (!response.ok) {
    const uncertain = data?.outcome_unknown === true || !data?.stage
    throw fail(`${data?.error || 'No se pudo confirmar el cambio.'}${uncertain ? ' Recarga el proyecto para comprobar si se guardó.' : ''}`, uncertain)
  }
  if (expectId && !Number.isInteger(data?.id)) throw fail('No se pudo confirmar el cambio. Recarga el proyecto para comprobar si se guardó.', true)
  return data as T
}

export const getProyecto = (org: string, id: string, signal?: AbortSignal) => read<ProyectoDetalle>(org, `proyectos/${encodeURIComponent(id)}`, signal)
export const getTarifas = (org: string, proyectoId: string, signal?: AbortSignal) => read<Tarifa[]>(org, `tarifas?proyecto_id=${encodeURIComponent(proyectoId)}`, signal)
export const getImpuestos = (org: string, signal?: AbortSignal) => read<Impuesto[]>(org, 'impuestos', signal)
export const getClienteConfig = (org: string, clienteId: string, signal?: AbortSignal) => read<{ impuesto?: { nombre: string; porcentaje: number } | null; zoho_tax_id?: string | null }>(org, `clientes/${encodeURIComponent(clienteId)}/config`, signal)
export const getResponsables = (org: string, signal?: AbortSignal) => read<Responsable[]>(org, 'responsables', signal)
export const resolverResponsables = (org: string, proyectoId: string, signal?: AbortSignal) => read<ResolverResponsables>(org, `responsables/resolver?proyecto_id=${encodeURIComponent(proyectoId)}`, signal)
export const resolverTarifa = (org: string, abogadoId: string, proyectoId: string, signal?: AbortSignal) => read<ResolverTarifa>(org, `tarifas/resolver?abogado_id=${encodeURIComponent(abogadoId)}&proyecto_id=${encodeURIComponent(proyectoId)}`, signal)

export const updateProyecto = (org: string, id: string, patch: Record<string, unknown>) => write<ProyectoDetalle>(org, 'PATCH', `proyectos/${encodeURIComponent(id)}`, patch)
export const createTarifa = (org: string, body: { proyecto_id: number; moneda: string; tarifa: number; abogado_id?: number; tipo_id?: number }) => write<Tarifa>(org, 'POST', 'tarifas', body)
export const updateTarifa = (org: string, id: number, tarifa: number) => write<Tarifa>(org, 'PATCH', `tarifas/${id}`, { tarifa })
export const deleteTarifa = (org: string, id: number) => write<unknown>(org, 'DELETE', `tarifas/${id}`, undefined, false)
export const createResponsable = (org: string, body: { rol: RolAsignar; abogado_id: number; proyecto_id: number }) => write<{ id: number; asignados: Responsable[] }>(org, 'POST', 'responsables', body)
export const getElegibles = (org: string, signal?: AbortSignal) => read<Elegible[]>(org, 'abogados-responsables', signal)
export const setElegible = (org: string, abogadoId: string, tipo: TipoResponsable | null) =>
  write<Elegible>(org, 'PATCH', `abogados/${encodeURIComponent(abogadoId)}/responsable`, { tipo }, false)
export const deleteResponsable = (org: string, id: number) => write<unknown>(org, 'DELETE', `responsables/${id}`, undefined, false)

// Montos: "1,234.5" → 1234.5; máximo 2 decimales; ≥ 0.
export function parseMoney(value: string, { allowZero = true } = {}): number {
  const clean = value.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) throw new Error('Escribe un monto válido con hasta 2 decimales.')
  const n = Number(clean)
  if (!allowZero && n <= 0) throw new Error('El monto debe ser mayor que cero.')
  return n
}

export interface DatosForm { nombre: string; tipo_cobro: TipoCobro; honorario: string; moneda: string; zoho_tax_id: string; activo: boolean }

export const formFromProyecto = (p: ProyectoDetalle): DatosForm => ({
  nombre: p.nombre, tipo_cobro: p.tipo_cobro, honorario: p.honorario_fijo == null ? '' : p.honorario_fijo.toFixed(2),
  moneda: p.moneda, zoho_tax_id: p.zoho_tax_id || '', activo: Number(p.activo) === 1,
})

// Solo se manda lo que cambió. Con iguala el honorario es obligatorio; "por hora" no lo usa.
export function buildPatch(p: ProyectoDetalle, f: DatosForm): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const nombre = f.nombre.trim()
  if (!nombre) throw new Error('El nombre del proyecto no puede quedar vacío.')
  if (nombre !== p.nombre) patch.nombre = nombre
  if (f.tipo_cobro !== p.tipo_cobro) patch.tipo_cobro = f.tipo_cobro
  const honorario = f.honorario.trim() === '' ? null : parseMoney(f.honorario)
  if (f.tipo_cobro === 'iguala' && !(honorario && honorario > 0)) throw new Error('Una iguala requiere el honorario mensual.')
  if (honorario !== (p.honorario_fijo == null ? null : Number(p.honorario_fijo))) patch.honorario_fijo = honorario
  if (patch.tipo_cobro === 'iguala' && patch.honorario_fijo === undefined) patch.honorario_fijo = honorario
  if (f.moneda !== p.moneda) patch.moneda = f.moneda
  if (f.zoho_tax_id !== (p.zoho_tax_id || '')) patch.zoho_tax_id = f.zoho_tax_id
  if (f.activo !== (Number(p.activo) === 1)) patch.activo = f.activo
  return patch
}

export const formatMoney = (value: number, moneda = '') => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + (moneda ? ' ' + moneda : '')
export const tarifaQuien = (t: Tarifa) => t.abogado_id != null ? (t.abogado_nombre || `Abogado #${t.abogado_id}`) : t.tipo_id != null ? `Nivel: ${t.tipo_nombre || `#${t.tipo_id}`}` : 'Todo el proyecto'
