import { useMemo, useState } from 'react'
import { ModalContext } from './modal-context'
import './ModalProvider.css'

export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null)

  const showAlert = ({ title = 'پیام', message, confirmText = 'باشه' }) => {
    return new Promise((resolve) => {
      setModal({
        kind: 'alert',
        title,
        message,
        confirmText,
        resolve
      })
    })
  }

  const showConfirm = ({
    title = 'تایید',
    message,
    confirmText = 'بله',
    cancelText = 'خیر'
  }) => {
    return new Promise((resolve) => {
      setModal({
        kind: 'confirm',
        title,
        message,
        confirmText,
        cancelText,
        resolve
      })
    })
  }

  const closeModal = (result) => {
    if (modal?.resolve) {
      modal.resolve(result)
    }
    setModal(null)
  }

  const value = useMemo(() => ({
    showAlert,
    showConfirm
  }), [])

  return (
    <ModalContext.Provider value={value}>
      {children}

      {modal && (
        <div className="app-modal-overlay" onClick={() => closeModal(false)}>
          <div className="app-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{modal.title}</h3>
            <p>{modal.message}</p>

            <div className="app-modal-actions">
              {modal.kind === 'confirm' && (
                <button
                  type="button"
                  className="app-modal-btn app-modal-btn-secondary"
                  onClick={() => closeModal(false)}
                >
                  {modal.cancelText}
                </button>
              )}
              <button
                type="button"
                className="app-modal-btn app-modal-btn-primary"
                onClick={() => closeModal(true)}
              >
                {modal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  )
}
