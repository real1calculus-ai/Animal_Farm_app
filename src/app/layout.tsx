import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { ToastProvider } from "@/components/ui/toast";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Animal Farm Management",
  description: "Breeding, health, feed and financial management for a working animal farm",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The nav is the only thing here that needs the user; pages do their own
  // `requireUser()`/`requireRole()`, so a null user simply renders the bare
  // shell around /login rather than redirecting from the layout.
  const user = await getCurrentUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <ToastProvider>
          {user && user.approved ? <Nav user={user} /> : null}
          <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}
