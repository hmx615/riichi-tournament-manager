import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "轩轩的牌例筛选站",
  robots: { index: false, follow: false },
};

export default function TutorialLayout({ children }: { children: React.ReactNode }) {
  return children;
}
