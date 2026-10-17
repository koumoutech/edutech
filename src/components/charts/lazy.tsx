"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/misc";

/** Charts are secondary content: loaded lazily, client-side only. */
export const BarChartView = dynamic(() => import("./charts").then((m) => m.BarChartView), {
  ssr: false,
  loading: () => <Skeleton className="h-[260px]" />,
});

export const AreaChartView = dynamic(() => import("./charts").then((m) => m.AreaChartView), {
  ssr: false,
  loading: () => <Skeleton className="h-[240px]" />,
});
