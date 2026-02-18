import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import CampaignEnded from '../../../Components/CampaignEnded/CampaignEnded'
import './Board.css'

export default function Board() {
  const { slug } = useParams()

  const [campaignId, setCampaignId] = useState(null)
  const [campaignStatus, setCampaignStatus] = useState('loading')
  const [total, setTotal] = useState(0)
  const [animatedTotal, setAnimatedTotal] = useState(0)

  const fetchCampaign = async () => {
    const { data } = await supabase
      .from('campaigns')
      .select('id,status')
      .eq('slug', slug)
      .single()

    if (data) {
      setCampaignId(data.id)
      setCampaignStatus(data.status || 'missing')
    } else {
      setCampaignStatus('missing')
    }
  }

  const fetchCartProductsTotal = async (id) => {
    const { data } = await supabase
      .from('order_items')
      .select(`
        quantity,
        orders!inner (
          campaign_id
        )
      `)
      .eq('orders.campaign_id', id)

    if (data) {
      const sum = data.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0)
      setTotal(sum)
    }
  }

  useEffect(() => {
    if (!slug) return
    fetchCampaign()
  }, [slug])

  useEffect(() => {
    if (!campaignId) return

    fetchCartProductsTotal(campaignId)

    const refreshIfSameCampaign = async (orderId) => {
      const { data } = await supabase
        .from('orders')
        .select('campaign_id')
        .eq('id', orderId)
        .single()

      if (data?.campaign_id === campaignId) {
        fetchCartProductsTotal(campaignId)
      }
    }

    const channel = supabase
      .channel('order-items-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_items' },
        async (payload) => refreshIfSameCampaign(payload.new.order_id)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'order_items' },
        async (payload) => refreshIfSameCampaign(payload.new.order_id)
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'order_items' },
        async (payload) => refreshIfSameCampaign(payload.old.order_id)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [campaignId])

  useEffect(() => {
    if (animatedTotal === total) return

    const difference = total - animatedTotal
    const step = difference > 0
      ? Math.max(1, Math.ceil(difference / 700))
      : Math.min(-1, Math.floor(difference / 700))

    const interval = setInterval(() => {
      setAnimatedTotal((prev) => {
        const next = prev + step
        if ((step > 0 && next >= total) || (step < 0 && next <= total)) {
          clearInterval(interval)
          return total
        }
        return next
      })
    }, 70)

    return () => clearInterval(interval)
  }, [total, animatedTotal])

  if (campaignStatus === 'loading') {
    return <div>در حال بارگذاری...</div>
  }

  if (campaignStatus !== 'active') {
    return <CampaignEnded />
  }

  return (
    <div className='board'>
      <div className="board-head-title">تا الان در این کمپین</div>
      <div className="board-number">
        {animatedTotal.toLocaleString('fa-IR')}
      </div>
      <div className="board-foot-title">عدد محصول داخل سبد خرید ثبت شده!</div>
    </div>
  )
}
