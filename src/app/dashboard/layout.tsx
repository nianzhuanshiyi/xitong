import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      <DashboardSidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <DashboardHeader />
        <main className="flex-1 overflow-auto px-5 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
