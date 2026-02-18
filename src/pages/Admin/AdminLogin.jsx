import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useModal } from '../../Components/Modal/useModal'
import { isAdminUser } from '../../lib/adminAuth'
import './AdminLogin.css'

export default function AdminLogin() {
  const navigate = useNavigate()
  const { showAlert } = useModal()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const checkCurrentUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (isAdminUser(data?.user)) {
        navigate('/admin', { replace: true })
      }
    }

    checkCurrentUser()
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      await showAlert({ message: 'ایمیل و رمز عبور را کامل وارد کنید' })
      return
    }

    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    })

    if (error) {
      setLoading(false)
      await showAlert({ message: 'ورود ناموفق بود. اطلاعات ورود را بررسی کنید' })
      return
    }

    if (!isAdminUser(data?.user)) {
      await supabase.auth.signOut()
      setLoading(false)
      await showAlert({ message: 'این حساب دسترسی ادمین ندارد' })
      return
    }

    setLoading(false)
    navigate('/admin', { replace: true })
  }

  return (
    <div className="admin-login">
      <img src="/images/logo.png" alt="" />

      <form onSubmit={handleSubmit} className="admin-login-form glass">
        <label>ورود ادمین</label>

        <input
          type="email"
          placeholder="ایمیل ادمین"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />

        <input
          type="password"
          placeholder="رمز عبور"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <button type="submit" disabled={loading}>
          {loading ? 'در حال ورود...' : 'ورود'}
        </button>
      </form>
    </div>
  )
}
