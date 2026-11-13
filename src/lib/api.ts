// Función del proyecto Consolidado (OverviewForAptusFinancials): aptus_overview_services.
// Desarrollo usa el proxy de Vite (mismo origen); VITE_API_BASE_URL la reemplaza si se define.
const FALLBACK_API = 'https://overviewforaptusfinancials-730085095.development.catalystserverless.com/server/aptus_overview_services'
export const API_BASE = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_BASE_URL || FALLBACK_API).replace(/\/$/, '')

// A dónde regresa "Cancelar" si no llega ?origin= (calendario consolidado).
export const CALENDAR_URL = import.meta.env.VITE_CALENDAR_URL || 'https://universal-aptus-calendar.onslate.com/'
