import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useModal } from '../../Components/Modal/useModal'
import CampaignEnded from '../../Components/CampaignEnded/CampaignEnded'
import Product from './../../Components/Product/Product'
import { products as fallbackProducts } from '../../data/products'
import './CampaignPage.css'

const toCurrency = (value) => Number(value || 0).toLocaleString('fa-IR')
const PHONE_REGEX = /^09\d{9}$/
const toBenefitText = (amount) => {
  const safeAmount = Math.max(0, Number(amount) || 0)
  if (safeAmount >= 1000000) {
    const million = Math.max(1, Math.floor(safeAmount / 1000000))
    return `${million.toLocaleString('fa-IR')} میلیون سود بیشتر`
  }
  return `${toCurrency(safeAmount)} تومان سود بیشتر`
}

const isMissingTableError = (error, tableName) => {
  const message = String(error?.message || '').toLowerCase()
  const details = String(error?.details || '').toLowerCase()
  return error?.code === 'PGRST205' || message.includes(tableName) || details.includes(tableName)
}

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
  const discountAmount = achievedPackage ? subTotal * (achievedPackage.discount_percent / 100) : 0

  const nextPackageIndex = packages.findIndex((pkg) => totalItems < pkg.min_qty)
  const activePackageIndex = nextPackageIndex === -1 ? packages.length - 1 : nextPackageIndex
  const activePackage = packages[activePackageIndex]
  const nextTargetQty = Number(activePackage?.min_qty) || 0

  const packageProgress = nextPackageIndex === -1
    ? 100
    : Math.min(100, (Math.max(totalItems, 0) / Math.max(1, nextTargetQty)) * 100)

  const remainingToNext = nextPackageIndex === -1 ? 0 : Math.max(0, nextTargetQty - totalItems)

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
  const [campaignId, setCampaignId] = useState(campaignIdFromState || null)
  const [userName] = useState(userFromState?.name || '')
  const [userPhone] = useState(userFromState?.phone || '')

  const [quantities, setQuantities] = useState({})
  const [campaignProducts, setCampaignProducts] = useState(fallbackProducts)
  const [campaignPackages, setCampaignPackages] = useState([])
  const [campaignStatus, setCampaignStatus] = useState('loading')
  const [loading, setLoading] = useState(false)
  const [itemsLoaded, setItemsLoaded] = useState(false)

  const totalItems = Object.values(quantities).reduce((sum, qty) => sum + (Number(qty) || 0), 0)

  const subTotal = useMemo(() => {
    return campaignProducts.reduce((sum, product) => {
      const qty = Number(quantities[product.id]) || 0
      return sum + (qty * Number(product.price ?? product.base_price ?? 0))
    }, 0)
  }, [campaignProducts, quantities])

  const orderSummary = useMemo(() => {
    return calculateOrderSummary(totalItems, subTotal, campaignPackages)
  }, [totalItems, subTotal, campaignPackages])
  const minimumRequiredItems = campaignPackages[0]?.min_qty ?? 12
  const achievedPackage = useMemo(() => {
    return campaignPackages.reduce((acc, pkg) => {
      return totalItems >= pkg.min_qty ? pkg : acc
    }, null)
  }, [campaignPackages, totalItems])
  const nextPackageHintText = useMemo(() => {
    if (!campaignPackages.length || orderSummary.remainingToNext <= 0 || !orderSummary.activePackage) return ''

    const avgUnitPrice = totalItems > 0
      ? (subTotal / totalItems)
      : Number(campaignProducts[0]?.price ?? campaignProducts[0]?.base_price ?? 0)

    const projectedSubTotal = subTotal + (orderSummary.remainingToNext * Math.max(0, avgUnitPrice))
    const projectedBenefit =
      projectedSubTotal * (Number(orderSummary.activePackage.discount_percent || 0) / 100)

    return `${orderSummary.remainingToNext.toLocaleString('fa-IR')} محصول تا پکیج ${orderSummary.activePackage.title} ${toBenefitText(projectedBenefit)}`
  }, [campaignProducts, campaignPackages.length, orderSummary.activePackage, orderSummary.remainingToNext, subTotal, totalItems])

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
        .select('id,status')
        .eq('slug', slug.toLowerCase())
        .maybeSingle()

      if (error || !data) {
        setCampaignStatus('missing')
        return
      }

      setCampaignId(data.id)
      setCampaignStatus(data.status || 'missing')
    }

    fetchCampaignStatus()
  }, [slug])

  useEffect(() => {
    if (!campaignId) return

    const fetchPackages = async () => {
      const { data, error } = await supabase
        .from('campaign_packages')
        .select('title,min_qty,discount_percent,cash_discount_percent,check_discount_percent')
        .eq('campaign_id', campaignId)
        .order('min_qty', { ascending: true })

      if (error) {
        console.log(error)
        return
      }

      const normalized = (data || [])
        .map((pkg) => ({
          title: (pkg.title || '').trim(),
          min_qty: Number(pkg.min_qty),
          cash_discount_percent: Number(pkg.cash_discount_percent),
          check_discount_percent: Number(pkg.check_discount_percent),
          discount_percent: Number.isFinite(Number(pkg.cash_discount_percent))
            ? Number(pkg.cash_discount_percent)
            : Number(pkg.discount_percent)
        }))
        .filter((pkg) =>
          pkg.title &&
          Number.isFinite(pkg.min_qty) && pkg.min_qty > 0 &&
          Number.isFinite(pkg.discount_percent) && pkg.discount_percent >= 0
        )

      setCampaignPackages(normalized)
    }

    fetchPackages()
  }, [campaignId])

  useEffect(() => {
    if (!campaignId) return

    const fetchCampaignProducts = async () => {
      const { data, error } = await supabase
        .from('campaign_products')
        .select('id,name,base_price')
        .eq('campaign_id', campaignId)

      if (error) {
        if (!isMissingTableError(error, 'campaign_products')) {
          console.log(error)
        }
        setCampaignProducts(fallbackProducts)
        return
      }

      const normalized = (data || [])
        .map((product) => ({
          id: product.id,
          name: (product.name || '').trim(),
          price: Number(product.base_price)
        }))
        .filter((product) => product.name && Number.isFinite(product.price) && product.price > 0)

      if (!normalized.length) {
        setCampaignProducts(fallbackProducts)
        return
      }

      setCampaignProducts(normalized)
    }

    fetchCampaignProducts()
  }, [campaignId])

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
        const product = campaignProducts.find((p) => p.name === item.product)
        if (!product) continue
        nextQuantities[product.id] = Number(item.quantity) || 0
      }

      setQuantities(nextQuantities)
      setItemsLoaded(true)
    }

    fetchOrderItems()
  }, [orderId, campaignProducts])

  const syncOrderItems = useCallback(async (nextQuantities, targetOrderId = orderId) => {
    if (!targetOrderId) return null

    const selected = campaignProducts
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

    if (deleteError) return deleteError
    if (!selected.length) return null

    const { error: insertError } = await supabase
      .from('order_items')
      .insert(selected)

    return insertError || null
  }, [campaignProducts, orderId])

  useEffect(() => {
    if (!orderId || !itemsLoaded) return

    const sync = async () => {
      const error = await syncOrderItems(quantities)
      if (error) console.log(error)
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
        await showAlert({ message: 'لطفا نام و شماره تماس را وارد کنید' })
        setLoading(false)
        return
      }

      if (!PHONE_REGEX.test(userPhone)) {
        await showAlert({ message: 'شماره تماس باید با 09 شروع شود و 11 رقم باشد' })
        setLoading(false)
        return
      }

      if (!campaignId) {
        await showAlert({ message: 'کمپین معتبر پیدا نشد' })
        setLoading(false)
        return
      }

      const selected = campaignProducts.filter(p => Number(quantities[p.id]) > 0)
      if (!selected.length) {
        await showAlert({ message: 'هیچ محصولی انتخاب نشده' })
        setLoading(false)
        return
      }

      let finalOrderId = orderId
      if (!orderId) {
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .insert({
            campaign_id: campaignId,
            user_name: userName,
            phone: userPhone,
            status: 'draft'
          })
          .select()
          .single()

        if (orderError) {
          console.log(orderError)
          await showAlert({ message: 'خطا در ایجاد سفارش اصلی' })
          setLoading(false)
          return
        }

        finalOrderId = orderData.id
        setOrderId(finalOrderId)
      }

      const syncError = await syncOrderItems(quantities, finalOrderId)
      if (syncError) {
        console.log(syncError)
        await showAlert({ message: `خطا در ثبت آیتم‌ها: ${syncError.message}` })
        setLoading(false)
        return
      }

      navigate(`/c/${slug}/payment`, {
        state: {
          orderId: finalOrderId,
          campaignId,
          userInfo: { name: userName, phone: userPhone },
          orderSummary: {
            totalItems,
            subTotal,
            discountAmount: orderSummary.discountAmount,
            payableAmount: orderSummary.payableAmount,
            achievedPackage: achievedPackage
              ? {
                title: achievedPackage.title,
                min_qty: achievedPackage.min_qty,
                cash_discount_percent: Number(achievedPackage.cash_discount_percent || achievedPackage.discount_percent || 0),
                check_discount_percent: Number(achievedPackage.check_discount_percent || achievedPackage.discount_percent || 0)
              }
              : null
          },
          slug
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
    return <div>در حال بارگذاری...</div>
  }

  if (campaignStatus !== 'active') {
    return <CampaignEnded />
  }

  return (
    <>
      <div className='products-container'>
        <div className='products'>
          <img src="/images/logo.png" alt="" />
          {!!campaignPackages.length && (
            <div className="packages-table-wrap glass">
              <table className="packages-table">
                <thead>
                  <tr>
                    <th>نام پکیج</th>
                    <th>تخفیف خرید چکی(3ماهه)</th>
                    <th>تخفیف خرید نقدی</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignPackages.map((pkg, index) => (
                    <tr
                      key={`${pkg.title}-${index}`}
                      className={
                        achievedPackage &&
                        achievedPackage.title === pkg.title &&
                        achievedPackage.min_qty === pkg.min_qty
                          ? 'active-package-row'
                          : ''
                      }
                    >
                      <td>{pkg.title}</td>
                      <td>{Number(pkg.check_discount_percent || 0).toLocaleString('fa-IR')} درصد</td>
                      <td>{Number(pkg.cash_discount_percent || 0).toLocaleString('fa-IR')} درصد</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="products-form glass">
            <div className="products-form-title">
              محصولات مورد نظر خود را انتخاب کنید:
            </div>

            <div className="products-form-list">
              {campaignProducts.map(product => (
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
            {!!achievedPackage && (
              <div className="current-package-banner">
                به پکیج {achievedPackage.title} رسیدید
              </div>
            )}
            <div className="progress-bar-title">
              {!campaignPackages.length && 'براي اين کمپين هنوز پکيجي تعريف نشده است'}
              {!!campaignPackages.length && orderSummary.remainingToNext > 0 && (
                nextPackageHintText
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

          <button onClick={handleSubmit} disabled={loading || totalItems < minimumRequiredItems}>
            {loading ? 'در حال ثبت...' : `ثبت نهايي سفارش (${totalItems.toLocaleString('fa-IR')} محصول)`}
          </button>
        </div>
      </div>
    </>
  )
}
