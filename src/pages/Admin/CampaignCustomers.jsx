import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useModal } from '../../Components/Modal/useModal'
import * as XLSX from 'xlsx'
import './CampaignCustomers.css'

export default function CampaignCustomers() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showAlert } = useModal()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [customers, setCustomers] = useState([])
  const [expandedCustomerKey, setExpandedCustomerKey] = useState('')
  const [customerDownloadKey, setCustomerDownloadKey] = useState('')

  const sanitizeFileName = (value) => String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')

  const buildCustomerRows = (orders) => {
    const grouped = new Map()

    ;(orders || []).forEach((order) => {
      const normalizedItems = (order.order_items || [])
        .map((item) => ({
          product: item.product,
          quantity: Number(item.quantity || 0)
        }))
        .filter((item) => item.product && item.quantity > 0)

      if (!normalizedItems.length) return

      const key = `${order.phone || ''}::${order.user_name || ''}`

      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          user_name: order.user_name || '-',
          phone: order.phone || '-',
          total_qty: 0,
          items_map: new Map()
        })
      }

      const row = grouped.get(key)

      normalizedItems.forEach((item) => {
        row.total_qty += item.quantity
        row.items_map.set(item.product, (row.items_map.get(item.product) || 0) + item.quantity)
      })
    })

    return Array.from(grouped.values())
      .map((row) => ({
        key: row.key,
        user_name: row.user_name,
        phone: row.phone,
        total_qty: row.total_qty,
        items: Array.from(row.items_map.entries())
          .map(([product, quantity]) => ({ product, quantity }))
          .sort((a, b) => a.product.localeCompare(b.product, 'fa'))
      }))
      .sort((a, b) => a.user_name.localeCompare(b.user_name, 'fa'))
  }

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError('')

      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select('name')
        .eq('id', id)
        .maybeSingle()

      if (campaignError || !campaignData) {
        console.log(campaignError)
        setError('کمپین پیدا نشد')
        setLoading(false)
        return
      }

      setCampaignName(campaignData.name || '-')

      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select(`
          user_name,
          phone,
          order_items!order_items_order_id_fkey (
            product,
            quantity
          )
        `)
        .eq('campaign_id', id)

      if (ordersError) {
        console.log(ordersError)
        setError('خطا در دریافت لیست خریداران')
        setLoading(false)
        return
      }

      setCustomers(buildCustomerRows(ordersData))
      setLoading(false)
    }

    fetchData()
  }, [id])

  const handleDownloadCustomer = async (customer) => {
    if (!customer?.items?.length) return
    setCustomerDownloadKey(customer.key)

    try {
      const rows = customer.items.map((item) => ({
        campaign_name: campaignName,
        user_name: customer.user_name,
        phone: customer.phone,
        product: item.product,
        quantity: item.quantity
      }))

      const worksheet = XLSX.utils.json_to_sheet(rows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'CustomerOrders')

      const safeCampaign = sanitizeFileName(campaignName)
      const safeCustomer = sanitizeFileName(customer.user_name || customer.phone || 'customer')
      XLSX.writeFile(workbook, `${safeCampaign}_${safeCustomer}_Orders.xlsx`)
    } catch (err) {
      console.log(err)
      await showAlert({ message: 'خطا در دانلود فایل شخصی' })
    } finally {
      setCustomerDownloadKey('')
    }
  }

  return (
    <div className='admin-campaign-customers'>
      <div className="logo">
        <img src="/images/logo.png" alt="" />
      </div>

      <div className='admin-campaign-customers-card glass'>
        <div className='admin-campaign-customers-top'>
          <button
            className='admin-campaign-customers-back'
            onClick={() => navigate('/admin')}
          >
            بازگشت
          </button>

          <div className='admin-campaign-customers-title'>
            خریداران کمپین: {campaignName || '-'}
          </div>
        </div>

        {loading && <div className='admin-campaign-customers-empty'>در حال دریافت لیست...</div>}
        {!loading && error && <div className='admin-campaign-customers-empty'>{error}</div>}

        {!loading && !error && customers.length === 0 && (
          <div className='admin-campaign-customers-empty'>خریدی برای این کمپین ثبت نشده است</div>
        )}

        {!loading && !error && customers.length > 0 && (
          <div className='admin-campaign-customers-list'>
            {customers.map((customer) => (
              <div className='admin-campaign-customer-item' key={customer.key}>
                <div className='admin-campaign-customer-header'>
                  <button
                    className='admin-campaign-customer-toggle'
                    onClick={() => setExpandedCustomerKey((prev) => (prev === customer.key ? '' : customer.key))}
                  >
                    <span>{customer.user_name}</span>
                  </button>

                  <button
                    className='admin-campaign-customer-download'
                    onClick={() => handleDownloadCustomer(customer)}
                    disabled={customerDownloadKey === customer.key}
                  >
                    {customerDownloadKey === customer.key ? '...' : 'دانلود تکی'}
                  </button>
                </div>

                {expandedCustomerKey === customer.key && (
                  <div className='admin-campaign-customer-items'>
                    {customer.items.map((item) => (
                      <div className='admin-campaign-customer-items-row' key={`${customer.key}-${item.product}`}>
                        <span>{item.product}</span>
                        <span>{Number(item.quantity).toLocaleString('fa-IR')} عدد</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
