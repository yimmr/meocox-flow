import * as React from "react";
import { cn } from "@/lib/utils.js";

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-slate-800 bg-slate-900/90 px-3 py-1 text-xs text-slate-100 placeholder:text-slate-500 shadow-sm transition-colors file:border-0 file:bg-transparent file:text-xs file:font-medium focus-visible:outline-none focus-visible:border-indigo-500/80 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
