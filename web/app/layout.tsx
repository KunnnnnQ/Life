import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mood Capsule",
  description: "说一句现在的状态，换一段几分钟的内容：故事、声音、小练习或小游戏，由系统挑选。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d2b53",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
