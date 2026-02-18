import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useModal } from '../../Components/Modal/useModal'
import CampaignEnded from '../../Components/CampaignEnded/CampaignEnded'
import Product from './../../Components/Product/Product'
import { products } from '../../data/products'
import './CampaignPage.css'

const toCurrency = (value) => Number(value || 0).toLocaleString('fa-IR')
const PHONE_REGEX = /^09\d{9}$/

const calculateOrderSummary = (totalItems, subTotal, packages) => {
  if (totalItems <= 0 || subTotal <= 0 || !packages.length) {
    return {
      discountAmount: 0,
      payableAmount: Math.max(0, subTotal),
      activePackage: packages[0] || null,
      remainingToNext: packages[0]?.min_qty || 0,
      packageProgress: 0
    }
  }

  const achievedPackageIndex = packages.reduce((acc, pkg, index) => {
    return totalItems >= pkg.min_qty ? index : acc
  }, -1)
  const achievedPackage = achievedPackageIndex >= 0 ? packages[achievedPackageIndex] : null
  const discountAmount = achievedPackage
    ? subTotal * (achievedPackage.discount_percent / 100)
    : 0

  const nextPackageIndex = packages.findIndex((pkg) => totalItems < pkg.min_qty)
  const activePackageIndex = nextPackageIndex === -1 ? packages.length - 1 : nextPackageIndex
  const activePackage = packages[activePackageIndex]

  const prevPkg = packages[activePackageIndex - 1]
  const fromQty = prevPkg?.min_qty || 0
  const toQty = activePackage?.min_qty || fromQty
  const range = Math.max(1, toQty - fromQty)
  const clamped = Math.min(Math.max(totalItems - fromQty, 0), range)
  const packageProgress = nextPackageIndex === -1 ? 100 : (clamped / range) * 100
  const remainingToNext = nextPackageIndex === -1 ? 0 : Math.max(0, toQty - totalItems)

  return {
    discountAmount,
    payableAmount: Math.max(0, subTotal - discountAmount),
    activePackage,
    remainingToNext,
    packageProgress
  }
}

export default function CampaignPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { slug } = useParams()
  const { showAlert } = useModal()

  const orderIdFromState = location.state?.orderId
  const userFromState = location.state?.userInfo
  const campaignIdFromState = location.state?.campaignId

  const [orderId, setOrderId] = useState(orderIdFromState || null)
  const [userName] = useState(userFromState?.name || '')
  const [userPhone] = useState(userFromState?.phone || '')

  const [quantities, setQuantities] = useState({})
  const [campaignPackages, setCampaignPackages] = useState([])
  const [campaignStatus, setCampaignStatus] = useState('loading')
  const [loading, setLoading] = useState(false)
  const [itemsLoaded, setItemsLoaded] = useState(false)

  const totalItems = Object.values(quantities)
    .reduce((sum, qty) => sum + (Number(qty) || 0), 0)

  const subTotal = useMemo(() => {
    return products.reduce((sum, product) => {
      const qty = Number(quantities[product.id]) || 0
      return sum + (qty * Number(product.price || 0))
    }, 0)
  }, [quantities])

  const orderSummary = useMemo(() => {
    return calculateOrderSummary(totalItems, subTotal, campaignPackages)
  }, [totalItems, subTotal, campaignPackages])

  useEffect(() => {
    if (campaignStatus !== 'active') return
    if (!orderId || !userName || !userPhone) {
      navigate(`/c/${slug}`)
    }
  }, [campaignStatus, orderId, userName, userPhone, navigate, slug])

  useEffect(() => {
    const fetchCampaignStatus = async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('status')
        .eq('slug', slug.toLowerCase())
        .maybeSingle()

      if (error || !data) {
        setCampaignStatus('missing')
        return
      }

      setCampaignStatus(data.status || 'missing')
    }

    fetchCampaignStatus()
  }, [slug])

  useEffect(() => {
    if (!campaignIdFromState) return

    const fetchPackages = async () => {
      const { data, error } = await supabase
        .from('campaign_packages')
        .select('title,min_qty,discount_percent')
        .eq('campaign_id', campaignIdFromState)
        .order('min_qty', { ascending: true })

      if (error) {
        console.log(error)
        return
      }

      const normalized = (data || [])
        .map((pkg) => ({
          title: (pkg.title || '').trim(),
          min_qty: Number(pkg.min_qty),
          discount_percent: Number(pkg.discount_percent)
        }))
        .filter((pkg) =>
          pkg.title &&
          Number.isFinite(pkg.min_qty) && pkg.min_qty > 0 &&
          Number.isFinite(pkg.discount_percent) && pkg.discount_percent > 0
        )

      setCampaignPackages(normalized)
    }

    fetchPackages()
  }, [campaignIdFromState])

  useEffect(() => {
    if (!orderId) {
      setItemsLoaded(true)
      return
    }

    const fetchOrderItems = async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('product,quantity')
        .eq('order_id', orderId)

      if (error) {
        console.log(error)
        setItemsLoaded(true)
        return
      }

      const nextQuantities = {}
      for (const item of data || []) {
        const product = products.find((p) => p.name === item.product)
        if (!product) continue
        nextQuantities[product.id] = Number(item.quantity) || 0
      }

      setQuantities(nextQuantities)
      setItemsLoaded(true)
    }

    fetchOrderItems()
  }, [orderId])

  const syncOrderItems = useCallback(async (nextQuantities, targetOrderId = orderId) => {
    if (!targetOrderId) return null

    const selected = products
      .filter((p) => Number(nextQuantities[p.id]) > 0)
      .map((p) => ({
        id: crypto.randomUUID(),
        order_id: targetOrderId,
        product: p.name,
        quantity: Number(nextQuantities[p.id])
      }))

    const { error: deleteError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', targetOrderId)

    if (deleteError) {
      return deleteError
    }

    if (!selected.length) return null

    const { error: insertError } = await supabase
      .from('order_items')
      .insert(selected)

    return insertError || null
  }, [orderId])

  useEffect(() => {
    if (!orderId || !itemsLoaded) return

    const sync = async () => {
      const error = await syncOrderItems(quantities)
      if (error) {
        console.log(error)
      }
    }

    sync()
  }, [quantities, orderId, itemsLoaded, syncOrderItems])

  const handleQuantityChange = (id, value) => {
    const nextValue = Math.max(0, Number(value) || 0)
    setQuantities(prev => ({
      ...prev,
      [id]: nextValue
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!userName.trim() || !userPhone.trim()) {
        await showAlert({ message: 'لطفا نام و شماره تماس را وارد کنيد' })
        setLoading(false)
        return
      }

      if (!PHONE_REGEX.test(userPhone)) {
        await showAlert({ message: 'شماره تماس بايد با 09 شروع شود و 11 رقم باشد' })
        setLoading(false)
        return
      }

      const selected = products.filter(p => Number(quantities[p.id]) > 0)
      if (!selected.length) {
        await showAlert({ message: 'هيچ محصولي انتخاب نشده' })
        setLoading(false)
        return
      }

      let finalOrderId = orderId
      if (!orderId) {
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .insert({
            campaign_id: location.state?.campaignId,
            user_name: userName,
            phone: userPhone,
            status: 'draft'
          })
          .select()
          .single()

        if (orderError) {
          console.log(orderError)
          await showAlert({ message: 'خطا در ايجاد سفارش اصلي' })
          setLoading(false)
          return
        }

        finalOrderId = orderData.id
        setOrderId(finalOrderId)
      }

      const syncError = await syncOrderItems(quantities, finalOrderId)
      if (syncError) {
        console.log(syncError)
        await showAlert({ message: `خطا در ثبت آيتم‌ها: ${syncError.message}` })
        setLoading(false)
        return
      }

      const { error: statusError } = await supabase
        .from('orders')
        .update({ status: 'submitted' })
        .eq('id', finalOrderId)

      if (statusError) {
        console.log(statusError)
        await showAlert({ message: `خطا در نهايي‌سازي سفارش: ${statusError.message}` })
        setLoading(false)
        return
      }

      await showAlert({ title: 'موفق', message: 'سفارش با موفقيت ثبت شد!' })
      navigate(`/c/${slug}/thanks`, {
        state: {
          orderSummary: {
            totalItems,
            subTotal,
            discountAmount: orderSummary.discountAmount,
            payableAmount: orderSummary.payableAmount
          }
        }
      })
    } catch (err) {
      console.log(err)
      await showAlert({ message: 'خطا در ثبت سفارش' })
    } finally {
      setLoading(false)
    }
  }

  if (campaignStatus === 'loading') {
    return <div>در حال بارگذاري...</div>
  }

  if (campaignStatus !== 'active') {
    return <CampaignEnded />
  }

  return (
    <>
      <div className='products-container'>
        <div className='products'>
          <img src="/images/logo.png" alt="" />
          <div className="products-form glass">
            <div className="products-form-title">
              محصولات مورد نظر خود را انتخاب کنيد:
            </div>

            <div className="products-form-list">
              {products.map(product => (
                <Product
                  key={product.id}
                  product={product}
                  quantity={quantities[product.id] || 0}
                  onChange={handleQuantityChange}
                />
              ))}
            </div>
          </div>
        </div>

        <div className='products-footer'>
          <div className="footer-progressbar">
            <div className="progress-bar-title">
              {!campaignPackages.length && 'براي اين کمپين هنوز پکيجي تعريف نشده است'}
              {!!campaignPackages.length && orderSummary.remainingToNext > 0 && (
                `${orderSummary.remainingToNext.toLocaleString('fa-IR')} قطعه ديگر تا ${orderSummary.activePackage?.title} (${orderSummary.activePackage?.discount_percent}% تخفيف)`
              )}
              {!!campaignPackages.length && orderSummary.remainingToNext === 0 && (
                `شما به آخرين پکيج (${orderSummary.activePackage?.title}) رسيديد`
              )}
            </div>
            <div className='row'>
              <div className='progress-bar'>
                <div
                  className='progress-bar-fill'
                  style={{ width: `${orderSummary.packageProgress}%` }}
                />
              </div>
              <div className="progress-bar-goal">{orderSummary.activePackage?.title || '-'}</div>
            </div>
            <div className='progress-bar-summary'>
              تخفيف فعلي: {toCurrency(orderSummary.discountAmount)} تومان
            </div>
          </div>

          <button onClick={handleSubmit} disabled={loading || totalItems < 12}>
            {loading ? 'در حال ثبت...' : `ثبت نهايي سفارش (${totalItems.toLocaleString('fa-IR')} محصول)`}
          </button>
        </div>
      </div>
    </>
  )
}


