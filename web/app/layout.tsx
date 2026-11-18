import type { Metadata } from "next";
import "./globals.css";
import "./immersive.css";

export const metadata: Metadata = {
  title: "深夜情绪便利店 · Late Night Store",
  description: "一家只在夜里营业的三维小店：说一句此刻的状态，系统挑一段几分钟的故事、声音或小练习。",
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
