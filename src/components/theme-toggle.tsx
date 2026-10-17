"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // Avoid hydration mismatch: the theme is only known on the client.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon = !mounted ? SunIcon : theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : MonitorIcon;
  const label = !mounted ? "Thème" : theme === "dark" ? "Thème sombre" : theme === "light" ? "Thème clair" : "Thème du système";
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(next)} aria-label={`${label} — changer`} title={label}>
      <Icon />
    </Button>
  );
}
