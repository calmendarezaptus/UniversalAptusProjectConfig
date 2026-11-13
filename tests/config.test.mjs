import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

const toModule = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8')
const api = read('../src/lib/api.ts').replace('import.meta.env.DEV', 'true').replace('import.meta.env.VITE_API_BASE_URL', 'undefined').replace('import.meta.env.VITE_CALENDAR_URL', 'undefined')
const lib = await import(toModule(read('../src/lib/config.ts').replace("from './api'", `from '${toModule(api)}'`)))

const proyecto = { id: 25, nombre: '[DEMO] Iguala corporativa mensual', cliente_id: '446794000015629019', moneda: 'MXN', activo: 1, tipo_cobro: 'iguala', honorario_fijo: 25000, zoho_tax_id: null }

test('solo se manda lo que cambió', () => {
  const form = lib.formFromProyecto(proyecto)
  assert.deepEqual(lib.buildPatch(proyecto, form), {})
  assert.deepEqual(lib.buildPatch(proyecto, { ...form, honorario: '26,000.00' }), { honorario_fijo: 26000 })
  assert.deepEqual(lib.buildPatch(proyecto, { ...form, activo: false, zoho_tax_id: '446794000008083135' }), { activo: false, zoho_tax_id: '446794000008083135' })
  assert.deepEqual(lib.buildPatch(proyecto, { ...form, tipo_cobro: 'horas', honorario: '' }), { tipo_cobro: 'horas', honorario_fijo: null })
})

test('cambiar a iguala exige honorario y lo manda junto', () => {
  const porHora = { ...proyecto, tipo_cobro: 'horas', honorario_fijo: null }
  const form = lib.formFromProyecto(porHora)
  assert.throws(() => lib.buildPatch(porHora, { ...form, tipo_cobro: 'iguala' }), /honorario mensual/)
  assert.deepEqual(lib.buildPatch(porHora, { ...form, tipo_cobro: 'iguala', honorario: '12000' }), { tipo_cobro: 'iguala', honorario_fijo: 12000 })
  assert.throws(() => lib.buildPatch(porHora, { ...form, nombre: '  ' }), /nombre/)
})

test('montos y etiqueta de a quién aplica la tarifa', () => {
  assert.equal(lib.parseMoney('1,250.50'), 1250.5)
  for (const bad of ['-1', '1.234', 'abc', '']) assert.throws(() => lib.parseMoney(bad))
  assert.equal(lib.tarifaQuien({ abogado_id: 20, abogado_nombre: 'Ana Socia', tipo_id: null }), 'Ana Socia')
  assert.equal(lib.tarifaQuien({ abogado_id: null, tipo_id: 20, tipo_nombre: 'Pasante' }), 'Nivel: Pasante')
  assert.equal(lib.tarifaQuien({ abogado_id: null, tipo_id: null }), 'Todo el proyecto')
})

test('escrituras: rutas y métodos; red caída es incierta; 409 de la API conserva su mensaje', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push({ url, method: options?.method || 'GET', body: options?.body }); return { ok: true, status: 200, json: async () => ({ id: 1 }) } }
  await lib.updateProyecto('636939444', '25', { honorario_fijo: 26000 })
  await lib.createTarifa('636939444', { proyecto_id: 23, moneda: 'MXN', tarifa: 1000, tipo_id: 20 })
  await lib.updateTarifa('636939444', 57, 1100)
  await lib.deleteTarifa('636939444', 57)
  await lib.createResponsable('636939444', { rol: 'cobranza', nombre: 'Ana', proyecto_id: 23 })
  await lib.deleteResponsable('636939444', 5)
  assert.deepEqual(calls.map(c => `${c.method} ${c.url}`), [
    'PATCH /api/636939444/proyectos/25', 'POST /api/636939444/tarifas', 'PATCH /api/636939444/tarifas/57',
    'DELETE /api/636939444/tarifas/57', 'POST /api/636939444/responsables', 'DELETE /api/636939444/responsables/5',
  ])
  assert.deepEqual(JSON.parse(calls[2].body), { tarifa: 1100 })
  globalThis.fetch = async () => { throw new Error('offline') }
  await assert.rejects(lib.updateProyecto('1', '25', { activo: true }), e => e.uncertain === true)
  globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => ({ error: 'La moneda solo se puede cambiar sin capturas', stage: 'update_proyecto', outcome_unknown: false }) })
  await assert.rejects(lib.updateProyecto('1', '25', { moneda: 'USD' }), e => e.uncertain === false && /moneda/.test(e.message))
})
