import { motion, AnimatePresence } from 'framer-motion';
import Icon from './Icon';

const Modal = ({ isOpen, onClose, children, title, size = 'md' }) => {
  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw]',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center px-4 py-4 sm:py-8 overflow-y-auto">
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{   opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            className={`
              relative w-full ${sizes[size] ?? sizes.md}
              max-h-[calc(100vh-4rem)] sm:max-h-[88vh]
              bg-white rounded-2xl shadow-2xl border border-slate-100
              flex flex-col overflow-hidden
            `}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 flex-shrink-0">
                <h3 className="text-base font-semibold text-slate-800">{title}</h3>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  aria-label="Tutup"
                >
                  <Icon name="X" size={16} />
                </button>
              </div>
            )}

            <div className="overflow-y-auto flex-1 p-4 sm:p-6">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
