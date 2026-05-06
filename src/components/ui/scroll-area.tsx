"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} {...props} className={cn("relative w-full", className)}>
        <div className="overflow-x-auto overflow-y-hidden">
          <div className="inline-block min-w-full">{children}</div>
        </div>
      </div>
    )
  }
)

ScrollArea.displayName = "ScrollArea"

export { ScrollArea }
