import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { isAdminUser } from '../../lib/adminAuth'

export default function AdminRoute({ children }) {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let mounted = true

    const checkAccess = async () => {
      const { data } = await supabase.auth.getUser()
      const canAccess = isAdminUser(data?.user)

      if (!mounted) return
      setStatus(canAccess ? 'allowed' : 'blocked')
    }

    checkAccess()

    return () => {
      mounted = false
    }
  }, [])

  if (status === 'checking') {
    return <div>در حال بررسی دسترسی...</div>
  }

  if (status === 'blocked') {
    return <Navigate to="/admin/login" replace />
  }

  return children
}
