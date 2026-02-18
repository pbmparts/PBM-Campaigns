import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useModal } from '../../Components/Modal/useModal'
import Campane from '../../Components/Campane/Campane'
import './Admin.css'

export default function Admin() {
  const [campaigns, setCampaigns] = useState([])
  const [name, setName] = useState('')
  const [filter, setFilter] = useState('active')
  const [packages, setPackages] = useState([])
  const { showAlert } = useModal()

  const fetchCampaigns = async () => {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) setCampaigns(data)
    else console.log(error)
  }

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const addPackageRow = () => {
    setPackages(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: '',
        min_qty: '',
        discount_percent: ''
      }
    ])
  }

  const updatePackage = (id, field, value) => {
    setPackages(prev =>
      prev.map(p => (p.id === id ? { ...p, [field]: value } : p))
    )
  }

  const removePackage = (id) => {
    setPackages(prev => prev.filter(p => p.id !== id))
  }

  const handleCreateCampaign = async (e) => {
    e.preventDefault()
    if (!name.trim()) return

    const slug = name.trim().replace(/\s+/g, '-').toLowerCase()

    const { data: campaignRow, error: campErr } = await supabase
      .from('campaigns')
      .insert([{ name: name.trim(), slug, status: 'active' }])
      .select()
      .single()

    if (campErr) {
      console.log(campErr)
      await showAlert({ message: 'خطا در ساخت کمپین' })
      return
    }

    const cleanedPackages = packages
      .map(p => ({
        campaign_id: campaignRow.id,
        title: (p.title || '').trim(),
        min_qty: Number(p.min_qty),
        discount_percent: Number(p.discount_percent)
      }))
      .filter(p =>
        p.title &&
        Number.isFinite(p.min_qty) && p.min_qty > 0 &&
        Number.isFinite(p.discount_percent) && p.discount_percent > 0 && p.discount_percent <= 100
      )

    if (cleanedPackages.length > 0) {
      const { error: pkgErr } = await supabase
        .from('campaign_packages')
        .insert(cleanedPackages)

      if (pkgErr) {
        console.log(pkgErr)
        await showAlert({ message: 'کمپین ساخته شد ولی ذخیره پکیج‌ها با خطا مواجه شد' })
      }
    }

    setName('')
    setPackages([])
    fetchCampaigns()
  }

  const filteredCampaigns = campaigns.filter((c) => c.status === filter)

  return (
    <div className='admin'>
      <div className="logo">
        <img src="/images/logo.png" alt="" />
      </div>

      <form onSubmit={handleCreateCampaign} className='admin-campane-form'>
        <input
          id='campane-name-input'
          className='glass'
          type="text"
          placeholder='نام کمپین را وارد کنید:'
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="campane-packages">
          <button
            type="button"
            className='campane-packages-add'
            onClick={addPackageRow}
          >
            <img src="/images/plus.svg" alt="" />
            <span>اضافه کردن پکیج جدید</span>
          </button>

          <div className="campane-packages-list">
            {packages.map(pkg => (
              <div key={pkg.id} className="campane-packages-item">
                <div className="row">
                  <input
                    type="text"
                    placeholder='نام پکیج'
                    className='campane-packages-item-name campane-packages-item-input'
                    value={pkg.title}
                    onChange={(e) => updatePackage(pkg.id, 'title', e.target.value)}
                  />

                  <button
                    type="button"
                    className='campane-packages-item-delete'
                    onClick={() => removePackage(pkg.id)}
                  >
                    <img src="/images/trash.svg" alt="" />
                  </button>
                </div>

                <div className="row">
                  <input
                    type="number"
                    className='campane-packages-item-minbuy campane-packages-item-input'
                    placeholder='حداقل خرید'
                    value={pkg.min_qty}
                    onChange={(e) => updatePackage(pkg.id, 'min_qty', e.target.value)}
                  />

                  <input
                    type="number"
                    className='campane-packages-item-discount campane-packages-item-input'
                    placeholder='مقدار تخفیف (%)'
                    value={pkg.discount_percent}
                    onChange={(e) => updatePackage(pkg.id, 'discount_percent', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <button type="submit">ساخت کمپین جدید</button>
      </form>

      <div className="admin-campane glass">
        <div className="admin-campane-selector">
          <a onClick={() => setFilter('active')}>درحال برگذاری</a>
          <a onClick={() => setFilter('ended')}>به اتمام رسیده</a>
        </div>

        <div className="admin-campane-list">
          {filteredCampaigns.map(c => (
            <Campane
              key={c.id}
              campaign={c}
              refresh={fetchCampaigns}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

