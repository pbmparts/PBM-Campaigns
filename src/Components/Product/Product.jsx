import React from 'react'
import './Product.css'

export default function Product({ product, quantity, onChange }) {

  const increase = () => {
    onChange(product.id, quantity + 6)
  }

  const decrease = () => {
    onChange(product.id, quantity - 6)
  }

  return (
    <div className='product-item'>
      <div className="product-item-title">
        {product.name}
      </div>

      <div className="product-item-input">
        <button
          className="product-item-quantity-down"
          onClick={decrease}
        >
          <img src="/images/minus.svg" alt="" />
        </button>

        <input
          type="number"
          value={quantity}
          onChange={(e) =>
            onChange(product.id, Number(e.target.value))
          }
          id="product-quantity-input"
        />

        <button
          className="product-item-quantity-up"
          onClick={increase}
        >
          <img src="/images/plus.svg" alt="" />
        </button>
      </div>
    </div>
  )
}
