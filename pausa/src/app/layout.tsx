import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Fraunces } from "next/font/google";
import { SWRegister } from "@/ui/components/SWRegister";
import "./globals.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Pausa",
  description: "Il diario privato del tuo gruppo. Film, serie, anime — quello che guardate insieme.",
  appleWebApp: { capable: true, title: "Pausa", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0f1115",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="it"
      className={`${hanken.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-base text-ink">
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
