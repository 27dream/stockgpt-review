import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from 'next-themes';

export const metadata: Metadata = {
  title: 'StockGPT Review · AI 盘后复盘',
  description: '基于东方财富免费数据 + 你自己的 LLM API Key，一键生成 A 股盘后复盘报告。开源、零服务器成本、Key 永不上传。',
  keywords: ['A股', '盘后复盘', 'AI', 'GPT', '东方财富', '股票', 'StockGPT', '复盘报告'],
  authors: [{ name: '27dream' }],
  openGraph: {
    title: 'StockGPT Review · AI 盘后复盘',
    description: '免费 · 开源 · 自带 LLM Key · 数据来自东方财富',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
