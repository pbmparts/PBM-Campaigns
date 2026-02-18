const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase()

export function isAdminUser(user) {
  if (!user) return false

  const role = user.app_metadata?.role
  if (role === 'admin') return true

  if (ADMIN_EMAIL && user.email?.toLowerCase() === ADMIN_EMAIL) return true

  return false
}
