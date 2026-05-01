import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { 
  LayoutDashboard, 
  Users, 
  Library, 
  LogOut, 
  Menu,
  X,
  UploadCloud
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { APP_VERSION } from '../version';
import { SidebarLinkDevice } from './SidebarLinkDevice';

export const Layout = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Goal Bank', path: '/goals', icon: Library },
  ];

  if (profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'editor') {
    navItems.push({ name: 'Upload IEP', path: '/iep-upload', icon: UploadCloud });
  }

  if (profile?.role === 'admin') {
    navItems.push({ name: 'Admin Panel', path: '/admin', icon: Users });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row print:min-h-0 print:block">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-primary text-primary-foreground print:hidden">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain bg-white rounded-full p-1" onError={(e) => e.currentTarget.style.display = 'none'} />
          <span className="font-bold text-lg">Miller Data</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-primary text-primary-foreground transform transition-transform duration-200 ease-in-out
        md:relative md:translate-x-0 flex flex-col print:hidden
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 hidden md:flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain bg-white rounded-full p-1" onError={(e) => e.currentTarget.style.display = 'none'} />
          <span className="font-bold text-xl tracking-tight">Miller Data</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${
                  isActive 
                    ? 'bg-secondary text-secondary-foreground font-medium' 
                    : 'hover:bg-primary-foreground/10'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
          
          <SidebarLinkDevice />
        </nav>

        <div className="p-4 border-t border-primary-foreground/20">
          <div className="mb-4 px-4">
            <p className="text-sm font-medium truncate">{profile?.name}</p>
            <p className="text-xs opacity-80 capitalize">{profile?.role} • Rm {profile?.roomNumber}</p>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground rounded-2xl"
            onClick={handleSignOut}
          >
            <LogOut className="w-5 h-5 mr-3" />
            Sign Out
          </Button>
          <div className="mt-4 px-4 text-[10px] text-primary-foreground/40 font-mono text-center">
            v{APP_VERSION}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden h-screen print:h-auto print:block print:overflow-visible">
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-muted/30 print:bg-white print:p-0 print:overflow-visible">
          <Outlet />
        </main>
      </div>
      
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
};
