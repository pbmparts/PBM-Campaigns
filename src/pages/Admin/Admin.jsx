import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useModal } from '../../Components/Modal/useModal'
import Campane from '../../Components/Campane/Campane'
import * as XLSX from 'xlsx'
import './Admin.css'

const REQUIRED_HEADERS = [
  'campaign_name',
  'campaign_product',
  'campaign_product_base_price'
]

const PACKAGE_NAME_PATTERN = /^campaign_package(\d+)_name$/i
const PACKAGE_DISCOUNT_PATTERN = /^campaign_package(\d+)_product_discount_percent$/i
const PACKAGE_CASH_DISCOUNT_PATTERN = /^campaign_package(\d+)_cash_discount_percent$/i
const PACKAGE_CHECK_DISCOUNT_PATTERN = /^campaign_package(\d+)_check_discount_percent$/i
const PACKAGE_MIN_QTY_PATTERN = /^campaign_package(\d+)_min_qty$/i

const normalizeHeader = (value) => String(value || '').trim().toLowerCase()
const normalizeCell = (value) => String(value || '').trim()

const buildSlug = (name) => {
  return normalizeCell(name)
    .replace(/\s+/g, '-')
    .toLowerCase()
}

const isMissingTableError = (error, tableName) => {
  const message = String(error?.message || '').toLowerCase()
  const details = String(error?.details || '').toLowerCase()
  return error?.code === 'PGRST205' || message.includes(tableName) || details.includes(tableName)
}

export default function Admin() {
  const [campaigns, setCampaigns] = useState([])
  const [filter, setFilter] = useState('active')
  const [importLoading, setImportLoading] = useState(false)
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

  const handleDownloadTemplate = () => {
    const sampleRows = [
      {
        campaign_name: 'کمپین نمونه',
        campaign_product: 'زیمنس استاندارد',
        campaign_product_base_price: 1500000,
        campaign_package1_name: 'پکیج 1',
        campaign_package1_min_qty: 12,
        campaign_package1_cash_discount_percent: 5,
        campaign_package1_check_discount_percent: 7,
        campaign_package2_name: 'پکیج 2',
        campaign_package2_min_qty: 24,
        campaign_package2_cash_discount_percent: 10,
        campaign_package2_check_discount_percent: 12
      }
    ]

    const sheet = XLSX.utils.json_to_sheet(sampleRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'CampaignImport')
    XLSX.writeFile(workbook, 'campaign_import_template.xlsx')
  }

  const importCampaignsFromSheet = async (file) => {
    setImportLoading(true)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]

      if (!firstSheetName) {
        await showAlert({ message: 'فایل اکسل معتبر نیست' })
        return
      }

      const worksheet = workbook.Sheets[firstSheetName]
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' })

      if (!rawRows.length) {
        await showAlert({ message: 'فایل اکسل خالی است' })
        return
      }

      const rows = rawRows.map((row) => {
        const normalized = {}
        Object.entries(row).forEach(([key, value]) => {
          normalized[normalizeHeader(key)] = value
        })
        return normalized
      })

      const availableHeaders = new Set(rows.flatMap((row) => Object.keys(row)))
      const missingHeaders = REQUIRED_HEADERS.filter((header) => !availableHeaders.has(header))
      if (missingHeaders.length) {
        await showAlert({ message: `ستون‌های ضروری یافت نشد: ${missingHeaders.join(', ')}` })
        return
      }

      const packageIndexes = Array.from(availableHeaders)
        .map((header) => {
          const nameMatch = header.match(PACKAGE_NAME_PATTERN)
          const legacyDiscountMatch = header.match(PACKAGE_DISCOUNT_PATTERN)
          const cashDiscountMatch = header.match(PACKAGE_CASH_DISCOUNT_PATTERN)
          const checkDiscountMatch = header.match(PACKAGE_CHECK_DISCOUNT_PATTERN)
          const minQtyMatch = header.match(PACKAGE_MIN_QTY_PATTERN)
          return Number(
            nameMatch?.[1] ||
            legacyDiscountMatch?.[1] ||
            cashDiscountMatch?.[1] ||
            checkDiscountMatch?.[1] ||
            minQtyMatch?.[1]
          )
        })
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((a, b) => a - b)

      if (!packageIndexes.length) {
        await showAlert({ message: 'ستون‌های پکیج در فایل اکسل پیدا نشد' })
        return
      }

      const campaignsMap = new Map()

      rows.forEach((row) => {
        const campaignName = normalizeCell(row.campaign_name)
        const productName = normalizeCell(row.campaign_product)
        const productBasePrice = Number(row.campaign_product_base_price)

        if (!campaignName || !productName || !Number.isFinite(productBasePrice) || productBasePrice <= 0) {
          return
        }

        if (!campaignsMap.has(campaignName)) {
          campaignsMap.set(campaignName, {
            products: new Map(),
            packages: new Map()
          })
        }

        const campaignData = campaignsMap.get(campaignName)
        campaignData.products.set(productName, {
          name: productName,
          base_price: productBasePrice
        })

        packageIndexes.forEach((index) => {
          const packageName = normalizeCell(row[`campaign_package${index}_name`])
          const minQty = Number(row[`campaign_package${index}_min_qty`])
          const legacyDiscount = Number(row[`campaign_package${index}_product_discount_percent`])
          const cashDiscount = Number(row[`campaign_package${index}_cash_discount_percent`])
          const checkDiscount = Number(row[`campaign_package${index}_check_discount_percent`])
          const resolvedCashDiscount = Number.isFinite(cashDiscount) ? cashDiscount : legacyDiscount
          const resolvedCheckDiscount = Number.isFinite(checkDiscount) ? checkDiscount : legacyDiscount
          const resolvedMinQty = Number.isFinite(minQty) && minQty > 0 ? minQty : index

          if (!packageName) return
          if (!Number.isFinite(resolvedMinQty) || resolvedMinQty <= 0) return
          if (!Number.isFinite(resolvedCashDiscount) || resolvedCashDiscount < 0 || resolvedCashDiscount > 100) return
          if (!Number.isFinite(resolvedCheckDiscount) || resolvedCheckDiscount < 0 || resolvedCheckDiscount > 100) return

          campaignData.packages.set(index, {
            title: packageName,
            min_qty: resolvedMinQty,
            discount_percent: resolvedCashDiscount,
            cash_discount_percent: resolvedCashDiscount,
            check_discount_percent: resolvedCheckDiscount
          })
        })
      })

      if (!campaignsMap.size) {
        await showAlert({ message: 'هیچ سطر معتبری برای ثبت پیدا نشد' })
        return
      }

      const { error: campaignProductsCheckError } = await supabase
        .from('campaign_products')
        .select('id')
        .limit(1)

      const hasCampaignProductsTable = !campaignProductsCheckError
      const campaignProductsTableMissing = isMissingTableError(campaignProductsCheckError, 'campaign_products')

      for (const [campaignName, campaignData] of campaignsMap.entries()) {
        const slug = buildSlug(campaignName)

        const { data: existingCampaign, error: existingCampaignError } = await supabase
          .from('campaigns')
          .select('id')
          .eq('slug', slug)
          .maybeSingle()

        if (existingCampaignError) {
          console.log(existingCampaignError)
          await showAlert({ message: `خطا در بررسی کمپین ${campaignName}` })
          continue
        }

        let campaignId = existingCampaign?.id || null

        if (campaignId) {
          const { error: updateCampaignError } = await supabase
            .from('campaigns')
            .update({ name: campaignName, status: 'active' })
            .eq('id', campaignId)

          if (updateCampaignError) {
            console.log(updateCampaignError)
            await showAlert({ message: `خطا در بروزرسانی کمپین ${campaignName}` })
            continue
          }
        } else {
          const { data: campaignRow, error: campaignError } = await supabase
            .from('campaigns')
            .insert([{ name: campaignName, slug, status: 'active' }])
            .select('id')
            .single()

          if (campaignError || !campaignRow?.id) {
            console.log(campaignError)
            await showAlert({ message: `خطا در ذخیره کمپین ${campaignName}` })
            continue
          }

          campaignId = campaignRow.id
        }

        const { error: deletePackagesError } = await supabase
          .from('campaign_packages')
          .delete()
          .eq('campaign_id', campaignId)

        if (deletePackagesError) {
          console.log(deletePackagesError)
          await showAlert({ message: `خطا در بروزرسانی پکیج‌های ${campaignName}` })
          continue
        }

        const packagesToInsert = Array.from(campaignData.packages.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, pkg]) => ({
            campaign_id: campaignId,
            title: pkg.title,
            min_qty: pkg.min_qty,
            discount_percent: pkg.discount_percent,
            cash_discount_percent: pkg.cash_discount_percent,
            check_discount_percent: pkg.check_discount_percent
          }))

        if (packagesToInsert.length) {
          const { error: insertPackagesError } = await supabase
            .from('campaign_packages')
            .insert(packagesToInsert)

          if (insertPackagesError) {
            console.log(insertPackagesError)
            await showAlert({ message: `خطا در ذخیره پکیج‌های ${campaignName}` })
            continue
          }
        }

        if (!hasCampaignProductsTable) continue

        const { error: deleteProductsError } = await supabase
          .from('campaign_products')
          .delete()
          .eq('campaign_id', campaignId)

        if (deleteProductsError) {
          console.log(deleteProductsError)
          await showAlert({ message: `خطا در ذخیره محصولات ${campaignName}` })
          continue
        }

        const productsToInsert = Array.from(campaignData.products.values()).map((product) => ({
          campaign_id: campaignId,
          name: product.name,
          base_price: product.base_price
        }))

        if (productsToInsert.length) {
          const { error: insertProductsError } = await supabase
            .from('campaign_products')
            .insert(productsToInsert)

          if (insertProductsError) {
            console.log(insertProductsError)
            await showAlert({ message: `خطا در ذخیره محصولات ${campaignName}` })
            continue
          }
        }
      }

      if (campaignProductsTableMissing) {
        await showAlert({ message: 'ایمپورت کمپین و پکیج انجام شد، اما جدول campaign_products در دیتابیس وجود ندارد' })
      } else {
        await showAlert({ message: 'ایمپورت اکسل انجام شد' })
      }

      fetchCampaigns()
    } catch (error) {
      console.log(error)
      await showAlert({ message: 'خطا در پردازش فایل اکسل' })
    } finally {
      setImportLoading(false)
    }
  }

  const handleExcelUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    await importCampaignsFromSheet(file)
    e.target.value = ''
  }

  const filteredCampaigns = campaigns.filter((c) => c.status === filter)

  return (
    <div className='admin'>
      <div className="logo">
        <img src="/images/logo.png" alt="" />
      </div>

      <div className='admin-import-card glass'>
        <div className='admin-import-title'>مدیریت کمپین با فایل اکسل</div>
        <div className='admin-import-desc'>
          فایل اکسل باید ستون‌های زیر را داشته باشد. برای هر پکیج جدید، ستون‌های
          `campaign_packageN_name` و `campaign_packageN_min_qty` و
          `campaign_packageN_cash_discount_percent` و
          `campaign_packageN_check_discount_percent` را اضافه کنید.
        </div>
        <div className='admin-import-actions'>
          <button
            type="button"
            className='admin-import-btn'
            onClick={handleDownloadTemplate}
          >
            دانلود فایل نمونه
          </button>

          <label className='admin-import-upload'>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
              disabled={importLoading}
            />
            {importLoading ? 'در حال ایمپورت...' : 'انتخاب و ایمپورت فایل اکسل'}
          </label>
        </div>
      </div>

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
