import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "选股条件工作台 · 自然语言智能选股",
  description: "把自然语言选股意图转为可检查、可修改、可执行的数据条件。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
