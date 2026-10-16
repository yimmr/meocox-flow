import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-700 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default:
          "bg-indigo-600 text-white shadow hover:bg-indigo-500",
        destructive:
          "bg-rose-600 text-white shadow-sm hover:bg-rose-500",
        outline:
          "border border-slate-800 bg-transparent shadow-sm hover:bg-slate-800/80 hover:text-slate-100",
        secondary:
          "bg-slate-800 text-slate-200 shadow-sm hover:bg-slate-700/80",
        ghost: "hover:bg-slate-800/80 text-slate-400 hover:text-slate-200",
        link: "text-indigo-400 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-2.5 text-xs",
        xs: "h-7 rounded-md px-2 text-[11px]",
        lg: "h-10 rounded-md px-8",
        icon: "h-8 w-8",
        iconSm: "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
