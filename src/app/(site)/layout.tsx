import { SiteHeader } from "@/components/SiteHeader";
import { ToastProvider } from "@/components/ToastProvider";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/gate");
  }
  return (
    <ToastProvider>
      <SiteHeader />
      <div className="mx-auto min-h-[calc(100vh-4rem)] max-w-6xl px-4 py-6">
        {children}
      </div>
    </ToastProvider>
  );
}
