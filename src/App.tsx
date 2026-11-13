import { useEffect, useMemo, useRef, useState } from 'react'
import 'animate.css'
import { Toaster, toast } from 'sonner'
import {
  BadgeDollarSign, Briefcase, Check, FileText, Info, Landmark, Pencil, Plus, Repeat, RefreshCw, Save, Search,
  Settings2, Trash2, User, UserCheck, Users, X, Clock,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusModal, type StatusModalType } from '@/components/StatusModal'
import { SearchSelect } from '@/components/SearchSelect'
import { ThemeMenu } from '@/components/ThemeMenu'
import { cn } from '@/lib/utils'
import { CALENDAR_URL, lawyersUrl } from '@/lib/api'
import { cardCls, gradientBtnCls, inputCls, labelCls, sectionIconCls, sectionTitleCls, useTheme } from '@/lib/ui'
import { loadAbogados, loadClientes, loadNiveles, loadProyectos, type Abogado, type Cliente, type Option, type Proyecto } from '@/lib/catalogs'
import {
  buildPatch, createResponsable, createTarifa, deleteResponsable, deleteTarifa, formatMoney, formFromProyecto, getClienteConfig,
  getElegibles, getImpuestos, getProyecto, getResponsables, getTarifas, MONEDAS, parseMoney, puedeRol, resolverResponsables, resolverTarifa,
  ROL_ASIGNAR_LABEL, ROL_LABEL, tarifaQuien, TIPO_COBRO_LABEL, TIPO_RESPONSABLE_LABEL, updateProyecto, updateTarifa,
  type DatosForm, type Impuesto, type ProyectoDetalle, type ResolverResponsables, type ResolverTarifa, type Responsable, type Rol, type RolAsignar,
  type Tarifa, type TipoCobro, type TipoResponsable,
} from '@/lib/config'

type Modal = { isOpen: boolean; type: StatusModalType; title: string; message: string }
type Loadable<T> = { rows: T[]; loading: boolean; error: string }
const empty = <T,>(): Loadable<T> => ({ rows: [], loading: false, error: '' })
const NO_TAX = '__cliente__'

function useCatalog<T>(org: string | null, loader: (org: string, force?: boolean) => Promise<T[]>, label: string) {
  const [state, setState] = useState<Loadable<T>>(empty)
  const load = async (force = false) => {
    if (!org) return
    setState(s => ({ ...s, loading: true, error: '' }))
    try { setState({ rows: await loader(org, force), loading: false, error: '' }) }
    catch { setState({ rows: [], loading: false, error: `No se pudieron cargar ${label}.` }) }
  }
  useEffect(() => { void load() }, [org]) // eslint-disable-line react-hooks/exhaustive-deps
  return [state, load] as const
}

const uncertainOf = (error: unknown) => error instanceof Error && 'uncertain' in error && (error as { uncertain?: boolean }).uncertain === true

function App() {
  const [theme, setTheme] = useTheme()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [statusModal, setStatusModal] = useState<Modal>({ isOpen: false, type: 'info', title: '', message: '' })
  const showError = (title: string, error: unknown) => setStatusModal({ isOpen: true, type: 'error', title: uncertainOf(error) ? 'Resultado por verificar' : title, message: error instanceof Error ? error.message : 'Error.' })

  useEffect(() => {
    const orgId = new URLSearchParams(window.location.search).get('organization_id')
    if (!orgId) setStatusModal({ isOpen: true, type: 'error', title: 'Error de Inicialización', message: 'No se detectó la organización relacionada. Es necesario incluir el parámetro "organization_id" en la URL.' })
    else setOrganizationId(orgId)
  }, [])

  const [clientes, reloadClientes] = useCatalog<Cliente>(organizationId, loadClientes, 'los clientes')
  const [proyectos, reloadProyectos] = useCatalog<Proyecto>(organizationId, loadProyectos, 'los proyectos')
  const [abogados] = useCatalog<Abogado>(organizationId, loadAbogados, 'los abogados')
  const [niveles] = useCatalog<Option>(organizationId, loadNiveles, 'los niveles de abogado')

  const [selectedCliente, setSelectedCliente] = useState('')
  const [selectedProyecto, setSelectedProyecto] = useState('')
  const initialProject = useRef(new URLSearchParams(window.location.search).get('proyecto_id'))

  // Solo clientes con proyectos; ?proyecto_id= abre directo el proyecto.
  const clientesConProyecto = useMemo(() => {
    const ids = new Set(proyectos.rows.map(p => p.cliente_id))
    return clientes.rows.filter(c => ids.has(c.ID))
  }, [clientes.rows, proyectos.rows])
  const proyectosCliente = useMemo(() => proyectos.rows.filter(p => p.cliente_id === selectedCliente), [proyectos.rows, selectedCliente])
  useEffect(() => {
    const id = initialProject.current
    if (!id || !proyectos.rows.length) return
    const p = proyectos.rows.find(x => x.ID === id)
    if (p) { setSelectedCliente(p.cliente_id); setSelectedProyecto(p.ID) }
    initialProject.current = null
  }, [proyectos.rows])

  // ── Datos del proyecto ─────────────────────────────────────────────────
  const [detalle, setDetalle] = useState<ProyectoDetalle | null>(null)
  const [form, setForm] = useState<DatosForm | null>(null)
  const [detalleError, setDetalleError] = useState('')
  const [impuestos, setImpuestos] = useState<Impuesto[]>([])
  const [ivaCliente, setIvaCliente] = useState<string>('')
  useEffect(() => {
    if (!organizationId) return
    getImpuestos(organizationId).then(setImpuestos).catch(() => setImpuestos([]))
  }, [organizationId])
  useEffect(() => {
    setDetalle(null); setForm(null); setDetalleError('')
    if (!organizationId || !selectedProyecto) return
    const controller = new AbortController()
    getProyecto(organizationId, selectedProyecto, controller.signal)
      .then(p => { if (!controller.signal.aborted) { setDetalle(p); setForm(formFromProyecto(p)) } })
      .catch(error => { if (!controller.signal.aborted) setDetalleError(error instanceof Error ? error.message : 'No se pudo cargar el proyecto.') })
    return () => controller.abort()
  }, [organizationId, selectedProyecto])
  useEffect(() => {
    setIvaCliente('')
    if (!organizationId || !detalle) return
    getClienteConfig(organizationId, String(detalle.cliente_id))
      .then(c => setIvaCliente(c?.impuesto ? `${c.impuesto.nombre} (${c.impuesto.porcentaje}%)` : 'sin IVA configurado'))
      .catch(() => setIvaCliente(''))
  }, [organizationId, detalle?.cliente_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const patchPreview = useMemo(() => {
    if (!detalle || !form) return { patch: {}, error: '' }
    try { return { patch: buildPatch(detalle, form), error: '' } } catch (e) { return { patch: {}, error: e instanceof Error ? e.message : 'Datos inválidos.' } }
  }, [detalle, form])
  const dirty = Object.keys(patchPreview.patch).length > 0
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)

  async function run(action: () => Promise<void>, errorTitle: string) {
    if (busy.current) return
    busy.current = true; setSaving(true)
    try { await action() } catch (error) { showError(errorTitle, error) } finally { busy.current = false; setSaving(false) }
  }

  const saveDatos = () => run(async () => {
    if (!organizationId || !detalle || !form) return
    const patch = buildPatch(detalle, form)
    if (!Object.keys(patch).length) return
    const saved = await updateProyecto(organizationId, String(detalle.id), patch)
    setDetalle(saved); setForm(formFromProyecto(saved))
    void reloadProyectos(true)
    toast.success('Datos del proyecto guardados.')
  }, 'No se guardaron los datos')

  // ── Tarifas del proyecto ───────────────────────────────────────────────
  const [tarifas, setTarifas] = useState<Loadable<Tarifa>>(empty)
  const loadTarifas = async () => {
    if (!organizationId || !selectedProyecto) { setTarifas(empty()); return }
    setTarifas(s => ({ ...s, loading: true, error: '' }))
    try { setTarifas({ rows: await getTarifas(organizationId, selectedProyecto), loading: false, error: '' }) }
    catch (error) { setTarifas({ rows: [], loading: false, error: error instanceof Error ? error.message : 'No se pudieron cargar las tarifas.' }) }
  }
  useEffect(() => { void loadTarifas() }, [organizationId, selectedProyecto]) // eslint-disable-line react-hooks/exhaustive-deps

  const [nuevaAplica, setNuevaAplica] = useState<'proyecto' | 'abogado' | 'nivel'>('abogado')
  const [nuevaAbogado, setNuevaAbogado] = useState('')
  const [nuevaNivel, setNuevaNivel] = useState('')
  const [nuevaMonto, setNuevaMonto] = useState('')
  const [editTarifa, setEditTarifa] = useState<{ id: number; value: string } | null>(null)

  const addTarifa = () => run(async () => {
    if (!organizationId || !detalle) return
    const tarifa = parseMoney(nuevaMonto)
    const body: Parameters<typeof createTarifa>[1] = { proyecto_id: detalle.id, moneda: detalle.moneda, tarifa }
    if (nuevaAplica === 'abogado') { if (!nuevaAbogado) throw new Error('Selecciona el abogado.'); body.abogado_id = Number(nuevaAbogado) }
    if (nuevaAplica === 'nivel') { if (!nuevaNivel) throw new Error('Selecciona el nivel.'); body.tipo_id = Number(nuevaNivel) }
    await createTarifa(organizationId, body)
    setNuevaMonto(''); toast.success('Tarifa guardada.')
    await loadTarifas()
  }, 'No se guardó la tarifa')

  const saveTarifa = (t: Tarifa, value: string) => run(async () => {
    if (!organizationId) return
    await updateTarifa(organizationId, t.id, parseMoney(value))
    setEditTarifa(null); toast.success('Tarifa actualizada.')
    await loadTarifas()
  }, 'No se actualizó la tarifa')

  const removeTarifa = (t: Tarifa) => {
    if (!window.confirm(`¿Eliminar la tarifa de ${tarifaQuien(t)} (${formatMoney(t.tarifa, t.moneda)})?\n\nNo afecta los tiempos ya capturados: su tarifa quedó congelada.`)) return
    void run(async () => {
      if (!organizationId) return
      await deleteTarifa(organizationId, t.id)
      toast.success('Tarifa eliminada.')
      await loadTarifas()
    }, 'No se eliminó la tarifa')
  }

  // ¿Qué tarifa aplicaría?
  const [resolverAbogado, setResolverAbogado] = useState('')
  const [resolver, setResolver] = useState<{ data: ResolverTarifa | null; loading: boolean; error: string }>({ data: null, loading: false, error: '' })
  useEffect(() => {
    setResolver({ data: null, loading: false, error: '' })
    if (!organizationId || !selectedProyecto || !resolverAbogado) return
    const controller = new AbortController()
    setResolver(s => ({ ...s, loading: true }))
    resolverTarifa(organizationId, resolverAbogado, selectedProyecto, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResolver({ data, loading: false, error: '' }) })
      .catch(error => { if (!controller.signal.aborted) setResolver({ data: null, loading: false, error: error instanceof Error ? error.message : 'Error' }) })
    return () => controller.abort()
  }, [organizationId, selectedProyecto, resolverAbogado, tarifas.rows])

  // ── Responsables ───────────────────────────────────────────────────────
  const [responsables, setResponsables] = useState<Loadable<Responsable>>(empty)
  const [efectivos, setEfectivos] = useState<ResolverResponsables | null>(null)
  const loadResponsables = async () => {
    setEfectivos(null)
    if (!organizationId || !selectedProyecto) { setResponsables(empty()); return }
    setResponsables(s => ({ ...s, loading: true, error: '' }))
    try {
      const [all, resolved] = await Promise.all([getResponsables(organizationId), resolverResponsables(organizationId, selectedProyecto)])
      setResponsables({ rows: all.filter(r => String(r.proyecto_id) === selectedProyecto), loading: false, error: '' })
      setEfectivos(resolved)
    } catch (error) { setResponsables({ rows: [], loading: false, error: error instanceof Error ? error.message : 'No se pudieron cargar los responsables.' }) }
  }
  useEffect(() => { void loadResponsables() }, [organizationId, selectedProyecto]) // eslint-disable-line react-hooks/exhaustive-deps
  const [nuevoRol, setNuevoRol] = useState<RolAsignar>('facturacion')
  const [nuevoAbogado, setNuevoAbogado] = useState('')

  // ── Abogados que pueden ser responsables (de toda la organización) ─────
  const [elegibles, setElegibles] = useState<{ map: Map<number, TipoResponsable>; loading: boolean; error: string }>({ map: new Map(), loading: false, error: '' })
  const loadElegibles = async () => {
    if (!organizationId) return
    setElegibles(s => ({ ...s, loading: true, error: '' }))
    try {
      const rows = await getElegibles(organizationId)
      setElegibles({ map: new Map(rows.map(r => [r.abogado_id, r.tipo])), loading: false, error: '' })
    } catch (error) { setElegibles({ map: new Map(), loading: false, error: error instanceof Error ? error.message : 'No se pudo consultar quién puede ser responsable.' }) }
  }
  useEffect(() => { void loadElegibles() }, [organizationId]) // eslint-disable-line react-hooks/exhaustive-deps
  const candidatos = useMemo(() => abogados.rows.filter(a => puedeRol(elegibles.map.get(Number(a.ID)), nuevoRol))
    .map(a => ({ ...a, secondary: TIPO_RESPONSABLE_LABEL[elegibles.map.get(Number(a.ID))!] })), [abogados.rows, elegibles.map, nuevoRol])
  useEffect(() => { if (nuevoAbogado && !candidatos.some(c => c.ID === nuevoAbogado)) setNuevoAbogado('') }, [candidatos, nuevoAbogado])

  const addResponsable = () => run(async () => {
    if (!organizationId || !detalle) return
    if (!nuevoAbogado) throw new Error('Selecciona el abogado responsable.')
    const r = await createResponsable(organizationId, { rol: nuevoRol, abogado_id: Number(nuevoAbogado), proyecto_id: detalle.id })
    setNuevoAbogado(''); toast.success(r.asignados?.length > 1 ? 'Responsable de facturación y cobranza asignado.' : 'Responsable asignado.')
    await loadResponsables()
  }, 'No se asignó el responsable')

  const removeResponsable = (r: Responsable) => {
    if (!window.confirm(`¿Quitar a ${r.nombre} como responsable de ${ROL_LABEL[r.rol].toLowerCase()} de este proyecto?`)) return
    void run(async () => {
      if (!organizationId) return
      await deleteResponsable(organizationId, r.id)
      toast.success('Responsable quitado.')
      await loadResponsables()
    }, 'No se quitó el responsable')
  }

  function handleCancel() {
    const params = new URLSearchParams(window.location.search)
    const org = organizationId || params.get('organization_id') || ''
    try {
      const target = new URL(params.get('origin') || CALENDAR_URL)
      if (!target.searchParams.get('organization_id') && org) target.searchParams.set('organization_id', org)
      target.searchParams.set('_t', Date.now().toString())
      window.location.href = target.toString()
    } catch {
      window.location.href = `${CALENDAR_URL}?organization_id=${encodeURIComponent(org)}&_t=${Date.now()}`
    }
  }

  const set = <K extends keyof DatosForm>(key: K, value: DatosForm[K]) => setForm(f => f ? { ...f, [key]: value } : f)
  const tipoIcon: Record<TipoCobro, typeof Clock> = { horas: Clock, fijo: Landmark, iguala: Repeat }
  const ready = !!detalle && !!form

  return (
    <div className="min-h-screen bg-slate-50/50 p-2 sm:p-4 lg:p-8 flex justify-center items-start font-sans w-full">
      <Toaster position="top-center" richColors />
      <Card className="w-full bg-gradient-to-b from-[#FAF8FF] to-white border border-slate-200 rounded-[20px] overflow-hidden p-3 sm:p-5 lg:p-8 relative animate__animated animate__fadeIn animate__faster">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-theme-from/5 rounded-full blur-[80px] animate-blob pointer-events-none z-0"></div>
        <div className="absolute top-0 left-0 right-0 h-15 bg-gradient-to-b from-theme-light to-transparent pointer-events-none z-0"></div>

        {/* ── ENCABEZADO ─────────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-5 lg:mb-8 gap-0 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-theme-from to-theme-to flex items-center justify-center shrink-0 shadow-sm border border-black/5 text-white">
              <Settings2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Configuración del proyecto</h1>
                <ThemeMenu theme={theme} setTheme={setTheme} />
              </div>
              <p className="text-slate-500 text-sm mt-0.5">Tipo de cobro, IVA, tarifas y responsables del proyecto en Aptus</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-4 lg:mt-0 w-full lg:w-auto">
            <Button variant="outline" type="button" onClick={handleCancel}
              className="flex-1 lg:flex-none lg:w-auto h-11 sm:h-12 px-6 rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium">
              Cancelar
            </Button>
            <Button onClick={() => void saveDatos()} disabled={!ready || !dirty || !!patchPreview.error || saving}
              className={cn('flex-1 lg:flex-none lg:w-auto h-11 sm:h-12 px-6 rounded-lg shadow-sm font-medium flex items-center justify-center gap-2 border-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed', gradientBtnCls)}>
              <Save className="w-4 h-4" />
              {saving ? 'Guardando…' : 'Guardar datos'}
            </Button>
          </div>
        </div>

        {[clientes, proyectos].filter(c => c.error).map(c => <p key={c.error} role="alert" className="relative z-10 mb-2 text-xs text-red-700">{c.error}</p>)}
        {detalleError && <p role="alert" className="relative z-10 mb-2 text-xs text-red-700">{detalleError}</p>}

        <div className="space-y-4 relative z-10">
          {/* ── Selección ──────────────────────────────────────────────── */}
          <div className={cardCls}>
            <div className="flex items-center gap-2 mb-4">
              <Briefcase className={sectionIconCls} />
              <span className={sectionTitleCls}>Proyecto</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
              <SearchSelect label="Cliente *" icon={<Briefcase className="w-3.5 h-3.5 text-slate-400" />}
                options={clientesConProyecto} value={selectedCliente} onChange={id => { setSelectedCliente(id); setSelectedProyecto('') }}
                loading={clientes.loading || proyectos.loading} placeholder="Seleccionar cliente" searchPlaceholder="Buscar cliente..."
                emptyText="No se encontraron clientes con proyectos." onRefresh={() => { void reloadClientes(true); void reloadProyectos(true) }} />
              <SearchSelect label="Proyecto *" icon={<FileText className="w-3.5 h-3.5 text-slate-400" />}
                options={proyectosCliente} value={selectedProyecto} onChange={setSelectedProyecto}
                loading={proyectos.loading} disabled={!selectedCliente} disabledText="Selecciona un cliente primero"
                placeholder="Seleccionar proyecto" searchPlaceholder="Buscar proyecto..." emptyText="No se encontraron proyectos." />
            </div>
          </div>

          {!selectedProyecto ? (
            <p className="text-sm text-slate-500 px-1">Elige un cliente y un proyecto para ver su configuración.</p>
          ) : !ready ? (
            <div role="status" className="flex items-center gap-3 rounded-xl border border-theme-border bg-theme-light/60 p-4 text-sm text-theme-text">
              <RefreshCw className="h-5 w-5 animate-spin" /><span>Cargando proyecto…</span>
            </div>
          ) : (
            <div inert={saving} className="space-y-4">
              {/* ── Datos del proyecto ─────────────────────────────────── */}
              <div className={cardCls}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <Settings2 className={sectionIconCls} />
                    <span className={sectionTitleCls}>Datos del proyecto</span>
                  </div>
                  {detalle!.zoho_project_name && <span className="text-[11px] text-slate-500">En Books: {detalle!.zoho_project_name}{detalle!.zoho_project_code ? ` · Clave ${detalle!.zoho_project_code}` : ''}</span>}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="space-y-2 lg:col-span-2">
                    <Label htmlFor="nombre" className={labelCls}>Nombre *</Label>
                    <Input id="nombre" value={form!.nombre} onChange={e => set('nombre', e.target.value)} maxLength={200} className={inputCls} />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelCls}>Activo</Label>
                    <div className="flex items-center gap-2 h-9">
                      <Switch checked={form!.activo} onCheckedChange={(v: boolean) => set('activo', v)} className="data-[state=checked]:bg-theme-from" />
                      <span className="text-sm text-slate-600">{form!.activo ? 'Se puede capturar' : 'Inactivo: no aparece en las capturas'}</span>
                    </div>
                  </div>
                  <div className="space-y-2 lg:col-span-2">
                    <Label className={labelCls}>Tipo de cobro *</Label>
                    <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                      {(Object.keys(TIPO_COBRO_LABEL) as TipoCobro[]).map(key => {
                        const Icon = tipoIcon[key]
                        return (
                          <button key={key} type="button" onClick={() => set('tipo_cobro', key)}
                            className={cn('flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold rounded-md transition-all',
                              form!.tipo_cobro === key ? 'bg-gradient-to-r from-theme-from to-theme-to text-white shadow-sm' : 'text-slate-500 hover:text-theme-text hover:bg-theme-light')}>
                            <Icon className="w-3.5 h-3.5" />{TIPO_COBRO_LABEL[key]}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {form!.tipo_cobro === 'horas' ? 'Se cobra por tiempo con la tarifa de cada abogado.' : 'Se cobra con honorarios fijos; los tiempos de este proyecto nacen como no facturables.'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="honorario" className={labelCls}>{form!.tipo_cobro === 'iguala' ? 'Iguala mensual *' : 'Honorario fijo'} ({form!.moneda})</Label>
                    <Input id="honorario" inputMode="decimal" value={form!.honorario} onChange={e => set('honorario', e.target.value)}
                      disabled={form!.tipo_cobro === 'horas'} placeholder={form!.tipo_cobro === 'horas' ? 'No aplica' : '0.00'} className={inputCls} />
                  </div>
                  <div className="space-y-2">
                    <Label className={labelCls}>Moneda</Label>
                    <Select value={form!.moneda} onValueChange={v => set('moneda', v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{MONEDAS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="text-[11px] text-slate-500">Solo se puede cambiar si el proyecto no tiene capturas.</p>
                  </div>
                  <div className="space-y-2 lg:col-span-2">
                    <Label className={labelCls}>IVA</Label>
                    <Select value={form!.zoho_tax_id || NO_TAX} onValueChange={v => set('zoho_tax_id', v === NO_TAX ? '' : v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-64">
                        <SelectItem value={NO_TAX}>El del cliente{ivaCliente ? `: ${ivaCliente}` : ''}</SelectItem>
                        {impuestos.map(t => <SelectItem key={t.zoho_id} value={t.zoho_id}>{t.nombre} ({t.porcentaje}%){t.tipo === 'tax_group' ? ' · grupo' : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {patchPreview.error && <p role="alert" className="mt-3 text-xs text-red-700">{patchPreview.error}</p>}
                {dirty && !patchPreview.error && <p className="mt-3 text-xs text-theme-text">Hay cambios sin guardar: {Object.keys(patchPreview.patch).join(', ')}.</p>}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                {/* ── Tarifas ──────────────────────────────────────────── */}
                <div className={cn(cardCls, 'lg:col-span-2 min-w-0')}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <BadgeDollarSign className={sectionIconCls} />
                      <span className={sectionTitleCls}>Tarifas del proyecto ({detalle!.moneda})</span>
                    </div>
                    <button type="button" onClick={() => void loadTarifas()} disabled={tarifas.loading} aria-label="Actualizar tarifas"
                      className="w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-50">
                      <RefreshCw className={cn('w-3.5 h-3.5 text-slate-500', tarifas.loading && 'animate-spin')} />
                    </button>
                  </div>
                  {tarifas.error && <p role="alert" className="text-xs text-red-700 mb-2">{tarifas.error}</p>}
                  {tarifas.rows.length === 0 && !tarifas.loading ? (
                    <p className="text-sm text-slate-500 mb-3">Sin tarifas propias: se usan las del cliente, del abogado, de su nivel o la general.</p>
                  ) : (
                    <table className="w-full text-sm mb-3">
                      <thead className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-100">
                        <tr><th className="text-left py-2 font-semibold">Aplica a</th><th className="text-left py-2 font-semibold">Nivel de la tarifa</th><th className="text-right py-2 font-semibold">Tarifa / hora</th><th className="w-20"></th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {tarifas.rows.map(t => (
                          <tr key={t.id}>
                            <td className="py-2 text-slate-800">{tarifaQuien(t)}</td>
                            <td className="py-2 text-slate-500 text-xs">{t.nivel_etiqueta || t.nivel}</td>
                            <td className="py-2 text-right font-semibold text-slate-700 whitespace-nowrap">
                              {editTarifa?.id === t.id ? (
                                <span className="inline-flex items-center gap-1">
                                  <Input autoFocus inputMode="decimal" value={editTarifa.value} onChange={e => setEditTarifa({ id: t.id, value: e.target.value })}
                                    onKeyDown={e => { if (e.key === 'Enter') void saveTarifa(t, editTarifa.value); if (e.key === 'Escape') setEditTarifa(null) }} className="h-8 w-28 text-right" />
                                  <button type="button" aria-label="Guardar" onClick={() => void saveTarifa(t, editTarifa.value)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-4 h-4" /></button>
                                  <button type="button" aria-label="Cancelar" onClick={() => setEditTarifa(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X className="w-4 h-4" /></button>
                                </span>
                              ) : formatMoney(t.tarifa, t.moneda)}
                            </td>
                            <td className="py-2 text-right whitespace-nowrap">
                              {editTarifa?.id !== t.id && <>
                                <button type="button" aria-label="Editar tarifa" onClick={() => setEditTarifa({ id: t.id, value: t.tarifa.toFixed(2) })} className="p-1.5 text-slate-400 hover:text-theme-text hover:bg-theme-light rounded"><Pencil className="w-3.5 h-3.5" /></button>
                                <button type="button" aria-label="Eliminar tarifa" onClick={() => removeTarifa(t)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                              </>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <div className="border border-theme-border bg-theme-light/20 rounded-lg p-3">
                    <p className="text-xs font-semibold text-theme-text mb-2 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Agregar tarifa del proyecto</p>
                    <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_8rem_auto] gap-2 items-end">
                      <div className="flex bg-white p-1 rounded-lg border border-slate-200">
                        {([{ k: 'abogado', l: 'Abogado' }, { k: 'nivel', l: 'Nivel' }, { k: 'proyecto', l: 'Todos' }] as const).map(({ k, l }) => (
                          <button key={k} type="button" onClick={() => setNuevaAplica(k)}
                            className={cn('px-2.5 py-1.5 text-xs font-semibold rounded-md', nuevaAplica === k ? 'bg-gradient-to-r from-theme-from to-theme-to text-white' : 'text-slate-500 hover:bg-theme-light')}>{l}</button>
                        ))}
                      </div>
                      {nuevaAplica === 'abogado' ? (
                        <SearchSelect label="Abogado" icon={<User className="w-3.5 h-3.5 text-slate-400" />} options={abogados.rows} value={nuevaAbogado} onChange={setNuevaAbogado}
                          loading={abogados.loading} placeholder="Seleccionar abogado" searchPlaceholder="Buscar abogado..." emptyText="No se encontraron abogados." withAvatar />
                      ) : nuevaAplica === 'nivel' ? (
                        <SearchSelect label="Nivel" icon={<Users className="w-3.5 h-3.5 text-slate-400" />} options={niveles.rows} value={nuevaNivel} onChange={setNuevaNivel}
                          loading={niveles.loading} placeholder="Seleccionar nivel" searchPlaceholder="Buscar nivel..." emptyText="No se encontraron niveles." />
                      ) : <p className="text-xs text-slate-500 self-center">Aplica a todos los abogados del proyecto.</p>}
                      <div className="space-y-2">
                        <Label htmlFor="nueva-tarifa" className={labelCls}>Tarifa ({detalle!.moneda})</Label>
                        <Input id="nueva-tarifa" inputMode="decimal" value={nuevaMonto} onChange={e => setNuevaMonto(e.target.value)} placeholder="0.00" className={inputCls} />
                      </div>
                      <Button onClick={() => void addTarifa()} disabled={saving || !nuevaMonto.trim()} className={cn('h-9 border-0 disabled:opacity-50', gradientBtnCls)}>Agregar</Button>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">Si ya existe una tarifa para la misma combinación, se reemplaza. No cambia los tiempos ya capturados.</p>
                  </div>
                </div>

                {/* ── ¿Qué tarifa aplicaría? ───────────────────────────── */}
                <div className={cn(cardCls, 'min-w-0')}>
                  <div className="flex items-center gap-2 mb-3">
                    <Search className={sectionIconCls} />
                    <span className={cn(sectionTitleCls, 'text-theme-text')}>¿Qué tarifa aplicaría?</span>
                  </div>
                  <SearchSelect label="Abogado" icon={<User className="w-3.5 h-3.5 text-slate-400" />} options={abogados.rows} value={resolverAbogado} onChange={setResolverAbogado}
                    loading={abogados.loading} placeholder="Seleccionar abogado" searchPlaceholder="Buscar abogado..." emptyText="No se encontraron abogados." withAvatar />
                  <div className="mt-3 text-sm">
                    {resolver.loading ? <p className="text-xs text-slate-500">Consultando…</p>
                      : resolver.error ? <p role="alert" className="text-xs text-red-700">{resolver.error}</p>
                      : resolver.data ? (
                        <>
                          {resolver.data.aplicada ? (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 mb-2">
                              <p className="text-lg font-bold text-emerald-800">{formatMoney(resolver.data.aplicada.tarifa, resolver.data.moneda)} / h</p>
                              <p className="text-xs text-emerald-700">{resolver.data.aplicada.etiqueta}</p>
                            </div>
                          ) : <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">{resolver.data.aviso || 'Sin tarifa en ningún nivel: no podrá capturar tiempo en este proyecto.'}</p>}
                          <ul className="space-y-1 text-xs">
                            {resolver.data.cadena.map(c => (
                              <li key={c.orden} className={cn('flex justify-between gap-2', resolver.data!.aplicada?.orden === c.orden ? 'font-bold text-emerald-700' : c.tarifa == null ? 'text-slate-400' : 'text-slate-600')}>
                                <span>{c.orden}. {c.etiqueta || c.nivel}</span><span>{c.tarifa == null ? '—' : formatMoney(c.tarifa)}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : <p className="text-xs text-slate-500">Elige un abogado para ver la tarifa que se le aplicaría en este proyecto y de qué nivel sale.</p>}
                  </div>
                </div>
              </div>

              {/* ── Responsables ─────────────────────────────────────── */}
              <div className={cardCls}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className={sectionIconCls} />
                    <span className={sectionTitleCls}>Responsables de facturación y cobranza</span>
                  </div>
                  <button type="button" onClick={() => void loadResponsables()} disabled={responsables.loading} aria-label="Actualizar responsables"
                    className="w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-50">
                    <RefreshCw className={cn('w-3.5 h-3.5 text-slate-500', responsables.loading && 'animate-spin')} />
                  </button>
                </div>
                {responsables.error && <p role="alert" className="text-xs text-red-700 mb-2">{responsables.error}</p>}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quién aplica hoy</p>
                    {efectivos ? (['facturacion', 'cobranza'] as Rol[]).map(rol => (
                      <div key={rol} className="text-sm">
                        <span className="text-slate-500">{ROL_LABEL[rol]}: </span>
                        <b className="text-slate-800">{efectivos[rol].texto}</b>
                        {efectivos[rol].fuente && <span className="text-[11px] text-slate-400"> · {efectivos[rol].fuente === 'local' ? 'asignado en Aptus' : efectivos[rol].fuente === 'rol_proyecto' ? 'rol en el proyecto de Books' : 'campo del cliente en Books'}</span>}
                      </div>
                    )) : <p className="text-xs text-slate-500">Cargando…</p>}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Asignados a este proyecto</p>
                    {responsables.rows.length === 0 ? <p className="text-xs text-slate-500">Ninguno: se usan los del cliente o de Books.</p> : (
                      <ul className="space-y-1">
                        {responsables.rows.map(r => (
                          <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                            <span><span className="text-slate-500">{ROL_LABEL[r.rol]}:</span> <b className="text-slate-800">{r.nombre}</b>
                              {r.abogado_cubre_rol === false && <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">ya no está marcado</span>}</span>
                            <button type="button" aria-label={`Quitar a ${r.nombre}`} onClick={() => removeResponsable(r)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Asignar</p>
                    <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                      {(Object.keys(ROL_ASIGNAR_LABEL) as RolAsignar[]).map(r => (
                        <button key={r} type="button" onClick={() => setNuevoRol(r)}
                          className={cn('flex-1 px-2 py-1.5 text-xs font-semibold rounded-md', nuevoRol === r ? 'bg-gradient-to-r from-theme-from to-theme-to text-white' : 'text-slate-500 hover:bg-theme-light')}>{ROL_ASIGNAR_LABEL[r]}</button>
                      ))}
                    </div>
                    <SearchSelect label="Abogado" icon={<User className="w-3.5 h-3.5 text-slate-400" />} options={candidatos} value={nuevoAbogado} onChange={setNuevoAbogado}
                      loading={abogados.loading || elegibles.loading} placeholder="Seleccionar abogado" searchPlaceholder="Buscar abogado..."
                      emptyText={nuevoRol === 'ambos' ? 'Ningún abogado es responsable general.' : 'Ningún abogado puede ser responsable de este rol.'} withAvatar />
                    {elegibles.error ? <p role="alert" className="text-[11px] text-red-700">{elegibles.error}</p>
                      : <p className="text-[11px] text-slate-500">Solo aparecen los abogados marcados para {nuevoRol === 'ambos' ? 'ambos roles (generales)' : ROL_LABEL[nuevoRol].toLowerCase() + ' o generales'}. <a href={lawyersUrl(organizationId)} target="_blank" rel="noopener" className="underline text-theme-text">Configuración de abogados</a></p>}
                    <Button onClick={() => void addResponsable()} disabled={saving || !nuevoAbogado} className={cn('h-9 w-full border-0 disabled:opacity-50', gradientBtnCls)}>Asignar al proyecto</Button>
                  </div>
                </div>
              </div>

              <p className="flex items-start gap-2 text-[11px] text-slate-500 px-1">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Todo se guarda en Aptus. Crear el proyecto en Books y sincronizar sus tareas no están en esta pantalla.
              </p>
            </div>
          )}
        </div>
      </Card>

      <StatusModal
        isOpen={statusModal.isOpen}
        onClose={statusModal.type === 'error' && !organizationId ? undefined : () => setStatusModal(prev => ({ ...prev, isOpen: false }))}
        type={statusModal.type} title={statusModal.title} message={statusModal.message}
      />
    </div>
  )
}

export default App
