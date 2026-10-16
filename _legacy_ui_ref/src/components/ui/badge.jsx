import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils.js";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none select-none font-mono",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-indigo-600 text-white shadow",
        secondary:
          "border-slate-800 bg-slate-800 text-slate-300",
        destructive:
          "border-transparent bg-rose-600 text-white shadow",
        outline: "text-slate-300 border-slate-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
