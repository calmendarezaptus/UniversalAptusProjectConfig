# Configuración del proyecto

Datos, tarifas y responsables de un proyecto en Aptus (ReportesSandbox). Mismo stack y diseño que
las capturas (React + Vite + TypeScript, Tailwind CSS v4, shadcn/ui `new-york`), tema **Violeta**
(proyecto Consolidado). **No escribe en Books**: crear el proyecto en Books y sincronizar tareas
no están aquí.

## Qué hace

- **Proyecto:** cliente y proyecto (también inactivos). `?proyecto_id=` abre uno directo.
- **Datos:** nombre, activo, tipo de cobro (por hora / cuota fija / iguala), honorario (obligatorio
  en iguala), moneda (la API solo la deja cambiar sin capturas, 409) e IVA (el del cliente o uno de
  Books). "Guardar datos" manda solo lo que cambió (`PATCH /proyectos/:id`).
- **Tarifas del proyecto:** ver, editar el monto, borrar y agregar (por abogado, por nivel o para
  todo el proyecto) en la moneda del proyecto. La función rechaza tocar tarifas que no sean de un
  proyecto. Borrar no afecta tiempos ya capturados.
- **¿Qué tarifa aplicaría?:** para un abogado, la tarifa resultante y la cadena de 9 niveles.
- **Responsables:** quién aplica hoy (y de dónde sale), asignados a este proyecto, asignar y quitar.

## Llamadas al backend (función `aptus_overview_services`)

| Método | Ruta |
|---|---|
| GET / PATCH | `/{org}/proyectos/{id}` |
| GET | `/{org}/impuestos`, `/{org}/clientes/{cliente}/config` |
| GET / POST | `/{org}/tarifas?proyecto_id=`, `/{org}/tarifas` |
| PATCH / DELETE | `/{org}/tarifas/{id}` |
| GET | `/{org}/tarifas/resolver?abogado_id=&proyecto_id=` |
| GET / POST / DELETE | `/{org}/responsables`, `/{org}/responsables/{id}`, `/{org}/responsables/resolver?proyecto_id=` |
| GET | `/{org}/clientes`, `/{org}/proyectos`, `/{org}/abogados`, `/{org}/tipos-abogado` (caché 12 h) |

## Variables de entorno (opcionales)

| Variable | Por omisión |
|---|---|
| `VITE_API_BASE_URL` | `https://overviewforaptusfinancials-730085095.development.catalystserverless.com/server/aptus_overview_services` |
| `VITE_CALENDAR_URL` | `https://universal-aptus-calendar.onslate.com/` |

## Comandos

```bash
npm install
npm run dev
npm test         # pruebas de src/lib/config.ts
npm run build    # dist/ para la Slate
```

Proyecto de Catalyst **Consolidado**: `04-consolidado/PROYECTO.md` en el repositorio `AptusWidgets`.
