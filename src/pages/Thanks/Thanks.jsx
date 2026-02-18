import { Link, useLocation, useParams } from 'react-router-dom'
import './Thanks.css'

export default function Thanks() {
  const { slug } = useParams()
  const location = useLocation()
  const orderSummary = location.state?.orderSummary

  const toCurrency = (value) => Number(value || 0).toLocaleString('fa-IR')

  return (
    <div className='thanks'>
      <img src="/images/logo.png" alt="Logo" />

      <div className="thanks-card glass">
        <h1>مرسی از خرید شما</h1>
        <p>سفارش شما با موفقیت ثبت شد.</p>

        {orderSummary && (
          <div className='thanks-summary'>
            <p>جمع کل خرید: {toCurrency(orderSummary.subTotal)} تومان</p>
            <p>میزان سود شما از خرید: {toCurrency(orderSummary.discountAmount)} تومان</p>
            <p>مبلغ قابل پرداخت: {toCurrency(orderSummary.payableAmount)} تومان</p>
          </div>
        )}

        <Link to={`/c/${slug}`} className='thanks-link'>
          بازگشت به صفحه کمپین
        </Link>
      </div>
    </div>
  )
}
