import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xubqzdxagybgpkpxlzar.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1YnF6ZHhhZ3liZ3BrcHhsemFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMzM2MTgsImV4cCI6MjA4NjYwOTYxOH0.UGgBIgpYPWWEM68eOfaue8Uq7oQFWpw8JTGC6dCHYq0'

export const supabase = createClient(supabaseUrl, supabaseKey)
