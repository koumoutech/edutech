import { PageTransition } from "@/components/ui/motion";

/** Re-mounted on navigation: animates page transitions inside the app shell. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
