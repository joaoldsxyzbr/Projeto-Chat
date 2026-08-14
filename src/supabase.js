import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kelduozimaksstwfpvbw.supabase.co'
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_PhGA2Zjtbfio3uLb-KUSng_ymtQ9Z6j'

export const supabase = createClient(supabaseUrl, supabasePublishableKey)
