import './CampaignEnded.css'

export default function CampaignEnded() {
  return (
    <div className='campaign-ended'>
      <img src="/images/logo.png" alt="Logo" />

      <div className='campaign-ended-card glass'>
        <h1>این کمپین به پایان رسیده است</h1>
        <p>امکان ثبت سفارش جدید برای این کمپین وجود ندارد.</p>
      </div>
    </div>
  )
}
