import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jaxzghosalfjmconowgm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eQQaWNyP0wswrsy98OD_uw_2nlFz4-e';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
