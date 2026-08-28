import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Layers, MessageSquare, ScrollText, Settings, Wifi } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/services', icon: Layers, label: 'Services' },
  { to: '/playground', icon: MessageSquare, label: 'Playground' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-1">
          <img src="/logo.svg" alt="AI Gateway" className="h-8 w-8 shrink-0 rounded-lg" />
          <span className="font-semibold text-sm tracking-tight group-data-[collapsible=icon]:hidden">
            AI Gateway
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map(({ to, icon: Icon, label }) => (
                <SidebarMenuItem key={to}>
                  <NavLink to={to} end={to === '/'}>
                    {({ isActive }) => (
                      <SidebarMenuButton isActive={isActive} tooltip={label}>
                        <Icon size={15} />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    )}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center">
          <Wifi size={12} className="text-primary shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Running on :4141</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
