import { Toaster as Sonner, toast } from 'sonner';

const Toaster = ({ ...props }) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-dark-900 group-[.toaster]:text-gray-100 group-[.toaster]:border-dark-700/80 group-[.toaster]:shadow-2xl group-[.toaster]:rounded-xl group-[.toaster]:border group-[.toaster]:font-sans group-[.toaster]:text-xs',
          description: 'group-[.toast]:text-gray-400 group-[.toast]:text-[11px]',
          actionButton:
            'group-[.toast]:bg-brand-600 group-[.toast]:text-white group-[.toast]:font-medium group-[.toast]:rounded-lg group-[.toast]:text-xs',
          cancelButton:
            'group-[.toast]:bg-dark-800 group-[.toast]:text-gray-300 group-[.toast]:rounded-lg group-[.toast]:text-xs',
          success: 'group-[.toaster]:border-emerald-500/30 group-[.toaster]:bg-dark-900',
          error: 'group-[.toaster]:border-red-500/30 group-[.toaster]:bg-dark-900',
          warning: 'group-[.toaster]:border-amber-500/30 group-[.toaster]:bg-dark-900',
          info: 'group-[.toaster]:border-brand-500/30 group-[.toaster]:bg-dark-900',
        },
      }}
      position="top-center"
      richColors
      closeButton
      {...props}
    />
  );
};

export { Toaster, toast };
