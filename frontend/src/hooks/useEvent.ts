import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { NaturalEvent } from '@/lib/types'

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['sentinel-event', id],
    queryFn: async () => {
      if (!supabase || !id) return null
      const { data, error } = await supabase
        .from('events')
        .select(
          'id,external_id,source,category,title,description,severity,severity_value,severity_unit,status,started_at,closed_at,latitude,longitude,place_name,source_url'
        )
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      return data as unknown as NaturalEvent | null
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!supabase && !!id,
  })
}
