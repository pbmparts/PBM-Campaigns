import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useModal } from '../../Components/Modal/useModal'
import CampaignEnded from '../../Components/CampaignEnded/CampaignEnded'
import './Welcome.css'

const PHONE_REGEX = /^09\d{9}$/

export default function Welcome() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { showAlert } = useModal()

  const [campaign, setCampaign] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    phone: ''
  })

  useEffect(() => {
    const fetchCampaign = async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('slug', slug.toLowerCase())
        .maybeSingle()

      if (!error && data) {
        setCampaign(data)
      }
    }

    fetchCampaign()
  }, [slug])

  const handleChange = (e) => {
    const { name, value } = e.target
    const nextValue = name === 'phone'
      ? value.replace(/\D/g, '').slice(0, 11)
      : value

    setFormData({
      ...formData,
      [name]: nextValue
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!campaign) {
      await showAlert({ message: 'کمپین پیدا نشد' })
      return
    }

    if (!formData.name || !formData.phone) {
      await showAlert({ message: 'لطفاً اطلاعات را کامل وارد کنید' })
      return
    }

    if (!PHONE_REGEX.test(formData.phone)) {
      await showAlert({ message: 'شماره تماس باید با 09 شروع شود و 11 رقم باشد' })
      return
    }

    const { data, error } = await supabase
      .from('orders')
      .insert([
        {
          campaign_id: campaign.id,
          user_name: formData.name,
          phone: formData.phone
        }
      ])
      .select()
      .single()

    if (error) {
      await showAlert({ message: 'خطا در ایجاد سفارش' })
      console.log(error)
      return
    }

    navigate(`/c/${slug}/products`, {
      state: {
        orderId: data.id,
        userInfo: { name: formData.name, phone: formData.phone },
        campaignId: data.campaign_id
      }
    })
  }

  const handlePhoneBlur = async () => {
    if (!formData.phone) return
    if (!PHONE_REGEX.test(formData.phone)) {
      await showAlert({ message: 'شماره تماس باید با 09 شروع شود و 11 رقم باشد' })
    }
  }

  if (!campaign) return <div>در حال بارگذاری...</div>

  if (campaign.status !== 'active') {
    return <CampaignEnded />
  }

  return (
    <div className='welcome'>
      <img src="/images/logo.png" alt="" />

      <form onSubmit={handleSubmit} noValidate className="welcome-form glass">
        <label>لطفا اطلاعات زیر را وارد کنید:</label>

        <div className='welcome-input-box'>
          <input
            type="text"
            name="name"
            placeholder='نام و نام خانوادگی'
            value={formData.name}
            onChange={handleChange}
            id='welcome-name'
          />
        </div>

        <div className='welcome-input-box'>
          <input
            type="tel"
            name="phone"
            placeholder='شماره تماس'
            value={formData.phone}
            onChange={handleChange}
            onBlur={handlePhoneBlur}
            id='welcome-phone'
            inputMode="numeric"
            maxLength={11}
          />
        </div>

        <button type="submit">
          ورود به صفحه محصولات
        </button>
      </form>
    </div>
  )
}
