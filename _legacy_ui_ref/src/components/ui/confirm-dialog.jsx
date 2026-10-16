import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './alert-dialog';

const ConfirmDialogContext = createContext(null);

export function ConfirmDialogProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState({
    title: '确认操作',
    description: '此操作不可撤销，请确认是否继续。',
    confirmText: '确定',
    cancelText: '取消',
    variant: 'default', // 'default' | 'destructive'
  });

  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setConfig({
        title: options.title || '确认操作',
        description: options.description || '此操作不可撤销，请确认是否继续。',
        confirmText: options.confirmText || '确定',
        cancelText: options.cancelText || '取消',
        variant: options.variant || (options.destructive ? 'destructive' : 'default'),
      });
      setOpen(true);
    });
  }, []);

  const handleAction = () => {
    setOpen(false);
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
  };

  const handleCancel = () => {
    setOpen(false);
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
  };

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog open={open} onOpenChange={(v) => !v && handleCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{config.title}</AlertDialogTitle>
            <AlertDialogDescription>{config.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {config.cancelText}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction}
              className={
                config.variant === 'destructive'
                  ? 'bg-red-600 hover:bg-red-500 shadow-red-600/20'
                  : ''
              }
            >
              {config.confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmDialogProvider');
  }
  return context.confirm;
}
