"use client";

import { Tabs as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Tabs = Primitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List
      className={cn("inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-muted p-1 text-muted-foreground", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Content className={cn("mt-4 outline-none data-[state=active]:animate-fade-up", className)} {...props} />;
}
