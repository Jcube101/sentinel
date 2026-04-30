import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { NaturalEvent, EventFilters } from '@/lib/types'

const CATEGORY_LIMITS: Record<string, number> = {
  fire: 2000,
  flood: 500,
  cyclone: 500,
  earthquake: 1000,
}

const ALL_CATEGORIES = ['fire', 'flood', 'cyclone', 'earthquake'] as const

export function useNaturalEvents(filters: EventFilters) {
  return useQuery({
    queryKey: ['sentinel-events', filters],
    queryFn: async () => {
      if (!supabase) return []
      const db = supabase
      const since = new Date()
      since.setDate(since.getDate() - filters.days)

      const categories = filters.categories.length > 0 ? filters.categories : ALL_CATEGORIES

      const results = await Promise.all(
        categories.map((category) => {
          const limit = CATEGORY_LIMITS[category] ?? 500
          let query = db
            .from('events')
            .select(
              'id,external_id,source,category,title,description,severity,severity_value,severity_unit,status,started_at,closed_at,latitude,longitude,place_name,source_url'
            )
            .eq('category', category)
            .gte('started_at', since.toISOString())
            .order('started_at', { ascending: false })
            .range(0, limit - 1)

          if (filters.status !== 'all') {
            query = query.eq('status', filters.status)
          }

          return query
        }),
      )

      const events: NaturalEvent[] = []
      for (const { data, error } of results) {
        if (error) throw error
        if (data) events.push(...(data as unknown as NaturalEvent[]))
      }
      return events
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
    enabled: !!supabase,
  })
}
