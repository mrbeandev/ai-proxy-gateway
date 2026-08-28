const BASE = ''

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export const api = {
  // Stats
  getStats: () => req<any>('/api/stats'),
  getTimeseries: () => req<any[]>('/api/stats/timeseries'),
  getActivity: (days?: number) =>
    req<{ providers: string[]; days: any[]; activeDays: number; spanDays: number }>(
      days ? `/api/stats/activity?days=${days}` : '/api/stats/activity',
    ),
  getHeatmap: () =>
    req<{ cells: { dow: number; hour: number; requests: number }[]; max: number }>('/api/stats/heatmap'),
  getProviderSplit: () => req<any[]>('/api/stats/providers'),

  // Services
  getServices: () => req<any[]>('/api/services'),
  createService: (data: any) => req<any>('/api/services', { method: 'POST', body: JSON.stringify(data) }),
  updateService: (id: string, data: any) => req<any>(`/api/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteService: (id: string) => req<any>(`/api/services/${id}`, { method: 'DELETE' }),

  // Logs
  getLogs: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    return req<any>(`/api/logs?${qs}`)
  },

  // Aliases
  getAliases: () => req<any[]>('/api/aliases'),
  createAlias: (data: any) => req<any>('/api/aliases', { method: 'POST', body: JSON.stringify(data) }),
  updateAlias: (id: string, data: any) => req<any>(`/api/aliases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAlias: (id: string) => req<any>(`/api/aliases/${id}`, { method: 'DELETE' }),

  // Service Models
  getServiceModels: (serviceId: string) => req<any[]>(`/api/services/${serviceId}/models`),
  addServiceModel: (serviceId: string, data: { model_id: string; display_name?: string }) =>
    req<any>(`/api/services/${serviceId}/models`, { method: 'POST', body: JSON.stringify(data) }),
  deleteServiceModel: (serviceId: string, id: string) =>
    req<any>(`/api/services/${serviceId}/models/${id}`, { method: 'DELETE' }),
  fetchServiceModels: (serviceId: string, endpoint?: string) =>
    req<any>(`/api/services/${serviceId}/models/fetch`, { method: 'POST', body: JSON.stringify({ endpoint }) }),

  // Playground — talks to the real OpenAI-compatible surface (`/v1`) rather
  // than a dashboard-only endpoint, so it exercises the same routing, auth and
  // logging path an external client would hit.
  getV1Models: () =>
    req<{ data: { id: string; owned_by: string }[] }>('/v1/models').then(r => r.data),

  // Settings
  getSettings: () => req<Record<string, string>>('/api/settings'),
  updateSettings: (data: Record<string, string>) => req<any>('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getPricing: () => req<any[]>('/api/settings/pricing'),
  updatePricing: (model: string, data: any) => req<any>(`/api/settings/pricing/${model}`, { method: 'PUT', body: JSON.stringify(data) }),
}
