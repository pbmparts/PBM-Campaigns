import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import './PaymentChoice.css'

const toCurrency = (value) => Number(value || 0).toLocaleString('fa-IR')
const COMPANY_NAME = 'شرکت ماشین سازی پولادگران'

export default function PaymentChoice() {
  const navigate = useNavigate()
  const location = useLocation()
  const { slug } = useParams()

  const [loading, setLoading] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [paymentType, setPaymentType] = useState('')
  const [items, setItems] = useState([])

  const orderId = location.state?.orderId
  const orderSummary = location.state?.orderSummary
  const userInfo = location.state?.userInfo
  const campaignId = location.state?.campaignId
  const achievedPackage = orderSummary?.achievedPackage || null
  const subTotal = Number(orderSummary?.subTotal || 0)

  const cashDiscountPercent = Number(achievedPackage?.cash_discount_percent || 0)
  const checkDiscountPercent = Number(achievedPackage?.check_discount_percent || 0)
  const cashDiscountAmount = subTotal * (cashDiscountPercent / 100)
  const checkDiscountAmount = subTotal * (checkDiscountPercent / 100)
  const extraCashBenefit = Math.max(0, cashDiscountAmount - checkDiscountAmount)

  const selectedSummary = useMemo(() => {
    const selectedDiscountAmount = paymentType === 'check'
      ? checkDiscountAmount
      : paymentType === 'cash'
        ? cashDiscountAmount
        : 0

    return {
      totalItems: Number(orderSummary?.totalItems || 0),
      subTotal,
      discountAmount: selectedDiscountAmount,
      payableAmount: Math.max(0, subTotal - selectedDiscountAmount),
      paymentType
    }
  }, [cashDiscountAmount, checkDiscountAmount, orderSummary?.totalItems, paymentType, subTotal])

  useEffect(() => {
    if (!orderId || !orderSummary) {
      navigate(`/c/${slug}`, { replace: true })
    }
  }, [navigate, orderId, orderSummary, slug])

  useEffect(() => {
    if (!orderId || !campaignId) return

    const fetchItems = async () => {
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('product,quantity')
        .eq('order_id', orderId)

      if (itemsError) {
        console.log(itemsError)
        return
      }

      const { data: productsData, error: productsError } = await supabase
        .from('campaign_products')
        .select('name,base_price')
        .eq('campaign_id', campaignId)

      if (productsError) {
        console.log(productsError)
      }

      const priceMap = new Map((productsData || []).map((p) => [p.name, Number(p.base_price || 0)]))

      const normalized = (orderItems || []).map((item) => {
        const unitPrice = priceMap.get(item.product) || 0
        const quantity = Number(item.quantity || 0)
        return {
          product: item.product,
          quantity,
          unitPrice,
          total: unitPrice * quantity
        }
      })

      setItems(normalized)
    }

    fetchItems()
  }, [campaignId, orderId])

  if (!orderId || !orderSummary) return null

  const handleDownloadProforma = async () => {
    if (!paymentType || downloadLoading) return

    setDownloadLoading(true)
    let container = null

    try {
      const paymentLabel = paymentType === 'cash' ? 'نقدی' : 'چکی'
      const rowsHtml = (items.length ? items : [{ product: '-', quantity: 0, unitPrice: 0, total: 0 }])
        .map((item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${item.product}</td>
            <td>${Number(item.quantity || 0).toLocaleString('fa-IR')}</td>
            <td>${toCurrency(item.unitPrice)} تومان</td>
            <td>${toCurrency(item.total)} تومان</td>
          </tr>
        `)
        .join('')

      container = document.createElement('div')
      container.style.position = 'fixed'
      container.style.top = '0'
      container.style.left = '0'
      container.style.zIndex = '-9999'
      container.style.opacity = '1'
      container.style.width = '760px'
      container.style.background = '#fff'
      container.style.color = '#111'
      container.style.padding = '20px'
      container.style.direction = 'rtl'
      container.style.fontFamily = 'Tahoma, Arial, sans-serif'
      container.innerHTML = `
        <div style="border:1px solid #ddd; border-radius:12px; padding:18px;">
          <h2 style="margin:0 0 8px; text-align:center;">پیش فاکتور</h2>
          <div style="text-align:center; font-size:16px; font-weight:700; margin-bottom:16px;">${COMPANY_NAME}</div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:13px; margin-bottom:16px;">
            <div><strong>نام مشتری:</strong> ${userInfo?.name || '-'}</div>
            <div><strong>نوع خرید:</strong> ${paymentLabel}</div>
            <div><strong>شماره سفارش:</strong> ${orderId}</div>
          </div>

          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead>
              <tr>
                <th style="border:1px solid #ddd; padding:6px;">ردیف</th>
                <th style="border:1px solid #ddd; padding:6px;">نام کالا</th>
                <th style="border:1px solid #ddd; padding:6px;">تعداد</th>
                <th style="border:1px solid #ddd; padding:6px;">قیمت واحد</th>
                <th style="border:1px solid #ddd; padding:6px;">قیمت کل</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>

          <div style="margin-top:16px; text-align:left; font-size:13px;">
            <div><strong>جمع کل:</strong> ${toCurrency(selectedSummary.subTotal)} تومان</div>
            <div><strong>سود:</strong> ${toCurrency(selectedSummary.discountAmount)} تومان</div>
            <div style="font-size:15px; font-weight:700; margin-top:6px;">
              مبلغ نهایی قابل پرداخت: ${toCurrency(selectedSummary.payableAmount)} تومان
            </div>
          </div>
        </div>
      `

      document.body.appendChild(container)
      if (document.fonts?.ready) {
        await document.fonts.ready
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      })

      const imgData = canvas.toDataURL('image/png')
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 20
      const renderWidth = pageWidth - (margin * 2)
      const renderHeight = (canvas.height * renderWidth) / canvas.width

      if (renderHeight <= pageHeight - (margin * 2)) {
        doc.addImage(imgData, 'PNG', margin, margin, renderWidth, renderHeight)
      } else {
        let yOffset = 0
        const printableHeight = pageHeight - (margin * 2)
        let remaining = renderHeight

        while (remaining > 0) {
          doc.addImage(imgData, 'PNG', margin, margin - yOffset, renderWidth, renderHeight)
          remaining -= printableHeight
          yOffset += printableHeight
          if (remaining > 0) doc.addPage()
        }
      }

      doc.save(`Proforma_${orderId}.pdf`)
    } catch (err) {
      console.log(err)
    } finally {
      if (container && document.body.contains(container)) {
        document.body.removeChild(container)
      }
      setDownloadLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (loading || !paymentType) return
    setLoading(true)

    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'submitted', payment_type: paymentType })
        .eq('id', orderId)

      if (error) {
        const fallback = await supabase
          .from('orders')
          .update({ status: 'submitted' })
          .eq('id', orderId)

        if (fallback.error) {
          console.log(fallback.error)
          setLoading(false)
          return
        }
      }

      navigate(`/c/${slug}/thanks`, {
        state: {
          orderSummary: selectedSummary
        },
        replace: true
      })
    } catch (err) {
      console.log(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='payment-choice'>
      <img src="/images/logo.png" alt="Logo" />

      <div className='payment-choice-card glass'>
        <h1>نوع خرید را انتخاب کنید</h1>

        <div className='payment-options'>
          <button
            className={paymentType === 'cash' ? 'payment-option active' : 'payment-option'}
            onClick={() => setPaymentType('cash')}
          >
            خرید نقدی
          </button>
          <button
            className={paymentType === 'check' ? 'payment-option active' : 'payment-option'}
            onClick={() => setPaymentType('check')}
          >
            خرید چکی
          </button>
        </div>

        {paymentType === 'check' && extraCashBenefit > 0 && (
          <div className='payment-cash-hint'>
            با خرید نقدی {toCurrency(extraCashBenefit)} تومان سود بیشتری می‌گیری
          </div>
        )}

        <div className='payment-choice-summary'>
          <p>جمع خرید: {toCurrency(subTotal)} تومان</p>
          <p>سود این روش: {toCurrency(selectedSummary.discountAmount)} تومان</p>
          <p>مبلغ قابل پرداخت: {toCurrency(selectedSummary.payableAmount)} تومان</p>
          {!paymentType && <p>ابتدا نوع خرید را انتخاب کنید</p>}
        </div>

        <button
          className='payment-download-btn'
          onClick={handleDownloadProforma}
          disabled={downloadLoading || !paymentType}
        >
          {downloadLoading ? 'در حال آماده‌سازی...' : 'دانلود پیش‌فاکتور PDF'}
        </button>

        <button
          className='payment-confirm-btn'
          onClick={handleConfirm}
          disabled={loading || !paymentType}
        >
          {loading ? 'در حال ثبت...' : 'تایید و ثبت نهایی سفارش'}
        </button>
      </div>
    </div>
  )
}
