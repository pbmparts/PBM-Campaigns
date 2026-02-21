import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useModal } from '../Modal/useModal'
import * as XLSX from 'xlsx'
import './Campane.css'

export default function Campane({ campaign, refresh }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const { showAlert, showConfirm } = useModal()

  const handleEnd = async () => {
    if (loading) return
    setLoading(true)

    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'ended' })
      .eq('id', campaign.id)

    setLoading(false)

    if (!error) {
      refresh()
    } else {
      await showAlert({ message: 'خطا در پایان کمپین' })
      console.log(error)
    }
  }

  const handleDelete = async () => {
    if (loading) return

    const confirmDelete = await showConfirm({
      title: 'حذف کمپین',
      message: 'از حذف این کمپین مطمئن هستید؟',
      confirmText: 'بله حذف شود',
      cancelText: 'انصراف'
    })

    if (!confirmDelete) return

    setLoading(true)

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaign.id)

    setLoading(false)

    if (!error) {
      refresh()
    } else {
      await showAlert({ message: 'خطا در حذف کمپین' })
      console.log(error)
    }
  }

  const handleDownload = async () => {
    if (downloadLoading) return
    setDownloadLoading(true)

    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          user_name,
          phone,
          order_items!order_items_order_id_fkey (
            product,
            quantity
          )
        `)
        .eq('campaign_id', campaign.id)

      if (error) {
        console.log(error)
        await showAlert({ message: 'خطا در دریافت سفارش‌ها' })
        setDownloadLoading(false)
        return
      }

      if (!data || data.length === 0) {
        await showAlert({ message: 'سفارشی برای دانلود موجود نیست' })
        setDownloadLoading(false)
        return
      }

      const rows = []

      data.forEach((order) => {
        ;(order.order_items || []).forEach((item) => {
          if (Number(item.quantity || 0) <= 0) return
          rows.push({
            campaign_name: campaign.name,
            user_name: order.user_name,
            phone: order.phone,
            product: item.product,
            quantity: item.quantity
          })
        })
      })

      if (rows.length === 0) {
        await showAlert({ message: 'سفارشی برای دانلود موجود نیست' })
        setDownloadLoading(false)
        return
      }

      const worksheet = XLSX.utils.json_to_sheet(rows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders')

      XLSX.writeFile(workbook, `${campaign.name}_Orders.xlsx`)
    } catch (err) {
      console.log(err)
      await showAlert({ message: 'خطا در دانلود اکسل' })
    } finally {
      setDownloadLoading(false)
    }
  }

  return (
    <div className='campane-item'>
      <div className="campane-item-status">
        {campaign.status === 'active'
          ? <img src="/images/isOnline.png" alt="" />
          : '🔴'}
      </div>

      <div
        className="camapne-item-title"
        onClick={() => navigate(`/admin/campaign/${campaign.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            navigate(`/admin/campaign/${campaign.id}`)
          }
        }}
      >
        {campaign.name}
        <span className='campane-item-title-hint'>
          مشاهده لیست خریداران
        </span>
      </div>

      <div className="campane-item-btns">
        <button
          className={campaign.status !== 'active' ? 'campane-item-end campane-item-disable' : 'campane-item-end'}
          onClick={handleEnd}
          disabled={loading || campaign.status !== 'active'}
        >
          {loading
            ? 'در حال پردازش...'
            : campaign.status !== 'active'
              ? 'کمپین تموم شده است'
              : 'پایان کمپین'
          }
        </button>

        <button
          className='campane-item-download'
          onClick={handleDownload}
          disabled={downloadLoading || !campaign.status === 'active'}
        >
          {downloadLoading ? 'در حال آماده‌سازی...' : <img src="/images/download.svg" width={25} alt="" />}
        </button>

        <button
          className='campane-item-delete'
          onClick={handleDelete}
          disabled={loading}
        >
          {loading ? '...' : <img src="/images/trash.svg" alt="" />}
        </button>
      </div>
    </div>
  )
}
