import { motion, AnimatePresence } from 'framer-motion';

const Modal = ({ isOpen, onClose, children, title }) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/40"
          onClick={onClose}
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="modal relative w-full max-w-2xl bg-white rounded-3xl shadow-xl border border-neutral-200 overflow-hidden"
        >
          {title && (
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                ✕
              </button>
            </div>
          )}

          <div className="p-6">{children}</div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default Modal;