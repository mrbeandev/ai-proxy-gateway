import { Outlet, useLocation } from 'react-router-dom'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from './Sidebar'
import ThemeToggle from './ThemeToggle'
import { Separator } from '@/components/ui/separator'

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/services': 'Services',
  '/playground': 'Playground',
  '/logs': 'Logs',
  '/settings': 'Settings',
}

export default function Layout() {
  const loc = useLocation()
  const title = pageTitles[loc.pathname] || 'Dashboard'

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center gap-2 px-4 py-2.5 border-b bg-card shrink-0">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <h1 className="font-semibold text-sm flex-1">{title}</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Connected
            </div>
            <ThemeToggle />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  )
}
